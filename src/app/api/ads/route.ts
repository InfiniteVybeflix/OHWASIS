import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { withErrorHandler, queryParams } from '@/lib/api'

/**
 * GET /api/ads?placement=top_banner
 * PUBLIC — returns eligible ads for a given placement.
 *
 * Eligibility rules (enforced server-side):
 *   - status must be 'active'
 *   - startsAt must be <= now
 *   - endsAt must be null or >= now
 *   - if impressionLimit is set, impressions must be < impressionLimit
 *
 * Results are sorted by priority (desc) then createdAt (desc).
 * The client handles rotation among eligible ads.
 */
export const GET = withErrorHandler(async (req) => {
  const q = queryParams(req)
  const placement = q.get('placement') ?? 'top_banner'
  const now = new Date()

  const ads = await prisma.advertisement.findMany({
    where: {
      status: 'active',
      active: true,
      placement,
      startsAt: { lte: now },
      OR: [{ endsAt: null }, { endsAt: { gte: now } }],
    },
    include: {
      tenant: { select: { id: true, handle: true, displayName: true } },
    },
    orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
    take: 10,
  })

  // Filter out ads that have hit their impression limit
  const eligible = ads.filter((ad) => {
    if (ad.impressionLimit && ad.impressions >= ad.impressionLimit) return false
    return true
  })

  // Increment impressions for eligible ads (server-side, deduplicated per request)
  if (eligible.length > 0) {
    await prisma.advertisement.updateMany({
      where: { id: { in: eligible.map((a) => a.id) } },
      data: { impressions: { increment: 1 } },
    })
  }

  return NextResponse.json({
    ads: eligible.map((a) => ({
      id: a.id,
      title: a.title,
      description: a.description,
      imageUrl: a.imageUrl,
      linkUrl: a.linkUrl,
      ctaLabel: a.ctaLabel,
      ctaAction: a.ctaAction,
      placement: a.placement,
      isSponsored: a.isSponsored,
      sponsoredLabel: a.sponsoredLabel,
      priority: a.priority,
      deviceTarget: a.deviceTarget,
      targetAudience: JSON.parse(a.targetAudience || '[]'),
      maxWidth: a.maxWidth,
      maxHeight: a.maxHeight,
      minHeight: a.minHeight,
      imageFit: a.imageFit,
      imagePosition: a.imagePosition,
      theme: JSON.parse(a.theme || '{}'),
      perVisitorFreq: a.perVisitorFreq,
      tenant: a.tenant,
    })),
  })
})

/**
 * POST /api/ads/[id]/click
 * Track a click on an advertisement.
 * Note: This is handled via a separate route file for clarity.
 */
