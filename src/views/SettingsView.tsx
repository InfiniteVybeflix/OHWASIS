'use client'

import { useEffect, useState } from 'react'
import { useOhwasisStore } from '@/lib/store'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Sun, Moon, Monitor, Download, Bell, Globe, Shield, LogOut, Smartphone, Store, User as UserIcon, ChevronRight, MessageSquare } from 'lucide-react'
import { cn } from '@/lib/utils'

export function SettingsView() {
  const session = useOhwasisStore((s) => s.session)
  const theme = useOhwasisStore((s) => s.theme)
  const setTheme = useOhwasisStore((s) => s.setTheme)
  const setView = useOhwasisStore((s) => s.setView)
  const logout = useOhwasisStore((s) => s.logout)
  const pushToast = useOhwasisStore((s) => s.pushToast)
  const [installPrompt, setInstallPrompt] = useState<{ prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> } | null>(null)

  // Apply theme on mount and when it changes
  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark')
    } else if (theme === 'light') {
      document.documentElement.classList.remove('dark')
    } else {
      // system
      const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches
      document.documentElement.classList.toggle('dark', isDark)
    }
  }, [theme])

  // Capture beforeinstallprompt
  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault()
      setInstallPrompt(e as { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> })
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const installApp = async () => {
    if (!installPrompt) {
      pushToast({ type: 'info', message: 'To install: use your browser menu → "Add to Home Screen" or "Install App".' })
      return
    }
    await installPrompt.prompt()
    const choice = await installPrompt.userChoice
    if (choice.outcome === 'accepted') {
      pushToast({ type: 'success', message: 'OHWASIS installed! Find it on your home screen.' })
      // Route based on account type
      if (session.user?.accountType === 'BUSINESS_OWNER') {
        setView('merchant')
      } else if (session.user?.accountType === 'PLATFORM_OPERATOR') {
        setView('admin')
      } else {
        setView('marketplace')
      }
    }
    setInstallPrompt(null)
  }

  const themeOptions: Array<{ value: 'light' | 'dark' | 'system'; label: string; icon: typeof Sun }> = [
    { value: 'light', label: 'Light', icon: Sun },
    { value: 'dark', label: 'Dark', icon: Moon },
    { value: 'system', label: 'System', icon: Monitor },
  ]

  const accountLabel = session.user?.accountType === 'BUSINESS_OWNER' ? 'Business Owner' : session.user?.accountType === 'PLATFORM_OPERATOR' ? 'Platform Operator' : 'Customer'
  const installLabel = session.user?.accountType === 'BUSINESS_OWNER' ? 'Install Business App' : session.user?.accountType === 'PLATFORM_OPERATOR' ? 'Install Admin App' : 'Install Customer App'
  const manifestUrl = session.user?.accountType === 'BUSINESS_OWNER' ? '/manifests/business.json' : session.user?.accountType === 'PLATFORM_OPERATOR' ? '/manifests/admin.json' : '/manifests/customer.json'

  // Dynamically set the manifest link based on user role
  useEffect(() => {
    const existing = document.querySelector('link[rel="manifest"]')
    if (existing) {
      existing.setAttribute('href', manifestUrl)
    } else {
      const link = document.createElement('link')
      link.rel = 'manifest'
      link.href = manifestUrl
      document.head.appendChild(link)
    }
    // Also update theme-color meta
    const themeColor = session.user?.accountType === 'BUSINESS_OWNER' ? '#a855f7' : session.user?.accountType === 'PLATFORM_OPERATOR' ? '#f59e0b' : '#06b6d4'
    const meta = document.querySelector('meta[name="theme-color"]')
    if (meta) meta.setAttribute('content', themeColor)
  }, [manifestUrl, session.user?.accountType])

  return (
    <div className="container mx-auto max-w-2xl px-4 py-6 pb-20 sm:pb-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">Customize your OHWASIS experience.</p>
      </div>

      {/* Account section */}
      <Card className="mb-4">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><UserIcon className="h-4 w-4" /> Account</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <div className="text-sm font-medium">{session.user?.name ?? session.user?.email}</div>
              <div className="text-xs text-muted-foreground">{session.user?.email}</div>
            </div>
            <Badge variant="outline" className="text-[10px]">{accountLabel}</Badge>
          </div>
          <Button variant="outline" className="w-full justify-between" onClick={() => setView('customer-profile')}>
            <span className="flex items-center gap-2"><UserIcon className="h-4 w-4" /> Edit profile</span>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </CardContent>
      </Card>

      {/* Appearance */}
      <Card className="mb-4">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><Sun className="h-4 w-4" /> Appearance</CardTitle>
          <CardDescription className="text-xs">Choose how OHWASIS looks to you.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-2">
            {themeOptions.map((opt) => {
              const Icon = opt.icon
              const isActive = theme === opt.value
              return (
                <button
                  key={opt.value}
                  onClick={() => setTheme(opt.value)}
                  className={cn(
                    'flex flex-col items-center gap-2 rounded-lg border p-3 transition-colors',
                    isActive ? 'border-primary bg-primary/5 text-primary' : 'border-border hover:bg-muted/50',
                  )}
                >
                  <Icon className="h-5 w-5" />
                  <span className="text-xs font-medium">{opt.label}</span>
                </button>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* Install App */}
      <Card className="mb-4">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><Download className="h-4 w-4" /> Install App</CardTitle>
          <CardDescription className="text-xs">
            Install OHWASIS as an app on your device — works offline, opens instantly, no browser needed.
            Detected your account type: <strong>{accountLabel}</strong>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={() => void installApp()} className="w-full">
            <Download className="mr-2 h-4 w-4" /> {installLabel}
          </Button>
          {!installPrompt && (
            <p className="mt-2 text-center text-[10px] text-muted-foreground">
              If the button doesn&apos;t work, use your browser menu → &quot;Add to Home Screen&quot;
            </p>
          )}
        </CardContent>
      </Card>

      {/* Notifications */}
      <Card className="mb-4">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><Bell className="h-4 w-4" /> Notifications</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <div className="text-sm font-medium">Order updates</div>
              <div className="text-xs text-muted-foreground">Get notified about order status changes</div>
            </div>
            <input type="checkbox" defaultChecked className="h-4 w-4" />
          </div>
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <div className="text-sm font-medium">Promotions</div>
              <div className="text-xs text-muted-foreground">Deals and offers from your favourite shops</div>
            </div>
            <input type="checkbox" defaultChecked className="h-4 w-4" />
          </div>
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <div className="text-sm font-medium">AI answers</div>
              <div className="text-xs text-muted-foreground">When AI answers your questions</div>
            </div>
            <input type="checkbox" className="h-4 w-4" />
          </div>
        </CardContent>
      </Card>

      {/* Other */}
      <Card className="mb-4">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><Globe className="h-4 w-4" /> General</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Button variant="outline" className="w-full justify-between" onClick={() => setView('support')}>
            <span className="flex items-center gap-2"><MessageSquare className="h-4 w-4" /> Customer Support</span>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="outline" className="w-full justify-between" onClick={() => setView('customer-orders')}>
            <span className="flex items-center gap-2"><Smartphone className="h-4 w-4" /> My orders</span>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="outline" className="w-full justify-between" onClick={() => window.open('/terms', '_blank')}>
            <span className="flex items-center gap-2"><Shield className="h-4 w-4" /> Terms &amp; Conditions</span>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="outline" className="w-full justify-between" onClick={() => window.open('/privacy', '_blank')}>
            <span className="flex items-center gap-2"><Shield className="h-4 w-4" /> Privacy Policy</span>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </CardContent>
      </Card>

      {/* Sign out */}
      <Card>
        <CardContent className="p-3">
          <Button variant="outline" className="w-full justify-center text-rose-600 hover:bg-rose-50 hover:text-rose-700" onClick={() => void logout()}>
            <LogOut className="mr-2 h-4 w-4" /> Sign out
          </Button>
        </CardContent>
      </Card>

      <p className="mt-6 text-center text-[10px] text-muted-foreground">
        OHWASIS v4.0 — Built by Aevibron
      </p>
    </div>
  )
}

import { Badge } from '@/components/ui/badge'
import { Store as StoreIcon } from 'lucide-react'
void StoreIcon // reserved
