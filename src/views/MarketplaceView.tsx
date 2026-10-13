'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useOhwasisStore, apiFetch } from '@/lib/store'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { motion } from 'framer-motion'
import { useReducedMotion } from '@/lib/useReducedMotion'
import { HamburgerMenu } from '@/components/ohwasis/HamburgerMenu'
import {
  Search,
  Star,
  Store as StoreIcon,
  ArrowRight,
  Sparkles,
  Flame,
  Truck,
  ShieldCheck,
  RotateCcw,
  Headphones,
  ChevronLeft,
  ChevronRight,
  Tag,
} from 'lucide-react'

interface MarketTenant {
  id: string
  handle: string
  displayName: string
  tagline: string | null
  industry: string
  theme: string | null
  contactEmail: string | null
  contactPhone: string | null
}

interface PromotionDTO {
  id: string
  title: string
  description: string | null
  imageUrl: string | null
  linkType: string | null
  linkRef: string | null
  placement: string
  tenant: {
    id: string
    handle: string
    displayName: string
    theme: Record<string, string> | null
  }
}

interface ProductImage {
  url: string
  altText?: string | null
}

interface ProductVariant {
  id: string
  name: string
  priceDelta: number
  stock: number
}

interface ProductDTO {
  id: string
  name: string
  slug: string
  basePrice: number
  currency: string
  stock: number
  trackStock: boolean
  status: string
  variants: ProductVariant[]
  images: ProductImage[]
  category: { id: string; name: string; slug: string } | null
  createdAt?: string
  _tenantHandle: string
  _tenantName: string
  _tenantIndustry: string
}

interface ReviewSummary {
  averageRating: number
  count: number
}

const INDUSTRY_PILLS: Array<{ key: string; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'water_refill', label: 'Water' },
  { key: 'restaurant', label: 'Food' },
  { key: 'grocery', label: 'Groceries' },
  { key: 'fashion', label: 'Fashion' },
  { key: 'cosmetics', label: 'Beauty' },
  { key: 'electronics', label: 'Electronics' },
  { key: 'general_retail', label: 'Retail' },
]

