// Hand-made nature in the game's own world: hills, painted ground, long grass and flowers, planted
// trees and water, per city. The Map Editor saves it in data/world-layout.js as
// locations[id].nature (see world-layout.js), every part optional:
//   height:  { 'i,j': metres }        hills on a 2 m grid (x = 2i, z = 2j), 0 to MAX_HEIGHT
//   paint:   { dirt: { 'i,j': w } }   ground kinds (GROUND) painted on a 0.5 m grid (x = i / 2),
//                                     w 0.05 to 1
//   grass:   { 'i,j': w }             long grass, 0.5 m grid; flowers: the same for flowers
//   lawn:    { height, colour, density }  how the long grass grows (LAWN when not given)
//   trees:   [[style, x, z, scale]]   trees planted (TREE_STYLES)
//   water:   [{ kind: 'pond' | 'stream' | 'pool', pts: [[x, z]...], width?, level?, walk? }]
//            a pond's outline, a stream's course, or a pool's two opposite corners; `level` is the
//            water's height (worked out from the ground when not given) and `walk` lets people
//            wade in instead of walking round
// Anything built or placed keeps flat ground under it: hills give way around houses, roads, lots
// and furniture (and water keeps its own level), so only open land rises. With no nature saved the
// world is exactly as built.
import { buildTree } from './vegetation.js';
import { registerGeometry, retireGeometry } from './world-geometry.js';

export const HEIGHT_CELL = 2;
export const PAINT_CELL = 0.5;
export const MAX_HEIGHT = 30;
export const GROUND = {
  grass: { name: 'Meadow', color: '#8eac6c', surface: 'grass' },
  dirt: { name: 'Dirt', color: '#8b7458', surface: 'soil' },
  sand: { name: 'Sand', color: '#d6c597', surface: 'soil' },
  gravel: { name: 'Gravel', color: '#a19d94', surface: 'stone' },
  paving: { name: 'Paving', color: '#bdb7ab', surface: 'tile' },
};
export const TREE_STYLES = {
  broadleaf: 'Broadleaf',
  eucalypt: 'Eucalypt',
  conifer: 'Conifer',
  palm: 'Palm',
  fruit: 'Fruit tree',
};
export const WATER_KINDS = { pond: 'Pond', stream: 'Stream', pool: 'Pool' };
export const LAWN = { height: 0.4, colour: '#6f9a52', density: 3 };
const FLOWER_COLOURS = ['#e8d45c', '#d9668a', '#f3f0e6', '#9a7ad6'];
// Landscape scenery that stands on the hills rather than flattening them.
// How far below its height the ground's surface is drawn (lawns and paths lie over it).
const SINK = 0.13;
const LIFTED = new Set(['mountain', 'foothill', 'snowcap', 'shore-rock', 'tree']);

