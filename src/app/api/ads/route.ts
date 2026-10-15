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
 *
 * Impressions are incremented ONLY for ads that pass all eligibility checks.
 * No impressions are counted for draft, scheduled, paused, expired, or archived ads.
 */
export const GET = withErrorHandler(async (req) => {
  const q = queryParams(req)
  const placement = q.get('placement') ?? 'top_banner'
  const now = new Date()

  // Query ONLY active ads — no fallback to inactive ones
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
    // Fallback without tenant relation (in case schema not fully pushed)
    try {
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
    } catch {
      return NextResponse.json({ ads: [] })
    }
  }

  if (!ads || ads.length === 0) {
    return NextResponse.json({ ads: [] })
  }

  // Filter out ads that have hit their impression limit
  const eligible = ads.filter((ad) => {
    const adRecord = ad as Record<string, unknown>
    const impressionLimit = adRecord.impressionLimit as number | null
    const impressions = (adRecord.impressions as number) ?? 0
    if (impressionLimit && impressions >= impressionLimit) return false
    return true
  })

  // Increment impressions ONLY for eligible (active, within schedule) ads
  // This is the only place impressions are counted — no other endpoint increments them
  if (eligible.length > 0) {
    await prisma.advertisement.updateMany({
      where: { id: { in: eligible.map((a) => (a as Record<string, unknown>).id as string) } },
      data: { impressions: { increment: 1 } },
    }).catch(() => { /* best-effort — don't fail the request if tracking fails */ })
  }

  return NextResponse.json({
    ads: eligible.map((a) => {
      const ad = a as Record<string, unknown>
      const tenant = ad.tenant as { id: string; handle: string; displayName: string } | null
      const themeStr = (ad.theme as string) || '{}'
      const targetAudienceStr = (ad.targetAudience as string) || '[]'
      return {
        id: ad.id as string,
        title: ad.title as string,
        description: ad.description as string,
        imageUrl: (ad.imageUrl as string | null) ?? null,
        linkUrl: (ad.linkUrl as string | null) ?? null,
        ctaLabel: (ad.ctaLabel as string) ?? 'Learn More',
        ctaAction: (ad.ctaAction as string) ?? 'learn_more',
        placement: (ad.placement as string) ?? 'top_banner',
        isSponsored: (ad.isSponsored as boolean) ?? true,
        sponsoredLabel: (ad.sponsoredLabel as string) ?? 'Sponsored',
        priority: (ad.priority as number) ?? 0,
        deviceTarget: (ad.deviceTarget as string) ?? 'all',
        targetAudience: JSON.parse(targetAudienceStr),
        maxWidth: (ad.maxWidth as number) ?? 1280,
        maxHeight: (ad.maxHeight as number) ?? 200,
        minHeight: (ad.minHeight as number) ?? 80,
        imageFit: (ad.imageFit as string) ?? 'cover',
        imagePosition: (ad.imagePosition as string) ?? 'center',
        theme: JSON.parse(themeStr),
        perVisitorFreq: (ad.perVisitorFreq as number) ?? 0,
        tenant: tenant ?? null,
      }
    }),
  })
})
