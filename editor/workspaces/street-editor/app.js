// The Street Editor workspace: the plan, its tools, the inspector, running traffic, the 3D preview,
// choosing which layout to edit, and saving.
import { locations, locationById, continents } from '../../../public/locations.js';
import { CommunitySimulation } from '../../../public/community-sim.js';
import { createRegionalModel } from '../../../public/regions.js';
import { addCommunityWorld } from '../../../public/community-world.js';
import { prepareWorldMaterials } from '../../../public/world-materials.js';
import { LOCKED, lockedRoad } from '../../../public/street-network.js';
import { StreetSession } from './session.js';
import { PlanView } from './plan.js';
import { icon } from '../../ui/icons.js';

const shell = window.editorShell;
const $ = (id) => document.getElementById(id);
const escape = (s) =>
  String(s).replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c],
  );

const TOOLS = {
  select: { label: 'Select', icon: 'select' },
  road: { label: 'Road', icon: 'road' },
  junction: { label: 'Junction', icon: 'junction' },
  crossing: { label: 'Crossing', icon: 'crossing' },
  erase: { label: 'Delete', icon: 'erase' },
  pan: { label: 'Pan', icon: 'hand' },
};
const CONTROL_CHOICES = [
  [null, 'Automatic', '#9aa3b0', 'Signals where three or more roads meet'],
  ['signals', 'Signals', '#5fd38a', 'Traffic lights with pedestrian crossings'],
  ['stop', 'Stop', '#e8604c', 'Every arm stops, then goes in turn'],
  ['giveway', 'Give way', '#f2b84b', 'Slow down, go in turn when clear'],
  ['none', 'Uncontrolled', '#6e7785', 'First come, first through; gives way to pedestrians'],
];
const cityName = (id) => (id === 'legacy' ? 'Willowbrook' : locationById(id)?.city || id);
const previewLocation = (id) => (id === 'legacy' ? { id: 'legacy', iso: 'AUS' } : locationById(id));

const state = {
  saved: { version: 1, town: null, locations: {} },
  sessions: new Map(),
  session: null,
  target: 'town',
  previewCity: 'legacy',
  tool: 'select',
  snap: true,
  view: 'plan',
  traffic: null,
  drawing: null,
  drag: null,
};
const plan = new PlanView($('plan'));

// ---- Static chrome --------------------------------------------------------------------------
$('home').innerHTML = icon('back');
$('undo').innerHTML = icon('undo');
$('redo').innerHTML = icon('redo');
$('save').innerHTML = icon('save', 16) + 'Save';
$('snap').innerHTML = icon('magnet', 16) + 'Snap';
$('fit').innerHTML = icon('focus', 16) + 'Fit';
for (const b of $('tools').children) {
  const tool = TOOLS[b.dataset.tool];
  b.innerHTML = `${icon(tool.icon, 22)}<span>${tool.label}</span><kbd>${b.dataset.key}</kbd>`;
}
$('views').children[0].innerHTML = icon('plan', 16) + 'Plan';
$('views').children[1].innerHTML = icon('cube', 16) + '3D';
const cityOptions = (prefix = '') =>
  continents
    .map((name) => {
      const cities = locations.filter((l) => l.continent === name);
      return cities.length
        ? `<optgroup label="${escape(name)}">${cities
            .map(
              (l) =>
                `<option value="${l.id}">${prefix}${escape(l.city)}, ${escape(l.country)}</option>`,
            )
            .join('')}</optgroup>`
        : '';
    })
    .join('');
function renderTargets() {
  const own = (id) => (state.saved.locations[id] ? ' ●' : '');
  $('target').innerHTML =
    '<option value="town">Shared town (all cities)</option>' +
    `<optgroup label="One city only"><option value="legacy">Only Willowbrook${own('legacy')}</option></optgroup>` +
    cityOptions('Only ').replace(
      /<option value="([^"]+)">([^<]+)<\/option>/g,
      (m, id, text) => `<option value="${id}">${text}${own(id)}</option>`,
    );
  $('target').value = state.target;
}
$('preview-city').innerHTML =
  '<option value="legacy">Willowbrook (starting home)</option>' + cityOptions();

