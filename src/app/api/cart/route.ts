import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { resolveTenantByHandle } from '@/lib/tenant'
import { withErrorHandler, queryParams, parseBody } from '@/lib/api'
import { addToCartSchema } from '@/lib/validation/schemas'
import { audit } from '@/lib/audit'

/**
 * Cart API. Carts are scoped to a tenant. Anonymous carts use a sessionKey
 * (returned on first add). Logged-in customers have their carts attached to
 * a Customer record per tenant.
 *
 * All cart operations are tenant-scoped by handle (no auth required to view).
 */

interface CartView {
  cart: {
    id: string
    items: Array<{
      id: string
      productId: string
      productName: string
      productSlug: string
      variantId: string | null
      variantName: string | null
      quantity: number
      unitPrice: number
      lineTotal: number
      stock: number | null
      image: string | null
    }>
    subtotal: number
  } | null
}

async function getOrCreateCart(tenantId: string, sessionKey: string | null, customerId?: string): Promise<{ cart: NonNullable<CartView['cart']>; sessionKey: string; isNew: boolean }> {
  // Look up by sessionKey first
  if (sessionKey) {
    const existing = await prisma.cart.findFirst({
      where: { tenantId, sessionKey },
      include: { items: { include: { product: true, variant: true } } },
    })
    if (existing) {
      return { cart: cartToView(existing), sessionKey, isNew: false }
    }
  }
  const newKey = sessionKey || crypto.randomUUID()
  const cart = await prisma.cart.create({
    data: { tenantId, sessionKey: newKey, customerId: customerId ?? null },
    include: { items: { include: { product: true, variant: true } } },
  })
  return { cart: cartToView(cart), sessionKey: newKey, isNew: true }
}

function cartToView(cart: { id: string; items: Array<{ id: string; productId: string; variantId: string | null; quantity: number; unitPrice: number; product: { name: string; slug: string; stock: number; images?: { url: string }[] }; variant: { name: string; stock: number } | null }> }) {
  const items = cart.items.map((i) => ({
    id: i.id,
    productId: i.productId,
    productName: i.product.name,
    productSlug: i.product.slug,
    variantId: i.variantId,
    variantName: i.variant?.name ?? null,
    quantity: i.quantity,
    unitPrice: i.unitPrice,
    lineTotal: i.unitPrice * i.quantity,
    stock: i.variant?.stock ?? i.product.stock,
    image: i.product.images?.[0]?.url ?? null,
  }))
  return {
    id: cart.id,
    items,
    subtotal: items.reduce((s, i) => s + i.lineTotal, 0),
  }
}

/**
 * GET /api/cart?handle=...&sessionKey=...
 */
export const GET = withErrorHandler(async (req) => {
  const q = queryParams(req)
  const handle = q.get('handle')
  if (!handle) return NextResponse.json({ error: 'handle_required' }, { status: 400 })
  const tenant = await resolveTenantByHandle(handle).catch(() => null)
  if (!tenant) return NextResponse.json({ error: 'storefront_not_found' }, { status: 404 })
  const sessionKey = q.get('sessionKey')
  if (!sessionKey) {
    return NextResponse.json({ cart: null })
  }
  const cart = await prisma.cart.findFirst({
    where: { tenantId: tenant.id, sessionKey },
    include: { items: { include: { product: { include: { images: { orderBy: { sortOrder: 'asc' }, take: 1 } } }, variant: true } } },
  })
  if (!cart) return NextResponse.json({ cart: null })
  const view = cartToView({
    id: cart.id,
    items: cart.items.map((i) => ({
      id: i.id,
      productId: i.productId,
      variantId: i.variantId,
      quantity: i.quantity,
      unitPrice: i.unitPrice,
      product: {
        name: i.product.name,
        slug: i.product.slug,
        stock: i.product.stock,
        images: i.product.images,
      },
      variant: i.variant ? { name: i.variant.name, stock: i.variant.stock } : null,
    })),
  })
  return NextResponse.json({ cart: view })
})

/**
 * POST /api/cart?handle=...&sessionKey=...
 *
 * Body: addToCartSchema
 *
 * Adds an item or increments quantity if same product+variant is in cart.
 */
