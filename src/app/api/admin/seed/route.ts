import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getRequestContext, requirePlatformOperator } from '@/lib/session'
import { withErrorHandler } from '@/lib/api'
import { audit } from '@/lib/audit'

/**
 * POST /api/admin/seed
 *
 * Seeds the database with:
 *   - One platform operator user (admin@ohwasis.local / admin-password)
 *   - Two demo merchants (AquaRefill water delivery, Mama Njeri Restaurant)
 *   - Each merchant: owner user, products, categories, delivery zones, page
 *
 * Idempotent: re-running does NOT duplicate. Returns the seed summary.
 */
export const POST = withErrorHandler(async (req) => {
  const ctx = await getRequestContext(req)
  requirePlatformOperator(ctx)

  const summary = await seedDatabase()

  await audit({
    ctx,
    action: 'admin.seed',
    category: 'CREATE',
    metadata: summary,
  })

  return NextResponse.json({ ok: true, ...summary })
})

async function seedDatabase() {
  const { hashPassword } = await import('@/lib/session')
  const { encryptSecret } = await import('@/lib/crypto')

  // 1. Platform operator
  let operator = await prisma.user.findUnique({ where: { email: 'admin@ohwasis.local' } })
  if (!operator) {
    operator = await prisma.user.create({
      data: {
        email: 'admin@ohwasis.local',
        passwordHash: await hashPassword('admin-password'),
        name: 'Platform Operator',
        globalRole: 2,
      },
    })
  }

  // 2. Demo merchants
  const merchants = [
    {
      handle: 'aquarefill',
      displayName: 'AquaRefill',
      tagline: 'Pure water, delivered to your door',
      description: 'AquaRefill delivers 18.9L refilled water bottles across the city with a deposit-return scheme.',
      industry: 'water_refill',
      contactEmail: 'orders@aquarefill.example',
      contactPhone: '+254700100100',
      capabilities: ['products', 'variants', 'categories', 'orders', 'cms', 'refill_sizes', 'container_returns', 'delivery_zones'],
      ownerEmail: 'owner@aquarefill.example',
      ownerPassword: 'merchant-password',
      ownerName: 'AquaRefill Owner',
      products: [
        { name: '18.9L Refill Bottle', slug: '189l-refill-bottle', basePrice: 250, stock: 100, description: '19L BPA-free refill bottle.', attributes: { refill_size: '18.9L', container_deposit: 200 } },
        { name: '10L Refill Bottle', slug: '10l-refill-bottle', basePrice: 150, stock: 80, description: '10L BPA-free refill bottle.', attributes: { refill_size: '10L', container_deposit: 150 } },
        { name: '5L Refill Bottle', slug: '5l-refill-bottle', basePrice: 80, stock: 200, description: '5L BPA-free refill bottle.', attributes: { refill_size: '5L', container_deposit: 100 } },
        { name: 'Bottle Dispenser Pump', slug: 'dispenser-pump', basePrice: 350, stock: 30, description: 'Manual dispenser pump for 18.9L bottles.', attributes: {} },
      ],
      categories: [
        { name: 'Refills', slug: 'refills' },
        { name: 'Accessories', slug: 'accessories' },
      ],
      zones: [
        { name: 'Nairobi CBD', areas: ['00100', '00200', '00300'], fee: 100, estimatedMinutes: 60 },
        { name: 'Westlands', areas: ['0100', '00620'], fee: 150, estimatedMinutes: 90 },
      ],
      page: {
        slug: 'about',
        title: 'About AquaRefill',
        body: '<p>AquaRefill is a water refill business committed to reducing single-use plastic.</p><p>We deliver across Nairobi with a deposit-return scheme on all our bottles.</p>',
      },
    },
    {
      handle: 'mamanjeri',
      displayName: 'Mama Njeri Restaurant',
      tagline: 'Home-cooked Kenyan meals',
      description: 'Authentic Kenyan restaurant serving pilau, nyama choma, ugali, and more. Pickup and delivery available.',
      industry: 'restaurant',
      contactEmail: 'hello@mamanjeri.example',
      contactPhone: '+254700200200',
      capabilities: ['products', 'variants', 'categories', 'orders', 'cms', 'modifiers', 'preparation_time', 'pickup', 'delivery_zones'],
      ownerEmail: 'owner@mamanjeri.example',
      ownerPassword: 'merchant-password',
      ownerName: 'Mama Njeri',
      products: [
        { name: 'Pilau (Beef)', slug: 'pilau-beef', basePrice: 350, stock: 50, description: 'Spiced rice cooked with beef and aromatic spices.', attributes: { preparation_minutes: 25 } },
        { name: 'Nyama Choma (Half Kg)', slug: 'nyama-choma-half', basePrice: 600, stock: 20, description: 'Roasted goat meat, half kilogram.', attributes: { preparation_minutes: 40 } },
        { name: 'Ugali & Sukuma', slug: 'ugali-sukuma', basePrice: 200, stock: 80, description: 'Traditional ugali with sukuma wiki.', attributes: { preparation_minutes: 15 } },
        { name: 'Chapati & Beans', slug: 'chapati-beans', basePrice: 180, stock: 60, description: 'Two chapatis with bean stew.', attributes: { preparation_minutes: 10 } },
        { name: 'Soda (300ml)', slug: 'soda-300ml', basePrice: 80, stock: 100, description: 'Assorted sodas.', attributes: {} },
      ],
      categories: [
        { name: 'Mains', slug: 'mains' },
        { name: 'Drinks', slug: 'drinks' },
      ],
      zones: [
        { name: 'Within 5km', areas: ['nearby'], fee: 50, estimatedMinutes: 30, minimumOrder: 200 },
      ],
      page: {
        slug: 'about',
        title: 'About Mama Njeri',
        body: '<p>Mama Njeri Restaurant has been serving authentic Kenyan meals since 2018.</p><p>Open daily 10am–10pm.</p>',
      },
    },
  ]

  const created = { operator: false, merchants: 0, products: 0, categories: 0, zones: 0, pages: 0 }

  if (operator) created.operator = true

  for (const m of merchants) {
    // Skip if merchant already exists
    let tenant = await prisma.tenant.findUnique({ where: { handle: m.handle } })
    if (!tenant) {
      tenant = await prisma.tenant.create({
        data: {
          handle: m.handle,
          displayName: m.displayName,
          tagline: m.tagline,
          description: m.description,
          industry: m.industry,
          contactEmail: m.contactEmail,
          contactPhone: m.contactPhone,
          status: 'ACTIVE',
          capabilities: JSON.stringify(m.capabilities),
          theme: JSON.stringify({
            primary: m.industry === 'water_refill' ? '#0284c7' : '#dc2626',
            accent: '#f59e0b',
            background: '#ffffff',
            foreground: '#0f172a',
            font: 'Inter, system-ui, sans-serif',
          }),
        },
      })
      created.merchants++
    }

    // Owner user
    let owner = await prisma.user.findUnique({ where: { email: m.ownerEmail } })
    if (!owner) {
      owner = await prisma.user.create({
        data: { email: m.ownerEmail, passwordHash: await hashPassword(m.ownerPassword), name: m.ownerName, globalRole: 0 },
      })
    }
    // Membership
    const membershipExists = await prisma.membership.findUnique({
      where: { userId_tenantId: { userId: owner.id, tenantId: tenant.id } },
    })
    if (!membershipExists) {
      await prisma.membership.create({
        data: { userId: owner.id, tenantId: tenant.id, role: 'OWNER', status: 'ACTIVE' },
      })
    }

    // Categories
    for (const c of m.categories) {
      const existing = await prisma.category.findFirst({
        where: { tenantId: tenant.id, slug: c.slug },
      })
      if (!existing) {
        await prisma.category.create({ data: { ...c, tenantId: tenant.id } })
        created.categories++
      }
    }

    // Products
    for (const p of m.products) {
      const existing = await prisma.product.findFirst({
        where: { tenantId: tenant.id, slug: p.slug },
      })
      if (!existing) {
        await prisma.product.create({
          data: {
            tenantId: tenant.id,
            name: p.name,
            slug: p.slug,
            description: p.description,
            basePrice: p.basePrice,
            currency: 'KES',
            stock: p.stock,
            trackStock: true,
            status: 'ACTIVE',
            attributes: JSON.stringify(p.attributes),
          },
        })
        created.products++
      }
    }

    // Delivery zones
    for (const z of m.zones) {
      const existing = await prisma.deliveryZone.findFirst({
        where: { tenantId: tenant.id, name: z.name },
      })
      if (!existing) {
        await prisma.deliveryZone.create({
          data: {
            tenantId: tenant.id,
            name: z.name,
            areas: JSON.stringify(z.areas),
            fee: z.fee,
            estimatedMinutes: z.estimatedMinutes,
            minimumOrder: z.minimumOrder ?? null,
            active: true,
          },
        })
        created.zones++
      }
    }

    // Page
    const existingPage = await prisma.page.findFirst({
      where: { tenantId: tenant.id, slug: m.page.slug },
    })
    if (!existingPage) {
      await prisma.page.create({
        data: {
          tenantId: tenant.id,
          slug: m.page.slug,
          title: m.page.title,
          body: m.page.body,
          status: 'PUBLISHED',
          publishedAt: new Date(),
        },
      })
      created.pages++
    }

    // Enable cash-on-delivery + manual payment for both demo merchants
    const manualConfig = await prisma.paymentProviderConfig.findUnique({
      where: { tenantId_provider: { tenantId: tenant.id, provider: 'manual' } },
    })
    if (!manualConfig) {
      await prisma.paymentProviderConfig.create({
        data: {
          tenantId: tenant.id,
          provider: 'manual',
          displayName: 'Manual Payment (Till / Paybill)',
          enabled: true,
          environment: 'sandbox',
          encryptedConfig: encryptSecret(JSON.stringify({
            instructions: 'Pay to Till 123456 and reference your order number.',
            tillNumber: '123456',
          })),
          maskedHint: 'till:123456',
        },
      })
    }
    const codConfig = await prisma.paymentProviderConfig.findUnique({
      where: { tenantId_provider: { tenantId: tenant.id, provider: 'cash_on_delivery' } },
    })
    if (!codConfig) {
      await prisma.paymentProviderConfig.create({
        data: {
          tenantId: tenant.id,
          provider: 'cash_on_delivery',
          displayName: 'Cash on Delivery',
          enabled: true,
          environment: 'sandbox',
          encryptedConfig: encryptSecret(JSON.stringify({ instructions: 'Pay with cash when your order is delivered.' })),
          maskedHint: 'cod',
        },
      })
    }
  }

  return created
}
