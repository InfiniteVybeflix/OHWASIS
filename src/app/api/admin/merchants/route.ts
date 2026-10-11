import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getRequestContext, requirePlatformOperator } from '@/lib/session'
import { withErrorHandler, queryParams } from '@/lib/api'
import { audit } from '@/lib/audit'

/**
 * GET /api/admin/merchants  — platform operator view of all tenants.
 *
 * Returns tenant summary + active members count + order count + revenue.
 */
export const GET = withErrorHandler(async (req) => {
  const ctx = await getRequestContext(req)
  requirePlatformOperator(ctx)
  const q = queryParams(req)
  const status = q.get('status') ?? undefined
  const search = q.get('q') ?? undefined

  const tenants = await prisma.tenant.findMany({
    where: {
      ...(status ? { status: status as string } : {}),
      ...(search ? {
        OR: [
          { displayName: { contains: search } },
          { handle: { contains: search } },
          { contactEmail: { contains: search } },
        ],
      } : {}),
    },
    include: {
      _count: {
        select: {
          memberships: { where: { status: 'ACTIVE' } },
          orders: true,
          products: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  })

  // Aggregate revenue per tenant
  const tenantIds = tenants.map((t) => t.id)
  const revenueByTenant: Record<string, number> = {}
  if (tenantIds.length > 0) {
    const orders = await prisma.order.findMany({
      where: { tenantId: { in: tenantIds }, status: { notIn: ['CANCELLED'] } },
      select: { tenantId: true, total: true },
    })
    for (const o of orders) {
      revenueByTenant[o.tenantId] = (revenueByTenant[o.tenantId] ?? 0) + o.total
    }
  }

  return NextResponse.json({
    tenants: tenants.map((t) => ({
      id: t.id,
      handle: t.handle,
      displayName: t.displayName,
      industry: t.industry,
      status: t.status,
      contactEmail: t.contactEmail,
      contactPhone: t.contactPhone,
      createdAt: t.createdAt,
      memberCount: t._count.memberships,
      orderCount: t._count.orders,
      productCount: t._count.products,
      revenue: revenueByTenant[t.id] ?? 0,
    })),
  })
})
