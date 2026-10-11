# OHWASIS — Operations Runbook

This document covers backup, recovery, monitoring, incident response, and routine operations for OHWASIS in production.

## 1. Routine operations

### 1.1 Daily checks

- [ ] Vercel dashboard → no failed deployments in last 24h
- [ ] Supabase dashboard → DB health green, no slow query alerts
- [ ] Vercel → Functions → check for any 5xx error spikes
- [ ] Audit log: scan for `category=SECURITY` events (any cross-tenant attempt logged)
- [ ] Notification queue: any records stuck in `PENDING` for > 1 hour?

### 1.2 Weekly checks

- [ ] Backup restore test: pick last weekly backup, restore to a staging Supabase project, verify a merchant can log in
- [ ] Dependency audit: `bun audit` — review any high/critical advisories
- [ ] Disk usage on Supabase project
- [ ] Vercel bandwidth / function-invocation quota

### 1.3 Monthly checks

- [ ] Rotate `MASTER_ENCRYPTION_KEY` (see §4)
- [ ] Review platform operator access list — remove any stale accounts
- [ ] Review merchant list — suspend any accounts in `SUSPENDED` state for > 30 days
- [ ] Security patch review for all dependencies

## 2. Backup & recovery

### 2.1 Automatic backups

- **Supabase Free:** daily snapshots, 7-day retention.
- **Supabase Pro:** PITR (Point-In-Time Recovery), 30-day retention.

### 2.2 Manual backups

```bash
# Logical backup (run weekly, store off-region)
pg_dump "$DATABASE_URL" | gzip > backups/ohwasis-$(date +%Y%m%d).sql.gz

# Restore (to a staging DB)
gunzip -c backups/ohwasis-YYYYMMDD.sql.gz | psql "$STAGING_DATABASE_URL"
```

### 2.3 Restore procedure

1. Identify the restore point (timestamp or backup file).
2. Notify merchants of scheduled downtime (if production DB is being restored).
3. Scale down Vercel deployments (set env var `MAINTENANCE_MODE=true`; not yet implemented — currently you would disable deployments via Vercel UI).
4. Restore via `psql` from backup file, or via Supabase PITR.
5. Run `bun run db:migrate deploy` to apply any migrations newer than the backup.
6. Verify by logging in as a test user.
7. Re-enable deployments.

### 2.4 What is NOT backed up

- Vercel function logs (use Vercel Log Drain to a SIEM).
- Browser localStorage (cart session keys, theme preference).
- Search indexes (rebuilt from DB on demand).

## 3. Monitoring

### 3.1 Vercel Log Drain

Configure Vercel → Project Settings → Log Drains → send to:

- Datadog, Logtail, or Axiom for general logs.
- Sentry for error tracking.
- A SIEM for security events.

### 3.2 Key metrics to alert on

| Metric | Threshold | Action |
|--------|-----------|--------|
| 5xx error rate | > 1% of requests in 5 min | Page on-call engineer |
| Function execution time | > 10s p95 | Investigate slow query / external call |
| DB connection pool saturation | > 80% | Scale Supabase compute |
| Failed login attempts per IP | > 50 in 1 min | Auto-block IP (configure Supabase rate limiter) |
| M-Pesa callbacks failing | Any `WebhookEvent.status=FAILED` | Investigate immediately — payments may be stuck |
| Notification queue growing | > 100 `PENDING` notifications > 1h | SMTP provider likely down |
| Audit events `category=SECURITY` | Any | Review cross-tenant access attempts |

### 3.3 Health check endpoint

(Not yet implemented. Recommended: `GET /api/health` returns `{ ok: true, db: ok, time: ... }`. Add to SETUP.md when built.)

## 4. Encryption key rotation

The `MASTER_ENCRYPTION_KEY` is used to encrypt payment provider credentials and AI API keys at rest. Rotation requires re-encrypting all `PaymentProviderConfig.encryptedConfig` and `AiProviderConfig.encryptedConfig` rows.

### 4.1 Rotation procedure

