// The town's street network as data: junctions where roads meet and the roads between them. The
// simulation's lanes, pavements, crossings and turns are worked out from it (buildStreetNetwork),
// so the Street Editor (editor/workspaces/street-editor) can change the layout and the traffic and
// pedestrians follow. With no saved changes the town is the original grid: six junctions across,
// five rows down, 48 m apart.
//
// A layout, in metres in the town's own coordinates (y is up, x east, z south):
//   { junctions: [{ id, x, z, control?, closedCrossings? }], roads: [{ a, b, lanes?, bend? }] }
// `control` is 'signals', 'stop' (every arm stops, then goes when clear), 'giveway' (slow, go
// when clear), 'roundabout' (a circle round a central island, entered when it is clear) or 'none';
// without it a junction has signals when three or more roads lead into it.
// `closedCrossings` lists the neighbouring junctions whose road has no zebra crossing here.
// Roads join two junctions by id, with a lane each way, or two each way with `lanes: 2` (a wider
// road). `bend: { x, z }` curves a road smoothly through that point, halfway along it.
// data/street-layout.js holds the saved layouts: `town` (shared by every destination) and
// `locations[id]` (one destination's).
import STREET_LAYOUT from './data/street-layout.js';

export { STREET_LAYOUT };

// Pavement corners sit this far from a road's centre line, and lanes start this far back from a
// junction's centre; a lane runs this far to the side of the centre line.
export const PAVEMENT_OFFSET = 8;
export const STOP_BACK = 12;
export const LANE_OFFSET = 2.2;
export const CONTROLS = ['signals', 'stop', 'giveway', 'roundabout', 'none'];
// A second lane runs this far outside the first.
export const LANE_SPACING = 3.2;
// Each road's size by its lanes each way: the asphalt and verge widths, and how far out its
// pavements are.
export const ROAD_SIZES = {
  1: { asphalt: 12, verge: 17, pavement: PAVEMENT_OFFSET },
  2: { asphalt: 18, verge: 23, pavement: 11 },
};
export const laneCount = (road) => (road?.lanes === 2 ? 2 : 1);
export const roadSize = (road) => ROAD_SIZES[laneCount(road)];
// A roundabout: its island's radius, the circle its traffic drives round, and its asphalt's.
export const ROUNDABOUT = { island: 4, lane: 6.5, apron: 10.5 };

// The centre line of a road from junction a to junction b: straight, or with a `bend`, a curve
// through that point halfway along (a quadratic curve whose control point puts it there).
export function roadLine(a, b, road = null, pieces = 24) {
  if (!road?.bend)
    return [
      { x: a.x, z: a.z },
      { x: b.x, z: b.z },
    ];
  const c = bendControl(a, b, road.bend);
  return Array.from({ length: pieces + 1 }, (_, i) => {
    const t = i / pieces,
      u = 1 - t;
    return {
      x: u * u * a.x + 2 * u * t * c.x + t * t * b.x,
      z: u * u * a.z + 2 * u * t * c.z + t * t * b.z,
    };
  });
}
export const bendControl = (a, b, bend) => ({
  x: 2 * bend.x - (a.x + b.x) / 2,
  z: 2 * bend.z - (a.z + b.z) / 2,
});
// The direction a road leaves junction j in: towards the other end, or along its curve.
export function roadDirection(j, k, road = null) {
  const to = road?.bend ? bendControl(j, k, road.bend) : k;
  return unit(to.x - j.x, to.z - j.z);
}
// A line as straight pieces: each one's middle, direction and length, for drawing along it.
export const linePieces = (points) =>
  points.slice(1).map((b, i) => {
    const a = points[i],
      length = Math.hypot(b.x - a.x, b.z - a.z);
    return { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2, dir: unit(b.x - a.x, b.z - a.z), length };
  });
export const lineLength = (points) =>
  points.slice(1).reduce((sum, p, i) => sum + Math.hypot(p.x - points[i].x, p.z - points[i].z), 0);
