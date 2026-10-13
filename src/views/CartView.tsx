'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useOhwasisStore, apiFetch } from '@/lib/store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  ArrowLeft,
  ShoppingBag,
  Trash2,
  Minus,
  Plus,
  Truck,
  MapPin,
  CreditCard,
  Loader2,
  Check,
  Store as StoreIcon,
  Tag,
  ShoppingBasket,
} from 'lucide-react'

const CART_KEY = 'ohwasis_cart_session_v1'

interface MarketTenant {
  id: string
  handle: string
  displayName: string
  industry: string
  theme: string | null
}

interface CartItem {
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
  items: CartItem[]
  subtotal: number
}

interface DeliveryZoneDTO {
  id: string
  name: string
  fee: number
  estimatedMinutes: number | null
  minimumOrder: number | null
}

interface PaymentMethodDTO {
  id: string
  method: string
  displayName: string
  enabled: boolean
  config: Record<string, unknown>
}

interface StorefrontDTO {
  tenant: {
    id: string
    handle: string
    displayName: string
    industry: string
    theme: Record<string, string> | null
  }
  deliveryZones: DeliveryZoneDTO[]
}

interface AddressDTO {
  id: string
  label: string
  line1: string
  line2?: string | null
  city: string
  region: string
  country: string
  postalCode?: string | null
  phone?: string | null
  notes?: string | null
  isDefault: boolean
}

interface StoreGroup {
  tenant: MarketTenant
  cart: CartDTO
  storefront?: StorefrontDTO
  paymentMethods: PaymentMethodDTO[]
  selectedZoneId: string | null
  selectedPaymentMethod: string
  fulfillmentMethod: 'delivery' | 'pickup'
}

