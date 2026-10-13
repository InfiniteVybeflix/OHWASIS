import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { hashPassword, createSession, setSessionCookie, getRequestContext } from '@/lib/session'
import { signupSchema } from '@/lib/validation/schemas'
import { withErrorHandler, parseBody } from '@/lib/api'
import { audit } from '@/lib/audit'

export const POST = withErrorHandler(async (req) => {
  const input = await parseBody(req, signupSchema)
  // Check existing email
  const existing = await prisma.user.findUnique({ where: { email: input.email } })
  if (existing) {
    return NextResponse.json({ error: 'email_in_use' }, { status: 409 })
  }
  const passwordHash = await hashPassword(input.password)
  // Set globalRole based on accountType
  // CUSTOMER → globalRole 0; BUSINESS_OWNER → globalRole 1; PLATFORM_OPERATOR (only set via direct DB)
  const globalRole = input.accountType === 'BUSINESS_OWNER' ? 1 : 0
  const user = await prisma.user.create({
    data: {
      email: input.email,
      passwordHash,
      name: input.name ?? null,
      accountType: input.accountType,
      globalRole,
    },
  })
  const { session, token } = await createSession(user.id, req)
  const ctx = await getRequestContext(req)
  await audit({
    ctx: { ...ctx, user: { id: user.id, email: user.email, name: user.name, globalRole: user.globalRole, status: user.status } },
    action: 'signup',
    category: 'AUTH',
    targetType: 'User',
    targetId: user.id,
    metadata: { email: user.email, accountType: user.accountType },
  })
  const headers = new Headers()
  headers.append('Set-Cookie', setSessionCookie(token, session.expiresAt))
  return NextResponse.json(
    {
      user: { id: user.id, email: user.email, name: user.name, globalRole: user.globalRole, accountType: user.accountType },
      sessionId: session.id,
    },
    { status: 201, headers },
  )
})
