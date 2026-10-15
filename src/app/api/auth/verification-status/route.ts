// /api/auth/verification-status
//
// Returns the current verification state for the authenticated user. Used by
// the frontend to decide whether to show the verification banner + whether to
// auto-resend a code (when the existing one is missing/expired).

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getRequestContext } from '@/lib/session'
import { withErrorHandler } from '@/lib/api'
import {
  needsFreshCode,
  maskEmail,
  isDevOtpVisible,
  VERIFICATION_RATE_LIMIT_MS,
  VERIFICATION_TTL_MS,
  MAX_VERIFICATION_ATTEMPTS,
} from '@/lib/verification'

export const GET = withErrorHandler(async (req) => {
  const ctx = await getRequestContext(req)
  if (!ctx.user) {
    return NextResponse.json({ verificationRequired: false, isPlatformOperator: false })
  }
  const user = await prisma.user.findUnique({ where: { id: ctx.user.id } })
  if (!user) {
    return NextResponse.json({ verificationRequired: false, isPlatformOperator: false })
  }

  const isPlatformOperator = user.globalRole >= 2 || user.accountType === 'PLATFORM_OPERATOR'
  const verified = Boolean(user.emailVerified)
  const codeExpired = user.verificationExpiresAt ? user.verificationExpiresAt.getTime() < Date.now() : true
  const attemptsRemaining = Math.max(0, MAX_VERIFICATION_ATTEMPTS - user.verificationAttempts)
  const lastSentAt = user.lastVerificationSentAt
  const nextResendAt = lastSentAt
    ? new Date(lastSentAt.getTime() + VERIFICATION_RATE_LIMIT_MS).toISOString()
    : new Date().toISOString()
  const expiresAt = user.verificationExpiresAt?.toISOString() ?? null

  return NextResponse.json({
    isPlatformOperator,
    emailVerified: verified,
    maskedEmail: maskEmail(user.email),
    verificationRequired: !isPlatformOperator && !verified,
    needsFreshCode: needsFreshCode(user),
    codeExpired,
    attemptsRemaining,
    lastSentAt: lastSentAt?.toISOString() ?? null,
    nextResendAt,
    expiresAt,
    rateLimitMs: VERIFICATION_RATE_LIMIT_MS,
    ttlMs: VERIFICATION_TTL_MS,
    maxAttempts: MAX_VERIFICATION_ATTEMPTS,
    devOtpVisible: isDevOtpVisible(),
  })
})
