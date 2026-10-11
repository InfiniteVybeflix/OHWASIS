'use client'

import { cn } from '@/lib/utils'

/**
 * OHWASIS brand mark — a CSS/SVG original mark.
 *
 * The mark represents "an oasis in the desert of generic e-commerce":
 * concentric teal circles with a single accent dot (representing the
 * independent storefront) nested inside a protective outer ring.
 *
 * When official OHWASIS logo assets are provided, they should be placed at:
 *   /public/brand/logo.svg       — primary SVG mark
 *   /public/brand/logo.png       — raster fallback
 *   /public/brand/icon.svg       — standalone icon
 *   /public/favicon.ico          — browser favicon
 * and used in place of this component. See BRAND_ASSETS.md.
 */
export function BrandMark({
  className,
  size = 32,
}: {
  className?: string
  size?: number
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn('inline-block', className)}
      role="img"
      aria-label="OHWASIS brand mark"
    >
      {/* Outer protective ring */}
      <circle cx="24" cy="24" r="22" stroke="currentColor" strokeWidth="2" opacity="0.25" />
      {/* Inner teal disc */}
      <circle cx="24" cy="24" r="16" fill="currentColor" opacity="0.9" />
      {/* Accent dot — the independent storefront */}
      <circle cx="24" cy="24" r="5" fill="var(--accent, #f59e0b)" />
      {/* Two orbiting dots — the shared platform / multi-tenant idea */}
      <circle cx="38" cy="14" r="2.5" fill="currentColor" opacity="0.6" />
      <circle cx="10" cy="34" r="2.5" fill="currentColor" opacity="0.6" />
    </svg>
  )
}

export function WordMark({ className }: { className?: string }) {
  return (
    <span className={cn('font-semibold tracking-tight', className)}>
      <span className="text-foreground">OH</span>
      <span className="text-primary">WASIS</span>
    </span>
  )
}

export function BrandLockup({
  className,
  size = 28,
}: {
  className?: string
  size?: number
}) {
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <BrandMark size={size} className="text-primary" />
      <WordMark className="text-lg" />
    </div>
  )
}
