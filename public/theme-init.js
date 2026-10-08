// Apply saved appearance before styles load to avoid a bright flash in dark mode.
(() => {
  let preference = 'system';
  try {
    const saved = JSON.parse(localStorage.getItem('iotquest-v1') || '{}');
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