// ---- Sessions -------------------------------------------------------------------------------
function openTarget(target) {
  stopTraffic();
  state.target = target;
  if (target !== 'town') state.previewCity = target;
  let session = state.sessions.get(target);
  if (!session) {
    session = new StreetSession(state.saved, target, previewLocation(state.previewCity));
    session.on(changed);
    state.sessions.set(target, session);
  }
  state.session = session;
  session.location = previewLocation(state.previewCity);
  session.check();
  $('preview-city').value = state.previewCity;
  $('preview-city').disabled = target !== 'town';
  $('target').value = target;
  plan.selected = null;
  plan.fit(session.layout);
  state.worldStale = true;
  changed();
}
$('target').addEventListener('change', (e) => openTarget(e.target.value));
$('preview-city').addEventListener('change', (e) => {
  state.previewCity = e.target.value;
  state.session.location = previewLocation(state.previewCity);
  state.session.check();
  state.worldStale = true;
  stopTraffic();
  changed();
  if (state.view === 'three') showWorld();
});

const unsaved = () => [...state.sessions.values()].some((s) => s.isChanged());
function changed() {
  const s = state.session;
  if (!s) return;
  const dirty = unsaved();
  $('save-state').textContent = dirty ? 'Unsaved changes' : 'All changes saved';
  $('save-state').classList.toggle('unsaved', dirty);
  $('save').disabled = !dirty;
  shell?.setUnsaved(dirty);
  $('undo').disabled = !s.undoStack.length;
  $('redo').disabled = !s.redoStack.length;
  $('undo').title = s.undoStack.length
    ? `Undo ${s.undoStack.at(-1).label} (⌘Z)`
    : 'Nothing to undo';
  $('redo').title = s.redoStack.length
    ? `Redo ${s.redoStack.at(-1).label} (⇧⌘Z)`
    : 'Nothing to redo';
  // A selection the change removed.
  if (plan.selected?.junction && !s.junction(plan.selected.junction)) plan.selected = null;
  if (plan.selected?.road && !s.hasRoad(...plan.selected.road)) plan.selected = null;
  state.worldStale = true;
  if (state.traffic) startTraffic();
  renderInspector();
  hint();
}

// ---- Tools and the plan ---------------------------------------------------------------------
function setTool(tool) {
  state.tool = tool;
  state.drawing = null;
  plan.ghost = null;
  plan.guides = [];
  plan.panning = tool === 'pan';
  $('plan').className = tool;
  for (const b of $('tools').children) b.classList.toggle('active', b.dataset.tool === tool);
  hint();
}
for (const b of $('tools').children) b.addEventListener('click', () => setTool(b.dataset.tool));
function setSnap(on) {
  state.snap = on;
  $('snap').setAttribute('aria-pressed', String(on));
}
$('snap').addEventListener('click', () => setSnap(!state.snap));
$('fit').addEventListener('click', () => plan.fit(state.session.layout));

// Snaps a town position to whole metres and lines it up with other junctions nearby.
function snapped(at, except = null) {
  plan.guides = [];
  if (!state.snap) return { x: at.x, z: at.z };
  const p = { x: Math.round(at.x), z: Math.round(at.z) },
    reach = Math.max(1.5, 8 / plan.scale);
  for (const axis of ['x', 'z']) {
    let best = null;
    for (const j of state.session.layout.junctions)
      if (
        j.id !== except &&
        Math.abs(j[axis] - at[axis]) < reach &&
        (!best || Math.abs(j[axis] - at[axis]) < Math.abs(best - at[axis]))
      )
        best = j[axis];
    if (best !== null) {
      p[axis] = best;
      plan.guides.push({ axis, value: best });
    }
  }
  return p;
}
const townAt = (e) => plan.toTown(e.offsetX, e.offsetY);

