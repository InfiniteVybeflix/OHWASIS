'use client'

import { useEffect, useState, useCallback } from 'react'
import { useOhwasisStore, apiFetch } from '@/lib/store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetFooter,
} from '@/components/ui/sheet'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ShoppingCart, Trash2, Minus, Plus, ArrowLeft, Loader2, Store, Edit3 } from 'lucide-react'
import { AskAiWidget } from '@/components/ohwasis/AskAiWidget'

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
  categories: Array<{ id: string; name: string; slug: string; _count?: { products: number } }>
  productCount: number
  pages: Array<{ slug: string; title: string }>
  deliveryZones: DeliveryZoneDTO[]
}

interface PaymentMethodDTO {
  id: string
  method: string
  displayName: string
  enabled: boolean
  config: Record<string, unknown>
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
  variants: Array<{
    id: string
    name: string
    priceDelta: number
    stock: number
  }>
  images: Array<{ url: string; altText?: string | null }>
  category: { id: string; name: string; slug: string } | null
}

interface CartItemDTO {
  id: string
  productId: string
  productName: string
  productSlug: string
  variantId: string | null
  variantName: string | null
  quantity: number
  unitPrice: number
  lineTotal: number
  stock: number | null
  image: string | null
}

interface CartDTO {
  id: string
  items: CartItemDTO[]
  subtotal: number
}

interface DeliveryZoneDTO {
  id: string
  name: string
  fee: number
  estimatedMinutes: number | null
  minimumOrder: number | null
}

const CART_KEY = 'ohwasis_cart_session_v1'

