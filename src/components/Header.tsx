'use client'

import Link from 'next/link'
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
import { LogOut, User as UserIcon, Settings, ShoppingBag, ShieldCheck, ChevronDown } from 'lucide-react'

export function Header() {
  const session = useOhwasisStore((s) => s.session)
  const setView = useOhwasisStore((s) => s.setView)
  const setAuthModal = useOhwasisStore((s) => s.setAuthModal)
  const logout = useOhwasisStore((s) => s.logout)

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border/60 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <div className="container mx-auto flex h-14 max-w-7xl items-center justify-between px-4">
        <button
          onClick={() => setView('landing')}
          className="flex items-center gap-2 transition-opacity hover:opacity-90"
          aria-label="OHWASIS home"
        >
          <BrandLockup size={26} />
        </button>

        <nav className="flex items-center gap-1 sm:gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setView('landing')}
            className="hidden sm:inline-flex"
          >
            Merchants
          </Button>

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
                  Signed in as
                  <div className="mt-0.5 truncate text-sm text-foreground">{session.user.email}</div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {session.memberships.length > 0 && (
                  <>
                    <DropdownMenuLabel className="text-xs text-muted-foreground">
                      Your merchants
                    </DropdownMenuLabel>
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
                  </>
                )}
                {session.isPlatformOperator && (
                  <DropdownMenuItem onClick={() => setView('admin')}>
                    <ShieldCheck className="mr-2 h-4 w-4" />
                    Platform admin
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={() => setView('landing')}>
                  <ShoppingBag className="mr-2 h-4 w-4" />
                  Browse storefronts
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => void logout()}>
                  <LogOut className="mr-2 h-4 w-4" />
                  Sign out
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

export function Footer() {
  return (
    <footer className="mt-auto border-t border-border/60 bg-muted/30">
      <div className="container mx-auto flex max-w-7xl flex-col gap-2 px-4 py-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <BrandLockup size={18} />
        </div>
        <div className="flex items-center gap-4">
          <Link href="#" onClick={(e) => e.preventDefault()} className="hover:text-foreground">
            Privacy
          </Link>
          <Link href="#" onClick={(e) => e.preventDefault()} className="hover:text-foreground">
            Terms
          </Link>
          <Link href="#" onClick={(e) => e.preventDefault()} className="hover:text-foreground">
            Security
          </Link>
          <span>© {new Date().getFullYear()} OHWASIS</span>
        </div>
        <div className="text-[10px]">
          One Hosted Web Architecture Serving Isolated Storefronts
        </div>
      </div>
    </footer>
  )
}
