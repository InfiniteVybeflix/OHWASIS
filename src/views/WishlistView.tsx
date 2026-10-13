'use client'

import { useEffect, useState } from 'react'
import { useOhwasisStore, apiFetch } from '@/lib/store'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Heart, Trash2, ShoppingBag, ArrowRight } from 'lucide-react'

interface WishlistItemDTO {
  id: string
  productId: string
  productName: string
  productSlug: string
  productPrice: number
  currency: string
  productImage: string | null
  tenant: { id: string; handle: string; displayName: string }
  createdAt: string
}

export function WishlistView() {
  const session = useOhwasisStore((s) => s.session)
  const setView = useOhwasisStore((s) => s.setView)
  const setActiveTenant = useOhwasisStore((s) => s.setActiveTenant)
  const setActiveProduct = useOhwasisStore((s) => s.setActiveProduct)
  const setAuthModal = useOhwasisStore((s) => s.setAuthModal)
  const pushToast = useOhwasisStore((s) => s.pushToast)
  const [items, setItems] = useState<WishlistItemDTO[]>([])
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    try {
      const data = await apiFetch<{ items: WishlistItemDTO[]; count: number }>('/api/customer/wishlist', { tenantHandle: null })
      setItems(data.items)
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  const remove = async (productId: string) => {
    try {
      await apiFetch(`/api/customer/wishlist?productId=${productId}`, { method: 'DELETE', tenantHandle: null })
      setItems((items) => items.filter((i) => i.productId !== productId))
      // Update localStorage badge
      const updated = items.filter((i) => i.productId !== productId)
      localStorage.setItem('ohwasis_wishlist_v1', JSON.stringify(updated.map((i) => i.productId)))
      window.dispatchEvent(new Event('ohwasis-wishlist-updated'))
      pushToast({ type: 'success', message: 'Removed from wishlist' })
    } catch (err) {
      pushToast({ type: 'error', message: err instanceof Error ? err.message : 'Failed' })
    }
  }

  const openProduct = (item: WishlistItemDTO) => {
    setActiveTenant(item.tenant.handle)
    setActiveProduct({ productId: item.productId, tenantHandle: item.tenant.handle })
    setView('product-detail')
  }

  const addToCart = async (item: WishlistItemDTO) => {
    const CART_KEY = 'ohwasis_cart_session_v1'
    const sk = localStorage.getItem(CART_KEY) || crypto.randomUUID()
    localStorage.setItem(CART_KEY, sk)
    try {
      await apiFetch(`/api/cart?handle=${item.tenant.handle}&sessionKey=${sk}`, {
        method: 'POST',
        body: JSON.stringify({ productId: item.productId, quantity: 1 }),
        tenantHandle: null,
      })
      // Update cart badge
      const count = parseInt(localStorage.getItem('ohwasis_cart_count_v1') ?? '0', 10) + 1
      localStorage.setItem('ohwasis_cart_count_v1', String(count))
      window.dispatchEvent(new Event('ohwasis-cart-updated'))
      pushToast({ type: 'success', message: `${item.productName} added to cart` })
    } catch (err) {
      pushToast({ type: 'error', message: err instanceof Error ? err.message : 'Add to cart failed' })
    }
  }

  if (!session.user) {
    return (
      <div className="container mx-auto max-w-md px-4 py-12 text-center">
        <Heart className="mx-auto h-10 w-10 text-muted-foreground" />
        <p className="mt-2 text-muted-foreground">Sign in to view your wishlist.</p>
        <Button className="mt-4" onClick={() => setAuthModal('login')}>Sign in</Button>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="container mx-auto max-w-4xl px-4 py-8">
        <Skeleton className="mb-4 h-8 w-1/3" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-48" />)}
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto max-w-4xl px-4 py-6 pb-20 sm:pb-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">My Wishlist</h1>
        <p className="text-sm text-muted-foreground">{items.length} saved item{items.length === 1 ? '' : 's'}</p>
      </div>

      {items.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <Heart className="h-12 w-12 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Your wishlist is empty.</p>
            <p className="text-xs text-muted-foreground">Tap the heart icon on any product to save it here.</p>
            <Button onClick={() => setView('marketplace')} className="mt-2">
              Browse marketplace <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {items.map((item) => (
            <Card key={item.id} className="group overflow-hidden">
              <div className="relative aspect-square cursor-pointer bg-muted/30" onClick={() => openProduct(item)}>
                {item.productImage ? (
                   
                  <img src={item.productImage} alt={item.productName} className="h-full w-full object-cover transition-transform group-hover:scale-105" />
                ) : (
                  <div className="flex h-full items-center justify-center text-xs font-bold text-muted-foreground/30">
                    {item.productName.slice(0, 2).toUpperCase()}
                  </div>
                )}
                <button
                  onClick={(e) => { e.stopPropagation(); void remove(item.productId) }}
                  className="absolute right-1 top-1 rounded-full bg-background/80 p-1.5 backdrop-blur hover:bg-background"
                  aria-label="Remove from wishlist"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              <CardContent className="p-2">
                <div className="line-clamp-1 cursor-pointer text-xs font-medium" onClick={() => openProduct(item)}>{item.productName}</div>
                <div className="mt-0.5 text-sm font-bold text-rose-600 dark:text-rose-400">{item.currency} {item.productPrice.toLocaleString()}</div>
                <div className="text-[10px] text-muted-foreground">{item.tenant.displayName}</div>
                <Button size="sm" variant="outline" className="mt-2 w-full" onClick={() => void addToCart(item)}>
                  <ShoppingBag className="mr-1 h-3 w-3" /> Add to cart
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
