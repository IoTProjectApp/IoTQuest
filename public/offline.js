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
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (switching) location.reload();
    else if (hadController)
      showBar('IoT Quest was updated in another tab.', () => location.reload());
  });
  navigator.serviceWorker
    .register('./sw.js', { updateViaCache: 'none' })
    .then((registration) => {
      const ready = () => registration.waiting && navigator.serviceWorker.controller;
      const offer = () =>
        ready() &&
        showBar('A new version of IoT Quest is ready.', () => {
          switching = true;
          registration.waiting?.postMessage('skipWaiting');
        });
      offer();
      registration.addEventListener('updatefound', () =>
        registration.installing?.addEventListener('statechange', offer),
      );
    })
    .catch(() => {});
}

// A small bar with a Reload button (progress is saved locally, so reloading loses nothing).
function showBar(message, onReload) {
  document.getElementById('updateBar')?.remove();
  const bar = document.createElement('div');
  bar.id = 'updateBar';
  bar.className = 'update-bar';
  bar.setAttribute('role', 'status');
  bar.innerHTML = '<span></span><button type="button">Reload</button>';
  bar.querySelector('span').textContent = message;
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
