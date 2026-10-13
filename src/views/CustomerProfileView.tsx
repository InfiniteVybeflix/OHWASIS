'use client'

import { useEffect, useState } from 'react'
import { useOhwasisStore, apiFetch } from '@/lib/store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Loader2, User as UserIcon, MapPin, Coins, Gift, Star, Heart, Eye, Package, TrendingUp, Plus, Trash2, Check, Share2, Flame, Camera } from 'lucide-react'
import { toast } from 'sonner'

interface ProfileData {
  user: { id: string; email: string; name: string | null; bio: string | null; avatarUrl: string | null; preferences: Record<string, unknown>; createdAt: string } | null
  perTenantProfiles: Array<{ id: string; tenant: { id: string; handle: string; displayName: string; industry: string }; displayName: string; phone: string | null; defaultAddress: Record<string, unknown>; marketingOptIn: boolean }>
  orders: Array<{ id: string; reference: string; status: string; total: number; currency: string; createdAt: string; tenant: { id: string; handle: string; displayName: string } }>
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

interface WishlistItemDTO {
  id: string
  productId: string
  productName: string
  productSlug: string
  productPrice: number
  currency: string
  productImage: string | null
  tenant: { id: string; handle: string; displayName: string }
  createdAt: string
}

interface ReviewDTO {
  id: string
  rating: number
  title: string | null
  body: string | null
  createdAt: string
  tenant: { id: string; handle: string; displayName: string }
  productId: string | null
}

interface CoinData {
  balance: number
  streak: number
  canCheckInToday: boolean
  lastCheckInAt: string | null
  referralCode: string | null
  referralCoinsEarned: number
  referralCount: number
  recentTransactions: Array<{ id: string; type: string; amount: number; description: string; createdAt: string }>
}

interface RecentlyViewedDTO {
  productId: string
  productName: string
  productSlug: string
  productPrice: number
  currency: string
  productImage: string | null
  tenant: { id: string; handle: string; displayName: string }
  viewedAt: string
}

export function CustomerProfileView() {
  const session = useOhwasisStore((s) => s.session)
  const setAuthModal = useOhwasisStore((s) => s.setAuthModal)
  const setView = useOhwasisStore((s) => s.setView)
  const setActiveTenant = useOhwasisStore((s) => s.setActiveTenant)
  const pushToast = useOhwasisStore((s) => s.pushToast)
  const [tab, setTab] = useState('profile')
  const [profile, setProfile] = useState<ProfileData | null>(null)
  const [addresses, setAddresses] = useState<AddressDTO[]>([])
  const [wishlist, setWishlist] = useState<WishlistItemDTO[]>([])
  const [recentlyViewed, setRecentlyViewed] = useState<RecentlyViewedDTO[]>([])
  const [coins, setCoins] = useState<CoinData | null>(null)
  const [myReviews, setMyReviews] = useState<ReviewDTO[]>([])
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const [bio, setBio] = useState('')
  const [saving, setSaving] = useState(false)
  const [checkInLoading, setCheckInLoading] = useState(false)
  const [showAddAddress, setShowAddAddress] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const [p, a, w, rv, c, r] = await Promise.all([
        apiFetch<ProfileData>('/api/customer/profile'),
        apiFetch<{ addresses: AddressDTO[] }>('/api/customer/addresses'),
        apiFetch<{ items: WishlistItemDTO[]; count: number }>('/api/customer/wishlist').catch(() => ({ items: [], count: 0 })),
        apiFetch<{ items: RecentlyViewedDTO[] }>('/api/customer/recently-viewed?limit=20').catch(() => ({ items: [] })),
        apiFetch<CoinData>('/api/customer/coins').catch(() => null),
        apiFetch<{ reviews: ReviewDTO[] }>('/api/reviews?handle=aquarefill&targetType=SHOP').catch(() => ({ reviews: [] })),
      ])
      setProfile(p)
      setAddresses(a.addresses)
      setWishlist(w.items)
      setRecentlyViewed(rv.items)
      setCoins(c)
      // For "my reviews" we need a different endpoint — use /api/customer/profile/reviews (TODO)
      // For now, leave empty
      setMyReviews([])
      setName(p.user?.name ?? '')
      setBio(p.user?.bio ?? '')
    } catch (err) {
      pushToast({ type: 'error', message: err instanceof Error ? err.message : 'Failed to load profile' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])  

  const saveProfile = async () => {
    setSaving(true)
    try {
      await apiFetch('/api/customer/profile', {
        method: 'PATCH',
        body: JSON.stringify({ name, bio }),
        tenantHandle: null,
      })
      // Optimistic update — reflect immediately on the device
      setProfile((p) => p ? { ...p, user: p.user ? { ...p.user, name, bio } : null } : p)
      // Also update the session store so the header reflects the new name
      const currentSession = useOhwasisStore.getState().session
      if (currentSession.user) {
        useOhwasisStore.getState().setSession({
          ...currentSession,
          user: { ...currentSession.user, name },
        })
      }
      pushToast({ type: 'success', message: 'Profile updated' })
    } catch (err) {
      pushToast({ type: 'error', message: err instanceof Error ? err.message : 'Save failed' })
    } finally {
      setSaving(false)
    }
  }

  const checkIn = async () => {
    setCheckInLoading(true)
    try {
      const res = await apiFetch<{ ok: boolean; reward: number; streak: number; newBalance: number; message: string }>('/api/customer/coins/checkin', { method: 'POST' })
      pushToast({ type: 'success', message: res.message })
      void load()
    } catch (err) {
      const msg = (err as Error & { code?: string })?.code === 'already_checked_in'
        ? err.message
        : 'Check-in failed'
      pushToast({ type: 'error', message: msg })
    } finally {
      setCheckInLoading(false)
    }
  }

  const removeAddress = async (id: string) => {
    try {
      await apiFetch(`/api/customer/addresses?id=${id}`, { method: 'DELETE' })
      pushToast({ type: 'success', message: 'Address removed' })
      void load()
    } catch (err) {
      pushToast({ type: 'error', message: err instanceof Error ? err.message : 'Failed' })
    }
  }

  const setDefaultAddress = async (id: string) => {
    try {
      await apiFetch('/api/customer/addresses', {
        method: 'PATCH',
        body: JSON.stringify({ id, isDefault: true }),
        tenantHandle: null, // customer-level endpoint — no tenant header
      })
      pushToast({ type: 'success', message: 'Default address updated' })
      void load()
    } catch (err) {
      pushToast({ type: 'error', message: err instanceof Error ? err.message : 'Failed' })
    }
  }

  const removeWishlist = async (productId: string) => {
    try {
      await apiFetch(`/api/customer/wishlist?productId=${productId}`, { method: 'DELETE' })
      void load()
    } catch {
      // ignore
    }
  }

  const copyReferralCode = () => {
    if (!coins?.referralCode) return
    navigator.clipboard.writeText(coins.referralCode).then(() => {
      toast.success('Referral code copied!')
    }).catch(() => {
      pushToast({ type: 'info', message: `Code: ${coins.referralCode}` })
    })
  }

  if (!session.user) {
    return (
      <div className="container mx-auto max-w-md px-4 py-12 text-center">
        <UserIcon className="mx-auto h-10 w-10 text-muted-foreground" />
        <p className="mt-2 text-muted-foreground">Sign in to access your account.</p>
        <Button className="mt-4" onClick={() => setAuthModal('login')}>Sign in</Button>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="container mx-auto max-w-4xl px-4 py-8 space-y-4">
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-32" />)}
      </div>
    )
  }

  // Order lifecycle buckets
  const orders = profile?.orders ?? []
  const unpaid = orders.filter((o) => o.status === 'PENDING')
  const toShip = orders.filter((o) => ['CONFIRMED', 'PROCESSING'].includes(o.status))
  const shipped = orders.filter((o) => ['OUT_FOR_DELIVERY', 'READY_FOR_PICKUP'].includes(o.status))
  const toReview = orders.filter((o) => ['DELIVERED', 'COMPLETED'].includes(o.status))
  const returns = orders.filter((o) => ['CANCELLED', 'REFUNDED'].includes(o.status))

  return (
    <div className="container mx-auto max-w-4xl px-4 py-6 pb-20 sm:pb-8">
      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <div className="relative">
          <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-cyan-500 to-purple-600 text-lg font-bold text-white">
            {profile?.user?.avatarUrl ? (
               
              <img src={profile.user.avatarUrl} alt="Avatar" className="h-full w-full object-cover" />
            ) : (
              session.user.name?.[0]?.toUpperCase() ?? session.user.email[0].toUpperCase()
            )}
          </div>
          <label className="absolute -bottom-1 -right-1 flex h-6 w-6 cursor-pointer items-center justify-center rounded-full border-2 border-background bg-primary text-primary-foreground shadow-sm hover:bg-primary/90" title="Change avatar">
            <Camera className="h-3 w-3" />
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0]
                if (!file) return
                const formData = new FormData()
                formData.append('file', file)
                try {
                  const res = await fetch('/api/customer/avatar', { method: 'POST', body: formData, credentials: 'same-origin' })
                  if (!res.ok) {
                    const err = await res.json().catch(() => ({}))
                    throw new Error(err.message || 'Upload failed')
                  }
                  const data = await res.json()
                  pushToast({ type: 'success', message: 'Avatar updated' })
                  void load()
                } catch (err) {
                  pushToast({ type: 'error', message: err instanceof Error ? err.message : 'Upload failed' })
                }
              }}
            />
          </label>
        </div>
        <div>
          <h1 className="text-xl font-bold">{session.user.name ?? session.user.email.split('@')[0]}</h1>
          <p className="text-xs text-muted-foreground">{session.user.email}</p>
        </div>
        {coins && (
          <div className="ml-auto flex items-center gap-2 rounded-full bg-amber-50 px-3 py-1 text-amber-700 dark:bg-amber-950/20 dark:text-amber-300">
            <Coins className="h-4 w-4" />
            <span className="font-bold">{coins.balance}</span>
            <span className="text-[10px]">coins</span>
          </div>
        )}
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex w-full overflow-x-auto">
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="orders">Orders ({orders.length})</TabsTrigger>
          <TabsTrigger value="addresses">Addresses</TabsTrigger>
          <TabsTrigger value="wishlist">Wishlist ({wishlist.length})</TabsTrigger>
          <TabsTrigger value="recent">Recent</TabsTrigger>
          <TabsTrigger value="rewards">Rewards</TabsTrigger>
        </TabsList>

        {/* Profile */}
        <TabsContent value="profile" className="mt-4 space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Personal details</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label>Email</Label>
                <Input value={session.user.email} disabled />
              </div>
              <div>
                <Label>Display name</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div>
                <Label>Bio (optional)</Label>
                <Textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={2} />
              </div>
              <Button size="sm" onClick={() => void saveProfile()} disabled={saving}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save changes
              </Button>
            </CardContent>
          </Card>
          {profile?.perTenantProfiles && profile.perTenantProfiles.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-base">Per-shop saved details</CardTitle><CardDescription className="text-xs">Each business sees only its own row for you.</CardDescription></CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {profile.perTenantProfiles.map((p) => (
                    <li key={p.id} className="flex items-center justify-between rounded border border-border/60 p-2 text-sm">
                      <div>
                        <div className="font-medium">{p.tenant.displayName}</div>
                        {p.phone && <div className="text-xs text-muted-foreground">{p.phone}</div>}
                      </div>
                      <Button size="sm" variant="outline" onClick={() => { setActiveTenant(p.tenant.handle); setView('storefront') }}>Visit</Button>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Orders with lifecycle */}
        <TabsContent value="orders" className="mt-4 space-y-3">
          {orders.length === 0 ? (
            <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">
              <Package className="mx-auto mb-2 h-8 w-8" />
              No orders yet. Browse the marketplace to discover shops.
            </CardContent></Card>
          ) : (
            <>
              <div className="grid grid-cols-5 gap-2 text-center">
                <OrderStat label="Unpaid" count={unpaid.length} onClick={() => setView('customer-orders')} />
                <OrderStat label="To ship" count={toShip.length} onClick={() => setView('customer-orders')} />
                <OrderStat label="Shipped" count={shipped.length} onClick={() => setView('customer-orders')} />
                <OrderStat label="To review" count={toReview.length} onClick={() => setView('customer-orders')} />
                <OrderStat label="Returns" count={returns.length} onClick={() => setView('customer-orders')} />
              </div>
              <Card>
                <CardContent className="py-3">
                  <Button variant="link" size="sm" className="w-full" onClick={() => setView('customer-orders')}>View all orders →</Button>
                </CardContent>
              </Card>
              {/* Recent orders preview */}
              <ul className="space-y-2">
                {orders.slice(0, 5).map((o) => (
                  <li key={o.id} className="flex items-center justify-between rounded border border-border/60 p-2 text-sm">
                    <div>
                      <div className="font-mono text-xs">{o.reference}</div>
                      <div className="text-xs text-muted-foreground">{o.tenant.displayName} · {new Date(o.createdAt).toLocaleDateString()}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold">{o.currency} {o.total.toLocaleString()}</div>
                      <Badge variant="outline" className="text-[10px]">{o.status}</Badge>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </TabsContent>

        {/* Addresses */}
        <TabsContent value="addresses" className="mt-4 space-y-3">
          <div className="flex justify-between">
            <p className="text-sm text-muted-foreground">Save multiple addresses — pick one as default for fast checkout.</p>
            <Button size="sm" onClick={() => setShowAddAddress(true)}><Plus className="mr-1 h-3.5 w-3.5" /> Add</Button>
          </div>
          {addresses.length === 0 ? (
            <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">
              <MapPin className="mx-auto mb-2 h-8 w-8" />
              No saved addresses yet.
            </CardContent></Card>
          ) : (
            <ul className="space-y-2">
              {addresses.map((a) => (
                <li key={a.id} className="rounded border border-border/60 p-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{a.label}</span>
                        {a.isDefault && <Badge variant="default" className="text-[10px]">Default</Badge>}
                      </div>
                      <div className="mt-1 text-sm">{a.line1}{a.line2 ? `, ${a.line2}` : ''}</div>
                      <div className="text-xs text-muted-foreground">{a.city}, {a.region}, {a.country}</div>
                      {a.phone && <div className="text-xs">📞 {a.phone}</div>}
                    </div>
                    <div className="flex flex-col gap-1">
                      {!a.isDefault && <Button size="sm" variant="outline" onClick={() => void setDefaultAddress(a.id)}>Set default</Button>}
                      <Button size="sm" variant="ghost" onClick={() => void removeAddress(a.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>

        {/* Wishlist */}
        <TabsContent value="wishlist" className="mt-4">
          {wishlist.length === 0 ? (
            <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">
              <Heart className="mx-auto mb-2 h-8 w-8" />
              Your wishlist is empty. Tap the heart icon on products to save them.
            </CardContent></Card>
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
              {wishlist.map((w) => (
                <Card key={w.id} className="overflow-hidden">
                  <div className="relative aspect-square bg-muted/30">
                    {w.productImage ? (
                       
                      <img src={w.productImage} alt={w.productName} className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full items-center justify-center text-xs text-muted-foreground/30">{w.productName.slice(0, 2).toUpperCase()}</div>
                    )}
                    <button onClick={() => void removeWishlist(w.productId)} className="absolute right-1 top-1 rounded-full bg-background/80 p-1 hover:bg-background">
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                  <CardContent className="p-2">
                    <div className="line-clamp-1 text-xs font-medium">{w.productName}</div>
                    <div className="text-sm font-bold text-rose-600 dark:text-rose-400">{w.currency} {w.productPrice.toLocaleString()}</div>
                    <div className="text-[10px] text-muted-foreground">{w.tenant.displayName}</div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Recently viewed */}
        <TabsContent value="recent" className="mt-4">
          {recentlyViewed.length === 0 ? (
            <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">
              <Eye className="mx-auto mb-2 h-8 w-8" />
              No recently viewed products yet.
            </CardContent></Card>
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
              {recentlyViewed.map((r) => (
                <Card key={r.productId} className="cursor-pointer overflow-hidden" onClick={() => { setActiveTenant(r.tenant.handle); setView('storefront') }}>
                  <div className="aspect-square bg-muted/30">
                    {r.productImage ? (
                       
                      <img src={r.productImage} alt={r.productName} className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full items-center justify-center text-xs text-muted-foreground/30">{r.productName.slice(0, 2).toUpperCase()}</div>
                    )}
                  </div>
                  <CardContent className="p-2">
                    <div className="line-clamp-1 text-xs font-medium">{r.productName}</div>
                    <div className="text-sm font-bold text-rose-600 dark:text-rose-400">{r.currency} {r.productPrice.toLocaleString()}</div>
                    <div className="text-[10px] text-muted-foreground">{r.tenant.displayName}</div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Rewards / Coins / Referral */}
        <TabsContent value="rewards" className="mt-4 space-y-4">
          {coins ? (
            <>
              <Card className="bg-gradient-to-br from-amber-50 to-purple-50 dark:from-amber-950/20 dark:to-purple-950/20">
                <CardContent className="flex items-center justify-between p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-orange-500 text-white">
                      <Coins className="h-6 w-6" />
                    </div>
                    <div>
                      <div className="text-2xl font-bold">{coins.balance}</div>
                      <div className="text-xs text-muted-foreground">OHWASIS coins</div>
                    </div>
                  </div>
                  <div className="text-right">
                    {coins.streak > 0 && (
                      <div className="flex items-center gap-1 text-xs font-medium text-orange-600">
                        <Flame className="h-4 w-4" /> {coins.streak}-day streak
                      </div>
                    )}
                    <Button
                      size="sm"
                      onClick={() => void checkIn()}
                      disabled={checkInLoading || !coins.canCheckInToday}
                      className="mt-1"
                    >
                      {checkInLoading && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                      {coins.canCheckInToday ? 'Daily check-in (+10)' : 'Checked in ✓'}
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle className="text-base flex items-center gap-2"><Gift className="h-4 w-4" /> Referral program</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  {coins.referralCode && (
                    <>
                      <div>
                        <Label>Your referral code</Label>
                        <div className="mt-1 flex gap-2">
                          <Input value={coins.referralCode} readOnly className="font-mono font-bold text-center text-lg" />
                          <Button variant="outline" size="sm" onClick={copyReferralCode}>
                            <Share2 className="mr-1 h-3.5 w-3.5" /> Copy
                          </Button>
                        </div>
                        <p className="mt-2 text-xs text-muted-foreground">
                          Friends who sign up with your code earn you <strong>50 coins</strong> when they place their first order.
                        </p>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-center">
                        <div className="rounded border p-2">
                          <div className="text-xl font-bold">{coins.referralCount}</div>
                          <div className="text-[10px] text-muted-foreground">friends referred</div>
                        </div>
                        <div className="rounded border p-2">
                          <div className="text-xl font-bold">{coins.referralCoinsEarned}</div>
                          <div className="text-[10px] text-muted-foreground">coins earned</div>
                        </div>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>

              {coins.recentTransactions.length > 0 && (
                <Card>
                  <CardHeader><CardTitle className="text-base flex items-center gap-2"><TrendingUp className="h-4 w-4" /> Recent coin activity</CardTitle></CardHeader>
                  <CardContent>
                    <ul className="space-y-1 text-sm">
                      {coins.recentTransactions.map((t) => (
                        <li key={t.id} className="flex items-center justify-between border-b border-border/40 py-1 last:border-0">
                          <div>
                            <div>{t.description}</div>
                            <div className="text-[10px] text-muted-foreground">{new Date(t.createdAt).toLocaleDateString()}</div>
                          </div>
                          <span className={t.amount > 0 ? 'font-bold text-emerald-600' : 'font-bold text-rose-600'}>
                            {t.amount > 0 ? '+' : ''}{t.amount}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              )}
            </>
          ) : (
            <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">Loading rewards…</CardContent></Card>
          )}
        </TabsContent>
      </Tabs>

      {/* Add Address Dialog */}
      <AddAddressDialog open={showAddAddress} onOpenChange={setShowAddAddress} onSaved={() => { void load() }} />
    </div>
  )
}

function OrderStat({ label, count, onClick }: { label: string; count: number; onClick: () => void }) {
  return (
    <button onClick={onClick} className="rounded border border-border/60 p-2 text-center hover:bg-muted/50">
      <div className={`text-xl font-bold ${count > 0 ? 'text-primary' : 'text-muted-foreground'}`}>{count}</div>
      <div className="text-[10px] text-muted-foreground">{label}</div>
    </button>
  )
}

function AddAddressDialog({ open, onOpenChange, onSaved }: { open: boolean; onOpenChange: (o: boolean) => void; onSaved: () => void }) {
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
        <DialogHeader><DialogTitle>Add address</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Label *</Label><Input value={form.label} onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))} placeholder="Home, Work, Mom's place" /></div>
          <div><Label>Address line 1 *</Label><Input value={form.line1} onChange={(e) => setForm((f) => ({ ...f, line1: e.target.value }))} placeholder="Street address" /></div>
          <div><Label>Address line 2</Label><Input value={form.line2} onChange={(e) => setForm((f) => ({ ...f, line2: e.target.value }))} /></div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label>City *</Label><Input value={form.city} onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))} /></div>
            <div><Label>Region *</Label><Input value={form.region} onChange={(e) => setForm((f) => ({ ...f, region: e.target.value }))} /></div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label>Phone</Label><Input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} /></div>
            <div><Label>Postal code</Label><Input value={form.postalCode} onChange={(e) => setForm((f) => ({ ...f, postalCode: e.target.value }))} /></div>
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" id="isDefault" checked={form.isDefault} onChange={(e) => setForm((f) => ({ ...f, isDefault: e.target.checked }))} />
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

// Avoid unused-import warnings
void Star