// The part of a line between `from` and `to` metres along it, and the direction at each end.
export function linePart(points, from, to) {
  const at = (d) => {
    let left = d;
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1],
        b = points[i],
        length = Math.hypot(b.x - a.x, b.z - a.z);
      if (left <= length || i === points.length - 1) {
        const t = length ? Math.min(1, left / length) : 0;
        return {
          x: a.x + (b.x - a.x) * t,
          z: a.z + (b.z - a.z) * t,
          i,
          dir: unit(b.x - a.x, b.z - a.z),
        };
      }
      left -= length;
    }
  };
  const start = at(from),
    end = at(to),
    out = [start];
  for (let i = start.i; i < end.i; i++) out.push(points[i]);
  out.push(end);
  return { points: out.map(({ x, z }) => ({ x, z })), startDir: start.dir, endDir: end.dir };
}
// A line moved `offset` metres to its side: to the right of its direction for a positive offset
// (x east, z south), as lanes in right-hand traffic are.
export function offsetLine(points, offset) {
  return points.map((p, i) => {
    const a = points[Math.max(0, i - 1)],
      b = points[Math.min(points.length - 1, i + 1)],
      [vx, vz] = unit(b.x - a.x, b.z - a.z);
    return { x: p.x - vz * offset, z: p.z + vx * offset };
  });
}
// What other code depends on, which the Street Editor therefore keeps in place (with the reason it
// shows): junctions that cannot move or be removed, and roads that cannot be removed ('a|b').
const STATIONS =
  'The police and fire stations' + "' driveways meet the street through this junction";
export const LOCKED = {
  junctions: {
    '1:1': "Students' traffic-light programs run this junction, beside the road-control station",
    '1:2': 'The loading yard joins the road between 1:2 and 2:2',
    '2:2': 'The loading yard joins the road between 1:2 and 2:2',
    '0:1': "The farms' driveway and the home's footpath join the street here",
    '0:2': "The farms' driveway joins the road between 0:1 and 0:2",
    '3:0': STATIONS,
    '3:1': STATIONS,
    '3:2': STATIONS,
  },
  roads: {
    '1:2|2:2': 'The loading yard joins this road',
    '0:1|0:2': "The farms' driveway joins this road",
    '3:0|3:1': 'The police and fire stations open onto this road',
    '3:1|3:2': 'The police and fire stations open onto this road',
  },
};
// Why a road cannot be removed, or null.
export const lockedRoad = (a, b) => LOCKED.roads[`${a}|${b}`] || LOCKED.roads[`${b}|${a}`] || null;
// A piece drawn along a road (or a crossing) in direction `dir`: its size and turn, with `length`
// along the road and `width` across it. Roads running exactly east-west or north-south get the
// same unturned sizes the town has always been drawn with.
export function alongRoad([dx, dz], length, height, width) {
  if (Math.abs(dz) < 1e-9) return { size: [length, height, width], rotation: [0, 0, 0] };
  if (Math.abs(dx) < 1e-9) return { size: [width, height, length], rotation: [0, 0, 0] };
  return { size: [length, height, width], rotation: [0, Math.atan2(-dz, dx), 0] };
}
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
export function acrossRoad([dx, dz]) {
  const p = [-dz, dx];
  return p[0] + p[1] < 0 || (p[0] + p[1] === 0 && p[0] < 0) ? [-p[0], -p[1]] : p;
}
const sign = (v) => (v > 1e-9 ? 1 : v < -1e-9 ? -1 : 0);

