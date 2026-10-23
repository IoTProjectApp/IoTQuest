// The Map Editor's nature tools: Terrain (hills and painted ground), Trees, Grass (long grass and
// flowers) and Water (ponds, streams, pools, and the lake and river the city is built with). Each
// brush stroke, drag or drawn shape is one undo step; while it goes on the world shows it without
// recording it. What they make is saved as the city's `nature` (see public/world-nature.js).
import * as THREE from '../../../public/vendor/three.module.min.js';
import {
  GROUND,
  TREE_STYLES,
  WATER_KINDS,
  LAWN,
  HEIGHT_CELL,
  PAINT_CELL,
  MAX_HEIGHT,
  cellKey,
  sampleGrid,
  regionalTreeStyle,
  roundOutline,
  roundCourse,
} from '../../../public/world-nature.js';
import { surfaceForMesh, SURFACE } from '../../../public/world-materials.js';
import { scaleOf } from '../../../public/world-layout.js';
import { icon } from '../../ui/icons.js';

export const NATURE_TOOLS = {
  terrain: {
    label: 'Terrain',
    icon: 'terrain',
    key: 'T',
    title: 'Raise, lower, flatten and smooth the ground, and paint it (T)',
  },
  trees: {
    label: 'Trees',
    icon: 'tree',
    key: 'P',
    title: 'Plant, scatter, move and remove trees (P)',
  },
  grass: { label: 'Grass', icon: 'grass', key: 'L', title: 'Grow long grass and flowers (L)' },
  water: {
    label: 'Water',
    icon: 'water',
    key: 'W',
    title: 'Add ponds, streams and pools; move or remove the lake and river (W)',
  },
};
export const isNatureTool = (tool) => tool in NATURE_TOOLS;

const MODES = {
  terrain: [
    ['raise', 'Raise'],
    ['lower', 'Lower'],
    ['flatten', 'Flatten'],
    ['smooth', 'Smooth'],
    ['paint', 'Paint'],
  ],
  trees: [
    ['plant', 'Plant'],
    ['scatter', 'Scatter'],
    ['move', 'Move'],
    ['erase', 'Remove'],
  ],
  grass: [
    ['grass', 'Long grass'],
    ['flowers', 'Flowers'],
    ['erase', 'Clear'],
  ],
  water: [
    ['pond', 'Pond'],
    ['stream', 'Stream'],
    ['pool', 'Pool'],
    ['edit', 'Change'],
  ],
};
// Built trees the Trees tool can move and remove (edit groups).
const BUILT_TREE = /^(landscape|garden)\/tree/;
const BUILT_WATER = { 'landscape/lake': 'The lake', 'landscape/river': 'The river' };
const ACCENT = 0x4f9cf9,
  DANGER = 0xef6b6b;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const smooth = (t) => t * t * (3 - 2 * t);
const clone = (v) => JSON.parse(JSON.stringify(v ?? {}));
const round = (v, step) => Math.round(v / step) * step;
const escape = (s) =>
  String(s).replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c],
  );

export class NatureTools {
  // viewport: the Map Editor's; session(): the open city's WorldSession; location(): its place;
  // toast(text, error); redraw(): the inspector and hint again.
  constructor({ viewport, session, location, toast, redraw }) {
    Object.assign(this, { viewport, getSession: session, getLocation: location, toast, redraw });
    this.tool = null;
    this.settings = {
      terrain: { mode: 'raise', size: 8, strength: 0.5, ground: 'dirt' },
      trees: { mode: 'plant', size: 10, scale: 1, density: 0.5, variety: true, style: null },
      grass: { mode: 'grass', size: 4, strength: 0.6 },
      water: { mode: 'pond', width: 2.5 },
    };
    try {
      const saved = JSON.parse(localStorage.getItem('map-editor:nature') || '{}');
      for (const tool of Object.keys(this.settings))
        Object.assign(this.settings[tool], saved[tool] || {});
    } catch {}
    this.stroke = null;
    // The tree or water feature picked to change: { kind: 'tree', index } | { kind: 'built', id }
    // | { kind: 'water', index }.
    this.picked = null;
    // A pond or stream being drawn: { kind, pts }; a pool being dragged: { kind, from, to }.
    this.drawing = null;
    this.overlay = new THREE.Group();
    this.overlay.renderOrder = 10;
    viewport.renderer.scene.add(this.overlay);
    this.ring = line(64, true, ACCENT);
    this.path = line(2, false, ACCENT);
    this.handles = new THREE.Group();
    this.overlay.add(this.ring, this.path, this.handles);
    this.overlay.visible = false;
    this.bind();
  }
  get session() {
    return this.getSession();
  }
  get set() {
    return this.settings[this.tool];
  }
  get mode() {
    return this.set?.mode;
  }
  remember() {
    try {
      localStorage.setItem('map-editor:nature', JSON.stringify(this.settings));
    } catch {}
  }

