'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useOhwasisStore, apiFetch } from '@/lib/store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2, MailCheck, ShieldAlert, RefreshCw, X } from 'lucide-react'

interface VerificationStatus {
  isPlatformOperator: boolean
  emailVerified: boolean
  maskedEmail: string
  verificationRequired: boolean
  needsFreshCode: boolean
  codeExpired: boolean
  attemptsRemaining: number
  lastSentAt: string | null
  nextResendAt: string
  expiresAt: string | null
  rateLimitMs: number
  ttlMs: number
  maxAttempts: number
  devOtpVisible: boolean
}

interface SendResult {
  sent: boolean
  delivered: boolean
  channel: 'EMAIL' | 'IN_APP'
  devCode?: string
  nextResendAt: string
  expiresAt: string
  reason?: string
}

/**
 * Email verification banner — shown whenever a non-admin user is logged in but
 * hasn't verified their email. Renders inline at the top of the page (above the
 * main view). Auto-collapses when dismissed but reappears on next app open.
 *
 * Behavior:
 * - On mount: fetches /api/auth/verification-status to decide whether to show
 * - If needsFreshCode (no code, expired, or attempts exhausted) AND we're past
 *   nextResendAt: auto-calls /api/auth/send-verification (this satisfies the
 *   "auto-resend on app return when expired" requirement)
 * - Shows OTP input (6 digits); on submit calls /api/auth/verify-email
 * - On success: triggers refreshSession so /me is re-fetched and banner unmounts
 * - Resend button is disabled until nextResendAt; countdown shown
 */
