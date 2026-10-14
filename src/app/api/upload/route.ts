import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getRequestContext, requireTenantMembership, requireMinRole } from '@/lib/session'
import { withErrorHandler } from '@/lib/api'
import { audit } from '@/lib/audit'

/**
 * POST /api/upload
 *
 * Multipart form data upload. Accepts one or more image files.
 * Converts to base64 data URLs and creates Media records for the tenant.
 * This approach works on Vercel serverless (read-only filesystem).
 *
 * Limitation: each file must be under 500KB. For larger images, use Supabase Storage.
 */
export const POST = withErrorHandler(async (req) => {
  const ctx = await getRequestContext(req)
  const { tenant } = requireTenantMembership(ctx)
  requireMinRole(ctx, 'CATALOG_MANAGER')

  const formData = await req.formData()
  const files = formData.getAll('files')
  if (files.length === 0) {
    return NextResponse.json({ error: 'no_files' }, { status: 400 })
  }

  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml']
  const results: Array<{ id: string; url: string; filename: string; mimeType: string; sizeBytes: number }> = []

  for (const file of files) {
    if (!(file instanceof File)) continue
    if (!allowedTypes.includes(file.type)) continue
    if (file.size > 500 * 1024) continue // 500KB max

    const buffer = Buffer.from(await file.arrayBuffer())
    const base64 = buffer.toString('base64')
    const dataUrl = `data:${file.type};base64,${base64}`

    const media = await prisma.media.create({
      data: {
        tenantId: tenant.id,
        url: dataUrl,
        filename: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
      },
    })

    results.push({
      id: media.id,
      url: media.url,
      filename: media.filename,
      mimeType: media.mimeType,
      sizeBytes: media.sizeBytes,
    })
  }

  await audit({
    ctx,
    action: 'media.upload',
    category: 'CREATE',
    targetType: 'Media',
    metadata: { count: results.length },
  })

  return NextResponse.json({ files: results }, { status: 201 })
})
