import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getRequestContext, requireTenantMembership, requireMinRole } from '@/lib/session'
import { withErrorHandler } from '@/lib/api'
import { decryptSecret } from '@/lib/crypto'
import { chatComplete, AEVIBRON_DEFAULTS, AiProviderError } from '@/lib/ai/provider'
import { KNOWLEDGE_SUGGESTION_SYSTEM_PROMPT } from '@/lib/ai/prompts'
import { audit } from '@/lib/audit'

/**
 * POST /api/ai/weekly-review
 *
 * Triggers an AI review of the active business's knowledge base + recent
 * unanswered customer questions. Produces suggestions (new knowledge entries,
 * improvements to existing ones) that the owner can approve or reject.
 *
 * Each suggestion is persisted as a BusinessKnowledge entry with status=PENDING
 * — the owner must approve before it becomes active.
 *
 * Authorization: ADMINISTRATOR+ (the owner runs this manually from the dashboard).
 */
export const POST = withErrorHandler(async (req) => {
  const ctx = await getRequestContext(req)
  const { tenant } = requireTenantMembership(ctx)
  requireMinRole(ctx, 'ADMINISTRATOR')

  // Resolve AI provider
  let baseUrl = AEVIBRON_DEFAULTS.baseUrl
  let apiKey = process.env.AEVIBRON_GATEWAY_KEY ?? ''
  let defaultModel = AEVIBRON_DEFAULTS.defaultModel
  let authScheme: 'x-aevibron-key' | 'bearer' | 'x-api-key' = 'x-aevibron-key'
  let providerName = 'aevibron'

  const tenantConfig = await prisma.aiProviderConfig.findFirst({
    where: { tenantId: tenant.id, enabled: true },
  })
  if (tenantConfig) {
    try {
      const cfg = JSON.parse(decryptSecret(tenantConfig.encryptedConfig))
      baseUrl = cfg.baseUrl
      apiKey = cfg.apiKey
      defaultModel = cfg.defaultModel
      authScheme = cfg.authScheme
      providerName = tenantConfig.provider
    } catch {
      // Fall back
    }
  }

  if (!apiKey) {
    return NextResponse.json(
      { error: 'ai_not_configured', message: 'Configure an AI provider in the AI tab first.' },
      { status: 503 },
    )
  }

  // Fetch existing knowledge + recent unanswered questions
  const [knowledge, recentQuestions] = await Promise.all([
    prisma.businessKnowledge.findMany({
      where: { tenantId: tenant.id },
      select: { id: true, question: true, answer: true, category: true, timesUsed: true },
    }),
    prisma.aiAnswerLog.findMany({
      where: { tenantId: tenant.id, createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
      select: { question: true, answer: true, customerRating: true },
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
  ])

  // Fetch tenant info
  const tenantInfo = await prisma.tenant.findUnique({
    where: { id: tenant.id },
    select: { displayName: true, description: true, industry: true },
  })

  const userMessage = `Business: ${tenantInfo?.displayName}
Industry: ${tenantInfo?.industry}
Description: ${tenantInfo?.description ?? 'N/A'}

Existing knowledge entries:
${knowledge.length === 0 ? '(none yet)' : knowledge.map((k, i) => `${i + 1}. [id:${k.id}] Q: ${k.question ?? '(general)'} | A: ${k.answer} | used ${k.timesUsed} times`).join('\n')}

Recent customer questions (last 7 days):
${recentQuestions.length === 0 ? '(none)' : recentQuestions.map((q, i) => `${i + 1}. Q: ${q.question} | A given: ${q.answer.slice(0, 200)} | customer rating: ${q.customerRating ?? 'none'}`).join('\n')}`

  let response
  try {
    response = await chatComplete(
      { provider: providerName, baseUrl, apiKey, defaultModel, authScheme },
      {
        model: defaultModel,
        messages: [
          { role: 'system', content: KNOWLEDGE_SUGGESTION_SYSTEM_PROMPT },
          { role: 'user', content: userMessage },
        ],
        temperature: 0.4,
        maxTokens: 2000,
      },
    )
  } catch (err) {
    const message = err instanceof AiProviderError ? err.message : (err instanceof Error ? err.message : 'Unknown AI error')
    return NextResponse.json({ error: 'ai_call_failed', message }, { status: 502 })
  }

  // Parse suggestions
  let parsed: { suggestions?: Array<Record<string, unknown>>; improvements?: Array<Record<string, unknown>> }
  try {
    const jsonMatch = response.text.match(/\{[\s\S]*\}/)
    parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : { suggestions: [], improvements: [] }
  } catch {
    parsed = { suggestions: [], improvements: [] }
  }

  // Persist each suggestion as a PENDING knowledge entry (awaiting owner approval)
  const created: string[] = []
  for (const s of parsed.suggestions ?? []) {
    const entry = await prisma.businessKnowledge.create({
      data: {
        tenantId: tenant.id,
        question: s.question ? String(s.question) : null,
        answer: String(s.answer ?? ''),
        category: String(s.category ?? 'general'),
        source: 'AI_SUGGESTED',
        status: 'PENDING',
        confidence: s.confidence ? Number(s.confidence) : null,
        ownerNotes: s.reason ? String(s.reason) : null,
      },
    })
    created.push(entry.id)
  }

  await audit({
    ctx,
    action: 'ai.weekly_review',
    category: 'AI',
    targetType: 'Tenant',
    targetId: tenant.id,
    metadata: {
      suggestionsCount: created.length,
      improvementsCount: parsed.improvements?.length ?? 0,
    },
  })

  return NextResponse.json({
    suggestionsCreated: created.length,
    improvements: parsed.improvements ?? [],
    message: `${created.length} new knowledge suggestions pending your review. Check the Knowledge tab below.`,
  })
})