export const cellKey = (i, j) => i + ',' + j;
export const parseKey = (key) => key.split(',').map(Number);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const smooth = (t) => t * t * (3 - 2 * t);
// A number from a place, the same every time (for jitter and variety).
function hash(i, j, k = 0) {
  let h = Math.imul(i | 0, 374761393) + Math.imul(j | 0, 668265263) + Math.imul(k, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
const isEmpty = (o) => !o || !Object.keys(o).length;
// Whether a city's nature changes anything.
export function hasNature(nature) {
  return (
    !!nature &&
    (!isEmpty(nature.height) ||
      Object.values(nature.paint || {}).some((layer) => !isEmpty(layer)) ||
      !isEmpty(nature.grass) ||
      !isEmpty(nature.flowers) ||
      !!nature.trees?.length ||
      !!nature.water?.length)
  );
}
// The tree style a city grows by itself (as its landscape does).
export function regionalTreeStyle(location) {
  const climate = location?.climate;
  if (['cold', 'highland'].includes(climate)) return 'conifer';
  if (['tropical', 'monsoon'].includes(climate)) return 'palm';
  if (location?.iso === 'AUS' || !location || location.id === 'legacy') return 'eucalypt';
  return 'broadleaf';
}

// ---- Heights ----------------------------------------------------------------------------------
const catmull = (p0, p1, p2, p3, t) =>
  0.5 *
  (2 * p1 +
    (-p0 + p2) * t +
    (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t +
    (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t);
// A smooth height at any point from heights on the 2 m grid (a Map or object of 'i,j' → metres).
export function sampleGrid(get, x, z) {
  const gx = x / HEIGHT_CELL,
    gz = z / HEIGHT_CELL,
    i = Math.floor(gx),
    j = Math.floor(gz),
    tx = gx - i,
    tz = gz - j,
    rows = [];
  for (let b = -1; b <= 2; b++)
    rows.push(catmull(get(i - 1, j + b), get(i, j + b), get(i + 1, j + b), get(i + 2, j + b), tx));
  return Math.max(0, catmull(rows[0], rows[1], rows[2], rows[3], tz));
}
const getter = (map) =>
  map instanceof Map ? (i, j) => map.get(cellKey(i, j)) || 0 : (i, j) => map?.[cellKey(i, j)] || 0;

// The ground a mesh covers, as [x0, z0, x1, z1].
function footprint(m) {
  const [x, , z] = m.pos,
    [w, , d] = m.size,
    [rx = 0, ry = 0, rz = 0] = m.rotation || [];
  if (rx || rz) {
    const r = Math.max(w, d, m.size[1]) / 2;
    return [x - r, z - r, x + r, z + r];
  }
  const c = Math.abs(Math.cos(ry)),
    s = Math.abs(Math.sin(ry)),
    hx = (c * w + s * d) / 2,
    hz = (s * w + c * d) / 2;
  return [x - hx, z - hz, x + hx, z + hz];
}
// Whether a mesh keeps the ground under it flat: everything on the ground that is built or placed,
// but not the ground itself, the sky, people, animals or scenery that rides the hills.
function holdsGround(m) {
  if (m.nature || m.sky || m.flyingBird || m.wildlife || m.actor || m.landscapeGround) return false;
  if (m.landscape && LIFTED.has(m.terrainFeature)) return false;
  if (m.pos[1] - m.size[1] / 2 > 1.5) return false;
  return Math.max(m.size[0], m.size[2]) < 150;
}

// The heights as the world takes them: hills at `raw`, flattened where the ground must stay as
// built (to 0) and under water (to its level), easing back over a few metres. Returns a Map.
function settleHeights(model, raw, flats) {
  const out = new Map(),
    entries = Object.entries(raw || {}).filter(([, h]) => h > 0);
  if (!entries.length) return out;
  let i0 = Infinity,
    i1 = -Infinity,
    j0 = Infinity,
    j1 = -Infinity;
  for (const [key] of entries) {
    const [i, j] = parseKey(key);
    i0 = Math.min(i0, i);
    i1 = Math.max(i1, i);
    j0 = Math.min(j0, j);
    j1 = Math.max(j1, j);
  }
  const reach = 3,
    box = [
      (i0 - reach) * HEIGHT_CELL,
      (j0 - reach) * HEIGHT_CELL,
      (i1 + reach) * HEIGHT_CELL,
      (j1 + reach) * HEIGHT_CELL,
    ];
  // Grid points held flat, with the height they are held at.
  const held = new Map(),
    hold = ([x0, z0, x1, z1], target, pad = 0.5) => {
      if (x1 < box[0] || x0 > box[2] || z1 < box[1] || z0 > box[3]) return;
      for (
        let i = Math.ceil((x0 - pad) / HEIGHT_CELL);
        i <= Math.floor((x1 + pad) / HEIGHT_CELL);
        i++
      )
        for (
          let j = Math.ceil((z0 - pad) / HEIGHT_CELL);
          j <= Math.floor((z1 + pad) / HEIGHT_CELL);
          j++
        ) {
          const key = cellKey(i, j);
          held.set(key, Math.min(held.get(key) ?? Infinity, target));
        }
    };
  for (const m of model.objects) if (holdsGround(m)) hold(footprint(m), 0);
  for (const flat of flats) hold(flat.box, flat.target, 1);
  for (const [key, h] of entries) {
    const [i, j] = parseKey(key);
    let nearest = Infinity,
      target = 0;
    for (let a = -reach; a <= reach; a++)
      for (let b = -reach; b <= reach; b++) {
        const t = held.get(cellKey(i + a, j + b));
        if (t === undefined) continue;
        const d = Math.hypot(a, b) * HEIGHT_CELL;
        if (d < nearest) {
          nearest = d;
          target = t;
        }
      }
    const keep = smooth(clamp((nearest - 1.5) / 4.5, 0, 1)),
      settled = target + (Math.min(h, MAX_HEIGHT) - target) * keep;
    if (settled > 1e-4) out.set(key, settled);
  }
  return out;
}

// ---- Shapes -----------------------------------------------------------------------------------
// Ear-clipping triangulation of a simple polygon [[x, z]...]; returns index triples.
function triangulate(points) {
  const n = points.length;
  if (n < 3) return [];
  let area = 0;
  for (let i = 0; i < n; i++) {
    const [ax, az] = points[i],
      [bx, bz] = points[(i + 1) % n];
    area += ax * bz - bx * az;
  }
  const idx = [...points.keys()];
  if (area < 0) idx.reverse();
  const cross = (a, b, c) =>
      (points[b][0] - points[a][0]) * (points[c][1] - points[a][1]) -
      (points[b][1] - points[a][1]) * (points[c][0] - points[a][0]),
    inside = (p, a, b, c) => cross(a, b, p) >= 0 && cross(b, c, p) >= 0 && cross(c, a, p) >= 0;
  const out = [];
  let guard = 0;
  while (idx.length > 3 && guard++ < 10000) {
    let clipped = false;
    for (let k = 0; k < idx.length; k++) {
      const a = idx[(k + idx.length - 1) % idx.length],
        b = idx[k],
        c = idx[(k + 1) % idx.length];
      if (cross(a, b, c) <= 1e-9) continue;
      if (idx.some((p) => p !== a && p !== b && p !== c && inside(p, a, b, c))) continue;
      out.push([a, b, c]);
      idx.splice(k, 1);
      clipped = true;
      break;
    }
    if (!clipped) break;
  }
  if (idx.length === 3) out.push(idx);
  return out;
}
// A closed outline through `points`, rounded (Catmull-Rom), `steps` points per side.
export function roundOutline(points, steps = 6) {
  const n = points.length,
    out = [];
  if (n < 3) return points.map((p) => [...p]);
  for (let i = 0; i < n; i++) {
    const p0 = points[(i + n - 1) % n],
      p1 = points[i],
      p2 = points[(i + 1) % n],
      p3 = points[(i + 2) % n];
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      out.push([0, 1].map((k) => catmull(p0[k], p1[k], p2[k], p3[k], t)));
    }
  }
  return out;
}
// A course through `points`, rounded, `steps` points per stretch.
export function roundCourse(points, steps = 5) {
  if (points.length < 3) return points.map((p) => [...p]);
  const out = [];
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)],
      p1 = points[i],
      p2 = points[i + 1],
      p3 = points[Math.min(points.length - 1, i + 2)];
    for (let s = 0; s < steps; s++)
      out.push([0, 1].map((k) => catmull(p0[k], p1[k], p2[k], p3[k], s / steps)));
  }
  out.push([...points.at(-1)]);
  return out;
}
// An outline moved out by `by` metres (in for a negative distance).
function offsetOutline(points, by) {
  const n = points.length;
  let area = 0;
  for (let i = 0; i < n; i++)
    area += points[i][0] * points[(i + 1) % n][1] - points[(i + 1) % n][0] * points[i][1];
  const sign = area > 0 ? -1 : 1;
  return points.map((p, i) => {
    const a = points[(i + n - 1) % n],
      b = points[(i + 1) % n],
      tx = b[0] - a[0],
      tz = b[1] - a[1],
      l = Math.hypot(tx, tz) || 1;
    return [p[0] + ((sign * tz) / l) * by, p[1] - ((sign * tx) / l) * by];
  });
}
function insidePolygon(points, x, z) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, zi] = points[i],
      [xj, zj] = points[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
// Axis-aligned boxes ({ x, z, w, d }) that together cover a polygon's inside, 1 m rows.
function coverPolygon(points, inset = 0.4) {
  const zs = points.map((p) => p[1]),
    out = [];
  let previous = null;
  for (let z = Math.floor(Math.min(...zs)) + 0.5; z < Math.max(...zs); z += 1) {
    const xs = [];
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      const [xi, zi] = points[i],
        [xj, zj] = points[j];
      if (zi > z !== zj > z) xs.push(((xj - xi) * (z - zi)) / (zj - zi) + xi);
    }
    xs.sort((a, b) => a - b);
    const runs = [];
    for (let k = 0; k + 1 < xs.length; k += 2)
      if (xs[k + 1] - xs[k] > inset * 2 + 0.2) runs.push([xs[k] + inset, xs[k + 1] - inset]);
    // A row the same as the one before grows that box instead of starting another.
    if (
      previous &&
      runs.length === 1 &&
      previous.runs.length === 1 &&
      Math.abs(runs[0][0] - previous.runs[0][0]) < 0.3 &&
      Math.abs(runs[0][1] - previous.runs[0][1]) < 0.3
    ) {
      previous.box.d += 1;
      previous.box.z += 0.5;
      continue;
    }
    previous = { runs, box: null };
    for (const [a, b] of runs) {
      const box = { x: (a + b) / 2, z, w: b - a, d: 1 };
      out.push(box);
      previous.box ??= box;
    }
  }
  return out;
}

