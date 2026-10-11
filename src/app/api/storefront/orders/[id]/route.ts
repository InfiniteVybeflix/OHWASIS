import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { resolveTenantByHandle } from '@/lib/tenant'
import { withErrorHandler, queryParams } from '@/lib/api'

/**
 * GET /api/storefront/orders/[reference]?handle=...
 *
 * Public order status lookup by reference. Returns only the fields a customer
 * should see: status, items (no internal IDs), payment status summary.
 *
 * No auth required — but only the order reference is accepted, never the
 * internal ID. Reference is collision-resistant enough for customer lookup.
 */
export const GET = withErrorHandler(async (req, ctx) => {
  const { params } = ctx
  const { id } = await params
  const q = queryParams(req)
  const handle = q.get('handle')
  if (!handle) return NextResponse.json({ error: 'handle_required' }, { status: 400 })
  const tenant = await resolveTenantByHandle(handle).catch(() => null)
  if (!tenant) return NextResponse.json({ error: 'storefront_not_found' }, { status: 404 })

  // id parameter is actually the order reference here — using [id] for route shape
  const order = await prisma.order.findUnique({
    where: { reference: id },
    include: {
      items: true,
      payments: { select: { provider: true, status: true, amount: true, merchantReference: true } },
    },
  })
  if (!order || order.tenantId !== tenant.id) {
    return NextResponse.json({ error: 'order_not_found' }, { status: 404 })
  }

  const paymentSummary = order.payments.length === 0
    ? { status: 'PENDING', message: 'No payment attempt recorded yet' }
    : order.payments.some((p) => p.status === 'SUCCESS')
      ? { status: 'SUCCESS', message: 'Payment confirmed' }
      : order.payments.some((p) => p.status === 'PENDING')
        ? { status: 'PENDING', message: 'Payment pending verification' }
        : { status: 'FAILED', message: 'Payment failed or not yet initiated' }

  return NextResponse.json({
    order: {
      reference: order.reference,
      status: order.status,
      createdAt: order.createdAt,
      total: order.total,
      currency: order.currency,
      items: order.items.map((i) => ({
        name: i.name,
        variantName: i.variantName,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        lineTotal: i.lineTotal,
      })),
      payment: paymentSummary,
    },
  })
})
