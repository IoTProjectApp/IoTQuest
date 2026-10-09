import { buildTree } from './vegetation.js';
import { extraLocations } from './destination-catalog.js';
import { melbourneSuburbs } from './melbourne.js';
import { victorianFarms } from './farms.js';
import { buildFarm } from './farm-assets.js';
import { createWorldModel } from './world-model.js';
import { addClouds } from './clouds.js';
import { addSky } from './sky.js';
import { homeVariant } from './home-variants.js';
// Reusable geometry builders: courts, round enclosures, roof forms and planting.
// Each destination has an explicit layout/material/style configuration.
export function buildDestinationModel(id) {
  const l = [...extraLocations, ...melbourneSuburbs, ...victorianFarms].find((l) => l.id === id);
  if (!l) return null;
  const m = createWorldModel(homeVariant(l)),
    { box, cylinder, sphere, mesh, roof, flatRoof } = m;
  m.region = id;
  m.architecture = l.style;
  m.gardenLayout = l.planting;
  m.floorHeight = (x, z) => (x > -13.1 && x < 1.4 && z > -11 && z < -1 ? 0.23 : 0);
  m.areaOverrides = {};
  // Style filters remove interior geometry only. Objects animated through m.rain and
  // m.dynamic are always kept or rebuilt so the animation loop never updates hidden meshes.
  const rainDrops = new Set(m.rain);
  const removeObjects = (remove) => {
    const kept = m.objects.filter((o) => o.actor || rainDrops.has(o) || !remove(o));
    m.objects.splice(0, m.objects.length, ...kept);
  };
  for (const o of m.objects) {
    if (['#f1e5cc', '#eadbbf'].includes(o.color)) o.color = l.wall;
    if (o.color === '#abc68b')
      o.color = ['desert', 'dry'].includes(l.climate)
        ? '#c6bb8b'
        : ['cold', 'highland'].includes(l.climate)
          ? '#92ab8d'
          : '#a5bd87';
  }
  const courtStyles = [
    'swahili',
    'nubian',
    'nalukettu',
    'haveli',
    'siheyuan',
    'najdi',
    'andalusian',
    'mexican',
  ];
  if (courtStyles.includes(l.style)) {
    // Open the central two room bays into a genuine central court. Service rooms
    // are moved to a small side annex so the house remains fully explorable.
    removeObjects((o) => o.pos[0] > -8.1 && o.pos[0] < -3.5 && o.pos[2] < -1 && o.pos[2] > -10.9);
    m.colliders.splice(
      0,
      m.colliders.length,
      ...m.colliders.filter((c) => !(c.x > -8.1 && c.x < -3.5 && c.z < -1 && c.z > -10.9)),
    );
    box(
      -5.8,
      0.21,
      -6,
      4.5,
      0.09,
      9.7,
      ['siheyuan', 'nalukettu'].includes(l.style) ? '#b0b8a6' : '#d7c1a0',
    );
    for (const x of [-7.9, -3.65])
      for (const z of [-10.6, -8, -5.2, -1.4])
        box(
          x,
          1.1,
          z,
          0.16,
          1.8,
          0.16,
          ['nalukettu', 'siheyuan'].includes(l.style) ? '#7a5b43' : l.wall,
        );
    m.areaOverrides = { Bathroom: [62, 17], Kitchen: [62, 31], 'Garden path': [32, 26] };
    box(3.8, 0.18, -7.2, 3.2, 0.15, 7.5, l.wall);
    box(3.8, 0.82, -10.9, 3.4, 1.25, 0.14, l.wall);
    box(5.45, 0.82, -7.2, 0.14, 1.25, 7.5, l.wall);
    box(3.8, 0.65, -9.5, 1.1, 0.8, 1.2, '#dce1d5');
    box(3.8, 0.65, -4.8, 1.4, 0.8, 0.8, '#b5a282');
    // The annex walls and fittings are solid, and its two halves are the bathroom and kitchen
    // (their old bays are now the court), so devices installed there stay inside the annex.
    m.colliders.push(
      { x: 3.8, z: -10.9, w: 3.4, d: 0.14 },
      { x: 5.45, z: -7.2, w: 0.14, d: 7.5 },
      { x: 3.8, z: -9.5, w: 1.1, d: 1.2 },
      { x: 3.8, z: -4.8, w: 1.4, d: 0.8 },
    );
    for (const room of m.rooms) {
      if (room[0] === 'Bathroom') room.splice(1, 4, 3.8, -9.075, l.wall, [3.2, 3.75]);
      if (room[0] === 'Kitchen') room.splice(1, 4, 3.8, -5.325, l.wall, [3.2, 3.75]);
    }
    // Service annex roof, and roofs over the two room bays either side of the open court.
    flatRoof(l.accent, { x: 3.8, z: -7.2, w: 3.7, d: 7.8, y: 1.52 });
    if (['swahili', 'haveli', 'najdi'].includes(l.style))
      for (const x of [-10.55, -1.1])
        flatRoof(l.wall, { x, w: 4.95, d: 10.3, parapet: l.style === 'najdi' ? null : l.wall });
    if (['andalusian', 'mexican'].includes(l.style))
      for (const [x, side] of [
        [-10.55, 1],
        [-1.1, -1],
      ])
        // Terracotta lean-to roofs falling towards the courtyard.
        roof('box', [x, 1.95, -6], [5.1, 0.12, 10.5], '#b5694a', [0, 0, side * 0.2]);
    if (['swahili', 'nubian', 'najdi', 'haveli', 'andalusian', 'mexican'].includes(l.style)) {
      for (let i = 0; i < 7; i++) {
        const a = (i / 6) * Math.PI;
        box(-5.8 + Math.cos(a) * 1.1, 1.2 + Math.sin(a) * 0.65, -1.45, 0.38, 0.23, 0.22, l.accent, {
          rotation: [0, 0, a - Math.PI / 2],
        });
      }
      cylinder(-5.8, 0.36, -6, 0.55, 0.38, l.accent);
      cylinder(-5.8, 0.57, -6, 0.4, 0.02, '#8bbabd');
    }
    for (const x of [-6.8, -4.8]) {
      cylinder(x, 0.4, -8.7, 0.32, 0.45, '#ae8b67');
      sphere(x, 1.2, -8.7, 0.4, ['desert', 'dry'].includes(l.climate) ? '#99a374' : '#7b9e66');
    }
  }
  const gable = (x, z, w, d, color) => {
    for (const side of [-1, 1])
      roof('box', [x + (side * w) / 4, 2.3, z], [w * 0.58, 0.12, d], color, [0, 0, side * -0.55]);
  };
  if (
    [
      'cape',
      'stonefarm',
      'cottage',
      'nzcottage',
      'norwegian',
      'kathkuni',
      'ottoman',
      'brazilian',
      'pondhouse',
    ].includes(l.style)
  ) {
    gable(-10.55, -6, 4.9, 10.3, l.accent);
    gable(-1.1, -6, 4.9, 10.3, l.accent);
    for (const x of [-11.5, -6.7, -1.9])
      for (const sign of [-1, 1]) box(x + sign * 0.65, 1.1, -10.7, 0.12, 0.85, 0.09, l.accent);
  }
  if (l.style === 'cape') {
    for (const x of [-10.55, -1.1]) {
      box(x, 1.8, -0.95, 2.1, 0.65, 0.15, l.wall);
      sphere(x, 2.14, -0.95, 0.5, l.wall, { architectureMesh: true });
      sphere(x - 0.72, 1.96, -0.95, 0.3, l.wall, { architectureMesh: true });
      sphere(x + 0.72, 1.96, -0.95, 0.3, l.wall, { architectureMesh: true });
    }
    box(-5.8, 0.25, 0.35, 7, 0.06, 1.9, '#bdbca6');
  }
  if (l.style === 'kathkuni' || l.style === 'ottoman') {
    for (let y = 0.45; y < 1.8; y += 0.22) {
      for (const z of [-10.8, -1])
        box(-5.8, y, z, 14.5, 0.09, 0.14, l.style === 'kathkuni' ? '#725d46' : '#755640');
    }
    for (const x of [-13, -8.2, -3.4, 1.35]) box(x, 1.1, -1, 0.14, 1.65, 0.15, l.accent);
  }
  if (l.style === 'stonefarm') {
    for (let i = 0; i < 25; i++)
      box(
        -12.8 + (i % 13) * 1.05,
        0.4 + Math.floor(i / 13) * 0.4,
        -10.7,
        0.9,
        0.3,
        0.16,
        i % 2 ? '#ada491' : '#c5bba4',
      );
    for (const x of [4, 13]) {
      cylinder(x, 1.4, 8.5, 0.12, 2.4, '#8f8467');
      sphere(x, 2.5, 8.5, 1.0, '#8e9e73');
    }
  }
  if (l.style === 'cottage' || l.style === 'nzcottage' || l.style === 'norwegian') {
    for (const y of [0.45, 0.65, 0.85, 1.05, 1.25, 1.45])
      box(-5.8, y, -1, 14.5, 0.08, 0.1, l.style === 'norwegian' ? '#ac6858' : l.wall);
    box(-9.2, 2.65, -8.9, 0.6, 1, 0.6, '#9a9789');
    for (let i = 0; i < 10; i++) {
      const x = 3 + i * 0.8;
      sphere(x, 0.65, 9.1, 0.2, i % 2 ? '#d5b6a6' : '#b2a6bc');
    }
  }
  if (l.style === 'nalukettu' || l.style === 'siheyuan') {
    for (const x of [-10.55, -1.1])
      gable(x, -6, 4.9, 10.3, l.style === 'nalukettu' ? '#aa7859' : '#7c8580');
    for (const z of [-10.9, -1])
      roof(
        'box',
        [-5.8, 1.95, z],
        [4.6, 0.12, 1.3],
        l.style === 'nalukettu' ? '#a87555' : '#758482',
        [z < -5 ? -0.35 : 0.35, 0, 0],
      );
  }
  if (l.style === 'haveli') {
    for (const x of [-11.5, -1.9]) {
      box(x, 1.7, -1, 0.95, 0.5, 0.6, '#d5b08a');
      for (let i = 0; i < 5; i++) box(x - 0.4 + i * 0.2, 1.7, -0.65, 0.04, 0.42, 0.04, '#916b50');
    }
    for (let i = 0; i < 20; i++) box(-12.7 + i * 0.7, 1.8, -10.7, 0.18, 0.2, 0.18, l.accent);
  }
  if (l.style === 'najdi') {
    for (let i = 0; i < 24; i++) box(-12.7 + i * 0.59, 1.86, -10.8, 0.28, 0.26, 0.22, l.wall);
    for (const x of [-11.5, -6.7, -1.9])
      for (let i = 0; i < 3; i++)
        mesh('cone', [x - 0.4 + i * 0.4, 1.5, -10.68], [0.2, 0.22, 0.04], '#755f48', {
          rotation: [Math.PI / 2, 0, 0],
        });
  }
  if (l.style === 'nubian') {
    for (const x of [-10.5, -1.1]) roof('sphere', [x, 1.73, -8.4], [4.2, 2.1, 4.6], l.accent);
    for (const x of [-11.5, -6.7, -1.9])
      box(
        x,
        0.48,
        -10.68,
        1.6,
        0.45,
        0.07,
        ['#7ca9b0', '#cc966e', '#e1bb73'][Math.round(x + 12) % 3],
      );
  }
  if (l.style === 'joglo') {
    for (const x of [-7, -4.6])
      for (const z of [-7.2, -4.8]) box(x, 1.3, z, 0.2, 2.3, 0.2, '#745638');
    roof('cone', [-5.8, 2.8, -6], [11.5, 2.2, 10.3], l.accent);
    roof('cone', [-5.8, 3.65, -6], [5.5, 1.5, 5.0], '#846348');
  }
  if (l.style === 'adobe') {
    // Low-pitched clay tile roof with projecting timber vigas over thick earthen walls.
    for (const x of [-10.55, -1.1])
      roof('box', [x, 2.0, -6], [4.9, 0.14, 10.3], l.accent, [0.12, 0, 0]);
    for (let i = 0; i < 12; i++)
      cylinder(-12.6 + i * 1.25, 1.62, -0.75, 0.07, 0.5, '#7b5a3e', {
        rotation: [Math.PI / 2, 0, 0],
      });
    for (const x of [-13.1, 1.4]) box(x, 0.8, -6, 0.45, 1.4, 10.2, l.wall);
  }
  if (l.style === 'round' || l.style === 'compound') {
    // Only the original house footprint (walls at z -11 to -1); the back hedge and trees stay.
    const inHouse = (x, z) => x > -13.3 && x < 1.6 && z < -1 && z > -11.3;
    removeObjects((o) => inHouse(o.pos[0], o.pos[2]));
    m.colliders.splice(0, m.colliders.length, ...m.colliders.filter((c) => !inHouse(c.x, c.z)));
    const roundRoom = (cx, cz, r) => {
      cylinder(cx, 0.12, cz, r, 0.22, l.wall);
      for (let i = 0; i < 32; i++) {
        const a = (i / 32) * Math.PI * 2;
        if (Math.abs(a - Math.PI / 2) < 0.24) continue;
        const x = cx + Math.cos(a) * r,
          z = cz + Math.sin(a) * r;
        box(x, 0.78, z, 0.7, 1.25, 0.22, l.wall, { rotation: [0, -a + Math.PI / 2, 0] });
        m.colliders.push({ x, z, w: 0.43, d: 0.35 });
      }
      roof('cone', [cx, 2.55, cz], [r * 2.18, 2.6, r * 2.18], '#9f946b');
      box(cx - 0.9, 0.36, cz - 0.5, 1.45, 0.25, 1.6, '#b9ba94');
      box(cx + 0.8, 0.56, cz + 0.4, 0.7, 0.8, 0.7, '#ae9773');
    };
    // Servo-driven woven shutter inside the first room's rear wall replaces the removed blinds.
    const shutter = (cx, cz, r) =>
      (m.dynamic.blinds = box(cx, 0.85, cz - r + 0.22, 1.2, 0.83, 0.05, '#c6ad83'));
    if (l.style === 'round') {
      roundRoom(-6, -6, 5.2);
      shutter(-6, -6, 5.2);
      m.colliders.push({ x: -6.9, z: -6.5, w: 1.45, d: 1.6 }, { x: -5.2, z: -5.6, w: 0.7, d: 0.7 });
      // One round room shared by six areas: each area is a zone around its point, kept inside the
      // wall, so devices for one area do not land among another's. Zones are [x0, x1, z0, z1]
      // relative to the centre.
      for (const [name, x0, x1, z0, z1] of [
        ['Bedroom', -3.6, -1.0, -3.0, 0.0],
        ['Bathroom', -0.9, 1.3, -4.4, -1.4],
        ['Kitchen', 1.4, 3.9, -2.4, 0.2],
        ['Utility room', 1.4, 4.3, 0.3, 1.8],
        ['Living room', -3.6, -0.9, 0.1, 3.0],
        ['Garage', -0.8, 3.0, 1.9, 3.6],
      ]) {
        const room = m.rooms.find((r) => r[0] === name);
        room.splice(1, 4, -6 + (x0 + x1) / 2, -6 + (z0 + z1) / 2, l.wall, [x1 - x0, z1 - z0]);
      }
      m.areaOverrides = {
        Bedroom: [25, 20],
        Bathroom: [32, 17],
        Kitchen: [38, 24],
        'Utility room': [40, 32],
        'Living room': [25, 35],
        Garage: [40, 39],
        Entrance: [31, 48],
      };
      m.floorHeight = (x, z) => (Math.hypot(x + 6, z + 6) < 5.2 ? 0.23 : 0);
    } else {
      for (const x of [-10.6, -5.8, -1.0]) roundRoom(x, -8.4, 2.2);
      shutter(-10.6, -8.4, 2.2);
      box(-5.8, 0.12, -3.5, 13, 0.2, 4.4, '#cfb78b');
      for (const x of [-11, -1]) box(x, 0.72, -3.5, 2.5, 0.9, 2.5, l.wall);
      m.floorHeight = (x, z) => (z < -1 && z > -11 ? 0.23 : 0);
    }
  }
  // Species-inspired silhouettes and growing layouts, not botanical specimens.
  if (['terrace', 'seasonal'].includes(l.planting)) {
    for (let i = 0; i < 3; i++) {
      const x = 6 + i * 3.25;
      box(x, 0.25 + i * 0.23, 4.6, 2.55, 0.45 + i * 0.46, 5.8, '#aca68c');
      for (const p of m.plants)
        if (Math.abs(p.stem.pos[0] - x) < 1 && p.stem.pos[2] > 0) {
          for (const o of p.parts || [p.stem, ...p.leaves, p.fruit]) o.pos[1] += i * 0.46;
        }
    }
  }
  if (['banana', 'palm', 'tropical', 'enset-inspired'].includes(l.planting)) {
    for (const [x, z] of [
      [3.8, 8.1],
      [13.2, -4.2],
    ])
      buildTree(m, x, z, 0.85, { style: 'palm', foliage: ['#72915d', '#7f9e64', '#8da674'] });
  }
  if (l.planting === 'xeric') {
    for (let i = 0; i < 6; i++) {
      const x = 3.5 + i * 0.45;
      mesh('cone', [x, 0.52, 8.7], [0.16, 0.9, 0.16], '#88a58a');
    }
    for (const p of m.plants) for (const leaf of p.leaves) leaf.color = '#91a579';
  }
  if (l.planting === 'bamboo') {
    for (const [x, z] of [
      [3.8, 8.1],
      [13.2, -4.2],
    ])
      for (let i = 0; i < 7; i++) {
        const bx = x + Math.sin(i * 2.4) * 0.45,
          bz = z + Math.cos(i * 2.4) * 0.45;
        cylinder(bx, 1.6, bz, 0.06, 3 + (i % 3) * 0.3, '#8fa65f');
        for (let j = 0; j < 4; j++) cylinder(bx, 0.65 + j * 0.58, bz, 0.067, 0.045, '#a9b17c');
        for (let j = 0; j < 3; j++) {
          const a = i * 2.4 + j * 1.8;
          mesh(
            'leaf',
            [bx + Math.cos(a) * 0.21, 1.65 + j * 0.34, bz + Math.sin(a) * 0.21],
            [0.66, 0.24, 0.12],
            '#6f945b',
            { vegetation: 'tree', rotation: [0, -a, 0.16] },
          );
        }
      }
  }
  if (['herb', 'flower', 'vegetable', 'mixed'].includes(l.planting)) {
    // A raised bed whose plants follow the layout: low herbs, bright flowers or vegetable rows.
    const kinds = l.planting === 'mixed' ? ['herb', 'flower', 'vegetable'] : [l.planting];
    box(4.6, 0.15, 8.7, 3.4, 0.3, 0.9, '#9c8466');
    for (let i = 0; i < 9; i++) {
      const kind = kinds[i % kinds.length],
        x = 3.2 + i * 0.35;
      if (kind === 'herb')
        mesh('foliage', [x, 0.42, 8.7], [0.32, 0.32, 0.32], i % 2 ? '#7f9f6a' : '#94a77a');
      else if (kind === 'flower') {
        cylinder(x, 0.45, 8.7, 0.025, 0.3, '#6f8e57');
        sphere(x, 0.63, 8.7, 0.035, '#d9bb68');
        for (let petal = 0; petal < 5; petal++) {
          const a = (petal * Math.PI * 2) / 5;
          mesh(
            'leaf',
            [x + Math.cos(a) * 0.055, 0.63, 8.7 + Math.sin(a) * 0.055],
            [0.13, 0.12, 0.07],
            ['#d98c8c', '#e2c56e', '#b495c9'][i % 3],
            { rotation: [0, -a, 0] },
          );
        }
      } else mesh('leaf', [x, 0.4, 8.7], [0.5, 0.24, 0.28], i % 2 ? '#6f9a52' : '#88ad5e');
    }
  }
  buildMelbourneStyle(l, m);
  if (l.farm) {
    buildFarm(l, m);
    // Paddocks reach well beyond the property, so the sky sits further out.
    m.skyDistance = 24;
  }
  if (l.metro === 'Melbourne') {
    addMelbourneStreet(l, m);
    // The neighbourhood widens the scene, so the sky sits further out.
    m.skyDistance = 16;
  }
  if (l.planting === 'pond') {
    cylinder(3.5, 0.12, 6.8, 1.5, 0.2, '#a9bba5');
    m.pondWater = cylinder(3.5, 0.25, 6.8, 1.3, 0.04, '#7eb6bd');
    m.colliders.push({ x: 3.5, z: 6.8, w: 3, d: 3 });
    m.areaOverrides['Water tank'] = [61, 76];
  }
  m.windObjects = m.objects
    .filter(
      (o) => ['foliage', 'leaf'].includes(o.shape) && o.vegetation === 'tree' && o.pos[1] > 1.5,
    )
    .map((o) => ({ mesh: o, base: [...o.pos] }));
  m.clouds = addClouds(m);
  m.sky = addSky(m);
  m.wetSurface = box(0, 0.025, 3, 29, 0.005, 18, '#6c9296', { opacity: 0 });
  return m;
}

