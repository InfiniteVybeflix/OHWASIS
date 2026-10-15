import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getRequestContext } from '@/lib/session'
import { withErrorHandler } from '@/lib/api'

export const GET = withErrorHandler(async (req) => {
  const ctx = await getRequestContext(req)
  if (!ctx.user) {
    return NextResponse.json({
      user: null,
      tenant: null,
      memberships: [],
      isPlatformOperator: false,
      isBusinessOwner: false,
      isCustomer: true, // anonymous = treat as customer
      emailVerified: null,
      emailVerificationRequired: false,
    })
  }
  // Fetch user's memberships (across tenants) — only metadata, never secrets
  const memberships = await prisma.membership.findMany({
    where: { userId: ctx.user.id, status: 'ACTIVE' },
    include: { tenant: { select: { id: true, handle: true, displayName: true, industry: true, openStatus: true } } },
  })

  // Fetch the full user record so we can include the email verification state.
  const userRow = await prisma.user.findUnique({
    where: { id: ctx.user.id },
    select: { emailVerified: true, accountType: true, globalRole: true },
  })

  const accountType = ctx.user.accountType ?? 'CUSTOMER'
  const isPlatformOperator = ctx.user.globalRole >= 2
  const emailVerified = userRow?.emailVerified ?? null
  // Platform operators are exempt — they verify via env-configured ADMIN_EMAIL/PASSWORD_HASH.
  const emailVerificationRequired = !isPlatformOperator && !emailVerified

  return NextResponse.json({
    user: { ...ctx.user, accountType, emailVerified: emailVerified?.toISOString() ?? null },
    tenant: ctx.tenant,
    membership: ctx.membership,
    memberships: memberships.map((m) => ({
      role: m.role,
      status: m.status,
      tenant: m.tenant,
    })),
    isPlatformOperator,
    isBusinessOwner: accountType === 'BUSINESS_OWNER' || ctx.user.globalRole >= 1,
    isCustomer: accountType === 'CUSTOMER',
    emailVerified: emailVerified?.toISOString() ?? null,
    emailVerificationRequired,
  })
})
