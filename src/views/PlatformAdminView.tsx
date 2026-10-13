'use client'

import { useEffect, useState } from 'react'
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Loader2, ShieldCheck, Users, Bot, Database, KeyRound, CheckCircle2, XCircle, Megaphone, ToggleLeft, User as UserIcon, Plus, Trash2 } from 'lucide-react'
import { Switch } from '@/components/ui/switch'

interface MerchantDTO {
  id: string
  handle: string
  displayName: string
  industry: string
  status: string
  contactEmail: string | null
  contactPhone: string | null
  createdAt: string
  memberCount: number
  orderCount: number
  productCount: number
  revenue: number
}

interface AiRequestDTO {
  id: string
  provider: string
  requestedAccess: string
  justification: string
  status: string
  emailDelivered: boolean
  emailError: string | null
  decidedBy: string | null
  decidedAt: string | null
  decisionNotes: string | null
  createdAt: string
  tenant: { id: string; handle: string; displayName: string }
  user: { id: string; email: string; name: string | null }
}

interface AuditDTO {
  id: string
  action: string
  category: string
  targetType: string | null
  targetId: string | null
  ip: string | null
  createdAt: string
  tenant: { handle: string; displayName: string } | null
  actorId: string | null
}

export function PlatformAdminView() {
  const session = useOhwasisStore((s) => s.session)
  const setView = useOhwasisStore((s) => s.setView)
  const setAuthModal = useOhwasisStore((s) => s.setAuthModal)
  const [tab, setTab] = useState('merchants')
  const [seedLoading, setSeedLoading] = useState(false)

  const seed = async () => {
    setSeedLoading(true)
    try {
      const result = await apiFetch<{ ok: boolean; operator: boolean; merchants: number; products: number; categories: number; zones: number; pages: number }>('/api/admin/seed', { method: 'POST' })
      window.alert(`Seed complete: ${result.merchants} merchants, ${result.products} products, ${result.categories} categories, ${result.zones} zones, ${result.pages} pages.`)
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Seed failed')
    } finally {
      setSeedLoading(false)
    }
  }

  if (!session.user) {
    return (
      <div className="container mx-auto max-w-md px-4 py-12 text-center">
        <ShieldCheck className="mx-auto h-10 w-10 text-muted-foreground" />
        <p className="mt-2 text-muted-foreground">Platform admin requires authentication.</p>
        <Button className="mt-4" onClick={() => setAuthModal('login')}>Sign in</Button>
      </div>
    )
  }

  if (!session.isPlatformOperator) {
    return (
      <div className="container mx-auto max-w-md px-4 py-12 text-center">
        <ShieldCheck className="mx-auto h-10 w-10 text-muted-foreground" />
        <p className="mt-2 text-muted-foreground">Your account does not have platform operator access.</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Configure admin credentials via ADMIN_EMAIL and ADMIN_PASSWORD_HASH environment variables.
        </p>
        <Button className="mt-4" variant="outline" onClick={() => void seed()} disabled={seedLoading}>
          {seedLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Seed demo data
        </Button>
        <Button className="mt-2 block" onClick={() => setView('landing')}>Back to merchants</Button>
      </div>
    )
  }

  return (
    <div className="container mx-auto max-w-7xl px-4 py-6">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <ShieldCheck className="h-6 w-6 text-primary" />
            Platform administration
          </h1>
          <p className="text-sm text-muted-foreground">
            Cross-tenant operations. Every action is audit-logged.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void seed()} disabled={seedLoading}>
          {seedLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          <Database className="mr-1 h-3.5 w-3.5" /> Seed demo data
        </Button>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex flex-wrap">
          <TabsTrigger value="merchants"><Users className="mr-1.5 h-3.5 w-3.5" /> Merchants</TabsTrigger>
          <TabsTrigger value="users"><UserIcon className="mr-1.5 h-3.5 w-3.5" /> Users</TabsTrigger>
          <TabsTrigger value="ai-requests"><Bot className="mr-1.5 h-3.5 w-3.5" /> AI requests</TabsTrigger>
          <TabsTrigger value="ads"><Megaphone className="mr-1.5 h-3.5 w-3.5" /> Ads</TabsTrigger>
          <TabsTrigger value="features"><ToggleLeft className="mr-1.5 h-3.5 w-3.5" /> Features</TabsTrigger>
          <TabsTrigger value="audit">Audit log</TabsTrigger>
        </TabsList>
        <TabsContent value="merchants" className="mt-4"><MerchantsPanel /></TabsContent>
        <TabsContent value="users" className="mt-4"><UsersPanel /></TabsContent>
        <TabsContent value="ai-requests" className="mt-4"><AiRequestsPanel /></TabsContent>
        <TabsContent value="ads" className="mt-4"><AdsPanel /></TabsContent>
        <TabsContent value="features" className="mt-4"><FeaturesPanel /></TabsContent>
        <TabsContent value="audit" className="mt-4"><AuditPanel /></TabsContent>
      </Tabs>
    </div>
  )
}

function MerchantsPanel() {
  const pushToast = useOhwasisStore((s) => s.pushToast)
  const [merchants, setMerchants] = useState<MerchantDTO[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<MerchantDTO | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (search) params.set('q', search)
      const data = await apiFetch<{ tenants: MerchantDTO[] }>(`/api/admin/merchants?${params.toString()}`)
      setMerchants(data.tenants)
    } catch (err) {
      pushToast({ type: 'error', message: err instanceof Error ? err.message : 'Load failed' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [search])  

  const changeStatus = async (id: string, status: string) => {
    try {
      await apiFetch(`/api/admin/merchants/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) })
      pushToast({ type: 'success', message: `Merchant ${status.toLowerCase()}` })
      void load()
    } catch (err) {
      pushToast({ type: 'error', message: err instanceof Error ? err.message : 'Update failed' })
    }
  }

  if (loading) return <div className="space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-16" />)}</div>

  return (
    <div className="space-y-4">
      <Input placeholder="Search by name, handle, email…" value={search} onChange={(e) => setSearch(e.target.value)} className="sm:max-w-md" />
      {merchants.length === 0 ? (
        <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">No merchants yet.</CardContent></Card>
      ) : (
        <div className="space-y-2">
          {merchants.map((m) => (
            <Card key={m.id}>
              <CardContent className="flex flex-wrap items-center justify-between gap-3 p-3">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-sm font-bold text-primary">
                    {m.displayName.slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{m.displayName}</span>
                      <Badge variant="outline" className="text-[10px]">{m.industry}</Badge>
                      <Badge variant={m.status === 'ACTIVE' ? 'default' : m.status === 'SUSPENDED' ? 'destructive' : 'secondary'} className="text-[10px]">{m.status}</Badge>
                    </div>
                    <div className="text-xs text-muted-foreground">@{m.handle} · {m.contactEmail ?? 'no email'} · {m.contactPhone ?? 'no phone'}</div>
                  </div>
                </div>
                <div className="text-right text-xs text-muted-foreground">
                  <div>{m.productCount} products · {m.orderCount} orders · {m.memberCount} members</div>
                  <div className="font-semibold text-foreground">Revenue: KES {m.revenue.toLocaleString()}</div>
                </div>
                <div className="flex gap-1">
                  {m.status === 'ACTIVE' ? (
                    <Button size="sm" variant="outline" onClick={() => void changeStatus(m.id, 'SUSPENDED')}>Suspend</Button>
                  ) : (
                    <Button size="sm" onClick={() => void changeStatus(m.id, 'ACTIVE')}>Activate</Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => setEditing(m)}>Details</Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{editing?.displayName}</DialogTitle></DialogHeader>
          {editing && (
            <div className="space-y-2 text-sm">
              <Row label="Handle" value={`@${editing.handle}`} />
              <Row label="Industry" value={editing.industry} />
              <Row label="Status" value={editing.status} />
              <Row label="Contact email" value={editing.contactEmail ?? '—'} />
              <Row label="Contact phone" value={editing.contactPhone ?? '—'} />
              <Row label="Created" value={new Date(editing.createdAt).toLocaleString()} />
              <Row label="Members" value={String(editing.memberCount)} />
              <Row label="Products" value={String(editing.productCount)} />
              <Row label="Orders" value={String(editing.orderCount)} />
              <Row label="Revenue" value={`KES ${editing.revenue.toLocaleString()}`} />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 border-b border-border/40 py-1">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  )
}

function AiRequestsPanel() {
  const pushToast = useOhwasisStore((s) => s.pushToast)
  const [items, setItems] = useState<AiRequestDTO[]>([])
  const [loading, setLoading] = useState(true)
  const [deciding, setDeciding] = useState<AiRequestDTO | null>(null)
  const [decision, setDecision] = useState<{ notes: string; status: 'APPROVED' | 'REJECTED' }>({ notes: '', status: 'APPROVED' })

  const load = async () => {
    setLoading(true)
    try {
      const data = await apiFetch<{ requests: AiRequestDTO[] }>('/api/admin/ai-requests')
      setItems(data.requests)
    } catch (err) {
      pushToast({ type: 'error', message: err instanceof Error ? err.message : 'Load failed' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  const submitDecision = async () => {
    if (!deciding) return
    try {
      await apiFetch(`/api/ai/access-request/${deciding.id}/decide`, {
        method: 'POST',
        body: JSON.stringify(decision),
      })
      pushToast({ type: 'success', message: `Request ${decision.status.toLowerCase()}` })
      setDeciding(null)
      void load()
    } catch (err) {
      pushToast({ type: 'error', message: err instanceof Error ? err.message : 'Decision failed' })
    }
  }

  if (loading) return <Skeleton className="h-40" />

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><KeyRound className="h-4 w-4" /> AI access requests</CardTitle>
          <CardDescription className="text-xs">
            Submitted by merchants. Email notifications go to aevibron@gmail.com (if SMTP configured).
          </CardDescription>
        </CardHeader>
        <CardContent>
          {items.length === 0 ? (
            <p className="text-sm text-muted-foreground">No AI access requests.</p>
          ) : (
            <ul className="space-y-2">
              {items.map((r) => (
                <li key={r.id} className="rounded border border-border/60 p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline" className="text-[10px]">{r.provider}</Badge>
                        <Badge variant={r.status === 'PENDING' ? 'secondary' : r.status === 'APPROVED' ? 'default' : 'destructive'} className="text-[10px]">{r.status}</Badge>
                        <span className="text-xs text-muted-foreground">{new Date(r.createdAt).toLocaleString()}</span>
                      </div>
                      <div className="mt-1 text-sm font-medium">{r.tenant.displayName} → {r.requestedAccess}</div>
                      <div className="text-xs text-muted-foreground">from {r.user.email}</div>
                      <div className="mt-1 text-sm">{r.justification}</div>
                      <div className="mt-1 text-xs">
                        Email: {r.emailDelivered ? <span className="text-emerald-600">delivered</span> : <span className="text-amber-600">not delivered {r.emailError ? `(${r.emailError})` : ''}</span>}
                      </div>
                    </div>
                    {r.status === 'PENDING' && (
                      <Button size="sm" variant="outline" onClick={() => setDeciding(r)}>Review</Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!deciding} onOpenChange={(o) => !o && setDeciding(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Review AI access request</DialogTitle>
            <DialogDescription>{deciding?.tenant.displayName} → {deciding?.requestedAccess}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Decision</Label>
              <Select value={decision.status} onValueChange={(v: 'APPROVED' | 'REJECTED') => setDecision((d) => ({ ...d, status: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="APPROVED">Approve</SelectItem>
                  <SelectItem value="REJECTED">Reject</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea value={decision.notes} onChange={(e) => setDecision((d) => ({ ...d, notes: e.target.value }))} rows={3} placeholder="Internal notes or instructions for the merchant" />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => void submitDecision()}>
              <CheckCircle2 className="mr-2 h-4 w-4" /> Submit decision
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function AuditPanel() {
  const [items, setItems] = useState<AuditDTO[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('')

  useEffect(() => {
    void (async () => {
      try {
        const params = new URLSearchParams({ pageSize: '100' })
        if (filter) params.set('action', filter)
        const data = await apiFetch<{ items: AuditDTO[] }>(`/api/admin/audit?${params.toString()}`)
        setItems(data.items)
      } catch { /* ignore */ } finally { setLoading(false) }
    })()
  }, [filter])

  if (loading) return <Skeleton className="h-40" />

  return (
    <div className="space-y-3">
      <Input placeholder="Filter by action (e.g. login, order.create)" value={filter} onChange={(e) => setFilter(e.target.value)} className="sm:max-w-md" />
      <Card>
        <CardContent className="p-0">
          <div className="max-h-[600px] overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-muted/40">
                <tr>
                  <th className="px-3 py-2 text-left">When</th>
                  <th className="px-3 py-2 text-left">Tenant</th>
                  <th className="px-3 py-2 text-left">Action</th>
                  <th className="px-3 py-2 text-left">Category</th>
                  <th className="px-3 py-2 text-left">Target</th>
                  <th className="px-3 py-2 text-left">IP</th>
                </tr>
              </thead>
              <tbody>
                {items.map((a) => (
                  <tr key={a.id} className="border-t border-border/40">
                    <td className="px-3 py-2 whitespace-nowrap">{new Date(a.createdAt).toLocaleString()}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{a.tenant?.displayName ?? '—'}</td>
                    <td className="px-3 py-2 font-mono">{a.action}</td>
                    <td className="px-3 py-2"><Badge variant="outline" className="text-[10px]">{a.category}</Badge></td>
                    <td className="px-3 py-2 font-mono text-[10px]">{a.targetType ? `${a.targetType}:${a.targetId?.slice(-6)}` : '—'}</td>
                    <td className="px-3 py-2 text-[10px]">{a.ip ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// Avoid unused import warnings
void XCircle

// ---------------------------------------------------------------------------
// Users Panel — admin can view all users + suspend accounts
// ---------------------------------------------------------------------------

function UsersPanel() {
  const pushToast = useOhwasisStore((s) => s.pushToast)
  const [users, setUsers] = useState<Array<{ id: string; email: string; name: string | null; accountType: string; globalRole: number; status: string; createdAt: string }>>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  const load = async () => {
    setLoading(true)
    try {
      // Use the admin audit endpoint to find users (or a dedicated endpoint)
      const data = await apiFetch<{ users: Array<{ id: string; email: string; name: string | null; accountType: string; globalRole: number; status: string; createdAt: string }> }>(`/api/admin/users?q=${encodeURIComponent(search)}`)
      setUsers(data.users)
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [search])  

  const toggleStatus = async (userId: string, currentStatus: string) => {
    const newStatus = currentStatus === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE'
    try {
      await apiFetch(`/api/admin/users/${userId}`, { method: 'PATCH', body: JSON.stringify({ status: newStatus }) })
      pushToast({ type: 'success', message: `User ${newStatus.toLowerCase()}` })
      void load()
    } catch (err) {
      pushToast({ type: 'error', message: err instanceof Error ? err.message : 'Failed' })
    }
  }

  if (loading) return <Skeleton className="h-40" />

  return (
    <div className="space-y-3">
      <Input placeholder="Search by email or name…" value={search} onChange={(e) => setSearch(e.target.value)} className="sm:max-w-md" />
      {users.length === 0 ? (
        <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">No users found.</CardContent></Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40">
                  <tr>
                    <th className="px-3 py-2 text-left">User</th>
                    <th className="px-3 py-2 text-left">Type</th>
                    <th className="px-3 py-2 text-left">Status</th>
                    <th className="px-3 py-2 text-left">Joined</th>
                    <th className="px-3 py-2 text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id} className="border-t border-border/40">
                      <td className="px-3 py-2">
                        <div className="font-medium">{u.name ?? u.email}</div>
                        <div className="text-xs text-muted-foreground">{u.email}</div>
                      </td>
                      <td className="px-3 py-2"><Badge variant="outline" className="text-[10px]">{u.accountType.replace('_', ' ').toLowerCase()}</Badge></td>
                      <td className="px-3 py-2"><Badge variant={u.status === 'ACTIVE' ? 'default' : 'destructive'} className="text-[10px]">{u.status}</Badge></td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{new Date(u.createdAt).toLocaleDateString()}</td>
                      <td className="px-3 py-2 text-right">
                        <Button size="sm" variant="outline" onClick={() => void toggleStatus(u.id, u.status)}>
                          {u.status === 'ACTIVE' ? 'Suspend' : 'Activate'}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Ads Panel — admin can create/manage advertisements
// ---------------------------------------------------------------------------

function AdsPanel() {
  const pushToast = useOhwasisStore((s) => s.pushToast)
  const [ads, setAds] = useState<Array<{ id: string; title: string; description: string | null; imageUrl: string | null; linkUrl: string | null; placement: string; active: boolean; impressions: number; clicks: number; createdAt: string }>>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const data = await apiFetch<{ ads: typeof ads }>('/api/admin/ads')
      setAds(data.ads)
    } catch { /* ignore */ } finally { setLoading(false) }
  }

  useEffect(() => { void load() }, [])

  const toggleActive = async (id: string, currentActive: boolean) => {
    try {
      await apiFetch(`/api/admin/ads/${id}`, { method: 'PATCH', body: JSON.stringify({ active: !currentActive }) })
      pushToast({ type: 'success', message: `Ad ${!currentActive ? 'enabled' : 'disabled'}` })
      void load()
    } catch (err) {
      pushToast({ type: 'error', message: err instanceof Error ? err.message : 'Failed' })
    }
  }

  const remove = async (id: string) => {
    try {
      await apiFetch(`/api/admin/ads/${id}`, { method: 'DELETE' })
      pushToast({ type: 'success', message: 'Ad deleted' })
      void load()
    } catch {
      pushToast({ type: 'error', message: 'Delete failed' })
    }
  }

  if (loading) return <Skeleton className="h-40" />

  return (
    <div className="space-y-3">
      <div className="flex justify-between">
        <p className="text-sm text-muted-foreground">{ads.length} advertisement(s). No ads appear by default — only when you enable them.</p>
        <Button size="sm" onClick={() => setShowCreate(true)}><Plus className="mr-1 h-4 w-4" /> New ad</Button>
      </div>
      {ads.length === 0 ? (
        <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">No advertisements configured.</CardContent></Card>
      ) : (
        <ul className="space-y-2">
          {ads.map((ad) => (
            <li key={ad.id} className="flex items-center justify-between rounded border border-border/60 p-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium">{ad.title}</span>
                  <Badge variant={ad.active ? 'default' : 'secondary'} className="text-[10px]">{ad.active ? 'Active' : 'Inactive'}</Badge>
                  <Badge variant="outline" className="text-[10px]">{ad.placement}</Badge>
                </div>
                {ad.description && <div className="text-xs text-muted-foreground">{ad.description}</div>}
                <div className="text-[10px] text-muted-foreground">{ad.impressions} impressions · {ad.clicks} clicks</div>
              </div>
              <div className="flex gap-1">
                <Button size="sm" variant="outline" onClick={() => void toggleActive(ad.id, ad.active)}>
                  {ad.active ? 'Disable' : 'Enable'}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => void remove(ad.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <CreateAdDialog open={showCreate} onOpenChange={setShowCreate} onSaved={() => { void load() }} />
    </div>
  )
}

function CreateAdDialog({ open, onOpenChange, onSaved }: { open: boolean; onOpenChange: (o: boolean) => void; onSaved: () => void }) {
  const pushToast = useOhwasisStore((s) => s.pushToast)
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({ title: '', description: '', imageUrl: '', linkUrl: '', placement: 'top_banner', active: false })

  const submit = async () => {
    setLoading(true)
    try {
      await apiFetch('/api/admin/ads', {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          imageUrl: form.imageUrl || undefined,
          linkUrl: form.linkUrl || undefined,
        }),
      })
      pushToast({ type: 'success', message: 'Ad created' })
      onSaved()
      onOpenChange(false)
      setForm({ title: '', description: '', imageUrl: '', linkUrl: '', placement: 'top_banner', active: false })
    } catch (err) {
      pushToast({ type: 'error', message: err instanceof Error ? err.message : 'Failed' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Create advertisement</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Title</Label><Input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} /></div>
          <div><Label>Description</Label><Textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} rows={2} /></div>
          <div><Label>Image URL (optional)</Label><Input value={form.imageUrl} onChange={(e) => setForm((f) => ({ ...f, imageUrl: e.target.value }))} placeholder="https://…" /></div>
          <div><Label>Link URL (optional)</Label><Input value={form.linkUrl} onChange={(e) => setForm((f) => ({ ...f, linkUrl: e.target.value }))} placeholder="https://…" /></div>
          <div>
            <Label>Placement</Label>
            <Select value={form.placement} onValueChange={(v) => setForm((f) => ({ ...f, placement: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="top_banner">Top Banner (marketplace)</SelectItem>
                <SelectItem value="splash">Splash Screen (app loading)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={form.active} onCheckedChange={(v) => setForm((f) => ({ ...f, active: v }))} />
            <Label className="text-sm font-normal">Active immediately</Label>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={() => void submit()} disabled={loading || !form.title}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Create ad
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Features Panel — admin can enable/disable features without code changes
// ---------------------------------------------------------------------------

function FeaturesPanel() {
  const pushToast = useOhwasisStore((s) => s.pushToast)
  const [features, setFeatures] = useState<Array<{ id: string; key: string; label: string; description: string | null; enabled: boolean; targetRoles: string[]; config: Record<string, unknown> }>>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const data = await apiFetch<{ features: typeof features }>('/api/admin/features')
      setFeatures(data.features)
    } catch { /* ignore */ } finally { setLoading(false) }
  }

  useEffect(() => { void load() }, [])

  const toggleEnabled = async (id: string, currentEnabled: boolean) => {
    try {
      await apiFetch(`/api/admin/features/${id}`, { method: 'PATCH', body: JSON.stringify({ enabled: !currentEnabled }) })
      pushToast({ type: 'success', message: `Feature ${!currentEnabled ? 'enabled' : 'disabled'}` })
      void load()
    } catch (err) {
      pushToast({ type: 'error', message: err instanceof Error ? err.message : 'Failed' })
    }
  }

  const remove = async (id: string) => {
    try {
      await apiFetch(`/api/admin/features/${id}`, { method: 'DELETE' })
      pushToast({ type: 'success', message: 'Feature deleted' })
      void load()
    } catch {
      pushToast({ type: 'error', message: 'Delete failed' })
    }
  }

  if (loading) return <Skeleton className="h-40" />

  return (
    <div className="space-y-3">
      <div className="flex justify-between">
        <p className="text-sm text-muted-foreground">{features.length} feature(s). Toggle features on/off without code changes.</p>
        <Button size="sm" onClick={() => setShowCreate(true)}><Plus className="mr-1 h-4 w-4" /> New feature</Button>
      </div>
      {features.length === 0 ? (
        <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">No feature flags configured. Create one to control features dynamically.</CardContent></Card>
      ) : (
        <ul className="space-y-2">
          {features.map((f) => (
            <li key={f.id} className="flex items-center justify-between rounded border border-border/60 p-3">
              <div>
                <div className="flex items-center gap-2">
                  <code className="text-xs font-mono font-bold">{f.key}</code>
                  <span className="text-sm font-medium">{f.label}</span>
                  <Badge variant={f.enabled ? 'default' : 'secondary'} className="text-[10px]">{f.enabled ? 'Enabled' : 'Disabled'}</Badge>
                </div>
                {f.description && <div className="text-xs text-muted-foreground">{f.description}</div>}
                <div className="text-[10px] text-muted-foreground">Target: {f.targetRoles.join(', ')}</div>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={f.enabled} onCheckedChange={() => void toggleEnabled(f.id, f.enabled)} />
                <Button size="sm" variant="ghost" onClick={() => void remove(f.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <CreateFeatureDialog open={showCreate} onOpenChange={setShowCreate} onSaved={() => { void load() }} />
    </div>
  )
}

function CreateFeatureDialog({ open, onOpenChange, onSaved }: { open: boolean; onOpenChange: (o: boolean) => void; onSaved: () => void }) {
  const pushToast = useOhwasisStore((s) => s.pushToast)
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({ key: '', label: '', description: '', enabled: false })

  const submit = async () => {
    setLoading(true)
    try {
      await apiFetch('/api/admin/features', {
        method: 'POST',
        body: JSON.stringify({
          key: form.key.toLowerCase().replace(/[^a-z0-9_]/g, '_'),
          label: form.label,
          description: form.description || undefined,
          enabled: form.enabled,
        }),
      })
      pushToast({ type: 'success', message: 'Feature created' })
      onSaved()
      onOpenChange(false)
      setForm({ key: '', label: '', description: '', enabled: false })
    } catch (err) {
      pushToast({ type: 'error', message: err instanceof Error ? err.message : 'Failed' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Create feature flag</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Key (lowercase, underscores)</Label><Input value={form.key} onChange={(e) => setForm((f) => ({ ...f, key: e.target.value }))} placeholder="subscriptions" /></div>
          <div><Label>Label</Label><Input value={form.label} onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))} placeholder="Subscription Plans" /></div>
          <div><Label>Description</Label><Textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} rows={2} /></div>
          <div className="flex items-center gap-2">
            <Switch checked={form.enabled} onCheckedChange={(v) => setForm((f) => ({ ...f, enabled: v }))} />
            <Label className="text-sm font-normal">Enabled</Label>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={() => void submit()} disabled={loading || !form.key || !form.label}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Create feature
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