  // ---- Switching -------------------------------------------------------------------------------
  setTool(tool) {
    const active = isNatureTool(tool) ? tool : null;
    if (this.stroke) this.endStroke(false);
    this.keepDrawing();
    this.tool = active;
    this.drawing = null;
    if (!active || (this.picked && !this.pickedBelongs())) this.picked = null;
    const orbit = this.viewport.orbit;
    // The left button paints and draws; the right one turns the view.
    orbit.mouseButtons = active
      ? { LEFT: -1, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.ROTATE }
      : { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.PAN };
    this.overlay.visible = !!active;
    this.ring.visible = false;
    this.drawOverlays();
  }
  pickedBelongs() {
    return (
      (this.tool === 'trees' && ['tree', 'built'].includes(this.picked.kind)) ||
      (this.tool === 'water' && this.picked.kind === 'water')
    );
  }
  setMode(mode) {
    this.keepDrawing();
    this.set.mode = mode;
    this.drawing = null;
    if (this.tool === 'water' && mode !== 'edit') this.picked = null;
    this.remember();
    this.drawOverlays();
    this.redraw();
  }
  // After any change (undo, a commit): overlays follow the world as it now is.
  refresh() {
    if (this.picked?.kind === 'tree' && !this.nature().trees?.[this.picked.index])
      this.picked = null;
    if (this.picked?.kind === 'water' && !this.nature().water?.[this.picked.index])
      this.picked = null;
    if (this.picked?.kind === 'built' && !this.session.groups.get(this.picked.id))
      this.picked = null;
    this.drawOverlays();
  }
  nature() {
    return this.session?.changes.nature || {};
  }
  escape() {
    if (this.drawing) this.drawing = null;
    else this.picked = null;
    this.drawOverlays();
    this.redraw();
    return true;
  }
  // Delete: the last point drawn, or the picked tree or water. Returns whether it did anything.
  removePicked() {
    const s = this.session,
      p = this.picked;
    if (this.drawing?.pts?.length) {
      this.drawing.pts.pop();
      this.drawOverlays(this.cursor);
      this.redraw();
      return true;
    }
    if (!p) return false;
    this.picked = null;
    if (p.kind === 'tree')
      s.editNature('Remove a tree', (nature) => nature.trees.splice(p.index, 1));
    else if (p.kind === 'water')
      s.editNature('Remove water', (nature) => nature.water.splice(p.index, 1));
    else if (p.kind === 'built') s.remove(p.id);
    return true;
  }
  // [ and ] make the brush smaller and larger.
  resize(by) {
    if (!this.set || !('size' in this.set)) return;
    this.set.size = clamp(Math.round(this.set.size * (by > 0 ? 1.25 : 0.8)), 1, 40);
    this.remember();
    this.drawRing(this.cursor);
    this.redraw();
  }