// Melbourne suburb house styles. The base house spans x -13.1..1.4 and z -11..-1, with its
// front wall at z -1 facing the garden. Roof parts use `roof`, so the Roof toggle applies.
function buildMelbourneStyle(l, m) {
  const { box, cylinder, roof, flatRoof, pitchedRoof } = m,
    front = -1,
    across = (from, to, step, draw) => {
      for (let x = from; x <= to + 1e-9; x += step) draw(x);
    },
    weatherboards = (color, top = 1.45) => {
      for (let y = 0.35; y <= top; y += 0.18) box(-5.85, y, front + 0.06, 14.5, 0.05, 0.06, color);
    },
    veranda = (depth, height, roofColor, postColor, spacing = 2.4, slope = 0.12) => {
      roof('box', [-5.85, height, front + depth / 2], [14.8, 0.08, depth + 0.2], roofColor, [
        slope,
        0,
        0,
      ]);
      across(-12.8, 1.2, spacing, (x) =>
        cylinder(x, height / 2, front + depth, 0.06, height, postColor),
      );
    };
  switch (l.style) {
    case 'terrace':
      // Slate roof, firewalls at each side, decorated parapet and a cast-iron lace veranda.
      pitchedRoof('#4f5a63', { pitch: 0.5, ridge: '#3d464d' });
      for (const x of [-13.25, 1.55]) box(x, 1.25, -6, 0.3, 2.3, 10.4, l.wall);
      roof('box', [-5.85, 2.05, front - 0.05], [14.8, 0.55, 0.2], l.wall);
      across(-12.4, 0.8, 1.6, (x) =>
        roof('sphere', [x, 2.38, front - 0.05], [0.28, 0.28, 0.28], l.wall),
      );
      veranda(1.5, 1.6, '#76828a', '#2f3a40', 2.4, 0.08);
      across(-12.8, 1.2, 0.3, (x) => box(x, 1.45, front + 1.5, 0.05, 0.18, 0.05, '#2f3a40'));
      box(-5.85, 1.53, front + 1.5, 14.6, 0.04, 0.05, '#2f3a40');
      break;
    case 'federation':
      // Terracotta hipped roof, projecting front gable, roughcast band and fretwork veranda.
      pitchedRoof(l.accent, { pitch: 0.55, ridge: '#8c4a30' });
      for (const side of [-1, 1])
        roof('box', [-10.55 + side * 1.2, 2.25, front + 0.5], [2.8, 0.1, 1.6], l.accent, [
          0,
          0,
          side * -0.6,
        ]);
      box(-10.55, 1.5, front + 0.04, 4.6, 0.3, 0.06, '#e6d8bd');
      veranda(1.3, 1.5, '#a9573b', '#f1ece0', 2.2);
      across(-8, 1.2, 0.45, (x) => box(x, 1.32, front + 1.3, 0.06, 0.22, 0.05, '#f1ece0'));
      break;
    case 'cottage-wb':
      // Weatherboards, corrugated-iron gable, skillion veranda and a white picket fence.
      weatherboards('#d6cfba');
      pitchedRoof('#9aa4a8', { pitch: 0.5, ridge: '#7f898d' });
      veranda(1.4, 1.45, '#a7b0b3', '#efece2', 3.2, 0.18);
      across(-13, 1.3, 0.35, (x) => box(x, 0.32, 3.2, 0.08, 0.55, 0.05, '#f4f2ea'));
      box(-5.85, 0.45, 3.2, 14.5, 0.06, 0.05, '#f4f2ea');
      break;
    case 'townhouse':
      // Flat roof, a timber-battened upper storey and a glass balcony.
      flatRoof('#3d4247', { y: 1.74 });
      roof('box', [-3.5, 2.45, -6.2], [9.6, 1.3, 9.2], l.wall);
      roof('box', [-3.5, 3.14, -6.2], [9.9, 0.1, 9.5], '#2f3438');
      across(-8.1, 1.1, 0.35, (x) => roof('box', [x, 2.45, -1.55], [0.1, 1.2, 0.06], l.accent));
      roof('box', [-3.5, 2.0, -0.95], [6.5, 0.55, 0.05], '#bfdbe6');
      break;
    case 'creambrick':
      // Cream brick, a low hipped terracotta roof and a wrought-iron porch.
      pitchedRoof(l.accent, { pitch: 0.32, overhang: 0.5, ridge: '#8b4a31' });
      roof('box', [-1.1, 1.45, front + 0.8], [3.6, 0.08, 1.8], l.accent);
      for (const x of [-2.7, 0.5]) cylinder(x, 0.72, front + 1.6, 0.05, 1.4, '#2e3134');
      across(-2.6, 0.4, 0.3, (x) => box(x, 0.55, front + 1.6, 0.04, 0.5, 0.04, '#2e3134'));
      break;
    case 'artdeco':
      // Flat roof with a stepped parapet, speed-line bands and a rounded front corner.
      flatRoof(l.wall, { parapet: l.wall });
      roof('box', [-5.85, 2.3, front - 0.05], [5, 0.5, 0.25], l.wall);
      roof('box', [-5.85, 2.6, front - 0.05], [2.4, 0.3, 0.25], l.wall);
      for (const y of [1.35, 1.5, 1.65]) box(-5.85, y, front + 0.06, 14.5, 0.05, 0.05, l.accent);
      cylinder(1.4, 0.95, front, 0.55, 1.7, l.wall);
      break;
    case 'postwar-wb': {
      // Weatherboards, a low corrugated gable, a small porch and a rotary clothesline.
      weatherboards('#c4ccb1');
      pitchedRoof('#868e90', { pitch: 0.36, ridge: '#6f7779' });
      roof('box', [-5.8, 1.4, front + 0.7], [3, 0.07, 1.4], '#969ea0', [0.15, 0, 0]);
      const [cx, cz] = [-9, 6];
      cylinder(cx, 1.0, cz, 0.05, 2.0, '#9aa0a2');
      for (const angle of [0, Math.PI / 2])
        box(cx, 1.95, cz, 2.6, 0.04, 0.04, '#9aa0a2', { rotation: [0, angle, 0] });
      for (const r of [0.5, 0.9, 1.25])
        for (const angle of [0, Math.PI / 2, Math.PI, Math.PI * 1.5])
          box(
            cx + Math.cos(angle) * r,
            1.93,
            cz + Math.sin(angle) * r,
            0.02,
            0.02,
            r * 1.4,
            '#d8d8d0',
            {
              rotation: [0, angle, 0],
            },
          );
      break;
    }
    case 'beachhouse':
      // Weatherboards, a skillion roof and a raised timber deck with a balustrade.
      weatherboards('#a7bcc6');
      roof('box', [-5.85, 2.05, -6], [15.2, 0.12, 11], '#d9d6cc', [0.14, 0, 0]);
      box(-5.85, 0.3, front + 1.5, 14.6, 0.12, 2.8, '#b28b62');
      for (const x of [-13, -5.85, 1.3]) box(x, 0.15, front + 2.8, 0.15, 0.3, 0.15, '#8f6e4c');
      across(-13, 1.3, 0.4, (x) => box(x, 0.65, front + 2.85, 0.05, 0.6, 0.05, l.accent));
      box(-5.85, 0.97, front + 2.85, 14.6, 0.06, 0.08, l.accent);
      break;
  }
}

