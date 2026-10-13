import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { resolveTenantByHandle } from '@/lib/tenant'
import { withErrorHandler, parseBody } from '@/lib/api'
import { z } from 'zod'
import { audit } from '@/lib/audit'
import { dispatch } from '@/lib/notifications'

/**
 * M-Pesa SMS regex patterns.
 * Matches both Safaricom P2P and Lipa Na M-Pesa confirmation messages.
 *
 * Example P2P:
 *   "QFX7AB12CD Confirmed. You have received Ksh500.00 from JOHN DOE 0712345678 on 12/10/26 at 3:45 PM. New M-PESA balance is Ksh1,500.00."
 *
 * Example Lipa Na M-Pesa (Till):
 *   "QFX7AB12CD Confirmed. You have received Ksh500.00 from JOHN DOE 0712345678. Account Reference TESTWATER New Utility balance is Ksh1,500.00."
 *
 * Example Paybill:
 *   "QFX7AB12CD Confirmed. Ksh500.00 received from JOHN DOE 0712345678. Account Reference TESTWATER. New M-PESA balance is Ksh1,500.00."
 */
const MPESA_REGEX = /([A-Z0-9]{10})\s+Confirmed.*?Ksh\s*([\d,]+\.?\d*)\s*(?:from|received from)\s+(.+?)\s+(\d{9,12})/i

const smsSchema = z.object({
  smsText: z.string().min(20, 'Please paste the full M-Pesa confirmation message'),
  orderReference: z.string().min(3).max(50),
  tenantHandle: z.string().min(3).max(32),
})

/**
 * POST /api/mpesa/sms-verify
 *
 * Customer pastes their M-Pesa confirmation SMS. Server:
 *  1. Extracts transaction code, amount, sender name, sender phone via regex
 *  2. Looks up the order by reference (must belong to this tenant)
 *  3. Verifies the amount matches the order total
 *  4. Creates a notification for the business owner (with sound alert)
 *  5. The business owner then verifies or rejects from their dashboard
 *
 * If the SMS doesn't match the M-Pesa pattern, returns an error.
 * If the amount doesn't match, returns a warning but still records it for review.
 */
export const POST = withErrorHandler(async (req) => {
  const input = await parseBody(req, smsSchema)

  const tenant = await resolveTenantByHandle(input.tenantHandle).catch(() => null)
  if (!tenant) return NextResponse.json({ error: 'storefront_not_found' }, { status: 404 })

  // Extract M-Pesa details from the SMS
  const match = input.smsText.match(MPESA_REGEX)
  if (!match) {
    return NextResponse.json({
      error: 'invalid_sms',
      message: 'This doesn\'t look like an M-Pesa confirmation message. Please paste the full SMS you received from M-Pesa.',
    }, { status: 400 })
  }

  const transactionCode = match[1]
  const amountStr = match[2].replace(/,/g, '')
  const amount = parseFloat(amountStr)
  const senderName = match[3].trim()
  const senderPhone = match[4].trim()

  // Look up the order
  const order = await prisma.order.findUnique({
    where: { reference: input.orderReference },
    include: { payments: true },
  })
  if (!order || order.tenantId !== tenant.id) {
    return NextResponse.json({ error: 'order_not_found' }, { status: 404 })
  }

  // Check if amount matches
  const amountMatches = Math.abs(amount - order.total) < 1 // within KES 1

  // Create a notification for the business owner — they verify from dashboard
  await dispatch({
    tenantId: tenant.id,
    channel: 'IN_APP',
    template: 'MPESA_SMS_PENDING',
    recipient: tenant.contactEmail ?? 'merchant',
    subject: `M-Pesa payment for ${order.reference} — awaiting verification`,
    body: `Transaction ${transactionCode}: KES ${amount} from ${senderName} (${senderPhone}). Order total: KES ${order.total}. ${amountMatches ? '✓ Amount matches.' : '⚠ Amount does NOT match!'}`,
    // Store extra metadata in the body for the merchant to review
  })

  // Update the payment attempt with the extracted details
  const pendingAttempt = order.payments.find((p) => p.status === 'PENDING')
  if (pendingAttempt) {
    await prisma.paymentAttempt.update({
      where: { id: pendingAttempt.id },
      data: {
        callbackPayload: JSON.stringify({
          transactionCode,
          amount,
          senderName,
          senderPhone,
          amountMatches,
          smsText: input.smsText.slice(0, 2000),
          submittedAt: new Date().toISOString(),
        }),
      },
    })
  }

  await audit({
    ctx: { user: null, tenant: { id: tenant.id, handle: tenant.handle, displayName: tenant.displayName }, ip: null, userAgent: null },
    action: 'mpesa.sms_submitted',
    category: 'PAYMENT_INITIATED',
    targetType: 'Order',
    targetId: order.id,
    metadata: { transactionCode, amount, senderName, amountMatches },
  })

  return NextResponse.json({
    ok: true,
    transactionCode,
    amount,
    senderName,
    amountMatches,
    message: amountMatches
      ? `Payment received! Transaction ${transactionCode} for KES ${amount}. The business will verify shortly.`
      : `Payment received but the amount (KES ${amount}) doesn't match your order total (KES ${order.total}). The business will review manually.`,
  })
})
