import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getRequestContext, requireTenantMembership, requireMinRole } from '@/lib/session'
import { tenantScoped } from '@/lib/tenant'
import { withErrorHandler, queryParams } from '@/lib/api'

/**
 * GET /api/orders  — merchant view of orders, tenant-scoped.
 * Supports pagination + status filter.
 */
export const GET = withErrorHandler(async (req) => {
  const ctx = await getRequestContext(req)
  const { tenant } = requireTenantMembership(ctx)
  const q = queryParams(req)
  const page = Math.max(1, Number(q.get('page') ?? '1'))
  const pageSize = Math.min(100, Math.max(1, Number(q.get('pageSize') ?? '20')))
  const status = q.get('status') ?? undefined
  const search = q.get('q') ?? undefined

  const where = {
    ...tenantScoped(tenant.id),
    ...(status ? { status: status as string } : {}),
    ...(search ? {
      OR: [
        { reference: { contains: search } },
        { guestName: { contains: search } },
        { guestEmail: { contains: search } },
        { guestPhone: { contains: search } },
      ],
    } : {}),
  }

  const [items, total] = await Promise.all([
    prisma.order.findMany({
      where,
      include: {
        items: true,
        events: { orderBy: { createdAt: 'desc' }, take: 20 },
        payments: { orderBy: { initiatedAt: 'desc' } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.order.count({ where }),
  ])

  return NextResponse.json({ items, total, page, pageSize })
})
