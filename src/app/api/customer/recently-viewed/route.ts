import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getRequestContext, requireCustomer } from '@/lib/session'
import { withErrorHandler, parseBody } from '@/lib/api'
import { z } from 'zod'
import { audit } from '@/lib/audit'

/**
 * GET /api/customer/recently-viewed?limit=20
 * Returns the customer's recently viewed products (newest first).
 */
export const GET = withErrorHandler(async (req) => {
  const ctx = await getRequestContext(req)
  const user = requireCustomer(ctx)
  const url = new URL(req.url)
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get('limit') ?? '20')))
  const items = await prisma.recentlyViewed.findMany({
    where: { userId: user.id },
    include: {
      product: { include: { images: { take: 1, orderBy: { sortOrder: 'asc' } } } },
      tenant: { select: { id: true, handle: true, displayName: true } },
    },
    orderBy: { viewedAt: 'desc' },
    take: limit,
  })
  return NextResponse.json({
    items: items.map((i) => ({
      productId: i.productId,
      productName: i.product.name,
      productSlug: i.product.slug,
      productPrice: i.product.basePrice,
      currency: i.product.currency,
      productImage: i.product.images[0]?.url ?? null,
      tenant: i.tenant,
      viewedAt: i.viewedAt,
    })),
  })
})

const trackSchema = z.object({
  productId: z.string().cuid(),
  tenantHandle: z.string().min(3).max(32),
})

/**
 * POST /api/customer/recently-viewed
 * Track that the customer viewed a product. Idempotent — if the product is
 * already in the recently-viewed list, it just updates viewedAt.
 * Keeps last 20 per customer (older entries are auto-pruned).
 */
export const POST = withErrorHandler(async (req) => {
  const ctx = await getRequestContext(req)
  const user = requireCustomer(ctx)
  const input = await parseBody(req, trackSchema)
  const tenant = await prisma.tenant.findUnique({ where: { handle: input.tenantHandle } })
  if (!tenant) return NextResponse.json({ error: 'tenant_not_found' }, { status: 404 })
  const product = await prisma.product.findUnique({ where: { id: input.productId } })
  if (!product || product.tenantId !== tenant.id) {
    return NextResponse.json({ error: 'product_not_found' }, { status: 404 })
  }

  // Upsert: if exists, update viewedAt; else create
  const existing = await prisma.recentlyViewed.findFirst({
    where: { userId: user.id, productId: input.productId },
  })
  if (existing) {
    await prisma.recentlyViewed.update({ where: { id: existing.id }, data: { viewedAt: new Date() } })
  } else {
    await prisma.recentlyViewed.create({
      data: {
        userId: user.id,
        tenantId: tenant.id,
        productId: input.productId,
      },
    })
    // Prune to last 20
    const all = await prisma.recentlyViewed.findMany({
      where: { userId: user.id },
      orderBy: { viewedAt: 'desc' },
      select: { id: true },
      take: 21, // fetch 21 so we know there's at least 1 extra to prune
    })
    if (all.length > 20) {
      const toDelete = all.slice(20).map((r) => r.id)
      await prisma.recentlyViewed.deleteMany({ where: { id: { in: toDelete } } })
    }
  }

  void audit
  return NextResponse.json({ ok: true })
})
