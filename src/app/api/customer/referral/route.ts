import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getRequestContext, requireCustomer } from '@/lib/session'
import { withErrorHandler, parseBody } from '@/lib/api'
import { z } from 'zod'
import { audit } from '@/lib/audit'

/**
 * GET /api/customer/referral
 * Returns the customer's referral code (creates one if it doesn't exist).
 */
export const GET = withErrorHandler(async (req) => {
  const ctx = await getRequestContext(req)
  const user = requireCustomer(ctx)
  let referral = await prisma.referral.findUnique({ where: { userId: user.id } })
  if (!referral) {
    // Generate a unique 8-char code
    const code = generateReferralCode(user.id, user.email)
    referral = await prisma.referral.create({
      data: { userId: user.id, code },
    })
  }
  return NextResponse.json({
    code: referral.code,
    coinsEarned: referral.coinsEarned,
    referredCount: JSON.parse(referral.referredUserIds || '[]').length,
    shareUrl: `${process.env.NEXT_PUBLIC_APP_URL || ''}/?ref=${referral.code}`,
  })
})

const applySchema = z.object({
  code: z.string().min(4).max(20),
})

/**
 * POST /api/customer/referral/apply
 * Apply a referral code during signup (or first time). Records the referral
 * relationship. Coins are awarded to the referrer ONLY when the referred
 * user places their first order (handled in the order creation flow).
 */
export const POST = withErrorHandler(async (req) => {
  const ctx = await getRequestContext(req)
  const user = requireCustomer(ctx)
  const input = await parseBody(req, applySchema)
  const code = input.code.toUpperCase()
  // Find the referral by code
  const referral = await prisma.referral.findUnique({ where: { code } })
  if (!referral) {
    return NextResponse.json({ error: 'invalid_code', message: 'Referral code not found' }, { status: 400 })
  }
  if (referral.userId === user.id) {
    return NextResponse.json({ error: 'cannot_refer_self' }, { status: 400 })
  }
  // Check if user was already referred
  const referredIds: string[] = JSON.parse(referral.referredUserIds || '[]')
  if (referredIds.includes(user.id)) {
    return NextResponse.json({ error: 'already_applied', message: 'You have already used this referral code' }, { status: 400 })
  }
  // Add user to the referrer's list
  referredIds.push(user.id)
  await prisma.referral.update({
    where: { id: referral.id },
    data: { referredUserIds: JSON.stringify(referredIds) },
  })
  await audit({
    ctx,
    action: 'referral.apply',
    category: 'GROWTH',
    targetType: 'Referral',
    targetId: referral.id,
    metadata: { code, referrerId: referral.userId },
  })
  return NextResponse.json({ ok: true, message: 'Referral code applied! Your referrer earns coins when you place your first order.' })
})

function generateReferralCode(userId: string, email: string): string {
  // Use first 4 chars of user ID hash + first 2 chars of email (uppercased) + 2 random chars
  const idHash = userId.slice(-4).toUpperCase()
  const emailPrefix = (email.slice(0, 2) || 'OH').toUpperCase()
  const random = Math.random().toString(36).slice(2, 4).toUpperCase()
  return `${idHash}${emailPrefix}${random}`.replace(/[^A-Z0-9]/g, 'X').slice(0, 8)
}
