// Registers the offline service worker, shows when the game is offline, and lets the settings
// dialog offer "Install app" when the browser allows it.
// The unbuilt sw.js (development server) caches nothing; only the built copy stores files.
// A deploy installs a new version in the background; it is used after the student reloads.
if ('serviceWorker' in navigator)
  navigator.serviceWorker
    .register('./sw.js', { updateViaCache: 'none' })
    .then((registration) => {
      const ready = () => registration.waiting && navigator.serviceWorker.controller;
      if (ready()) offerUpdate(registration);
      registration.addEventListener('updatefound', () =>
        registration.installing?.addEventListener('statechange', () => {
          if (ready()) offerUpdate(registration);
        }),
      );
    })
    .catch(() => {});

// "A new version is ready": reloading switches to it in one step (progress is saved locally).
function offerUpdate(registration) {
  if (document.getElementById('updateBar')) return;
  const bar = document.createElement('div');
  bar.id = 'updateBar';
  bar.className = 'update-bar';
  bar.setAttribute('role', 'status');
  bar.innerHTML =
    '<span>A new version of IoT Quest is ready.</span><button type="button">Reload</button>';
  bar.querySelector('button').onclick = () => {
    navigator.serviceWorker.addEventListener('controllerchange', () => location.reload(), {
      once: true,
    });
    registration.waiting?.postMessage('skipWaiting');
  };
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