// One run-time mesh (see registerGeometry) from triangles in world metres.
function surfaceMesh(model, state, positions, normals, color, extra = {}) {
  if (!positions.length) return null;
  const { key, pos, size } = registerGeometry(positions, normals);
  state.shapes.push(key);
  const m = model.mesh(key, pos, size, color, {
    rotation: [0, 0, 0],
    nature: true,
    rounded: false,
    ...extra,
  });
  state.meshes.add(m);
  return m;
}

// The water a city has, as built here: { kind, outline | course, width, level, walk, box }.
function waterFeatures(water, rawLift) {
  const out = [];
  for (const w of water || []) {
    const pts = (w.pts || []).filter((p) => Array.isArray(p) && p.every(Number.isFinite));
    if (w.kind === 'pond' && pts.length >= 3) {
      const outline = roundOutline(pts),
        level = Number.isFinite(w.level)
          ? w.level
          : Math.max(0, Math.min(...outline.map(([x, z]) => rawLift(x, z)))) + 0.07;
      out.push({ ...w, outline, level, box: bounds(outline) });
    } else if (w.kind === 'stream' && pts.length >= 2) {
      const course = roundCourse(pts),
        width = clamp(Number(w.width) || 2.5, 0.6, 12);
      out.push({ ...w, course, width, box: grow(bounds(course), width / 2 + 0.8) });
    } else if (w.kind === 'pool' && pts.length >= 2) {
      const [[ax, az], [bx, bz]] = pts,
        outline = [
          [Math.min(ax, bx), Math.min(az, bz)],
          [Math.max(ax, bx), Math.min(az, bz)],
          [Math.max(ax, bx), Math.max(az, bz)],
          [Math.min(ax, bx), Math.max(az, bz)],
        ],
        level = Number.isFinite(w.level)
          ? w.level
          : Math.max(0, rawLift((ax + bx) / 2, (az + bz) / 2)) + 0.06;
      if (outline[2][0] - outline[0][0] >= 1 && outline[2][1] - outline[0][1] >= 1)
        out.push({ ...w, outline, level, box: grow(bounds(outline), 0.4) });
    }
  }
  return out;
}
const bounds = (points) => [
  Math.min(...points.map((p) => p[0])),
  Math.min(...points.map((p) => p[1])),
  Math.max(...points.map((p) => p[0])),
  Math.max(...points.map((p) => p[1])),
];
const grow = ([x0, z0, x1, z1], by) => [x0 - by, z0 - by, x1 + by, z1 + by];

