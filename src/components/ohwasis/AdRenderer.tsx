'use client'

import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'

export interface AdData {
  id: string
  title: string
  description: string
  imageUrl: string | null
  linkUrl: string | null
  ctaLabel: string
  ctaAction: string
  placement: string
  isSponsored: boolean
  sponsoredLabel: string
  priority: number
  deviceTarget: string
  targetAudience: string[]
  maxWidth: number
  maxHeight: number
  minHeight: number
  imageFit: string
  imagePosition: string
  theme: Record<string, unknown>
  perVisitorFreq: number
  tenant: { id: string; handle: string; displayName: string } | null
}

const DEFAULT_THEME: Record<string, string> = {
  backgroundColor: '#0b1020',
  titleColor: '#D4AF37',
  descriptionColor: '#ccd0d8',
  borderColor: '#D4AF3733',
  borderWidth: '1',
  borderRadius: '12',
  ctaBg: '#D4AF37',
  ctaText: '#0b1020',
  ctaBorderRadius: '8',
  sponsoredBg: '#D4AF3722',
  sponsoredText: '#D4AF37',
  padding: '16',
  shadow: 'sm',
}

/**
 * AdRenderer — renders a single advertisement with responsive behavior,
 * theme customization, image fallback, and click tracking.
 *
 * Placement determines the layout:
 *   - top_banner: horizontal banner with image left, text right
 *   - featured_business: card with large image
 *   - marketplace_feed: compact inline card
 *   - popup: modal-style overlay (handled by parent)
 *
 * Image handling:
 *   - Shows skeleton while loading
 *   - Falls back to a branded gradient block if image fails
 *   - Uses object-fit based on imageFit setting
 *   - Responsive: image hidden on very small screens if maxHeight is too small
 *
 * Responsive behavior:
 *   - maxWidth constrains the container
 *   - maxHeight limits height on desktop
 *   - minHeight ensures minimum height
 *   - On mobile, text wraps and CTA goes full width
 *   - No horizontal scroll ever
 */
export function AdRenderer({ ad, onDismiss }: { ad: AdData; onDismiss?: () => void }) {
  const [imageStatus, setImageStatus] = useState<'loading' | 'loaded' | 'error'>('loading')
  const [viewport, setViewport] = useState<'mobile' | 'tablet' | 'desktop'>('desktop')
  const theme: Record<string, string> = { ...DEFAULT_THEME }
  // Merge ad.theme (Record<string, unknown>) into theme, casting values to string
  if (ad.theme) {
    for (const [key, value] of Object.entries(ad.theme)) {
      if (typeof value === 'string') theme[key] = value
    }
  }

  useEffect(() => {
    const updateViewport = () => {
      const w = window.innerWidth
      if (w < 640) setViewport('mobile')
      else if (w < 1024) setViewport('tablet')
      else setViewport('desktop')
    }
    updateViewport()
    window.addEventListener('resize', updateViewport)
    return () => window.removeEventListener('resize', updateViewport)
  }, [])

  // Device targeting — skip if device doesn't match
  if (ad.deviceTarget !== 'all' && ad.deviceTarget !== viewport) return null

  const handleImageLoad = () => setImageStatus('loaded')
  const handleImageError = () => setImageStatus('error')

  const trackClick = async () => {
    try {
      await fetch(`/api/ads/${ad.id}/click`, { method: 'POST', credentials: 'same-origin' })
    } catch { /* best-effort */ }
  }

  // Placement-specific rendering
  if (ad.placement === 'popup') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur">
        <div
          className="relative max-w-md overflow-hidden rounded-2xl shadow-2xl"
          style={{
            backgroundColor: theme.backgroundColor,
            border: `${theme.borderWidth}px solid ${theme.borderColor}`,
            borderRadius: `${theme.borderRadius}px`,
          }}
        >
          {onDismiss && (
            <button
              onClick={onDismiss}
              className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-background/80 text-muted-foreground hover:bg-background"
              aria-label="Close advertisement"
            >
              ✕
            </button>
          )}
          <AdContent
            ad={ad}
            theme={theme}
            imageStatus={imageStatus}
            onImageLoad={handleImageLoad}
            onImageError={handleImageError}
            onTrackClick={trackClick}
            layout="card"
          />
        </div>
      </div>
    )
  }

  if (ad.placement === 'featured_business') {
    return (
      <div
        className="overflow-hidden rounded-xl shadow-sm transition-shadow hover:shadow-md"
        style={{
          backgroundColor: theme.backgroundColor,
          border: `${theme.borderWidth}px solid ${theme.borderColor}`,
          borderRadius: `${theme.borderRadius}px`,
          maxWidth: `${ad.maxWidth}px`,
        }}
      >
        <AdContent
          ad={ad}
          theme={theme}
          imageStatus={imageStatus}
          onImageLoad={handleImageLoad}
          onImageError={handleImageError}
          onTrackClick={trackClick}
          layout="card"
        />
      </div>
    )
  }

  // top_banner, marketplace_feed, category_page, search_results — banner layout
  return (
    <div
      className="overflow-hidden rounded-xl"
      style={{
        backgroundColor: theme.backgroundColor,
        border: `${theme.borderWidth}px solid ${theme.borderColor}`,
        borderRadius: `${theme.borderRadius}px`,
        maxWidth: `${ad.maxWidth}px`,
        minHeight: `${ad.minHeight}px`,
        maxHeight: viewport === 'mobile' ? `${Math.min(ad.maxHeight, 160)}px` : `${ad.maxHeight}px`,
      }}
    >
      <AdContent
        ad={ad}
        theme={theme}
        imageStatus={imageStatus}
        onImageLoad={handleImageLoad}
        onImageError={handleImageError}
        onTrackClick={trackClick}
        layout="banner"
      />
    </div>
  )
}

