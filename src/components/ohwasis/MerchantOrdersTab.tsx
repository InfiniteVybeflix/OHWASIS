'use client'

import { useEffect, useState } from 'react'
import { useOhwasisStore, apiFetch } from '@/lib/store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Loader2, CheckCircle2, XCircle, Clock, Eye } from 'lucide-react'

interface OrderDTO {
  id: string
  reference: string
  status: string
  total: number
  currency: string
  subtotal: number
  fulfillmentFee: number
  discountTotal: number
  guestName: string | null
  guestEmail: string | null
  guestPhone: string | null
  shippingAddress: string
  createdAt: string
  items: Array<{ id: string; name: string; variantName: string | null; quantity: number; unitPrice: number; lineTotal: number }>
  events: Array<{ id: string; type: string; detail: string | null; createdAt: string; actorName: string | null }>
  payments: Array<{ id: string; provider: string; status: string; amount: number; merchantReference: string; failureReason: string | null }>
}

const STATUSES = ['PENDING', 'CONFIRMED', 'PROCESSING', 'OUT_FOR_DELIVERY', 'READY_FOR_PICKUP', 'DELIVERED', 'COMPLETED', 'CANCELLED', 'REFUNDED']

export function MerchantOrdersTab({ tenantHandle }: { tenantHandle: string }) {
  const pushToast = useOhwasisStore((s) => s.pushToast)
  const [orders, setOrders] = useState<OrderDTO[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<OrderDTO | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (filter !== 'all') params.set('status', filter)
      if (search) params.set('q', search)
      const data = await apiFetch<{ items: OrderDTO[] }>(`/api/orders?${params.toString()}`)
      setOrders(data.items)
    } catch (err) {
      pushToast({ type: 'error', message: err instanceof Error ? err.message : 'Load failed' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [tenantHandle, filter, search])  

  if (loading) {
    return <div className="space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-20" />)}</div>
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Input placeholder="Search by ref / name / email / phone" value={search} onChange={(e) => setSearch(e.target.value)} className="sm:max-w-xs" />
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {orders.length === 0 ? (
        <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">No orders match your filters.</CardContent></Card>
      ) : (
        <div className="space-y-2">
          {orders.map((o) => (
            <Card key={o.id} className="cursor-pointer hover:shadow-sm" onClick={() => setSelected(o)}>
              <CardContent className="flex items-center justify-between gap-3 p-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-medium">{o.reference}</span>
                    <Badge variant="outline" className="text-[10px]">{o.status}</Badge>
                  </div>
                  <div className="mt-0.5 truncate text-xs text-muted-foreground">
                    {o.guestName} · {o.guestEmail} · {o.guestPhone}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-semibold">{o.currency} {o.total.toLocaleString()}</div>
                  <div className="text-xs text-muted-foreground">{new Date(o.createdAt).toLocaleDateString()}</div>
                </div>
                <Eye className="h-4 w-4 text-muted-foreground" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <OrderDetailDialog order={selected} onOpenChange={(o) => !o && setSelected(null)} onUpdated={() => { void load() }} />
    </div>
  )
}

function OrderDetailDialog({ order, onOpenChange, onUpdated }: { order: OrderDTO | null; onOpenChange: (o: boolean) => void; onUpdated: () => void }) {
  const pushToast = useOhwasisStore((s) => s.pushToast)
  const [loading, setLoading] = useState(false)
  const [verifyReceipt, setVerifyReceipt] = useState('')
  const [verifyNote, setVerifyNote] = useState('')

  if (!order) return null

  const updateStatus = async (status: string) => {
    setLoading(true)
    try {
      await apiFetch(`/api/orders/${order!.id}`, { method: 'PATCH', body: JSON.stringify({ status }) })
      pushToast({ type: 'success', message: `Order moved to ${status}` })
      onUpdated()
      onOpenChange(false)
    } catch (err) {
      pushToast({ type: 'error', message: err instanceof Error ? err.message : 'Update failed' })
    } finally {
      setLoading(false)
    }
  }

  const cancelOrder = async () => {
    setLoading(true)
    try {
      await apiFetch(`/api/orders/${order!.id}/cancel`, { method: 'POST', body: JSON.stringify({ reason: 'Cancelled by merchant' }) })
      pushToast({ type: 'success', message: 'Order cancelled; stock restored' })
      onUpdated()
      onOpenChange(false)
    } catch (err) {
      pushToast({ type: 'error', message: err instanceof Error ? err.message : 'Cancel failed' })
    } finally {
      setLoading(false)
    }
  }

  const verifyPayment = async () => {
    setLoading(true)
    try {
      await apiFetch('/api/payments/manual-verify', {
        method: 'POST',
        body: JSON.stringify({ orderId: order!.id, receipt: verifyReceipt || undefined, note: verifyNote || undefined }),
      })
      pushToast({ type: 'success', message: 'Payment verified — order confirmed' })
      onUpdated()
      onOpenChange(false)
    } catch (err) {
      pushToast({ type: 'error', message: err instanceof Error ? err.message : 'Verify failed' })
    } finally {
      setLoading(false)
    }
  }

  const addr = (() => { try { return JSON.parse(order.shippingAddress) } catch { return null } })()
  const hasPendingPayment = order.payments.some((p) => p.status === 'PENDING')

  return (
    <Dialog open={!!order} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="font-mono">{order.reference}</span>
            <Badge variant="outline">{order.status}</Badge>
          </DialogTitle>
          <DialogDescription>
            {new Date(order.createdAt).toLocaleString()} · {order.guestName} ({order.guestEmail})
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {/* Items */}
          <Card>
            <CardHeader><CardTitle className="text-sm">Items</CardTitle></CardHeader>
            <CardContent>
              <ul className="space-y-1 text-sm">
                {order.items.map((it) => (
                  <li key={it.id} className="flex justify-between">
                    <span>{it.quantity}× {it.name}{it.variantName ? ` (${it.variantName})` : ''}</span>
                    <span className="font-medium">{order.currency} {it.lineTotal.toLocaleString()}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-3 border-t pt-2 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>{order.currency} {order.subtotal.toLocaleString()}</span></div>
                {order.fulfillmentFee > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Delivery</span><span>{order.currency} {order.fulfillmentFee.toLocaleString()}</span></div>}
                {order.discountTotal > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Discount</span><span>-{order.currency} {order.discountTotal.toLocaleString()}</span></div>}
                <div className="flex justify-between pt-1 font-bold"><span>Total</span><span>{order.currency} {order.total.toLocaleString()}</span></div>
              </div>
            </CardContent>
          </Card>

          {/* Payment */}
          <Card>
            <CardHeader><CardTitle className="text-sm">Payment</CardTitle></CardHeader>
            <CardContent>
              {order.payments.length === 0 ? (
                <p className="text-sm text-muted-foreground">No payment attempts recorded.</p>
              ) : (
                <ul className="space-y-2">
                  {order.payments.map((p) => (
                    <li key={p.id} className="flex items-center justify-between text-sm">
                      <div>
                        <Badge variant="outline" className="mr-2 text-[10px]">{p.provider}</Badge>
                        <span className="font-mono text-xs">{p.merchantReference}</span>
                        {p.failureReason && <div className="text-xs text-destructive">{p.failureReason}</div>}
                      </div>
                      <div className="flex items-center gap-1">
                        {p.status === 'SUCCESS' ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> :
                         p.status === 'PENDING' ? <Clock className="h-4 w-4 text-amber-500" /> :
                         <XCircle className="h-4 w-4 text-destructive" />}
                        <span className="text-xs">{p.status}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              {hasPendingPayment && order.status === 'PENDING' && (
                <div className="mt-4 rounded border border-amber-500/30 bg-amber-50 p-3 dark:bg-amber-950/20">
                  <Label className="text-xs font-medium">Verify manual payment</Label>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <Input placeholder="Receipt / Tx code (optional)" value={verifyReceipt} onChange={(e) => setVerifyReceipt(e.target.value)} />
                    <Input placeholder="Note (optional)" value={verifyNote} onChange={(e) => setVerifyNote(e.target.value)} />
                  </div>
                  <Button size="sm" className="mt-2 w-full" onClick={() => void verifyPayment()} disabled={loading}>
                    {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Verify payment
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Shipping address */}
          {addr && (
            <Card>
              <CardHeader><CardTitle className="text-sm">Shipping address</CardTitle></CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                <div>{addr.line1}</div>
                {addr.line2 && <div>{addr.line2}</div>}
                <div>{addr.city}, {addr.region}</div>
                {addr.postalCode && <div>{addr.postalCode}</div>}
                {addr.notes && <div className="mt-2 italic">“{addr.notes}”</div>}
              </CardContent>
            </Card>
          )}

          {/* Audit timeline */}
          <Card>
            <CardHeader><CardTitle className="text-sm">Timeline</CardTitle></CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {order.events.map((e) => (
                  <li key={e.id} className="flex items-start gap-2 text-xs">
                    <Badge variant="secondary" className="text-[10px]">{e.type}</Badge>
                    <div>
                      <div>{e.detail}</div>
                      <div className="text-muted-foreground">{new Date(e.createdAt).toLocaleString()}{e.actorName ? ` · ${e.actorName}` : ''}</div>
                    </div>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          {/* Actions */}
          <div className="flex flex-wrap gap-2">
            {order.status === 'PENDING' && <Button size="sm" onClick={() => void updateStatus('CONFIRMED')} disabled={loading}>Confirm</Button>}
            {order.status === 'CONFIRMED' && <Button size="sm" onClick={() => void updateStatus('PROCESSING')} disabled={loading}>Start processing</Button>}
            {order.status === 'PROCESSING' && <Button size="sm" onClick={() => void updateStatus('OUT_FOR_DELIVERY')} disabled={loading}>Mark out for delivery</Button>}
            {order.status === 'OUT_FOR_DELIVERY' && <Button size="sm" onClick={() => void updateStatus('DELIVERED')} disabled={loading}>Mark delivered</Button>}
            {order.status === 'DELIVERED' && <Button size="sm" onClick={() => void updateStatus('COMPLETED')} disabled={loading}>Complete</Button>}
            {['PENDING', 'CONFIRMED'].includes(order.status) && (
              <Button size="sm" variant="outline" onClick={() => void cancelOrder()} disabled={loading}>Cancel order</Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
