import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getRequestContext, requireTenantMembership, requireMinRole } from '@/lib/session'
import { assertTenantOwns } from '@/lib/tenant'
import { withErrorHandler, parseBody } from '@/lib/api'
import { z } from 'zod'
import { audit } from '@/lib/audit'

interface RouteParams { params: Promise<{ id: string }> }

const patchSchema = z.object({
  question: z.string().max(500).optional(),
  answer: z.string().min(1).max(5000).optional(),
  category: z.string().max(60).optional(),
  status: z.enum(['APPROVED', 'PENDING', 'REJECTED']).optional(),
  ownerNotes: z.string().max(500).optional(),
})

export const PATCH = withErrorHandler(async (req, { params }: RouteParams) => {
  const ctx = await getRequestContext(req)
  const { tenant } = requireTenantMembership(ctx)
  requireMinRole(ctx, 'CONTENT_EDITOR')
  const { id } = await params
  const existing = await prisma.businessKnowledge.findUnique({ where: { id } })
  assertTenantOwns(existing, tenant.id, 'knowledge_entry')
  const input = await parseBody(req, patchSchema)
  const updated = await prisma.businessKnowledge.update({
    where: { id },
    data: {
      ...(input.question !== undefined && { question: input.question || null }),
      ...(input.answer && { answer: input.answer }),
      ...(input.category && { category: input.category }),
      ...(input.status && { status: input.status }),
      ...(input.ownerNotes !== undefined && { ownerNotes: input.ownerNotes }),
      lastReviewedAt: new Date(),
    },
  })
  await audit({
    ctx,
    action: 'knowledge.update',
    category: 'UPDATE',
    targetType: 'BusinessKnowledge',
    targetId: id,
    metadata: { fields: Object.keys(input), status: updated.status },
  })
  return NextResponse.json({ entry: updated })
})

export const DELETE = withErrorHandler(async (req, { params }: RouteParams) => {
  const ctx = await getRequestContext(req)
  const { tenant } = requireTenantMembership(ctx)
  requireMinRole(ctx, 'CONTENT_EDITOR')
  const { id } = await params
  const existing = await prisma.businessKnowledge.findUnique({ where: { id } })
  assertTenantOwns(existing, tenant.id, 'knowledge_entry')
  await prisma.businessKnowledge.delete({ where: { id } })
  await audit({
    ctx,
    action: 'knowledge.delete',
    category: 'DELETE',
    targetType: 'BusinessKnowledge',
    targetId: id,
  })
  return NextResponse.json({ ok: true })
})
