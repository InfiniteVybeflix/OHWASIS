import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getRequestContext, requireTenantMembership, requireMinRole } from '@/lib/session'
import { assertTenantOwns } from '@/lib/tenant'
import { withErrorHandler, parseBody } from '@/lib/api'
import { productSchema } from '@/lib/validation/schemas'
import { audit } from '@/lib/audit'

interface RouteParams { params: Promise<{ id: string }> }

export const GET = withErrorHandler(async (req, { params }: RouteParams) => {
  const ctx = await getRequestContext(req)
  const { tenant } = requireTenantMembership(ctx)
  const { id } = await params
  const product = await prisma.product.findUnique({
    where: { id },
    include: {
      variants: true,
      images: { orderBy: { sortOrder: 'asc' } },
      category: true,
    },
  })
  // Cross-tenant ID substitution check
  assertTenantOwns(product, tenant.id, 'product')
  return NextResponse.json({ product })
})

export const PUT = withErrorHandler(async (req, { params }: RouteParams) => {
  const ctx = await getRequestContext(req)
  const { tenant } = requireTenantMembership(ctx)
  requireMinRole(ctx, 'CATALOG_MANAGER')
  const { id } = await params
  const input = await parseBody(req, productSchema.partial())

  const existing = await prisma.product.findUnique({ where: { id } })
  assertTenantOwns(existing, tenant.id, 'product')

  if (input.categoryId) {
    const cat = await prisma.category.findUnique({ where: { id: input.categoryId } })
    if (!cat || cat.tenantId !== tenant.id) {
      return NextResponse.json({ error: 'invalid_category' }, { status: 400 })
    }
  }

  const product = await prisma.product.update({
    where: { id },
    data: {
      ...(input.name && { name: input.name }),
      ...(input.slug && { slug: input.slug }),
      ...(input.description !== undefined && { description: input.description }),
      ...(input.categoryId !== undefined && { categoryId: input.categoryId ?? null }),
      ...(input.basePrice !== undefined && { basePrice: input.basePrice }),
      ...(input.currency && { currency: input.currency }),
      ...(input.sku !== undefined && { sku: input.sku ?? null }),
      ...(input.barcode !== undefined && { barcode: input.barcode ?? null }),
      ...(input.stock !== undefined && { stock: input.stock }),
      ...(input.trackStock !== undefined && { trackStock: input.trackStock }),
      ...(input.trackStockOnVariant !== undefined && { trackStockOnVariant: input.trackStockOnVariant }),
      ...(input.status && { status: input.status }),
      ...(input.attributes !== undefined && { attributes: JSON.stringify(input.attributes) }),
    },
    include: { variants: true },
  })

  await audit({
    ctx,
    action: 'product.update',
    category: 'UPDATE',
    targetType: 'Product',
    targetId: product.id,
    metadata: { fields: Object.keys(input) },
  })

  return NextResponse.json({ product })
})

export const DELETE = withErrorHandler(async (req, { params }: RouteParams) => {
  const ctx = await getRequestContext(req)
  const { tenant } = requireTenantMembership(ctx)
  requireMinRole(ctx, 'CATALOG_MANAGER')
  const { id } = await params
  const existing = await prisma.product.findUnique({ where: { id } })
  assertTenantOwns(existing, tenant.id, 'product')
  // Soft-delete: archive, do not actually destroy records (orders may reference
  // historical snapshots, so we keep the row).
  const product = await prisma.product.update({
    where: { id },
    data: { status: 'ARCHIVED' },
  })
  await audit({
    ctx,
    action: 'product.archive',
    category: 'DELETE',
    targetType: 'Product',
    targetId: product.id,
  })
  return NextResponse.json({ ok: true })
})