// A Melbourne street around the property: footpaths, nature strips, kerbs, a road with a centre
// line, street trees and lights, and neighbouring houses in the suburb's style. Neighbours sit
// across the road and on both sides, outside the playable property.
const NEIGHBOUR_LOOK = {
  terrace: {
    attached: true,
    roof: 'gable',
    walls: ['#c9a98a', '#b9886a', '#d8c3a5', '#a77e66'],
    roofs: ['#4f5a63'],
  },
  federation: {
    roof: 'gable',
    walls: ['#a6573f', '#b2644a', '#9a4f3a'],
    roofs: ['#b5633f', '#a9573b'],
  },
  'cottage-wb': {
    roof: 'gable',
    walls: ['#e4ddc9', '#d8e0d4', '#e8d9c4', '#cfd9dd'],
    roofs: ['#9aa4a8', '#8a9497'],
  },
  townhouse: {
    attached: true,
    roof: 'flat',
    upper: true,
    walls: ['#5d676f', '#7a6f66', '#4f5a60', '#8a8f91'],
    roofs: ['#3d4247'],
  },
  creambrick: {
    roof: 'hip',
    walls: ['#e7d6a6', '#dccb98', '#efe0b6'],
    roofs: ['#a85a3c', '#9c4f34'],
  },
  artdeco: {
    roof: 'flat',
    walls: ['#ead7c1', '#e3cfb6', '#d9e2dc', '#f0e2cf'],
    roofs: ['#cbbba6'],
  },
  'postwar-wb': {
    roof: 'gable',
    walls: ['#d5dcc2', '#e2dcc8', '#c9d6d8', '#dfd3bd'],
    roofs: ['#868e90', '#7d8789'],
  },
  beachhouse: {
    roof: 'skillion',
    walls: ['#b9cbd3', '#d6dcd5', '#c4d3c9', '#e1d6c3'],
    roofs: ['#d9d6cc', '#c8ccc8'],
  },
};
function addMelbourneStreet(l, m) {
  const look = NEIGHBOUR_LOOK[l.style];
  if (!look) return;
  const { box, cylinder, sphere, windows } = m,
    grass = '#a5bd87',
    pick = (list, i) => list[i % list.length];
  // Ground beyond the property: the road and the opposite side, and the lots either side.
  box(0, -0.53, 23.6, 69, 1, 19.7, '#a9b585');
  box(0, -0.035, 23.6, 68.8, 0.1, 19.5, grass);
  for (const side of [-1, 1]) {
    box(side * 25.65, -0.53, 0, 17.7, 1, 27.5, '#a9b585');
    box(side * 25.65, -0.035, 0, 17.5, 0.1, 27.3, grass);
  }
  // Footpath and kerb on the property side; road with a dashed centre line; far side.
  box(0, 0.025, 12.9, 33.6, 0.03, 1.2, '#d8d3c6');
  box(0, 0.035, 13.75, 68.8, 0.09, 0.22, '#c9c8c2');
  box(0, 0.02, 17.25, 68.8, 0.04, 6.8, '#4b5157');
  for (let x = -32; x <= 32; x += 4) box(x, 0.045, 17.25, 2, 0.01, 0.14, '#f2f0e6');
  box(0, 0.035, 20.75, 68.8, 0.09, 0.22, '#c9c8c2');
  box(0, 0.025, 21.6, 68.8, 0.03, 1.2, '#d8d3c6');
  box(0, 0.03, 12.9, 3, 0.04, 1.8, '#cfcabd'); // crossover at the front gate
  // Street trees and lights along both nature strips.
  for (const [z, offset] of [
    [12.25, 0],
    [22.75, 3.5],
  ])
    for (let x = -28 + offset; x <= 28; x += 8) {
      if (z < 13 && Math.abs(x) > 16) continue;
      if (Math.abs(x) < 2.5) continue;
      cylinder(x, 0.9, z, 0.12, 1.8, '#7a6249');
      sphere(x, 2.2, z, 1.1, '#6f9a5c');
    }
  for (const [x, z] of [
    [-10, 13.4],
    [10, 13.4],
    [-24, 21.1],
    [0, 21.1],
    [24, 21.1],
  ]) {
    cylinder(x, 1.4, z, 0.06, 2.8, '#6c7377');
    box(x, 2.85, z + (z < 17 ? 0.35 : -0.35), 0.25, 0.1, 0.7, '#6c7377');
    box(x, 2.78, z + (z < 17 ? 0.6 : -0.6), 0.22, 0.06, 0.22, '#f3e7c3', { streetLight: true });
  }
  // Neighbouring houses: fronts face the street.
  const house = (x, z, width, depth, facing, i) => {
    // Vary each lot's built form as well as its paint; keep attached terraces
    // within their narrow frontage and detached houses within their own lot.
    width *= look.attached ? 0.96 + (i % 3) * 0.018 : 0.91 + (i % 4) * 0.035;
    depth *= 0.95 + (i % 3) * 0.035;
    const wall = pick(look.walls, i),
      roofColor = pick(look.roofs, i),
      height = 1.5 + i * 0.025,
      frontZ = z + (facing * depth) / 2;
    box(x, height / 2 + 0.05, z, width, height, depth, wall, { neighbour: true });
    if (look.roof === 'flat') {
      box(x, height + 0.12, z, width + 0.2, 0.16, depth + 0.2, roofColor);
      if (look.upper) box(x - width * 0.15, height + 0.8, z, width * 0.7, 1.3, depth * 0.85, wall);
    } else if (look.roof === 'skillion')
      box(x, height + 0.35, z, width + 0.5, 0.12, depth + 0.6, roofColor, {
        rotation: [facing * 0.14, 0, 0],
      });
    else {
      const pitch = look.roof === 'hip' ? 0.32 : 0.5,
        run = depth / 2 + 0.3,
        rise = run * Math.tan(pitch);
      for (const side of [-1, 1])
        box(
          x,
          height + rise / 2,
          z + (side * run) / 2,
          width + 0.4,
          0.1,
          run / Math.cos(pitch),
          roofColor,
          {
            rotation: [side * pitch, 0, 0],
          },
        );
    }
    // Front door and windows (windows glow at night like the property's).
    if (i % 3 === 0) {
      // Covered entry with two slim posts.
      const canopyX = x - width * 0.25,
        canopyZ = frontZ + facing * 0.5;
      box(canopyX, 1.35, canopyZ, 1.1, 0.07, 0.9, roofColor);
      for (const side of [-1, 1])
        cylinder(canopyX + side * 0.48, 0.68, frontZ + facing * 0.9, 0.03, 1.32, wall);
    } else if (i % 3 === 1) {
      // Projecting bay window on this lot.
      box(x + width * 0.17, 0.85, frontZ + facing * 0.2, width * 0.37, 1, 0.4, wall);
      windows.push(
        box(x + width * 0.17, 1.02, frontZ + facing * 0.41, width * 0.3, 0.6, 0.045, '#8abec5', {
          opacity: 0.68,
        }),
      );
    } else {
      // Slatted window shade and a planted front box.
      for (let j = 0; j < 5; j++)
        box(
          x + width * 0.15,
          1.33 + j * 0.035,
          frontZ + facing * 0.12,
          width * 0.39,
          0.018,
          0.16,
          roofColor,
        );
      box(x + width * 0.15, 0.25, frontZ + facing * 0.3, width * 0.4, 0.25, 0.35, '#9a8870');
      for (const side of [-1, 0, 1])
        sphere(
          x + width * 0.15 + side * width * 0.12,
          0.43,
          frontZ + facing * 0.3,
          0.18,
          '#79916a',
        );
    }
    box(x - width * 0.25, 0.6, frontZ + facing * 0.03, 0.55, 1.0, 0.05, '#5b4636');
    windows.push(
      box(x + width * 0.15, 1.0, frontZ + facing * 0.03, width * 0.35, 0.6, 0.05, '#8abec5', {
        opacity: 0.68,
      }),
    );
    if (!look.attached)
      box(x, 0.3, frontZ + facing * 1.6, width + 1.6, 0.4, 0.08, i % 2 ? '#f1ede2' : '#8d7a63');
  };
  const across = look.attached ? 4.8 : 11,
    width = look.attached ? 4.6 : 7.4;
  let i = 0;
  for (let x = -30 + across / 2; x <= 30; x += across) house(x, 27.2, width, 6.4, -1, i++);
  for (const side of [-1, 1]) {
    // Beside the property: houses facing the same street, set back from the footpath.
    if (look.attached) {
      for (let k = 0; k < 3; k++) house(side * (19.6 + k * across), -2.5, width, 9, 1, i++);
    } else house(side * 25.5, -1.5, width + 1.5, 8.5, 1, i++);
  }
}
