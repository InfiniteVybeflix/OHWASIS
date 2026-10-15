import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyPassword, createSession, setSessionCookie, getRequestContext } from '@/lib/session'
import { loginSchema } from '@/lib/validation/schemas'
import { withErrorHandler, parseBody } from '@/lib/api'
import { audit } from '@/lib/audit'
import { tryAdminLogin, ensureAdminUser } from '@/lib/admin-auth'

// Rate limit: simple in-memory (per IP) — sufficient for one-instance dev.
const attempts = new Map<string, { count: number; firstAt: number }>()
const WINDOW_MS = 60_000
const MAX = 20

export const POST = withErrorHandler(async (req) => {
  const input = await parseBody(req, loginSchema)
  // Basic IP rate limit
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown'
  const now = Date.now()
  const rec = attempts.get(ip)
  if (rec && now - rec.firstAt < WINDOW_MS) {
    if (rec.count >= MAX) {
      return NextResponse.json({ error: 'rate_limited', message: 'Too many attempts' }, { status: 429 })
    }
    rec.count += 1
  } else {
    attempts.set(ip, { count: 1, firstAt: now })
  }

  // 1. Try admin login first (env-configured admin email + password).
  //    If ADMIN_EMAIL env var is not set, tryAdminLogin throws — we treat that
  //    as "admin auth is not configured" and skip silently.
  let isAdmin = false
  try {
    isAdmin = await tryAdminLogin(input.email, input.password)
  } catch (adminErr) {
    console.warn('[login] admin auth skipped:', adminErr instanceof Error ? adminErr.message : adminErr)
  }
  let user
  if (isAdmin) {
    user = await ensureAdminUser(input.email)
  } else {
    // 2. Regular user login
    user = await prisma.user.findUnique({ where: { email: input.email } })
    if (!user || !verifyPassword(input.password, user.passwordHash)) {
      return NextResponse.json({ error: 'invalid_credentials' }, { status: 401 })
    }
    if (user.status !== 'ACTIVE') {
      return NextResponse.json({ error: 'account_disabled', status: user.status }, { status: 403 })
    }
  }

  const { session, token } = await createSession(user.id, req)
  const ctx = await getRequestContext(req)
  await audit({
    ctx: { ...ctx, user: { id: user.id, email: user.email, name: user.name, globalRole: user.globalRole, status: user.status, accountType: user.accountType as string | undefined } },
    action: 'login',
    category: 'AUTH',
    targetType: 'User',
    targetId: user.id,
    metadata: { ip, isAdmin },
  })
  const headers = new Headers()
  headers.append('Set-Cookie', setSessionCookie(token, session.expiresAt))
  return NextResponse.json(
    {
      user: { id: user.id, email: user.email, name: user.name, globalRole: user.globalRole, accountType: user.accountType },
      sessionId: session.id,
      isAdmin,
    },
    { headers },
  )
})
