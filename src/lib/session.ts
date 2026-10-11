// src/lib/session.ts — authentication, session, and request context.
//
// Uses a stateless session token (random 256-bit) stored in the database with
// an expiry. Sessions are revocable and disabled-user logins fail immediately.
// Cookies use SameSite=Lax, HttpOnly, and Secure when on HTTPS.
//
// Tenant resolution: a client may pass `x-ohwasis-tenant` header (the tenant
// handle) OR be authenticated as a user whose membership grants access to the
// tenant. In all cases the tenant is resolved server-side from the handle and
// the user's authority is checked against `Membership`.

import { cookies } from 'next/headers'
import crypto from 'crypto'
import { prisma } from '@/lib/db'
import { resolveTenantByHandle, resolveTenantByDomain } from '@/lib/tenant'

export const SESSION_COOKIE = 'ohwasis_session'
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 14 // 14 days

export interface RequestContext {
  user: {
    id: string
    email: string
    name: string | null
    globalRole: number
    status: string
  } | null
  session: {
    id: string
    expiresAt: Date
  } | null
  tenant: {
    id: string
    handle: string
    displayName: string
  } | null
  membership: {
    role: string
    status: string
  } | null
  ip: string | null
  userAgent: string | null
}

// Bcrypt is heavier; we use scrypt from node:crypto to avoid an extra dep.
// scrypt is well-suited for password hashing and built into Node.
export async function hashPassword(plaintext: string): Promise<string> {
  if (!plaintext || plaintext.length < 8) {
    throw new Error('Password must be at least 8 characters')
  }
  const salt = crypto.randomBytes(16).toString('hex')
  const hash = crypto.scryptSync(plaintext, salt, 64).toString('hex')
  return `scrypt$${salt}$${hash}`
}

export function verifyPassword(plaintext: string, stored: string): boolean {
  try {
    const [scheme, salt, hash] = stored.split('$')
    if (scheme !== 'scrypt' || !salt || !hash) return false
    const computed = crypto.scryptSync(plaintext, salt, 64).toString('hex')
    // Constant-time compare to avoid timing attacks
    return crypto.timingSafeEqual(Buffer.from(computed, 'hex'), Buffer.from(hash, 'hex'))
  } catch {
    return false
  }
}

export async function createSession(userId: string, req?: Request) {
  const token = crypto.randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS)
  const ip = req ? extractIp(req) : null
  const userAgent = req ? req.headers.get('user-agent') : null
  const session = await prisma.session.create({
    data: { userId, token, expiresAt, ip, userAgent },
  })
  return { session, token }
}

export async function revokeSession(token: string): Promise<void> {
  await prisma.session.updateMany({
    where: { token, revokedAt: null },
    data: { revokedAt: new Date() },
  })
}

export async function getUserFromToken(token: string | undefined) {
  if (!token) return null
  const session = await prisma.session.findUnique({
    where: { token },
    include: { user: true },
  })
  if (!session) return null
  if (session.revokedAt) return null
  if (session.expiresAt.getTime() < Date.now()) return null
  if (session.user.status !== 'ACTIVE') return null
  return { session, user: session.user }
}

/**
 * Build the request context from cookies + headers. Safe to call from any
 * Next.js Server Action, route handler, or middleware-thunk.
 */
export async function getRequestContext(req: Request): Promise<RequestContext> {
  const ip = extractIp(req)
  const userAgent = req.headers.get('user-agent')

  // Resolve session
  const cookieHeader = req.headers.get('cookie') || ''
  const token = parseCookie(cookieHeader, SESSION_COOKIE)
  const sessionResult = await getUserFromToken(token || undefined)

  // Resolve tenant — prefer verified custom domain, then handle header
  const host = (req.headers.get('x-forwarded-host') || req.headers.get('host') || '').split(':')[0]
  let tenant = await resolveTenantByDomain(host)
  let tenantHandleFromHeader: string | null = null
  if (!tenant) {
    const h = req.headers.get('x-ohwasis-tenant')
    if (h) {
      tenantHandleFromHeader = h
      try {
        tenant = await resolveTenantByHandle(h)
      } catch {
        tenant = null
      }
    }
  }

  // Resolve membership
  let membership: RequestContext['membership'] = null
  if (sessionResult && tenant) {
    const m = await prisma.membership.findUnique({
      where: { userId_tenantId: { userId: sessionResult.user.id, tenantId: tenant.id } },
    })
    if (m && m.status === 'ACTIVE') {
      membership = { role: m.role, status: m.status }
    }
  }

  return {
    user: sessionResult
      ? {
          id: sessionResult.user.id,
          email: sessionResult.user.email,
          name: sessionResult.user.name,
          globalRole: sessionResult.user.globalRole,
          status: sessionResult.user.status,
        }
      : null,
    session: sessionResult
      ? { id: sessionResult.session.id, expiresAt: sessionResult.session.expiresAt }
      : null,
    tenant: tenant ? { id: tenant.id, handle: tenant.handle, displayName: tenant.displayName } : null,
    membership,
    ip,
    userAgent,
  }
}

