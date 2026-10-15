'use client'

import { useEffect, useState } from 'react'
import { useOhwasisStore } from '@/lib/store'
import { LandingView } from '@/views/LandingView'
import { StorefrontView } from '@/views/StorefrontView'
import { MerchantDashboardView } from '@/views/MerchantDashboardView'
import { PlatformAdminView } from '@/views/PlatformAdminView'
import { OrderConfirmationView } from '@/views/OrderConfirmationView'
import { AuthModals } from '@/views/AuthModals'
import { MarketplaceView } from '@/views/MarketplaceView'
import { CustomerProfileView } from '@/views/CustomerProfileView'
import { CustomerOrdersView } from '@/views/CustomerOrdersView'
import { StoreProfileView } from '@/views/StoreProfileView'
import { Toaster as SonnerToaster } from '@/components/ui/sonner'
import { Header, Footer } from '@/components/Header'
import { MobileBottomNav } from '@/components/ohwasis/MobileBottomNav'
import { PWAInstallPrompt } from '@/components/ohwasis/PWAInstallPrompt'
import { EmailVerificationBanner } from '@/components/ohwasis/EmailVerificationBanner'
import { CategoriesView } from '@/views/CategoriesView'
import { ProductDetailView } from '@/views/ProductDetailView'
import { CartView } from '@/views/CartView'
import { WishlistView } from '@/views/WishlistView'
import { SettingsView } from '@/views/SettingsView'
import { SupportView } from '@/views/SupportView'

export default function Home() {
  const [hydrated, setHydrated] = useState(false)
  const view = useOhwasisStore((s) => s.view)
  const refreshSession = useOhwasisStore((s) => s.refreshSession)
  const session = useOhwasisStore((s) => s.session)
  const setView = useOhwasisStore((s) => s.setView)

  useEffect(() => {
    // Manually hydrate the persisted Zustand store (skipHydration: true in store config
    // to prevent SSR/CSR mismatch). This runs only in the browser after mount.
    void useOhwasisStore.persist.rehydrate()
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHydrated(true)
    void refreshSession()
  }, [refreshSession])

  // Auto-route ONLY on initial load (when view is 'landing').
  // Wait for session to be refreshed before routing (prevents 'customer access required' on reopen).
  useEffect(() => {
    if (!hydrated || !session.user) return
    if (view !== 'landing') return
    const at = session.user.accountType
    if (session.isPlatformOperator) {
      setView('admin')
    } else if (at === 'BUSINESS_OWNER') {
      setView('merchant')
    } else {
      setView('marketplace')
    }
  }, [session.user, session.isPlatformOperator, hydrated, view, setView])

  // Ensure active tenant is set for business owners (fixes 'tenant context required')
  useEffect(() => {
    if (!hydrated || !session.user) return
    if (session.memberships.length > 0 && !session.user) return // wait for session
    // For business owners: if we have memberships but no active tenant, auto-select the first
    if (session.memberships.length > 0) {
      const stored = useOhwasisStore.getState().activeTenantHandle
      if (!stored || !session.memberships.some((m) => m.tenant.handle === stored)) {
        useOhwasisStore.getState().setActiveTenant(session.memberships[0].tenant.handle)
      }
    }
  }, [session, hydrated])

  if (!hydrated) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">Loading OHWASIS…</div>
      </div>
    )
  }

  // Determine if this view should show the mobile bottom nav (customer-facing only)
  // Determine if this view should show the mobile bottom nav
  // Admin view gets bottom nav too — so the admin can navigate away
  const showBottomNav = session.user && (
    view === 'marketplace' || view === 'storefront' || view === 'store-profile' ||
    view === 'customer-profile' || view === 'customer-orders' || view === 'cart' ||
    view === 'order-confirmation' || view === 'categories' || view === 'product-detail' ||
    view === 'wishlist' || view === 'settings' || view === 'admin' || view === 'merchant' || view === 'support'
  )

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <Header />
      <EmailVerificationBanner />
      <main className={`flex-1 w-full ${showBottomNav ? 'pb-16 sm:pb-0' : ''}`}>
        {view === 'landing' && <LandingView />}
        {view === 'marketplace' && <MarketplaceView />}
        {view === 'storefront' && <StorefrontView />}
        {view === 'store-profile' && <StoreProfileView />}
        {view === 'merchant' && <MerchantDashboardView />}
        {view === 'customer-profile' && <CustomerProfileView />}
        {view === 'customer-orders' && <CustomerOrdersView />}
        {view === 'order-confirmation' && <OrderConfirmationView />}
        {view === 'admin' && <PlatformAdminView />}
        {view === 'categories' && <CategoriesView />}
        {view === 'product-detail' && <ProductDetailView />}
        {view === 'cart' && <CartView />}
        {view === 'wishlist' && <WishlistView />}
        {view === 'settings' && <SettingsView />}
        {view === 'support' && <SupportView />}
      </main>
      {/* Footer only on the landing page — not on inner pages */}
      {view === 'landing' && <Footer />}
      {showBottomNav && <MobileBottomNav />}
      <AuthModals />
      <SonnerToaster richColors position="top-center" />
      <PWAInstallPrompt />
    </div>
  )
}
