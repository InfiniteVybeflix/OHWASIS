'use client'

import { useEffect, useState } from 'react'
import { useOhwasisStore, apiFetch } from '@/lib/store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Loader2, Bell, Truck, Tag } from 'lucide-react'

interface NotificationDTO {
  id: string
  channel: string
  template: string
  subject: string | null
  recipient: string
  status: string
  createdAt: string
  error: string | null
}

interface ZoneDTO {
  id: string
  name: string
  areas: string[]
  fee: number
  minimumOrder: number | null
  estimatedMinutes: number | null
  active: boolean
}

export function MerchantSettingsTab({ tenantHandle }: { tenantHandle: string }) {
  const [tab, setTab] = useState<'notifications' | 'delivery' | 'discounts'>('notifications')

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Button size="sm" variant={tab === 'notifications' ? 'default' : 'outline'} onClick={() => setTab('notifications')}>
          <Bell className="mr-1 h-3.5 w-3.5" /> Notifications
        </Button>
        <Button size="sm" variant={tab === 'delivery' ? 'default' : 'outline'} onClick={() => setTab('delivery')}>
          <Truck className="mr-1 h-3.5 w-3.5" /> Delivery zones
        </Button>
        <Button size="sm" variant={tab === 'discounts' ? 'default' : 'outline'} onClick={() => setTab('discounts')}>
          <Tag className="mr-1 h-3.5 w-3.5" /> Discounts
        </Button>
      </div>
      {tab === 'notifications' && <NotificationsPanel tenantHandle={tenantHandle} />}
      {tab === 'delivery' && <DeliveryZonesPanel tenantHandle={tenantHandle} />}
      {tab === 'discounts' && <DiscountsPanel tenantHandle={tenantHandle} />}
    </div>
  )
}

