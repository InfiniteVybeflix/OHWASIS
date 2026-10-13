// src/lib/admin-auth.ts — admin authentication via env-configured credentials.
//
// The platform operator account is authenticated via env vars:
//   ADMIN_EMAIL — the operator's email
//   ADMIN_PASSWORD_HASH — scrypt hash (same format as User.passwordHash)
//
// If ADMIN_EMAIL or ADMIN_PASSWORD_HASH is not set, the system throws.
// There are NO dev fallbacks — this is production code.

import { prisma } from '@/lib/db'
import { hashPassword, verifyPassword } from '@/lib/session'

function getAdminEmail(): string {
  const env = process.env.ADMIN_EMAIL
  if (!env) {
    throw new Error('ADMIN_EMAIL environment variable is required. Set it in your .env or Vercel environment variables.')
  }
  return env.toLowerCase()
}

async function getAdminPasswordHash(): Promise<string> {
  const envHash = process.env.ADMIN_PASSWORD_HASH
  if (!envHash || !envHash.startsWith('scrypt$')) {
    throw new Error(
      'ADMIN_PASSWORD_HASH environment variable is required and must be a scrypt hash. ' +
      'Generate with: node -e "const crypto=require(\'crypto\');const s=crypto.randomBytes(16).toString(\'hex\');const h=crypto.scryptSync(\'YOUR_PASSWORD\',s,64).toString(\'hex\');console.log(\'scrypt$\'+s+\'$\'+h)"'
    )
  }
  return envHash
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
  if (email.toLowerCase() !== adminEmail) return false
  const expectedHash = await getAdminPasswordHash()
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
    const expectedHash = await getAdminPasswordHash()
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
    user = await prisma.user.update({
      where: { id: user.id },
      data: { globalRole: 2, accountType: 'PLATFORM_OPERATOR', status: 'ACTIVE' },
    })
  }
  return user
}
