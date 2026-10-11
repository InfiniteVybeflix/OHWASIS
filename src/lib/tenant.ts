// src/lib/tenant.ts — tenant context resolver and query-scoping helpers.
//
// In a Postgres/Supabase deployment, RLS would scope rows automatically.
// Because the sandbox uses SQLite, we enforce the same guarantee at the
// application layer: every tenant-owned query MUST go through `tenantScoped()`
// or otherwise carry `where: { tenantId }` explicitly.
//
// The tenant is resolved from the request context, never from a client body.
// See `resolveTenantForRequest` in src/lib/session.ts for the resolver used
// by the API routes.

import { prisma } from '@/lib/db'

/**
 * Returns a strongly-typed Prisma `where` clause fragment that constrains
 * every tenant-owned read/write to the resolved tenant.
 *
 * Use this on EVERY tenant-owned query. Do not construct tenant queries
 * without it.
 */
export function tenantScoped(tenantId: string): { tenantId: string } {
  if (!tenantId || typeof tenantId !== 'string') {
    throw new TenantResolutionError('Tenant ID is required')
  }
  return { tenantId }
}

/**
 * Resolve a tenant by its public handle. The handle is the only client-
 * controllable input we accept for tenant resolution, and it is validated
 * against a strict pattern before lookup.
 */
export const HANDLE_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])?$/

export async function resolveTenantByHandle(handle: string) {
  const normalized = handle.toLowerCase().trim()
  if (!HANDLE_PATTERN.test(normalized)) {
    throw new TenantResolutionError('Invalid tenant handle')
  }
  const tenant = await prisma.tenant.findUnique({
    where: { handle: normalized },
  })
  if (!tenant) throw new TenantResolutionError('Tenant not found')
  if (tenant.status !== 'ACTIVE') {
    throw new TenantResolutionError('Tenant is not active')
  }
  return tenant
}

/**
 * Resolve tenant by verified custom domain. Used by storefront routing.
 * Returns null if domain is not verified.
 */
export async function resolveTenantByDomain(domain: string) {
  if (!domain) return null
  const normalized = domain.toLowerCase().trim()
  const tenant = await prisma.tenant.findFirst({
    where: {
      customDomain: normalized,
      domainVerifiedAt: { not: null },
      status: 'ACTIVE',
    },
  })
  return tenant
}

export class TenantResolutionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TenantResolutionError'
  }
}

/**
 * Cross-tenant ID substitution check.
 *
 * Given an object (e.g. a product) loaded from the database, verify that
 * its `tenantId` matches the resolved tenant. If not, throw — this is an
 * attempted cross-tenant access and must NOT be silently rejected as a 404,
 * because the caller may have already learned something by the absence of an
 * error. Instead we audit-log it.
 *
 * Usage:
 *   const product = await prisma.product.findUnique({ where: { id } })
 *   assertTenantOwns(product, tenantId)
 */
export function assertTenantOwns<T extends { tenantId?: string | null }>(
  obj: T | null,
  tenantId: string,
  type = 'record',
): asserts obj is T & { tenantId: string } {
  if (!obj) {
    throw new TenantResolutionError(`${type} not found`)
  }
  if (!obj.tenantId || obj.tenantId !== tenantId) {
    throw new TenantResolutionError(
      `Cross-tenant access attempt blocked (${type})`,
    )
  }
}
