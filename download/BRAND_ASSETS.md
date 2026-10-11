# OHWASIS — Brand Assets Guide

This document specifies exactly where official OHWASIS logos, icons, favicons, and other brand assets should be placed.

## 1. Current state

This build uses an **original CSS/SVG brand mark** defined in `src/components/ohwasis/BrandMark.tsx`. It is NOT the official OHWASIS logo — it is a placeholder mark that conveys the brand concept (an oasis — concentric teal rings with an accent dot representing the independent storefront, plus orbiting dots representing the shared multi-tenant platform).

The official OHWASIS brand assets have **not** been provided. When they are, follow this guide to replace the placeholder.

## 2. Asset directory structure

When official assets are provided, place them at:

```
public/
├── brand/
│   ├── logo.svg              ← primary SVG logo (full lockup)
│   ├── logo.png              ← raster fallback (512×512 transparent)
│   ├── logo-mark.svg         ← standalone icon mark (no wordmark)
│   ├── logo-mark-white.svg   ← white version for dark backgrounds
│   └── og-image.png          ← social sharing image (1200×630)
├── favicon.ico                ← browser favicon (32×32 multi-res)
├── icon-192.png               ← PWA icon 192×192
├── icon-512.png               ← PWA icon 512×512
├── apple-touch-icon.png       ← iOS home screen icon (180×180)
└── icons/
    ├── arrow-right.svg
    ├── shopping-cart.svg
    └── ...                    ← any additional UI icons
```

## 3. Replacing the placeholder

### 3.1 Update `BrandMark.tsx`

Replace the SVG markup in `src/components/ohwasis/BrandMark.tsx` with:

```tsx
'use client'

import Image from 'next/image'
import { cn } from '@/lib/utils'

export function BrandMark({ className, size = 32 }: { className?: string; size?: number }) {
  return (
    <Image
      src="/brand/logo-mark.svg"
      alt="OHWASIS brand mark"
      width={size}
      height={size}
      className={cn('inline-block', className)}
      priority
    />
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

export function BrandLockup({ className, size = 28 }: { className?: string; size?: number }) {
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <BrandMark size={size} />
      <WordMark className="text-lg" />
    </div>
  )
}
```

### 3.2 Update `layout.tsx` metadata

Update `src/app/layout.tsx` to reference the new favicon and OG image:

```tsx
export const metadata: Metadata = {
  title: 'OHWASIS — One Hosted Web Architecture Serving Isolated Storefronts',
  description: 'Every business deserves its own space to grow.',
  icons: {
    icon: '/favicon.ico',
    apple: '/apple-touch-icon.png',
  },
  openGraph: {
    title: 'OHWASIS',
    description: 'Every business deserves its own space to grow.',
    images: ['/brand/og-image.png'],
  },
}
```

### 3.3 Update `manifest.json` (if PWA support is added)

```json
{
  "name": "OHWASIS",
  "short_name": "OHWASIS",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

## 4. Brand guidelines

When the official brand guide is produced, it should specify:

- **Primary color** (replaces `#0f766e` teal-700 in the placeholder)
- **Accent color** (replaces `#f59e0b` amber-500)
- **Background** (default `#ffffff`)
- **Foreground** (default `#0f172a`)
- **Typography** (default `Inter, system-ui, sans-serif`)
- **Logo clear space** (minimum padding around the mark)
- **Logo misuse** (don't stretch, recolor, rotate)

These values flow through to merchant themes via `Tenant.theme` JSON. The platform default lives in `src/app/api/tenants/onboard/route.ts` → `defaultTheme()`.

## 5. What NOT to do

- **Do not** create fake official logos. If official assets are missing, use the placeholder CSS/SVG mark.
- **Do not** use another business's identity. OHWASIS is its own brand.
- **Do not** leave broken image references. If an asset is missing, the placeholder handles it gracefully.
- **Do not** require source-code changes to swap brand assets. The directory structure above is sufficient — replace the files and the next build picks them up.

## 6. Trademark & legal

- The name "OHWASIS" is a working product name. Do NOT assume the trademark is legally cleared — document this as a launch consideration.
- The expansion "One Hosted Web Architecture Serving Isolated Storefronts" is a working tagline; same caveat.
- Before public launch, commission a trademark search in the target jurisdictions (Kenya first, then international as expansion warrants).
- If the trademark is unavailable, pick a new name BEFORE public launch — renaming after launch is painful.

## 7. Asset delivery checklist

When the official brand assets are delivered, verify each one:

- [ ] `logo.svg` — opens in browser, renders correctly, no embedded base64
- [ ] `logo.png` — 512×512, transparent background, looks crisp on white and dark
- [ ] `logo-mark.svg` — standalone icon, no wordmark, square aspect ratio
- [ ] `logo-mark-white.svg` — white version for dark backgrounds
- [ ] `favicon.ico` — multi-resolution (16, 32, 48), renders in browser tab
- [ ] `icon-192.png` and `icon-512.png` — square, transparent
- [ ] `apple-touch-icon.png` — 180×180, opaque background (iOS adds rounded corners)
- [ ] `og-image.png` — 1200×630, looks good when shared on Twitter / Facebook / LinkedIn
- [ ] Brand guide PDF — primary, accent, typography, clear space, misuse examples

Place each in its specified location, commit, deploy. The next build serves them at the canonical URLs.

## 8. Footer attribution

The current footer shows:

```
© 2026 OHWASIS — One Hosted Web Architecture Serving Isolated Storefronts
```

Update the year automatically (already done via `new Date().getFullYear()` in `src/components/Header.tsx`). When the official brand guide specifies a different footer treatment, update the `Footer` component in `src/components/Header.tsx`.
