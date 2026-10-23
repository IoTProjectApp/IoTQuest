// Walls added by hand in the Map Editor (its House tool, Walls), inside the house or out in the
// garden, saved with a destination's other changes in data/world-layout.js as
//   walls: [{ id, from: [x, z], to: [x, z], height, thickness, color,
//             openings: [{ at, width, kind: 'door' | 'window' }] }]
// A wall runs straight from `from` to `to` (metres, at any angle); `at` is an opening's middle,
// measured along the wall from `from`. A doorway is a gap the full height; a window leaves a sill
// below and, on a tall wall, a lintel above, with glass between. Walls get colliders (exact when
// square to the axes, a row of small squares when at an angle). A wall must leave every room and
// garden area of the home reachable from the garden and its quest spot clear, and may not cross a
// road or the driveway; changes that break this are left out (and reported). With no walls the
// world is exactly as built.
import { HOME_AREAS } from './home-areas.js';
import { toWorld } from './world-math.js';

export const WALL_LIMITS = {
  length: [0.3, 60],
  height: [0.2, 4],
  thickness: [0.05, 1],
  opening: [0.6, 4],
  // Closest an opening may come to a wall's end.
  end: 0.1,
  // A window needs a wall at least this high.
  window: 1.2,
};
export const WALL_DEFAULTS = { height: 1.1, thickness: 0.18, color: '#eadbbf' };
// Where a person must be able to walk, and how near a wall may come to a quest spot.
const CLEARANCE = 0.25,
  SPOT_CLEARANCE = 0.4,
  CELL = 0.2;
const isColour = (c) => typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c);
const pair = (p) => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite);

// A wall's line: its length, direction and turn (as meshes take it).
export function wallLine({ from, to }) {
  const dx = to[0] - from[0],
    dz = to[1] - from[1],
    length = Math.hypot(dx, dz);
  return { length, dir: [dx / length, dz / length], turn: -Math.atan2(dz, dx) };
}
// The stretches between openings, as [start, end, opening?] along the wall: an opening's own
// stretch carries it.
function stretches(wall, length) {
  const list = [];
  let start = 0;
  for (const o of [...(wall.openings || [])].sort((a, b) => a.at - b.at)) {
    list.push([start, o.at - o.width / 2]);
    list.push([o.at - o.width / 2, o.at + o.width / 2, o]);
    start = o.at + o.width / 2;
  }
  list.push([start, length]);
  return list.filter(([a, b]) => b > a + 1e-6);
}
const sill = (height) => Math.min(0.9, height * 0.45);
const head = (height) => Math.min(height, Math.max(sill(height) + 0.8, 2.1));

// A wall's parts (as mesh specs) and colliders, from its saved form.
export function wallPieces(wall) {
  const { length, dir, turn } = wallLine(wall),
    { height, thickness, color } = { ...WALL_DEFAULTS, ...wall },
    at = (s) => [wall.from[0] + dir[0] * s, wall.from[1] + dir[1] * s],
    parts = [],
    solid = [];
  const piece = (a, b, y0, y1, colour = color, extra = {}) => {
    if (y1 - y0 < 1e-3) return;
    const [x, z] = at((a + b) / 2);
    parts.push({
      shape: 'box',
      pos: [x, (y0 + y1) / 2 + 0.1, z],
      size: [b - a, y1 - y0, thickness],
      color: colour,
      rotation: [0, turn, 0],
      extra,
    });
  };
  for (const [a, b, opening] of stretches(wall, length)) {
    if (!opening) {
      piece(a, b, 0, height);
      solid.push([a, b]);
    } else if (opening.kind === 'window') {
      piece(a, b, 0, sill(height));
      piece(a, b, head(height), height);
      piece(a, b, sill(height), head(height), '#a9c6cc', { opacity: 0.35, roughness: 0.15 });
      solid.push([a, b]);
    }
  }
  // Colliders: one rectangle per solid stretch when the wall is square to the axes, otherwise a
  // row of small squares along it.
  const colliders = [];
  const square = Math.abs(dir[0]) < 1e-9 || Math.abs(dir[1]) < 1e-9;
  for (const [a, b] of solid) {
    if (square) {
      const [x, z] = at((a + b) / 2),
        long = b - a;
      colliders.push(
        Math.abs(dir[0]) > 0.5 ? { x, z, w: long, d: thickness } : { x, z, w: thickness, d: long },
      );
      continue;
    }
    const side = Math.max(thickness, 0.3),
      count = Math.max(1, Math.ceil((b - a) / (side * 0.7)));
    for (let i = 0; i < count; i++) {
      const [x, z] = at(a + ((i + 0.5) * (b - a)) / count);
      colliders.push({ x, z, w: side, d: side });
    }
  }
  return { parts, colliders };
}

