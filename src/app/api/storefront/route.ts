import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { resolveTenantByHandle } from '@/lib/tenant'
import { withErrorHandler, queryParams } from '@/lib/api'

/**
 * GET /api/storefront?handle=...
 *
 * Public storefront summary — used by customer-facing pages. No auth required.
 * Only returns ACTIVE products (never DRAFT or ARCHIVED).
 */
export const GET = withErrorHandler(async (req) => {
  const q = queryParams(req)
  const handle = q.get('handle')
  if (!handle) {
    return NextResponse.json({ error: 'handle_required' }, { status: 400 })
  }
  try {
    const tenant = await resolveTenantByHandle(handle)
    const [categories, productCount, pages, deliveryZones] = await Promise.all([
      prisma.category.findMany({
        where: { tenantId: tenant.id },
        include: { _count: { select: { products: true } } },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      }),
      prisma.product.count({ where: { tenantId: tenant.id, status: 'ACTIVE' } }),
      prisma.page.findMany({
        where: { tenantId: tenant.id, status: 'PUBLISHED' },
        select: { slug: true, title: true },
      }),
      prisma.deliveryZone.findMany({
        where: { tenantId: tenant.id, active: true },
        select: { id: true, name: true, fee: true, estimatedMinutes: true, minimumOrder: true, areas: true },
      }),
    ])
    return NextResponse.json({
      tenant: {
        id: tenant.id,
        handle: tenant.handle,
        displayName: tenant.displayName,
        tagline: tenant.tagline,
        description: tenant.description,
        industry: tenant.industry,
        theme: tenant.theme ? JSON.parse(tenant.theme) : null,
        contactEmail: tenant.contactEmail,
        contactPhone: tenant.contactPhone,
        address: tenant.address ? JSON.parse(tenant.address) : null,
      },
      categories,
      productCount,
      pages,
      deliveryZones: deliveryZones.map((z) => ({
        ...z,
        areas: JSON.parse(z.areas),
      })),
    })
  } catch {
    return NextResponse.json({ error: 'storefront_not_found' }, { status: 404 })
  }
})
