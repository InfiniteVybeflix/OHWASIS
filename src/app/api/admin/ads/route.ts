import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getRequestContext, requirePlatformOperator } from '@/lib/session'
import { withErrorHandler, parseBody } from '@/lib/api'
import { z } from 'zod'

/**
 * GET /api/admin/ads
 * Admin: list all advertisements.
 */
export const GET = withErrorHandler(async (req) => {
  const ctx = await getRequestContext(req)
  requirePlatformOperator(ctx)
  const ads = await prisma.advertisement.findMany({ orderBy: { createdAt: 'desc' } })
  return NextResponse.json({ ads })
})

const adSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  imageUrl: z.string().url().optional(),
  linkUrl: z.string().url().optional(),
  placement: z.enum(['splash', 'top_banner']).default('top_banner'),
  startsAt: z.string().datetime().optional(),
  endsAt: z.string().datetime().optional(),
  active: z.boolean().default(false),
  targetAudience: z.array(z.string()).default(['customer']),
})

/**
 * POST /api/admin/ads
 * Admin: create a new advertisement.
 */
export const POST = withErrorHandler(async (req) => {
  const ctx = await getRequestContext(req)
  requirePlatformOperator(ctx)
  const input = await parseBody(req, adSchema)
  const ad = await prisma.advertisement.create({
    data: {
      title: input.title,
      description: input.description ?? null,
      imageUrl: input.imageUrl ?? null,
      linkUrl: input.linkUrl ?? null,
      placement: input.placement,
      startsAt: input.startsAt ? new Date(input.startsAt) : new Date(),
      endsAt: input.endsAt ? new Date(input.endsAt) : null,
      active: input.active,
      targetAudience: JSON.stringify(input.targetAudience),
    },
  })
  return NextResponse.json({ ad }, { status: 201 })
})
