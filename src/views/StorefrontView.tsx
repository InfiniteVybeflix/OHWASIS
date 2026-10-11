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
import { ShoppingCart, Trash2, Minus, Plus, ArrowLeft, Loader2, Store } from 'lucide-react'

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
  const pushToast = useOhwasisStore((s) => s.pushToast)
  const setLastOrderReference = useOhwasisStore((s) => s.setLastOrderReference)

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

  const sessionKey = typeof window !== 'undefined' ? localStorage.getItem(CART_KEY) : null

  const refreshCart = useCallback(async () => {
    if (!handle) return
    const sk = localStorage.getItem(CART_KEY)
    if (!sk) {
      setCart(null)
      return
    }
    try {
      const data = await apiFetch<{ cart: CartDTO | null }>(`/api/cart?handle=${handle}&sessionKey=${sk}`)
      setCart(data.cart)
    } catch {
      // ignore
    }
  }, [handle])

  useEffect(() => {
    if (!handle) {
      setView('landing')
      return
    }
    void (async () => {
      setLoading(true)
      try {
        const sf = await apiFetch<StorefrontData>(`/api/storefront?handle=${handle}`)
        setStorefront(sf)
      } catch {
        pushToast({ type: 'error', message: 'Storefront not found' })
        setView('landing')
        return
      }
      await refreshCart()
    })()
    setLoading(false)
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
      {/* Storefront header — uses merchant's theme color */}
      <div
        className="border-b"
        style={{ borderColor: `${accent}33`, background: `linear-gradient(135deg, ${accent}0d, transparent)` }}
      >
        <div className="container mx-auto max-w-7xl px-4 py-6">
          <button
            onClick={() => setView('landing')}
            className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> All merchants
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
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {products.map((p) => (
              <ProductCard key={p.id} product={p} onAdd={() => addToCart(p)} />
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
              <Select name="paymentMethod" defaultValue="cash_on_delivery">
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash_on_delivery">Cash on Delivery</SelectItem>
                  <SelectItem value="manual">Manual (Till / Paybill)</SelectItem>
                  <SelectItem value="mpesa_manual">M-Pesa (Manual verification)</SelectItem>
                  <SelectItem value="mpesa_stk">M-Pesa STK Push (requires merchant config)</SelectItem>
                </SelectContent>
              </Select>
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
    </div>
  )
}

function ProductCard({ product, onAdd }: { product: ProductDTO; onAdd: () => void }) {
  const [adding, setAdding] = useState(false)
  const outOfStock = product.trackStock && product.stock <= 0
  return (
    <Card className="flex flex-col overflow-hidden">
      <div className="aspect-square w-full bg-muted/40">
        {product.images[0]?.url ? (
           
          <img src={product.images[0].url} alt={product.images[0].altText ?? product.name} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-2xl font-bold text-muted-foreground/30">
            {product.name.slice(0, 2).toUpperCase()}
          </div>
        )}
      </div>
      <CardHeader className="p-3 pb-0">
        <CardTitle className="line-clamp-1 text-sm">{product.name}</CardTitle>
        {product.description && (
          <p className="line-clamp-2 text-xs text-muted-foreground">{product.description}</p>
        )}
      </CardHeader>
      <CardContent className="p-3 pt-2">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold">
            {product.currency} {product.basePrice.toLocaleString()}
          </div>
          {outOfStock ? (
            <Badge variant="secondary" className="text-[10px]">Out of stock</Badge>
          ) : product.trackStock && product.stock < 10 ? (
            <Badge variant="outline" className="text-[10px]">{product.stock} left</Badge>
          ) : null}
        </div>
      </CardContent>
      <CardFooter className="p-3 pt-0">
        <Button
          size="sm"
          className="w-full"
          disabled={outOfStock || adding}
          onClick={async () => { setAdding(true); onAdd(); setTimeout(() => setAdding(false), 300) }}
        >
          {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Add to cart'}
        </Button>
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