$('plan').addEventListener('pointerdown', (e) => {
  if (e.button !== 0 || state.view !== 'plan') return;
  const s = state.session,
    at = townAt(e),
    hit = plan.hit(s.layout, at);
  $('plan').focus();
  if (state.tool === 'select') {
    plan.selected = hit && (hit.junction ? { junction: hit.junction } : { road: hit.road });
    if (hit?.junction) {
      const reason = s.lockedJunction(hit.junction);
      if (reason) toast(`${hit.junction} stays where it is: ${reason}.`);
      else {
        const j = s.junction(hit.junction);
        state.drag = { id: j.id, start: { x: j.x, z: j.z }, moved: false };
        $('plan').setPointerCapture(e.pointerId);
      }
    }
    renderInspector();
  } else if (state.tool === 'road') {
    const end = hit?.junction
      ? { junction: hit.junction }
      : hit?.road
        ? { road: hit.road, ...snapped(hit.at) }
        : snapped(at);
    if (!state.drawing) state.drawing = end;
    else {
      const id = s.drawRoad(state.drawing, end);
      // Keep drawing from where this road ended, like a pen.
      state.drawing = id ? { junction: id } : state.drawing;
      if (!id) toast('That road is already there, or would start and end at the same junction.');
    }
    hint();
  } else if (state.tool === 'junction') {
    if (hit?.road) {
      const reason = lockedRoad(...hit.road);
      if (reason) return toast(`This road stays as it is: ${reason}.`);
      const p = snapped(hit.at);
      const id = s.splitRoad(...hit.road, p.x, p.z);
      plan.selected = id && { junction: id };
      renderInspector();
    } else if (hit?.junction) {
      plan.selected = { junction: hit.junction };
      renderInspector();
    } else toast('Click on a road to put a junction on it.');
  } else if (state.tool === 'crossing') {
    const c = plan.hitCrossing(s.layout, at);
    if (c) s.toggleCrossing(c.junction, c.towards);
  } else if (state.tool === 'erase') {
    if (hit?.junction) {
      const reason =
        s.lockedJunction(hit.junction) ||
        s
          .roadsAt(hit.junction)
          .map((r) => lockedRoad(r.a, r.b))
          .find(Boolean);
      if (reason) toast(`${hit.junction} stays: ${reason}.`);
      else s.removeJunction(hit.junction);
    } else if (hit?.road) {
      const reason = lockedRoad(...hit.road);
      if (reason) toast(`This road stays: ${reason}.`);
      else s.removeRoad(...hit.road);
    }
  }
});
$('plan').addEventListener('pointermove', (e) => {
  const s = state.session;
  if (!s) return;
  const at = townAt(e);
  if (state.drag) {
    const p = snapped(at, state.drag.id);
    state.drag.moved = true;
    s.moveJunction(state.drag.id, p.x, p.z, true);
    return;
  }
  if (state.tool === 'road' && state.drawing) {
    const from = state.drawing.junction ? s.junction(state.drawing.junction) : state.drawing,
      hit = plan.hit(s.layout, at),
      to = hit?.junction ? s.junction(hit.junction) : snapped(hit?.road ? hit.at : at);
    plan.ghost = { from, to };
  } else plan.ghost = null;
  if (state.tool !== 'road' || !state.drawing) plan.guides = state.drag ? plan.guides : [];
  const hit = plan.hit(s.layout, at);
  plan.hover =
    state.tool === 'crossing'
      ? { crossing: plan.hitCrossing(s.layout, at) }
      : state.tool === 'junction'
        ? hit?.road && { road: hit.road }
        : state.tool === 'pan'
          ? null
          : hit && (hit.junction ? { junction: hit.junction } : { road: hit.road });
});
$('plan').addEventListener('pointerup', () => {
  const drag = state.drag;
  state.drag = null;
  plan.guides = [];
  if (!drag?.moved) return;
  // Put it back, then move it as one undoable step.
  const s = state.session,
    j = s.junction(drag.id),
    to = { x: j.x, z: j.z };
  Object.assign(j, drag.start);
  s.moveJunction(drag.id, to.x, to.z);
});
$('plan').addEventListener('pointerleave', () => (plan.hover = null));

function hint() {
  const keys = (...pairs) => pairs.map(([k, what]) => `<b>${k}</b> ${what}`).join(' · ');
  const text =
    state.view === 'three'
      ? keys(
          ['Drag', 'to orbit'],
          ['Right-drag', 'to pan'],
          ['Scroll', 'to zoom'],
          ['1', 'back to the plan'],
        )
      : {
          select: plan.selected
            ? keys(['Drag a junction', 'to move it'], ['Delete', 'removes'], ['Esc', 'deselects'])
            : keys(
                ['Click', 'a junction or road'],
                ['Drag a junction', 'to move it'],
                ['Scroll', 'to zoom'],
                ['Right-drag', 'to pan'],
              ),
          road: state.drawing
            ? keys(
                ['Click', 'to end the road here'],
                ['…', 'and carry on'],
                ['Esc', 'stops drawing'],
              )
            : keys(['Click', 'a junction, a road or open ground to start a road']),
          junction: keys(['Click', 'a road to put a junction on it']),
          crossing: keys(['Click', 'beside a junction to add or remove the zebra crossing there']),
          erase: keys(['Click', 'a junction or road to remove it'], ['⌘Z', 'brings it back']),
          pan: keys(['Drag', 'to move around'], ['Scroll', 'to zoom']),
        }[state.tool];
  $('hint').innerHTML = text;
}

