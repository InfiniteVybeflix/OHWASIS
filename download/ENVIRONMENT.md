# OHWASIS — Environment Variables

This file documents every environment variable the OHWASIS application uses. Generated from `src/lib/crypto.ts`, `src/lib/session.ts`, `src/lib/notifications/index.ts`, `src/lib/ai/provider.ts`, `src/app/api/checkout/route.ts`.

## 1. Required

| Variable | Purpose | Public? | Where obtained | Validation |
|----------|---------|---------|----------------|------------|
| `DATABASE_URL` | Prisma datasource URL. SQLite path for dev; PostgreSQL URL for production. | No | Local: `file:./db/custom.db`. Production: Supabase connection string. | Must be a valid Prisma connection URL. |
| `MASTER_ENCRYPTION_KEY` | 32-byte key (hex or base64) used by `src/lib/crypto.ts` for AES-256-GCM encryption of payment provider and AI provider credentials. | No | Generate with `openssl rand -hex 32`. In production, manage via KMS / Vercel secret manager. | Must decode to exactly 32 bytes. Falls back to a deterministic dev-only key with a console warning if unset. |
| `NEXT_PUBLIC_APP_URL` | The public URL of the deployment. Used to construct the M-Pesa callback URL when the merchant has not overridden it. | Yes (NEXT_PUBLIC_*) | Vercel deployment URL or custom domain. | Must be a valid HTTPS URL in production. |

## 2. Optional — AI

| Variable | Purpose | Public? | Where obtained | Validation |
|----------|---------|---------|----------------|------------|
| `AEVIBRON_GATEWAY_URL` | Override the Aevibron Gateway base URL. Default: `https://Aevibron-gateway.vercel.app/api/v1`. | No | Aevibron documentation. | Must be a valid URL ending with the API version path. |
| `AEVIBRON_GATEWAY_KEY` | Platform-level Aevibron API key. Used as a fallback when a tenant has not configured their own AI provider. | No | Aevibron portal (or via the AI access request workflow). | Must be a non-empty string. |
| `AEVIBRON_CONTACT_EMAIL` | Where AI access request notifications are sent. Default: `aevibron@gmail.com`. | No | Aevibron. | Must be a valid email. |

## 3. Optional — Email (SMTP)

If SMTP is not configured, email notifications are persisted with `status=FAILED` and a clear error message. They are NEVER silently marked as sent.

| Variable | Purpose | Public? | Where obtained | Validation |
|----------|---------|---------|----------------|------------|
| `SMTP_HOST` | SMTP server hostname. | No | Your email provider (e.g. `smtp.gmail.com`, `smtp.sendgrid.net`). | Must be a resolvable hostname. |
| `SMTP_PORT` | SMTP port. Default: 587. | No | Provider documentation. | Integer 1–65535. 465 = implicit TLS; 587 = STARTTLS. |
| `SMTP_USER` | SMTP username. | No | Provider. | Non-empty string. |
| `SMTP_PASS` | SMTP password. | No | Provider. | Non-empty string. |
| `SMTP_FROM` | The "From" email address. | No | Must be a sender authorised by your SMTP provider. | Valid email address. |
| `MAIL_FROM` | Fallback "From" if `SMTP_FROM` is not set. | No | Same as above. | Valid email address. |

## 4. Optional — Security

| Variable | Purpose | Public? | Where obtained | Validation |
|----------|---------|---------|----------------|------------|
| `SECURITY_CONTACT_EMAIL` | Where vulnerability reports are sent (referenced in SECURITY.md). | No | Platform operator's security mailbox. | Valid email address. |
| `ADMIN_ROUTE_BASE` | (Reserved) Prefix for admin routes in a multi-page deployment. Not currently used in the single-route SPA. | No | n/a | n/a |

## 5. Optional — Application behaviour

| Variable | Purpose | Public? | Default |
|----------|---------|---------|---------|
| `NODE_ENV` | Standard Node env. | No | `development` |
| `NEXT_PUBLIC_APP_URL` | See §1. | Yes | n/a |

## 6. Setting in Vercel

In Vercel → Project Settings → Environment Variables, add each variable for the appropriate environment(s):

- **Production:** set on the production deployment.
- **Preview:** set on preview deployments (e.g. PR builds). Use sandbox keys.
- **Development:** set on local `vercel dev` runs.

Never mark a secret variable as `NEXT_PUBLIC_*` — it will be inlined into the browser bundle.

## 7. Verifying

After setting all env vars, verify by:

```bash
# On the deployment:
curl -s https://yourdomain.com/api/health  # (when implemented; currently returns 404)

# Locally:
bun run dev
# Visit http://localhost:3000 — page should load
# Sign up a new user → check audit log records `signup`
# Try to checkout with M-Pesa STK → expect "provider not configured" (no creds yet)
# Configure Daraja creds in merchant dashboard → checkout should initiate STK push
```

## 8. Rotation

- `MASTER_ENCRYPTION_KEY`: rotate quarterly. See OPERATIONS.md §4 for the rotation procedure.
- `AEVIBRON_GATEWAY_KEY`: rotate annually or on suspected compromise.
- `SMTP_PASS`: rotate per your email provider's policy.
- Supabase DB password: rotate quarterly via Supabase dashboard; update `DATABASE_URL`.
