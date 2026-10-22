import { pavement } from './street-network.js';
import { fromWorld } from './world-math.js';
import { figure, placeFigure, gaitPose, standPose, SKIN } from './figures.js';

// The three northern blocks are free unless a location's terrace or suburb neighbours already
// live there (see regional-neighbourhood.js); in that case none of these places are built.
export const openBlockLots = [
  {
    type: 'football',
    name: 'Northside football field',
    resident: 'Coach Amara Diallo',
    role: 'Football coach',
    x: 24,
    z: 72,
    w: 28,
    d: 30,
    height: 1,
    openAir: true,
  },
  {
    type: 'outdoorgym',
    name: 'Northside outdoor gym',
    resident: 'Riley Morgan',
    role: 'Outdoor fitness trainer',
    x: -24,
    z: 72,
    w: 28,
    d: 30,
    height: 1,
    openAir: true,
  },
  {
    type: 'postoffice',
    name: 'Northside post office',
    resident: 'Priya Shah',
    role: 'Postmaster',
    x: 72,
    z: 72,
    w: 28,
    d: 30,
    height: 4,
    shadow: { dx: 0, dz: -3, w: 20, d: 14 },
  },
].map((b) => ({
  ...b,
  id: b.type,
  recreation: true,
  district: 'Northside',
  stationX: b.x - 9,
  stationZ: b.z,
}));

function buildFootball({ b, add, sphere, origin, furniture }) {
  const green = ['#5f9a4e', '#6aa657'];
  const W = 24,
    L = 27;
  // Mown stripes across the pitch, then the white markings.
  for (let i = 0; i < 9; i++)
    add(b.x, 0.2, b.z - L / 2 + (i + 0.5) * (L / 9), W, 0.04, L / 9, green[i % 2], {
      surface: 'grass',
      rounded: false,
    });
  add(b.x, 0.2, b.z, b.w, 0.03, b.d, '#4f8743', { surface: 'grass', rounded: false });
  const line = (x, z, w, d) =>
    add(x, 0.225, z, w, 0.01, d, '#f4f4ec', { surface: 'plain', rounded: false });
  for (const side of [-1, 1]) {
    line(b.x + (side * W) / 2, b.z, 0.12, L);
    line(b.x, b.z + (side * L) / 2, W, 0.12);
    // Penalty area, goal area and penalty spot at each end.
    const end = b.z + (side * L) / 2;
    line(b.x, end - side * 4.5, 11, 0.12);
    for (const s of [-1, 1]) line(b.x + s * 5.5, end - side * 2.25, 0.12, 4.5);
    line(b.x, end - side * 1.8, 5.5, 0.12);
    for (const s of [-1, 1]) line(b.x + s * 2.75, end - side * 0.9, 0.12, 1.8);
    line(b.x, end - side * 3.3, 0.22, 0.22);
    // Goal: posts, crossbar and a translucent net.
    for (const s of [-1, 1])
      add(b.x + s * 1.85, 1.2, end, 0.12, 2, 0.12, '#f7f7f2', { surface: 'plain' });
    add(b.x, 2.17, end, 3.82, 0.12, 0.12, '#f7f7f2', { surface: 'plain' });
    add(b.x, 1.2, end + side * 0.8, 3.7, 1.9, 0.03, '#e8ece6', { opacity: 0.35 });
    add(b.x, 2.12, end + side * 0.4, 3.7, 0.03, 0.8, '#e8ece6', { opacity: 0.35 });
  }
  line(b.x, b.z, W, 0.12);
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * Math.PI * 2;
    add(b.x + Math.cos(a) * 3, 0.225, b.z + Math.sin(a) * 3, 0.12, 0.01, 0.7, '#f4f4ec', {
      surface: 'plain',
      rotation: [0, -a, 0],
      rounded: false,
    });
  }
  // Corner flags and a team bench on the west touchline.
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const x = b.x + (sx * W) / 2,
        z = b.z + (sz * L) / 2;
      furniture.push(add(x, 0.8, z, 0.04, 1.2, 0.04, '#e4e2d6'));
      furniture.push(add(x, 1.3, z + 0.18, 0.02, 0.24, 0.32, '#e0b13c'));
    }
  furniture.push(add(b.x - 13.2, 0.55, b.z + 2, 0.5, 0.08, 4, '#3f6a8a', { solid: true }));
  furniture.push(add(b.x - 13.5, 1, b.z + 2, 0.5, 1.6, 4.2, '#a8c4cc', { opacity: 0.5 }));
  // Floodlight (the installable lamp) and a scoreboard (the indicator).
  add(b.x + 13.4, 3.2, b.z - 13.5, 0.2, 6, 0.2, '#7d8c8e', { surface: 'steel' });
  const lamp = add(b.x + 13.1, 6.2, b.z - 13.2, 1, 0.5, 0.25, '#efe6c4', { emission: 0 });
  add(b.x - 13.4, 1.5, b.z - 13.5, 0.15, 2.6, 0.15, '#4b5a5c', { surface: 'steel' });
  const indicator = add(b.x - 13.4, 2.9, b.z - 13.5, 0.3, 0.9, 2, '#2f3f44', { emission: 0 });
  // Two teams of five, each with a goalkeeper; the ball moves between them.
  const players = [];
  const kits = [
    ['#c8463c', '#f2f0e6'],
    ['#2f6fb0', '#1f2a36'],
  ];
  const formation = [
    [0, -12],
    [-6, -6],
    [6, -6],
    [-3, -1.5],
    [4, -2.5],
  ];
  for (const [team, [shirt, shorts]] of kits.entries())
    for (const [i, [fx, fz]] of formation.entries()) {
      const home = [b.x + fx, b.z + (team ? -fz : fz)];
      const keeper = i === 0;
      const person = figure(add, sphere, origin, {
        x: home[0],
        z: home[1],
        shirt: keeper ? '#e0c040' : shirt,
        shorts,
        skin: SKIN[(team * 5 + i) % SKIN.length],
      });
      Object.assign(person, { home, keeper, team, phase: team * 2.3 + i * 1.7 });
      furniture.push(...person.meshes);
      Object.assign(person, {
        px: home[0],
        pz: home[1],
        stride: 0,
        facing: team ? -Math.PI / 2 : Math.PI / 2,
      });
      players.push(person);
    }
  const ball = sphere(b.x, 0.33, b.z, 0.11, '#f8f8f4', { surface: 'plain' });
  furniture.push(ball);
  return { lamp, indicator, players, ball, lastT: 0 };
}

