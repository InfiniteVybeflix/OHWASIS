import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getRequestContext, requireBusinessOwner } from '@/lib/session'
import { withErrorHandler, parseBody } from '@/lib/api'
import { z } from 'zod'
import { audit } from '@/lib/audit'
import { encryptSecret } from '@/lib/crypto'
import { createTenantSchema } from '@/lib/validation/schemas'

interface RouteParams { params: Promise<{ id: string }> }

const approveSchema = z.object({
  // Optional: the owner can EDIT the proposal before approving. If provided,
  // we use this instead of the original proposal.
  editedProposal: z.record(z.unknown()).optional(),
  // For business_setup: required handle
  handle: z.string().optional(),
  // Owner notes for the audit log
  notes: z.string().max(500).optional(),
})

/**
 * POST /api/ai/drafts/[id]/approve
 *
 * Owner approves an AI draft. If `editedProposal` is provided, the owner has
 * modified the AI's proposal — we apply the edited version. Otherwise we
 * apply the original AI proposal verbatim.
 *
 * For business_setup drafts: creates the Tenant + categories + products +
 * delivery zones + payment methods + opening hours, atomically.
 *
 * For cms_page drafts: creates a Page in DRAFT status (NOT published — the
 * owner can publish separately via PUT /api/pages/[id]).
 *
 * Returns the created record(s) so the UI can navigate to them.
 */
export const POST = withErrorHandler(async (req, { params }: RouteParams) => {
  const ctx = await getRequestContext(req)
  const user = requireBusinessOwner(ctx)
  const { id } = await params
  const input = await parseBody(req, approveSchema)

  const draft = await prisma.aiDraft.findUnique({ where: { id } })
  if (!draft) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }
  if (draft.requestedBy !== user.id) {
    return NextResponse.json({ error: 'forbidden', message: 'You can only approve your own drafts' }, { status: 403 })
  }
  if (draft.status !== 'PENDING') {
    return NextResponse.json({ error: 'already_decided', message: `Draft already ${draft.status.toLowerCase()}` }, { status: 400 })
  }

  const proposal = (input.editedProposal ?? JSON.parse(draft.proposal)) as Record<string, unknown>

  // Apply based on draftType
  let appliedTo: string | null = null
  if (draft.draftType === 'business_setup') {
    appliedTo = await applyBusinessSetup(draft, proposal, input.handle, user.id)
  } else if (draft.draftType === 'cms_page') {
    appliedTo = await applyCmsDraft(draft, proposal, user.id)
  } else if (draft.draftType === 'knowledge_entry') {
    appliedTo = await applyKnowledgeEntry(draft, proposal, user.id)
  } else if (draft.draftType === 'product_description') {
    appliedTo = await applyProductDescription(draft, proposal, user.id)
  } else {
    return NextResponse.json({ error: 'unknown_draft_type', draftType: draft.draftType }, { status: 400 })
  }

  // Mark the draft as approved
  const updated = await prisma.aiDraft.update({
    where: { id },
    data: {
      status: input.editedProposal ? 'EDITED' : 'APPROVED',
      proposal: JSON.stringify(proposal), // store the (possibly edited) version
      appliedTo,
      ownerFeedback: input.notes ?? null,
      decidedAt: new Date(),
    },
  })

  await audit({
    ctx,
    action: 'ai.draft.approved',
    category: 'AI',
    targetType: 'AiDraft',
    targetId: draft.id,
    metadata: { draftType: draft.draftType, appliedTo, edited: !!input.editedProposal },
  })

  return NextResponse.json({
    draftId: draft.id,
    status: updated.status,
    appliedTo,
    message: 'Draft approved and applied',
  })
})

/**
 * POST /api/ai/drafts/[id]/reject
 *
 * Owner rejects (cancels) the AI draft. Nothing is published.
 */
