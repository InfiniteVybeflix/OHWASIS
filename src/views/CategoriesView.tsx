'use client'

import { useEffect, useMemo, useState } from 'react'
import { useOhwasisStore, apiFetch } from '@/lib/store'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { motion } from 'framer-motion'
import { useReducedMotion } from '@/lib/useReducedMotion'
import {
  ArrowLeft,
  Star,
  Store as StoreIcon,
  ShoppingBag,
  Truck,
  Package,
  Droplets,
  UtensilsCrossed,
  Carrot,
  Shirt,
  Smartphone,
  Palette,
  Baby,
  Pill,
  Home as HomeIcon,
  Dumbbell,
  BookOpen,
  Wrench,
  Search,
} from 'lucide-react'

interface MarketTenant {
  id: string
  handle: string
  displayName: string
  tagline: string | null
  industry: string
  theme: string | null
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
  description: string | null
  basePrice: number
  currency: string
  stock: number
  trackStock: boolean
  status: string
  variants: ProductVariant[]
  images: ProductImage[]
  category: { id: string; name: string; slug: string } | null
  _tenantHandle: string
  _tenantName: string
}

const INDUSTRY_META: Record<
  string,
  { label: string; icon: typeof StoreIcon; gradient: string }
> = {
  water_refill: { label: 'Water & Refill', icon: Droplets, gradient: 'from-cyan-500/20 to-blue-500/10' },
  restaurant: { label: 'Restaurants', icon: UtensilsCrossed, gradient: 'from-orange-500/20 to-red-500/10' },
  grocery: { label: 'Grocery', icon: Carrot, gradient: 'from-green-500/20 to-lime-500/10' },
  fashion: { label: 'Fashion', icon: Shirt, gradient: 'from-pink-500/20 to-rose-500/10' },
  cosmetics: { label: 'Cosmetics', icon: Palette, gradient: 'from-fuchsia-500/20 to-purple-500/10' },
  electronics: { label: 'Electronics', icon: Smartphone, gradient: 'from-blue-500/20 to-indigo-500/10' },
  general_retail: { label: 'Retail', icon: ShoppingBag, gradient: 'from-amber-500/20 to-yellow-500/10' },
  baby_kids: { label: 'Baby & Kids', icon: Baby, gradient: 'from-pink-400/20 to-orange-400/10' },
  health_wellness: { label: 'Health & Wellness', icon: Pill, gradient: 'from-emerald-500/20 to-teal-500/10' },
  home_living: { label: 'Home & Living', icon: HomeIcon, gradient: 'from-stone-500/20 to-amber-500/10' },
  fitness_sports: { label: 'Fitness & Sports', icon: Dumbbell, gradient: 'from-orange-500/20 to-red-500/10' },
  books_stationery: { label: 'Books & Stationery', icon: BookOpen, gradient: 'from-indigo-500/20 to-blue-500/10' },
  auto_parts: { label: 'Auto & Parts', icon: Wrench, gradient: 'from-slate-500/20 to-zinc-500/10' },
}

function industryMeta(industry: string) {
  return (
    INDUSTRY_META[industry] ?? {
      label: industry.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
      icon: StoreIcon,
      gradient: 'from-cyan-500/20 to-purple-500/10',
    }
  )
}

