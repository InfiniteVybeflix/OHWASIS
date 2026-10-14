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
import { Loader2, ShieldCheck, Users, Bot, Database, KeyRound, CheckCircle2, XCircle, Megaphone, ToggleLeft, User as UserIcon, Plus, Trash2, Edit3 } from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import { AdsPanel } from '@/components/ohwasis/AdsPanel'

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
          <DialogHeader><DialogTitle>{editing?.displayName}</DialogTitle><DialogDescription>Merchant details and management.</DialogDescription></DialogHeader>
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
// Ads Panel — now imported from @/components/ohwasis/AdsPanel (full-featured)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Features Panel — admin can enable/disable features without code changes
// ---------------------------------------------------------------------------

function FeaturesPanel() {
  const pushToast = useOhwasisStore((s) => s.pushToast)
  const [features, setFeatures] = useState<Array<{ id: string; key: string; label: string; description: string | null; enabled: boolean; targetRoles: string[]; config: Record<string, unknown> }>>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [editingFeature, setEditingFeature] = useState<string | null>(null)

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
    if (!confirm('Delete this feature flag?')) return
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
        <p className="text-sm text-muted-foreground">{features.length} feature(s). Toggle features on/off, configure placement and behavior — no code changes needed.</p>
        <Button size="sm" onClick={() => { setEditingFeature(null); setShowCreate(true) }}><Plus className="mr-1 h-4 w-4" /> New feature</Button>
      </div>
      {features.length === 0 ? (
        <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">No feature flags configured. Create one to control features dynamically (e.g. subscriptions, promotions, wallet).</CardContent></Card>
      ) : (
        <ul className="space-y-2">
          {features.map((f) => (
            <li key={f.id} className="flex items-center justify-between rounded border border-border/60 p-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <code className="text-xs font-mono font-bold">{f.key}</code>
                  <span className="text-sm font-medium">{f.label}</span>
                  <Badge variant={f.enabled ? 'default' : 'secondary'} className="text-[10px]">{f.enabled ? 'Enabled' : 'Disabled'}</Badge>
                </div>
                {f.description && <div className="text-xs text-muted-foreground">{f.description}</div>}
                <div className="flex flex-wrap gap-2 text-[10px] text-muted-foreground">
                  <span>Target: {f.targetRoles.join(', ')}</span>
                  {Object.keys(f.config).length > 0 && <span>Config: {Object.keys(f.config).join(', ')}</span>}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={f.enabled} onCheckedChange={() => void toggleEnabled(f.id, f.enabled)} />
                <Button size="sm" variant="ghost" onClick={() => { setEditingFeature(f.id); setShowCreate(true) }}><Edit3 className="h-3.5 w-3.5" /></Button>
                <Button size="sm" variant="ghost" onClick={() => void remove(f.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <CreateFeatureDialog
        open={showCreate}
        onOpenChange={setShowCreate}
        onSaved={() => { void load() }}
        editingId={editingFeature}
        existingFeatures={features}
      />
    </div>
  )
}

function CreateFeatureDialog({
  open, onOpenChange, onSaved, editingId, existingFeatures,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  onSaved: () => void
  editingId: string | null
  existingFeatures: Array<{ id: string; key: string; label: string; description: string | null; enabled: boolean; targetRoles: string[]; config: Record<string, unknown> }>
}) {
  const pushToast = useOhwasisStore((s) => s.pushToast)
  const [loading, setLoading] = useState(false)
  const editing = editingId ? existingFeatures.find((f) => f.id === editingId) : null
  const [form, setForm] = useState({
    key: editing?.key ?? '',
    label: editing?.label ?? '',
    description: editing?.description ?? '',
    enabled: editing?.enabled ?? false,
    targetRoles: editing?.targetRoles ?? ['customer', 'business_owner'],
    placement: (editing?.config?.placement as string) ?? 'settings',
    configText: JSON.stringify(editing?.config ?? {}, null, 2),
  })

  useEffect(() => {
    if (editing) {
      setForm({
        key: editing.key,
        label: editing.label,
        description: editing.description ?? '',
        enabled: editing.enabled,
        targetRoles: editing.targetRoles,
        placement: (editing.config?.placement as string) ?? 'settings',
        configText: JSON.stringify(editing.config ?? {}, null, 2),
      })
    } else {
      setForm({ key: '', label: '', description: '', enabled: false, targetRoles: ['customer', 'business_owner'], placement: 'settings', configText: '{}' })
    }
  }, [editing, open])

  const toggleRole = (role: string) => {
    setForm((f) => ({
      ...f,
      targetRoles: f.targetRoles.includes(role) ? f.targetRoles.filter((r) => r !== role) : [...f.targetRoles, role],
    }))
  }

  const submit = async () => {
    setLoading(true)
    try {
      // Parse config JSON
      let config: Record<string, unknown> = {}
      try {
        config = JSON.parse(form.configText)
      } catch {
        pushToast({ type: 'error', message: 'Config JSON is invalid' })
        setLoading(false)
        return
      }
      config.placement = form.placement

      const body = {
        key: form.key.toLowerCase().replace(/[^a-z0-9_]/g, '_'),
        label: form.label,
        description: form.description || undefined,
        enabled: form.enabled,
        targetRoles: form.targetRoles,
        config,
      }

      if (editingId) {
        await apiFetch(`/api/admin/features/${editingId}`, { method: 'PATCH', body: JSON.stringify(body) })
        pushToast({ type: 'success', message: 'Feature updated' })
      } else {
        await apiFetch('/api/admin/features', { method: 'POST', body: JSON.stringify(body) })
        pushToast({ type: 'success', message: 'Feature created' })
      }
      onSaved()
      onOpenChange(false)
    } catch (err) {
      pushToast({ type: 'error', message: err instanceof Error ? err.message : 'Failed' })
    } finally {
      setLoading(false)
    }
  }

  const PLACEMENTS = [
    { value: 'settings', label: 'Settings page' },
    { value: 'marketplace', label: 'Marketplace' },
    { value: 'dashboard', label: 'Business dashboard' },
    { value: 'sidebar', label: 'Sidebar navigation' },
    { value: 'modal', label: 'Modal / popup' },
    { value: 'hidden', label: 'Hidden (API only)' },
  ]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader><DialogTitle>{editingId ? 'Edit feature' : 'Create feature flag'}</DialogTitle><DialogDescription>Configure a feature flag to control app behavior dynamically.</DialogDescription></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Key (lowercase, underscores)</Label>
            <Input value={form.key} onChange={(e) => setForm((f) => ({ ...f, key: e.target.value }))} placeholder="subscriptions" disabled={!!editingId} />
            <p className="text-[10px] text-muted-foreground">Unique identifier — cannot be changed after creation</p>
          </div>
          <div><Label>Label</Label><Input value={form.label} onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))} placeholder="Subscription Plans" /></div>
          <div><Label>Description</Label><Textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} rows={2} /></div>
          <div>
            <Label>Where should this feature appear?</Label>
            <Select value={form.placement} onValueChange={(v) => setForm((f) => ({ ...f, placement: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PLACEMENTS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Target roles</Label>
            <div className="flex flex-wrap gap-2">
              {['customer', 'business_owner', 'admin'].map((role) => (
                <button
                  key={role}
                  type="button"
                  onClick={() => toggleRole(role)}
                  className={`rounded-full border px-3 py-1 text-xs ${form.targetRoles.includes(role) ? 'border-primary bg-primary/5 text-primary' : 'border-border'}`}
                >
                  {role.replace('_', ' ')}
                </button>
              ))}
            </div>
          </div>
          <div>
            <Label>Configuration (JSON)</Label>
            <Textarea
              value={form.configText}
              onChange={(e) => setForm((f) => ({ ...f, configText: e.target.value }))}
              rows={4}
              className="font-mono text-xs"
              placeholder='{"plans": ["free", "pro"], "trial_days": 14}'
            />
            <p className="text-[10px] text-muted-foreground">Store any feature-specific config here (plans, pricing, limits, etc.)</p>
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={form.enabled} onCheckedChange={(v) => setForm((f) => ({ ...f, enabled: v }))} />
            <Label className="text-sm font-normal">Enabled</Label>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={() => void submit()} disabled={loading || !form.key || !form.label}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {editingId ? 'Save changes' : 'Create feature'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