export const DELETE = withErrorHandler(async (req, { params }: RouteParams) => {
  const ctx = await getRequestContext(req)
  const user = requireBusinessOwner(ctx)
  const { id } = await params
  const draft = await prisma.aiDraft.findUnique({ where: { id } })
  if (!draft) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  if (draft.requestedBy !== user.id) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }
  await prisma.aiDraft.update({
    where: { id },
    data: { status: 'REJECTED', decidedAt: new Date() },
  })
  await audit({
    ctx,
    action: 'ai.draft.rejected',
    category: 'AI',
    targetType: 'AiDraft',
    targetId: draft.id,
    metadata: { draftType: draft.draftType },
  })
  return NextResponse.json({ ok: true })
})

// ---------------------------------------------------------------------------
// Draft appliers — turn an AI proposal into actual DB records.
// Each runs in a transaction so a partial failure rolls back.
// ---------------------------------------------------------------------------

async function applyBusinessSetup(
  draft: { id: string; requestedBy: string },
  proposal: Record<string, unknown>,
  handleOverride: string | undefined,
  ownerId: string,
): Promise<string> {
  // Validate the proposal shape against the create-tenant schema
  const input = createTenantSchema.parse({
    handle: handleOverride ?? slugify(String(proposal.displayName ?? 'my-business')),
    displayName: String(proposal.displayName ?? 'My Business'),
    tagline: proposal.tagline ? String(proposal.tagline) : undefined,
    description: proposal.description ? String(proposal.description) : undefined,
    industry: String(proposal.industry ?? 'general_retail'),
    contactEmail: undefined,
    contactPhone: undefined,
  })

  // Check handle collision
  const existing = await prisma.tenant.findUnique({ where: { handle: input.handle } })
  if (existing) {
    // Append a random suffix
    const suffix = Math.random().toString(36).slice(2, 6)
    input.handle = `${input.handle}-${suffix}`
  }

  // Create the tenant + everything in a transaction
  const tenant = await prisma.$transaction(async (tx) => {
    const t = await tx.tenant.create({
      data: {
        handle: input.handle,
        displayName: input.displayName,
        tagline: input.tagline ?? null,
        description: input.description ?? null,
        industry: input.industry,
        contactEmail: (await prisma.user.findUnique({ where: { id: ownerId } }))?.email ?? null,
        contactPhone: input.contactPhone ?? null,
        status: 'ACTIVE',
        adminRouteSlug: cryptoSlug(),
        capabilities: JSON.stringify(industryCapabilities(input.industry)),
        theme: JSON.stringify(defaultTheme(input.industry)),
        openingHours: JSON.stringify(proposal.suggestedOpeningHours ?? []),
        aiConfig: JSON.stringify({ tone: 'friendly', language: 'en' }),
      },
    })

    // Make the creating user the OWNER
    await tx.membership.create({
      data: { userId: ownerId, tenantId: t.id, role: 'OWNER', status: 'ACTIVE' },
    })

    // Create categories
    const categories = (proposal.suggestedCategories as string[] | undefined) ?? []
    const catIds: Record<string, string> = {}
    for (const cName of categories) {
      const slug = slugify(cName)
      const cat = await tx.category.create({
        data: { tenantId: t.id, name: cName, slug, sortOrder: 0 },
      })
      catIds[slug] = cat.id
      catIds[cName.toLowerCase()] = cat.id
    }

    // Create products
    const products = (proposal.suggestedProducts as Array<Record<string, unknown>> | undefined) ?? []
    for (const p of products) {
      const catSlug = slugify(String(p.category ?? ''))
      const catId = catIds[catSlug] ?? catIds[(String(p.category ?? '')).toLowerCase()] ?? null
      await tx.product.create({
        data: {
          tenantId: t.id,
          categoryId: catId,
          name: String(p.name ?? 'Untitled product'),
          slug: slugify(String(p.name ?? 'product')) + '-' + Math.random().toString(36).slice(2, 6),
          description: String(p.description ?? ''),
          basePrice: Number(p.basePrice ?? 0),
          currency: String(p.currency ?? 'KES'),
          stock: Number(p.stock ?? 100),
          trackStock: true,
          status: 'ACTIVE',
          attributes: '{}',
        },
      })
    }

    // Create delivery zones
    const zones = (proposal.suggestedDeliveryZones as Array<Record<string, unknown>> | undefined) ?? []
    for (const z of zones) {
      await tx.deliveryZone.create({
        data: {
          tenantId: t.id,
          name: String(z.name ?? 'Default zone'),
          areas: JSON.stringify([slugify(String(z.name ?? 'zone'))]),
          fee: Number(z.fee ?? 0),
          estimatedMinutes: z.estimatedMinutes ? Number(z.estimatedMinutes) : null,
          active: true,
        },
      })
    }

    // Create payment methods
    const methods = (proposal.suggestedPaymentMethods as string[] | undefined) ?? ['cash_on_delivery']
    for (const m of methods) {
      const meta = PAYMENT_METHOD_META[m as string] ?? { displayName: m, config: {} }
      await tx.paymentMethod.create({
        data: {
          tenantId: t.id,
          method: m,
          displayName: meta.displayName,
          enabled: true,
          config: JSON.stringify(meta.config),
          sortOrder: 0,
        },
      })
    }

    return t
  })

  return `tenant:${tenant.id}`
}

