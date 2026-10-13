'use client'

import { useEffect, useState } from 'react'
import { useOhwasisStore } from '@/lib/store'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from '@/components/ui/sheet'
import { Download, X, ShoppingBag, Store } from 'lucide-react'

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[]
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
  prompt: () => Promise<void>
}

/**
 * PWA install prompt — appears once per device (deferred until user interaction).
 *
 * Because the user mentioned "customers install from one endpoint, businesses
 * from another", we offer two install options:
 *   - Install as Customer → adds to home screen with the marketplace as start
 *   - Install as Business → adds to home screen with the business dashboard as start
 *
 * Both use the same PWA manifest; the difference is just a query param on the
 * start URL after install. The OS handles the actual installation.
 */
export function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [showSheet, setShowSheet] = useState(false)
  const session = useOhwasisStore((s) => s.session)
  const setAuthModal = useOhwasisStore((s) => s.setAuthModal)
  const setView = useOhwasisStore((s) => s.setView)
  const pushToast = useOhwasisStore((s) => s.pushToast)

  // Register the service worker
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => { /* ignore */ })
    }
  }, [])

  // Capture the beforeinstallprompt event
  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
      // Show the prompt after 30s on first visit (localStorage guards re-prompting)
      const dismissed = localStorage.getItem('ohwasis_install_dismissed')
      if (!dismissed) {
        setTimeout(() => setShowSheet(true), 30000)
      }
    }
    window.addEventListener('beforeinstallprompt', onPrompt)
    return () => window.removeEventListener('beforeinstallprompt', onPrompt)
  }, [])

  const install = async (role: 'customer' | 'business') => {
    if (!deferredPrompt) {
      // Fallback: show iOS instructions or just route to signup
      pushToast({
        type: 'info',
        message: 'Install: use your browser menu → "Add to Home Screen" or "Install App".',
      })
      if (role === 'customer') {
        setView('marketplace')
      } else {
        setAuthModal('signup')
      }
      setShowSheet(false)
      return
    }
    // Set the start URL via query param (the manifest start_url is "/" but we can hint)
    deferredPrompt.prompt()
    const choice = await deferredPrompt.userChoice
    if (choice.outcome === 'accepted') {
      pushToast({ type: 'success', message: 'OHWASIS installed! Find it on your home screen.' })
      if (role === 'business') {
        setAuthModal('signup')
      } else {
        setView('marketplace')
      }
    }
    setDeferredPrompt(null)
    setShowSheet(false)
  }

  const dismiss = () => {
    setShowSheet(false)
    localStorage.setItem('ohwasis_install_dismissed', '1')
  }

  if (!showSheet) return null

  // If user is logged in, skip the role choice and just install
  const isLogged = !!session.user

  return (
    <Sheet open={showSheet} onOpenChange={(o) => !o && dismiss()}>
      <SheetContent className="flex flex-col sm:max-w-sm">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Download className="h-5 w-5 text-primary" /> Install OHWASIS
          </SheetTitle>
          <SheetDescription>
            Install OHWASIS as an app on your device — works offline, opens instantly, no browser needed.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-3 py-4">
          {!isLogged && (
            <>
              <button
                onClick={() => void install('customer')}
                className="flex w-full items-start gap-3 rounded-lg border border-border/60 p-3 text-left transition-colors hover:bg-muted/50"
              >
                <ShoppingBag className="mt-0.5 h-6 w-6 text-cyan-500" />
                <div>
                  <div className="font-medium">Install as Customer</div>
                  <div className="text-xs text-muted-foreground">Browse the marketplace, place orders, save favourites.</div>
                </div>
              </button>
              <button
                onClick={() => void install('business')}
                className="flex w-full items-start gap-3 rounded-lg border border-border/60 p-3 text-left transition-colors hover:bg-muted/50"
              >
                <Store className="mt-0.5 h-6 w-6 text-purple-500" />
                <div>
                  <div className="font-medium">Install as Business Owner</div>
                  <div className="text-xs text-muted-foreground">Manage your shop, products, orders, and AI tools.</div>
                </div>
              </button>
            </>
          )}
          {isLogged && (
            <Button onClick={() => void install(session.isBusinessOwner ? 'business' : 'customer')} className="w-full">
              <Download className="mr-2 h-4 w-4" /> Install OHWASIS
            </Button>
          )}

          <div className="rounded bg-muted/40 p-2 text-[10px] text-muted-foreground">
            💡 Tip: After install, find OHWASIS on your home screen. The app remembers your login.
          </div>
        </div>

        <SheetFooter>
          <Button variant="outline" onClick={dismiss} className="w-full">
            <X className="mr-2 h-4 w-4" /> Maybe later
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
