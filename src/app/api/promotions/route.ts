import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { withErrorHandler, queryParams } from '@/lib/api'

/**
 * GET /api/promotions?placement=marketplace_top
 *
 * PUBLIC — returns active promotions for the marketplace banner slot.
 * Only shows promotions whose schedule is currently active.
 */
export const GET = withErrorHandler(async (req) => {
  const q = queryParams(req)
  const placement = q.get('placement') ?? 'marketplace_top'
  const now = new Date()
  const promotions = await prisma.promotion.findMany({
    where: {
      active: true,
      placement,
      startsAt: { lte: now },
      OR: [{ endsAt: null }, { endsAt: { gte: now } }],
      tenant: { status: 'ACTIVE' },
    },
    include: {
      tenant: { select: { id: true, handle: true, displayName: true, theme: true } },
    },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
    take: 10,
  })
  return NextResponse.json({
    promotions: promotions.map((p) => ({
      id: p.id,
      title: p.title,
      description: p.description,
      imageUrl: p.imageUrl,
      linkType: p.linkType,
      linkRef: p.linkRef,
      placement: p.placement,
      tenant: {
        ...p.tenant,
        theme: p.tenant.theme ? JSON.parse(p.tenant.theme) : null,
      },
    })),
  })
})
