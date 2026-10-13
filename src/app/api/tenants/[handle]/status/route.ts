import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { resolveTenantByHandle } from '@/lib/tenant'
import { getRequestContext, requireTenantMembership, requireMinRole } from '@/lib/session'
import { withErrorHandler } from '@/lib/api'
import { audit } from '@/lib/audit'
import { z } from 'zod'

interface RouteParams { params: Promise<{ handle: string }> }

/**
 * GET /api/tenants/[handle]/status
 *
 * Public endpoint — returns the shop's current open/closed status.
 * Used by the storefront to show "closed" banners and by the merchant
 * dashboard to render the open/closed toggle.
 */
export const GET = withErrorHandler(async (req, { params }: RouteParams) => {
  const { handle } = await params
  try {
    const tenant = await resolveTenantByHandle(handle)
    return NextResponse.json({
      openStatus: tenant.openStatus,
      openingHours: JSON.parse(tenant.openingHours || '[]'),
    })
  } catch {
    return NextResponse.json({ error: 'tenant_not_found' }, { status: 404 })
  }
})

const patchSchema = z.object({
  openStatus: z.enum(['OPEN', 'CLOSED', 'TEMPORARILY_CLOSED']),
})

/**
 * PATCH /api/tenants/[handle]/status
 *
 * Owner/Administrator only — toggle the shop open/closed status.
 * Customers still see the storefront and can place orders when CLOSED;
 * the storefront shows a banner explaining the order will need verification.
 */
export const PATCH = withErrorHandler(async (req, { params }: RouteParams) => {
  const { handle } = await params
  const ctx = await getRequestContext(req)
  const { tenant } = requireTenantMembership(ctx, ['OWNER', 'ADMINISTRATOR'])
  // Verify the URL handle matches the resolved tenant
  if (tenant.handle !== handle) {
    return NextResponse.json({ error: 'handle_mismatch' }, { status: 400 })
  }
  requireMinRole(ctx, 'ADMINISTRATOR')

  const body = (await req.json().catch(() => ({}))) as { openStatus?: string }
  const input = patchSchema.parse(body)

  const updated = await prisma.tenant.update({
    where: { id: tenant.id },
    data: { openStatus: input.openStatus },
    select: { id: true, handle: true, displayName: true, openStatus: true },
  })

  await audit({
    ctx,
    action: `tenant.status_${input.openStatus.toLowerCase()}`,
    category: 'UPDATE',
    targetType: 'Tenant',
    targetId: tenant.id,
    metadata: { previousStatus: ctx.tenant, newStatus: input.openStatus },
  })

  return NextResponse.json({
    openStatus: updated.openStatus,
    displayName: updated.displayName,
  })
})
