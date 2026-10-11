import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getRequestContext, requireTenantMembership, requireMinRole } from '@/lib/session'
import { tenantScoped } from '@/lib/tenant'
import { withErrorHandler, parseBody } from '@/lib/api'
import { paymentProviderConfigSchema } from '@/lib/validation/schemas'
import { encryptSecret, maskSecret } from '@/lib/crypto'
import { audit } from '@/lib/audit'

/**
 * GET /api/payments/providers  — list the tenant's payment provider configs.
 * Returns masked hints only — never raw credentials.
 */
export const GET = withErrorHandler(async (req) => {
  const ctx = await getRequestContext(req)
  const { tenant } = requireTenantMembership(ctx)
  const configs = await prisma.paymentProviderConfig.findMany({
    where: tenantScoped(tenant.id),
    select: {
      id: true,
      provider: true,
      displayName: true,
      enabled: true,
      environment: true,
      maskedHint: true,
      createdAt: true,
      updatedAt: true,
    },
  })
  return NextResponse.json({ configs })
})

/**
 * POST /api/payments/providers  — create or update a payment provider config.
 * Secrets are encrypted at rest. Requires ADMINISTRATOR+.
 */
export const POST = withErrorHandler(async (req) => {
  const ctx = await getRequestContext(req)
  const { tenant } = requireTenantMembership(ctx)
  requireMinRole(ctx, 'ADMINISTRATOR')
  const input = await parseBody(req, paymentProviderConfigSchema)

  // Build the secret blob from the input
  const secretBlob: Record<string, unknown> = {}
  let maskedHint = ''
  if (input.provider === 'mpesa_stk') {
    if (!input.consumerKey || !input.consumerSecret || !input.shortCode || !input.passkey) {
      return NextResponse.json({ error: 'missing_daraja_fields' }, { status: 400 })
    }
    secretBlob.consumerKey = input.consumerKey
    secretBlob.consumerSecret = input.consumerSecret
    secretBlob.shortCode = input.shortCode
    secretBlob.passkey = input.passkey
    secretBlob.callbackUrl = input.callbackUrl ?? null
    secretBlob.environment = input.environment
    maskedHint = `consumer:${maskSecret(input.consumerKey)} shortCode:${input.shortCode}`
  } else {
    // Manual / COD: no real secret, just instructions
    secretBlob.instructions = input.instructions ?? ''
    secretBlob.tillNumber = input.tillNumber ?? null
    secretBlob.paybillNumber = input.paybillNumber ?? null
    secretBlob.accountName = input.accountName ?? null
    maskedHint = input.tillNumber ? `till:${input.tillNumber}` : input.paybillNumber ? `paybill:${input.paybillNumber}` : 'manual'
  }

  const encrypted = encryptSecret(JSON.stringify(secretBlob))

  // Upsert on (tenantId, provider)
  const config = await prisma.paymentProviderConfig.upsert({
    where: { tenantId_provider: { tenantId: tenant.id, provider: input.provider } },
    create: {
      tenantId: tenant.id,
      provider: input.provider,
      displayName: input.displayName,
      enabled: input.enabled,
      environment: input.environment,
      encryptedConfig: encrypted,
      maskedHint,
    },
    update: {
      displayName: input.displayName,
      enabled: input.enabled,
      environment: input.environment,
      encryptedConfig: encrypted,
      maskedHint,
    },
    select: {
      id: true,
      provider: true,
      displayName: true,
      enabled: true,
      environment: true,
      maskedHint: true,
      updatedAt: true,
    },
  })

  await audit({
    ctx,
    action: 'payment_provider.upsert',
    category: 'UPDATE',
    targetType: 'PaymentProviderConfig',
    targetId: config.id,
    metadata: { provider: input.provider, enabled: input.enabled, environment: input.environment },
  })

  return NextResponse.json({ config })
})
