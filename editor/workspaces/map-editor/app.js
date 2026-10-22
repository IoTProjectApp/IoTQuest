// The Map Editor workspace: tools, catalogue, inspector, saving and switching cities.
import { locations, locationById, continents } from '../../../public/locations.js';
import { WorldSession } from './session.js';
import { Viewport, dimensions } from './viewport.js';
import { catalogueItems, Thumbnails } from './catalogue.js';
import { CATEGORIES } from './names.js';
import { scaleOf } from '../../../public/world-layout.js';
import { icon } from '../../ui/icons.js';

const shell = window.editorShell;
const $ = (id) => document.getElementById(id);
const escape = (s) =>
  String(s).replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c],
  );
const DEGREES = 180 / Math.PI;

const TOOLS = {
  select: { label: 'Select', icon: 'select' },
  object: { label: 'Object', icon: 'object' },
  erase: { label: 'Delete', icon: 'erase' },
  camera: { label: 'Camera', icon: 'camera' },
};
const GIZMO = {
  translate: { label: 'Move', icon: 'move', key: 'G' },
  rotate: { label: 'Turn', icon: 'rotate', key: 'R' },
  scale: { label: 'Resize', icon: 'scale', key: 'S' },
};

const state = {
  layout: { version: 1, locations: {} },
  savedText: '',
  sessions: new Map(),
  session: null,
  tool: 'select',
  gizmo: 'translate',
  category: 'furniture',
  search: '',
  placing: null,
};

// ---- Static chrome --------------------------------------------------------------------------
$('home').innerHTML = icon('back');
$('undo').innerHTML = icon('undo');
$('redo').innerHTML = icon('redo');
$('save').innerHTML = icon('save', 16) + 'Save';
$('playtest').innerHTML = icon('play', 16) + 'Play-test';
$('search-icon').innerHTML = icon('search', 16);
$('snap').innerHTML = icon('magnet', 16) + 'Snap';
for (const button of $('tools').children) {
  const tool = TOOLS[button.dataset.tool];
  button.innerHTML = `${icon(tool.icon, 22)}<span>${tool.label}</span><kbd>${button.dataset.key}</kbd>`;
}
for (const button of $('gizmo-modes').children) {
  const mode = GIZMO[button.dataset.mode];
  button.innerHTML = `${icon(mode.icon, 16)}${mode.label}`;
}
// Cities grouped by continent; the starting home first.
$('city').innerHTML =
  '<option value="legacy">Willowbrook (starting home)</option>' +
  continents
    .map((continent) => {
      const name = typeof continent === 'string' ? continent : continent.name || continent.id;
      const cities = locations.filter((l) => l.continent === name);
      return cities.length
        ? `<optgroup label="${escape(name)}">${cities
            .map((l) => `<option value="${l.id}">${escape(l.city)}, ${escape(l.country)}</option>`)
            .join('')}</optgroup>`
        : '';
    })
    .join('');
// Any city whose continent is not in the list still gets a place.
for (const l of locations)
  if (![...$('city').options].some((o) => o.value === l.id))
    $('city').insertAdjacentHTML(
      'beforeend',
      `<option value="${l.id}">${escape(l.city)}, ${escape(l.country)}</option>`,
    );

// ---- Viewport -------------------------------------------------------------------------------
const viewport = new Viewport($('canvas'), {
  onPick(group) {
    if (state.tool === 'erase') {
      if (group) {
        state.session.remove(group.id);
        toast(`Removed ${group.name}. Undo brings it back.`);
      }
      return;
    }
    select(group);
  },
  onPlace(source, placement, keepPlacing) {
    const id = state.session.add(source, placement);
    if (!keepPlacing) {
      stopPlacing();
      select(state.session.groups.get(id));
    }
  },
  // While a resize handle is dragged, the inspector shows the size as it changes.
  onResize(group, placement) {
    dimensions(group, placement.scale).forEach((v, i) => {
      const input = document.querySelector(`[data-size="${i}"]`);
      if (input) input.value = v.toFixed(2);
    });
  },
  onTransformEnd(id, placement) {
    state.session.move(id, placement, GIZMO[state.gizmo].label);
  },
  onHover(group) {
    const label = $('hover-label');
    label.hidden = !group || group === viewport.selected;
    if (!label.hidden) {
      label.textContent = state.tool === 'erase' ? `Remove ${group.name}` : group.name;
      label.classList.toggle('erase', state.tool === 'erase');
    }
  },
});
$('canvas').addEventListener('pointermove', (e) => {
  const label = $('hover-label');
  label.style.left = e.offsetX + 'px';
  label.style.top = e.offsetY + 'px';
});

