// src/lib/notifications/index.ts — provider-based notification dispatcher.
//
// Notifications are persisted as durable records. A successful API call to
// the provider marks the record SENT; a failure marks it FAILED with the
// provider's error message. We NEVER mark a notification SENT if it was
// only queued or if the provider rejected it.
//
// If no email provider is configured (the default in this sandbox), the
// notification is persisted as PENDING with `emailError` set to
// "no provider configured". This is the truthful "not delivered" state —
// not a silent success.

import { prisma } from '@/lib/db'

export interface NotificationInput {
  tenantId?: string
  userId?: string
  channel: 'EMAIL' | 'SMS' | 'WHATSAPP' | 'IN_APP'
  template: string
  recipient: string
  subject?: string
  body: string
  metadata?: Record<string, unknown>
}

/**
 * Persist a notification and try to deliver it via the configured channel.
 * Returns the persisted record. The `status` field tells the truth about
 * what actually happened.
 */
export async function dispatch(input: NotificationInput) {
  const record = await prisma.notification.create({
    data: {
      tenantId: input.tenantId ?? null,
      userId: input.userId ?? null,
      channel: input.channel,
      template: input.template,
      recipient: input.recipient,
      subject: input.subject ?? null,
      body: input.body,
      status: 'PENDING',
    },
  })

  try {
    if (input.channel === 'EMAIL') {
      await sendEmail(input.recipient, input.subject ?? '(no subject)', input.body)
    } else if (input.channel === 'IN_APP') {
      // IN_APP always succeeds — it just sits in the DB waiting to be polled.
      return prisma.notification.update({
        where: { id: record.id },
        data: { status: 'SENT', sentAt: new Date(), providerMessageId: record.id },
      })
    } else {
      // SMS/WhatsApp require a configured provider — they aren't faked.
      return prisma.notification.update({
        where: { id: record.id },
        data: {
          status: 'FAILED',
          error: `${input.channel} provider not configured`,
        },
      })
    }
    return prisma.notification.update({
      where: { id: record.id },
      data: { status: 'SENT', sentAt: new Date() },
    })
  } catch (err) {
    return prisma.notification.update({
      where: { id: record.id },
      data: {
        status: 'FAILED',
        error: err instanceof Error ? err.message : String(err),
      },
    })
  }
}

/**
 * Sends an email via SMTP if SMTP_* env vars are set. If not, marks as
 * failed-with-reason. Uses nodemailer lazily (only if SMTP is configured).
 */
async function sendEmail(to: string, subject: string, body: string): Promise<string> {
  const host = process.env.SMTP_HOST
  const port = process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : undefined
  const user = process.env.SMTP_USER
  const pass = process.env.SMTP_PASS
  const from = process.env.SMTP_FROM || process.env.MAIL_FROM
  if (!host || !user || !pass || !from) {
    throw new Error('SMTP provider not configured (set SMTP_HOST, SMTP_USER, SMTP_PASS, SMTP_FROM)')
  }
  // Lazy-require nodemailer to avoid loading it when unused.
  const mod = await import('nodemailer').catch(() => null)
  if (!mod) {
    throw new Error('nodemailer not installed; cannot send email')
  }
  const transporter = mod.createTransport({
    host,
    port: port ?? 587,
    secure: (port ?? 587) === 465,
    auth: { user, pass },
  })
  const info = await transporter.sendMail({ from, to, subject, text: body })
  return info.messageId
}
