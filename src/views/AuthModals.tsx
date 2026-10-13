'use client'

import { useState } from 'react'
import { useOhwasisStore, apiFetch } from '@/lib/store'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2, ShoppingBag, Store, User as UserIcon } from 'lucide-react'

export function AuthModals() {
  const authModal = useOhwasisStore((s) => s.authModal)
  const setAuthModal = useOhwasisStore((s) => s.setAuthModal)
  const refreshSession = useOhwasisStore((s) => s.refreshSession)
  const setView = useOhwasisStore((s) => s.setView)
  const pushToast = useOhwasisStore((s) => s.pushToast)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [accountType, setAccountType] = useState<'CUSTOMER' | 'BUSINESS_OWNER'>('CUSTOMER')
  const [loading, setLoading] = useState(false)

  const close = () => {
    setAuthModal(null)
    setEmail('')
    setPassword('')
    setName('')
    setAccountType('CUSTOMER')
  }

  const submit = async () => {
    if (loading) return
    setLoading(true)
    try {
      if (authModal === 'signup') {
        await apiFetch('/api/auth/signup', {
          method: 'POST',
          body: JSON.stringify({ email, password, name: name || undefined, accountType }),
        })
        pushToast({
          type: 'success',
          message:
            accountType === 'BUSINESS_OWNER'
              ? 'Account created. Let&apos;s set up your first business.'
              : 'Welcome to OHWASIS! Browse the marketplace to discover businesses.',
        })
      } else {
        await apiFetch('/api/auth/login', {
          method: 'POST',
          body: JSON.stringify({ email, password }),
        })
        pushToast({ type: 'success', message: 'Signed in.' })
      }
      await refreshSession()
      // Auto-route based on account type after signup
      if (authModal === 'signup') {
        if (accountType === 'BUSINESS_OWNER') {
          setView('merchant')
        } else {
          setView('marketplace')
        }
      }
      close()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Authentication failed'
      pushToast({ type: 'error', message })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={authModal !== null} onOpenChange={(o) => { if (!o) close() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {authModal === 'signup' ? 'Create your OHWASIS account' : 'Sign in to OHWASIS'}
          </DialogTitle>
          <DialogDescription>
            {authModal === 'signup'
              ? 'One account works across every OHWASIS-powered storefront. Choose your role below.'
              : 'Access your dashboard, orders, or marketplace.'}
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault()
            void submit()
          }}
        >
          {authModal === 'signup' && (
            <>
              <div>
                <Label>I am signing up as</Label>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setAccountType('CUSTOMER')}
                    className={`flex flex-col items-center gap-1 rounded-lg border p-3 transition-colors ${
                      accountType === 'CUSTOMER'
                        ? 'border-primary bg-primary/5 text-primary'
                        : 'border-border hover:bg-muted/50'
                    }`}
                  >
                    <ShoppingBag className="h-5 w-5" />
                    <span className="text-xs font-medium">Customer</span>
                    <span className="text-[10px] text-muted-foreground">Browse &amp; order</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setAccountType('BUSINESS_OWNER')}
                    className={`flex flex-col items-center gap-1 rounded-lg border p-3 transition-colors ${
                      accountType === 'BUSINESS_OWNER'
                        ? 'border-primary bg-primary/5 text-primary'
                        : 'border-border hover:bg-muted/50'
                    }`}
                  >
                    <Store className="h-5 w-5" />
                    <span className="text-xs font-medium">Business Owner</span>
                    <span className="text-[10px] text-muted-foreground">Open a shop</span>
                  </button>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="name">Name (optional)</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                  autoComplete="name"
                />
              </div>
            </>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={authModal === 'signup' ? 'At least 8 characters' : 'Your password'}
              autoComplete={authModal === 'signup' ? 'new-password' : 'current-password'}
            />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {authModal === 'signup'
              ? (accountType === 'BUSINESS_OWNER' ? 'Create business owner account' : 'Create customer account')
              : 'Sign in'}
          </Button>
          <div className="text-center text-xs text-muted-foreground">
            {authModal === 'signup' ? (
              <>
                Already have an account?{' '}
                <button
                  type="button"
                  className="text-primary hover:underline"
                  onClick={() => setAuthModal('login')}
                >
                  Sign in
                </button>
              </>
            ) : (
              <>
                No account?{' '}
                <button
                  type="button"
                  className="text-primary hover:underline"
                  onClick={() => setAuthModal('signup')}
                >
                  Get started
                </button>
              </>
            )}
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// Avoid unused-import warnings
void UserIcon