// ---- Applying ---------------------------------------------------------------------------------
// Takes away nature applied before (the editor applies it again after every change).
export function removeNature(model) {
  const state = model.natureState;
  if (!state) return;
  model.objects.splice(
    0,
    model.objects.length,
    ...model.objects.filter((m) => !state.meshes.has(m)),
  );
  const colliders = new Set(state.colliders);
  model.colliders.splice(
    0,
    model.colliders.length,
    ...model.colliders.filter((c) => !colliders.has(c)),
  );
  for (const key of state.shapes) retireGeometry(key);
  // Scenery lifted onto hills goes back down, unless something has moved it since.
  for (const { mesh, from, y } of state.lifted) if (mesh.pos[1] === y) mesh.pos[1] = from;
  model.floorHeight = state.floorHeight;
  delete model.natureState;
}

// Builds a city's nature into its model (removing what was built before), in the city's own
// colours. Returns the problems found (left out), as text.
export function applyNature(model, nature) {
  removeNature(model);
  if (!hasNature(nature)) return [];
  // Nothing made here belongs to an edit group the builders left open.
  model.tag?.();
  const state = (model.natureState = {
    meshes: new Set(),
    colliders: [],
    shapes: [],
    lifted: [],
    floorHeight: model.floorHeight,
  });
  const problems = [];
  const rawGet = getter(nature.height),
    rawLift = (x, z) => Math.max(0, sampleGrid(rawGet, x, z) - SINK),
    water = waterFeatures(nature.water, rawLift);
  // Water keeps the ground under it at its own level.
  const flats = water
    .filter((w) => w.kind !== 'stream')
    .map((w) => ({ box: w.box, target: Math.max(0, w.level - 0.15) }));
  const heights = settleHeights(model, nature.height, flats),
    get = getter(heights),
    hasHills = heights.size > 0;
  // The ground's height, how far it lifts what stands on it, and where its surface is drawn: a
  // little lower (under lawns and paths), and well under the flat ground round a hill, so a hill
  // rises out of the ground in a clean line instead of lying on it.
  const H = (x, z) => (hasHills ? sampleGrid(get, x, z) : 0),
    lift = (x, z) => Math.max(0, H(x, z) - SINK),
    surfaceY = (x, z) => {
      const h = H(x, z);
      return h - SINK - 0.3 * (1 - smooth(clamp(h / 0.3, 0, 1)));
    },
    ground = model.objects.find((m) => m.landscapeGround);
  const groundColour = ground?.color || '#a1af8a',
    groundSurface =
      ground &&
      ground.color &&
      parseInt(ground.color.slice(3, 5), 16) > parseInt(ground.color.slice(1, 3), 16)
        ? 'grass'
        : 'soil';
  const normalAt = (x, z, e = 0.5) => {
    const dx = (H(x + e, z) - H(x - e, z)) / (2 * e),
      dz = (H(x, z + e) - H(x, z - e)) / (2 * e),
      l = Math.hypot(dx, 1, dz);
    return [-dx / l, 1 / l, -dz / l];
  };

  // Hills: the ground drawn over every half-metre square that rises, in the ground's own colour, with
  // bare rock laid over the steepest slopes (edged smoothly, like painted ground).
  if (hasHills) {
    const cells = new Set();
    for (const key of heights.keys()) {
      const [i, j] = parseKey(key);
      for (let a = -2; a <= 1; a++) for (let b = -2; b <= 1; b++) cells.add(cellKey(i + a, j + b));
    }
    const p = [],
      n = [],
      steepness = new Map(),
      per = HEIGHT_CELL / PAINT_CELL;
    const vertex = new Map(),
      at = (x, z) => {
        const key = x + ',' + z;
        let v = vertex.get(key);
        if (!v) {
          const normal = normalAt(x, z);
          vertex.set(key, (v = { p: [x, surfaceY(x, z), z], n: normal, h: H(x, z) }));
          // Rock from about 32 degrees of slope (measured over 3 m), all rock past 42; never on a
          // hill's grassy foot.
          steepness.set(
            cellKey(x / PAINT_CELL, z / PAINT_CELL),
            clamp((0.85 - normalAt(x, z, 1.5)[1]) / 0.11, 0, 1) *
              smooth(clamp((v.h - 0.4) / 1.2, 0, 1)),
          );
        }
        return v;
      };
    for (const key of cells) {
      const [i, j] = parseKey(key);
      for (let a = 0; a < per; a++)
        for (let b = 0; b < per; b++) {
          const x = i * HEIGHT_CELL + a * PAINT_CELL,
            z = j * HEIGHT_CELL + b * PAINT_CELL,
            q = [
              at(x, z),
              at(x + PAINT_CELL, z),
              at(x + PAINT_CELL, z + PAINT_CELL),
              at(x, z + PAINT_CELL),
            ];
          for (const v of [q[0], q[3], q[2], q[0], q[2], q[1]]) {
            p.push(...v.p);
            n.push(...v.n);
          }
        }
    }
    surfaceMesh(model, state, p, n, groundColour, {
      surface: groundSurface,
      terrainFeature: 'hill',
      emission: -1,
    });
    // Softened twice, so the rock's edge runs in easy curves rather than following each square.
    let soft = steepness;
    for (let pass = 0; pass < 3; pass++) {
      const next = new Map();
      for (const key of soft.keys()) {
        const [i, j] = parseKey(key);
        let sum = 0;
        for (let a = -1; a <= 1; a++)
          for (let b = -1; b <= 1; b++) sum += soft.get(cellKey(i + a, j + b)) || 0;
        next.set(key, sum / 9);
      }
      soft = next;
    }
    const rock = {};
    for (const [key, w] of soft) if (w > 0.05) rock[key] = w;
    if (!isEmpty(rock)) {
      const area = paintArea(rock, (x, z) => surfaceY(x, z) + 0.025, normalAt);
      surfaceMesh(model, state, area.p, area.n, '#8e9488', {
        surface: 'terrain',
        terrainFeature: 'hill-rock',
        emission: -1,
      });
    }
  }

  // Painted ground and long grass: each kind's area edged smoothly along its painted weights.
  const lawn = { ...LAWN, ...nature.lawn };
  const layers = [
    ...Object.keys(GROUND).map((kind) => [
      kind,
      nature.paint?.[kind],
      GROUND[kind].color,
      GROUND[kind].surface,
    ]),
    ['grass', mergeFields(nature.grass, nature.flowers), shade(lawn.colour, -0.1), 'grass'],
  ];
  layers.forEach(([kind, field, color, surface], layer) => {
    if (isEmpty(field)) return;
    const { p, n } = paintArea(
      field,
      (x, z) => Math.max(surfaceY(x, z) + 0.05, 0.065) + layer * 0.006,
      normalAt,
    );
    surfaceMesh(model, state, p, n, color, {
      surface,
      terrainFeature: 'ground-' + kind,
      paint: kind,
      emission: -1,
    });
  });
  for (const [field, flowers] of [
    [nature.grass, false],
    [nature.flowers, true],
  ])
    if (!isEmpty(field)) growGrass(model, state, field, lawn, flowers, lift);

  // Trees, standing on the ground where they were planted.
  const foliage = treeColours(model);
  (nature.trees || []).forEach((tree, index) => {
    const [style, x, z, scale = 1] = tree;
    if (!TREE_STYLES[style] || !Number.isFinite(x) || !Number.isFinite(z)) {
      problems.push(`tree ${index + 1} left out: not a tree`);
      return;
    }
    const k = clamp(scale, 0.3, 3),
      made = buildTree(model, x, z, k, {
        style,
        detailed: true,
        fruit: style === 'fruit',
        foliage: foliage[Math.floor(hash(x * 10, z * 10) * foliage.length)],
        extra: { nature: true, natureTree: index },
      }),
      by = lift(x, z);
    for (const m of made.parts) {
      m.pos[1] += by;
      state.meshes.add(m);
    }
    const trunk = { x, z, w: 0.45 * k, d: 0.45 * k, natureTree: index };
    model.colliders.push(trunk);
    state.colliders.push(trunk);
  });

  // Water.
  for (const w of water) buildWater(model, state, w, lift);

  // Scenery stands on the hills: each landscape piece (a whole tree at once) rises with the ground.
  if (hasHills) {
    const bases = new Map();
    for (const m of model.objects)
      if (m.landscape && LIFTED.has(m.terrainFeature) && !state.meshes.has(m)) {
        const group = m.editGroup || m;
        if (!bases.has(group)) bases.set(group, lift(m.pos[0], m.pos[2]));
        const by = bases.get(group);
        if (by > 1e-4) {
          const from = m.pos[1];
          m.pos[1] += by;
          state.lifted.push({ mesh: m, from, y: m.pos[1] });
        }
      }
    // People, the technician, the camera and devices walk on the hills.
    const floor = state.floorHeight;
    model.floorHeight = (x, z) => (floor ? floor(x, z) || 0 : 0) + lift(x, z);
  }
  model.natureLift = lift;
  return problems;
}

