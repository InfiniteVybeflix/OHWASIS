import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { withErrorHandler, queryParams } from '@/lib/api'

/**
 * GET /api/ads?placement=top_banner
 * PUBLIC — returns active ads for a given placement. No ads = empty array.
 * Only returns ads that are active, within schedule, and targeted at the user's role.
 */
export const GET = withErrorHandler(async (req) => {
  const q = queryParams(req)
  const placement = q.get('placement') ?? 'top_banner'
  const now = new Date()
  const ads = await prisma.advertisement.findMany({
    where: {
      active: true,
      placement,
      startsAt: { lte: now },
      OR: [{ endsAt: null }, { endsAt: { gte: now } }],
    },
    orderBy: { createdAt: 'desc' },
    take: 5,
  })
  // Increment impressions
  if (ads.length > 0) {
    await prisma.advertisement.updateMany({
      where: { id: { in: ads.map((a) => a.id) } },
      data: { impressions: { increment: 1 } },
    })
  }
  return NextResponse.json({
    ads: ads.map((a) => ({
      id: a.id,
      title: a.title,
      description: a.description,
      imageUrl: a.imageUrl,
      linkUrl: a.linkUrl,
      placement: a.placement,
      targetAudience: JSON.parse(a.targetAudience || '[]'),
    })),
  })
})
