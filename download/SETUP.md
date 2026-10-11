# OHWASIS — Setup Guide

This is a practical, step-by-step installation and operating manual. It assumes the reader may be setting up the infrastructure for the first time.

## 0. Prerequisites

| Requirement | Version | Notes |
|-------------|---------|-------|
| Node.js | ≥ 20 LTS | Next.js 16 requires Node 20+ |
| Bun | ≥ 1.1 | Used as package manager + dev runner |
| PostgreSQL | ≥ 14 | SQLite works for dev; production uses Postgres |
| Supabase account | — | For production DB + Auth + Storage |
| Vercel account | — | For production hosting |
| GitHub account | — | For source control + CI |
| Safaricom Daraja developer account | — | For M-Pesa STK Push (sandbox + production) |
| Aevibron API key | — | For AI (optional; platform-level fallback supported) |
| SMTP credentials | — | For email notifications (optional) |

## 1. Local development

### 1.1 Clone and install

```bash
git clone <your-repo-url> ohwasis
cd ohwasis
bun install
```

### 1.2 Configure environment

```bash
cp .env.example .env
# Edit .env to set DATABASE_URL and (optionally) MASTER_ENCRYPTION_KEY
```

For local dev, the default `DATABASE_URL=file:./db/custom.db` (SQLite) is sufficient.

### 1.3 Initialise the database

```bash
bun run db:push        # Apply schema to the database
bun run db:generate    # Regenerate the Prisma client (auto-run by db:push)
```

### 1.4 Seed demo data

```bash
bun run scripts/seed-admin.ts
```

This creates:
- Platform operator: `admin@ohwasis.local` / `admin-password`
- AquaRefill merchant owner: `owner@aquarefill.example` / `merchant-password`
- Mama Njeri Restaurant merchant owner: `owner@mamanjeri.example` / `merchant-password`

Each merchant has: 4–5 products, 2 categories, 1–2 delivery zones, 1 published CMS page, manual + COD payment providers enabled.

### 1.5 Start the dev server

```bash
bun run dev
```

Open `http://localhost:3000`. The dev server is on port 3000.

### 1.6 Lint and type-check

```bash
bun run lint
```

## 2. GitHub setup

### 2.1 Create the repository

```bash
# In the ohwasis directory:
git init
git add .
git commit -m "Initial OHWASIS build"
git branch -M main
git remote add origin git@github.com:your-org/ohwasis.git
git push -u origin main
```

### 2.2 Repository secrets

In GitHub → Settings → Secrets and variables → Actions, add:

| Secret | Purpose |
|--------|---------|
| `VERCEL_TOKEN` | Vercel deployment token (for CI deploy) |
| `SUPABASE_DATABASE_URL` | Production Postgres connection string |
| `MASTER_ENCRYPTION_KEY` | 32-byte hex key for AES-256-GCM |
| `AEVIBRON_GATEWAY_KEY` | Optional platform-level AI key |
| `SMTP_HOST` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM` | Email provider |

### 2.3 Enable GitHub Actions

The repository includes a CI workflow at `.github/workflows/ci.yml` (described in §5). On push to `main`, CI runs lint + type-check + tests + build.

## 3. Supabase setup (production database)

### 3.1 Create the project

1. Sign in to https://supabase.com
2. New project → pick a name, region (closest to your users), strong DB password.
3. Wait for provisioning (~2 minutes).

### 3.2 Retrieve connection strings

In Supabase → Project Settings → Database:

- **Connection string (URI)**: `postgresql://postgres:[PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres`
- Use this as `DATABASE_URL` in production env vars (Vercel).

In Project Settings → API:

- **Project URL**: `https://[PROJECT_REF].supabase.co`
- **anon key**: safe to expose to the browser (used for client-side Supabase Auth, if you wire it in).
- **service_role key**: NEVER expose to the browser. Used only server-side. (This build does not currently use Supabase Auth — auth is custom — but the schema is compatible with migrating to Supabase Auth later.)

### 3.3 Apply the schema

```bash
# Temporarily set DATABASE_URL to the Supabase URL
DATABASE_URL="postgresql://postgres:[PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres" bun run db:push
```

In production, use `prisma migrate deploy` instead of `db:push` (the latter is destructive in some cases).

### 3.4 Enable Row-Level Security (recommended for production)

See `ARCHITECTURE.md` §3 for the upgrade path. Example policy on `products`:

```sql
ALTER TABLE products ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_products ON products
  USING (tenant_id = current_setting('app.tenant_id', true)::text);
```

