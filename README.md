# OHWASIS — One Hosted Web Architecture Serving Isolated Storefronts

**OHWASIS** is a multi-tenant commerce SaaS platform: one shared infrastructure that lets many independent businesses create, operate, and customize their own online storefronts — without ever being able to see each other's data.

> Every business deserves its own space to grow.

This repository contains a working, production-oriented implementation of OHWASIS: real persistence, real authentication, real tenant isolation, real commerce flows, real payment integrations (M-Pesa Daraja), real AI integration (Aevibron Gateway), and an honest audit trail.

## What this build actually does

- **Multi-tenant data model with enforced isolation.** Every tenant-owned row carries a `tenantId` and every query is wrapped by `tenantScoped()` in `src/lib/tenant.ts`. Cross-tenant ID substitution is blocked by `assertTenantOwns()`.
- **Real authentication.** scrypt password hashing, server-side session tokens stored in the DB, revocable sessions, disabled-account login refused.
- **Role-based authorization.** Platform operator, merchant owner, administrator, order manager, catalogue manager, content editor, fulfilment staff, analyst. Enforced server-side, not by hiding buttons.
- **Full commerce lifecycle.** Catalogue (categories, products, variants, inventory) → cart → checkout (server-side total validation, stock decrement in a transaction, order snapshot) → order lifecycle with state-machine transitions → fulfilment.
- **M-Pesa Daraja STK Push integration.** Genuine HTTP call to Safaricom's API when merchant credentials are configured. Idempotent callback handler with amount verification. STK success ≠ payment success: only the callback's `ResultCode === 0` marks a payment verified. If creds are not configured, the integration honestly reports that — never fakes success.
- **Manual / Cash-on-delivery payments.** Merchant verifies from dashboard with audit trail.
- **Aevibron AI Gateway integration.** Provider-neutral AI layer with the recommended Aevibron Gateway at the configured base URL. OpenAI/Anthropic also supported. PII auto-redacted before sending. AI output treated as untrusted input.
- **AI access request workflow.** Merchants request API access; requests persist as durable records; platform operator approves/rejects from admin console; in-app notification delivered to the requester.
- **Configurable CMS** with HTML sanitisation, draft/publish states, revision history.
- **Platform admin console** with cross-tenant merchant management, AI request review, and audit log.
- **Encrypted secrets at rest** (AES-256-GCM) for payment provider credentials and AI API keys.

## What this build honestly does NOT do (yet)

- **No PostgreSQL RLS.** The sandbox uses SQLite. Tenant isolation is enforced at the application layer. ARCHITECTURE.md describes the upgrade path to Supabase + RLS.
- **No live M-Pesa Daraja transactions** — Daraja credentials are not configured in the sandbox. The integration code is real and will call Safaricom's API when credentials are supplied.
- **No live AI calls** — no Aevibron API key is configured. The integration code is real and will call the gateway when a key is supplied.
- **No SMTP email delivery** — no SMTP_* env vars are configured. Notifications persist with status `FAILED` and a clear error; never claim "sent" when not sent.
- **No production HTTPS / custom-domain verification** — handled by Vercel in production.

See `IMPLEMENTATION_STATUS.md` for the full list of implemented / tested / externally-blocked / deferred features.

## Stack

- Next.js 16 (App Router) + TypeScript 5 (strict, no `any`)
- Prisma + SQLite (sandbox) / PostgreSQL (production target)
- Tailwind CSS 4 + shadcn/ui (New York)
- Zustand (client state) + TanStack Query-ready
- Node `crypto` for scrypt + AES-256-GCM (no external crypto deps)
- `nodemailer` for SMTP (lazy-loaded when SMTP_* is configured)

## Quick start

```bash
# 1. Install dependencies
bun install

# 2. Push the database schema
bun run db:push

# 3. Seed the platform operator + 2 demo merchants
bun run scripts/seed-admin.ts

# 4. Run the dev server
bun run dev
# → open http://localhost:3000
```

**Demo credentials** (after seeding):
- Platform operator: `admin@ohwasis.local` / `admin-password`
- AquaRefill owner: `owner@aquarefill.example` / `merchant-password`
- Mama Njeri owner: `owner@mamanjeri.example` / `merchant-password`

## Sandbox note — single user-visible route

This sandbox only exposes the `/` route to the user. The entire OHWASIS experience (marketing landing, storefront browsing, cart, checkout, merchant dashboard, platform admin) is therefore a single-page application at `/`, backed by a complete `/api/*` surface.

In a real deployment (Vercel + Supabase), you would split this into the conventional route structure described in ARCHITECTURE.md §Deployment topology.

## Documentation

- `README.md` — this file
- `ARCHITECTURE.md` — component boundaries, multi-tenant model, deployment topology
- `SECURITY.md` — security model, threat surface, reporting process
- `SETUP.md` — complete step-by-step setup (GitHub, Supabase, Vercel, env vars)
- `RESEARCH.md` — competitor research, sources, design decisions
- `IMPLEMENTATION_STATUS.md` — phase progress, what's done / blocked / deferred
- `OPERATIONS.md` — backup, recovery, monitoring, incident response
- `PAYMENTS.md` — M-Pesa Daraja configuration, callbacks, reconciliation
- `BRAND_ASSETS.md` — where to place official OHWASIS logos and icons
- `.env.example` — every environment variable the app actually uses

## License & brand

The OHWASIS name and brand are supplied product requirements. They are not assumed to be legally cleared; document this as a launch consideration. The brand mark in this build is an original CSS/SVG mark; replace it with the official asset when provided (see `BRAND_ASSETS.md`).
