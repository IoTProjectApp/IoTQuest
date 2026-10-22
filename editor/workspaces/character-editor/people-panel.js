// The Character Editor's new people and routines: a "New person" button over the list, a "Who they
// are" and a "Routine" section at the top of the inspector, and the routine map, drawn over the
// preview: the city from above, with the stops to click, drag and time, played back as they walk.
import { CLIPS } from '../../../public/character-clips.js';
import { locations } from '../../../public/locations.js';
import {
  isOwn,
  routineLegs,
  routinePose,
  MAX_STAY,
  MAX_STOPS,
} from '../../../public/people-settings.js';
import { collides } from '../../../public/world-math.js';
import { PeopleSession, cityOf } from './people-session.js';
import { cityWorld } from './city-world.js';
import { ownEntry } from './people.js';
import { icon } from '../../ui/icons.js';

const escape = (s) =>
  String(s ?? '').replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c],
  );
const label = (clip) => clip.replace(/([a-z])([A-Z])/g, '$1 $2');
const clipNames = () => Object.keys(CLIPS).filter((name) => !name.startsWith(' '));
const CITIES = [
  ['legacy', 'Home (the original house)'],
  ['*', 'Every city'],
  ...[...locations].sort((a, b) => a.city.localeCompare(b.city)).map((l) => [l.id, l.city]),
];
const cityName = (id) => CITIES.find(([c]) => c === id)?.[1] || id;
const seconds = (s) =>
  s >= 60
    ? `${Math.floor(s / 60)} min${Math.round(s % 60) ? ` ${Math.round(s % 60)} s` : ''}`
    : `${Math.round(s)} s`;

