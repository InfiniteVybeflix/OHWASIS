import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { withErrorHandler } from '@/lib/api'

/**
 * GET /api/features
 * PUBLIC — returns all enabled feature flags. Used by the client to determine
 * which features are available (subscriptions, etc.).
 */
export const GET = withErrorHandler(async () => {
  const features = await prisma.featureFlag.findMany({
    where: { enabled: true },
    select: { key: true, label: true, description: true, targetRoles: true, config: true },
  })
  return NextResponse.json({
    features: features.map((f) => ({
      key: f.key,
      label: f.label,
      description: f.description,
      targetRoles: JSON.parse(f.targetRoles || '[]'),
      config: JSON.parse(f.config || '{}'),
    })),
  })
})
