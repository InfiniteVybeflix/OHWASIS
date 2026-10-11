import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getRequestContext, requireTenantMembership, requireMinRole } from '@/lib/session'
import { tenantScoped } from '@/lib/tenant'
import { withErrorHandler, parseBody } from '@/lib/api'
import { categorySchema } from '@/lib/validation/schemas'
import { audit } from '@/lib/audit'

export const GET = withErrorHandler(async (req) => {
  const ctx = await getRequestContext(req)
  const { tenant } = requireTenantMembership(ctx)
  const categories = await prisma.category.findMany({
    where: tenantScoped(tenant.id),
    include: { _count: { select: { products: true } } },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  })
  return NextResponse.json({ categories })
})

export const POST = withErrorHandler(async (req) => {
  const ctx = await getRequestContext(req)
  const { tenant } = requireTenantMembership(ctx)
  requireMinRole(ctx, 'CATALOG_MANAGER')
  const input = await parseBody(req, categorySchema)

  // Slug uniqueness within tenant
  const existing = await prisma.category.findFirst({
    where: { ...tenantScoped(tenant.id), slug: input.slug },
  })
  if (existing) {
    return NextResponse.json({ error: 'slug_taken' }, { status: 409 })
  }

  if (input.parentId) {
    const parent = await prisma.category.findUnique({ where: { id: input.parentId } })
    if (!parent || parent.tenantId !== tenant.id) {
      return NextResponse.json({ error: 'invalid_parent' }, { status: 400 })
    }
  }

  const category = await prisma.category.create({
    data: {
      ...tenantScoped(tenant.id),
      name: input.name,
      slug: input.slug,
      description: input.description ?? null,
      parentId: input.parentId ?? null,
      sortOrder: input.sortOrder ?? 0,
    },
  })
  await audit({
    ctx,
    action: 'category.create',
    category: 'CREATE',
    targetType: 'Category',
    targetId: category.id,
  })
  return NextResponse.json({ category }, { status: 201 })
})
