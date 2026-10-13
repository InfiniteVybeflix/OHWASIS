import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getRequestContext, requireTenantMembership, requireMinRole } from '@/lib/session'
import { tenantScoped } from '@/lib/tenant'
import { withErrorHandler, parseBody } from '@/lib/api'
import { z } from 'zod'

/**
 * GET /api/payment-methods
 * Returns the active tenant's payment methods (sorted by sortOrder).
 */
export const GET = withErrorHandler(async (req) => {
  const ctx = await getRequestContext(req)
  const { tenant } = requireTenantMembership(ctx)
  const methods = await prisma.paymentMethod.findMany({
    where: tenantScoped(tenant.id),
    orderBy: [{ sortOrder: 'asc' }, { method: 'asc' }],
  })
  return NextResponse.json({
    methods: methods.map((m) => ({
      ...m,
      config: JSON.parse(m.config || '{}'),
    })),
  })
})

const methodSchema = z.object({
  method: z.enum(['cash_on_delivery', 'manual_till', 'manual_paybill', 'bank_transfer', 'mpesa_stk', 'mpesa_manual']),
  displayName: z.string().min(1).max(120),
  enabled: z.boolean().default(true),
  config: z.record(z.string(), z.unknown()).default({}),
  sortOrder: z.number().int().min(0).max(1000).optional(),
})

/**
 * POST /api/payment-methods
 * Add a payment method for the active tenant. Multi-select is supported:
 * each method is a separate row, so a tenant can have cash_on_delivery +
 * manual_till + mpesa_stk all enabled at once.
 */
export const POST = withErrorHandler(async (req) => {
  const ctx = await getRequestContext(req)
  const { tenant } = requireTenantMembership(ctx)
  requireMinRole(ctx, 'ADMINISTRATOR')
  const input = await parseBody(req, methodSchema)

  // Upsert: if the method already exists, update; otherwise create
  const method = await prisma.paymentMethod.upsert({
    where: { tenantId_method: { tenantId: tenant.id, method: input.method } },
    create: {
      tenantId: tenant.id,
      method: input.method,
      displayName: input.displayName,
      enabled: input.enabled,
      config: JSON.stringify(input.config ?? {}),
      sortOrder: input.sortOrder ?? 0,
    },
    update: {
      displayName: input.displayName,
      enabled: input.enabled,
      config: JSON.stringify(input.config ?? {}),
      sortOrder: input.sortOrder ?? 0,
    },
  })

  return NextResponse.json({ method }, { status: 201 })
})

/**
 * PATCH (batch) /api/payment-methods
 * Update enabled status for multiple methods at once (used by the multi-select UI).
 * Body: { updates: [{ id, enabled }, ...] }
 */
const batchSchema = z.object({
  updates: z.array(z.object({
    id: z.string().cuid(),
    enabled: z.boolean(),
  })),
})

export const PATCH = withErrorHandler(async (req) => {
  const ctx = await getRequestContext(req)
  const { tenant } = requireTenantMembership(ctx)
  requireMinRole(ctx, 'ADMINISTRATOR')
  const input = await parseBody(req, batchSchema)

  // Verify all method IDs belong to this tenant before updating
  const methods = await prisma.paymentMethod.findMany({
    where: { ...tenantScoped(tenant.id), id: { in: input.updates.map((u) => u.id) } },
  })
  const validIds = new Set(methods.map((m) => m.id))
  const validUpdates = input.updates.filter((u) => validIds.has(u.id))

  await prisma.$transaction(
    validUpdates.map((u) =>
      prisma.paymentMethod.update({
        where: { id: u.id },
        data: { enabled: u.enabled },
      }),
    ),
  )

  return NextResponse.json({ updated: validUpdates.length })
})
