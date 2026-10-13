'use client'

import { useEffect, useState, type ComponentType } from 'react'
import { motion } from 'framer-motion'
import { useOhwasisStore, apiFetch } from '@/lib/store'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { BrandLockup } from '@/components/ohwasis/BrandMark'
import {
  ShatterImage,
  VenetianBlinds,
  TileFlip,
  CurtainReveal,
} from '@/components/ohwasis/Animations'
import { useReducedMotion } from '@/lib/useReducedMotion'
import {
  Store,
  ShieldCheck,
  Wallet,
  Bot,
  Globe,
  Layers,
  ArrowRight,
  ChevronDown,
  Sparkles,
  type LucideProps,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface TenantDTO {
  id: string
  handle: string
  displayName: string
  tagline?: string | null
  industry: string
  theme?: string | null
}

/* -------------------------------------------------------------------------- */
/* Static content                                                             */
/* -------------------------------------------------------------------------- */

type FeatureRow = {
  img: string
  eyebrow: string
  title: string
  description: string
  bullets: string[]
  align: 'left' | 'right'
}

const FEATURE_ROWS: FeatureRow[] = [
  {
    img: '/images/home/feature-storefronts.webp',
    eyebrow: '01 · Isolation',
    title: 'Isolated storefronts.',
    description:
      'Every merchant on OHWASIS gets a private, branded storefront with its own products, customers, orders, payments, and credentials. No cross-tenant leakage — ever.',
    bullets: [
      'Per-tenant data isolation at the database layer',
      'Independent branding, domains, and theme tokens',
      'Siloed customer accounts and order history',
    ],
    align: 'left',
  },
  {
    img: '/images/home/feature-infrastructure.webp',
    eyebrow: '02 · Infrastructure',
    title: 'Shared infrastructure.',
    description:
      'One battle-tested platform hosts every tenant. Updates, security patches, observability, and scaling are handled once — merchants never touch a server.',
    bullets: [
      'Single deployable, multi-tenant runtime',
      'Centralised observability and audit logging',
      'Zero-touch scaling for traffic spikes',
    ],
    align: 'right',
  },
  {
    img: '/images/home/feature-entrepreneur.webp',
    eyebrow: '03 · Founder console',
    title: 'Built for founders.',
    description:
      'A real merchant dashboard — not a config panel. Manage products, orders, customers, content, payments, and AI tools from a single, opinionated console.',
    bullets: [
      'Drag-and-drop product catalog & variants',
      'Native M-Pesa Daraja STK push integration',
      'CMS pages, delivery zones, and discounts',
    ],
    align: 'left',
  },
  {
    img: '/images/home/feature-business-growth.webp',
    eyebrow: '04 · Growth',
    title: 'Engineered to scale.',
    description:
      'From your first sale to your ten-thousandth order, OHWASIS grows with you. Built-in analytics, AI assistants, and automation keep operations lean.',
    bullets: [
      'Real-time dashboard KPIs and sales analytics',
      'AI-assisted product copy and customer replies',
      'Idempotent payment callbacks at any volume',
    ],
    align: 'right',
  },
  {
    img: '/images/home/feature-connected-stores.webp',
    eyebrow: '05 · Ecosystem',
    title: 'Connected tenants.',
    description:
      'Run multiple brands under one account. Switch storefronts instantly, share team members, and keep each brand\u2019s customer data strictly isolated.',
    bullets: [
      'One login, many storefronts',
      'Per-tenant role-based access control',
      'Cross-tenant team membership without data bleed',
    ],
    align: 'left',
  },
  {
    img: '/images/home/feature-vision.webp',
    eyebrow: '06 · Vision',
    title: 'A cyberpunk oasis.',
    description:
      'We envision a future where independent commerce is beautiful, fast, and accessible. OHWASIS is our oasis in the desert of generic e-commerce templates.',
    bullets: [
      'Open, hackable, and self-hostable',
      'Designed for emerging markets first',
      'Built for the next decade of independent retail',
    ],
    align: 'right',
  },
]

type Accent = 'cyan' | 'purple' | 'orange'

type Capability = {
  icon: ComponentType<LucideProps>
  title: string
  description: string
  accent: Accent
}

const ACCENT_GRADIENTS: Record<Accent, string> = {
  cyan: 'from-[#06b6d4] to-[#22d3ee]',
  purple: 'from-[#a855f7] to-[#c084fc]',
  orange: 'from-[#f97316] to-[#ec4899]',
}

const ACCENT_RING_SHADOW: Record<Accent, string> = {
  cyan: '0_0_20px_-5px_rgba(6,182,212,0.7)',
  purple: '0_0_20px_-5px_rgba(168,85,247,0.7)',
  orange: '0_0_20px_-5px_rgba(249,115,22,0.7)',
}

const ACCENT_HOVER_BORDER: Record<Accent, string> = {
  cyan: 'hover:border-[#06b6d4]/40',
  purple: 'hover:border-[#a855f7]/40',
  orange: 'hover:border-[#f97316]/40',
}

const ACCENT_HOVER_SHADOW: Record<Accent, string> = {
  cyan: 'hover:shadow-[0_0_40px_-10px_rgba(6,182,212,0.45)]',
  purple: 'hover:shadow-[0_0_40px_-10px_rgba(168,85,247,0.45)]',
  orange: 'hover:shadow-[0_0_40px_-10px_rgba(249,115,22,0.45)]',
}

const CAPABILITIES: Capability[] = [
  {
    icon: Layers,
    accent: 'cyan',
    title: 'Multi-tenant by design',
    description:
      'Every merchant\u2019s products, customers, orders, payments, and credentials are isolated at the data layer. No cross-tenant leakage.',
  },
  {
    icon: Wallet,
    accent: 'cyan',
    title: 'Real M-Pesa Daraja',
    description:
      'Native STK Push with idempotent callbacks, amount verification, and honest payment states. Manual / COD also supported.',
  },
  {
    icon: Bot,
    accent: 'purple',
    title: 'Aevibron AI Gateway',
    description:
      'Provider-neutral AI layer with tenant-scoped prompts. Recommended provider Aevibron; OpenAI-compatible adapters supported.',
  },
  {
    icon: Store,
    accent: 'purple',
    title: 'Configurable storefronts',
    description:
      'Branding, products, categories, CMS pages, delivery zones, discounts — all managed from a real merchant dashboard. No code edits per tenant.',
  },
  {
    icon: ShieldCheck,
    accent: 'orange',
    title: 'Audited security',
    description:
      'Server-side authorization on every route. Audit events for sensitive operations. Encrypted secrets at rest. Role-based merchant access.',
  },
  {
    icon: Globe,
    accent: 'orange',
    title: 'Domain & routing ready',
    description:
      'Custom-domain verification hooks and tenant routing by verified hostname. Admin route slugs are collision-resistant and configurable.',
  },
]

const BRAND_BG = '#0b1020'

/* -------------------------------------------------------------------------- */
/* Component                                                                  */
/* -------------------------------------------------------------------------- */

export function LandingView() {
  const setView = useOhwasisStore((s) => s.setView)
  const setActiveTenant = useOhwasisStore((s) => s.setActiveTenant)
  const setAuthModal = useOhwasisStore((s) => s.setAuthModal)
  const session = useOhwasisStore((s) => s.session)
  const reduce = useReducedMotion()

  const [tenants, setTenants] = useState<TenantDTO[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    void (async () => {
      try {
        const data = await apiFetch<{ tenants: TenantDTO[] }>('/api/tenants/list')
        setTenants(data.tenants)
      } catch {
        // ignore — empty directory
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  const openStorefront = (handle: string) => {
    setActiveTenant(handle)
    setView('storefront')
  }

  const triggerPrimaryCta = () => {
    if (session.user) {
      setView('merchant')
    } else {
      setAuthModal('signup')
    }
  }

  return (
    <div className="bg-background">
      {/* ---------------------------------------------------------------- */}
      {/* 1. Hero — brand lockup + natural-aspect banner + single CTA     */}
      {/* ---------------------------------------------------------------- */}
      <section className="relative overflow-hidden bg-[#0b1020] pt-14 pb-20 text-white sm:pt-20 sm:pb-28">
        {/* Ambient brand glows */}
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -top-32 left-1/2 h-72 w-[36rem] -translate-x-1/2 rounded-full bg-[#06b6d4]/20 blur-[120px]" />
          <div className="absolute bottom-0 left-1/4 h-72 w-72 rounded-full bg-[#a855f7]/15 blur-[100px]" />
          <div className="absolute bottom-0 right-1/4 h-72 w-72 rounded-full bg-[#f97316]/15 blur-[100px]" />
        </div>

        <div className="container relative mx-auto max-w-6xl px-4">
          {/* Brand lockup — small, above the banner */}
          <motion.div
            className="flex justify-center"
            initial={reduce ? false : { opacity: 0, y: -10 }}
            animate={reduce ? undefined : { opacity: 1, y: 0 }}
            transition={reduce ? undefined : { duration: 0.6, delay: 0.1 }}
          >
            <div className="flex items-center gap-3 rounded-full border border-white/15 bg-white/[0.04] py-2 pl-2 pr-5 backdrop-blur-md">
              <BrandLockup size={28} />
              <span className="hidden text-[10px] font-medium uppercase tracking-[0.32em] text-white/60 sm:inline">
                One · Hosted · Web · Architecture
              </span>
            </div>
          </motion.div>

          {/* Hero banner — natural 1440×530 aspect ratio. Baked-in marketing copy is left intact (no duplicate overlay). */}
          <motion.div
            className="relative mt-8 aspect-[1440/530] w-full overflow-hidden rounded-3xl border border-white/10 shadow-[0_0_80px_-20px_rgba(168,85,247,0.45)]"
            initial={reduce ? false : { opacity: 0, y: 30 }}
            animate={reduce ? undefined : { opacity: 1, y: 0 }}
            transition={
              reduce
                ? undefined
                : { duration: 0.8, delay: 0.2, ease: [0.22, 1, 0.36, 1] }
            }
          >
            <ShatterImage
              src="/images/home/hero-primary.webp"
              alt="OHWASIS hero banner — tropical synthwave sunset over a neon-lit water path with four isolated storefronts (Fashion, Tech, Beauty, Food) connected to one platform. Embedded headline reads: One Platform. Infinite Possibilities. Build Your Store."
              cols={6}
              rows={4}
              className="absolute inset-0 h-full w-full"
            />
            <div className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-white/10" />
          </motion.div>

          {/* Single CTA + scroll indicator below banner */}
          <motion.div
            className="mt-10 flex flex-col items-center gap-7"
            initial={reduce ? false : { opacity: 0, y: 20 }}
            animate={reduce ? undefined : { opacity: 1, y: 0 }}
            transition={reduce ? undefined : { duration: 0.7, delay: 0.6 }}
          >
            <div className="flex flex-wrap items-center justify-center gap-3">
              <Button
                size="lg"
                onClick={triggerPrimaryCta}
                className="border-0 bg-gradient-to-r from-[#06b6d4] to-[#a855f7] text-white shadow-[0_0_30px_-5px_rgba(168,85,247,0.65)] transition-all hover:from-[#22d3ee] hover:to-[#c084fc] hover:shadow-[0_0_45px_-5px_rgba(168,85,247,0.85)]"
              >
                Build Your Store
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
              <Button
                size="lg"
                variant="outline"
                asChild
                className="border-white/20 bg-white/5 text-white backdrop-blur-md hover:bg-white/10 hover:text-white"
              >
                <a href="#marketplace">Browse marketplace</a>
              </Button>
            </div>

            <motion.a
              href="#features"
              aria-label="Scroll to explore"
              className="group flex flex-col items-center gap-1 text-white/40 transition-colors hover:text-cyan-300"
              animate={reduce ? undefined : { y: [0, 6, 0] }}
              transition={
                reduce
                  ? undefined
                  : { duration: 1.6, repeat: Infinity, ease: 'easeInOut' }
              }
            >
              <span className="text-[10px] font-medium uppercase tracking-[0.32em]">
                Scroll to explore
              </span>
              <ChevronDown className="h-4 w-4" />
            </motion.a>
          </motion.div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* 2. Vision band — hero-alternative in its natural 1440×458 ratio */}
      {/* ---------------------------------------------------------------- */}
      <section className="relative overflow-hidden bg-[#0b1020] py-20 sm:py-28">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(168,85,247,0.15),transparent_60%)]" />

        <div className="container relative mx-auto max-w-6xl px-4">
          <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
            <motion.div
              initial={reduce ? false : { opacity: 0, x: -30 }}
              whileInView={reduce ? undefined : { opacity: 1, x: 0 }}
              viewport={{ once: true, margin: '-100px' }}
              transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
            >
              <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[10px] font-medium uppercase tracking-[0.32em] text-cyan-300">
                <Sparkles className="h-3 w-3" />
                The vision
              </span>
              <h2 className="mt-5 text-balance text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
                <span
                  style={{
                    background:
                      'linear-gradient(90deg, #f97316 0%, #ec4899 50%, #a855f7 100%)',
                    WebkitBackgroundClip: 'text',
                    backgroundClip: 'text',
                    color: 'transparent',
                  }}
                >
                  An oasis in the desert of generic e-commerce.
                </span>
              </h2>
              <p className="mt-5 max-w-xl text-base text-white/70 sm:text-lg">
                OHWASIS reimagines the storefront as a single hosted platform with
                infinite isolated tenants — one login, many brands, zero vendor
                lock-in. Beautiful by default. Fast by design. Open at the core.
              </p>
              <div className="mt-7 flex flex-wrap items-center gap-2">
                {['Self-hostable', 'Emerging-market first', 'Open architecture'].map(
                  (tag) => (
                    <Badge
                      key={tag}
                      variant="outline"
                      className="border-white/15 bg-white/5 text-[11px] uppercase tracking-wider text-white/70"
                    >
                      {tag}
                    </Badge>
                  ),
                )}
              </div>
            </motion.div>

            <motion.div
              className="relative aspect-[1440/458] w-full overflow-hidden rounded-3xl border border-white/10 shadow-[0_0_70px_-20px_rgba(249,115,22,0.45)]"
              initial={reduce ? false : { opacity: 0, scale: 0.96 }}
              whileInView={reduce ? undefined : { opacity: 1, scale: 1 }}
              viewport={{ once: true, margin: '-100px' }}
              transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
            >
              <VenetianBlinds
                src="/images/home/hero-alternative.webp"
                alt="OHWASIS vision artwork — alternative synthwave tropical hero depicting the OHWASIS ecosystem: one platform hosting many isolated, branded storefronts across the desert oasis."
                className="absolute inset-0 h-full w-full"
              />
              <div className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-white/10" />
            </motion.div>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* 3. Feature showcase — alternating rows with Venetian Blinds     */}
      {/* ---------------------------------------------------------------- */}
      <section
        id="features"
        className="relative overflow-hidden bg-[#0b1020] py-20 sm:py-28"
      >
        <div className="pointer-events-none absolute -top-32 left-1/2 h-72 w-[36rem] -translate-x-1/2 rounded-full bg-[#06b6d4]/15 blur-[120px]" />

        <div className="container relative mx-auto max-w-7xl px-4">
          <motion.div
            className="mx-auto mb-16 max-w-2xl text-center sm:mb-20"
            initial={reduce ? false : { opacity: 0, y: 30 }}
            whileInView={reduce ? undefined : { opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-100px' }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          >
            <p className="text-xs font-medium uppercase tracking-[0.32em] text-cyan-400">
              The platform
            </p>
            <h2 className="mt-3 text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl">
              <span
                style={{
                  background: 'linear-gradient(90deg, #06b6d4 0%, #a855f7 100%)',
                  WebkitBackgroundClip: 'text',
                  backgroundClip: 'text',
                  color: 'transparent',
                }}
              >
                A foundation built for growth.
              </span>
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-white/70">
              Six pillars of the OHWASIS platform — every piece engineered for
              serious, independent merchants.
            </p>
          </motion.div>

          <div className="space-y-20 sm:space-y-28">
            {FEATURE_ROWS.map((f) => (
              <div
                key={f.title}
                className={cn(
                  'grid items-center gap-8 lg:grid-cols-2 lg:gap-16',
                  f.align === 'right' && 'lg:[&>*:first-child]:order-2',
                )}
              >
                <div className="relative aspect-square overflow-hidden rounded-2xl border border-white/10 shadow-[0_0_50px_-12px_rgba(6,182,212,0.35)]">
                  <VenetianBlinds
                    src={f.img}
                    alt={`OHWASIS feature artwork: ${f.title}`}
                    className="absolute inset-0 h-full w-full"
                  />
                  <div className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-white/10" />
                </div>

                <div>
                  <span className="text-xs font-medium uppercase tracking-[0.32em] text-cyan-400">
                    {f.eyebrow}
                  </span>
                  <h3 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
                    <span
                      style={{
                        background:
                          'linear-gradient(90deg, #ffffff 0%, #cbd5e1 100%)',
                        WebkitBackgroundClip: 'text',
                        backgroundClip: 'text',
                        color: 'transparent',
                      }}
                    >
                      {f.title}
                    </span>
                  </h3>
                  <p className="mt-4 text-base text-white/70">{f.description}</p>
                  <ul className="mt-6 space-y-2.5">
                    {f.bullets.map((b) => (
                      <li
                        key={b}
                        className="flex items-start gap-3 text-sm text-white/80"
                      >
                        <span className="mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-gradient-to-r from-[#06b6d4] to-[#a855f7] shadow-[0_0_8px_rgba(168,85,247,0.7)]" />
                        <span>{b}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* 4. Capability grid — 3D Tile Flip on scroll                     */}
      {/* ---------------------------------------------------------------- */}
      <section className="relative overflow-hidden bg-gradient-to-b from-[#1e1b4b]/40 via-[#0f172a] to-[#0b1020] py-20 sm:py-28">
        <div className="pointer-events-none absolute -top-20 left-1/4 h-72 w-72 rounded-full bg-[#06b6d4]/20 blur-[100px]" />
        <div className="pointer-events-none absolute bottom-0 right-1/4 h-72 w-72 rounded-full bg-[#a855f7]/20 blur-[100px]" />
        <div className="pointer-events-none absolute bottom-1/3 left-1/2 h-60 w-60 -translate-x-1/2 rounded-full bg-[#f97316]/15 blur-[100px]" />

        <div className="container relative mx-auto max-w-7xl px-4">
          <motion.div
            className="mx-auto mb-16 max-w-2xl text-center"
            initial={reduce ? false : { opacity: 0, y: 30 }}
            whileInView={reduce ? undefined : { opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-100px' }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          >
            <p className="text-xs font-medium uppercase tracking-[0.32em] text-purple-400">
              Capabilities
            </p>
            <h2 className="mt-3 text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl">
              Everything you need.
              <br />
              <span
                style={{
                  background: 'linear-gradient(90deg, #06b6d4 0%, #a855f7 100%)',
                  WebkitBackgroundClip: 'text',
                  backgroundClip: 'text',
                  color: 'transparent',
                }}
              >
                Nothing you don&rsquo;t.
              </span>
            </h2>
          </motion.div>

          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {CAPABILITIES.map((cap, i) => (
              <TileFlip key={cap.title} delay={i * 0.08} className="h-full">
                <div
                  className={cn(
                    'group relative h-full overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] p-6 backdrop-blur-xl transition-all duration-300 hover:bg-white/[0.06]',
                    ACCENT_HOVER_BORDER[cap.accent],
                    ACCENT_HOVER_SHADOW[cap.accent],
                  )}
                >
                  <div
                    aria-hidden
                    className={cn(
                      'pointer-events-none absolute -right-12 -top-12 h-32 w-32 rounded-full bg-gradient-to-br opacity-0 blur-2xl transition-opacity duration-300 group-hover:opacity-100',
                      ACCENT_GRADIENTS[cap.accent],
                    )}
                  />
                  <div className="relative">
                    <div
                      className={cn(
                        'mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br text-white',
                        ACCENT_GRADIENTS[cap.accent],
                      )}
                      style={{
                        boxShadow: ACCENT_RING_SHADOW[cap.accent],
                      }}
                    >
                      <cap.icon className="h-6 w-6" />
                    </div>
                    <h3 className="text-lg font-semibold text-white">{cap.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-white/70">
                      {cap.description}
                    </p>
                  </div>
                </div>
              </TileFlip>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* 5. Merchant directory — id="marketplace"                        */}
      {/* ---------------------------------------------------------------- */}
      <section
        id="marketplace"
        className="relative overflow-hidden bg-[#0b1020] py-20 sm:py-28"
      >
        <div className="pointer-events-none absolute left-1/2 top-0 h-64 w-[40rem] -translate-x-1/2 rounded-full bg-[#f97316]/10 blur-[120px]" />

        <div className="container relative mx-auto max-w-7xl px-4">
          <motion.div
            className="mx-auto mb-12 max-w-2xl text-center"
            initial={reduce ? false : { opacity: 0, y: 30 }}
            whileInView={reduce ? undefined : { opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-100px' }}
            transition={{ duration: 0.7 }}
          >
            <p className="text-xs font-medium uppercase tracking-[0.32em] text-cyan-400">
              Live storefronts
            </p>
            <h2 className="mt-3 text-4xl font-bold tracking-tight sm:text-5xl">
              Browse the{' '}
              <span
                style={{
                  background: 'linear-gradient(90deg, #f97316 0%, #ec4899 100%)',
                  WebkitBackgroundClip: 'text',
                  backgroundClip: 'text',
                  color: 'transparent',
                }}
              >
                directory
              </span>
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-white/70">
              Real merchants running on OHWASIS right now.
            </p>
          </motion.div>

          {loading ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-52 animate-pulse rounded-2xl border border-white/10 bg-white/5"
                />
              ))}
            </div>
          ) : tenants.length === 0 ? (
            <CurtainReveal
              className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur-xl"
              from={BRAND_BG}
              to="#1e1b4b"
            >
              <div className="flex flex-col items-center gap-4 p-12 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[#06b6d4] to-[#a855f7] text-white shadow-[0_0_25px_-5px_rgba(168,85,247,0.6)]">
                  <Store className="h-6 w-6" />
                </div>
                <p className="max-w-md text-white/70">
                  No merchants published yet. Be the first to launch your storefront
                  on OHWASIS.
                </p>
                {!session.user && (
                  <Button
                    onClick={() => setAuthModal('signup')}
                    className="border-0 bg-gradient-to-r from-[#06b6d4] to-[#a855f7] text-white shadow-[0_0_30px_-5px_rgba(168,85,247,0.65)] hover:from-[#22d3ee] hover:to-[#c084fc]"
                  >
                    Get started
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                )}
              </div>
            </CurtainReveal>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {tenants.map((t, i) => (
                <TileFlip key={t.id} delay={Math.min(i * 0.05, 0.4)}>
                  <button
                    type="button"
                    onClick={() => openStorefront(t.handle)}
                    className="group relative block h-full w-full overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] p-6 text-left backdrop-blur-xl transition-all duration-300 hover:border-[#06b6d4]/50 hover:bg-white/[0.07] hover:shadow-[0_0_35px_-10px_rgba(6,182,212,0.5)]"
                  >
                    {/* Neon top-edge glow */}
                    <div
                      aria-hidden
                      className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#06b6d4]/70 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                    />
                    <div className="flex items-start justify-between gap-3">
                      <div
                        className="flex h-12 w-12 items-center justify-center rounded-xl text-sm font-bold text-white shadow-[0_0_20px_-5px_rgba(168,85,247,0.6)]"
                        style={{
                          background:
                            'linear-gradient(135deg, #06b6d4 0%, #a855f7 100%)',
                        }}
                      >
                        {t.displayName.slice(0, 2).toUpperCase()}
                      </div>
                      <Badge
                        variant="outline"
                        className="border-white/20 bg-white/5 text-[10px] uppercase tracking-wider text-white/70"
                      >
                        {industryLabel(t.industry)}
                      </Badge>
                    </div>
                    <h3 className="mt-4 text-lg font-semibold text-white">
                      {t.displayName}
                    </h3>
                    {t.tagline && (
                      <p className="mt-1 line-clamp-2 text-sm text-white/60">
                        {t.tagline}
                      </p>
                    )}
                    <div className="mt-5 flex items-center gap-1.5 text-sm font-medium text-cyan-400 transition-all group-hover:gap-2.5">
                      Explore {t.displayName}
                      <ArrowRight className="h-3.5 w-3.5" />
                    </div>
                  </button>
                </TileFlip>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* 6. CTA — animated gradient background                            */}
      {/* ---------------------------------------------------------------- */}
      <section className="relative overflow-hidden bg-[#0b1020] py-24 sm:py-32">
        {/* Animated gradient backdrop */}
        <div className="absolute inset-0">
          <div className="absolute inset-0 bg-gradient-to-br from-[#1e1b4b] via-[#0f172a] to-[#0b1020]" />
          <motion.div
            className="absolute left-1/2 top-1/2 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-60 blur-[120px]"
            style={{
              background:
                'conic-gradient(from 0deg, #06b6d4, #a855f7, #f97316, #ec4899, #06b6d4)',
            }}
            animate={reduce ? undefined : { rotate: 360 }}
            transition={
              reduce
                ? undefined
                : { duration: 30, repeat: Infinity, ease: 'linear' }
            }
          />
        </div>

        <div className="container relative mx-auto max-w-4xl px-4 text-center">
          <motion.div
            initial={reduce ? false : { opacity: 0, y: 30 }}
            whileInView={reduce ? undefined : { opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-100px' }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          >
            <h2 className="text-balance text-4xl font-bold tracking-tight sm:text-6xl">
              <span
                style={{
                  background:
                    'linear-gradient(90deg, #06b6d4 0%, #a855f7 50%, #f97316 100%)',
                  WebkitBackgroundClip: 'text',
                  backgroundClip: 'text',
                  color: 'transparent',
                }}
              >
                Bring your business online.
              </span>
            </h2>
            <p className="mx-auto mt-6 max-w-xl text-lg text-white/70">
              Pick a handle, choose an industry template, add products, configure
              payments, publish. No code. No vendor lock-in.
            </p>
            <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
              <Button
                size="lg"
                onClick={triggerPrimaryCta}
                className="border-0 bg-gradient-to-r from-[#06b6d4] to-[#a855f7] text-white shadow-[0_0_40px_-5px_rgba(168,85,247,0.7)] transition-all hover:from-[#22d3ee] hover:to-[#c084fc] hover:shadow-[0_0_55px_-5px_rgba(168,85,247,0.9)]"
              >
                Build Your Store
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
              <Button
                size="lg"
                variant="outline"
                asChild
                className="border-white/20 bg-white/5 text-white backdrop-blur-md hover:bg-white/10 hover:text-white"
              >
                <a href="#marketplace">Browse marketplace</a>
              </Button>
            </div>
          </motion.div>
        </div>
      </section>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function industryLabel(industry: string): string {
  const labels: Record<string, string> = {
    water_refill: 'Water & Refill',
    restaurant: 'Restaurant',
    grocery: 'Grocery',
    fashion: 'Fashion',
    cosmetics: 'Cosmetics',
    electronics: 'Electronics',
    general_retail: 'Retail',
  }
  return labels[industry] ?? industry
}
