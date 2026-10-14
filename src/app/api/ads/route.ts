import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { withErrorHandler, queryParams } from '@/lib/api'

/**
 * GET /api/ads?placement=top_banner
 * PUBLIC — returns eligible ads for a given placement.
 *
 * Eligibility rules (enforced server-side):
 *   - status must be 'active'
 *   - active must be true
 *   - startsAt must be <= now
 *   - endsAt must be null or >= now
 *   - if impressionLimit is set, impressions must be < impressionLimit
 */
export const GET = withErrorHandler(async (req) => {
  const q = queryParams(req)
  const placement = q.get('placement') ?? 'top_banner'
  const now = new Date()

  // Try with tenant relation; if it fails (schema not pushed), retry without
  let ads
  try {
    ads = await prisma.advertisement.findMany({
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
  } catch {
    // Fallback: query without tenant relation (in case schema hasn't been pushed yet)
    ads = await prisma.advertisement.findMany({
      where: {
        status: 'active',
        active: true,
        placement,
        startsAt: { lte: now },
        OR: [{ endsAt: null }, { endsAt: { gte: now } }],
      },
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
      take: 10,
    })
  }

  // Filter out ads that have hit their impression limit
  const eligible = ads.filter((ad) => {
    const adRecord = ad as Record<string, unknown>
    const impressionLimit = adRecord.impressionLimit as number | null
    const impressions = adRecord.impressions as number
    if (impressionLimit && impressions >= impressionLimit) return false
    return true
  })

  // Increment impressions for eligible ads
  if (eligible.length > 0) {
    await prisma.advertisement.updateMany({
      where: { id: { in: eligible.map((a) => (a as Record<string, unknown>).id as string) } },
      data: { impressions: { increment: 1 } },
    }).catch(() => { /* best-effort */ })
  }

  return NextResponse.json({
    ads: eligible.map((a) => {
      const ad = a as Record<string, unknown>
      const tenant = ad.tenant as { id: string; handle: string; displayName: string } | null
      const theme = ad.theme as string
      const targetAudience = ad.targetAudience as string
      return {
        id: ad.id,
        title: ad.title,
        description: ad.description,
        imageUrl: ad.imageUrl,
        linkUrl: ad.linkUrl,
        ctaLabel: ad.ctaLabel,
        ctaAction: ad.ctaAction,
        placement: ad.placement,
        isSponsored: ad.isSponsored,
        sponsoredLabel: ad.sponsoredLabel,
        priority: ad.priority,
        deviceTarget: ad.deviceTarget,
        targetAudience: JSON.parse(targetAudience || '[]'),
        maxWidth: ad.maxWidth,
        maxHeight: ad.maxHeight,
        minHeight: ad.minHeight,
        imageFit: ad.imageFit,
        imagePosition: ad.imagePosition,
        theme: JSON.parse(theme || '{}'),
        perVisitorFreq: ad.perVisitorFreq,
        tenant: tenant ?? null,
      }
    }),
  })
})
