import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getRequestContext, requirePlatformOperator } from '@/lib/session'
import { withErrorHandler, parseBody } from '@/lib/api'
import { z } from 'zod'

interface RouteParams { params: Promise<{ id: string }> }

const patchSchema = z.object({
  label: z.string().min(1).max(120).optional(),
  description: z.string().max(500).optional(),
  enabled: z.boolean().optional(),
  targetRoles: z.array(z.string()).optional(),
  config: z.record(z.string(), z.unknown()).optional(),
})

export const PATCH = withErrorHandler(async (req, { params }: RouteParams) => {
  const ctx = await getRequestContext(req)
  requirePlatformOperator(ctx)
  const { id } = await params
  const input = await parseBody(req, patchSchema)
  const feature = await prisma.featureFlag.update({
    where: { id },
    data: {
      ...(input.label && { label: input.label }),
      ...(input.description !== undefined && { description: input.description }),
      ...(input.enabled !== undefined && { enabled: input.enabled }),
      ...(input.targetRoles && { targetRoles: JSON.stringify(input.targetRoles) }),
      ...(input.config !== undefined && { config: JSON.stringify(input.config) }),
    },
  })
  return NextResponse.json({ feature })
})

export const DELETE = withErrorHandler(async (req, { params }: RouteParams) => {
  const ctx = await getRequestContext(req)
  requirePlatformOperator(ctx)
  const { id } = await params
  await prisma.featureFlag.delete({ where: { id } })
  return NextResponse.json({ ok: true })
})