// Grass and flower weights together, for the ground they grow on.
function mergeFields(a, b) {
  if (isEmpty(b)) return a;
  if (isEmpty(a)) return b;
  const out = { ...a };
  for (const [key, w] of Object.entries(b)) out[key] = Math.max(out[key] || 0, w);
  return out;
}
// A colour made lighter (by > 0) or darker.
function shade(hex, by) {
  const c = [1, 3, 5].map((i) => parseInt(String(hex).slice(i, i + 2), 16) || 0),
    out = c.map((v) => Math.round(clamp(by > 0 ? v + (255 - v) * by : v * (1 + by), 0, 255)));
  return '#' + out.map((v) => v.toString(16).padStart(2, '0')).join('');
}
// The foliage colours a city's trees take, from its own landscape trees.
function treeColours(model) {
  const seen = model.objects.find(
    (m) => m.landscape && m.terrainFeature === 'tree' && m.shape === 'foliage',
  );
  const base = seen?.color || '#62856d';
  return [
    [base, shade(base, 0.12), shade(base, -0.08)],
    [shade(base, -0.05), shade(base, 0.2), base],
    ['#66875e', '#76976a', '#839e72'],
  ];
}

// The area of one painted kind: each half-metre square split into the same two triangles the hills are
// drawn with, each clipped where its weight crosses one half, so the edge runs smoothly between
// grid points. Points between grid points are found along the triangle itself, so the area lies
// exactly over the hill's surface. `y(x, z)` is the height to draw at, on grid points.
export function paintArea(field, y, normalAt) {
  const get = (i, j) => field[cellKey(i, j)] || 0,
    cells = new Set(),
    points = new Map(),
    point = (i, j) => {
      const key = cellKey(i, j);
      let v = points.get(key);
      if (!v) {
        const x = i * PAINT_CELL,
          z = j * PAINT_CELL;
        points.set(
          key,
          (v = { p: [x, y(x, z), z], n: normalAt ? normalAt(x, z) : [0, 1, 0], w: get(i, j) }),
        );
      }
      return v;
    };
  for (const key of Object.keys(field)) {
    const [i, j] = parseKey(key);
    for (let a = -1; a <= 0; a++) for (let b = -1; b <= 0; b++) cells.add(cellKey(i + a, j + b));
  }
  const p = [],
    n = [],
    mix = (a, b, t) => a.map((v, k) => v + (b[k] - v) * t);
  for (const key of cells) {
    const [i, j] = parseKey(key),
      q = [point(i, j), point(i + 1, j), point(i + 1, j + 1), point(i, j + 1)];
    if (q.every((v) => v.w < 0.5)) continue;
    for (const tri of [
      [q[0], q[3], q[2]],
      [q[0], q[2], q[1]],
    ]) {
      const poly = [];
      for (let k = 0; k < 3; k++) {
        const a = tri[k],
          b = tri[(k + 1) % 3];
        if (a.w >= 0.5) poly.push(a);
        if (a.w >= 0.5 !== b.w >= 0.5) {
          const t = (0.5 - a.w) / (b.w - a.w);
          poly.push({ p: mix(a.p, b.p, t), n: mix(a.n, b.n, t) });
        }
      }
      for (let k = 1; k + 1 < poly.length; k++)
        for (const v of [poly[0], poly[k], poly[k + 1]]) {
          p.push(...v.p);
          n.push(...v.n);
        }
    }
  }
  return { p, n };
}
// A painted weight between grid points.
export function fieldAt(field, x, z) {
  const gx = x / PAINT_CELL,
    gz = z / PAINT_CELL,
    i = Math.floor(gx),
    j = Math.floor(gz),
    tx = gx - i,
    tz = gz - j,
    get = (a, b) => field[cellKey(a, b)] || 0;
  return (
    (get(i, j) * (1 - tx) + get(i + 1, j) * tx) * (1 - tz) +
    (get(i, j + 1) * (1 - tx) + get(i + 1, j + 1) * tx) * tz
  );
}

