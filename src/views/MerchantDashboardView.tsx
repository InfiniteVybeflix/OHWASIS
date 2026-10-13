'use client'

import { useEffect, useState } from 'react'
import { useOhwasisStore, apiFetch } from '@/lib/store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Plus, Loader2, Package, ShoppingCart, Settings, Bot, FileText, Store, Clock, Eye, X, Sparkles } from 'lucide-react'
import { MerchantProductsTab } from '@/components/ohwasis/MerchantProductsTab'
import { MerchantOrdersTab } from '@/components/ohwasis/MerchantOrdersTab'
import { MerchantPaymentsTab } from '@/components/ohwasis/MerchantPaymentsTab'
import { MerchantAITab } from '@/components/ohwasis/MerchantAITab'
import { MerchantCMSTab } from '@/components/ohwasis/MerchantCMSTab'
import { MerchantSettingsTab } from '@/components/ohwasis/MerchantSettingsTab'
import { AiBusinessSetup } from '@/components/ohwasis/AiBusinessSetup'

interface DashboardStatsDTO {
  counts: {
    products: number
    activeProducts: number
    orders: number
    ordersLast7: number
    ordersLast30: number
    pendingOrders: number
    customers: number
  }
  revenue: { total: number }
  byStatus: Record<string, number>
  lowStock: Array<{ id: string; name: string; stock: number }>
}

async function loadStats(): Promise<DashboardStatsDTO> {
  return apiFetch<DashboardStatsDTO>('/api/dashboard/stats')
}

