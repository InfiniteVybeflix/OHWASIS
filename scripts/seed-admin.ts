// scripts/seed-admin.ts — Bootstraps the initial platform operator + demo data
// without requiring auth (since you need an operator before auth can grant
// operator access). Run once after `bun run db:push`.
//
// Usage: bun run /home/z/my-project/scripts/seed-admin.ts
import { PrismaClient } from '@prisma/client'
import crypto from 'crypto'

const prisma = new PrismaClient()

async function hashPassword(plaintext: string): Promise<string> {
  const salt = crypto.randomBytes(16).toString('hex')
  const hash = crypto.scryptSync(plaintext, salt, 64).toString('hex')
  return `scrypt$${salt}$${hash}`
}

function encryptSecret(plaintext: string): string {
  // Dev-only key — same as src/lib/crypto.ts fallback
  const key = crypto.createHash('sha256').update('ohwasis-dev-only-key-DO-NOT-USE-IN-PROD').digest()
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return JSON.stringify({
    iv: iv.toString('base64'),
    ct: ct.toString('base64'),
    tag: tag.toString('base64'),
  })
}

async function main() {
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
    console.log(`Created operator: ${operator.email} (password: admin-password)`)
  } else {
    console.log(`Operator already exists: ${operator.email}`)
    if (operator.globalRole < 2) {
      await prisma.user.update({ where: { id: operator.id }, data: { globalRole: 2, status: 'ACTIVE' } })
      console.log('  → upgraded to platform operator')
    }
  }

  await seedMerchant({
    handle: 'aquarefill',
    displayName: 'AquaRefill',
    tagline: 'Pure water, delivered to your door',
    description: 'AquaRefill delivers 18.9L refilled water bottles across Nairobi with a deposit-return scheme.',
    industry: 'water_refill',
    contactEmail: 'orders@aquarefill.example',
    contactPhone: '+254700100100',
    theme: { primary: '#0284c7', accent: '#f59e0b', background: '#ffffff', foreground: '#0f172a', font: 'Inter, system-ui, sans-serif' },
    ownerEmail: 'owner@aquarefill.example',
    ownerPassword: 'merchant-password',
    ownerName: 'AquaRefill Owner',
    capabilities: ['products', 'variants', 'categories', 'orders', 'cms', 'refill_sizes', 'container_returns', 'delivery_zones'],
    categories: [
      { name: 'Refills', slug: 'refills' },
      { name: 'Accessories', slug: 'accessories' },
    ],
    products: [
      { name: '18.9L Refill Bottle', slug: '189l-refill-bottle', basePrice: 250, stock: 100, description: '19L BPA-free refill bottle.', attributes: { refill_size: '18.9L', container_deposit: 200 }, categoryId: 0 },
      { name: '10L Refill Bottle', slug: '10l-refill-bottle', basePrice: 150, stock: 80, description: '10L BPA-free refill bottle.', attributes: { refill_size: '10L', container_deposit: 150 }, categoryId: 0 },
      { name: '5L Refill Bottle', slug: '5l-refill-bottle', basePrice: 80, stock: 200, description: '5L BPA-free refill bottle.', attributes: { refill_size: '5L', container_deposit: 100 }, categoryId: 0 },
      { name: 'Bottle Dispenser Pump', slug: 'dispenser-pump', basePrice: 350, stock: 30, description: 'Manual dispenser pump for 18.9L bottles.', attributes: {}, categoryId: 1 },
    ],
    zones: [
      { name: 'Nairobi CBD', areas: ['00100', '00200', '00300'], fee: 100, estimatedMinutes: 60 },
      { name: 'Westlands', areas: ['0100', '00620'], fee: 150, estimatedMinutes: 90 },
    ],
    page: { slug: 'about', title: 'About AquaRefill', body: '<p>AquaRefill is a water refill business committed to reducing single-use plastic.</p><p>We deliver across Nairobi with a deposit-return scheme on all our bottles.</p>' },
  })

  await seedMerchant({
    handle: 'mamanjeri',
    displayName: 'Mama Njeri Restaurant',
    tagline: 'Home-cooked Kenyan meals',
    description: 'Authentic Kenyan restaurant serving pilau, nyama choma, ugali, and more. Pickup and delivery available.',
    industry: 'restaurant',
    contactEmail: 'hello@mamanjeri.example',
    contactPhone: '+254700200200',
    theme: { primary: '#dc2626', accent: '#f59e0b', background: '#ffffff', foreground: '#0f172a', font: 'Inter, system-ui, sans-serif' },
    ownerEmail: 'owner@mamanjeri.example',
    ownerPassword: 'merchant-password',
    ownerName: 'Mama Njeri',
    capabilities: ['products', 'variants', 'categories', 'orders', 'cms', 'modifiers', 'preparation_time', 'pickup', 'delivery_zones'],
    categories: [
      { name: 'Mains', slug: 'mains' },
      { name: 'Drinks', slug: 'drinks' },
    ],
    products: [
      { name: 'Pilau (Beef)', slug: 'pilau-beef', basePrice: 350, stock: 50, description: 'Spiced rice cooked with beef and aromatic spices.', attributes: { preparation_minutes: 25 }, categoryId: 0 },
      { name: 'Nyama Choma (Half Kg)', slug: 'nyama-choma-half', basePrice: 600, stock: 20, description: 'Roasted goat meat, half kilogram.', attributes: { preparation_minutes: 40 }, categoryId: 0 },
      { name: 'Ugali & Sukuma', slug: 'ugali-sukuma', basePrice: 200, stock: 80, description: 'Traditional ugali with sukuma wiki.', attributes: { preparation_minutes: 15 }, categoryId: 0 },
      { name: 'Chapati & Beans', slug: 'chapati-beans', basePrice: 180, stock: 60, description: 'Two chapatis with bean stew.', attributes: { preparation_minutes: 10 }, categoryId: 0 },
      { name: 'Soda (300ml)', slug: 'soda-300ml', basePrice: 80, stock: 100, description: 'Assorted sodas.', attributes: {}, categoryId: 1 },
    ],
    zones: [
      { name: 'Within 5km', areas: ['nearby'], fee: 50, estimatedMinutes: 30, minimumOrder: 200 },
    ],
    page: { slug: 'about', title: 'About Mama Njeri', body: '<p>Mama Njeri Restaurant has been serving authentic Kenyan meals since 2018.</p><p>Open daily 10am–10pm.</p>' },
  })

  console.log(`\nDone. Login credentials:`)
  console.log(`  Platform operator: admin@ohwasis.local / admin-password`)
  console.log(`  AquaRefill owner: owner@aquarefill.example / merchant-password`)
  console.log(`  Mama Njeri owner: owner@mamanjeri.example / merchant-password`)
}