// Long grass: tufts of tapering, bending blades in three shades (one mesh each); flowers add a
// head on some blades in four colours.
function growGrass(model, state, field, lawn, flowers, lift) {
  const height = clamp(Number(lawn.height) || LAWN.height, 0.08, 1.5),
    density = clamp(Number(lawn.density) || LAWN.density, 0.2, 8),
    colours = [shade(lawn.colour, -0.12), lawn.colour, shade(lawn.colour, 0.14)],
    blades = colours.map(() => ({ p: [], n: [] })),
    heads = FLOWER_COLOURS.map(() => ({ p: [], n: [] }));
  const cells = new Set();
  for (const key of Object.keys(field)) {
    const [i, j] = parseKey(key);
    for (let a = -1; a <= 0; a++) for (let b = -1; b <= 0; b++) cells.add(cellKey(i + a, j + b));
  }
  let made = 0;
  const limit = 24000;
  for (const key of cells) {
    const [i, j] = parseKey(key),
      count = Math.floor(density * PAINT_CELL * PAINT_CELL + hash(i, j, 7) * 0.999);
    for (let t = 0; t < count && made < limit; t++) {
      const x = (i + hash(i, j, t * 2 + 1)) * PAINT_CELL,
        z = (j + hash(i, j, t * 2 + 2)) * PAINT_CELL,
        w = fieldAt(field, x, z);
      if (w < 0.5) continue;
      made++;
      const base = lift(x, z) + 0.05,
        tall = height * (0.65 + hash(i, j, t + 40) * 0.6) * Math.min(1, (w - 0.4) * 2.2),
        tuft = 3 + Math.floor(hash(i, j, t + 60) * 3);
      for (let b = 0; b < tuft; b++) {
        const angle = hash(i, j, t * 9 + b) * Math.PI * 2,
          lean = 0.15 + hash(i, j, t * 11 + b) * 0.45,
          h = tall * (0.7 + hash(i, j, t * 13 + b) * 0.4),
          into = blades[Math.floor(hash(i, j, t * 17 + b) * 3)];
        blade(into, x, base, z, h, 0.035 + height * 0.02, angle, lean);
        if (flowers && b === 0 && hash(i, j, t + 90) < 0.7) {
          const c = Math.floor(hash(i, j, t + 91) * FLOWER_COLOURS.length),
            hx = x + Math.cos(angle) * Math.sin(lean) * h * 0.8,
            hz = z + Math.sin(angle) * Math.sin(lean) * h * 0.8;
          blossom(heads[c], hx, base + h * Math.cos(lean * 0.6), hz, 0.05 + height * 0.05);
        }
      }
    }
  }
  const tag = flowers ? 'flowers' : 'long-grass';
  blades.forEach((b, k) =>
    surfaceMesh(model, state, b.p, b.n, colours[k], {
      surface: 'foliage',
      terrainFeature: tag,
      roughness: 1,
    }),
  );
  heads.forEach((h, k) =>
    surfaceMesh(model, state, h.p, h.n, FLOWER_COLOURS[k], { terrainFeature: tag, roughness: 0.9 }),
  );
}
// One blade: a tapering strip of three pieces, bending outward as it rises.
function blade(into, x, y, z, h, width, angle, lean) {
  const dx = Math.cos(angle),
    dz = Math.sin(angle),
    sx = -dz * width,
    sz = dx * width,
    pts = [0, 0.4, 0.75, 1].map((t) => {
      const bend = Math.sin(lean * t * t) * h,
        up = h * t * Math.cos(lean * t * 0.8),
        w = 1 - t * 0.92;
      return { c: [x + dx * bend, y + up, z + dz * bend], w };
    });
  const normal = [dx * 0.5, 0.75, dz * 0.5];
  for (let k = 0; k < 3; k++) {
    const a = pts[k],
      b = pts[k + 1],
      a0 = [a.c[0] - sx * a.w, a.c[1], a.c[2] - sz * a.w],
      a1 = [a.c[0] + sx * a.w, a.c[1], a.c[2] + sz * a.w],
      b0 = [b.c[0] - sx * b.w, b.c[1], b.c[2] - sz * b.w],
      b1 = [b.c[0] + sx * b.w, b.c[1], b.c[2] + sz * b.w];
    for (const v of [a0, a1, b1, a0, b1, b0]) {
      into.p.push(...v);
      into.n.push(...normal);
    }
  }
}
// A small flower head: a low eight-sided cushion.
function blossom(into, x, y, z, r) {
  const ring = Array.from({ length: 8 }, (_, k) => {
    const a = (k / 8) * Math.PI * 2;
    return [x + Math.cos(a) * r, y, z + Math.sin(a) * r, Math.cos(a), Math.sin(a)];
  });
  const top = [x, y + r * 0.6, z],
    bottom = [x, y - r * 0.3, z];
  for (let k = 0; k < 8; k++) {
    const a = ring[k],
      b = ring[(k + 1) % 8];
    for (const [v, nn] of [
      [top, [0, 1, 0]],
      [a, [a[3] * 0.6, 0.8, a[4] * 0.6]],
      [b, [b[3] * 0.6, 0.8, b[4] * 0.6]],
      [bottom, [0, -1, 0]],
      [b, [b[3], -0.2, b[4]]],
      [a, [a[3], -0.2, a[4]]],
    ]) {
      into.p.push(v[0], v[1], v[2]);
      into.n.push(...nn);
    }
  }
}