```bash
# 1. Set both keys (old + new) in env temporarily
OLD_MASTER_ENCRYPTION_KEY="<old>"
NEW_MASTER_ENCRYPTION_KEY="<new>"

# 2. Run the rotation script (to be written)
bun run scripts/rotate-encryption-key.ts

# 3. Verify a payment config still decrypts
# 4. Switch Vercel env to use only NEW_MASTER_ENCRYPTION_KEY
# 5. Redeploy
# 6. Confirm payments / AI still work
```

The rotation script reads each encrypted blob with the old key and re-encrypts with the new key. It should run in a single transaction per row to avoid partial states.

### 4.2 Key compromise procedure

If `MASTER_ENCRYPTION_KEY` is suspected compromised:

1. Rotate the key (§4.1).
2. Force-rotate every payment provider's credentials (each merchant must re-enter Daraja creds).
3. Force-rotate every AI provider's API key.
4. Audit all `AuditEvent` records for the suspect period — look for unauthorised reads.
5. Notify affected merchants.

## 5. Incident response

### 5.1 Severity levels

| Severity | Meaning | Response time |
|----------|---------|---------------|
| P0 | Production down, data loss, or active breach | < 15 min |
| P1 | Major feature broken, no workaround | < 1 hr |
| P2 | Minor feature broken, workaround exists | < 4 hr |
| P3 | Cosmetic / minor inconvenience | Next business day |

### 5.2 P0 — Production down

1. Acknowledge in incident channel.
2. Roll back to last known-good Vercel deployment (Vercel → Deployments → ⋮ → Promote).
3. If DB is the issue: switch to standby / restored backup.
4. Communicate status to merchants every 30 min until resolved.
5. Post-incident: write blameless post-mortem within 48h, including timeline, root cause, fix, and prevention measures.

### 5.3 P0 — Suspected data breach

1. Disable the suspected compromised account immediately.
2. Pull audit logs for that account's actions in the last 90 days.
3. Identify affected tenants.
4. Notify affected merchants within 24h (regulatory clock starts).
5. Rotate `MASTER_ENCRYPTION_KEY` (§4.1).
6. Force password reset for all users in the affected tenant(s).

### 5.4 P0 — M-Pesa callback failure

If Daraja callbacks stop arriving:

1. Check Vercel function logs for `/api/payments/mpesa/callback` — any 5xx?
2. Verify the callback URL is still reachable from outside (`curl -X POST https://yourdomain.com/api/payments/mpesa/callback -d '{}'` — expect 200 with `ResultDesc: Malformed body ignored`).
3. Check Daraja developer portal for any platform incidents.
4. If callbacks have been failing for > 1 hour: manually reconcile by querying Daraja's transaction status API for each `PENDING` PaymentAttempt.

## 6. Schema migrations in production

### 6.1 Before applying

1. Read the migration SQL and confirm it is backward-compatible (no destructive `DROP COLUMN` without a prior deprecation period).
2. Test on staging with a copy of production data.
3. Back up production DB (§2.2).
4. Schedule a maintenance window if the migration is non-trivial.

### 6.2 Applying

```bash
DATABASE_URL="<production-url>" bun run db:migrate deploy
```

### 6.3 Rolling back

Prisma migrations are not auto-reversible. To roll back:

1. Restore from the pre-migration backup (§2.3), OR
2. Write a manual "down" migration that reverses the schema change.

## 7. Dependency upgrades

### 7.1 Routine

```bash
bun update                 # minor + patch updates
bun audit                  # security advisories
```

### 7.2 Major version upgrades

Test on a feature branch first:

```bash
git checkout -b deps/major-upgrade
bun install <package>@latest
bun run lint && bun run build
# Run e2e smoke tests
```

If green, merge to main. If breakage, pin to previous major and document in `IMPLEMENTATION_STATUS.md`.

## 8. Vendor SLA review

Quarterly, review:

- **Vercel:** function execution time, deployment success rate, bandwidth quota.
- **Supabase:** DB uptime, connection pool saturation, backup restore success.
- **Safaricom Daraja:** callback latency, STK Push success rate, incident history.
- **Aevibron Gateway:** response latency, error rate, quota utilisation.
- **SMTP provider (if any):** delivery rate, bounce rate.

If any vendor consistently misses SLA, document and consider alternatives.
