// Apply saved appearance before styles load to avoid a bright flash in dark mode.
(() => {
  // The test copy (/dev/) keeps its own progress, starting from the main site's until it first
  // saves, and says on screen that it is not the main site.
  const channel = globalThis.IOTQUEST_CHANNEL || '';
  if (channel) {
    document.documentElement.dataset.channel = channel;
    document.title = 'Test version · ' + document.title;
  }
  let preference = 'system';
  try {
    const saved = JSON.parse(
      (channel && localStorage.getItem('iotquest-' + channel + '-v1')) ||
        localStorage.getItem('iotquest-v1') ||
        '{}',
    );
    if (['light', 'dark', 'system'].includes(saved.theme)) preference = saved.theme;
  } catch {}
  const theme =
    preference === 'system'
      ? matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'
      : preference;
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
})();
