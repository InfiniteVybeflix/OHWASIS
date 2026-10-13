'use client'

import { useEffect, useState } from 'react'

/**
 * Subscribe to the user's `prefers-reduced-motion` setting.
 *
 * Returns `true` when the user has requested reduced motion (in which case
 * all non-essential animations should be disabled). SSR-safe: returns
 * `false` on the first render and re-syncs after mount.
 *
 * This mirrors framer-motion's own `useReducedMotion` hook but is kept as a
 * standalone utility so it can be used in plain (non-framer) components too.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReduced(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])

  return reduced
}
