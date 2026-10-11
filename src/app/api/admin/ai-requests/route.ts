import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getRequestContext, requirePlatformOperator } from '@/lib/session'
import { withErrorHandler } from '@/lib/api'

/**
 * GET /api/admin/ai-requests  — list all AI access requests across tenants.
 * Platform operator reviews + approves/rejects from here.
 */
export const GET = withErrorHandler(async (req) => {
  const ctx = await getRequestContext(req)
  requirePlatformOperator(ctx)
  const requests = await prisma.aiAccessRequest.findMany({
    include: {
      tenant: { select: { id: true, handle: true, displayName: true } },
      user: { select: { id: true, email: true, name: true } },
    },
    orderBy: { createdAt: 'desc' },
  })
  return NextResponse.json({ requests })
})
