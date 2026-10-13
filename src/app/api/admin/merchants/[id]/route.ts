import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getRequestContext, requirePlatformOperator } from '@/lib/session'
import { withErrorHandler } from '@/lib/api'
import { audit } from '@/lib/audit'

interface RouteParams { params: Promise<{ id: string }> }

/**
 * PATCH /api/admin/merchants/[id]  — platform operator changes tenant status.
 * Body: { status: 'ACTIVE' | 'SUSPENDED' | 'ARCHIVED', reason?: string }
 *
 * Suspending a tenant immediately disables storefront access; logging in
 * still works (so the owner can export data). Archiving completely revokes
 * access and is intended for permanent removal.
 */
export const PATCH = withErrorHandler(async (req, { params }: RouteParams) => {
  const ctx = await getRequestContext(req)
  requirePlatformOperator(ctx)
  const { id } = await params
  const body = (await req.json().catch(() => ({}))) as { status?: string; reason?: string }
  if (!body.status || !['ACTIVE', 'SUSPENDED', 'ARCHIVED', 'PENDING'].includes(body.status)) {
    return NextResponse.json({ error: 'invalid_status' }, { status: 400 })
  }

  const existing = await prisma.tenant.findUnique({ where: { id } })
  if (!existing) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }
  // NOTE: Platform operators have explicit cross-tenant access by design.
  // We do NOT call assertTenantOwns here — the admin is operating ACROSS tenants.

  const updated = await prisma.tenant.update({
    where: { id },
    data: { status: body.status as 'ACTIVE' | 'SUSPENDED' | 'ARCHIVED' | 'PENDING' },
  })

  await audit({
    ctx,
    action: `tenant.${body.status.toLowerCase()}`,
    category: 'UPDATE',
    targetType: 'Tenant',
    targetId: id,
    metadata: {
      previousStatus: existing!.status,
      newStatus: body.status,
      reason: body.reason,
    },
  })

  return NextResponse.json({ tenant: updated })
})
