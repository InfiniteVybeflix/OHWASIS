import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getRequestContext, requireTenantMembership, requireMinRole } from '@/lib/session'
import { assertTenantOwns } from '@/lib/tenant'
import { withErrorHandler, parseBody } from '@/lib/api'
import { pageSchema } from '@/lib/validation/schemas'
import { audit } from '@/lib/audit'

interface RouteParams { params: Promise<{ id: string }> }

export const GET = withErrorHandler(async (req, { params }: RouteParams) => {
  const ctx = await getRequestContext(req)
  const { tenant } = requireTenantMembership(ctx)
  const { id } = await params
  const page = await prisma.page.findUnique({
    where: { id },
    include: { revisions: { orderBy: { createdAt: 'desc' }, take: 10 } },
  })
  assertTenantOwns(page, tenant.id, 'page')
  return NextResponse.json({ page })
})

export const PUT = withErrorHandler(async (req, { params }: RouteParams) => {
  const ctx = await getRequestContext(req)
  const { tenant } = requireTenantMembership(ctx)
  requireMinRole(ctx, 'CONTENT_EDITOR')
  const { id } = await params
  const input = await parseBody(req, pageSchema.partial())

  const existing = await prisma.page.findUnique({ where: { id } })
  assertTenantOwns(existing, tenant.id, 'page')

  const sanitisedBody = input.body !== undefined ? sanitiseHtml(input.body) : undefined
  const wasPublished = existing!.status === 'PUBLISHED'
  const willPublish = input.status === 'PUBLISHED'

  const page = await prisma.$transaction(async (tx) => {
    const updated = await tx.page.update({
      where: { id },
      data: {
        ...(input.slug && { slug: input.slug.toLowerCase() }),
        ...(input.title && { title: input.title }),
        ...(sanitisedBody !== undefined && { body: sanitisedBody }),
        ...(input.status && { status: input.status }),
        ...(input.seo !== undefined && { seo: JSON.stringify(input.seo) }),
        ...(!wasPublished && willPublish ? { publishedAt: new Date() } : {}),
      },
    })
    // Save a revision whenever body or title changes
    if (sanitisedBody !== undefined || input.title) {
      await tx.pageRevision.create({
        data: {
          pageId: id,
          body: sanitisedBody ?? existing!.body,
          title: input.title ?? existing!.title,
          editedBy: ctx.user?.id,
        },
      })
    }
    return updated
  })

  await audit({
    ctx,
    action: 'page.update',
    category: 'UPDATE',
    targetType: 'Page',
    targetId: page.id,
    metadata: { fields: Object.keys(input) },
  })

  return NextResponse.json({ page })
})

export const DELETE = withErrorHandler(async (req, { params }: RouteParams) => {
  const ctx = await getRequestContext(req)
  const { tenant } = requireTenantMembership(ctx)
  requireMinRole(ctx, 'CONTENT_EDITOR')
  const { id } = await params
  const existing = await prisma.page.findUnique({ where: { id } })
  assertTenantOwns(existing, tenant.id, 'page')
  await prisma.page.delete({ where: { id } })
  await audit({
    ctx,
    action: 'page.delete',
    category: 'DELETE',
    targetType: 'Page',
    targetId: id,
  })
  return NextResponse.json({ ok: true })
})

function sanitiseHtml(html: string): string {
  return html
    .replace(/<\/?(script|style|iframe|object|embed|link|meta|base|form|input|button|textarea|select|option)[^>]*>/gi, '')
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/(href|src)\s*=\s*["']?\s*javascript:/gi, '$1="')
    .replace(/(href|src)\s*=\s*["']?\s*data:/gi, '$1="')
    .replace(/\sstyle\s*=\s*("[^"]*"|'[^']*')/gi, '')
}
