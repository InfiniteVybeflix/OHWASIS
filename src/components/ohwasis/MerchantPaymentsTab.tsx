'use client'

import { useEffect, useState } from 'react'
import { useOhwasisStore, apiFetch } from '@/lib/store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import { Plus, Loader2, Trash2, ShieldCheck, CreditCard } from 'lucide-react'

interface PaymentConfigDTO {
  id: string
  provider: string
  displayName: string
  enabled: boolean
  environment: string
  maskedHint: string | null
  updatedAt: string
}

export function MerchantPaymentsTab({ tenantHandle }: { tenantHandle: string }) {
  const pushToast = useOhwasisStore((s) => s.pushToast)
  const [configs, setConfigs] = useState<PaymentConfigDTO[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<string | null>(null) // provider name or 'new'

  const load = async () => {
    setLoading(true)
    try {
      const data = await apiFetch<{ configs: PaymentConfigDTO[] }>('/api/payments/providers')
      setConfigs(data.configs)
    } catch (err) {
      pushToast({ type: 'error', message: err instanceof Error ? err.message : 'Load failed' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [tenantHandle])  

  if (loading) return <div className="space-y-3">{[1, 2].map((i) => <Skeleton key={i} className="h-20" />)}</div>

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Payment providers</CardTitle>
          <CardDescription className="text-xs">
            Configure how customers can pay you. Secrets are encrypted at rest and never exposed to browsers.
            M-Pesa Daraja credentials require an active Safaricom developer account.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {configs.length === 0 ? (
            <div className="text-sm text-muted-foreground">No payment providers configured yet. Customers won&apos;t be able to check out until you enable at least one.</div>
          ) : (
            <ul className="space-y-2">
              {configs.map((c) => (
                <li key={c.id} className="flex items-center justify-between rounded border border-border/60 p-3">
                  <div className="flex items-start gap-3">
                    <CreditCard className="mt-0.5 h-5 w-5 text-muted-foreground" />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{c.displayName}</span>
                        <Badge variant={c.enabled ? 'default' : 'secondary'} className="text-[10px]">{c.enabled ? 'Enabled' : 'Disabled'}</Badge>
                        <Badge variant="outline" className="text-[10px]">{c.environment}</Badge>
                      </div>
                      <div className="mt-0.5 text-xs text-muted-foreground">{c.maskedHint ?? 'No hint'}</div>
                    </div>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => setEditing(c.provider)}>Edit</Button>
                </li>
              ))}
            </ul>
          )}
          <Button size="sm" className="mt-3" onClick={() => setEditing('new')}>
            <Plus className="mr-1 h-4 w-4" /> Add provider
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">M-Pesa Daraja (STK Push)</CardTitle>
          <CardDescription className="text-xs">
            Native Safaricom Daraja integration. Customer enters their phone, Safaricom sends an STK prompt,
            we mark the order paid only when the authoritative callback arrives.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-xs text-muted-foreground">
          <ul className="ml-4 list-disc space-y-1">
            <li>Register your app at developer.safaricom.co.ke</li>
            <li>Use sandbox credentials first; switch to production after testing.</li>
            <li>Set the callback URL to <code className="bg-muted px-1">{typeof window !== 'undefined' ? window.location.origin : ''}/api/payments/mpesa/callback</code></li>
            <li>Never collect or store an M-Pesa PIN.</li>
          </ul>
        </CardContent>
      </Card>

      <PaymentEditor
        open={editing !== null}
        provider={editing === 'new' ? null : editing}
        onOpenChange={(o) => { if (!o) setEditing(null) }}
        onSaved={() => { void load() }}
      />
    </div>
  )
}

function PaymentEditor({ open, provider, onOpenChange, onSaved }: {
  open: boolean
  provider: string | null
  onOpenChange: (o: boolean) => void
  onSaved: () => void
}) {
  const pushToast = useOhwasisStore((s) => s.pushToast)
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    provider: provider ?? 'manual',
    displayName: '',
    enabled: true,
    environment: 'sandbox',
    // M-Pesa Daraja fields
    consumerKey: '',
    consumerSecret: '',
    shortCode: '',
    passkey: '',
    callbackUrl: '',
    // Manual / COD fields
    instructions: '',
    tillNumber: '',
    paybillNumber: '',
    accountName: '',
  })

  useEffect(() => {
    if (provider) setForm((f) => ({ ...f, provider }))
    else setForm((f) => ({ ...f, provider: 'manual' }))
  }, [provider])

  const submit = async () => {
    setLoading(true)
    try {
      await apiFetch('/api/payments/providers', { method: 'POST', body: JSON.stringify(form) })
      pushToast({ type: 'success', message: 'Payment provider saved' })
      onSaved()
      onOpenChange(false)
    } catch (err) {
      pushToast({ type: 'error', message: err instanceof Error ? err.message : 'Save failed' })
    } finally {
      setLoading(false)
    }
  }

  const remove = async () => {
    if (!provider) return
    setLoading(true)
    try {
      // We need the config ID — look it up via the list endpoint
      const data = await apiFetch<{ configs: PaymentConfigDTO[] }>('/api/payments/providers')
      const cfg = data.configs.find((c) => c.provider === provider)
      if (!cfg) throw new Error('Config not found')
      await apiFetch(`/api/payments/providers/${cfg.id}`, { method: 'DELETE' })
      pushToast({ type: 'success', message: 'Provider removed' })
      onSaved()
      onOpenChange(false)
    } catch (err) {
      pushToast({ type: 'error', message: err instanceof Error ? err.message : 'Remove failed' })
    } finally {
      setLoading(false)
    }
  }

  const isMpesaStk = form.provider === 'mpesa_stk'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{provider ? 'Edit payment provider' : 'Add payment provider'}</DialogTitle>
          <DialogDescription>
            Secrets are encrypted before storage and never returned in plain text.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label htmlFor="provider">Provider</Label>
            <Select value={form.provider} onValueChange={(v) => setForm((f) => ({ ...f, provider: v }))} disabled={!!provider}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="mpesa_stk">M-Pesa Daraja (STK Push)</SelectItem>
                <SelectItem value="mpesa_manual">M-Pesa (Manual verification)</SelectItem>
                <SelectItem value="cash_on_delivery">Cash on Delivery</SelectItem>
                <SelectItem value="manual">Manual (Till / Paybill / Bank)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="displayName">Display name (shown to customers)</Label>
            <Input id="displayName" value={form.displayName} onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))} placeholder="e.g. M-Pesa (Till 123456)" />
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={form.enabled} onCheckedChange={(v) => setForm((f) => ({ ...f, enabled: v }))} />
            <Label className="text-sm font-normal">Enabled</Label>
          </div>

          {isMpesaStk ? (
            <>
              <div className="rounded border border-amber-500/30 bg-amber-50 p-3 text-xs dark:bg-amber-950/20">
                <ShieldCheck className="mb-1 h-4 w-4 text-amber-600" />
                Daraja credentials are fetched from developer.safaricom.co.ke.
                Sandbox consumer key/secret are publicly documented test values; production credentials must be kept private.
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><Label>Consumer key</Label><Input value={form.consumerKey} onChange={(e) => setForm((f) => ({ ...f, consumerKey: e.target.value }))} /></div>
                <div><Label>Consumer secret</Label><Input type="password" value={form.consumerSecret} onChange={(e) => setForm((f) => ({ ...f, consumerSecret: e.target.value }))} /></div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><Label>Short code</Label><Input value={form.shortCode} onChange={(e) => setForm((f) => ({ ...f, shortCode: e.target.value }))} placeholder="174379" /></div>
                <div><Label>Passkey</Label><Input type="password" value={form.passkey} onChange={(e) => setForm((f) => ({ ...f, passkey: e.target.value }))} /></div>
              </div>
              <div>
                <Label>Callback URL</Label>
                <Input value={form.callbackUrl} onChange={(e) => setForm((f) => ({ ...f, callbackUrl: e.target.value }))} placeholder="https://yourdomain.com/api/payments/mpesa/callback" />
              </div>
              <Select value={form.environment} onValueChange={(v) => setForm((f) => ({ ...f, environment: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="sandbox">Sandbox</SelectItem>
                  <SelectItem value="production">Production</SelectItem>
                </SelectContent>
              </Select>
            </>
          ) : (
            <>
              <div>
                <Label>Payment instructions</Label>
                <Textarea value={form.instructions} onChange={(e) => setForm((f) => ({ ...f, instructions: e.target.value }))} rows={3} placeholder="Pay to Till 123456 and reference your order number." />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><Label>Till number (optional)</Label><Input value={form.tillNumber} onChange={(e) => setForm((f) => ({ ...f, tillNumber: e.target.value }))} /></div>
                <div><Label>Paybill number (optional)</Label><Input value={form.paybillNumber} onChange={(e) => setForm((f) => ({ ...f, paybillNumber: e.target.value }))} /></div>
              </div>
              <div><Label>Account name (optional)</Label><Input value={form.accountName} onChange={(e) => setForm((f) => ({ ...f, accountName: e.target.value }))} /></div>
            </>
          )}
        </div>
        <DialogFooter className="flex justify-between gap-2">
          {provider && (
            <Button variant="outline" size="sm" onClick={() => void remove()} disabled={loading}>
              <Trash2 className="mr-1 h-3.5 w-3.5" /> Remove
            </Button>
          )}
          <Button onClick={() => void submit()} disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save provider
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
