import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getRequestContext, requirePlatformOperator } from '@/lib/session'
import { withErrorHandler, parseBody } from '@/lib/api'
import { z } from 'zod'
import { audit } from '@/lib/audit'

interface RouteParams { params: Promise<{ id: string }> }

const patchSchema = z.object({
  status: z.enum(['ACTIVE', 'SUSPENDED', 'DISABLED']),
})

/**
 * PATCH /api/admin/users/[id]
 * Admin: suspend/activate a user account.
 */
export const PATCH = withErrorHandler(async (req, { params }: RouteParams) => {
  const ctx = await getRequestContext(req)
  requirePlatformOperator(ctx)
  const { id } = await params
  const input = await parseBody(req, patchSchema)

  // Don't allow admin to suspend themselves
  if (id === ctx.user!.id) {
    return NextResponse.json({ error: 'cannot_suspend_self' }, { status: 400 })
  }

  const user = await prisma.user.update({
    where: { id },
    data: { status: input.status },
    select: { id: true, email: true, status: true },
  })

  // If suspended, revoke all sessions
  if (input.status !== 'ACTIVE') {
    await prisma.session.updateMany({
      where: { userId: id, revokedAt: null },
      data: { revokedAt: new Date() },
    })
  }

  await audit({
    ctx,
    action: `user.${input.status.toLowerCase()}`,
    category: 'UPDATE',
    targetType: 'User',
    targetId: id,
    metadata: { email: user.email },
  })

  return NextResponse.json({ user })
})
