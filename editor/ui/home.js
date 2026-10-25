// The home page: a card for each workspace.
import { WORKSPACES, workspaceUrl } from './workspaces.js';
import { icon } from './icons.js';
const escape = (s) =>
  s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
document.getElementById('cards').innerHTML = WORKSPACES.map(
  (w) => `
    <a class="card" href="${workspaceUrl(w)}">
      <span class="badge">${icon(w.icon, 24)}</span>
      <h3>${escape(w.name)}</h3>
      <p>${escape(w.summary)}</p>
      <span class="writes">Saves to <code>${escape(w.writes)}</code></span>
      <span class="button primary open">Open ${escape(w.name)}</span>
    </a>`,
).join('');
