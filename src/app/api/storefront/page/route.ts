import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { resolveTenantByHandle } from '@/lib/tenant'
import { withErrorHandler, queryParams } from '@/lib/api'

/**
 * GET /api/storefront/page?handle=<tenant>&slug=<page-slug>
 *
 * PUBLIC endpoint — returns a published CMS page for a tenant.
 * Used by the storefront to display About, Privacy, Terms, etc.
 */
export const GET = withErrorHandler(async (req) => {
  const q = queryParams(req)
  const handle = q.get('handle')
  const slug = q.get('slug')
  if (!handle || !slug) {
    return NextResponse.json({ error: 'handle_and_slug_required' }, { status: 400 })
  }
  const tenant = await resolveTenantByHandle(handle).catch(() => null)
  if (!tenant) return NextResponse.json({ error: 'storefront_not_found' }, { status: 404 })

  const page = await prisma.page.findFirst({
    where: { tenantId: tenant.id, slug, status: 'PUBLISHED' },
    select: { id: true, title: true, body: true, slug: true, seo: true, publishedAt: true },
  })
  if (!page) return NextResponse.json({ error: 'page_not_found' }, { status: 404 })

  return NextResponse.json({
    page: {
      ...page,
      seo: page.seo ? JSON.parse(page.seo) : {},
    },
  })
})
