import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getRequestContext, requireTenantMembership, requireMinRole } from '@/lib/session'
import { assertTenantOwns } from '@/lib/tenant'
import { withErrorHandler } from '@/lib/api'
import { audit } from '@/lib/audit'
import { dispatch } from '@/lib/notifications'

interface RouteParams { params: Promise<{ id: string }> }

/**
 * POST /api/payments/manual-verify?orderId=... or body { orderId, receipt, note }
 *
 * Merchant dashboard action: verify a manual/COD payment. Requires
 * ORDER_MANAGER+. Records the verification in audit history, transitions
 * the order to CONFIRMED. NEVER marks a payment paid without explicit
 * merchant authorization.
 */
export const POST = withErrorHandler(async (req) => {
  const ctx = await getRequestContext(req)
  const { tenant } = requireTenantMembership(ctx)
  requireMinRole(ctx, 'ORDER_MANAGER')
  const body = (await req.json().catch(() => ({}))) as { orderId?: string; receipt?: string; note?: string }
  if (!body.orderId) {
    return NextResponse.json({ error: 'orderId_required' }, { status: 400 })
  }

  const order = await prisma.order.findUnique({
    where: { id: body.orderId },
    include: { payments: true },
  })
  assertTenantOwns(order, tenant.id, 'order')

  if (order.status !== 'PENDING') {
    return NextResponse.json({ error: 'order_not_pending' }, { status: 400 })
  }

  // Find the manual / COD attempt
  let attempt = order.payments.find((p) => p.status === 'PENDING' && ['manual', 'mpesa_manual', 'cash_on_delivery'].includes(p.provider))
  if (!attempt) {
    // Create one if it didn't exist (e.g. COD orders may not have an attempt)
    attempt = await prisma.paymentAttempt.create({
      data: {
        orderId: order.id,
        tenantId: tenant.id,
        provider: 'manual',
        merchantReference: order.reference,
        amount: order.total,
        currency: order.currency,
        status: 'PENDING',
      },
    })
  }

  await prisma.$transaction(async (tx) => {
    await tx.paymentAttempt.update({
      where: { id: attempt!.id },
      data: {
        status: 'SUCCESS',
        verifiedAt: new Date(),
        callbackPayload: JSON.stringify({
          receipt: body.receipt ?? null,
          note: body.note ?? null,
          verifiedBy: ctx.user?.email,
          verifiedAt: new Date().toISOString(),
        }),
      },
    })
    await tx.order.update({ where: { id: order.id }, data: { status: 'CONFIRMED' } })
    await tx.orderEvent.create({
      data: {
        orderId: order.id,
        type: 'PAYMENT_VERIFIED',
        detail: `Manual verification by ${ctx.user?.email}. Receipt: ${body.receipt ?? 'N/A'}`,
        actorId: ctx.user?.id,
        actorName: ctx.user?.name ?? ctx.user?.email,
      },
    })
  })

  await audit({
    ctx,
    action: 'payment.manual_verify',
    category: 'PAYMENT_VERIFIED',
    targetType: 'Order',
    targetId: order.id,
    metadata: { receipt: body.receipt, note: body.note },
  })

  await dispatch({
    tenantId: tenant.id,
    channel: 'IN_APP',
    template: 'PAYMENT_RECEIVED',
    recipient: 'merchant',
    subject: `Payment verified for order ${order.reference}`,
    body: `Order ${order.reference} has been verified manually by ${ctx.user?.email}.`,
  })

  return NextResponse.json({ ok: true })
})
