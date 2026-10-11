# OHWASIS — Architecture

## 1. Overview

OHWASIS is a multi-tenant commerce SaaS. The architecture is deliberately conservative: a single Next.js application talks to a single relational database, with tenant isolation enforced at the application layer (and, in production, additionally at the database layer via PostgreSQL row-level security).

Three product layers share one platform:

| Layer | Owner | Purpose |
|-------|-------|---------|
| Platform operating system | Platform operator | Merchant onboarding, platform config, AI access requests, audit, security events |
| Merchant operating system | Each merchant | Storefront config, products, orders, payments, AI, CMS, staff |
| Customer commerce experience | Customers | Browse, cart, checkout, order tracking |

## 2. Component boundaries

```
┌──────────────────────────────────────────────────────────────────┐
│                       Browser (SPA at /)                          │
│  Landing · Storefront · Cart · Checkout · Merchant Dashboard ·   │
│  Platform Admin                                                  │
└────────────────────────┬─────────────────────────────────────────┘
                         │ HTTPS + cookies
┌────────────────────────▼─────────────────────────────────────────┐
│              Next.js 16 (App Router) — /api/* routes             │
│  auth · tenants · products · cart · checkout · orders ·          │
│  payments (mpesa callback) · ai · pages · admin · dashboard      │
└────────────────────────┬─────────────────────────────────────────┘
                         │ Prisma Client (singleton)
┌────────────────────────▼─────────────────────────────────────────┐
│                     Database (SQLite in sandbox)                  │
│  User · Session · Tenant · Membership · Category · Product ·     │
│  Variant · Cart · Order · PaymentAttempt · Page · Discount ·     │
│  DeliveryZone · AiProviderConfig · AiAccessRequest ·              │
│  AuditEvent · Notification · WebhookEvent                         │
└──────────────────────────────────────────────────────────────────┘
```

External integrations:
- **Safaricom Daraja** (M-Pesa STK Push) — server-side only, callbacks received at `/api/payments/mpesa/callback`.
- **Aevibron Gateway** (AI chat completions) — server-side only, configured per-tenant or platform-wide.
- **SMTP** (optional, via nodemailer) — for email notifications.

## 3. Multi-tenant isolation strategy

### The decision

In a production deployment on Supabase / PostgreSQL, the primary isolation mechanism is **PostgreSQL Row-Level Security (RLS)** with `tenant_id` columns and policies that filter every row by `current_setting('app.tenant_id')`.

In this sandbox (SQLite), RLS is unavailable. We achieve **equivalent** isolation by:

1. **Schema-level:** every tenant-owned table has a non-null `tenantId` column (foreign key to `Tenant`).
2. **Application-level enforcement:** every Prisma query that touches tenant-owned data is wrapped by `tenantScoped(tenantId)` (see `src/lib/tenant.ts`), which returns `{ tenantId }` and is spread into the `where` clause.
3. **Object ownership checks:** whenever a route handler receives an object ID (e.g. `/api/products/[id]`), it loads the row, then calls `assertTenantOwns(row, tenantId)` to verify the row's `tenantId` matches the resolved tenant. A mismatch throws and is audit-logged as a security event.
4. **Server-side tenant resolution:** the tenant is resolved from the request (verified custom domain, or `x-ohwasis-tenant` header for merchant-dashboard calls, or tenant handle for storefront calls). **Never** from a client-provided `tenantId` body field.
5. **No service-role exposure:** the Prisma client is server-only; the browser never has direct database access.

### What this prevents

- Cross-tenant reads: every `findMany` is scoped by `tenantId`.
- Cross-tenant writes: every `create`/`update` carries the resolved `tenantId` in the data payload.
- ID substitution attacks: a merchant who supplies another tenant's product ID in the URL gets `assertTenantOwns` failure, not the other tenant's data.
- Cross-tenant payment configuration access: payment provider configs are looked up by `tenantId_provider` composite key.
- Cross-tenant AI request access: AI access requests are listed for the platform operator (cross-tenant by design) but never for individual merchants.

### Upgrade path to Supabase + RLS

