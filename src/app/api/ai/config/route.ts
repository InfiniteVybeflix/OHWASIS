import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getRequestContext, requireTenantMembership, requireMinRole } from '@/lib/session'
import { tenantScoped } from '@/lib/tenant'
import { withErrorHandler, parseBody } from '@/lib/api'
import { aiProviderConfigSchema } from '@/lib/validation/schemas'
import { encryptSecret, maskSecret } from '@/lib/crypto'
import { AEVIBRON_DEFAULTS } from '@/lib/ai/provider'
import { audit } from '@/lib/audit'

/**
 * GET /api/ai/config  — list the tenant's AI provider configs (masked).
 */
export const GET = withErrorHandler(async (req) => {
  const ctx = await getRequestContext(req)
  const { tenant } = requireTenantMembership(ctx)
  const configs = await prisma.aiProviderConfig.findMany({
    where: tenantScoped(tenant.id),
    select: {
      id: true,
      provider: true,
      displayName: true,
      enabled: true,
      models: true,
      maskedHint: true,
      createdAt: true,
      updatedAt: true,
    },
  })
  return NextResponse.json({
    configs,
    recommended: AEVIBRON_DEFAULTS,
  })
})

/**
 * POST /api/ai/config  — create or update an AI provider config.
 * Secrets are encrypted at rest. Requires ADMINISTRATOR+.
 */
export const POST = withErrorHandler(async (req) => {
  const ctx = await getRequestContext(req)
  const { tenant } = requireTenantMembership(ctx)
  requireMinRole(ctx, 'ADMINISTRATOR')
  const input = await parseBody(req, aiProviderConfigSchema)

  const secretBlob = {
    apiKey: input.apiKey,
    baseUrl: input.baseUrl,
    defaultModel: input.defaultModel,
    authScheme: input.authScheme,
  }
  const encrypted = encryptSecret(JSON.stringify(secretBlob))
  const maskedHint = `key:${maskSecret(input.apiKey)}`

  const config = await prisma.aiProviderConfig.upsert({
    where: { tenantId_provider: { tenantId: tenant.id, provider: input.provider } },
    create: {
      tenantId: tenant.id,
      provider: input.provider,
      displayName: input.displayName,
      enabled: input.enabled,
      models: JSON.stringify(input.models ?? []),
      encryptedConfig: encrypted,
      maskedHint,
    },
    update: {
      displayName: input.displayName,
      enabled: input.enabled,
      models: JSON.stringify(input.models ?? []),
      encryptedConfig: encrypted,
      maskedHint,
    },
    select: {
      id: true,
      provider: true,
      displayName: true,
      enabled: true,
      models: true,
      maskedHint: true,
      updatedAt: true,
    },
  })

  await audit({
    ctx,
    action: 'ai_provider.upsert',
    category: 'UPDATE',
    targetType: 'AiProviderConfig',
    targetId: config.id,
    metadata: { provider: input.provider, enabled: input.enabled },
  })

  return NextResponse.json({ config })
})
