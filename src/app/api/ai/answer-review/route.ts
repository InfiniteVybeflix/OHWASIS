import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getRequestContext, requireTenantMembership, requireMinRole } from '@/lib/session'
import { tenantScoped } from '@/lib/tenant'
import { withErrorHandler, queryParams, parseBody } from '@/lib/api'
import { z } from 'zod'
import { audit } from '@/lib/audit'

/**
 * GET /api/ai/answer-review
 *
 * Lists the tenant's recent AI answers to customer questions, with customer
 * ratings. Owners can review, mark as reviewed, or provide a better answer
 * (which becomes a new BusinessKnowledge entry).
 */
export const GET = withErrorHandler(async (req) => {
  const ctx = await getRequestContext(req)
  const { tenant } = requireTenantMembership(ctx)
  const q = queryParams(req)
  const page = Math.max(1, Number(q.get('page') ?? '1'))
  const pageSize = Math.min(50, Math.max(1, Number(q.get('pageSize') ?? '20')))
  const filter = q.get('filter') ?? 'all' // all | unrated | negative | unreviewed

  const where = {
    ...tenantScoped(tenant.id),
    ...(filter === 'unrated' ? { customerRating: null } : {}),
    ...(filter === 'negative' ? { customerRating: -1 } : {}),
    ...(filter === 'unreviewed' ? { ownerReviewed: false } : {}),
  }

  const [items, total] = await Promise.all([
    prisma.aiAnswerLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { feedback: true },
    }),
    prisma.aiAnswerLog.count({ where }),
  ])

  return NextResponse.json({
    items: items.map((i) => ({
      ...i,
      usedKnowledgeIds: JSON.parse(i.usedKnowledgeIds || '[]'),
    })),
    total,
    page,
    pageSize,
  })
})

const feedbackSchema = z.object({
  betterAnswer: z.string().min(1).max(2000),
  addToKnowledge: z.boolean().default(true),
  // Optional: the question to use if creating a knowledge entry
  knowledgeQuestion: z.string().max(500).optional(),
  knowledgeCategory: z.string().max(60).default('general'),
})

/**
 * POST /api/ai/answer-review
 *
 * Owner provides a better answer for a past AI response. Optionally adds it as
 * a new APPROVED knowledge entry for future use.
 *
 * Body: { answerLogId, betterAnswer, addToKnowledge, knowledgeQuestion, knowledgeCategory }
 */
export const POST = withErrorHandler(async (req) => {
  const ctx = await getRequestContext(req)
  const { tenant } = requireTenantMembership(ctx)
  requireMinRole(ctx, 'CONTENT_EDITOR')
  const body = await req.json().catch(() => ({}))
  const answerLogId = body.answerLogId
  if (!answerLogId || typeof answerLogId !== 'string') {
    return NextResponse.json({ error: 'answerLogId_required' }, { status: 400 })
  }
  const input = await parseBody(req, feedbackSchema).catch(() => feedbackSchema.parse(body))

  // Verify the answer log belongs to this tenant
  const answerLog = await prisma.aiAnswerLog.findUnique({ where: { id: answerLogId } })
  if (!answerLog || answerLog.tenantId !== tenant.id) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }

  // Create the feedback record + mark the answer as reviewed
  const feedback = await prisma.aiAnswerFeedback.create({
    data: {
      answerLogId,
      ownerId: ctx.user!.id,
      betterAnswer: input.betterAnswer,
      addToKnowledge: input.addToKnowledge,
    },
  })

  await prisma.aiAnswerLog.update({
    where: { id: answerLogId },
    data: { ownerReviewed: true, reviewedAt: new Date(), ownerFeedback: input.betterAnswer },
  })

  // Optionally add as a new APPROVED knowledge entry
  let knowledgeId: string | null = null
  if (input.addToKnowledge) {
    const k = await prisma.businessKnowledge.create({
      data: {
        tenantId: tenant.id,
        question: input.knowledgeQuestion ?? answerLog.question,
        answer: input.betterAnswer,
        category: input.knowledgeCategory,
        source: 'OWNER_PROVIDED',
        status: 'APPROVED',
        // Link to the answer log via metadata for traceability
      },
    })
    knowledgeId = k.id
    await prisma.aiAnswerLog.update({
      where: { id: answerLogId },
      data: { improvedKnowledgeId: knowledgeId },
    })
  }

  await audit({
    ctx,
    action: 'ai.answer_feedback',
    category: 'AI',
    targetType: 'AiAnswerLog',
    targetId: answerLogId,
    metadata: { addedKnowledge: input.addToKnowledge, knowledgeId },
  })

  return NextResponse.json({ feedbackId: feedback.id, knowledgeId, message: 'Feedback recorded. Future similar questions will use the better answer.' })
})
