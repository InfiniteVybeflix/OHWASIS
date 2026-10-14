import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getRequestContext, requireUser } from '@/lib/session'
import { withErrorHandler } from '@/lib/api'
import { audit } from '@/lib/audit'

/**
 * POST /api/customer/avatar
 *
 * Upload a profile avatar image. Accepts multipart form data with a "file" field.
 * Converts the image to a base64 data URL and stores it directly in the database
 * (User.avatarUrl). This approach works on Vercel serverless (read-only filesystem)
 * without needing external storage like S3/Supabase Storage.
 *
 * Limitation: avatars are limited to 200KB to keep the database lean.
 */
export const POST = withErrorHandler(async (req) => {
  const ctx = await getRequestContext(req)
  const user = requireUser(ctx)

  const formData = await req.formData()
  const file = formData.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'no_file', message: 'No file provided.' }, { status: 400 })
  }

  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
  if (!allowedTypes.includes(file.type)) {
    return NextResponse.json({ error: 'invalid_type', message: 'Only JPEG, PNG, WebP, and GIF images are allowed.' }, { status: 400 })
  }
  // 200KB max — stored as base64 in the DB
  if (file.size > 200 * 1024) {
    return NextResponse.json({ error: 'too_large', message: 'Image must be under 200KB. Please compress it first.' }, { status: 400 })
  }

  // Convert to base64 data URL
  const buffer = Buffer.from(await file.arrayBuffer())
  const base64 = buffer.toString('base64')
  const mimeType = file.type
  const avatarUrl = `data:${mimeType};base64,${base64}`

  await prisma.user.update({
    where: { id: user.id },
    data: { avatarUrl },
  })

  await audit({
    ctx,
    action: 'user.avatar_update',
    category: 'UPDATE',
    targetType: 'User',
    targetId: user.id,
  })

  return NextResponse.json({ avatarUrl })
})
