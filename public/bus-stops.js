import { figure, placeFigure, standPose, SKIN } from './figures.js';

// Distance from the lane centre to the bus zone's kerb line, and how far a bus pulls in.
const KERB_LINE = 4.2;
export const BUS_PULL_IN = 3;

// A shelter, sign and bus-zone marking beside each simulated bus stop, with passengers who wait,
// board a bus that stops, and are replaced by new arrivals a little later. Stops whose shelter
// would overlap something already on the pavement are left out (and buses no longer stop there).
export function buildBusStops(model, { sim, origin, box, sphere }) {
  const stops = [];
  for (const stop of sim.map.busStops || []) {
    // Local frame: along the lane (dx, dz) and towards the kerb (kx, kz), from the lane centre.
    const at = (along, out) => [
      stop.x + stop.dx * along + stop.kx * out,
      stop.z + stop.dz * along + stop.kz * out,
    ];
    const yaw = Math.atan2(stop.dx, stop.dz);
    // The shelter's own footprint (3.4 m along the kerb, 1 m deep) must be clear.
    const [sx, sz] = at(0, 6.2);
    const halfX = Math.abs(stop.dx) * 1.7 + Math.abs(stop.kx) * 0.5,
      halfZ = Math.abs(stop.dz) * 1.7 + Math.abs(stop.kz) * 0.5;
    const blocked = model.colliders.some(
      (c) =>
        Math.abs(origin.x + sx - c.x) < c.w / 2 + halfX + 0.1 &&
        Math.abs(origin.z + sz - c.z) < c.d / 2 + halfZ + 0.1,
    );
    if (blocked) {
      stop.removed = true;
      continue;
    }
    const parts = [];
    const add = (along, y, out, w, h, d, color, extra = {}) => {
      const [x, z] = at(along, out);
      const m = box(x, y, z, w, h, d, color, { busStop: stop.id, rotation: [0, yaw, 0], ...extra });
      parts.push(m);
      return m;
    };
    // Sizes are [across the lane, height, along the lane] in this rotated frame.
    // Shelter at the back of the pavement: glass back and end panels, roof, bench, timetable.
    add(0, 1.3, 6.65, 0.05, 2.1, 3.2, '#9cc4cc', { surface: 'glass', opacity: 0.6 });
    add(-1.6, 1.3, 6.2, 0.9, 2.1, 0.05, '#9cc4cc', { surface: 'glass', opacity: 0.6 });
    for (const along of [-1.6, 1.6])
      add(along, 1.3, 6.65, 0.1, 2.2, 0.1, '#55666a', { surface: 'steel' });
    add(0, 2.45, 6.25, 1.1, 0.1, 3.5, '#4f6a72', { surface: 'steel', bevel: 0.04 });
    add(0, 0.6, 6.4, 0.42, 0.07, 2.4, '#b8a074', { surface: 'timber' });
    // A light under the roof that comes on with the street lights.
    const lamp = add(0, 2.36, 6.3, 0.3, 0.05, 1.6, '#f4e6c0', { surface: 'plain' });
    for (const along of [-1, 1]) add(along, 0.4, 6.45, 0.08, 0.35, 0.08, '#55666a');
    add(1.2, 1.4, 6.6, 0.06, 0.8, 0.55, '#f2efe4', { surface: 'plain' });
    // Bus stop sign at the kerb and a yellow bus zone painted on the lane.
    add(2.6, 1.3, 5.5, 0.08, 2.2, 0.08, '#6b7b7e', { surface: 'steel' });
    add(2.6, 2.3, 5.5, 0.05, 0.5, 0.45, '#2f8a5c', { surface: 'plain' });
    add(2.6, 2.3, 5.47, 0.06, 0.24, 0.24, '#f2efe4', { surface: 'plain', bevel: 0.1 });
    // Yellow bus zone along the kerb edge of the lane: a long line beside the kerb and short
    // end lines reaching in from it, where the bus pulls in.
    add(0, 0.13, KERB_LINE, 0.12, 0.015, 10, '#e3c34a', { surface: 'plain', rounded: false });
    for (const along of [-5, 5])
      add(along, 0.13, KERB_LINE - 0.6, 1.2, 0.015, 0.12, '#e3c34a', {
        surface: 'plain',
        rounded: false,
      });
    const pad = (x, y, z, r, color) => sphere(x, y, z, r, color);
    const waiting = [0, 1, 2].map((i) => {
      const [px, pz] = at(-0.9 + i * 0.95, 5.9 - (i % 2) * 0.25);
      const person = figure(
        (x, y, z, w, h, d, c, extra) => box(x, y, z, w, h, d, c, { busStop: stop.id, ...extra }),
        (x, y, z, r, c) => pad(x, y, z, r, c),
        origin,
        {
          x: px,
          z: pz,
          shirt: ['#7a5c8f', '#c26b4f', '#4f7f9a'][i],
          shorts: ['#33393d', '#4a5560', '#2f3a33'][i],
          skin: SKIN[(i + stops.length) % SKIN.length],
        },
      );
      return { person, x: px, z: pz, boarded: 0, phase: i * 1.7 };
    });
    stops.push({ stop, parts, lamp, waiting, faceRoad: Math.atan2(-stop.kz, -stop.kx) });
  }
  return stops;
}

// Waiting passengers face the road; when a bus stands at their stop they walk to its door one at a
// time and board, then new passengers arrive after a while.
export function updateBusStops(stops, sim, time, reduced) {
  const t = reduced ? 0 : time;
  for (const s of stops) {
    const bus = sim.vehicles.find((v) => v.atStop === s.stop && v.dwell > 0);
    for (const [i, w] of s.waiting.entries()) {
      if (bus && !w.boarded) {
        // Board in order through the dwell.
        const order = (4 - bus.dwell) / 1.1;
        if (order > i + 0.8) w.boarded = t;
      }
      const gone = w.boarded && t - w.boarded < 25 + i * 6;
      if (w.boarded && !gone) w.boarded = 0;
      for (const m of w.person.meshes) m.opacity = gone ? 0 : 1;
      if (gone) continue;
      const pose = standPose({ sway: reduced ? 0 : Math.sin(t * 0.6 + w.phase) * 0.03 });
      // One checks the timetable now and then.
      if (i === 2 && !reduced && t % 14 < 3) pose.arms = [pose.arms[0], [0.9, 1.3]];
      placeFigure(w.person, w.x, w.z, s.faceRoad, pose, 0.2);
    }
  }
}