// The directions a junction's arms leave in: its roads, filled up to four with the compass
// directions no road is near, so pavements still turn the corner where a road ends. Each arm's
// pavement is as far out as its road is wide.
function junctionArms(j, neighbours) {
  const arms = neighbours.map(({ k, road }) => ({
    dir: roadDirection(j, k, road),
    to: k.id,
    pavement: roadSize(road).pavement,
  }));
  for (const dir of CARDINALS)
    if (!arms.some((a) => a.dir[0] * dir[0] + a.dir[1] * dir[1] > Math.SQRT1_2 - 1e-9))
      arms.push({ dir, to: null, pavement: PAVEMENT_OFFSET });
  return arms.sort((a, b) => angleOf(a.dir) - angleOf(b.dir));
}
// The pavement corner between two neighbouring arms: each road's pavement distance from its
// centre line.
function cornerBetween(j, a, b) {
  let bx = a.dir[0] + b.dir[0],
    bz = a.dir[1] + b.dir[1];
  const sin = Math.abs(a.dir[0] * b.dir[1] - a.dir[1] * b.dir[0]);
  // Arms in a straight line (a road passing a dead end): the corner sits beside the road.
  if (Math.hypot(bx, bz) < 1e-6) [bx, bz] = [-a.dir[1], a.dir[0]];
  // Roads of different widths: the point that far from both centre lines.
  if (a.pavement !== b.pavement && sin > 1e-6)
    return {
      x: j.x + (b.pavement * a.dir[0] + a.pavement * b.dir[0]) / sin,
      z: j.z + (b.pavement * a.dir[1] + a.pavement * b.dir[1]) / sin,
    };
  const offset = Math.max(a.pavement, b.pavement),
    scale = sin > 1e-6 ? offset / sin : offset / Math.hypot(bx, bz);
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
      ...(j.closedCrossings?.length ? { closedCrossings: j.closedCrossings } : {}),
    })),
    byId = Object.fromEntries(junctions.map((j) => [j.id, j])),
    roadList = layout.roads.filter((r) => byId[r.a] && byId[r.b] && r.a !== r.b),
    segments = [],
    crossings = [],
    corners = {},
    // What each lane node is (the nodes themselves stay plain { id, x, z }).
    laneInfo = [],
    // Each junction's signal phase for traffic arriving from each neighbour: 'EW' or 'NS'.
    phases = {};
  // Corners and crossings round every junction.
  for (const j of junctions) {
    const neighbours = roadList
      .filter((r) => r.a === j.id || r.b === j.id)
      .map((road) => ({ k: byId[road.a === j.id ? road.b : road.a], road }));
    const arms = junctionArms(j, neighbours);
    const signalled = j.control ? j.control === 'signals' : neighbours.length >= 3;
    phases[j.id] = armPhases(
      arms.filter((a) => a.to),
      signalled,
    );
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
        // A crossing the Street Editor closed: pedestrians go round by the other crossings.
        if (at.arm.to && j.closedCrossings?.includes(at.arm.to)) continue;
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
  // Each road: a lane each way (or two, the second 'a>b:out:2' → 'a>b:in:2'), and a pavement
  // along each side.
  for (const road of roadList) {
    const j = byId[road.a],
      k = byId[road.b],
      line = roadLine(j, k, road),
      segment = [j, k];
    // What the town draws: a road's lanes and, for a curved road, its centre line.
    if (road.lanes === 2) segment.lanes = 2;
    if (road.bend) segment.line = line;
    segments.push(segment);
    for (const [a, b, centre] of [
      [j, k, line],
      [k, j, [...line].reverse()],
    ])
      for (let n = 0; n < laneCount(road); n++) {
        const offset = (LANE_OFFSET + n * LANE_SPACING) * handedness,
          suffix = n ? ':' + (n + 1) : '',
          from = `${a.id}>${b.id}:out${suffix}`,
          to = `${a.id}>${b.id}:in${suffix}`,
          approach = { axis: phases[b.id][a.id], approach: b.id };
        if (!road.bend) {
          const [vx, vz] = unit(b.x - a.x, b.z - a.z),
            ox = -vz * offset,
            oz = vx * offset;
          roads.node(from, a.x + vx * STOP_BACK + ox, a.z + vz * STOP_BACK + oz);
          roads.node(to, b.x - vx * STOP_BACK + ox, b.z - vz * STOP_BACK + oz);
          laneInfo.push(
            { id: from, lane: 'out', from: a.id, to: b.id, dir: [vx, vz] },
            { id: to, lane: 'in', from: a.id, to: b.id, dir: [vx, vz] },
          );
          roads.edge(from, to, approach);
          continue;
        }
        // A curved road: its lanes follow the curve, with the stop lines as far back as on a
        // straight one.
        const part = linePart(centre, STOP_BACK, lineLength(centre) - STOP_BACK),
          points = offsetLine(part.points, offset);
        roads.node(from, points[0].x, points[0].z);
        roads.node(to, points.at(-1).x, points.at(-1).z);
        laneInfo.push(
          { id: from, lane: 'out', from: a.id, to: b.id, dir: part.startDir },
          { id: to, lane: 'in', from: a.id, to: b.id, dir: part.endDir },
        );
        roads.edge(from, to, {
          ...approach,
          points: [roads.nodes[from], ...points.slice(1, -1), roads.nodes[to]],
        });
      }
    const atJ = corners[j.id].find((c) => c.arm.to === k.id).sides,
      atK = corners[k.id].find((c) => c.arm.to === j.id).sides,
      dir = unit(k.x - j.x, k.z - j.z),
      // atK's sides are numbered along the reverse direction's `across`; line them up with j's.
      flip =
        acrossRoad(dir)[0] * acrossRoad([-dir[0], -dir[1]])[0] +
          acrossRoad(dir)[1] * acrossRoad([-dir[0], -dir[1]])[1] <
        0;
    for (const s of [0, 1]) {
      const a = atJ[s],
        b = atK[flip ? 1 - s : s];
      if (!road.bend) {
        walks.edge(a, b);
        walks.edge(b, a);
        continue;
      }
      // Along a curved road the pavement follows the curve, on the side its corners are.
      const p = walks.nodes[a],
        t0 = roadDirection(j, k, road),
        side = Math.sign(t0[0] * (p.z - j.z) - t0[1] * (p.x - j.x)) || 1,
        length = lineLength(line),
        reach = roadSize(road).pavement + 2,
        middle = offsetLine(line, side * roadSize(road).pavement).filter((_, i, all) => {
          const along = (i / (all.length - 1)) * length;
          return along > reach && along < length - reach;
        }),
        points = [walks.nodes[a], ...middle, walks.nodes[b]];
      walks.edge(a, b, { points });
      walks.edge(b, a, { points: [...points].reverse() });
    }
  }
  // Turns through each junction, and which junctions have signals.
  const lanes = laneInfo.map((info) => ({ ...roads.nodes[info.id], ...info }));
  for (const j of junctions) {
    const incoming = lanes.filter((n) => n.lane === 'in' && n.to === j.id),
      outgoing = lanes.filter((n) => n.lane === 'out' && n.from === j.id);
    j.signal = j.control ? j.control === 'signals' : incoming.length >= 3;
    if (j.control === 'stop' || j.control === 'giveway') j.priority = j.control;
    // A roundabout: traffic gives way to whoever is on the circle, then drives round it.
    if (j.control === 'roundabout') {
      j.priority = 'giveway';
      j.roundabout = true;
    }
    for (const crossing of crossings.filter((c) => c.junction === j.id)) crossing.signal = j.signal;
    for (const start of incoming)
      for (const end of outgoing) {
        // No U-turns back down the road a vehicle came along.
        if (start.from === end.to) continue;
        const axis = phases[j.id][start.from];
        if (j.roundabout) {
          const points = roundTheCircle(j, start, end, handedness);
          roads.edge(start.id, end.id, { junction: j.id, axis, turn: true, points });
          continue;
        }
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
// The way round a roundabout from an incoming lane to an outgoing one: onto the circle, round it
// (anticlockwise seen from above where traffic drives on the right, clockwise on the left) and off.
function roundTheCircle(j, start, end, handedness) {
  const angle = (p) => Math.atan2(p.z - j.z, p.x - j.x),
    from = angle(start),
    to = angle(end),
    r = ROUNDABOUT.lane;
  // Right-hand traffic goes round with the angle falling (x east, z south, seen from above).
  let sweep = handedness > 0 ? from - to : to - from;
  sweep = ((sweep % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI) || 2 * Math.PI;
  const steps = Math.max(2, Math.ceil(sweep / (Math.PI / 12))),
    points = [{ x: start.x, z: start.z }];
  for (let i = 0; i <= steps; i++) {
    const a = from - handedness * sweep * (i / steps);
    points.push({ x: j.x + Math.cos(a) * r, z: j.z + Math.sin(a) * r });
  }
  points.push({ x: end.x, z: end.z });
  return points;
}
// A lane's signal phase: mostly east-west or mostly north-south.
const axisOf = ([dx, dz]) => (Math.abs(dx) >= Math.abs(dz) ? 'EW' : 'NS');
// The phase traffic from each arm of a junction moves in. By compass direction, as the grid always
// had; but where signals would give two arms that are not opposite each other the same green (an
// angled road), the most nearly opposite pair of arms moves together and every other arm in the
// other phase.
export function armPhases(arms, signalled) {
  const phase = Object.fromEntries(arms.map((a) => [a.to, axisOf(a.dir)]));
  const dot = (a, b) => a.dir[0] * b.dir[0] + a.dir[1] * b.dir[1];
  const clash = arms.some((a, i) =>
    arms.some((b, k) => k > i && phase[a.to] === phase[b.to] && dot(a, b) > -0.7),
  );
  if (!signalled || !clash) return phase;
  let pair = null;
  for (const [i, a] of arms.entries())
    for (const b of arms.slice(i + 1)) if (!pair || dot(a, b) < dot(...pair)) pair = [a, b];
  const first = axisOf(pair[0].dir),
    second = first === 'EW' ? 'NS' : 'EW';
  for (const a of arms) phase[a.to] = pair.includes(a) ? first : second;
  return phase;
}
// Orders the two corners beside an arm by its `across` side: -1 first.
function orderSides(dir, a, b, walks) {
  const p = acrossRoad(dir),
    side = (id) => walks.nodes[id].x * p[0] + walks.nodes[id].z * p[1];
  return side(a) <= side(b) ? [a, b] : [b, a];
}
