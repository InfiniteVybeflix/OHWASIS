'use client'

import { useEffect, useState } from 'react'
import { useOhwasisStore } from '@/lib/store'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from '@/components/ui/sheet'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Separator } from '@/components/ui/separator'
import {
  Menu,
  Home,
  Grid3x3,
  Package,
  Heart,
  User as UserIcon,
  Tag,
  Settings,
  Sun,
  Moon,
  Monitor,
  Info,
  FileText,
  Shield,
  LogOut,
  ChevronRight,
  Sparkles,
} from 'lucide-react'
import { cn } from '@/lib/utils'

type ThemePref = 'light' | 'dark' | 'system'

interface NavLink {
  label: string
  icon: typeof Home
  view?: Parameters<ReturnType<typeof useOhwasisStore.getState>['setView']>[0]
  href?: string
  onClick?: () => void
}

/**
 * Hamburger menu — slide-out navigation drawer from the left.
 *
 * Triggered by a ☰ button at the top-left of the customer-facing marketplace.
 * Closes on outside click, on Escape, and after navigation.
 *
 * Theme toggle is a 3-way segmented control (light / dark / system) persisted
 * to localStorage and applied via the `dark` class on <html>.
 */
export function HamburgerMenu() {
  const [open, setOpen] = useState(false)
  const [theme, setTheme] = useState<ThemePref>('system')

  const session = useOhwasisStore((s) => s.session)
  const setView = useOhwasisStore((s) => s.setView)
  const setAuthModal = useOhwasisStore((s) => s.setAuthModal)
  const logout = useOhwasisStore((s) => s.logout)
  const pushToast = useOhwasisStore((s) => s.pushToast)

  // Load theme once on mount (lazy init would be cleaner but localStorage is
  // not available during SSR — so we read in a one-shot effect).
  useEffect(() => {
    if (typeof window === 'undefined') return
    const stored = (localStorage.getItem('ohwasis_theme') as ThemePref | null) ?? 'system'
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTheme(stored)
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const root = document.documentElement
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => {
      const isDark = theme === 'dark' || (theme === 'system' && mq.matches)
      root.classList.toggle('dark', isDark)
    }
    apply()
    if (theme === 'system') {
      mq.addEventListener('change', apply)
      return () => mq.removeEventListener('change', apply)
    }
  }, [theme])

  const setThemePref = (t: ThemePref) => {
    setTheme(t)
    if (typeof window !== 'undefined') localStorage.setItem('ohwasis_theme', t)
  }

  const navigate = (view: Parameters<typeof setView>[0]) => {
    setOpen(false)
    setView(view)
  }

  const mainLinks: NavLink[] = [
    { label: 'Home', icon: Home, view: 'marketplace' },
    { label: 'Categories', icon: Grid3x3, view: 'categories' },
    { label: 'My Orders', icon: Package, view: 'customer-orders' },
    { label: 'My Wishlist', icon: Heart, view: 'customer-profile' },
    { label: 'My Account', icon: UserIcon, view: 'customer-profile' },
    { label: 'Promotions', icon: Tag, view: 'marketplace' },
  ]

  const footerLinks: Array<{ label: string; icon: typeof Info; href: string; external?: boolean }> = [
    { label: 'About', icon: Info, href: '/#about' },
    { label: 'Terms', icon: FileText, href: '/terms' },
    { label: 'Privacy', icon: Shield, href: '/privacy' },
  ]

  const user = session.user
  const initials = user?.name?.[0]?.toUpperCase() ?? user?.email?.[0]?.toUpperCase() ?? '?'

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          'inline-flex h-10 w-10 items-center justify-center rounded-lg',
          'border border-border/60 bg-background text-foreground',
          'transition-colors hover:bg-accent',
        )}
        aria-label="Open menu"
      >
        <Menu className="h-5 w-5" />
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="flex w-80 flex-col gap-0 p-0 sm:max-w-sm">
          {/* Header: identity */}
          <SheetHeader className="border-b border-border/60 bg-gradient-to-br from-cyan-500/10 via-background to-purple-500/10 p-4">
            <SheetTitle className="sr-only">Navigation menu</SheetTitle>
            {user ? (
              <button
                type="button"
                onClick={() => navigate('customer-profile')}
                className="flex items-center gap-3 text-left"
              >
                <Avatar className="h-12 w-12 border">
                  <AvatarFallback className="bg-gradient-to-br from-cyan-500 to-purple-600 text-base font-bold text-white">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">
                    {user.name ?? user.email.split('@')[0]}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    {user.email}
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </button>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  <span className="text-sm font-semibold">Welcome to OHWASIS</span>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1"
                    onClick={() => { setOpen(false); setAuthModal('login') }}
                  >
                    Sign in
                  </Button>
                  <Button
                    size="sm"
                    className="flex-1"
                    onClick={() => { setOpen(false); setAuthModal('signup') }}
                  >
                    Get started
                  </Button>
                </div>
              </div>
            )}
          </SheetHeader>

          {/* Main nav links */}
          <nav className="flex-1 overflow-y-auto">
            <ul className="p-2">
              {mainLinks.map((link) => {
                const Icon = link.icon
                return (
                  <li key={link.label}>
                    <button
                      type="button"
                      onClick={() => link.view && navigate(link.view)}
                      className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors hover:bg-accent"
                    >
                      <Icon className="h-4 w-4 text-muted-foreground" />
                      <span className="flex-1 text-left">{link.label}</span>
                      <ChevronRight className="h-4 w-4 text-muted-foreground/50" />
                    </button>
                  </li>
                )
              })}
            </ul>

            <Separator />

            {/* Theme toggle */}
            <div className="p-2">
              <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Theme
              </div>
              <div className="grid grid-cols-3 gap-1 px-2 pb-2">
                <ThemeButton
                  active={theme === 'light'}
                  onClick={() => setThemePref('light')}
                  icon={Sun}
                  label="Light"
                />
                <ThemeButton
                  active={theme === 'dark'}
                  onClick={() => setThemePref('dark')}
                  icon={Moon}
                  label="Dark"
                />
                <ThemeButton
                  active={theme === 'system'}
                  onClick={() => setThemePref('system')}
                  icon={Monitor}
                  label="System"
                />
              </div>
            </div>

            <Separator />

            {/* Settings + auth */}
            <ul className="p-2">
              <li>
                <button
                  type="button"
                  onClick={() => navigate('customer-profile')}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors hover:bg-accent"
                >
                  <Settings className="h-4 w-4 text-muted-foreground" />
                  <span className="flex-1 text-left">Settings</span>
                </button>
              </li>
              {user && (
                <li>
                  <button
                    type="button"
                    onClick={() => {
                      setOpen(false)
                      void logout()
                      pushToast({ type: 'info', message: 'Signed out' })
                    }}
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-rose-600 transition-colors hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/20"
                  >
                    <LogOut className="h-4 w-4" />
                    <span className="flex-1 text-left">Sign out</span>
                  </button>
                </li>
              )}
            </ul>
          </nav>

          <SheetFooter className="border-t border-border/60 p-2">
            <ul className="grid grid-cols-3 gap-1">
              {footerLinks.map((link) => {
                const Icon = link.icon
                return (
                  <li key={link.label}>
                    <a
                      href={link.href}
                      target={link.external ? '_blank' : undefined}
                      rel={link.external ? 'noopener noreferrer' : undefined}
                      className="flex flex-col items-center gap-1 rounded-lg px-2 py-2 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    >
                      <Icon className="h-3.5 w-3.5" />
                      <span>{link.label}</span>
                    </a>
                  </li>
                )
              })}
            </ul>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  )
}

function ThemeButton({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean
  onClick: () => void
  icon: typeof Sun
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex flex-col items-center gap-1 rounded-md border px-1 py-2 text-[10px] font-medium transition-colors',
        active
          ? 'border-primary bg-primary/10 text-primary'
          : 'border-border/60 text-muted-foreground hover:bg-accent',
      )}
      aria-pressed={active}
    >
      <Icon className="h-3.5 w-3.5" />
      <span>{label}</span>
    </button>
  )
}
