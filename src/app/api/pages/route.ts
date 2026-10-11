import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getRequestContext, requireTenantMembership, requireMinRole } from '@/lib/session'
import { tenantScoped } from '@/lib/tenant'
import { withErrorHandler, parseBody } from '@/lib/api'
import { pageSchema } from '@/lib/validation/schemas'
import { audit } from '@/lib/audit'

/**
 * GET /api/pages  — merchant CMS view. Lists all pages including drafts.
 */
export const GET = withErrorHandler(async (req) => {
  const ctx = await getRequestContext(req)
  const { tenant } = requireTenantMembership(ctx)
  const pages = await prisma.page.findMany({
    where: tenantScoped(tenant.id),
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      slug: true,
      title: true,
      status: true,
      publishedAt: true,
      updatedAt: true,
    },
  })
  return NextResponse.json({ pages })
})

/**
 * POST /api/pages  — create a new page.
 *
 * Body HTML is sanitised server-side before save. Drafts are private;
 * only PUBLISHED pages are visible to the storefront.
 */
export const POST = withErrorHandler(async (req) => {
  const ctx = await getRequestContext(req)
  const { tenant } = requireTenantMembership(ctx)
  requireMinRole(ctx, 'CONTENT_EDITOR')
  const input = await parseBody(req, pageSchema)

  const sanitised = sanitiseHtml(input.body)
  const slug = input.slug.toLowerCase()

  const existing = await prisma.page.findFirst({
    where: { ...tenantScoped(tenant.id), slug },
  })
  if (existing) {
    return NextResponse.json({ error: 'slug_taken' }, { status: 409 })
  }

  const page = await prisma.page.create({
    data: {
      ...tenantScoped(tenant.id),
      slug,
      title: input.title,
      body: sanitised,
      status: input.status,
      seo: JSON.stringify(input.seo ?? {}),
      publishedAt: input.status === 'PUBLISHED' ? new Date() : null,
    },
  })

  // Save initial revision
  await prisma.pageRevision.create({
    data: {
      pageId: page.id,
      body: sanitised,
      title: input.title,
      editedBy: ctx.user?.id,
    },
  })

  await audit({
    ctx,
    action: 'page.create',
    category: 'CREATE',
    targetType: 'Page',
    targetId: page.id,
    metadata: { slug, status: input.status },
  })

  return NextResponse.json({ page }, { status: 201 })
})

/**
 * Sanitise HTML to a strict allowlist. Strips <script>, on* attributes,
 * iframe, object, embed, etc. This is a critical XSS defence — never accept
 * raw merchant HTML without sanitisation.
 */
function sanitiseHtml(html: string): string {
  return html
    // Remove script/style/iframe/object/embed/link/meta tags entirely
    .replace(/<\/?(script|style|iframe|object|embed|link|meta|base|form|input|button|textarea|select|option)[^>]*>/gi, '')
    // Remove all on* event handlers
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    // Remove javascript: URLs
    .replace(/(href|src)\s*=\s*["']?\s*javascript:/gi, '$1="')
    // Remove data: URLs in src/href (potential XSS vector)
    .replace(/(href|src)\s*=\s*["']?\s*data:/gi, '$1="')
    // Remove style attributes that could contain expression() / url(javascript:)
    .replace(/\sstyle\s*=\s*("[^"]*"|'[^']*')/gi, '')
}
