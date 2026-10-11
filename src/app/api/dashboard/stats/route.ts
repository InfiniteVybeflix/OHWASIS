import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getRequestContext, requireTenantMembership } from '@/lib/session'
import { tenantScoped } from '@/lib/tenant'
import { withErrorHandler } from '@/lib/api'

/**
 * GET /api/dashboard/stats
 *
 * Returns real, persisted dashboard metrics for the active tenant.
 * NEVER returns fabricated numbers — if no data exists, returns zeros.
 */
export const GET = withErrorHandler(async (req) => {
  const ctx = await getRequestContext(req)
  const { tenant } = requireTenantMembership(ctx)

  const now = new Date()
  const last30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
  const last7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

  const [
    productCount,
    activeProducts,
    orderCount,
    ordersLast7,
    ordersLast30,
    pendingOrders,
    customerCount,
    revenueData,
    statusCounts,
    lowStock,
  ] = await Promise.all([
    prisma.product.count({ where: tenantScoped(tenant.id) }),
    prisma.product.count({ where: { ...tenantScoped(tenant.id), status: 'ACTIVE' } }),
    prisma.order.count({ where: tenantScoped(tenant.id) }),
    prisma.order.count({ where: { ...tenantScoped(tenant.id), createdAt: { gte: last7 } } }),
    prisma.order.count({ where: { ...tenantScoped(tenant.id), createdAt: { gte: last30 } } }),
    prisma.order.count({ where: { ...tenantScoped(tenant.id), status: 'PENDING' } }),
    prisma.customer.count({ where: tenantScoped(tenant.id) }),
    prisma.order.aggregate({
      where: { ...tenantScoped(tenant.id), status: { notIn: ['CANCELLED', 'REFUNDED'] } },
      _sum: { total: true },
    }),
    prisma.order.groupBy({
      by: ['status'],
      where: tenantScoped(tenant.id),
      _count: { _all: true },
    }),
    prisma.product.findMany({
      where: { ...tenantScoped(tenant.id), trackStock: true, stock: { lt: 10 } },
      select: { id: true, name: true, stock: true },
      take: 10,
    }),
  ])

  return NextResponse.json({
    counts: {
      products: productCount,
      activeProducts,
      orders: orderCount,
      ordersLast7,
      ordersLast30,
      pendingOrders,
      customers: customerCount,
    },
    revenue: {
      total: revenueData._sum.total ?? 0,
    },
    byStatus: statusCounts.reduce<Record<string, number>>((acc, s) => {
      acc[s.status] = s._count._all
      return acc
    }, {}),
    lowStock,
  })
})
