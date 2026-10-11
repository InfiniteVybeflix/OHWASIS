'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type ViewName = 'landing' | 'storefront' | 'merchant' | 'admin' | 'order-confirmation'

export interface UserDTO {
  id: string
  email: string
  name: string | null
  globalRole: number
  status: string
}

export interface TenantSummary {
  id: string
  handle: string
  displayName: string
  industry: string
  tagline?: string | null
  theme?: Record<string, string> | null
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

  // Order confirmation reference (set right after checkout)
  lastOrderReference: string | null
  setLastOrderReference: (ref: string | null) => void

  // Toast queue (simple in-memory)
  toasts: ToastMsg[]
  pushToast: (t: Omit<ToastMsg, 'id'>) => void
  dismissToast: (id: string) => void
}

const emptySession: SessionState = {
  user: null,
  tenant: null,
  membership: null,
  memberships: [],
  isPlatformOperator: false,
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
      setActiveTenant: (handle) => set({ activeTenantHandle: handle }),

      lastOrderReference: null,
      setLastOrderReference: (ref) => set({ lastOrderReference: ref }),

      toasts: [],
      pushToast: (t) => {
        const id = Math.random().toString(36).slice(2)
        set((s) => ({ toasts: [...s.toasts, { ...t, id }] }))
        setTimeout(() => {
          set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) }))
        }, 5000)
      },
      dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
    }),
    {
      name: 'ohwasis-store',
      // Only persist tenant handle (not session — session comes from cookie)
      partialize: (s) => ({ activeTenantHandle: s.activeTenantHandle, view: s.view }) as OhwasisState,
    },
  ),
)

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
