import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getRequestContext, requireBusinessOwner } from '@/lib/session'
import { withErrorHandler, parseBody } from '@/lib/api'
import { z } from 'zod'
import { decryptSecret } from '@/lib/crypto'
import { chatComplete, AEVIBRON_DEFAULTS, AiProviderError } from '@/lib/ai/provider'
import { BUSINESS_SETUP_SYSTEM_PROMPT } from '@/lib/ai/prompts'
import { audit } from '@/lib/audit'

const businessSetupSchema = z.object({
  description: z.string().min(20, 'Please describe your business in at least 20 characters').max(2000),
  // Optional: a specific aspect to focus on (none for full setup)
  focus: z.enum(['full', 'name', 'products', 'hours', 'policies']).optional(),
  // Optional: retry with feedback
  feedback: z.string().max(1000).optional(),
  // Optional: existing draft ID this is a retry of
  parentDraftId: z.string().cuid().optional(),
})

/**
 * POST /api/ai/business-setup
 *
 * Business owner describes their business idea in natural language.
 * The AI proposes a structured setup (display name, tagline, products,
 * categories, delivery zones, payment methods, opening hours).
 *
 * The proposal is persisted as an AiDraft with status=PENDING — NOTHING is
 * published to the storefront until the owner approves (POST /api/ai/drafts/[id]/approve)
 * or edits+approves (POST /api/ai/drafts/[id]/approve with edited proposal).
 *
 * The owner can retry (this endpoint with parentDraftId) — each retry is a new
 * draft linked to the previous one.
 *
 * Authorization: BUSINESS_OWNER only. The proposal is tied to the requesting user
 * (not yet to a tenant — until approved, no tenant exists).
 */
export const POST = withErrorHandler(async (req) => {
  const ctx = await getRequestContext(req)
  const user = requireBusinessOwner(ctx)
  const input = await parseBody(req, businessSetupSchema)

  // Build the user-message prompt
  const userMessage = input.feedback
    ? `Original description: ${input.description}\n\nOwner feedback on previous proposal: ${input.feedback}\n\nPlease revise the proposal based on this feedback.`
    : `Business description: ${input.description}`

  // Resolve AI provider (tenant-level not applicable here since we're pre-tenant;
  // fall back to platform-level Aevibron key)
  const envKey = process.env.AEVIBRON_GATEWAY_KEY
  if (!envKey) {
    return NextResponse.json(
      {
        error: 'ai_not_configured',
        message:
          'AI is not yet configured. The platform operator needs to set AEVIBRON_GATEWAY_KEY. Once set, you can use this assistant.',
      },
      { status: 503 },
    )
  }

  // Call the AI
  let response
  try {
    response = await chatComplete(
      {
        provider: 'aevibron',
        baseUrl: AEVIBRON_DEFAULTS.baseUrl,
        apiKey: envKey,
        defaultModel: AEVIBRON_DEFAULTS.defaultModel,
        authScheme: 'x-aevibron-key',
      },
      {
        model: AEVIBRON_DEFAULTS.defaultModel,
        messages: [
          { role: 'system', content: BUSINESS_SETUP_SYSTEM_PROMPT },
          { role: 'user', content: userMessage },
        ],
        temperature: 0.6,
        maxTokens: 2500,
      },
    )
  } catch (err) {
    const message = err instanceof AiProviderError ? err.message : (err instanceof Error ? err.message : 'Unknown AI error')
    return NextResponse.json(
      { error: 'ai_call_failed', message },
      { status: 502 },
    )
  }

  // Parse the AI's response into the expected JSON shape
  let proposal: Record<string, unknown>
  try {
    // The AI might wrap JSON in markdown code blocks — extract it
    const jsonMatch = response.text.match(/\{[\s\S]*\}/)
    proposal = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(response.text)
  } catch {
    return NextResponse.json(
      {
        error: 'ai_parse_failed',
        message: 'The AI response could not be parsed. Please try again or rephrase your description.',
        rawText: response.text.slice(0, 500),
      },
      { status: 502 },
    )
  }

  // Persist as a draft — NOT published yet
  const draft = await prisma.aiDraft.create({
    data: {
      requestedBy: user.id,
      draftType: 'business_setup',
      prompt: input.description + (input.feedback ? ` | Feedback: ${input.feedback}` : ''),
      proposal: JSON.stringify(proposal),
      understanding: (proposal.understanding as string) ?? null,
      status: 'PENDING',
      model: response.model,
      parentDraftId: input.parentDraftId,
    },
  })

  await audit({
    ctx,
    action: 'ai.business_setup.proposed',
    category: 'AI',
    targetType: 'AiDraft',
    targetId: draft.id,
    metadata: { hasFeedback: !!input.feedback, parentDraftId: input.parentDraftId },
  })

  return NextResponse.json({
    draftId: draft.id,
    understanding: proposal.understanding,
    proposal,
    model: response.model,
    message: 'AI has prepared a proposal. Review it below, then Approve, Edit, or Retry.',
  })
})
