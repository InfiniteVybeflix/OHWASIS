// scripts/seed-admin.ts — Seeds the platform operator account using env vars.
//
// Usage: bun run scripts/seed-admin.ts
// Required env: DATABASE_URL, ADMIN_EMAIL, ADMIN_PASSWORD_HASH
//
// This script does NOT create any test data. It only creates the platform
// operator account from the environment-configured credentials.

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const adminEmail = process.env.ADMIN_EMAIL
  const adminPasswordHash = process.env.ADMIN_PASSWORD_HASH

  if (!adminEmail || !adminPasswordHash) {
    console.error('ERROR: ADMIN_EMAIL and ADMIN_PASSWORD_HASH must be set in environment variables.')
    console.error('ADMIN_EMAIL:', adminEmail ? '✓ set' : '✗ missing')
    console.error('ADMIN_PASSWORD_HASH:', adminPasswordHash ? '✓ set' : '✗ missing')
    process.exit(1)
  }

  if (!adminPasswordHash.startsWith('scrypt$')) {
    console.error('ERROR: ADMIN_PASSWORD_HASH must be a scrypt hash (format: scrypt$salt$hash).')
    console.error('Generate with: node -e "const crypto=require(\'crypto\');const s=crypto.randomBytes(16).toString(\'hex\');const h=crypto.scryptSync(\'YOUR_PASSWORD\',s,64).toString(\'hex\');console.log(\'scrypt$\'+s+\'$\'+h)"')
    process.exit(1)
  }

  let user = await prisma.user.findUnique({ where: { email: adminEmail.toLowerCase() } })
  if (!user) {
    user = await prisma.user.create({
      data: {
        email: adminEmail.toLowerCase(),
        passwordHash: adminPasswordHash,
        name: 'Platform Operator',
        accountType: 'PLATFORM_OPERATOR',
        globalRole: 2,
        status: 'ACTIVE',
      },
    })
    console.log(`✓ Created platform operator: ${user.email}`)
  } else {
    if (user.globalRole < 2 || user.accountType !== 'PLATFORM_OPERATOR') {
      await prisma.user.update({
        where: { id: user.id },
        data: { globalRole: 2, accountType: 'PLATFORM_OPERATOR', status: 'ACTIVE' },
      })
      console.log(`✓ Upgraded existing user to platform operator: ${user.email}`)
    } else {
      console.log(`✓ Platform operator already exists: ${user.email}`)
    }
  }

  console.log('\nDone. The admin can now sign in with the email and password configured in your environment variables.')
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
  })
