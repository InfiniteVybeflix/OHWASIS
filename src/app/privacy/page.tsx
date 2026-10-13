import { NextResponse } from 'next/server'

export const dynamic = 'force-static'

export const metadata = {
  title: 'Privacy Policy — OHWASIS',
  description: 'How OHWASIS collects, uses, and protects your data.',
}

export default function PrivacyPage() {
  const AEVIBRON_CONTACT = 'aevibron@gmail.com'
  const effective = new Date().toLocaleDateString('en', { year: 'numeric', month: 'long', day: 'numeric' })

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/60 bg-background/95 backdrop-blur">
        <div className="container mx-auto max-w-3xl px-4 py-4">
          <a href="/" className="text-sm text-primary hover:underline">← Back to OHWASIS</a>
        </div>
      </header>
      <main className="container mx-auto max-w-3xl px-4 py-12 prose prose-sm dark:prose-invert">
        <h1 className="text-3xl font-bold tracking-tight">Privacy Policy</h1>
        <p className="text-sm text-muted-foreground">Effective {effective}</p>

        <h2 className="mt-8 text-xl font-semibold">1. Who we are</h2>
        <p>
          OHWASIS is operated by Aevibron ({AEVIBRON_CONTACT}). We are a multi-tenant commerce platform headquartered in Kenya. This policy explains what data we collect, why, how we use it, and the controls you have.
        </p>

        <h2 className="mt-6 text-xl font-semibold">2. Data we collect</h2>
        <h3 className="mt-4 text-base font-medium">2.1 Account data</h3>
        <ul>
          <li>Email, name, password (hashed with scrypt — never plaintext).</li>
          <li>Account type (Customer / Business Owner / Platform Operator).</li>
          <li>Session tokens (random 256-bit, stored in DB, revocable, expire after 14 days).</li>
        </ul>
        <h3 className="mt-4 text-base font-medium">2.2 Customer data (per business)</h3>
        <ul>
          <li>Name, phone, email, delivery address — saved per business when you place an order.</li>
          <li>Each business sees only its own row for you. Business A cannot see that you also order from Business B.</li>
        </ul>
        <h3 className="mt-4 text-base font-medium">2.3 Business data</h3>
        <ul>
          <li>Business name, handle, tagline, description, contact details.</li>
          <li>Products, categories, prices, inventory.</li>
          <li>Payment provider credentials (M-Pesa Daraja consumer key/secret, passkey, Till/Paybill numbers) — encrypted at rest with AES-256-GCM, decrypted only server-side.</li>
          <li>AI provider API keys — encrypted at rest.</li>
          <li>Knowledge base entries the business owner provides.</li>
        </ul>
        <h3 className="mt-4 text-base font-medium">2.4 Order &amp; payment data</h3>
        <ul>
          <li>Order references, items, totals, status history, payment attempts.</li>
          <li>M-Pesa transaction receipt numbers (recorded when Daraja calls back).</li>
        </ul>
        <h3 className="mt-4 text-base font-medium">2.5 Usage data</h3>
        <ul>
          <li>Audit events (login, signup, order placement, payment verification, AI calls) — IP, user-agent, timestamp, action.</li>
          <li>AI answer logs (questions asked, answers given, customer thumbs-up/down).</li>
        </ul>

        <h2 className="mt-6 text-xl font-semibold">3. How we use your data</h2>
        <ul>
          <li>To operate the Platform — process orders, route payments, verify identity.</li>
          <li>To provide AI features (the AI sees only the relevant business&apos;s knowledge; never another business&apos;s data).</li>
          <li>To detect, prevent, and respond to security issues, fraud, and abuse.</li>
          <li>To comply with legal obligations.</li>
          <li>To improve the Platform — aggregated, anonymised analytics only.</li>
        </ul>

        <h2 className="mt-6 text-xl font-semibold">4. Data sharing</h2>
        <p>
          We do NOT sell your data. We share data only:
        </p>
        <ul>
          <li>With the business you ordered from — your order, contact, and delivery details.</li>
          <li>With payment providers (Safaricom Daraja, etc.) — only what is required to process your payment.</li>
          <li>With AI providers (Aevibron Gateway, OpenAI, Anthropic) — only when you (a business owner) configure an AI provider, and only the prompt content. PII is auto-redacted before sending.</li>
          <li>With email providers (SMTP) — only notification emails you have opted into.</li>
          <li>With law enforcement when legally compelled.</li>
        </ul>

        <h2 className="mt-6 text-xl font-semibold">5. Data retention</h2>
        <ul>
          <li>Customer accounts: retained while active. Inactive for 24 months → eligible for anonymisation.</li>
          <li>Business data: retained while the business is active. Suspended for 90 days → eligible for archival.</li>
          <li>Order &amp; payment records: retained for 7 years (Kenyan tax / financial record requirements).</li>
          <li>Audit logs: retained for 2 years.</li>
          <li>AI answer logs: retained for 90 days, then anonymised.</li>
        </ul>

        <h2 className="mt-6 text-xl font-semibold">6. Your rights</h2>
        <p>You have the right to:</p>
        <ul>
          <li>Access your personal data (request a copy).</li>
          <li>Correct inaccurate data (via your profile page or by contacting us).</li>
          <li>Delete your account (subject to legal retention requirements — order records must be kept).</li>
          <li>Object to direct marketing (opt out via your profile or unsubscribe link).</li>
          <li>Withdraw consent for AI features (disable AI in business settings, or contact us).</li>
          <li>Lodge a complaint with the Office of the Data Protection Commissioner (Kenya) if you believe we have mishandled your data.</li>
        </ul>

        <h2 className="mt-6 text-xl font-semibold">7. Security</h2>
        <ul>
          <li>Passwords hashed with scrypt (memory-hard, GPU-resistant).</li>
          <li>Secrets encrypted at rest with AES-256-GCM.</li>
          <li>HTTPS enforced in production.</li>
          <li>Server-side authorisation on every API route; client-side UI is decorative only.</li>
          <li>Per-business data isolation — application-layer enforced today, PostgreSQL Row-Level Security in production.</li>
          <li>Audit logging for all sensitive operations.</li>
        </ul>
        <p>
          No system is 100% secure. If we discover a breach, we will notify affected users within 72 hours, in line with Kenyan DPA requirements.
        </p>

        <h2 className="mt-6 text-xl font-semibold">8. Children</h2>
        <p>
          OHWASIS is not intended for users under 18. We do not knowingly collect data from minors. If you believe a minor has registered, contact us and we will delete the account.
        </p>

        <h2 className="mt-6 text-xl font-semibold">9. International transfers</h2>
        <p>
          Your data may be processed in Kenya or in cloud regions outside Kenya (e.g. Vercel, Supabase). We rely on standard contractual clauses and provider DPAs for such transfers.
        </p>

        <h2 className="mt-6 text-xl font-semibold">10. Changes to this policy</h2>
        <p>
          We may update this Privacy Policy from time to time. Material changes will be notified by email at least 14 days before taking effect.
        </p>

        <h2 className="mt-6 text-xl font-semibold">11. Contact</h2>
        <p>
          For data subject requests, questions about this policy, or to report a privacy concern, contact Aevibron at{' '}
          <a href={`mailto:${AEVIBRON_CONTACT}`} className="text-primary hover:underline">{AEVIBRON_CONTACT}</a>.
        </p>

        <hr className="my-8 border-border" />
        <p className="text-xs text-muted-foreground">
          OHWASIS — One Hosted Web Architecture Serving Isolated Storefronts. Built by Aevibron.
        </p>
      </main>
    </div>
  )
}

void NextResponse
