import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getRequestContext, requireUser } from '@/lib/session'
import { withErrorHandler, parseBody } from '@/lib/api'
import { z } from 'zod'
import { audit } from '@/lib/audit'

interface RouteParams { params: Promise<{ id: string }> }

const replySchema = z.object({
  body: z.string().min(1).max(5000),
})

/**
 * POST /api/support/tickets/[id]/messages
 * Reply to a support ticket.
 */
export const POST = withErrorHandler(async (req, { params }: RouteParams) => {
  const ctx = await getRequestContext(req)
  const user = requireUser(ctx)
  const { id } = await params
  const input = await parseBody(req, replySchema)

  const ticket = await prisma.supportTicket.findUnique({ where: { id } })
  if (!ticket) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  // Authorization: creator, admin, or tenant member
  if (ticket.userId !== user.id && user.globalRole < 2) {
    if (ticket.tenantId && ctx.membership && ticket.tenantId === ctx.tenant?.id) {
      // ok
    } else {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }
  }

  const message = await prisma.supportMessage.create({
    data: {
      ticketId: id,
      senderId: user.id,
      senderName: user.name ?? user.email,
      senderRole: user.globalRole >= 2 ? 'admin' : (user.accountType === 'BUSINESS_OWNER' ? 'business_owner' : 'customer'),
      body: input.body,
    },
  })

  // Update ticket status based on who replied
  const newStatus = user.id === ticket.userId ? 'open' : 'pending_response'
  await prisma.supportTicket.update({
    where: { id },
    data: { status: newStatus, updatedAt: new Date() },
  })

  await audit({
    ctx,
    action: 'support.message.create',
    category: 'CREATE',
    targetType: 'SupportTicket',
    targetId: id,
  })

  return NextResponse.json({ message }, { status: 201 })
})
