import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getRequestContext, requirePlatformOperator } from '@/lib/session'
import { withErrorHandler } from '@/lib/api'
import { audit } from '@/lib/audit'

/**
 * POST /api/admin/seed
 *
 * Seeds the database with the platform operator account using env-configured
 * credentials (ADMIN_EMAIL + ADMIN_PASSWORD_HASH). No test data, no demo
 * merchants, no hardcoded passwords.
 *
 * This endpoint is idempotent — re-running does NOT duplicate.
 */
export const POST = withErrorHandler(async (req) => {
  const ctx = await getRequestContext(req)
  requirePlatformOperator(ctx)

  // Use the env-configured admin credentials
  const adminEmail = process.env.ADMIN_EMAIL
  const adminPasswordHash = process.env.ADMIN_PASSWORD_HASH

  if (!adminEmail || !adminPasswordHash) {
    return NextResponse.json(
      {
        error: 'missing_env',
        message: 'ADMIN_EMAIL and ADMIN_PASSWORD_HASH must be set in environment variables.',
      },
      { status: 500 },
    )
  }

  let operatorCreated = false
  let operator = await prisma.user.findUnique({ where: { email: adminEmail.toLowerCase() } })
  if (!operator) {
    operator = await prisma.user.create({
      data: {
        email: adminEmail.toLowerCase(),
        passwordHash: adminPasswordHash,
        name: 'Platform Operator',
        accountType: 'PLATFORM_OPERATOR',
        globalRole: 2,
        status: 'ACTIVE',
      },
    })
    operatorCreated = true
  } else {
    // Ensure role is set
    if (operator.globalRole < 2 || operator.accountType !== 'PLATFORM_OPERATOR') {
      await prisma.user.update({
        where: { id: operator.id },
        data: { globalRole: 2, accountType: 'PLATFORM_OPERATOR', status: 'ACTIVE' },
      })
    }
  }

  await audit({
    ctx,
    action: 'admin.seed',
    category: 'CREATE',
    metadata: { operatorCreated, email: adminEmail },
  })

  return NextResponse.json({
    ok: true,
    operator: operatorCreated ? 'created' : 'already_exists',
    email: adminEmail,
  })
})
