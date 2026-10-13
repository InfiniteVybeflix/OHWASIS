import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getRequestContext, requireTenantMembership, requireMinRole } from '@/lib/session'
import { assertTenantOwns } from '@/lib/tenant'
import { withErrorHandler, parseBody } from '@/lib/api'
import { z } from 'zod'
import { audit } from '@/lib/audit'

interface RouteParams { params: Promise<{ id: string }> }

const replySchema = z.object({
  ownerReply: z.string().min(1).max(1000),
})

/**
 * POST /api/reviews/[id]/reply  (POST method on /api/reviews/[id])
 *
 * Business owner replies to a review. Only members of the same tenant as the
 * review can reply.
 *
 * Body: { ownerReply }
 */
export const POST = withErrorHandler(async (req, { params }: RouteParams) => {
  const ctx = await getRequestContext(req)
  const { tenant } = requireTenantMembership(ctx)
  requireMinRole(ctx, 'ORDER_MANAGER') // any staff role can reply
  const { id } = await params
  const review = await prisma.review.findUnique({ where: { id } })
  assertTenantOwns(review, tenant.id, 'review')
  const input = await parseBody(req, replySchema)
  const updated = await prisma.review.update({
    where: { id },
    data: { ownerReply: input.ownerReply, ownerReplyAt: new Date() },
  })
  await audit({
    ctx,
    action: 'review.reply',
    category: 'UPDATE',
    targetType: 'Review',
    targetId: id,
    metadata: { rating: review!.rating, targetType: review!.targetType },
  })
  return NextResponse.json({ review: updated })
})

/**
 * PATCH /api/reviews/[id]
 *
 * Customer updates their own review, OR business owner toggles moderation status.
 */
const patchSchema = z.object({
  rating: z.number().int().min(1).max(5).optional(),
  title: z.string().max(120).optional(),
  body: z.string().max(2000).optional(),
  // Owner-only: moderation status
  status: z.enum(['APPROVED', 'PENDING', 'HIDDEN']).optional(),
})

export const PATCH = withErrorHandler(async (req, { params }: RouteParams) => {
  const ctx = await getRequestContext(req)
  const { id } = await params
  const review = await prisma.review.findUnique({ where: { id } })
  if (!review) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const input = await parseBody(req, patchSchema)

  // If the caller is the review's author, allow editing content
  if (ctx.user?.id === review.userId) {
    const updated = await prisma.review.update({
      where: { id },
      data: {
        ...(input.rating && { rating: input.rating }),
        ...(input.title !== undefined && { title: input.title }),
        ...(input.body !== undefined && { body: input.body }),
      },
    })
    return NextResponse.json({ review: updated })
  }

  // Otherwise, must be a tenant member with admin rights (for moderation)
  if (ctx.membership && review.tenantId === ctx.tenant?.id) {
    requireMinRole(ctx, 'ADMINISTRATOR')
    if (!input.status) return NextResponse.json({ error: 'status_required' }, { status: 400 })
    const updated = await prisma.review.update({
      where: { id },
      data: { status: input.status },
    })
    await audit({
      ctx,
      action: `review.${input.status.toLowerCase()}`,
      category: 'MODERATION',
      targetType: 'Review',
      targetId: id,
    })
    return NextResponse.json({ review: updated })
  }

  return NextResponse.json({ error: 'forbidden' }, { status: 403 })
})

/**
 * DELETE /api/reviews/[id]
 * Author can delete their own review. Tenant admins can also remove.
 */
export const DELETE = withErrorHandler(async (req, { params }: RouteParams) => {
  const ctx = await getRequestContext(req)
  const { id } = await params
  const review = await prisma.review.findUnique({ where: { id } })
  if (!review) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  if (ctx.user?.id === review.userId || (ctx.membership && review.tenantId === ctx.tenant?.id && ctx.membership.role === 'OWNER')) {
    await prisma.review.delete({ where: { id } })
    await audit({
      ctx,
      action: 'review.delete',
      category: 'DELETE',
      targetType: 'Review',
      targetId: id,
    })
    return NextResponse.json({ ok: true })
  }
  return NextResponse.json({ error: 'forbidden' }, { status: 403 })
})
