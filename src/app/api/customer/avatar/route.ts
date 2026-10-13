import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getRequestContext, requireUser } from '@/lib/session'
import { withErrorHandler } from '@/lib/api'
import { writeFileSync, mkdirSync, existsSync } from 'fs'
import { join } from 'path'
import { randomUUID } from 'crypto'
import { audit } from '@/lib/audit'

/**
 * POST /api/customer/avatar
 *
 * Upload a profile avatar image. Accepts multipart form data with a "file" field.
 * Saves to /public/uploads/ and updates the user's avatarUrl.
 */
export const POST = withErrorHandler(async (req) => {
  const ctx = await getRequestContext(req)
  const user = requireUser(ctx)

  const formData = await req.formData()
  const file = formData.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'no_file' }, { status: 400 })
  }

  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
  if (!allowedTypes.includes(file.type)) {
    return NextResponse.json({ error: 'invalid_type', message: 'Only JPEG, PNG, WebP, and GIF images are allowed.' }, { status: 400 })
  }
  if (file.size > 5 * 1024 * 1024) {
    return NextResponse.json({ error: 'too_large', message: 'Image must be under 5MB.' }, { status: 400 })
  }

  const uploadsDir = join(process.cwd(), 'public', 'uploads')
  if (!existsSync(uploadsDir)) {
    mkdirSync(uploadsDir, { recursive: true })
  }

  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg'
  const filename = `avatar-${user.id}-${randomUUID()}.${ext}`
  const filepath = join(uploadsDir, filename)
  const buffer = Buffer.from(await file.arrayBuffer())
  writeFileSync(filepath, buffer)

  const avatarUrl = `/uploads/${filename}`
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
