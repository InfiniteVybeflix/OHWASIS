import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getRequestContext, requireTenantMembership, requireMinRole } from '@/lib/session'
import { assertTenantOwns } from '@/lib/tenant'
import { withErrorHandler } from '@/lib/api'
import { audit } from '@/lib/audit'

interface RouteParams { params: Promise<{ id: string }> }

/**
 * DELETE /api/payments/providers/[id] — disable + remove a payment provider config.
 * Secrets are deleted with the row. Requires ADMINISTRATOR+.
 */
export const DELETE = withErrorHandler(async (req, { params }: RouteParams) => {
  const ctx = await getRequestContext(req)
  const { tenant } = requireTenantMembership(ctx)
  requireMinRole(ctx, 'ADMINISTRATOR')
  const { id } = await params
  const existing = await prisma.paymentProviderConfig.findUnique({ where: { id } })
  assertTenantOwns(existing, tenant.id, 'payment_provider_config')
  await prisma.paymentProviderConfig.delete({ where: { id } })
  await audit({
    ctx,
    action: 'payment_provider.delete',
    category: 'DELETE',
    targetType: 'PaymentProviderConfig',
    targetId: id,
    metadata: { provider: existing!.provider },
  })
  return NextResponse.json({ ok: true })
})
