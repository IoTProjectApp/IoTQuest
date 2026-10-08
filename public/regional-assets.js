import { extraLocations } from './destination-catalog.js';
import { createWorldModel } from './world-model.js';
// Reusable geometry builders: courts, round enclosures, roof forms and planting.
// Each destination has an explicit layout/material/style configuration.
export function buildDestinationModel(id) {
  const l = extraLocations.find((l) => l.id === id);
  if (!l) return null;
  const m = createWorldModel(),
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
        if (Math.abs(p.stem.pos[0] - x) < 1) {
          for (const o of [p.stem, ...p.leaves, p.fruit]) o.pos[1] += i * 0.46;
        }
    }
  }
  if (['banana', 'palm', 'tropical', 'enset-inspired'].includes(l.planting)) {
    for (const [x, z] of [
      [3.8, 8.1],
      [13.2, -4.2],
    ]) {
      cylinder(x, 1.35, z, 0.15, 2.5, '#ac9c74');
      for (let i = 0; i < 6; i++)
        mesh(
          'sphere',
          [x + Math.sin(i) * 0.65, 2.6 + Math.cos(i) * 0.15, z + Math.cos(i) * 0.65],
          [1.6, 0.16, 0.42],
          '#7f9e64',
          { rotation: [0, i, Math.sin(i) * 0.2] },
        );
    }
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
      for (let i = 0; i < 7; i++)
        cylinder(
          x + Math.sin(i * 2.4) * 0.45,
          1.6,
          z + Math.cos(i * 2.4) * 0.45,
          0.06,
          3 + (i % 3) * 0.3,
          '#8fa65f',
        );
  }
  if (['herb', 'flower', 'vegetable', 'mixed'].includes(l.planting)) {
    // A raised bed whose plants follow the layout: low herbs, bright flowers or vegetable rows.
    const kinds = l.planting === 'mixed' ? ['herb', 'flower', 'vegetable'] : [l.planting];
    box(4.6, 0.15, 8.7, 3.4, 0.3, 0.9, '#9c8466');
    for (let i = 0; i < 9; i++) {
      const kind = kinds[i % kinds.length],
        x = 3.2 + i * 0.35;
      if (kind === 'herb') sphere(x, 0.42, 8.7, 0.16, i % 2 ? '#7f9f6a' : '#94a77a');
      else if (kind === 'flower') {
        cylinder(x, 0.45, 8.7, 0.025, 0.3, '#6f8e57');
        sphere(x, 0.63, 8.7, 0.09, ['#d98c8c', '#e2c56e', '#b495c9'][i % 3]);
      } else mesh('sphere', [x, 0.4, 8.7], [0.28, 0.14, 0.5], i % 2 ? '#6f9a52' : '#88ad5e');
    }
  }
  if (l.planting === 'pond') {
    cylinder(3.5, 0.12, 6.8, 1.5, 0.2, '#a9bba5');
    m.pondWater = cylinder(3.5, 0.25, 6.8, 1.3, 0.04, '#7eb6bd');
    m.colliders.push({ x: 3.5, z: 6.8, w: 3, d: 3 });
    m.areaOverrides['Water tank'] = [61, 76];
  }
  m.windObjects = m.objects
    .filter((o) => o.shape === 'sphere' && o.pos[1] > 1.5 && !o.actor && !o.architectureMesh)
    .map((o) => ({ mesh: o, base: [...o.pos] }));
  m.clouds = [];
  for (let i = 0; i < 8; i++)
    m.clouds.push(
      sphere(-8 + i * 3.2, 6.4 + (i % 2) * 0.4, -9 + (i % 3) * 4, 1.4, '#dce5e1', { opacity: 0 }),
    );
  m.wetSurface = box(0, 0.025, 3, 29, 0.005, 18, '#6c9296', { opacity: 0 });
  return m;
}
