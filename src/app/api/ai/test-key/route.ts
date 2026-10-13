import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getRequestContext, requireTenantMembership, requireMinRole } from '@/lib/session'
import { withErrorHandler, parseBody } from '@/lib/api'
import { z } from 'zod'

const testKeySchema = z.object({
  provider: z.string(),
  baseUrl: z.string().url(),
  apiKey: z.string().min(1),
  authScheme: z.enum(['x-aevibron-key', 'bearer', 'x-api-key']),
})

/**
 * POST /api/ai/test-key
 *
 * Tests an AI provider API key by fetching the available models list.
 * Does NOT save anything — this is a pre-save validation step.
 *
 * For OpenAI-compatible APIs (including Aevibron Gateway): GET /models
 * For Anthropic: hardcoded list (Anthropic doesn't have a /models endpoint)
 *
 * Returns { models: string[], ok: true } on success.
 */
export const POST = withErrorHandler(async (req) => {
  const ctx = await getRequestContext(req)
  const { tenant } = requireTenantMembership(ctx)
  requireMinRole(ctx, 'ADMINISTRATOR')
  const input = await parseBody(req, testKeySchema)

  const url = `${input.baseUrl.replace(/\/$/, '')}/models`
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  switch (input.authScheme) {
    case 'x-aevibron-key':
      headers['X-Aevibron-Key'] = input.apiKey
      break
    case 'bearer':
      headers['Authorization'] = `Bearer ${input.apiKey}`
      break
    case 'x-api-key':
      headers['x-api-key'] = input.apiKey
      headers['anthropic-version'] = '2023-06-01'
      break
  }

  // For Anthropic, there's no /models endpoint — return a known list
  if (input.provider === 'anthropic' || input.authScheme === 'x-api-key') {
    return NextResponse.json({
      ok: true,
      models: [
        'claude-3-5-sonnet-20241022',
        'claude-3-5-haiku-20241022',
        'claude-3-opus-20240229',
      ],
      note: 'Anthropic models (hardcoded — Anthropic has no /models endpoint)',
    })
  }

  const res = await fetch(url, {
    headers,
    signal: AbortSignal.timeout(15_000),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    return NextResponse.json(
      {
        error: 'test_failed',
        message: `API returned HTTP ${res.status}: ${body.slice(0, 200)}`,
        status: res.status,
      },
      { status: 400 },
    )
  }

  const json = (await res.json()) as {
    data?: Array<{ id: string }>
    models?: Array<{ id: string }>
  }

  // OpenAI format: { data: [{ id: "gpt-4o" }, ...] }
  // Some gateways: { models: [{ id: "..." }, ...] }
  const models = (json.data ?? json.models ?? []).map((m) => m.id).filter(Boolean)

  if (models.length === 0) {
    return NextResponse.json({
      ok: true,
      models: [],
      message: 'API key valid, but no models returned. Enter model names manually.',
    })
  }

  return NextResponse.json({
    ok: true,
    models: models.sort(),
    count: models.length,
  })
})

void prisma // reserved
