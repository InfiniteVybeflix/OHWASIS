// src/lib/verification.ts — email verification flow for non-admin accounts.
//
// Design:
// - 6-digit numeric OTP, hashed with scrypt (raw code never persisted to DB)
// - TTL: 10 minutes per code
// - Max 5 attempts per code, then code is invalidated (must request new)
// - Rate limit: 60 seconds between sends (per user)
// - On signup: a code is generated + an email is attempted via dispatch()
//   (email channel honestly reports FAILED if SMTP is not configured).
// - In dev (NODE_ENV !== 'production'): if SMTP is not configured, the
//   raw code is returned by the API so the developer can complete the flow.
//   In production this never happens — a real SMTP provider MUST be set up.
// - Admin (PLATFORM_OPERATOR) accounts are exempt — their emailVerified is
//   auto-set to now when their User row is created (see ensureAdminUser).

import crypto from 'crypto'
import { prisma } from '@/lib/db'
import { dispatch } from '@/lib/notifications'
import type { User } from '@prisma/client'

export const VERIFICATION_TTL_MS = 10 * 60 * 1000 // 10 minutes
export const VERIFICATION_RATE_LIMIT_MS = 60 * 1000 // 60 seconds between sends
export const MAX_VERIFICATION_ATTEMPTS = 5

function hashOtp(code: string): string {
  const salt = crypto.randomBytes(16).toString('hex')
  const hash = crypto.scryptSync(code, salt, 32).toString('hex')
  return `otp$${salt}$${hash}`
}

export function verifyOtp(code: string, stored: string): boolean {
  try {
    const [scheme, salt, hash] = stored.split('$')
    if (scheme !== 'otp' || !salt || !hash) return false
    const computed = crypto.scryptSync(code, salt, 32).toString('hex')
    return crypto.timingSafeEqual(Buffer.from(computed, 'hex'), Buffer.from(hash, 'hex'))
  } catch {
    return false
  }
}

function genSixDigit(): string {
  // Avoid biased modulo — use rejection sampling on a 32-bit buffer.
  const max = 1_000_000
  const limit = Math.floor(0xffffffff / max) * max
  while (true) {
    const buf = crypto.randomBytes(4)
    const n = buf.readUInt32BE(0)
    if (n >= limit) continue
    const code = (n % max).toString().padStart(6, '0')
    return code
  }
}

function smtpConfigured(): boolean {
  return Boolean(
    process.env.SMTP_HOST &&
    process.env.SMTP_USER &&
    process.env.SMTP_PASS &&
    (process.env.SMTP_FROM || process.env.MAIL_FROM),
  )
}

export function isDevOtpVisible(): boolean {
  return process.env.NODE_ENV !== 'production' && !smtpConfigured()
}

export interface SendResult {
  sent: boolean
  delivered: boolean
  channel: 'EMAIL' | 'IN_APP'
  /** Present ONLY when isDevOtpVisible() is true — the raw 6-digit code. */
  devCode?: string
  nextResendAt: string // ISO datetime
  expiresAt: string
  reason?: string
}

/**
 * Generate + persist a new verification code, attempt delivery via email.
 * If SMTP is not configured in dev, also surfaces the raw code so the
 * developer can complete the flow without real SMTP.
 *
 * Rate-limited: returns the existing code's nextResendAt if called too soon.
 */
