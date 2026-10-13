'use client'

import { useEffect, useState } from 'react'
import { useOhwasisStore, apiFetch } from '@/lib/store'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { ArrowLeft, Star, MapPin, Phone, Mail, Clock, ShoppingBag, MessageCircle, Package } from 'lucide-react'
import { AskAiWidget } from '@/components/ohwasis/AskAiWidget'

interface StoreDetails {
  tenant: {
    id: string
    handle: string
    displayName: string
    tagline: string | null
    description: string | null
    industry: string
    theme: Record<string, string> | null
    contactEmail: string | null
    contactPhone: string | null
    address: Record<string, unknown> | null
  }
  categories: Array<{ id: string; name: string; slug: string; _count?: { products: number } }>
  productCount: number
  pages: Array<{ slug: string; title: string }>
  deliveryZones: Array<{ id: string; name: string; fee: number; estimatedMinutes: number | null; minimumOrder: number | null }>
}

interface ReviewDTO {
  id: string
  rating: number
  title: string | null
  body: string | null
  ownerReply: string | null
  ownerReplyAt: string | null
  createdAt: string
  user: { name: string; avatarUrl: string | null }
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
  variants: Array<{ id: string; name: string; priceDelta: number; stock: number }>
  images: Array<{ url: string; altText?: string | null }>
  category: { id: string; name: string; slug: string } | null
}