The application-layer `tenantScoped()` checks remain as defence-in-depth.

### 3.5 Create the initial platform operator

Use the seed script with the production DATABASE_URL:

```bash
DATABASE_URL="<supabase-url>" bun run scripts/seed-admin.ts
```

Then **immediately change the admin password** via the UI.

### 3.6 Configure backups

Supabase automatically backs up the database daily. For mission-critical deployments:

- Enable Point-In-Time Recovery (Supabase Pro).
- Configure a weekly logical export to a separate region (e.g. via `pg_dump` to S3).

## 4. Vercel setup

### 4.1 Import the repository

1. Sign in to https://vercel.com
2. New Project → import the GitHub repository.
3. Framework preset: **Next.js** (auto-detected).
4. Build command: `next build` (default).
5. Output directory: `.next` (default).
6. Install command: `bun install` (override the default `npm install`).

### 4.2 Environment variables

In Vercel → Project Settings → Environment Variables, add (for Production, Preview, and Development as appropriate):

| Variable | Required | Where used |
|----------|----------|-----------|
| `DATABASE_URL` | YES | Prisma datasource |
| `MASTER_ENCRYPTION_KEY` | YES | `src/lib/crypto.ts` — encrypts payment + AI secrets |
| `NEXT_PUBLIC_APP_URL` | YES | Public URL for callbacks (`https://yourdomain.com`) |
| `AEVIBRON_GATEWAY_URL` | NO | Override Aevibron Gateway base URL |
| `AEVIBRON_GATEWAY_KEY` | NO | Platform-level Aevibron API key |
| `AEVIBRON_CONTACT_EMAIL` | NO | Override AI access request recipient (default `aevibron@gmail.com`) |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM` | NO | Email provider |
| `SECURITY_CONTACT_EMAIL` | NO | Where vulnerability reports go |

Never set `SUPABASE_SERVICE_ROLE_KEY` as a `NEXT_PUBLIC_*` variable. Service-role keys are server-only; this build does not currently use them but the schema is compatible.

### 4.3 Deploy

Click **Deploy**. The first build takes ~2 minutes. Subsequent pushes auto-deploy.

### 4.4 Verify

- Visit the Vercel preview URL.
- Run through the merchant onboarding flow (sign up → create tenant → add product → checkout with COD → see order in dashboard).
- Check Vercel → Functions logs for any runtime errors.

### 4.5 Custom domains

In Vercel → Project Settings → Domains:

1. Add your domain (e.g. `ohwasis.com`).
2. Vercel provisions an HTTPS certificate automatically (Let's Encrypt).
3. Update your DNS to point CNAME/A records to Vercel.

For per-merchant custom domains (e.g. `shop.aquarefill.com`):

1. Tenant owner adds the domain in their merchant dashboard (when implemented — current build supports verified custom domains at the schema level via `Tenant.customDomain` + `domainVerifiedAt`).
2. In production with Vercel + wildcard domain, you can automate this via the Vercel Domains API.
3. The middleware resolves the tenant by `host` header (see `src/lib/session.ts` → `resolveTenantByDomain`).

### 4.6 Rollback

In Vercel → Deployments, click the ⋮ menu on any past deployment → **Promote to Production**. This is instant and atomic.

## 5. CI workflow

The recommended GitHub Actions workflow:

```yaml
# .github/workflows/ci.yml
name: CI
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: 1.1
      - run: bun install --frozen-lockfile
      - run: bun run lint
      - run: bun run db:generate
      - run: bun run build
```

## 6. Application operations

### 6.1 Bootstrap the first platform administrator

```bash
DATABASE_URL="<production-url>" bun run scripts/seed-admin.ts
```

Or via the admin API (requires an existing operator — chicken/egg for the very first one):

```bash
curl -X POST https://yourdomain.com/api/admin/seed \
  -H "Cookie: ohwasis_session=<admin-token>"
```

### 6.2 Create a merchant

In the UI:

1. Sign up as a new user.
2. Click "Create storefront" → fill in handle, display name, industry.
3. The creating user becomes the OWNER of the new tenant.

Or via API:

```bash
curl -X POST https://yourdomain.com/api/tenants/onboard \
  -H "Cookie: ohwasis_session=<user-token>" \
  -H "Content-Type: application/json" \
  -d '{"handle":"my-shop","displayName":"My Shop","industry":"general_retail"}'
