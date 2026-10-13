'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useOhwasisStore, apiFetch } from '@/lib/store'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { motion } from 'framer-motion'
import { useReducedMotion } from '@/lib/useReducedMotion'
import { AskAiWidget } from '@/components/ohwasis/AskAiWidget'
import {
  ArrowLeft,
  Star,
  Heart,
  Share2,
  ShoppingCart,
  Store as StoreIcon,
  Truck,
  Package,
  ChevronRight,
  ShieldCheck,
  RotateCcw,
  Minus,
  Plus,
  Check,
  MessageSquare,
} from 'lucide-react'

const CART_KEY = 'ohwasis_cart_session_v1'
const WISHLIST_KEY = 'ohwasis_wishlist_v1'

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
  createdAt?: string
}

interface StorefrontData {
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
  }
  productCount: number
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

interface ShopReviewSummary {
  averageRating: number
  count: number
}

export function ProductDetailView() {
  const activeProduct = useOhwasisStore((s) => s.activeProduct)
  const setActiveProduct = useOhwasisStore((s) => s.setActiveProduct)
  const setView = useOhwasisStore((s) => s.setView)
  const setActiveTenant = useOhwasisStore((s) => s.setActiveTenant)
  const pushToast = useOhwasisStore((s) => s.pushToast)
  const session = useOhwasisStore((s) => s.session)
  const setAuthModal = useOhwasisStore((s) => s.setAuthModal)
  const reducedMotion = useReducedMotion()

  const [storefront, setStorefront] = useState<StorefrontData | null>(null)
  const [allProducts, setAllProducts] = useState<ProductDTO[]>([])
  const [reviews, setReviews] = useState<ReviewDTO[]>([])
  const [avgRating, setAvgRating] = useState(0)
  const [reviewCount, setReviewCount] = useState(0)
  const [shopReview, setShopReview] = useState<ShopReviewSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null)
  const [activeImage, setActiveImage] = useState(0)
  const [quantity, setQuantity] = useState(1)
  const [addingToCart, setAddingToCart] = useState(false)
  const [wished, setWished] = useState(false)
  const [wishlistBusy, setWishlistBusy] = useState(false)

  const tenantHandle = activeProduct?.tenantHandle ?? null
  const productId = activeProduct?.productId ?? null

  // Load product + store + reviews
  const loadAll = useCallback(async () => {
    if (!tenantHandle || !productId) {
      setNotFound(true)
      setLoading(false)
      return
    }
    setLoading(true)
    setNotFound(false)
    try {
      const [sf, prods, revs, shopRev] = await Promise.all([
        apiFetch<StorefrontData>(`/api/storefront?handle=${tenantHandle}`, { tenantHandle: null }),
        apiFetch<{ items: ProductDTO[] }>(`/api/storefront/products?handle=${tenantHandle}&pageSize=200`, { tenantHandle: null }),
        apiFetch<{ reviews: ReviewDTO[]; averageRating: number; count: number }>(
          `/api/reviews?handle=${tenantHandle}&targetType=PRODUCT&productId=${productId}`,
          { tenantHandle: null },
        ).catch(() => ({ reviews: [], averageRating: 0, count: 0 })),
        apiFetch<{ averageRating: number; count: number }>(
          `/api/reviews?handle=${tenantHandle}&targetType=SHOP`,
          { tenantHandle: null },
        ).catch(() => ({ averageRating: 0, count: 0 })),
      ])
      setStorefront(sf)
      setAllProducts(prods.items ?? [])
      setReviews(revs.reviews)
      setAvgRating(revs.averageRating)
      setReviewCount(revs.count)
      setShopReview(shopRev)
      // Reset selectors
      const product = (prods.items ?? []).find((p) => p.id === productId)
      if (product) {
        setSelectedVariantId(product.variants[0]?.id ?? null)
        setActiveImage(0)
        setQuantity(1)
      } else {
        setNotFound(true)
      }
      // Wishlist state
      try {
        const arr = JSON.parse(localStorage.getItem(WISHLIST_KEY) ?? '[]') as Array<{ productId: string }>
        setWished(Array.isArray(arr) && arr.some((w) => w.productId === productId))
      } catch {
        setWished(false)
      }
    } catch {
      setNotFound(true)
    } finally {
      setLoading(false)
    }
  }, [tenantHandle, productId])

  useEffect(() => {
    void loadAll()
  }, [loadAll])

  // Track recently viewed (best-effort, customer-only)
  useEffect(() => {
    if (!tenantHandle || !productId || !session.user) return
    void apiFetch('/api/customer/recently-viewed', {
      method: 'POST',
      body: JSON.stringify({ productId, tenantHandle }),
      tenantHandle: null,
    }).catch(() => {
      /* best-effort */
    })
  }, [tenantHandle, productId, session.user])

  const product = useMemo(
    () => allProducts.find((p) => p.id === productId) ?? null,
    [allProducts, productId],
  )

  const relatedProducts = useMemo(() => {
    if (!product) return []
    return allProducts
      .filter((p) => p.id !== product.id)
      .sort((a, b) => {
        // Prefer same category, then newest first
        if (a.category?.id === product.category?.id && b.category?.id !== product.category?.id) return -1
        if (b.category?.id === product.category?.id && a.category?.id !== product.category?.id) return 1
        return (b.createdAt ?? '').localeCompare(a.createdAt ?? '')
      })
      .slice(0, 10)
  }, [allProducts, product])

  const selectedVariant = useMemo(
    () => product?.variants.find((v) => v.id === selectedVariantId) ?? null,
    [product, selectedVariantId],
  )

  const unitPrice = (product?.basePrice ?? 0) + (selectedVariant?.priceDelta ?? 0)
  const availableStock = selectedVariant ? selectedVariant.stock : product?.stock ?? 0
  const outOfStock = product?.trackStock && availableStock <= 0
  const lowStock = product?.trackStock && availableStock > 0 && availableStock < 10

  const addToCart = async () => {
    if (!tenantHandle || !product) return
    setAddingToCart(true)
    try {
      const sk = localStorage.getItem(CART_KEY) || crypto.randomUUID()
      localStorage.setItem(CART_KEY, sk)
      await apiFetch(`/api/cart?handle=${tenantHandle}&sessionKey=${sk}`, {
        method: 'POST',
        body: JSON.stringify({
          productId: product.id,
          variantId: selectedVariantId ?? undefined,
          quantity,
        }),
        tenantHandle: null,
      })
      // Update bottom-nav cart badge
      try {
        const countRes = await apiFetch<{ cart: { items: Array<{ quantity: number }> } | null }>(
          `/api/cart?handle=${tenantHandle}&sessionKey=${sk}`,
          { tenantHandle: null },
        )
        const count = countRes.cart?.items.reduce((s, i) => s + i.quantity, 0) ?? 0
        localStorage.setItem('ohwasis_cart_count_v1', String(count))
        window.dispatchEvent(new Event('ohwasis-cart-updated'))
      } catch {
        /* ignore */
      }
      pushToast({ type: 'success', message: `${product.name} added to cart` })
    } catch (err) {
      pushToast({
        type: 'error',
        message: err instanceof Error ? err.message : 'Could not add to cart',
      })
    } finally {
      setAddingToCart(false)
    }
  }

  const toggleWishlist = async () => {
    if (!tenantHandle || !product) return
    if (!session.user) {
      setAuthModal('login')
      pushToast({ type: 'info', message: 'Sign in to save to your wishlist' })
      return
    }
    setWishlistBusy(true)
    try {
      if (wished) {
        await apiFetch(`/api/customer/wishlist?productId=${product.id}`, {
          method: 'DELETE',
          tenantHandle: null,
        })
        setWished(false)
        // Update localStorage count for bottom nav
        try {
          const arr = JSON.parse(localStorage.getItem(WISHLIST_KEY) ?? '[]') as Array<{ productId: string }>
          const filtered = arr.filter((w) => w.productId !== product.id)
          localStorage.setItem(WISHLIST_KEY, JSON.stringify(filtered))
          window.dispatchEvent(new Event('ohwasis-wishlist-updated'))
        } catch {
          /* ignore */
        }
        pushToast({ type: 'info', message: 'Removed from wishlist' })
      } else {
        await apiFetch('/api/customer/wishlist', {
          method: 'POST',
          body: JSON.stringify({ productId: product.id, tenantHandle, variantId: selectedVariantId ?? undefined }),
          tenantHandle: null,
        })
        setWished(true)
        try {
          const arr = JSON.parse(localStorage.getItem(WISHLIST_KEY) ?? '[]') as Array<{ productId: string }>
          arr.push({ productId: product.id })
          localStorage.setItem(WISHLIST_KEY, JSON.stringify(arr))
          window.dispatchEvent(new Event('ohwasis-wishlist-updated'))
        } catch {
          /* ignore */
        }
        pushToast({ type: 'success', message: 'Added to wishlist' })
      }
    } catch (err) {
      const code = (err as Error & { code?: string })?.code
      if (code === 'already_in_wishlist') {
        setWished(true)
        pushToast({ type: 'info', message: 'Already in your wishlist' })
      } else {
        pushToast({
          type: 'error',
          message: err instanceof Error ? err.message : 'Could not update wishlist',
        })
      }
    } finally {
      setWishlistBusy(false)
    }
  }

  const shareProduct = async () => {
    if (!product || !tenantHandle) return
    const url = typeof window !== 'undefined' ? window.location.href : `https://ohwasis.app/${tenantHandle}/products/${product.slug}`
    const shareData = {
      title: product.name,
      text: product.description ?? `Check out ${product.name} on OHWASIS`,
      url,
    }
    try {
      if (typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share(shareData)
      } else {
        await navigator.clipboard.writeText(url)
        pushToast({ type: 'success', message: 'Link copied to clipboard' })
      }
    } catch {
      /* user cancelled — ignore */
    }
  }

  const visitStore = () => {
    if (!tenantHandle) return
    setActiveTenant(tenantHandle)
    setView('store-profile')
  }

  const goBack = () => {
    setActiveProduct(null)
    setView('marketplace')
  }

  if (!tenantHandle || !productId) {
    return (
      <div className="container mx-auto max-w-3xl px-4 py-12 text-center">
        <p className="text-muted-foreground">No product selected.</p>
        <Button className="mt-4" onClick={() => setView('marketplace')}>
          Browse marketplace
        </Button>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="container mx-auto max-w-6xl px-4 py-6">
        <div className="grid gap-6 sm:grid-cols-2">
          <Skeleton className="aspect-square w-full rounded-xl" />
          <div className="space-y-3">
            <Skeleton className="h-8 w-3/4" />
            <Skeleton className="h-6 w-1/3" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        </div>
      </div>
    )
  }

  if (notFound || !product || !storefront) {
    return (
      <div className="container mx-auto max-w-3xl px-4 py-12 text-center">
        <Package className="mx-auto h-10 w-10 text-muted-foreground" />
        <p className="mt-2 text-muted-foreground">This product is no longer available.</p>
        <Button className="mt-4" onClick={goBack}>
          Back to marketplace
        </Button>
      </div>
    )
  }

  const tenant = storefront.tenant
  const accent = tenant.theme?.primary ?? '#06b6d4'
  const images = product.images.length > 0 ? product.images : [{ url: '', altText: product.name }]
  const ratingBuckets = computeRatingBuckets(reviews)

  return (
    <div className="flex flex-col pb-20 sm:pb-8">
      {/* Back bar */}
      <div className="border-b border-border/60 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="container mx-auto max-w-6xl px-4 py-2">
          <button
            onClick={goBack}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> Back
          </button>
        </div>
      </div>

      <div className="container mx-auto max-w-6xl px-4 py-4">
        {/* Main: gallery + details */}
        <div className="grid gap-6 sm:grid-cols-2 lg:gap-8">
          {/* Gallery */}
          <div className="space-y-2">
            <motion.div
              initial={reducedMotion ? false : { opacity: 0, scale: 0.97 }}
              animate={reducedMotion ? undefined : { opacity: 1, scale: 1 }}
              transition={{ duration: 0.25 }}
              className="relative aspect-square overflow-hidden rounded-xl border border-border/60 bg-muted/30"
            >
              {images[activeImage]?.url ? (
                <img
                  src={images[activeImage].url}
                  alt={images[activeImage].altText ?? product.name}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full items-center justify-center text-5xl font-bold text-muted-foreground/20">
                  {product.name.slice(0, 2).toUpperCase()}
                </div>
              )}
              {outOfStock && (
                <div className="absolute inset-0 flex items-center justify-center bg-background/70">
                  <Badge variant="secondary" className="text-xs">Out of stock</Badge>
                </div>
              )}
              <button
                type="button"
                onClick={shareProduct}
                className="absolute right-2 top-2 inline-flex h-9 w-9 items-center justify-center rounded-full bg-background/90 text-foreground shadow backdrop-blur transition-transform hover:scale-110"
                aria-label="Share product"
              >
                <Share2 className="h-4 w-4" />
              </button>
            </motion.div>
            {images.length > 1 && (
              <div className="flex gap-2 overflow-x-auto pb-1">
                {images.map((img, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setActiveImage(i)}
                    className={`relative h-16 w-16 shrink-0 overflow-hidden rounded-md border-2 transition-colors ${
                      i === activeImage ? 'border-primary' : 'border-border/60'
                    }`}
                  >
                    {img.url ? (
                      <img src={img.url} alt={img.altText ?? `${product.name} ${i + 1}`} className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full items-center justify-center text-[10px] font-bold text-muted-foreground/30">
                        {product.name.slice(0, 2).toUpperCase()}
                      </div>
                    )}
                  </button>
                ))}
              </div>
            )}
            {/* Trust badges */}
            <div className="grid grid-cols-3 gap-2 pt-2">
              <TrustBadge icon={Truck} label="Local Dispatch" />
              <TrustBadge icon={ShieldCheck} label="Secure Payment" />
              <TrustBadge icon={RotateCcw} label="Easy Returns" />
            </div>
          </div>

          {/* Details */}
          <div className="space-y-4">
            <div>
              <button
                onClick={visitStore}
                className="mb-1 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
              >
                <StoreIcon className="h-3.5 w-3.5" />
                <span className="font-medium">{tenant.displayName}</span>
                <ChevronRight className="h-3 w-3" />
              </button>
              <h1 className="text-balance text-xl font-bold leading-tight tracking-tight sm:text-2xl">
                {product.name}
              </h1>
              {reviewCount > 0 && (
                <div className="mt-2 flex items-center gap-2 text-xs">
                  <div className="flex">
                    {[1, 2, 3, 4, 5].map((s) => (
                      <Star
                        key={s}
                        className={`h-3.5 w-3.5 ${
                          s <= Math.round(avgRating)
                            ? 'fill-amber-400 text-amber-400'
                            : 'text-muted-foreground/40'
                        }`}
                      />
                    ))}
                  </div>
                  <span className="font-medium">{avgRating.toFixed(1)}</span>
                  <span className="text-muted-foreground">
                    ({reviewCount} review{reviewCount === 1 ? '' : 's'})
                  </span>
                </div>
              )}
            </div>

            {/* Price */}
            <div className="flex items-end gap-2">
              <div className="text-2xl font-bold text-rose-600 dark:text-rose-400">
                KSh {unitPrice.toLocaleString()}
              </div>
              {selectedVariant && selectedVariant.priceDelta !== 0 && (
                <div className="text-xs text-muted-foreground">
                  Base: KSh {product.basePrice.toLocaleString()}
                </div>
              )}
            </div>
            {/* Stock status */}
            <div className="flex flex-wrap items-center gap-2">
              {outOfStock ? (
                <Badge variant="secondary" className="text-xs">Out of stock</Badge>
              ) : lowStock ? (
                <Badge variant="outline" className="text-xs">Only {availableStock} left</Badge>
              ) : (
                <Badge variant="outline" className="text-xs">
                  <Check className="mr-1 h-3 w-3 text-emerald-500" /> In stock
                </Badge>
              )}
              <Badge variant="outline" className="text-xs">
                <Truck className="mr-1 h-3 w-3" /> Local Dispatch
              </Badge>
              {product.category && (
                <Badge variant="outline" className="text-xs">{product.category.name}</Badge>
              )}
            </div>

            {/* Variants */}
            {product.variants.length > 0 && (
              <div className="space-y-2">
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {product.variants.length === 1 ? 'Option' : 'Options'}
                </div>
                <Select
                  value={selectedVariantId ?? undefined}
                  onValueChange={setSelectedVariantId}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select an option" />
                  </SelectTrigger>
                  <SelectContent>
                    {product.variants.map((v) => (
                      <SelectItem key={v.id} value={v.id} disabled={product.trackStock && v.stock <= 0}>
                        <span className="flex w-full items-center justify-between gap-2">
                          <span>{v.name}</span>
                          <span className="text-xs text-muted-foreground">
                            {v.priceDelta > 0 ? `+KSh ${v.priceDelta.toLocaleString()}` : v.priceDelta < 0 ? `-KSh ${Math.abs(v.priceDelta).toLocaleString()}` : ''}
                            {product.trackStock && v.stock <= 0 && ' · Out'}
                          </span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Quantity + Add to cart */}
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Quantity
                </div>
                <div className="flex items-center rounded-lg border border-border">
                  <button
                    type="button"
                    onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                    className="flex h-9 w-9 items-center justify-center text-muted-foreground hover:bg-accent"
                    aria-label="Decrease quantity"
                  >
                    <Minus className="h-3.5 w-3.5" />
                  </button>
                  <input
                    type="number"
                    value={quantity}
                    min={1}
                    max={availableStock || 99}
                    onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value || '1', 10)))}
                    className="h-9 w-12 border-x border-border bg-transparent text-center text-sm outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setQuantity((q) => q + 1)}
                    className="flex h-9 w-9 items-center justify-center text-muted-foreground hover:bg-accent"
                    aria-label="Increase quantity"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  size="lg"
                  className="flex-1 bg-rose-600 text-white hover:bg-rose-700 dark:bg-rose-600 dark:hover:bg-rose-500"
                  disabled={!!outOfStock || addingToCart}
                  onClick={() => void addToCart()}
                >
                  {addingToCart ? (
                    <span className="flex items-center gap-2">
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                      Adding…
                    </span>
                  ) : (
                    <>
                      <ShoppingCart className="mr-2 h-4 w-4" />
                      Add to cart
                    </>
                  )}
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  className="px-3"
                  disabled={wishlistBusy}
                  onClick={() => void toggleWishlist()}
                  aria-label={wished ? 'Remove from wishlist' : 'Add to wishlist'}
                >
                  <Heart className={`h-5 w-5 ${wished ? 'fill-rose-500 text-rose-500' : ''}`} />
                </Button>
              </div>
              <Button
                size="lg"
                variant="secondary"
                className="w-full"
                disabled={!!outOfStock}
                onClick={() => {
                  void addToCart().then(() => setView('cart'))
                }}
              >
                Buy now
              </Button>
            </div>

            {/* Description */}
            {product.description && (
              <Card>
                <CardContent className="p-4">
                  <h2 className="mb-2 text-sm font-semibold">Description</h2>
                  <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                    {product.description}
                  </p>
                </CardContent>
              </Card>
            )}

            {/* Store info card */}
            <Card
              className="overflow-hidden"
              style={{ borderColor: `${accent}33`, background: `linear-gradient(135deg, ${accent}0d, transparent)` }}
            >
              <CardContent className="flex items-center gap-3 p-4">
                <Avatar className="h-12 w-12 border">
                  <AvatarFallback
                    className="font-bold text-white"
                    style={{ backgroundColor: accent }}
                  >
                    {tenant.displayName.slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">{tenant.displayName}</div>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    {shopReview && shopReview.count > 0 ? (
                      <>
                        <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                        <span className="font-medium">{shopReview.averageRating.toFixed(1)}</span>
                        <span>({shopReview.count} reviews)</span>
                      </>
                    ) : (
                      <span>New shop</span>
                    )}
                  </div>
                </div>
                <Button size="sm" variant="outline" onClick={visitStore}>
                  Visit store
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Related products */}
        {relatedProducts.length > 0 && (
          <section className="mt-10">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-bold tracking-tight">You may also like</h2>
              <Button variant="ghost" size="sm" onClick={visitStore}>
                View all <ChevronRight className="ml-1 h-3.5 w-3.5" />
              </Button>
            </div>
            <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
              {relatedProducts.map((rp) => (
                <button
                  key={rp.id}
                  type="button"
                  onClick={() => {
                    setActiveProduct({ productId: rp.id, tenantHandle: tenantHandle! })
                    setView('product-detail')
                    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' })
                  }}
                  className="w-40 shrink-0 text-left sm:w-44"
                >
                  <Card className="overflow-hidden border-border/60 transition-all hover:-translate-y-0.5 hover:shadow-md">
                    <div className="aspect-square overflow-hidden bg-muted/40">
                      {rp.images[0]?.url ? (
                        <img
                          src={rp.images[0].url}
                          alt={rp.images[0].altText ?? rp.name}
                          className="h-full w-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center text-2xl font-bold text-muted-foreground/30">
                          {rp.name.slice(0, 2).toUpperCase()}
                        </div>
                      )}
                    </div>
                    <CardContent className="p-2">
                      <div className="line-clamp-1 text-xs font-medium">{rp.name}</div>
                      <div className="mt-0.5 text-sm font-bold text-rose-600 dark:text-rose-400">
                        KSh {rp.basePrice.toLocaleString()}
                      </div>
                    </CardContent>
                  </Card>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* Reviews */}
        <section className="mt-10">
          <h2 className="mb-3 text-lg font-bold tracking-tight">Customer reviews</h2>
          {reviewCount === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
                <MessageSquare className="h-8 w-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  No reviews yet. Be the first to review this product.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 sm:grid-cols-[200px_1fr]">
              {/* Rating summary */}
              <Card className="h-fit">
                <CardContent className="p-4 text-center">
                  <div className="text-4xl font-bold">{avgRating.toFixed(1)}</div>
                  <div className="mt-1 flex justify-center">
                    {[1, 2, 3, 4, 5].map((s) => (
                      <Star
                        key={s}
                        className={`h-4 w-4 ${
                          s <= Math.round(avgRating)
                            ? 'fill-amber-400 text-amber-400'
                            : 'text-muted-foreground/40'
                        }`}
                      />
                    ))}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    Based on {reviewCount} review{reviewCount === 1 ? '' : 's'}
                  </div>
                  <div className="mt-3 space-y-1">
                    {[5, 4, 3, 2, 1].map((star) => {
                      const bucket = ratingBuckets[star] ?? 0
                      const pct = reviewCount > 0 ? (bucket / reviewCount) * 100 : 0
                      return (
                        <div key={star} className="flex items-center gap-1.5 text-[10px]">
                          <span className="w-3 text-muted-foreground">{star}</span>
                          <Star className="h-2.5 w-2.5 fill-amber-400 text-amber-400" />
                          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                            <div className="h-full bg-amber-400" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="w-6 text-right text-muted-foreground">{bucket}</span>
                        </div>
                      )
                    })}
                  </div>
                </CardContent>
              </Card>

              {/* Reviews list */}
              <ul className="space-y-3">
                {reviews.slice(0, 10).map((r) => (
                  <li key={r.id}>
                    <Card>
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <Avatar className="h-8 w-8">
                              <AvatarFallback className="bg-primary/10 text-xs font-bold text-primary">
                                {r.user.name?.[0]?.toUpperCase() ?? 'A'}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <div className="text-sm font-medium">{r.user.name}</div>
                              <div className="flex">
                                {[1, 2, 3, 4, 5].map((s) => (
                                  <Star
                                    key={s}
                                    className={`h-3 w-3 ${
                                      s <= r.rating
                                        ? 'fill-amber-400 text-amber-400'
                                        : 'text-muted-foreground/40'
                                    }`}
                                  />
                                ))}
                              </div>
                            </div>
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {new Date(r.createdAt).toLocaleDateString()}
                          </div>
                        </div>
                        {r.title && <div className="mt-2 text-sm font-medium">{r.title}</div>}
                        {r.body && (
                          <p className="mt-1 text-sm text-muted-foreground">{r.body}</p>
                        )}
                        {r.ownerReply && (
                          <div className="mt-3 rounded border border-border/40 bg-muted/30 p-2">
                            <div className="text-xs font-medium text-primary">
                              Reply from {tenant.displayName}
                            </div>
                            <p className="text-sm">{r.ownerReply}</p>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      </div>

      <AskAiWidget tenantHandle={tenantHandle} tenantName={tenant.displayName} />
    </div>
  )
}

function TrustBadge({
  icon: Icon,
  label,
}: {
  icon: typeof Truck
  label: string
}) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-lg border border-border/60 bg-muted/30 p-2 text-center">
      <Icon className="h-4 w-4 text-muted-foreground" />
      <span className="text-[10px] font-medium text-muted-foreground">{label}</span>
    </div>
  )
}

function computeRatingBuckets(reviews: ReviewDTO[]): Record<number, number> {
  const buckets: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
  for (const r of reviews) {
    const s = Math.min(5, Math.max(1, Math.round(r.rating)))
    buckets[s] = (buckets[s] ?? 0) + 1
  }
  return buckets
}
