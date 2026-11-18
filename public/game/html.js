// Escape text for safe insertion into HTML element content and quoted attributes.
const entities = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => entities[c]);
const rendered = new WeakMap();
// Replace an element's markup only when it changed, so periodic refreshes keep focus,
// <details> open state and scroll position. Returns true when the DOM was rebuilt.
export function setHTML(el, html) {
  if (!el || rendered.get(el) === html) return false;
  const focusKey = el.contains?.(document.activeElement) ? document.activeElement.id : null;
  el.innerHTML = html;
  rendered.set(el, html);
  if (focusKey) document.getElementById(focusKey)?.focus();
  return true;
}