function NotificationsPanel({ tenantHandle }: { tenantHandle: string }) {
  const [items, setItems] = useState<NotificationDTO[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    void (async () => {
      try {
        const data = await apiFetch<{ items: NotificationDTO[] }>('/api/notifications')
        setItems(data.items)
      } catch { /* ignore */ } finally { setLoading(false) }
    })()
  }, [tenantHandle])

  if (loading) return <Skeleton className="h-40" />

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">In-app notifications</CardTitle>
        <CardDescription className="text-xs">Real delivery status. No faked “sent”.</CardDescription>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">No notifications yet.</p>
        ) : (
          <ul className="space-y-2">
            {items.map((n) => (
              <li key={n.id} className="rounded border border-border/60 p-3 text-sm">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-[10px]">{n.template}</Badge>
                    <Badge variant={n.status === 'SENT' ? 'default' : n.status === 'FAILED' ? 'destructive' : 'secondary'} className="text-[10px]">{n.status}</Badge>
                  </div>
                  <span className="text-xs text-muted-foreground">{new Date(n.createdAt).toLocaleString()}</span>
                </div>
                <div className="mt-1 font-medium">{n.subject ?? n.template}</div>
                <div className="text-xs text-muted-foreground">{n.recipient}</div>
                {n.error && <div className="mt-1 text-xs text-destructive">{n.error}</div>}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

function DeliveryZonesPanel({ tenantHandle }: { tenantHandle: string }) {
  const pushToast = useOhwasisStore((s) => s.pushToast)
  const [zones, setZones] = useState<ZoneDTO[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ name: '', areas: '', fee: 0, minimumOrder: 0, estimatedMinutes: 60 })

  const load = async () => {
    setLoading(true)
    try {
      const data = await apiFetch<{ zones: ZoneDTO[] }>('/api/delivery-zones')
      setZones(data.zones)
    } catch { /* ignore */ } finally { setLoading(false) }
  }

  useEffect(() => { void load() }, [tenantHandle])  

  const submit = async () => {
    try {
      await apiFetch('/api/delivery-zones', {
        method: 'POST',
        body: JSON.stringify({
          name: form.name,
          areas: form.areas.split(',').map((s) => s.trim()).filter(Boolean),
          fee: Number(form.fee),
          minimumOrder: form.minimumOrder ? Number(form.minimumOrder) : undefined,
          estimatedMinutes: Number(form.estimatedMinutes),
        }),
      })
      pushToast({ type: 'success', message: 'Delivery zone added' })
      setForm({ name: '', areas: '', fee: 0, minimumOrder: 0, estimatedMinutes: 60 })
      void load()
    } catch (err) {
      pushToast({ type: 'error', message: err instanceof Error ? err.message : 'Save failed' })
    }
  }

  if (loading) return <Skeleton className="h-40" />

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Delivery zones</CardTitle>
        <CardDescription className="text-xs">Define where you deliver and the fee per area.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {zones.length > 0 && (
          <ul className="space-y-2">
            {zones.map((z) => (
              <li key={z.id} className="flex items-center justify-between rounded border border-border/60 p-3 text-sm">
                <div>
                  <div className="font-medium">{z.name} {z.active ? '' : '(inactive)'}</div>
                  <div className="text-xs text-muted-foreground">{z.areas.join(', ')}</div>
                </div>
                <div className="text-right">
                  <div className="font-semibold">KES {z.fee.toLocaleString()}</div>
                  {z.estimatedMinutes && <div className="text-xs text-muted-foreground">~{z.estimatedMinutes} min</div>}
                </div>
              </li>
            ))}
          </ul>
        )}
        <div className="rounded border border-dashed p-3">
          <div className="mb-2 text-sm font-medium">Add new zone</div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div><Label>Zone name</Label><Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Nairobi CBD" /></div>
            <div><Label>Areas (comma-separated)</Label><Input value={form.areas} onChange={(e) => setForm((f) => ({ ...f, areas: e.target.value }))} placeholder="00100, 00200" /></div>
            <div><Label>Fee (KES)</Label><Input type="number" value={form.fee} onChange={(e) => setForm((f) => ({ ...f, fee: Number(e.target.value) }))} /></div>
            <div><Label>Min order (KES, optional)</Label><Input type="number" value={form.minimumOrder} onChange={(e) => setForm((f) => ({ ...f, minimumOrder: Number(e.target.value) }))} /></div>
            <div><Label>Est. delivery (min)</Label><Input type="number" value={form.estimatedMinutes} onChange={(e) => setForm((f) => ({ ...f, estimatedMinutes: Number(e.target.value) }))} /></div>
          </div>
          <Button size="sm" className="mt-2" onClick={() => void submit()}>
            <Loader2 className="hidden" /> Add zone
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function DiscountsPanel({ tenantHandle }: { tenantHandle: string }) {
  const pushToast = useOhwasisStore((s) => s.pushToast)
  const [discounts, setDiscounts] = useState<Array<{ id: string; code: string; type: string; value: number; active: boolean; usedCount: number; usageLimit: number | null }>>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ code: '', type: 'PERCENTAGE', value: 10 })

  const load = async () => {
    setLoading(true)
    try {
      const data = await apiFetch<{ discounts: Array<{ id: string; code: string; type: string; value: number; active: boolean; usedCount: number; usageLimit: number | null }> }>('/api/discounts')
      setDiscounts(data.discounts)
    } catch { /* ignore */ } finally { setLoading(false) }
  }

  useEffect(() => { void load() }, [tenantHandle])  

  const submit = async () => {
    try {
      await apiFetch('/api/discounts', {
        method: 'POST',
        body: JSON.stringify({
          code: form.code.toUpperCase(),
          type: form.type,
          value: Number(form.value),
          startsAt: new Date().toISOString(),
        }),
      })
      pushToast({ type: 'success', message: 'Discount created' })
      setForm({ code: '', type: 'PERCENTAGE', value: 10 })
      void load()
    } catch (err) {
      pushToast({ type: 'error', message: err instanceof Error ? err.message : 'Save failed' })
    }
  }

  if (loading) return <Skeleton className="h-40" />

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Discount codes</CardTitle>
        <CardDescription className="text-xs">Track usage, set limits, expire codes.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {discounts.length > 0 && (
          <ul className="space-y-2">
            {discounts.map((d) => (
              <li key={d.id} className="flex items-center justify-between rounded border border-border/60 p-3 text-sm">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-medium">{d.code}</span>
                    <Badge variant={d.active ? 'default' : 'secondary'} className="text-[10px]">{d.active ? 'Active' : 'Inactive'}</Badge>
                  </div>
                  <div className="text-xs text-muted-foreground">{d.type === 'PERCENTAGE' ? `${d.value}% off` : `KES ${d.value} off`} · used {d.usedCount}{d.usageLimit ? `/${d.usageLimit}` : ''} times</div>
                </div>
              </li>
            ))}
          </ul>
        )}
        <div className="rounded border border-dashed p-3">
          <div className="mb-2 text-sm font-medium">Add discount</div>
          <div className="grid gap-2 sm:grid-cols-3">
            <div><Label>Code</Label><Input value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))} placeholder="SUMMER10" /></div>
            <div>
              <Label>Type</Label>
              <select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))} className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm">
                <option value="PERCENTAGE">Percentage</option>
                <option value="FLAT">Flat amount</option>
              </select>
            </div>
            <div><Label>Value</Label><Input type="number" value={form.value} onChange={(e) => setForm((f) => ({ ...f, value: Number(e.target.value) }))} /></div>
          </div>
          <Button size="sm" className="mt-2" onClick={() => void submit()}>Add discount</Button>
        </div>
      </CardContent>
    </Card>
  )
}
