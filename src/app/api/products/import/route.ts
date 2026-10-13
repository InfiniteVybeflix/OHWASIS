import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getRequestContext, requireTenantMembership, requireMinRole } from '@/lib/session'
import { withErrorHandler } from '@/lib/api'
import { audit } from '@/lib/audit'

/**
 * POST /api/products/import
 *
 * Bulk import products from CSV. Body: { rows: [{ name, slug?, description?, basePrice, stock?, category?, sku?, barcode? }] }
 *
 * Each row is validated. If slug is missing, auto-generated from name.
 * If category is provided (by name), we find-or-create it for this tenant.
 *
 * Returns { imported: number, errors: [{ row: number, error: string }] }
 */
export const POST = withErrorHandler(async (req) => {
  const ctx = await getRequestContext(req)
  const { tenant } = requireTenantMembership(ctx)
  requireMinRole(ctx, 'CATALOG_MANAGER')

  const body = (await req.json().catch(() => ({}))) as { rows?: Array<Record<string, string>> }
  const rows = body.rows
  if (!Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json({ error: 'no_rows', message: 'Provide a "rows" array of product objects.' }, { status: 400 })
  }

  const imported: number[] = []
  const errors: Array<{ row: number; error: string }> = []

  // Cache categories for this tenant (by lowercase name)
  const catCache = new Map<string, string>()
  const existingCats = await prisma.category.findMany({ where: { tenantId: tenant.id } })
  for (const c of existingCats) catCache.set(c.name.toLowerCase(), c.id)

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    try {
      const name = (row.name ?? row.Name ?? row.NAME ?? '').trim()
      if (!name) { errors.push({ row: i + 1, error: 'Missing name' }); continue }

      const price = parseFloat(String(row.basePrice ?? row.price ?? row.Price ?? '0'))
      if (isNaN(price) || price < 0) { errors.push({ row: i + 1, error: `Invalid price: ${row.basePrice ?? row.price}` }); continue }

      let slug = (row.slug ?? '').trim().toLowerCase().replace(/[^a-z0-9-]/g, '')
      if (!slug) slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 32)
      // Ensure unique slug within tenant
      const existing = await prisma.product.findFirst({ where: { tenantId: tenant.id, slug } })
      if (existing) slug = `${slug}-${Math.random().toString(36).slice(2, 5)}`

      // Resolve category
      let categoryId: string | null = null
      const catName = (row.category ?? row.Category ?? '').trim()
      if (catName) {
        const key = catName.toLowerCase()
        if (catCache.has(key)) {
          categoryId = catCache.get(key)!
        } else {
          const catSlug = catName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
          const cat = await prisma.category.create({
            data: { tenantId: tenant.id, name: catName, slug: catSlug },
          })
          catCache.set(key, cat.id)
          categoryId = cat.id
        }
      }

      const stock = parseInt(String(row.stock ?? row.Stock ?? '0'), 10) || 0
      const description = (row.description ?? row.Description ?? '').trim() || null
      const sku = (row.sku ?? row.SKU ?? '').trim() || null
      const barcode = (row.barcode ?? row.Barcode ?? '').trim() || null

      const product = await prisma.product.create({
        data: {
          tenantId: tenant.id,
          name,
          slug,
          description,
          categoryId,
          basePrice: price,
          currency: 'KES',
          stock,
          trackStock: true,
          status: 'ACTIVE',
          sku,
          barcode,
          attributes: '{}',
        },
      })
      imported.push(product.id)
    } catch (err) {
      errors.push({ row: i + 1, error: err instanceof Error ? err.message : 'Unknown error' })
    }
  }

  await audit({
    ctx,
    action: 'products.bulk_import',
    category: 'CREATE',
    targetType: 'Product',
    metadata: { imported: imported.length, errors: errors.length },
  })

  return NextResponse.json({
    imported: imported.length,
    errors,
    message: `Imported ${imported.length} product(s)${errors.length > 0 ? ` with ${errors.length} error(s)` : ''}.`,
  }, { status: 201 })
})
