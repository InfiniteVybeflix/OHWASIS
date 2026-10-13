import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getRequestContext, requireTenantMembership, requireMinRole } from '@/lib/session'
import { withErrorHandler, parseBody } from '@/lib/api'
import { z } from 'zod'
import { decryptSecret } from '@/lib/crypto'
import { chatComplete, AEVIBRON_DEFAULTS, AiProviderError } from '@/lib/ai/provider'
import { CMS_DRAFT_SYSTEM_PROMPT } from '@/lib/ai/prompts'
import { audit } from '@/lib/audit'

const cmsDraftSchema = z.object({
  description: z.string().min(10, 'Describe what you want in at least 10 characters').max(2000),
  pageType: z.enum(['about', 'privacy', 'terms', 'faq', 'offer', 'promotion', 'custom']).default('custom'),
  feedback: z.string().max(1000).optional(),
  parentDraftId: z.string().cuid().optional(),
})

/**
 * POST /api/cms/ai-draft
 *
 * Business owner describes what they want (e.g. "an offer page for 20% off all
 * water bottles this weekend"). AI generates clean HTML for a CMS page.
 *
 * The proposal is persisted as an AiDraft with status=PENDING — NOTHING is
 * published until the owner approves via POST /api/ai/drafts/[id]/approve.
 *
 * Owner can: Approve (publishes as DRAFT page), Edit (inline edit before
 * approving), Retry (send feedback for a new version), or Cancel (discard).
 */
export const POST = withErrorHandler(async (req) => {
  const ctx = await getRequestContext(req)
  const { tenant } = requireTenantMembership(ctx)
  requireMinRole(ctx, 'CONTENT_EDITOR')
  const input = await parseBody(req, cmsDraftSchema)

  // Resolve AI provider (tenant-level or platform-level)
  const tenantConfig = await prisma.aiProviderConfig.findFirst({
    where: { tenantId: tenant.id, enabled: true },
  })

  let baseUrl = AEVIBRON_DEFAULTS.baseUrl
  let apiKey = process.env.AEVIBRON_GATEWAY_KEY ?? ''
  let defaultModel = AEVIBRON_DEFAULTS.defaultModel
  let authScheme: 'x-aevibron-key' | 'bearer' | 'x-api-key' = 'x-aevibron-key'
  let providerName = 'aevibron'

  if (tenantConfig) {
    try {
      const cfg = JSON.parse(decryptSecret(tenantConfig.encryptedConfig))
      baseUrl = cfg.baseUrl
      apiKey = cfg.apiKey
      defaultModel = cfg.defaultModel
      authScheme = cfg.authScheme
      providerName = tenantConfig.provider
    } catch { /* fall back */ }
  }

  if (!apiKey) {
    return NextResponse.json(
      { error: 'ai_not_configured', message: 'Configure an AI provider in the AI tab first.' },
      { status: 503 },
    )
  }

  const userMessage = input.feedback
    ? `Previous description: ${input.description}\n\nOwner feedback: ${input.feedback}\n\nPlease revise the page content.`
    : `Page type: ${input.pageType}\n\nDescription: ${input.description}`

  let response
  try {
    response = await chatComplete(
      { provider: providerName, baseUrl, apiKey, defaultModel, authScheme },
      {
        model: defaultModel,
        messages: [
          { role: 'system', content: CMS_DRAFT_SYSTEM_PROMPT },
          { role: 'user', content: userMessage },
        ],
        temperature: 0.6,
        maxTokens: 2000,
      },
    )
  } catch (err) {
    const message = err instanceof AiProviderError ? err.message : (err instanceof Error ? err.message : 'Unknown AI error')
    return NextResponse.json({ error: 'ai_call_failed', message }, { status: 502 })
  }

  // Parse the AI's structured response
  let proposal: { understanding?: string; title?: string; slug?: string; body?: string; seo?: Record<string, string> }
  try {
    const jsonMatch = response.text.match(/\{[\s\S]*\}/)
    proposal = jsonMatch ? JSON.parse(jsonMatch[0]) : { body: response.text }
  } catch {
    proposal = { body: response.text, title: input.pageType, slug: input.pageType }
  }

  // Sanitize the HTML body before saving (same sanitiser as the pages endpoint)
  const sanitisedBody = sanitiseHtml(proposal.body ?? '')

  // Persist as a draft — NOT published
  const draft = await prisma.aiDraft.create({
    data: {
      tenantId: tenant.id,
      requestedBy: ctx.user!.id,
      draftType: 'cms_page',
      prompt: input.description + (input.feedback ? ` | Feedback: ${input.feedback}` : ''),
      proposal: JSON.stringify({
        ...proposal,
        body: sanitisedBody,
      }),
      understanding: proposal.understanding ?? null,
      status: 'PENDING',
      model: response.model,
      parentDraftId: input.parentDraftId,
    },
  })

  await audit({
    ctx,
    action: 'ai.cms_draft.proposed',
    category: 'AI',
    targetType: 'AiDraft',
    targetId: draft.id,
    metadata: { pageType: input.pageType, hasFeedback: !!input.feedback },
  })

  return NextResponse.json({
    draftId: draft.id,
    understanding: proposal.understanding,
    proposal: {
      ...proposal,
      body: sanitisedBody,
    },
    model: response.model,
    message: 'AI has prepared a page draft. Review it, then Approve, Edit, or Retry.',
  })
})

function sanitiseHtml(html: string): string {
  return html
    .replace(/<\/?(script|style|iframe|object|embed|link|meta|base|form|input|button|textarea|select|option)[^>]*>/gi, '')
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/(href|src)\s*=\s*["']?\s*javascript:/gi, '$1="')
    .replace(/(href|src)\s*=\s*["']?\s*data:/gi, '$1="')
    .replace(/\sstyle\s*=\s*("[^"]*"|'[^']*')/gi, '')
}