function buildOutdoorGym({ b, add, sphere, origin, furniture }) {
  add(b.x, 0.2, b.z, b.w, 0.03, b.d, '#79a25f', { surface: 'grass', rounded: false });
  // Soft-fall rubber pads under each station, joined by a looping path.
  add(b.x, 0.215, b.z + 13, 3, 0.02, 4, '#d6cdb0', { rounded: false });
  add(b.x, 0.215, b.z, 20, 0.02, 2, '#d6cdb0', { rounded: false });
  for (const sx of [-1, 1])
    add(b.x + sx * 9, 0.215, b.z, 2, 0.02, 22, '#d6cdb0', { rounded: false });
  const frame = '#3f7a5c',
    steel = { surface: 'steel' };
  const pad = (x, z, w, d) =>
    add(b.x + x, 0.22, b.z + z, w, 0.03, d, '#b5583f', { surface: 'rubber', rounded: false });
  const post = (x, z, h) =>
    furniture.push(add(b.x + x, 0.2 + h / 2, b.z + z, 0.14, h, 0.14, frame, steel));
  const bar = (x, y, z, w, d) =>
    furniture.push(add(b.x + x, y, b.z + z, w, 0.07, d, '#c9cfcb', steel));
  // Pull-up bars at three heights.
  pad(-4, -7, 6, 3);
  for (const [i, x] of [-6.5, -4, -1.5].entries()) {
    const h = 2 + i * 0.25;
    post(x - 1, -7, h + 0.1);
    post(x + 1, -7, h + 0.1);
    bar(x, 0.2 + h, -7, 2, 0.07);
  }
  // Parallel dip bars.
  pad(4, -7, 4, 3);
  for (const s of [-1, 1]) {
    post(3, -7 + s * 0.3, 1.2);
    post(5, -7 + s * 0.3, 1.2);
    bar(4, 1.4, -7 + s * 0.3, 2.2, 0.07);
  }
  // Sit-up benches and push-up bars.
  pad(-4, 6.5, 6, 3.5);
  for (const x of [-5.5, -2.5]) {
    furniture.push(
      add(b.x + x, 0.6, b.z + 6.5, 0.5, 0.08, 1.8, '#4f8a6b', {
        solid: true,
        rotation: [0.25, 0, 0],
      }),
    );
    post(x, 7.5, 0.6);
  }
  // Cross trainer and rower: frames, handles and seats.
  pad(4, 6.5, 5, 3.5);
  furniture.push(add(b.x + 3, 0.45, b.z + 6.5, 0.6, 0.25, 1.6, frame, { solid: true }));
  post(3, 5.8, 1.5);
  for (const s of [-1, 1]) bar(3 + s * 0.25, 1.4, 5.9, 0.07, 0.6);
  furniture.push(add(b.x + 5.5, 0.4, b.z + 6.5, 0.4, 0.15, 2.2, frame, { solid: true }));
  furniture.push(add(b.x + 5.5, 0.6, b.z + 6.9, 0.4, 0.1, 0.45, '#2f3a3d'));
  bar(5.5, 0.75, 5.5, 0.6, 0.07);
  // Benches, trees and a drinking fountain around the edge.
  for (const z of [-11, 11]) {
    furniture.push(
      add(b.x - 11, 0.5, b.z + z, 0.5, 0.08, 2.2, '#b8a074', { solid: true, surface: 'timber' }),
    );
    for (const dz of [-0.8, 0.8]) add(b.x - 11, 0.33, b.z + z + dz, 0.4, 0.3, 0.08, '#677c80');
  }
  for (const [x, z] of [
    [11, -11],
    [11, 11],
    [-11, 0],
  ]) {
    add(b.x + x, 1.2, b.z + z, 0.3, 2, 0.3, '#6e5a44');
    sphere(b.x + x, 2.9, b.z + z, 1.6, '#5f8c4c', { shape: 'foliage' });
  }
  furniture.push(add(b.x + 11, 0.65, b.z, 0.5, 0.9, 0.5, '#8a9a9c', { solid: true, ...steel }));
  // Lamp post (the installable lamp) and an info board (the indicator).
  add(b.x - 11, 2, b.z - 3, 0.15, 3.6, 0.15, '#526466', steel);
  const lamp = add(b.x - 11, 3.9, b.z - 3, 0.6, 0.25, 0.6, '#efe6c4', { emission: 0 });
  add(b.x - 11, 1.2, b.z + 3, 0.12, 2, 0.12, '#526466', steel);
  const indicator = add(b.x - 11, 1.9, b.z + 3, 0.1, 0.9, 1.4, '#3f7a5c', { emission: 0 });
  // Two people training.
  const people = [
    [b.x - 4, b.z - 6, '#d0703f'],
    [b.x + 3, b.z + 7.4, '#5a7fb0'],
  ].map(([x, z, shirt], i) => {
    const person = figure(add, sphere, origin, {
      x,
      z,
      shirt,
      shorts: '#2c3134',
      skin: SKIN[i + 2],
    });
    furniture.push(...person.meshes);
    person.facing = i ? Math.PI / 2 : -Math.PI / 2;
    return person;
  });
  // A squatter beside the pull-up bars and a walker on the cross trainer.
  people[1].x = b.x + 3;
  people[1].z = b.z + 6.5;
  return { lamp, indicator, people };
}

