import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getRequestContext, requireTenantMembership } from '@/lib/session'
import { tenantScoped } from '@/lib/tenant'
import { withErrorHandler, queryParams } from '@/lib/api'

/**
 * GET /api/notifications
 *
 * Lists in-app notifications for the active tenant (most recent first).
 */
export const GET = withErrorHandler(async (req) => {
  const ctx = await getRequestContext(req)
  const { tenant } = requireTenantMembership(ctx)
  const q = queryParams(req)
  const page = Math.max(1, Number(q.get('page') ?? '1'))
  const pageSize = Math.min(50, Math.max(1, Number(q.get('pageSize') ?? '20')))
  const channel = q.get('channel') ?? undefined
  const status = q.get('status') ?? undefined

  const where = {
    ...tenantScoped(tenant.id),
    ...(channel ? { channel } : {}),
    ...(status ? { status } : {}),
  }

  const [items, total] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.notification.count({ where }),
  ])

  return NextResponse.json({ items, total, page, pageSize })
})
