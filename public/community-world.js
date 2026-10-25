import {
  pavement,
  alongRoad,
  acrossRoad,
  ROAD_SIZES,
  ROUNDABOUT,
  LANE_OFFSET,
  LANE_SPACING,
  linePart,
  linePieces,
  lineLength,
  offsetLine,
} from './street-network.js';
import { connectFarmHomeCars } from './farm-home-access.js';
import { connectHomeDriveway, drawHomeStreetDriveway } from './home-driveway.js';
import { recreationLots, buildRecreationAreas, updateFountain } from './community-recreation.js';
import { addOpenBlocks, updateOpenBlocks } from './open-blocks.js';
import { addWorldSky, updateWorldSky } from './world-sky.js';
import { addRecreationPeople, updateRecreationPeople } from './recreation-people.js';
import { buildBusStops, updateBusStops, BUS_PULL_IN } from './bus-stops.js';
import { integrateRegionalNeighbours } from './regional-neighbourhood.js';
import { buildTrafficSignals, trafficAspect } from './traffic-signals.js';
import { connectFarmDriveway, connectFarmFootpath, drawFarmDriveway } from './farm-driveway.js';
import { civicLots, buildCivicBuildings, updateCivicBuildings } from './community-civic.js';
import { furnishCommunity, updateCommunityEquipment } from './community-furnishings.js';
import { buildCommunityResidences, updateResidentialDevices } from './community-residences.js';
import { detailCommunity } from './community-details.js';
import { applyNativeCommunityOutputs } from './community-quests.js';
import { CommunitySimulation } from './community-sim.js';
import { residentialLots } from './community-residences.js';
import { fromWorld } from './world-math.js';
import { tagLooseParts } from './world-detach.js';

