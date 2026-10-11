import { residentialLots } from './community-residences.js';
import { Runtime } from './runtime.js';
import { communityDevices } from './community-missions.js';
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
export function createCommunity(location = {}) {
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
  for (let iz = 0; iz < 3; iz++)
    for (let ix = 0; ix < 3; ix++) {
      const id = `${ix}:${iz}`,
        x = (ix - 1) * 48,
        z = (iz - 1) * 48;
      junctions.push({ id, x, z, signal: ix === 1 && iz === 1, owner: null });
      for (const sx of [-1, 1])
        for (const sz of [-1, 1]) walks.node(`${id}/${sx}/${sz}`, x + sx * 8, z + sz * 8);
      for (const side of [-1, 1]) {
        for (const axis of ['x', 'z']) {
          const a = `${id}/${axis === 'x' ? -1 : side}/${axis === 'x' ? side : -1}`;
          const b = `${id}/${axis === 'x' ? 1 : side}/${axis === 'x' ? side : 1}`;
          const crossing = {
            id: `${id}/${axis}/${side}`,
            junction: id,
            a,
            b,
            signal: ix === 1 && iz === 1,
            occupants: new Set(),
          };
          crossings.push(crossing);
          walks.edge(a, b, { crossing });
          walks.edge(b, a, { crossing });
        }
      }
    }
  for (const j of junctions)
    for (const [dx, dz] of [
      [1, 0],
      [0, 1],
    ]) {
      const k = junctions.find((k) => k.x === j.x + dx * 48 && k.z === j.z + dz * 48);
      if (!k) continue;
      segments.push([j, k]);
      for (const [a, b] of [
        [j, k],
        [k, j],
      ]) {
        const vx = (b.x - a.x) / 48,
          vz = (b.z - a.z) / 48;
        const ox = -vz * 2.2 * handedness,
          oz = vx * 2.2 * handedness;
        const from = roads.node(`${a.id}>${b.id}:out`, a.x + vx * 12 + ox, a.z + vz * 12 + oz);
        const to = roads.node(`${a.id}>${b.id}:in`, b.x - vx * 12 + ox, b.z - vz * 12 + oz);
        roads.edge(from, to, { axis: vx ? 'EW' : 'NS', approach: b.id });
      }
      for (const side of [-1, 1]) {
        const a = `${j.id}/${dx ? 1 : side}/${dz ? 1 : side}`;
        const b = `${k.id}/${dx ? -1 : side}/${dz ? -1 : side}`;
        walks.edge(a, b);
        walks.edge(b, a);
      }
    }
  for (const j of junctions) {
    const incoming = Object.keys(roads.nodes).filter((id) => id.endsWith(`>${j.id}:in`));
    const outgoing = Object.keys(roads.nodes).filter(
      (id) => id.startsWith(`${j.id}>`) && id.endsWith(':out'),
    );
    for (const a of incoming)
      for (const b of outgoing) {
        if (a.split('>')[0] === b.split('>')[1].split(':out')[0]) continue;
        const start = roads.nodes[a],
          end = roads.nodes[b];
        const axis = Math.abs(start.x - j.x) > 10 ? 'EW' : 'NS';
        const outAxis = Math.abs(end.x - j.x) > 10 ? 'EW' : 'NS';
        const c1 = {
          x: start.x + (axis === 'EW' ? Math.sign(j.x - start.x) * 10 : 0),
          z: start.z + (axis === 'NS' ? Math.sign(j.z - start.z) * 10 : 0),
        };
        const c2 = {
          x: end.x - (outAxis === 'EW' ? Math.sign(end.x - j.x) * 10 : 0),
          z: end.z - (outAxis === 'NS' ? Math.sign(end.z - j.z) * 10 : 0),
        };
        const points = Array.from({ length: 25 }, (_, i) => {
          const t = i / 24,
            u = 1 - t;
          return {
            x: u ** 3 * start.x + 3 * u ** 2 * t * c1.x + 3 * u * t ** 2 * c2.x + t ** 3 * end.x,
            z: u ** 3 * start.z + 3 * u ** 2 * t * c1.z + 3 * u * t ** 2 * c2.z + t ** 3 * end.z,
          };
        });
        roads.edge(a, b, { junction: j.id, axis, turn: axis !== outAxis, points });
      }
  }
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
    a: '1:2/1/-1',
    b: '2:2/-1/-1',
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
  // A shared residential walkway serves the new homes and links both ends to public footpaths.
  const residentialNodes = [
    ['residential:south', -10, -8],
    ['residential:east', -10, -23],
    ['residential:middle', -18, -23],
    ['residential:west', -32, -23],
    ['residential:outer', -40, -23],
    ['residential:cottage', -32, -8],
  ];
  for (const [id, x, z] of residentialNodes) walks.node(id, x, z);
  for (const [a, b] of [
    ['1:1/-1/-1', 'residential:south'],
    ['residential:south', 'residential:east'],
    ['residential:east', 'residential:middle'],
    ['residential:middle', 'residential:west'],
    ['residential:west', 'residential:outer'],
    ['residential:outer', '0:1/1/-1'],
    ['residential:south', 'residential:cottage'],
  ]) {
    walks.edge(a, b, { residential: true });
    walks.edge(b, a, { residential: true });
  }
  buildings.push(...residentialLots.map((b) => ({ ...b })));
  // Connected forecourts reach doorsteps without cutting through neighbouring buildings.
  const entrances = {
    home: ['1:1/-1/-1', [-10, -8], [-10, -15], [-25, -15]],
    shop: ['1:1/1/-1', [10, -8], [10, -22], [24, -22]],
    office: ['1:1/1/-1', [24, -8]],
    warehouse: ['1:1/1/1', [10, 8], [10, 32], [24, 32]],
    factory: ['1:1/-1/1', [-10, 8], [-10, 38], [-25, 38]],
    parking: ['2:2/-1/-1', [35, 34]],
    residence1: ['residential:west', [-32, -25]],
    residence2: ['residential:middle', [-18, -25]],
    residence3: ['residential:cottage', [-32, -11]],
  };
  for (const building of buildings) {
    const [origin, ...points] = entrances[building.type];
    let previous = origin;
    for (const [i, [x, z]] of points.entries()) {
      const node = walks.node(`${building.id}:entrance:${i}`, x, z);
      walks.edge(previous, node);
      walks.edge(node, previous);
      previous = node;
    }
    building.node = previous;
  }
  return {
    location,
    localSigns,
    handedness,
    roads,
    walks,
    junctions,
    segments,
    crossings,
    buildings,
  };
}
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
  constructor(location) {
    this.map = createCommunity(location);
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
    this.roadStarts = Object.keys(this.map.roads.nodes).filter((id) => id.endsWith(':out'));
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
  safeCrossing(crossing) {
    const j = this.map.junctions.find((j) => j.id === crossing.junction);
    if (j.owner != null || (j.signal && this.signals.phase !== 'WALK')) return false;
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
          this.occupied('1:1'),
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
    const center = this.map.junctions.find((j) => j.signal);
    this.signals.step(dt, this.occupied(center.id), center.owner != null);
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
          kind === 'truck' || kind === 'van'
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
          .filter((b) => ['office', 'factory', 'warehouse'].includes(b.type))
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
        if (c.signal) this.signals.requested = true;
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
      if (v.clearing && v.progress > v.length / 2 + 1) {
        this.map.junctions.find((j) => j.id === v.clearing).owner = null;
        v.clearing = null;
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
            (j.signal && this.signals.phase !== next.axis) ||
            (!j.signal && waiting))
        )
          gap = edge.length - v.progress;
        else if (edge.length - v.progress < 0.5) j.owner = v.id;
      }
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
          if (v.goal === 'loading-bay' || v.goal === 'parking') {
            const origin = v.goal;
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
