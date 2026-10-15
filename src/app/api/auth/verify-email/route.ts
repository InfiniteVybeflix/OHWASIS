// /api/auth/verify-email
//
// Verifies the user's email by checking the submitted 6-digit code against
// the scrypt hash stored on the User record. On success: sets emailVerified,
// clears the code fields. On failure: increments verificationAttempts; after
// MAX_VERIFICATION_ATTEMPTS the code is invalidated (user must request new).

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { getRequestContext } from '@/lib/session'
import { withErrorHandler, parseBody } from '@/lib/api'
import { verifyEmailCode } from '@/lib/verification'
import { audit } from '@/lib/audit'

const bodySchema = z.object({
  code: z.string().regex(/^\d{6}$/, 'Code must be exactly 6 digits'),
})

export const POST = withErrorHandler(async (req) => {
  const ctx = await getRequestContext(req)
  if (!ctx.user) {
    return NextResponse.json({ error: 'authentication_required' }, { status: 401 })
  }
  const input = await parseBody(req, bodySchema)
  const user = await prisma.user.findUnique({ where: { id: ctx.user.id } })
  if (!user) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }

  const result = await verifyEmailCode(user, input.code)
  await audit({
    ctx,
    action: 'auth.verify_email',
    category: 'AUTH',
    targetType: 'User',
    targetId: user.id,
    metadata: { ok: result.ok, reason: result.reason ?? null, attemptsRemaining: result.attemptsRemaining ?? null },
  })

  if (!result.ok) {
    return NextResponse.json(
      { error: 'verification_failed', reason: result.reason, attemptsRemaining: result.attemptsRemaining },
      { status: 400 },
    )
  }
  return NextResponse.json({ ok: true, emailVerified: true })
})