export function StorefrontView() {
  const handle = useOhwasisStore((s) => s.activeTenantHandle)
  const setView = useOhwasisStore((s) => s.setView)
  const session = useOhwasisStore((s) => s.session)
  const setActiveProduct = useOhwasisStore((s) => s.setActiveProduct)
  // Detect if the current user is the owner/staff of this store
  const isStoreOwner = session.memberships.some((m) => m.tenant.handle === handle)
  const pushToast = useOhwasisStore((s) => s.pushToast)
  const setLastOrderReference = useOhwasisStore((s) => s.setLastOrderReference)
  const setLastPaymentInfo = useOhwasisStore((s) => s.setLastPaymentInfo)

  const [storefront, setStorefront] = useState<StorefrontData | null>(null)
  const [products, setProducts] = useState<ProductDTO[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const [sort, setSort] = useState<'newest' | 'price_asc' | 'price_desc' | 'name'>('newest')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const pageSize = 12

  // Cart state
  const [cart, setCart] = useState<CartDTO | null>(null)
  const [cartOpen, setCartOpen] = useState(false)
  const [checkoutOpen, setCheckoutOpen] = useState(false)
  const [placingOrder, setPlacingOrder] = useState(false)
  const [zones, setZones] = useState<DeliveryZoneDTO[]>([])
  const [shopOpenStatus, setShopOpenStatus] = useState<'OPEN' | 'CLOSED' | 'TEMPORARILY_CLOSED'>('OPEN')

  const sessionKey = typeof window !== 'undefined' ? localStorage.getItem(CART_KEY) : null

  const refreshCart = useCallback(async () => {
    if (!handle) return
    const sk = localStorage.getItem(CART_KEY)
    if (!sk) {
      setCart(null)
      // Update bottom-nav badge
      localStorage.setItem('ohwasis_cart_count_v1', '0')
      window.dispatchEvent(new Event('ohwasis-cart-updated'))
      return
    }
    try {
      const data = await apiFetch<{ cart: CartDTO | null }>(`/api/cart?handle=${handle}&sessionKey=${sk}`)
      setCart(data.cart)
      // Update bottom-nav badge
      const count = data.cart?.items.reduce((s, i) => s + i.quantity, 0) ?? 0
      localStorage.setItem('ohwasis_cart_count_v1', String(count))
      window.dispatchEvent(new Event('ohwasis-cart-updated'))
    } catch {
      // ignore
    }
  }, [handle])

  useEffect(() => {
    if (!handle) {
      setView('marketplace')
      return
    }
    void (async () => {
      setLoading(true)
      try {
        const sf = await apiFetch<StorefrontData>(`/api/storefront?handle=${handle}`)
        setStorefront(sf)
      } catch {
        pushToast({ type: 'error', message: 'Storefront not found' })
        setView('marketplace')
        return
      }
      await refreshCart()
      setLoading(false)
    })()
  }, [handle, setView, pushToast, refreshCart])

  // Load products when filters change
  useEffect(() => {
    if (!handle) return
    void (async () => {
      try {
        const params = new URLSearchParams({
          handle,
          page: String(page),
          pageSize: String(pageSize),
          sort,
        })
        if (search) params.set('q', search)
        if (categoryFilter !== 'all') params.set('categoryId', categoryFilter)
        const data = await apiFetch<{ items: ProductDTO[]; total: number }>(`/api/storefront/products?${params.toString()}`)
        setProducts(data.items)
        setTotal(data.total)
      } catch {
        // ignore
      }
    })()
  }, [handle, search, categoryFilter, sort, page])

  // Load delivery zones from the storefront response (public, no auth required).
  useEffect(() => {
    if (storefront?.deliveryZones) {
      setZones(storefront.deliveryZones)
    }
  }, [storefront])

  // Fetch the shop's open/closed status (public endpoint)
  useEffect(() => {
    if (!handle) return
    void (async () => {
      try {
        const data = await apiFetch<{ openStatus: string }>(`/api/tenants/${handle}/status`)
        setShopOpenStatus(data.openStatus as typeof shopOpenStatus)
      } catch {
        setShopOpenStatus('OPEN')
      }
    })()
  }, [handle])

  // Fetch the shop's enabled payment methods (public — for customers to see at checkout)
  // We re-use the merchant payment-methods endpoint by making it also return
  // enabled methods to public callers. For now we hardcode the legacy fallback
  // (cash_on_delivery + manual) so checkout still works for older merchants.
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodDTO[]>([
    { id: 'cod', method: 'cash_on_delivery', displayName: 'Cash on Delivery', enabled: true, config: {} },
  ])
  useEffect(() => {
    if (!handle) return
    void (async () => {
      try {
        const data = await apiFetch<{ methods: PaymentMethodDTO[] }>(`/api/storefront/payment-methods?handle=${handle}`)
        if (data.methods && data.methods.length > 0) {
          setPaymentMethods(data.methods.filter((m) => m.enabled))
        }
      } catch {
        // keep fallback
      }
    })()
  }, [handle])

  const addToCart = async (product: ProductDTO, variantId?: string) => {
    if (!handle) return
    try {
      const sk = localStorage.getItem(CART_KEY) || crypto.randomUUID()
      localStorage.setItem(CART_KEY, sk)
      const data = await apiFetch<{ cart: CartDTO | null; sessionKey: string }>(`/api/cart?handle=${handle}&sessionKey=${sk}`, {
        method: 'POST',
        body: JSON.stringify({ productId: product.id, variantId: variantId ?? undefined, quantity: 1 }),
      })
      setCart(data.cart)
      setCartOpen(true)
      pushToast({ type: 'success', message: `${product.name} added to cart` })
    } catch (err) {
      pushToast({ type: 'error', message: err instanceof Error ? err.message : 'Could not add to cart' })
    }
  }

  const updateQty = async (itemId: string, quantity: number) => {
    if (!handle) return
    const sk = localStorage.getItem(CART_KEY)
    if (!sk) return
    try {
      await apiFetch(`/api/cart/items/${itemId}?handle=${handle}&sessionKey=${sk}`, {
        method: 'PATCH',
        body: JSON.stringify({ quantity }),
      })
      await refreshCart()
    } catch (err) {
      pushToast({ type: 'error', message: err instanceof Error ? err.message : 'Update failed' })
    }
  }

  const removeItem = async (itemId: string) => {
    if (!handle) return
    const sk = localStorage.getItem(CART_KEY)
    if (!sk) return
    try {
      await apiFetch(`/api/cart/items/${itemId}?handle=${handle}&sessionKey=${sk}`, {
        method: 'DELETE',
      })
      await refreshCart()
    } catch (err) {
      pushToast({ type: 'error', message: err instanceof Error ? err.message : 'Remove failed' })
    }
  }

  const placeOrder = async (formData: FormData) => {
    if (!handle) return
    const sk = localStorage.getItem(CART_KEY)
    if (!sk) return
    setPlacingOrder(true)
    try {
      const body = {
        customer: {
          email: formData.get('email'),
          name: formData.get('name'),
          phone: formData.get('phone'),
        },
        shippingAddress: {
          line1: formData.get('line1'),
          line2: formData.get('line2') || undefined,
          city: formData.get('city'),
          region: formData.get('region'),
          country: 'KE',
          postalCode: formData.get('postalCode') || undefined,
          notes: formData.get('notes') || undefined,
        },
        fulfillmentMethod: formData.get('fulfillmentMethod'),
        deliveryZoneId: formData.get('fulfillmentMethod') === 'delivery' ? zones[0]?.id : undefined,
        paymentMethod: formData.get('paymentMethod'),
        notes: formData.get('orderNotes') || undefined,
      }
      const data = await apiFetch<{ order: { reference: string }; payment: { status: string; message: string; checkoutRequestId?: string } }>(
        `/api/checkout?handle=${handle}&sessionKey=${sk}`,
        { method: 'POST', body: JSON.stringify(body) },
      )
      localStorage.removeItem(CART_KEY)
      setCart(null)
      setCheckoutOpen(false)
      setLastOrderReference(data.order.reference)
      setLastPaymentInfo(data.payment)
      setView('order-confirmation')
      pushToast({
        type: data.payment.status === 'PENDING' ? 'success' : data.payment.status === 'FAILED' ? 'error' : 'info',
        message: data.payment.message,
      })
    } catch (err) {
      pushToast({ type: 'error', message: err instanceof Error ? err.message : 'Checkout failed' })
    } finally {
      setPlacingOrder(false)
    }
  }

  if (!handle) return null

  if (loading || !storefront) {
    return (
      <div className="container mx-auto max-w-7xl px-4 py-8">
        <Skeleton className="mb-6 h-12 w-2/3" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-64 w-full" />
          ))}
        </div>
      </div>
    )
  }

  const t = storefront.tenant
  const theme = t.theme ?? null
  const accent = theme?.primary ?? '#0f766e'

  return (
    <div className="flex flex-col">
      {/* Closed-shop banner — shown when shop is not OPEN */}
      {shopOpenStatus !== 'OPEN' && (
        <div className={`border-b px-4 py-3 text-sm ${
          shopOpenStatus === 'CLOSED'
            ? 'border-rose-500/30 bg-rose-50 text-rose-900 dark:bg-rose-950/20 dark:text-rose-100'
            : 'border-amber-500/30 bg-amber-50 text-amber-900 dark:bg-amber-950/20 dark:text-amber-100'
        }`}>
          <div className="container mx-auto max-w-7xl">
            <div className="font-medium">
              {shopOpenStatus === 'CLOSED'
                ? `${t.displayName} is currently closed.`
                : `${t.displayName} is temporarily closed.`}
            </div>
            <p className="mt-0.5 text-xs opacity-80">
              You can still place an order — it will need to be verified or confirmed by the business before processing.
              The business&apos;s open hours and policies apply.
            </p>
          </div>
        </div>
      )}

      {/* Storefront header — uses business's theme color */}
      <div
        className="border-b"
        style={{ borderColor: `${accent}33`, background: `linear-gradient(135deg, ${accent}0d, transparent)` }}
      >
        <div className="container mx-auto max-w-7xl px-4 py-6">
          <button
            onClick={() => setView('marketplace')}
            className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back to marketplace
          </button>
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div
                className="flex h-14 w-14 items-center justify-center rounded-lg text-lg font-bold text-white shadow-sm"
                style={{ backgroundColor: accent }}
              >
                {t.displayName.slice(0, 2).toUpperCase()}
              </div>
              <div>
                <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{t.displayName}</h1>
                {t.tagline && <p className="text-sm text-muted-foreground">{t.tagline}</p>}
                <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                  <Badge variant="outline" className="text-[10px]">{t.industry.replace('_', ' ')}</Badge>
                  <Badge variant={shopOpenStatus === 'OPEN' ? 'default' : 'secondary'} className="text-[10px]">
                    {shopOpenStatus === 'OPEN' ? 'Open now' : shopOpenStatus === 'CLOSED' ? 'Closed' : 'Paused'}
                  </Badge>
                  {t.contactPhone && <span>{t.contactPhone}</span>}
                </div>
              </div>
            </div>
            <Sheet open={cartOpen} onOpenChange={setCartOpen}>
              <SheetTrigger asChild>
                <Button variant="outline" size="sm" className="relative">
                  <ShoppingCart className="h-4 w-4" />
                  <span className="ml-1 hidden sm:inline">Cart</span>
                  {cart && cart.items.length > 0 && (
                    <span className="absolute -right-2 -top-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
                      {cart.items.reduce((s, i) => s + i.quantity, 0)}
                    </span>
                  )}
                </Button>
              </SheetTrigger>
              <SheetContent className="flex w-full flex-col sm:max-w-md">
                <SheetHeader>
                  <SheetTitle>Your cart</SheetTitle>
                </SheetHeader>
                {cart && cart.items.length > 0 ? (
                  <CartContents
                    cart={cart}
                    onUpdateQty={updateQty}
                    onRemove={removeItem}
                  />
                ) : (
                  <div className="flex flex-1 flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
                    <ShoppingCart className="h-8 w-8" />
                    <p>Your cart is empty.</p>
                  </div>
                )}
                <SheetFooter>
                  <Button
                    disabled={!cart || cart.items.length === 0}
                    onClick={() => { setCartOpen(false); setCheckoutOpen(true) }}
                    className="w-full"
                  >
                    Checkout · {cart ? `KES ${cart.subtotal.toLocaleString()}` : '—'}
                  </Button>
                </SheetFooter>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="border-b border-border/60 bg-background">
        <div className="container mx-auto flex max-w-7xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center">
          <Input
            placeholder="Search products…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            className="sm:max-w-xs"
          />
          <Tabs value={categoryFilter} onValueChange={(v) => { setCategoryFilter(v); setPage(1) }} className="flex-1">
            <TabsList className="w-full overflow-x-auto sm:w-auto">
              <TabsTrigger value="all">All</TabsTrigger>
              {storefront.categories.map((c) => (
                <TabsTrigger key={c.id} value={c.id}>{c.name}</TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <Select value={sort} onValueChange={(v: typeof sort) => setSort(v)}>
            <SelectTrigger className="sm:w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">Newest</SelectItem>
              <SelectItem value="price_asc">Price ↑</SelectItem>
              <SelectItem value="price_desc">Price ↓</SelectItem>
              <SelectItem value="name">A–Z</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Product grid */}
      <div className="container mx-auto max-w-7xl px-4 py-8">
        {isStoreOwner && (
          <div className="mb-4 rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
            <div className="font-medium">You are viewing your own storefront.</div>
            <p className="text-xs text-muted-foreground">Click &quot;Edit&quot; on any product to update it, or go to your dashboard to add new products, manage orders, and configure settings.</p>
            <Button size="sm" variant="outline" className="mt-2" onClick={() => setView('merchant')}>
              Go to dashboard
            </Button>
          </div>
        )}
        {products.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
              <Store className="h-10 w-10 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                {search ? 'No products match your search.' : 'This merchant has not added any products yet.'}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 lg:grid-cols-4">
            {products.map((p) => (
              <ProductCard
                key={p.id}
                product={p}
                onAdd={() => addToCart(p)}
                isOwner={isStoreOwner}
                onEdit={() => setView('merchant')}
                onOpen={() => { setActiveProduct({ productId: p.id, tenantHandle: handle! }); setView('product-detail') }}
              />
            ))}
          </div>
        )}
        {total > pageSize && (
          <div className="mt-6 flex items-center justify-center gap-2">
            <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
              Previous
            </Button>
            <span className="text-sm text-muted-foreground">
              Page {page} of {Math.ceil(total / pageSize)}
            </span>
            <Button variant="outline" size="sm" disabled={page >= Math.ceil(total / pageSize)} onClick={() => setPage((p) => p + 1)}>
              Next
            </Button>
          </div>
        )}
      </div>

      {/* Checkout modal */}
      <Dialog open={checkoutOpen} onOpenChange={setCheckoutOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Checkout</DialogTitle>
            <DialogDescription>
              Paying {cart ? `KES ${cart.subtotal.toLocaleString()}` : '—'} to {t.displayName}
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            action={(formData) => void placeOrder(formData)}
          >
            <fieldset className="space-y-3">
              <legend className="text-sm font-medium">Customer details</legend>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label htmlFor="name">Name</Label>
                  <Input id="name" name="name" required placeholder="Jane Doe" />
                </div>
                <div>
                  <Label htmlFor="phone">Phone</Label>
                  <Input id="phone" name="phone" required placeholder="0712345678" />
                </div>
              </div>
              <div>
                <Label htmlFor="email">Email</Label>
                <Input id="email" name="email" type="email" required placeholder="you@example.com" />
              </div>
            </fieldset>
            <fieldset className="space-y-3">
              <legend className="text-sm font-medium">Delivery address</legend>
              <Input name="line1" required placeholder="Street address" />
              <div className="grid grid-cols-2 gap-2">
                <Input name="city" required placeholder="City" />
                <Input name="region" required placeholder="Region / County" />
              </div>
              <Input name="postalCode" placeholder="Postal code (optional)" />
              <Input name="notes" placeholder="Delivery notes (optional)" />
            </fieldset>
            <fieldset className="space-y-3">
              <legend className="text-sm font-medium">Fulfillment</legend>
              <Select name="fulfillmentMethod" defaultValue="delivery">
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="delivery">Delivery</SelectItem>
                  <SelectItem value="pickup">Pickup</SelectItem>
                </SelectContent>
              </Select>
            </fieldset>
            <fieldset className="space-y-3">
              <legend className="text-sm font-medium">Payment method</legend>
              {paymentMethods.length === 0 ? (
                <p className="text-xs text-muted-foreground">No payment methods available. Please contact {t.displayName} directly.</p>
              ) : (
                <Select name="paymentMethod" defaultValue={paymentMethods[0]?.method}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {paymentMethods.map((m) => (
                      <SelectItem key={m.id} value={m.method}>
                        {m.displayName}
                        {m.config.tillNumber && <span className="ml-1 text-[10px] text-muted-foreground">· Till {String(m.config.tillNumber)}</span>}
                        {m.config.paybillNumber && <span className="ml-1 text-[10px] text-muted-foreground">· Paybill {String(m.config.paybillNumber)}</span>}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {/* Show selected method's instructions */}
              {paymentMethods.length > 0 && (() => {
                const selected = paymentMethods[0] // placeholder; we'd need to track selection for live update
                if (selected?.config.instructions) {
                  return (
                    <div className="rounded border border-border/60 bg-muted/30 p-2 text-xs">
                      <span className="font-medium">Instructions:</span> {String(selected.config.instructions)}
                    </div>
                  )
                }
                return null
              })()}
            </fieldset>
            <DialogFooter>
              <Button type="submit" disabled={placingOrder} className="w-full">
                {placingOrder && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Place order
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Floating Ask AI widget — uses this business's knowledge base */}
      <AskAiWidget tenantHandle={handle} tenantName={t.displayName} />
    </div>
  )
}

function ProductCard({ product, onAdd, isOwner, onEdit, onOpen }: { product: ProductDTO; onAdd: () => void; isOwner?: boolean; onEdit?: () => void; onOpen?: () => void }) {
  const [adding, setAdding] = useState(false)
  const outOfStock = product.trackStock && product.stock <= 0
  // Fallback: check attributes.images if ProductImage relation is empty
  const attrImages = (() => { try { return JSON.parse(product.attributes || '{}')?.images ?? [] } catch { return [] } })()
  const imageUrl = product.images[0]?.url ?? attrImages[0]
  return (
    <Card className="flex flex-col overflow-hidden transition-shadow hover:shadow-md">
      <div className="relative aspect-square w-full cursor-pointer bg-muted/40" onClick={onOpen}>
        {imageUrl ? (
           
          <img src={imageUrl} alt={product.name} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-2xl font-bold text-muted-foreground/30">
            {product.name.slice(0, 2).toUpperCase()}
          </div>
        )}
        {product.status !== 'ACTIVE' && (
          <Badge variant="secondary" className="absolute left-1 top-1 text-[10px]">{product.status}</Badge>
        )}
      </div>
      <CardHeader className="p-2 pb-0">
        <CardTitle className="cursor-pointer line-clamp-1 text-xs font-medium" onClick={onOpen}>{product.name}</CardTitle>
      </CardHeader>
      <CardContent className="p-2 pt-1">
        <div className="flex items-center justify-between">
          <div className="text-sm font-bold text-rose-600 dark:text-rose-400">
            {product.currency} {product.basePrice.toLocaleString()}
          </div>
          {outOfStock ? (
            <Badge variant="secondary" className="text-[10px]">Out of stock</Badge>
          ) : product.trackStock && product.stock < 10 ? (
            <Badge variant="outline" className="text-[10px]">{product.stock} left</Badge>
          ) : null}
        </div>
      </CardContent>
      <CardFooter className="p-2 pt-0">
        {isOwner ? (
          <Button size="sm" variant="outline" className="w-full" onClick={onEdit}>
            <Edit3 className="mr-1 h-3 w-3" /> Edit
          </Button>
        ) : (
          <Button
            size="sm"
            className="w-full"
            disabled={outOfStock || adding}
            onClick={async () => { setAdding(true); onAdd(); setTimeout(() => setAdding(false), 300) }}
          >
            {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Add to cart'}
          </Button>
        )}
      </CardFooter>
    </Card>
  )
}

function CartContents({
  cart,
  onUpdateQty,
  onRemove,
}: {
  cart: CartDTO
  onUpdateQty: (id: string, qty: number) => void
  onRemove: (id: string) => void
}) {
  return (
    <div className="flex-1 overflow-y-auto">
      <ul className="space-y-2 p-1">
        {cart.items.map((item) => (
          <li key={item.id} className="rounded border border-border/60 p-2">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1">
                <div className="text-sm font-medium">{item.productName}</div>
                {item.variantName && <div className="text-xs text-muted-foreground">{item.variantName}</div>}
                <div className="text-xs text-muted-foreground">KES {item.unitPrice.toLocaleString()} each</div>
              </div>
              <button onClick={() => onRemove(item.id)} className="text-muted-foreground hover:text-destructive">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="mt-2 flex items-center gap-2">
              <button
                onClick={() => onUpdateQty(item.id, Math.max(0, item.quantity - 1))}
                className="flex h-6 w-6 items-center justify-center rounded border"
                aria-label="Decrease quantity"
              >
                <Minus className="h-3 w-3" />
              </button>
              <span className="min-w-8 text-center text-sm">{item.quantity}</span>
              <button
                onClick={() => onUpdateQty(item.id, item.quantity + 1)}
                className="flex h-6 w-6 items-center justify-center rounded border"
                aria-label="Increase quantity"
              >
                <Plus className="h-3 w-3" />
              </button>
              <span className="ml-auto text-sm font-semibold">KES {item.lineTotal.toLocaleString()}</span>
            </div>
          </li>
        ))}
      </ul>
      <div className="border-t p-3 text-sm">
        Subtotal: <span className="font-semibold">KES {cart.subtotal.toLocaleString()}</span>
      </div>
    </div>
  )
}
