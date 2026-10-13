import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getRequestContext, requirePlatformOperator } from '@/lib/session'
import { withErrorHandler, parseBody } from '@/lib/api'
import { z } from 'zod'

/**
 * GET /api/admin/features
 * Admin: list all feature flags.
 */
export const GET = withErrorHandler(async (req) => {
  const ctx = await getRequestContext(req)
  requirePlatformOperator(ctx)
  const features = await prisma.featureFlag.findMany({ orderBy: { createdAt: 'desc' } })
  return NextResponse.json({
    features: features.map((f) => ({
      ...f,
      targetRoles: JSON.parse(f.targetRoles || '[]'),
      config: JSON.parse(f.config || '{}'),
    })),
  })
})

const featureSchema = z.object({
  key: z.string().min(1).max(60).regex(/^[a-z0-9_]+$/, 'Key must be lowercase, alphanumeric, underscores'),
  label: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
  enabled: z.boolean().default(false),
  targetRoles: z.array(z.string()).default(['customer', 'business_owner']),
  config: z.record(z.string(), z.unknown()).default({}),
})

/**
 * POST /api/admin/features
 * Admin: create a new feature flag.
 */
export const POST = withErrorHandler(async (req) => {
  const ctx = await getRequestContext(req)
  requirePlatformOperator(ctx)
  const input = await parseBody(req, featureSchema)
  const feature = await prisma.featureFlag.create({
    data: {
      key: input.key,
      label: input.label,
      description: input.description ?? null,
      enabled: input.enabled,
      targetRoles: JSON.stringify(input.targetRoles),
      config: JSON.stringify(input.config ?? {}),
    },
  })
  return NextResponse.json({ feature }, { status: 201 })
})