// ---- Inspector ------------------------------------------------------------------------------
function renderInspector() {
  const s = state.session,
    el = $('inspector'),
    pick = plan.selected;
  if (!s) return;
  if (pick?.junction) return renderJunction(el, s, s.junction(pick.junction));
  if (pick?.road) return renderRoad(el, s, pick.road);
  const errors = s.problems.filter((p) => p.level === 'error'),
    traffic = state.traffic;
  el.innerHTML = `
    <section>
      <h2>${state.target === 'town' ? 'Shared town layout' : `${escape(cityName(state.target))}'s own layout`}</h2>
      <p class="muted">${
        state.target === 'town'
          ? 'Every city uses this layout, unless it has one of its own.'
          : `Only ${escape(cityName(state.target))} uses this layout. It started as a copy of the shared town.`
      }</p>
      <dl class="stats" style="margin-top:12px">
        <dt>Junctions</dt><dd>${s.layout.junctions.length}</dd>
        <dt>Roads</dt><dd>${s.layout.roads.length}</dd>
        <dt>Bus stops</dt><dd>${s.map?.busStops.length ?? '–'}</dd>
        ${traffic ? `<dt>Vehicles</dt><dd>${traffic.sim.vehicles.length}</dd><dt>People</dt><dd>${traffic.sim.people.length}</dd>` : ''}
      </dl>
      <div class="actions" style="margin-top:14px">
        <button class="button" id="reset" ${s.isChanged() || state.target !== 'town' ? '' : 'disabled'}>${icon('reset', 16)}${state.target === 'town' ? 'Back to the grid' : 'Back to shared'}</button>
        <button class="button" id="fit-all">${icon('focus', 16)}Fit view</button>
      </div>
    </section>
    <section>
      <h3>Problems${s.problems.length ? ` (${s.problems.length})` : ''}</h3>
      ${
        s.problems.length
          ? `<ul class="problems">${s.problems
              .map(
                (p, i) =>
                  `<li data-problem="${i}" class="${p.level}">${icon(p.level === 'error' ? 'warning' : 'warning', 16)}<span>${escape(p.message)}</span></li>`,
              )
              .join(
                '',
              )}</ul>${errors.length ? '<p class="muted" style="margin-top:8px">Fix the red ones to save.</p>' : ''}`
          : `<p class="ok-note">${icon('select', 16)}No problems: cars and people can get everywhere.</p>`
      }
    </section>
    <section>
      <h3>Shortcuts</h3>
      <dl class="shortcuts">
        <dt><kbd>V</kbd> <kbd>R</kbd> <kbd>J</kbd></dt><dd>Select, Road, Junction</dd>
        <dt><kbd>C</kbd> <kbd>X</kbd> <kbd>H</kbd></dt><dd>Crossing, Delete, Pan</dd>
        <dt><kbd>Space</kbd></dt><dd>Hold to pan</dd>
        <dt><kbd>T</kbd></dt><dd>Run or stop the traffic</dd>
        <dt><kbd>1</kbd> <kbd>2</kbd></dt><dd>Plan, 3D</dd>
        <dt><kbd>F</kbd></dt><dd>Fit the town in view</dd>
        <dt><kbd>⌘Z</kbd> <kbd>⇧⌘Z</kbd></dt><dd>Undo, redo</dd>
      </dl>
    </section>`;
  $('reset').addEventListener('click', () => {
    if (state.target !== 'town' && !s.isChanged() && state.saved.locations[state.target]) {
      // A city's saved layout: dropping it means following the shared town again.
      if (confirm(`Make ${cityName(state.target)} use the shared town layout again?`))
        s.resetToInherited();
    } else s.resetToInherited();
  });
  $('fit-all').addEventListener('click', () => plan.fit(s.layout));
  for (const li of el.querySelectorAll('[data-problem]'))
    li.addEventListener('click', () => {
      const p = s.problems[li.dataset.problem];
      if (p.select) plan.selected = p.select;
      if (p.at) plan.focus(p.at);
      renderInspector();
    });
}
function renderJunction(el, s, j) {
  const locked = s.lockedJunction(j.id),
    roads = s.roadsAt(j.id),
    built = s.map?.junctions.find((m) => m.id === j.id),
    current = j.control ?? null;
  el.innerHTML = `
    <section>
      <h2>Junction ${escape(j.id)}</h2>
      <div class="chips"><span class="chip">${roads.length} road${roads.length === 1 ? '' : 's'}</span>
        <span class="chip">${built?.signal ? 'Signals' : { stop: 'Stop', giveway: 'Give way' }[j.control] || 'Uncontrolled'}</span></div>
      ${locked ? `<div class="locked">${icon('lock', 16)}<span>Stays in place: ${escape(locked)}.</span></div>` : ''}
    </section>
    <section>
      <h3>Position (metres)</h3>
      <div class="grid2" style="margin-top:0">
        <label class="axis x"><b>X</b><input class="input" id="jx" type="number" step="1" value="${j.x}" ${locked ? 'disabled' : ''} /></label>
        <label class="axis z"><b>Z</b><input class="input" id="jz" type="number" step="1" value="${j.z}" ${locked ? 'disabled' : ''} /></label>
      </div>
    </section>
    <section>
      <h3>Control</h3>
      <div class="controls">${CONTROL_CHOICES.map(
        ([value, label, colour, about]) =>
          `<button data-control="${value ?? ''}" class="${current === value ? 'active' : ''}" title="${escape(about)}" ${j.id === '1:1' ? 'disabled' : ''}><span class="swatch" style="background:${colour}"></span>${label}</button>`,
      ).join('')}</div>
      ${j.id === '1:1' ? `<p class="muted" style="margin-top:8px">Always signals: students' programs run these lights.</p>` : ''}
    </section>
    <section>
      <h3>Roads</h3>
      <div class="roads-list">${roads
        .map((r) => {
          const other = r.a === j.id ? r.b : r.a;
          return `<button class="button" data-road="${escape(r.a)}|${escape(r.b)}">to ${escape(other)}</button>`;
        })
        .join('')}</div>
    </section>
    <section>
      <div class="actions">
        <button class="button" id="focus">${icon('focus', 16)}Focus</button>
        <button class="button danger" id="remove" ${locked ? 'disabled' : ''}>${icon('erase', 16)}Delete</button>
      </div>
    </section>`;
  const move = () => {
    const x = parseFloat($('jx').value),
      z = parseFloat($('jz').value);
    if (Number.isFinite(x) && Number.isFinite(z)) s.moveJunction(j.id, x, z);
  };
  for (const id of ['jx', 'jz']) {
    $(id).addEventListener('change', move);
    $(id).addEventListener('keydown', (e) => e.key === 'Enter' && e.target.blur());
  }
  for (const b of el.querySelectorAll('[data-control]'))
    b.addEventListener('click', () => s.setControl(j.id, b.dataset.control || null));
  for (const b of el.querySelectorAll('[data-road]'))
    b.addEventListener('click', () => {
      plan.selected = { road: b.dataset.road.split('|') };
      renderInspector();
    });
  $('focus').addEventListener('click', () => plan.focus(j));
  $('remove').addEventListener('click', () => s.removeJunction(j.id));
}
function renderRoad(el, s, [a, b]) {
  const ja = s.junction(a),
    jb = s.junction(b),
    length = Math.hypot(jb.x - ja.x, jb.z - ja.z),
    locked = lockedRoad(a, b),
    stops = (s.map?.busStops || []).filter(
      (stop) => stop.id === `${a}>${b}` || stop.id === `${b}>${a}`,
    );
  el.innerHTML = `
    <section>
      <h2>Road ${escape(a)} – ${escape(b)}</h2>
      <div class="chips"><span class="chip">${Math.round(length)} m</span><span class="chip">A lane each way</span>${stops.length ? `<span class="chip">${stops.length} bus stop${stops.length > 1 ? 's' : ''}</span>` : ''}</div>
      ${locked ? `<div class="locked">${icon('lock', 16)}<span>Stays: ${escape(locked)}.</span></div>` : ''}
    </section>
    <section>
      <h3>Ends</h3>
      <div class="roads-list">
        <button class="button" data-junction="${escape(a)}">${escape(a)}</button>
        <button class="button" data-junction="${escape(b)}">${escape(b)}</button>
      </div>
      <p class="muted" style="margin-top:10px">Move a road by dragging the junctions at its ends. Lane count, widths and markings come with the road look tools.</p>
    </section>
    <section>
      <div class="actions">
        <button class="button" id="focus">${icon('focus', 16)}Focus</button>
        <button class="button danger" id="remove" ${locked ? 'disabled' : ''}>${icon('erase', 16)}Delete</button>
      </div>
    </section>`;
  for (const btn of el.querySelectorAll('[data-junction]'))
    btn.addEventListener('click', () => {
      plan.selected = { junction: btn.dataset.junction };
      renderInspector();
    });
  $('focus').addEventListener('click', () =>
    plan.focus({ x: (ja.x + jb.x) / 2, z: (ja.z + jb.z) / 2 }),
  );
  $('remove').addEventListener('click', () => s.removeRoad(a, b));
}

// ---- Traffic --------------------------------------------------------------------------------
function startTraffic() {
  const sim = new CommunitySimulation(previewLocation(state.previewCity), state.session.layout);
  state.traffic = { sim };
  $('run').classList.add('running');
  $('run').innerHTML = icon('pause', 16) + 'Stop traffic';
}
function stopTraffic() {
  state.traffic = null;
  $('run').classList.remove('running');
  $('run').innerHTML = icon('traffic', 16) + 'Run traffic';
}
$('run').addEventListener('click', () => {
  if (state.traffic) stopTraffic();
  else if (state.session.errors.length)
    toast('Fix the problems in red first: the traffic cannot run on this layout.', true);
  else startTraffic();
  renderInspector();
});

// ---- 3D preview -----------------------------------------------------------------------------
let viewport = null;
async function showWorld() {
  if (state.session.errors.length) {
    toast('Fix the problems in red first: the town cannot be built from this layout.', true);
    return setView('plan');
  }
  if (!viewport) {
    // The Map Editor's view: the game's own renderer and an orbit camera.
    const { Viewport } = await import('../map-editor/viewport.js');
    viewport = new Viewport($('world'));
  }
  if (state.worldStale) {
    $('loading').hidden = false;
    $('loading').textContent = 'Building the town…';
    await new Promise((resolve) => setTimeout(resolve, 30));
    const location = previewLocation(state.previewCity),
      model = createRegionalModel(state.previewCity);
    addCommunityWorld(model, location?.id === 'legacy' ? undefined : location, {
      streets: state.session.layout,
    });
    prepareWorldMaterials(model);
    viewport.setSession(
      { model, groups: new Map() },
      location?.id === 'legacy' ? undefined : location,
    );
    viewport.setTool('camera');
    viewport.view('town', true);
    state.worldStale = false;
    $('loading').hidden = true;
  }
}
function setView(view) {
  state.view = view === '3d' || view === 'three' ? 'three' : 'plan';
  for (const b of $('views').children)
    b.classList.toggle('active', (b.dataset.view === '3d') === (state.view === 'three'));
  $('plan').hidden = state.view !== 'plan';
  $('world').hidden = state.view === 'plan';
  $('view-tools').hidden = state.view !== 'plan';
  $('tools').style.visibility = state.view === 'plan' ? 'visible' : 'hidden';
  if (state.view === 'three') showWorld();
  hint();
}
for (const b of $('views').children) b.addEventListener('click', () => setView(b.dataset.view));

// ---- Save, undo, toasts ---------------------------------------------------------------------
async function save() {
  const broken = [...state.sessions.values()].find((s) => s.isChanged() && s.errors.length);
  if (broken) {
    if (broken !== state.session) openTarget(broken.target);
    toast('Fix the problems in red before saving: the game could not run this layout.', true);
    return false;
  }
  let saved = JSON.parse(JSON.stringify(state.saved));
  for (const s of state.sessions.values()) {
    if (!s.isChanged()) continue;
    const mine = s.savedWith();
    if (s.target === 'town') saved.town = mine.town;
    else if (mine.locations[s.target]) saved.locations[s.target] = mine.locations[s.target];
    else delete saved.locations[s.target];
  }
  try {
    await shell.write('street-layout', saved);
  } catch (error) {
    toast('Could not save: ' + error.message, true);
    return false;
  }
  state.saved = saved;
  for (const s of state.sessions.values()) s.markSaved(saved);
  renderTargets();
  changed();
  toast('Saved to public/data/street-layout.js');
  return true;
}
$('save').addEventListener('click', save);
function undo(redo = false) {
  const label = redo ? state.session.redo() : state.session.undo();
  if (label) toast(`${redo ? 'Redid' : 'Undid'}: ${label}`);
}
$('undo').addEventListener('click', () => undo());
$('redo').addEventListener('click', () => undo(true));
$('home').addEventListener('click', (e) => {
  if (unsaved() && !confirm('Leave the Street Editor? Unsaved changes will be lost.'))
    e.preventDefault();
});
let toastTimer;
function toast(message, error = false) {
  const el = $('toast');
  el.textContent = message;
  el.classList.toggle('error', error);
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), error ? 6000 : 2800);
}

// ---- Keyboard -------------------------------------------------------------------------------
const typing = () => /^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement?.tagName);
document.addEventListener('keydown', (e) => {
  const mod = e.metaKey || e.ctrlKey,
    key = e.key.toLowerCase();
  if (mod && !shell) {
    if (key === 'z') return (e.preventDefault(), typing() || undo(e.shiftKey));
    if (key === 's') return (e.preventDefault(), save());
  }
  if (typing()) {
    if (e.key === 'Escape') document.activeElement.blur();
    return;
  }
  if (mod) return;
  if (e.key === ' ') {
    e.preventDefault();
    plan.panning = true;
    $('plan').className = 'pan';
    return;
  }
  if (e.key === 'Escape') {
    if (state.drawing) {
      state.drawing = null;
      plan.ghost = null;
    } else plan.selected = null;
    renderInspector();
    return hint();
  }
  if (e.key === 'Delete' || e.key === 'Backspace') {
    const s = state.session,
      pick = plan.selected;
    if (pick?.junction)
      s.removeJunction(pick.junction) || toast(`${pick.junction} stays where it is.`);
    else if (pick?.road) s.removeRoad(...pick.road) || toast('This road stays as it is.');
    return;
  }
  const tool = { v: 'select', r: 'road', j: 'junction', c: 'crossing', x: 'erase', h: 'pan' }[key];
  if (tool && state.view === 'plan') return setTool(tool);
  if (key === 't') return $('run').click();
  if (key === '1') return setView('plan');
  if (key === '2') return setView('3d');
  if (key === 'f') plan.fit(state.session.layout);
});
document.addEventListener('keyup', (e) => {
  if (e.key !== ' ') return;
  plan.panning = state.tool === 'pan';
  $('plan').className = state.tool;
});
shell?.onMenu((command) => {
  if (command === 'save') save();
  // The town's streets in the city being edited (or previewed, for the shared town grid).
  else if (command === 'playtest')
    shell.openGame({
      city: state.target === 'town' ? state.previewCity : state.target,
      place: 'town',
    });
  else if (command === 'playstart') shell.openGame();
  else if (typing()) document.execCommand(command);
  else undo(command === 'redo');
});

// ---- Frame loop -----------------------------------------------------------------------------
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (!state.session || state.view !== 'plan') return;
  if (state.traffic) {
    // Twice real time, so a minute of traffic plays in thirty seconds.
    state.traffic.sim.advance(dt * 2);
    state.traffic.vehicles = state.traffic.sim.vehicles;
    state.traffic.people = state.traffic.sim.people;
    if ((state.trafficTick = (state.trafficTick || 0) + dt) > 1) {
      state.trafficTick = 0;
      if (!plan.selected) renderInspector();
    }
  }
  plan.draw({
    layout: state.session.layout,
    map: state.session.map,
    problems: state.session.problems,
    traffic: state.traffic,
    lockedJunctions: LOCKED.junctions,
    tool: state.tool,
  });
}
requestAnimationFrame(frame);

// For test scripts and the developer console.
window.streetEditor = {
  state,
  plan,
  get viewport() {
    return viewport;
  },
};

async function start() {
  if (shell) state.saved = await shell.read('street-layout');
  else state.saved = (await import('../../../public/data/street-layout.js')).default;
  state.saved = JSON.parse(JSON.stringify(state.saved));
  state.saved.locations ||= {};
  renderTargets();
  setSnap(true);
  setTool('select');
  setView('plan');
  stopTraffic();
  openTarget('town');
  $('loading').hidden = true;
}
start().catch((error) => {
  $('loading').hidden = false;
  $('loading').textContent = /No handler registered/.test(error.message)
    ? 'The editor was updated while it was open. Quit it (⌘Q) and run scripts/world-editor.sh again.'
    : 'The Street Editor could not start: ' + error.message;
  console.error(error);
});
