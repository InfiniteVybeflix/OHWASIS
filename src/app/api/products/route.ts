import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getRequestContext, requireTenantMembership, requireMinRole, requireVerifiedEmailAsync } from '@/lib/session'
import { tenantScoped } from '@/lib/tenant'
import { withErrorHandler, parseBody, queryParams } from '@/lib/api'
import { productSchema } from '@/lib/validation/schemas'
import { audit } from '@/lib/audit'

/**
 * GET /api/products?status=&categoryId=&q=&page=&pageSize=
 *
 * Always scoped to the resolved tenant. Pagination is bounded (max 100/page).
 */
export const GET = withErrorHandler(async (req) => {
  const ctx = await getRequestContext(req)
  const { tenant } = requireTenantMembership(ctx)
  const q = queryParams(req)
  const page = Math.max(1, Number(q.get('page') ?? '1'))
  const pageSize = Math.min(100, Math.max(1, Number(q.get('pageSize') ?? '20')))
  const status = q.get('status') ?? undefined
  const categoryId = q.get('categoryId') ?? undefined
  const search = q.get('q') ?? undefined

  const where = {
    ...tenantScoped(tenant.id),
    ...(status ? { status: status as 'DRAFT' | 'ACTIVE' | 'ARCHIVED' } : {}),
    ...(categoryId ? { categoryId } : {}),
    ...(search ? { name: { contains: search } } : {}),
  }

  const [items, total] = await Promise.all([
    prisma.product.findMany({
      where,
      include: {
        variants: true,
        images: { orderBy: { sortOrder: 'asc' } },
        category: { select: { id: true, name: true, slug: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.product.count({ where }),
  ])

  return NextResponse.json({ items, total, page, pageSize })
})

/**
 * POST /api/products — create a product in the resolved tenant.
 * Requires CATALOG_MANAGER or higher.
 */
export const POST = withErrorHandler(async (req) => {
  const ctx = await getRequestContext(req)
  // Sensitive write — gate on email verification (platform operators exempt).
  await requireVerifiedEmailAsync(ctx)
  const { tenant } = requireTenantMembership(ctx)
  requireMinRole(ctx, 'CATALOG_MANAGER')
  const input = await parseBody(req, productSchema)

  // Slug uniqueness inside this tenant
  const existing = await prisma.product.findFirst({
    where: { ...tenantScoped(tenant.id), slug: input.slug },
  })
  if (existing) {
    return NextResponse.json({ error: 'slug_taken' }, { status: 409 })
  }
  // If categoryId provided, verify it belongs to this tenant (FK would let
  // us attach another tenant's category by ID; we explicitly check).
  if (input.categoryId) {
    const cat = await prisma.category.findUnique({ where: { id: input.categoryId } })
    if (!cat || cat.tenantId !== tenant.id) {
      return NextResponse.json({ error: 'invalid_category' }, { status: 400 })
    }
  }

  const product = await prisma.product.create({
    data: {
      ...tenantScoped(tenant.id),
      name: input.name,
      slug: input.slug,
      description: input.description ?? null,
      categoryId: input.categoryId ?? null,
      basePrice: input.basePrice,
      currency: input.currency,
      sku: input.sku ?? null,
      barcode: input.barcode ?? null,
      stock: input.stock,
      trackStock: input.trackStock,
      trackStockOnVariant: input.trackStockOnVariant,
      status: input.status,
      attributes: JSON.stringify(input.attributes ?? {}),
    },
    include: { variants: true },
  })

  await audit({
    ctx,
    action: 'product.create',
    category: 'CREATE',
    targetType: 'Product',
    targetId: product.id,
    metadata: { slug: product.slug, name: product.name },
  })

  return NextResponse.json({ product }, { status: 201 })
})