export const POST = withErrorHandler(async (req) => {
  const q = queryParams(req)
  const handle = q.get('handle')
  if (!handle) return NextResponse.json({ error: 'handle_required' }, { status: 400 })
  const tenant = await resolveTenantByHandle(handle).catch(() => null)
  if (!tenant) return NextResponse.json({ error: 'storefront_not_found' }, { status: 404 })
  const input = await parseBody(req, addToCartSchema)

  // Verify product belongs to this tenant and is ACTIVE
  const product = await prisma.product.findUnique({
    where: { id: input.productId },
    include: { variants: true },
  })
  if (!product || product.tenantId !== tenant.id || product.status !== 'ACTIVE') {
    return NextResponse.json({ error: 'product_not_available' }, { status: 400 })
  }

  // Resolve variant if provided
  let variant: { id: string; stock: number; priceDelta: number; name: string } | null = null
  if (input.variantId) {
    variant = product.variants.find((v) => v.id === input.variantId) ?? null
    if (!variant) {
      return NextResponse.json({ error: 'variant_not_found' }, { status: 400 })
    }
  }

  const sessionKey = q.get('sessionKey') || crypto.randomUUID()
  let cart = await prisma.cart.findFirst({
    where: { tenantId: tenant.id, sessionKey },
    include: { items: true },
  })
  if (!cart) {
    cart = await prisma.cart.create({
      data: { tenantId: tenant.id, sessionKey },
      include: { items: true },
    })
  }

  const unitPrice = product.basePrice + (variant?.priceDelta ?? 0)
  // Check stock
  const stockAvailable = variant ? variant.stock : product.stock
  if (product.trackStock && stockAvailable < input.quantity) {
    return NextResponse.json({ error: 'insufficient_stock', available: stockAvailable }, { status: 400 })
  }

  // Idempotent add: increment if same variant already in cart
  const existingItem = cart.items.find(
    (i) => i.productId === input.productId && i.variantId === (input.variantId ?? null),
  )
  if (existingItem) {
    const newQty = existingItem.quantity + input.quantity
    if (product.trackStock && stockAvailable < newQty) {
      return NextResponse.json({ error: 'insufficient_stock', available: stockAvailable }, { status: 400 })
    }
    await prisma.cartItem.update({
      where: { id: existingItem.id },
      data: { quantity: newQty, unitPrice }, // refresh unit price
    })
  } else {
    await prisma.cartItem.create({
      data: {
        cartId: cart.id,
        productId: input.productId,
        variantId: input.variantId ?? null,
        quantity: input.quantity,
        unitPrice,
      },
    })
  }

  await audit({
    ctx: { user: null, tenant: { id: tenant.id, handle: tenant.handle, displayName: tenant.displayName }, ip: null, userAgent: null },
    action: 'cart.add',
    category: 'UPDATE',
    targetType: 'Product',
    targetId: input.productId,
    metadata: { quantity: input.quantity, variantId: input.variantId },
  })

  // Return refreshed cart
  const refreshed = await prisma.cart.findUnique({
    where: { id: cart.id },
    include: { items: { include: { product: { include: { images: { orderBy: { sortOrder: 'asc' }, take: 1 } } }, variant: true } } },
  })
  return NextResponse.json({
    cart: refreshed ? cartToView({
      id: refreshed.id,
      items: refreshed.items.map((i) => ({
        id: i.id,
        productId: i.productId,
        variantId: i.variantId,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        product: { name: i.product.name, slug: i.product.slug, stock: i.product.stock, images: i.product.images },
        variant: i.variant ? { name: i.variant.name, stock: i.variant.stock } : null,
      })),
    }) : null,
    sessionKey,
  })
})

/**
 * DELETE /api/cart?handle=...&sessionKey=...
 *
 * Clears the entire cart.
 */
export const DELETE = withErrorHandler(async (req) => {
  const q = queryParams(req)
  const handle = q.get('handle')
  const sessionKey = q.get('sessionKey')
  if (!handle || !sessionKey) {
    return NextResponse.json({ error: 'handle_and_session_required' }, { status: 400 })
  }
  const tenant = await resolveTenantByHandle(handle).catch(() => null)
  if (!tenant) return NextResponse.json({ error: 'storefront_not_found' }, { status: 404 })
  await prisma.cart.deleteMany({ where: { tenantId: tenant.id, sessionKey } })
  return NextResponse.json({ ok: true })
})
