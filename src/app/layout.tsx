import type { Metadata, Viewport } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import './globals.css'

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

export const metadata: Metadata = {
  title: 'OHWASIS — One Hosted Web Architecture Serving Isolated Storefronts',
  description:
    'A multi-tenant commerce platform: one shared infrastructure, independent businesses, isolated data. Browse the marketplace, run your shop, install as an app.',
  keywords: ['OHWASIS', 'multi-tenant commerce', 'SaaS', 'Kenya', 'M-Pesa Daraja', 'Aevibron', 'marketplace'],
  authors: [{ name: 'Aevibron', url: 'https://aevibron-gateway.vercel.app' }],
  manifest: '/manifest.json',
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: '/apple-touch-icon.png',
  },
  openGraph: {
    title: 'OHWASIS',
    description: 'Every business deserves its own space to grow.',
    url: '/',
    siteName: 'OHWASIS',
    type: 'website',
    images: ['/brand/og-image.png'],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'OHWASIS',
    description: 'Every business deserves its own space to grow.',
    images: ['/brand/og-image.png'],
  },
  applicationName: 'OHWASIS',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'OHWASIS',
  },
}

export const viewport: Viewport = {
  themeColor: '#06b6d4',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  viewportFit: 'cover',
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
      </body>
    </html>
  )
}
