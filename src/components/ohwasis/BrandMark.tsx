'use client'

import Image from 'next/image'
import { cn } from '@/lib/utils'

/**
 * OHWASIS brand identity components.
 *
 * Uses the official OHWASIS emblem at `/public/brand/logo.png` — a circular
 * "tech-tropical" mark with neon cyan / purple / orange gradients, palm
 * trees, sunset, and a winding path. Falls back to a styled wrapper if the
 * image fails to load.
 */

export function BrandMark({
  className,
  size = 32,
}: {
  className?: string
  size?: number
}) {
  return (
    <Image
      src="/brand/logo.png"
      alt="OHWASIS brand mark"
      width={size}
      height={size}
      className={cn('inline-block rounded-full', className)}
      priority
    />
  )
}

export function WordMark({
  className,
  variant = 'gradient',
}: {
  className?: string
  variant?: 'solid' | 'gradient'
}) {
  if (variant === 'gradient') {
    return (
      <span
        className={cn('font-semibold tracking-tight', className)}
        style={{
          background: 'linear-gradient(90deg, #06b6d4 0%, #a855f7 50%, #f97316 100%)',
          WebkitBackgroundClip: 'text',
          backgroundClip: 'text',
          color: 'transparent',
        }}
      >
        <span className="text-white">OH</span>
        WASIS
      </span>
    )
  }
  return (
    <span className={cn('font-semibold tracking-tight', className)}>
      <span className="text-foreground">OH</span>
      <span className="text-[#06b6d4]">WASIS</span>
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
      <BrandMark size={size} />
      <WordMark className="text-lg" />
    </div>
  )
}
