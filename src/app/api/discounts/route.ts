import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getRequestContext, requireTenantMembership, requireMinRole } from '@/lib/session'
import { tenantScoped } from '@/lib/tenant'
import { withErrorHandler, parseBody } from '@/lib/api'
import { discountSchema } from '@/lib/validation/schemas'
import { audit } from '@/lib/audit'

export const GET = withErrorHandler(async (req) => {
  const ctx = await getRequestContext(req)
  const { tenant } = requireTenantMembership(ctx)
  const discounts = await prisma.discount.findMany({
    where: tenantScoped(tenant.id),
    orderBy: { createdAt: 'desc' },
  })
  return NextResponse.json({ discounts })
})

export const POST = withErrorHandler(async (req) => {
  const ctx = await getRequestContext(req)
  const { tenant } = requireTenantMembership(ctx)
  requireMinRole(ctx, 'ADMINISTRATOR')
  const input = await parseBody(req, discountSchema)
  const code = input.code.toUpperCase()
  const existing = await prisma.discount.findFirst({
    where: { ...tenantScoped(tenant.id), code },
  })
  if (existing) return NextResponse.json({ error: 'code_taken' }, { status: 409 })
  const discount = await prisma.discount.create({
    data: {
      ...tenantScoped(tenant.id),
      code,
      description: input.description ?? null,
      type: input.type,
      value: input.value,
      minimumOrder: input.minimumOrder ?? null,
      startsAt: new Date(input.startsAt),
      endsAt: input.endsAt ? new Date(input.endsAt) : null,
      usageLimit: input.usageLimit ?? null,
      active: input.active,
    },
  })
  await audit({
    ctx,
    action: 'discount.create',
    category: 'CREATE',
    targetType: 'Discount',
    targetId: discount.id,
    metadata: { code: discount.code, type: discount.type },
  })
  return NextResponse.json({ discount }, { status: 201 })
})