1. Switch `datasource` in `prisma/schema.prisma` to PostgreSQL.
2. Run `prisma migrate dev` to apply the schema.
3. Enable RLS on every tenant-owned table: `ALTER TABLE ... ENABLE ROW LEVEL SECURITY;`
4. Create policies like:
   ```sql
   CREATE POLICY tenant_isolation ON products
     USING (tenant_id = current_setting('app.tenant_id', true)::text);
   ```
5. Set `app.tenant_id` per-request via a Prisma extension or middleware that reads the resolved tenant.
6. The application-layer `tenantScoped()` checks remain as defence-in-depth — they are NOT removed when RLS is enabled.

## 4. Authentication & authorization

### Authentication

- scrypt password hashing (built into Node; no bcrypt dependency).
- Session tokens are 256-bit random hex; stored in `Session` table with expiry, IP, user-agent.
- Cookies are `HttpOnly`, `SameSite=Lax`, `Secure` when on HTTPS.
- Sessions are revocable (`revokedAt` timestamp). Disabled-user logins are refused at the auth check.
- Rate limit: 20 login attempts per IP per minute (in-memory; in production move to Redis).

### Authorization

Server-side enforced via the helpers in `src/lib/session.ts`:

| Helper | Throws if |
|--------|----------|
| `requireUser(ctx)` | No session |
| `requirePlatformOperator(ctx)` | `globalRole < 2` |
| `requireTenantMembership(ctx, [roles])` | No membership in active tenant, or role not in allowlist |
| `requireMinRole(ctx, role)` | Role rank below threshold |

Role hierarchy (merchant): `OWNER > ADMINISTRATOR > {ORDER_MANAGER, CATALOG_MANAGER} > CONTENT_EDITOR > FULFILLMENT_STAFF > ANALYST`.

## 5. Commerce lifecycle

```
Product (DRAFT → ACTIVE → ARCHIVED)
  ↓ added to Cart
Cart
  ↓ checkout (server-side total validation)
Order (PENDING → CONFIRMED → PROCESSING → OUT_FOR_DELIVERY → DELIVERED → COMPLETED)
  ↓ payment attempt
PaymentAttempt (PENDING → SUCCESS | FAILED | CANCELLED)
  ↓ callback (Daraja) or manual verification (merchant)
Order marked CONFIRMED only when a SUCCESS PaymentAttempt exists
```

### Atomic checkout

Checkout runs in a single Prisma transaction (`prisma.$transaction`) that:

