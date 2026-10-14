import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getRequestContext, requirePlatformOperator } from '@/lib/session'
import { withErrorHandler, parseBody } from '@/lib/api'
import { z } from 'zod'
import { audit } from '@/lib/audit'

interface RouteParams { params: Promise<{ id: string }> }

const CTA_ACTIONS = ['visit_store', 'shop_now', 'contact_business', 'view_offer', 'learn_more', 'custom']
const PLACEMENTS = ['top_banner', 'featured_business', 'marketplace_feed', 'category_page', 'search_results', 'storefront', 'popup']
const DEVICE_TARGETS = ['all', 'mobile', 'tablet', 'desktop']
const IMAGE_FITS = ['contain', 'cover', 'fill']
const IMAGE_POSITIONS = ['center', 'top', 'bottom', 'left', 'right']

const patchSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().min(1).max(1000).optional(),
  tenantId: z.string().cuid().optional().nullable(),
  imageUrl: z.string().url().optional().nullable(),
  linkUrl: z.string().url().optional().nullable(),
  ctaLabel: z.string().max(50).optional(),
  ctaAction: z.enum(CTA_ACTIONS as [string, ...string[]]).optional(),
  placement: z.enum(PLACEMENTS as [string, ...string[]]).optional(),
  startsAt: z.string().datetime().optional(),
  endsAt: z.string().datetime().optional().nullable(),
  active: z.boolean().optional(),
  status: z.enum(['draft', 'scheduled', 'active', 'paused', 'expired', 'archived']).optional(),
  isSponsored: z.boolean().optional(),
  sponsoredLabel: z.string().max(50).optional(),
  priority: z.number().int().min(0).max(1000).optional(),
  deviceTarget: z.enum(DEVICE_TARGETS as [string, ...string[]]).optional(),
  targetAudience: z.array(z.string()).optional(),
  maxWidth: z.number().int().min(200).max(3840).optional(),
  maxHeight: z.number().int().min(40).max(600).optional(),
  minHeight: z.number().int().min(40).max(600).optional(),
  imageFit: z.enum(IMAGE_FITS as [string, ...string[]]).optional(),
  imagePosition: z.enum(IMAGE_POSITIONS as [string, ...string[]]).optional(),
  theme: z.record(z.string(), z.unknown()).optional(),
  impressionLimit: z.number().int().min(1).optional().nullable(),
  perVisitorFreq: z.number().int().min(0).max(100).optional(),
})

/**
 * PATCH /api/admin/ads/[id]
 * Update an advertisement. Supports all fields.
 */
export const PATCH = withErrorHandler(async (req, { params }: RouteParams) => {
  const ctx = await getRequestContext(req)
  requirePlatformOperator(ctx)
  const { id } = await params
  const input = await parseBody(req, patchSchema)

  const existing = await prisma.advertisement.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  // Handle status transitions
  let newStatus = input.status
  if (input.active !== undefined && !input.status) {
    if (input.active) {
      newStatus = existing.startsAt > new Date() ? 'scheduled' : 'active'
    } else {
      newStatus = 'paused'
    }
  }

  const ad = await prisma.advertisement.update({
    where: { id },
    data: {
      ...(input.title && { title: input.title }),
      ...(input.description && { description: input.description }),
      ...(input.tenantId !== undefined && { tenantId: input.tenantId }),
      ...(input.imageUrl !== undefined && { imageUrl: input.imageUrl }),
      ...(input.linkUrl !== undefined && { linkUrl: input.linkUrl }),
      ...(input.ctaLabel && { ctaLabel: input.ctaLabel }),
      ...(input.ctaAction && { ctaAction: input.ctaAction }),
      ...(input.placement && { placement: input.placement }),
      ...(input.startsAt && { startsAt: new Date(input.startsAt) }),
      ...(input.endsAt !== undefined && { endsAt: input.endsAt ? new Date(input.endsAt) : null }),
      ...(input.active !== undefined && { active: input.active }),
      ...(newStatus && { status: newStatus }),
      ...(input.isSponsored !== undefined && { isSponsored: input.isSponsored }),
      ...(input.sponsoredLabel && { sponsoredLabel: input.sponsoredLabel }),
      ...(input.priority !== undefined && { priority: input.priority }),
      ...(input.deviceTarget && { deviceTarget: input.deviceTarget }),
      ...(input.targetAudience && { targetAudience: JSON.stringify(input.targetAudience) }),
      ...(input.maxWidth && { maxWidth: input.maxWidth }),
      ...(input.maxHeight && { maxHeight: input.maxHeight }),
      ...(input.minHeight && { minHeight: input.minHeight }),
      ...(input.imageFit && { imageFit: input.imageFit }),
      ...(input.imagePosition && { imagePosition: input.imagePosition }),
      ...(input.theme && { theme: JSON.stringify(input.theme) }),
      ...(input.impressionLimit !== undefined && { impressionLimit: input.impressionLimit }),
      ...(input.perVisitorFreq !== undefined && { perVisitorFreq: input.perVisitorFreq }),
    },
  })

  await audit({
    ctx,
    action: 'ad.update',
    category: 'UPDATE',
    targetType: 'Advertisement',
    targetId: id,
    metadata: { fields: Object.keys(input), status: ad.status },
  })

  return NextResponse.json({ ad })
})

/**
 * DELETE /api/admin/ads/[id]
 */
export const DELETE = withErrorHandler(async (req, { params }: RouteParams) => {
  const ctx = await getRequestContext(req)
  requirePlatformOperator(ctx)
  const { id } = await params
  await prisma.advertisement.delete({ where: { id } })
  await audit({
    ctx,
    action: 'ad.delete',
    category: 'DELETE',
    targetType: 'Advertisement',
    targetId: id,
  })
  return NextResponse.json({ ok: true })
})
