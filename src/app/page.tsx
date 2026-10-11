'use client'

/**
 * OHWASIS — One Hosted Web Architecture Serving Isolated Storefronts.
 *
 * This is the user-visible entry point for the OHWASIS platform. Because the
 * sandbox only exposes the `/` route, the entire customer/merchant/platform
 * experience lives here as a client-side SPA backed by `/api/*` routes.
 *
 * Views (switched via Zustand):
 *   - LandingPage   — marketing + merchant directory
 *   - Storefront     — customer browsing + cart + checkout
 *   - MerchantDashboard — products / orders / settings / AI / CMS
 *   - PlatformAdmin  — platform operator console
 *   - Auth            — login / signup modals
 *   - OrderConfirmation — receipt page after checkout
 *
 * All API calls go through `/api/*`. Real persistence via Prisma. No mocked
 * success states — every action hits a real endpoint.
 */

import { useEffect, useState } from 'react'
import { useOhwasisStore } from '@/lib/store'
import { LandingView } from '@/views/LandingView'
import { StorefrontView } from '@/views/StorefrontView'
import { MerchantDashboardView } from '@/views/MerchantDashboardView'
import { PlatformAdminView } from '@/views/PlatformAdminView'
import { OrderConfirmationView } from '@/views/OrderConfirmationView'
import { AuthModals } from '@/views/AuthModals'
import { Toaster } from '@/components/ui/toaster'
import { Header, Footer } from '@/components/Header'

export default function Home() {
  const [hydrated, setHydrated] = useState(false)
  const view = useOhwasisStore((s) => s.view)
  const refreshSession = useOhwasisStore((s) => s.refreshSession)

  useEffect(() => {
    // Zustand persists state to localStorage; we need to defer reading it
    // until after mount to avoid SSR/CSR hydration mismatches.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHydrated(true)
    void refreshSession()
  }, [refreshSession])

  if (!hydrated) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">Loading OHWASIS…</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <Header />
      <main className="flex-1 w-full">
        {view === 'landing' && <LandingView />}
        {view === 'storefront' && <StorefrontView />}
        {view === 'merchant' && <MerchantDashboardView />}
        {view === 'admin' && <PlatformAdminView />}
        {view === 'order-confirmation' && <OrderConfirmationView />}
      </main>
      <Footer />
      <AuthModals />
      <Toaster />
    </div>
  )
}