```

### 6.3 Invite merchant staff

(TODO: not yet exposed in UI — endpoint `/api/tenants/.../invites` to be added. The schema supports `StaffInvite` records.)

### 6.4 Configure payment providers

Merchant dashboard → Payments tab → Add provider.

For M-Pesa Daraja:
1. Get sandbox credentials from https://developer.safaricom.co.ke
2. Set the callback URL to `https://yourdomain.com/api/payments/mpesa/callback`
3. Enter consumer key, consumer secret, short code, passkey.
4. Switch environment to `production` only after sandbox testing.

### 6.5 Verify payment callbacks

In production, monitor `/api/payments/mpesa/callback` for:

- HTTP 200 responses (Daraja expects 200 to stop retrying).
- `WebhookEvent` records with `status = PROCESSED`.
- Any `status = FAILED` records → investigate immediately.

### 6.6 Configure AI providers

Merchant dashboard → AI tab → Configure provider.

- Recommended: Aevibron Gateway. Base URL: `https://Aevibron-gateway.vercel.app/api/v1`. Auth scheme: `X-Aevibron-Key`.
- Enter the API key (encrypted at rest).
- Test with a simple prompt.

If the merchant doesn't have an API key, they can click "Request Aevibron access" → the platform operator reviews and approves.

### 6.7 Configure custom domains

(TODO: UI for this is not yet exposed — the schema supports it.)

### 6.8 Process and reconcile orders

Merchant dashboard → Orders tab:
1. Click an order to see full details.
2. If payment is `PENDING` and the merchant uses manual/COD: click "Verify payment" with the receipt.
3. Use the status-action buttons to move the order through the lifecycle: PENDING → CONFIRMED → PROCESSING → OUT_FOR_DELIVERY → DELIVERED → COMPLETED.

### 6.9 Review audit events

Platform admin → Audit log tab. Filter by tenant, action, or actor.

### 6.10 Back up and restore

Supabase automatic daily backups. For manual export:

```bash
pg_dump "$DATABASE_URL" > backup-$(date +%Y%m%d).sql
```

Restore:

```bash
psql "$DATABASE_URL" < backup-YYYYMMDD.sql
```

### 6.11 Troubleshoot common failures

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| Login fails with `account_disabled` | User's `status !== ACTIVE` | Set `User.status = ACTIVE` via DB or admin UI |
| `tenant_not_found` on merchant dashboard calls | `x-ohwasis-tenant` header missing or invalid | Verify the active tenant handle is set in the SPA store |
| M-Pesa STK push returns `provider_error` | Daraja creds invalid or env not configured | Check `PaymentProviderConfig.encryptedConfig` decrypts; verify callback URL is reachable |
| AI chat returns `ai_not_configured` | No tenant AI config and no platform-level `AEVIBRON_GATEWAY_KEY` | Configure one or the other |
| `MASTER_ENCRYPTION_KEY` invalid | Key is not 32 bytes after base64/hex decode | Generate with `openssl rand -hex 32` |

## 7. Upgrade dependencies & apply future migrations

```bash
bun update                       # update all deps to latest compatible
bun run db:migrate -- --name add_new_feature   # create a new migration
```

In production:

```bash
DATABASE_URL="<prod-url>" bun run db:migrate deploy
```

Always back up before applying migrations to production.

## 8. Security launch checklist

Before going live, verify every item:

- [ ] `MASTER_ENCRYPTION_KEY` is a KMS-managed 32-byte key (not the dev fallback).
- [ ] `DATABASE_URL` points to PostgreSQL with RLS enabled on every tenant-owned table.
- [ ] All Vercel env vars are set for Production environment (not Preview).
- [ ] HTTPS is enforced (Vercel does this automatically).
- [ ] Security headers are configured in `next.config.ts` (CSP, HSTS, X-Frame-Options).
- [ ] Rate limiting is in place (in-memory OK for single-instance; Redis for multi-instance).
- [ ] Audit log is being drained to a SIEM (Vercel Log Drain → Datadog / Logtail / similar).
- [ ] Backups are configured and tested (Supabase automatic + weekly logical export).
- [ ] At least one platform operator account has MFA enabled (when MFA is implemented).
- [ ] Admin route slugs are non-obvious (the default is random 12-hex).
- [ ] No secrets in `.env.example` (only safe dummy values).
- [ ] `SECURITY_CONTACT_EMAIL` is set and monitored.
- [ ] Incident response runbook is documented (see `OPERATIONS.md`).
- [ ] Legal review of data flows for Kenya DPA compliance.
- [ ] Merchant onboarding agreement / terms of service drafted.
