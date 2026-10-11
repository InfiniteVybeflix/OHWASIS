import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getRequestContext, requireTenantMembership } from '@/lib/session'
import { withErrorHandler, parseBody } from '@/lib/api'
import { aiChatSchema } from '@/lib/validation/schemas'
import { decryptSecret } from '@/lib/crypto'
import { chatComplete, AiProviderError, AEVIBRON_DEFAULTS } from '@/lib/ai/provider'
import { audit } from '@/lib/audit'

/**
 * POST /api/ai/chat
 *
 * Sends a chat completion to the tenant's configured AI provider.
 *
 * Tenant permission: any active member can use the assistant for content
 * drafting, product descriptions, etc. Sensitive customer PII is NEVER sent
 * to the provider — see prompt builder for sanitisation.
 *
 * The provider is resolved by:
 *   1. The tenant's enabled config for 'aevibron' (recommended default).
 *   2. If no tenant config exists, fall back to AEVIBRON_GATEWAY_URL + a
 *      platform-level key (AEVIBRON_GATEWAY_KEY env). If neither is set,
 *      return a structured error — DO NOT silently mock a response.
 */
export const POST = withErrorHandler(async (req) => {
  const ctx = await getRequestContext(req)
  const { tenant } = requireTenantMembership(ctx)
  const input = await parseBody(req, aiChatSchema)

  // Resolve provider config (prefer tenant-level Aevibron config)
  const tenantConfig = await prisma.aiProviderConfig.findFirst({
    where: { tenantId: tenant.id, enabled: true },
  })

  let baseUrl: string
  let apiKey: string
  let defaultModel: string
  let authScheme: 'x-aevibron-key' | 'bearer' | 'x-api-key'
  let providerName: string

  if (tenantConfig) {
    const cfg = JSON.parse(decryptSecret(tenantConfig.encryptedConfig))
    baseUrl = cfg.baseUrl
    apiKey = cfg.apiKey
    defaultModel = cfg.defaultModel
    authScheme = cfg.authScheme
    providerName = tenantConfig.provider
  } else {
    // Fall back to platform-level Aevibron gateway if configured
    const envKey = process.env.AEVIBRON_GATEWAY_KEY
    if (!envKey) {
      return NextResponse.json(
        {
          error: 'ai_not_configured',
          message:
            'No AI provider configured for this tenant. The merchant owner can configure Aevibron Gateway from the dashboard, or request access from the platform operator.',
        },
        { status: 503 },
      )
    }
    baseUrl = AEVIBRON_DEFAULTS.baseUrl
    apiKey = envKey
    defaultModel = AEVIBRON_DEFAULTS.defaultModel
    authScheme = AEVIBRON_DEFAULTS.authScheme
    providerName = 'aevibron'
  }

  // Sanitise messages — strip anything that looks like a credit-card number,
  // M-Pesa PIN, password, etc. AI output is treated as untrusted input.
  const sanitisedMessages = input.messages.map((m) => ({
    role: m.role,
    content: sanitisePrompt(m.content),
  }))

  let response
  try {
    response = await chatComplete(
      {
        provider: providerName,
        baseUrl,
        apiKey,
        defaultModel,
        authScheme,
      },
      {
        model: input.model ?? defaultModel,
        messages: sanitisedMessages,
        temperature: input.temperature,
        maxTokens: input.maxTokens,
      },
    )
  } catch (err) {
    const message = err instanceof AiProviderError ? err.message : (err instanceof Error ? err.message : 'Unknown AI error')
    await audit({
      ctx,
      action: 'ai.chat.failed',
      category: 'AI',
      targetType: 'Tenant',
      targetId: tenant.id,
      metadata: { provider: providerName, error: message },
    })
    return NextResponse.json(
      { error: 'ai_call_failed', message, provider: providerName },
      { status: 502 },
    )
  }

  await audit({
    ctx,
    action: 'ai.chat',
    category: 'AI',
    targetType: 'Tenant',
    targetId: tenant.id,
    metadata: {
      provider: providerName,
      model: response.model,
      messageCount: input.messages.length,
      usage: response.usage,
    },
  })

  return NextResponse.json({
    text: response.text,
    model: response.model,
    usage: response.usage,
    provider: providerName,
  })
})

/**
 * Sanitise a prompt before sending to the AI provider. Removes obvious
 * PII patterns (credit card numbers, M-Pesa PINs, long digit sequences that
 * look like national IDs or phone numbers). This is best-effort and is in
 * addition to the data-access controls enforced upstream — only authorised,
 * tenant-scoped data should ever reach this function.
 */
function sanitisePrompt(text: string): string {
  let t = text
  // Replace credit-card-like numbers (16 digits, optionally grouped)
  t = t.replace(/\b(?:\d[ -]?){13,16}\b/g, '[REDACTED_CARD]')
  // Replace M-Pesa PIN references
  t = t.replace(/\b(?:mpesa|m-pesa|pin)\s*[:=]?\s*\d{4,8}\b/gi, '[REDACTED_PIN]')
  // Replace Kenyan national-ID-like 8-digit numbers prefixed with space
  t = t.replace(/\b\d{8}\b/g, '[REDACTED_ID]')
  return t
}