  // ---- Where the pointer is ----------------------------------------------------------------------
  // The ground's height to stand on at a point (0 on flat ground).
  lift(x, z) {
    return this.session?.model.natureLift?.(x, z) ?? 0;
  }
  // Where the cursor's ray meets the ground, hills included.
  groundAt(event) {
    const ray = this.viewport.ray(event);
    if (!ray) return null;
    const { origin: o, dir: d } = ray,
      length = Math.hypot(...d),
      dir = d.map((v) => v / length),
      above = (t) => o[1] + dir[1] * t - this.lift(o[0] + dir[0] * t, o[2] + dir[2] * t);
    let t0 = 0,
      step = 1;
    for (let t = 0; t < 900; t += step) {
      if (above(t) <= 0) {
        // Narrow it down between the last two steps.
        let a = t0,
          b = t;
        for (let k = 0; k < 18; k++) {
          const m = (a + b) / 2;
          if (above(m) > 0) a = m;
          else b = m;
        }
        const x = o[0] + dir[0] * b,
          z = o[2] + dir[2] * b;
        return [x, this.lift(x, z), z];
      }
      t0 = t;
      step = Math.max(0.5, t * 0.01);
    }
    return null;
  }
  bind() {
    const c = this.viewport.canvas;
    c.addEventListener('pointerdown', (e) => {
      if (!this.tool || e.button !== 0) return;
      const at = this.groundAt(e);
      if (!at) return;
      c.setPointerCapture?.(e.pointerId);
      this.down = { x: e.clientX, y: e.clientY, at };
      this.press(at, e);
    });
    c.addEventListener('pointermove', (e) => {
      if (!this.tool) return;
      const at = this.groundAt(e);
      this.cursor = at;
      if (this.stroke) this.stroke.at = at || this.stroke.at;
      else if (this.dragging) this.drag(at);
      this.drawRing(at);
      if (this.drawing) this.drawOverlays(at);
    });
    c.addEventListener('pointerleave', () => {
      if (!this.tool) return;
      this.ring.visible = false;
    });
    const up = (e) => {
      if (!this.tool || e.button !== 0 || !this.down) return;
      const click = Math.hypot(e.clientX - this.down.x, e.clientY - this.down.y) < 5,
        at = this.groundAt(e) || this.down.at;
      this.down = null;
      if (this.stroke) this.endStroke(true);
      else if (this.dragging) this.endDrag(at);
      else if (click) this.click(at, e);
    };
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', (e) =>
      up({ ...e, button: 0, clientX: this.down?.x, clientY: this.down?.y }),
    );
    c.addEventListener('dblclick', (e) => {
      if (this.tool === 'water' && this.drawing?.pts) this.finishDrawing();
      e.preventDefault();
    });
  }

  // ---- Presses -----------------------------------------------------------------------------------
  press(at, event) {
    const { tool, mode } = this;
    if (
      tool === 'terrain' ||
      tool === 'grass' ||
      (tool === 'trees' && ['scatter', 'erase'].includes(mode))
    )
      return this.startStroke(at);
    if (tool === 'trees' && mode === 'move') {
      const hit = this.treeAt(at);
      this.picked = hit;
      if (hit) this.dragging = { kind: 'tree', hit, from: at };
      this.drawOverlays();
      this.redraw();
      return;
    }
    if (tool === 'water' && mode === 'pool') {
      this.drawing = { kind: 'pool', from: at, to: at };
      this.dragging = { kind: 'pool' };
    }
    if (tool === 'water' && mode === 'edit') {
      const handle = this.handleAt(event);
      if (handle !== null) this.dragging = { kind: 'point', index: handle };
    }
  }
  click(at, event) {
    const { tool, mode } = this;
    if (tool === 'trees' && mode === 'plant') return this.plant(at);
    if (tool === 'water' && (mode === 'pond' || mode === 'stream')) {
      const d = this.drawing;
      if (!d || d.kind !== mode) this.drawing = { kind: mode, pts: [] };
      const pts = this.drawing.pts;
      // A click on the first point closes a pond.
      if (
        mode === 'pond' &&
        pts.length >= 3 &&
        Math.hypot(at[0] - pts[0][0], at[2] - pts[0][1]) < 1.5
      )
        return this.finishDrawing();
      pts.push([round(at[0], 0.01), round(at[2], 0.01)]);
      this.drawOverlays(at);
      this.redraw();
      return;
    }
    if (tool === 'water' && mode === 'edit') {
      this.picked = this.waterAt(at);
      this.drawOverlays();
      this.redraw();
    }
  }

  // ---- Brush strokes ----------------------------------------------------------------------------
  startStroke(at) {
    const draft = clone(this.nature());
    this.stroke = {
      at,
      draft,
      time: performance.now(),
      shown: 0,
      // Flatten keeps to the height where the stroke began.
      target: sampleGrid((i, j) => draft.height?.[cellKey(i, j)] || 0, at[0], at[2]),
      removed: new Set(),
      planted: 0,
      seed: Math.floor(Math.random() * 1e9),
    };
    const step = (now) => {
      if (!this.stroke) return;
      const s = this.stroke,
        dt = Math.min(0.1, (now - s.time) / 1000);
      s.time = now;
      if (s.at) this.brush(s, dt);
      // The world shows the stroke a few times a second; rebuilding it every frame would lag.
      if (now - s.shown > 110) {
        s.shown = now;
        this.session.previewNature(s.draft);
        for (const id of s.removed) this.session.setHidden(this.session.groups.get(id), true);
      }
      requestAnimationFrame(step);
    };
    this.brush(this.stroke, 1 / 60);
    requestAnimationFrame(step);
  }
  endStroke(keep) {
    const s = this.stroke;
    this.stroke = null;
    if (!keep) return this.session.sync();
    const labels = {
      raise: 'Raise ground',
      lower: 'Lower ground',
      flatten: 'Flatten ground',
      smooth: 'Smooth ground',
      paint: `Paint ${GROUND[this.settings.terrain.ground]?.name.toLowerCase() || 'ground'}`,
      grass: 'Grow long grass',
      flowers: 'Grow flowers',
      scatter: 'Scatter trees',
    };
    const label =
      this.tool === 'trees' && this.mode === 'erase'
        ? 'Remove trees'
        : this.tool === 'terrain' &&
            this.mode === 'paint' &&
            this.settings.terrain.ground === 'erase'
          ? 'Clear painted ground'
          : this.tool === 'grass' && this.mode === 'erase'
            ? 'Clear grass and flowers'
            : labels[this.mode] || 'Change nature';
    const before = JSON.stringify(this.session.changes);
    const problems = this.session.editNature(label, (nature, changes) => {
      for (const key of Object.keys(nature)) delete nature[key];
      Object.assign(nature, s.draft);
      for (const id of s.removed) changes.edits[id] = { removed: true };
    });
    if (problems.length) this.toast(problems[0], true);
    // Nothing changed (a stroke that did nothing): show the world as it was.
    else if (JSON.stringify(this.session.changes) === before) this.session.sync();
  }
  brush(s, dt) {
    const [x, , z] = s.at,
      tool = this.tool,
      set = this.set,
      r = set.size;
    if (tool === 'terrain' && set.mode !== 'paint') {
      const heights = (s.draft.height ??= {}),
        rate = set.strength * 2.5 * dt,
        copy = set.mode === 'smooth' ? { ...heights } : null;
      eachPoint(x, z, r, HEIGHT_CELL, (key, i, j, f) => {
        const h = heights[key] || 0;
        let next = h;
        if (set.mode === 'raise') next = h + rate * f;
        else if (set.mode === 'lower') next = h - rate * f;
        else {
          const target = set.mode === 'flatten' ? s.target : average(copy, i, j);
          next = h + (target - h) * Math.min(1, set.strength * 8 * dt * f);
        }
        next = round(clamp(next, 0, MAX_HEIGHT), 0.01);
        if (next >= 0.01) heights[key] = next;
        else delete heights[key];
      });
    } else if (tool === 'terrain' || tool === 'grass') {
      const rate = set.strength * 6 * dt,
        kind = tool === 'terrain' ? set.ground : set.mode;
      const fields =
        tool === 'terrain'
          ? Object.keys(GROUND).map((k) => [k, ((s.draft.paint ??= {})[k] ??= {})])
          : [
              ['grass', (s.draft.grass ??= {})],
              ['flowers', (s.draft.flowers ??= {})],
            ];
      eachPoint(x, z, r, PAINT_CELL, (key, i, j, f) => {
        for (const [name, field] of fields) {
          const w = field[key] || 0,
            // Painting one kind paints over the others; Clear takes them all away. Grass and
            // flowers grow together.
            grow = name === kind ? 1 : kind === 'erase' || tool === 'terrain' ? -1 : 0,
            // Painting grows towards the brush's own soft shape (full in the middle, fading to
            // its edge), so a painted area's edge is round like the brush, not square like the grid.
            target = Math.min(1, f * 1.6),
            next = round(
              grow > 0
                ? w < target
                  ? w + (target - w) * Math.min(1, rate * 1.5)
                  : w
                : clamp(w + grow * rate * f, 0, 1),
              0.05,
            );
          if (next >= 0.05) field[key] = next;
          else delete field[key];
        }
      });
    } else if (tool === 'trees' && set.mode === 'scatter') {
      // About `density` trees a second, each somewhere free in the brush.
      s.debt = (s.debt || 0) + dt * (0.5 + set.density * 6);
      while (s.debt >= 1) {
        s.debt -= 1;
        const a = rand(s) * Math.PI * 2,
          d = Math.sqrt(rand(s)) * r,
          px = x + Math.cos(a) * d,
          pz = z + Math.sin(a) * d,
          tree = this.newTree(px, pz, s),
          trees = (s.draft.trees ??= []),
          spacing = 2.6 * tree[3];
        if (this.blocked(px, pz)) continue;
        if (trees.some((t) => Math.hypot(t[1] - px, t[2] - pz) < spacing)) continue;
        trees.push(tree);
      }
    } else if (tool === 'trees' && set.mode === 'erase') {
      if (s.draft.trees)
        s.draft.trees = s.draft.trees.filter((t) => Math.hypot(t[1] - x, t[2] - z) > r);
      for (const g of this.session.groups.values())
        if (
          BUILT_TREE.test(g.id) &&
          !g.hidden &&
          Math.hypot(g.placement.pos[0] - x, g.placement.pos[2] - z) <= r
        )
          s.removed.add(g.id);
    }
  }
  // A tree as the settings make it (style, size, and some variety if asked).
  newTree(x, z, s = null) {
    const set = this.settings.trees,
      style = set.style || regionalTreeStyle(this.getLocation()),
      r = () => (s ? rand(s) : Math.random()),
      varied = set.variety;
    const styles = [style, style, style, style === 'broadleaf' ? 'fruit' : 'broadleaf'];
    return [
      varied ? styles[Math.floor(r() * styles.length)] : style,
      round(x, 0.01),
      round(z, 0.01),
      round(set.scale * (varied ? 0.8 + r() * 0.45 : 1), 0.01),
    ];
  }
  plant(at) {
    const tree = this.newTree(at[0], at[2]);
    this.session.editNature('Plant a tree', (nature) => (nature.trees ??= []).push(tree));
    this.picked = { kind: 'tree', index: (this.nature().trees?.length || 1) - 1 };
    this.drawOverlays();
    this.redraw();
  }
  // Whether a tree would stand on a building, a road or a path.
  blocked(x, z) {
    const model = this.session.model;
    for (const c of model.colliders)
      if (Math.abs(c.x - x) < c.w / 2 + 0.8 && Math.abs(c.z - z) < c.d / 2 + 0.8) return true;
    for (const m of model.objects) {
      if (m.nature || m.landscape || m.pos[1] > 0.3 || m.size[1] > 0.4) continue;
      if (
        Math.abs(m.pos[0] - x) > m.size[0] / 2 + 0.3 ||
        Math.abs(m.pos[2] - z) > m.size[2] / 2 + 0.3
      )
        continue;
      if (Math.max(m.size[0], m.size[2]) > 150) continue;
      const surface = surfaceForMesh(m);
      if ([SURFACE.asphalt, SURFACE.stone, SURFACE.tile].includes(surface)) return true;
    }
    return false;
  }

  // ---- Moving trees and water points ----------------------------------------------------------
  // The tree nearest a point (planted, or built), within a couple of metres.
  treeAt(at) {
    let best = null,
      nearest = 2.5;
    (this.nature().trees || []).forEach((t, index) => {
      const d = Math.hypot(t[1] - at[0], t[2] - at[2]);
      if (d < nearest) [nearest, best] = [d, { kind: 'tree', index }];
    });
    for (const g of this.session.groups.values()) {
      if (!BUILT_TREE.test(g.id) || g.hidden) continue;
      const d = Math.hypot(g.placement.pos[0] - at[0], g.placement.pos[2] - at[2]);
      if (d < nearest) [nearest, best] = [d, { kind: 'built', id: g.id }];
    }
    return best;
  }
  drag(at) {
    const d = this.dragging;
    if (!at || !d) return;
    if (d.kind === 'tree') {
      const hit = d.hit;
      if (hit.kind === 'tree') {
        d.draft ??= clone(this.nature());
        const t = d.draft.trees[hit.index];
        t[1] = round(at[0], 0.01);
        t[2] = round(at[2], 0.01);
        this.throttle(() => this.session.previewNature(d.draft));
      } else {
        const g = this.session.groups.get(hit.id);
        d.placement = { ...g.placement, pos: [at[0], g.original.pos[1], at[2]] };
        this.session.preview(hit.id, d.placement);
      }
      d.moved = true;
    } else if (d.kind === 'pool') {
      this.drawing.to = at;
      this.drawOverlays(at);
    } else if (d.kind === 'point') {
      d.draft ??= clone(this.nature());
      d.draft.water[this.picked.index].pts[d.index] = [round(at[0], 0.01), round(at[2], 0.01)];
      this.throttle(() => this.session.previewNature(d.draft));
      this.drawOverlays(null, d.draft);
    }
  }
  endDrag(at) {
    const d = this.dragging;
    this.dragging = null;
    if (d.kind === 'tree' && d.moved) {
      if (d.hit.kind === 'tree')
        this.session.editNature('Move a tree', (nature) => (nature.trees = d.draft.trees));
      else this.session.move(d.hit.id, d.placement, 'Move');
    } else if (d.kind === 'pool') {
      const { from, to } = this.drawing;
      this.drawing = null;
      if (Math.abs(to[0] - from[0]) >= 1 && Math.abs(to[2] - from[2]) >= 1) {
        this.session.editNature('Add a pool', (nature) =>
          (nature.water ??= []).push({
            kind: 'pool',
            pts: [
              [round(from[0], 0.01), round(from[2], 0.01)],
              [round(to[0], 0.01), round(to[2], 0.01)],
            ],
          }),
        );
        this.picked = { kind: 'water', index: this.nature().water.length - 1 };
        // Straight on to changing it, as after drawing a pond or a stream.
        this.set.mode = 'edit';
        this.remember();
      } else this.toast('Drag from one corner of the pool to the other.');
    } else if (d.kind === 'point' && d.draft)
      this.session.editNature('Reshape water', (nature) => (nature.water = d.draft.water));
    this.drawOverlays();
    this.redraw();
  }
  throttle(run) {
    const now = performance.now();
    if (now - (this.lastShown || 0) < 90) return;
    this.lastShown = now;
    run();
  }
  // A pond or stream drawn far enough is kept when the tool or mode changes, not lost.
  keepDrawing() {
    const d = this.drawing;
    if (d?.pts && d.pts.length >= (d.kind === 'pond' ? 3 : 2)) this.finishDrawing(false);
  }
  finishDrawing(change = true) {
    const d = this.drawing;
    if (!d?.pts) return;
    const enough = d.kind === 'pond' ? 3 : 2;
    if (d.pts.length < enough) {
      this.toast(`A ${d.kind} needs ${enough === 3 ? 'three' : 'two'} points or more.`, true);
      return;
    }
    this.drawing = null;
    const water = { kind: d.kind, pts: d.pts };
    if (d.kind === 'stream') water.width = this.settings.water.width;
    this.session.editNature(`Add a ${d.kind}`, (nature) => (nature.water ??= []).push(water));
    this.picked = { kind: 'water', index: this.nature().water.length - 1 };
    if (change) this.setMode('edit');
  }
  // The water feature at a point: inside a pond or pool, or near a stream.
  waterAt(at) {
    const list = this.nature().water || [];
    for (let index = list.length - 1; index >= 0; index--) {
      const w = list[index];
      if (w.kind === 'stream') {
        const course = roundCourse(w.pts);
        for (let k = 0; k + 1 < course.length; k++)
          if (distanceToSegment(at, course[k], course[k + 1]) < (w.width || 2.5) / 2 + 1)
            return { kind: 'water', index };
      } else {
        const outline = w.kind === 'pool' ? rectangle(w.pts) : roundOutline(w.pts);
        if (inside(outline, at[0], at[2])) return { kind: 'water', index };
      }
    }
    return null;
  }
  // The index of the picked water's point under the cursor, or null.
  handleAt(event) {
    if (this.picked?.kind !== 'water') return null;
    const at = this.groundAt(event);
    if (!at) return null;
    const pts = this.nature().water[this.picked.index]?.pts || [];
    let best = null,
      nearest = 1.6;
    pts.forEach(([x, z], i) => {
      const d = Math.hypot(x - at[0], z - at[2]);
      if (d < nearest) [nearest, best] = [d, i];
    });
    return best;
  }

  // ---- Overlays ---------------------------------------------------------------------------------
  drawRing(at) {
    const brush =
      this.tool &&
      (['terrain', 'grass'].includes(this.tool) ||
        (this.tool === 'trees' && ['scatter', 'erase'].includes(this.mode)));
    this.ring.visible = !!(brush && at);
    if (!this.ring.visible) return;
    const r = this.set.size,
      pos = this.ring.geometry.attributes.position;
    for (let k = 0; k < pos.count; k++) {
      const a = (k / pos.count) * Math.PI * 2,
        x = at[0] + Math.cos(a) * r,
        z = at[2] + Math.sin(a) * r;
      pos.setXYZ(k, x, this.lift(x, z) + 0.12, z);
    }
    pos.needsUpdate = true;
    this.ring.geometry.computeBoundingSphere();
    const erasing =
      this.mode === 'lower' ||
      this.mode === 'erase' ||
      (this.tool === 'terrain' &&
        this.mode === 'paint' &&
        this.settings.terrain.ground === 'erase');
    this.ring.material.color.setHex(erasing ? DANGER : ACCENT);
  }
  // The shape being drawn, the picked water's outline and points, or a ring round the picked tree.
  drawOverlays(cursor = null, nature = this.nature()) {
    for (const h of this.handles.children) {
      h.geometry.dispose();
      h.material.dispose();
    }
    this.handles.clear();
    let points = [],
      closed = false;
    const d = this.drawing;
    if (d?.pts) {
      const pts = cursor ? [...d.pts, [cursor[0], cursor[2]]] : d.pts;
      points =
        d.kind === 'pond' && pts.length >= 3
          ? roundOutline(pts)
          : d.kind === 'stream'
            ? roundCourse(pts)
            : pts;
      closed = d.kind === 'pond' && pts.length >= 3;
      for (const p of d.pts) this.handles.add(dot(p, this.lift(...p), 0.35));
    } else if (d?.kind === 'pool') {
      points = rectangle([
        [d.from[0], d.from[2]],
        [d.to[0], d.to[2]],
      ]);
      closed = true;
    } else if (this.picked?.kind === 'water') {
      const w = nature.water?.[this.picked.index];
      if (w) {
        points =
          w.kind === 'pool'
            ? rectangle(w.pts)
            : w.kind === 'pond'
              ? roundOutline(w.pts)
              : roundCourse(w.pts);
        closed = w.kind !== 'stream';
        for (const p of w.pts) this.handles.add(dot(p, this.lift(...p), 0.45));
      }
    } else if (this.picked?.kind === 'tree') {
      const t = nature.trees?.[this.picked.index];
      if (t) points = circle(t[1], t[2], 1.4 * t[3]);
      closed = true;
    } else if (this.picked?.kind === 'built') {
      const g = this.session?.groups.get(this.picked.id);
      if (g)
        points = circle(
          g.placement.pos[0],
          g.placement.pos[2],
          1.6 * scaleOf(g.placement.scale)[0],
        );
      closed = true;
    }
    this.overlay.remove(this.path);
    this.path.geometry.dispose();
    this.path = line(Math.max(2, points.length), closed, ACCENT);
    const pos = this.path.geometry.attributes.position;
    points.forEach(([x, z], k) => pos.setXYZ(k, x, this.lift(x, z) + 0.15, z));
    this.path.visible = points.length >= 2;
    this.path.geometry.computeBoundingSphere();
    this.overlay.add(this.path);
  }

  // ---- Inspector ----------------------------------------------------------------------------------
  hint() {
    const keys = (...pairs) => pairs.map(([k, what]) => `<b>${k}</b> ${what}`).join(' · ');
    const view = ['Right-drag', 'turns the view'];
    const { tool, mode } = this;
    if (tool === 'terrain' || tool === 'grass')
      return keys(['Drag', 'to paint'], ['[ ]', 'brush size'], view, ['Scroll', 'zooms']);
    if (tool === 'trees')
      return mode === 'plant'
        ? keys(['Click', 'to plant a tree'], view, ['Scroll', 'zooms'])
        : mode === 'move'
          ? keys(['Drag a tree', 'to move it'], ['Click', 'one to change its size'], view)
          : keys(
              ['Drag', mode === 'erase' ? 'over trees to remove them' : 'to scatter trees'],
              ['[ ]', 'brush size'],
              view,
            );
    if (tool === 'water')
      return mode === 'pool'
        ? keys(['Drag', 'from corner to corner'], view)
        : mode === 'edit'
          ? keys(['Click', 'water to pick it'], ['Drag a point', 'to reshape it'], view)
          : this.drawing
            ? keys(
                ['Click', 'to add points'],
                [mode === 'pond' ? 'Click the first point' : 'Double-click', 'to finish'],
                ['Enter', 'finishes'],
                ['Esc', 'cancels'],
              )
            : keys(['Click', `to start a ${mode}`], view);
    return '';
  }
  // The inspector for the active tool, into `el`.
  render(el) {
    const tool = this.tool,
      set = this.set,
      t = NATURE_TOOLS[tool];
    const modes = `<div class="segmented nature-modes">${MODES[tool]
      .map(
        ([id, label]) =>
          `<button data-mode="${id}" class="${set.mode === id ? 'active' : ''}">${label}</button>`,
      )
      .join('')}</div>`;
    const slider = (key, label, min, max, step, unit = '') =>
      `<label class="row"><span>${label}</span><input type="range" data-set="${key}" min="${min}" max="${max}" step="${step}" value="${set[key]}" /><output>${fmt(set[key])}${unit}</output></label>`;
    let body = '';
    if (tool === 'terrain') {
      body =
        modes +
        slider('size', 'Brush size', 1, 40, 1, ' m') +
        (set.mode === 'paint'
          ? `<div class="swatches">${[
              ...Object.entries(GROUND),
              ['erase', { name: 'Clear', color: 'transparent' }],
            ]
              .map(
                ([k, g]) =>
                  `<button data-ground="${k}" class="swatch ${set.ground === k ? 'active' : ''}" title="${g.name}"><span style="background:${g.color}"></span>${g.name}</button>`,
              )
              .join('')}</div>`
          : '') +
        slider('strength', 'Strength', 0.1, 1, 0.05) +
        `<p class="note">Hills only rise on open land: the ground stays flat under houses, roads, lots, furniture and water, and eases back around them. People, the technician and trees stand on the hills.</p>`;
    } else if (tool === 'grass') {
      const lawn = { ...LAWN, ...this.nature().lawn };
      body =
        modes +
        slider('size', 'Brush size', 1, 30, 1, ' m') +
        slider('strength', 'Strength', 0.1, 1, 0.05) +
        `<h3 class="sub">How it grows here</h3>
        <label class="row"><span>Height</span><input type="range" data-lawn="height" min="0.1" max="1.2" step="0.05" value="${lawn.height}" /><output>${fmt(lawn.height)} m</output></label>
        <label class="row"><span>Thickness</span><input type="range" data-lawn="density" min="0.5" max="8" step="0.5" value="${lawn.density}" /><output>${fmt(lawn.density)}/m²</output></label>
        <label class="row"><span>Colour</span><input type="color" data-lawn="colour" value="${lawn.colour}" /></label>`;
    } else if (tool === 'trees') {
      const style = set.style || regionalTreeStyle(this.getLocation());
      body =
        modes +
        `<label class="row"><span>Kind</span><select class="select" data-style>${Object.entries(
          TREE_STYLES,
        )
          .map(
            ([k, name]) =>
              `<option value="${k}" ${k === style ? 'selected' : ''}>${name}${k === regionalTreeStyle(this.getLocation()) ? ' (this city’s own)' : ''}</option>`,
          )
          .join('')}</select></label>` +
        slider('scale', 'Size', 0.5, 2.5, 0.05, '×') +
        `<label class="check"><input type="checkbox" data-variety ${set.variety ? 'checked' : ''} /> Vary kind and size a little</label>` +
        (set.mode === 'scatter' ? slider('density', 'Thickness', 0.1, 1, 0.05) : '') +
        (['scatter', 'erase'].includes(set.mode)
          ? slider('size', 'Brush size', 2, 40, 1, ' m')
          : '') +
        this.pickedTree();
    } else if (tool === 'water') {
      body =
        modes +
        (set.mode === 'stream' ? slider('width', 'Width', 0.6, 12, 0.1, ' m') : '') +
        this.pickedWater() +
        this.builtWater();
    }
    el.innerHTML = `<section><h2>${icon(t.icon, 18)} ${t.label}</h2><p class="muted">${t.title.replace(/ \(.\)$/, '')}.</p></section><section class="nature">${body}</section>`;
    this.bindInspector(el);
  }
  pickedTree() {
    const p = this.picked;
    if (p?.kind === 'tree') {
      const t = this.nature().trees?.[p.index];
      if (!t) return '';
      return `<h3 class="sub">Planted tree</h3>
        <label class="row"><span>Kind</span><select class="select" data-tree-style>${Object.entries(
          TREE_STYLES,
        )
          .map(
            ([k, name]) => `<option value="${k}" ${k === t[0] ? 'selected' : ''}>${name}</option>`,
          )
          .join('')}</select></label>
        <label class="row"><span>Size</span><input type="range" data-tree-scale min="0.3" max="3" step="0.05" value="${t[3]}" /><output>${fmt(t[3])}×</output></label>
        <div class="actions"><button class="button danger" data-tree-remove>${icon('erase', 16)}Remove this tree</button></div>`;
    }
    if (p?.kind === 'built') {
      const g = this.session.groups.get(p.id);
      if (!g) return '';
      const k = scaleOf(g.placement.scale)[0];
      return `<h3 class="sub">${escape(g.name)}</h3>
        <label class="row"><span>Size</span><input type="range" data-built-scale min="0.3" max="3" step="0.05" value="${k}" /><output>${fmt(k)}×</output></label>
        <div class="actions"><button class="button" data-built-reset ${this.session.isChanged(g.id) ? '' : 'disabled'}>${icon('reset', 16)}As built</button>
        <button class="button danger" data-built-remove>${icon('erase', 16)}Remove</button></div>`;
    }
    return this.mode === 'move'
      ? '<p class="note">Click a tree to change its size, or drag it somewhere else.</p>'
      : '';
  }
  pickedWater() {
    if (this.picked?.kind !== 'water')
      return this.drawing?.pts
        ? `<p class="note">${this.drawing.pts.length} point(s). ${this.drawing.kind === 'pond' ? 'Click the first point' : 'Double-click'} or press Enter to finish.</p>`
        : '';
    const w = this.nature().water?.[this.picked.index];
    if (!w) return '';
    const level = Number.isFinite(w.level) ? w.level : null;
    return `<h3 class="sub">${WATER_KINDS[w.kind]}</h3>
      ${w.kind === 'stream' ? `<label class="row"><span>Width</span><input type="range" data-water-width min="0.6" max="12" step="0.1" value="${w.width || 2.5}" /><output>${fmt(w.width || 2.5)} m</output></label>` : ''}
      ${
        w.kind !== 'stream'
          ? `<label class="row"><span>Water level</span><input class="input" type="number" step="0.05" data-water-level value="${level ?? ''}" placeholder="from the ground" /><span class="unit">m</span></label>`
          : ''
      }
      <label class="check"><input type="checkbox" data-water-walk ${w.walk ? 'checked' : ''} /> People can wade in (no edge stops them)</label>
      <div class="actions"><button class="button danger" data-water-remove>${icon('erase', 16)}Remove this ${w.kind}</button></div>`;
  }
  builtWater() {
    const rows = Object.entries(BUILT_WATER)
      .map(([id, name]) => {
        const g = this.session.groups.get(id);
        if (!g) return '';
        const edit = this.session.changes.edits[id],
          state = edit?.removed ? 'Removed' : edit ? 'Moved' : 'As built';
        return `<li><span class="name">${name}</span><span class="what">${state}</span>
          ${edit?.removed ? `<button class="button" data-built-restore="${id}">Bring back</button>` : `<button class="button" data-built-select="${id}" title="Move, turn or resize it with Select">Move…</button><button class="button danger" data-built-water-remove="${id}">Remove</button>`}</li>`;
      })
      .join('');
    return rows
      ? `<h3 class="sub">Built with the city</h3><ul class="built-water">${rows}</ul>`
      : '';
  }
  bindInspector(el) {
    const s = this.session;
    for (const b of el.querySelectorAll('[data-mode]'))
      b.addEventListener('click', () => this.setMode(b.dataset.mode));
    for (const input of el.querySelectorAll('[data-set]'))
      input.addEventListener('input', () => {
        this.set[input.dataset.set] = Number(input.value);
        input.nextElementSibling.textContent =
          fmt(Number(input.value)) +
          (input.nextElementSibling.textContent.match(/[a-z×²/ ]+$/i)?.[0] || '');
        this.remember();
        this.drawRing(this.cursor);
      });
    for (const b of el.querySelectorAll('[data-ground]'))
      b.addEventListener('click', () => {
        this.settings.terrain.ground = b.dataset.ground;
        this.remember();
        this.redraw();
      });
    el.querySelector('[data-style]')?.addEventListener('change', (e) => {
      this.settings.trees.style = e.target.value;
      this.remember();
    });
    el.querySelector('[data-variety]')?.addEventListener('change', (e) => {
      this.settings.trees.variety = e.target.checked;
      this.remember();
    });
    // Long grass: one setting for the whole city; a slider drag is one undo step.
    for (const input of el.querySelectorAll('[data-lawn]')) {
      const key = input.dataset.lawn,
        value = () => (key === 'colour' ? input.value : Number(input.value));
      input.addEventListener('input', () => {
        if (input.nextElementSibling)
          input.nextElementSibling.textContent = fmt(value()) + (key === 'height' ? ' m' : '/m²');
        const draft = clone(this.nature());
        draft.lawn = { ...LAWN, ...draft.lawn, [key]: value() };
        this.throttle(() => s.previewNature(draft));
      });
      input.addEventListener('change', () =>
        s.editNature(
          'Change long grass',
          (nature) => (nature.lawn = { ...LAWN, ...nature.lawn, [key]: value() }),
        ),
      );
    }
    const p = this.picked;
    el.querySelector('[data-tree-style]')?.addEventListener('change', (e) =>
      s.editNature('Change a tree', (nature) => (nature.trees[p.index][0] = e.target.value)),
    );
    const treeScale = el.querySelector('[data-tree-scale]');
    treeScale?.addEventListener('input', () => {
      treeScale.nextElementSibling.textContent = fmt(Number(treeScale.value)) + '×';
      const draft = clone(this.nature());
      draft.trees[p.index][3] = Number(treeScale.value);
      this.throttle(() => s.previewNature(draft));
      this.drawOverlays(null, draft);
    });
    treeScale?.addEventListener('change', () =>
      s.editNature(
        'Resize a tree',
        (nature) => (nature.trees[p.index][3] = Number(treeScale.value)),
      ),
    );
    el.querySelector('[data-tree-remove]')?.addEventListener('click', () => {
      this.picked = null;
      s.editNature('Remove a tree', (nature) => nature.trees.splice(p.index, 1));
    });
    const builtScale = el.querySelector('[data-built-scale]');
    builtScale?.addEventListener('input', () => {
      builtScale.nextElementSibling.textContent = fmt(Number(builtScale.value)) + '×';
      const g = s.groups.get(p.id);
      s.preview(p.id, { ...g.placement, scale: Number(builtScale.value) });
    });
    builtScale?.addEventListener('change', () => {
      const g = s.groups.get(p.id);
      s.move(p.id, { ...g.placement, scale: Number(builtScale.value) }, 'Resize');
    });
    el.querySelector('[data-built-reset]')?.addEventListener('click', () => s.reset(p.id));
    el.querySelector('[data-built-remove]')?.addEventListener('click', () => {
      this.picked = null;
      s.remove(p.id);
    });
    const water = (label, change) => s.editNature(label, (nature) => change(nature.water[p.index]));
    const width = el.querySelector('[data-water-width]');
    width?.addEventListener(
      'input',
      () => (width.nextElementSibling.textContent = fmt(Number(width.value)) + ' m'),
    );
    width?.addEventListener('change', () =>
      water('Change a stream', (w) => (w.width = Number(width.value))),
    );
    el.querySelector('[data-water-level]')?.addEventListener('change', (e) =>
      water('Change water level', (w) => {
        if (e.target.value === '') delete w.level;
        else w.level = round(clamp(Number(e.target.value), -1, MAX_HEIGHT + 2), 0.01);
      }),
    );
    el.querySelector('[data-water-walk]')?.addEventListener('change', (e) =>
      water('Change water', (w) => {
        if (e.target.checked) w.walk = true;
        else delete w.walk;
      }),
    );
    el.querySelector('[data-water-remove]')?.addEventListener('click', () => {
      this.picked = null;
      s.editNature('Remove water', (nature) => nature.water.splice(p.index, 1));
    });
    for (const b of el.querySelectorAll('[data-built-restore]'))
      b.addEventListener('click', () => s.reset(b.dataset.builtRestore));
    for (const b of el.querySelectorAll('[data-built-water-remove]'))
      b.addEventListener('click', () => s.remove(b.dataset.builtWaterRemove));
    for (const b of el.querySelectorAll('[data-built-select]'))
      b.addEventListener('click', () => this.onSelectBuilt?.(b.dataset.builtSelect));
  }
}

