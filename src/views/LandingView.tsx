'use client'

import { useEffect, useState } from 'react'
import { useOhwasisStore, apiFetch } from '@/lib/store'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { BrandMark } from '@/components/ohwasis/BrandMark'
import { Store, ShieldCheck, Wallet, Bot, Globe, Layers, ArrowRight } from 'lucide-react'
import { cn } from '@/lib/utils'

interface TenantDTO {
  id: string
  handle: string
  displayName: string
  tagline?: string | null
  industry: string
  theme?: string | null
}

export function LandingView() {
  const setView = useOhwasisStore((s) => s.setView)
  const setActiveTenant = useOhwasisStore((s) => s.setActiveTenant)
  const setAuthModal = useOhwasisStore((s) => s.setAuthModal)
  const session = useOhwasisStore((s) => s.session)
  const [tenants, setTenants] = useState<TenantDTO[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    void (async () => {
      try {
        const data = await apiFetch<{ tenants: TenantDTO[] }>('/api/tenants/list')
        setTenants(data.tenants)
      } catch {
        // ignore — empty directory
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  const openStorefront = (handle: string) => {
    setActiveTenant(handle)
    setView('storefront')
  }

  return (
    <div className="flex flex-col">
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-border/60 bg-gradient-to-br from-primary/5 via-background to-accent/5">
        <div className="container mx-auto max-w-7xl px-4 py-16 sm:py-24">
          <div className="mx-auto max-w-3xl text-center">
            <div className="mb-6 flex justify-center">
              <div className="rounded-full border border-border/60 bg-background p-3 shadow-sm">
                <BrandMark size={48} className="text-primary" />
              </div>
            </div>
            <Badge variant="secondary" className="mb-4">
              Multi-tenant commerce SaaS
            </Badge>
            <h1 className="text-balance text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl">
              Every business deserves
              <br />
              <span className="text-primary">its own space to grow.</span>
            </h1>
            <p className="mt-6 text-pretty text-lg text-muted-foreground">
              OHWASIS is shared infrastructure for independent storefronts. One platform,
              isolated data, customizable commerce — built for businesses that take their
              customers seriously.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              {!session.user ? (
                <>
                  <Button size="lg" onClick={() => setAuthModal('signup')}>
                    Start your storefront
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                  <Button size="lg" variant="outline" onClick={() => setAuthModal('login')}>
                    Sign in
                  </Button>
                </>
              ) : (
                <Button size="lg" onClick={() => setView('merchant')}>
                  Open merchant dashboard
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="border-b border-border/60 bg-background">
        <div className="container mx-auto max-w-7xl px-4 py-12 sm:py-16">
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            <FeatureCard
              icon={Layers}
              title="Multi-tenant by design"
              description="Every merchant's products, customers, orders, payments, and credentials are isolated at the data layer. No cross-tenant leakage."
            />
            <FeatureCard
              icon={Wallet}
              title="Real M-Pesa Daraja"
              description="Native STK Push integration with idempotent callbacks, amount verification, and honest payment states. Manual/COD also supported."
            />
            <FeatureCard
              icon={Bot}
              title="Aevibron AI Gateway"
              description="Provider-neutral AI layer with tenant-scoped prompts. Recommended provider Aevibron; OpenAI-compatible adapters supported."
            />
            <FeatureCard
              icon={Store}
              title="Configurable storefronts"
              description="Branding, products, categories, CMS pages, delivery zones, discounts — all managed from a real merchant dashboard. No code edits per tenant."
            />
            <FeatureCard
              icon={ShieldCheck}
              title="Audited security"
              description="Server-side authorization on every route. Audit events for sensitive operations. Encrypted secrets at rest. Role-based merchant access."
            />
            <FeatureCard
              icon={Globe}
              title="Domain & routing ready"
              description="Custom-domain verification hooks and tenant routing by verified hostname. Admin route slugs are collision-resistant and configurable."
            />
          </div>
        </div>
      </section>

      {/* Merchant directory */}
      <section className="bg-muted/20">
        <div className="container mx-auto max-w-7xl px-4 py-12 sm:py-16">
          <div className="mb-8 flex items-end justify-between">
            <div>
              <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Browse storefronts</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Real merchants running on OHWASIS right now.
              </p>
            </div>
          </div>
          {loading ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3].map((i) => (
                <Card key={i} className="animate-pulse">
                  <CardHeader>
                    <div className="h-6 w-2/3 rounded bg-muted" />
                    <div className="h-4 w-1/3 rounded bg-muted" />
                  </CardHeader>
                  <CardContent>
                    <div className="h-4 w-full rounded bg-muted" />
                    <div className="mt-2 h-4 w-2/3 rounded bg-muted" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : tenants.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
                <Store className="h-10 w-10 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  No merchants published yet. Be the first to launch your storefront on OHWASIS.
                </p>
                {!session.user && (
                  <Button onClick={() => setAuthModal('signup')}>Get started</Button>
                )}
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {tenants.map((t) => (
                <Card
                  key={t.id}
                  className="cursor-pointer transition-shadow hover:shadow-md"
                  onClick={() => openStorefront(t.handle)}
                >
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div
                        className="flex h-10 w-10 items-center justify-center rounded-lg text-sm font-bold text-white"
                        style={{ backgroundColor: parseTheme(t.theme)?.primary ?? '#0f766e' }}
                      >
                        {t.displayName.slice(0, 2).toUpperCase()}
                      </div>
                      <Badge variant="outline" className="text-[10px]">
                        {industryLabel(t.industry)}
                      </Badge>
                    </div>
                    <CardTitle className="text-lg">{t.displayName}</CardTitle>
                    {t.tagline && <p className="text-sm text-muted-foreground">{t.tagline}</p>}
                  </CardHeader>
                  <CardContent>
                    <Button variant="outline" size="sm" className="w-full">
                      Visit storefront
                      <ArrowRight className="ml-2 h-3.5 w-3.5" />
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Onboarding CTA */}
      {!session.user && (
        <section className="border-t border-border/60 bg-background">
          <div className="container mx-auto max-w-7xl px-4 py-12 sm:py-16">
            <Card className="overflow-hidden">
              <CardContent className="flex flex-col items-start gap-4 p-8 sm:flex-row sm:items-center sm:justify-between sm:p-10">
                <div>
                  <h3 className="text-2xl font-bold tracking-tight">Bring your business online</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Pick a handle, choose an industry template, add products, configure payments,
                    publish. No code. No vendor lock-in.
                  </p>
                </div>
                <Button size="lg" onClick={() => setAuthModal('signup')}>
                  Create your storefront
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </CardContent>
            </Card>
          </div>
        </section>
      )}
    </div>
  )
}

function FeatureCard({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  description: string
}) {
  return (
    <Card>
      <CardHeader>
        <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="h-5 w-5" />
        </div>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  )
}

function parseTheme(themeStr: string | null | undefined): Record<string, string> | null {
  if (!themeStr) return null
  try {
    return JSON.parse(themeStr)
  } catch {
    return null
  }
}

function industryLabel(industry: string): string {
  const labels: Record<string, string> = {
    water_refill: 'Water & Refill',
    restaurant: 'Restaurant',
    grocery: 'Grocery',
    fashion: 'Fashion',
    cosmetics: 'Cosmetics',
    electronics: 'Electronics',
    general_retail: 'Retail',
  }
  return labels[industry] ?? industry
}

void cn