// Where the home's quest areas are: [name, x, z].
function questSpots(model) {
  return HOME_AREAS.map(([name, ...at]) => {
    const [px, py] = model.areaOverrides?.[name] || at,
      [x, , z] = toWorld({ x: px, y: py });
    return [name, x, z];
  });
}
// Does segment p→q pass through the box (expanded by `pad`)? (Liang–Barsky on x and z.)
function crosses(p, q, min, max, pad) {
  let t0 = 0,
    t1 = 1;
  const d = [q[0] - p[0], q[1] - p[1]];
  for (const [i, lo, hi] of [
    [0, min[0] - pad, max[0] + pad],
    [1, min[2] - pad, max[2] + pad],
  ]) {
    if (Math.abs(d[i]) < 1e-12) {
      if (p[i] < lo || p[i] > hi) return false;
      continue;
    }
    let a = (lo - p[i]) / d[i],
      b = (hi - p[i]) / d[i];
    if (a > b) [a, b] = [b, a];
    t0 = Math.max(t0, a);
    t1 = Math.min(t1, b);
    if (t0 > t1) return false;
  }
  return true;
}
// A mesh's box on the ground plan, as it is turned.
function planBox(m) {
  const turn = m.rotation?.[1] || 0,
    c = Math.abs(Math.cos(turn)),
    s = Math.abs(Math.sin(turn)),
    hx = (m.size[0] * c + m.size[2] * s) / 2,
    hz = (m.size[0] * s + m.size[2] * c) / 2;
  return { min: [m.pos[0] - hx, 0, m.pos[2] - hz], max: [m.pos[0] + hx, 0, m.pos[2] + hz] };
}
// The quest areas a set of walls cuts off from the garden, by flood fill over a grid of the
// house and garden: walls block a strip CLEARANCE wide each side.
export function cutOff(model, colliders) {
  const spots = questSpots(model),
    xs = [...spots.map((s) => s[1]), ...colliders.map((c) => c.x)],
    zs = [...spots.map((s) => s[2]), ...colliders.map((c) => c.z)],
    x0 = Math.min(...xs) - 4,
    z0 = Math.min(...zs) - 4,
    nx = Math.ceil((Math.max(...xs) + 4 - x0) / CELL),
    nz = Math.ceil((Math.max(...zs) + 4 - z0) / CELL),
    blocked = new Uint8Array(nx * nz);
  for (const c of colliders) {
    const lx = Math.max(0, Math.floor((c.x - c.w / 2 - CLEARANCE - x0) / CELL)),
      hx = Math.min(nx - 1, Math.floor((c.x + c.w / 2 + CLEARANCE - x0) / CELL)),
      lz = Math.max(0, Math.floor((c.z - c.d / 2 - CLEARANCE - z0) / CELL)),
      hz = Math.min(nz - 1, Math.floor((c.z + c.d / 2 + CLEARANCE - z0) / CELL));
    for (let i = lx; i <= hx; i++) for (let j = lz; j <= hz; j++) blocked[j * nx + i] = 1;
  }
  // From the grid's edge (the open garden), everywhere a person can walk.
  const seen = new Uint8Array(nx * nz),
    queue = [];
  for (let i = 0; i < nx; i++)
    for (const j of [0, nz - 1]) if (!blocked[j * nx + i]) queue.push(j * nx + i);
  for (const k of queue) seen[k] = 1;
  while (queue.length) {
    const k = queue.pop(),
      i = k % nx,
      j = (k - i) / nx;
    for (const [a, b] of [
      [i + 1, j],
      [i - 1, j],
      [i, j + 1],
      [i, j - 1],
    ]) {
      if (a < 0 || b < 0 || a >= nx || b >= nz) continue;
      const n = b * nx + a;
      if (!seen[n] && !blocked[n]) {
        seen[n] = 1;
        queue.push(n);
      }
    }
  }
  // A spot counts as reached if a cell within half a metre of it is.
  return spots
    .filter(([, x, z]) => {
      const ci = Math.round((x - x0) / CELL),
        cj = Math.round((z - z0) / CELL);
      for (let di = -2; di <= 2; di++)
        for (let dj = -2; dj <= 2; dj++) {
          const a = ci + di,
            b = cj + dj;
          if (a >= 0 && b >= 0 && a < nx && b < nz && seen[b * nx + a]) return false;
        }
      return true;
    })
    .map(([name]) => name);
}

