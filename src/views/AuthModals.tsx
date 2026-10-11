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
import { Loader2 } from 'lucide-react'

export function AuthModals() {
  const authModal = useOhwasisStore((s) => s.authModal)
  const setAuthModal = useOhwasisStore((s) => s.setAuthModal)
  const refreshSession = useOhwasisStore((s) => s.refreshSession)
  const pushToast = useOhwasisStore((s) => s.pushToast)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)

  const close = () => {
    setAuthModal(null)
    setEmail('')
    setPassword('')
    setName('')
  }

  const submit = async () => {
    if (loading) return
    setLoading(true)
    try {
      if (authModal === 'signup') {
        await apiFetch('/api/auth/signup', {
          method: 'POST',
          body: JSON.stringify({ email, password, name: name || undefined }),
        })
        pushToast({ type: 'success', message: 'Account created. Welcome to OHWASIS!' })
      } else {
        await apiFetch('/api/auth/login', {
          method: 'POST',
          body: JSON.stringify({ email, password }),
        })
        pushToast({ type: 'success', message: 'Signed in.' })
      }
      await refreshSession()
      close()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Authentication failed'
      pushToast({ type: 'error', message: msg })
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
              ? 'One account works across every OHWASIS-powered storefront and merchant dashboard.'
              : 'Access your merchant dashboards and customer orders.'}
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
            {authModal === 'signup' ? 'Create account' : 'Sign in'}
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
