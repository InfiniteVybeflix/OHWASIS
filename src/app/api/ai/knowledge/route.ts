import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getRequestContext, requireTenantMembership, requireMinRole } from '@/lib/session'
import { tenantScoped } from '@/lib/tenant'
import { withErrorHandler, parseBody } from '@/lib/api'
import { z } from 'zod'
import { audit } from '@/lib/audit'

/**
 * GET /api/ai/knowledge
 * Returns the active tenant's knowledge entries (owner view: includes pending AI suggestions).
 */
export const GET = withErrorHandler(async (req) => {
  const ctx = await getRequestContext(req)
  const { tenant } = requireTenantMembership(ctx)
  const entries = await prisma.businessKnowledge.findMany({
    where: tenantScoped(tenant.id),
    orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }],
  })
  return NextResponse.json({
    entries: entries.map((e) => ({
      ...e,
      // Confidence: null for owner-provided entries
      confidence: e.confidence ?? null,
      avgRating: e.avgRating ?? null,
    })),
  })
})

const knowledgeSchema = z.object({
  question: z.string().max(500).optional(),
  answer: z.string().min(1).max(5000),
  category: z.string().max(60).default('general'),
  source: z.enum(['OWNER_PROVIDED', 'AI_SUGGESTED', 'AI_GENERATED']).default('OWNER_PROVIDED'),
  status: z.enum(['APPROVED', 'PENDING', 'REJECTED']).default('APPROVED'),
})

/**
 * POST /api/ai/knowledge
 * Add a knowledge entry. Owner-provided entries default to APPROVED; AI-suggested
 * entries default to PENDING (awaiting owner approval).
 */
export const POST = withErrorHandler(async (req) => {
  const ctx = await getRequestContext(req)
  const { tenant } = requireTenantMembership(ctx)
  requireMinRole(ctx, 'CONTENT_EDITOR')
  const input = await parseBody(req, knowledgeSchema)
  const entry = await prisma.businessKnowledge.create({
    data: {
      tenantId: tenant.id,
      question: input.question ?? null,
      answer: input.answer,
      category: input.category,
      source: input.source,
      status: input.status,
    },
  })
  await audit({
    ctx,
    action: 'knowledge.create',
    category: 'CREATE',
    targetType: 'BusinessKnowledge',
    targetId: entry.id,
    metadata: { category: entry.category, source: entry.source, status: entry.status },
  })
  return NextResponse.json({ entry }, { status: 201 })
})
