// The town's street network as data: junctions where roads meet and the roads between them. The
// simulation's lanes, pavements, crossings and turns are worked out from it (buildStreetNetwork),
// so the Street Editor (editor/workspaces/street-editor) can change the layout and the traffic and
// pedestrians follow. With no saved changes the town is the original grid: six junctions across,
// five rows down, 48 m apart.
//
// A layout, in metres in the town's own coordinates (y is up, x east, z south):
//   { junctions: [{ id, x, z, control? }], roads: [{ a, b }] }
// `control` is 'signals' or 'none'; without it a junction has signals when three or more roads
// lead into it. Roads join two junctions by id, with a lane each way. data/street-layout.js holds
// the saved layouts: `town` (shared by every destination) and `locations[id]` (one destination's).
import STREET_LAYOUT from './data/street-layout.js';

export { STREET_LAYOUT };

// Pavement corners sit this far from a road's centre line, and lanes start this far back from a
// junction's centre; a lane runs this far to the side of the centre line.
export const PAVEMENT_OFFSET = 8;
export const STOP_BACK = 12;
export const LANE_OFFSET = 2.2;
const CARDINALS = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
];

// The original grid, in the order the simulation has always built it.
export function defaultStreetLayout() {
  const junctions = [],
    roads = [];
  for (let iz = -1; iz < 4; iz++)
    for (let ix = 0; ix < 6; ix++)
      junctions.push({ id: `${ix}:${iz}`, x: (ix - 1) * 48, z: (iz - 1) * 48 });
  for (const j of junctions)
    for (const [dx, dz] of [
      [1, 0],
      [0, 1],
    ]) {
      const k = junctions.find((k) => k.x === j.x + dx * 48 && k.z === j.z + dz * 48);
      if (k) roads.push({ a: j.id, b: k.id });
    }
  return { junctions, roads };
}

// The layout for a destination: its own saved layout, else the shared town's, else the grid.
export function streetLayoutFor(locationId, saved = STREET_LAYOUT) {
  return clone(saved?.locations?.[locationId] || saved?.town || defaultStreetLayout());
}
const clone = (value) => JSON.parse(JSON.stringify(value));

const unit = (x, z) => {
  const length = Math.hypot(x, z) || 1;
  return [x / length, z / length];
};
const angleOf = ([x, z]) => Math.atan2(z, x);
// A perpendicular to a direction, turned so it leans towards +x/+z: for an east-west road that is
// south, for a north-south road east. Pavement and corner sides are numbered along it.
function across([dx, dz]) {
  const p = [-dz, dx];
  return p[0] + p[1] < 0 || (p[0] + p[1] === 0 && p[0] < 0) ? [-p[0], -p[1]] : p;
}
const sign = (v) => (v > 1e-9 ? 1 : v < -1e-9 ? -1 : 0);

// The directions a junction's arms leave in: its roads, filled up to four with the compass
// directions no road is near, so pavements still turn the corner where a road ends.
function junctionArms(j, neighbours) {
  const arms = neighbours.map((k) => ({ dir: unit(k.x - j.x, k.z - j.z), to: k.id }));
  for (const dir of CARDINALS)
    if (!arms.some((a) => a.dir[0] * dir[0] + a.dir[1] * dir[1] > Math.SQRT1_2 - 1e-9))
      arms.push({ dir, to: null });
  return arms.sort((a, b) => angleOf(a.dir) - angleOf(b.dir));
}
// The pavement corner between two neighbouring arms: PAVEMENT_OFFSET from both road edges.
function cornerBetween(j, a, b) {
  let bx = a.dir[0] + b.dir[0],
    bz = a.dir[1] + b.dir[1];
  const sin = Math.abs(a.dir[0] * b.dir[1] - a.dir[1] * b.dir[0]);
  // Arms in a straight line (a road passing a dead end): the corner sits beside the road.
  if (Math.hypot(bx, bz) < 1e-6) [bx, bz] = [-a.dir[1], a.dir[0]];
  const scale = sin > 1e-6 ? PAVEMENT_OFFSET / sin : PAVEMENT_OFFSET / Math.hypot(bx, bz);
  return { x: j.x + bx * scale, z: j.z + bz * scale };
}