export function extractIp(req: Request): string | null {
  const xff = req.headers.get('x-forwarded-for')
  if (xff) {
    const first = xff.split(',')[0]?.trim()
    if (first) return first
  }
  const xri = req.headers.get('x-real-ip')
  if (xri) return xri
  return null
}

export function parseCookie(cookieHeader: string, name: string): string | null {
  const parts = cookieHeader.split(';')
  for (const p of parts) {
    const [k, ...rest] = p.trim().split('=')
    if (k === name) {
      return decodeURIComponent(rest.join('='))
    }
  }
  return null
}

export function setSessionCookie(token: string, expiresAt: Date): string {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : ''
  const sameSite = '; SameSite=Lax'
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; HttpOnly; Path=/${secure}${sameSite}; Max-Age=${Math.floor((expiresAt.getTime() - Date.now()) / 1000)}`
}

export function clearSessionCookie(): string {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : ''
  return `${SESSION_COOKIE}=; HttpOnly; Path=/${secure}; SameSite=Lax; Max-Age=0`
}

/**
 * For server actions / route handlers — read the cookie store imperatively.
 * Wraps `next/headers.cookies()` so callers don't need to.
 */
export async function getContextFromNextCookies(): Promise<RequestContext> {
  const cookieStore = await cookies()
  const token = cookieStore.get(SESSION_COOKIE)?.value
  const sessionResult = await getUserFromToken(token)

  // In server actions, tenant context comes from a separate cookie set by
  // the storefront switcher on the client.
  const tenantHandle = cookieStore.get('ohwasis_active_tenant')?.value
  let tenant: RequestContext['tenant'] = null
  if (tenantHandle) {
    try {
      const t = await resolveTenantByHandle(tenantHandle)
      tenant = { id: t.id, handle: t.handle, displayName: t.displayName }
    } catch {
      tenant = null
    }
  }

  let membership: RequestContext['membership'] = null
  if (sessionResult && tenant) {
    const m = await prisma.membership.findUnique({
      where: { userId_tenantId: { userId: sessionResult.user.id, tenantId: tenant.id } },
    })
    if (m && m.status === 'ACTIVE') {
      membership = { role: m.role, status: m.status }
    }
  }

  return {
    user: sessionResult
      ? {
          id: sessionResult.user.id,
          email: sessionResult.user.email,
          name: sessionResult.user.name,
          globalRole: sessionResult.user.globalRole,
          status: sessionResult.user.status,
        }
      : null,
    session: sessionResult
      ? { id: sessionResult.session.id, expiresAt: sessionResult.session.expiresAt }
      : null,
    tenant,
    membership,
    ip: null,
    userAgent: null,
  }
}

/**
 * Authorization helpers — throw AuthorizationError when denied.
 */
export class AuthorizationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AuthorizationError'
  }
}

export function requireUser(ctx: RequestContext) {
  if (!ctx.user) throw new AuthorizationError('Authentication required')
  return ctx.user
}

export function requirePlatformOperator(ctx: RequestContext) {
  const u = requireUser(ctx)
  if (u.globalRole < 2) {
    throw new AuthorizationError('Platform operator access required')
  }
  return u
}

export function requireTenantMembership(ctx: RequestContext, minRoles: string[] = []) {
  if (!ctx.tenant) throw new AuthorizationError('Tenant context required')
  if (!ctx.membership) throw new AuthorizationError('Not a member of this tenant')
  if (ctx.membership.status !== 'ACTIVE') {
    throw new AuthorizationError('Membership is not active')
  }
  if (minRoles.length > 0 && !minRoles.includes(ctx.membership.role)) {
    throw new AuthorizationError(`Requires one of roles: ${minRoles.join(', ')}`)
  }
  return { user: ctx.user!, tenant: ctx.tenant, membership: ctx.membership! }
}

/**
 * Merchant role hierarchy. Used for "at least" checks.
 */
export const ROLE_RANK: Record<string, number> = {
  ANALYST: 1,
  FULFILLMENT_STAFF: 2,
  CONTENT_EDITOR: 3,
  CATALOG_MANAGER: 4,
  ORDER_MANAGER: 4,
  ADMINISTRATOR: 5,
  OWNER: 6,
}

export function requireMinRole(ctx: RequestContext, minRole: string) {
  const { membership } = requireTenantMembership(ctx)
  const have = ROLE_RANK[membership.role] ?? 0
  const need = ROLE_RANK[minRole] ?? 0
  if (have < need) {
    throw new AuthorizationError(`Requires role ${minRole} or higher`)
  }
  return membership
}