// ---- Helpers ------------------------------------------------------------------------------------
function fmt(v) {
  return typeof v === 'number' ? (Math.round(v * 100) / 100).toString() : v;
}
// Calls `visit(key, i, j, falloff)` for each grid point within `r` of (x, z), falloff 1 at the
// middle easing to 0 at the edge.
function eachPoint(x, z, r, cell, visit) {
  for (let i = Math.floor((x - r) / cell); i <= Math.ceil((x + r) / cell); i++)
    for (let j = Math.floor((z - r) / cell); j <= Math.ceil((z + r) / cell); j++) {
      const d = Math.hypot(i * cell - x, j * cell - z);
      if (d > r) continue;
      visit(cellKey(i, j), i, j, smooth(1 - d / r));
    }
}
function average(heights, i, j) {
  let sum = 0;
  for (let a = -1; a <= 1; a++)
    for (let b = -1; b <= 1; b++) sum += heights[cellKey(i + a, j + b)] || 0;
  return sum / 9;
}
// The stroke's own random numbers, so a scatter can be repeated.
function rand(s) {
  s.seed = (Math.imul(s.seed, 1664525) + 1013904223) >>> 0;
  return s.seed / 4294967296;
}
function rectangle([[ax, az], [bx, bz]]) {
  return [
    [Math.min(ax, bx), Math.min(az, bz)],
    [Math.max(ax, bx), Math.min(az, bz)],
    [Math.max(ax, bx), Math.max(az, bz)],
    [Math.min(ax, bx), Math.max(az, bz)],
  ];
}
function circle(x, z, r) {
  return Array.from({ length: 40 }, (_, k) => {
    const a = (k / 40) * Math.PI * 2;
    return [x + Math.cos(a) * r, z + Math.sin(a) * r];
  });
}
function inside(points, x, z) {
  let result = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, zi] = points[i],
      [xj, zj] = points[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) result = !result;
  }
  return result;
}
function distanceToSegment([x, , z], [ax, az], [bx, bz]) {
  const dx = bx - ax,
    dz = bz - az,
    t = clamp(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1), 0, 1);
  return Math.hypot(x - (ax + dx * t), z - (az + dz * t));
}
function line(count, closed, color) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  const material = new THREE.LineBasicMaterial({
    color,
    depthTest: false,
    transparent: true,
    opacity: 0.95,
  });
  const l = closed ? new THREE.LineLoop(geometry, material) : new THREE.Line(geometry, material);
  l.renderOrder = 10;
  l.frustumCulled = false;
  return l;
}
function dot([x, z], y, r) {
  const m = new THREE.Mesh(
    new THREE.SphereGeometry(r, 12, 8),
    new THREE.MeshBasicMaterial({
      color: 0xffffff,
      depthTest: false,
      transparent: true,
      opacity: 0.95,
    }),
  );
  m.position.set(x, y + 0.2, z);
  m.renderOrder = 11;
  return m;
}
