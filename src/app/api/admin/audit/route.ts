import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getRequestContext, requirePlatformOperator } from '@/lib/session'
import { withErrorHandler, queryParams } from '@/lib/api'

/**
 * GET /api/admin/audit  — platform-wide audit log.
 * Supports filtering by tenant, action, category, actor.
 */
export const GET = withErrorHandler(async (req) => {
  const ctx = await getRequestContext(req)
  requirePlatformOperator(ctx)
  const q = queryParams(req)
  const page = Math.max(1, Number(q.get('page') ?? '1'))
  const pageSize = Math.min(200, Math.max(1, Number(q.get('pageSize') ?? '50')))
  const tenantId = q.get('tenantId') ?? undefined
  const category = q.get('category') ?? undefined
  const action = q.get('action') ?? undefined
  const actorId = q.get('actorId') ?? undefined

  const where = {
    ...(tenantId ? { tenantId } : {}),
    ...(category ? { category } : {}),
    ...(action ? { action: { contains: action } } : {}),
    ...(actorId ? { actorId } : {}),
  }

  const [items, total] = await Promise.all([
    prisma.auditEvent.findMany({
      where,
      include: { tenant: { select: { handle: true, displayName: true } } },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.auditEvent.count({ where }),
  ])

  return NextResponse.json({ items, total, page, pageSize })
})
