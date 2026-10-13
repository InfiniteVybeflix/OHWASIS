'use client'

import { useOhwasisStore } from '@/lib/store'
import { BrandLockup } from '@/components/ohwasis/BrandMark'
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
import { LogOut, ShoppingBag, Store, ShieldCheck, ChevronDown, User as UserIcon, Package, Sparkles } from 'lucide-react'
import Link from 'next/link'
import { BrandMark } from '@/components/ohwasis/BrandMark'

export function Header() {
  const session = useOhwasisStore((s) => s.session)
  const setView = useOhwasisStore((s) => s.setView)
  const setAuthModal = useOhwasisStore((s) => s.setAuthModal)
  const logout = useOhwasisStore((s) => s.logout)
  const setActiveTenant = useOhwasisStore((s) => s.setActiveTenant)
  const view = useOhwasisStore((s) => s.view)

  const isCustomer = session.isCustomer && !session.isBusinessOwner
  const isBusinessOwner = session.isBusinessOwner

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border/60 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <div className="container mx-auto flex h-14 max-w-7xl items-center justify-between px-4">
        <button
          onClick={() => setView(isCustomer ? 'marketplace' : 'landing')}
          className="flex items-center gap-2 transition-opacity hover:opacity-90"
          aria-label="OHWASIS home"
        >
          <BrandLockup size={26} />
        </button>

        <nav className="flex items-center gap-1 sm:gap-2">
          {/* Customer navigation */}
          {isCustomer && (
            <>
              <Button
                variant={view === 'marketplace' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setView('marketplace')}
              >
                <ShoppingBag className="mr-1 h-3.5 w-3.5" /> Marketplace
              </Button>
              {session.user && (
                <>
                  <Button
                    variant={view === 'customer-orders' ? 'default' : 'ghost'}
                    size="sm"
                    onClick={() => setView('customer-orders')}
                    className="hidden sm:inline-flex"
                  >
                    <Package className="mr-1 h-3.5 w-3.5" /> Orders
                  </Button>
                </>
              )}
            </>
          )}

          {/* Business owner navigation — NOT for platform operators (they use Admin console) */}
          {isBusinessOwner && !session.isPlatformOperator && (
            <Button
              variant={view === 'merchant' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setView('merchant')}
            >
              <Store className="mr-1 h-3.5 w-3.5" /> Dashboard
            </Button>
          )}

          {/* Platform operator navigation */}
          {session.isPlatformOperator && (
            <Button
              variant={view === 'admin' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setView('admin')}
            >
              <ShieldCheck className="mr-1 h-3.5 w-3.5" /> Admin
            </Button>
          )}

          {session.user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="gap-2">
                  <span className="hidden sm:inline">
                    {session.user.name ?? session.user.email.split('@')[0]}
                  </span>
                  <ChevronDown className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="text-xs text-muted-foreground">
                  Signed in as <Badge variant="outline" className="ml-1 text-[10px]">{session.user.accountType?.replace('_', ' ').toLowerCase()}</Badge>
                  <div className="mt-0.5 truncate text-sm text-foreground">{session.user.email}</div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />

                {/* Customer menu items */}
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
                  </>
                )}

                {/* Business owner menu items */}
                {isBusinessOwner && (
                  <>
                    <DropdownMenuLabel className="text-xs text-muted-foreground">Your businesses</DropdownMenuLabel>
                    {session.memberships.map((m) => (
                      <DropdownMenuItem
                        key={m.tenant.id}
                        onClick={() => {
                          setActiveTenant(m.tenant.handle)
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
                  </>
                )}

                {/* Platform operator menu items */}
                {session.isPlatformOperator && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel className="text-xs text-muted-foreground">Platform</DropdownMenuLabel>
                    <DropdownMenuItem onClick={() => setView('admin')}>
                      <ShieldCheck className="mr-2 h-4 w-4" /> Admin console
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
            <>
              <Button variant="ghost" size="sm" onClick={() => setAuthModal('login')}>
                Sign in
              </Button>
              <Button size="sm" onClick={() => setAuthModal('signup')}>
                Get started
              </Button>
            </>
          )}
        </nav>
      </div>
    </header>
  )
}

// Avoid unused-import warnings

export function Footer() {
  const setView = useOhwasisStore((s) => s.setView)
  const AEVIBRON_CONTACT = process.env.NEXT_PUBLIC_AEVIBRON_CONTACT_EMAIL || 'aevibron@gmail.com'
  return (
    <footer className="mt-auto border-t border-border/60 bg-muted/30">
      <div className="container mx-auto flex max-w-7xl flex-col gap-3 px-4 py-8 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
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
