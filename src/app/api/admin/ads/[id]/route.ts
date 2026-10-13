import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getRequestContext, requirePlatformOperator } from '@/lib/session'
import { withErrorHandler, parseBody } from '@/lib/api'
import { z } from 'zod'

interface RouteParams { params: Promise<{ id: string }> }

const patchSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(1000).optional(),
  imageUrl: z.string().url().optional().nullable(),
  linkUrl: z.string().url().optional().nullable(),
  placement: z.enum(['splash', 'top_banner']).optional(),
  active: z.boolean().optional(),
  startsAt: z.string().datetime().optional(),
  endsAt: z.string().datetime().optional().nullable(),
  targetAudience: z.array(z.string()).optional(),
})

export const PATCH = withErrorHandler(async (req, { params }: RouteParams) => {
  const ctx = await getRequestContext(req)
  requirePlatformOperator(ctx)
  const { id } = await params
  const input = await parseBody(req, patchSchema)
  const ad = await prisma.advertisement.update({
    where: { id },
    data: {
      ...(input.title && { title: input.title }),
      ...(input.description !== undefined && { description: input.description }),
      ...(input.imageUrl !== undefined && { imageUrl: input.imageUrl }),
      ...(input.linkUrl !== undefined && { linkUrl: input.linkUrl }),
      ...(input.placement && { placement: input.placement }),
      ...(input.active !== undefined && { active: input.active }),
      ...(input.startsAt && { startsAt: new Date(input.startsAt) }),
      ...(input.endsAt !== undefined && { endsAt: input.endsAt ? new Date(input.endsAt) : null }),
      ...(input.targetAudience && { targetAudience: JSON.stringify(input.targetAudience) }),
    },
  })
  return NextResponse.json({ ad })
})

export const DELETE = withErrorHandler(async (req, { params }: RouteParams) => {
  const ctx = await getRequestContext(req)
  requirePlatformOperator(ctx)
  const { id } = await params
  await prisma.advertisement.delete({ where: { id } })
  return NextResponse.json({ ok: true })
})
