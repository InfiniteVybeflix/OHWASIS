'use client'

import { useOhwasisStore } from '@/lib/store'
import { BrandLockup, BrandMark } from '@/components/ohwasis/BrandMark'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Badge } from '@/components/ui/badge'
import { LogOut, ShoppingBag, Store, ShieldCheck, ChevronDown, User as UserIcon, Package, Settings as SettingsIcon, MessageSquare, Menu } from 'lucide-react'
import Link from 'next/link'

export function Header() {
  const session = useOhwasisStore((s) => s.session)
  const setView = useOhwasisStore((s) => s.setView)
  const setAuthModal = useOhwasisStore((s) => s.setAuthModal)
  const logout = useOhwasisStore((s) => s.logout)
  const view = useOhwasisStore((s) => s.view)

  const isCustomer = session.isCustomer && !session.isBusinessOwner
  const isBusinessOwner = session.isBusinessOwner

  return (
    <header className="sticky top-0 z-30 w-full border-b border-border/60 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-2 px-3 sm:px-4">
        {/* Left: Brand — compact on mobile (icon only), full on desktop */}
        <div className="flex items-center gap-1">
          {/* Hamburger / menu button — visible on mobile only */}
          {session.user && (
            <button
              onClick={() => setView('settings')}
              className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground sm:hidden"
              aria-label="Menu"
            >
              <Menu className="h-5 w-5" />
            </button>
          )}
          <button
            onClick={() => setView(isCustomer ? 'marketplace' : 'landing')}
            className="flex items-center gap-2 transition-opacity hover:opacity-90"
            aria-label="OHWASIS home"
          >
            {/* Compact: mark only on mobile, full lockup on sm+ */}
            <span className="sm:hidden">
              <BrandMark size={24} className="text-primary" />
            </span>
            <span className="hidden sm:flex">
              <BrandLockup size={24} />
            </span>
          </button>
        </div>

        {/* Right: Nav — hidden on mobile (use hamburger), visible on sm+ */}
        <nav className="flex items-center gap-1 sm:gap-2">
          {/* Customer nav — only visible on sm+ (mobile uses bottom nav + hamburger) */}
          {isCustomer && (
            <>
              <Button
                variant={view === 'marketplace' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setView('marketplace')}
                className="hidden sm:inline-flex"
              >
                <ShoppingBag className="mr-1 h-3.5 w-3.5" /> Marketplace
              </Button>
              {session.user && (
                <Button
                  variant={view === 'customer-orders' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setView('customer-orders')}
                  className="hidden md:inline-flex"
                >
                  <Package className="mr-1 h-3.5 w-3.5" /> Orders
                </Button>
              )}
            </>
          )}

          {/* Business owner nav */}
          {isBusinessOwner && !session.isPlatformOperator && (
            <Button
              variant={view === 'merchant' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setView('merchant')}
              className="hidden sm:inline-flex"
            >
              <Store className="mr-1 h-3.5 w-3.5" /> Dashboard
            </Button>
          )}

          {/* Platform operator nav */}
          {session.isPlatformOperator && (
            <Button
              variant={view === 'admin' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setView('admin')}
              className="hidden sm:inline-flex"
            >
              <ShieldCheck className="mr-1 h-3.5 w-3.5" /> Admin
            </Button>
          )}

          {/* User menu — compact on mobile (avatar only), full on desktop */}
          {session.user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="gap-1.5 px-2 sm:px-3">
                  {/* Mobile: avatar circle only */}
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-cyan-500 to-purple-600 text-xs font-bold text-white sm:hidden">
                    {session.user.name?.[0]?.toUpperCase() ?? session.user.email[0].toUpperCase()}
                  </span>
                  {/* Desktop: name + chevron */}
                  <span className="hidden sm:inline max-w-[120px] truncate">
                    {session.user.name ?? session.user.email.split('@')[0]}
                  </span>
                  <ChevronDown className="hidden h-3.5 w-3.5 sm:block" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64 max-w-[calc(100vw-1rem)]">
                <DropdownMenuLabel className="text-xs text-muted-foreground">
                  Signed in as{' '}
                  <Badge variant="outline" className="ml-1 text-[10px]">
                    {session.user.accountType?.replace('_', ' ').toLowerCase()}
                  </Badge>
                  <div className="mt-0.5 truncate text-sm text-foreground">{session.user.email}</div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />

                {/* Customer menu */}
                {isCustomer && (
                  <>
                    <DropdownMenuItem onClick={() => setView('marketplace')}>
                      <ShoppingBag className="mr-2 h-4 w-4" /> Marketplace
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setView('customer-orders')}>
                      <Package className="mr-2 h-4 w-4" /> My orders
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setView('customer-profile')}>
                      <UserIcon className="mr-2 h-4 w-4" /> Profile
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setView('support')}>
                      <MessageSquare className="mr-2 h-4 w-4" /> Support
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setView('settings')}>
                      <SettingsIcon className="mr-2 h-4 w-4" /> Settings
                    </DropdownMenuItem>
                  </>
                )}

                {/* Business owner menu */}
                {isBusinessOwner && (
                  <>
                    <DropdownMenuLabel className="text-xs text-muted-foreground">Your businesses</DropdownMenuLabel>
                    {session.memberships.map((m) => (
                      <DropdownMenuItem
                        key={m.tenant.id}
                        onClick={() => {
                          useOhwasisStore.getState().setActiveTenant(m.tenant.handle)
                          setView('merchant')
                        }}
                        className="justify-between"
                      >
                        <span className="truncate">{m.tenant.displayName}</span>
                        <span className="text-[10px] uppercase text-muted-foreground">{m.role.split('_')[0]}</span>
                      </DropdownMenuItem>
                    ))}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => setView('merchant')}>
                      <Store className="mr-2 h-4 w-4" /> Dashboard
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setView('support')}>
                      <MessageSquare className="mr-2 h-4 w-4" /> Support
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setView('settings')}>
                      <SettingsIcon className="mr-2 h-4 w-4" /> Settings
                    </DropdownMenuItem>
                  </>
                )}

                {/* Platform operator menu */}
                {session.isPlatformOperator && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel className="text-xs text-muted-foreground">Platform</DropdownMenuLabel>
                    <DropdownMenuItem onClick={() => setView('admin')}>
                      <ShieldCheck className="mr-2 h-4 w-4" /> Admin console
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setView('support')}>
                      <MessageSquare className="mr-2 h-4 w-4" /> Support
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setView('settings')}>
                      <SettingsIcon className="mr-2 h-4 w-4" /> Settings
                    </DropdownMenuItem>
                  </>
                )}

                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => void logout()}>
                  <LogOut className="mr-2 h-4 w-4" /> Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="sm" onClick={() => setAuthModal('login')} className="text-xs sm:text-sm">
                Sign in
              </Button>
              <Button size="sm" onClick={() => setAuthModal('signup')} className="text-xs sm:text-sm">
                Get started
              </Button>
            </div>
          )}
        </nav>
      </div>
    </header>
  )
}

