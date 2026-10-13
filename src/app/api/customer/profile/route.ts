import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getRequestContext, requireCustomer } from '@/lib/session'
import { withErrorHandler, parseBody } from '@/lib/api'
import { z } from 'zod'
import { audit } from '@/lib/audit'

/**
 * GET /api/customer/profile
 * Returns the customer's profile + per-tenant saved details.
 */
export const GET = withErrorHandler(async (req) => {
  const ctx = await getRequestContext(req)
  const user = requireCustomer(ctx)
  // Fetch per-tenant customer profiles (each tenant sees only their own row)
  const profiles = await prisma.customerProfile.findMany({
    where: { userId: user.id },
    include: { tenant: { select: { id: true, handle: true, displayName: true, industry: true } } },
  })
  // Fetch user-level data
  const userRecord = await prisma.user.findUnique({
    where: { id: user.id },
    select: { id: true, email: true, name: true, bio: true, avatarUrl: true, preferences: true, createdAt: true },
  })
  // Order history (across all tenants)
  const orders = await prisma.order.findMany({
    where: { customerUserId: user.id },
    include: { tenant: { select: { id: true, handle: true, displayName: true } } },
    orderBy: { createdAt: 'desc' },
    take: 50,
  })
  return NextResponse.json({
    user: userRecord ? { ...userRecord, preferences: JSON.parse(userRecord.preferences || '{}') } : null,
    perTenantProfiles: profiles.map((p) => ({
      id: p.id,
      tenant: p.tenant,
      displayName: p.displayName,
      phone: p.phone,
      defaultAddress: JSON.parse(p.defaultAddress || '{}'),
      savedAddresses: JSON.parse(p.savedAddresses || '[]'),
      marketingOptIn: p.marketingOptIn,
      notes: p.notes,
    })),
    orders: orders.map((o) => ({
      id: o.id,
      reference: o.reference,
      status: o.status,
      total: o.total,
      currency: o.currency,
      createdAt: o.createdAt,
      tenant: o.tenant,
    })),
  })
})

const updateProfileSchema = z.object({
  name: z.string().max(120).optional(),
  bio: z.string().max(500).optional(),
  avatarUrl: z.string().url().optional(),
  preferences: z.record(z.unknown()).optional(),
})

/**
 * PATCH /api/customer/profile
 * Update the customer's profile (name, bio, avatar, preferences).
 * Per-tenant saved details (default address, saved addresses) are updated
 * separately via POST /api/customer/profile/tenant.
 */
export const PATCH = withErrorHandler(async (req) => {
  const ctx = await getRequestContext(req)
  const user = requireCustomer(ctx)
  const input = await parseBody(req, updateProfileSchema)
  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.bio !== undefined && { bio: input.bio }),
      ...(input.avatarUrl && { avatarUrl: input.avatarUrl }),
      ...(input.preferences !== undefined && { preferences: JSON.stringify(input.preferences) }),
    },
    select: { id: true, email: true, name: true, bio: true, avatarUrl: true, preferences: true },
  })
  await audit({
    ctx,
    action: 'customer.profile.update',
    category: 'UPDATE',
    targetType: 'User',
    targetId: user.id,
    metadata: { fields: Object.keys(input) },
  })
  return NextResponse.json({
    user: { ...updated, preferences: JSON.parse(updated.preferences || '{}') },
  })
})
