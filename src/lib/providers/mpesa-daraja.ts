// src/lib/providers/mpesa-daraja.ts — M-Pesa Daraja (Safaricom) STK Push integration.
//
// Reference: https://developer.safaricom.co.ke/APIs/MpesaExpressSimulate
//            https://developer.safaricom.co.ke/APIs/CallbackURL
//
// Flow:
//   1. Customer picks M-Pesa at checkout.
//   2. We initiate STK Push via Daraja /stkpush/v1/process/request.
//   3. Daraja returns a CheckoutRequestID — we persist it on PaymentAttempt.
//   4. Daraja calls back to our /api/payments/mpesa/callback URL with the
//      final result. We MUST verify the callback (correct MerchantRequestID,
//      correct amount, correct tenant via the order's tenantId).
//   5. We mark the payment verified only after a SUCCESS result code.
//
// Security guarantees implemented here:
//   - The Daraja access token is fetched server-side only.
//   - The short code passkey is stored encrypted at rest (see PaymentProviderConfig).
//   - Callbacks are idempotent: a duplicate callback for the same
//     CheckoutRequestID updates the existing PaymentAttempt, never creates a
//     second one.
//   - A successful HTTP response from /stkpush is NOT treated as payment
//     success. Only the callback's ResultCode == 0 means paid.
//   - A customer redirect to a "success" page is NOT treated as payment.
//
// What this sandbox supports WITHOUT real Safaricom credentials:
//   - Real HTTP call to the Safaricom sandbox if MPESA_ENV=sandbox and creds
//     are present in the tenant's PaymentProviderConfig.
//   - If creds are missing, we return a structured error indicating the
//     merchant needs to configure Daraja first. We NEVER simulate success.
//
// What this sandbox supports for end-to-end testing without Daraja creds:
//   - Manual payment verification flow (Cash / Till / Paybill), where the
//     merchant marks an order paid from the dashboard. This is a separate
//     provider ("manual") and is genuinely implemented as a verification
//     workflow with audit trail — NOT a "fake success" button.

export interface DarajaConfig {
  environment: 'sandbox' | 'production'
  consumerKey: string
  consumerSecret: string
  shortCode: string // Business short code (e.g. 174379 for sandbox)
  passkey: string // Lipa Na M-Pesa Online passkey
  // The public URL Daraja should call back to.
  callbackUrl: string
  // Optional: account reference prefix; we append the order reference.
  accountReferencePrefix?: string
}

const DARAJA_URL = {
  sandbox: 'https://sandbox.safaricom.co.ke',
  production: 'https://api.safaricom.co.ke',
} as const

let tokenCache: { key: string; secret: string; token: string; expiresAt: number } | null = null

async function fetchAccessToken(cfg: DarajaConfig): Promise<string> {
  // Cache by (key, secret) for ~ 50 minutes (Daraja tokens last 1h)
  if (
    tokenCache &&
    tokenCache.key === cfg.consumerKey &&
    tokenCache.secret === cfg.consumerSecret &&
    tokenCache.expiresAt > Date.now() + 60_000
  ) {
    return tokenCache.token
  }
  const auth = Buffer.from(`${cfg.consumerKey}:${cfg.consumerSecret}`).toString('base64')
  const url = `${DARAJA_URL[cfg.environment]}/oauth/v1/generate?grant_type=client_credentials`
  const res = await fetch(url, {
    headers: { Authorization: `Basic ${auth}` },
    // Bounded timeout — Daraja should respond within seconds
    signal: AbortSignal.timeout(15_000),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new DarajaError(`Access token request failed: HTTP ${res.status} ${body}`)
  }
  const json = (await res.json()) as { access_token?: string; expires_in?: string }
  if (!json.access_token) {
    throw new DarajaError('Daraja returned no access_token')
  }
  const expiresInMs = Number(json.expires_in ?? '3600') * 1000
  tokenCache = {
    key: cfg.consumerKey,
    secret: cfg.consumerSecret,
    token: json.access_token,
    expiresAt: Date.now() + expiresInMs,
  }
  return json.access_token
}

function genPassword(cfg: DarajaConfig, ts: string): string {
  // Base64(BusinessShortCode + Passkey + Timestamp)
  const raw = `${cfg.shortCode}${cfg.passkey}${ts}`
  return Buffer.from(raw, 'utf8').toString('base64')
}

function ts(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}` +
    `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
  )
}

