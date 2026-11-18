import { pavement } from './street-network.js';
export const FARM_SERVICE_YARD = { x: 9, z: 47, w: 46, d: 30, gateX: 32, gateZ: 48, gateWidth: 8 };
const curve = (a, b, c, d) =>
  Array.from({ length: 33 }, (_, i) => {
    const t = i / 32,
      u = 1 - t;
    return {
      x: u ** 3 * a.x + 3 * u * u * t * b.x + 3 * u * t * t * c.x + t ** 3 * d.x,
      z: u ** 3 * a.z + 3 * u * u * t * b.z + 3 * u * t * t * c.z + t ** 3 * d.z,
    };
  });

// The farm service yard belongs to the farm, outside its livestock paddocks.
export function connectFarmDriveway(sim, origin) {
  const { roads, walks } = sim.map;
  const local = (x, z) => ({ x: x - origin.x, z: z - origin.z });
  const j = { id: 'farm-access', ...local(48, 48), signal: true, owner: null, farmAccess: true };
  sim.map.junctions.push(j);
  const incoming = [],
    outgoing = [];
  const laneOffset = 2.2 * sim.map.handedness;
  // Split both existing through lanes around the new intersection, preserving route endpoints.
  for (const [from, to, sign] of [
    ['0:1', '0:2', 1],
    ['0:2', '0:1', -1],
  ]) {
    const start = from + '>' + to + ':out',
      end = from + '>' + to + ':in';
    roads.edges[start] = roads.edges[start].filter((e) => e.to !== end);
    const x = 48 - sign * laneOffset;
    const inPoint = local(x, 48 - sign * 8),
      outPoint = local(x, 48 + sign * 8);
    const entry = roads.node(from + '>farm-access:in', inPoint.x, inPoint.z);
    const exit = roads.node('farm-access>' + to + ':out', outPoint.x, outPoint.z);
    roads.edge(start, entry, { axis: 'NS', approach: j.id });
    roads.edge(exit, end, { axis: 'NS', approach: to });
    incoming.push({ id: entry, source: from, axis: 'NS' });
    outgoing.push({ id: exit, destination: to });
  }
  const parking = local(-2, 34.2),
    departure = local(28, 48 + laneOffset);
  roads.node('farm-parking', parking.x, parking.z);
  roads.node('farm-departure', departure.x, departure.z);
  const westIn = local(36, 48 + laneOffset),
    westOut = local(36, 48 - laneOffset);
  const entry = roads.node('farm>farm-access:in', westIn.x, westIn.z);
  const exit = roads.node('farm-access>farm:out', westOut.x, westOut.z);
  roads.edge('farm-departure', entry, { axis: 'EW', approach: j.id, driveway: true });
  // A radius-eight-metre turn replaces the sharp reversal at the old parking bays.
  const arrival = [roads.nodes[exit], local(32, 48 - laneOffset), local(-2, 50.2)];
  for (let i = 1; i <= 32; i++) {
    const angle = Math.PI / 2 + (i * Math.PI) / 32;
    arrival.push(local(-2 + 8 * Math.cos(angle), 42.2 + 8 * Math.sin(angle)));
  }
  roads.edge(exit, 'farm-parking', { driveway: true, points: arrival });
  const departing = curve(parking, local(8, 34.2), local(18, 48 + laneOffset), departure);
  roads.edge('farm-parking', 'farm-departure', { driveway: true, points: departing });
  incoming.push({ id: entry, source: 'farm', axis: 'EW' });
  outgoing.push({ id: exit, destination: 'farm' });
  for (const a of incoming)
    for (const b of outgoing) {
      if (a.source === b.destination) continue;
      const start = roads.nodes[a.id],
        end = roads.nodes[b.id];
      const axisOut = b.destination === 'farm' ? 'EW' : 'NS';
      const c1 = {
        x: start.x + (a.axis === 'EW' ? Math.sign(j.x - start.x) * 5 : 0),
        z: start.z + (a.axis === 'NS' ? Math.sign(j.z - start.z) * 5 : 0),
      };
      const c2 = {
        x: end.x - (axisOut === 'EW' ? Math.sign(end.x - j.x) * 5 : 0),
        z: end.z - (axisOut === 'NS' ? Math.sign(end.z - j.z) * 5 : 0),
      };
      const points = Array.from({ length: 25 }, (_, i) => {
        const t = i / 24,
          u = 1 - t;
        return {
          x: u ** 3 * start.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t ** 3 * end.x,
          z: u ** 3 * start.z + 3 * u * u * t * c1.z + 3 * u * t * t * c2.z + t ** 3 * end.z,
        };
      });
      roads.edge(a.id, b.id, { junction: j.id, axis: a.axis, turn: a.axis !== axisOut, points });
    }
  // Main-street pedestrians cross the driveway at its controlled entrance.
  const north = pavement(walks, '0:1/-1/1'),
    south = pavement(walks, '0:2/-1/-1');
  walks.edges[north] = walks.edges[north].filter((e) => e.to !== south);
  walks.edges[south] = walks.edges[south].filter((e) => e.to !== north);
  const a = local(40, 44),
    b = local(40, 52);
  walks.node('farm-crossing:north', a.x, a.z);
  walks.node('farm-crossing:south', b.x, b.z);
  const crossing = {
    id: 'farm-crossing',
    junction: j.id,
    a: 'farm-crossing:north',
    b: 'farm-crossing:south',
    signal: true,
    occupants: new Set(),
  };
  sim.map.crossings.push(crossing);
  for (const [a, b, extra] of [
    [north, crossing.a, {}],
    [crossing.a, crossing.b, { crossing }],
    [crossing.b, south, {}],
  ]) {
    walks.edge(a, b, extra);
    walks.edge(b, a, extra);
  }
  sim.map.farmDriveway = {
    junction: j,
    parking: 'farm-parking',
    departure: 'farm-departure',
    serviceYard: { ...FARM_SERVICE_YARD },
    visits: {},
    circulation: [arrival, departing],
  };
}

