// Registers the offline service worker, shows when the game is offline, and lets the settings
// dialog offer "Install app" when the browser allows it.
// The unbuilt sw.js (development server) caches nothing; only the built copy stores files.
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});

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
