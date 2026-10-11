import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getRequestContext, requireTenantMembership, requireMinRole } from '@/lib/session'
import { assertTenantOwns } from '@/lib/tenant'
import { withErrorHandler, parseBody } from '@/lib/api'
import { variantSchema } from '@/lib/validation/schemas'
import { audit } from '@/lib/audit'

interface RouteParams { params: Promise<{ id: string }> }

export const POST = withErrorHandler(async (req, { params }: RouteParams) => {
  const ctx = await getRequestContext(req)
  const { tenant } = requireTenantMembership(ctx)
  requireMinRole(ctx, 'CATALOG_MANAGER')
  const { id } = await params
  const existing = await prisma.product.findUnique({ where: { id } })
  assertTenantOwns(existing, tenant.id, 'product')
  const input = await parseBody(req, variantSchema)
  const variant = await prisma.variant.create({
    data: {
      productId: id,
      name: input.name,
      sku: input.sku ?? null,
      priceDelta: input.priceDelta,
      stock: input.stock,
      options: JSON.stringify(input.options ?? {}),
      weightGrams: input.weightGrams ?? null,
    },
  })
  await audit({
    ctx,
    action: 'variant.create',
    category: 'CREATE',
    targetType: 'Variant',
    targetId: variant.id,
  })
  return NextResponse.json({ variant }, { status: 201 })
})
