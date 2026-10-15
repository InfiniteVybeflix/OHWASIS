// /api/auth/send-verification
//
// Generates + dispatches a new email verification code for the authenticated
// user. Admin/platform operators are exempt. Rate-limited to 60s per user.
// In dev with no SMTP configured, returns the raw `devCode` in the response
// so the developer can complete the verification flow without real SMTP.

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getRequestContext } from '@/lib/session'
import { withErrorHandler } from '@/lib/api'
import { sendVerification } from '@/lib/verification'
import { audit } from '@/lib/audit'

export const POST = withErrorHandler(async (req) => {
  const ctx = await getRequestContext(req)
  if (!ctx.user) {
    return NextResponse.json({ error: 'authentication_required' }, { status: 401 })
  }
  const user = await prisma.user.findUnique({ where: { id: ctx.user.id } })
  if (!user) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }

  const result = await sendVerification(user)
  await audit({
    ctx,
    action: 'auth.send_verification',
    category: 'AUTH',
    targetType: 'User',
    targetId: user.id,
    metadata: { sent: result.sent, delivered: result.delivered, reason: result.reason ?? null },
  })

  return NextResponse.json(result, { status: result.sent ? 201 : 200 })
})