function AdContent({
  ad,
  theme,
  imageStatus,
  onImageLoad,
  onImageError,
  onTrackClick,
  layout,
}: {
  ad: AdData
  theme: Record<string, string>
  imageStatus: 'loading' | 'loaded' | 'error'
  onImageLoad: () => void
  onImageError: () => void
  onTrackClick: () => void
  layout: 'banner' | 'card'
}) {
  const hasImage = !!ad.imageUrl
  const showImage = hasImage && imageStatus !== 'error'
  const objectFit = ad.imageFit === 'contain' ? 'contain' : ad.imageFit === 'fill' ? 'fill' : 'cover'
  const objectPosition = ad.imagePosition || 'center'

  const handleClick = () => {
    void onTrackClick()
    if (ad.linkUrl) {
      window.open(ad.linkUrl, '_blank', 'noopener,noreferrer')
    }
  }

  return (
    <div
      className={cn(
        'flex',
        layout === 'banner'
          ? 'flex-row items-start sm:items-center flex-wrap sm:flex-nowrap gap-2 sm:gap-3'
          : 'flex-col',
        'p-3 sm:p-4',
      )}
      style={{ padding: theme.padding + 'px' }}
    >
      {/* Image */}
      {showImage && (
        <div
          className={cn(
            'relative shrink-0 overflow-hidden',
            layout === 'banner' ? 'h-12 w-12 sm:h-16 sm:w-16' : 'aspect-video w-full',
          )}
          style={{ borderRadius: '8px' }}
        >
          {imageStatus === 'loading' && (
            <div className="absolute inset-0 animate-pulse bg-muted/30" />
          )}
          <img
            src={ad.imageUrl!}
            alt={ad.title}
            onLoad={onImageLoad}
            onError={onImageError}
            className={cn('h-full w-full transition-opacity', imageStatus === 'loaded' ? 'opacity-100' : 'opacity-0')}
            style={{ objectFit: objectFit as 'contain' | 'cover' | 'fill', objectPosition }}
            loading="lazy"
          />
        </div>
      )}

      {/* Fallback gradient block when image fails or is missing */}
      {!showImage && layout === 'banner' && (
        <div
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg sm:h-16 sm:w-16"
          style={{ background: 'linear-gradient(135deg, #D4AF3733, #a855f722)' }}
        >
          <span className="text-[10px] font-bold text-muted-foreground">AD</span>
        </div>
      )}

      {/* Content — flex-1 so it takes available space, min-w-0 to allow truncation */}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {ad.isSponsored && (
          <span
            className="inline-block w-fit rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide"
            style={{ backgroundColor: theme.sponsoredBg, color: theme.sponsoredText }}
          >
            {ad.sponsoredLabel}
          </span>
        )}
        <h3
          className="line-clamp-2 text-xs font-semibold sm:text-sm"
          style={{ color: theme.titleColor }}
        >
          {ad.title}
        </h3>
        <p
          className="line-clamp-2 text-xs leading-snug"
          style={{ color: theme.descriptionColor }}
        >
          {ad.description}
        </p>
        {ad.tenant && (
          <p className="text-[10px] text-muted-foreground">{ad.tenant.displayName}</p>
        )}
      </div>

      {/* CTA button — shrink-0 so it never gets squeezed out */}
      <button
        onClick={handleClick}
        className={cn(
          'shrink-0 self-start text-xs font-semibold transition-opacity hover:opacity-90 sm:self-center',
          layout === 'banner' ? 'px-3 py-1.5' : 'px-4 py-2',
        )}
        style={{
          backgroundColor: theme.ctaBg,
          color: theme.ctaText,
          borderRadius: `${theme.ctaBorderRadius}px`,
        }}
      >
        {ad.ctaLabel}
      </button>
    </div>
  )
}
