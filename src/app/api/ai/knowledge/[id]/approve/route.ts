import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getRequestContext, requireTenantMembership, requireMinRole } from '@/lib/session'
import { assertTenantOwns } from '@/lib/tenant'
import { withErrorHandler } from '@/lib/api'
import { audit } from '@/lib/audit'

interface RouteParams { params: Promise<{ id: string }> }

/**
 * POST /api/ai/knowledge/[id]/approve
 * Approve a pending AI-suggested knowledge entry. Moves it from PENDING to APPROVED.
 */
export const POST = withErrorHandler(async (req, { params }: RouteParams) => {
  const ctx = await getRequestContext(req)
  const { tenant } = requireTenantMembership(ctx)
  requireMinRole(ctx, 'CONTENT_EDITOR')
  const { id } = await params
  const existing = await prisma.businessKnowledge.findUnique({ where: { id } })
  assertTenantOwns(existing, tenant.id, 'knowledge_entry')
  if (existing!.status !== 'PENDING') {
    return NextResponse.json({ error: 'not_pending', message: `Entry is already ${existing!.status.toLowerCase()}` }, { status: 400 })
  }
  const updated = await prisma.businessKnowledge.update({
    where: { id },
    data: { status: 'APPROVED', lastReviewedAt: new Date() },
  })
  await audit({
    ctx,
    action: 'knowledge.approve',
    category: 'UPDATE',
    targetType: 'BusinessKnowledge',
    targetId: id,
  })
  return NextResponse.json({ entry: updated })
})