function buildPostOffice({ b, add, sphere, model, furniture }) {
  const red = '#c8282f',
    wallColor = '#e8e2d4',
    h = 3.6;
  add(b.x, 0.2, b.z, b.w, 0.03, b.d, '#c7c3b4', { surface: 'stone', rounded: false });
  // Building: 20 x 14 m, door facing the northern street.
  const x0 = b.x - 10,
    x1 = b.x + 10,
    z0 = b.z - 10,
    z1 = b.z + 4;
  add(b.x, 0.22, (z0 + z1) / 2, 20, 0.04, 14, '#d9d5c6', { surface: 'tile', rounded: false });
  const wall = (ax, az, bx, bz, color = wallColor) =>
    add(
      (ax + bx) / 2,
      0.2 + h / 2,
      (az + bz) / 2,
      Math.max(0.2, bx - ax),
      h,
      Math.max(0.2, bz - az),
      color,
      {
        solid: true,
        architectureMesh: true,
      },
    );
  wall(x0, z0, x1, z0);
  wall(x0, z0, x0, z1);
  wall(x1, z0, x1, z1);
  wall(x0, z1, b.x - 1.5, z1);
  wall(b.x + 1.5, z1, x1, z1);
  add(b.x, 0.2 + h - 0.4, z1, 3, 0.8, 0.2, wallColor, { architectureMesh: true });
  // Red fascia band and shopfront glazing either side of the door.
  add(b.x, 0.2 + h + 0.25, z1 + 0.15, 20.4, 0.5, 0.15, red);
  for (const s of [-1, 1])
    add(b.x + s * 5.5, 1.8, z1 + 0.12, 6, 1.8, 0.04, '#8fb8c5', {
      surface: 'glass',
      opacity: 0.65,
    });
  add(b.x, 0.2 + h + 0.25, z1 + 0.24, 4, 0.34, 0.03, '#f6f1e4', { surface: 'plain' });
  const roof = add(b.x, h + 0.35, (z0 + z1) / 2, 20.4, 0.2, 14.4, '#7b4a46', {
    opacity: 0,
    cutawayOpacity: 0,
  });
  model.roofs.push(roof);
  // Service counter with screens, a queue line and parcel shelving behind.
  furniture.push(
    add(b.x, 0.75, b.z - 4, 12, 1.1, 0.8, '#9b7a5a', { solid: true, surface: 'timber' }),
  );
  furniture.push(add(b.x, 1.33, b.z - 4, 12.2, 0.06, 0.9, '#e3dccb'));
  for (const x of [-4, 0, 4]) {
    furniture.push(add(b.x + x, 1.6, b.z - 4.2, 0.6, 0.4, 0.05, '#2e3d44'));
    furniture.push(
      add(b.x + x, 1.95, b.z - 3.65, 0.9, 0.9, 0.03, '#b9d4da', { opacity: 0.5, surface: 'glass' }),
    );
  }
  for (const x of [-3, -1, 1, 3])
    furniture.push(add(b.x + x, 0.65, b.z - 1.2, 0.08, 0.9, 0.08, '#c4c9bf', { surface: 'steel' }));
  furniture.push(add(b.x, 1.05, b.z - 1.2, 6, 0.06, 0.03, red));
  for (const x of [-7, -4.5, 4.5, 7]) {
    furniture.push(
      add(b.x + x, 1.3, b.z - 9.4, 2.2, 2.2, 0.6, '#8a8f88', { solid: true, surface: 'steel' }),
    );
    for (const [y, color] of [
      [0.6, '#c8a674'],
      [1.3, '#b7905f'],
      [2, '#d2b583'],
    ])
      furniture.push(add(b.x + x, y + 0.1, b.z - 9.1, 1.8, 0.4, 0.4, color, { surface: 'fabric' }));
  }
  // Wall of PO boxes inside the west wall.
  for (let row = 0; row < 5; row++)
    for (let col = 0; col < 8; col++)
      furniture.push(
        add(
          x0 + 0.13,
          0.7 + row * 0.42,
          b.z - 7 + col * 0.7,
          0.04,
          0.36,
          0.6,
          row % 2 ? '#b8a46d' : '#c7b37a',
          {
            surface: 'steel',
          },
        ),
      );
  // Outside: parcel lockers, a red post box and the delivery van.
  for (let i = 0; i < 3; i++) {
    furniture.push(add(b.x + 6 + i * 1.1, 1.1, b.z + 6, 1, 1.8, 0.6, '#d03a32', { solid: true }));
    for (let r = 0; r < 4; r++)
      furniture.push(
        add(b.x + 6 + i * 1.1, 0.5 + r * 0.42, b.z + 6.31, 0.9, 0.36, 0.02, '#e9e4d8'),
      );
  }
  furniture.push(add(b.x - 4, 0.75, b.z + 13, 0.6, 1.1, 0.5, red, { solid: true, bevel: 0.2 }));
  furniture.push(add(b.x - 4, 1.35, b.z + 13, 0.65, 0.15, 0.55, red, { bevel: 0.07 }));
  furniture.push(add(b.x - 4, 1.05, b.z + 13.26, 0.35, 0.05, 0.02, '#2a2a2a'));
  const vx = b.x - 7,
    vz = b.z + 7.5;
  furniture.push(
    add(vx, 1.15, vz, 4.6, 1.75, 1.9, '#f2efe6', { solid: true, bevel: [0.4, 0.25, 0.3] }),
  );
  furniture.push(
    add(vx + 1.6, 1.5, vz, 1.1, 0.6, 1.94, '#35505a', {
      surface: 'glass',
      bevel: [0.25, 0.1, 0.2],
    }),
  );
  furniture.push(add(vx, 0.85, vz, 4.62, 0.18, 1.92, red));
  for (const sx of [-1, 1])
    for (const sz of [-1, 1])
      furniture.push(
        add(vx + sx * 1.45, 0.53, vz + sz * 0.85, 0.66, 0.24, 0.66, '#262d30', {
          shape: 'cylinder',
          rotation: [Math.PI / 2, 0, 0],
          surface: 'rubber',
        }),
      );
  // Ceiling light (the installable lamp) and a queue display (the indicator).
  const lamp = add(b.x, h - 0.1, b.z - 3, 2.4, 0.12, 0.6, '#efe6c4', { emission: 0 });
  const indicator = add(b.x, 2.6, b.z - 0.6, 1.6, 0.5, 0.06, '#2f3f44', { emission: 0 });
  return { lamp, indicator };
}

