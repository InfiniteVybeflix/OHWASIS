'use client'

import { useEffect, useState } from 'react'
import { useOhwasisStore, apiFetch } from '@/lib/store'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Package, ChevronRight, X } from 'lucide-react'

interface CustomerOrder {
  id: string
  reference: string
  status: string
  total: number
  currency: string
  createdAt: string
  tenant: { id: string; handle: string; displayName: string }
}

export function CustomerOrdersView() {
  const session = useOhwasisStore((s) => s.session)
  const setAuthModal = useOhwasisStore((s) => s.setAuthModal)
  const pushToast = useOhwasisStore((s) => s.pushToast)
  const [orders, setOrders] = useState<CustomerOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<CustomerOrder | null>(null)

  useEffect(() => {
    void (async () => {
      try {
        const data = await apiFetch<{ orders: CustomerOrder[] }>('/api/customer/profile').then((p) => p.orders)
        setOrders(data)
      } catch (err) {
        pushToast({ type: 'error', message: err instanceof Error ? err.message : 'Failed to load orders' })
      } finally {
        setLoading(false)
      }
    })()
  }, [])  

  if (!session.user) {
    return (
      <div className="container mx-auto max-w-md px-4 py-12 text-center">
        <Package className="mx-auto h-10 w-10 text-muted-foreground" />
        <p className="mt-2 text-muted-foreground">Sign in to view your orders.</p>
        <Button className="mt-4" onClick={() => setAuthModal('login')}>Sign in</Button>
      </div>
    )
  }

  return (
    <div className="container mx-auto max-w-3xl px-4 py-8 space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Your orders</h1>
        <p className="text-sm text-muted-foreground">Track all your orders across every shop.</p>
      </div>
      {loading ? (
        <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-16" />)}</div>
      ) : orders.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">No orders yet.</CardContent></Card>
      ) : (
        <ul className="space-y-2">
          {orders.map((o) => (
            <li key={o.id}>
              <Card className="cursor-pointer hover:shadow-sm" onClick={async () => {
                try {
                  const detail = await apiFetch<{ order: CustomerOrder & { items: Array<{ name: string; variantName: string | null; quantity: number; unitPrice: number; lineTotal: number }>; events: Array<{ type: string; detail: string | null; createdAt: string }>; payments: Array<{ provider: string; status: string }>; tenant: { displayName: string; contactEmail: string | null; contactPhone: string | null } } }>(`/api/customer/orders/${o.id}`)
                  setSelected(detail.order as unknown as CustomerOrder & { items: Array<{ name: string; variantName: string | null; quantity: number; unitPrice: number; lineTotal: number }>; events: Array<{ type: string; detail: string | null; createdAt: string }>; payments: Array<{ provider: string; status: string }>; tenant: { displayName: string; contactEmail: string | null; contactPhone: string | null } })
                } catch (err) {
                  pushToast({ type: 'error', message: err instanceof Error ? err.message : 'Failed to load order' })
                }
              }}>
                <CardContent className="flex items-center justify-between gap-3 p-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm">{o.reference}</span>
                      <Badge variant="outline" className="text-[10px]">{o.status}</Badge>
                    </div>
                    <div className="mt-0.5 text-xs text-muted-foreground">{o.tenant.displayName} · {new Date(o.createdAt).toLocaleString()}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold">{o.currency} {o.total.toLocaleString()}</div>
                    <ChevronRight className="ml-auto h-4 w-4 text-muted-foreground" />
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}

      {/* Order detail modal */}
      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <button onClick={() => setSelected(null)} className="absolute right-4 top-4 opacity-70 hover:opacity-100" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
          {selected && (() => {
            const detail = selected as CustomerOrder & { items?: Array<{ name: string; variantName: string | null; quantity: number; unitPrice: number; lineTotal: number }>; events?: Array<{ type: string; detail: string | null; createdAt: string }>; payments?: Array<{ provider: string; status: string }>; tenant?: { displayName: string; contactEmail: string | null; contactPhone: string | null } }
            return (
              <>
                <DialogHeader>
                  <DialogTitle className="font-mono">{detail.reference}</DialogTitle>
                  <DialogDescription>{detail.tenant?.displayName} · {new Date(detail.createdAt).toLocaleString()}</DialogDescription>
                </DialogHeader>
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">Status: {detail.status}</Badge>
                  </div>
                  {detail.items && (
                    <div>
                      <div className="mb-1 text-xs font-medium">Items</div>
                      <ul className="space-y-1 text-sm">
                        {detail.items.map((it, i) => (
                          <li key={i} className="flex justify-between">
                            <span>{it.quantity}× {it.name}{it.variantName ? ` (${it.variantName})` : ''}</span>
                            <span className="font-medium">{detail.currency} {it.lineTotal.toLocaleString()}</span>
                          </li>
                        ))}
                      </ul>
                      <div className="mt-2 border-t pt-2 flex justify-between font-bold">
                        <span>Total</span>
                        <span>{detail.currency} {detail.total.toLocaleString()}</span>
                      </div>
                    </div>
                  )}
                  {detail.events && detail.events.length > 0 && (
                    <div>
                      <div className="mb-1 text-xs font-medium">Timeline</div>
                      <ul className="space-y-1 text-xs">
                        {detail.events.map((e, i) => (
                          <li key={i}>
                            <Badge variant="secondary" className="mr-1 text-[10px]">{e.type}</Badge>
                            <span>{e.detail ?? '—'}</span>
                            <div className="text-muted-foreground">{new Date(e.createdAt).toLocaleString()}</div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {detail.tenant && (
                    <div className="rounded border p-3 text-xs">
                      <div className="font-medium">Need help with this order?</div>
                      <div className="text-muted-foreground">Contact {detail.tenant.displayName}:</div>
                      {detail.tenant.contactEmail && <div>📧 {detail.tenant.contactEmail}</div>}
                      {detail.tenant.contactPhone && <div>📞 {detail.tenant.contactPhone}</div>}
                    </div>
                  )}
                </div>
              </>
            )
          })()}
        </DialogContent>
      </Dialog>
    </div>
  )
}
