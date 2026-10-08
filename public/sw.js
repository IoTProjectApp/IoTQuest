// Offline support: the build stamps in VERSION and the full file list, so the first visit stores
// the whole game and each deploy replaces the old copy. Weather and other online requests still
// go to the network; when that fails the game falls back to practice weather.
const VERSION = 'dev';
const PRECACHE = [];
const CACHE = 'iotquest-' + VERSION;
// Web fonts are optional, so a cached copy is fine and saves a round trip.
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

// Unbuilt (development) copy: stay out of the way so code changes always show.
const DEV = VERSION === 'dev';

self.addEventListener('install', (event) => {
  if (DEV) return self.skipWaiting();
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k.startsWith('iotquest-') && k !== CACHE).map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request,
    url = new URL(request.url);
  if (DEV || request.method !== 'GET') return;
  const sameOrigin = url.origin === self.location.origin;
  if (!sameOrigin && !FONT_HOSTS.includes(url.hostname)) return;
  // Weather is live data: never serve it from the cache.
  if (sameOrigin && url.pathname.includes('/api/')) return;
  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      // Navigations ("/", "/?x") use the stored game page.
      const key = request.mode === 'navigate' ? new URL('./', self.location).href : request;
      const cached = await cache.match(key, { ignoreSearch: request.mode === 'navigate' });
      const fresh = fetch(request)
        .then((response) => {
          if (response.ok || response.type === 'opaque') cache.put(key, response.clone());
          return response;
        })
        .catch(() => cached || Response.error());
      // Stale-while-revalidate: answer from the cache at once, refresh it in the background.
      return cached || fresh;
    }),
  );
});
