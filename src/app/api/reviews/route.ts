import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { resolveTenantByHandle } from '@/lib/tenant'
import { getRequestContext, requireCustomer } from '@/lib/session'
import { withErrorHandler, parseBody, queryParams } from '@/lib/api'
import { z } from 'zod'
import { audit } from '@/lib/audit'

/**
 * GET /api/reviews?handle=<tenant>&targetType=SHOP|PRODUCT&productId=...
 *
 * PUBLIC endpoint — returns published reviews for a shop or product.
 */
export const GET = withErrorHandler(async (req) => {
  const q = queryParams(req)
  const handle = q.get('handle')
  if (!handle) return NextResponse.json({ error: 'handle_required' }, { status: 400 })
  const tenant = await resolveTenantByHandle(handle).catch(() => null)
  if (!tenant) return NextResponse.json({ error: 'tenant_not_found' }, { status: 404 })

  const targetType = q.get('targetType') ?? 'SHOP'
  const productId = q.get('productId') ?? undefined

  const reviews = await prisma.review.findMany({
    where: {
      tenantId: tenant.id,
      targetType,
      ...(productId ? { productId } : {}),
      status: 'APPROVED',
    },
    include: {
      user: { select: { name: true, avatarUrl: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  })

  // Compute average rating
  const avg = reviews.length === 0 ? 0 : reviews.reduce((s, r) => s + r.rating, 0) / reviews.length

  return NextResponse.json({
    reviews: reviews.map((r) => ({
      id: r.id,
      rating: r.rating,
      title: r.title,
      body: r.body,
      ownerReply: r.ownerReply,
      ownerReplyAt: r.ownerReplyAt,
      createdAt: r.createdAt,
      user: {
        name: r.user.name ?? 'Anonymous',
        avatarUrl: r.user.avatarUrl,
      },
    })),
    averageRating: avg,
    count: reviews.length,
  })
})

const reviewSchema = z.object({
  handle: z.string().min(3).max(32),
  targetType: z.enum(['SHOP', 'PRODUCT']),
  productId: z.string().cuid().optional(),
  rating: z.number().int().min(1).max(5),
  title: z.string().max(120).optional(),
  body: z.string().max(2000).optional(),
})

/**
 * POST /api/reviews
 *
 * Customer creates a review. Requires auth (CUSTOMER role).
 * One review per (user, target) — duplicate prevention via unique constraint.
 */
export const POST = withErrorHandler(async (req) => {
  const ctx = await getRequestContext(req)
  const user = requireCustomer(ctx)
  const input = await parseBody(req, reviewSchema)

  // Verify tenant exists
  const tenant = await resolveTenantByHandle(input.handle).catch(() => null)
  if (!tenant) return NextResponse.json({ error: 'tenant_not_found' }, { status: 404 })

  // If reviewing a product, verify it belongs to this tenant
  if (input.targetType === 'PRODUCT') {
    if (!input.productId) return NextResponse.json({ error: 'productId_required' }, { status: 400 })
    const product = await prisma.product.findUnique({ where: { id: input.productId } })
    if (!product || product.tenantId !== tenant.id) {
      return NextResponse.json({ error: 'product_not_found' }, { status: 404 })
    }
  }

  // Create the review (unique constraint prevents duplicates)
  try {
    const review = await prisma.review.create({
      data: {
        tenantId: tenant.id,
        userId: user.id,
        targetType: input.targetType,
        productId: input.targetType === 'PRODUCT' ? input.productId : null,
        rating: input.rating,
        title: input.title ?? null,
        body: input.body ?? null,
        status: 'APPROVED', // auto-approve; could be PENDING for moderation
      },
    })
    await audit({
      ctx,
      action: 'review.create',
      category: 'CREATE',
      targetType: 'Review',
      targetId: review.id,
      metadata: { tenantHandle: input.handle, reviewType: input.targetType, rating: input.rating },
    })
    return NextResponse.json({ review }, { status: 201 })
  } catch (err) {
    // Unique constraint violation = duplicate review
    if ((err as { code?: string }).code === 'P2002') {
      return NextResponse.json({ error: 'already_reviewed', message: 'You have already reviewed this. Edit your existing review instead.' }, { status: 409 })
    }
    throw err
  }
})