export async function sendVerification(user: User): Promise<SendResult> {
  // Platform operators are exempt — they shouldn't be calling this.
  if (user.globalRole >= 2 || user.accountType === 'PLATFORM_OPERATOR') {
    return {
      sent: false,
      delivered: true,
      channel: 'EMAIL',
      nextResendAt: new Date(Date.now() + VERIFICATION_RATE_LIMIT_MS).toISOString(),
      expiresAt: new Date(Date.now() + VERIFICATION_TTL_MS).toISOString(),
      reason: 'admin_exempt',
    }
  }

  // If already verified, no-op.
  if (user.emailVerified) {
    return {
      sent: false,
      delivered: true,
      channel: 'EMAIL',
      nextResendAt: new Date(Date.now() + VERIFICATION_RATE_LIMIT_MS).toISOString(),
      expiresAt: new Date(Date.now() + VERIFICATION_TTL_MS).toISOString(),
      reason: 'already_verified',
    }
  }

  // Rate limit: only allow one send per minute.
  if (user.lastVerificationSentAt) {
    const elapsed = Date.now() - user.lastVerificationSentAt.getTime()
    if (elapsed < VERIFICATION_RATE_LIMIT_MS) {
      const nextResendAt = new Date(user.lastVerificationSentAt.getTime() + VERIFICATION_RATE_LIMIT_MS)
      // The developer should reuse the previously-returned code (it's still
      // valid for 10 minutes from issue). We deliberately do NOT return the
      // raw code here — it's already in the prior API response and the
      // IN_APP notification persisted at send time.
      return {
        sent: false,
        delivered: false,
        channel: 'EMAIL',
        nextResendAt: nextResendAt.toISOString(),
        expiresAt: user.verificationExpiresAt?.toISOString() ?? new Date().toISOString(),
        reason: 'rate_limited',
      }
    }
  }

  // Generate a fresh code, hash it, persist.
  const code = genSixDigit()
  const codeHash = hashOtp(code)
  const expiresAt = new Date(Date.now() + VERIFICATION_TTL_MS)
  const sentAt = new Date()

  await prisma.user.update({
    where: { id: user.id },
    data: {
      verificationCodeHash: codeHash,
      verificationExpiresAt: expiresAt,
      verificationAttempts: 0,
      lastVerificationSentAt: sentAt,
    },
  })

  // Attempt email delivery. dispatch() honestly marks FAILED if SMTP isn't set.
  // The email body uses a simple text format (mobile-friendly).
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || ''
  const subject = 'Your OHWASIS sign-up code'
  const body = [
    `Hi ${user.name || 'there'},`,
    '',
    `Here is your OHWASIS verification code: ${code}`,
    '',
    `It expires in 10 minutes. If you didn't request this, you can ignore this email.`,
    appUrl ? `\nOpen OHWASIS: ${appUrl}` : '',
    '',
    '— OHWASIS',
  ].join('\n')

  const notif = await dispatch({
    userId: user.id,
    channel: 'EMAIL',
    template: 'email_verification',
    recipient: user.email,
    subject,
    body,
    metadata: { codeHash: codeHash.slice(0, 12) + '…' },
  })

  // In dev with no SMTP, also create an IN_APP copy of the code so the user
  // can self-recover. We DO NOT include the raw code in the IN_APP body in
  // production (security: must require SMTP).
  if (isDevOtpVisible()) {
    await dispatch({
      userId: user.id,
      channel: 'IN_APP',
      template: 'email_verification_dev',
      recipient: user.email,
      subject: '[DEV] Your OHWASIS verification code',
      body: `[DEV MODE — SMTP not configured] Your verification code is: ${code}\n\nThis code is visible in dev only. In production, you must configure SMTP_* env vars.`,
    })
  }

  return {
    sent: true,
    delivered: notif.status === 'SENT',
    channel: 'EMAIL',
    nextResendAt: new Date(sentAt.getTime() + VERIFICATION_RATE_LIMIT_MS).toISOString(),
    expiresAt: expiresAt.toISOString(),
    reason: notif.status === 'FAILED' ? notif.error ?? 'delivery_failed' : undefined,
    ...(isDevOtpVisible() ? { devCode: code } : {}),
  }
}

export interface VerifyResult {
  ok: boolean
  reason?: 'invalid_code' | 'expired' | 'too_many_attempts' | 'already_verified' | 'no_code'
  attemptsRemaining?: number
}

export async function verifyEmailCode(user: User, code: string): Promise<VerifyResult> {
  if (user.emailVerified) return { ok: true, reason: 'already_verified' }
  if (!user.verificationCodeHash || !user.verificationExpiresAt) {
    return { ok: false, reason: 'no_code' }
  }
  if (user.verificationExpiresAt.getTime() < Date.now()) {
    return { ok: false, reason: 'expired' }
  }
  if (user.verificationAttempts >= MAX_VERIFICATION_ATTEMPTS) {
    return { ok: false, reason: 'too_many_attempts' }
  }

  const matched = verifyOtp(code, user.verificationCodeHash)

  if (!matched) {
    const attempts = user.verificationAttempts + 1
    // If max reached, invalidate the code so the user must request a new one.
    const invalidate = attempts >= MAX_VERIFICATION_ATTEMPTS
    await prisma.user.update({
      where: { id: user.id },
      data: invalidate
        ? { verificationAttempts: attempts, verificationCodeHash: null, verificationExpiresAt: null }
        : { verificationAttempts: attempts },
    })
    return {
      ok: false,
      reason: invalidate ? 'too_many_attempts' : 'invalid_code',
      attemptsRemaining: Math.max(0, MAX_VERIFICATION_ATTEMPTS - attempts),
    }
  }

  // Matched — mark verified, clear code fields.
  await prisma.user.update({
    where: { id: user.id },
    data: {
      emailVerified: new Date(),
      verificationCodeHash: null,
      verificationExpiresAt: null,
      verificationAttempts: 0,
      lastVerificationSentAt: null,
    },
  })
  return { ok: true }
}

/**
 * Returns whether the user needs a fresh verification code (i.e. their code is
 * missing, expired, or invalidated by too many attempts). Used by the frontend
 * to decide whether to auto-resend on app return.
 */
export function needsFreshCode(user: User): boolean {
  if (user.globalRole >= 2 || user.accountType === 'PLATFORM_OPERATOR') return false
  if (user.emailVerified) return false
  if (!user.verificationExpiresAt) return true
  if (user.verificationExpiresAt.getTime() < Date.now()) return true
  if (user.verificationAttempts >= MAX_VERIFICATION_ATTEMPTS) return true
  return false
}

/**
 * Mask an email like "user@example.com" → "u•••@e•••.com" for UI display.
 */
export function maskEmail(email: string): string {
  const [local, domain] = email.split('@')
  if (!local || !domain) return email
  const maskedLocal = local.length <= 2 ? local[0] + '•' : local[0] + '•'.repeat(Math.min(local.length - 1, 4))
  const [d, ...rest] = domain.split('.')
  const maskedDomain = (d?.[0] ?? '') + '•'.repeat(Math.min(Math.max(d.length - 1, 2), 4))
  return `${maskedLocal}@${maskedDomain}.${rest.join('.')}`
}