// ---- Cities and sessions --------------------------------------------------------------------
function currentText() {
  return JSON.stringify(state.layout);
}
// Copies the open city's changes into the layout to be saved.
function collect() {
  const s = state.session;
  if (!s) return;
  const saved = s.saved();
  if (saved) state.layout.locations[s.locationId] = saved;
  else delete state.layout.locations[s.locationId];
}
async function openCity(id) {
  collect();
  $('loading').hidden = false;
  $('loading').textContent = `Opening ${cityName(id)}…`;
  // Let the message paint before the world is built.
  await new Promise((resolve) => setTimeout(resolve, 30));
  let session = state.sessions.get(id);
  if (!session) {
    session = new WorldSession(id, state.layout.locations[id]);
    session.on(() => changed());
    state.sessions.set(id, session);
  }
  state.session = session;
  viewport.setSession(session, locationById(id));
  $('city').value = id;
  try {
    localStorage.setItem('map-editor:city', id);
  } catch {}
  thumbnails.cancel();
  renderCatalogue();
  changed();
  hint();
  $('loading').hidden = true;
  if (session.missing.length)
    toast(
      `${session.missing.length} saved change(s) refer to objects this city no longer has. See the list on the right.`,
    );
}
const cityName = (id) => (id === 'legacy' ? 'Willowbrook' : locationById(id)?.city || id);
$('city').addEventListener('change', (e) => openCity(e.target.value));
for (const button of $('views').children)
  button.addEventListener('click', () => viewport.view(button.dataset.view));

// Called after every change: refreshes everything that shows the changes.
function changed() {
  collect();
  const unsaved = currentText() !== state.savedText;
  $('save-state').textContent = unsaved ? 'Unsaved changes' : 'All changes saved';
  $('save-state').classList.toggle('unsaved', unsaved);
  $('save').disabled = !unsaved;
  shell?.setUnsaved(unsaved);
  const s = state.session;
  $('undo').disabled = !s?.undoStack.length;
  $('redo').disabled = !s?.redoStack.length;
  $('undo').title = s?.undoStack.length
    ? `Undo ${s.undoStack.at(-1).label} (⌘Z)`
    : 'Nothing to undo';
  $('redo').title = s?.redoStack.length
    ? `Redo ${s.redoStack.at(-1).label} (⇧⌘Z)`
    : 'Nothing to redo';
  if (viewport.selected && !s.groups.has(viewport.selected.id)) viewport.select(null);
  if (viewport.selected?.hidden) viewport.select(null);
  viewport.refresh();
  renderInspector();
}

// ---- Tools ----------------------------------------------------------------------------------
function setTool(tool) {
  state.tool = tool;
  stopPlacing();
  viewport.setTool(tool);
  for (const b of $('tools').children) b.classList.toggle('active', b.dataset.tool === tool);
  $('catalogue').hidden = tool !== 'object';
  $('gizmo-bar').hidden = tool !== 'select';
  $('canvas').style.cursor = tool === 'erase' ? 'crosshair' : 'default';
  if (tool === 'object') renderCatalogue();
  hint();
}
function setGizmo(mode) {
  state.gizmo = mode;
  viewport.setGizmoMode(mode);
  for (const b of $('gizmo-modes').children) b.classList.toggle('active', b.dataset.mode === mode);
  hint();
}
function setSnap(on) {
  viewport.setSnap(on);
  $('snap').setAttribute('aria-pressed', String(on));
  try {
    localStorage.setItem('map-editor:snap', on ? '1' : '0');
  } catch {}
}
function select(group) {
  viewport.select(group);
  viewport.setHover(null);
  renderInspector();
  hint();
}
for (const b of $('tools').children) b.addEventListener('click', () => setTool(b.dataset.tool));
for (const b of $('gizmo-modes').children)
  b.addEventListener('click', () => setGizmo(b.dataset.mode));
$('snap').addEventListener('click', () => setSnap(!viewport.snap));

