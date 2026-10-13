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
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import { Plus, Loader2, Trash2, ShieldCheck, CreditCard, Wallet, Banknote, Smartphone } from 'lucide-react'

interface PaymentMethodDTO {
  id: string
  method: string
  displayName: string
  enabled: boolean
  config: Record<string, unknown>
  sortOrder: number
}

// Catalog of available payment methods. Each business owner picks which to enable.
// Methods that need credentials (mpesa_stk) go through the existing PaymentProviderConfig flow.
const AVAILABLE_METHODS: Array<{
  method: string
  label: string
  description: string
  icon: React.ComponentType<{ className?: string }>
  needsCredentials: boolean
}> = [
  {
    method: 'cash_on_delivery',
    label: 'Cash on Delivery',
    description: 'Customer pays with cash when their order is delivered or picked up.',
    icon: Banknote,
    needsCredentials: false,
  },
  {
    method: 'manual_till',
    label: 'M-Pesa Till Number',
    description: 'Customer pays to your Till Number; you verify from the dashboard with the receipt.',
    icon: Smartphone,
    needsCredentials: false,
  },
  {
    method: 'manual_paybill',
    label: 'M-Pesa Paybill',
    description: 'Customer pays to your Paybill Number with an account number; you verify from the dashboard.',
    icon: Smartphone,
    needsCredentials: false,
  },
  {
    method: 'bank_transfer',
    label: 'Bank Transfer',
    description: 'Customer transfers to your bank account; you verify manually.',
    icon: Wallet,
    needsCredentials: false,
  },
  {
    method: 'mpesa_stk',
    label: 'M-Pesa STK Push (Daraja)',
    description: 'Customer enters their phone; Safaricom sends an STK prompt. Requires Daraja credentials.',
    icon: Smartphone,
    needsCredentials: true,
  },
  {
    method: 'mpesa_manual',
    label: 'M-Pesa Manual Verification',
    description: 'Customer pays to your M-Pesa line; you verify the transaction from your dashboard.',
    icon: Smartphone,
    needsCredentials: false,
  },
]