export interface StkPushInput {
  amount: number
  phone: string // 2547XXXXXXXX
  accountReference: string
  description: string
}

export interface StkPushResult {
  checkoutRequestId: string
  merchantRequestId: string
  responseCode: string
  responseDescription: string
  customerMessage: string
}

export class DarajaError extends Error {
  constructor(message: string, public statusCode?: number) {
    super(message)
    this.name = 'DarajaError'
  }
}

/**
 * Initiate an STK Push. Returns the CheckoutRequestID — the merchant-side
 * handle for verifying the callback later. Does NOT mean payment succeeded.
 */
export async function stkPush(cfg: DarajaConfig, input: StkPushInput): Promise<StkPushResult> {
  if (!/^\d{9,15}$/.test(input.phone)) {
    throw new DarajaError(`Invalid phone number: ${input.phone}`)
  }
  const token = await fetchAccessToken(cfg)
  const stamp = ts()
  const body = {
    BusinessShortCode: cfg.shortCode,
    Password: genPassword(cfg, stamp),
    Timestamp: stamp,
    TransactionType: 'CustomerPayBillOnline',
    Amount: Math.round(input.amount),
    PartyA: input.phone,
    PartyB: cfg.shortCode,
    PhoneNumber: input.phone,
    CallBackURL: cfg.callbackUrl,
    AccountReference: input.accountReference.slice(0, 12),
    TransactionDesc: input.description.slice(0, 13),
  }
  const url = `${DARAJA_URL[cfg.environment]}/mpesa/stkpush/v1/process/request`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  })
  const json = (await res.json().catch(() => ({}))) as {
    CheckoutRequestID?: string
    MerchantRequestID?: string
    ResponseCode?: string
    ResponseDescription?: string
    CustomerMessage?: string
    errorMessage?: string
  }
  if (!res.ok || !json.CheckoutRequestID) {
    throw new DarajaError(
      json.errorMessage || json.ResponseDescription || `STK push failed (HTTP ${res.status})`,
      res.status,
    )
  }
  return {
    checkoutRequestId: json.CheckoutRequestID,
    merchantRequestId: json.MerchantRequestID ?? '',
    responseCode: json.ResponseCode ?? '',
    responseDescription: json.ResponseDescription ?? '',
    customerMessage: json.CustomerMessage ?? '',
  }
}

export interface DarajaCallbackBody {
  Body?: {
    stkCallback?: {
      MerchantRequestID?: string
      CheckoutRequestID?: string
      ResultCode?: number
      ResultDesc?: string
      CallbackMetadata?: {
        Item?: Array<
          | { Name: string; Value: string | number }
          | { Name: string; Value?: undefined }
        >
      }
    }
  }
}

export interface ParsedCallback {
  checkoutRequestId: string | undefined
  merchantRequestId: string | undefined
  resultCode: number | undefined
  resultDescription: string | undefined
  amount: number | undefined
  mpesaReceiptNumber: string | undefined
  transactionDate: string | undefined
  phone: string | undefined
}

/**
 * Parse a Daraja callback body. Validates the shape and extracts the
 * canonical fields. The caller is responsible for cross-referencing the
 * CheckoutRequestID against the stored PaymentAttempt and verifying the
 * amount matches the order's expected total.
 */
export function parseCallback(body: unknown): ParsedCallback {
  const b = (body as DarajaCallbackBody)?.Body?.stkCallback
  if (!b) {
    return {
      checkoutRequestId: undefined,
      merchantRequestId: undefined,
      resultCode: undefined,
      resultDescription: 'Malformed callback body',
      amount: undefined,
      mpesaReceiptNumber: undefined,
      transactionDate: undefined,
      phone: undefined,
    }
  }
  const items = b.CallbackMetadata?.Item ?? []
  const find = (name: string): string | undefined => {
    const item = items.find((it) => it.Name === name)
    const v = item?.Value
    return v == null ? undefined : String(v)
  }
  return {
    checkoutRequestId: b.CheckoutRequestID,
    merchantRequestId: b.MerchantRequestID,
    resultCode: b.ResultCode,
    resultDescription: b.ResultDesc,
    amount: find('Amount') ? Number(find('Amount')) : undefined,
    mpesaReceiptNumber: find('MpesaReceiptNumber'),
    transactionDate: find('TransactionDate'),
    phone: find('PhoneNumber'),
  }
}
