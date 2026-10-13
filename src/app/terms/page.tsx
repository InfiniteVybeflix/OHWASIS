import { NextResponse } from 'next/server'

export const dynamic = 'force-static'

export const metadata = {
  title: 'Terms & Conditions — OHWASIS',
  description: 'Terms and conditions for using the OHWASIS multi-tenant commerce platform.',
}

export default function TermsPage() {
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
        <h1 className="text-3xl font-bold tracking-tight">Terms &amp; Conditions</h1>
        <p className="text-sm text-muted-foreground">Effective {effective}</p>

        <h2 className="mt-8 text-xl font-semibold">1. Acceptance of terms</h2>
        <p>
          By accessing or using OHWASIS (&quot;the Platform&quot;, &quot;we&quot;, &quot;us&quot;), you agree to be bound by these Terms &amp; Conditions. If you do not agree, do not use the Platform. The Platform is operated by Aevibron ({AEVIBRON_CONTACT}).
        </p>

        <h2 className="mt-6 text-xl font-semibold">2. What OHWASIS is</h2>
        <p>
          OHWASIS is a multi-tenant commerce platform that lets independent businesses create and operate their own online storefronts. Each business (&quot;Tenant&quot;) has isolated data — products, customers, orders, and credentials are never shared across businesses. Customers can browse the marketplace, place orders, and review businesses.
        </p>

        <h2 className="mt-6 text-xl font-semibold">3. Two types of accounts</h2>
        <ul>
          <li><strong>Customer account:</strong> browse businesses, place orders, save addresses, leave reviews, manage your profile.</li>
          <li><strong>Business owner account:</strong> create one or more businesses, manage products, orders, payments, AI tools, and storefront content.</li>
        </ul>
        <p>
          You may have both types under the same email — sign up separately for each role. Business owners have access to the business dashboard; customers have access to the marketplace, orders, and profile.
        </p>

        <h2 className="mt-6 text-xl font-semibold">4. Customer responsibilities</h2>
        <ul>
          <li>Provide accurate contact details when placing orders — businesses use these to fulfil your order.</li>
          <li>Pay for orders using the payment methods the business has enabled.</li>
          <li>Do not abuse, harass, or defraud any business or other customer.</li>
          <li>Reviews must be honest and based on your own experience. Fake or paid reviews will be removed.</li>
          <li>You retain ownership of content you submit (reviews, profile info); you grant OHWASIS a licence to display it on the Platform.</li>
        </ul>

        <h2 className="mt-6 text-xl font-semibold">5. Business owner responsibilities</h2>
        <ul>
          <li>Accurately describe your business, products, and policies.</li>
          <li>Honour orders placed through the Platform, or cancel them honestly with the customer.</li>
          <li>Verify payments before marking orders as confirmed. Never mark a payment as paid if it was not received.</li>
          <li>Keep your M-Pesa Daraja credentials and other secrets confidential. They are encrypted at rest but you are responsible for their security.</li>
          <li>Comply with all applicable laws, including Kenyan consumer protection and data protection law.</li>
          <li>You are responsible for the quality, safety, and legality of the products you sell.</li>
        </ul>

        <h2 className="mt-6 text-xl font-semibold">6. Payments</h2>
        <p>
          OHWASIS integrates with payment providers (M-Pesa Daraja, manual Till/Paybill, cash on delivery) on behalf of businesses. Each business is the merchant of record for its own transactions. OHWASIS does not hold customer funds, act as a stored-value wallet, or process refunds directly — refunds are issued by the business through the original payment method.
        </p>
        <p>
          M-Pesa STK Push payments are verified via Safaricom&apos;s authoritative callback. A successful HTTP response from the STK push initiation does NOT constitute payment success. Only the callback&apos;s ResultCode = 0 means paid.
        </p>

        <h2 className="mt-6 text-xl font-semibold">7. Data &amp; privacy</h2>
        <p>
          We collect only the data necessary to operate the Platform. Each business sees only the customer data relevant to its own orders — your details saved at one business are not visible to other businesses. See our <a href="/privacy" className="text-primary hover:underline">Privacy Policy</a> for full details.
        </p>

        <h2 className="mt-6 text-xl font-semibold">8. AI features</h2>
        <p>
          OHWASIS uses AI (recommended provider: Aevibron Gateway) to assist business owners with setup, content drafting, and customer-question answering. AI output is treated as a suggestion — business owners must approve before anything is published. AI answers to customer questions use only the business&apos;s own knowledge base; no cross-business data leakage occurs.
        </p>
        <p>
          AI does not &quot;learn permanently&quot; — it improves only when business owners review answers and approve better responses, which are stored as new knowledge entries.
        </p>

        <h2 className="mt-6 text-xl font-semibold">9. Prohibited activities</h2>
        <ul>
          <li>Selling illegal, counterfeit, or restricted goods.</li>
          <li>Attempting to access another business&apos;s data, credentials, or customers.</li>
          <li>Scraping, rate-limit abuse, or denial-of-service attacks.</li>
          <li>Submitting malware or malicious code via the CMS or product images.</li>
          <li>Impersonating another business or individual.</li>
        </ul>

        <h2 className="mt-6 text-xl font-semibold">10. Limitation of liability</h2>
        <p>
          OHWASIS is provided &quot;as is&quot;. We are not liable for indirect, incidental, or consequential damages, including loss of profits, data, or customers. Our total liability is limited to the fees you paid us in the last 12 months (for paid plans) or USD 50 (for free plans).
        </p>
        <p>
          We are not liable for the actions of businesses or customers on the Platform — disputes between a business and a customer should be resolved between them. We may mediate but cannot guarantee resolution.
        </p>

        <h2 className="mt-6 text-xl font-semibold">11. Account suspension</h2>
        <p>
          We may suspend or terminate accounts that violate these Terms, fail to pay for orders, or pose a security risk. Businesses that are suspended can still log in to export their data; customers with pending orders will still receive them.
        </p>

        <h2 className="mt-6 text-xl font-semibold">12. Changes to these terms</h2>
        <p>
          We may update these Terms from time to time. Material changes will be notified by email to all active users at least 14 days before taking effect. Continued use after the effective date constitutes acceptance.
        </p>

        <h2 className="mt-6 text-xl font-semibold">13. Governing law</h2>
        <p>
          These Terms are governed by the laws of the Republic of Kenya. Disputes will be resolved in the courts of Kenya, unless otherwise required by mandatory local law.
        </p>

        <h2 className="mt-6 text-xl font-semibold">14. Contact</h2>
        <p>
          For any questions about these Terms, or to report abuse, contact Aevibron at{' '}
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

// Silence unused import warning if NextResponse is not used
void NextResponse