// app: { state, session (CharacterSession), saved (data/people.js), select, toast }
export function mountPeople(app) {
  const people = new PeopleSession(app.session, app.saved),
    { state } = app;

  // ---- The list --------------------------------------------------------------------------------
  const add = document.createElement('button');
  add.className = 'button new-person';
  add.id = 'new-person';
  add.title = 'Add someone of your own to the game';
  add.innerHTML = icon('plus', 16) + 'New person';
  document.querySelector('.people .search').after(add);
  add.addEventListener('click', () => {
    // Out on the front lawn at home, clear of the house, until placed somewhere else.
    const world = cityWorld('legacy');
    let at = [2, 9];
    for (let i = 0; i < 40 && collides(at[0], at[1], world.colliders); i++) at = [2 + i * 0.6, 9];
    const id = people.add({ name: 'New person ' + (people.data.people.length + 1), at });
    app.select(id);
  });

  // The list's entries for the people added here, replacing any shown before.
  function sync() {
    state.people = [
      ...state.people.filter((p) => !isOwn(p.id)),
      ...people.data.people.map(ownEntry),
    ];
    if (isOwn(state.target) && !people.person(state.target)) app.select('player');
    if (!map.hidden && !routineTarget()) closeMap();
  }

  // ---- Checks --------------------------------------------------------------------------------
  const problems = () => people.check(cityWorld);
  const problemsOf = (id) => problems().filter((p) => p.id === id);

  // ---- The inspector -------------------------------------------------------------------------
  function inspector(el, target) {
    if (!target || target === 'defaults') return;
    const own = people.person(target),
      top = document.createElement('div');
    top.className = 'people-sections';
    top.innerHTML = (own ? whoSection(own) : '') + routineSection(target, own);
    el.prepend(top);
    bind(top, target, own);
  }
  function whoSection(p) {
    return `<section class="who">
      <div class="section-head"><h3>Who they are</h3></div>
      <label class="field"><span>Name</span><input class="input" data-who="name" value="${escape(p.name)}" maxlength="40" /></label>
      <label class="field"><span>Lives in</span><select class="select" data-who="city">${CITIES.map(([id, text]) => `<option value="${escape(id)}" ${id === p.city ? 'selected' : ''}>${escape(text)}</option>`).join('')}</select></label>
      <label class="field"><span>What they do</span><input class="input" data-who="role" value="${escape(p.role)}" maxlength="40" placeholder="Neighbour" /></label>
      <label class="field"><span>About them</span><textarea data-who="bio" rows="2" maxlength="240" placeholder="A line about who they are">${escape(p.bio)}</textarea></label>
      <div class="row"><span>Stands at</span><div class="controls"><span class="note">${p.at[0].toFixed(1)}, ${p.at[1].toFixed(1)} m${people.routine(p.id) ? ' (on a routine, they walk it instead)' : ''}</span>
        <button class="button" data-place>${icon('focus', 14)}Place on the map…</button></div></div>
      <p class="note">Their name can be picked as a quest's resident in the Quest Editor, and their lines written in the Conversation Editor, once saved.</p>
      <div class="actions"><button class="button danger" data-remove>${icon('erase', 16)}Remove ${escape(p.name)}</button></div>
    </section>`;
  }
  function routineSection(id, own) {
    const can = people.canHaveRoutine(id, cityWorld(own ? cityOf(own) : 'legacy').actorIds),
      routine = people.routine(id),
      issues = problemsOf(id);
    let body;
    if (!can.ok) body = `<p class="note">${icon('lock', 14)} ${escape(can.reason)}</p>`;
    else {
      const { round } = routineLegs(routine);
      body =
        (routine
          ? `<p class="muted">${routine.stops.length} ${routine.stops.length === 1 ? 'stop' : 'stops'} · one round takes ${seconds(round)}${own ? '' : ' · plays at home only'}</p>`
          : `<p class="muted">None: ${own ? 'they stand where they were put' : 'they do what the game has them do'}.</p>`) +
        `<div class="actions"><button class="button primary" data-draw>${icon('road', 16)}${routine ? 'Edit routine…' : 'Draw a routine…'}</button>
         ${routine ? `<button class="button" data-clear>${icon('reset', 16)}Clear</button>` : ''}</div>`;
    }
    return `<section class="routine">
      <div class="section-head"><h3>Routine</h3></div>${body}
      ${issues.length ? `<ul class="issues">${issues.map((p) => `<li class="${p.error ? 'error' : 'warning'}">${icon('warning', 14)}<span>${escape(p.text)}</span></li>`).join('')}</ul>` : ''}
    </section>`;
  }
  function bind(el, target, own) {
    for (const input of el.querySelectorAll('[data-who]'))
      input.addEventListener('change', () => {
        const key = input.dataset.who,
          value = key === 'name' ? input.value.trim() : input.value;
        if (key === 'city' && !people.routine(target)) {
          // Somewhere to stand in the new city: where they were, or the front lawn.
          const world = cityWorld(value === '*' ? 'legacy' : value);
          const at = collides(own.at[0], own.at[1], world.colliders) ? [2, 9] : own.at;
          people.update(target, { city: value, at }, 'Move to ' + cityName(value));
        } else people.update(target, { [key]: value }, 'Change ' + key);
      });
    el.querySelector('[data-place]')?.addEventListener('click', () => openMap(target, 'place'));
    el.querySelector('[data-remove]')?.addEventListener('click', () => {
      if (!confirm(`Remove ${own.name} from the game, with their looks and routine?`)) return;
      people.remove(target);
      app.select('player');
    });
    el.querySelector('[data-draw]')?.addEventListener('click', () => openMap(target, 'route'));
    el.querySelector('[data-clear]')?.addEventListener('click', () => people.clearRoutine(target));
  }

  // ---- The map -------------------------------------------------------------------------------
  const map = document.createElement('div');
  map.className = 'routine-map';
  map.id = 'routine-map';
  map.hidden = true;
  map.innerHTML = `<div class="map-head"><div><strong id="map-title"></strong><span id="map-sub"></span></div>
      <div class="map-tools">
        <button class="button" id="map-play" title="Play the routine back (P)"></button>
        <div class="segmented" id="map-speed" role="group" aria-label="Playback speed">
          <button data-speed="1">1×</button><button data-speed="5">5×</button><button data-speed="20">20×</button>
        </div>
        <button class="button" id="map-fit" title="Show the whole routine (F)">${icon('focus', 16)}Fit</button>
        <button class="button icon-only" id="map-close" title="Close (Esc)">${icon('close', 18)}</button>
      </div></div>
    <div class="map-body"><canvas id="map-canvas" tabindex="0" aria-label="Routine map"></canvas><div class="map-side" id="map-side"></div></div>
    <div class="map-hint" id="map-hint"></div>`;
  document.querySelector('.stage .view').append(map);
  const canvas = map.querySelector('#map-canvas'),
    ctx = canvas.getContext('2d');
  const view = {
    id: null,
    mode: 'route',
    cx: 0,
    cz: 0,
    scale: 8,
    selected: null,
    playing: true,
    speed: 5,
    clock: 0,
    drag: null,
  };
  // The person whose routine (or standing spot) is on the map, if they still can be.
  const routineTarget = () =>
    view.id && (!isOwn(view.id) || people.person(view.id)) ? view.id : null;
  const worldOf = () => {
    const own = people.person(view.id);
    return cityWorld(own ? cityOf(own) : 'legacy');
  };

  function openMap(id, mode) {
    Object.assign(view, { id, mode, selected: null, clock: 0 });
    map.hidden = false;
    resize();
    fit();
    renderSide();
    canvas.focus();
  }
  function closeMap() {
    map.hidden = true;
    view.id = null;
  }
  map.querySelector('#map-close').addEventListener('click', closeMap);
  map.querySelector('#map-fit').addEventListener('click', fit);
  map.querySelector('#map-play').addEventListener('click', () => setPlaying(!view.playing));
  for (const b of map.querySelectorAll('[data-speed]'))
    b.addEventListener('click', () => {
      view.speed = Number(b.dataset.speed);
      renderTools();
    });
  function setPlaying(on) {
    view.playing = on;
    renderTools();
  }
  function renderTools() {
    map.querySelector('#map-play').innerHTML =
      icon(view.playing ? 'pause' : 'play', 16) + (view.playing ? 'Pause' : 'Play');
    for (const b of map.querySelectorAll('[data-speed]'))
      b.classList.toggle('active', Number(b.dataset.speed) === view.speed);
  }
  renderTools();

  // World metres to canvas pixels and back: x across, z down, as the game's map.
  const toScreen = (x, z) => [
    canvas.width / 2 + (x - view.cx) * view.scale,
    canvas.height / 2 + (z - view.cz) * view.scale,
  ];
  const toWorld = (px, py) => [
    view.cx + (px - canvas.width / 2) / view.scale,
    view.cz + (py - canvas.height / 2) / view.scale,
  ];
  function resize() {
    const r = canvas.getBoundingClientRect(),
      dpr = 1;
    canvas.width = Math.max(1, Math.round(r.width * dpr));
    canvas.height = Math.max(1, Math.round(r.height * dpr));
  }
  new ResizeObserver(() => !map.hidden && resize()).observe(canvas);
  // The routine and where they stand, with a margin; the house when there is nothing yet.
  function fit() {
    const own = people.person(view.id),
      points = (people.routine(view.id)?.stops || []).map((s) => s.at);
    if (own) points.push(own.at);
    const actor = worldOf().actors.find((a) => a.id === view.id);
    if (actor) points.push([actor.x, actor.z]);
    if (!points.length) points.push([0, 0]);
    const xs = points.map((p) => p[0]),
      zs = points.map((p) => p[1]),
      w = Math.max(30, Math.max(...xs) - Math.min(...xs) + 16),
      d = Math.max(30, Math.max(...zs) - Math.min(...zs) + 16);
    view.cx = (Math.max(...xs) + Math.min(...xs)) / 2;
    view.cz = (Math.max(...zs) + Math.min(...zs)) / 2;
    view.scale = Math.min(canvas.width / w, canvas.height / d);
  }

  // ---- Drawing -------------------------------------------------------------------------------
  function draw() {
    if (map.hidden || !routineTarget()) return;
    const world = worldOf(),
      css = getComputedStyle(document.body),
      colour = (name) => css.getPropertyValue(name).trim();
    ctx.fillStyle = '#20262e';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    // A metre grid every 5 m (10 m lines brighter), when it is not too dense.
    const step = view.scale > 6 ? 5 : 25;
    const [x0, z0] = toWorld(0, 0),
      [x1, z1] = toWorld(canvas.width, canvas.height);
    ctx.lineWidth = 1;
    for (let x = Math.floor(x0 / step) * step; x < x1; x += step) {
      ctx.strokeStyle = x % (step * 2) ? '#252c35' : '#2b333d';
      const [px] = toScreen(x, 0);
      ctx.beginPath();
      ctx.moveTo(px, 0);
      ctx.lineTo(px, canvas.height);
      ctx.stroke();
    }
    for (let z = Math.floor(z0 / step) * step; z < z1; z += step) {
      ctx.strokeStyle = z % (step * 2) ? '#252c35' : '#2b333d';
      const [, py] = toScreen(0, z);
      ctx.beginPath();
      ctx.moveTo(0, py);
      ctx.lineTo(canvas.width, py);
      ctx.stroke();
    }
    // What is in the way.
    ctx.fillStyle = '#4a5462';
    for (const c of world.colliders) {
      const [px, py] = toScreen(c.x - c.w / 2, c.z - c.d / 2);
      ctx.fillRect(px, py, Math.max(1, c.w * view.scale), Math.max(1, c.d * view.scale));
    }
    // Everyone else.
    ctx.fillStyle = '#7d8794';
    for (const a of world.actors) {
      if (a.id === view.id) continue;
      const [px, py] = toScreen(a.x, a.z);
      ctx.beginPath();
      ctx.arc(px, py, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    const accent = colour('--accent') || '#4f9cf9',
      danger = colour('--danger') || '#ef6b6b';
    const own = people.person(view.id),
      routine = people.routine(view.id),
      stops = routine?.stops || [],
      blocked = new Set(
        problemsOf(view.id)
          .filter((p) => p.leg !== undefined)
          .map((p) => p.leg),
      ),
      badStops = new Set(
        problemsOf(view.id)
          .filter((p) => p.stop !== undefined)
          .map((p) => p.stop),
      );
    // Where a new person stands without a routine.
    if (own) {
      const [px, py] = toScreen(...own.at);
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = view.mode === 'place' ? accent : '#9aa3b0';
      ctx.fillRect(-6, -6, 12, 12);
      ctx.restore();
    }
    // The walks, then the stops.
    if (stops.length > 1)
      stops.forEach((stop, i) => {
        const next = stops[(i + 1) % stops.length],
          [ax, ay] = toScreen(...stop.at),
          [bx, by] = toScreen(...next.at);
        ctx.strokeStyle = blocked.has(i) ? danger : accent;
        ctx.setLineDash(blocked.has(i) ? [6, 4] : i === stops.length - 1 ? [2, 4] : []);
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(bx, by);
        ctx.stroke();
        // An arrow halfway along: the way they walk.
        const mx = (ax + bx) / 2,
          my = (ay + by) / 2,
          a = Math.atan2(by - ay, bx - ax);
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(mx + Math.cos(a) * 6, my + Math.sin(a) * 6);
        ctx.lineTo(mx + Math.cos(a + 2.5) * 6, my + Math.sin(a + 2.5) * 6);
        ctx.lineTo(mx + Math.cos(a - 2.5) * 6, my + Math.sin(a - 2.5) * 6);
        ctx.fillStyle = ctx.strokeStyle;
        ctx.fill();
      });
    ctx.setLineDash([]);
    stops.forEach((stop, i) => {
      const [px, py] = toScreen(...stop.at);
      ctx.beginPath();
      ctx.arc(px, py, 10, 0, Math.PI * 2);
      ctx.fillStyle = badStops.has(i) ? danger : i === view.selected ? '#ffffff' : accent;
      ctx.fill();
      ctx.fillStyle = i === view.selected ? '#121519' : '#ffffff';
      ctx.font = '600 11px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(i + 1), px, py + 0.5);
    });
    // Them, where the routine has them now.
    const pose = routine ? routinePose(routine, view.clock, app.speedOf(view.id)) : null;
    const at = pose ? [pose.x, pose.z] : own ? own.at : null;
    if (at) {
      const [px, py] = toScreen(...at);
      ctx.beginPath();
      ctx.arc(px, py, 6, 0, Math.PI * 2);
      ctx.fillStyle = '#f2b84b';
      ctx.fill();
      ctx.strokeStyle = '#121519';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    map.querySelector('#map-hint').textContent = pose
      ? pose.walking
        ? `Walking to stop ${((pose.stop + 1) % stops.length) + 1}`
        : `At stop ${pose.stop + 1}${stops[pose.stop].clip ? ': ' + label(stops[pose.stop].clip) : ''}`
      : view.mode === 'place'
        ? 'Click where they stand'
        : 'Click the map to add the first stop';
  }
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (!map.hidden && view.playing) view.clock += dt * view.speed;
    draw();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // ---- The stops beside the map --------------------------------------------------------------
  function renderSide() {
    const id = routineTarget();
    if (!id) return;
    const own = people.person(id),
      name = own?.name || state.people.find((p) => p.id === id)?.name || id,
      routine = people.routine(id),
      stops = routine?.stops || [],
      where = own ? cityName(own.city) : 'Home';
    map.querySelector('#map-title').textContent =
      view.mode === 'place' ? `Where ${name} stands` : `${name}'s routine`;
    map.querySelector('#map-sub').textContent =
      ` · ${where}${own?.city === '*' ? ' (shown at home)' : ''}`;
    const clips = (selected) =>
      `<option value="" ${selected ? '' : 'selected'}>Their standing clip</option>` +
      clipNames()
        .map(
          (c) =>
            `<option value="${escape(c)}" ${c === selected ? 'selected' : ''}>${escape(label(c))}</option>`,
        )
        .join('');
    const side = map.querySelector('#map-side');
    if (view.mode === 'place') {
      side.innerHTML = `<p class="muted">Click the map where ${escape(name)} stands when they have no routine. Grey blocks are walls and furniture; dots are other people.</p>
        <button class="button" data-mode="route">${icon('road', 16)}Draw a routine instead</button>`;
    } else {
      const { round } = routineLegs(routine);
      side.innerHTML =
        `<p class="muted">${stops.length ? `${stops.length} of ${MAX_STOPS} stops · a round takes ${seconds(round)}. After the last stop they walk back to the first.` : 'Click the map to add stops. They walk from one to the next in a straight line, wait, and start again.'}</p>` +
        `<ol class="stops">${stops
          .map(
            (stop, i) => `<li class="${i === view.selected ? 'selected' : ''}" data-stop="${i}">
            <div class="stop-head"><span class="num">${i + 1}</span><span class="where">${stop.at[0].toFixed(1)}, ${stop.at[1].toFixed(1)}</span>
              <button class="remove" data-up="${i}" title="Earlier" ${i ? '' : 'disabled'}>↑</button>
              <button class="remove" data-down="${i}" title="Later" ${i < stops.length - 1 ? '' : 'disabled'}>↓</button>
              <button class="remove" data-drop="${i}" title="Remove stop">${icon('close', 14)}</button></div>
            <label>Stay <input class="input" type="number" min="0" max="${MAX_STAY}" step="1" data-stay="${i}" value="${stop.stay}" /> s</label>
            <select class="select" data-clip="${i}">${clips(stop.clip)}</select>
          </li>`,
          )
          .join('')}</ol>` +
        (own
          ? `<button class="link" data-mode="place">${icon('focus', 14)}Set where they stand instead</button>`
          : '');
    }
    for (const b of side.querySelectorAll('[data-mode]'))
      b.addEventListener('click', () => {
        view.mode = b.dataset.mode;
        renderSide();
      });
    for (const li of side.querySelectorAll('[data-stop]'))
      li.addEventListener('click', (e) => {
        if (e.target.closest('input, select, button')) return;
        view.selected = Number(li.dataset.stop);
        renderSide();
      });
    for (const input of side.querySelectorAll('[data-stay]'))
      input.addEventListener('change', () =>
        people.setStop(id, Number(input.dataset.stay), { stay: input.value }),
      );
    for (const select of side.querySelectorAll('[data-clip]'))
      select.addEventListener('change', () =>
        people.setStop(id, Number(select.dataset.clip), { clip: select.value || null }),
      );
    for (const b of side.querySelectorAll('[data-drop]'))
      b.addEventListener('click', () => {
        view.selected = null;
        people.removeStop(id, Number(b.dataset.drop));
      });
    for (const [attr, by] of [
      ['up', -1],
      ['down', 1],
    ])
      for (const b of side.querySelectorAll(`[data-${attr}]`))
        b.addEventListener('click', () => {
          const i = Number(b.dataset[attr]);
          if (people.reorderStop(id, i, by)) view.selected = i + by;
        });
  }

  // ---- Pointer -------------------------------------------------------------------------------
  const point = (e) => {
    const r = canvas.getBoundingClientRect();
    return [
      ((e.clientX - r.left) * canvas.width) / r.width,
      ((e.clientY - r.top) * canvas.height) / r.height,
    ];
  };
  const stopAt = (px, py) =>
    (people.routine(view.id)?.stops || []).findIndex((s) => {
      const [sx, sy] = toScreen(...s.at);
      return Math.hypot(sx - px, sy - py) < 11;
    });
  canvas.addEventListener('pointerdown', (e) => {
    const [px, py] = point(e),
      stop = view.mode === 'route' ? stopAt(px, py) : -1;
    canvas.setPointerCapture(e.pointerId);
    view.drag = { px, py, cx: view.cx, cz: view.cz, stop, moved: false, at: null };
    // Where a dragged stop started: put back before the move is saved, so undo returns it there.
    if (stop >= 0) view.drag.from = [...people.routine(view.id).stops[stop].at];
    if (stop >= 0) {
      view.selected = stop;
      renderSide();
    }
  });
  canvas.addEventListener('pointermove', (e) => {
    const drag = view.drag;
    if (!drag) {
      const [px, py] = point(e);
      canvas.style.cursor = view.mode === 'route' && stopAt(px, py) >= 0 ? 'grab' : 'crosshair';
      return;
    }
    const [px, py] = point(e);
    if (Math.hypot(px - drag.px, py - drag.py) > 4) drag.moved = true;
    if (!drag.moved) return;
    if (drag.stop >= 0) {
      // The stop follows the pointer; it is saved once, when let go.
      drag.at = toWorld(px, py);
      people.routine(view.id).stops[drag.stop].at = drag.at;
    } else {
      view.cx = drag.cx - (px - drag.px) / view.scale;
      view.cz = drag.cz - (py - drag.py) / view.scale;
    }
  });
  canvas.addEventListener('pointerup', (e) => {
    const drag = view.drag;
    view.drag = null;
    if (!drag) return;
    const [px, py] = point(e);
    if (drag.stop >= 0 && drag.moved) {
      people.routine(view.id).stops[drag.stop].at = drag.from;
      people.moveStop(view.id, drag.stop, drag.at);
      return;
    }
    if (drag.moved) return;
    const at = toWorld(px, py);
    if (view.mode === 'place') {
      people.update(view.id, { at }, 'Place ' + (people.person(view.id)?.name || 'person'));
      return;
    }
    if (drag.stop >= 0) return;
    const routine = people.routine(view.id);
    if ((routine?.stops.length || 0) >= MAX_STOPS)
      return app.toast(`A routine has at most ${MAX_STOPS} stops.`, true);
    people.addStop(view.id, at, { index: view.selected === null ? null : view.selected + 1 });
    view.selected =
      view.selected === null ? people.routine(view.id).stops.length - 1 : view.selected + 1;
  });
  canvas.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      const [px, py] = point(e),
        [wx, wz] = toWorld(px, py);
      view.scale = Math.max(1, Math.min(60, view.scale * Math.exp(-e.deltaY * 0.0015)));
      // Zoom about the pointer.
      const [nx, nz] = toWorld(px, py);
      view.cx += wx - nx;
      view.cz += wz - nz;
    },
    { passive: false },
  );
  map.addEventListener('keydown', (e) => {
    if (/^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) return;
    if (e.key === 'Escape') return (e.stopPropagation(), closeMap());
    if (e.key.toLowerCase() === 'f') return fit();
    if (e.key.toLowerCase() === 'p') return setPlaying(!view.playing);
    if ((e.key === 'Delete' || e.key === 'Backspace') && view.selected !== null) {
      e.preventDefault();
      people.removeStop(view.id, view.selected);
      view.selected = null;
    }
  });

  return {
    people,
    sync,
    inspector,
    // After any change: the stops beside the map follow it.
    changed() {
      if (!map.hidden && routineTarget()) renderSide();
    },
    // The first problem that stops a save, if any.
    problem: () => problems().find((p) => p.error) || null,
    isChanged: () => people.isChanged(),
    savedFile: () => people.savedFile(),
    // Where play-test goes for someone: their city, or home.
    cityFor: (id) => (people.person(id) ? cityOf(people.person(id)) : 'legacy'),
    openMap,
  };
}
