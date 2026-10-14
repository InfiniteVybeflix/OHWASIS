import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { withErrorHandler } from '@/lib/api'

interface RouteParams { params: Promise<{ id: string }> }

/**
 * POST /api/ads/[id]/click
 * PUBLIC — tracks a click on an advertisement. Increments the click counter.
 * Deduplicated per ad per request (no unique visitor tracking — privacy-conscious).
 */
export const POST = withErrorHandler(async (req, { params }: RouteParams) => {
  const { id } = await params
  const ad = await prisma.advertisement.findUnique({ where: { id } })
  if (!ad) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  await prisma.advertisement.update({
    where: { id },
    data: { clicks: { increment: 1 } },
  })

  return NextResponse.json({ ok: true, clicks: ad.clicks + 1 })
})
