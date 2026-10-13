// src/lib/admin-auth.ts — admin authentication via env-configured credentials.
//
// The platform operator account is bootstrapped via env vars:
//   ADMIN_EMAIL — the operator's email
//   ADMIN_PASSWORD_HASH — scrypt hash (same format as User.passwordHash)
//
// On login, if the submitted email matches ADMIN_EMAIL, we verify the
// password against ADMIN_PASSWORD_HASH. If valid, we ensure a User row
// exists with globalRole=2 + accountType=PLATFORM_OPERATOR, and issue a
// normal session. The operator lands directly in the admin console.
//
// If ADMIN_PASSWORD_HASH is not set, we fall back to a dev-only default
// password "admin-password" with a console warning. NEVER rely on this
// in production.

import { prisma } from '@/lib/db'
import { hashPassword, verifyPassword } from '@/lib/session'

const DEV_DEFAULT_PASSWORD = 'admin-password'

function getAdminEmail(): string | null {
  const env = process.env.ADMIN_EMAIL
  if (env && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(env)) return env.toLowerCase()
  // Dev fallback
  if (process.env.NODE_ENV !== 'production') return 'admin@ohwasis.local'
  return null
}

async function getAdminPasswordHash(): Promise<string> {
  // If env provides a hash, use it
  const envHash = process.env.ADMIN_PASSWORD_HASH
  if (envHash && envHash.startsWith('scrypt$')) return envHash
  // Dev fallback: hash the default password at module load time
  if (process.env.NODE_ENV !== 'production') {
    console.warn('[ohwasis.admin-auth] ADMIN_PASSWORD_HASH not set — using dev default "admin-password". NOT SAFE FOR PRODUCTION.')
    return await hashPassword(DEV_DEFAULT_PASSWORD)
  }
  throw new Error('ADMIN_PASSWORD_HASH must be set in production')
}

let cachedHash: string | null = null
async function resolveAdminPasswordHash(): Promise<string> {
  if (cachedHash) return cachedHash
  cachedHash = await getAdminPasswordHash()
  return cachedHash
}

/**
 * Attempt admin login. Returns true if the credentials match the env-configured
 * admin; false otherwise.
 *
 * Side effect: if admin login succeeds, ensures a User row exists with
 * globalRole=2 + accountType=PLATFORM_OPERATOR. Does NOT create a session —
 * the caller does that.
 */
export async function tryAdminLogin(email: string, password: string): Promise<boolean> {
  const adminEmail = getAdminEmail()
  if (!adminEmail || email.toLowerCase() !== adminEmail) return false
  const expectedHash = await resolveAdminPasswordHash()
  if (!verifyPassword(password, expectedHash)) return false
  return true
}

/**
 * Ensure the admin User row exists with the right role. Called after a
 * successful tryAdminLogin. Returns the user.
 */
export async function ensureAdminUser(email: string) {
  const adminEmail = email.toLowerCase()
  let user = await prisma.user.findUnique({ where: { email: adminEmail } })
  if (!user) {
    // Create with the env-configured password hash (so the user row is consistent)
    const expectedHash = await resolveAdminPasswordHash()
    user = await prisma.user.create({
      data: {
        email: adminEmail,
        passwordHash: expectedHash,
        name: 'Platform Operator',
        accountType: 'PLATFORM_OPERATOR',
        globalRole: 2,
        status: 'ACTIVE',
      },
    })
  } else if (user.globalRole < 2 || user.accountType !== 'PLATFORM_OPERATOR') {
    // Upgrade existing user to platform operator
    user = await prisma.user.update({
      where: { id: user.id },
      data: { globalRole: 2, accountType: 'PLATFORM_OPERATOR', status: 'ACTIVE' },
    })
  }
  return user
}

/**
 * For local dev: return the admin email + default password so the UI can
 * show a "Dev admin login" hint. In production this returns nulls.
 */
export function getDevAdminCredentials(): { email: string; password: string } | null {
  if (process.env.NODE_ENV === 'production') return null
  if (process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD_HASH) return null
  return { email: 'admin@ohwasis.local', password: DEV_DEFAULT_PASSWORD }
}
