'use client'

/**
 * OHWASIS reusable scroll / load animations.
 *
 * Four signature effects:
 *   1. <ShatterImage>      — hero image breaks into a grid of tiles that
 *                            assemble on load (3D rotateY flip-in).
 *   2. <CurtainReveal>      — solid curtain rises to reveal content when it
 *                            scrolls into view.
 *   3. <VenetianBlinds>     — image hidden behind horizontal slats that
 *                            rotate open sequentially (3D rotateX).
 *   4. <TileFlip>           — content flips into place on its Y axis when
 *                            scrolled into view.
 *
 * Every effect honours `prefers-reduced-motion`: when the user has the
 * setting enabled, the component renders its final state with no animation.
 */

import Image from 'next/image'
import { motion } from 'framer-motion'
import { type CSSProperties, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { useReducedMotion } from '@/lib/useReducedMotion'

const EASE_OUT = [0.22, 1, 0.36, 1] as const

/* -------------------------------------------------------------------------- */
/* 1. 3D Shatter — hero image assembles from a tile grid on load              */
/* -------------------------------------------------------------------------- */

export function ShatterImage({
  src,
  alt,
  cols = 6,
  rows = 4,
  className,
}: {
  src: string
  alt: string
  cols?: number
  rows?: number
  className?: string
}) {
  const reduce = useReducedMotion()

  const tiles: { r: number; c: number }[] = []
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      tiles.push({ r, c })
    }
  }

  if (reduce) {
    return (
      <div className={cn('relative overflow-hidden', className)} role="img" aria-label={alt}>
        <img src={src} alt={alt} className="h-full w-full object-cover" />
      </div>
    )
  }

  return (
    <div
      className={cn('relative overflow-hidden', className)}
      style={{ perspective: 1200 }}
      role="img"
      aria-label={alt}
    >
      {tiles.map(({ r, c }) => (
        <motion.div
          key={`${r}-${c}`}
          className="absolute"
          style={{
            top: `${(r / rows) * 100}%`,
            left: `${(c / cols) * 100}%`,
            width: `${100 / cols}%`,
            height: `${100 / rows}%`,
            backgroundImage: `url(${src})`,
            backgroundSize: `${cols * 100}% ${rows * 100}%`,
            backgroundPosition: `${(c / (cols - 1)) * 100}% ${(r / (rows - 1)) * 100}%`,
            transformStyle: 'preserve-3d',
            backfaceVisibility: 'hidden',
          }}
          initial={{ rotateY: -95, opacity: 0, z: -180 }}
          animate={{ rotateY: 0, opacity: 1, z: 0 }}
          transition={{
            duration: 0.9,
            delay: (r + c) * 0.06,
            ease: EASE_OUT,
          }}
        />
      ))}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* 2. 3D Curtain — solid panel rises to reveal content                       */
/* -------------------------------------------------------------------------- */

export function CurtainReveal({
  children,
  className,
  from = '#0b1020',
  to = '#1e1b4b',
}: {
  children: ReactNode
  className?: string
  from?: string
  to?: string
}) {
  const reduce = useReducedMotion()

  if (reduce) {
    return <div className={className}>{children}</div>
  }

  return (
    <div className={cn('relative', className)}>
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-10"
        style={{
          background: `linear-gradient(180deg, ${from} 0%, ${to} 100%)`,
          transformOrigin: 'top',
        }}
        initial={{ scaleY: 1 }}
        whileInView={{ scaleY: 0 }}
        viewport={{ once: true, margin: '-100px' }}
        transition={{ duration: 0.85, ease: EASE_OUT }}
      />
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-100px' }}
        transition={{ duration: 0.6, delay: 0.35, ease: 'easeOut' }}
      >
        {children}
      </motion.div>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* 3. Venetian Blinds — horizontal slats rotate open to reveal an image      */
/* -------------------------------------------------------------------------- */

export function VenetianBlinds({
  src,
  alt,
  className,
  slats = 8,
  sizes = '(max-width: 768px) 100vw, 50vw',
}: {
  src: string
  alt: string
  className?: string
  slats?: number
  sizes?: string
}) {
  const reduce = useReducedMotion()

  const slatStyle = (i: number): CSSProperties => ({
    top: `${(i / slats) * 100}%`,
    height: `${100 / slats + 0.5}%`,
    transformOrigin: 'top center',
  })

  if (reduce) {
    return (
      <div className={cn('relative overflow-hidden', className)}>
        <Image src={src} alt={alt} fill sizes={sizes} className="object-cover" />
      </div>
    )
  }

  return (
    <div
      className={cn('relative overflow-hidden', className)}
      style={{ perspective: 900, transformStyle: 'preserve-3d' }}
    >
      <Image src={src} alt={alt} fill sizes={sizes} className="object-cover" />
      {Array.from({ length: slats }).map((_, i) => (
        <motion.div
          key={i}
          aria-hidden
          className="absolute left-0 w-full bg-gradient-to-r from-[#0f172a] via-[#1e1b4b] to-[#0f172a]"
          style={slatStyle(i)}
          initial={{ rotateX: 0, opacity: 1 }}
          whileInView={{ rotateX: 90, opacity: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{
            duration: 0.55,
            delay: i * 0.07,
            ease: 'easeInOut',
          }}
        />
      ))}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* 4. 3D Tile Flip — content flips into place on scroll                      */
/* -------------------------------------------------------------------------- */

export function TileFlip({
  children,
  className,
  delay = 0,
  duration = 0.7,
}: {
  children: ReactNode
  className?: string
  delay?: number
  duration?: number
}) {
  const reduce = useReducedMotion()

  if (reduce) {
    return <div className={className}>{children}</div>
  }

  return (
    <motion.div
      className={className}
      style={{ perspective: 1000, transformStyle: 'preserve-3d' }}
      initial={{ rotateY: -90, opacity: 0, y: 30 }}
      whileInView={{ rotateY: 0, opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration, delay, ease: EASE_OUT }}
    >
      {children}
    </motion.div>
  )
}
