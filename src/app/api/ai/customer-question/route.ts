import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { resolveTenantByHandle } from '@/lib/tenant'
import { withErrorHandler, parseBody, queryParams } from '@/lib/api'
import { z } from 'zod'
import { decryptSecret } from '@/lib/crypto'
import { chatComplete, AEVIBRON_DEFAULTS, AiProviderError } from '@/lib/ai/provider'
import { CUSTOMER_QUESTION_SYSTEM_PROMPT } from '@/lib/ai/prompts'

const questionSchema = z.object({
  question: z.string().min(3).max(1000),
  // Optional: customer rating on a previous answer (thumbs up=1 / down=-1)
  previousAnswerId: z.string().cuid().optional(),
  previousAnswerRating: z.number().int().min(-1).max(1).optional(),
})

/**
 * POST /api/ai/customer-question?handle=<tenant-handle>
 *
 * PUBLIC endpoint (no auth required — customers browse storefronts without logging in).
 *
 * The customer asks a question about a specific business. The AI answers using
 * ONLY that business's knowledge base — never another business's knowledge.
 *
 * The answer is logged in AiAnswerLog so the business owner can review it later,
 * suggest improvements, and approve better answers (which feed back into the
 * business's knowledge base as new entries).
 *
 * If no knowledge entries exist for the business, the AI honestly says so and
 * directs the customer to contact the business directly.
 */
export const POST = withErrorHandler(async (req) => {
  const q = queryParams(req)
  const handle = q.get('handle')
  if (!handle) {
    return NextResponse.json({ error: 'handle_required' }, { status: 400 })
  }
  let tenant
  try {
    tenant = await resolveTenantByHandle(handle)
  } catch {
    return NextResponse.json({ error: 'storefront_not_found' }, { status: 404 })
  }

  const input = await parseBody(req, questionSchema)

  // If customer rated a previous answer, record that feedback first
  if (input.previousAnswerId && input.previousAnswerRating !== undefined) {
    await prisma.aiAnswerLog.update({
      where: { id: input.previousAnswerId },
      data: { customerRating: input.previousAnswerRating },
    }).catch(() => { /* ignore — answer may have been deleted */ })
  }

  // Fetch this tenant's APPROVED knowledge entries
  const knowledge = await prisma.businessKnowledge.findMany({
    where: { tenantId: tenant.id, status: 'APPROVED' },
    select: { id: true, question: true, answer: true, category: true },
  })

  // Build the knowledge context for the AI
  const knowledgeContext = knowledge.length === 0
    ? 'No knowledge entries are available for this business yet. Be honest with the customer.'
    : knowledge.map((k, i) => `--- Knowledge Entry ${i + 1} (id: ${k.id}, category: ${k.category}) ---\nQ: ${k.question ?? '(general note)'}\nA: ${k.answer}`).join('\n\n')

  // Resolve AI provider — prefer tenant-level config, fall back to platform-level Aevibron
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
      // Fall back to platform-level
    }
  }

  if (!apiKey) {
    // No AI configured — return a graceful fallback that doesn't fake an answer
    return NextResponse.json({
      answer: 'I\'m sorry, I can\'t answer questions about this business right now. Please contact them directly.',
      confidence: 0,
      needsHumanFollowup: true,
      followupReason: 'AI not configured for this business',
      contactInfo: {
        email: tenant.contactEmail,
        phone: tenant.contactPhone,
      },
    })
  }

  // Build the prompt
  const userMessage = `Business name: ${tenant.displayName}
Business description: ${tenant.description ?? '(no description provided)'}

Knowledge base:
${knowledgeContext}

Customer question: ${input.question}`

  let response
  try {
    response = await chatComplete(
      { provider: providerName, baseUrl, apiKey, defaultModel, authScheme },
      {
        model: defaultModel,
        messages: [
          { role: 'system', content: CUSTOMER_QUESTION_SYSTEM_PROMPT },
          { role: 'user', content: userMessage },
        ],
        temperature: 0.3,
        maxTokens: 800,
      },
    )
  } catch (err) {
    const message = err instanceof AiProviderError ? err.message : (err instanceof Error ? err.message : 'Unknown AI error')
    return NextResponse.json(
      { error: 'ai_call_failed', message, contactInfo: { email: tenant.contactEmail, phone: tenant.contactPhone } },
      { status: 502 },
    )
  }

  // Parse the AI's structured response
  let parsed: { answer?: string; usedKnowledgeIds?: string[]; confidence?: number; needsHumanFollowup?: boolean; followupReason?: string }
  try {
    const jsonMatch = response.text.match(/\{[\s\S]*\}/)
    parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(response.text)
  } catch {
    // If parsing fails, use the raw text as the answer
    parsed = { answer: response.text, usedKnowledgeIds: [], confidence: 0.3, needsHumanFollowup: false }
  }

  // Log the answer for owner review
  const answerLog = await prisma.aiAnswerLog.create({
    data: {
      tenantId: tenant.id,
      question: input.question,
      answer: parsed.answer ?? response.text,
      usedKnowledgeIds: JSON.stringify(parsed.usedKnowledgeIds ?? []),
      model: response.model,
    },
  })

  // Increment timesUsed for each knowledge entry that was used
  if (parsed.usedKnowledgeIds && parsed.usedKnowledgeIds.length > 0) {
    await prisma.businessKnowledge.updateMany({
      where: { id: { in: parsed.usedKnowledgeIds }, tenantId: tenant.id },
      data: {
        timesUsed: { increment: 1 },
        lastUsedAt: new Date(),
      },
    })
  }

  return NextResponse.json({
    answerId: answerLog.id,
    answer: parsed.answer,
    confidence: parsed.confidence ?? 0.5,
    needsHumanFollowup: parsed.needsHumanFollowup ?? false,
    followupReason: parsed.followupReason,
    contactInfo: parsed.needsHumanFollowup ? {
      email: tenant.contactEmail,
      phone: tenant.contactPhone,
    } : undefined,
  })
})