export function EmailVerificationBanner() {
  const session = useOhwasisStore((s) => s.session)
  const refreshSession = useOhwasisStore((s) => s.refreshSession)
  const pushToast = useOhwasisStore((s) => s.pushToast)

  const [status, setStatus] = useState<VerificationStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [code, setCode] = useState('')
  const [devCode, setDevCode] = useState<string | null>(null)
  const [dismissed, setDismissed] = useState(false)
  const [now, setNow] = useState(Date.now())
  const autoSentRef = useRef(false)

  const fetchStatus = useCallback(async () => {
    try {
      const data = await apiFetch<VerificationStatus>('/api/auth/verification-status')
      setStatus(data)
      return data
    } catch {
      return null
    } finally {
      setLoading(false)
    }
  }, [])

  // Poll `now` every second for the resend countdown
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  // Fetch status on mount + when session.user changes
  useEffect(() => {
    if (!session.user) {
      setLoading(false)
      return
    }
    // Admin is exempt — skip fetching
    if (session.isPlatformOperator) {
      setLoading(false)
      return
    }
    if (session.emailVerificationRequired === false) {
      // Already verified — no banner needed
      setLoading(false)
      return
    }
    setLoading(true)
    void fetchStatus()
  }, [session.user, session.isPlatformOperator, session.emailVerificationRequired, fetchStatus])

  // Auto-resend when the code is missing/expired AND we're past the rate limit
  // (this is the "auto email them when they go back to app if expired" requirement)
  useEffect(() => {
    if (!status || autoSentRef.current) return
    if (!status.verificationRequired) return
    if (!status.needsFreshCode) return
    if (status.isPlatformOperator) return
    const nextResendAtMs = Date.parse(status.nextResendAt)
    if (Number.isNaN(nextResendAtMs)) return
    if (now < nextResendAtMs) return
    autoSentRef.current = true
    void (async () => {
      setSending(true)
      try {
        const r = await apiFetch<SendResult>('/api/auth/send-verification', { method: 'POST' })
        if (r.devCode) setDevCode(r.devCode)
        pushToast({
          type: r.delivered ? 'success' : 'info',
          message: r.delivered
            ? `Verification code sent to your email.`
            : r.reason === 'rate_limited'
              ? `Please wait before requesting another code.`
              : `We couldn't deliver the email (${r.reason ?? 'unknown'}). ${r.devCode ? 'Dev code shown below.' : 'Configure SMTP_* env vars.'}`,
        })
        await fetchStatus()
      } catch (e) {
        pushToast({ type: 'error', message: e instanceof Error ? e.message : 'Failed to send code' })
      } finally {
        setSending(false)
      }
    })()
  }, [status, now, pushToast, fetchStatus])

  const handleResend = useCallback(async () => {
    setSending(true)
    try {
      const r = await apiFetch<SendResult>('/api/auth/send-verification', { method: 'POST' })
      if (r.devCode) setDevCode(r.devCode)
      pushToast({
        type: r.delivered ? 'success' : 'info',
        message: r.delivered
          ? `Verification code sent.`
          : `Email delivery failed: ${r.reason ?? 'unknown'}${r.devCode ? ' (dev code shown below)' : ''}`,
      })
      await fetchStatus()
    } catch (e) {
      pushToast({ type: 'error', message: e instanceof Error ? e.message : 'Failed to resend' })
    } finally {
      setSending(false)
    }
  }, [fetchStatus, pushToast])

  const handleVerify = useCallback(async () => {
    if (code.length !== 6) {
      pushToast({ type: 'error', message: 'Enter the 6-digit code' })
      return
    }
    setVerifying(true)
    try {
      await apiFetch('/api/auth/verify-email', {
        method: 'POST',
        body: JSON.stringify({ code }),
      })
      pushToast({ type: 'success', message: 'Email verified! Welcome to OHWASIS.' })
      setCode('')
      setDevCode(null)
      await refreshSession()
      await fetchStatus()
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Verification failed'
      pushToast({ type: 'error', message: msg })
      setCode('')
      await fetchStatus()
    } finally {
      setVerifying(false)
    }
  }, [code, pushToast, refreshSession, fetchStatus])

  // Don't render if no user, admin, or already verified
  if (!session.user || session.isPlatformOperator || !session.emailVerificationRequired) {
    return null
  }
  if (loading) {
    return null
  }
  if (dismissed) {
    return (
      <button
        onClick={() => setDismissed(false)}
        className="fixed bottom-20 sm:bottom-4 right-4 z-40 rounded-full bg-amber-500 text-white p-3 shadow-lg hover:bg-amber-600 transition-colors"
        title="Show email verification"
        aria-label="Show email verification"
      >
        <MailCheck className="h-5 w-5" />
      </button>
    )
  }

  const nextResendMs = status ? Date.parse(status.nextResendAt) - now : 0
  const canResend = nextResendMs <= 0
  const resendSeconds = Math.max(0, Math.ceil(nextResendMs / 1000))

  return (
    <div className="sticky top-0 z-30 w-full border-b border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-700 dark:bg-amber-950/95 dark:text-amber-100">
      <div className="mx-auto flex max-w-5xl flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-4">
        <div className="flex flex-1 items-start gap-3">
          <ShieldAlert className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-600 dark:text-amber-400" />
          <div className="flex-1 text-sm">
            <p className="font-medium">
              Verify your email — {status?.maskedEmail ?? 'your account'}
            </p>
            <p className="text-xs text-amber-800/80 dark:text-amber-200/80">
              {status?.codeExpired && status?.lastSentAt
                ? 'Your previous code expired. '
                : status?.attemptsRemaining !== undefined && status.attemptsRemaining < status.maxAttempts
                  ? `Wrong code — ${status.attemptsRemaining} attempts left. `
                  : ''}
              Enter the 6-digit code we sent to your email to unlock checkout, product creation, and reviews.
              {!status?.devOtpVisible && ' Check your spam folder if you don\'t see it.'}
            </p>
            {status?.devOtpVisible && devCode && (
              <p className="mt-1 rounded bg-amber-200/60 px-2 py-1 text-xs font-mono dark:bg-amber-900/40">
                <strong>[DEV] Code:</strong> {devCode}{' '}
                <span className="text-amber-700 dark:text-amber-300">(SMTP not configured)</span>
              </p>
            )}
          </div>
        </div>
        <div className="flex flex-shrink-0 items-center gap-2">
          <Input
            type="text"
            inputMode="numeric"
            pattern="\d{6}"
            maxLength={6}
            placeholder="000000"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            className="w-32 font-mono text-center tracking-widest"
            aria-label="6-digit verification code"
          />
          <Button onClick={handleVerify} disabled={verifying || code.length !== 6} size="sm">
            {verifying && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
            Verify
          </Button>
          <Button
            onClick={handleResend}
            disabled={sending || !canResend}
            size="sm"
            variant="outline"
            title={canResend ? 'Send a new code' : `Wait ${resendSeconds}s`}
          >
            {sending ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
            <span className="ml-1 hidden sm:inline">
              {canResend ? 'Resend' : `${resendSeconds}s`}
            </span>
          </Button>
          <button
            onClick={() => setDismissed(true)}
            className="ml-1 rounded p-1 hover:bg-amber-200 dark:hover:bg-amber-900/60"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
