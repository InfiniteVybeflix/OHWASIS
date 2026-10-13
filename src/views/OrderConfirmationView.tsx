'use client'

import { useEffect, useState } from 'react'
import { useOhwasisStore, apiFetch } from '@/lib/store'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { CheckCircle2, Clock, XCircle, ArrowRight, Copy, Check } from 'lucide-react'

interface PaymentInfo {
  status: string
  message: string
  tillNumber?: string
  paybillNumber?: string
  accountName?: string
  bankName?: string
  accountNumber?: string
  instructions?: string
}

interface OrderStatusDTO {
  order: {
    reference: string
    status: string
    createdAt: string
    total: number
    currency: string
    items: Array<{ name: string; variantName: string | null; quantity: number; unitPrice: number; lineTotal: number }>
    payment: { status: string; message: string }
  }
}

export function OrderConfirmationView() {
  const reference = useOhwasisStore((s) => s.lastOrderReference)
  const paymentInfo = useOhwasisStore((s) => s.lastPaymentInfo)
  const handle = useOhwasisStore((s) => s.activeTenantHandle)
  const setView = useOhwasisStore((s) => s.setView)
  const setActiveTenant = useOhwasisStore((s) => s.setActiveTenant)
  const pushToast = useOhwasisStore((s) => s.pushToast)
  const [order, setOrder] = useState<OrderStatusDTO['order'] | null>(null)
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState<string | null>(null)

  useEffect(() => {
    if (!reference || !handle) return
    void (async () => {
      try {
        const data = await apiFetch<OrderStatusDTO>(`/api/storefront/orders/${encodeURIComponent(reference)}?handle=${handle}`, { tenantHandle: null })
        setOrder(data.order)
      } catch {
        // ignore
      } finally {
        setLoading(false)
      }
    })()
  }, [reference, handle])

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(label)
      setTimeout(() => setCopied(null), 2000)
    }).catch(() => {
      pushToast({ type: 'info', message: `${label}: ${text}` })
    })
  }

  if (!reference) {
    return (
      <div className="container mx-auto max-w-md px-4 py-12 text-center">
        <p className="text-muted-foreground">No order to display.</p>
        <Button className="mt-4" onClick={() => setView('marketplace')}>Browse marketplace</Button>
      </div>
    )
  }

  const paymentStatus = paymentInfo?.status ?? order?.payment.status ?? 'PENDING'
  const paymentMessage = paymentInfo?.message ?? order?.payment.message

  return (
    <div className="container mx-auto max-w-2xl px-4 py-8 pb-20 sm:pb-8">
      <Card>
        <CardHeader>
          <div className="mb-2 flex items-center gap-3">
            {paymentStatus === 'SUCCESS' ? (
              <CheckCircle2 className="h-10 w-10 text-emerald-600" />
            ) : paymentStatus === 'PENDING' ? (
              <Clock className="h-10 w-10 text-amber-500" />
            ) : (
              <XCircle className="h-10 w-10 text-destructive" />
            )}
            <div>
              <CardTitle className="text-xl">
                {paymentStatus === 'SUCCESS'
                  ? 'Order confirmed!'
                  : paymentStatus === 'PENDING'
                    ? 'Order placed — complete your payment'
                    : 'Order placed — payment issue'}
              </CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">{paymentMessage}</p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading order…</p>
          ) : order ? (
            <>
              <div className="rounded border border-border/60 p-3">
                <div className="text-xs text-muted-foreground">Order reference</div>
                <div className="font-mono text-lg">{order.reference}</div>
                <div className="mt-2 flex items-center gap-2">
                  <Badge variant="outline">Status: {order.status}</Badge>
                  <Badge variant="outline">Payment: {paymentStatus}</Badge>
                </div>
              </div>

              {/* Payment details — copy buttons for Till/Paybill/Bank */}
              {paymentInfo && paymentStatus === 'PENDING' && (
                <div className="rounded-lg border border-amber-500/30 bg-amber-50 p-4 dark:bg-amber-950/20">
                  <div className="mb-2 font-medium text-amber-900 dark:text-amber-100">Complete your payment</div>
                  {paymentInfo.tillNumber && (
                    <CopyRow label="Till Number" value={paymentInfo.tillNumber} onCopy={() => copyToClipboard(paymentInfo.tillNumber!, 'Till Number')} copied={copied === 'Till Number'} />
                  )}
                  {paymentInfo.paybillNumber && (
                    <>
                      <CopyRow label="Paybill Number" value={paymentInfo.paybillNumber} onCopy={() => copyToClipboard(paymentInfo.paybillNumber!, 'Paybill')} copied={copied === 'Paybill'} />
                      {paymentInfo.accountName && (
                        <CopyRow label="Account Number" value={paymentInfo.accountName} onCopy={() => copyToClipboard(paymentInfo.accountName!, 'Account')} copied={copied === 'Account'} />
                      )}
                    </>
                  )}
                  {paymentInfo.bankName && (
                    <>
                      <div className="mt-2 text-sm font-medium">{paymentInfo.bankName}</div>
                      {paymentInfo.accountNumber && (
                        <CopyRow label="Account Number" value={paymentInfo.accountNumber} onCopy={() => copyToClipboard(paymentInfo.accountNumber!, 'Bank Account')} copied={copied === 'Bank Account'} />
                      )}
                    </>
                  )}
                  {paymentInfo.instructions && (
                    <p className="mt-2 text-xs italic opacity-80">{paymentInfo.instructions}</p>
                  )}
                  <div className="mt-2 text-xs font-medium">
                    Total to pay: <span className="text-rose-600 dark:text-rose-400">{order.currency} {order.total.toLocaleString()}</span>
                  </div>

                  {/* M-Pesa SMS verification — paste the confirmation message */}
                  <MpesaSmsVerify
                    orderReference={order.reference}
                    tenantHandle={handle ?? ''}
                    onVerified={(msg) => {
                      pushToast({ type: 'success', message: msg })
                      // Reload the order to show updated status
                      void (async () => {
                        try {
                          const data = await apiFetch<OrderStatusDTO>(`/api/storefront/orders/${encodeURIComponent(reference!)}/?handle=${handle}`, { tenantHandle: null })
                          setOrder(data.order)
                        } catch { /* ignore */ }
                      })()
                    }}
                  />
                </div>
              )}

              <div>
                <div className="mb-2 text-sm font-medium">Items</div>
                <ul className="space-y-2">
                  {order.items.map((it, i) => (
                    <li key={i} className="flex items-center justify-between text-sm">
                      <span>
                        {it.quantity}× {it.name}
                        {it.variantName ? ` (${it.variantName})` : ''}
                      </span>
                      <span className="font-medium">{order.currency} {it.lineTotal.toLocaleString()}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-3 border-t pt-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Total</span>
                    <span className="font-bold">{order.currency} {order.total.toLocaleString()}</span>
                  </div>
                </div>
              </div>
              <div className="text-xs text-muted-foreground">
                Save this order reference. You can use it to check status later.
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => { if (handle) { setActiveTenant(handle); setView('storefront') } }}>
                  Continue shopping
                </Button>
                <Button onClick={() => setView('marketplace')}>
                  Back to marketplace
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Order not found.</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function CopyRow({ label, value, onCopy, copied }: { label: string; value: string; onCopy: () => void; copied: boolean }) {
  return (
    <div className="mt-1 flex items-center justify-between rounded bg-white/50 p-1.5 dark:bg-black/20">
      <div>
        <span className="text-xs text-muted-foreground">{label}</span>
        <div className="font-mono text-sm font-bold">{value}</div>
      </div>
      <button onClick={onCopy} className="rounded p-1.5 hover:bg-muted" aria-label={`Copy ${label}`}>
        {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
      </button>
    </div>
  )
}

function MpesaSmsVerify({ orderReference, tenantHandle, onVerified }: { orderReference: string; tenantHandle: string; onVerified: (msg: string) => void }) {
  const [smsText, setSmsText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const pushToast = useOhwasisStore((s) => s.pushToast)

  const submit = async () => {
    if (!smsText.trim() || submitting) return
    setSubmitting(true)
    try {
      const data = await apiFetch<{ ok: boolean; transactionCode: string; amount: number; senderName: string; amountMatches: boolean; message: string }>(
        '/api/mpesa/sms-verify',
        { method: 'POST', body: JSON.stringify({ smsText, orderReference, tenantHandle }), tenantHandle: null },
      )
      setSubmitted(true)
      onVerified(data.message)
    } catch (err) {
      pushToast({ type: 'error', message: err instanceof Error ? err.message : 'Verification failed' })
    } finally {
      setSubmitting(false)
    }
  }

  if (submitted) {
    return (
      <div className="mt-3 rounded-lg border border-emerald-500/30 bg-emerald-50 p-3 text-xs dark:bg-emerald-950/20">
        <CheckCircle2 className="mb-1 h-4 w-4 text-emerald-600" />
        <div className="font-medium text-emerald-900 dark:text-emerald-100">Payment submitted for verification</div>
        <p className="mt-1 text-emerald-700 dark:text-emerald-300">The business has been notified. You'll be updated once they verify the transaction.</p>
      </div>
    )
  }

  return (
    <div className="mt-3 border-t border-amber-500/30 pt-3">
      <div className="text-xs font-medium text-amber-900 dark:text-amber-100">
        Already paid? Paste your M-Pesa confirmation message below:
      </div>
      <textarea
        value={smsText}
        onChange={(e) => setSmsText(e.target.value)}
        rows={3}
        placeholder="e.g. QFX7AB12CD Confirmed. You have received Ksh500.00 from JOHN DOE 0712345678..."
        className="mt-1 w-full rounded border border-border bg-background p-2 text-xs"
        disabled={submitting}
      />
      <Button
        size="sm"
        onClick={() => void submit()}
        disabled={submitting || smsText.length < 20}
        className="mt-1 w-full"
      >
        {submitting ? <Clock className="mr-1 h-3 w-3 animate-spin" /> : <CheckCircle2 className="mr-1 h-3 w-3" />}
        Submit payment confirmation
      </Button>
      <p className="mt-1 text-[10px] text-muted-foreground">
        Paste the full SMS you received from M-Pesa. We extract the transaction code and amount automatically.
      </p>
    </div>
  )
}
