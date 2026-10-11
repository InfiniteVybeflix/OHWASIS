import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getRequestContext, requireUser } from '@/lib/session'
import { createTenantSchema } from '@/lib/validation/schemas'
import { withErrorHandler, parseBody } from '@/lib/api'
import { audit } from '@/lib/audit'

export const POST = withErrorHandler(async (req) => {
  const ctx = await getRequestContext(req)
  const user = requireUser(ctx)
  const input = await parseBody(req, createTenantSchema)

  // Handle is unique — collision-checked before any side effect
  const existing = await prisma.tenant.findUnique({ where: { handle: input.handle } })
  if (existing) {
    return NextResponse.json({ error: 'handle_taken', message: 'Handle already taken' }, { status: 409 })
  }

  // Default capabilities by industry
  const capabilities = industryCapabilities(input.industry)

  const tenant = await prisma.tenant.create({
    data: {
      handle: input.handle,
      displayName: input.displayName,
      tagline: input.tagline ?? null,
      description: input.description ?? null,
      industry: input.industry,
      contactEmail: input.contactEmail ?? user.email,
      contactPhone: input.contactPhone ?? null,
      status: 'ACTIVE',
      adminRouteSlug: cryptoSlug(),
      capabilities: JSON.stringify(capabilities),
      theme: JSON.stringify(defaultTheme()),
    },
  })

  // Make the creating user the OWNER
  await prisma.membership.create({
    data: { userId: user.id, tenantId: tenant.id, role: 'OWNER', status: 'ACTIVE' },
  })

  await audit({
    ctx: { ...ctx, tenant: { id: tenant.id, handle: tenant.handle, displayName: tenant.displayName } },
    action: 'tenant.create',
    category: 'CREATE',
    targetType: 'Tenant',
    targetId: tenant.id,
    metadata: { handle: tenant.handle, industry: tenant.industry },
  })

  return NextResponse.json(
    {
      id: tenant.id,
      handle: tenant.handle,
      displayName: tenant.displayName,
      industry: tenant.industry,
      adminRouteSlug: tenant.adminRouteSlug,
    },
    { status: 201 },
  )
})

function cryptoSlug(): string {
  // 8-char collision-resistant slug for admin route obscurity
  const buf = new Uint8Array(6)
  crypto.getRandomValues(buf)
  return Array.from(buf, (b) => b.toString(16).padStart(2, '0')).join('')
}

function industryCapabilities(industry: string): string[] {
  const common = ['products', 'variants', 'categories', 'orders', 'cms']
  const byIndustry: Record<string, string[]> = {
    water_refill: ['refill_sizes', 'container_returns', 'delivery_zones'],
    restaurant: ['modifiers', 'preparation_time', 'pickup', 'delivery_zones'],
    grocery: ['unit_pricing', 'variable_quantity', 'delivery_zones'],
    fashion: ['size_variants', 'color_variants', 'variant_images'],
    cosmetics: ['shade_variants', 'variant_images'],
    electronics: ['warranty_info', 'specifications'],
    general_retail: ['delivery_zones'],
  }
  return [...common, ...(byIndustry[industry] ?? [])]
}

function defaultTheme() {
  return {
    primary: '#0f766e', // teal-700 — premium but not the cliché blue
    accent: '#f59e0b', // amber-500
    background: '#ffffff',
    foreground: '#0f172a',
    font: 'Inter, system-ui, sans-serif',
  }
}
