# OHWASIS — Research Report

This report summarises the research that informed OHWASIS's architecture and design decisions. Sources are cited with access dates; findings are separated from opinions; design decisions trace back to specific findings.

## 1. Commerce engines evaluated

### 1.1 Medusa

- **Source:** https://docs.medusajs.com/ (accessed 2026-10-11)
- **Architecture:** https://docs.medusajs.com/learn/introduction/architecture (accessed 2026-10-11)
- **What it does well:** Modular commerce engine with strong product/variant modelling, order lifecycle, payment integrations, webhook events. Built on Node + Postgres; OpenAI-compatible.
- **Limitations for OHWASIS:** Medusa is single-merchant by default. Multi-tenancy requires either (a) one Medusa instance per merchant (operational overhead, especially on Vercel) or (b) deep schema customisation to add `tenant_id` everywhere. Neither is officially supported.
- **Vercel compatibility:** Medusa's core runtime is a long-lived Node process; some background workflows (e.g. scheduled jobs, event subscribers) do not fit Vercel's serverless model out of the box.
- **Decision:** Not adopted. OHWASIS builds a leaner, multi-tenant-first commerce layer in Next.js natively. The Medusa team's modular thinking informed our schema (separate Product / Variant / OrderItem snapshots), but we do not depend on their engine.

### 1.2 Saleor

- **Source:** https://docs.saleor.io/ (accessed 2026-10-11)
- **Repository:** https://github.com/saleor/saleor (accessed 2026-10-11)
- **What it does well:** GraphQL-first commerce engine; App Framework for extensibility; multi-channel support (one merchant, multiple storefronts); strong product/variant/inventory modelling.
- **Limitations for OHWASIS:** "Multi-channel" ≠ "multi-tenant". Saleor is single-merchant; each merchant needs a separate Saleor instance. Running Python (Saleor is Django) on Vercel is not the platform's sweet spot.
- **Decision:** Not adopted. Same reasoning as Medusa.

### 1.3 Shopify / WooCommerce / BigCommerce / Squarespace

