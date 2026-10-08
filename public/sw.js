// Offline support: the build stamps in VERSION and the full file list. Each deploy is stored as
// one complete, versioned copy, and a page only ever uses one copy, so files from two deploys are
// never mixed (a new game.js with an old module would break the game):
// - installing downloads every file straight from the server, never from the browser's HTTP cache
//   (GitHub Pages lets browsers keep files for 10 minutes, which would mix in the previous deploy);
// - files are served from this version's copy and never refreshed one by one;
// - a new version waits until the student reloads (the page shows "A new version is ready"), so
//   an open page never runs half old, half new code.
// Weather and other online requests still go to the network; offline, the game falls back to
// practice weather.
const VERSION = 'dev';
const PRECACHE = [];
const CACHE = 'iotquest-' + VERSION;
// Stored in every copy made by this update scheme. Copies without it come from the earlier offline
// code, which mixed deploys and cannot offer a clean reload, so a new version replaces those at
// once and reloads their pages (progress is saved in the browser, so nothing is lost).
const MARKER = './__iotquest-update-scheme-2';
const legacyCopies = async () => {
  const names = (await caches.keys()).filter((k) => k.startsWith('iotquest-') && k !== CACHE);
  const marked = await Promise.all(
    names.map(async (k) => !!(await (await caches.open(k)).match(MARKER))),
  );
  return marked.some((m) => !m);
};
// Web fonts are optional, so a cached copy is fine and saves a round trip.
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

// Unbuilt (development) copy: stay out of the way so code changes always show.
const DEV = VERSION === 'dev';

self.addEventListener('install', (event) => {
  if (DEV) return self.skipWaiting();
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await cache.addAll(PRECACHE.map((url) => new Request(url, { cache: 'reload' })));
      await cache.put(MARKER, new Response('2'));
      if (await legacyCopies()) self.skipWaiting();
    })(),
  );
});

// The page asks for this when the student chooses to reload into the new version.
self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const takeover = !DEV && (await legacyCopies());
      const old = (await caches.keys()).filter((k) => k.startsWith('iotquest-') && k !== CACHE);
      await Promise.all(old.map((k) => caches.delete(k)));
      await self.clients.claim();
      // Pages still running the earlier offline code reload into this version in one step.
      if (takeover)
        for (const client of await self.clients.matchAll({ type: 'window' }))
          client.navigate(client.url).catch(() => {});
    })(),
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
      // Navigations to the game ("/", "/?x") use the stored game page; other pages (teacher.html)
      // keep their own entry, so one page never replaces another in the cache.
      const root = new URL('./', self.location).href,
        key = request.mode === 'navigate' && url.origin + url.pathname === root ? root : request;
      const cached = await cache.match(key, { ignoreSearch: request.mode === 'navigate' });
      if (cached) return cached;
      try {
        const response = await fetch(request);
        // Only fonts are added as they are used; game files come from the versioned install.
        if (!sameOrigin && (response.ok || response.type === 'opaque'))
          cache.put(request, response.clone());
        return response;
      } catch {
        return Response.error();
      }
    }),
  );
});
