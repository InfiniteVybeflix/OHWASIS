import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { withErrorHandler } from '@/lib/api'

/**
 * Public directory of active storefronts — used by the customer-facing
 * landing experience to discover merchants. Only returns published tenants
 * (status === ACTIVE).
 */
export const GET = withErrorHandler(async () => {
  const tenants = await prisma.tenant.findMany({
    where: { status: 'ACTIVE' },
    select: {
      id: true,
      handle: true,
      displayName: true,
      tagline: true,
      industry: true,
      theme: true,
      contactEmail: true,
      contactPhone: true,
    },
    orderBy: { createdAt: 'desc' },
  })
  return NextResponse.json({ tenants })
})
