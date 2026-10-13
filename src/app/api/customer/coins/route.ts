import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getRequestContext, requireCustomer } from '@/lib/session'
import { withErrorHandler } from '@/lib/api'
import { audit } from '@/lib/audit'

const DAILY_CHECKIN_REWARD = 10
const STREAK_BONUS = 5 // extra coins per consecutive day, max 7-day streak

/**
 * GET /api/customer/coins
 * Returns the customer's coin balance + today's check-in status + referral info.
 */
export const GET = withErrorHandler(async (req) => {
  const ctx = await getRequestContext(req)
  const user = requireCustomer(ctx)
  // Ensure coin balance row exists
  const balance = await prisma.customerCoinBalance.upsert({
    where: { userId: user.id },
    create: { userId: user.id },
    update: {},
  })
  // Check if user can check in today (last check-in was > 24h ago, OR never)
  const now = new Date()
  const lastCheckIn = balance.lastCheckInAt
  const canCheckInToday = !lastCheckIn || (now.getTime() - lastCheckIn.getTime()) > 20 * 60 * 60 * 1000 // 20h grace

  // Referral info
  const referral = await prisma.referral.findUnique({ where: { userId: user.id } })

  // Recent transactions (last 30 days)
  const recent = await prisma.coinTransaction.findMany({
    where: { userId: user.id, createdAt: { gte: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000) } },
    orderBy: { createdAt: 'desc' },
    take: 30,
  })

  return NextResponse.json({
    balance: balance.balance,
    streak: balance.streak,
    canCheckInToday,
    lastCheckInAt: balance.lastCheckInAt,
    referralCode: referral?.code ?? null,
    referralCoinsEarned: referral?.coinsEarned ?? 0,
    referralCount: referral ? JSON.parse(referral.referredUserIds || '[]').length : 0,
    recentTransactions: recent,
  })
})

/**
 * POST /api/customer/coins/checkin
 * Daily check-in: earn coins. Streak bonus for consecutive days. Once per 20h.
 */
export const POST = withErrorHandler(async (req) => {
  const ctx = await getRequestContext(req)
  const user = requireCustomer(ctx)

  const url = new URL(req.url)
  if (!url.pathname.endsWith('/checkin')) {
    return NextResponse.json({ error: 'invalid_endpoint' }, { status: 400 })
  }

  const balance = await prisma.customerCoinBalance.upsert({
    where: { userId: user.id },
    create: { userId: user.id },
    update: {},
  })

  const now = new Date()
  if (balance.lastCheckInAt) {
    const hoursSince = (now.getTime() - balance.lastCheckInAt.getTime()) / (60 * 60 * 1000)
    if (hoursSince < 20) {
      return NextResponse.json({
        error: 'already_checked_in',
        message: `You've already checked in today. Come back in ${Math.ceil(24 - hoursSince)}h.`,
        nextCheckInAt: new Date(balance.lastCheckInAt.getTime() + 24 * 60 * 60 * 1000),
      }, { status: 400 })
    }
  }

  // Compute streak: if last check-in was within 48h, continue streak; else reset to 1
  let newStreak = 1
  if (balance.lastCheckInAt) {
    const hoursSince = (now.getTime() - balance.lastCheckInAt.getTime()) / (60 * 60 * 1000)
    if (hoursSince < 48) {
      newStreak = balance.streak + 1
    }
  }
  newStreak = Math.min(newStreak, 7) // cap streak bonus at 7 days

  const reward = DAILY_CHECKIN_REWARD + (newStreak - 1) * STREAK_BONUS

  await prisma.$transaction(async (tx) => {
    await tx.customerCoinBalance.update({
      where: { userId: user.id },
      data: {
        balance: { increment: reward },
        streak: newStreak,
        lastCheckInAt: now,
      },
    })
    await tx.coinTransaction.create({
      data: {
        userId: user.id,
        type: 'DAILY_CHECKIN',
        amount: reward,
        description: `Daily check-in (day ${newStreak} streak)`,
      },
    })
  })

  await audit({
    ctx,
    action: 'coins.checkin',
    category: 'GAMIFICATION',
    targetType: 'User',
    targetId: user.id,
    metadata: { reward, streak: newStreak },
  })

  return NextResponse.json({
    ok: true,
    reward,
    streak: newStreak,
    newBalance: balance.balance + reward,
    message: `+${reward} coins! Day ${newStreak} streak 🔥`,
  })
})
