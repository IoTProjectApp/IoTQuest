import { recreationLots } from './community-recreation.js';
import { civicLots } from './community-civic.js';
import { residentialLots } from './community-residences.js';
import { Runtime } from './runtime.js';
import { communityDevices } from './community-missions.js';
import { buildStreetNetwork, streetLayoutFor, pavement } from './street-network.js';
// Metres and seconds. Rendering and controllers share this fixed-step simulation.
export const LEFT_DRIVING = new Set(['JPN', 'AUS', 'KEN', 'ZAF', 'IND', 'IDN', 'GBR', 'NZL']);
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
export class Network {
  constructor() {
    this.nodes = {};
    this.edges = {};
  }
  node(id, x, z) {
    this.nodes[id] = { id, x, z };
    this.edges[id] = [];
    return id;
  }
  edge(a, b, extra = {}) {
    const points = extra.points || [this.nodes[a], this.nodes[b]];
    const length = points.slice(1).reduce((sum, p, i) => sum + distance(points[i], p), 0);
    this.edges[a].push({ from: a, to: b, length, points, ...extra });
  }
  route(start, goal) {
    const costs = { [start]: 0 },
      previous = {},
      open = new Set([start]);
    while (open.size) {
      const id = [...open].sort((a, b) => costs[a] - costs[b])[0];
      open.delete(id);
      if (id === goal) break;
      for (const edge of this.edges[id] || []) {
        const cost = costs[id] + edge.length;
        if (cost < (costs[edge.to] ?? Infinity)) {
          costs[edge.to] = cost;
          previous[edge.to] = edge;
          open.add(edge.to);
        }
      }
    }
    if (goal !== start && !previous[goal]) return [];
    const path = [];
    for (let id = goal; id !== start;) {
      const edge = previous[id];
      path.unshift(edge);
      id = edge.from;
    }
    return path;
  }
}
// `layout` is the street network to build (street-network.js); by default the one saved for the
// destination.
export function createCommunity(location = {}, layout = streetLayoutFor(location.id || 'legacy')) {
  const roads = new Network(),
    walks = new Network(),
    junctions = [],
    segments = [],
    crossings = [];
  const localSigns = {
    JPN: ['商店・カフェ', '工場', '止まれ'],
    MAR: ['سوق · مقهى', 'مصنع', 'قف'],
    EGY: ['سوق · مقهى', 'مصنع', 'قف'],
    SAU: ['سوق · مقهى', 'مصنع', 'قف'],
    CHN: ['商店 · 咖啡', '工厂', '停车'],
    ITA: ['Mercato · Caffè', 'Fabbrica', 'STOP'],
    ESP: ['Mercado · Café', 'Fábrica', 'STOP'],
    PER: ['Mercado · Café', 'Fábrica', 'PARE'],
    MEX: ['Mercado · Café', 'Fábrica', 'ALTO'],
    BRA: ['Mercado · Café', 'Fábrica', 'PARE'],
    FRA: ['Marché · Café', 'Usine', 'STOP'],
    IDN: ['Toko · Kafe', 'Pabrik', 'STOP'],
    VNM: ['Cửa hàng · Cà phê', 'Nhà máy', 'DỪNG'],
    TUR: ['Mağaza · Kafe', 'Fabrika', 'DUR'],
    NOR: ['Butikk · Kafé', 'Fabrikk', 'STOP'],
  }[location.iso] || ['Market · Café', 'Factory', 'STOP'];
  const handedness = LEFT_DRIVING.has(location.iso || 'AUS') ? -1 : 1;
  // The street network (street-network.js): the original grid unless the Street Editor changed it.
  const network = buildStreetNetwork(layout, {
    roads,
    walks,
    handedness,
  });
  junctions.push(...network.junctions);
  segments.push(...network.segments);
  crossings.push(...network.crossings);
  // Driveways branch from lanes into open yards, outside building footprints.
  const lane = '1:2>2:2:out',
    end = '1:2>2:2:in';
  const original = roads.edges[lane].find((e) => e.to === end);
  roads.edges[lane] = roads.edges[lane].filter((e) => e !== original);
  roads.node('yard-entry', 22, roads.nodes[lane].z);
  roads.node('loading-bay', 22, 37);
  roads.node('parking', 32, 37);
  roads.edge(lane, 'yard-entry');
  roads.edge('yard-entry', end, { approach: '2:2', axis: 'EW' });
  roads.edge('yard-entry', 'loading-bay', { turn: true, driveway: true });
  roads.edge('loading-bay', 'parking', { turn: true, driveway: true });
  roads.node('yard-exit', 32, roads.nodes[lane].z);
  roads.edge('parking', 'yard-exit', { turn: true, driveway: true });
  roads.edge('yard-exit', end, { approach: '2:2', axis: 'EW' });
  junctions.push({ id: 'yard', x: 25, z: 40, owner: null, signal: false });
  const apron = {
    id: 'yard-crossing',
    junction: 'yard',
    a: pavement(walks, '1:2/1/-1'),
    b: pavement(walks, '2:2/-1/-1'),
    signal: false,
    occupants: new Set(),
  };
  crossings.push(apron);
  for (const id of [apron.a, apron.b])
    for (const edge of walks.edges[id])
      if ([apron.a, apron.b].includes(edge.to)) edge.crossing = apron;
  for (const edges of Object.values(roads.edges))
    for (const edge of edges) if (edge.driveway) edge.yard = true;
  const buildings = [
    {
      id: 'home',
      name: `${location.city || 'Willowbrook'} homes & gardens`,
      x: -25,
      z: -26,
      w: 26,
      d: 20,
      node: '0:0/1/1',
      district: 'Residential',
      type: 'home',
    },
    {
      id: 'shop',
      name: localSigns[0],
      x: 24,
      z: -30,
      w: 22,
      d: 13,
      node: '2:0/-1/1',
      district: 'High street',
      type: 'shop',
    },
    {
      id: 'office',
      name: 'Local business',
      x: 25,
      z: -14,
      w: 22,
      d: 10,
      node: '1:1/1/-1',
      district: 'High street',
      type: 'office',
    },
    {
      id: 'warehouse',
      name: 'Warehouse · loading yard',
      x: 25,
      z: 22,
      w: 22,
      d: 18,
      node: '2:2/-1/-1',
      district: 'Logistics',
      type: 'warehouse',
    },
    {
      id: 'factory',
      name: localSigns[1],
      x: -25,
      z: 24,
      w: 25,
      d: 24,
      node: '0:2/1/-1',
      district: 'Industrial',
      type: 'factory',
    },
    {
      id: 'parking',
      name: 'Parking & bus stop',
      // The paved lot drawn in 3D (and the area clicks select): around the parking road node.
      x: 32,
      z: 37,
      w: 16,
      d: 10,
      node: '2:2/-1/-1',
      district: 'Logistics',
      type: 'parking',
    },
  ];
  buildings.push(...residentialLots.map((b) => ({ ...b })));
  buildings.push(...civicLots.map((b) => ({ ...b })));
  buildings.push(...recreationLots.map((b) => ({ ...b })));
  // Each pair of homes occupies one northern block. Door paths join the adjacent
  // pavement without cutting across a road or through a neighbouring garden.
  const residentialEntrances = Object.fromEntries(
    residentialLots.map((b, i) => {
      const block = Math.floor(i / 2),
        right = i % 2 === 1;
      const corner = pavement(walks, `${block + (right ? 1 : 0)}:0/${right ? -1 : 1}/-1`);
      const sideX = walks.nodes[corner].x;
      return [b.type, [corner, [sideX, -62], [b.x, -62], [b.x, b.z + b.d / 2 + 1]]];
    }),
  );
  // Connected forecourts reach doorsteps without cutting through neighbouring buildings.
  const entrances = {
    home: ['1:1/-1/-1', [-10, -8], [-10, -15], [-25, -15]],
    shop: ['1:1/1/-1', [10, -8], [10, -22], [24, -22]],
    office: ['1:1/1/-1', [24, -8]],
    warehouse: ['1:1/1/1', [10, 8], [10, 32], [24, 32]],
    factory: ['1:1/-1/1', [-10, 8], [-10, 38], [-25, 38]],
    parking: ['2:2/-1/-1', [35, 34]],
    ...residentialEntrances,
    ...Object.fromEntries(
      recreationLots.map((b) => [
        b.type,
        b.type === 'busdepot'
          ? [`${Math.floor(b.x / 48) + 1}:0/1/-1`, [b.x, -56], [b.x, b.z + b.d / 2 + 1]]
          : b.type === 'park' || b.type === 'playground2'
            ? [`${Math.floor(b.x / 48) + 1}:3/1/-1`, [b.x, 88]]
            : b.type === 'basketball' || b.type === 'playground'
              ? ['3:0/1/-1', [b.x, -56], [b.x, b.z + b.d / 2 + 1]]
              : [
                  `${Math.floor(b.x / 48) + 1}:1/1/${b.z < 0 ? -1 : 1}`,
                  [Math.floor(b.x / 48) * 48 + 8, b.z],
                  [b.x - b.w / 2 - 1, b.z],
                ],
      ]),
    ),
    ...Object.fromEntries(
      civicLots.map((b, i) => [
        b.type,
        [
          `${2}:${Math.min(2, i)}/1/${i === 0 ? 1 : -1}`,
          [60, i === 0 ? -40 : i === 1 ? -8 : 40],
          [60, b.z],
          [b.x - b.w / 2 - 1, b.z],
        ],
      ]),
    ),
  };
  for (const building of buildings) {
    const [origin, ...points] = entrances[building.type];
    let previous = pavement(walks, origin);
    for (const [i, [x, z]] of points.entries()) {
      if (walks.nodes[previous].x === x && walks.nodes[previous].z === z) continue;
      const node = walks.node(`${building.id}:entrance:${i}`, x, z);
      walks.edge(previous, node);
      walks.edge(node, previous);
      previous = node;
    }
    building.node = previous;
  }
  // A direct pavement link lets park visitors reach the adjacent playground crossing.
  const park = buildings.find((b) => b.type === 'park');
  if (park) {
    const corner = pavement(walks, '4:3/-1/-1');
    walks.edge(park.node, corner);
    walks.edge(corner, park.node);
  }
  // Bus stops halfway along the busiest street lanes (both directions of each block). Buses pull
  // in, wait, then pull away; community-world draws a shelter on the kerb beside each one.
  const busStops = [];
  for (const [a, b] of [
    ['0:1', '1:1'],
    ['2:1', '3:1'],
    ['4:1', '5:1'],
    ['1:2', '2:2'],
    ['2:2', '3:2'],
  ])
    for (const [from, to] of [
      [a, b],
      [b, a],
    ]) {
      const edge = roads.edges[`${from}>${to}:out`]?.find((e) => e.to === `${from}>${to}:in`);
      if (!edge) continue;
      const start = roads.nodes[edge.from],
        end = roads.nodes[edge.to];
      const length = Math.hypot(end.x - start.x, end.z - start.z),
        dx = (end.x - start.x) / length,
        dz = (end.z - start.z) / length;
      // 6 m past halfway in the direction of travel, so the two directions' stops are staggered
      // at opposite ends of the block rather than facing each other.
      const at = length / 2 + 6;
      edge.busStop = {
        id: `${from}>${to}`,
        at,
        x: start.x + dx * at,
        z: start.z + dz * at,
        dx,
        dz,
        // Towards the kerb on this lane's side of the road.
        kx: -dz * handedness,
        kz: dx * handedness,
      };
      busStops.push(edge.busStop);
    }
  return {
    location,
    localSigns,
    handedness,
    busStops,
    roads,
    walks,
    junctions,
    segments,
    crossings,
    buildings,
  };
}
export const BUS_DWELL = 4;
export class Signals {
  constructor() {
    this.phase = 'EW';
    this.remaining = 12;
    this.next = 'NS';
    this.requested = false;
    this.pending = null;
    this.messages = [];
  }
  request(movements, occupied = false) {
    if (
      !Array.isArray(movements) ||
      movements.length !== 1 ||
      !['EW', 'NS', 'WALK', 'RED'].includes(movements[0])
    )
      return this.reject(
        'Conflicting or invalid phases: request exactly one of EW, NS, WALK or RED.',
      );
    if (occupied && ['EW', 'NS'].includes(movements[0]))
      return this.reject(
        'Crossing occupied: conflicting traffic must remain red until everyone clears.',
      );
    this.pending = movements[0];
    return true;
  }
  reject(reason) {
    if (this.messages.at(-1) !== reason) this.messages.push(reason);
    this.messages = this.messages.slice(-12);
    return false;
  }
  step(dt, occupied, junctionBusy) {
    this.remaining = Math.max(0, this.remaining - dt);
    if (this.remaining > 0) return;
    if (this.phase === 'EW' || this.phase === 'NS') {
      this.next = this.phase === 'EW' ? 'NS' : 'EW';
      this.phase = 'AMBER';
      this.remaining = 3;
    } else if (this.phase === 'AMBER') {
      this.phase = 'RED';
      this.remaining = 2;
    } else if (this.phase === 'WALK') {
      this.phase = 'CLEAR';
      this.remaining = 4;
    } else if (!occupied && !junctionBusy) {
      // Serve a vehicle phase after each pedestrian clearance, preventing starvation.
      this.phase =
        this.phase === 'CLEAR'
          ? this.pending && this.pending !== 'WALK'
            ? this.pending
            : this.next
          : this.pending || (this.requested ? 'WALK' : this.next);
      this.pending = null;
      if (this.phase === 'WALK') this.requested = false;
      this.remaining = this.phase === 'WALK' ? 6 : this.phase === 'RED' ? 2 : 12;
    }
  }
}
function pose(agent, graph, progress = agent.progress) {
  const edge = agent.route[agent.index],
    points = edge.points;
  let left = progress;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1],
      b = points[i],
      length = distance(a, b);
    if (left <= length || i === points.length - 1) {
      const t = Math.min(1, left / length);
      return {
        x: a.x + (b.x - a.x) * t,
        z: a.z + (b.z - a.z) * t,
        angle: Math.atan2(b.z - a.z, b.x - a.x),
      };
    }
    left -= length;
  }
}
// Oriented rectangles: opposing lanes can pass; long trucks cannot overlap at turns.
export function overlaps(a, b, margin = 0.3) {
  for (const angle of [a.angle, a.angle + Math.PI / 2, b.angle, b.angle + Math.PI / 2]) {
    const x = Math.cos(angle),
      z = Math.sin(angle);
    const radius = (o) =>
      Math.abs(Math.cos(o.angle) * x + Math.sin(o.angle) * z) * (o.length / 2 + margin) +
      Math.abs(-Math.sin(o.angle) * x + Math.cos(o.angle) * z) * (o.width / 2 + margin);
    if (Math.abs((a.x - b.x) * x + (a.z - b.z) * z) >= radius(a) + radius(b)) return false;
  }
  return true;
}
export class CommunitySimulation {
  constructor(location, layout) {
    this.map = createCommunity(location, layout);
    this.signals = new Signals();
    this.vehicles = [];
    this.people = [];
    this.time = 0;
    this.accumulator = 0;
    this.spawnClock = 0;
    this.density = 12;
    this.pedestrianDensity = 10;
    this.rain = 0;
    this.hour = 8;
    this.sequence = 0;
    this.outputs = {};
    this.walkNodes = Object.keys(this.map.walks.nodes);
    // Through traffic enters from the main town streets; the northern housing
    // streets remain connected for local routes without spawning delivery queues.
    this.roadStarts = Object.keys(this.map.roads.nodes).filter(
      (id) => id.endsWith(':out') && !id.includes(':-1') && !id.includes(':3'),
    );
  }
  addVehicle(start, goal, kind = 'car') {
    const route = this.map.roads.route(start, goal);
    if (!route.length) return null;
    const v = {
      id: ++this.sequence,
      kind,
      route,
      index: 0,
      progress: 0,
      speed: 0,
      length: kind === 'truck' || kind === 'bus' ? 5 : 3.5,
      width: 1.6,
      dwell: 0,
      goal,
    };
    Object.assign(v, pose(v, this.map.roads));
    if (this.vehicles.some((o) => overlaps(v, o, 1.5))) return null;
    this.vehicles.push(v);
    return v;
  }
  addPerson(start, goal) {
    const route = this.map.walks.route(start, goal);
    if (!route.length) return null;
    const p = {
      id: ++this.sequence,
      route,
      index: 0,
      progress: 0,
      speed: 1.3,
      status: 'Walking',
      goal,
    };
    Object.assign(p, pose(p, this.map.walks));
    this.people.push(p);
    return p;
  }
  occupied(id) {
    return this.map.crossings.some((c) => c.junction === id && c.occupants.size);
  }
  // The controller junction runs `this.signals`, which the student's program and the overview
  // drive. Every other signalled junction runs its own controller, so a pedestrian or a held
  // vehicle there only stops that junction's traffic, never the whole town.
  get controlJunction() {
    return (
      this.map.junctions.find((j) => j.id === '1:1' && j.signal) ||
      this.map.junctions.find((j) => j.signal)
    );
  }
  signalsAt(id) {
    this.junctionSignals ||= new Map();
    let signals = this.junctionSignals.get(id);
    if (!signals) {
      const control = this.controlJunction,
        j = this.map.junctions.find((j) => j.id === id);
      if (!j?.signal || j === control) return this.signals;
      // Each junction starts its cycle late by the drive from the controller at cruising speed
      // (7 m/s), so a car leaving on green tends to arrive on green. The 34 s cycle is
      // EW 12 + amber 3 + red 2 + NS 12 + amber 3 + red 2; walk calls drift it later.
      signals = new Signals();
      const lag = (Math.abs(j.x - control.x) + Math.abs(j.z - control.z)) / 7;
      for (let t = 0; t < 34 - (lag % 34); t += 0.5) signals.step(0.5, false, false);
      this.junctionSignals.set(id, signals);
    }
    return signals;
  }
  signalCrossingsOccupied() {
    return this.occupied(this.controlJunction.id);
  }
  safeCrossing(crossing) {
    const j = this.map.junctions.find((j) => j.id === crossing.junction);
    if (j.owner != null || (j.signal && this.signalsAt(j.id).phase !== 'WALK')) return false;
    return this.vehicles.every((v) => {
      const edge = v.route[v.index];
      if (edge.approach !== j.id) return true;
      const gap = edge.length - v.progress;
      return v.speed < 0.1 || gap > v.speed * 1.2 + v.speed ** 2 / (2 * this.braking) + 2;
    });
  }
  get braking() {
    return this.rain > 0 ? 2 : 4;
  }
  advance(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) return;
    this.accumulator += seconds;
    while (this.accumulator >= 0.05 - 1e-9) {
      this.step(0.05);
      this.accumulator -= 0.05;
    }
  }
  startController(code, language) {
    this.controller = new Runtime(code, language, communityDevices);
    this.controllerLog = 'Program running in the connected world.';
    this.controllerClock = 0;
    this.lastControllerPhase = 0;
  }
  stopController() {
    this.controller = null;
    this.outputs = {};
    this.controllerLog = 'Controller stopped; outputs off.';
  }
  tickController(dt) {
    if (!this.controller) return;
    this.controllerClock = (this.controllerClock || 0) + dt;
    if (this.controllerClock < 0.2 - 1e-9) return;
    this.controllerClock -= 0.2;
    try {
      const result = this.controller.step(this.sensors(), 200);
      this.outputs = result.outputs;
      const phase = Math.round(this.outputs[8] || 0);
      if (phase && phase !== this.lastControllerPhase)
        this.signals.request(
          [{ 1: 'EW', 2: 'NS', 3: 'WALK', 4: 'RED' }[phase]],
          this.signalCrossingsOccupied(),
        );
      this.lastControllerPhase = phase;
      if (result.logs?.length) this.controllerLog = result.logs.slice(-8).join('\n');
    } catch (error) {
      this.stopController();
      this.controllerLog = `Program stopped: ${error.message}`;
    }
  }
  step(dt) {
    this.tickController(dt);
    this.releaseDepartedOwners();
    this.time += dt;
    this.hour = (this.initialHour ?? 8) + this.time / 3600;
    for (const j of this.map.junctions)
      if (j.signal) this.signalsAt(j.id).step(dt, this.occupied(j.id), j.owner != null);
    this.spawnClock += dt;
    if (this.spawnClock >= 1) {
      this.spawnClock = 0;
      const busy =
        (this.hour % 24 >= 7 && this.hour % 24 < 10) ||
        (this.hour % 24 >= 16 && this.hour % 24 < 19);
      if (this.vehicles.length < this.density * (busy ? 1 : 0.5)) {
        const start = this.roadStarts[this.sequence % this.roadStarts.length],
          kind = ['car', 'van', 'bus', 'truck'][this.sequence % 4];
        const goal =
          this.map.farmDriveway && (kind === 'truck' || (kind !== 'bus' && this.sequence % 3 === 0))
            ? 'farm-parking'
            : kind === 'truck' || kind === 'van'
              ? 'loading-bay'
              : kind === 'car' && this.sequence % 3 === 0
                ? 'parking'
                : this.roadStarts[(this.sequence + 11) % this.roadStarts.length];
        this.addVehicle(start, goal, kind);
      }
      if (this.people.length < this.pedestrianDensity) {
        const homes = this.map.buildings.filter((b) => b.type === 'home' || b.residential),
          home = homes[this.sequence % homes.length].node;
        const shops = this.map.buildings
          .filter((b) => ['shop', 'parking'].includes(b.type))
          .map((b) => b.node);
        const workplaces = this.map.buildings
          .filter((b) => ['office', 'factory', 'warehouse'].includes(b.type) || b.civic)
          .map((b) => b.node);
        const hour = this.hour % 24;
        const destination =
          hour >= 16 && hour < 23
            ? home
            : hour >= 7 && hour < 10
              ? workplaces[this.sequence % workplaces.length]
              : shops[this.sequence % shops.length];
        const origin = destination === home ? workplaces[this.sequence % workplaces.length] : home;
        this.addPerson(origin, destination);
      }
    }
    for (const p of [...this.people]) {
      const edge = p.route[p.index],
        c = edge.crossing;
      if (c && p.progress === 0) {
        if (c.signal) this.signalsAt(c.junction).requested = true;
        if (!this.safeCrossing(c)) {
          p.status = 'At kerb · waiting for safe crossing';
          continue;
        }
        c.occupants.add(p.id);
      }
      const proposed = pose(p, this.map.walks, Math.min(edge.length, p.progress + p.speed * dt));
      if (this.vehicles.some((v) => overlaps(v, { ...proposed, length: 0.6, width: 0.6 }, 0.25))) {
        p.status = 'Waiting for driveway traffic';
        continue;
      }
      p.status = c ? 'Crossing' : 'Walking';
      p.progress = Math.min(edge.length, p.progress + p.speed * dt);
      Object.assign(p, proposed);
      if (p.progress >= edge.length) {
        c?.occupants.delete(p.id);
        p.index++;
        p.progress = 0;
        if (p.index === p.route.length) {
          p.status = 'Arrived';
          this.people.splice(this.people.indexOf(p), 1);
        }
      }
    }
    for (const v of [...this.vehicles]) {
      if (v.dwell > 0) {
        v.speed = 0;
        v.dwell = Math.max(0, v.dwell - dt);
        continue;
      }
      if (v.clearing) {
        const junction = this.map.junctions.find((j) => j.id === v.clearing);
        // The farm junction has short through links. Release once the rear clears its
        // footprint and western crossing, even if the next signal has stopped the vehicle.
        const clear = junction.farmAccess
          ? !overlaps(
              v,
              { x: junction.x - 1.5, z: junction.z, angle: 0, length: 15, width: 12 },
              0.5,
            )
          : v.progress > v.length / 2 + 1;
        if (clear) {
          junction.owner = null;
          v.clearing = null;
        }
      }
      const edge = v.route[v.index],
        next = v.route[v.index + 1];
      if (edge.to === 'parking' && this.parkingControlled && !this.outputs[6]) {
        v.speed = 0;
        continue;
      }
      if (edge.yard && v.progress === 0) {
        const j = this.map.junctions.find((j) => j.id === 'yard');
        const waiting = this.people.some((p) => p.route[p.index]?.crossing?.junction === 'yard');
        if (j.owner !== v.id && (j.owner != null || this.occupied('yard') || waiting)) {
          v.speed = 0;
          continue;
        }
        j.owner = v.id;
      }
      let limit = (edge.turn || edge.driveway ? 2 : 7) * (this.rain > 0 ? 0.65 : 1);
      let gap = Infinity;
      // Buses brake to a halt at each stop on their route, wait for passengers, then move on.
      const stop = v.kind === 'bus' && edge.busStop && !edge.busStop.removed ? edge.busStop : null;
      let stopGap = Infinity;
      if (stop && v.servedStop !== stop) {
        const toStop = stop.at - v.progress;
        if (toStop > -0.5 && toStop <= 0.2 && v.speed < 0.6) {
          v.servedStop = stop;
          v.atStop = stop;
          v.dwell = BUS_DWELL;
          v.speed = 0;
          continue;
        }
        if (toStop > 0) stopGap = toStop;
      }
      if (v.atStop && v.atStop !== stop) v.atStop = null;
      if (edge.approach && next?.junction) {
        const j = this.map.junctions.find((j) => j.id === next.junction);
        const waiting = this.people.some(
          (p) => p.route[p.index]?.crossing?.junction === j.id && p.progress === 0,
        );
        const exit = this.map.roads.nodes[next.to];
        const exitEdge = this.map.roads.edges[next.to][0];
        const target = exitEdge ? this.map.roads.nodes[exitEdge.to] : exit;
        const angle = Math.atan2(target.z - exit.z, target.x - exit.x);
        const clear = !this.vehicles.some(
          (o) =>
            o !== v &&
            overlaps(
              {
                ...v,
                x: exit.x + Math.cos(angle) * v.length,
                z: exit.z + Math.sin(angle) * v.length,
                angle,
                length: v.length * 2,
              },
              o,
              1,
            ),
        );
        if (
          j.owner !== v.id &&
          (this.occupied(j.id) ||
            j.owner != null ||
            !clear ||
            (j.signal && this.signalsAt(j.id).phase !== next.axis) ||
            (!j.signal && waiting))
        )
          gap = edge.length - v.progress;
        else if (edge.length - v.progress < 0.5) j.owner = v.id;
      }
      // Applied after the junction check, which sets its own stopping distance.
      gap = Math.min(gap, stopGap);
      for (const other of this.vehicles)
        if (other !== v && other.route[other.index] === edge && other.progress > v.progress)
          gap = Math.min(
            gap,
            other.progress -
              v.progress -
              (v.length + other.length) / 2 -
              1.5 -
              v.speed * (this.rain > 0 ? 1.5 : 0.8),
          );
      // Distinct route arrays have distinct edges? Network route returns shared edge references.
      if (Number.isFinite(gap))
        limit = Math.min(limit, Math.sqrt(Math.max(0, 2 * this.braking * Math.max(0, gap - 0.15))));
      v.speed = Math.max(0, Math.min(limit, v.speed + 2 * dt));
      const progress = Math.min(
        edge.length,
        v.progress + v.speed * dt,
        v.progress + Math.max(0, gap),
      );
      const proposed = { ...v, progress, ...pose(v, this.map.roads, progress) };
      if (
        this.vehicles.some((o) => o !== v && overlaps(proposed, o)) ||
        this.people.some((p) =>
          overlaps(proposed, { ...p, angle: 0, length: 0.6, width: 0.6 }, 0.2),
        )
      ) {
        v.speed = 0;
        continue;
      }
      v.progress = progress;
      Object.assign(v, proposed);
      if (v.progress >= edge.length - 1e-8) {
        if (next?.junction) {
          const j = this.map.junctions.find((j) => j.id === next.junction);
          if (j.owner !== v.id) {
            v.speed = 0;
            continue;
          }
        }
        if (edge.junction) v.clearing = edge.junction;
        if (edge.yard && edge.to === 'yard-exit')
          this.map.junctions.find((j) => j.id === 'yard').owner = null;
        v.index++;
        v.progress = 0;
        if (v.index === v.route.length) {
          if (v.goal === 'loading-bay' || v.goal === 'parking' || v.goal === 'farm-parking') {
            const origin = v.goal;
            if (origin === 'farm-parking') {
              const visits = this.map.farmDriveway.visits;
              visits[v.kind] = (visits[v.kind] || 0) + 1;
            }
            v.goal = this.roadStarts[(v.id + 7) % this.roadStarts.length];
            v.route = this.map.roads.route(origin, v.goal);
            v.index = 0;
            v.dwell = 5;
            if (!v.route.length) this.vehicles.splice(this.vehicles.indexOf(v), 1);
          } else this.vehicles.splice(this.vehicles.indexOf(v), 1);
        }
      }
    }
  }
  releaseDepartedOwners() {
    for (const j of this.map.junctions)
      if (j.owner != null && !this.vehicles.some((v) => v.id === j.owner)) j.owner = null;
  }
  sensors() {
    return {
      presence: this.people.length > 0 ? 1 : 0,
      temperature: this.temperature ?? 24,
      vibration: this.outputs[7] ? 65 : 5,
      bay: this.vehicles.some((v) => distance(v, this.map.roads.nodes['loading-bay']) < 5) ? 1 : 0,
      request: this.signals.requested ? 1 : 0,
      traffic: this.vehicles.filter((v) => v.speed < 0.2).length,
      spaces: Math.max(
        0,
        1 - this.vehicles.filter((v) => distance(v, this.map.roads.nodes.parking) < 6).length,
      ),
      light: this.light ?? 70,
    };
  }
}
