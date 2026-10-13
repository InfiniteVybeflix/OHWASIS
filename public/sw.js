// /public/sw.js — minimal service worker for OHWASIS PWA installability.
//
// Caches the app shell for offline access. Network-first for everything else
// (so users always get fresh data when online; fall back to cache when offline).
const CACHE = 'ohwasis-v1'
const APP_SHELL = ['/', '/manifest.json', '/icon-192.png', '/icon-512.png']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  // Only handle GET
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  // Network-first for navigation requests (HTML)
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).then((res) => {
        const copy = res.clone()
        caches.open(CACHE).then((cache) => cache.put(request, copy))
        return res
      }).catch(() => caches.match(request).then((cached) => cached || caches.match('/'))),
    )
    return
  }
  // Cache-first for static assets (images, icons, _next/static)
  if (url.pathname.startsWith('/_next/static') || url.pathname.startsWith('/images') || url.pathname.startsWith('/brand') || url.pathname.startsWith('/icons') || url.pathname.match(/\.(png|jpg|jpeg|webp|svg|ico|woff2?)$/)) {
    event.respondWith(
      caches.match(request).then((cached) => cached || fetch(request).then((res) => {
        const copy = res.clone()
        caches.open(CACHE).then((cache) => cache.put(request, copy))
        return res
      })),
    )
    return
  }
  // Network-first with cache fallback for everything else
  event.respondWith(
    fetch(request).then((res) => res).catch(() => caches.match(request)),
  )
})