export function MerchantPaymentsTab({ tenantHandle }: { tenantHandle: string }) {
  const pushToast = useOhwasisStore((s) => s.pushToast)
  const [methods, setMethods] = useState<PaymentMethodDTO[]>([])
  const [loading, setLoading] = useState(true)
  const [editingMethod, setEditingMethod] = useState<PaymentMethodDTO | null>(null)
  const [showAdd, setShowAdd] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const data = await apiFetch<{ methods: PaymentMethodDTO[] }>('/api/payment-methods')
      setMethods(data.methods)
    } catch (err) {
      pushToast({ type: 'error', message: err instanceof Error ? err.message : 'Load failed' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [tenantHandle])  

  // Toggle a method on/off (used by the multi-select UI)
  const toggleMethod = async (method: PaymentMethodDTO) => {
    // Optimistic update
    setMethods((m) => m.map((x) => x.id === method.id ? { ...x, enabled: !x.enabled } : x))
    try {
      await apiFetch(`/api/payment-methods/${method.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ enabled: !method.enabled }),
      })
      pushToast({
        type: 'success',
        message: `${method.displayName} ${method.enabled ? 'disabled' : 'enabled'}`,
      })
    } catch (err) {
      // Roll back
      setMethods((m) => m.map((x) => x.id === method.id ? { ...x, enabled: method.enabled } : x))
      pushToast({ type: 'error', message: err instanceof Error ? err.message : 'Update failed' })
    }
  }

  // Enable a brand-new method (from the "Add Payment Method" picker)
  const enableMethod = async (methodKey: string, displayName: string, config: Record<string, unknown>) => {
    try {
      await apiFetch('/api/payment-methods', {
        method: 'POST',
        body: JSON.stringify({ method: methodKey, displayName, enabled: true, config }),
      })
      pushToast({ type: 'success', message: `${displayName} added` })
      setShowAdd(false)
      void load()
    } catch (err) {
      pushToast({ type: 'error', message: err instanceof Error ? err.message : 'Failed to add method' })
    }
  }

  if (loading) {
    return <div className="space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-20" />)}</div>
  }

  // Build the list of methods NOT yet configured (for the Add picker)
  const configuredMethodKeys = new Set(methods.map((m) => m.method))
  const availableToAdd = AVAILABLE_METHODS.filter((am) => !configuredMethodKeys.has(am.method))

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Payment methods you accept</CardTitle>
          <CardDescription className="text-xs">
            Toggle the payment methods customers can choose at checkout. Each method is independent — enable as many as you like. Customers will see only the ones you have enabled.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {methods.length === 0 ? (
            <div className="rounded border border-dashed p-6 text-center text-sm text-muted-foreground">
              No payment methods configured yet. Click &quot;Add payment method&quot; below to let customers pay you.
            </div>
          ) : (
            <ul className="space-y-2">
              {methods.map((m) => {
                const meta = AVAILABLE_METHODS.find((am) => am.method === m.method)
                const Icon = meta?.icon ?? CreditCard
                return (
                  <li key={m.id} className="flex items-center justify-between rounded border border-border/60 p-3">
                    <div className="flex items-start gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <Icon className="h-4 w-4" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{m.displayName}</span>
                          <Badge variant={m.enabled ? 'default' : 'secondary'} className="text-[10px]">
                            {m.enabled ? 'Enabled' : 'Disabled'}
                          </Badge>
                          {meta?.needsCredentials && (
                            <Badge variant="outline" className="text-[10px]">Needs credentials</Badge>
                          )}
                        </div>
                        <div className="mt-0.5 text-xs text-muted-foreground">
                          {meta?.description ?? m.method}
                        </div>
                        {/* Method-specific config summary */}
                        {m.method === 'manual_till' && m.config.tillNumber && (
                          <div className="mt-1 text-xs">Till: <span className="font-mono">{String(m.config.tillNumber)}</span></div>
                        )}
                        {m.method === 'manual_paybill' && m.config.paybillNumber && (
                          <div className="mt-1 text-xs">Paybill: <span className="font-mono">{String(m.config.paybillNumber)}</span> · Account: <span className="font-mono">{String(m.config.accountName ?? '')}</span></div>
                        )}
                        {m.method === 'bank_transfer' && m.config.bankName && (
                          <div className="mt-1 text-xs">{String(m.config.bankName)} · Acc: <span className="font-mono">{String(m.config.accountNumber ?? '')}</span></div>
                        )}
                        {m.config.instructions && (
                          <div className="mt-1 text-xs italic opacity-70">&quot;{String(m.config.instructions)}&quot;</div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Switch checked={m.enabled} onCheckedChange={() => void toggleMethod(m)} />
                      <Button size="sm" variant="outline" onClick={() => setEditingMethod(m)}>Edit</Button>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}

          {availableToAdd.length > 0 && (
            <Button size="sm" variant="outline" onClick={() => setShowAdd(true)}>
              <Plus className="mr-1 h-4 w-4" /> Add payment method
            </Button>
          )}
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

      <PaymentMethodEditor
        open={editingMethod !== null}
        method={editingMethod}
        onOpenChange={(o) => { if (!o) setEditingMethod(null) }}
        onSaved={() => { void load() }}
      />
      <AddPaymentMethodDialog
        open={showAdd}
        available={availableToAdd}
        onOpenChange={setShowAdd}
        onEnable={(method, displayName, config) => void enableMethod(method, displayName, config)}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Editor for an existing payment method (changes display name, till number, etc.)
// ---------------------------------------------------------------------------

function PaymentMethodEditor({ open, method, onOpenChange, onSaved }: {
  open: boolean
  method: PaymentMethodDTO | null
  onOpenChange: (o: boolean) => void
  onSaved: () => void
}) {
  const pushToast = useOhwasisStore((s) => s.pushToast)
  const [loading, setLoading] = useState(false)
  const meta = method ? AVAILABLE_METHODS.find((am) => am.method === method.method) : null

  const [displayName, setDisplayName] = useState('')
  const [tillNumber, setTillNumber] = useState('')
  const [paybillNumber, setPaybillNumber] = useState('')
  const [accountName, setAccountName] = useState('')
  const [bankName, setBankName] = useState('')
  const [accountNumber, setAccountNumber] = useState('')
  const [instructions, setInstructions] = useState('')

  useEffect(() => {
    if (method) {
      setDisplayName(method.displayName)
      setTillNumber(String(method.config.tillNumber ?? ''))
      setPaybillNumber(String(method.config.paybillNumber ?? ''))
      setAccountName(String(method.config.accountName ?? ''))
      setBankName(String(method.config.bankName ?? ''))
      setAccountNumber(String(method.config.accountNumber ?? ''))
      setInstructions(String(method.config.instructions ?? ''))
    }
  }, [method])

  const submit = async () => {
    if (!method) return
    setLoading(true)
    try {
      const config: Record<string, unknown> = {}
      if (tillNumber) config.tillNumber = tillNumber
      if (paybillNumber) config.paybillNumber = paybillNumber
      if (accountName) config.accountName = accountName
      if (bankName) config.bankName = bankName
      if (accountNumber) config.accountNumber = accountNumber
      if (instructions) config.instructions = instructions

      await apiFetch(`/api/payment-methods/${method.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ displayName, config }),
      })
      pushToast({ type: 'success', message: 'Payment method updated' })
      onSaved()
      onOpenChange(false)
    } catch (err) {
      pushToast({ type: 'error', message: err instanceof Error ? err.message : 'Save failed' })
    } finally {
      setLoading(false)
    }
  }

  const remove = async () => {
    if (!method) return
    setLoading(true)
    try {
      await apiFetch(`/api/payment-methods/${method.id}`, { method: 'DELETE' })
      pushToast({ type: 'success', message: 'Payment method removed' })
      onSaved()
      onOpenChange(false)
    } catch (err) {
      pushToast({ type: 'error', message: err instanceof Error ? err.message : 'Remove failed' })
    } finally {
      setLoading(false)
    }
  }

  if (!method) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit {meta?.label ?? method.method}</DialogTitle>
          <DialogDescription>
            Customize the display name and method-specific details. Customers see the display name at checkout.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Display name</Label>
            <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder={meta?.label} />
          </div>

          {method.method === 'manual_till' && (
            <div>
              <Label>Till number</Label>
              <Input value={tillNumber} onChange={(e) => setTillNumber(e.target.value)} placeholder="123456" />
            </div>
          )}
          {method.method === 'manual_paybill' && (
            <>
              <div><Label>Paybill number</Label><Input value={paybillNumber} onChange={(e) => setPaybillNumber(e.target.value)} placeholder="247247" /></div>
              <div><Label>Account number / name</Label><Input value={accountName} onChange={(e) => setAccountName(e.target.value)} placeholder="AquaRefill" /></div>
            </>
          )}
          {method.method === 'bank_transfer' && (
            <>
              <div><Label>Bank name</Label><Input value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder="Equity Bank" /></div>
              <div><Label>Account number</Label><Input value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} placeholder="0123456789" /></div>
            </>
          )}
          {method.method === 'mpesa_manual' && (
            <div>
              <Label>M-Pesa phone / Till / Paybill</Label>
              <Input value={tillNumber} onChange={(e) => setTillNumber(e.target.value)} placeholder="07XXXXXXXX or Till number" />
            </div>
          )}

          <div>
            <Label>Customer instructions</Label>
            <Textarea
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              rows={3}
              placeholder="Pay to Till 123456 and reference your order number."
            />
          </div>

          {meta?.needsCredentials && (
            <div className="rounded border border-amber-500/30 bg-amber-50 p-3 text-xs dark:bg-amber-950/20">
              <ShieldCheck className="mb-1 h-4 w-4 text-amber-600" />
              This method requires Daraja credentials. Configure them in the &quot;M-Pesa Daraja&quot; section above. Credentials are encrypted at rest.
            </div>
          )}
        </div>
        <DialogFooter className="flex justify-between gap-2">
          <Button variant="outline" size="sm" onClick={() => void remove()} disabled={loading}>
            <Trash2 className="mr-1 h-3.5 w-3.5" /> Remove
          </Button>
          <Button onClick={() => void submit()} disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// "Add payment method" picker — shows the available (not yet configured) methods
