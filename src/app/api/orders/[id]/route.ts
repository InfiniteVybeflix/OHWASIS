import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getRequestContext, requireTenantMembership, requireMinRole } from '@/lib/session'
import { assertTenantOwns } from '@/lib/tenant'
import { withErrorHandler } from '@/lib/api'
import { audit } from '@/lib/audit'

interface RouteParams { params: Promise<{ id: string }> }

/**
 * GET /api/orders/[id]  — full order detail with items, events, payments.
 */
export const GET = withErrorHandler(async (req, { params }: RouteParams) => {
  const ctx = await getRequestContext(req)
  const { tenant } = requireTenantMembership(ctx)
  const { id } = await params
  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      items: true,
      events: { orderBy: { createdAt: 'desc' } },
      payments: { orderBy: { initiatedAt: 'desc' } },
      customer: true,
    },
  })
  assertTenantOwns(order, tenant.id, 'order')
  return NextResponse.json({ order })
})

/**
 * PATCH /api/orders/[id]  — merchant updates order status.
 * Body: { status: OrderStatus, note?: string }
 *
 * Validated state-transition matrix. Cannot skip states; cannot reverse
 * terminal states without an explicit cancellation/refund flow.
 */
export const PATCH = withErrorHandler(async (req, { params }: RouteParams) => {
  const ctx = await getRequestContext(req)
  const { tenant } = requireTenantMembership(ctx)
  requireMinRole(ctx, 'ORDER_MANAGER')
  const { id } = await params
  const body = (await req.json().catch(() => ({}))) as { status?: string; note?: string }
  if (!body.status) {
    return NextResponse.json({ error: 'status_required' }, { status: 400 })
  }

  const existing = await prisma.order.findUnique({ where: { id } })
  assertTenantOwns(existing, tenant.id, 'order')

  const next = body.status as typeof existing.status
  if (!validTransition(existing.status, next)) {
    return NextResponse.json(
      { error: 'invalid_transition', from: existing.status, to: next },
      { status: 400 },
    )
  }

  const updated = await prisma.$transaction(async (tx) => {
    const order = await tx.order.update({
      where: { id },
      data: { status: next },
    })
    await tx.orderEvent.create({
      data: {
        orderId: order.id,
        type: 'STATUS_CHANGE',
        detail: `${existing.status} → ${next}${body.note ? `: ${body.note}` : ''}`,
        actorId: ctx.user?.id,
        actorName: ctx.user?.name ?? ctx.user?.email,
      },
    })
    return order
  })

  await audit({
    ctx,
    action: 'order.status_change',
    category: 'UPDATE',
    targetType: 'Order',
    targetId: updated.id,
    metadata: { from: existing.status, to: next, note: body.note },
  })

  return NextResponse.json({ order: updated })
})

function validTransition(from: string, to: string): boolean {
  const allowed: Record<string, string[]> = {
    PENDING: ['CONFIRMED', 'CANCELLED'],
    CONFIRMED: ['PROCESSING', 'CANCELLED'],
    PROCESSING: ['OUT_FOR_DELIVERY', 'READY_FOR_PICKUP', 'CANCELLED'],
    OUT_FOR_DELIVERY: ['DELIVERED', 'CANCELLED'],
    READY_FOR_PICKUP: ['COMPLETED', 'CANCELLED'],
    DELIVERED: ['COMPLETED'],
    COMPLETED: ['REFUNDED'],
    CANCELLED: [],
    REFUNDED: [],
  }
  return (allowed[from] ?? []).includes(to)
}
