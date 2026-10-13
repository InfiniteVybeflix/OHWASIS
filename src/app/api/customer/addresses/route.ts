import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getRequestContext, requireCustomer } from '@/lib/session'
import { withErrorHandler, parseBody } from '@/lib/api'
import { z } from 'zod'

/**
 * GET /api/customer/addresses
 * Returns the customer's saved addresses (multi-address book, with default flag).
 */
export const GET = withErrorHandler(async (req) => {
  const ctx = await getRequestContext(req)
  const user = requireCustomer(ctx)
  const addresses = await prisma.savedAddress.findMany({
    where: { userId: user.id },
    orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }],
  })
  return NextResponse.json({ addresses })
})

const addressSchema = z.object({
  label: z.string().min(1).max(60),
  line1: z.string().min(1).max(300),
  line2: z.string().max(300).optional(),
  city: z.string().min(1).max(120),
  region: z.string().min(1).max(120),
  country: z.string().length(2).default('KE'),
  postalCode: z.string().max(20).optional(),
  phone: z.string().max(30).optional(),
  notes: z.string().max(500).optional(),
  isDefault: z.boolean().default(false),
})

/**
 * POST /api/customer/addresses
 * Add a new address. If isDefault is true, all other addresses are unset as default.
 */
export const POST = withErrorHandler(async (req) => {
  const ctx = await getRequestContext(req)
  const user = requireCustomer(ctx)
  const input = await parseBody(req, addressSchema)
  const address = await prisma.$transaction(async (tx) => {
    if (input.isDefault) {
      await tx.savedAddress.updateMany({ where: { userId: user.id }, data: { isDefault: false } })
    }
    // If this is the first address, force isDefault = true
    const existingCount = await tx.savedAddress.count({ where: { userId: user.id } })
    return tx.savedAddress.create({
      data: {
        userId: user.id,
        label: input.label,
        line1: input.line1,
        line2: input.line2 ?? null,
        city: input.city,
        region: input.region,
        country: input.country,
        postalCode: input.postalCode ?? null,
        phone: input.phone ?? null,
        notes: input.notes ?? null,
        isDefault: input.isDefault || existingCount === 0,
      },
    })
  })
  return NextResponse.json({ address }, { status: 201 })
})

const patchSchema = z.object({
  id: z.string().cuid(),
  label: z.string().min(1).max(60).optional(),
  line1: z.string().min(1).max(300).optional(),
  line2: z.string().max(300).optional(),
  city: z.string().min(1).max(120).optional(),
  region: z.string().min(1).max(120).optional(),
  country: z.string().length(2).optional(),
  postalCode: z.string().max(20).optional(),
  phone: z.string().max(30).optional(),
  notes: z.string().max(500).optional(),
  isDefault: z.boolean().optional(),
})

/**
 * PATCH /api/customer/addresses
 * Update an address. If isDefault is set to true, unsets default on others.
 */
export const PATCH = withErrorHandler(async (req) => {
  const ctx = await getRequestContext(req)
  const user = requireCustomer(ctx)
  const input = await parseBody(req, patchSchema)
  const { id, isDefault, ...rest } = input
  const existing = await prisma.savedAddress.findUnique({ where: { id } })
  if (!existing || existing.userId !== user.id) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }
  await prisma.$transaction(async (tx) => {
    if (isDefault) {
      await tx.savedAddress.updateMany({ where: { userId: user.id }, data: { isDefault: false } })
    }
    await tx.savedAddress.update({
      where: { id },
      data: {
        ...(rest.label && { label: rest.label }),
        ...(rest.line1 && { line1: rest.line1 }),
        ...(rest.line2 !== undefined && { line2: rest.line2 ?? null }),
        ...(rest.city && { city: rest.city }),
        ...(rest.region && { region: rest.region }),
        ...(rest.country && { country: rest.country }),
        ...(rest.postalCode !== undefined && { postalCode: rest.postalCode ?? null }),
        ...(rest.phone !== undefined && { phone: rest.phone ?? null }),
        ...(rest.notes !== undefined && { notes: rest.notes ?? null }),
        ...(isDefault !== undefined && { isDefault }),
      },
    })
  })
  return NextResponse.json({ ok: true })
})

/**
 * DELETE /api/customer/addresses?id=...
 * If deleting the default, automatically promotes the most recent remaining
 * address to default (so there is always a default if any exist).
 */
export const DELETE = withErrorHandler(async (req) => {
  const ctx = await getRequestContext(req)
  const user = requireCustomer(ctx)
  const url = new URL(req.url)
  const id = url.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id_required' }, { status: 400 })
  const existing = await prisma.savedAddress.findUnique({ where: { id } })
  if (!existing || existing.userId !== user.id) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }
  await prisma.$transaction(async (tx) => {
    await tx.savedAddress.delete({ where: { id } })
    if (existing.isDefault) {
      // Promote the most recent remaining address to default
      const next = await tx.savedAddress.findFirst({
        where: { userId: user.id },
        orderBy: { updatedAt: 'desc' },
      })
      if (next) {
        await tx.savedAddress.update({ where: { id: next.id }, data: { isDefault: true } })
      }
    }
  })
  return NextResponse.json({ ok: true })
})
