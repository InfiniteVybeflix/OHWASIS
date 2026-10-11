// src/lib/ai/provider.ts — provider-neutral AI client.
//
// The recommended provider is Aevibron Gateway. The base URL is configurable
// via AEVIBRON_GATEWAY_URL (env). The current preferred chat endpoint is:
//   https://Aevibron-gateway.vercel.app/api/v1/chat
//
// The gateway accepts the header `X-Aevibron-Key: <key>`. Other providers
// (OpenAI-compatible) use `Authorization: Bearer <key>` instead — see the
// `authScheme` field below.
//
// All calls are made server-side only. Merchant/customer data is sent to the
// AI provider only when the merchant has explicitly configured the provider
// and the prompt is built from authorised, tenant-scoped data. AI output is
// treated as untrusted: it is never used to authorise refunds, change payment
// state, or execute SQL. See SECURITY.md §AI.

export type AuthScheme = 'x-aevibron-key' | 'bearer' | 'x-api-key'

export interface AiProviderConfigDTO {
  provider: string // 'aevibron' | 'openai' | 'anthropic' | ...
  baseUrl: string
  apiKey: string
  defaultModel: string
  authScheme: AuthScheme
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface ChatRequest {
  model: string
  messages: ChatMessage[]
  temperature?: number
  maxTokens?: number
}

export interface ChatResponse {
  text: string
  model: string
  usage?: {
    promptTokens?: number
    completionTokens?: number
    totalTokens?: number
  }
  raw: unknown
}

export class AiProviderError extends Error {
  constructor(message: string, public statusCode?: number) {
    super(message)
    this.name = 'AiProviderError'
  }
}

/**
 * Send a chat completion request to the configured provider.
 *
 * Supports:
 *  - Aevibron Gateway (default; auth header X-Aevibron-Key)
 *  - OpenAI-compatible APIs (auth header Authorization: Bearer)
 *  - Generic X-Api-Key schemes (e.g. Anthropic)
 *
 * The request body is sent as JSON `{ model, messages, temperature?, max_tokens? }`
 * which matches OpenAI's chat-completion shape. Aevibron Gateway accepts the
 * same shape.
 */
export async function chatComplete(cfg: AiProviderConfigDTO, req: ChatRequest): Promise<ChatResponse> {
  if (!cfg.apiKey) {
    throw new AiProviderError('AI provider API key is not configured')
  }
  const url = `${cfg.baseUrl.replace(/\/$/, '')}/chat`
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  switch (cfg.authScheme) {
    case 'x-aevibron-key':
      headers['X-Aevibron-Key'] = cfg.apiKey
      break
    case 'bearer':
      headers['Authorization'] = `Bearer ${cfg.apiKey}`
      break
    case 'x-api-key':
      headers['x-api-key'] = cfg.apiKey
      headers['anthropic-version'] = '2023-06-01'
      break
  }
  const body = {
    model: req.model || cfg.defaultModel,
    messages: req.messages,
    temperature: req.temperature ?? 0.4,
    max_tokens: req.maxTokens ?? 800,
  }
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  })
  const json = (await res.json().catch(() => ({}))) as {
    choices?: Array<{ message?: { content?: string } }>
    content?: Array<{ text?: string }>
    model?: string
    usage?: Record<string, number>
    error?: { message?: string; type?: string }
    message?: string
  }
  if (!res.ok) {
    throw new AiProviderError(
      json.error?.message || json.message || `AI request failed (HTTP ${res.status})`,
      res.status,
    )
  }
  // OpenAI-style response
  const text =
    json.choices?.[0]?.message?.content ??
    json.content?.[0]?.text ??
    ''
  if (!text) {
    throw new AiProviderError('AI provider returned an empty response')
  }
  return {
    text,
    model: json.model ?? req.model,
    usage: {
      promptTokens: json.usage?.['prompt_tokens'],
      completionTokens: json.usage?.['completion_tokens'],
      totalTokens: json.usage?.['total_tokens'],
    },
    raw: json,
  }
}

/**
 * Recommended defaults for the Aevibron Gateway.
 */
export const AEVIBRON_DEFAULTS = {
  provider: 'aevibron',
  baseUrl: process.env.AEVIBRON_GATEWAY_URL || 'https://Aevibron-gateway.vercel.app/api/v1',
  authScheme: 'x-aevibron-key' as AuthScheme,
  defaultModel: 'aevibron-default',
  models: ['aevibron-default'],
  contactEmail: process.env.AEVIBRON_CONTACT_EMAIL || 'aevibron@gmail.com',
}