export function MarketplaceView() {
  const setView = useOhwasisStore((s) => s.setView)
  const setActiveTenant = useOhwasisStore((s) => s.setActiveTenant)
  const setActiveProduct = useOhwasisStore((s) => s.setActiveProduct)
  const reducedMotion = useReducedMotion()

  const [tenants, setTenants] = useState<MarketTenant[]>([])
  const [promotions, setPromotions] = useState<PromotionDTO[]>([])
  const [trending, setTrending] = useState<ProductDTO[]>([])
  const [newArrivals, setNewArrivals] = useState<ProductDTO[]>([])
  const [storeReviews, setStoreReviews] = useState<Record<string, ReviewSummary>>({})
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [activePromo, setActivePromo] = useState(0)
  const [promoPaused, setPromoPaused] = useState(false)
  const [industryFilter, setIndustryFilter] = useState<string>('all')
  const promoTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Initial load — tenants, promotions, and product feed across stores
  useEffect(() => {
    void (async () => {
      setLoading(true)
      try {
        const [tenantData, promoData] = await Promise.all([
          apiFetch<{ tenants: MarketTenant[] }>('/api/tenants/list', { tenantHandle: null }),
          apiFetch<{ promotions: PromotionDTO[] }>(
            '/api/promotions?placement=marketplace_top',
            { tenantHandle: null },
          ).catch(() => ({ promotions: [] as PromotionDTO[] })),
        ])
        setTenants(tenantData.tenants ?? [])
        setPromotions(promoData.promotions ?? [])

        // Fetch trending products across first N tenants (limit to keep API responsive)
        const top = (tenantData.tenants ?? []).slice(0, 12)
        const allProducts: ProductDTO[] = []
        const reviewMap: Record<string, ReviewSummary> = {}
        await Promise.all(
          top.map(async (t) => {
            try {
              const [prods, rev, status] = await Promise.all([
                apiFetch<{ items: Omit<ProductDTO, '_tenantHandle' | '_tenantName' | '_tenantIndustry'>[] }>(
                  `/api/storefront/products?handle=${t.handle}&pageSize=20&sort=newest`,
                  { tenantHandle: null },
                )
                  .then((r) => r.items.map((p) => ({ ...p, _tenantHandle: t.handle, _tenantName: t.displayName, _tenantIndustry: t.industry })))
                  .catch(() => [] as ProductDTO[]),
                apiFetch<ReviewSummary>(`/api/reviews?handle=${t.handle}&targetType=SHOP`, { tenantHandle: null })
                  .catch(() => ({ averageRating: 0, count: 0 })),
                apiFetch<{ openStatus: string }>(`/api/tenants/${t.handle}/status`, { tenantHandle: null })
                  .catch(() => ({ openStatus: 'OPEN' })),
              ])
              allProducts.push(...prods)
              reviewMap[t.id] = rev
              // Annotate tenant with open status (kept in separate state)
              void status
            } catch {
              /* skip tenant */
            }
          }),
        )
        // Sort by name then newest
        allProducts.sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))
        setTrending(allProducts.slice(0, 20))
        setNewArrivals(allProducts.slice(0, 12))
        setStoreReviews(reviewMap)
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  // Auto-rotate promotional banner every 5s
  useEffect(() => {
    if (promoTimerRef.current) clearInterval(promoTimerRef.current)
    if (promoPaused || promotions.length <= 1) return
    promoTimerRef.current = setInterval(() => {
      setActivePromo((i) => (i + 1) % Math.max(1, promotions.length))
    }, 5000)
    return () => {
      if (promoTimerRef.current) clearInterval(promoTimerRef.current)
    }
  }, [promoPaused, promotions.length])

  const openStorefront = (handle: string) => {
    setActiveTenant(handle)
    setView('store-profile')
  }

  const openProduct = (p: ProductDTO) => {
    setActiveProduct({ productId: p.id, tenantHandle: p._tenantHandle })
    setView('product-detail')
  }

  // Search filter (applies to both trending and newArrivals)
  const filteredTrending = useMemo(() => {
    let list = trending
    if (industryFilter !== 'all') {
      list = list.filter((p) => p._tenantIndustry === industryFilter)
    }
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p._tenantName.toLowerCase().includes(q),
      )
    }
    return list
  }, [trending, search, industryFilter])

  const filteredTenants = useMemo(() => {
    let list = tenants
    if (industryFilter !== 'all') {
      list = list.filter((t) => t.industry === industryFilter)
    }
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(
        (t) =>
          t.displayName.toLowerCase().includes(q) ||
          (t.tagline ?? '').toLowerCase().includes(q),
      )
    }
    return list
  }, [tenants, search, industryFilter])

  return (
    <div className="flex flex-col pb-20 sm:pb-8">
      {/* Top bar: hamburger + search */}
      <header className="sticky top-14 z-30 border-b border-border/60 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="container mx-auto max-w-7xl px-4 py-2">
          <div className="flex items-center gap-2">
            <HamburgerMenu />
            <form
              className="relative flex-1"
              onSubmit={(e) => e.preventDefault()}
            >
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search products, shops, categories…"
                className="h-10 w-full rounded-full border border-border bg-muted/40 pl-9 pr-4 text-sm outline-none focus:border-primary focus:bg-background focus:ring-2 focus:ring-primary/20"
              />
            </form>
          </div>
        </div>
      </header>

      {/* Promotional banner carousel */}
      <section
        className="container mx-auto max-w-7xl px-4 pt-4"
        onMouseEnter={() => setPromoPaused(true)}
        onMouseLeave={() => setPromoPaused(false)}
      >
        <div className="relative overflow-hidden rounded-xl">
          {loading ? (
            <Skeleton className="h-36 w-full rounded-xl sm:h-44" />
          ) : promotions.length > 0 ? (
            <div className="relative">
              <motion.div
                key={activePromo}
                initial={reducedMotion ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.4 }}
              >
                <PromoBanner promo={promotions[activePromo]} onClick={() => {
                  const p = promotions[activePromo]
                  if (p?.tenant?.handle) openStorefront(p.tenant.handle)
                }} />
              </motion.div>
              {promotions.length > 1 && (
                <>
                  <button
                    type="button"
                    onClick={() => setActivePromo((i) => (i - 1 + promotions.length) % promotions.length)}
                    className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-background/80 p-1.5 shadow backdrop-blur transition-colors hover:bg-background"
                    aria-label="Previous promo"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setActivePromo((i) => (i + 1) % promotions.length)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-background/80 p-1.5 shadow backdrop-blur transition-colors hover:bg-background"
                    aria-label="Next promo"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                  <div className="absolute bottom-2 left-1/2 flex -translate-x-1/2 gap-1">
                    {promotions.map((_, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setActivePromo(i)}
                        className={`h-1.5 rounded-full transition-all ${
                          i === activePromo ? 'w-6 bg-primary' : 'w-1.5 bg-foreground/30'
                        }`}
                        aria-label={`Go to promo ${i + 1}`}
                      />
                    ))}
                  </div>
                </>
              )}
            </div>
          ) : (
            <BrandedBanner onClick={() => setView('categories')} />
          )}
        </div>
      </section>

      {/* Category quick-access pills */}
      <section className="container mx-auto max-w-7xl px-4 py-3">
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
          {INDUSTRY_PILLS.map((pill) => (
            <button
              key={pill.key}
              type="button"
              onClick={() => {
                setIndustryFilter(pill.key)
                if (pill.key !== 'all') {
                  // also navigate to categories for non-"all"
                  if (pill.key === 'all') setView('marketplace')
                }
              }}
              className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                industryFilter === pill.key
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border/60 bg-background text-foreground hover:bg-accent'
              }`}
            >
              {pill.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setView('categories')}
            className="shrink-0 rounded-full border border-border/60 bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent"
          >
            All categories <ArrowRight className="ml-1 inline h-3 w-3" />
          </button>
        </div>
      </section>

      {/* Featured stores horizontal scroll */}
      <section className="container mx-auto max-w-7xl px-4 py-4">
        <SectionHeader
          title="Featured stores"
          icon={Sparkles}
          actionLabel="View all"
          onAction={() => setView('categories')}
        />
        {loading ? (
          <div className="-mx-4 flex gap-3 overflow-hidden px-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-32 w-56 shrink-0 rounded-xl" />
            ))}
          </div>
        ) : filteredTenants.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-2 py-8 text-center">
              <StoreIcon className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">No stores match your search.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-2">
            {filteredTenants.slice(0, 12).map((t, i) => {
              const theme = parseTheme(t.theme)
              const accent = theme?.primary ?? '#06b6d4'
              const review = storeReviews[t.id] ?? { averageRating: 0, count: 0 }
              return (
                <motion.button
                  key={t.id}
                  type="button"
                  onClick={() => openStorefront(t.handle)}
                  initial={reducedMotion ? false : { opacity: 0, x: 16 }}
                  whileInView={reducedMotion ? undefined : { opacity: 1, x: 0 }}
                  viewport={{ once: true, margin: '-30px' }}
                  transition={{ duration: 0.3, delay: i * 0.03 }}
                  className="group relative w-56 shrink-0 overflow-hidden rounded-xl border border-border/60 text-left transition-all hover:-translate-y-0.5 hover:shadow-md"
                >
                  <div
                    className="flex h-20 items-center gap-2 p-3"
                    style={{ background: `linear-gradient(135deg, ${accent}33, ${accent}11)` }}
                  >
                    <div
                      className="flex h-10 w-10 items-center justify-center rounded-lg text-xs font-bold text-white shadow"
                      style={{ backgroundColor: accent }}
                    >
                      {t.displayName.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold">{t.displayName}</div>
                      {t.tagline && (
                        <div className="truncate text-[10px] text-muted-foreground">{t.tagline}</div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center justify-between p-2">
                    <Badge variant="outline" className="text-[10px]">
                      {t.industry.replace(/_/g, ' ')}
                    </Badge>
                    {review.count > 0 && (
                      <div className="flex items-center gap-1 text-[10px]">
                        <Star className="h-2.5 w-2.5 fill-amber-400 text-amber-400" />
                        <span className="font-medium">{review.averageRating.toFixed(1)}</span>
                        <span className="text-muted-foreground">({review.count})</span>
                      </div>
                    )}
                  </div>
                </motion.button>
              )
            })}
          </div>
        )}
      </section>

      {/* Trending products 2-col grid */}
      <section className="container mx-auto max-w-7xl px-4 py-4">
        <SectionHeader
          title="Trending products"
          icon={Flame}
          actionLabel="See more"
          onAction={() => setView('categories')}
        />
        {loading ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="aspect-[3/4] w-full rounded-lg" />
            ))}
          </div>
        ) : filteredTrending.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-2 py-8 text-center">
              <StoreIcon className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                {search ? 'No products match your search.' : 'No products available yet.'}
              </p>
              <Button variant="outline" size="sm" onClick={() => setView('categories')}>
                Browse categories
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 lg:grid-cols-4">
            {filteredTrending.map((p, i) => (
              <motion.div
                key={`${p._tenantHandle}:${p.id}`}
                initial={reducedMotion ? false : { opacity: 0, y: 8 }}
                whileInView={reducedMotion ? undefined : { opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-30px' }}
                transition={{ duration: 0.25, delay: (i % 4) * 0.04 }}
              >
                <ProductCard product={p} onClick={() => openProduct(p)} />
              </motion.div>
            ))}
          </div>
        )}
      </section>

      {/* New arrivals 2-col grid */}
      <section className="container mx-auto max-w-7xl px-4 py-4">
        <SectionHeader
          title="New arrivals"
          icon={Sparkles}
          actionLabel="See more"
          onAction={() => setView('categories')}
        />
        {loading ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="aspect-[3/4] w-full rounded-lg" />
            ))}
          </div>
        ) : newArrivals.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              No new arrivals yet.
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 lg:grid-cols-4">
            {newArrivals.map((p, i) => (
              <motion.div
                key={`new:${p._tenantHandle}:${p.id}`}
                initial={reducedMotion ? false : { opacity: 0, y: 8 }}
                whileInView={reducedMotion ? undefined : { opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-30px' }}
                transition={{ duration: 0.25, delay: (i % 4) * 0.04 }}
              >
                <ProductCard product={p} onClick={() => openProduct(p)} />
              </motion.div>
            ))}
          </div>
        )}
      </section>

      {/* Trust badges */}
      <section className="container mx-auto max-w-7xl px-4 py-6">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <TrustBadge icon={Truck} title="Fast dispatch" subtitle="Local riders" />
          <TrustBadge icon={ShieldCheck} title="Secure payment" subtitle="M-Pesa ready" />
          <TrustBadge icon={RotateCcw} title="Easy returns" subtitle="Hassle-free" />
          <TrustBadge icon={Headphones} title="24/7 support" subtitle="Always here" />
        </div>
      </section>
    </div>
  )
}

function SectionHeader({
  title,
  icon: Icon,
  actionLabel,
  onAction,
}: {
  title: string
  icon: typeof Flame
  actionLabel?: string
  onAction?: () => void
}) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h2 className="flex items-center gap-2 text-base font-bold tracking-tight sm:text-lg">
        <Icon className="h-4 w-4 text-primary" />
        {title}
      </h2>
      {actionLabel && (
        <Button variant="ghost" size="sm" onClick={onAction}>
          {actionLabel} <ArrowRight className="ml-1 h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  )
}

function ProductCard({
  product,
  onClick,
}: {
  product: ProductDTO
  onClick: () => void
}) {
  const img = product.images[0]
  const outOfStock = product.trackStock && product.stock <= 0
  const discount = Math.round((1 - Math.min(1, product.basePrice / Math.max(1, product.basePrice * 1.2))) * 100) // placeholder until API returns compareAt

  return (
    <Card
      className="group cursor-pointer overflow-hidden border-border/60 transition-all hover:-translate-y-0.5 hover:shadow-md"
      onClick={onClick}
    >
      <div className="relative aspect-square overflow-hidden bg-muted/40">
        {img?.url ? (
          <img
            src={img.url}
            alt={img.altText ?? product.name}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-3xl font-bold text-muted-foreground/20">
            {product.name.slice(0, 2).toUpperCase()}
          </div>
        )}
        {outOfStock && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/60">
            <Badge variant="secondary" className="text-[10px]">Out of stock</Badge>
          </div>
        )}
        {discount > 0 && !outOfStock && (
          <Badge variant="destructive" className="absolute left-1 top-1 text-[9px]">
            -{discount}%
          </Badge>
        )}
        <div className="absolute bottom-1 left-1">
          <Badge
            variant="secondary"
            className="bg-background/90 text-[9px] font-medium text-foreground shadow-sm backdrop-blur"
          >
            <Truck className="mr-0.5 h-2.5 w-2.5" /> Dispatch
          </Badge>
        </div>
      </div>
      <CardContent className="p-2">
        <div className="line-clamp-1 text-xs font-medium leading-tight">{product.name}</div>
        <div className="mt-1 text-sm font-bold text-rose-600 dark:text-rose-400">
          KSh {product.basePrice.toLocaleString()}
        </div>
        <div className="mt-0.5 flex items-center gap-1 text-[10px] text-muted-foreground">
          <Star className="h-2.5 w-2.5 fill-amber-400 text-amber-400" />
          <span>4.5</span>
          <span aria-hidden>·</span>
          <span className="line-clamp-1">{product._tenantName}</span>
        </div>
      </CardContent>
    </Card>
  )
}

function PromoBanner({
  promo,
  onClick,
}: {
  promo: PromotionDTO
  onClick: () => void
}) {
  const accent = promo.tenant.theme?.primary ?? '#a855f7'
  return (
    <button
      type="button"
      onClick={onClick}
      className="relative block h-36 w-full overflow-hidden rounded-xl text-left sm:h-44"
      style={{
        background: `linear-gradient(135deg, ${accent}cc, ${accent}66 50%, ${accent}33)`,
      }}
    >
      {promo.imageUrl && (
        <img
          src={promo.imageUrl}
          alt={promo.title}
          className="absolute inset-0 h-full w-full object-cover opacity-30"
        />
      )}
      <div className="relative flex h-full flex-col justify-between p-4 text-white">
        <div>
          <Badge variant="secondary" className="bg-white/20 text-[10px] text-white backdrop-blur">
            <Tag className="mr-1 h-2.5 w-2.5" /> {promo.tenant.displayName}
          </Badge>
          <h3 className="mt-2 text-balance text-lg font-bold leading-tight sm:text-2xl">
            {promo.title}
          </h3>
          {promo.description && (
            <p className="mt-1 line-clamp-2 max-w-md text-xs text-white/90 sm:text-sm">
              {promo.description}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1 text-xs font-semibold">
          Shop now <ArrowRight className="h-3 w-3" />
        </div>
      </div>
    </button>
  )
}

function BrandedBanner({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="relative block h-36 w-full overflow-hidden rounded-xl text-left sm:h-44"
      style={{
        background:
          'linear-gradient(135deg, #06b6d4 0%, #a855f7 50%, #f97316 100%)',
      }}
    >
      <div className="relative flex h-full flex-col justify-between p-4 text-white">
        <div>
          <Badge variant="secondary" className="bg-white/20 text-[10px] text-white backdrop-blur">
            <Sparkles className="mr-1 h-2.5 w-2.5" /> Welcome to OHWASIS
          </Badge>
          <h3 className="mt-2 text-balance text-lg font-bold leading-tight sm:text-2xl">
            Discover local businesses you&apos;ll love
          </h3>
          <p className="mt-1 line-clamp-2 max-w-md text-xs text-white/90 sm:text-sm">
            Independent shops, fair prices, fast local dispatch, and AI answers for every business.
          </p>
        </div>
        <div className="flex items-center gap-1 text-xs font-semibold">
          Browse categories <ArrowRight className="h-3 w-3" />
        </div>
      </div>
    </button>
  )
}

function TrustBadge({
  icon: Icon,
  title,
  subtitle,
}: {
  icon: typeof Truck
  title: string
  subtitle: string
}) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-muted/20 p-3">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
        <Icon className="h-4 w-4 text-primary" />
      </div>
      <div className="min-w-0">
        <div className="truncate text-xs font-semibold">{title}</div>
        <div className="truncate text-[10px] text-muted-foreground">{subtitle}</div>
      </div>
    </div>
  )
}

function parseTheme(themeStr: string | null | undefined): Record<string, string> | null {
  if (!themeStr) return null
  try {
    return JSON.parse(themeStr)
  } catch {
    return null
  }
}
