// New walls in the House tool (saved as `walls` in the layout, see public/added-walls.js): drawing
// one by dragging across the ground, the two end handles that stretch or swing it, and its
// inspector. The viewport's move arrow slides a whole wall (see attachWallGizmo in viewport.js).
import * as THREE from '../../../public/vendor/three.module.min.js';
import { WALL_DEFAULTS, WALL_LIMITS, wallLine } from '../../../public/added-walls.js';
import { wallName } from './session.js';

const GRID = 0.05,
  // How near (metres on the ground) an end snaps to another wall's end or line.
  SNAP_TO = 0.3,
  // How near (pixels) a press must be to grab an end handle.
  GRAB = 14;
const snapGrid = (v) => Math.round(v / GRID) * GRID;

export class WallTool {
  // `viewport`: the Map Editor's; `on`: { drawn(from, to), moved(id, from, to) }.
  constructor(viewport, on) {
    this.viewport = viewport;
    this.on = on;
    this.drawing = false;
    this.draft = null;
    this.selectedId = null;
    this.drag = null;
    const knob = (color) => {
      const m = new THREE.Mesh(
        new THREE.SphereGeometry(0.16, 16, 12),
        new THREE.MeshBasicMaterial({ color, depthTest: false, transparent: true }),
      );
      m.renderOrder = 10;
      m.visible = false;
      viewport.renderer.scene.add(m);
      return m;
    };
    this.ends = [knob(0x4f9cf9), knob(0x4f9cf9)];
    // Before the gizmo and the camera: a press that starts a wall or grabs an end is ours.
    const c = viewport.canvas;
    c.addEventListener('pointerdown', (e) => this.down(e), { capture: true });
    c.addEventListener('pointermove', (e) => this.move(e), { capture: true });
    c.addEventListener('pointerup', (e) => this.up(e), { capture: true });
  }
  get session() {
    return this.viewport.session;
  }
  // ---- Drawing ----
  startDrawing() {
    this.drawing = true;
    this.viewport.canvas.style.cursor = 'crosshair';
  }
  stopDrawing() {
    this.drawing = false;
    this.draft = null;
    this.viewport.canvas.style.cursor = '';
    this.session?.previewWalls(this.session.addedWalls());
  }
  // Where the cursor meets the ground, snapped: to another wall's end or line nearby, else to the
  // 5 cm grid (with Snap on). `from` given: Shift keeps the wall to 15° steps, and with Snap on a
  // wall nearly square to the axes is made square.
  point(e, from = null) {
    const ray = this.viewport.ray(e),
      hit = ray && this.viewport.groundAt(ray);
    if (!hit) return null;
    let p = [hit[0], hit[2]];
    if (from) {
      const dx = p[0] - from[0],
        dz = p[1] - from[1],
        length = Math.hypot(dx, dz),
        angle = Math.atan2(dz, dx),
        step = e.shiftKey ? Math.PI / 12 : this.viewport.snap ? Math.PI / 2 : 0,
        near = step && Math.abs(angle - Math.round(angle / step) * step) < (e.shiftKey ? 1 : 0.07);
      if (near) {
        const a = Math.round(angle / step) * step;
        p = [from[0] + Math.cos(a) * length, from[1] + Math.sin(a) * length];
      }
    }
    if (!this.viewport.snap) return p;
    const target = this.snapTarget(p);
    return target || [snapGrid(p[0]), snapGrid(p[1])];
  }
  // The nearest end of a house wall or an added wall, if near enough.
  snapTarget([x, z]) {
    const s = this.session,
      points = [];
    for (const w of s.walls())
      points.push(
        w.axis === 'x' ? [w.from, w.at] : [w.at, w.from],
        w.axis === 'x' ? [w.to, w.at] : [w.at, w.to],
      );
    for (const w of s.addedWalls()) if (w.id !== this.drag?.id) points.push(w.from, w.to);
    let best = null,
      nearest = SNAP_TO;
    for (const p of points) {
      const d = Math.hypot(p[0] - x, p[1] - z);
      if (d < nearest) [best, nearest] = [[...p], d];
    }
    return best;
  }
  down(e) {
    if (e.button !== 0 || this.viewport.tool !== 'house') return;
    if (this.drawing) {
      const at = this.point(e);
      if (!at) return;
      this.draft = { id: 'draft', from: at, to: at };
    } else {
      const end = this.endUnder(e);
      if (end === null) return;
      const wall = this.session.addedWall(this.selectedId);
      this.drag = { id: wall.id, end, wall: { ...wall, from: [...wall.from], to: [...wall.to] } };
    }
    e.stopImmediatePropagation();
    e.preventDefault();
    this.viewport.canvas.setPointerCapture?.(e.pointerId);
  }
  move(e) {
    if (this.draft) {
      this.draft.to = this.point(e, this.draft.from) || this.draft.to;
      this.session.previewWalls([...this.session.addedWalls(), this.draft]);
    } else if (this.drag) {
      const other = this.drag.end === 'from' ? this.drag.wall.to : this.drag.wall.from,
        at = this.point(e, other);
      if (at) this.drag.wall[this.drag.end] = at;
      this.session.previewWalls(
        this.session.addedWalls().map((w) => (w.id === this.drag.id ? this.drag.wall : w)),
      );
      this.placeEnds(this.drag.wall);
    } else return;
    e.stopImmediatePropagation();
    this.viewport.onCamera?.();
  }
  up(e) {
    if (this.draft) {
      const { from, to } = this.draft;
      this.draft = null;
      if (Math.hypot(to[0] - from[0], to[1] - from[1]) >= WALL_LIMITS.length[0])
        this.on.drawn(from, to);
      else this.session.previewWalls(this.session.addedWalls());
    } else if (this.drag) {
      const { id, wall } = this.drag;
      this.drag = null;
      this.on.moved(id, wall.from, wall.to);
    } else return;
    e.stopImmediatePropagation();
  }
  // ---- End handles ----
  select(id) {
    this.selectedId = id;
    this.placeEnds(id && this.session.addedWall(id));
  }
  placeEnds(wall) {
    const height = (wall && { ...WALL_DEFAULTS, ...wall }.height) || 0;
    this.ends.forEach((knob, i) => {
      knob.visible = !!wall;
      if (wall)
        knob.position.set(
          ...[wall.from, wall.to][i].flatMap((v, k) => (k ? [height + 0.25, v] : [v])),
        );
    });
  }
  // Which end handle ('from', 'to') is under the cursor, if any.
  endUnder(e) {
    if (!this.selectedId || !this.ends[0].visible) return null;
    const r = this.viewport.canvas.getBoundingClientRect(),
      camera = this.viewport.camera;
    let best = null,
      nearest = GRAB;
    this.ends.forEach((knob, i) => {
      const p = knob.position.clone().project(camera),
        x = ((p.x + 1) / 2) * r.width,
        y = ((1 - p.y) / 2) * r.height,
        d = Math.hypot(x - (e.clientX - r.left), y - (e.clientY - r.top));
      if (p.z < 1 && d < nearest) [best, nearest] = [i ? 'to' : 'from', d];
    });
    return best;
  }
}