// One water feature: its water, its bank and edge, and what stops people walking into it.
function buildWater(model, state, w, lift) {
  const water = '#4f7d88',
    rock = '#968f80',
    add = (shape, pos, size, color, extra = {}) => {
      const m = model.mesh(shape, pos, size, color, { nature: true, natureWater: true, ...extra });
      state.meshes.add(m);
      return m;
    },
    collide = (box) => {
      const c = { ...box, natureWater: true };
      model.colliders.push(c);
      state.colliders.push(c);
    };
  const flat = (outline, y, color, extra) => {
    const tris = triangulate(outline),
      p = [],
      n = [];
    for (const tri of tris)
      for (const k of tri) {
        p.push(outline[k][0], y, outline[k][1]);
        n.push(0, 1, 0);
      }
    return surfaceMesh(model, state, p, n, color, extra);
  };
  if (w.kind === 'pond') {
    const bank = offsetOutline(w.outline, 0.9);
    flat(bank, w.level - 0.045, rock, {
      surface: 'terrain',
      terrainFeature: 'pond-bank',
      natureWater: true,
    });
    flat(w.outline, w.level, water, {
      surface: 'water',
      terrainFeature: 'lake',
      roughness: 0.18,
      natureWater: true,
    });
    // Stones along the shore, every few metres.
    const ring = offsetOutline(w.outline, 0.55);
    for (let k = 0; k < ring.length; k += 4) {
      const [x, z] = ring[k],
        s = 0.5 + hash(x * 7, z * 7) * 0.7;
      add('sphere', [x, w.level + 0.02, z], [s * 1.3, s * 0.45, s], rock, {
        terrainFeature: 'shore-rock',
        surface: 'terrain',
        rotation: [0, hash(z, x) * 3, 0],
      });
    }
    if (!w.walk) for (const box of coverPolygon(w.outline)) collide(box);
  } else if (w.kind === 'pool') {
    const [x0, z0] = w.outline[0],
      [x1, z1] = w.outline[2],
      cx = (x0 + x1) / 2,
      cz = (z0 + z1) / 2,
      width = x1 - x0,
      depth = z1 - z0,
      rim = 0.35;
    add('box', [cx, w.level - 0.25, cz], [width, 0.5, depth], '#3f8fa6', {
      surface: 'water',
      terrainFeature: 'lake',
      roughness: 0.1,
      rounded: false,
    });
    for (const [x, z, sw, sd] of [
      [cx, z0 - rim / 2, width + rim * 2, rim],
      [cx, z1 + rim / 2, width + rim * 2, rim],
      [x0 - rim / 2, cz, rim, depth],
      [x1 + rim / 2, cz, rim, depth],
    ])
      add('box', [x, w.level + 0.03, z], [sw, 0.12, sd], '#d9d4c8', {
        surface: 'stone',
        rounded: false,
      });
    if (!w.walk)
      collide({ x: cx, z: cz, w: Math.max(0.2, width - 0.6), d: Math.max(0.2, depth - 0.6) });
  } else if (w.kind === 'stream') {
    // Points about a metre apart along the course, each at the ground under it.
    const along = [];
    w.course.forEach(([x, z], k) => {
      if (k) {
        const [px, pz] = w.course[k - 1],
          steps = Math.max(1, Math.round(Math.hypot(x - px, z - pz)));
        for (let s = 1; s < steps; s++)
          along.push([px + ((x - px) * s) / steps, pz + ((z - pz) * s) / steps]);
      }
      along.push([x, z]);
    });
    const half = w.width / 2;
    // The water and, under it, a bank a little wider, each one ribbon with rounded ends.
    const ribbon = (side, dy) => {
      const p = [],
        n = [],
        edge = along.map(([x, z], k) => {
          const [ax, az] = along[Math.max(0, k - 1)],
            [bx, bz] = along[Math.min(along.length - 1, k + 1)],
            l = Math.hypot(bx - ax, bz - az) || 1,
            nx = -(bz - az) / l,
            nz = (bx - ax) / l,
            y = lift(x, z) + 0.07 + dy;
          return {
            c: [x, y, z],
            l: [x + nx * side, y, z + nz * side],
            r: [x - nx * side, y, z - nz * side],
            d: [-nz, nx],
          };
        });
      const push = (...vs) => {
        for (const v of vs) {
          p.push(...v);
          n.push(0, 1, 0);
        }
      };
      for (let k = 0; k + 1 < edge.length; k++) {
        const a = edge[k],
          b = edge[k + 1];
        push(a.l, b.l, b.r, a.l, b.r, a.r);
      }
      // A half-disc at each end.
      for (const [e, sign] of [
        [edge[0], -1],
        [edge.at(-1), 1],
      ]) {
        const base = Math.atan2(e.l[2] - e.c[2], e.l[0] - e.c[0]);
        for (let k = 0; k < 8; k++) {
          const a0 = base - (sign * Math.PI * k) / 8,
            a1 = base - (sign * Math.PI * (k + 1)) / 8;
          push(
            e.c,
            [e.c[0] + Math.cos(a0) * side, e.c[1], e.c[2] + Math.sin(a0) * side],
            [e.c[0] + Math.cos(a1) * side, e.c[1], e.c[2] + Math.sin(a1) * side],
          );
        }
      }
      return { p, n };
    };
    const bank = ribbon(half + 0.7, -0.05),
      flow = ribbon(half, 0);
    surfaceMesh(model, state, bank.p, bank.n, rock, {
      surface: 'terrain',
      terrainFeature: 'river-bank',
      natureWater: true,
    });
    surfaceMesh(model, state, flow.p, flow.n, water, {
      surface: 'water',
      terrainFeature: 'river',
      roughness: 0.2,
      natureWater: true,
    });
    if (!w.walk) for (const [x, z] of along) collide({ x, z, w: w.width * 0.6, d: w.width * 0.6 });
  }
}

// ---- Checks -------------------------------------------------------------------------------------
// What is wrong with a city's saved nature: unknown kinds, heights out of range, bad water.
export function checkNature(nature) {
  const problems = [];
  if (!nature) return problems;
  for (const [key, h] of Object.entries(nature.height || {}))
    if (!/^-?\d+,-?\d+$/.test(key) || !Number.isFinite(h) || h < 0 || h > MAX_HEIGHT) {
      problems.push(`A hill height at ${key} is not between 0 and ${MAX_HEIGHT} m.`);
      break;
    }
  for (const kind of Object.keys(nature.paint || {}))
    if (!GROUND[kind]) problems.push(`"${kind}" is not a kind of ground.`);
  for (const t of nature.trees || [])
    if (!Array.isArray(t) || !TREE_STYLES[t[0]]) {
      problems.push('A planted tree is not one of the tree kinds.');
      break;
    }
  for (const w of nature.water || [])
    if (!WATER_KINDS[w?.kind]) problems.push(`"${w?.kind}" is not a kind of water.`);
    else if ((w.pts?.length || 0) < (w.kind === 'pond' ? 3 : 2))
      problems.push(`A ${w.kind} needs ${w.kind === 'pond' ? 'three' : 'two'} points or more.`);
  return problems;
}
