// src/lib/audit.ts — structured audit logging persisted to DB.
//
// Every sensitive operation (login, onboarding, product CRUD, payment
// initiation, AI access requests, role changes, cross-tenant attempts, etc.)
// is recorded here. Audit records are append-only and never deleted.

import { prisma } from '@/lib/db'
import type { RequestContext } from '@/lib/session'

export interface AuditInput {
  ctx: Pick<RequestContext, 'user' | 'tenant' | 'ip' | 'userAgent'>
  action: string
  category: string
  targetType?: string
  targetId?: string
  metadata?: Record<string, unknown>
  actorName?: string
  detail?: string
}

export async function audit(input: AuditInput): Promise<void> {
  try {
    await prisma.auditEvent.create({
      data: {
        tenantId: input.ctx.tenant?.id ?? null,
        actorId: input.ctx.user?.id ?? null,
        action: input.action,
        category: input.category,
        targetType: input.targetType ?? null,
        targetId: input.targetId ?? null,
        metadata: JSON.stringify(input.metadata ?? {}),
        ip: input.ctx.ip ?? null,
        userAgent: input.ctx.userAgent ?? null,
      },
    })
  } catch (err) {
    // Audit failures must NEVER break the user flow. Log to console instead.
    console.error('[audit] failed to record', err, input)
  }
}

export async function auditSecurityEvent(
  ctx: Pick<RequestContext, 'user' | 'tenant' | 'ip' | 'userAgent'>,
  action: string,
  detail: string,
  metadata?: Record<string, unknown>,
) {
  await audit({
    ctx,
    action,
    category: 'SECURITY',
    detail,
    metadata,
  })
}
