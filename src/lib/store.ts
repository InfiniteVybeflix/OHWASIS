'use client'

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

// sonner is imported lazily to avoid SSR issues — the toast function is only
// called in the browser when pushToast is invoked, never during SSR.
let sonnerToast: { success: (msg: string) => void; error: (msg: string) => void; info?: (msg: string) => void } | null = null
async function getSonner() {
  if (!sonnerToast) {
    try {
      const mod = await import('sonner')
      sonnerToast = mod.toast
    } catch {
      sonnerToast = null
    }
  }
  return sonnerToast
}

export type ViewName =
  | 'landing' | 'storefront' | 'merchant' | 'admin' | 'order-confirmation'
  | 'marketplace' | 'customer-profile' | 'customer-orders' | 'store-profile'
  | 'cart' | 'categories' | 'wishlist' | 'recently-viewed' | 'addresses'
  | 'promotions' | 'product-detail' | 'settings' | 'support' | 'onboarding'

/** Active product for the product-detail view. */
export interface ActiveProduct {
  productId: string
  tenantHandle: string
}

export interface UserDTO {
  id: string
  email: string
  name: string | null
  globalRole: number
  status: string
  accountType?: string
  /** ISO datetime string if verified, null if unverified. */
  emailVerified?: string | null
}

export interface TenantSummary {
  id: string
  handle: string
  displayName: string
  industry: string
  tagline?: string | null
  theme?: Record<string, string> | null
  openStatus?: string
}

export interface MembershipDTO {
  role: string
  status: string
  tenant: TenantSummary
}

export interface SessionState {
  user: UserDTO | null
  tenant: TenantSummary | null
  membership: { role: string; status: string } | null
  memberships: MembershipDTO[]
  isPlatformOperator: boolean
  isBusinessOwner: boolean
  isCustomer: boolean
  /** True when the user must verify their email (admin is exempt). */
  emailVerificationRequired: boolean
}

export interface ToastMsg {
  id: string
  type: 'success' | 'error' | 'info'
  message: string
}

interface OhwasisState {
  // View / nav
  view: ViewName
  setView: (v: ViewName) => void

  // Auth modal state
  authModal: 'login' | 'signup' | null
  setAuthModal: (m: 'login' | 'signup' | null) => void

  // Session
  session: SessionState
  setSession: (s: SessionState) => void
  refreshSession: () => Promise<void>
  logout: () => Promise<void>

  // Active tenant (for merchant dashboard / storefront switcher)
  activeTenantHandle: string | null
  setActiveTenant: (handle: string | null) => void

  // Active product for product detail view
  activeProduct: ActiveProduct | null
  setActiveProduct: (p: ActiveProduct | null) => void

  // Order confirmation reference
  lastOrderReference: string | null
  setLastOrderReference: (ref: string | null) => void

  // Payment details from checkout (for the confirmation page)
  lastPaymentInfo: { status: string; message: string; tillNumber?: string; paybillNumber?: string; accountName?: string; bankName?: string; accountNumber?: string; instructions?: string } | null
  setLastPaymentInfo: (info: OhwasisState['lastPaymentInfo']) => void

  // Toast queue — uses sonner under the hood
  toasts: ToastMsg[]
  pushToast: (t: Omit<ToastMsg, 'id'>) => void
  dismissToast: (id: string) => void

  // Theme
  theme: 'light' | 'dark' | 'system'
  setTheme: (t: 'light' | 'dark' | 'system') => void
}

const emptySession: SessionState = {
  user: null,
  tenant: null,
  membership: null,
  memberships: [],
  isPlatformOperator: false,
  isBusinessOwner: false,
  isCustomer: true,
  emailVerificationRequired: false,
}