function hint() {
  const keys = (...pairs) => pairs.map(([k, what]) => `<b>${k}</b> ${what}`).join(' · ');
  const text = state.placing
    ? keys(
        ['Click', 'to place'],
        ['Shift-click', 'to place several'],
        ['R', 'turns it'],
        ['Esc', 'stops'],
      )
    : state.tool === 'object'
      ? 'Pick something from the catalogue below, then click in the world to place it'
      : state.tool === 'erase'
        ? keys(['Click', 'an object to remove it'], ['⌘Z', 'brings it back'])
        : state.tool === 'camera'
          ? keys(['Drag', 'to orbit'], ['Right-drag', 'to pan'], ['Scroll', 'to zoom'])
          : viewport.selected && state.gizmo === 'scale'
            ? keys(
                ['Drag a square', 'to stretch that way'],
                ['the round one or Shift', 'resizes evenly'],
                ['G', 'back to moving'],
                ['Esc', 'deselects'],
              )
            : viewport.selected
              ? keys(
                  ['Drag the handles', 'to move'],
                  ['G R S', 'move, turn, size'],
                  ['F', 'focus'],
                  ['Delete', 'removes'],
                  ['Esc', 'deselects'],
                )
              : keys(
                  ['Click', 'an object to select it'],
                  ['Drag', 'to orbit'],
                  ['Right-drag', 'to pan'],
                  ['Scroll', 'to zoom'],
                );
  $('hint').innerHTML = text;
}

// ---- Catalogue ------------------------------------------------------------------------------
const thumbnails = new Thumbnails();
function renderCatalogue() {
  if (state.tool !== 'object' || !state.session) return;
  const all = catalogueItems(state.session),
    search = state.search.trim().toLowerCase(),
    shown = all.filter(
      (item) =>
        item.category === state.category && (!search || item.name.toLowerCase().includes(search)),
    );
  $('tabs').innerHTML = CATEGORIES.map((c) => {
    const count = all.filter((i) => i.category === c.id).length;
    return `<button role="tab" data-category="${c.id}" class="${c.id === state.category ? 'active' : ''}" aria-selected="${c.id === state.category}">${c.label}<span class="count">${count}</span></button>`;
  }).join('');
  for (const b of $('tabs').children)
    b.addEventListener('click', () => {
      state.category = b.dataset.category;
      renderCatalogue();
    });
  const items = $('items');
  if (!shown.length) {
    items.innerHTML = `<p class="empty">${search ? 'Nothing matches that search.' : 'Nothing of this kind in this city.'}</p>`;
    return;
  }
  thumbnails.cancel();
  items.innerHTML = shown
    .map(
      (item, i) =>
        `<button class="item ${state.placing?.kind === item.kind ? 'active' : ''}" data-index="${i}" title="Place ${escape(item.name)}">
          <img class="thumb" alt="" /><span class="label">${escape(item.name)}</span></button>`,
    )
    .join('');
  [...items.children].forEach((button, i) => {
    const item = shown[i];
    button.addEventListener('click', () => startPlacing(item));
    thumbnails.request(state.session.locationId + ':' + item.kind, item.source, (url) => {
      button.querySelector('img').src = url;
    });
  });
}
$('search').addEventListener('input', (e) => {
  state.search = e.target.value;
  renderCatalogue();
});
function startPlacing(item) {
  state.placing = item;
  viewport.startPlacing(item.source);
  for (const b of $('items').children)
    b.classList.toggle('active', b.querySelector('.label').textContent === item.name);
  $('canvas').focus();
  hint();
}
function stopPlacing() {
  state.placing = null;
  viewport.cancelPlacing();
  for (const b of $('items').children) b.classList.remove('active');
  hint();
}