// Adds the lots to the simulation, builds them and returns their areas and update items.
export function addOpenBlocks(model, { sim, origin, box, sphere }) {
  if ((model.neighbourHouses || []).length) return { areas: [], items: [] };
  const { walks } = sim.map;
  const areas = [],
    items = [];
  for (const lot of openBlockLots) {
    const b = { ...lot };
    // Entrance from the northern pavement, like the park.
    const corner = pavement(walks, `${Math.floor(b.x / 48) + 1}:3/1/-1`);
    const node = walks.node(`${b.id}:entrance:0`, b.x, 88);
    walks.edge(corner, node);
    walks.edge(node, corner);
    b.node = node;
    sim.map.buildings.push(b);
    const furniture = [];
    const add = (x, y, z, w, h, d, color, extra = {}) =>
      box(x, y, z, w, h, d, color, { recreation: b.type, roughness: 0.75, ...extra });
    const ball = (x, y, z, r, color, extra = {}) =>
      sphere(x, y, z, r, color, { recreation: b.type, roughness: 0.7, ...extra });
    const built = (
      b.type === 'football'
        ? buildFootball
        : b.type === 'outdoorgym'
          ? buildOutdoorGym
          : buildPostOffice
    )({ b, add, sphere: ball, origin, model, furniture });
    const actorX = b.type === 'football' ? b.x - 12.6 : b.type === 'outdoorgym' ? b.x - 9 : b.x;
    const actorZ = b.type === 'football' ? b.z - 2 : b.type === 'outdoorgym' ? b.z - 3 : b.z - 5.2;
    model.addActor('openblock:' + b.type, origin.x + actorX, origin.z + actorZ, '#5b9caf', SKIN[0]);
    Object.assign(model.actors.at(-1), {
      community: true,
      name: b.resident,
      role: b.role,
      area: b.name,
      section: b.name,
    });
    const bounds = {
      minX: origin.x + b.x - b.w / 2 + 0.6,
      maxX: origin.x + b.x + b.w / 2 - 0.6,
      minZ: origin.z + b.z - b.d / 2 + 0.6,
      maxZ: origin.z + b.z + b.d / 2 - 0.6,
    };
    model.rooms.push([
      b.name,
      origin.x + b.stationX,
      origin.z + b.stationZ,
      { community: true, type: b.type, district: b.district, bounds },
    ]);
    const point = fromWorld(origin.x + b.stationX, origin.z + b.stationZ);
    areas.push([
      b.name,
      point.x,
      point.y,
      { communityType: b.type, recreation: true, district: b.district },
    ]);
    items.push({ building: b, sections: [], furniture, ...built });
  }
  return { areas, items };
}

