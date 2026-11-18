// Registers the offline service worker, shows when the game is offline, and lets the settings
// dialog offer "Install app" when the browser allows it.
// "?fresh" in the address, or Settings → Get the latest version: forget the saved copy and load the
// newest version from the server.
export async function freshStart() {
  try {
    // Only this site's copy: the test copy at /dev/ and the main site share an address.
    const scope = new URL('./', location.href).href,
      channel = globalThis.IOTQUEST_CHANNEL || '',
      prefix = channel ? 'iotquest.' + channel + '-' : 'iotquest-';
    for (const r of (await navigator.serviceWorker?.getRegistrations?.()) || [])
      if (r.scope === scope) await r.unregister();
    for (const k of await caches.keys()) if (k.startsWith(prefix)) await caches.delete(k);
  } catch {}
  const url = new URL(location.href);
  url.searchParams.delete('fresh');
  location.replace(url.href);
}
globalThis.iotQuestFreshStart = freshStart;
if (new URLSearchParams(location.search).has('fresh')) freshStart();

// The unbuilt sw.js (development server) caches nothing; only the built copy stores files.
// A deploy installs a new version in the background; it is used after the student reloads.
let switching = false;
if ('serviceWorker' in navigator) {
  // The version this page started with. If another tab switches to a new version, this page is
  // still running the old code, so it offers a reload rather than carrying on mixed.
  // Only this site's own service worker counts: on a first visit to the test copy at /dev/, the
  // main site's worker (whose scope covers /dev/) controls the page until /dev/'s own takes over,
  // and that hand-over is not an update.
  const ownWorker = new URL('./sw.js', location.href).href,
    hadController = navigator.serviceWorker.controller?.scriptURL === ownWorker;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (switching) location.reload();
    else if (hadController)
      showBar('IoT Quest was updated in another tab.', () => location.reload());
  });
  navigator.serviceWorker
    .register('./sw.js', { updateViaCache: 'none' })
    .then((registration) => {
      // A new version waits behind the one this page runs on. A first install also passes through
      // "waiting" for a moment (with no active version yet), which is not an update, even when the
      // main site's worker controls a first visit to /dev/.
      const ready = () =>
        registration.waiting &&
        registration.active &&
        navigator.serviceWorker.controller?.scriptURL === ownWorker;
      const update = () => {
        switching = true;
        registration.waiting?.postMessage('skipWaiting');
      };
      // On the destination screen nothing is in progress (leaving a city saves), so the game
      // switches by itself; inside a city it asks, so a student's open work is never interrupted.
      const offer = () => {
        if (!ready() || switching) return;
        if (onDestinationScreen()) update();
        else
          showBar('A new version of IoT Quest is ready. Your progress is kept.', update, 'Update');
      };
      offer();
      registration.addEventListener('updatefound', () =>
        registration.installing?.addEventListener('statechange', offer),
      );
      // Returning to the globe with an update waiting takes it then.
      const travel = document.getElementById('travelScreen');
      if (travel) new MutationObserver(offer).observe(travel, { attributes: true });
      // A class can keep the game open all day: look for a new deploy now and then, and whenever
      // the tab comes back into view.
      const check = () => registration.update().catch(() => {});
      setInterval(check, UPDATE_CHECK_MS);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check();
      });
    })
    .catch(() => {});
}
const UPDATE_CHECK_MS = 30 * 60 * 1000;
// The globe and destination list, with no dialog open.
function onDestinationScreen() {
  const travel = document.getElementById('travelScreen');
  return !!travel && !travel.hidden && !document.getElementById('modal')?.open;
}

// The version this page runs (the build's content stamp, or "dev" unbuilt), for Settings.
export function runningVersion() {
  const worker = navigator.serviceWorker?.controller;
  if (!worker) return Promise.resolve(null);
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    channel.port1.onmessage = (event) => resolve(event.data);
    worker.postMessage('version', [channel.port2]);
    setTimeout(() => resolve(null), 2000);
  });
}
globalThis.iotQuestVersion = runningVersion;

// A small bar with a Reload button (progress is saved locally, so reloading loses nothing).
function showBar(message, onReload, label = 'Reload') {
  document.getElementById('updateBar')?.remove();
  const bar = document.createElement('div');
  bar.id = 'updateBar';
  bar.className = 'update-bar';
  bar.setAttribute('role', 'status');
  bar.innerHTML = '<span></span><button type="button"></button>';
  bar.querySelector('span').textContent = message;
  bar.querySelector('button').textContent = label;
  bar.querySelector('button').onclick = onReload;
  document.body.append(bar);
}

const badge = document.getElementById('offlineBadge');
const showStatus = () => {
  if (badge) badge.hidden = navigator.onLine;
};
addEventListener('online', showStatus);
addEventListener('offline', showStatus);
showStatus();

let installPrompt = null;
addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  installPrompt = event;
});
addEventListener('appinstalled', () => (installPrompt = null));
// Read by the settings dialog: null when installing is not available (or already done).
globalThis.iotQuestInstall = {
  available: () => !!installPrompt,
  async prompt() {
    if (!installPrompt) return false;
    installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    installPrompt = null;
    return outcome === 'accepted';
  },
};
