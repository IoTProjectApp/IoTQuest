// Hand-made changes to the house's shell: its walls and rooms, from the Map Editor's House tool,
// saved with a destination's other changes in data/world-layout.js (see world-layout.js) as
//   house: {
//     lines: { [line]: position },   // where an inner wall line stands (x or z, in metres)
//     walls: { [wall]: { height?, color?, openings?: [{ at, width }] } },
//     rooms: { [room]: { color? } },  // the floor's colour
//   }
// The house is a grid: wall lines across it (LINES) and walls along them, each from one line to
// another. Moving an inner line moves every wall on it, stretches the walls that end on it, and
// resizes the rooms either side, their floors with them. The outer lines stay put: the roof, the
// garden and the town are built around them. A wall's openings are its doorways, given as their
// middles along the wall; unchanged, they keep their place in the room as lines move. Furniture,
// windows and the household stay where they are (move them with the Select tool).
// With no `house` changes the house is exactly as built.
import { HOME_AREAS } from './home-areas.js';
import { toWorld } from './world-math.js';

// Each line: the axis it is measured on and where the code builds it.
export const LINES = {
  left: ['x', -13.1],
  'divider-left': ['x', -8.2],
  'divider-right': ['x', -3.4],
  right: ['x', 1.4],
  back: ['z', -11],
  middle: ['z', -6],
  front: ['z', -1],
};
// Lines that cannot move, and why.
export const LOCKED_LINES = {
  left: 'The outer walls hold the roof, the garden and the town in place.',
  right: 'The outer walls hold the roof, the garden and the town in place.',
  back: 'The outer walls hold the roof, the garden and the town in place.',
  front: 'The front wall faces the garden path and the town; it stays where it is.',
};
// Each room's cell: [left line, right line, back line, front line].
export const ROOMS = {
  Bedroom: ['left', 'divider-left', 'back', 'middle'],
  Bathroom: ['divider-left', 'divider-right', 'back', 'middle'],
  'Utility room': ['divider-right', 'right', 'back', 'middle'],
  'Living room': ['left', 'divider-left', 'middle', 'front'],
  Kitchen: ['divider-left', 'divider-right', 'middle', 'front'],
  Garage: ['divider-right', 'right', 'middle', 'front'],
};
// What a person calls each wall.
export const WALL_NAMES = {
  back: 'Back wall',
  'middle-left': 'Bedroom and living room wall',
  'middle-centre': 'Bathroom and kitchen wall',
  'middle-right': 'Utility room and garage wall',
  left: 'Left outer wall',
  right: 'Right outer wall',
  'divider-left': 'Left inner wall',
  'divider-right': 'Right inner wall',
  'front-left': 'Front wall, living room',
  'front-centre': 'Front wall, kitchen',
  'front-right': 'Front wall, garage',
};
export const LINE_NAMES = {
  left: 'the left outer wall',
  right: 'the right outer wall',
  back: 'the back wall',
  front: 'the front wall',
  'divider-left': 'the left inner wall',
  'divider-right': 'the right inner wall',
  middle: 'the middle wall',
};
export const LIMITS = {
  // Narrowest a room may be, so its furniture, devices and resident still fit.
  room: 2.5,
  height: [0.3, 2.5],
  opening: [0.8, 4],
  // How close an opening may come to a wall's end.
  end: 0.1,
};
const THICKNESS = 0.18;
const round3 = (v) => Math.round(v * 1000) / 1000;
// The axis a wall runs along: across its line's axis.
const runsAlong = (line) => (LINES[line][0] === 'z' ? 'x' : 'z');

