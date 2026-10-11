import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { resolveTenantByHandle } from '@/lib/tenant'
import { withErrorHandler, queryParams } from '@/lib/api'

/**
 * GET /api/storefront/products?handle=...&q=&categoryId=&page=&pageSize=&sort=
 *
 * Public product listing — only ACTIVE products, only the tenant's products.
 */
export const GET = withErrorHandler(async (req) => {
  const q = queryParams(req)
  const handle = q.get('handle')
  if (!handle) return NextResponse.json({ error: 'handle_required' }, { status: 400 })
  const tenant = await resolveTenantByHandle(handle).catch(() => null)
  if (!tenant) return NextResponse.json({ error: 'storefront_not_found' }, { status: 404 })

  const page = Math.max(1, Number(q.get('page') ?? '1'))
  const pageSize = Math.min(60, Math.max(1, Number(q.get('pageSize') ?? '12')))
  const search = q.get('q') ?? undefined
  const categoryId = q.get('categoryId') ?? undefined
  const sort = q.get('sort') ?? 'newest'

  const where = {
    tenantId: tenant.id,
    status: 'ACTIVE' as const,
    ...(search ? { name: { contains: search } } : {}),
    ...(categoryId ? { categoryId } : {}),
  }

  const orderBy: Record<string, 'asc' | 'desc'> =
    sort === 'price_asc' ? { basePrice: 'asc' } :
    sort === 'price_desc' ? { basePrice: 'desc' } :
    sort === 'name' ? { name: 'asc' } :
    { createdAt: 'desc' }

  const [items, total] = await Promise.all([
    prisma.product.findMany({
      where,
      include: {
        variants: true,
        images: { orderBy: { sortOrder: 'asc' } },
        category: { select: { id: true, name: true, slug: true } },
      },
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.product.count({ where }),
  ])

  return NextResponse.json({ items, total, page, pageSize })
})
