'use client'

import { useEffect, useState } from 'react'
import { useOhwasisStore, apiFetch } from '@/lib/store'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { CheckCircle2, Clock, XCircle, ArrowRight } from 'lucide-react'

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
  const handle = useOhwasisStore((s) => s.activeTenantHandle)
  const setView = useOhwasisStore((s) => s.setView)
  const setActiveTenant = useOhwasisStore((s) => s.setActiveTenant)
  const [order, setOrder] = useState<OrderStatusDTO['order'] | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!reference || !handle) return
    void (async () => {
      try {
        const data = await apiFetch<OrderStatusDTO>(`/api/storefront/orders/${encodeURIComponent(reference)}?handle=${handle}`)
        setOrder(data.order)
      } catch {
        // ignore
      } finally {
        setLoading(false)
      }
    })()
  }, [reference, handle])

  if (!reference) {
    return (
      <div className="container mx-auto max-w-md px-4 py-12 text-center">
        <p className="text-muted-foreground">No order to display.</p>
        <Button className="mt-4" onClick={() => setView('landing')}>Browse merchants</Button>
      </div>
    )
  }

  return (
    <div className="container mx-auto max-w-2xl px-4 py-12">
      <Card>
        <CardHeader>
          <div className="mb-2 flex items-center gap-3">
            {order?.payment.status === 'SUCCESS' ? (
              <CheckCircle2 className="h-10 w-10 text-emerald-600" />
            ) : order?.payment.status === 'PENDING' ? (
              <Clock className="h-10 w-10 text-amber-500" />
            ) : (
              <XCircle className="h-10 w-10 text-destructive" />
            )}
            <div>
              <CardTitle className="text-xl">
                {order?.payment.status === 'SUCCESS'
                  ? 'Payment confirmed'
                  : order?.payment.status === 'PENDING'
                    ? 'Order placed — awaiting payment'
                    : 'Order placed — payment issue'}
              </CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">{order?.payment.message}</p>
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
                  <Badge variant="outline">Payment: {order.payment.status}</Badge>
                </div>
              </div>
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
                <Button variant="outline" onClick={() => { setActiveTenant(handle); setView('storefront') }}>
                  Continue shopping
                </Button>
                <Button onClick={() => setView('landing')}>
                  Back to merchants
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
