import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { resolveTenantByHandle } from '@/lib/tenant'
import { withErrorHandler, queryParams } from '@/lib/api'

/**
 * GET /api/storefront/payment-methods?handle=...
 *
 * PUBLIC endpoint — returns the shop's ENABLED payment methods.
 * Used by the storefront checkout to render the available payment options.
 *
 * Does NOT return credentials or internal config secrets — only the
 * customer-facing display name and any instructions the merchant configured.
 */
export const GET = withErrorHandler(async (req) => {
  const q = queryParams(req)
  const handle = q.get('handle')
  if (!handle) return NextResponse.json({ error: 'handle_required' }, { status: 400 })
  const tenant = await resolveTenantByHandle(handle).catch(() => null)
  if (!tenant) return NextResponse.json({ error: 'storefront_not_found' }, { status: 404 })

  const methods = await prisma.paymentMethod.findMany({
    where: { tenantId: tenant.id, enabled: true },
    select: {
      id: true,
      method: true,
      displayName: true,
      // Only expose safe customer-facing fields from config
      config: true,
      sortOrder: true,
    },
    orderBy: [{ sortOrder: 'asc' }, { method: 'asc' }],
  })

  // Strip sensitive fields from config — only keep customer-facing ones
  const safe = methods.map((m) => {
    let config: Record<string, unknown> = {}
    try { config = JSON.parse(m.config || '{}') } catch { /* ignore */ }
    return {
      id: m.id,
      method: m.method,
      displayName: m.displayName,
      // Only include customer-safe fields: till/paybill numbers, bank name,
      // account name, and instructions. NEVER credentials or secrets.
      config: {
        ...(config.tillNumber && { tillNumber: config.tillNumber }),
        ...(config.paybillNumber && { paybillNumber: config.paybillNumber }),
        ...(config.accountName && { accountName: config.accountName }),
        ...(config.bankName && { bankName: config.bankName }),
        ...(config.accountNumber && { accountNumber: config.accountNumber }),
        ...(config.instructions && { instructions: config.instructions }),
      },
    }
  })

  return NextResponse.json({ methods: safe })
})