// as a list with checkboxes + a small inline config form for each.
// ---------------------------------------------------------------------------

function AddPaymentMethodDialog({
  open,
  available,
  onOpenChange,
  onEnable,
}: {
  open: boolean
  available: typeof AVAILABLE_METHODS
  onOpenChange: (o: boolean) => void
  onEnable: (method: string, displayName: string, config: Record<string, unknown>) => void
}) {
  const [selected, setSelected] = useState<string | null>(null)
  const [displayName, setDisplayName] = useState('')
  const [tillNumber, setTillNumber] = useState('')
  const [paybillNumber, setPaybillNumber] = useState('')
  const [accountName, setAccountName] = useState('')
  const [bankName, setBankName] = useState('')
  const [accountNumber, setAccountNumber] = useState('')
  const [instructions, setInstructions] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const pick = (methodKey: string) => {
    setSelected(methodKey)
    const meta = AVAILABLE_METHODS.find((am) => am.method === methodKey)
    setDisplayName(meta?.label ?? '')
    setTillNumber('')
    setPaybillNumber('')
    setAccountName('')
    setBankName('')
    setAccountNumber('')
    setInstructions('')
  }

  const submit = () => {
    if (!selected) return
    setSubmitting(true)
    const config: Record<string, unknown> = {}
    if (tillNumber) config.tillNumber = tillNumber
    if (paybillNumber) config.paybillNumber = paybillNumber
    if (accountName) config.accountName = accountName
    if (bankName) config.bankName = bankName
    if (accountNumber) config.accountNumber = accountNumber
    if (instructions) config.instructions = instructions
    onEnable(selected, displayName || (AVAILABLE_METHODS.find((am) => am.method === selected)?.label ?? selected), config)
    setSubmitting(false)
    setSelected(null)
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { setSelected(null); onOpenChange(false) } }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add a payment method</DialogTitle>
          <DialogDescription>
            Choose a payment method to offer your customers. Each is independent — add as many as you like.
          </DialogDescription>
        </DialogHeader>

        {!selected ? (
          <ul className="space-y-2">
            {available.map((m) => (
              <li key={m.method}>
                <button
                  type="button"
                  onClick={() => pick(m.method)}
                  className="flex w-full items-start gap-3 rounded border border-border/60 p-3 text-left transition-colors hover:bg-muted/50"
                >
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <m.icon className="h-4 w-4" />
                  </div>
                  <div className="flex-1">
                    <div className="font-medium">{m.label}</div>
                    <div className="mt-0.5 text-xs text-muted-foreground">{m.description}</div>
                    {m.needsCredentials && (
                      <div className="mt-1 inline-flex items-center gap-1 text-[10px] text-amber-600 dark:text-amber-400">
                        <ShieldCheck className="h-3 w-3" /> Needs Daraja credentials
                      </div>
                    )}
                  </div>
                </button>
              </li>
            ))}
            {available.length === 0 && (
              <p className="text-sm text-muted-foreground">All available payment methods are already configured.</p>
            )}
          </ul>
        ) : (
          <div className="space-y-3">
            <div>
              <Label>Display name</Label>
              <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
            </div>

            {selected === 'manual_till' && (
              <div>
                <Label>Till number</Label>
                <Input value={tillNumber} onChange={(e) => setTillNumber(e.target.value)} placeholder="123456" />
              </div>
            )}
            {selected === 'manual_paybill' && (
              <>
                <div><Label>Paybill number</Label><Input value={paybillNumber} onChange={(e) => setPaybillNumber(e.target.value)} placeholder="247247" /></div>
                <div><Label>Account number / name</Label><Input value={accountName} onChange={(e) => setAccountName(e.target.value)} placeholder="AquaRefill" /></div>
              </>
            )}
            {selected === 'bank_transfer' && (
              <>
                <div><Label>Bank name</Label><Input value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder="Equity Bank" /></div>
                <div><Label>Account number</Label><Input value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} placeholder="0123456789" /></div>
              </>
            )}
            {selected === 'mpesa_manual' && (
              <div>
                <Label>M-Pesa phone / Till / Paybill</Label>
                <Input value={tillNumber} onChange={(e) => setTillNumber(e.target.value)} placeholder="07XXXXXXXX or Till number" />
              </div>
            )}
            {selected === 'cash_on_delivery' && (
              <p className="text-sm text-muted-foreground">No additional details required for cash on delivery.</p>
            )}
            {selected === 'mpesa_stk' && (
              <div className="rounded border border-amber-500/30 bg-amber-50 p-3 text-xs dark:bg-amber-950/20">
                <ShieldCheck className="mb-1 h-4 w-4 text-amber-600" />
                This method requires Daraja credentials. After adding, configure your Daraja consumer key, secret, shortcode, and passkey in the &quot;M-Pesa Daraja&quot; section. Credentials are encrypted at rest.
              </div>
            )}

            <div>
              <Label>Customer instructions</Label>
              <Textarea
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                rows={3}
                placeholder="Pay to Till 123456 and reference your order number."
              />
            </div>

            <div className="flex justify-between gap-2">
              <Button variant="outline" onClick={() => setSelected(null)}>Back</Button>
              <Button onClick={() => submit()} disabled={submitting || !displayName}>
                {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Enable method
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
