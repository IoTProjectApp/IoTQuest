import { buildCrop, buildTree } from './vegetation.js';
import { buildHouseObjects } from './house-objects.js';
import { toWorld } from './world-math.js';
// Meshes are actual scene geometry, measured in metres. y is height, x/z the ground.
// Garden variations that make each destination's property unique. The empty variant builds the
// original Willowbrook home. Mission areas (beds, tank, greenhouse, paths) keep their places.
const VARIANT_COLOURS = {
  path: { gravel: null, brick: '#c48c6c', slate: '#a3aaa8', sandstone: '#e2c99c' },
  beds: { timber: '#b39166', stone: '#a9a598', corten: '#9b5b38' },
  tank: {
    poly: ['#7fa9b8', '#658e9d', '#9fc1c8'],
    steel: ['#b8bfc2', '#949c9f', '#cfd5d7'],
    timber: ['#8d6a4a', '#73563b', '#a4825f'],
  },
};
export function createWorldModel(variant = {}) {
  const objects = [],
    colliders = [],
    plants = [],
    lamps = [],
    actors = [],
    roofs = [],
    windows = [],
    dynamic = {};
  const mesh = (shape, pos, size, color, extra = {}) => {
    const m = { shape, pos: [...pos], size: [...size], color, rotation: [0, 0, 0], ...extra };
    objects.push(m);
    return m;
  };
  const box = (x, y, z, w, h, d, color, extra = {}) =>
    mesh('box', [x, y, z], [w, h, d], color, extra);
  // Roof meshes start as a translucent cutaway; the renderer applies the Roof toggle to all
  // of them through `roofs`, so every roof part must be created with this helper.
  const roof = (shape, pos, size, color, rotation = [0, 0, 0]) => {
    const m = mesh(shape, pos, size, color, { rotation, opacity: 0.17, architectureMesh: true });
    roofs.push(m);
    return m;
  };
  // House footprint shared by every destination: x -13.1..1.4, z -11..-1.
  const HOUSE = { x: -5.85, z: -6, w: 14.5, d: 10 };
  // Two pitched panels meeting at a ridge along the length of the house.
  const pitchedRoof = (
    color,
    { pitch = 0.42, eaveY = 1.72, overhang = 0.4, ridge = null } = {},
  ) => {
    const run = HOUSE.d / 2 + overhang,
      length = run / Math.cos(pitch),
      rise = run * Math.tan(pitch);
    for (const side of [-1, 1])
      roof(
        'box',
        [HOUSE.x, eaveY + rise / 2, HOUSE.z + (side * run) / 2],
        [HOUSE.w + overhang * 2, 0.12, length],
        color,
        [side * pitch, 0, 0],
      );
    if (ridge)
      roof(
        'box',
        [HOUSE.x, eaveY + rise + 0.04, HOUSE.z],
        [HOUSE.w + overhang * 2, 0.12, 0.3],
        ridge,
      );
    return eaveY + rise;
  };
  // A flat roof slab with an optional parapet, over the whole house or one room bay.
  const flatRoof = (
    color,
    {
      x = HOUSE.x,
      z = HOUSE.z,
      w = HOUSE.w + 0.3,
      d = HOUSE.d + 0.3,
      y = 1.74,
      parapet = null,
    } = {},
  ) => {
    roof('box', [x, y, z], [w, 0.14, d], color);
    if (parapet) {
      for (const dz of [-d / 2, d / 2]) roof('box', [x, y + 0.2, z + dz], [w, 0.3, 0.16], parapet);
      for (const dx of [-w / 2, w / 2]) roof('box', [x + dx, y + 0.2, z], [0.16, 0.3, d], parapet);
    }
  };
  const cylinder = (x, y, z, r, h, color, extra = {}) =>
    mesh('cylinder', [x, y, z], [r * 2, h, r * 2], color, extra);
  const sphere = (x, y, z, r, color, extra = {}) =>
    mesh('sphere', [x, y, z], [r * 2, r * 2, r * 2], color, extra);
  const solid = (x, y, z, w, h, d, color, extra = {}) => {
    const m = box(x, y, z, w, h, d, color, extra);
    colliders.push({ x, z, w, d });
    return m;
  };
  const shadow = (x, z, w, d) =>
    mesh('sphere', [x, 0.027, z], [w, 0.035, d], '#344e35', { opacity: 0.15 });
  const beam = (a, b, width, color) => {
    const dx = b[0] - a[0],
      dy = b[1] - a[1],
      dz = b[2] - a[2],
      len = Math.hypot(dx, dy, dz);
    return box((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2, width, len, width, color, {
      rotation: [Math.atan2(Math.hypot(dx, dz), dy), Math.atan2(dx, dz), 0],
    });
  };
  const wallH = (x1, x2, z, gap = null, height = 1.25) => {
    const ranges = gap
      ? [
          [x1, gap - 0.75],
          [gap + 0.75, x2],
        ]
      : [[x1, x2]];
    for (const [a, b] of ranges)
      if (b > a) solid((a + b) / 2, height / 2 + 0.1, z, b - a, height, 0.18, '#f1e5cc');
  };
  const wallV = (x, z1, z2, gaps = [], height = 1.1) => {
    let start = z1;
    for (const g of [...gaps, z2 + 0.75]) {
      if (g - 0.75 > start)
        solid(
          x,
          height / 2 + 0.1,
          (start + g - 0.75) / 2,
          0.18,
          height,
          g - 0.75 - start,
          '#eadbbf',
        );
      start = g + 0.75;
    }
  };
  // A raised island, grass and a gravel walkway through the property.
  box(0, -0.53, 0, 33.8, 1, 27.5, '#b0bc83');
  box(0, -0.035, 0, 33.6, 0.1, 27.3, '#abc68b');
  const pathColour = VARIANT_COLOURS.path[variant.path] || null;
  box(0, 0.035, 5, 2.1, 0.1, 15.5, pathColour || '#dfd4b1');
  box(-4.6, 0.035, 0.2, 9.2, 0.1, 1.9, pathColour || '#dfd4b1');
  box(7, 0.035, -0.2, 14, 0.1, 1.6, pathColour || '#ded2ae');
  box(8.1, 0.045, 3.5, 1.15, 0.1, 7.2, pathColour || '#ddd0ac');
  box(9.8, 0.035, -5.1, 1.4, 0.1, 7.5, pathColour || '#dfd4b1');
  for (let i = 0; i < 11; i++) {
    box(0.15 * Math.sin(i), 0.1, 10 - i * 1.12, 1.18, 0.1, 0.66, i % 2 ? '#ece4cd' : '#e3d8be', {
      rotation: [0, ((i % 3) - 1) * 0.13, 0],
    });
  }
  // Six rooms, tiled floors, traversable doorways and low cutaway walls.
  const rooms = [
    ['Bedroom', -10.55, -8.5, '#d9bd92'],
    ['Bathroom', -5.8, -8.5, '#bfcfc5'],
    ['Utility room', -1.1, -8.5, '#d7c6a9'],
    ['Living room', -10.55, -3.5, '#d9c6a0'],
    ['Kitchen', -5.8, -3.5, '#ead8b8'],
    ['Garage', -1.1, -3.5, '#b5beb6'],
  ];
  box(-5.8, 0.07, -6, 14.9, 0.2, 10.4, '#e9ddc6');
  for (const [name, x, z, c] of rooms) {
    box(x, 0.18, z, 4.58, 0.09, 4.8, c);
    const tiled = variant.design && !['Bathroom', 'Utility room', 'Garage'].includes(name);
    // Designed floors cover these default plank lines, so only draw them on plain floors.
    if (!tiled)
      for (let i = 0; i < 4; i++) {
        box(x - 1.7 + i * 1.15, 0.233, z, 0.025, 0.006, 4.7, '#e9dfc855');
      }
    dynamic[name] = { x, z };
    if (tiled) {
      const timber = variant.design.floor === 'timber',
        columns = timber ? 7 : 4,
        rows = timber ? 2 : 4,
        colours = timber
          ? ['#c8b69c', '#c2ad90']
          : variant.design.floor === 'stone'
            ? ['#b9b7ac', '#c3c0b4']
            : ['#d1cabe', '#d9d2c5'];
      for (let i = 0; i < columns; i++)
        for (let j = 0; j < rows; j++)
          box(
            x - 2.2 + ((i + 0.5) * 4.4) / columns,
            0.236,
            z - 2.3 + ((j + 0.5) * 4.6) / rows,
            4.4 / columns - 0.012,
            0.008,
            4.6 / rows - 0.012,
            colours[(i + j) % 2],
            { rounded: false, interiorFloor: true },
          );
    }
  }
  wallH(-13.1, 1.4, -11, null, 1.55);
  wallH(-13.1, -8.2, -6, -10.5, 0.95);
  wallH(-8.2, -3.4, -6, -5.8, 0.95);
  wallH(-3.4, 1.4, -6, -1.1, 0.95); // bedroom/kitchen doorway
  wallV(-13.1, -11, -1, [], 1.1);
  wallV(1.4, -11, -1, [-3.5], 1.1);
  wallV(-8.2, -11, -1, [-8.5, -3.5], 0.95);
  wallV(-3.4, -11, -1, [-8.5, -3.5], 0.95);
  // Front wall and three entrances (garage door leaves a wide passage).
  wallH(-13.1, -8.2, -1, -10.5, 0.55);
  wallH(-8.2, -3.4, -1, -5.8, 0.55);
  wallH(-3.4, 1.4, -1, -1.1, 0.55);
  for (const x of [-11.5, -6.7, -1.9]) {
    windows.push(box(x, 1.1, -10.88, 1.35, 0.78, 0.065, '#8abec5', { opacity: 0.68 }));
    box(x, 1.1, -10.81, 0.06, 0.85, 0.1, '#fbf1dc');
  }
  buildHouseObjects({ mesh, colliders, dynamic, design: variant.design });
  // Greenhouse: a framed glasshouse (default), a polytunnel or a lean-to against a brick wall.
  const gx = 9.9,
    gz = -7.1;
  box(gx, 0.12, gz, 4.5, 0.18, 4.8, '#e6d7b6');
  if (variant.outbuilding === 'polytunnel') {
    // Hoops along the length with a translucent plastic cover.
    for (let i = 0; i < 5; i++)
      cylinder(gx, 0.2, gz - 2.2 + i * 1.1, 2.2, 0.08, '#d5ddd9', {
        rotation: [Math.PI / 2, 0, 0],
      });
    mesh('sphere', [gx, 0.2, gz], [4.4, 5.2, 4.9], '#e9f2ee', { opacity: 0.32 });
    box(gx, 0.95, gz + 2.4, 1.1, 1.6, 0.05, '#cfd7d3', { opacity: 0.5 });
  } else if (variant.outbuilding === 'leanto') {
    // A brick back wall with a single sloping glass roof.
    box(gx, 1.4, gz - 2.3, 4.6, 2.7, 0.3, '#a8664a');
    for (const x of [gx - 2.15, gx + 2.15]) box(x, 1.1, gz + 2.2, 0.1, 2.0, 0.1, '#e8e8e2');
    for (const x of [gx - 2.15, gx + 2.15])
      box(x, 1.3, gz, 0.06, 2.0, 4.4, '#badad3', { opacity: 0.2 });
    box(gx, 1.15, gz + 2.3, 4.3, 1.9, 0.06, '#bdded4', { opacity: 0.2 });
    box(gx, 2.4, gz, 4.7, 0.05, 4.9, '#c7e4db', { opacity: 0.24, rotation: [-0.24, 0, 0] });
  } else {
    for (const x of [gx - 2.15, gx + 2.15])
      for (const z of [gz - 2.3, gz, gz + 2.3]) box(x, 1.35, z, 0.1, 2.6, 0.1, '#d1ae7c');
    for (const z of [gz - 2.3, gz + 2.3]) {
      box(gx, 2.66, z, 4.5, 0.12, 0.12, '#c3a273');
      beam([gx - 2.2, 2.68, z], [gx, 3.8, z], 0.13, '#c3a273');
      beam([gx, 3.8, z], [gx + 2.2, 2.68, z], 0.13, '#c3a273');
    }
    box(gx, 3.8, gz, 0.12, 0.12, 4.8, '#c3a273');
    for (const x of [gx - 2.15, gx + 2.15])
      box(x, 1.55, gz, 0.06, 2.15, 4.5, '#badad3', { opacity: 0.18 });
    box(gx, 1.55, gz - 2.3, 4.25, 2.1, 0.06, '#bdded4', { opacity: 0.18 });
    for (const sign of [-1, 1])
      box(gx + sign * 1.1, 3.25, gz, 2.55, 0.035, 4.6, '#c7e4db', {
        opacity: 0.2,
        rotation: [0, 0, sign * -0.47],
      });
  }
  // Plants in raised garden beds and in the greenhouse.
  function plant(x, z, scale = 1, rootHeight = 0.47) {
    plants.push(buildCrop({ mesh }, x, z, scale, rootHeight));
  }
  for (const x of [6.0, 9.25, 12.5]) {
    solid(x, 0.22, 4.6, 2.35, 0.35, 5.5, VARIANT_COLOURS.beds[variant.beds] || '#b39166');
    box(x, 0.43, 4.6, 2.08, 0.08, 5.22, '#746a47', { surface: 'soil' });
    for (let i = 0; i < 4; i++) plant(x + (i % 2 ? -0.4 : 0.35), 2.5 + i * 1.37, 0.8 + i * 0.07);
    for (const z of [1.9, 7.3])
      box(x, 0.5, z, 2.45, 0.2, 0.15, VARIANT_COLOURS.beds[variant.beds] ? '#8f8a7e' : '#c3a073');
  }
  for (const x of [8.7, 11]) {
    box(x, 0.38, -7.2, 1.45, 0.42, 3.4, '#b99468');
    for (let i = 0; i < 3; i++) plant(x, -8.35 + i * 1.12, 0.75, 0.59);
  }
  // Tank, inlet pipe, visible water volume, pump, and irrigation pipes.
  const tx = 13.05,
    tz = -1.9;
  colliders.push({ x: tx, z: tz, w: 2.12, d: 2.12 });
  shadow(tx, tz, 2.4, 2);
  const [tankBody, tankRib, tankLid] =
    VARIANT_COLOURS.tank[variant.tank] || VARIANT_COLOURS.tank.poly;
  cylinder(tx, 1.09, tz, 1.06, 2.05, tankBody);
  // Corrugated steel tanks have many fine ribs; others have four bands.
  for (const y of variant.tank === 'steel'
    ? Array.from({ length: 9 }, (_, i) => 0.2 + i * 0.22)
    : [0.37, 0.82, 1.28, 1.76])
    cylinder(tx, y, tz, 1.083, 0.065, tankRib);
  cylinder(tx, 2.13, tz, 1.1, 0.15, tankLid);
  cylinder(tx, 2.24, tz, 0.3, 0.09, tankRib);
  cylinder(tx, 2.3, tz, 0.32, 0.04, tankLid);
  cylinder(tx + 0.8, 0.32, tz + 0.76, 0.06, 0.32, '#aebdb6', { roughness: 0.3 });
  mesh('torus', [tx + 0.8, 0.4, tz + 0.86], [0.2, 0.2, 0.2], '#806956', {
    rotation: [Math.PI / 2, 0, 0],
  });
  dynamic.tankWater = cylinder(tx, 1.1, tz, 1.08, 1.76, '#3f93b1', {
    opacity: 0.55,
    roughness: 0.2,
  });
  box(tx, 1.05, tz + 1.09, 0.22, 1.7, 0.035, '#e9f3ed');
  dynamic.tankGauge = box(tx, 0.78, tz + 1.12, 0.15, 1.2, 0.04, '#5dabbf');
  beam([tx, 2.28, tz], [tx + 0.45, 2.8, tz], 0.12, '#bed3ce');
  box(11.55, 0.45, -1.2, 0.65, 0.65, 0.55, '#5d8a81');
  box(10, 0.15, 0.65, 6.7, 0.08, 0.08, '#617961');
  for (const x of [6, 9.25, 12.5]) box(x, 0.52, 4.4, 0.065, 0.07, 6.6, '#718671');
  // Path lanterns; light emission is controlled only by installed modules.
  for (const [x, z] of [
    [-6.4, 0.9],
    [-3.3, 1.6],
    [-1.1, 4.3],
    [1.35, 6.8],
    [-1.1, 9],
  ]) {
    cylinder(x, 0.55, z, 0.055, 1.05, '#65735c');
    box(x, 1.2, z, 0.34, 0.42, 0.34, '#62725d');
    lamps.push(box(x, 1.2, z, 0.24, 0.3, 0.24, '#e3d1a1'));
    mesh('cone', [x, 1.51, z], [0.46, 0.2, 0.46], '#57694f');
    shadow(x, z, 0.55, 0.55);
  }
  // Fence (post-and-rail, white pickets, a stone wall, a hedge or farm wire) and the entrance gate
  // (openable through student output).
  const fencePost = (x, z, alongX) => {
    const run = alongX ? [1.45, 0.12] : [0.12, 1.45];
    switch (variant.fence) {
      case 'picket':
        for (let k = -2; k <= 2; k++)
          box(
            x + (alongX ? k * 0.29 : 0),
            0.55,
            z + (alongX ? 0 : k * 0.29),
            0.1,
            1.0,
            0.1,
            '#f4f1e8',
          );
        box(x, 0.6, z, run[0], 0.08, run[1], '#ece8dc');
        break;
      case 'stone':
        box(
          x,
          0.42,
          z,
          alongX ? 1.5 : 0.45,
          0.84,
          alongX ? 0.45 : 1.5,
          (x + z) % 3 > 1.4 ? '#a9a291' : '#b8b09d',
        );
        break;
      case 'hedge':
        sphere(x, 0.65, z, 0.85, (x * 7 + z) % 2 > 1 ? '#6f9a5a' : '#78a262');
        break;
      case 'wire':
        box(x, 0.6, z, 0.11, 1.2, 0.11, '#8c7458');
        for (const y of [0.4, 0.7, 1.0]) box(x, y, z, run[0], 0.02, run[1], '#9aa0a2');
        break;
      default:
        box(x, 0.62, z, 0.13, 1.3, 0.13, '#b59970');
        for (const y of [0.35, 0.91]) box(x, y, z, run[0], 0.13, run[1], '#c7a97b');
    }
  };
  for (let i = -15; i <= 15; i += 1.5) {
    if (Math.abs(i) < 1.6) continue;
    fencePost(i, 11.55, true);
  }
  for (const x of [-15.5, 15.5]) for (let z = -11.7; z < 12; z += 1.5) fencePost(x, z, false);
  dynamic.gate = box(-0.75, 0.68, 11.55, 1.45, 1.12, 0.12, '#b7996d');
  dynamic.gate.anchor = [-1.5, 0, 11.55];
  dynamic.gate.local = [0.75, 0.68, 0];
  dynamic.gateRight = box(0.75, 0.68, 11.55, 1.45, 1.12, 0.12, '#b7996d');
  dynamic.gateRight.anchor = [1.5, 0, 11.55];
  dynamic.gateCollider = { x: 0, z: 11.55, w: 3, d: 0.15, disabled: false };
  colliders.push(dynamic.gateCollider);
  box(1.5, 0.72, 11.55, 0.17, 1.45, 0.17, '#9b805d');
  box(-1.5, 0.72, 11.55, 0.17, 1.45, 0.17, '#9b805d');
  // Trees, hedges, rocks and flowers around the island.
  function tree(x, z, s = 1) {
    shadow(x, z, 2.5 * s, 2.4 * s);
    buildTree({ mesh }, x, z, s, {
      style: variant.treeStyle || 'broadleaf',
      foliage: variant.foliage,
    });
    colliders.push({ x, z, w: 0.5 * s, d: 0.5 * s });
  }
  const treeSpots = [
    [-14, -10, 1.1],
    [-14.3, -5, 1],
    [-14, 1, 1.2],
    [-13, 8, 1],
    [-8, 10, 0.8],
    [4, 10, 1.1],
    [14.5, 8, 1],
    [14.5, 3, 1.1],
    [14, -10, 1.1],
    [4, -11.6, 0.85],
    [8, -12, 0.9],
    [-7, -12, 0.9],
  ];
  if (variant.treeSeed === undefined) for (const [x, z, s] of treeSpots) tree(x, z, s);
  else {
    // A seeded selection of tree spots, sizes and small shifts gives each garden its own trees.
    let seed = variant.treeSeed * 9301 + 49297;
    const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    for (const [x, z, s] of [
      ...treeSpots,
      [-14.2, -2.5, 1],
      [-11, 10.5, 0.9],
      [9, 10.5, 1],
      [0.5, -12.2, 0.8],
      [-3, -12.3, 0.85],
      [14.6, -5.5, 0.95],
    ])
      if (rand() < 0.7)
        tree(x + (rand() - 0.5) * 0.8, z + (rand() - 0.5) * 0.6, s * (0.75 + rand() * 0.5));
  }
  // An optional garden feature in the open lawn left of the front path.
  const [fx, fz] = [-9.6, 5.6];
  if (variant.feature === 'birdbath') {
    cylinder(fx, 0.45, fz, 0.12, 0.9, '#c9c4b8');
    cylinder(fx, 0.95, fz, 0.5, 0.12, '#d6d1c5');
    cylinder(fx, 1.0, fz, 0.42, 0.05, '#7fb3c4');
    colliders.push({ x: fx, z: fz, w: 1, d: 1 });
  } else if (variant.feature === 'swing') {
    for (const dx of [-1.1, 1.1])
      for (const dz of [-0.5, 0.5])
        beam([fx + dx, 0, fz + dz * 1.6], [fx + dx, 2.1, fz], 0.08, '#c0563f');
    box(fx, 2.1, fz, 2.4, 0.09, 0.09, '#c0563f');
    for (const dx of [-0.45, 0.45]) {
      box(fx + dx, 1.35, fz, 0.02, 1.5, 0.02, '#8a8f91');
      box(fx + dx, 0.6, fz, 0.6, 0.05, 0.3, '#e0c060');
    }
    colliders.push({ x: fx, z: fz, w: 2.4, d: 1.6 });
  } else if (variant.feature === 'firepit') {
    cylinder(fx, 0.12, fz, 0.7, 0.24, '#8d877d');
    cylinder(fx, 0.2, fz, 0.5, 0.1, '#3d3a36');
    for (let i = 0; i < 4; i++)
      box(
        fx + Math.cos(i * 1.57) * 1.6,
        0.25,
        fz + Math.sin(i * 1.57) * 1.6,
        1.2,
        0.12,
        0.4,
        '#9a7552',
        {
          rotation: [0, i * 1.57 + Math.PI / 2, 0],
        },
      );
    colliders.push({ x: fx, z: fz, w: 1.4, d: 1.4 });
  } else if (variant.feature === 'bench') {
    box(fx, 0.45, fz, 1.8, 0.08, 0.5, '#a07a54');
    box(fx, 0.75, fz - 0.22, 1.8, 0.45, 0.06, '#a07a54');
    for (const dx of [-0.75, 0.75]) box(fx + dx, 0.22, fz, 0.08, 0.44, 0.45, '#5f5a55');
    colliders.push({ x: fx, z: fz, w: 1.9, d: 0.6 });
  } else if (variant.feature === 'sculpture') {
    cylinder(fx, 0.3, fz, 0.35, 0.6, '#d8d3c6');
    sphere(fx, 1.0, fz, 0.42, '#b98b5b');
    colliders.push({ x: fx, z: fz, w: 0.8, d: 0.8 });
  }
  for (let i = 0; i < 28; i++) {
    const x = -14.6 + i * 1.05,
      z = -12.3;
    sphere(x, 0.6, z, 0.68, i % 2 ? '#87a36a' : '#77965f');
  }
  for (let i = 0; i < 20; i++) {
    const x = i % 2 ? -14.6 : 14.7,
      z = -10.5 + Math.floor(i / 2) * 2.2;
    sphere(x, 0.35, z, 0.55, '#8da777');
  }
  for (const [x, z] of [
    [-5, 5],
    [-7, 2.5],
    [4, -3],
    [12, 9],
    [-12, 9],
  ]) {
    box(x, 0.12, z, 1.7, 0.2, 1.2, '#d5cbb0');
    for (let i = 0; i < 5; i++) {
      cylinder(x - 0.6 + i * 0.27, 0.38, z + (i % 2) * 0.3, 0.035, 0.4, '#7c965d');
      sphere(x - 0.6 + i * 0.27, 0.65, z + (i % 2) * 0.3, 0.13, i % 2 ? '#d6a080' : '#d6bd75');
    }
  }
  // Resident and technician models, with articulated limbs and toolkit.
  function actor(id, x, z, color, skin, hat = false) {
    const parts = [],
      add = (shape, pos, size, c, extra = {}) => {
        const m = mesh(shape, pos, size, c, { actor: id, local: [...pos], ...extra });
        parts.push(m);
        return m;
      };
    add('sphere', [0, 0.02, 0], [0.75, 0.035, 0.55], '#354a34', { opacity: 0.18 });
    add('box', [0, 0.8, 0], [0.43, 0.5, 0.28], color);
    add('sphere', [0, 1.27, 0], [0.38, 0.43, 0.36], skin);
    add('sphere', [0, 1.47, 0], [0.41, 0.15, 0.38], hat ? '#bda27a' : '#6f6555');
    for (const side of [-1, 1]) {
      add('sphere', [side * 0.067, 1.31, 0.166], [0.037, 0.04, 0.025], '#eae6da');
      add('sphere', [side * 0.067, 1.31, 0.181], [0.016, 0.024, 0.013], '#35413d');
      add('box', [side * 0.067, 1.355, 0.172], [0.044, 0.01, 0.015], '#69584a');
    }
    add('sphere', [0, 1.265, 0.181], [0.048, 0.055, 0.045], skin);
    add('box', [0, 1.205, 0.174], [0.056, 0.012, 0.014], '#9c7962');
    if (hat) add('cylinder', [0, 1.44, 0], [0.65, 0.05, 0.55], '#bda27a');
    for (const sign of [-1, 1]) {
      add('box', [sign * 0.14, 0.38, 0], [0.15, 0.48, 0.17], '#566766', {
        limb: 'leg',
        side: sign,
      });
      add('box', [sign * 0.14, 0.11, 0.055], [0.19, 0.16, 0.28], '#465852');
      add('box', [sign * 0.29, 0.79, 0], [0.14, 0.47, 0.15], color, { limb: 'arm', side: sign });
      add('sphere', [sign * 0.29, 0.52, 0], [0.14, 0.14, 0.14], skin);
    }
    if (id === 'player') {
      add('box', [0.43, 0.58, 0.04], [0.31, 0.3, 0.24], '#c09a67', { toolkit: true });
      add('box', [0.43, 0.77, 0.04], [0.18, 0.06, 0.16], '#756c52');
      add('box', [0, 0.98, 0.153], [0.34, 0.04, 0.025], '#ddcb84');
    }
    actors.push({ id, x, z, parts, color });
  }
  actor('player', 0, 7, '#547b5b', '#cba885');
  actor('Maya', 7, 1, '#85966b', '#b68b6b', true);
  actor('Alex', -3.4, 0.2, '#bc987d', '#dfbb96');
  actor('Sam', -5.8, -3.5, '#809a9c', '#aa8264');
  const rain = [];
  for (let i = 0; i < 44; i++)
    rain.push(
      box(
        -14 + ((i * 7.37) % 28),
        3 + ((i * 0.37) % 4),
        -10 + ((i * 4.81) % 21),
        0.025,
        0.45,
        0.025,
        '#b9dbe5',
        { opacity: 0 },
      ),
    );
  return {
    // Rendered as a left-right mirror image (see World3D) for variety; logic stays unmirrored.
    mirrored: !!variant.mirror,
    variant,
    objects,
    colliders,
    plants,
    lamps,
    actors,
    addActor: actor,
    roofs,
    windows,
    dynamic,
    rain,
    roof,
    pitchedRoof,
    flatRoof,
    mesh,
    beam,
    box,
    sphere,
    cylinder,
    rooms,
  };
}
