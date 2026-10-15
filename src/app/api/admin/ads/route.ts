import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getRequestContext, requirePlatformOperator } from '@/lib/session'
import { withErrorHandler, parseBody, queryParams } from '@/lib/api'
import { z } from 'zod'
import { audit } from '@/lib/audit'

/**
 * GET /api/admin/ads?status=&placement=&tenantId=&q=
 * Admin: list all advertisements with filters.
 */
export const GET = withErrorHandler(async (req) => {
  const ctx = await getRequestContext(req)
  requirePlatformOperator(ctx)
  const q = queryParams(req)
  const status = q.get('status')
  const placement = q.get('placement')
  const tenantId = q.get('tenantId')
  const search = q.get('q')

  const where: Record<string, unknown> = {}
  if (status) where.status = status
  if (placement) where.placement = placement
  if (tenantId) where.tenantId = tenantId
  if (search) where.title = { contains: search }

  try {
    const ads = await prisma.advertisement.findMany({
      where,
      include: { tenant: { select: { id: true, handle: true, displayName: true } } },
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
      take: 100,
    })
    return NextResponse.json({ ads })
  } catch {
    try {
      const ads = await prisma.advertisement.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: 100,
      })
      return NextResponse.json({ ads })
    } catch {
      return NextResponse.json({ ads: [] })
    }
  }
})

// Permissive schema — accept any string, validate critical fields only
const adSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200),
  description: z.string().min(1, 'Description is required').max(1000),
  tenantId: z.string().optional().nullable(),
  imageUrl: z.string().optional().nullable(),
  linkUrl: z.string().optional().nullable(),
  ctaLabel: z.string().max(50).default('Learn More'),
  ctaAction: z.string().default('learn_more'),
  placement: z.string().default('top_banner'),
  startsAt: z.string().optional(),
  endsAt: z.string().optional().nullable(),
  active: z.boolean().default(false),
  isSponsored: z.boolean().default(true),
  sponsoredLabel: z.string().max(50).default('Sponsored'),
  priority: z.number().int().min(0).max(1000).default(0),
  deviceTarget: z.string().default('all'),
  targetAudience: z.array(z.string()).default(['customer']),
  maxWidth: z.number().int().min(200).max(3840).default(1280),
  maxHeight: z.number().int().min(40).max(600).default(200),
  minHeight: z.number().int().min(40).max(600).default(80),
  imageFit: z.string().default('cover'),
  imagePosition: z.string().default('center'),
  theme: z.record(z.string(), z.unknown()).default({}),
  impressionLimit: z.number().int().min(1).optional().nullable(),
  perVisitorFreq: z.number().int().min(0).max(100).default(0),
})

/**
 * POST /api/admin/ads
 * Create a new advertisement.
 */
export const POST = withErrorHandler(async (req) => {
  const ctx = await getRequestContext(req)
  requirePlatformOperator(ctx)
  const input = await parseBody(req, adSchema)

  // Validate schedule
  const startsAt = input.startsAt ? new Date(input.startsAt) : new Date()
  const endsAt = input.endsAt ? new Date(input.endsAt) : null
  if (endsAt && endsAt <= startsAt) {
    return NextResponse.json({ error: 'invalid_schedule', message: 'End date must be after start date.' }, { status: 400 })
  }

  // Determine status
  let status = 'draft'
  if (input.active) {
    if (startsAt > new Date()) {
      status = 'scheduled'
    } else {
      status = 'active'
    }
  }

  const data: Record<string, unknown> = {
    title: input.title,
    description: input.description,
    tenantId: input.tenantId || null,
    imageUrl: input.imageUrl || null,
    linkUrl: input.linkUrl || null,
    ctaLabel: input.ctaLabel,
    ctaAction: input.ctaAction,
    placement: input.placement,
    startsAt,
    endsAt,
    active: input.active,
    status,
    isSponsored: input.isSponsored,
    sponsoredLabel: input.sponsoredLabel,
    priority: input.priority,
    deviceTarget: input.deviceTarget,
    targetAudience: JSON.stringify(input.targetAudience),
    maxWidth: input.maxWidth,
    maxHeight: input.maxHeight,
    minHeight: input.minHeight,
    imageFit: input.imageFit,
    imagePosition: input.imagePosition,
    theme: JSON.stringify(input.theme),
    impressionLimit: input.impressionLimit ?? null,
    perVisitorFreq: input.perVisitorFreq,
    // Initialize analytics at 0 — never inherited from existing data
    impressions: 0,
    clicks: 0,
  }

  try {
    const ad = await prisma.advertisement.create({ data })
    await audit({ ctx, action: 'ad.create', category: 'CREATE', targetType: 'Advertisement', targetId: ad.id, metadata: { title: ad.title } })
    return NextResponse.json({ ad }, { status: 201 })
  } catch (err) {
    console.error('[admin/ads] Create failed:', err)
    // Fallback: minimal fields
    try {
      const ad = await prisma.advertisement.create({
        data: {
          title: input.title,
          description: input.description,
          imageUrl: input.imageUrl || null,
          linkUrl: input.linkUrl || null,
          placement: input.placement,
          startsAt,
          endsAt,
          active: input.active,
          status,
          targetAudience: JSON.stringify(input.targetAudience),
          impressions: 0,
          clicks: 0,
        },
      })
      return NextResponse.json({ ad }, { status: 201 })
    } catch (err2) {
      console.error('[admin/ads] Minimal create also failed:', err2)
      return NextResponse.json(
        { error: 'create_failed', message: 'Could not create advertisement. Check server logs.' },
        { status: 500 },
      )
    }
  }
})