export function StoreProfileView() {
  const handle = useOhwasisStore((s) => s.activeTenantHandle)
  const setView = useOhwasisStore((s) => s.setView)
  const pushToast = useOhwasisStore((s) => s.pushToast)
  const setActiveProduct = useOhwasisStore((s) => s.setActiveProduct)
  const [store, setStore] = useState<StoreDetails | null>(null)
  const [openStatus, setOpenStatus] = useState<string>('OPEN')
  const [reviews, setReviews] = useState<ReviewDTO[]>([])
  const [avgRating, setAvgRating] = useState(0)
  const [products, setProducts] = useState<ProductDTO[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('overview')
  const [pageContent, setPageContent] = useState<{ title: string; body: string } | null>(null)

  useEffect(() => {
    if (!handle) {
      setView('marketplace')
      return
    }
    void (async () => {
      setLoading(true)
      try {
        const [sf, status, revs] = await Promise.all([
          apiFetch<StoreDetails>(`/api/storefront?handle=${handle}`),
          apiFetch<{ openStatus: string; openingHours: Array<{ day: number; open: string; close: string; closed: boolean }> }>(`/api/tenants/${handle}/status`),
          apiFetch<{ reviews: ReviewDTO[]; averageRating: number; count: number }>(`/api/reviews?handle=${handle}&targetType=SHOP`),
        ])
        setStore(sf)
        setOpenStatus(status.openStatus)
        setReviews(revs.reviews)
        setAvgRating(revs.averageRating)
      } catch {
        // ignore
      } finally {
        setLoading(false)
      }
    })()
  }, [handle, setView])

  // Fetch products (only when products tab is opened)
  useEffect(() => {
    if (!handle || tab !== 'products') return
    void (async () => {
      try {
        const data = await apiFetch<{ items: ProductDTO[] }>(`/api/storefront/products?handle=${handle}&pageSize=50`)
        setProducts(data.items)
      } catch { /* ignore */ }
    })()
  }, [handle, tab])

  if (!handle) return null

  if (loading || !store) {
    return (
      <div className="container mx-auto max-w-5xl px-4 py-8">
        <Skeleton className="mb-4 h-32 w-full" />
        <Skeleton className="h-8 w-1/2" />
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-48" />)}
        </div>
      </div>
    )
  }

  const t = store.tenant
  const theme = t.theme ?? null
  const accent = theme?.primary ?? '#06b6d4'
  const isOpen = openStatus === 'OPEN'

  return (
    <div className="flex flex-col">
      {/* Cover */}
      <div
        className="relative overflow-hidden border-b"
        style={{ background: `linear-gradient(135deg, ${accent}33, ${accent}11)` }}
      >
        <div className="container mx-auto max-w-5xl px-4 py-6">
          <button
            onClick={() => setView('marketplace')}
            className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back to marketplace
          </button>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-3">
              <div
                className="flex h-16 w-16 items-center justify-center rounded-xl text-xl font-bold text-white shadow"
                style={{ backgroundColor: accent }}
              >
                {t.displayName.slice(0, 2).toUpperCase()}
              </div>
              <div>
                <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{t.displayName}</h1>
                {t.tagline && <p className="text-sm text-muted-foreground">{t.tagline}</p>}
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                  <Badge variant={isOpen ? 'default' : 'secondary'}>
                    <span className={`mr-1 h-1.5 w-1.5 rounded-full ${isOpen ? 'bg-emerald-300' : 'bg-rose-300'}`} />
                    {isOpen ? 'Open now' : openStatus === 'TEMPORARILY_CLOSED' ? 'Paused' : 'Closed'}
                  </Badge>
                  <Badge variant="outline" className="text-[10px]">{t.industry.replace('_', ' ')}</Badge>
                  {reviews.length > 0 && (
                    <Badge variant="outline" className="text-[10px]">
                      <Star className="mr-1 h-3 w-3 fill-amber-400 text-amber-400" />
                      {avgRating.toFixed(1)} ({reviews.length})
                    </Badge>
                  )}
                  <Badge variant="outline" className="text-[10px]">
                    <Package className="mr-1 h-3 w-3" /> {store.productCount} products
                  </Badge>
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={() => setView('storefront')}>
                <ShoppingBag className="mr-2 h-4 w-4" /> Explore {t.displayName}
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto max-w-5xl px-4 py-8">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="flex w-full max-w-md overflow-x-auto">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="products">Products</TabsTrigger>
            <TabsTrigger value="reviews">Reviews ({reviews.length})</TabsTrigger>
            <TabsTrigger value="contact">Contact</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-4 space-y-4">
            {t.description && (
              <Card>
                <CardHeader><CardTitle className="text-sm">About {t.displayName}</CardTitle></CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">{t.description}</p>
                </CardContent>
              </Card>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <Card>
                <CardHeader><CardTitle className="text-sm flex items-center gap-2"><MapPin className="h-4 w-4" /> Delivery areas</CardTitle></CardHeader>
                <CardContent>
                  {store.deliveryZones.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No delivery zones configured.</p>
                  ) : (
                    <ul className="space-y-1 text-sm">
                      {store.deliveryZones.map((z) => (
                        <li key={z.id} className="flex justify-between">
                          <span>{z.name}</span>
                          <span className="text-muted-foreground">KES {z.fee}{z.estimatedMinutes ? ` · ~${z.estimatedMinutes}min` : ''}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Clock className="h-4 w-4" /> Hours</CardTitle></CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    {isOpen ? 'Currently open.' : openStatus === 'TEMPORARILY_CLOSED' ? 'Temporarily closed.' : 'Currently closed — you can still place an order for verification.'}
                  </p>
                </CardContent>
              </Card>
            </div>
            <Card>
              <CardHeader><CardTitle className="text-sm">Categories</CardTitle></CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {store.categories.map((c) => (
                    <Badge key={c.id} variant="outline" className="cursor-pointer" onClick={() => { setView('storefront') }}>
                      {c.name}{c._count?.products ? ` (${c._count.products})` : ''}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="products" className="mt-4">
            {products.length === 0 ? (
              <p className="text-sm text-muted-foreground">No products published.</p>
            ) : (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 lg:grid-cols-4">
                {products.map((p) => (
                  <ProductCard
                    key={p.id}
                    product={p}
                    currency={p.currency}
                    tenantHandle={handle}
                    onOpen={() => {
                      setActiveProduct({ productId: p.id, tenantHandle: handle })
                      setView('product-detail')
                    }}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="reviews" className="mt-4 space-y-3">
            {reviews.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-sm text-muted-foreground">
                  No reviews yet. Be the first to review {t.displayName}!
                </CardContent>
              </Card>
            ) : (
              <>
                <div className="flex items-center gap-3">
                  <div className="text-4xl font-bold">{avgRating.toFixed(1)}</div>
                  <div>
                    <div className="flex">
                      {[1, 2, 3, 4, 5].map((s) => (
                        <Star key={s} className={`h-4 w-4 ${s <= Math.round(avgRating) ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground'}`} />
                      ))}
                    </div>
                    <div className="text-xs text-muted-foreground">{reviews.length} review{reviews.length === 1 ? '' : 's'}</div>
                  </div>
                </div>
                <ul className="space-y-3">
                  {reviews.map((r) => (
                    <li key={r.id}>
                      <Card>
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                                {r.user.name?.[0]?.toUpperCase() ?? 'A'}
                              </div>
                              <div>
                                <div className="text-sm font-medium">{r.user.name}</div>
                                <div className="flex">
                                  {[1, 2, 3, 4, 5].map((s) => (
                                    <Star key={s} className={`h-3 w-3 ${s <= r.rating ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground'}`} />
                                  ))}
                                </div>
                              </div>
                            </div>
                            <div className="text-xs text-muted-foreground">{new Date(r.createdAt).toLocaleDateString()}</div>
                          </div>
                          {r.title && <div className="mt-2 text-sm font-medium">{r.title}</div>}
                          {r.body && <p className="mt-1 text-sm text-muted-foreground">{r.body}</p>}
                          {r.ownerReply && (
                            <div className="mt-3 rounded border border-border/40 bg-muted/30 p-2">
                              <div className="text-xs font-medium text-primary">Reply from {t.displayName}</div>
                              <p className="text-sm">{r.ownerReply}</p>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </TabsContent>

          <TabsContent value="contact" className="mt-4">
            <Card>
              <CardContent className="space-y-2 py-4 text-sm">
                {t.contactEmail && (
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <a href={`mailto:${t.contactEmail}`} className="text-primary hover:underline">{t.contactEmail}</a>
                  </div>
                )}
                {t.contactPhone && (
                  <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    <a href={`tel:${t.contactPhone}`} className="text-primary hover:underline">{t.contactPhone}</a>
                  </div>
                )}
                {store.pages.map((p) => (
                  <div key={p.slug} className="flex items-center gap-2">
                    <MessageCircle className="h-4 w-4 text-muted-foreground" />
                    <button
                      className="text-primary hover:underline cursor-pointer text-sm"
                      onClick={async () => {
                        try {
                          const data = await apiFetch<{ page: { title: string; body: string } }>(`/api/storefront/page?handle=${handle}&slug=${p.slug}`, { tenantHandle: null })
                          setPageContent({ title: data.page.title, body: data.page.body })
                        } catch {
                          pushToast({ type: 'error', message: 'Could not load page' })
                        }
                      }}
                    >
                      {p.title}
                    </button>
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      <AskAiWidget tenantHandle={handle} tenantName={t.displayName} />

      {/* CMS Page dialog */}
      <Dialog open={!!pageContent} onOpenChange={(o) => !o && setPageContent(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{pageContent?.title}</DialogTitle>
          </DialogHeader>
          <div
            className="prose prose-sm dark:prose-invert max-w-none"
            dangerouslySetInnerHTML={{ __html: pageContent?.body ?? '' }}
          />
        </DialogContent>
      </Dialog>
    </div>
  )
}

function ProductCard({
  product,
  currency,
  tenantHandle,
  onOpen,
}: {
  product: ProductDTO
  currency: string
  tenantHandle: string
  onOpen: () => void
}) {
  const img = product.images[0]
  const outOfStock = product.trackStock && product.stock <= 0
  void tenantHandle
  return (
    <Card
      className="group cursor-pointer overflow-hidden border-border/60 transition-all hover:-translate-y-0.5 hover:shadow-md"
      onClick={onOpen}
    >
      <div className="relative aspect-square overflow-hidden bg-muted/30">
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
      </div>
      <CardContent className="p-2">
        <div className="line-clamp-1 text-xs font-medium leading-tight">{product.name}</div>
        <div className="mt-0.5 text-sm font-bold text-rose-600 dark:text-rose-400">
          {currency} {product.basePrice.toLocaleString()}
        </div>
        {product.trackStock && product.stock > 0 && product.stock < 10 && (
          <div className="text-[10px] text-amber-600 dark:text-amber-400">Only {product.stock} left</div>
        )}
      </CardContent>
    </Card>
  )
}