export const useOhwasisStore = create<OhwasisState>()(
  persist(
    (set, get) => ({
      view: 'landing',
      setView: (v) => set({ view: v }),

      authModal: null,
      setAuthModal: (m) => set({ authModal: m }),

      session: emptySession,
      setSession: (s) => set({ session: s }),
      refreshSession: async () => {
        try {
          const res = await fetch('/api/auth/me', { credentials: 'same-origin' })
          if (!res.ok) {
            set({ session: emptySession })
            return
          }
          const data = await res.json()
          set({ session: data })
        } catch {
          set({ session: emptySession })
        }
      },
      logout: async () => {
        try {
          await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' })
        } catch {
          /* ignore */
        }
        set({ session: emptySession, view: 'landing' })
      },

      activeTenantHandle: null,
      setActiveTenant: (handle) => {
        set({ activeTenantHandle: handle })
        // Also set a cookie so server-side code (getRequestContext) can read it
        if (typeof document !== 'undefined') {
          if (handle) {
            document.cookie = `ohwasis_active_tenant=${encodeURIComponent(handle)}; Path=/; Max-Age=${60 * 60 * 24 * 365}; SameSite=Lax`
          } else {
            document.cookie = 'ohwasis_active_tenant=; Path=/; Max-Age=0; SameSite=Lax'
          }
        }
      },

      activeProduct: null,
      setActiveProduct: (p) => set({ activeProduct: p }),

      lastOrderReference: null,
      setLastOrderReference: (ref) => set({ lastOrderReference: ref }),

      lastPaymentInfo: null,
      setLastPaymentInfo: (info) => set({ lastPaymentInfo: info }),

      toasts: [],
      pushToast: (t) => {
        // Use sonner — lazy-loaded to avoid SSR issues
        getSonner().then((toast) => {
          if (!toast) return
          if (t.type === 'success') toast.success(t.message)
          else if (t.type === 'error') toast.error(t.message)
          else toast.success(t.message)
        }).catch(() => { /* ignore */ })
      },
      dismissToast: () => { /* sonner handles dismissal automatically */ },

      theme: 'system',
      setTheme: (t) => {
        set({ theme: t })
        applyTheme(t)
      },
    }),
    {
      name: 'ohwasis-store',
      storage: createJSONStorage(() => {
        // Guard against SSR (no localStorage during SSR)
        if (typeof window === 'undefined') {
          return {
            getItem: () => null,
            setItem: () => {},
            removeItem: () => {},
          }
        }
        return localStorage
      }),
      // Only persist specific fields — not session (session comes from cookie)
      partialize: (s) => ({
        activeTenantHandle: s.activeTenantHandle,
        view: s.view,
        theme: s.theme,
      }),
      // Skip hydration to prevent SSR/CSR mismatch — we manually hydrate in page.tsx
      skipHydration: true,
    },
  ),
)

/** Apply theme to the document — called on setTheme and on initial load */
function applyTheme(theme: 'light' | 'dark' | 'system') {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  const isDark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  root.classList.toggle('dark', isDark)
}

/**
 * Fetch wrapper that auto-attaches credentials and parses JSON.
 * Throws on non-2xx with a structured error.
 *
 * Automatically includes the active tenant handle (from the persisted store)
 * as the `x-ohwasis-tenant` header. This is how merchant-dashboard API calls
 * are scoped to the right tenant without each caller having to pass it
 * explicitly. Callers can override with `tenantHandle: null` to suppress.
 */
export async function apiFetch<T = unknown>(
  url: string,
  opts?: RequestInit & { tenantHandle?: string | null },
): Promise<T> {
  const { tenantHandle, ...rest } = opts ?? {}
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(opts?.headers as Record<string, string> | undefined),
  }
  // Resolve tenant handle: explicit > store state
  const resolvedHandle =
    tenantHandle !== undefined
      ? tenantHandle ?? null
      : (useOhwasisStore.getState().activeTenantHandle ?? null)
  if (resolvedHandle) {
    headers['x-ohwasis-tenant'] = resolvedHandle
  }
  const res = await fetch(url, {
    ...rest,
    credentials: 'same-origin',
    headers,
  })
  const text = await res.text()
  const data = text ? JSON.parse(text) : null
  if (!res.ok) {
    const err = data as { error?: string; message?: string }
    const e = new Error(err?.message || err?.error || `Request failed (${res.status})`)
    ;(e as Error & { status?: number; code?: string }).status = res.status
    ;(e as Error & { status?: number; code?: string }).code = err?.error
    throw e
  }
  return data as T
}
