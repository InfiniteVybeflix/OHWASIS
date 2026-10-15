// src/lib/api.ts — shared helpers for API route handlers.
import { NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { AuthorizationError } from '@/lib/session'
import { TenantResolutionError } from '@/lib/tenant'

export type ApiHandler = (req: Request, ctx: { params: Promise<Record<string, string>> }) => Promise<Response> | Response

/**
 * Wrap an API handler with consistent error handling: Zod validation,
 * authorization, tenant resolution, and unexpected errors.
 */
export function withErrorHandler<T extends ApiHandler>(handler: T): T {
  return (async (req: Request, ctx) => {
    try {
      return await handler(req, ctx)
    } catch (err) {
      if (err instanceof ZodError) {
        return NextResponse.json(
          { error: 'validation_error', details: err.flatten() },
          { status: 400 },
        )
      }
      if (err instanceof AuthorizationError) {
        const code = (err as Error & { code?: string }).code
        if (code === 'email_verification_required') {
          return NextResponse.json(
            { error: 'email_verification_required', message: 'Please verify your email to continue.' },
            { status: 403 },
          )
        }
        return NextResponse.json({ error: 'forbidden', message: err.message }, { status: 403 })
      }
      if (err instanceof TenantResolutionError) {
        return NextResponse.json({ error: 'tenant_not_found', message: err.message }, { status: 404 })
      }
      if (err instanceof Error) {
        const name = err.name
        // Schema-definition errors (e.g. zod v4 throws TypeError on
        // `z.record(z.unknown())` at parse time) — surface as 400 instead
        // of leaking as 500 internal_error so the client sees a useful error.
        if (name === 'TypeError' && err.message.includes('_zod')) {
          return NextResponse.json(
            { error: 'validation_error', message: 'Schema definition error' },
            { status: 400 },
          )
        }
        if (name === 'DarajaError' || name === 'AiProviderError') {
          return NextResponse.json({ error: 'provider_error', message: err.message }, { status: 502 })
        }
        // Prisma known errors
        if (name === 'PrismaClientKnownRequestError') {
          const code = (err as { code?: string }).code
          if (code === 'P2002') {
            return NextResponse.json(
              { error: 'conflict', message: 'A record with this unique field already exists' },
              { status: 409 },
            )
          }
          if (code === 'P2025') {
            return NextResponse.json({ error: 'not_found', message: 'Record not found' }, { status: 404 })
          }
        }
        // Log full stack in dev, generic in prod
        console.error('[api] unhandled', err)
        return NextResponse.json(
          { error: 'internal_error', message: process.env.NODE_ENV === 'production' ? 'Internal error' : err.message },
          { status: 500 },
        )
      }
      console.error('[api] unknown', err)
      return NextResponse.json({ error: 'internal_error' }, { status: 500 })
    }
  }) as T
}

export async function parseBody<T>(req: Request, schema: { parse: (d: unknown) => T }): Promise<T> {
  const json = await req.json().catch(() => {
    throw new Error('Invalid JSON body')
  })
  return schema.parse(json)
}

/**
 * Resolve query params (single value per key).
 */
export function queryParams(req: Request): URLSearchParams {
  return new URL(req.url).searchParams
}