export function Footer() {
  const setView = useOhwasisStore((s) => s.setView)
  const AEVIBRON_CONTACT = process.env.NEXT_PUBLIC_AEVIBRON_CONTACT_EMAIL || 'aevibron@gmail.com'
  return (
    <footer className="mt-auto border-t border-border/60 bg-muted/30">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-8 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <BrandMark size={20} className="text-primary" />
          <span className="font-semibold tracking-tight text-foreground">
            <span>OH</span><span className="text-primary">WASIS</span>
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <button onClick={() => setView('landing')} className="hover:text-foreground">Home</button>
          <button onClick={() => setView('marketplace')} className="hover:text-foreground">Marketplace</button>
          <a href="/terms" target="_blank" rel="noopener noreferrer" className="hover:text-foreground">Terms &amp; Conditions</a>
          <a href="/privacy" target="_blank" rel="noopener noreferrer" className="hover:text-foreground">Privacy</a>
          <a href={`mailto:${AEVIBRON_CONTACT}`} className="hover:text-foreground">{AEVIBRON_CONTACT}</a>
        </div>
        <div className="flex flex-col items-start gap-0.5 sm:items-end">
          <div>© {new Date().getFullYear()} OHWASIS</div>
          <div className="text-[10px]">V1.0.0 — Built by <a href={`mailto:${AEVIBRON_CONTACT}`} className="font-medium text-primary hover:underline">Aevibron</a></div>
        </div>
      </div>
    </footer>
  )
}
