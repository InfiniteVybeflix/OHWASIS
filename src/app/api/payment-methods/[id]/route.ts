import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getRequestContext, requireTenantMembership, requireMinRole } from '@/lib/session'
import { assertTenantOwns } from '@/lib/tenant'
import { withErrorHandler, parseBody } from '@/lib/api'
import { z } from 'zod'

interface RouteParams { params: Promise<{ id: string }> }

const patchSchema = z.object({
  enabled: z.boolean().optional(),
  displayName: z.string().min(1).max(120).optional(),
  config: z.record(z.unknown()).optional(),
  sortOrder: z.number().int().min(0).max(1000).optional(),
})

export const PATCH = withErrorHandler(async (req, { params }: RouteParams) => {
  const ctx = await getRequestContext(req)
  const { tenant } = requireTenantMembership(ctx)
  requireMinRole(ctx, 'ADMINISTRATOR')
  const { id } = await params
  const existing = await prisma.paymentMethod.findUnique({ where: { id } })
  assertTenantOwns(existing, tenant.id, 'payment_method')
  const input = await parseBody(req, patchSchema)
  const updated = await prisma.paymentMethod.update({
    where: { id },
    data: {
      ...(input.enabled !== undefined && { enabled: input.enabled }),
      ...(input.displayName && { displayName: input.displayName }),
      ...(input.config !== undefined && { config: JSON.stringify(input.config) }),
      ...(input.sortOrder !== undefined && { sortOrder: input.sortOrder }),
    },
  })
  return NextResponse.json({ method: updated })
})

export const DELETE = withErrorHandler(async (req, { params }: RouteParams) => {
  const ctx = await getRequestContext(req)
  const { tenant } = requireTenantMembership(ctx)
  requireMinRole(ctx, 'ADMINISTRATOR')
  const { id } = await params
  const existing = await prisma.paymentMethod.findUnique({ where: { id } })
  assertTenantOwns(existing, tenant.id, 'payment_method')
  await prisma.paymentMethod.delete({ where: { id } })
  return NextResponse.json({ ok: true })
})