// The problems with a set of added walls in a model: { text, error, wall? }. Errors leave the
// walls out in the game.
export function checkWalls(model, walls = []) {
  const problems = [],
    error = (text, wall) => problems.push({ text, error: true, wall }),
    warn = (text, wall) => problems.push({ text, error: false, wall });
  if (!Array.isArray(walls)) return [{ text: 'The added walls are not a list.', error: true }];
  const ids = new Set();
  walls.forEach((wall, i) => {
    const id = wall?.id,
      name = `Wall ${i + 1}`;
    if (typeof id !== 'string' || !id) return error(`${name} has no id.`, id);
    if (ids.has(id)) error(`Two walls are called "${id}".`, id);
    ids.add(id);
    if (!pair(wall.from) || !pair(wall.to)) return error(`${name}'s ends are not places.`, id);
    const { length } = wallLine(wall),
      w = { ...WALL_DEFAULTS, ...wall };
    const range = (v, [lo, hi], what, unit = 'm') =>
      !(Number.isFinite(v) && v >= lo - 1e-9 && v <= hi + 1e-9) &&
      error(`${name}'s ${what} must be ${lo}–${hi} ${unit}.`, id);
    range(length, WALL_LIMITS.length, 'length');
    range(w.height, WALL_LIMITS.height, 'height');
    range(w.thickness, WALL_LIMITS.thickness, 'thickness');
    if (!isColour(w.color)) error(`${name}'s colour is not a colour.`, id);
    const openings = [...(wall.openings || [])].sort((a, b) => a.at - b.at);
    openings.forEach((o, k) => {
      if (!Number.isFinite(o?.at) || !Number.isFinite(o?.width))
        return error(`An opening in ${name.toLowerCase()} is not a number.`, id);
      if (!['door', 'window', undefined].includes(o.kind))
        error(`An opening in ${name.toLowerCase()} is neither a door nor a window.`, id);
      range(o.width, WALL_LIMITS.opening, 'openings');
      if (
        o.at - o.width / 2 < WALL_LIMITS.end - 1e-9 ||
        o.at + o.width / 2 > length - WALL_LIMITS.end + 1e-9
      )
        error(`An opening runs off the end of ${name.toLowerCase()}.`, id);
      if (k && openings[k - 1].at + openings[k - 1].width / 2 > o.at - o.width / 2 + 1e-9)
        error(`Two openings in ${name.toLowerCase()} overlap.`, id);
      if (o.kind === 'window' && w.height < WALL_LIMITS.window)
        error(`${name} is too low for a window (it needs ${WALL_LIMITS.window} m).`, id);
    });
  });
  if (problems.some((p) => p.error)) return problems;
  // Roads and the driveway stay clear; the quest spots too.
  const kept = model.objects.filter((m) => ['street', 'traffic', 'driveway'].includes(m.editLock));
  const boxes = kept.map(planBox),
    spots = questSpots(model);
  walls.forEach((wall, i) => {
    const t = { ...WALL_DEFAULTS, ...wall }.thickness / 2;
    if (boxes.some((b) => crosses(wall.from, wall.to, b.min, b.max, t)))
      error(`Wall ${i + 1} crosses a road or the driveway.`, wall.id);
    for (const [name, x, z] of spots)
      if (crosses(wall.from, wall.to, [x, 0, z], [x, 0, z], t + SPOT_CLEARANCE))
        error(
          `Wall ${i + 1} stands on the ${name.toLowerCase()}'s quest spot, where its devices and resident go.`,
          wall.id,
        );
    // Furniture in its way stays where it is: worth a look.
    const inWay = new Set();
    for (const c of model.colliders)
      if (
        c.editGroup &&
        !c.addedWall &&
        crosses(
          wall.from,
          wall.to,
          [c.x - c.w / 2, 0, c.z - c.d / 2],
          [c.x + c.w / 2, 0, c.z + c.d / 2],
          t,
        )
      )
        inWay.add(c.editGroup);
    if (inWay.size)
      warn(
        `Wall ${i + 1} runs through ${[...inWay].slice(0, 3).join(', ')}${inWay.size > 3 ? '…' : ''}.`,
        wall.id,
      );
  });
  if (problems.some((p) => p.error)) return problems;
  // Every quest area can still be walked to from the garden, past the house's walls and these.
  const houseWalls = (model.shell?.walls || []).flatMap((w) => w.colliders),
    added = walls.flatMap((w) => wallPieces(w).colliders),
    before = new Set(cutOff(model, houseWalls));
  for (const name of cutOff(model, [...houseWalls, ...added]))
    if (!before.has(name))
      error(`Nobody could walk to the ${name.toLowerCase()} any more: leave a way in.`);
  return problems;
}

// Builds the walls into the model, replacing any built before (the editor applies them again as
// they change). Walls with problems are all left out; their problems are returned. `check: false`
// builds them as they are (the editor's preview while a wall is drawn or dragged).
export function applyAddedWalls(model, walls, { check = true } = {}) {
  for (const built of model.addedWalls || []) {
    const parts = new Set(built.parts),
      colliders = new Set(built.colliders);
    model.objects.splice(0, model.objects.length, ...model.objects.filter((m) => !parts.has(m)));
    model.colliders.splice(
      0,
      model.colliders.length,
      ...model.colliders.filter((c) => !colliders.has(c)),
    );
  }
  model.addedWalls = [];
  if (!walls?.length) return [];
  const errors = check ? checkWalls(model, walls).filter((p) => p.error) : [];
  if (errors.length) return errors;
  for (const wall of walls) {
    if (!check && !(wallLine(wall).length > 1e-3)) continue;
    const { parts, colliders } = wallPieces(wall);
    const meshes = parts.map(({ shape, pos, size, color, rotation, extra }) =>
      model.mesh(shape, pos, size, color, {
        rotation,
        addedWall: wall.id,
        editLock: 'wall',
        architectureMesh: true,
        ...extra,
      }),
    );
    for (const m of meshes) delete m.editGroup;
    const tagged = colliders.map((c) => ({ ...c, addedWall: wall.id }));
    model.colliders.push(...tagged);
    model.addedWalls.push({ id: wall.id, parts: meshes, colliders: tagged });
  }
  return [];
}
