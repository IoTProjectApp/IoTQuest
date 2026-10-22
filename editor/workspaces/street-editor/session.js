// The Street Editor's model: one street layout being edited (the town every destination shares, or
// one destination's own), its undo history and its problems. Free of the DOM so it runs under Node
// in the tests. The layout format is described in public/street-network.js.
import {
  defaultStreetLayout,
  LOCKED,
  lockedRoad,
  CONTROLS,
} from '../../../public/street-network.js';
import { createCommunity } from '../../../public/community-sim.js';

const clone = (value) => JSON.parse(JSON.stringify(value));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const round = (v) => Math.round(v * 100) / 100;
export const MIN_ROAD = 28;
export const MIN_ANGLE = 40;
// A road is in a lot when it comes within this distance of it: the asphalt's half width less a
// little, as some lots (the parking) are drawn right up to the kerb.
const LOT_MARGIN = 5;
let gridBusStops = null;

export class StreetSession {
  // `saved`: the whole street layout file. `target`: 'town', or a destination id for its own layout.
  constructor(saved, target = 'town', location = {}) {
    this.saved = clone(saved);
    this.target = target;
    this.location = location;
    this.layout = clone(this.startingLayout());
    this.original = clone(this.layout);
    this.undoStack = [];
    this.redoStack = [];
    this.listeners = new Set();
    this.check();
  }
  // What this target is when nothing has been changed: its saved layout, else the shared town's,
  // else the grid.
  startingLayout() {
    if (this.target === 'town') return this.saved.town || defaultStreetLayout();
    return this.saved.locations?.[this.target] || this.inherited();
  }
  // What this target falls back to: the town's layout for a destination, the grid for the town.
  inherited() {
    return this.target !== 'town' && this.saved.town ? this.saved.town : defaultStreetLayout();
  }
  on(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  emit() {
    for (const listener of this.listeners) listener(this);
  }

  junction(id) {
    return this.layout.junctions.find((j) => j.id === id);
  }
  roadsAt(id) {
    return this.layout.roads.filter((r) => r.a === id || r.b === id);
  }
  hasRoad(a, b) {
    return this.layout.roads.some((r) => (r.a === a && r.b === b) || (r.a === b && r.b === a));
  }
  // Why a junction cannot be moved or removed, or null.
  lockedJunction(id) {
    return LOCKED.junctions[id] || null;
  }

  commit(label, change) {
    const before = clone(this.layout);
    const result = change(this.layout);
    // A change that gives up part way leaves nothing behind.
    if (result === false) this.layout = before;
    if (result === false || same(before, this.layout)) return false;
    this.undoStack.push({ label, layout: before });
    this.redoStack = [];
    this.check();
    this.emit();
    return true;
  }
  undo() {
    return this.step(this.undoStack, this.redoStack);
  }
  redo() {
    return this.step(this.redoStack, this.undoStack);
  }
  step(from, to) {
    const entry = from.pop();
    if (!entry) return null;
    to.push({ label: entry.label, layout: clone(this.layout) });
    this.layout = entry.layout;
    this.check();
    this.emit();
    return entry.label;
  }

  // Moves a junction (not a locked one); `preview` moves it without recording, while dragging.
  moveJunction(id, x, z, preview = false) {
    if (this.lockedJunction(id)) return false;
    if (preview) {
      Object.assign(this.junction(id), { x: round(x), z: round(z) });
      this.emit();
      return true;
    }
    return this.commit('Move junction ' + id, (l) => {
      Object.assign(
        l.junctions.find((j) => j.id === id),
        { x: round(x), z: round(z) },
      );
    });
  }
  // A new junction, joined to `from` (an existing junction) when given; returns its id.
  addJunction(x, z, from = null) {
    const id = this.nextId();
    this.commit('Add junction', (l) => {
      l.junctions.push({ id, x: round(x), z: round(z) });
      if (from) l.roads.push({ a: from, b: id });
    });
    return id;
  }
  nextId() {
    let n = 1;
    while (this.junction('n' + n)) n++;
    return 'n' + n;
  }
  removeJunction(id) {
    if (this.lockedJunction(id)) return false;
    if (this.roadsAt(id).some((r) => lockedRoad(r.a, r.b))) return false;
    return this.commit('Remove junction ' + id, (l) => {
      l.junctions = l.junctions.filter((j) => j.id !== id);
      l.roads = l.roads.filter((r) => r.a !== id && r.b !== id);
      for (const j of l.junctions)
        if (j.closedCrossings) j.closedCrossings = j.closedCrossings.filter((n) => n !== id);
    });
  }
  addRoad(a, b) {
    if (a === b || this.hasRoad(a, b)) return false;
    return this.commit(`Add road ${a}–${b}`, (l) => l.roads.push({ a, b }));
  }
  removeRoad(a, b) {
    if (lockedRoad(a, b)) return false;
    return this.commit(`Remove road ${a}–${b}`, (l) => {
      l.roads = l.roads.filter((r) => !((r.a === a && r.b === b) || (r.a === b && r.b === a)));
    });
  }
  // Puts a new junction on the road a–b at (x, z), dividing it in two; returns the junction's id.
  splitRoad(a, b, x, z) {
    if (lockedRoad(a, b)) return null;
    const id = this.nextId();
    this.commit(`Add junction on ${a}–${b}`, (l) => {
      l.roads = l.roads.filter((r) => !((r.a === a && r.b === b) || (r.a === b && r.b === a)));
      l.junctions.push({ id, x: round(x), z: round(z) });
      l.roads.push({ a, b: id }, { a: id, b });
    });
    return id;
  }
  // Draws a road between two ends in one step. Each end is an existing junction ({ junction }), a
  // point on a road ({ road: [a, b], x, z }), which gets a new junction there, or open ground
  // ({ x, z }), which gets a new junction too. Returns the far end's junction id, or null.
  drawRoad(from, to) {
    let endId = null;
    const done = this.commit('Draw road', (l) => {
      const resolve = (end) => {
        if (end.junction) return end.junction;
        const id = this.nextIdIn(l);
        l.junctions.push({ id, x: round(end.x), z: round(end.z) });
        if (end.road) {
          const [a, b] = end.road;
          if (lockedRoad(a, b)) return null;
          l.roads = l.roads.filter((r) => !((r.a === a && r.b === b) || (r.a === b && r.b === a)));
          l.roads.push({ a, b: id }, { a: id, b });
        }
        return id;
      };
      const a = resolve(from),
        b = resolve(to);
      if (!a || !b || a === b) return false;
      if (l.roads.some((r) => (r.a === a && r.b === b) || (r.a === b && r.b === a))) return false;
      l.roads.push({ a, b });
      endId = b;
    });
    return done ? endId : null;
  }
  nextIdIn(layout) {
    let n = 1;
    while (layout.junctions.some((j) => j.id === 'n' + n)) n++;
    return 'n' + n;
  }
  // 'signals', 'stop', 'giveway', 'none', or null for the automatic choice (signals where three or
  // more roads meet).
  setControl(id, control) {
    if (id === '1:1') return false;
    if (control && !CONTROLS.includes(control)) return false;
    return this.commit('Change junction ' + id, (l) => {
      const j = l.junctions.find((j) => j.id === id);
      if (control) j.control = control;
      else delete j.control;
    });
  }
  // Opens or closes the zebra crossing over the road from junction `id` towards `towards`.
  toggleCrossing(id, towards) {
    return this.commit('Change crossing at ' + id, (l) => {
      const j = l.junctions.find((j) => j.id === id),
        closed = new Set(j.closedCrossings || []);
      if (closed.has(towards)) closed.delete(towards);
      else closed.add(towards);
      if (closed.size) j.closedCrossings = [...closed];
      else delete j.closedCrossings;
    });
  }
  resetToInherited() {
    return this.commit('Reset the layout', (l) => {
      const fresh = clone(this.inherited());
      l.junctions = fresh.junctions;
      l.roads = fresh.roads;
    });
  }

  // Problems with the layout: errors stop it being saved, warnings do not.
  check() {
    const problems = [],
      { junctions, roads } = this.layout,
      byId = Object.fromEntries(junctions.map((j) => [j.id, j])),
      add = (level, message, select, at) => problems.push({ level, message, select, at });
    const mid = (r) => ({ x: (byId[r.a].x + byId[r.b].x) / 2, z: (byId[r.a].z + byId[r.b].z) / 2 });
    let map = null;
    try {
      map = createCommunity({ ...this.location, id: this.location.id || 'editor' }, this.layout);
    } catch (error) {
      add('error', 'The town cannot be built from this layout: ' + error.message);
    }
    for (const r of roads) {
      const a = byId[r.a],
        b = byId[r.b],
        length = Math.hypot(b.x - a.x, b.z - a.z);
      if (length < MIN_ROAD)
        add(
          'error',
          `Road ${r.a}–${r.b} is ${Math.round(length)} m long: roads need at least ${MIN_ROAD} m between junctions for cars to stop and turn.`,
          { road: [r.a, r.b] },
          mid(r),
        );
      for (const lot of map?.buildings || [])
        if (segmentHitsBox(a, b, lot, LOT_MARGIN))
          add(
            'error',
            `Road ${r.a}–${r.b} runs through ${lot.name}.`,
            { road: [r.a, r.b] },
            mid(r),
          );
    }
    for (const [i, r] of roads.entries())
      for (const s of roads.slice(i + 1)) {
        if ([s.a, s.b].includes(r.a) || [s.a, s.b].includes(r.b)) continue;
        const at = crossingPoint(byId[r.a], byId[r.b], byId[s.a], byId[s.b]);
        if (at)
          add(
            'error',
            `Roads ${r.a}–${r.b} and ${s.a}–${s.b} cross without a junction. Use the Junction tool to add one where they meet.`,
            { road: [r.a, r.b] },
            at,
          );
      }
    for (const j of junctions) {
      const arms = this.roadsAt(j.id).map((r) => byId[r.a === j.id ? r.b : r.a]);
      if (!arms.length) add('error', `Junction ${j.id} has no roads.`, { junction: j.id }, j);
      else if (arms.length === 1)
        add(
          'error',
          `Junction ${j.id} is a dead end: cars cannot turn round. Join it to another road or remove it.`,
          { junction: j.id },
          j,
        );
      const angles = arms.map((k) => Math.atan2(k.z - j.z, k.x - j.x)).sort((a, b) => a - b);
      for (const [i, angle] of angles.entries()) {
        const next = i + 1 < angles.length ? angles[i + 1] : angles[0] + 2 * Math.PI,
          gap = ((next - angle) * 180) / Math.PI;
        if (angles.length > 1 && gap < MIN_ANGLE) {
          add(
            'error',
            `Two roads meet at ${Math.round(gap)}° at junction ${j.id}: at least ${MIN_ANGLE}° is needed for the corners and crossings between them.`,
            { junction: j.id },
            j,
          );
          break;
        }
      }
      const signalled = j.control ? j.control === 'signals' : arms.length >= 3;
      if (signalled && arms.length > 4)
        add(
          'warning',
          `Junction ${j.id} has ${arms.length} roads, but signals have two phases: some arms share a green.`,
          { junction: j.id },
          j,
        );
    }
    // One network: every junction reachable from every other.
    if (junctions.length) {
      const seen = new Set([junctions[0].id]),
        queue = [junctions[0].id];
      while (queue.length) {
        const id = queue.shift();
        for (const r of this.roadsAt(id)) {
          const other = r.a === id ? r.b : r.a;
          if (!seen.has(other)) seen.add(other) && queue.push(other);
        }
      }
      const cut = junctions.filter((j) => !seen.has(j.id));
      if (cut.length)
        add(
          'error',
          `${cut.length} junction${cut.length > 1 ? 's are' : ' is'} cut off from the rest of the roads (${cut
            .slice(0, 4)
            .map((j) => j.id)
            .join(', ')}${cut.length > 4 ? '…' : ''}).`,
          { junction: cut[0].id },
          cut[0],
        );
    }
    if (map) {
      // Everyone can walk between every building.
      const walks = map.walks,
        start = map.buildings[0].node,
        seen = new Set([start]),
        queue = [start];
      while (queue.length)
        for (const edge of walks.edges[queue.shift()] || [])
          if (!seen.has(edge.to)) seen.add(edge.to) && queue.push(edge.to);
      for (const b of map.buildings)
        if (!seen.has(b.node))
          add('error', `People cannot walk to ${b.name}.`, null, { x: b.x, z: b.z });
      gridBusStops ??= createCommunity({ id: 'editor' }, defaultStreetLayout()).busStops.length;
      if (map.busStops.length < gridBusStops)
        add(
          'warning',
          `${gridBusStops - map.busStops.length} of the town's ${gridBusStops} bus stops are gone with the roads they stood on.`,
        );
    }
    this.problems = problems;
    this.map = map;
    return problems;
  }
  get errors() {
    return this.problems.filter((p) => p.level === 'error');
  }
  isChanged() {
    return !same(this.layout, this.original);
  }
  // The street layout file with this target's layout in it. A layout the same as what it would
  // inherit is left out, so the file stays empty until something really changes.
  savedWith() {
    const saved = clone(this.saved),
      plain = same(this.layout, this.inherited()) ? null : clone(this.layout);
    if (this.target === 'town')
      saved.town = same(this.layout, defaultStreetLayout()) ? null : plain;
    else if (plain) saved.locations[this.target] = plain;
    else delete saved.locations[this.target];
    return saved;
  }
  // After saving: what is on disk is now the starting point.
  markSaved(saved) {
    this.saved = clone(saved);
    this.original = clone(this.layout);
    this.emit();
  }
}

// Whether the segment a–b passes within `margin` of the box { x, z, w, d } (box centre and size).
export function segmentHitsBox(a, b, box, margin) {
  const minX = box.x - box.w / 2 - margin,
    maxX = box.x + box.w / 2 + margin,
    minZ = box.z - box.d / 2 - margin,
    maxZ = box.z + box.d / 2 + margin;
  let t0 = 0,
    t1 = 1;
  const dx = b.x - a.x,
    dz = b.z - a.z;
  for (const [p, q] of [
    [-dx, a.x - minX],
    [dx, maxX - a.x],
    [-dz, a.z - minZ],
    [dz, maxZ - a.z],
  ]) {
    if (Math.abs(p) < 1e-12) {
      if (q < 0) return false;
      continue;
    }
    const t = q / p;
    if (p < 0) t0 = Math.max(t0, t);
    else t1 = Math.min(t1, t);
    if (t0 > t1) return false;
  }
  return true;
}
// Where segments a–b and c–d cross (not at their ends), or null.
export function crossingPoint(a, b, c, d) {
  const r = [b.x - a.x, b.z - a.z],
    s = [d.x - c.x, d.z - c.z],
    cross = r[0] * s[1] - r[1] * s[0];
  if (Math.abs(cross) < 1e-9) return null;
  const t = ((c.x - a.x) * s[1] - (c.z - a.z) * s[0]) / cross,
    u = ((c.x - a.x) * r[1] - (c.z - a.z) * r[0]) / cross;
  if (t <= 0.02 || t >= 0.98 || u <= 0.02 || u >= 0.98) return null;
  return { x: a.x + r[0] * t, z: a.z + r[1] * t };
}