// A passing game: the player on the ball dribbles it at their feet, then passes along the ground
// to a teammate; possession changes now and then. Everyone runs to a spot that follows the ball,
// with a gait matched to their speed. Keepers stay on their line in a ready stance.
const PASS = 3,
  DRIBBLE = 1.8;
function holderFor(players, k) {
  const team = Math.floor(k / 4) % 2,
    outfield = players.filter((p) => p.team === team && !p.keeper);
  return outfield[(k * 7 + 3) % outfield.length];
}
function footOf(p) {
  return [p.px + Math.cos(p.facing) * 0.45, p.pz + Math.sin(p.facing) * 0.45];
}
export function updateOpenBlocks(items, time, reduced) {
  for (const item of items) {
    if (item.players) updateFootball(item, time, reduced);
    if (item.people) {
      const [squatter, walker] = item.people,
        t = reduced ? 0 : time;
      const s = (1 - Math.cos(t * 2.2)) / 2;
      placeFigure(squatter, squatter.x, squatter.z, squatter.facing, {
        legs: [
          [1.15 * s, 2.1 * s],
          [1.15 * s, 2.1 * s],
        ],
        arms: [
          [1.4 * s, 0.1],
          [1.4 * s, 0.1],
        ],
        lean: 0.55 * s,
        bob: 0,
      });
      // The cross trainer: a steady walking stride on the spot, raised on its foot plates.
      placeFigure(walker, walker.x, walker.z, walker.facing, gaitPose(t * 5, 0.1), 0.45);
    }
  }
}
function updateFootball(item, time, reduced) {
  const { players, building: b } = item;
  const t = reduced ? 0 : time,
    dt = Math.max(0, Math.min(0.2, t - (item.lastT ?? t)));
  item.lastT = t;
  const k = Math.floor(t / PASS),
    into = t - k * PASS,
    holder = holderFor(players, k),
    receiver = holderFor(players, k + 1);
  // For renderers drawing rigged players: who has the ball, and who is kicking it this moment.
  item.holder = holder;
  item.kicker = Math.abs(into - DRIBBLE) < 0.25 ? holder : null;
  // The ball: at the holder's feet while dribbling, then rolling to the receiver.
  let [bx, bz] = footOf(holder);
  if (into > DRIBBLE) {
    const s = (into - DRIBBLE) / (PASS - DRIBBLE),
      ease = 1 - (1 - s) * (1 - s),
      [rx, rz] = footOf(receiver);
    bx += (rx - bx) * ease;
    bz += (rz - bz) * ease;
  }
  const attackZ = holder.team ? -1 : 1;
  for (const p of players) {
    let tx, tz;
    if (p.keeper) {
      tx = b.x + Math.max(-1.6, Math.min(1.6, (bx - b.x) * 0.25));
      tz = p.home[1];
    } else if (p === holder && into <= DRIBBLE) {
      tx = p.px + Math.cos(p.facing) * 2;
      tz = p.pz + attackZ * 2;
    } else if (p === receiver && into > DRIBBLE) {
      [tx, tz] = [bx, bz];
    } else {
      tx = p.home[0] + (bx - p.home[0]) * 0.35;
      tz = p.home[1] + (bz - p.home[1]) * 0.35 + attackZ * 2;
    }
    tx = Math.max(b.x - 11.5, Math.min(b.x + 11.5, tx));
    tz = Math.max(b.z - 13, Math.min(b.z + 13, tz));
    const dx = tx - p.px,
      dz = tz - p.pz,
      dist = Math.hypot(dx, dz),
      step = Math.min(dist, (p.keeper ? 3 : 6.5) * dt);
    if (dist > 0.01) {
      p.px += (dx / dist) * step;
      p.pz += (dz / dist) * step;
    }
    const speed = dt > 0 ? step / dt : 0;
    p.stride += step * 2.4;
    // Face the run, or the ball when standing; turn smoothly.
    const want = speed > 0.6 ? Math.atan2(dz, dx) : Math.atan2(bz - p.pz, bx - p.px);
    const turn = Math.atan2(Math.sin(want - p.facing), Math.cos(want - p.facing));
    p.facing += turn * Math.min(1, dt * 8);
    let pose;
    if (p.keeper)
      pose = {
        legs: [
          [0.35, 0.7],
          [0.35, 0.7],
        ],
        arms: [
          [0.7, 0.6],
          [0.7, 0.6],
        ],
        lean: 0.3,
        bob: 0,
      };
    else if (speed > 0.3) pose = gaitPose(p.stride, Math.min(1, speed / 6.5));
    else pose = standPose({ sway: Math.sin(t * 1.3 + p.phase) * 0.03 });
    // A kick as the pass leaves: the right leg swings through.
    if (p === holder && into > DRIBBLE - 0.25 && into < DRIBBLE + 0.25) {
      const s = (into - (DRIBBLE - 0.25)) / 0.5;
      pose.legs = [pose.legs[0], [-0.6 + 1.6 * s, 0.9 * (1 - s)]];
    }
    placeFigure(p, p.px, p.pz, p.facing, pose, 0.22);
  }
  const roll = into > DRIBBLE ? 0 : Math.abs(Math.sin(t * 6)) * 0.04;
  item.ball.pos = [players[0].origin.x + bx, 0.33 + roll, players[0].origin.z + bz];
}