export function CartView() {
  const setView = useOhwasisStore((s) => s.setView)
  const setLastOrderReference = useOhwasisStore((s) => s.setLastOrderReference)
  const setLastPaymentInfo = useOhwasisStore((s) => s.setLastPaymentInfo)
  const session = useOhwasisStore((s) => s.session)
  const setAuthModal = useOhwasisStore((s) => s.setAuthModal)
  const pushToast = useOhwasisStore((s) => s.pushToast)

  const [groups, setGroups] = useState<StoreGroup[]>([])
  const [addresses, setAddresses] = useState<AddressDTO[]>([])
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [placing, setPlacing] = useState(false)
  const [showAddAddress, setShowAddAddress] = useState(false)

  const sessionKey = typeof window !== 'undefined' ? localStorage.getItem(CART_KEY) : null

  const refresh = useCallback(async () => {
    if (!sessionKey) {
      setGroups([])
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const tenantList = await apiFetch<{ tenants: MarketTenant[] }>('/api/tenants/list', { tenantHandle: null })
      const results: StoreGroup[] = []
      await Promise.all(
        tenantList.tenants.map(async (t) => {
          try {
            const cartRes = await apiFetch<{ cart: CartDTO | null }>(
              `/api/cart?handle=${t.handle}&sessionKey=${sessionKey}`,
              { tenantHandle: null },
            )
            if (!cartRes.cart || cartRes.cart.items.length === 0) return
            const [sf, pm] = await Promise.all([
              apiFetch<StorefrontDTO>(`/api/storefront?handle=${t.handle}`, { tenantHandle: null }).catch(() => undefined),
              apiFetch<{ methods: PaymentMethodDTO[] }>(`/api/storefront/payment-methods?handle=${t.handle}`, { tenantHandle: null })
                .then((r) => r.methods.filter((m) => m.enabled))
                .catch(() => [] as PaymentMethodDTO[]),
            ])
            const firstZone = sf?.deliveryZones?.[0] ?? null
            results.push({
              tenant: t,
              cart: cartRes.cart,
              storefront: sf,
              paymentMethods: pm.length > 0 ? pm : [
                { id: 'cod', method: 'cash_on_delivery', displayName: 'Cash on Delivery', enabled: true, config: {} },
              ],
              selectedZoneId: firstZone?.id ?? null,
              selectedPaymentMethod: pm[0]?.method ?? 'cash_on_delivery',
              fulfillmentMethod: firstZone ? 'delivery' : 'pickup',
            })
          } catch {
            /* skip tenant */
          }
        }),
      )
      setGroups(results)
    } finally {
      setLoading(false)
    }
  }, [sessionKey])

  useEffect(() => {
    void refresh()
  }, [refresh])

  // Fetch saved addresses if logged in
  useEffect(() => {
    if (!session.user) return
    void (async () => {
      try {
        const data = await apiFetch<{ addresses: AddressDTO[] }>('/api/customer/addresses', { tenantHandle: null })
        setAddresses(data.addresses)
        const def = data.addresses.find((a) => a.isDefault) ?? data.addresses[0]
        if (def) setSelectedAddressId(def.id)
      } catch {
        /* ignore */
      }
    })()
  }, [session.user])

  // Derived totals
  const totals = useMemo(() => {
    let subtotal = 0
    let delivery = 0
    for (const g of groups) {
      subtotal += g.cart.subtotal
      if (g.fulfillmentMethod === 'delivery' && g.selectedZoneId && g.storefront) {
        const zone = g.storefront.deliveryZones.find((z) => z.id === g.selectedZoneId)
        if (zone) delivery += zone.fee
      }
    }
    return { subtotal, delivery, total: subtotal + delivery }
  }, [groups])

  const updateQty = async (group: StoreGroup, itemId: string, qty: number) => {
    if (!sessionKey) return
    try {
      await apiFetch(`/api/cart/items/${itemId}?handle=${group.tenant.handle}&sessionKey=${sessionKey}`, {
        method: 'PATCH',
        body: JSON.stringify({ quantity: qty }),
        tenantHandle: null,
      })
      await refresh()
    } catch (err) {
      pushToast({ type: 'error', message: err instanceof Error ? err.message : 'Update failed' })
    }
  }

  const removeItem = async (group: StoreGroup, itemId: string) => {
    if (!sessionKey) return
    try {
      await apiFetch(`/api/cart/items/${itemId}?handle=${group.tenant.handle}&sessionKey=${sessionKey}`, {
        method: 'DELETE',
        tenantHandle: null,
      })
      await refresh()
    } catch (err) {
      pushToast({ type: 'error', message: err instanceof Error ? err.message : 'Remove failed' })
    }
  }

  const setGroupFulfillment = (handle: string, method: 'delivery' | 'pickup') => {
    setGroups((gs) => gs.map((g) => (g.tenant.handle === handle ? { ...g, fulfillmentMethod: method } : g)))
  }

  const setGroupZone = (handle: string, zoneId: string) => {
    setGroups((gs) => gs.map((g) => (g.tenant.handle === handle ? { ...g, selectedZoneId: zoneId } : g)))
  }

  const setGroupPayment = (handle: string, method: string) => {
    setGroups((gs) => gs.map((g) => (g.tenant.handle === handle ? { ...g, selectedPaymentMethod: method } : g)))
  }

  const selectedAddress = addresses.find((a) => a.id === selectedAddressId) ?? null

  const placeOrders = async () => {
    if (!sessionKey || groups.length === 0) return
    if (!session.user) {
      setAuthModal('login')
      return
    }
    if (groups.some((g) => g.fulfillmentMethod === 'delivery') && !selectedAddress) {
      pushToast({ type: 'error', message: 'Please select a delivery address' })
      return
    }
    setPlacing(true)
    let lastRef: string | null = null
    let lastPayment: { status: string; message: string; tillNumber?: string; paybillNumber?: string; accountName?: string; bankName?: string; accountNumber?: string; instructions?: string } | null = null
    let successCount = 0
    let failureCount = 0
    try {
      for (const g of groups) {
        try {
          const body = {
            customer: {
              email: session.user!.email,
              name: session.user!.name ?? session.user!.email.split('@')[0],
              phone: selectedAddress?.phone ?? '',
            },
            shippingAddress: selectedAddress
              ? {
                  line1: selectedAddress.line1,
                  line2: selectedAddress.line2 || undefined,
                  city: selectedAddress.city,
                  region: selectedAddress.region,
                  country: selectedAddress.country,
                  postalCode: selectedAddress.postalCode || undefined,
                  notes: selectedAddress.notes || undefined,
                }
              : { line1: '', city: '', region: '', country: 'KE' },
            fulfillmentMethod: g.fulfillmentMethod,
            deliveryZoneId: g.fulfillmentMethod === 'delivery' ? g.selectedZoneId ?? undefined : undefined,
            paymentMethod: g.selectedPaymentMethod,
            notes: undefined,
          }
          const data = await apiFetch<{ order: { reference: string }; payment: { status: string; message: string; tillNumber?: string; paybillNumber?: string; accountName?: string; bankName?: string; accountNumber?: string; instructions?: string } }>(
            `/api/checkout?handle=${g.tenant.handle}&sessionKey=${sessionKey}`,
            { method: 'POST', body: JSON.stringify(body), tenantHandle: null },
          )
          lastRef = data.order.reference
          lastPayment = data.payment
          successCount += 1
        } catch (err) {
          failureCount += 1
          pushToast({
            type: 'error',
            message: `Order from ${g.tenant.displayName} failed: ${err instanceof Error ? err.message : 'unknown error'}`,
          })
        }
      }
      if (successCount > 0) {
        // Update cart badge
        localStorage.setItem('ohwasis_cart_count_v1', '0')
        window.dispatchEvent(new Event('ohwasis-cart-updated'))
        if (lastRef) setLastOrderReference(lastRef)
        if (lastPayment) setLastPaymentInfo(lastPayment)
        setView('order-confirmation')
      } else {
        pushToast({ type: 'error', message: 'All orders failed. Please try again.' })
      }
    } finally {
      setPlacing(false)
    }
  }

  if (loading) {
    return (
      <div className="container mx-auto max-w-4xl px-4 py-8">
        <Skeleton className="mb-4 h-8 w-1/2" />
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
      </div>
    )
  }

  if (groups.length === 0) {
    return (
      <div className="container mx-auto max-w-md px-4 py-16 text-center">
        <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-muted/50">
          <ShoppingBasket className="h-10 w-10 text-muted-foreground" />
        </div>
        <h1 className="text-xl font-bold">Your cart is empty</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Browse the marketplace and add products to your cart.
        </p>
        <Button className="mt-6 w-full" size="lg" onClick={() => setView('marketplace')}>
          <ShoppingBag className="mr-2 h-4 w-4" /> Browse marketplace
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col pb-20 sm:pb-8">
      {/* Header */}
      <header className="sticky top-14 z-30 border-b border-border/60 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="container mx-auto max-w-5xl px-4 py-3">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setView('marketplace')} className="-ml-2">
              <ArrowLeft className="mr-1 h-4 w-4" /> Back
            </Button>
            <h1 className="flex-1 text-lg font-bold tracking-tight">Your cart</h1>
            <Badge variant="secondary" className="text-xs">
              {groups.reduce((s, g) => s + g.cart.items.reduce((x, i) => x + i.quantity, 0), 0)} items
            </Badge>
          </div>
        </div>
      </header>

      <div className="container mx-auto max-w-5xl px-4 py-4">
        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          {/* Cart items grouped by store */}
          <div className="space-y-4">
            {groups.map((g) => (
              <Card key={g.tenant.handle} className="overflow-hidden">
                <CardHeader className="border-b border-border/60 bg-muted/30 py-3">
                  <CardTitle className="flex items-center justify-between text-sm">
                    <button
                      onClick={() => {
                        useOhwasisStore.getState().setActiveTenant(g.tenant.handle)
                        setView('store-profile')
                      }}
                      className="flex items-center gap-2 hover:underline"
                    >
                      <StoreIcon className="h-4 w-4 text-muted-foreground" />
                      {g.tenant.displayName}
                    </button>
                    <Badge variant="outline" className="text-[10px]">
                      {g.cart.items.length} item{g.cart.items.length === 1 ? '' : 's'}
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="divide-y divide-border/60 p-0">
                  {g.cart.items.map((item) => (
                    <div key={item.id} className="flex gap-3 p-3">
                      <div className="h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-muted/40">
                        {item.image ? (
                          <img src={item.image} alt={item.productName} className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full items-center justify-center text-xs font-bold text-muted-foreground/30">
                            {item.productName.slice(0, 2).toUpperCase()}
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="line-clamp-2 text-sm font-medium">{item.productName}</div>
                        {item.variantName && (
                          <div className="mt-0.5 text-xs text-muted-foreground">{item.variantName}</div>
                        )}
                        <div className="mt-1 text-xs text-muted-foreground">
                          KSh {item.unitPrice.toLocaleString()} each
                        </div>
                        <div className="mt-2 flex items-center justify-between">
                          <div className="flex items-center rounded-md border border-border">
                            <button
                              onClick={() => updateQty(g, item.id, Math.max(0, item.quantity - 1))}
                              className="flex h-7 w-7 items-center justify-center text-muted-foreground hover:bg-accent"
                              aria-label="Decrease quantity"
                            >
                              <Minus className="h-3 w-3" />
                            </button>
                            <span className="min-w-7 text-center text-xs font-medium">{item.quantity}</span>
                            <button
                              onClick={() => updateQty(g, item.id, item.quantity + 1)}
                              className="flex h-7 w-7 items-center justify-center text-muted-foreground hover:bg-accent"
                              aria-label="Increase quantity"
                            >
                              <Plus className="h-3 w-3" />
                            </button>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-sm font-bold text-rose-600 dark:text-rose-400">
                              KSh {item.lineTotal.toLocaleString()}
                            </span>
                            <button
                              onClick={() => removeItem(g, item.id)}
                              className="text-muted-foreground hover:text-destructive"
                              aria-label="Remove item"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </CardContent>
                {/* Per-store fulfillment + payment selectors */}
                <div className="space-y-2 border-t border-border/60 bg-muted/20 p-3">
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div>
                      <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Fulfillment</Label>
                      <Select
                        value={g.fulfillmentMethod}
                        onValueChange={(v: 'delivery' | 'pickup') => setGroupFulfillment(g.tenant.handle, v)}
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="delivery">
                            <span className="flex items-center gap-1.5 text-xs">
                              <Truck className="h-3 w-3" /> Delivery
                            </span>
                          </SelectItem>
                          <SelectItem value="pickup">
                            <span className="flex items-center gap-1.5 text-xs">
                              <ShoppingBag className="h-3 w-3" /> Pickup
                            </span>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {g.fulfillmentMethod === 'delivery' && g.storefront && g.storefront.deliveryZones.length > 0 && (
                      <div>
                        <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Delivery zone</Label>
                        <Select
                          value={g.selectedZoneId ?? undefined}
                          onValueChange={(v) => setGroupZone(g.tenant.handle, v)}
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {g.storefront.deliveryZones.map((z) => (
                              <SelectItem key={z.id} value={z.id}>
                                <span className="text-xs">
                                  {z.name} · KSh {z.fee.toLocaleString()}
                                </span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>
                  <div>
                    <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Payment method</Label>
                    <Select
                      value={g.selectedPaymentMethod}
                      onValueChange={(v) => setGroupPayment(g.tenant.handle, v)}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {g.paymentMethods.map((m) => (
                          <SelectItem key={m.id} value={m.method}>
                            <span className="text-xs">{m.displayName}</span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </Card>
            ))}
          </div>

          {/* Summary sidebar */}
          <div className="space-y-3 lg:sticky lg:top-28 lg:self-start">
            {/* Delivery address */}
            <Card>
              <CardHeader className="py-3">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                  Delivery address
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 pt-0">
                {!session.user ? (
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground">
                      Sign in to use your saved addresses.
                    </p>
                    <Button size="sm" variant="outline" className="w-full" onClick={() => setAuthModal('login')}>
                      Sign in
                    </Button>
                  </div>
                ) : addresses.length === 0 ? (
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground">No saved addresses.</p>
                    <Button size="sm" variant="outline" className="w-full" onClick={() => setShowAddAddress(true)}>
                      <Plus className="mr-1 h-3.5 w-3.5" /> Add address
                    </Button>
                  </div>
                ) : (
                  <>
                    <Select
                      value={selectedAddressId ?? undefined}
                      onValueChange={setSelectedAddressId}
                    >
                      <SelectTrigger className="h-9 text-xs">
                        <SelectValue placeholder="Select address" />
                      </SelectTrigger>
                      <SelectContent>
                        {addresses.map((a) => (
                          <SelectItem key={a.id} value={a.id}>
                            <span className="text-xs">
                              {a.label} — {a.line1}, {a.city}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button size="sm" variant="ghost" className="w-full" onClick={() => setShowAddAddress(true)}>
                      <Plus className="mr-1 h-3.5 w-3.5" /> Add new
                    </Button>
                    {selectedAddress && (
                      <div className="rounded border border-border/60 bg-muted/30 p-2 text-[11px] text-muted-foreground">
                        {selectedAddress.line1}
                        {selectedAddress.line2 ? `, ${selectedAddress.line2}` : ''}
                        <br />
                        {selectedAddress.city}, {selectedAddress.region}, {selectedAddress.country}
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>

            {/* Order summary */}
            <Card>
              <CardHeader className="py-3">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <CreditCard className="h-4 w-4 text-muted-foreground" />
                  Order summary
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 pt-0 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span className="font-medium">KSh {totals.subtotal.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Delivery fee</span>
                  <span className="font-medium">
                    {totals.delivery === 0 ? (
                      <span className="text-emerald-600">Free</span>
                    ) : (
                      `KSh ${totals.delivery.toLocaleString()}`
                    )}
                  </span>
                </div>
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Tag className="h-3 w-3" /> Discount
                  </span>
                  <span>—</span>
                </div>
                <div className="border-t border-border/60 pt-2">
                  <div className="flex justify-between text-base font-bold">
                    <span>Total</span>
                    <span className="text-rose-600 dark:text-rose-400">
                      KSh {totals.total.toLocaleString()}
                    </span>
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    Includes {groups.length} store{groups.length === 1 ? '' : 's'}
                  </div>
                </div>
                <Button
                  className="mt-2 w-full"
                  size="lg"
                  disabled={placing || (groups.some((g) => g.fulfillmentMethod === 'delivery') && !selectedAddress)}
                  onClick={() => void placeOrders()}
                >
                  {placing ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" /> Placing order…
                    </span>
                  ) : (
                    <>
                      <Check className="mr-1 h-4 w-4" /> Place order
                    </>
                  )}
                </Button>
                {!session.user && (
                  <p className="text-center text-[10px] text-muted-foreground">
                    You&apos;ll be asked to sign in to complete checkout.
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      <AddAddressDialog
        open={showAddAddress}
        onOpenChange={setShowAddAddress}
        onSaved={async () => {
          // Refresh addresses
          try {
            const data = await apiFetch<{ addresses: AddressDTO[] }>('/api/customer/addresses', { tenantHandle: null })
            setAddresses(data.addresses)
            const def = data.addresses.find((a) => a.isDefault) ?? data.addresses[data.addresses.length - 1]
            if (def) setSelectedAddressId(def.id)
          } catch {
            /* ignore */
          }
        }}
      />
    </div>
  )
}

function AddAddressDialog({
  open,
  onOpenChange,
  onSaved,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  onSaved: () => void
}) {
  const pushToast = useOhwasisStore((s) => s.pushToast)
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    label: '', line1: '', line2: '', city: '', region: '', country: 'KE', postalCode: '', phone: '', notes: '', isDefault: false,
  })

  const submit = async () => {
    if (!form.label || !form.line1 || !form.city || !form.region) {
      pushToast({ type: 'error', message: 'Please fill in all required fields' })
      return
    }
    setLoading(true)
    try {
      await apiFetch('/api/customer/addresses', {
        method: 'POST',
        body: JSON.stringify(form),
        tenantHandle: null,
      })
      pushToast({ type: 'success', message: 'Address saved' })
      onSaved()
      onOpenChange(false)
      setForm({ label: '', line1: '', line2: '', city: '', region: '', country: 'KE', postalCode: '', phone: '', notes: '', isDefault: false })
    } catch (err) {
      pushToast({ type: 'error', message: err instanceof Error ? err.message : 'Save failed' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add address</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Label *</Label>
            <Input value={form.label} onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))} placeholder="Home, Work, Mom's place" />
          </div>
          <div>
            <Label>Address line 1 *</Label>
            <Input value={form.line1} onChange={(e) => setForm((f) => ({ ...f, line1: e.target.value }))} placeholder="Street address" />
          </div>
          <div>
            <Label>Address line 2</Label>
            <Input value={form.line2} onChange={(e) => setForm((f) => ({ ...f, line2: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>City *</Label>
              <Input value={form.city} onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))} />
            </div>
            <div>
              <Label>Region *</Label>
              <Input value={form.region} onChange={(e) => setForm((f) => ({ ...f, region: e.target.value }))} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Phone</Label>
              <Input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
            </div>
            <div>
              <Label>Postal code</Label>
              <Input value={form.postalCode} onChange={(e) => setForm((f) => ({ ...f, postalCode: e.target.value }))} />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="isDefault"
              checked={form.isDefault}
              onChange={(e) => setForm((f) => ({ ...f, isDefault: e.target.checked }))}
              className="h-4 w-4"
            />
            <Label htmlFor="isDefault" className="text-sm font-normal">Set as default address</Label>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={() => void submit()} disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            <Check className="mr-1 h-3.5 w-3.5" /> Save address
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