// Where every line stands with `lines` (the saved positions) applied.
export function linePositions(lines = {}) {
  return Object.fromEntries(
    Object.entries(LINES).map(([id, [, at]]) => [id, Number.isFinite(lines[id]) ? lines[id] : at]),
  );
}
// A piecewise-linear map of one axis from where the lines were built to where they now stand:
// the outer lines are fixed, so everything outside the house maps to itself.
function warp(axis, positions) {
  const knots = Object.entries(LINES)
    .filter(([, [a]]) => a === axis)
    .map(([id, [, at]]) => [at, positions[id]])
    .sort((a, b) => a[0] - b[0]);
  // Lines where they were built: exactly as built, with no rounding.
  if (knots.every(([a, b]) => a === b)) return (v) => v;
  return (v) => {
    if (v <= knots[0][0]) return v - knots[0][0] + knots[0][1];
    for (let i = 1; i < knots.length; i++)
      if (v <= knots[i][0]) {
        const [a0, b0] = knots[i - 1],
          [a1, b1] = knots[i];
        if (a0 === b0 && a1 === b1) return v;
        return b0 + ((v - a0) * (b1 - b0)) / (a1 - a0);
      }
    const [a, b] = knots.at(-1);
    return v - a + b;
  };
}
export const warps = (positions) => ({ x: warp('x', positions), z: warp('z', positions) });

// The stretches of a wall between its openings, as [start, end] along it.
export function segments({ from, to, openings }) {
  const list = [];
  let start = from;
  for (const o of [...openings].sort((a, b) => a.at - b.at)) {
    list.push([start, o.at - o.width / 2]);
    start = o.at + o.width / 2;
  }
  list.push([start, to]);
  return list.filter(([a, b]) => b > a);
}

// The house as built, kept once on the shell: each wall's spec and parts, each room's parts.
function baseline(model) {
  const shell = model.shell;
  if (shell.base) return shell.base;
  const objects = new Set(model.objects),
    colliders = new Set(model.colliders),
    built = linePositions();
  const walls = shell.walls.map((wall) => ({
    wall,
    present:
      wall.parts.length > 0 &&
      wall.parts.every((p) => objects.has(p)) &&
      wall.colliders.every((c) => colliders.has(c)),
    parts: [...wall.parts],
    colliders: [...wall.colliders],
    spec: {
      at: built[wall.line],
      from: built[wall.fromLine],
      to: built[wall.toLine],
      openings: wall.openings.map((o) => ({ ...o })),
      height: wall.height,
      color: wall.parts[0]?.color,
    },
    // How a new part looks: as the built one does (a destination's wall colour, materials...).
    looks: (() => {
      const { shape, pos, size, rotation, color, editGroup, ...looks } = wall.parts[0] || {};
      return looks;
    })(),
  }));
  const rooms = shell.rooms.map((room) => {
    const entry = model.rooms.find(
      (r) => r[0] === room.id && r[1] === room.x && r[2] === room.z && !r[4],
    );
    return {
      room,
      present: room.parts.every((p) => objects.has(p)),
      parts: room.parts.map((p) => ({ pos: [...p.pos], size: [...p.size], color: p.color })),
      entry,
    };
  });
  // Every wall and room must be there for lines to move (some destinations rebuild the house).
  const whole = walls.every((w) => w.present) && rooms.every((r) => r.present);
  return (shell.base = { walls, rooms, whole });
}
// What the house tool can change in this model.
export function shellInfo(model) {
  if (!model.shell) return { walls: [], rooms: [], whole: false };
  const base = baseline(model);
  return {
    whole: base.whole,
    walls: base.walls.filter((w) => w.present).map((w) => w.wall.id),
    rooms: base.rooms.filter((r) => r.present).map((r) => r.room.id),
  };
}