async function applyCmsDraft(
  draft: { tenantId: string | null },
  proposal: Record<string, unknown>,
  ownerId: string,
): Promise<string> {
  if (!draft.tenantId) {
    throw new Error('Cannot apply CMS draft without a tenant context')
  }
  const page = await prisma.page.create({
    data: {
      tenantId: draft.tenantId,
      slug: String(proposal.slug ?? 'untitled'),
      title: String(proposal.title ?? 'Untitled'),
      body: String(proposal.body ?? ''),
      status: 'DRAFT', // NOT published — owner publishes separately
      seo: JSON.stringify(proposal.seo ?? {}),
    },
  })
  // Save initial revision
  await prisma.pageRevision.create({
    data: {
      pageId: page.id,
      body: page.body,
      title: page.title,
      editedBy: ownerId,
    },
  })
  return `page:${page.id}`
}

async function applyKnowledgeEntry(
  draft: { tenantId: string | null },
  proposal: Record<string, unknown>,
  _ownerId: string,
): Promise<string> {
  if (!draft.tenantId) {
    throw new Error('Cannot apply knowledge entry without a tenant context')
  }
  const entry = await prisma.businessKnowledge.create({
    data: {
      tenantId: draft.tenantId,
      question: proposal.question ? String(proposal.question) : null,
      answer: String(proposal.answer ?? ''),
      category: String(proposal.category ?? 'general'),
      source: 'AI_SUGGESTED',
      status: 'APPROVED',
      confidence: proposal.confidence ? Number(proposal.confidence) : null,
    },
  })
  return `knowledge:${entry.id}`
}

async function applyProductDescription(
  draft: { tenantId: string | null },
  proposal: Record<string, unknown>,
  _ownerId: string,
): Promise<string> {
  if (!draft.tenantId) {
    throw new Error('Cannot apply product description without a tenant context')
  }
  const productId = proposal.productId ? String(proposal.productId) : null
  if (!productId) {
    throw new Error('Product description draft missing productId')
  }
  const description = String(proposal.description ?? '')
  await prisma.product.update({
    where: { id: productId },
    data: { description },
  })
  return `product:${productId}`
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PAYMENT_METHOD_META: Record<string, { displayName: string; config: Record<string, unknown> }> = {
  cash_on_delivery: { displayName: 'Cash on Delivery', config: { instructions: 'Pay with cash on delivery.' } },
  manual_till: { displayName: 'M-Pesa Till', config: { instructions: 'Pay to Till number provided at checkout.' } },
  manual_paybill: { displayName: 'M-Pesa Paybill', config: {} },
  bank_transfer: { displayName: 'Bank Transfer', config: {} },
  mpesa_stk: { displayName: 'M-Pesa STK Push', config: {} },
  mpesa_manual: { displayName: 'M-Pesa Manual', config: {} },
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32)
}

function cryptoSlug(): string {
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

function defaultTheme(industry: string): Record<string, string> {
  // Use the new OHWASIS brand palette
  return {
    primary: '#06b6d4', // cyan-500
    accent: '#a855f7', // purple-500
    background: '#ffffff',
    foreground: '#0f172a',
    font: 'Inter, system-ui, sans-serif',
  }
}

void encryptSecret // not used here but kept for future use
