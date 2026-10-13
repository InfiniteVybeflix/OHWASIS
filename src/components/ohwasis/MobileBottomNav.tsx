'use client'

import { useOhwasisStore } from '@/lib/store'
import { Home, Grid3x3, ShoppingBag, Heart, Settings, ShieldCheck, Store, Users } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useEffect, useState } from 'react'

/**
 * Floating pill-shaped bottom navigation — visible only on mobile (sm:hidden).
 * Shows different tabs based on the user's role:
 *   - Platform operator: Home, Merchants, AI Requests, Settings
 *   - Business owner: Home, Categories, Cart, Settings
 *   - Customer: Home, Categories, Cart, Wishlist, Settings
 */
export function MobileBottomNav() {
  const view = useOhwasisStore((s) => s.view)
  const setView = useOhwasisStore((s) => s.setView)
  const session = useOhwasisStore((s) => s.session)
  const [cartCount, setCartCount] = useState(0)
  const [wishlistCount, setWishlistCount] = useState(0)

  useEffect(() => {
    const updateCounts = () => {
      const cart = localStorage.getItem('ohwasis_cart_count_v1')
      setCartCount(cart ? parseInt(cart, 10) || 0 : 0)
      // Wishlist is stored as JSON array of productIds
      const wishlist = localStorage.getItem('ohwasis_wishlist_v1')
      try {
        const arr = wishlist ? JSON.parse(wishlist) : []
        setWishlistCount(Array.isArray(arr) ? arr.length : 0)
      } catch {
        setWishlistCount(0)
      }
    }
    updateCounts()
    window.addEventListener('storage', updateCounts)
    window.addEventListener('ohwasis-cart-updated', updateCounts)
    window.addEventListener('ohwasis-wishlist-updated', updateCounts)
    return () => {
      window.removeEventListener('storage', updateCounts)
      window.removeEventListener('ohwasis-cart-updated', updateCounts)
      window.removeEventListener('ohwasis-wishlist-updated', updateCounts)
    }
  }, [])

  const isPlatformOperator = session.isPlatformOperator
  const isBusinessOwner = session.isBusinessOwner && !session.isPlatformOperator

  const tabs = isPlatformOperator
    ? [
        { id: 'admin', label: 'Admin', icon: ShieldCheck, view: 'admin' as const },
        { id: 'marketplace', label: 'Market', icon: Home, view: 'marketplace' as const },
        { id: 'settings', label: 'Settings', icon: Settings, view: 'settings' as const },
      ]
    : isBusinessOwner
      ? [
          { id: 'merchant', label: 'Dashboard', icon: Store, view: 'merchant' as const },
          { id: 'marketplace', label: 'Market', icon: Home, view: 'marketplace' as const },
          { id: 'settings', label: 'Settings', icon: Settings, view: 'settings' as const },
        ]
      : [
          { id: 'marketplace', label: 'Home', icon: Home, view: 'marketplace' as const },
          { id: 'categories', label: 'Categories', icon: Grid3x3, view: 'categories' as const },
          { id: 'cart', label: 'Cart', icon: ShoppingBag, view: 'cart' as const, badge: cartCount },
          { id: 'wishlist', label: 'Wishlist', icon: Heart, view: 'wishlist' as const, badge: wishlistCount },
          { id: 'settings', label: 'Settings', icon: Settings, view: 'settings' as const },
        ]

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 flex justify-center pointer-events-none sm:hidden" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <nav className="pointer-events-auto mb-3 flex items-center gap-1 rounded-full border border-border/60 bg-background/95 p-1.5 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-background/85">
        {tabs.map((tab) => {
          const Icon = tab.icon
          const isActive = view === tab.view
          return (
            <button
              key={tab.id}
              onClick={() => setView(tab.view)}
              className={cn(
                'relative flex h-11 w-11 items-center justify-center rounded-full transition-all',
                isActive ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground hover:bg-muted/50',
              )}
              aria-label={tab.label}
              aria-current={isActive ? 'page' : undefined}
            >
              <Icon className={cn('h-5 w-5', isActive && 'fill-primary/20')} />
              {tab.badge !== undefined && tab.badge > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-bold text-white">
                  {tab.badge > 99 ? '99+' : tab.badge}
                </span>
              )}
            </button>
          )
        })}
      </nav>
    </div>
  )
}

// Reserved for future use
void Users
