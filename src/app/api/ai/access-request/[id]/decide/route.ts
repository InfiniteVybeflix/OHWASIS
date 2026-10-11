import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getRequestContext, requirePlatformOperator } from '@/lib/session'
import { withErrorHandler, parseBody } from '@/lib/api'
import { audit } from '@/lib/audit'
import { dispatch } from '@/lib/notifications'

interface RouteParams { params: Promise<{ id: string }> }

/**
 * POST /api/ai/access-request/[id]/decide
 *
 * Platform operator approves or rejects an AI access request. Records the
 * decision-maker, decision notes, and timestamp. Notifies the requesting
 * tenant of the decision via in-app notification (truthful status).
 */
export const POST = withErrorHandler(async (req, { params }: RouteParams) => {
  const ctx = await getRequestContext(req)
  const user = requirePlatformOperator(ctx)
  const { id } = await params
  const body = (await req.json().catch(() => ({}))) as {
    decision: 'APPROVED' | 'REJECTED' | 'REVOKED'
    notes?: string
  }
  if (!body.decision || !['APPROVED', 'REJECTED', 'REVOKED'].includes(body.decision)) {
    return NextResponse.json({ error: 'invalid_decision' }, { status: 400 })
  }

  const existing = await prisma.aiAccessRequest.findUnique({
    where: { id },
    include: { tenant: true, user: true },
  })
  if (!existing) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }

  const updated = await prisma.aiAccessRequest.update({
    where: { id },
    data: {
      status: body.decision,
      decisionNotes: body.notes ?? null,
      decidedBy: user.id,
      decidedAt: new Date(),
    },
  })

  await audit({
    ctx,
    action: `ai_access.${body.decision.toLowerCase()}`,
    category: 'UPDATE',
    targetType: 'AiAccessRequest',
    targetId: updated.id,
    metadata: {
      tenantId: existing.tenantId,
      tenantHandle: existing.tenant.handle,
      requestedBy: existing.user.email,
      notes: body.notes,
    },
  })

  await dispatch({
    tenantId: existing.tenantId,
    userId: existing.requestedBy,
    channel: 'IN_APP',
    template: 'AI_ACCESS_DECISION',
    recipient: existing.user.email,
    subject: `AI access request ${body.decision.toLowerCase()}`,
    body: `Your request for ${existing.provider} access has been ${body.decision.toLowerCase()}.${body.notes ? ` Notes: ${body.notes}` : ''}`,
  })

  return NextResponse.json({ request: updated })
})
