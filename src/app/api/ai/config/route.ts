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

  console.log('[ai/config] Saving provider:', { provider: input.provider, displayName: input.displayName, enabled: input.enabled, hasKey: !!input.apiKey, modelsCount: input.models?.length ?? 0 })

  let encrypted: string
  try {
    const secretBlob = {
      apiKey: input.apiKey,
      baseUrl: input.baseUrl,
      defaultModel: input.defaultModel,
      authScheme: input.authScheme,
    }
    encrypted = encryptSecret(JSON.stringify(secretBlob))
  } catch (err) {
    console.error('[ai/config] encryptSecret failed:', err)
    throw new Error('Failed to encrypt API key — check MASTER_ENCRYPTION_KEY is set')
  }
  const maskedHint = `key:${maskSecret(input.apiKey)}`

  let config
  try {
    config = await prisma.aiProviderConfig.upsert({
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
  } catch (err) {
    console.error('[ai/config] Prisma upsert failed:', err)
    throw new Error(`Failed to save AI provider config: ${err instanceof Error ? err.message : 'database error'}`)
  }

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
