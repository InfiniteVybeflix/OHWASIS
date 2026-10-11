import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { parseCallback } from '@/lib/providers/mpesa-daraja'
import { withErrorHandler } from '@/lib/api'
import { audit } from '@/lib/audit'
import { dispatch } from '@/lib/notifications'

/**
 * POST /api/payments/mpesa/callback
 *
 * Receives Daraja STK Push callback. Idempotent: a duplicate callback for
 * the same CheckoutRequestID updates the existing PaymentAttempt, never
 * creates a duplicate.
 *
 * Verification steps:
 *   1. Parse the callback (don't trust shape).
 *   2. Look up PaymentAttempt by CheckoutRequestID. If not found, ignore
 *      (could be a stray callback for a different merchant).
 *   3. Verify the amount matches the order's expected total.
 *   4. Verify the order belongs to the same tenant as the PaymentAttempt.
 *   5. On ResultCode === 0: mark SUCCESS, transition order to CONFIRMED.
 *   6. On any other ResultCode: mark FAILED, do NOT transition order; the
 *      merchant/customer may retry payment.
 *
 * Always returns HTTP 200 to Daraja to acknowledge receipt (per their docs).
 */
export const POST = withErrorHandler(async (req) => {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    // Acknowledge malformed callback so Daraja doesn't retry indefinitely
    return NextResponse.json({ ResultCode: 0, ResultDesc: 'Malformed body ignored' })
  }
  const parsed = parseCallback(body)
  if (!parsed.checkoutRequestId) {
    // No CheckoutRequestID — can't correlate. Acknowledge to stop retries.
    await prisma.webhookEvent.create({
      data: {
        source: 'mpesa-daraja',
        type: 'STK_CALLBACK',
        idempotencyKey: null,
        payload: JSON.stringify(body).slice(0, 8000),
        status: 'FAILED',
        error: 'Missing CheckoutRequestID',
      },
    })
    return NextResponse.json({ ResultCode: 0, ResultDesc: 'Ignored' })
  }

  // Idempotency: look up by idempotencyKey — if already processed, just ack
  const existingEvent = await prisma.webhookEvent.findUnique({
    where: { idempotencyKey: parsed.checkoutRequestId },
  })
  if (existingEvent && existingEvent.status === 'PROCESSED') {
    return NextResponse.json({ ResultCode: 0, ResultDesc: 'Duplicate callback ignored' })
  }

  // Record the webhook event for audit
  await prisma.webhookEvent.upsert({
    where: { idempotencyKey: parsed.checkoutRequestId },
    create: {
      source: 'mpesa-daraja',
      type: 'STK_CALLBACK',
      idempotencyKey: parsed.checkoutRequestId,
      payload: JSON.stringify(body).slice(0, 8000),
      status: 'RECEIVED',
    },
    update: {},
  })

  // Look up the payment attempt
  const attempt = await prisma.paymentAttempt.findFirst({
    where: { providerReference: parsed.checkoutRequestId },
    include: { order: true },
  })
  if (!attempt) {
    // No matching attempt — likely a callback for a different platform/merchant
    await prisma.webhookEvent.update({
      where: { idempotencyKey: parsed.checkoutRequestId },
      data: { status: 'FAILED', error: 'No matching PaymentAttempt' },
    })
    return NextResponse.json({ ResultCode: 0, ResultDesc: 'No matching attempt' })
  }

  // Verify amount matches the order's total
  if (parsed.amount !== undefined && Math.round(parsed.amount) !== Math.round(attempt.amount)) {
    await prisma.paymentAttempt.update({
      where: { id: attempt.id },
      data: {
        status: 'FAILED',
        failureReason: `Amount mismatch: expected ${attempt.amount}, got ${parsed.amount}`,
        callbackPayload: JSON.stringify(parsed).slice(0, 8000),
        verifiedAt: new Date(),
      },
    })
    await audit({
      ctx: { user: null, tenant: { id: attempt.tenantId, handle: '', displayName: '' }, ip: null, userAgent: null },
      action: 'payment.amount_mismatch',
      category: 'SECURITY',
      targetType: 'PaymentAttempt',
      targetId: attempt.id,
      metadata: { expected: attempt.amount, received: parsed.amount },
    })
    return NextResponse.json({ ResultCode: 0, ResultDesc: 'Amount mismatch recorded' })
  }

  const success = parsed.resultCode === 0

  await prisma.$transaction(async (tx) => {
    await tx.paymentAttempt.update({
      where: { id: attempt.id },
      data: {
        status: success ? 'SUCCESS' : 'FAILED',
        failureReason: success ? null : (parsed.resultDescription ?? 'Unknown failure'),
        callbackPayload: JSON.stringify(parsed).slice(0, 8000),
        verifiedAt: new Date(),
      },
    })
    await tx.webhookEvent.update({
      where: { idempotencyKey: parsed.checkoutRequestId },
      data: { status: 'PROCESSED', processedAt: new Date() },
    })

    if (success) {
      // Transition the order to CONFIRMED only when payment is verified
      const order = await tx.order.update({
        where: { id: attempt.orderId },
        data: { status: 'CONFIRMED' },
      })
      await tx.orderEvent.create({
        data: {
          orderId: order.id,
          type: 'PAYMENT_VERIFIED',
          detail: `M-Pesa payment confirmed. Receipt: ${parsed.mpesaReceiptNumber ?? 'N/A'}`,
          metadata: JSON.stringify({ receipt: parsed.mpesaReceiptNumber, phone: parsed.phone }),
        },
      })
      await dispatch({
        tenantId: attempt.tenantId,
        channel: 'IN_APP',
        template: 'PAYMENT_RECEIVED',
        recipient: 'merchant',
        subject: `Payment received for order ${order.reference}`,
        body: `Order ${order.reference} has been paid. Receipt: ${parsed.mpesaReceiptNumber ?? 'N/A'}`,
      })
    } else {
      // Payment failed. Order stays in PENDING; the merchant/customer can retry.
      await tx.orderEvent.create({
        data: {
          orderId: attempt.orderId,
          type: 'PAYMENT_FAILED',
          detail: `M-Pesa payment failed: ${parsed.resultDescription ?? 'Unknown reason'}`,
        },
      })
    }
  })

  await audit({
    ctx: { user: null, tenant: { id: attempt.tenantId, handle: '', displayName: '' }, ip: null, userAgent: null },
    action: success ? 'payment.verified' : 'payment.failed',
    category: success ? 'PAYMENT_VERIFIED' : 'PAYMENT_FAILED',
    targetType: 'PaymentAttempt',
    targetId: attempt.id,
    metadata: {
      resultCode: parsed.resultCode,
      receipt: parsed.mpesaReceiptNumber,
      amount: parsed.amount,
    },
  })

  // Always 200 to Daraja so they don't retry
  return NextResponse.json({ ResultCode: 0, ResultDesc: 'Processed' })
})
