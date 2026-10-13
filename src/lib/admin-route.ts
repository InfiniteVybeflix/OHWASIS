// src/lib/admin-route.ts — obscured admin route resolution.
//
// The platform operator portal is reachable only via an admin-route prefix
// stored in env (ADMIN_ROUTE_SLUG). If the env is unset, a fallback slug is
// used (clearly logged). The slug is checked against the URL query parameter
// `?admin=<slug>` since this sandbox exposes only the `/` route — in a
// multi-page deployment the slug would form part of the path (e.g. `/secret-panel-xyz/dashboard`).
//
// This is obscurity, NOT security. Real authorization (requirePlatformOperator)
// is enforced on every admin API call regardless of route.

export const ADMIN_ROUTE_FALLBACK = 'admin-panel'

export function getAdminRouteSlug(): string {
  const env = process.env.ADMIN_ROUTE_SLUG
  if (env && env.length >= 8 && /^[a-z0-9-]+$/i.test(env)) {
    return env
  }
  if (process.env.NODE_ENV === 'production' && !env) {
    console.warn(
      '[ohwasis.admin-route] ADMIN_ROUTE_SLUG env not set — using insecure fallback. Set it in production.',
    )
  }
  return ADMIN_ROUTE_FALLBACK
}

export function isAdminRouteRequest(url: URL): boolean {
  const slug = getAdminRouteSlug()
  return url.searchParams.get('admin') === slug
}

/**
 * Generate a new admin route slug suggestion (for first-time setup).
 * Returns a 16-char random hex string.
 */
export function suggestAdminRouteSlug(): string {
  const bytes = new Uint8Array(8)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}
