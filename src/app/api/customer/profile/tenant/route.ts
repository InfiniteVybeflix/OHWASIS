import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getRequestContext, requireCustomer } from '@/lib/session'
import { withErrorHandler, parseBody } from '@/lib/api'
import { z } from 'zod'
import { audit } from '@/lib/audit'

const updateTenantProfileSchema = z.object({
  // The tenant handle whose profile we're updating
  tenantHandle: z.string().min(3).max(32),
  displayName: z.string().max(120).optional(),
  phone: z.string().max(30).optional(),
  defaultAddress: z.record(z.unknown()).optional(),
  savedAddresses: z.array(z.record(z.unknown())).optional(),
  marketingOptIn: z.boolean().optional(),
  notes: z.string().max(500).optional(),
})

/**
 * PATCH /api/customer/profile/tenant
 *
 * Update the customer's per-tenant saved details (default address, saved addresses,
 * marketing opt-in). Each tenant sees only their own row for this customer —
 * updating one tenant's profile does NOT affect another tenant's profile.
 *
 * This enforces per-shop data isolation: a customer can have different default
 * addresses for different businesses.
 */
export const PATCH = withErrorHandler(async (req) => {
  const ctx = await getRequestContext(req)
  const user = requireCustomer(ctx)
  const input = await parseBody(req, updateTenantProfileSchema)

  // Resolve tenant by handle (must be ACTIVE)
  const tenant = await prisma.tenant.findUnique({
    where: { handle: input.tenantHandle },
    select: { id: true, handle: true, displayName: true, status: true },
  })
  if (!tenant || tenant.status !== 'ACTIVE') {
    return NextResponse.json({ error: 'tenant_not_found' }, { status: 404 })
  }

  // Upsert the per-tenant customer profile
  const profile = await prisma.customerProfile.upsert({
    where: { tenantId_userId: { tenantId: tenant.id, userId: user.id } },
    create: {
      tenantId: tenant.id,
      userId: user.id,
      displayName: input.displayName ?? user.name ?? user.email.split('@')[0],
      email: user.email,
      phone: input.phone ?? null,
      defaultAddress: JSON.stringify(input.defaultAddress ?? {}),
      savedAddresses: JSON.stringify(input.savedAddresses ?? []),
      marketingOptIn: input.marketingOptIn ?? false,
      notes: input.notes ?? null,
    },
    update: {
      ...(input.displayName && { displayName: input.displayName }),
      ...(input.phone !== undefined && { phone: input.phone }),
      ...(input.defaultAddress !== undefined && { defaultAddress: JSON.stringify(input.defaultAddress) }),
      ...(input.savedAddresses !== undefined && { savedAddresses: JSON.stringify(input.savedAddresses) }),
      ...(input.marketingOptIn !== undefined && { marketingOptIn: input.marketingOptIn }),
      ...(input.notes !== undefined && { notes: input.notes }),
    },
  })

  await audit({
    ctx,
    action: 'customer.profile_tenant.update',
    category: 'UPDATE',
    targetType: 'CustomerProfile',
    targetId: profile.id,
    metadata: { tenantHandle: tenant.handle, fields: Object.keys(input) },
  })

  return NextResponse.json({
    profile: {
      ...profile,
      defaultAddress: JSON.parse(profile.defaultAddress || '{}'),
      savedAddresses: JSON.parse(profile.savedAddresses || '[]'),
    },
  })
})