export function MerchantDashboardView() {
  const session = useOhwasisStore((s) => s.session)
  const setView = useOhwasisStore((s) => s.setView)
  const setAuthModal = useOhwasisStore((s) => s.setAuthModal)
  const setActiveTenant = useOhwasisStore((s) => s.setActiveTenant)
  const activeHandle = useOhwasisStore((s) => s.activeTenantHandle)
  const pushToast = useOhwasisStore((s) => s.pushToast)
  const refreshSession = useOhwasisStore((s) => s.refreshSession)
  const [tab, setTab] = useState('overview')
  const [showOnboard, setShowOnboard] = useState(false)
  const [showAiSetup, setShowAiSetup] = useState(false)
  const [shopOpenStatus, setShopOpenStatus] = useState<'OPEN' | 'CLOSED' | 'TEMPORARILY_CLOSED'>('OPEN')
  const [togglingShop, setTogglingShop] = useState(false)

  // Find the active business (membership) — uses the business's actual name
  const activeMembership = session.memberships.find((m) => m.tenant.handle === activeHandle)
  const activeBusinessName = activeMembership?.tenant.displayName ?? 'your business'

  // Auto-select first business if user has memberships but none is active.
  // Do NOT auto-open onboarding — only open it when the user explicitly
  // clicks "Create manually" or "Set up with AI". Previously this forced
  // a non-cancellable modal on every visit for users without memberships.
  useEffect(() => {
    if (!session.user) return
    if (session.memberships.length > 0 && !activeHandle) {
      setActiveTenant(session.memberships[0].tenant.handle)
    }
  }, [session, activeHandle, setActiveTenant])

  // Load the active business's open/closed status whenever the active business changes
  useEffect(() => {
    if (!activeHandle) return
    void (async () => {
      try {
        const data = await apiFetch<{ openStatus: string }>(`/api/tenants/${activeHandle}/status`)
        setShopOpenStatus(data.openStatus as typeof shopOpenStatus)
      } catch {
        // ignore — keep default
      }
    })()
  }, [activeHandle])

  const toggleShopStatus = async (newStatus: 'OPEN' | 'CLOSED' | 'TEMPORARILY_CLOSED') => {
    if (!activeHandle || togglingShop) return
    setTogglingShop(true)
    try {
      await apiFetch(`/api/tenants/${activeHandle}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ openStatus: newStatus }),
      })
      setShopOpenStatus(newStatus)
      pushToast({
        type: 'success',
        message:
          newStatus === 'OPEN'
            ? `${activeBusinessName} is now open for orders`
            : newStatus === 'CLOSED'
              ? `${activeBusinessName} is now closed. Customers can still place orders (will need verification).`
              : `${activeBusinessName} is temporarily closed`,
      })
    } catch (err) {
      pushToast({ type: 'error', message: err instanceof Error ? err.message : 'Failed to update shop status' })
    } finally {
      setTogglingShop(false)
    }
  }

  if (!session.user) {
    return (
      <div className="container mx-auto max-w-md px-4 py-12 text-center">
        <p className="text-muted-foreground">Sign in to access your business dashboard.</p>
        <Button className="mt-4" onClick={() => setAuthModal('login')}>Sign in</Button>
      </div>
    )
  }

  // If user is a customer but somehow landed here, redirect to marketplace
  if (session.user.accountType === 'CUSTOMER') {
    return (
      <div className="container mx-auto max-w-md px-4 py-12 text-center">
        <p className="text-muted-foreground">This is the business owner portal. You signed up as a customer.</p>
        <Button className="mt-4" onClick={() => setView('marketplace')}>Go to marketplace</Button>
      </div>
    )
  }

  return (
    <div className="container mx-auto max-w-7xl px-4 py-6">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {activeMembership ? `${activeBusinessName} dashboard` : 'Business dashboard'}
          </h1>
          <p className="text-sm text-muted-foreground">
            Manage your storefront, products, orders, payments, and AI tools.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Business switcher — for owners with multiple businesses */}
          {session.memberships.length > 1 && (
            <Select value={activeHandle ?? ''} onValueChange={(v) => setActiveTenant(v)}>
              <SelectTrigger className="w-56">
                <SelectValue placeholder="Select business" />
              </SelectTrigger>
              <SelectContent>
                {session.memberships.map((m) => (
                  <SelectItem key={m.tenant.id} value={m.tenant.handle}>
                    <span className="flex items-center gap-2">
                      <span className="font-medium">{m.tenant.displayName}</span>
                      <span className="text-[10px] uppercase text-muted-foreground">{m.role.split('_')[0]}</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {/* Open / Closed toggle */}
          {activeMembership && (
            <Select
              value={shopOpenStatus}
              onValueChange={(v: typeof shopOpenStatus) => void toggleShopStatus(v)}
              disabled={togglingShop}
            >
              <SelectTrigger className="w-36">
                <span className="flex items-center gap-2">
                  <span className={`h-2 w-2 rounded-full ${
                    shopOpenStatus === 'OPEN' ? 'bg-emerald-500' : shopOpenStatus === 'CLOSED' ? 'bg-rose-500' : 'bg-amber-500'
                  }`} />
                  <span className="text-xs">{shopOpenStatus === 'OPEN' ? 'Open' : shopOpenStatus === 'CLOSED' ? 'Closed' : 'Paused'}</span>
                </span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="OPEN">Open for orders</SelectItem>
                <SelectItem value="CLOSED">Closed (orders allowed)</SelectItem>
                <SelectItem value="TEMPORARILY_CLOSED">Temporarily closed</SelectItem>
              </SelectContent>
            </Select>
          )}

          {/* View storefront as customers see it */}
          {activeHandle && (
            <Button variant="outline" size="sm" onClick={() => setView('storefront')}>
              <Eye className="mr-1 h-3.5 w-3.5" /> View storefront
            </Button>
          )}
        </div>
      </div>

      {!activeMembership ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <Store className="h-10 w-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              You don&apos;t have a business yet. Create your first storefront — manually, or let AI help you set it up.
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              <Button onClick={() => setShowOnboard(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Create manually
              </Button>
              <Button variant="outline" onClick={() => setShowAiSetup(true)}>
                <Sparkles className="mr-2 h-4 w-4 text-primary" />
                Set up with AI
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Tabs value={tab} onValueChange={setTab} className="w-full">
          <TabsList className="flex w-full max-w-2xl overflow-x-auto">
            <TabsTrigger value="overview"><Package className="mr-1.5 h-3.5 w-3.5" /> Overview</TabsTrigger>
            <TabsTrigger value="products"><Package className="mr-1.5 h-3.5 w-3.5" /> Products</TabsTrigger>
            <TabsTrigger value="orders"><ShoppingCart className="mr-1.5 h-3.5 w-3.5" /> Orders</TabsTrigger>
            <TabsTrigger value="payments"><Settings className="mr-1.5 h-3.5 w-3.5" /> Payments</TabsTrigger>
            <TabsTrigger value="ai"><Bot className="mr-1.5 h-3.5 w-3.5" /> AI</TabsTrigger>
            <TabsTrigger value="cms"><FileText className="mr-1.5 h-3.5 w-3.5" /> CMS</TabsTrigger>
            <TabsTrigger value="settings"><Settings className="mr-1.5 h-3.5 w-3.5" /> Settings</TabsTrigger>
          </TabsList>
          <TabsContent value="overview" className="mt-4">
            <OverviewPanel tenantHandle={activeHandle!} businessName={activeBusinessName} shopOpenStatus={shopOpenStatus} />
          </TabsContent>
          <TabsContent value="products" className="mt-4">
            <MerchantProductsTab tenantHandle={activeHandle!} />
          </TabsContent>
          <TabsContent value="orders" className="mt-4">
            <MerchantOrdersTab tenantHandle={activeHandle!} />
          </TabsContent>
          <TabsContent value="payments" className="mt-4">
            <MerchantPaymentsTab tenantHandle={activeHandle!} />
          </TabsContent>
          <TabsContent value="ai" className="mt-4">
            <MerchantAITab tenantHandle={activeHandle!} />
          </TabsContent>
          <TabsContent value="cms" className="mt-4">
            <MerchantCMSTab tenantHandle={activeHandle!} />
          </TabsContent>
          <TabsContent value="settings" className="mt-4">
            <MerchantSettingsTab tenantHandle={activeHandle!} />
          </TabsContent>
        </Tabs>
      )}

      {/* Onboarding dialog — fixed: X button + field-level validation */}
      <OnboardingDialog open={showOnboard} onOpenChange={setShowOnboard} />
      {/* AI Business Setup — owner describes idea, AI proposes, owner Approve/Edit/Retry/Cancel */}
      <AiBusinessSetup
        open={showAiSetup}
        onOpenChange={setShowAiSetup}
        onApproved={(handle) => {
          setActiveTenant(handle)
          void refreshSession()
        }}
      />
    </div>
  )
}

function OverviewPanel({
  tenantHandle,
  businessName,
  shopOpenStatus,
}: {
  tenantHandle: string
  businessName: string
  shopOpenStatus: 'OPEN' | 'CLOSED' | 'TEMPORARILY_CLOSED'
}) {
  const [stats, setStats] = useState<DashboardStatsDTO | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const s = await loadStats()
        if (!cancelled) setStats(s)
      } catch {
        // ignore
      }
    })()
    return () => { cancelled = true }
  }, [tenantHandle])

  if (!stats) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-28" />)}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {shopOpenStatus !== 'OPEN' && (
        <div className={`rounded-lg border p-4 text-sm ${
          shopOpenStatus === 'CLOSED'
            ? 'border-rose-500/30 bg-rose-50 text-rose-900 dark:bg-rose-950/20 dark:text-rose-100'
            : 'border-amber-500/30 bg-amber-50 text-amber-900 dark:bg-amber-950/20 dark:text-amber-100'
        }`}>
          <div className="flex items-center gap-2 font-medium">
            <Clock className="h-4 w-4" />
            {businessName} is currently {shopOpenStatus === 'CLOSED' ? 'closed' : 'temporarily closed'}.
          </div>
          <p className="mt-1 text-xs opacity-80">
            Customers can still place orders — they&apos;ll be informed that the shop is closed and the order will need verification before processing.
          </p>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total revenue" value={`KES ${stats.revenue.total.toLocaleString()}`} />
        <StatCard label="Orders" value={String(stats.counts.orders)} sub={`${stats.counts.pendingOrders} pending`} />
        <StatCard label="Last 7 days" value={String(stats.counts.ordersLast7)} sub="orders" />
        <StatCard label="Active products" value={String(stats.counts.activeProducts)} sub={`${stats.counts.products} total`} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-sm">Orders by status</CardTitle></CardHeader>
          <CardContent>
            {Object.keys(stats.byStatus).length === 0 ? (
              <p className="text-sm text-muted-foreground">No orders yet.</p>
            ) : (
              <ul className="space-y-2">
                {Object.entries(stats.byStatus).map(([status, count]) => (
                  <li key={status} className="flex items-center justify-between text-sm">
                    <Badge variant="outline" className="text-xs">{status}</Badge>
                    <span className="font-semibold">{count}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">Low stock alerts</CardTitle></CardHeader>
          <CardContent>
            {stats.lowStock.length === 0 ? (
              <p className="text-sm text-muted-foreground">All products well stocked.</p>
            ) : (
              <ul className="space-y-2">
                {stats.lowStock.map((p) => (
                  <li key={p.id} className="flex items-center justify-between text-sm">
                    <span className="truncate">{p.name}</span>
                    <Badge variant={p.stock === 0 ? 'destructive' : 'secondary'} className="text-xs">{p.stock} left</Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="mt-1 text-2xl font-bold">{value}</div>
        {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// OnboardingDialog — fixed version
// Bugs fixed:
//  1. X (close) button now explicitly rendered with onClick → onOpenChange(false)
//  2. Field-level validation: required fields show red border + helper text
//     when invalid; submit is disabled ONLY when no validation passes; on submit
//     attempt with invalid fields, we surface all errors visually
//  3. Removed "merchant" terminology; uses "business" throughout
// ---------------------------------------------------------------------------

interface OnboardingForm {
  handle: string
  displayName: string
  tagline: string
  description: string
  industry: string
  contactEmail: string
  contactPhone: string
}

const INDUSTRIES = [
  { value: 'water_refill', label: 'Water & Refill' },
  { value: 'restaurant', label: 'Restaurant / Food' },
  { value: 'grocery', label: 'Grocery' },
  { value: 'fashion', label: 'Fashion & Apparel' },
  { value: 'cosmetics', label: 'Cosmetics & Personal Care' },
  { value: 'electronics', label: 'Electronics' },
  { value: 'general_retail', label: 'General Retail' },
]

function OnboardingDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const refreshSession = useOhwasisStore((s) => s.refreshSession)
  const setActiveTenant = useOhwasisStore((s) => s.setActiveTenant)
  const pushToast = useOhwasisStore((s) => s.pushToast)
  const [loading, setLoading] = useState(false)
  const [submitAttempted, setSubmitAttempted] = useState(false)

  const [form, setForm] = useState<OnboardingForm>({
    handle: '',
    displayName: '',
    tagline: '',
    description: '',
    industry: 'general_retail',
    contactEmail: '',
    contactPhone: '',
  })

  // Field-level validation rules — used to show errors before submit
  const errors: Partial<Record<keyof OnboardingForm, string>> = {}
  if (form.handle.length > 0 && form.handle.length < 3) errors.handle = 'Handle must be at least 3 characters'
  if (form.handle.length > 32) errors.handle = 'Handle must be at most 32 characters'
  if (form.contactPhone && !/^\+?\d[\d\s-]{7,}$/.test(form.contactPhone)) errors.contactPhone = 'Invalid phone format'
  if (form.contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.contactEmail)) errors.contactEmail = 'Invalid email format'

  const isMissing = (field: keyof OnboardingForm) => submitAttempted && !form[field]
  const isValid = form.handle.length >= 3 && form.handle.length <= 32 && /^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])?$/.test(form.handle)
    && form.displayName.trim().length >= 1 && Object.keys(errors).length === 0

  const update = <K extends keyof OnboardingForm>(key: K, value: OnboardingForm[K]) => {
    setForm((f) => ({ ...f, [key]: value }))
  }

  const submit = async () => {
    setSubmitAttempted(true)
    if (!isValid) {
      pushToast({ type: 'error', message: 'Please fix the highlighted fields before continuing' })
      return
    }
    setLoading(true)
    try {
      const res = await apiFetch<{ id: string; handle: string }>('/api/tenants/onboard', {
        method: 'POST',
        body: JSON.stringify(form),
      })
      pushToast({ type: 'success', message: `${form.displayName} is live!` })
      await refreshSession()
      setActiveTenant(res.handle)
      onOpenChange(false)
      // Reset form for next time
      setForm({
        handle: '',
        displayName: '',
        tagline: '',
        description: '',
        industry: 'general_retail',
        contactEmail: '',
        contactPhone: '',
      })
      setSubmitAttempted(false)
    } catch (err) {
      pushToast({ type: 'error', message: err instanceof Error ? err.message : 'Onboarding failed' })
    } finally {
      setLoading(false)
    }
  }

  const close = () => {
    if (loading) return
    onOpenChange(false)
    setSubmitAttempted(false)
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) close() }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        {/* Explicit close (X) button — top-right. Previously missing. */}
        <button
          onClick={close}
          aria-label="Close"
          className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
          disabled={loading}
        >
          <X className="h-4 w-4" />
        </button>

        <DialogHeader>
          <DialogTitle>Create your business</DialogTitle>
          <DialogDescription>
            Pick a handle (lowercase, no spaces), choose an industry template, and we&apos;ll
            spin up your independent storefront with default payment methods enabled.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {/* Handle */}
          <div>
            <Label htmlFor="handle">
              Business handle <span className="text-destructive">*</span>
            </Label>
            <Input
              id="handle"
              value={form.handle}
              onChange={(e) => update('handle', e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
              placeholder="aquarefill"
              aria-invalid={isMissing('handle') || !!errors.handle}
              className={isMissing('handle') || errors.handle ? 'border-destructive' : ''}
            />
            {isMissing('handle') && (
              <p className="mt-1 text-xs text-destructive">Handle is required</p>
            )}
            {errors.handle && <p className="mt-1 text-xs text-destructive">{errors.handle}</p>}
            {!isMissing('handle') && !errors.handle && (
              <p className="mt-1 text-xs text-muted-foreground">
                Letters, numbers, hyphens. 3–32 chars. This is your URL slug.
              </p>
            )}
          </div>

          {/* Display name */}
          <div>
            <Label htmlFor="displayName">
              Business name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="displayName"
              value={form.displayName}
              onChange={(e) => update('displayName', e.target.value)}
              placeholder="AquaRefill Water Delivery"
              aria-invalid={isMissing('displayName')}
              className={isMissing('displayName') ? 'border-destructive' : ''}
            />
            {isMissing('displayName') && (
              <p className="mt-1 text-xs text-destructive">Business name is required</p>
            )}
            {!isMissing('displayName') && (
              <p className="mt-1 text-xs text-muted-foreground">
                This is what customers see. You can change it later.
              </p>
            )}
          </div>

          {/* Tagline */}
          <div>
            <Label htmlFor="tagline">Tagline (optional)</Label>
            <Input
              id="tagline"
              value={form.tagline}
              onChange={(e) => update('tagline', e.target.value)}
              placeholder="Pure water, delivered"
            />
          </div>

          {/* Industry */}
          <div>
            <Label htmlFor="industry">Industry</Label>
            <Select value={form.industry} onValueChange={(v) => update('industry', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {INDUSTRIES.map((i) => <SelectItem key={i.value} value={i.value}>{i.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Contact email */}
          <div>
            <Label htmlFor="contactEmail">Contact email</Label>
            <Input
              id="contactEmail"
              type="email"
              value={form.contactEmail}
              onChange={(e) => update('contactEmail', e.target.value)}
              placeholder="orders@yourbusiness.com"
              aria-invalid={!!errors.contactEmail}
              className={errors.contactEmail ? 'border-destructive' : ''}
            />
            {errors.contactEmail && (
              <p className="mt-1 text-xs text-destructive">{errors.contactEmail}</p>
            )}
          </div>

          {/* Contact phone */}
          <div>
            <Label htmlFor="contactPhone">Contact phone</Label>
            <Input
              id="contactPhone"
              value={form.contactPhone}
              onChange={(e) => update('contactPhone', e.target.value)}
              placeholder="+254700000000"
              aria-invalid={!!errors.contactPhone}
              className={errors.contactPhone ? 'border-destructive' : ''}
            />
            {errors.contactPhone && (
              <p className="mt-1 text-xs text-destructive">{errors.contactPhone}</p>
            )}
          </div>

          {/* Description */}
          <div>
            <Label htmlFor="description">Description (optional)</Label>
            <Textarea
              id="description"
              value={form.description}
              onChange={(e) => update('description', e.target.value)}
              placeholder="Tell customers about your business…"
              rows={3}
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={close} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Create business
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
