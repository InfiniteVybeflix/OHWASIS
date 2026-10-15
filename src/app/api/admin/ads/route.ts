import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getRequestContext, requirePlatformOperator } from '@/lib/session'
import { withErrorHandler, parseBody, queryParams } from '@/lib/api'
import { z } from 'zod'
import { audit } from '@/lib/audit'

// Shared constants
const VALID_PLACEMENTS = ['top_banner', 'featured_business', 'marketplace_feed', 'category_page', 'search_results', 'storefront', 'popup']
const VALID_CTA_ACTIONS = ['visit_store', 'shop_now', 'contact_business', 'view_offer', 'learn_more', 'custom']
const VALID_DEVICE_TARGETS = ['all', 'mobile', 'tablet', 'desktop']
const VALID_IMAGE_FITS = ['contain', 'cover', 'fill']
const VALID_IMAGE_POSITIONS = ['center', 'top', 'bottom', 'left', 'right']

// Helper: validate a string is a safe URL (http/https) or empty/null/undefined
const optionalUrl = z.union([
  z.string().url().refine(url => url.startsWith('http://') || url.startsWith('https://'), 'URL must use http or https'),
  z.literal(''),
  z.null(),
  z.undefined(),
])

// Helper: validate a datetime string or empty/null/undefined
const optionalDatetime = z.union([
  z.string().datetime(),
  z.literal(''),
  z.null(),
  z.undefined(),
])

// Helper: validate against allowed values, or empty/null/undefined
const optionalEnum = (allowed: string[]) => z.union([
  z.enum(allowed as [string, ...string[]]),
  z.literal(''),
  z.null(),
  z.undefined(),
])

// Helper: tenantId — accepts cuid (existing business), null (no business/external), or undefined
const optionalTenantId = z.union([
  z.string().cuid(),
  z.null(),
  z.undefined(),
  z.string().min(1).max(100).refine(s => s !== 'none', 'Use null for no business'),
])

/**
 * GET /api/admin/ads?status=&placement=&tenantId=&q=
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
      const ads = await prisma.advertisement.findMany({ where, orderBy: { createdAt: 'desc' }, take: 100 })
      return NextResponse.json({ ads })
    } catch {
      return NextResponse.json({ ads: [] })
    }
  }
})

const adSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200),
  description: z.string().min(1, 'Description is required').max(1000),
  tenantId: optionalTenantId.optional(),
  imageUrl: optionalUrl.optional(),
  linkUrl: optionalUrl.optional(),
  ctaLabel: z.string().max(50).default('Learn More'),
  ctaAction: optionalEnum(VALID_CTA_ACTIONS).default('learn_more'),
  placement: optionalEnum(VALID_PLACEMENTS).default('top_banner'),
  startsAt: optionalDatetime.optional(),
  endsAt: optionalDatetime.optional(),
  active: z.boolean().default(false),
  isSponsored: z.boolean().default(true),
  sponsoredLabel: z.string().max(50).default('Sponsored'),
  priority: z.number().int().min(0).max(1000).default(0),
  deviceTarget: optionalEnum(VALID_DEVICE_TARGETS).default('all'),
  targetAudience: z.array(z.string()).default(['customer']),
  maxWidth: z.number().int().min(200).max(3840).default(1280),
  maxHeight: z.number().int().min(40).max(600).default(200),
  minHeight: z.number().int().min(40).max(600).default(80),
  imageFit: optionalEnum(VALID_IMAGE_FITS).default('cover'),
  imagePosition: optionalEnum(VALID_IMAGE_POSITIONS).default('center'),
  theme: z.record(z.string(), z.unknown()).default({}),
  impressionLimit: z.number().int().min(1).optional().nullable(),
  perVisitorFreq: z.number().int().min(0).max(100).default(0),
})

/**
 * POST /api/admin/ads
 */
export const POST = withErrorHandler(async (req) => {
  const ctx = await getRequestContext(req)
  requirePlatformOperator(ctx)
  const input = await parseBody(req, adSchema)

  // Parse dates
  const startsAt = input.startsAt && input.startsAt !== '' ? new Date(input.startsAt) : new Date()
  const endsAt = input.endsAt && input.endsAt !== '' ? new Date(input.endsAt) : null
  if (endsAt && endsAt <= startsAt) {
    return NextResponse.json({ error: 'invalid_schedule', message: 'End date must be after start date.' }, { status: 400 })
  }

  // Determine status
  let status = 'draft'
  if (input.active) {
    status = startsAt > new Date() ? 'scheduled' : 'active'
  }

  // Clean tenantId: convert '', 'none', null → null (no business)
  const cleanTenantId = (input.tenantId === '' || input.tenantId === 'none' || input.tenantId === null || input.tenantId === undefined)
    ? null
    : input.tenantId

  // Clean URLs: convert '', null → null
  const cleanImageUrl = (input.imageUrl === '' || input.imageUrl === null || input.imageUrl === undefined) ? null : input.imageUrl
  const cleanLinkUrl = (input.linkUrl === '' || input.linkUrl === null || input.linkUrl === undefined) ? null : input.linkUrl

  // Clean enum values: use defaults for empty/null
  const cleanCtaAction = (input.ctaAction === '' || input.ctaAction === null || input.ctaAction === undefined) ? 'learn_more' : input.ctaAction
  const cleanPlacement = (input.placement === '' || input.placement === null || input.placement === undefined) ? 'top_banner' : input.placement
  const cleanDeviceTarget = (input.deviceTarget === '' || input.deviceTarget === null || input.deviceTarget === undefined) ? 'all' : input.deviceTarget
  const cleanImageFit = (input.imageFit === '' || input.imageFit === null || input.imageFit === undefined) ? 'cover' : input.imageFit
  const cleanImagePosition = (input.imagePosition === '' || input.imagePosition === null || input.imagePosition === undefined) ? 'center' : input.imagePosition

  const data: Record<string, unknown> = {
    title: input.title,
    description: input.description,
    tenantId: cleanTenantId,
    imageUrl: cleanImageUrl,
    linkUrl: cleanLinkUrl,
    ctaLabel: input.ctaLabel,
    ctaAction: cleanCtaAction,
    placement: cleanPlacement,
    startsAt,
    endsAt,
    active: input.active,
    status,
    isSponsored: input.isSponsored,
    sponsoredLabel: input.sponsoredLabel,
    priority: input.priority,
    deviceTarget: cleanDeviceTarget,
    targetAudience: JSON.stringify(input.targetAudience),
    maxWidth: input.maxWidth,
    maxHeight: input.maxHeight,
    minHeight: input.minHeight,
    imageFit: cleanImageFit,
    imagePosition: cleanImagePosition,
    theme: JSON.stringify(input.theme),
    impressionLimit: input.impressionLimit ?? null,
    perVisitorFreq: input.perVisitorFreq,
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
          imageUrl: cleanImageUrl,
          linkUrl: cleanLinkUrl,
          placement: cleanPlacement,
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