// ---- Inspector ------------------------------------------------------------------------------
function renderInspector() {
  const s = state.session,
    group = viewport.selected,
    el = $('inspector');
  if (!s) return;
  if (!group) {
    const list = s.changeList();
    el.innerHTML = `
      <section>
        <h2>Nothing selected</h2>
        <p class="muted">Click an object in the world to select it, or open the <b>Object</b> tool to place something new.</p>
      </section>
      <section>
        <h3>Changes in ${escape(cityName(s.locationId))}</h3>
        ${
          list.length
            ? `<ul class="changes">${list
                .map(
                  (
                    c,
                  ) => `<li data-id="${escape(c.id)}" title="${c.missing ? 'This object is no longer built in this city' : 'Select it'}">
                    <span class="name">${escape(c.name)}</span>
                    <span class="what ${c.missing ? 'missing' : c.what.toLowerCase()}">${c.missing ? 'Missing' : c.what}</span>
                    <button class="revert" data-revert="${escape(c.id)}" title="${c.what === 'Added' ? 'Remove the added object' : 'Put it back as built'}">${icon('reset', 14)}</button>
                  </li>`,
                )
                .join('')}</ul>`
            : '<p class="muted">No changes yet. Everything is as the game builds it.</p>'
        }
      </section>
      <section>
        <h3>Shortcuts</h3>
        <dl class="shortcuts">
          <dt><kbd>V</kbd> <kbd>O</kbd> <kbd>X</kbd> <kbd>C</kbd></dt><dd>Select, Object, Delete, Camera</dd>
          <dt><kbd>G</kbd> <kbd>R</kbd> <kbd>S</kbd></dt><dd>Move, turn, size</dd>
          <dt><kbd>F</kbd></dt><dd>Focus on the selection</dd>
          <dt><kbd>⌘D</kbd></dt><dd>Duplicate</dd>
          <dt><kbd>⌘Z</kbd> <kbd>⇧⌘Z</kbd></dt><dd>Undo, redo</dd>
          <dt><kbd>⌘S</kbd></dt><dd>Save</dd>
        </dl>
      </section>`;
    for (const li of el.querySelectorAll('.changes li'))
      li.addEventListener('click', (e) => {
        const id = li.dataset.id,
          revert = e.target.closest('[data-revert]');
        if (revert) {
          if (id.startsWith('added/')) s.remove(id);
          else s.reset(id);
          return;
        }
        const target = s.groups.get(id);
        if (target && !target.hidden) {
          select(target);
          viewport.focus(target);
        }
      });
    return;
  }
  const p = group.placement,
    changed = s.isChanged(group.id),
    added = group.id.startsWith('added/'),
    category = CATEGORIES.find((c) => c.id === group.category)?.label;
  el.innerHTML = `
    <section>
      <h2>${escape(group.name)}</h2>
      <div class="id">${escape(group.id)}</div>
      <div class="chips">
        <span class="chip">${category}</span>
        <span class="chip ${changed ? 'changed' : ''}">${added ? 'Added' : changed ? 'Changed' : 'As built'}</span>
      </div>
      ${group.caution ? `<div class="caution">${icon('warning', 16)}<span>${escape(group.caution)}</span></div>` : ''}
    </section>
    <section>
      <h3>Position (metres)</h3>
      <div class="grid3">
        ${['x', 'y', 'z']
          .map(
            (axis, i) =>
              `<label class="axis ${axis}"><b>${axis.toUpperCase()}</b><input class="input" data-pos="${i}" type="number" step="0.1" value="${p.pos[i].toFixed(2)}" aria-label="${axis}" /></label>`,
          )
          .join('')}
      </div>
      <div class="grid2">
        <label class="field"><span>Turn (degrees)</span><input class="input" id="turn" type="number" step="15" value="${(((p.turn || 0) * DEGREES) % 360).toFixed(1)}" /></label>
      </div>
    </section>
    <section>
      <h3>Size (metres)</h3>
      <div class="grid3">
        ${dimensions(group)
          .map(
            (v, i) =>
              `<label class="axis size"><b>${'WHD'[i]}</b><input class="input" data-size="${i}" type="number" step="0.05" min="0.05" value="${v.toFixed(2)}" aria-label="${['width', 'height', 'depth'][i]}" ${group.box.max[i] - group.box.min[i] > 1e-3 ? '' : 'disabled'} /></label>`,
          )
          .join('')}
      </div>
      <p class="muted" style="margin-top:8px;font-size:12px">Or press <kbd>S</kbd> and drag the handles.</p>
    </section>
    <section>
      <div class="actions">
        <button class="button" id="focus">${icon('focus', 16)}Focus</button>
        <button class="button" id="duplicate">${icon('copy', 16)}Duplicate</button>
        <button class="button" id="reset" ${changed && !added ? '' : 'disabled'}>${icon('reset', 16)}Reset</button>
        <button class="button danger" id="remove">${icon('erase', 16)}Delete</button>
      </div>
    </section>`;
  const commit = () => {
    const pos = [...el.querySelectorAll('[data-pos]')].map((input, i) => {
        const v = parseFloat(input.value);
        return Number.isFinite(v) ? v : p.pos[i];
      }),
      turn = parseFloat($('turn').value),
      // A typed size in metres becomes that side's factor, measured from the size as built.
      { min, max } = group.box,
      scale = [...el.querySelectorAll('[data-size]')].map((input, i) => {
        const metres = parseFloat(input.value),
          extent = max[i] - min[i],
          before = scaleOf(p.scale)[i];
        return Number.isFinite(metres) && metres >= 0.05 && extent > 1e-3
          ? metres / extent
          : before;
      });
    s.move(group.id, {
      pos,
      turn: Number.isFinite(turn) ? turn / DEGREES : p.turn,
      scale,
    });
  };
  for (const input of el.querySelectorAll('input')) {
    input.addEventListener('change', commit);
    input.addEventListener('keydown', (e) => e.key === 'Enter' && input.blur());
  }
  $('focus').addEventListener('click', () => viewport.focus(group));
  $('duplicate').addEventListener('click', duplicate);
  $('reset').addEventListener('click', () => s.reset(group.id));
  $('remove').addEventListener('click', removeSelected);
}
function duplicate() {
  const group = viewport.selected;
  if (!group) return;
  const p = group.placement,
    id = state.session.add(group, { ...p, pos: [p.pos[0] + 0.5, p.pos[1], p.pos[2] + 0.5] });
  select(state.session.groups.get(id));
  toast(`Duplicated ${group.name}`);
}
function removeSelected() {
  const group = viewport.selected;
  if (!group) return;
  state.session.remove(group.id);
  toast(`Removed ${group.name}. Undo brings it back.`);
}

