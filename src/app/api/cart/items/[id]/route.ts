import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { resolveTenantByHandle } from '@/lib/tenant'
import { withErrorHandler, parseBody, queryParams } from '@/lib/api'
import { updateCartItemSchema } from '@/lib/validation/schemas'

interface RouteParams { params: Promise<{ id: string }> }

/**
 * PATCH /api/cart/items/[id]?handle=...&sessionKey=...
 *
 * Update quantity (0 removes the item).
 */
export const PATCH = withErrorHandler(async (req, { params }: RouteParams) => {
  const { id } = await params
  const q = queryParams(req)
  const handle = q.get('handle')
  const sessionKey = q.get('sessionKey')
  if (!handle || !sessionKey) {
    return NextResponse.json({ error: 'handle_and_session_required' }, { status: 400 })
  }
  const tenant = await resolveTenantByHandle(handle).catch(() => null)
  if (!tenant) return NextResponse.json({ error: 'storefront_not_found' }, { status: 404 })

  const input = await parseBody(req, updateCartItemSchema)

  // Verify cart item belongs to a cart owned by this tenant + sessionKey
  const item = await prisma.cartItem.findUnique({
    where: { id },
    include: { cart: true, product: true, variant: true },
  })
  if (!item || item.cart.tenantId !== tenant.id || item.cart.sessionKey !== sessionKey) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }

  if (input.quantity === 0) {
    await prisma.cartItem.delete({ where: { id } })
  } else {
    // Check stock
    const stock = item.variant?.stock ?? item.product.stock
    if (item.product.trackStock && stock < input.quantity) {
      return NextResponse.json({ error: 'insufficient_stock', available: stock }, { status: 400 })
    }
    await prisma.cartItem.update({ where: { id }, data: { quantity: input.quantity } })
  }
  return NextResponse.json({ ok: true })
})

/**
 * DELETE /api/cart/items/[id]?handle=...&sessionKey=...
 */
export const DELETE = withErrorHandler(async (req, { params }: RouteParams) => {
  const { id } = await params
  const q = queryParams(req)
  const handle = q.get('handle')
  const sessionKey = q.get('sessionKey')
  if (!handle || !sessionKey) {
    return NextResponse.json({ error: 'handle_and_session_required' }, { status: 400 })
  }
  const tenant = await resolveTenantByHandle(handle).catch(() => null)
  if (!tenant) return NextResponse.json({ error: 'storefront_not_found' }, { status: 404 })

  const item = await prisma.cartItem.findUnique({
    where: { id },
    include: { cart: true },
  })
  if (!item || item.cart.tenantId !== tenant.id || item.cart.sessionKey !== sessionKey) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }
  await prisma.cartItem.delete({ where: { id } })
  return NextResponse.json({ ok: true })
})
