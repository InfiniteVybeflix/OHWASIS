# OHWASIS — V1.0.0

**One Hosted Web Architecture Serving Isolated Storefronts.**

A multi-tenant commerce SaaS platform: one shared infrastructure, independent businesses, isolated data. Built for the Kenyan market with M-Pesa Daraja, Aevibron AI, and a customer marketplace.

> Every business deserves its own space to grow.

## Quick start

```bash
# 1. Install dependencies
bun install

# 2. Copy env file and fill in values
cp .env.example .env

# 3. Push database schema
bunx prisma db push

# 4. Run the dev server
bun run dev
```

## Environment variables

See `.env.example` for the complete list. The required ones:

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | PostgreSQL connection string (Supabase) |
| `MASTER_ENCRYPTION_KEY` | 32-byte hex key for AES-256-GCM encryption |
| `NEXT_PUBLIC_APP_URL` | Public deployment URL |
| `ADMIN_EMAIL` | Platform operator email |
| `ADMIN_PASSWORD_HASH` | scrypt hash of admin password |

## Tech stack

- **Framework:** Next.js 16 (App Router, Turbopack)
- **Language:** TypeScript 5 (strict, no `any`)
- **Database:** Prisma + PostgreSQL (Supabase)
- **Styling:** Tailwind CSS 4 + shadcn/ui
- **Auth:** Custom scrypt + session tokens (no external auth dependency)
- **Payments:** M-Pesa Daraja STK Push + manual verification
- **AI:** Aevibron Gateway (recommended) + OpenAI/Anthropic adapters
- **PWA:** Separate manifests for customer, business, and admin roles

## GitHub Actions

A workflow at `.github/workflows/db-setup.yml` runs `prisma db push` + seeds the admin on every push to `main`.

**Required GitHub Secrets:**
- `DATABASE_URL` — Supabase connection string
- `ADMIN_EMAIL` — Admin email
- `ADMIN_PASSWORD_HASH` — scrypt hash

## Deployment (Vercel)

1. Import the repo to Vercel
2. Set environment variables in Project Settings
3. Deploy — the GitHub Action handles DB schema + seed automatically

## Documentation

- `ARCHITECTURE.md` — component boundaries, multi-tenant model
- `SECURITY.md` — security model, threat surface
- `SETUP.md` — complete step-by-step setup
- `PAYMENTS.md` — M-Pesa Daraja configuration

## License & brand

OHWASIS is a working product name. Built by Aevibron (aevibron@gmail.com). V1.0.0.
