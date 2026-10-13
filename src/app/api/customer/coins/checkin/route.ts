import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getRequestContext, requireCustomer } from '@/lib/session'
import { withErrorHandler } from '@/lib/api'
import { audit } from '@/lib/audit'

const DAILY_CHECKIN_REWARD = 10
const STREAK_BONUS = 5

/**
 * POST /api/customer/coins/checkin
 * Daily check-in: earn coins. Streak bonus for consecutive days. Once per 20h.
 */
export const POST = withErrorHandler(async (req) => {
  const ctx = await getRequestContext(req)
  const user = requireCustomer(ctx)

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

  // Compute streak
  let newStreak = 1
  if (balance.lastCheckInAt) {
    const hoursSince = (now.getTime() - balance.lastCheckInAt.getTime()) / (60 * 60 * 1000)
    if (hoursSince < 48) {
      newStreak = balance.streak + 1
    }
  }
  newStreak = Math.min(newStreak, 7)

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
