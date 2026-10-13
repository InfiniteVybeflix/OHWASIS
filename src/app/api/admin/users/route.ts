import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getRequestContext, requirePlatformOperator } from '@/lib/session'
import { withErrorHandler, queryParams } from '@/lib/api'

/**
 * GET /api/admin/users?q=search
 * Admin: list all users (customers + business owners + operators).
 */
export const GET = withErrorHandler(async (req) => {
  const ctx = await getRequestContext(req)
  requirePlatformOperator(ctx)
  const q = queryParams(req)
  const search = q.get('q') ?? undefined

  const where = search ? {
    OR: [
      { email: { contains: search } },
      { name: { contains: search } },
    ],
  } : {}

  const users = await prisma.user.findMany({
    where,
    select: {
      id: true,
      email: true,
      name: true,
      accountType: true,
      globalRole: true,
      status: true,
      createdAt: true,
      _count: { select: { memberships: true, customerOrders: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  })

  return NextResponse.json({
    users: users.map((u) => ({
      id: u.id,
      email: u.email,
      name: u.name,
      accountType: u.accountType,
      globalRole: u.globalRole,
      status: u.status,
      createdAt: u.createdAt,
      businessCount: u._count.memberships,
      orderCount: u._count.customerOrders,
    })),
  })
})
