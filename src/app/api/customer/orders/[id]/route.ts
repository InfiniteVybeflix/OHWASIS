import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getRequestContext, requireCustomer } from '@/lib/session'
import { assertTenantOwns } from '@/lib/tenant'
import { withErrorHandler } from '@/lib/api'

interface RouteParams { params: Promise<{ id: string }> }

/**
 * GET /api/customer/orders/[id]
 *
 * Customer views their own order detail. The order must belong to the requesting
 * customer (customerUserId === user.id). Cross-customer access returns 404.
 */
export const GET = withErrorHandler(async (req, { params }: RouteParams) => {
  const ctx = await getRequestContext(req)
  const user = requireCustomer(ctx)
  const { id } = await params
  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      items: true,
      events: { orderBy: { createdAt: 'desc' } },
      payments: { select: { provider: true, status: true, amount: true, merchantReference: true } },
      tenant: { select: { id: true, handle: true, displayName: true, contactEmail: true, contactPhone: true } },
    },
  })
  if (!order || order.customerUserId !== user.id) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }
  // Cross-tenant ID substitution check (defence in depth)
  assertTenantOwns(order, order.tenantId, 'order')
  return NextResponse.json({
    order: {
      id: order.id,
      reference: order.reference,
      status: order.status,
      total: order.total,
      currency: order.currency,
      subtotal: order.subtotal,
      fulfillmentFee: order.fulfillmentFee,
      discountTotal: order.discountTotal,
      createdAt: order.createdAt,
      placedWhileClosed: order.placedWhileClosed,
      tenant: order.tenant,
      items: order.items.map((i) => ({
        id: i.id,
        name: i.name,
        variantName: i.variantName,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        lineTotal: i.lineTotal,
      })),
      events: order.events.map((e) => ({
        id: e.id,
        type: e.type,
        detail: e.detail,
        createdAt: e.createdAt,
      })),
      payments: order.payments,
    },
  })
})
