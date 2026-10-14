import type { Metadata } from 'next'

export const dynamic = 'force-static'

export const metadata: Metadata = {
  title: 'About OHWASIS',
  description: 'Learn about OHWASIS — One Hosted Web Architecture Serving Isolated Storefronts.',
}

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/60 bg-background/95 backdrop-blur">
        <div className="container mx-auto max-w-3xl px-4 py-4">
          <a href="/" className="text-sm text-primary hover:underline">← Back to OHWASIS</a>
        </div>
      </header>
      <main className="container mx-auto max-w-3xl px-4 py-12">
        {/* Hero */}
        <div className="mb-12 text-center">
          <img
            src="https://i.ibb.co/0VRsCtRW/OHWASIS.png"
            alt="OHWASIS"
            width={120}
            height={120}
            className="mx-auto mb-6"
          />
          <h1 className="text-4xl font-bold tracking-tight">OHWASIS</h1>
          <p className="mt-2 text-lg text-muted-foreground">
            One Hosted Web Architecture Serving Isolated Storefronts
          </p>
          <p className="mt-4 text-lg font-medium" style={{ color: '#D4AF37' }}>
            Every business deserves its own space to grow.
          </p>
        </div>

        {/* What is OHWASIS */}
        <section className="mb-10">
          <h2 className="mb-4 text-2xl font-semibold">What is OHWASIS?</h2>
          <p className="mb-3 text-muted-foreground">
            OHWASIS is a multi-tenant commerce platform that lets independent businesses create,
            operate, and customize their own online storefronts — without accessing one another&apos;s
            data. One shared platform, isolated data, customizable commerce.
          </p>
          <p className="text-muted-foreground">
            Built for the Kenyan market with native M-Pesa Daraja integration, the Aevibron AI
            Gateway, and a customer marketplace inspired by platforms like Kilimall and Jumia,
            OHWASIS gives every business the tools to succeed online — from water delivery to
            restaurants, fashion to electronics.
          </p>
        </section>

        {/* Core principles */}
        <section className="mb-10">
          <h2 className="mb-4 text-2xl font-semibold">Core Principles</h2>
          <div className="space-y-4">
            <div className="rounded-lg border border-border/60 p-4">
              <h3 className="mb-1 font-medium" style={{ color: '#D4AF37' }}>One Shared Platform</h3>
              <p className="text-sm text-muted-foreground">
                A single, battle-tested infrastructure hosts every tenant. Updates, security patches,
                observability, and scaling are handled once — businesses never touch a server.
              </p>
            </div>
            <div className="rounded-lg border border-border/60 p-4">
              <h3 className="mb-1 font-medium" style={{ color: '#D4AF37' }}>Independent Businesses</h3>
              <p className="text-sm text-muted-foreground">
                Every merchant gets a private, branded storefront with its own products, customers,
                orders, payments, and credentials. No cross-tenant leakage — ever.
              </p>
            </div>
            <div className="rounded-lg border border-border/60 p-4">
              <h3 className="mb-1 font-medium" style={{ color: '#D4AF37' }}>Isolated Data</h3>
              <p className="text-sm text-muted-foreground">
                Tenant isolation is enforced at the application layer and at the database layer.
                Each business sees only its own customers. A customer&apos;s details saved at one
                shop are never visible to another.
              </p>
            </div>
            <div className="rounded-lg border border-border/60 p-4">
              <h3 className="mb-1 font-medium" style={{ color: '#D4AF37' }}>Customizable Storefronts</h3>
              <p className="text-sm text-muted-foreground">
                Branding, products, categories, CMS pages, delivery zones, discounts, payment
                methods, opening hours — all managed from a real business dashboard. No code edits
                per tenant.
              </p>
            </div>
            <div className="rounded-lg border border-border/60 p-4">
              <h3 className="mb-1 font-medium" style={{ color: '#D4AF37' }}>Reliable Commerce</h3>
              <p className="text-sm text-muted-foreground">
                Real M-Pesa Daraja STK Push integration with idempotent callbacks. Honest payment
                states — we never fake success. AI assistant powered by Aevibron Gateway, scoped
                per business with no knowledge leakage.
              </p>
            </div>
          </div>
        </section>

        {/* Who is it for */}
        <section className="mb-10">
          <h2 className="mb-4 text-2xl font-semibold">Who is it for?</h2>
          <ul className="ml-6 list-disc space-y-2 text-muted-foreground">
            <li><strong>Water &amp; Refill businesses</strong> — container returns, deposits, refill sizes, delivery zones</li>
            <li><strong>Restaurants &amp; food delivery</strong> — modifiers, preparation times, pickup, delivery</li>
            <li><strong>Groceries &amp; general retail</strong> — variable quantities, unit pricing, delivery zones</li>
            <li><strong>Fashion &amp; apparel</strong> — size variants, color variants, variant images</li>
            <li><strong>Cosmetics &amp; personal care</strong> — shade variants, product galleries</li>
            <li><strong>Electronics</strong> — warranty info, specifications</li>
            <li><strong>Any product-based business</strong> — the platform is industry-agnostic</li>
          </ul>
        </section>

        {/* Three portals */}
        <section className="mb-10">
          <h2 className="mb-4 text-2xl font-semibold">Three Portals</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-lg border border-border/60 p-4 text-center">
              <div className="mb-2 text-3xl">🏪</div>
              <h3 className="font-medium">Business Dashboard</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Manage products, orders, payments, AI tools, CMS, and storefront settings.
              </p>
            </div>
            <div className="rounded-lg border border-border/60 p-4 text-center">
              <div className="mb-2 text-3xl">🛍️</div>
              <h3 className="font-medium">Customer Marketplace</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Browse shops, search products, place orders, leave reviews, manage wishlist.
              </p>
            </div>
            <div className="rounded-lg border border-border/60 p-4 text-center">
              <div className="mb-2 text-3xl">⚙️</div>
              <h3 className="font-medium">Admin Console</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Manage merchants, users, advertisements, feature flags, and audit logs.
              </p>
            </div>
          </div>
        </section>

        {/* Tech */}
        <section className="mb-10">
          <h2 className="mb-4 text-2xl font-semibold">Built With</h2>
          <div className="flex flex-wrap gap-2">
            {['Next.js 16', 'TypeScript', 'Prisma', 'PostgreSQL (Supabase)', 'Tailwind CSS', 'shadcn/ui', 'M-Pesa Daraja', 'Aevibron AI Gateway', 'PWA'].map((tech) => (
              <span key={tech} className="rounded-full border border-border/60 px-3 py-1 text-xs text-muted-foreground">{tech}</span>
            ))}
          </div>
        </section>

        {/* Contact */}
        <section className="mb-10 rounded-lg border p-6 text-center" style={{ borderColor: '#D4AF3744', background: 'linear-gradient(135deg, #D4AF3708, transparent)' }}>
          <h2 className="mb-2 text-xl font-semibold">Get in touch</h2>
          <p className="mb-4 text-sm text-muted-foreground">
            Questions? Support? Want to list your business on OHWASIS?
          </p>
          <a
            href="https://ohwasis.vercel.app"
            className="inline-block rounded-lg px-6 py-3 text-sm font-medium text-white"
            style={{ background: 'linear-gradient(135deg, #D4AF37, #B8860B)' }}
          >
            Visit OHWASIS
          </a>
          <p className="mt-4 text-xs text-muted-foreground">
            Built by <a href="mailto:aevibron@gmail.com" className="text-primary hover:underline">Aevibron</a> · V1.0.0
          </p>
        </section>
      </main>
    </div>
  )
}