export function CategoriesView() {
  const setView = useOhwasisStore((s) => s.setView)
  const setActiveProduct = useOhwasisStore((s) => s.setActiveProduct)
  const pushToast = useOhwasisStore((s) => s.pushToast)
  const reducedMotion = useReducedMotion()

  const [tenants, setTenants] = useState<MarketTenant[]>([])
  const [loadingTenants, setLoadingTenants] = useState(true)
  const [activeIndustry, setActiveIndustry] = useState<string | null>(null)
  const [products, setProducts] = useState<ProductDTO[]>([])
  const [loadingProducts, setLoadingProducts] = useState(false)
  const [search, setSearch] = useState('')

  useEffect(() => {
    void (async () => {
      try {
        const data = await apiFetch<{ tenants: MarketTenant[] }>('/api/tenants/list')
        setTenants(data.tenants ?? [])
      } catch {
        setTenants([])
      } finally {
        setLoadingTenants(false)
      }
    })()
  }, [])

  // Group tenants by industry → category cards
  const industries = useMemo(() => {
    const map = new Map<string, { industry: string; count: number }>()
    for (const t of tenants) {
      const existing = map.get(t.industry)
      if (existing) existing.count += 1
      else map.set(t.industry, { industry: t.industry, count: 1 })
    }
    return Array.from(map.values()).sort((a, b) => b.count - a.count)
  }, [tenants])

  // Fetch products for the selected industry (across all its tenants)
  useEffect(() => {
    if (!activeIndustry) return
    const matching = tenants.filter((t) => t.industry === activeIndustry)
    if (matching.length === 0) return
    setLoadingProducts(true)
    setProducts([])
    void (async () => {
      try {
        const results = await Promise.all(
          matching.map((t) =>
            apiFetch<{ items: Omit<ProductDTO, '_tenantHandle' | '_tenantName'>[] }>(
              `/api/storefront/products?handle=${t.handle}&pageSize=200`,
              { tenantHandle: null },
            )
              .then((r) => ({
                items: r.items.map((p) => ({ ...p, _tenantHandle: t.handle, _tenantName: t.displayName })),
              }))
              .catch(() => ({ items: [] as ProductDTO[] })),
          ),
        )
        const merged: ProductDTO[] = []
        for (const r of results) merged.push(...r.items)
        // Sort newest first
        merged.sort((a, b) => b.name.localeCompare(a.name))
        setProducts(merged)
      } catch (err) {
        pushToast({
          type: 'error',
          message: err instanceof Error ? err.message : 'Failed to load products',
        })
      } finally {
        setLoadingProducts(false)
      }
    })()
  }, [activeIndustry, tenants, pushToast])

  const filteredProducts = useMemo(() => {
    if (!search) return products
    const q = search.toLowerCase()
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p._tenantName.toLowerCase().includes(q),
    )
  }, [products, search])

  const openProduct = (p: ProductDTO) => {
    setActiveProduct({ productId: p.id, tenantHandle: p._tenantHandle })
    setView('product-detail')
  }

  return (
    <div className="flex flex-col">
      {/* Header */}
      <header className="sticky top-14 z-30 border-b border-border/60 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="container mx-auto max-w-7xl px-4 py-3">
          <div className="flex items-center gap-2">
            {activeIndustry && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setActiveIndustry(null)
                  setProducts([])
                  setSearch('')
                }}
                className="-ml-2"
              >
                <ArrowLeft className="mr-1 h-4 w-4" /> Back
              </Button>
            )}
            <h1 className="flex-1 text-lg font-bold tracking-tight">
              {activeIndustry ? industryMeta(activeIndustry).label : 'Categories'}
            </h1>
          </div>
        </div>
      </header>

      <div className="container mx-auto max-w-7xl px-4 py-4 pb-20 sm:pb-8">
        {/* Category cards grid */}
        {!activeIndustry && (
          <>
            <p className="mb-4 text-sm text-muted-foreground">
              Browse businesses by category. Tap a category to see products from every shop in it.
            </p>
            {loadingTenants ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {Array.from({ length: 8 }).map((_, i) => (
                  <Skeleton key={i} className="h-28 w-full rounded-xl" />
                ))}
              </div>
            ) : industries.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
                  <StoreIcon className="h-10 w-10 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    No shops available yet. Check back soon!
                  </p>
                  <Button variant="outline" size="sm" onClick={() => setView('marketplace')}>
                    Browse marketplace
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {industries.map((ind, i) => {
                  const meta = industryMeta(ind.industry)
                  const Icon = meta.icon
                  return (
                    <motion.button
                      key={ind.industry}
                      type="button"
                      onClick={() => setActiveIndustry(ind.industry)}
                      initial={reducedMotion ? false : { opacity: 0, y: 12 }}
                      whileInView={reducedMotion ? undefined : { opacity: 1, y: 0 }}
                      viewport={{ once: true, margin: '-30px' }}
                      transition={{ duration: 0.25, delay: i * 0.04 }}
                      className={`group relative overflow-hidden rounded-xl border border-border/60 bg-gradient-to-br ${meta.gradient} p-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-md`}
                    >
                      <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-lg bg-background/80 backdrop-blur">
                        <Icon className="h-5 w-5 text-foreground" />
                      </div>
                      <div className="text-sm font-semibold">{meta.label}</div>
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        {ind.count} {ind.count === 1 ? 'shop' : 'shops'}
                      </div>
                      <ArrowLeft className="absolute -bottom-2 -right-2 h-12 w-12 rotate-[135deg] text-foreground/10 transition-transform group-hover:rotate-[150deg]" />
                    </motion.button>
                  )
                })}
              </div>
            )}
          </>
        )}

        {/* Products from selected category */}
        {activeIndustry && (
          <>
            <div className="relative mb-4 mt-2">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={`Search in ${industryMeta(activeIndustry).label}…`}
                className="h-10 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </div>

            {loadingProducts ? (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 lg:grid-cols-4">
                {Array.from({ length: 8 }).map((_, i) => (
                  <Skeleton key={i} className="aspect-[3/4] w-full rounded-lg" />
                ))}
              </div>
            ) : filteredProducts.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
                  <Package className="h-10 w-10 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    {search ? 'No products match your search.' : 'No products in this category yet.'}
                  </p>
                  <Button variant="outline" size="sm" onClick={() => setView('marketplace')}>
                    Browse marketplace
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 lg:grid-cols-4">
                {filteredProducts.map((p) => (
                  <CategoryProductCard
                    key={`${p._tenantHandle}:${p.id}`}
                    product={p}
                    onClick={() => openProduct(p)}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function CategoryProductCard({
  product,
  onClick,
}: {
  product: ProductDTO
  onClick: () => void
}) {
  const img = product.images[0]
  const outOfStock = product.trackStock && product.stock <= 0

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
          <div className="flex h-full items-center justify-center text-2xl font-bold text-muted-foreground/30">
            {product.name.slice(0, 2).toUpperCase()}
          </div>
        )}
        {outOfStock && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/60">
            <Badge variant="secondary" className="text-[10px]">Out of stock</Badge>
          </div>
        )}
        <div className="absolute bottom-1 left-1">
          <Badge
            variant="secondary"
            className="bg-background/90 text-[9px] font-medium text-foreground shadow-sm backdrop-blur"
          >
            <Truck className="mr-0.5 h-2.5 w-2.5" /> Local Dispatch
          </Badge>
        </div>
      </div>
      <CardContent className="p-2">
        <div className="line-clamp-1 text-xs font-medium">{product.name}</div>
        <div className="mt-0.5 text-sm font-bold text-rose-600 dark:text-rose-400">
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
