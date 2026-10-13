import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getRequestContext, requireUser } from '@/lib/session'
import { withErrorHandler, parseBody, queryParams } from '@/lib/api'
import { z } from 'zod'
import { audit } from '@/lib/audit'
import { dispatch } from '@/lib/notifications'

const createSchema = z.object({
  category: z.enum(['bug_report', 'product_request', 'enquiry', 'custom']),
  customCategory: z.string().max(100).optional(),
  subject: z.string().min(1).max(200),
  message: z.string().min(1).max(5000),
  tenantHandle: z.string().min(3).max(32).optional(),
})

/**
 * GET /api/support/tickets
 * Returns the current user's support tickets.
 * Platform operators see ALL tickets.
 */
export const GET = withErrorHandler(async (req) => {
  const ctx = await getRequestContext(req)
  const user = requireUser(ctx)
  const q = queryParams(req)
  const status = q.get('status') ?? undefined

  const where = ctx.user!.globalRole >= 2
    ? { ...(status ? { status } : {}) } // admin sees all
    : { userId: user.id, ...(status ? { status } : {}) }

  const tickets = await prisma.supportTicket.findMany({
    where,
    include: {
      tenant: { select: { id: true, handle: true, displayName: true } } ,
      messages: { orderBy: { createdAt: 'desc' }, take: 1 },
      _count: { select: { messages: true } },
    },
    orderBy: { updatedAt: 'desc' },
    take: 50,
  })

  return NextResponse.json({
    tickets: tickets.map((t) => ({
      id: t.id,
      category: t.category,
      customCategory: t.customCategory,
      subject: t.subject,
      status: t.status,
      priority: t.priority,
      tenant: t.tenant,
      lastMessage: t.messages[0]?.body ?? '',
      messageCount: t._count.messages,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    })),
  })
})

/**
 * POST /api/support/tickets
 * Create a new support ticket with an initial message.
 */
export const POST = withErrorHandler(async (req) => {
  const ctx = await getRequestContext(req)
  const user = requireUser(ctx)
  const input = await parseBody(req, createSchema)

  let tenantId: string | null = null
  if (input.tenantHandle) {
    const tenant = await prisma.tenant.findUnique({ where: { handle: input.tenantHandle } })
    if (tenant) tenantId = tenant.id
  }

  const ticket = await prisma.supportTicket.create({
    data: {
      userId: user.id,
      tenantId,
      category: input.category,
      customCategory: input.customCategory ?? null,
      subject: input.subject,
      status: 'open',
      messages: {
        create: {
          senderId: user.id,
          senderName: user.name ?? user.email,
          senderRole: user.globalRole >= 2 ? 'admin' : (user.accountType === 'BUSINESS_OWNER' ? 'business_owner' : 'customer'),
          body: input.message,
        },
      },
    },
    include: { tenant: { select: { id: true, handle: true, displayName: true } } },
  })

  // Notify admins (platform operators) of new tickets
  if (user.globalRole < 2) {
    await dispatch({
      channel: 'IN_APP',
      template: 'SUPPORT_TICKET_NEW',
      recipient: 'admin',
      subject: `New support ticket: ${ticket.subject}`,
      body: `${user.email} opened a ${input.category} ticket: ${input.message.slice(0, 200)}`,
    })
  }

  await audit({
    ctx,
    action: 'support.ticket.create',
    category: 'CREATE',
    targetType: 'SupportTicket',
    targetId: ticket.id,
    metadata: { category: input.category, subject: input.subject },
  })

  return NextResponse.json({ ticket }, { status: 201 })
})
