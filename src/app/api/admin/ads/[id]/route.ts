import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getRequestContext, requirePlatformOperator } from '@/lib/session'
import { withErrorHandler, parseBody } from '@/lib/api'
import { z } from 'zod'
import { audit } from '@/lib/audit'

interface RouteParams { params: Promise<{ id: string }> }

const VALID_PLACEMENTS = ['top_banner', 'featured_business', 'marketplace_feed', 'category_page', 'search_results', 'storefront', 'popup']
const VALID_STATUSES = ['draft', 'scheduled', 'active', 'paused', 'expired', 'archived']
const VALID_CTA_ACTIONS = ['visit_store', 'shop_now', 'contact_business', 'view_offer', 'learn_more', 'custom']
const VALID_DEVICE_TARGETS = ['all', 'mobile', 'tablet', 'desktop']
const VALID_IMAGE_FITS = ['contain', 'cover', 'fill']
const VALID_IMAGE_POSITIONS = ['center', 'top', 'bottom', 'left', 'right']

// Accept URL, empty string, null, or undefined
const optionalUrl = z.union([
  z.string().url().refine(url => url.startsWith('http://') || url.startsWith('https://'), 'URL must use http or https'),
  z.literal(''),
  z.null(),
  z.undefined(),
])

// Accept datetime, empty, null, or undefined
const optionalDatetime = z.union([
  z.string().datetime(),
  z.literal(''),
  z.null(),
  z.undefined(),
])

// Accept enum value, empty, null, or undefined
const optionalEnum = (allowed: string[]) => z.union([
  z.enum(allowed as [string, ...string[]]),
  z.literal(''),
  z.null(),
  z.undefined(),
])

// Accept array of strings, OR a JSON string that can be parsed to an array, OR empty/null/undefined
const flexibleStringArray = z.union([
  z.array(z.string()),
  z.string().transform(s => { try { return JSON.parse(s) } catch { return ['customer'] } }),
  z.null(),
  z.undefined(),
])

// Accept cuid, any string (external advertiser), null, undefined, empty, "none"
const flexibleTenantId = z.union([
  z.string().cuid(),
  z.string().min(1).max(100),
  z.literal(''),
  z.literal('none'),
  z.null(),
  z.undefined(),
])

const patchSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().min(1).max(1000).optional(),
  tenantId: flexibleTenantId.optional(),
  imageUrl: optionalUrl.optional(),
  linkUrl: optionalUrl.optional(),
  ctaLabel: z.string().max(50).optional(),
  ctaAction: optionalEnum(VALID_CTA_ACTIONS).optional(),
  placement: optionalEnum(VALID_PLACEMENTS).optional(),
  startsAt: optionalDatetime.optional(),
  endsAt: optionalDatetime.optional(),
  active: z.boolean().optional(),
  status: optionalEnum(VALID_STATUSES).optional(),
  isSponsored: z.boolean().optional(),
  sponsoredLabel: z.string().max(50).optional(),
  priority: z.number().int().min(0).max(1000).optional(),
  deviceTarget: optionalEnum(VALID_DEVICE_TARGETS).optional(),
  targetAudience: flexibleStringArray.optional(),
  maxWidth: z.number().int().min(200).max(3840).optional(),
  maxHeight: z.number().int().min(40).max(600).optional(),
  minHeight: z.number().int().min(40).max(600).optional(),
  imageFit: optionalEnum(VALID_IMAGE_FITS).optional(),
  imagePosition: optionalEnum(VALID_IMAGE_POSITIONS).optional(),
  theme: z.record(z.string(), z.unknown()).optional(),
  impressionLimit: z.number().int().min(1).optional().nullable(),
  perVisitorFreq: z.number().int().min(0).max(100).optional(),
})

export const PATCH = withErrorHandler(async (req, { params }: RouteParams) => {
  const ctx = await getRequestContext(req)
  requirePlatformOperator(ctx)
  const { id } = await params
  const input = await parseBody(req, patchSchema)

  const existing = await prisma.advertisement.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  // Handle status transitions — including unarchive
  let newStatus: string | undefined
  if (input.status && input.status !== '') {
    newStatus = input.status
  } else if (input.active !== undefined) {
    if (input.active) {
      // Resuming: if currently archived, move to draft; if paused, move to active
      newStatus = existing.status === 'archived' ? 'draft' : (existing.startsAt > new Date() ? 'scheduled' : 'active')
    } else {
      newStatus = existing.status === 'archived' ? 'archived' : 'paused'
    }
  }

  const data: Record<string, unknown> = {}

  if (input.title) data.title = input.title
  if (input.description) data.description = input.description
  if (input.tenantId !== undefined) {
    data.tenantId = (input.tenantId === '' || input.tenantId === 'none' || input.tenantId === null) ? null : input.tenantId
  }
  if (input.imageUrl !== undefined) {
    data.imageUrl = (input.imageUrl === '' || input.imageUrl === null) ? null : input.imageUrl
  }
  if (input.linkUrl !== undefined) {
    data.linkUrl = (input.linkUrl === '' || input.linkUrl === null) ? null : input.linkUrl
  }
  if (input.ctaLabel) data.ctaLabel = input.ctaLabel
  if (input.ctaAction && input.ctaAction !== '') data.ctaAction = input.ctaAction
  if (input.placement && input.placement !== '') data.placement = input.placement
  if (input.startsAt && input.startsAt !== '') data.startsAt = new Date(input.startsAt)
  if (input.endsAt !== undefined) {
    data.endsAt = (input.endsAt === '' || input.endsAt === null) ? null : new Date(input.endsAt as string)
  }
  if (input.active !== undefined) data.active = input.active
  if (newStatus) data.status = newStatus
  if (input.isSponsored !== undefined) data.isSponsored = input.isSponsored
  if (input.sponsoredLabel) data.sponsoredLabel = input.sponsoredLabel
  if (input.priority !== undefined) data.priority = input.priority
  if (input.deviceTarget && input.deviceTarget !== '') data.deviceTarget = input.deviceTarget
  // targetAudience: ensure it's always stored as a JSON string
  if (input.targetAudience !== undefined) {
    const arr = Array.isArray(input.targetAudience) ? input.targetAudience : ['customer']
    data.targetAudience = JSON.stringify(arr)
  }
  if (input.maxWidth !== undefined) data.maxWidth = input.maxWidth
  if (input.maxHeight !== undefined) data.maxHeight = input.maxHeight
  if (input.minHeight !== undefined) data.minHeight = input.minHeight
  if (input.imageFit && input.imageFit !== '') data.imageFit = input.imageFit
  if (input.imagePosition && input.imagePosition !== '') data.imagePosition = input.imagePosition
  if (input.theme) data.theme = JSON.stringify(input.theme)
  if (input.impressionLimit !== undefined) data.impressionLimit = input.impressionLimit
  if (input.perVisitorFreq !== undefined) data.perVisitorFreq = input.perVisitorFreq

  const ad = await prisma.advertisement.update({ where: { id }, data })

  await audit({
    ctx,
    action: 'ad.update',
    category: 'UPDATE',
    targetType: 'Advertisement',
    targetId: id,
    metadata: { fields: Object.keys(data), status: ad.status },
  })

  return NextResponse.json({ ad })
})

export const DELETE = withErrorHandler(async (req, { params }: RouteParams) => {
  const ctx = await getRequestContext(req)
  requirePlatformOperator(ctx)
  const { id } = await params
  await prisma.advertisement.delete({ where: { id } })
  await audit({ ctx, action: 'ad.delete', category: 'DELETE', targetType: 'Advertisement', targetId: id })
  return NextResponse.json({ ok: true })
})