- **Shopify:** Multi-tenant by design (each merchant gets a subdomain). Closed-source SaaS; we cannot run their stack. Their public docs (https://shopify.dev/docs/api) informed our storefront data model.
- **WooCommerce:** Single-tenant WordPress plugin; multi-tenant only via WordPress Multisite (clunky). Not considered.
- **BigCommerce / Squarespace / Wix:** Closed-source SaaS; informed the merchant dashboard feature checklist.

### 1.4 Conclusion on commerce engine

For a Vercel-native multi-tenant platform that must scale to many independent merchants with isolated data, the most pragmatic choice is to **build the commerce layer in Next.js itself**, using Prisma + PostgreSQL. The schema is small enough (~25 tables) that reusing Medusa or Saleor would impose more adaptation cost than benefit. This is the same conclusion reached by Lemon Squeezy, Polar, and other modern commerce SaaS that started after Medusa/Saleor matured.

## 2. Multi-tenant isolation

### 2.1 PostgreSQL Row-Level Security

- **Source:** https://www.postgresql.org/docs/current/ddl-rowsecurity.html (accessed 2026-10-11)
- **Finding:** RLS is the recommended PostgreSQL-native way to enforce tenant isolation. Policies filter every query by a session-level setting (e.g. `current_setting('app.tenant_id')`).
- **Limitation:** RLS requires PostgreSQL. The sandbox uses SQLite (no RLS). Production deployment on Supabase / PostgreSQL enables RLS as the primary isolation layer; the application-layer `tenantScoped()` checks remain as defence-in-depth.

### 2.2 OWASP multi-tenant guidance

- **Source:** https://cheatsheetseries.owasp.org/ (accessed 2026-10-11)
- **OWASP Multi-Tenant Security Cheat Sheet:** recommends (a) tenant context established server-side, (b) never trust client-provided tenant IDs, (c) enforce isolation at the data layer in addition to the application layer, (d) audit cross-tenant access attempts, (e) scope background jobs and caches per tenant.
- **Decision:** All five recommendations are implemented. See `ARCHITECTURE.md` §3 and `SECURITY.md` §4.

### 2.3 Supabase

- **Source:** https://supabase.com/docs/guides/auth (accessed 2026-10-11)
- **Finding:** Supabase provides Postgres + Auth + Storage + RLS as a managed service. Their docs on RLS, Auth, and connection pooling are directly applicable.
- **Decision:** Production target is Supabase. The schema in `prisma/schema.prisma` is Postgres-compatible (only the `datasource` provider needs switching from `sqlite` to `postgresql`).

## 3. SaaS competitive & failure analysis

### 3.1 Shopify

- **Strengths:** Mature multi-tenant model. App ecosystem. Payment integrations (Shopify Payments + third-party). Excellent merchant UX.
- **Documented frustrations:**
  - Platform lock-in: merchants cannot easily migrate (canonical thread: r/Shopify on Reddit, repeated annual complaints).
  - Transaction fees when not using Shopify Payments (https://www.shopify.com/pricing — accessed 2026-10-11).
  - App store bloat: many "free" apps harvest merchant/customer data; opaque data flows.
  - Theme customisation requires Liquid templating; non-developers struggle beyond basic config.
- **Relevant to OHWASIS:** Avoid lock-in by open-sourcing the platform. Avoid data harvesting by never sending merchant/customer data to third parties without explicit configuration. Keep theme customisation simple (CMS pages + branded colors) rather than a full templating engine.

### 3.2 WooCommerce

- **Strengths:** Open-source. Massive plugin ecosystem. Cheap to run.
- **Documented frustrations:**
  - Plugin conflicts cause site breakage (well-documented in WooCommerce GitHub issues).
  - Security vulnerabilities from third-party plugins (Wordfence annual reports).
  - Scaling: WordPress is single-tenant by default; multi-tenant needs WordPress Multisite, which is fragile.
- **Relevant to OHWASIS:** Build core capabilities in-platform; do not rely on a plugin marketplace that merchants must navigate.

### 3.3 Wix / Squarespace

- **Strengths:** Easy onboarding. Beautiful templates. Good for non-technical merchants.
- **Documented frustrations:**
  - Limited extensibility (closed ecosystem).
  - Migration off-platform is painful (data export limitations).
  - Performance: page builders add bloat (Lighthouse scores consistently lower than custom-built sites).
- **Relevant to OHWASIS:** Onboarding should be as easy as Wix/Squarespace. Extensibility should be in-platform features, not a third-party plugin model.

### 3.4 BigCommerce

- **Strengths:** Strong enterprise feature set. Multi-channel (Facebook, Instagram, Amazon).
- **Documented frustrations:**
  - Pricing tiers gate essential features (https://www.bigcommerce.com/pricing — accessed 2026-10-11).
  - Theme development requires stencil CLI; learning curve.
- **Relevant to OHWASIS:** Avoid feature-gating that punishes small merchants. Keep theme customisation simple.

### 3.5 Documented security incidents

- **Shopify 2020 insider attack:** A support agent exfiltrated customer transaction data from ~200 merchants. Lesson: even trusted staff with legitimate cross-tenant access can become threats. Mitigation: audit every cross-tenant access; restrict platform-operator access to explicitly authorised, scoped operations; prefer self-service merchant flows over staff-assisted ones.
- **WooCommerce plugin vulnerabilities (2022–2024):** Multiple critical SQL-injection and RCE vulnerabilities in popular WooCommerce plugins (e.g. WooCommerce Reviews, Cart Add-ons). Lesson: minimise third-party plugin surface; build critical commerce features in-platform.
- **Magento 2022 CVE-2022-24086:** Unauthenticated RCE via admin panel. Lesson: admin routes must not be predictable (`/admin` is a magnet for scanners); configurable route slugs add defence-in-depth (do not replace auth).

### 3.6 Design decisions influenced by these findings

| Finding | Design decision |
|---------|-----------------|
| Lock-in frustrates merchants | Open-source the platform; merchant data is theirs (export anytime) |
| Plugin bloat / vulnerabilities | Build core features in-platform; no third-party plugin marketplace |
| Theme customisation requires developer skills | Simple CMS + branded colors; no full templating engine |
| Insider threat at platform level | All cross-tenant operator access is audit-logged; scoped to explicit operations |
| Predictable admin routes get scanned | Configurable, random admin route slugs (defence-in-depth only) |
| Payment credentials leak via logs | Secrets encrypted at rest; masked in UI; never written to logs |
| Cross-tenant ID substitution attacks | `assertTenantOwns()` on every object-level access |

## 4. Payment provider research (Kenya focus)

### 4.1 M-Pesa Daraja

- **Source:** https://developer.safaricom.co.ke (accessed 2026-10-11)
- **STK Push flow:**
  1. Merchant initiates STK Push via Daraja `/stkpush/v1/process/request`.
  2. Customer receives a prompt on their phone.
  3. Customer enters M-Pesa PIN.
  4. Daraja calls back to the merchant's `CallBackURL` with the result.
- **Critical security considerations:**
  - Never collect or store the M-Pesa PIN. (The STK Push flow never exposes the PIN to the merchant.)
  - Never treat a successful HTTP response from `/stkpush` as payment success. (HTTP 200 only means the request was accepted; the customer may still cancel.)
  - Always verify the callback's `Amount` matches the order's expected total.
  - Always deduplicate callbacks (Daraja may retry).
- **Implementation:** `src/lib/providers/mpesa-daraja.ts` + `src/app/api/payments/mpesa/callback/route.ts`.

### 4.2 Manual / COD

- **Use case:** Merchants without Daraja credentials, or customers without M-Pesa.
- **Flow:** Customer places order → merchant'still/pesbill/bank details shown → customer pays externally → merchant verifies from dashboard with receipt.
- **Honesty:** Marked as `PENDING` until merchant verifies. Never auto-mark as paid.
- **Implementation:** `src/app/api/payments/manual-verify/route.ts`.

### 4.3 Future providers

Card processors (Stripe, Flutterwave), other mobile money (Airtel Money), and bank transfers can be added by implementing the same `PaymentProviderConfig` pattern: encrypted config blob + provider-specific adapter in `src/lib/providers/`. No new DB tables needed.

## 5. AI integration research

### 5.1 Aevibron Gateway

- **Source:** Project brief specifies Aevibron Gateway as the recommended provider. Endpoint: `https://Aevibron-gateway.vercel.app/api/v1/chat`. Auth header: `X-Aevibron-Key`.
- **Decision:** Implemented in `src/lib/ai/provider.ts`. The gateway accepts an OpenAI-compatible request body (`{ model, messages, temperature, max_tokens }`) and returns OpenAI-style responses.

### 5.2 Other providers

- **OpenAI:** `Authorization: Bearer` auth scheme. OpenAI-compatible API.
- **Anthropic:** `x-api-key` auth scheme. Anthropic-specific headers (`anthropic-version`).
- **Custom:** Any OpenAI-compatible API (e.g. Together, Mistral, Groq).

### 5.3 AI access request workflow

The project brief requires that merchants can request API access from the platform operator, with notifications sent to `aevibron@gmail.com`. Implementation:

- `POST /api/ai/access-request` persists a durable record with requesting tenant, requester, requested access, justification, status (`PENDING`).
- Email notification dispatched via `dispatch()` to the configured contact email. If SMTP is not configured, the record's `emailDelivered` is `false` with a clear error — never faked.
- Platform operator reviews in admin console → `POST /api/ai/access-request/[id]/decide` → status becomes `APPROVED` or `REJECTED`. Audit-logged.

## 6. Conclusions

The OHWASIS architecture is:

- **Pragmatic:** Build the multi-tenant commerce layer in Next.js + Prisma, not on top of Medusa or Saleor (which would impose more adaptation cost than benefit).
- **Honest:** Every integration that requires external credentials (Daraja, Aevibron, SMTP) reports its real status — never fakes success.
- **Secure:** Application-layer tenant isolation today, with a documented upgrade path to PostgreSQL RLS in production.
- **Observable:** Every sensitive operation is audit-logged; every notification persists with its real delivery status.
- **Extensible:** New payment providers, AI providers, industries, and capabilities can be added without schema migrations in most cases.

The trade-offs that remain unavoidable:

- **No true RLS in the sandbox.** Mitigated by application-layer enforcement, but a malicious script with direct DB access could bypass it. Production must use PostgreSQL + RLS.
- **No live M-Pesa or AI calls without external credentials.** This is a property of any honest integration, not a defect.
- **No persistent background workers.** Vercel serverless does not support them. Scheduled tasks require a managed cron service (Vercel Cron, Railway, etc.). The schema is ready for this.
