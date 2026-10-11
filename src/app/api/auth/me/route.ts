import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getRequestContext } from '@/lib/session'
import { withErrorHandler } from '@/lib/api'

export const GET = withErrorHandler(async (req) => {
  const ctx = await getRequestContext(req)
  if (!ctx.user) {
    return NextResponse.json({ user: null, tenant: null, memberships: [] })
  }
  // Fetch user's memberships (across tenants) — only metadata, never secrets
  const memberships = await prisma.membership.findMany({
    where: { userId: ctx.user.id, status: 'ACTIVE' },
    include: { tenant: { select: { id: true, handle: true, displayName: true, industry: true } } },
  })
  return NextResponse.json({
    user: ctx.user,
    tenant: ctx.tenant,
    membership: ctx.membership,
    memberships: memberships.map((m) => ({
      role: m.role,
      status: m.status,
      tenant: m.tenant,
    })),
    isPlatformOperator: ctx.user.globalRole >= 2,
  })
})