1. Re-validates every product is ACTIVE and belongs to the resolved tenant.
2. Re-validates stock availability for each line item.
3. Re-computes unit prices from the authoritative `Product.basePrice` + `Variant.priceDelta` — the browser-submitted price is NOT trusted.
4. Applies the delivery zone fee (validated against tenant's zones).
5. Applies the discount code (validated against tenant's discounts, with usage limit enforcement).
6. Computes the final total.
7. Creates the `Order` + `OrderItem` snapshots.
8. Decrements stock atomically (`decrement` Prisma operator).
9. Increments discount usage count.
10. Clears the cart.
11. Records an `OrderEvent` of type `CREATED`.

If any step fails, the entire transaction rolls back.

### Order snapshots

`OrderItem` stores `name`, `variantName`, `sku`, `unitPrice`, `quantity`, `lineTotal`, and a JSON `snapshot` of the product/variant at order time. When the merchant later changes a product's price or archives it, historical orders remain accurate.

## 6. M-Pesa Daraja integration

See `PAYMENTS.md` for the full flow. Key points:

- STK Push initiated server-side only via `src/lib/providers/mpesa-daraja.ts`.
- Daraja credentials stored encrypted at rest (`PaymentProviderConfig.encryptedConfig`, AES-256-GCM).
- Callback endpoint `/api/payments/mpesa/callback` is idempotent: duplicate callbacks for the same `CheckoutRequestID` are deduplicated via the `WebhookEvent.idempotencyKey` unique index.
- Amount is cross-checked: if the callback's `Amount` does not match the order's expected total, the payment is marked `FAILED` and the order stays `PENDING`.
- A successful HTTP response from `/stkpush` does **NOT** mark payment as paid. Only the callback's `ResultCode === 0` does.

## 7. AI integration

`src/lib/ai/provider.ts` is provider-neutral. The recommended provider is **Aevibron Gateway** (auth: `X-Aevibron-Key` header). OpenAI-compatible providers (auth: `Authorization: Bearer`) and Anthropic (auth: `x-api-key`) are also supported.

### Tenant permission

Any active merchant member can use the AI assistant for content drafting. The tenant must have an enabled `AiProviderConfig`, OR the platform must have `AEVIBRON_GATEWAY_KEY` set as a fallback.

### Data minimisation

Prompts are sanitised (`sanitisePrompt` in `src/app/api/ai/chat/route.ts`) to redact credit-card-like numbers, M-Pesa PIN references, and Kenyan national-ID-like 8-digit numbers before being sent to the provider.

### AI output is untrusted

AI output is never used to authorise refunds, change payment state, execute SQL, or alter permissions. It is text returned to the merchant UI for review.

## 8. Configurable administrative routes

Each tenant has an `adminRouteSlug` (random 12-hex string) that can be used to construct a non-obvious admin route. In a production deployment with multiple page routes, this would form part of the admin URL (e.g. `/admin/{slug}/dashboard`). The slug is collision-resistant (96 bits of entropy).

Obscurity is NOT security — it is a defence-in-depth convenience. Real authorization is enforced server-side regardless of route.

## 9. Sandbox constraint — single user-visible route

The dev sandbox only exposes the `/` route to the user. The entire OHWASIS experience is therefore a Zustand-driven SPA at `/`, with the following views switched in/out:

| View | When shown |
|------|-----------|
| `landing` | Default; marketing + merchant directory |
| `storefront` | When `activeTenantHandle` is set and user clicks a merchant |
| `merchant` | When logged-in user has an active membership |
| `admin` | When logged-in user has `globalRole >= 2` |
| `order-confirmation` | After successful checkout |

All backend logic lives in `/api/*` routes. In a production deployment you would split these into a conventional `/dashboard/merchant/[handle]/...` and `/dashboard/platform/...` route tree; the API contracts do not change.

## 10. Background jobs & webhooks

Vercel serverless functions do not support long-running background workers. OHWASIS handles this by:

- **Synchronous** order creation, payment initiation, AI calls (all < 60s).
- **Webhook-driven** payment verification (Daraja calls back to `/api/payments/mpesa/callback`).
- **In-transaction** notification dispatch (notifications are persisted in the same DB transaction as the order; if the email provider is unavailable, the record is `FAILED` rather than dropped).

For scheduled tasks (e.g. abandoned-cart recovery, daily revenue summaries), the production deployment should add a managed cron service (Vercel Cron, Railway, Render Cron, AWS EventBridge). The codebase already persists enough state to support these without schema changes.

## 11. File layout

```
prisma/schema.prisma                 — full multi-tenant commerce schema
scripts/seed-admin.ts               — bootstrap platform operator + demo merchants
src/app/page.tsx                     — SPA entry point
src/app/api/                          — all backend routes (auth, tenants, products,
                                       cart, checkout, orders, payments, ai, pages,
                                       admin, dashboard, notifications, storefront)
src/lib/db.ts                         — Prisma singleton
src/lib/tenant.ts                     — tenant context + tenantScoped + assertTenantOwns
src/lib/session.ts                    — auth, sessions, authorization helpers
src/lib/crypto.ts                     — AES-256-GCM encrypt/decrypt for secrets
src/lib/audit.ts                      — persistent audit logger
src/lib/api.ts                        — withErrorHandler + parseBody + queryParams
src/lib/providers/mpesa-daraja.ts     — Daraja STK Push + callback parsing
src/lib/ai/provider.ts                — provider-neutral AI chat client
src/lib/notifications/index.ts        — durable notification dispatch (SMTP/IN_APP)
src/lib/validation/schemas.ts         — zod schemas for every API input
src/lib/store.ts                      — Zustand client store + apiFetch wrapper
src/views/*.tsx                       — landing, storefront, merchant, admin, auth, order
src/components/ohwasis/*.tsx          — merchant dashboard tabs
src/components/Header.tsx             — top nav + footer
src/components/ohwasis/BrandMark.tsx  — original OHWASIS brand mark
```