// ---- The inspector ----
// The House tool's list of added walls, with the button that starts drawing one.
export function addedWallsSection(session, { escape, icon, drawing }) {
  const walls = session.addedWalls();
  return `
    <section>
      <h3>Walls you add</h3>
      <p class="muted small">Draw a new wall anywhere: inside to split a room, or out in the garden as a wall or fence. Drag across the ground from one end to the other; <b>Shift</b> keeps it to 15° steps.</p>
      <div class="actions"><button class="button ${drawing ? 'primary' : ''}" id="draw-wall">${icon('plus', 16)}${drawing ? 'Drawing: drag on the ground (Esc stops)' : 'Draw a wall'}</button></div>
      ${
        walls.length
          ? `<div class="pick-list" style="margin-top:8px">${walls
              .map(
                (w) =>
                  `<button class="button" data-added-wall="${escape(w.id)}">${escape(wallName(w.id))} · ${wallLine(w).length.toFixed(1)} m</button>`,
              )
              .join('')}</div>`
          : ''
      }
    </section>`;
}
// The inspector for one added wall. `edit(label, change)` changes it (change gets the wall).
export function addedWallInspector(wall, { escape, icon, notes = '' }) {
  const w = { ...WALL_DEFAULTS, ...wall },
    { length } = wallLine(wall),
    num = (v) => Number(v).toFixed(2);
  return `
    <section>
      <h2>${escape(wallName(wall.id))}</h2>
      <div class="id">${escape(wall.id)}</div>
      <div class="chips"><span class="chip">Wall</span><span class="chip changed">Added</span><span class="chip">${length.toFixed(2)} m long</span></div>
      ${notes}
    </section>
    <section>
      <h3>Ends (metres)</h3>
      <p class="muted small">Drag the blue ends to stretch or swing it, or the arrow to slide it.</p>
      <div class="grid2">
        <label class="field"><span>Start x</span><input class="input" type="number" step="0.1" data-end="from" data-axis="0" value="${num(wall.from[0])}" /></label>
        <label class="field"><span>Start z</span><input class="input" type="number" step="0.1" data-end="from" data-axis="1" value="${num(wall.from[1])}" /></label>
        <label class="field"><span>End x</span><input class="input" type="number" step="0.1" data-end="to" data-axis="0" value="${num(wall.to[0])}" /></label>
        <label class="field"><span>End z</span><input class="input" type="number" step="0.1" data-end="to" data-axis="1" value="${num(wall.to[1])}" /></label>
      </div>
    </section>
    <section>
      <h3>Wall</h3>
      <div class="grid2">
        <label class="field"><span>Height (m)</span><input class="input" type="number" step="0.05" min="${WALL_LIMITS.height[0]}" max="${WALL_LIMITS.height[1]}" data-wall-key="height" value="${num(w.height)}" /></label>
        <label class="field"><span>Thickness (m)</span><input class="input" type="number" step="0.01" min="${WALL_LIMITS.thickness[0]}" max="${WALL_LIMITS.thickness[1]}" data-wall-key="thickness" value="${num(w.thickness)}" /></label>
        <label class="field colour"><span>Colour</span><input type="color" id="added-wall-colour" value="${escape(w.color)}" /></label>
      </div>
    </section>
    <section>
      <h3>Doorways and windows</h3>
      ${
        (wall.openings || []).length
          ? wall.openings
              .map(
                (o, i) => `<div class="doorway">
              <label class="field"><span>${o.kind === 'window' ? 'Window' : 'Doorway'} middle</span><input class="input" type="number" step="0.1" data-opening="${i}" data-key="at" value="${num(o.at)}" /></label>
              <label class="field"><span>Width (m)</span><input class="input" type="number" step="0.1" min="${WALL_LIMITS.opening[0]}" max="${WALL_LIMITS.opening[1]}" data-opening="${i}" data-key="width" value="${num(o.width)}" /></label>
              <button class="revert" data-remove-opening="${i}" title="Close it">${icon('close', 14)}</button></div>`,
              )
              .join('')
          : '<p class="muted">None: a solid wall.</p>'
      }
      <div class="actions">
        <button class="button" data-add-opening="door">${icon('plus', 16)}Doorway</button>
        <button class="button" data-add-opening="window" ${w.height < WALL_LIMITS.window ? `disabled title="A window needs a wall at least ${WALL_LIMITS.window} m high"` : ''}>${icon('plus', 16)}Window</button>
      </div>
    </section>
    <section><div class="actions">
      <button class="button" id="house-back">${icon('back', 16)}All walls and rooms</button>
      <button class="button danger" id="delete-wall">${icon('erase', 16)}Delete wall</button>
    </div></section>`;
}
// Wires the added wall's inspector: `edit(label, change)` changes the wall (change gets a copy).
export function bindAddedWall(el, wall, { edit, remove, toast }) {
  const number = (input) => {
    const v = parseFloat(input.value);
    return Number.isFinite(v) ? v : null;
  };
  for (const input of el.querySelectorAll('[data-end]'))
    input.addEventListener('change', () => {
      const v = number(input);
      if (v !== null)
        edit('Move an end of', (w) => (w[input.dataset.end][Number(input.dataset.axis)] = v));
    });
  for (const input of el.querySelectorAll('[data-wall-key]'))
    input.addEventListener('change', () => {
      const v = number(input);
      if (v !== null) edit('Change', (w) => (w[input.dataset.wallKey] = v));
    });
  el.querySelector('#added-wall-colour').addEventListener('change', (e) =>
    edit('Colour', (w) => (w.color = e.target.value)),
  );
  for (const input of el.querySelectorAll('[data-opening]'))
    input.addEventListener('change', () => {
      const v = number(input);
      if (v !== null)
        edit(
          'Change an opening in',
          (w) => (w.openings[Number(input.dataset.opening)][input.dataset.key] = v),
        );
    });
  for (const b of el.querySelectorAll('[data-remove-opening]'))
    b.addEventListener('click', () =>
      edit('Close an opening in', (w) => w.openings.splice(Number(b.dataset.removeOpening), 1)),
    );
  for (const b of el.querySelectorAll('[data-add-opening]'))
    b.addEventListener('click', () => {
      const kind = b.dataset.addOpening,
        { length } = wallLine(wall),
        // In the middle of the longest solid stretch.
        taken = [...(wall.openings || [])].sort((a, c) => a.at - c.at);
      let best = [0, 0],
        start = 0;
      for (const o of [...taken, { at: length + 1, width: 2 }]) {
        const end = o.at - o.width / 2;
        if (end - start > best[1] - best[0]) best = [start, end];
        start = o.at + o.width / 2;
      }
      const width = Math.min(
        kind === 'window' ? 1.2 : 0.9,
        best[1] - best[0] - 2 * WALL_LIMITS.end,
      );
      if (width < WALL_LIMITS.opening[0])
        return toast('There is no room for another opening.', true);
      edit(`Add a ${kind === 'window' ? 'window' : 'doorway'} to`, (w) =>
        (w.openings ||= []).push({
          at: Math.round(((best[0] + best[1]) / 2) * 100) / 100,
          width,
          kind,
        }),
      );
    });
  el.querySelector('#delete-wall').addEventListener('click', remove);
  for (const input of el.querySelectorAll('input'))
    input.addEventListener('keydown', (e) => e.key === 'Enter' && input.blur());
}
