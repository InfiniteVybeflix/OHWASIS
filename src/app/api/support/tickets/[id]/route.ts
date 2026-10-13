import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getRequestContext, requireUser } from '@/lib/session'
import { withErrorHandler } from '@/lib/api'
import { z } from 'zod'
import { audit } from '@/lib/audit'

interface RouteParams { params: Promise<{ id: string }> }

/**
 * GET /api/support/tickets/[id]
 * Returns a single ticket with all messages.
 * Authorised for: the ticket creator, platform operators, and (if tenant-linked) tenant members.
 */
export const GET = withErrorHandler(async (req, { params }: RouteParams) => {
  const ctx = await getRequestContext(req)
  const user = requireUser(ctx)
  const { id } = await params

  const ticket = await prisma.supportTicket.findUnique({
    where: { id },
    include: {
      messages: { orderBy: { createdAt: 'asc' } },
      tenant: { select: { id: true, handle: true, displayName: true } },
    },
  })
  if (!ticket) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  // Authorization: creator, platform operator, or tenant member
  if (ticket.userId !== user.id && user.globalRole < 2) {
    if (ticket.tenantId && ctx.membership && ticket.tenantId === ctx.tenant?.id) {
      // Tenant member — allowed
    } else {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }
  }

  // Mark messages from others as read
  await prisma.supportMessage.updateMany({
    where: { ticketId: id, senderId: { not: user.id }, isRead: false },
    data: { isRead: true, readAt: new Date() },
  })

  return NextResponse.json({ ticket })
})

const replySchema = z.object({
  body: z.string().min(1).max(5000),
})

/**
 * POST /api/support/tickets/[id]/messages
 * Reply to a ticket.
 */
export const POST = withErrorHandler(async (req, { params }: RouteParams) => {
  const ctx = await getRequestContext(req)
  const user = requireUser(ctx)
  const { id } = await params
  const input = await parseBody(req, replySchema)

  const ticket = await prisma.supportTicket.findUnique({ where: { id } })
  if (!ticket) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  // Authorization
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

  // Update ticket status
  await prisma.supportTicket.update({
    where: { id },
    data: { status: 'pending_response', updatedAt: new Date() },
  })

  await audit({
    ctx,
    action: 'support.ticket.reply',
    category: 'CREATE',
    targetType: 'SupportTicket',
    targetId: id,
  })

  return NextResponse.json({ message }, { status: 201 })
})

const statusSchema = z.object({
  status: z.enum(['open', 'pending_response', 'resolved', 'closed']),
})

/**
 * PATCH /api/support/tickets/[id]
 * Update ticket status (e.g. mark as resolved).
 */
export const PATCH = withErrorHandler(async (req, { params }: RouteParams) => {
  const ctx = await getRequestContext(req)
  const user = requireUser(ctx)
  const { id } = await params
  const input = await parseBody(req, statusSchema)

  const ticket = await prisma.supportTicket.findUnique({ where: { id } })
  if (!ticket) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  // Only creator or admin can change status
  if (ticket.userId !== user.id && user.globalRole < 2) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const updated = await prisma.supportTicket.update({
    where: { id },
    data: { status: input.status },
  })

  await audit({
    ctx,
    action: 'support.ticket.status_change',
    category: 'UPDATE',
    targetType: 'SupportTicket',
    targetId: id,
    metadata: { status: input.status },
  })

  return NextResponse.json({ ticket: updated })
})

import { parseBody } from '@/lib/api'
