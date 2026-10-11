import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getRequestContext, requireTenantMembership, requireMinRole } from '@/lib/session'
import { assertTenantOwns } from '@/lib/tenant'
import { withErrorHandler } from '@/lib/api'
import { audit } from '@/lib/audit'

interface RouteParams { params: Promise<{ id: string }> }

/**
 * POST /api/orders/[id]/cancel  — customer/merchant cancel order.
 *
 * - PENDING / CONFIRMED: can be cancelled. If items were already picked,
 *   stock is restored.
 * - PROCESSING+: cannot be cancelled without an admin override (use refund
 *   flow instead).
 *
 * Always emits an audit event and restores inventory atomically.
 */
export const POST = withErrorHandler(async (req, { params }: RouteParams) => {
  const ctx = await getRequestContext(req)
  const { tenant } = requireTenantMembership(ctx)
  requireMinRole(ctx, 'ORDER_MANAGER')
  const { id } = await params
  const body = (await req.json().catch(() => ({}))) as { reason?: string }

  const order = await prisma.order.findUnique({
    where: { id },
    include: { items: true },
  })
  assertTenantOwns(order, tenant.id, 'order')

  if (!['PENDING', 'CONFIRMED'].includes(order.status)) {
    return NextResponse.json(
      { error: 'cannot_cancel', message: `Cannot cancel order in state ${order.status}` },
      { status: 400 },
    )
  }

  await prisma.$transaction(async (tx) => {
    await tx.order.update({ where: { id }, data: { status: 'CANCELLED' } })
    await tx.orderEvent.create({
      data: {
        orderId: id,
        type: 'CANCELLED',
        detail: body.reason ?? 'Order cancelled',
        actorId: ctx.user?.id,
        actorName: ctx.user?.name ?? ctx.user?.email,
      },
    })
    // Restore stock for each item
    for (const it of order.items) {
      if (it.variantId) {
        await tx.variant.update({
          where: { id: it.variantId },
          data: { stock: { increment: it.quantity } },
        })
      } else if (it.productId) {
        await tx.product.update({
          where: { id: it.productId },
          data: { stock: { increment: it.quantity } },
        })
      }
    }
    // Mark any pending payment attempts as CANCELLED
    await tx.paymentAttempt.updateMany({
      where: { orderId: id, status: 'PENDING' },
      data: { status: 'CANCELLED' },
    })
  })

  await audit({
    ctx,
    action: 'order.cancel',
    category: 'DELETE',
    targetType: 'Order',
    targetId: id,
    metadata: { reason: body.reason, previousStatus: order.status },
  })

  return NextResponse.json({ ok: true })
})