async function seedMerchant(m: {
  handle: string
  displayName: string
  tagline: string
  description: string
  industry: string
  contactEmail: string
  contactPhone: string
  theme: Record<string, string>
  ownerEmail: string
  ownerPassword: string
  ownerName: string
  capabilities: string[]
  categories: Array<{ name: string; slug: string }>
  products: Array<{ name: string; slug: string; basePrice: number; stock: number; description: string; attributes: Record<string, unknown>; categoryId: number }>
  zones: Array<{ name: string; areas: string[]; fee: number; estimatedMinutes: number; minimumOrder?: number }>
  page: { slug: string; title: string; body: string }
}) {
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
        theme: JSON.stringify(m.theme),
      },
    })
  }

  let owner = await prisma.user.findUnique({ where: { email: m.ownerEmail } })
  if (!owner) {
    owner = await prisma.user.create({
      data: { email: m.ownerEmail, passwordHash: await hashPassword(m.ownerPassword), name: m.ownerName, globalRole: 0 },
    })
  }
  const membershipExists = await prisma.membership.findUnique({
    where: { userId_tenantId: { userId: owner.id, tenantId: tenant.id } },
  })
  if (!membershipExists) {
    await prisma.membership.create({
      data: { userId: owner.id, tenantId: tenant.id, role: 'OWNER', status: 'ACTIVE' },
    })
  }

  const catIds: string[] = []
  for (const c of m.categories) {
    const existing = await prisma.category.findFirst({ where: { tenantId: tenant.id, slug: c.slug } })
    if (existing) { catIds.push(existing.id); continue }
    const cat = await prisma.category.create({ data: { ...c, tenantId: tenant.id } })
    catIds.push(cat.id)
  }

  for (const p of m.products) {
    const existing = await prisma.product.findFirst({ where: { tenantId: tenant.id, slug: p.slug } })
    if (existing) continue
    await prisma.product.create({
      data: {
        tenantId: tenant.id,
        name: p.name,
        slug: p.slug,
        description: p.description,
        categoryId: catIds[p.categoryId] ?? null,
        basePrice: p.basePrice,
        currency: 'KES',
        stock: p.stock,
        trackStock: true,
        status: 'ACTIVE',
        attributes: JSON.stringify(p.attributes),
      },
    })
  }

  for (const z of m.zones) {
    const existing = await prisma.deliveryZone.findFirst({ where: { tenantId: tenant.id, name: z.name } })
    if (existing) continue
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
  }

  const existingPage = await prisma.page.findFirst({ where: { tenantId: tenant.id, slug: m.page.slug } })
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
  }

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

  return { handle: tenant.handle, ownerEmail: owner.email }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
  })
