import { NextResponse } from 'next/server'
import { getRequestContext, revokeSession, clearSessionCookie } from '@/lib/session'
import { withErrorHandler } from '@/lib/api'
import { audit } from '@/lib/audit'

export const POST = withErrorHandler(async (req) => {
  const ctx = await getRequestContext(req)
  if (ctx.session) {
    await revokeSession(ctx.session.id)
    await audit({ ctx, action: 'logout', category: 'AUTH' })
  }
  const headers = new Headers()
  headers.append('Set-Cookie', clearSessionCookie())
  return NextResponse.json({ ok: true }, { headers })
})
