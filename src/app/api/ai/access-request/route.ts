import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getRequestContext, requireTenantMembership } from '@/lib/session'
import { withErrorHandler, parseBody } from '@/lib/api'
import { aiAccessRequestSchema } from '@/lib/validation/schemas'
import { dispatch } from '@/lib/notifications'
import { AEVIBRON_DEFAULTS } from '@/lib/ai/provider'
import { audit } from '@/lib/audit'

/**
 * POST /api/ai/access-request
 *
 * Merchant requests AI access (e.g. Aevibron API key). Persists a durable
 * record with the requesting tenant, requester, requested access, and
 * justification. Notifies the designated contact email (aevibron@gmail.com)
 * via the configured email provider. If email is not configured, the request
 * is still persisted and its status is honestly reported — never claims
 * an email was sent when it wasn't.
 *
 * The platform control panel displays and manages these requests.
 */
export const POST = withErrorHandler(async (req) => {
  const ctx = await getRequestContext(req)
  const { tenant, user } = requireTenantMembership(ctx, ['OWNER', 'ADMINISTRATOR'])
  const input = await parseBody(req, aiAccessRequestSchema)

  const record = await prisma.aiAccessRequest.create({
    data: {
      tenantId: tenant.id,
      requestedBy: user.id,
      provider: input.provider,
      requestedAccess: input.requestedAccess,
      justification: input.justification,
      status: 'PENDING',
    },
  })

  await audit({
    ctx,
    action: 'ai_access.request',
    category: 'CREATE',
    targetType: 'AiAccessRequest',
    targetId: record.id,
    metadata: { provider: input.provider, requestedAccess: input.requestedAccess },
  })

  // Attempt to deliver email notification. Persisted regardless of outcome.
  const emailResult = await dispatch({
    tenantId: tenant.id,
    userId: user.id,
    channel: 'EMAIL',
    template: 'AI_ACCESS_REQUEST',
    recipient: AEVIBRON_DEFAULTS.contactEmail,
    subject: `OHWASIS — AI access request from ${tenant.displayName}`,
    body: [
      `Merchant: ${tenant.displayName} (handle: ${tenant.handle})`,
      `Requested by: ${user.email}`,
      `Provider: ${input.provider}`,
      `Requested access: ${input.requestedAccess}`,
      `Justification: ${input.justification}`,
      '',
      `Review this request in the platform control panel.`,
    ].join('\n'),
  })

  // Update the request with the email outcome
  const updated = await prisma.aiAccessRequest.update({
    where: { id: record.id },
    data: {
      emailDelivered: emailResult.status === 'SENT',
      emailError: emailResult.status === 'FAILED' ? emailResult.error : null,
    },
  })

  return NextResponse.json(
    {
      request: {
        id: updated.id,
        status: updated.status,
        emailDelivered: updated.emailDelivered,
        emailError: updated.emailError,
      },
      message: updated.emailDelivered
        ? 'Request submitted and notification delivered.'
        : 'Request submitted and persisted. Email notification is pending (SMTP provider not configured). The platform operator will see the request in their dashboard.',
    },
    { status: 201 },
  )
})
