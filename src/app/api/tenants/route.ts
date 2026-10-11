import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getRequestContext, requireTenantMembership } from '@/lib/session'
import { tenantScoped } from '@/lib/tenant'
import { withErrorHandler, parseBody } from '@/lib/api'
import { createTenantSchema } from '@/lib/validation/schemas'
import { audit } from '@/lib/audit'

/**
 * GET /api/tenants  — list tenants the current user is a member of.
 */
export const GET = withErrorHandler(async (req) => {
  const ctx = await getRequestContext(req)
  if (!ctx.user) {
    return NextResponse.json({ tenants: [] })
  }
  const memberships = await prisma.membership.findMany({
    where: { userId: ctx.user.id },
    include: { tenant: true },
  })
  return NextResponse.json({
    tenants: memberships.map((m) => ({
      id: m.tenant.id,
      handle: m.tenant.handle,
      displayName: m.tenant.displayName,
      industry: m.tenant.industry,
      role: m.role,
      status: m.status,
    })),
  })
})

/**
 * PUT /api/tenants  — update the active tenant's profile (display name,
 * tagline, description, contact). Requires ADMINISTRATOR+ role.
 */
export const PUT = withErrorHandler(async (req) => {
  const ctx = await getRequestContext(req)
  const { tenant } = requireTenantMembership(ctx, ['OWNER', 'ADMINISTRATOR'])
  const input = await parseBody(req, createTenantSchema.partial())
  const updated = await prisma.tenant.update({
    where: { id: tenant.id },
    data: {
      ...(input.displayName && { displayName: input.displayName }),
      ...(input.tagline !== undefined && { tagline: input.tagline }),
      ...(input.description !== undefined && { description: input.description }),
      ...(input.contactEmail && { contactEmail: input.contactEmail }),
      ...(input.contactPhone && { contactPhone: input.contactPhone }),
    },
  })
  void tenantScoped(tenant.id)
  await audit({
    ctx,
    action: 'tenant.update',
    category: 'UPDATE',
    targetType: 'Tenant',
    targetId: tenant.id,
    metadata: { fields: Object.keys(input) },
  })
  return NextResponse.json({ tenant: updated })
})