// Every wall as `house` makes it: { id, line, at, from, to, openings, height, color }.
export function wallSpecs(model, house = {}) {
  const base = baseline(model),
    positions = linePositions(base.whole ? house?.lines : {}),
    w = warps(positions);
  return base.walls
    .filter((b) => b.present)
    .map(({ wall, spec }) => {
      const edit = house?.walls?.[wall.id] || {},
        along = w[runsAlong(wall.line)];
      return {
        id: wall.id,
        line: wall.line,
        fromLine: wall.fromLine,
        toLine: wall.toLine,
        axis: runsAlong(wall.line),
        at: positions[wall.line],
        from: positions[wall.fromLine],
        to: positions[wall.toLine],
        openings: edit.openings
          ? edit.openings.map((o) => ({ ...o }))
          : spec.openings.map((o) => ({ at: round3(along(o.at)), width: o.width })),
        height: edit.height ?? spec.height,
        color: edit.color ?? spec.color,
      };
    });
}
const sameSpec = (a, b) =>
  a.at === b.at &&
  a.from === b.from &&
  a.to === b.to &&
  a.height === b.height &&
  a.color === b.color &&
  JSON.stringify(a.openings) === JSON.stringify(b.openings);

// The problems with a set of house changes: { text, error, wall?, line?, room? }. An error leaves
// all of them out in the game.
export function checkHouse(model, house) {
  const problems = [],
    error = (text, extra = {}) => problems.push({ text, error: true, ...extra });
  if (!house || !model.shell) return problems;
  const base = baseline(model),
    info = shellInfo(model);
  for (const [line, at] of Object.entries(house.lines || {})) {
    if (!(line in LINES)) error(`There is no wall line "${line}".`, { line });
    else if (LOCKED_LINES[line]) error(LOCKED_LINES[line], { line });
    else if (!Number.isFinite(at))
      error(`Where ${LINE_NAMES[line]} stands is not a number.`, { line });
    else if (!base.whole)
      error('This city builds its own house, so its walls cannot move.', { line });
  }
  for (const id of Object.keys(house.walls || {}))
    if (!(id in WALL_NAMES)) error(`There is no wall "${id}".`, { wall: id });
    else if (!info.walls.includes(id))
      error(`This city's house has no ${WALL_NAMES[id].toLowerCase()}.`, { wall: id });
  for (const [id, room] of Object.entries(house.rooms || {}))
    if (!(id in ROOMS)) error(`There is no room "${id}".`, { room: id });
    else if (!info.rooms.includes(id))
      error(`This city's house has no ${id.toLowerCase()} floor.`, { room: id });
    else if (room.color !== undefined && !/^#[0-9a-f]{6}$/i.test(room.color))
      error(`The ${id.toLowerCase()} floor's colour is not a colour.`, { room: id });
  if (problems.length) return problems;

  // Rooms keep their size, and each room's quest spot stays inside it.
  const at = linePositions(base.whole ? house.lines : {});
  for (const [name, [l, r, b, f]] of base.whole ? Object.entries(ROOMS) : []) {
    if (at[r] - at[l] < LIMITS.room - 1e-9 || at[f] - at[b] < LIMITS.room - 1e-9)
      error(`The ${name.toLowerCase()} would be narrower than ${LIMITS.room} m.`, { room: name });
    const area = model.areaOverrides?.[name] || HOME_AREAS.find((a) => a[0] === name)?.slice(1);
    if (!area) continue;
    const [x, , z] = toWorld({ x: area[0], y: area[1] });
    if (x < at[l] + 0.3 || x > at[r] - 0.3 || z < at[b] + 0.3 || z > at[f] - 0.3)
      error(
        `The ${name.toLowerCase()}'s devices and resident stand at ${x.toFixed(1)}, ${z.toFixed(1)}, which would be outside it.`,
        { room: name },
      );
  }
  const specs = wallSpecs(model, house);
  for (const spec of specs) {
    const name = WALL_NAMES[spec.id],
      edit = house.walls?.[spec.id] || {};
    if (
      edit.height !== undefined &&
      !(edit.height >= LIMITS.height[0] && edit.height <= LIMITS.height[1])
    )
      error(`The ${name.toLowerCase()} must be ${LIMITS.height[0]}–${LIMITS.height[1]} m high.`, {
        wall: spec.id,
      });
    if (edit.color !== undefined && !/^#[0-9a-f]{6}$/i.test(edit.color))
      error(`The ${name.toLowerCase()}'s colour is not a colour.`, { wall: spec.id });
    const sorted = [...spec.openings].sort((a, b) => a.at - b.at);
    sorted.forEach((o, i) => {
      if (!Number.isFinite(o.at) || !Number.isFinite(o.width))
        return error(`A doorway in the ${name.toLowerCase()} is not a number.`, { wall: spec.id });
      if (o.width < LIMITS.opening[0] || o.width > LIMITS.opening[1])
        error(
          `Doorways in the ${name.toLowerCase()} must be ${LIMITS.opening[0]}–${LIMITS.opening[1]} m wide.`,
          { wall: spec.id },
        );
      if (o.at - o.width / 2 < spec.from + LIMITS.end || o.at + o.width / 2 > spec.to - LIMITS.end)
        error(`A doorway runs off the end of the ${name.toLowerCase()}.`, { wall: spec.id });
      if (i && sorted[i - 1].at + sorted[i - 1].width / 2 > o.at - o.width / 2)
        error(`Two doorways in the ${name.toLowerCase()} overlap.`, { wall: spec.id });
    });
  }
  // Every room can still be walked into from outside (where the house is the grid as built:
  // destinations that rebuild it lay out their own rooms).
  if (base.whole)
    for (const room of unreachable(specs, at))
      error(`Nobody could walk into the ${room.toLowerCase()}: it needs a doorway.`, { room });
  return problems;
}
// Rooms with no way in from outside through doorways.
function unreachable(specs, at) {
  const cellAt = (x, z) =>
    Object.keys(ROOMS).find((name) => {
      const [l, r, b, f] = ROOMS[name];
      return x > at[l] && x < at[r] && z > at[b] && z < at[f];
    }) || 'outside';
  const links = new Map();
  const link = (a, b) => {
    if (!links.has(a)) links.set(a, new Set());
    links.get(a).add(b);
  };
  for (const spec of specs)
    for (const o of spec.openings) {
      const sides =
        spec.axis === 'x'
          ? [cellAt(o.at, spec.at - 0.3), cellAt(o.at, spec.at + 0.3)]
          : [cellAt(spec.at - 0.3, o.at), cellAt(spec.at + 0.3, o.at)];
      link(sides[0], sides[1]);
      link(sides[1], sides[0]);
    }
  const reached = new Set(['outside']),
    queue = ['outside'];
  while (queue.length)
    for (const next of links.get(queue.shift()) || [])
      if (!reached.has(next)) reached.add(next) && queue.push(next);
  return Object.keys(ROOMS).filter((r) => !reached.has(r));
}

// Builds a wall's parts and colliders from its spec, looking like the built wall.
function buildWall(model, base, spec) {
  const parts = [],
    colliders = [],
    y = spec.height / 2 + 0.1;
  for (const [a, b] of segments(spec)) {
    const centre = (a + b) / 2,
      length = b - a,
      [pos, size, collider] =
        spec.axis === 'x'
          ? [
              [centre, y, spec.at],
              [length, spec.height, THICKNESS],
              { x: centre, z: spec.at, w: length, d: THICKNESS },
            ]
          : [
              [spec.at, y, centre],
              [THICKNESS, spec.height, length],
              { x: spec.at, z: centre, w: THICKNESS, d: length },
            ];
    const part = model.mesh('box', pos, size, spec.color, { ...base.looks });
    delete part.editGroup;
    parts.push(part);
    colliders.push(collider);
  }
  model.colliders.push(...colliders);
  return { parts, colliders };
}
// Takes parts out of the model's objects and colliders (in place: other code holds the lists).
function take(model, parts, colliders) {
  const gone = new Set(parts),
    goneColliders = new Set(colliders);
  model.objects.splice(0, model.objects.length, ...model.objects.filter((o) => !gone.has(o)));
  model.colliders.splice(
    0,
    model.colliders.length,
    ...model.colliders.filter((c) => !goneColliders.has(c)),
  );
}

// Makes the model's house as `house` says, from the house as built: so applying it again, or
// applying other changes (the editor does as you drag), always starts afresh. Returns the problems
// that kept the changes out, if any.
export function applyHouseShell(model, house) {
  if (!model.shell) return [];
  if (!house && !model.shell.base) return [];
  const problems = checkHouse(model, house),
    errors = problems.filter((p) => p.error);
  if (errors.length) house = null;
  const base = baseline(model),
    specs = new Map(wallSpecs(model, house || {}).map((s) => [s.id, s]));
  for (const b of base.walls) {
    if (!b.present) continue;
    const spec = specs.get(b.wall.id),
      current = b.wall;
    if (sameSpec(spec, b.spec)) {
      // As built: the original parts.
      if (current.built) {
        take(model, current.parts, current.colliders);
        model.objects.push(...b.parts);
        model.colliders.push(...b.colliders);
        current.parts = [...b.parts];
        current.colliders = [...b.colliders];
        delete current.built;
      }
      continue;
    }
    if (current.built && sameSpec(current.built, spec)) continue;
    take(model, current.parts, current.colliders);
    Object.assign(current, buildWall(model, b, spec), { built: spec });
  }
  // Floors follow their walls.
  const w = warps(linePositions(base.whole ? house?.lines : {}));
  for (const b of base.rooms) {
    if (!b.present) continue;
    const colour = house?.rooms?.[b.room.id]?.color;
    b.room.parts.forEach((part, i) => {
      const o = b.parts[i];
      for (const [axis, k] of [
        ['x', 0],
        ['z', 2],
      ]) {
        const lo = o.pos[k] - o.size[k] / 2,
          hi = o.pos[k] + o.size[k] / 2,
          [to, ho] = [w[axis](lo), w[axis](hi)],
          same = to === lo && ho === hi;
        part.pos[k] = same ? o.pos[k] : (to + ho) / 2;
        part.size[k] = same ? o.size[k] : ho - to;
      }
      part.color = i === 0 && colour ? colour : o.color;
    });
    // Where the game finds the room: its middle and, once resized, its size.
    if (b.entry) {
      const { x, z } = b.room,
        moved = w.x(x) !== x || w.z(z) !== z,
        size = [w.x(x + 2.29) - w.x(x - 2.29), w.z(z + 2.4) - w.z(z - 2.4)],
        resized = Math.abs(size[0] - 4.58) > 1e-9 || Math.abs(size[1] - 4.8) > 1e-9;
      b.entry[1] = moved ? (w.x(x - 2.29) + w.x(x + 2.29)) / 2 : x;
      b.entry[2] = moved ? (w.z(z - 2.4) + w.z(z + 2.4)) / 2 : z;
      if (resized) b.entry[4] = size;
      else b.entry.splice(4);
      if (model.dynamic?.[b.room.id]) model.dynamic[b.room.id] = { x: b.entry[1], z: b.entry[2] };
    }
  }
  return errors;
}

// Furniture now standing in a wall: { group, wall } for each, to point out in the editor.
export function furnitureInWalls(model) {
  if (!model.shell) return [];
  const walls = model.shell.walls.filter((w) => w.built),
    found = [];
  const overlaps = (a, b) =>
    Math.abs(a.x - b.x) < (a.w + b.w) / 2 - 0.02 && Math.abs(a.z - b.z) < (a.d + b.d) / 2 - 0.02;
  for (const c of model.colliders) {
    // Anything movable standing inside the house (the walls themselves are not edit groups).
    if (!c.editGroup || c.x < -13.1 || c.x > 1.4 || c.z < -11 || c.z > -1) continue;
    const wall = walls.find((w) => w.colliders.some((wc) => overlaps(c, wc)));
    if (wall && !found.some((f) => f.group === c.editGroup))
      found.push({ group: c.editGroup, wall: wall.id });
  }
  return found;
}
