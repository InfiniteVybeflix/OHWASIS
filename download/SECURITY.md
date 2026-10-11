# OHWASIS — Security Model

This document describes the security model of OHWASIS, the threat surface, what is verified, and how to report a vulnerability.

## 1. Threat model

OHWASIS is multi-tenant SaaS where the primary adversary is a malicious or compromised merchant account attempting to read or modify another merchant's data. Secondary threats include customer-account compromise, payment fraud, and platform-operator compromise.

### Threats we explicitly defend against

- **Cross-tenant data access** via ID substitution in URLs/bodies.
- **Cross-tenant payment configuration access** (merchant reading another's Daraja credentials).
- **Client-side price / total / quantity manipulation** at checkout.
- **Forged or replayed M-Pesa callbacks**.
- **Stock race conditions** (two customers buying the last item simultaneously).
- **Duplicate order submission** (browser back-button after checkout).
- **Privilege escalation** (catalogue manager becoming administrator).
- **Disabled-account access** (fired staff member still logged in).
- **XSS via merchant-supplied CMS HTML**.
- **Secret leakage** in logs, error messages, client bundles, source maps.
- **AI prompt injection** leading to unauthorised actions.
- **CSRF on state-changing endpoints** (cookies are `SameSite=Lax`; all mutations require JSON body which browsers do not auto-send cross-origin).

### Threats we partially mitigate

- **Brute-force login** — in-memory rate limit (20/min/IP). Production should use Redis-backed distributed rate limiting.
- **DDoS** — handled by Vercel edge in production.
- **Supply-chain compromise** — `bun install` is reproducible via lockfile; CI should run `bun audit` (not yet wired in this sandbox build).

### Threats out of scope for this build

- **Physical access to database host.** Mitigated by cloud provider controls in production.
- **Insider threat from platform operator.** All operator actions are audit-logged; the audit log is append-only. A determined operator with DB access can always bypass application-level controls — this is why RLS at the DB layer matters in production.

## 2. Authentication

- **Password hashing:** scrypt (N=16384, r=8, p=1, 64-byte output, 16-byte salt). scrypt is resistant to GPU/ASIC brute-force. Constant-time compare on verification.
- **Password requirements:** minimum 8 characters. No maximum complexity rules (they harm more than they help — see NIST 800-63B).
- **Session tokens:** 256-bit cryptographically-random hex. Stored in `Session` table with `expiresAt` (14 days), `ip`, `userAgent`, `revokedAt`. Revocation is immediate (next request checks `revokedAt`).
- **Cookies:** `HttpOnly`, `SameSite=Lax`, `Secure` in production, `Max-Age=14d`.
- **Disabled-account login:** refused at the auth check (`status !== 'ACTIVE'`). Existing sessions of disabled users are also rejected at every subsequent request.

### MFA

Not yet implemented. The schema has an `mfaSecret` column on `User` for future TOTP-based MFA. The plan: platform operators and merchant owners get MFA required; staff can opt-in. Recovery codes generated at enrollment.

## 3. Authorization

Server-side enforced. Hiding a button in the UI is **not** authorization.

### Roles

| Role | Scope | Rank |
|------|-------|------|
| `PLATFORM_OPERATOR` (globalRole=2) | Platform | — |
| `OWNER` | Tenant | 6 |
| `ADMINISTRATOR` | Tenant | 5 |
| `ORDER_MANAGER` / `CATALOG_MANAGER` | Tenant | 4 |
| `CONTENT_EDITOR` | Tenant | 3 |
| `FULFILLMENT_STAFF` | Tenant | 2 |
| `ANALYST` | Tenant | 1 |
| Customer | (no merchant role) | 0 |

Enforcement helpers in `src/lib/session.ts`:
- `requireUser(ctx)` — throws if no session.
- `requirePlatformOperator(ctx)` — throws if `globalRole < 2`.
- `requireTenantMembership(ctx, [roles])` — throws if no active membership, or role not in allowlist.
- `requireMinRole(ctx, role)` — throws if role rank below threshold.

### What authorization prevents

- Horizontal privilege escalation: a `CATALOG_MANAGER` cannot call `PATCH /api/orders/[id]` (requires `ORDER_MANAGER`+).
- Vertical privilege escalation: an `ANALYST` cannot create products (requires `CATALOG_MANAGER`+).
- Cross-tenant: a merchant's staff cannot see another merchant's data (enforced via `tenantScoped()` + `assertTenantOwns()`).

## 4. Tenant isolation

See `ARCHITECTURE.md` §3 for the full strategy. The key invariants:

1. Every tenant-owned table has a non-null `tenantId`.
2. Every query is wrapped by `tenantScoped(tenantId)` which injects `{ tenantId }` into the `where` clause.
3. Every object-level access verifies ownership via `assertTenantOwns(row, tenantId)`.
4. Tenant is resolved server-side (verified domain, `x-ohwasis-tenant` header, or storefront handle). **Never** from a client body field.
5. Audit events record the resolved `tenantId`, `actorId`, `action`, `ip`, `userAgent`.

### Cross-tenant attack tests we recommend

Run these as part of QA:

1. Login as merchant A's owner. Try `GET /api/products/[product-of-merchant-B]` → expect 404.
2. Login as merchant A. Try `POST /api/products` with `tenantId` field of merchant B in body → expect the field to be ignored (we use the resolved tenant, not the body).
3. Submit a checkout with `productId` from another tenant → expect 400 `product_unavailable`.
4. Submit an M-Pesa callback with `CheckoutRequestID` from another tenant's payment attempt → expect amount mismatch (different order total).

## 5. Cryptography

### Secrets at rest

- Payment provider credentials (Daraja consumer key/secret, passkey) are stored as AES-256-GCM encrypted blobs in `PaymentProviderConfig.encryptedConfig`.
- AI provider API keys are stored as AES-256-GCM encrypted blobs in `AiProviderConfig.encryptedConfig`.
- The master key is sourced from `MASTER_ENCRYPTION_KEY` env (32-byte hex or base64). In production this MUST be a KMS-managed key. The sandbox falls back to a deterministic dev-only key with a console warning — this is unsafe for production.

### Passwords

- scrypt (one-way). Passwords are never recoverable; reset flow only.

### Cookies

- HttpOnly (no JS access). SameSite=Lax (CSRF defence). Secure in production.

### CSRF

- All mutations require a JSON body, which browsers do not auto-send cross-origin.
- SameSite=Lax cookies are not sent on cross-site POST.
- No CSRF token needed for JSON-only APIs.

## 6. Input validation

- Every API route validates its body via zod schemas (`src/lib/validation/schemas.ts`).
- Phone numbers are normalised (strip non-digits, normalise leading 0 to 254 for Kenyan numbers).
- Emails are lowercased and length-bounded.
- IDs are validated as cuid() format.
- Slugs are validated against `^[a-z0-9-]+$`.
- HTML (CMS body) is sanitised server-side before save: strips `<script>`, `<iframe>`, `<object>`, `<embed>`, `<form>`, all `on*` handlers, `javascript:` URLs, `data:` URLs, and `style` attributes that could contain `expression()`.

## 7. Payment security

### M-Pesa Daraja

- STK Push initiated server-side only. Customer never sees the credentials.
- Callbacks verified: `CheckoutRequestID` must match a stored `PaymentAttempt`; amount must match the order total.
- Idempotent: duplicate callbacks deduplicated via `WebhookEvent.idempotencyKey`.
- A successful HTTP response from `/stkpush` is NOT treated as payment success.
- A customer redirect to a "success" page is NOT treated as payment success.
- Only `ResultCode === 0` in the callback marks a payment `SUCCESS` and transitions the order to `CONFIRMED`.

### Manual / COD

- Merchant must explicitly verify from dashboard (audit-logged).
- `OrderEvent` of type `PAYMENT_VERIFIED` is recorded with the verifier's identity, the receipt, and any notes.

### What we never do

- Never store an M-Pesa PIN.
- Never expose credentials to the browser.
- Never let a client mark its own payment as verified.
- Never claim "payment received" if it was only queued.

## 8. AI security

### Tenant permission

AI calls require an active tenant membership. Without one, `/api/ai/chat` returns 403.

### Data minimisation

Prompts are sanitised (`sanitisePrompt`) to redact credit-card-like numbers, M-Pesa PIN references, and 8-digit national-ID-like numbers before being sent to the provider.

### Untrusted output

AI output is never:
- Used to authorise refunds or change payment state.
- Used to execute SQL or modify data.
- Used to alter access permissions.

It is text returned to the merchant UI for human review.

## 9. Logging & audit

- Every sensitive operation is recorded in `AuditEvent` (append-only, never deleted).
- Each event records: `tenantId`, `actorId`, `action`, `category`, `targetType`, `targetId`, `metadata` (JSON), `ip`, `userAgent`, `createdAt`.
- Secrets are never written to logs. The audit `metadata` field is scrubbed of credential values.
- Console logs in production are limited to `error` and `warn` (see `src/lib/db.ts`).
- Structured logging is the production target (e.g. Vercel's Log Drain to a SIEM).

## 10. Security headers (production)

When deployed to Vercel, configure `next.config.ts` to emit:

- `Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline'; ...`
- `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: geolocation=(), microphone=(), camera=()`

This sandbox does not include these headers because the dev server runs on localhost; they would block legitimate dev tooling.

## 11. Dependency security

- `bun install` is reproducible via `bun.lock`.
- Production CI should run `bun audit` on every PR.
- Dependencies are pinned to caret ranges; minor upgrades reviewed manually.
- No `postinstall` scripts from untrusted packages are allowed.

## 12. Reporting a vulnerability

If you discover a security vulnerability in OHWASIS:

1. **DO NOT** open a public GitHub issue.
2. Email the platform operator directly (the email is configured via `SECURITY_CONTACT_EMAIL` env).
3. Include: description, reproduction steps, affected versions, suggested fix (if any).
4. You will receive an acknowledgement within 48 hours and a fix timeline within 7 days.

We follow responsible disclosure. Finders are credited (with permission) in the changelog.

## 13. What this build does NOT claim

- "No vulnerabilities exist anywhere." No finite test suite can prove that.
- "Compliant with PCI-DSS / GDPR / Kenya DPA." Compliance requires legal review of data flows, retention policies, and contractual terms — not just code.
- "M-Pesa Daraja is fully tested end-to-end." The integration code is real but not exercised against live Safaricom sandbox in this build (no Daraja credentials). See `IMPLEMENTATION_STATUS.md`.

The security model above describes what is **verified** in this build, what is **architecturally defended**, and what is **honestly not yet done**.