// A pavement corner by its grid id ('ix:iz/sx/sz'). Code that joins paths, driveways and doors to
// the pavement names the grid corner it was designed for; once the Street Editor has moved or
// removed that corner, the nearest corner to where it was meant to be stands in for it.
export function pavement(walks, id) {
  if (walks.nodes[id]) return id;
  const grid = id.match(/^(\d+):(-?\d+)\/(-?1)\/(-?1)$/);
  if (!grid) throw Error(`No pavement corner ${id}`);
  const [ix, iz, sx, sz] = grid.slice(1).map(Number),
    x = (ix - 1) * 48 + sx * PAVEMENT_OFFSET,
    z = (iz - 1) * 48 + sz * PAVEMENT_OFFSET;
  let best = null,
    nearest = Infinity;
  for (const node of Object.values(walks.nodes)) {
    if (!/^[^/]+\/-?\d+\/-?\d+(\/\d+)?$/.test(node.id)) continue;
    const d = Math.hypot(node.x - x, node.z - z);
    if (d < nearest) [best, nearest] = [node.id, d];
  }
  return best;
}
// Builds the network into the simulation's graphs: `roads` (vehicle lanes and turns) and `walks`
// (pavements and crossings). Ids keep the grid's original form: junction 'ix:iz', corner
// 'ix:iz/sx/sz' (the corner's side of the junction), crossing 'ix:iz/axis/side', lane
// 'a>b:out' → 'a>b:in'.
export function buildStreetNetwork(layout, { roads, walks, handedness = 1 }) {
  const junctions = layout.junctions.map((j) => ({
      id: j.id,
      x: j.x,
      z: j.z,
      signal: false,
      owner: null,
      ...(j.control ? { control: j.control } : {}),
    })),
    byId = Object.fromEntries(junctions.map((j) => [j.id, j])),
    roadList = layout.roads.filter((r) => byId[r.a] && byId[r.b] && r.a !== r.b),
    segments = [],
    crossings = [],
    corners = {},
    // What each lane node is (the nodes themselves stay plain { id, x, z }).
    laneInfo = [];
  // Corners and crossings round every junction.
  for (const j of junctions) {
    const neighbours = roadList
      .filter((r) => r.a === j.id || r.b === j.id)
      .map((r) => byId[r.a === j.id ? r.b : r.a]);
    const arms = junctionArms(j, neighbours);
    const cornerIds = arms.map((arm, i) => {
      const at = cornerBetween(j, arm, arms[(i + 1) % arms.length]);
      return { at, sx: sign(at.x - j.x), sz: sign(at.z - j.z), i };
    });
    // Made in the grid's original order: west corners before east, north before south.
    for (const c of [...cornerIds].sort((a, b) => a.sx - b.sx || a.sz - b.sz || a.i - b.i)) {
      c.id = `${j.id}/${c.sx}/${c.sz}`;
      if (walks.nodes[c.id]) c.id += `/${c.i}`;
      walks.node(c.id, c.at.x, c.at.z);
    }
    cornerIds.forEach((c, i) => (cornerIds[i] = c.id));
    corners[j.id] = arms.map((arm, i) => ({
      arm,
      // The corners either side of this arm, in the order of its `across` side (-1, then +1).
      sides: orderSides(
        arm.dir,
        cornerIds[(i - 1 + arms.length) % arms.length],
        cornerIds[i],
        walks,
      ),
    }));
    // In the grid's original order: across each north-south arm (axis x), then each east-west one
    // (axis z), north/west side before south/east.
    for (const side of [-1, 1])
      for (const axis of ['x', 'z']) {
        const want = axis === 'x' ? [0, side] : [side, 0],
          at = corners[j.id].reduce((best, c) =>
            c.arm.dir[0] * want[0] + c.arm.dir[1] * want[1] >
            best.arm.dir[0] * want[0] + best.arm.dir[1] * want[1]
              ? c
              : best,
          );
        const [a, b] = at.sides,
          crossing = {
            id: `${j.id}/${axis}/${side}`,
            junction: j.id,
            a,
            b,
            signal: false,
            occupants: new Set(),
          };
        crossings.push(crossing);
        walks.edge(a, b, { crossing });
        walks.edge(b, a, { crossing });
      }
  }
  // Each road: a lane each way, and a pavement along each side.
  for (const road of roadList) {
    const j = byId[road.a],
      k = byId[road.b];
    segments.push([j, k]);
    for (const [a, b] of [
      [j, k],
      [k, j],
    ]) {
      const [vx, vz] = unit(b.x - a.x, b.z - a.z),
        ox = -vz * LANE_OFFSET * handedness,
        oz = vx * LANE_OFFSET * handedness;
      const from = roads.node(
        `${a.id}>${b.id}:out`,
        a.x + vx * STOP_BACK + ox,
        a.z + vz * STOP_BACK + oz,
      );
      const to = roads.node(
        `${a.id}>${b.id}:in`,
        b.x - vx * STOP_BACK + ox,
        b.z - vz * STOP_BACK + oz,
      );
      laneInfo.push(
        { id: from, lane: 'out', from: a.id, to: b.id, dir: [vx, vz] },
        { id: to, lane: 'in', from: a.id, to: b.id, dir: [vx, vz] },
      );
      roads.edge(from, to, { axis: axisOf([vx, vz]), approach: b.id });
    }
    const atJ = corners[j.id].find((c) => c.arm.to === k.id).sides,
      atK = corners[k.id].find((c) => c.arm.to === j.id).sides,
      dir = unit(k.x - j.x, k.z - j.z),
      // atK's sides are numbered along the reverse direction's `across`; line them up with j's.
      flip =
        across(dir)[0] * across([-dir[0], -dir[1]])[0] +
          across(dir)[1] * across([-dir[0], -dir[1]])[1] <
        0;
    for (const s of [0, 1]) {
      const a = atJ[s],
        b = atK[flip ? 1 - s : s];
      walks.edge(a, b);
      walks.edge(b, a);
    }
  }
  // Turns through each junction, and which junctions have signals.
  const lanes = laneInfo.map((info) => ({ ...roads.nodes[info.id], ...info }));
  for (const j of junctions) {
    const incoming = lanes.filter((n) => n.lane === 'in' && n.to === j.id),
      outgoing = lanes.filter((n) => n.lane === 'out' && n.from === j.id);
    j.signal = j.control ? j.control === 'signals' : incoming.length >= 3;
    for (const crossing of crossings.filter((c) => c.junction === j.id)) crossing.signal = j.signal;
    for (const start of incoming)
      for (const end of outgoing) {
        // No U-turns back down the road a vehicle came along.
        if (start.from === end.to) continue;
        const axis = axisOf(start.dir),
          outAxis = axisOf(end.dir);
        const c1 = { x: start.x + start.dir[0] * 10, z: start.z + start.dir[1] * 10 },
          c2 = { x: end.x - end.dir[0] * 10, z: end.z - end.dir[1] * 10 };
        const points = Array.from({ length: 25 }, (_, i) => {
          const t = i / 24,
            u = 1 - t;
          return {
            x: u ** 3 * start.x + 3 * u ** 2 * t * c1.x + 3 * u * t ** 2 * c2.x + t ** 3 * end.x,
            z: u ** 3 * start.z + 3 * u ** 2 * t * c1.z + 3 * u * t ** 2 * c2.z + t ** 3 * end.z,
          };
        });
        const straight =
          start.dir[0] * end.dir[0] + start.dir[1] * end.dir[1] > Math.cos(Math.PI / 6);
        roads.edge(start.id, end.id, { junction: j.id, axis, turn: !straight, points });
      }
  }
  return { junctions, segments, crossings };
}
// A lane's signal phase: mostly east-west or mostly north-south.
const axisOf = ([dx, dz]) => (Math.abs(dx) >= Math.abs(dz) ? 'EW' : 'NS');
// Orders the two corners beside an arm by its `across` side: -1 first.
function orderSides(dir, a, b, walks) {
  const p = across(dir),
    side = (id) => walks.nodes[id].x * p[0] + walks.nodes[id].z * p[1];
  return side(a) <= side(b) ? [a, b] : [b, a];
}
