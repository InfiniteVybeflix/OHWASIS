import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getRequestContext, requireCustomer } from '@/lib/session'
import { withErrorHandler, queryParams } from '@/lib/api'
import { z } from 'zod'

/**
 * GET /api/customer/wishlist
 * Returns the customer's wishlist (across all shops), with product details.
 */
export const GET = withErrorHandler(async (req) => {
  const ctx = await getRequestContext(req)
  const user = requireCustomer(ctx)
  const items = await prisma.wishlistItem.findMany({
    where: { userId: user.id },
    include: {
      product: { include: { images: { take: 1, orderBy: { sortOrder: 'asc' } } } },
      tenant: { select: { id: true, handle: true, displayName: true } },
    },
    orderBy: { createdAt: 'desc' },
  })
  return NextResponse.json({
    items: items.map((i) => ({
      id: i.id,
      productId: i.productId,
      variantId: i.variantId,
      productName: i.product.name,
      productSlug: i.product.slug,
      productPrice: i.product.basePrice,
      currency: i.product.currency,
      productImage: i.product.images[0]?.url ?? null,
      tenant: i.tenant,
      createdAt: i.createdAt,
    })),
    count: items.length,
  })
})

const addSchema = z.object({
  productId: z.string().cuid(),
  tenantHandle: z.string().min(3).max(32),
  variantId: z.string().cuid().optional(),
})

/**
 * POST /api/customer/wishlist
 * Add a product to the wishlist. Idempotent (unique constraint on userId+productId).
 */
export const POST = withErrorHandler(async (req) => {
  const ctx = await getRequestContext(req)
  const user = requireCustomer(ctx)
  const input = await req.json().catch(() => ({})) as { productId?: string; tenantHandle?: string; variantId?: string }
  const parsed = addSchema.parse(input)

  // Resolve tenant
  const tenant = await prisma.tenant.findUnique({ where: { handle: parsed.tenantHandle } })
  if (!tenant || tenant.status !== 'ACTIVE') {
    return NextResponse.json({ error: 'tenant_not_found' }, { status: 404 })
  }
  // Verify product belongs to this tenant
  const product = await prisma.product.findUnique({ where: { id: parsed.productId } })
  if (!product || product.tenantId !== tenant.id) {
    return NextResponse.json({ error: 'product_not_found' }, { status: 404 })
  }

  try {
    const item = await prisma.wishlistItem.create({
      data: {
        userId: user.id,
        tenantId: tenant.id,
        productId: parsed.productId,
        variantId: parsed.variantId ?? null,
      },
    })
    // Update localStorage count via response (client reads count)
    return NextResponse.json({ item, ok: true }, { status: 201 })
  } catch (err) {
    if ((err as { code?: string }).code === 'P2002') {
      return NextResponse.json({ error: 'already_in_wishlist', message: 'Already in your wishlist' }, { status: 409 })
    }
    throw err
  }
})

/**
 * DELETE /api/customer/wishlist?productId=...
 */
export const DELETE = withErrorHandler(async (req) => {
  const ctx = await getRequestContext(req)
  const user = requireCustomer(ctx)
  const q = queryParams(req)
  const productId = q.get('productId')
  if (!productId) return NextResponse.json({ error: 'productId_required' }, { status: 400 })
  await prisma.wishlistItem.deleteMany({ where: { userId: user.id, productId } })
  return NextResponse.json({ ok: true })
})

void z // reserved for future validation
