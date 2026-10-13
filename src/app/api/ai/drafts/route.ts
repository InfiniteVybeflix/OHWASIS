import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getRequestContext, requireBusinessOwner } from '@/lib/session'
import { withErrorHandler, parseBody, queryParams } from '@/lib/api'
import { z } from 'zod'
import { audit } from '@/lib/audit'

/**
 * GET /api/ai/drafts
 * Lists the current user's AI drafts (most recent first).
 */
export const GET = withErrorHandler(async (req) => {
  const ctx = await getRequestContext(req)
  const user = requireBusinessOwner(ctx)
  const q = queryParams(req)
  const status = q.get('status') ?? undefined
  const drafts = await prisma.aiDraft.findMany({
    where: {
      requestedBy: user.id,
      ...(status ? { status } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: 20,
  })
  return NextResponse.json({
    drafts: drafts.map((d) => ({
      ...d,
      proposal: JSON.parse(d.proposal),
    })),
  })
})

const approveSchema = z.object({
  // Optional: the owner can EDIT the proposal before approving
  editedProposal: z.record(z.unknown()).optional(),
  // For business_setup approvals: optionally a handle (otherwise auto-generated from displayName)
  handle: z.string().optional(),
})