// Place the original home in the town’s residential block.
export const COMMUNITY_ORIGIN = { x: 24, z: 24 };
// Every street light in the world (town and home street) switches on below this light level, and
// lights a warm pool on the ground beneath it.
export const STREET_LIGHT_LEVEL = 40;
// Two warm discs, a faint wide one and a brighter small one, fade the pool out from the centre.
export function streetLightPool(box, x, z, radius, y = 0.17) {
  return [
    [1, 0.13, '#ffbf6a'],
    [0.5, 0.2, '#ffd08a'],
  ].map(([scale, poolOpacity, color], i) =>
    box(x, y + i * 0.004, z, radius * 2 * scale, 0.01, radius * 2 * scale, color, {
      shape: 'cylinder',
      opacity: 0,
      emission: 1,
      rounded: false,
      streetLightPool: true,
      poolOpacity,
    }),
  );
}
// Where students install and program in each community building: [area name, x, z] from the
// community origin. Residences use their lot centres.
export const communityStations = {
  shop: ['Shop floor', 24, -30],
  office: ['Business office', 25, -11.5],
  warehouse: ['Loading bay', 25, 27],
  factory: ['Factory floor', -25, 24],
  roads: ['Community roads', 11, 11],
  parking: ['Parking area', 40, 34],
  ...Object.fromEntries(
    recreationLots.map((b) => [b.type, [b.name, b.stationX ?? b.x - 9, b.stationZ ?? b.z]]),
  ),
  ...Object.fromEntries(
    civicLots.map((b) => [b.type, [b.name, b.type === 'school' ? b.x - 5 : b.x, b.z]]),
  ),
  ...Object.fromEntries(residentialLots.map((b) => [b.type, [b.name, b.x, b.z]])),
};
// `streets` is a street layout to build instead of the saved one (the Street Editor's preview).
export function addCommunityWorld(model, location, { streets } = {}) {
  const sim = new CommunitySimulation(location, streets),
    origin = { ...COMMUNITY_ORIGIN, x: model.farm ? 96 : COMMUNITY_ORIGIN.x };
  const neighbourAreas = integrateRegionalNeighbours(model, sim, origin);
  if (model.farm) connectFarmDriveway(sim, origin);
  connectHomeDriveway(model, sim, origin);
  if (model.farm) connectFarmHomeCars(model, sim, origin);
  const home = sim.map.buildings.find((b) => b.type === 'home');
  home.x = -origin.x;
  home.z = -origin.z;
  home.w = 33.8;
  home.d = 27.5;
  home.existingProperty = true;
  home.name = 'Existing home & garden';
  const walks = sim.map.walks;
  // Replace the template home's forecourt with the original property's front entrance.
  for (const id of Object.keys(walks.nodes))
    if (id.startsWith('home:entrance:')) {
      delete walks.nodes[id];
      delete walks.edges[id];
    }
  for (const id of Object.keys(walks.edges))
    walks.edges[id] = walks.edges[id].filter((e) => walks.nodes[e.to]);
  home.node = walks.node('existing-home', -origin.x, 10 - origin.z);
  const gate = walks.node('home-front-gate', -origin.x, 13 - origin.z),
    street = walks.node('home-public-path', -origin.x, -8);
  for (const [a, b] of [
    [home.node, gate],
    [gate, street],
    [street, pavement(walks, '0:1/1/-1')],
  ]) {
    walks.edge(a, b, { originalProperty: true });
    walks.edge(b, a, { originalProperty: true });
  }
  if (model.farm) connectFarmFootpath(sim, origin);
  sim.map.viewBounds = {
    x: Math.min(-60, -origin.x - (model.farm ? 38 : 18)),
    z: -110,
    w: 206 - Math.min(-60, -origin.x - (model.farm ? 38 : 18)),
    h: 218,
  };
  // Keep scenery around the shared town boundary, with no distant second island.
  const waterOffset = model.farm ? -16 : 8;
  for (const mesh of model.objects) {
    if (!mesh.landscape || mesh.landscapeGround || mesh.flyingBird || mesh.wildlife) continue;
    if (['mountain', 'snowcap'].includes(mesh.terrainFeature)) {
      mesh.pos[0] += origin.x;
      mesh.pos[2] -= 50;
    } else if (mesh.pos[0] > 18)
      mesh.pos[0] +=
        (mesh.terrainFeature === 'foothill' ? 201 : 186) + origin.x - COMMUNITY_ORIGIN.x;
    else if (model.farm && mesh.terrainFeature === 'foothill') mesh.pos[0] -= 20;
    if (
      [
        'river',
        'tributary',
        'river-bank',
        'water-flow',
        'lake',
        'lake-bank',
        'lake-ripple',
        'shore-rock',
      ].includes(mesh.terrainFeature)
    )
      mesh.pos[0] += waterOffset;
  }
  for (const water of model.landscape?.waters || []) water.x += waterOffset;
  for (const animal of model.landscape?.wildlife || []) {
    const wildlifeOffset = 186 + origin.x - COMMUNITY_ORIGIN.x;
    animal.x += wildlifeOffset;
    animal.paddock = animal.paddock.map((v, i) => (i % 2 === 0 ? v + wildlifeOffset : v));
    if (animal.bounds)
      animal.bounds = animal.bounds.map((v, i) => (i % 2 === 0 ? v + wildlifeOffset : v));
    if (animal.target) animal.target[0] += wildlifeOffset;
    for (const part of animal.parts) part.mesh.pos[0] += wildlifeOffset;
  }
  const objects = [],
    lights = [],
    lightPools = [],
    signals = [],
    machinery = [],
    doors = [],
    barriers = [];
  const box = (x, y, z, w, h, d, color, extra = {}) => {
    const mesh = model.box(x + origin.x, y, z + origin.z, w, h, d, color, {
      community: true,
      ...extra,
    });
    objects.push(mesh);
    if (extra.solid)
      model.colliders.push({ x: x + origin.x, z: z + origin.z, w, d, community: true });
    return mesh;
  };
  const sphere = (x, y, z, r, color, extra = {}) => {
    const mesh = model.sphere(x + origin.x, y, z + origin.z, r, color, {
      community: true,
      ...extra,
    });
    objects.push(mesh);
    return mesh;
  };
  const arid = ['dry', 'desert'].includes(location?.climate);
  const ground = arid
    ? '#c4b68b'
    : ['cold', 'highland'].includes(location?.climate)
      ? '#8f9e8b'
      : ['tropical', 'monsoon'].includes(location?.climate)
        ? '#8ba982'
        : '#a1af8a';
  box(72, -0.55, 0, 266, 1, 218, ground, { surface: arid ? 'soil' : 'grass' });
  // Roads, at any angle (street-network.js): verge, asphalt, centre dashes and a street light.
  const piece = (x, y, z, dir, length, height, width, color, extra = {}) => {
    const { size, rotation } = alongRoad(dir, length, height, width);
    return box(x, y, z, ...size, color, { ...extra, rotation });
  };
  // Everything from here to the buildings is the street (see markStreet below).
  const streetFrom = objects.length;
  for (const segment of sim.map.segments) {
    const [a, b] = segment,
      size = ROAD_SIZES[segment.lanes || 1];
    let length = Math.hypot(b.x - a.x, b.z - a.z),
      dir = [(b.x - a.x) / length, (b.z - a.z) / length],
      x = (a.x + b.x) / 2,
      z = (a.z + b.z) / 2;
    if (segment.line) {
      // A curved road: short straight pieces along its curve, overlapping so it has no gaps.
      for (const p of linePieces(segment.line)) {
        piece(p.x, 0.025, p.z, p.dir, p.length + 0.6, 0.1, size.verge, '#c8c5b5');
        piece(p.x, 0.09, p.z, p.dir, p.length + 0.6, 0.05, size.asphalt, '#414950');
      }
      length = lineLength(segment.line);
      for (let t = 2; t < length; t += 5) {
        const at = linePart(segment.line, t, t);
        piece(at.points[0].x, 0.13, at.points[0].z, at.startDir, 2, 0.015, 0.15, '#eee7c8');
      }
      const middle = linePart(segment.line, length / 2, length / 2);
      [x, z, dir] = [middle.points[0].x, middle.points[0].z, middle.startDir];
    } else {
      piece(x, 0.025, z, dir, length, 0.1, size.verge, '#c8c5b5');
      piece(x, 0.09, z, dir, length, 0.05, size.asphalt, '#414950');
      for (let t = 2; t < length; t += 5)
        piece(a.x + dir[0] * t, 0.13, a.z + dir[1] * t, dir, 2, 0.015, 0.15, '#eee7c8');
    }
    // Two lanes each way: a white dashed line between each pair.
    if (segment.lanes === 2) {
      const line = segment.line || [a, b];
      for (const side of [-1, 1]) {
        const lane = offsetLine(line, side * (LANE_OFFSET + LANE_SPACING / 2)),
          total = lineLength(lane);
        for (let t = 12; t < total - 12; t += 6) {
          const at = linePart(lane, t, t);
          piece(at.points[0].x, 0.13, at.points[0].z, at.startDir, 2.5, 0.015, 0.12, '#f4f1e6');
        }
      }
    }
    // The light stands on the verge to the south or east of the road.
    const across = acrossRoad(dir),
      lx = x + across[0] * (size.verge / 2 - 1.5),
      lz = z + across[1] * (size.verge / 2 - 1.5);
    model.tag?.('town/street-light#');
    box(lx, 2, lz, 0.15, 4, 0.15, '#526466');
    lights.push(box(lx, 4, lz, 0.7, 0.25, 0.7, '#e5d69e', { streetLamp: true }));
    lightPools.push(...streetLightPool(box, lx, lz, 4.5));
    model.tag?.();
  }
  // Junctions: a square where roads meet square-on, a round apron where any road comes in at an
  // angle or along a curve, as wide as the widest road; a roundabout has its circle and island.
  for (const j of sim.map.junctions.filter((j) => j.id !== 'yard')) {
    const arms = sim.map.segments.filter(([a, b]) => a === j || b === j),
      angled = arms.some(([a, b]) => a.x !== b.x && a.z !== b.z),
      curved = arms.some((s) => s.line),
      asphalt = Math.max(12, ...arms.map((s) => ROAD_SIZES[s.lanes || 1].asphalt));
    const disc = (y, r, h, colour, extra = {}) =>
      objects.push(
        model.cylinder(j.x + origin.x, y, j.z + origin.z, r, h, colour, {
          community: true,
          ...extra,
        }),
      );
    if (j.roundabout) {
      disc(0.025, ROUNDABOUT.apron + 2, 0.1, '#c8c5b5');
      disc(0.09, ROUNDABOUT.apron, 0.05, '#414950');
      disc(0.16, ROUNDABOUT.island + 0.3, 0.18, '#adafa6');
      disc(0.2, ROUNDABOUT.island, 0.22, '#7f9c6b', { surface: 'grass' });
    } else if (!angled && !curved) box(j.x, 0.09, j.z, asphalt, 0.05, asphalt, '#414950');
    else
      for (const [y, r, h, colour] of [
        [0.025, asphalt / 2 + 3.5, 0.1, '#c8c5b5'],
        [0.09, asphalt / 2 + 1.5, 0.05, '#414950'],
      ])
        disc(y, r, h, colour);
  }
  if (model.farm) model.farm.driveway = drawFarmDriveway({ box, origin, sim });
  for (const c of sim.map.crossings) {
    const a = sim.map.walks.nodes[c.a],
      b = sim.map.walks.nodes[c.b],
      length = Math.hypot(b.x - a.x, b.z - a.z),
      dir = [(b.x - a.x) / length, (b.z - a.z) / length];
    // Zebra stripes: short along the crossing, 2 m across it.
    for (let t = 0.5; t < length; t += 1.5)
      piece(a.x + dir[0] * t, 0.14, a.z + dir[1] * t, dir, 0.7, 0.025, 2, '#f5efe0');
  }
  for (const [id, edges] of Object.entries(sim.map.walks.edges))
    for (const edge of edges) {
      if (
        id > edge.to ||
        (edge.originalProperty && model.homeDriveway && !model.farm) ||
        !(
          id.includes(':entrance:') ||
          edge.to.includes(':entrance:') ||
          edge.originalProperty ||
          edge.residential
        )
      )
        continue;
      const a = sim.map.walks.nodes[id],
        b = sim.map.walks.nodes[edge.to];
      box((a.x + b.x) / 2, 0.12, (a.z + b.z) / 2, edge.length, 0.1, 1.4, '#d7ceae', {
        rotation: [0, -Math.atan2(b.z - a.z, b.x - a.x), 0],
      });
    }
  // Roads, junctions, crossings and footpaths are laid out in the Street Editor, not moved as
  // objects: the world editor shows them locked (world-detach.js).
  for (const m of objects.slice(streetFrom)) if (!m.editGroup) m.editLock = 'street';
  for (const b of sim.map.buildings) {
    if (b.type === 'parking') {
      // Drawn from the simulation's footprint, which is also what a click on the lot selects.
      box(b.x, 0.11, b.z, b.w, 0.08, b.d, '#89958d');
      for (let x = b.x - 6; x <= b.x + 6; x += 4) box(x, 0.16, b.z, 0.1, 0.03, b.d - 3, '#f3ebc8');
      continue;
    }
    const facade = ['warehouse', 'factory'].includes(b.type)
      ? '#9da7a2'
      : location?.iso === 'MAR'
        ? '#d9ba96'
        : location?.iso === 'JPN'
          ? '#c6beaa'
          : b.type === 'office'
            ? '#b6c0bb'
            : '#b88b72';
    if (b.type === 'home' || b.residential || b.civic || b.recreation || b.regionalNeighbour)
      continue; // The regional home already exists in this scene.
    const h = b.type === 'office' ? 6 : b.type === 'factory' ? 5 : 4;
    // Cutaway walls have actual door gaps; floors and furniture remain visible from above.
    box(
      b.x,
      0.12,
      b.z,
      b.w,
      0.15,
      b.d,
      ['factory', 'warehouse'].includes(b.type) ? '#b3b7ad' : '#ddd5bc',
    );
    box(b.x, h / 2, b.z - b.d / 2, b.w, h, 0.25, facade, { solid: true });
    for (const side of [-1, 1])
      box(b.x + (side * b.w) / 2, h / 2, b.z, 0.25, h, b.d, facade, { solid: true });
    for (const side of [-1, 1])
      box(b.x + side * (b.w / 4 + 1), 1.3, b.z + b.d / 2, b.w / 2 - 2, 2.6, 0.25, facade, {
        solid: true,
      });
    const roof = box(b.x, h + 0.1, b.z, b.w + 0.5, 0.2, b.d + 0.5, '#6b797c', { opacity: 0.17 });
    model.roofs.push(roof);
    for (let x = b.x - b.w / 2 + 2; x < b.x + b.w / 2 - 1; x += 4)
      lights.push(box(x, 2, b.z - b.d / 2 + 0.2, 2, 1.2, 0.1, '#8fb8c5'));
    if (b.type === 'shop') {
      doors.push(box(b.x, 1.25, b.z + b.d / 2, 3, 2.5, 0.16, '#81b8c7'));
      box(b.x - 6, 0.7, b.z, 6, 1.4, 1.5, '#a07c56', { solid: true });
      box(b.x + 6, 1, b.z, 3, 2, 2, '#b8d4d5', { solid: true });
    }
    if (b.type === 'office')
      for (let i = 0; i < 4; i++)
        box(b.x - 7 + i * 4, 0.7, b.z, 2.6, 1.4, 1.5, '#9c856c', { solid: true });
    if (b.type === 'warehouse') {
      for (let x = b.x - 7; x <= b.x + 7; x += 7) {
        box(x, 1, b.z - 3, 5, 2, 4, '#ba946b', { solid: true });
        box(x, 2.5, b.z - 3, 5.5, 0.2, 4.5, '#576b6a');
      }
      box(22, 0.14, 37, 7, 0.12, 7, '#c7ba9c');
    }
    if (b.type === 'factory') {
      // Cylindrical flue and its collar bands are supplied by the architecture pass.
      box(b.x, 0.7, b.z + 3, 18, 1.3, 3, '#4b6165', { solid: true });
      for (let i = 0; i < 6; i++)
        machinery.push({
          mesh: box(b.x - 7 + i * 3, 1.65, b.z + 3, 1.6, 0.7, 1.8, '#cea565'),
          base: b.x - 7 + i * 3,
          center: b.x,
          tape: box(b.x - 7 + i * 3, 2.01, b.z + 3, 0.18, 0.025, 1.78, '#ded3ad'),
          label: box(b.x - 7 + i * 3 + 0.4, 1.7, b.z + 3.91, 0.55, 0.26, 0.015, '#e0d7bd'),
        });
      for (let x = b.x - 8; x <= b.x + 8; x += 8)
        box(x, 1.7, b.z - 4, 3, 3.4, 3, '#819ca0', { solid: true });
    }
  }
  barriers.push(box(30, 0.85, 37, 0.15, 0.18, 5, '#ddaa54'));
  signals.push(...buildTrafficSignals({ sim, box }));
  walks.node('road-control-approach', 11, 8);
  walks.node('road-control-station', 11, 11);
  for (const [a, b] of [
    [pavement(walks, '1:1/1/1'), 'road-control-approach'],
    ['road-control-approach', 'road-control-station'],
  ]) {
    walks.edge(a, b);
    walks.edge(b, a);
    const p = walks.nodes[a],
      q = walks.nodes[b];
    box(
      (p.x + q.x) / 2,
      0.12,
      (p.z + q.z) / 2,
      Math.hypot(p.x - q.x, p.z - q.z),
      0.1,
      1.4,
      '#d7ceae',
      { rotation: [0, -Math.atan2(q.z - p.z, q.x - p.x), 0] },
    );
  }
  sim.map.buildings.push({
    id: 'roads',
    type: 'roads',
    name: 'Road control station',
    district: 'Public infrastructure',
    x: 11,
    z: 11,
    w: 5,
    d: 5,
    node: 'road-control-station',
  });
  box(9, 1, 13, 1.5, 2, 1.5, '#647e7c', { solid: true });
  const areas = Object.entries(communityStations).map(([type, [name, x, z]]) => {
    const point = fromWorld(origin.x + x, origin.z + z);
    const recreationLot = recreationLots.find((b) => b.type === type);
    const bounds = recreationLot
      ? {
          minX: origin.x + recreationLot.x - recreationLot.w / 2 + 0.6,
          maxX: origin.x + recreationLot.x + recreationLot.w / 2 - 0.6,
          minZ: origin.z + recreationLot.z - recreationLot.d / 2 + 0.6,
          maxZ: origin.z + recreationLot.z + recreationLot.d / 2 - 0.6,
        }
      : undefined;
    model.rooms.push([
      name,
      origin.x + x,
      origin.z + z,
      {
        community: true,
        type,
        ...(recreationLot ? { district: recreationLot.district } : {}),
        ...(bounds ? { bounds } : {}),
      },
    ]);
    return [
      name,
      point.x,
      point.y,
      {
        communityType: type,
        ...(recreationLots.some((b) => b.type === type)
          ? { recreation: true, district: recreationLots.find((b) => b.type === type).district }
          : {}),
      },
    ];
  });
  areas.push(...neighbourAreas);
  const originalFloorHeight = model.floorHeight;
  model.floorHeight = (x, z) =>
    sim.map.buildings.some(
      (b) =>
        (['shop', 'office', 'warehouse', 'factory'].includes(b.type) ||
          b.residential ||
          b.civic ||
          b.recreation) &&
        Math.abs(x - origin.x - b.x) < b.w / 2 &&
        Math.abs(z - origin.z - b.z) < b.d / 2,
    )
      ? 0.2
      : originalFloorHeight?.(x, z) || 0;
  const warning = sphere(25, 3, 32, 0.35, '#777c71');
  const warnings = [
    warning,
    sphere(-25, 3, 36, 0.35, '#777c71'),
    sphere(24, 3, -23.5, 0.25, '#777c71'),
  ];
  const monitor = box(-12.1, 1.8, 24, 0.15, 1.4, 2, '#385a62');
  const gauge = box(-12, 1.8, 24, 0.16, 0.2, 0.9, '#83c99f');
  const civic = buildCivicBuildings(model, { sim, origin, box, objects });
  const recreation = buildRecreationAreas(model, { sim, origin, box });
  // Football field, outdoor gym and post office, where the northern blocks are free.
  const openBlocks = addOpenBlocks(model, { sim, origin, box, sphere });
  areas.push(...openBlocks.areas);
  recreation.push(...openBlocks.items);
  const recreationPeople = addRecreationPeople(model, { recreation, origin, box, sphere });
  const busStops = buildBusStops(model, { sim, origin, box, sphere });
  // Background people a renderer may draw as rigged characters (see World3D.extraCharacter):
  // passengers, parents, the gyms, the pool, the court and the football field. Children keep their
  // figures. clip: an activity played on the spot; moving/still: clips by whether they move.
  const outdoorGym = openBlocks.items.find((item) => item.people),
    football = openBlocks.items.find((item) => item.players),
    court = recreationPeople.find((g) => g.players),
    pool = recreationPeople.find((g) => g.swimmers),
    gym = recreationPeople.find((g) => g.runners);
  model.extraPeople = [
    ...busStops.flatMap((s) =>
      s.waiting.map((w, i) => ({ key: `bus:${s.stop.id}:${i}`, person: w.person, woman: i !== 1 })),
    ),
    ...recreationPeople
      .filter((g) => g.parents)
      .flatMap((g) =>
        g.parents.map((p, i) => ({ key: `parent:${g.type}:${i}`, person: p, woman: i === 0 })),
      ),
    ...(outdoorGym
      ? [
          { key: 'outdoorgym:walker', person: outdoorGym.people[1], woman: false, onTheSpot: true },
          {
            key: 'outdoorgym:squatter',
            person: outdoorGym.people[0],
            woman: true,
            clip: 'AirSquat',
          },
        ]
      : []),
    ...(court?.players || []).map((p, i) => ({
      key: 'basketball:' + i,
      person: p,
      woman: i % 2 === 0,
      moving: 'Jogging',
      still: () => (court.holder === p ? 'Dribble' : 'Idle'),
    })),
    ...(football?.players || []).map((p, i) => ({
      key: 'football:' + i,
      person: p,
      woman: i % 3 === 1,
      moving: 'Jogging',
      still: () => (football.kicker === p ? 'SoccerPass' : p.keeper ? 'GoalkeeperIdle' : 'Idle'),
    })),
    ...(gym
      ? [
          ...gym.runners.map((p, i) => ({
            key: 'gym:runner:' + i,
            person: p,
            woman: i === 1,
            clip: 'Jogging',
          })),
          {
            key: 'gym:lifter',
            person: gym.lifter,
            woman: false,
            clip: 'KettlebellSwing',
            standIn: [...gym.lifter.meshes, ...gym.dumbbells],
          },
          { key: 'gym:lunger', person: gym.lunger, woman: true, clip: 'AirSquat' },
        ]
      : []),
    // Swimmers have their own simple rig: the character swims where its body is, hips just under
    // the water (the clip's hips are 1.45 m above its feet).
    ...(pool?.swimmers || []).map((s, i) => ({
      key: 'swimmer:' + i,
      woman: i % 2 === 1,
      standIn: [s.parts.head, s.parts.body, ...s.parts.arms, ...s.parts.legs],
      place: () => ({
        x: s.parts.body.pos[0],
        y: s.parts.body.pos[1] - 1.42,
        z: s.parts.body.pos[2],
        angle: s.parts.body.rotation[1] ? -Math.PI / 2 : Math.PI / 2,
      }),
      clip: 'Breaststroke',
      still: 'TreadingWater',
    })),
  ];
  lights.push(...busStops.map((s) => s.lamp));
  const sections = civic.flatMap((building) => building.sections);
  areas.push(...sections.map((section) => section.area));
  const residences = buildCommunityResidences(model, { sim, origin, location, box, objects });
  detailCommunity(model, { sim, origin, location, box, objects });
  drawHomeStreetDriveway(model, { origin, box });
  const furnishings = furnishCommunity(model, { sim, origin, areas, objects });
  for (const item of recreation)
    furnishings.groups.push({
      id: 'recreation:' + item.building.type,
      area: item.building.name,
      parts: item.furniture,
      footprint: {
        x: origin.x + item.building.x,
        z: origin.z + item.building.z,
        w: item.building.w,
        d: item.building.d,
      },
      reusedFootprint: true,
    });
  // Pools are reused: no growing mesh arrays as people and vehicles finish trips.
  const vehicles = Array.from({ length: 30 }, () => {
    const parts = {
      shadow: model.sphere(0, -20, 0, 1, '#2b3430', {
        community: true,
        opacity: 0,
        surface: 'plain',
      }),
      body: box(0, -20, 0, 3.5, 0.75, 1.6, '#dfc36b', {
        opacity: 0,
        surface: 'plain',
        roughness: 0.28,
      }),
      glass: box(0, -20, 0, 1.6, 0.6, 1.4, '#527c89', { opacity: 0 }),
      roof: box(0, -20, 0, 1.5, 0.12, 1.45, '#dfc36b', { opacity: 0 }),
      grille: box(0, -20, 0, 0.08, 0.3, 0.75, '#39494b', { opacity: 0 }),
      cargo: box(0, -20, 0, 2.2, 1.7, 1.6, '#b6beb6', { opacity: 0 }),
      // Buses only: the kerb-side door and the indicator that flashes as they pull out.
      door: box(0, -20, 0, 0.9, 1.6, 0.06, '#3f5c66', { opacity: 0 }),
      indicator: box(0, -20, 0, 0.2, 0.12, 0.08, '#e8a33a', { opacity: 0 }),
    };
    for (const side of [-1, 1]) {
      for (const axle of [-1, 1]) {
        const wheel = model.cylinder(0, -20, 0, 0.32, 0.18, '#30393c', {
          community: true,
          opacity: 0,
        });
        objects.push(wheel);
        parts['wheel' + side + ':' + axle] = wheel;
      }
      parts['headlight' + side] = box(0, -20, 0, 0.09, 0.2, 0.36, '#e7dfb6', { opacity: 0 });
      parts['tail' + side] = box(0, -20, 0, 0.09, 0.16, 0.3, '#af4f3f', { opacity: 0 });
    }
    objects.push(parts.shadow);
    return parts;
  });
  const people = Array.from({ length: 31 }, () => {
    const parts = {
      shadow: model.sphere(0, -20, 0, 1, '#303a31', {
        community: true,
        opacity: 0,
        surface: 'plain',
      }),
      body: box(0, -20, 0, 0.4, 0.6, 0.25, '#96697b', { opacity: 0 }),
      head: sphere(0, -20, 0, 0.17, '#c39b7c'),
      hair: box(0, -20, 0, 0.32, 0.1, 0.3, '#625a4a', { opacity: 0, rounded: true }),
      eyeLeft: sphere(0, -20, 0, 0.018, '#35413d'),
      eyeRight: sphere(0, -20, 0, 0.018, '#35413d'),
    };
    for (const side of [-1, 1]) {
      parts['arm' + side] = box(0, -20, 0, 0.12, 0.55, 0.13, '#96697b', { opacity: 0 });
      parts['leg' + side] = box(0, -20, 0, 0.15, 0.58, 0.17, '#46565d', { opacity: 0 });
      parts['shoe' + side] = box(0, -20, 0, 0.17, 0.1, 0.28, '#394447', { opacity: 0 });
    }
    parts.head.opacity = parts.eyeLeft.opacity = parts.eyeRight.opacity = 0;
    objects.push(parts.shadow);
    return parts;
  });
  // Staff stay visibly at their workstations while the shared population travels.
  const workers = [
    {
      role: 'Shop assistant',
      area: 'Shop floor',
      x: 25.5,
      z: -28.5,
      shirt: '#4b7180',
      hair: '#514238',
    },
    {
      role: 'Office worker',
      area: 'Business office',
      x: 26.5,
      z: -10,
      shirt: '#566b63',
      hair: '#493d36',
    },
    {
      role: 'Warehouse worker',
      area: 'Loading bay',
      x: 26.5,
      z: 28.5,
      shirt: '#d59b43',
      hair: '#57483b',
    },
    {
      role: 'Warehouse worker',
      area: 'Loading bay',
      x: 24.2,
      z: 31,
      shirt: '#4c7883',
      hair: '#66523f',
    },
    {
      role: 'Factory operator',
      area: 'Factory floor',
      x: -23.5,
      z: 25.5,
      shirt: '#d29b47',
      hair: '#4d443a',
    },
    {
      role: 'Factory operator',
      area: 'Factory floor',
      x: -26.5,
      z: 28,
      shirt: '#718b79',
      hair: '#51463c',
    },
  ].map((worker, i) => {
    const id = `worker:${worker.area.toLowerCase().replaceAll(' ', '-')}:${i}`;
    const parts = [];
    const add = (shape, local, size, color, extra = {}) => {
      const mesh =
        shape === 'sphere'
          ? sphere(worker.x + local[0], local[1], worker.z + local[2], size[0] / 2, color, {
              actor: id,
              local: [...local],
              ...extra,
            })
          : box(worker.x + local[0], local[1], worker.z + local[2], ...size, color, {
              actor: id,
              local: [...local],
              ...extra,
            });
      parts.push(mesh);
      return mesh;
    };
    add('box', [0, 0.8, 0], [0.43, 0.5, 0.28], worker.shirt, { rounded: true });
    add('sphere', [0, 1.27, 0], [0.36, 0.36, 0.36], ['#c39b7c', '#a57b61', '#dbc0a2'][i % 3]);
    add('sphere', [0, 1.47, 0], [0.39, 0.14, 0.37], worker.hair);
    for (const side of [-1, 1]) {
      add('sphere', [side * 0.067, 1.31, 0.166], [0.037, 0.04, 0.025], '#eae6da');
      add('sphere', [side * 0.067, 1.31, 0.181], [0.016, 0.024, 0.013], '#35413d');
      add('box', [side * 0.14, 0.38, 0], [0.15, 0.48, 0.17], '#566766', {
        limb: 'leg',
        side,
      });
      add('box', [side * 0.14, 0.11, 0.055], [0.19, 0.16, 0.28], '#465852');
      add('box', [side * 0.29, 0.79, 0], [0.14, 0.47, 0.15], worker.shirt, {
        limb: 'arm',
        side,
      });
      add('sphere', [side * 0.29, 0.52, 0], [0.14, 0.14, 0.14], '#c39b7c');
    }
    const actor = {
      id,
      name: worker.role,
      role: worker.role,
      x: origin.x + worker.x,
      z: origin.z + worker.z,
      parts,
      color: worker.shirt,
      area: worker.area,
      section: `${worker.role} · ${worker.area} quest`,
    };
    model.actors.push(actor);
    return actor;
  });
  const rain = Array.from({ length: 64 }, (_, i) =>
    box(-55 + ((i * 17.3) % 110), 3, -55 + ((i * 29.1) % 110), 0.04, 0.7, 0.04, '#bfd4e0', {
      opacity: 0,
    }),
  );
  model.community = {
    sim,
    origin,
    areas,
    residences,
    civic,
    recreation,
    openBlocks: openBlocks.items,
    recreationPeople,
    busStops,
    sections,
    furnishings,
    rain,
    objects,
    lights,
    lightPools,
    signals,
    machinery,
    doors,
    barriers,
    warning,
    warnings,
    monitor,
    gauge,
    vehicles,
    people,
    workers,
  };
  tagTownGroups(model, { sim, origin, furnishings, busStops });
  // A high cloud layer and flocks of birds over the whole world.
  const placed = objects.filter((m) => m.pos[1] > -5);
  model.community.sky = addWorldSky(model, {
    seed: model.landscape?.seed ?? 1,
    town: {
      minX: Math.min(...placed.map((m) => m.pos[0])),
      maxX: Math.max(...placed.map((m) => m.pos[0])),
      minZ: Math.min(...placed.map((m) => m.pos[2])),
      maxZ: Math.max(...placed.map((m) => m.pos[2])),
    },
  });
  // Whatever is still loose becomes an edit group of its own, or is marked as locked (and why).
  tagLooseParts(model);
  return model.community;
}
// Edit groups for the world editor (see world-layout.js): each piece of furnishing, each bus stop,
// and each town lot (a shop, a residence, the park...) with everything else standing on it. People
// are left out (their animation places them every frame), as are roads and traffic signals.
function tagTownGroups(model, { sim, origin, furnishings, busStops }) {
  const people = new Set(
    (model.extraPeople || []).flatMap((p) => [...(p.person?.meshes || []), ...(p.standIn || [])]),
  );
  for (const group of furnishings.groups) {
    const id = 'town/furniture/' + group.id;
    for (const part of group.parts) part.editGroup = id;
    for (const c of model.colliders) if (c.communityFurnishing === group.id) c.editGroup = id;
  }
  busStops.forEach(({ parts, lamp }, i) => {
    for (const part of [...parts, lamp]) if (part) part.editGroup = 'town/bus-stop#' + (i + 1);
  });
  const lots = sim.map.buildings
    .filter((b) => !b.existingProperty)
    .map((b) => ({ id: 'town/' + b.id, x: origin.x + b.x, z: origin.z + b.z, w: b.w, d: b.d }))
    // The smallest lot wins where lots overlap.
    .sort((a, b) => a.w * a.d - b.w * b.d);
  // A building's own trim (fences, eaves, driveways) may reach a little past its lot.
  const lotAt = (x, z, margin = 0) =>
    lots.find((l) => Math.abs(x - l.x) <= l.w / 2 + margin && Math.abs(z - l.z) <= l.d / 2 + margin)
      ?.id;
  for (const m of model.objects) {
    if (!(m.community || m.regionalStreet) || m.editGroup || m.actor || m.pos[1] < -5) continue;
    if (people.has(m) || m.trafficSignal || m.busStop) continue;
    const lot = lotAt(m.pos[0], m.pos[2], m.residence || m.civic || m.recreation ? 3 : 0);
    if (lot) m.editGroup = lot;
  }
  for (const c of model.colliders)
    if (c.community && !c.editGroup && !c.communityFurnishing) {
      const lot = lotAt(c.x, c.z);
      if (lot) c.editGroup = lot;
    }
}
export function updateCommunityWorld(model, state, seconds) {
  const c = model.community;
  if (!c) return;
  const { sim, origin } = c;
  updateCivicBuildings([...c.civic, ...c.recreation], state);
  updateOpenBlocks(c.openBlocks || [], sim.time, state.reduced);
  updateRecreationPeople(c.recreationPeople || [], sim.time, state.reduced);
  for (const item of c.recreation) updateFountain(item.fountain, sim.time, state.reduced);
  updateBusStops(c.busStops || [], sim, sim.time, state.reduced);
  updateWorldSky(c.sky, state.env, state.paused ? 0 : seconds, state.reduced);
  sim.rain = state.env.rain || 0;
  sim.temperature = state.communityMission
    ? (state.env.temp ?? 24)
    : (state.env.outdoorTemp ?? state.env.temp ?? 24);
  sim.light = state.env.light ?? 70;
  sim.initialHour = state.skyStartHour ?? sim.initialHour ?? 8;
  if (state.communityMission) {
    sim.stopController();
    applyNativeCommunityOutputs(sim, state.devices, state.outputs, state.running);
  } else if (sim.nativeActive) {
    sim.nativeActive = false;
    if (sim.nativePhaseSignature) sim.signals.pending = null;
    sim.outputs = {};
    sim.nativePhaseSignature = null;
    sim.parkingControlled = false;
  }
  if (!state.paused && seconds > 0) sim.advance(seconds);
  updateResidentialDevices(c.residences, state, sim.time);
  updateCommunityEquipment(c.furnishings, state);
  c.rain.forEach((drop, i) => {
    drop.opacity = sim.rain > 0 ? 0.5 : 0;
    drop.pos[1] = 5 - ((sim.time * 5 + i * 0.7) % 5);
  });
  c.vehicles.forEach((parts, i) => {
    const v = sim.vehicles[i];
    for (const m of Object.values(parts)) m.opacity = v ? 1 : 0;
    if (!v) return;
    parts.shadow.opacity = 0.18;
    parts.shadow.size = [v.length + 0.2, 0.018, v.width + 0.3];
    parts.shadow.pos = [origin.x + v.x, 0.135, origin.z + v.z];
    parts.shadow.rotation = [0, -v.angle, 0];
    const car = v.kind === 'car',
      truck = v.kind === 'truck';
    const paint = ['#768b89', '#c5c1ab', '#4e6c81', '#ac6955', '#899272'][v.id % 5];
    // A bus steers in to the kerb over the 10 m before its stop, and back out before the end of
    // the lane so it is back in its lane by the junction.
    const lane = v.route[v.index],
      stop = v.kind === 'bus' ? lane?.busStop : null;
    let kerbShift = 0;
    if (stop && !stop.removed) {
      const d = v.progress - stop.at,
        out = Math.max(1, lane.length - stop.at - 0.5),
        s = d < 0 ? 1 + d / 10 : 1 - d / out,
        eased = Math.max(0, Math.min(1, s));
      kerbShift = sim.map.handedness * BUS_PULL_IN * eased * eased * (3 - 2 * eased);
    }
    const place = (mesh, dx, y, dzLocal) => {
      const dz = dzLocal + kerbShift;
      mesh.pos = [
        origin.x + v.x + Math.cos(v.angle) * dx - Math.sin(v.angle) * dz,
        y,
        origin.z + v.z + Math.sin(v.angle) * dx + Math.cos(v.angle) * dz,
      ];
      mesh.rotation = [0, -v.angle, 0];
    };
    place(parts.shadow, 0, 0.135, 0);
    parts.body.size = [v.length, car ? 0.75 : 1.35, v.width];
    parts.body.color = v.kind === 'bus' ? '#568b96' : paint;
    place(parts.body, 0, car ? 0.72 : 1.05, 0);
    parts.glass.size = [
      car ? v.length * 0.48 : truck ? 1.1 : v.length * 0.78,
      car ? 0.55 : 0.65,
      v.width * 0.91,
    ];
    place(parts.glass, truck ? v.length * 0.32 : -0.1, car ? 1.22 : 1.87, 0);
    parts.roof.size = [parts.glass.size[0] + 0.1, 0.12, v.width * 0.93];
    parts.roof.color = parts.body.color;
    place(parts.roof, truck ? v.length * 0.32 : -0.1, car ? 1.53 : 2.25, 0);
    place(parts.grille, v.length / 2 + 0.01, 0.73, 0);
    // Buses: a rounded body, a wrap-around window band and a rounded roof cap.
    const bus = v.kind === 'bus';
    parts.body.bevel = parts.glass.bevel = parts.roof.bevel = null;
    if (bus) {
      parts.body.size = [v.length, 1.5, v.width];
      parts.body.bevel = [0.35, 0.25, 0.3];
      place(parts.body, 0, 1.12, 0);
      parts.glass.size = [v.length * 0.94, 0.75, v.width * 1.01];
      parts.glass.bevel = [0.3, 0.08, 0.28];
      place(parts.glass, 0.02, 2.2, 0);
      parts.roof.size = [v.length, 0.3, v.width];
      parts.roof.bevel = [0.35, 0.13, 0.3];
      place(parts.roof, 0, 2.7, 0);
    }
    parts.door.opacity = parts.indicator.opacity = bus ? 1 : 0;
    if (bus) {
      const kerb = sim.map.handedness,
        open = v.atStop && v.dwell > 0;
      place(parts.door, v.length * 0.3, 1.2, kerb * (v.width / 2 + 0.02));
      parts.door.color = open ? '#1d2528' : '#3f5c66';
      parts.door.size = [open ? 0.25 : 0.9, 1.6, 0.06];
      place(parts.indicator, v.length / 2 - 0.15, 0.95, kerb * (v.width / 2 + 0.02));
      const flashing = v.atStop && v.dwell <= 0;
      parts.indicator.emission = flashing && Math.floor(sim.time * 3) % 2 ? 1 : 0;
    }
    parts.cargo.opacity = truck ? 1 : 0;
    parts.cargo.size = [v.length * 0.62, 1.7, v.width * 0.98];
    place(parts.cargo, -v.length * 0.16, 1.3, 0);
    for (const side of [-1, 1]) {
      for (const axle of [-1, 1]) {
        const wheel = parts['wheel' + side + ':' + axle];
        place(wheel, axle * v.length * 0.3, 0.39, side * v.width * 0.47);
        wheel.rotation = [Math.PI / 2, -v.angle, 0];
      }
      const headlight = parts['headlight' + side];
      place(headlight, v.length / 2 + 0.02, 0.82, side * v.width * 0.32);
      headlight.emission = sim.light < 44 || sim.rain > 0 ? 0.75 : 0.05;
      place(parts['tail' + side], -v.length / 2 - 0.02, 0.82, side * v.width * 0.32);
      parts['tail' + side].emission = v.speed < 0.1 ? 0.6 : 0.1;
    }
  });
  c.people.forEach((parts, i) => {
    const p = sim.people[i];
    for (const mesh of Object.values(parts)) mesh.opacity = p ? 1 : 0;
    if (!p) return;
    parts.shadow.opacity = 0.16;
    parts.shadow.size = [0.65, 0.015, 0.5];
    parts.shadow.pos = [origin.x + p.x, 0.18, origin.z + p.z];
    const walking = p.status === 'Walking',
      phase = walking && !state.reduced ? Math.sin(sim.time * 8 + p.id) : 0;
    const shirt = ['#72857c', '#ab7864', '#648396', '#9b9173', '#7a7189'][p.id % 5];
    const place = (mesh, side, y, ahead = 0) => {
      mesh.pos = [
        origin.x + p.x - Math.sin(p.angle) * side + Math.cos(p.angle) * ahead,
        y,
        origin.z + p.z + Math.cos(p.angle) * side + Math.sin(p.angle) * ahead,
      ];
      mesh.rotation = [0, Math.PI / 2 - p.angle, 0];
    };
    place(parts.body, 0, 1.07);
    parts.body.color = shirt;
    place(parts.head, 0, 1.57);
    place(parts.hair, 0, 1.72);
    place(parts.eyeLeft, -0.06, 1.6, 0.157);
    place(parts.eyeRight, 0.06, 1.6, 0.157);
    parts.head.color = ['#c39b7c', '#a57b61', '#dbc0a2', '#916c53'][p.id % 4];
    for (const side of [-1, 1]) {
      const arm = parts['arm' + side],
        leg = parts['leg' + side],
        shoe = parts['shoe' + side];
      place(arm, side * 0.26, 1, -phase * side * 0.12);
      arm.color = shirt;
      place(leg, side * 0.11, 0.48, phase * side * 0.15);
      place(shoe, side * 0.11, 0.18, 0.06 + phase * side * 0.18);
    }
  });
  for (const s of c.signals) {
    const activeColor = (mesh, active, lit, unlit) => {
      mesh.color = active ? lit : unlit;
      mesh.emission = active ? 1 : 0;
    };
    const signals = sim.signalsAt(s.junction);
    const aspect = trafficAspect(signals.phase, s.axis, signals.next);
    activeColor(s.red, aspect.red, '#ff5147', '#702e2c');
    activeColor(s.amber, aspect.amber, '#ffc247', '#76531e');
    activeColor(s.green, aspect.green, '#5bef82', '#285c3c');
  }
  // A program driving the street-light output controls the lamps (the street-light quest);
  // otherwise they switch on by themselves once the light level falls below 40 (dusk).
  const lampsOn = 3 in sim.outputs ? !!sim.outputs[3] : (sim.light ?? 70) < STREET_LIGHT_LEVEL;
  for (const light of c.lights) light.emission = lampsOn ? 1 : 0;
  for (const pool of c.lightPools) pool.opacity = lampsOn ? pool.poolOpacity : 0;
  for (const m of c.machinery) {
    m.mesh.pos[0] =
      origin.x +
      m.center -
      8 +
      ((m.base - m.center + 8 + (sim.outputs[7] ? sim.time * 2 : 0)) % 17);
    m.tape.pos[0] = m.mesh.pos[0];
    m.label.pos[0] = m.mesh.pos[0] + 0.4;
  }
  for (const door of c.doors) door.opacity = sim.outputs[2] ? 0.18 : 1;
  for (const b of c.barriers) b.rotation[0] = sim.outputs[6] ? Math.PI / 2 : 0;
  for (const warning of c.warnings) {
    warning.emission = sim.outputs[4] ? 1 : 0;
    warning.color = sim.outputs[4] ? '#ffae44' : '#777c71';
  }
  if (state.communityMission) sim.nativeVibration = state.env.vibration;
  c.gauge.size[1] = Math.max(0.1, Math.min(1.2, (sim.temperature || 24) / 60));
  c.gauge.emission = sim.outputs[7] ? 0.6 : 0;
}
