'use client'

import { useEffect, useState, useCallback } from 'react'
import { useOhwasisStore, apiFetch } from '@/lib/store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import { Plus, Loader2, Package, ShoppingCart, Settings, Bot, FileText, Shield, Bell, Trash2 } from 'lucide-react'
import { MerchantProductsTab } from '@/components/ohwasis/MerchantProductsTab'
import { MerchantOrdersTab } from '@/components/ohwasis/MerchantOrdersTab'
import { MerchantPaymentsTab } from '@/components/ohwasis/MerchantPaymentsTab'
import { MerchantAITab } from '@/components/ohwasis/MerchantAITab'
import { MerchantCMSTab } from '@/components/ohwasis/MerchantCMSTab'
import { MerchantSettingsTab } from '@/components/ohwasis/MerchantSettingsTab'

export function MerchantDashboardView() {
  const session = useOhwasisStore((s) => s.session)
  const setView = useOhwasisStore((s) => s.setView)
  const setAuthModal = useOhwasisStore((s) => s.setAuthModal)
  const setActiveTenant = useOhwasisStore((s) => s.setActiveTenant)
  const activeHandle = useOhwasisStore((s) => s.activeTenantHandle)
  const [tab, setTab] = useState('overview')
  const [showOnboard, setShowOnboard] = useState(false)

  // Auto-open onboarding if user has no memberships, or auto-select first
  useEffect(() => {
    if (!session.user) return
    if (session.memberships.length === 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (!showOnboard) setShowOnboard(true)
    } else if (!activeHandle) {
       
      setActiveTenant(session.memberships[0].tenant.handle)
    }
  }, [session, activeHandle, setActiveTenant, showOnboard])

  if (!session.user) {
    return (
      <div className="container mx-auto max-w-md px-4 py-12 text-center">
        <p className="text-muted-foreground">Sign in to access your merchant dashboard.</p>
        <Button className="mt-4" onClick={() => setAuthModal('login')}>Sign in</Button>
      </div>
    )
  }

  const activeMembership = session.memberships.find((m) => m.tenant.handle === activeHandle)

  return (
    <div className="container mx-auto max-w-7xl px-4 py-6">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Merchant dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Manage your storefront, products, orders, payments, and AI tools.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {session.memberships.length > 1 && (
            <Select
              value={activeHandle ?? ''}
              onValueChange={(v) => setActiveTenant(v)}
            >
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Select merchant" />
              </SelectTrigger>
              <SelectContent>
                {session.memberships.map((m) => (
                  <SelectItem key={m.tenant.id} value={m.tenant.handle}>
                    {m.tenant.displayName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button variant="outline" size="sm" onClick={() => { if (activeHandle) setView('storefront') }}>
            View storefront
          </Button>
        </div>
      </div>

      {!activeMembership ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <Package className="h-10 w-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              You don&apos;t have a merchant yet. Create your first storefront to get started.
            </p>
            <Button onClick={() => setShowOnboard(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Create storefront
            </Button>
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
            <OverviewPanel tenantHandle={activeHandle!} />
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

      {/* Onboarding dialog */}
      <OnboardingDialog open={showOnboard} onOpenChange={setShowOnboard} />
    </div>
  )
}

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

function OverviewPanel({ tenantHandle }: { tenantHandle: string }) {
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

function OnboardingDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const refreshSession = useOhwasisStore((s) => s.refreshSession)
  const setActiveTenant = useOhwasisStore((s) => s.setActiveTenant)
  const pushToast = useOhwasisStore((s) => s.pushToast)
  const [loading, setLoading] = useState(false)

  const [form, setForm] = useState({
    handle: '',
    displayName: '',
    tagline: '',
    description: '',
    industry: 'general_retail' as string,
    contactEmail: '',
    contactPhone: '',
  })

  const submit = async () => {
    setLoading(true)
    try {
      const res = await apiFetch<{ id: string; handle: string }>('/api/tenants/onboard', {
        method: 'POST',
        body: JSON.stringify(form),
      })
      pushToast({ type: 'success', message: `Storefront "${form.displayName}" created` })
      await refreshSession()
      setActiveTenant(res.handle)
      onOpenChange(false)
    } catch (err) {
      pushToast({ type: 'error', message: err instanceof Error ? err.message : 'Onboarding failed' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Create your storefront</DialogTitle>
          <DialogDescription>
            Pick a handle (lowercase, no spaces), choose an industry template, and we&apos;ll
            spin up your independent storefront with default payment methods enabled.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label htmlFor="handle">Storefront handle</Label>
            <Input
              id="handle"
              value={form.handle}
              onChange={(e) => setForm((f) => ({ ...f, handle: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') }))}
              placeholder="aquarefill"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Letters, numbers, hyphens. 3–32 chars.
            </p>
          </div>
          <div>
            <Label htmlFor="displayName">Display name</Label>
            <Input
              id="displayName"
              value={form.displayName}
              onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))}
              placeholder="AquaRefill Water Delivery"
            />
          </div>
          <div>
            <Label htmlFor="tagline">Tagline (optional)</Label>
            <Input
              id="tagline"
              value={form.tagline}
              onChange={(e) => setForm((f) => ({ ...f, tagline: e.target.value }))}
              placeholder="Pure water, delivered"
            />
          </div>
          <div>
            <Label htmlFor="industry">Industry</Label>
            <Select value={form.industry} onValueChange={(v) => setForm((f) => ({ ...f, industry: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="water_refill">Water & Refill</SelectItem>
                <SelectItem value="restaurant">Restaurant / Food</SelectItem>
                <SelectItem value="grocery">Grocery</SelectItem>
                <SelectItem value="fashion">Fashion & Apparel</SelectItem>
                <SelectItem value="cosmetics">Cosmetics & Personal Care</SelectItem>
                <SelectItem value="electronics">Electronics</SelectItem>
                <SelectItem value="general_retail">General Retail</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="contactEmail">Contact email</Label>
            <Input
              id="contactEmail"
              type="email"
              value={form.contactEmail}
              onChange={(e) => setForm((f) => ({ ...f, contactEmail: e.target.value }))}
              placeholder="orders@yourbusiness.com"
            />
          </div>
          <div>
            <Label htmlFor="contactPhone">Contact phone</Label>
            <Input
              id="contactPhone"
              value={form.contactPhone}
              onChange={(e) => setForm((f) => ({ ...f, contactPhone: e.target.value }))}
              placeholder="+254700000000"
            />
          </div>
          <div>
            <Label htmlFor="description">Description (optional)</Label>
            <Textarea
              id="description"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Tell customers about your business…"
              rows={3}
            />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={() => void submit()} disabled={loading || !form.handle || !form.displayName}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Create storefront
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