export function drawFarmDriveway({ box, origin, sim }) {
  const add = (x, y, z, w, h, d, color, extra = {}) =>
    box(x - origin.x, y, z - origin.z, w, h, d, color, { farmDriveway: true, ...extra });
  add(9, 0.09, 47, 46, 0.05, 30, '#7b827c', { surface: 'asphalt', farmServiceYard: true });
  add(40, 0.025, 48, 20, 0.1, 8, '#c8c5b5');
  add(40, 0.09, 48, 20, 0.05, 6, '#414950', { surface: 'asphalt' });
  for (let x = 33; x < 38; x += 4) add(x, 0.15, 48, 2, 0.02, 0.1, '#eee7c8', { surface: 'plain' });
  const fence = (x, z, w, d) => {
    add(x, 0.6, z, w, 0.045, d, '#9aa0a2', { farmYardFence: true, surface: 'steel' });
    for (const side of [-1, 1])
      add(
        x + side * (w > 1 ? w / 2 : 0),
        0.7,
        z + side * (d > 1 ? d / 2 : 0),
        0.13,
        1.4,
        0.13,
        '#8c7458',
        { farmYardFence: true },
      );
  };
  fence(-14, 47, 0.05, 30);
  fence(9, 62, 46, 0.05);
  fence(32, 38, 0.05, 12);
  fence(32, 57, 0.05, 10);
  // Gates open into the yard, clear of the incoming and outgoing traffic lanes.
  for (const z of [44, 52]) {
    add(32, 0.8, z, 0.24, 1.6, 0.24, '#7f8c85', { farmVehicleGate: true });
    for (const y of [0.35, 0.75, 1.15])
      add(29.4, y, z, 5.2, 0.07, 0.07, '#aab5ad', { farmVehicleGate: true, surface: 'steel' });
  }
  // Reserved loading and car parking stand beside the circulating route.
  add(-2, 0.15, 34.2, 8, 0.018, 3, '#aaa89a', { farmLoadingBay: true, surface: 'stone' });
  for (const x of [-6, 2]) add(x, 0.165, 34.2, 0.12, 0.015, 3, '#eee7c8', { surface: 'plain' });
  for (const x of [18, 22, 26]) add(x, 0.15, 56, 0.1, 0.02, 6, '#eee7c8', { surface: 'plain' });
  const paint = (a, b) =>
    add(
      (a.x + b.x) / 2,
      0.13,
      (a.z + b.z) / 2,
      Math.hypot(b.x - a.x, b.z - a.z),
      0.012,
      0.1,
      '#d8dbcf',
      {
        surface: 'plain',
        farmLaneArrow: true,
        rotation: [0, -Math.atan2(b.z - a.z, b.x - a.x), 0],
      },
    );
  for (const route of sim.map.farmDriveway.circulation) {
    let travel = 0;
    for (let i = 1; i < route.length; i++) {
      const a = route[i - 1],
        b = route[i],
        length = Math.hypot(b.x - a.x, b.z - a.z);
      if (!length) continue;
      const dx = (b.x - a.x) / length,
        dz = (b.z - a.z) / length;
      for (let t = 12 - travel; t < length; t += 12) {
        const x = a.x + dx * t + origin.x,
          z = a.z + dz * t + origin.z;
        const tip = { x: x + dx * 0.8, z: z + dz * 0.8 };
        paint({ x: x - dx * 0.8, z: z - dz * 0.8 }, tip);
        for (const side of [-1, 1])
          paint(tip, {
            x: tip.x - dx * 0.65 - side * dz * 0.4,
            z: tip.z - dz * 0.65 + side * dx * 0.4,
          });
      }
      travel = (travel + length) % 12;
    }
  }
  return { parking: [-2, 34.2], junction: [48, 48], serviceYard: { ...FARM_SERVICE_YARD } };
}

export function connectFarmFootpath(sim, origin) {
  const walks = sim.map.walks,
    home = 'home-public-path',
    town = pavement(walks, '0:1/1/-1');
  walks.edges[home] = walks.edges[home].filter((e) => e.to !== town);
  walks.edges[town] = walks.edges[town].filter((e) => e.to !== home);
  for (const [id, x, z] of [
    ['farm-arrival', 4, 34.2],
    ['farm-entry', 14, 34.2],
    ['farm-track', 14, 16],
  ])
    walks.node(id, x - origin.x, z - origin.z);
  for (const [a, b] of [
    [home, 'farm-track'],
    ['farm-track', town],
    ['farm-arrival', 'farm-entry'],
    ['farm-entry', 'farm-track'],
  ]) {
    walks.edge(a, b, { originalProperty: true });
    walks.edge(b, a, { originalProperty: true });
  }
}