// ---- Undo, save, play-test ------------------------------------------------------------------
function undo(redo = false) {
  const label = redo ? state.session.redo() : state.session.undo();
  if (label) toast(`${redo ? 'Redid' : 'Undid'}: ${label}`);
}
async function save() {
  collect();
  try {
    await shell.write('world-layout', state.layout);
    state.savedText = currentText();
    changed();
    toast('Saved to public/data/world-layout.js');
    return true;
  } catch (error) {
    toast('Could not save: ' + error.message, true);
    return false;
  }
}
async function playtest() {
  if (currentText() !== state.savedText) {
    if (!confirm('The game uses saved changes only. Save now and open the game?')) return;
    if (!(await save())) return;
  }
  shell.openGame();
}
$('undo').addEventListener('click', () => undo());
$('redo').addEventListener('click', () => undo(true));
$('save').addEventListener('click', save);
$('playtest').addEventListener('click', playtest);
$('home').addEventListener('click', (e) => {
  if (
    currentText() !== state.savedText &&
    !confirm('Leave the Map Editor? Unsaved changes will be lost.')
  )
    e.preventDefault();
});

let toastTimer;
function toast(message, error = false) {
  const el = $('toast');
  el.textContent = message;
  el.classList.toggle('error', error);
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), error ? 6000 : 2400);
}

// ---- Keyboard -------------------------------------------------------------------------------
const typing = () => /^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement?.tagName);
document.addEventListener('keydown', (e) => {
  const mod = e.metaKey || e.ctrlKey,
    key = e.key.toLowerCase();
  // Without the desktop shell's menu (e.g. opened in a browser), handle its shortcuts here.
  if (mod && !shell) {
    if (key === 'z') return (e.preventDefault(), typing() || undo(e.shiftKey));
    if (key === 's') return (e.preventDefault(), save());
  }
  if (typing()) {
    if (e.key === 'Escape') document.activeElement.blur();
    return;
  }
  if (mod && key === 'd') return (e.preventDefault(), duplicate());
  if (mod) return;
  if (e.key === 'Escape') {
    if (state.placing) stopPlacing();
    else select(null);
    return;
  }
  if (state.placing && key === 'r')
    return viewport.turnGhost(((e.shiftKey ? -1 : 1) * Math.PI) / 4);
  if (e.key === 'Delete' || e.key === 'Backspace') return removeSelected();
  const tool = { v: 'select', o: 'object', x: 'erase', c: 'camera' }[key];
  if (tool) return setTool(tool);
  if (state.tool === 'select') {
    const mode = { g: 'translate', r: 'rotate', s: 'scale' }[key];
    if (mode) return setGizmo(mode);
  }
  if (key === 'f') viewport.focus(viewport.selected);
});
shell?.onMenu((command) => {
  if (command === 'save') save();
  else if (command === 'playtest') playtest();
  else if (typing()) document.execCommand(command);
  else undo(command === 'redo');
});

// For test scripts and the developer console.
window.mapEditor = { state, viewport };

// ---- Start ----------------------------------------------------------------------------------
async function start() {
  if (shell) state.layout = await shell.read('world-layout');
  else {
    // Opened outside the desktop shell: read the layout, but saving is unavailable.
    state.layout = (await import('../../../public/data/world-layout.js')).default;
    $('save').title = 'Saving needs the desktop shell (scripts/world-editor.sh)';
  }
  state.layout = JSON.parse(JSON.stringify(state.layout));
  state.layout.locations ||= {};
  state.savedText = currentText();
  let snap = true,
    city = 'legacy';
  try {
    snap = localStorage.getItem('map-editor:snap') !== '0';
    city = localStorage.getItem('map-editor:city') || city;
  } catch {}
  setSnap(snap);
  setGizmo('translate');
  setTool('select');
  await openCity(city === 'legacy' || locationById(city) ? city : 'legacy');
}
start().catch((error) => {
  $('loading').hidden = false;
  $('loading').textContent = /No handler registered/.test(error.message)
    ? 'The editor was updated while it was open. Quit it (⌘Q) and run scripts/world-editor.sh again.'
    : 'The Map Editor could not start: ' + error.message;
  console.error(error);
});
