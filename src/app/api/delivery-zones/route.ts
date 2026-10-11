import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getRequestContext, requireTenantMembership, requireMinRole } from '@/lib/session'
import { tenantScoped } from '@/lib/tenant'
import { withErrorHandler, parseBody } from '@/lib/api'
import { deliveryZoneSchema } from '@/lib/validation/schemas'
import { audit } from '@/lib/audit'

export const GET = withErrorHandler(async (req) => {
  const ctx = await getRequestContext(req)
  const { tenant } = requireTenantMembership(ctx)
  const zones = await prisma.deliveryZone.findMany({
    where: tenantScoped(tenant.id),
    orderBy: { createdAt: 'desc' },
  })
  return NextResponse.json({
    zones: zones.map((z) => ({
      ...z,
      areas: JSON.parse(z.areas),
    })),
  })
})

export const POST = withErrorHandler(async (req) => {
  const ctx = await getRequestContext(req)
  const { tenant } = requireTenantMembership(ctx)
  requireMinRole(ctx, 'ADMINISTRATOR')
  const input = await parseBody(req, deliveryZoneSchema)
  const zone = await prisma.deliveryZone.create({
    data: {
      ...tenantScoped(tenant.id),
      name: input.name,
      areas: JSON.stringify(input.areas),
      fee: input.fee,
      minimumOrder: input.minimumOrder ?? null,
      estimatedMinutes: input.estimatedMinutes ?? null,
      active: input.active,
    },
  })
  await audit({
    ctx,
    action: 'delivery_zone.create',
    category: 'CREATE',
    targetType: 'DeliveryZone',
    targetId: zone.id,
    metadata: { name: zone.name, fee: zone.fee },
  })
  return NextResponse.json({ zone }, { status: 201 })
})
