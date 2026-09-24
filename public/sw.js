// Bewust minimaal: alleen een vriendelijke pagina als er geen verbinding is. Er worden geen
// pagina's, scripts of gegevens bewaard, dus er kan ook niets verouderds blijven hangen.
const CACHE = 'kijkassistent-offline-v1'
const OFFLINE_URL = '/offline.html'

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.add(OFFLINE_URL)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (event) => {
  // Alleen het openen van een pagina; alle aanroepen naar de API en Supabase blijven ongemoeid.
  if (event.request.mode !== 'navigate') return
  event.respondWith(
    fetch(event.request).catch(async () => (await caches.match(OFFLINE_URL)) || Response.error())
  )
})
