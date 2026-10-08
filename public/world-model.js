import { toWorld } from './world-math.js';
// Meshes are actual scene geometry, measured in metres. y is height, x/z the ground.
export function createWorldModel() {
  const objects = [],
    colliders = [],
    plants = [],
    lamps = [],
    actors = [],
    roofs = [],
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
  const solid = (x, y, z, w, h, d, color) => {
    const m = box(x, y, z, w, h, d, color);
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
  box(0, 0.035, 5, 2.1, 0.1, 15.5, '#dfd4b1');
  box(-4.6, 0.035, 0.2, 9.2, 0.1, 1.9, '#dfd4b1');
  box(7, 0.035, -0.2, 14, 0.1, 1.6, '#ded2ae');
  box(8.1, 0.045, 3.5, 1.15, 0.1, 7.2, '#ddd0ac');
  box(9.8, 0.035, -5.1, 1.4, 0.1, 7.5, '#dfd4b1');
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
    for (let i = 0; i < 4; i++) {
      box(x - 1.7 + i * 1.15, 0.233, z, 0.025, 0.006, 4.7, '#e9dfc855');
    }
    dynamic[name] = { x, z };
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
    box(x, 1.1, -10.88, 1.35, 0.78, 0.065, '#8abec5', { opacity: 0.68 });
    box(x, 1.1, -10.81, 0.06, 0.85, 0.1, '#fbf1dc');
  }
  // Bedroom: upholstered bed, duvet, pillows, bedside chest and blinds.
  solid(-11, 0.48, -8.55, 2.55, 0.55, 3, '#ab8058');
  box(-11, 0.84, -8.5, 2.48, 0.19, 2.86, '#fcf3df');
  box(-11, 0.96, -8, 2.48, 0.16, 1.95, '#98b58e');
  box(-11, 1.0, -9.35, 1.9, 0.25, 0.57, '#fff8e8');
  box(-11, 1.05, -10.04, 2.6, 1.1, 0.17, '#c39b75');
  solid(-8.95, 0.55, -9.3, 0.65, 0.65, 0.7, '#b5946f');
  cylinder(-8.95, 1.13, -9.3, 0.16, 0.45, '#d6b078');
  mesh('cone', [-8.95, 1.48, -9.3], [0.5, 0.33, 0.5], '#faf1d2');
  dynamic.blinds = box(-11.5, 1.22, -10.74, 1.42, 0.83, 0.05, '#c6ad83');
  // Living room: sofa, rug, coffee table, TV and small bookcase.
  box(-10.55, 0.26, -3.5, 3.5, 0.025, 3.1, '#d9b892');
  solid(-11.8, 0.58, -3.5, 1.0, 0.72, 2.9, '#eee9d6');
  box(-12.15, 1.02, -3.5, 0.3, 0.82, 2.9, '#e5dfcd');
  box(-11.73, 0.91, -4.75, 1.1, 0.45, 0.32, '#e7d9b6');
  box(-11.73, 0.91, -2.25, 1.1, 0.45, 0.32, '#e7d9b6');
  box(-11.7, 0.99, -3.1, 0.36, 0.28, 0.46, '#b5c593');
  solid(-9.9, 0.56, -3.6, 1.2, 0.48, 0.9, '#b58c62');
  box(-9.9, 0.83, -3.6, 1.24, 0.11, 0.94, '#cfac7c');
  solid(-8.7, 0.6, -4.8, 0.55, 0.7, 1.3, '#b58d6c');
  box(-8.62, 1.35, -4.8, 0.08, 0.8, 1.28, '#354949');
  box(-8.57, 1.37, -4.8, 0.045, 0.65, 1.12, '#637d76');
  // Kitchen: counter, refrigerator, cupboards, cooker, dining table and stools.
  solid(-5.8, 0.69, -5.3, 3.95, 0.93, 0.72, '#a5b99a');
  box(-5.8, 1.19, -5.3, 4.02, 0.1, 0.83, '#f2e8d4');
  for (const x of [-7.25, -6.3, -5.35, -4.4]) box(x, 0.77, -4.92, 0.025, 0.73, 0.06, '#6f8e6c');
  box(-6.2, 1.25, -5.3, 0.8, 0.04, 0.55, '#7f9290');
  for (const x of [-5.0, -4.6])
    for (const z of [-5.48, -5.1])
      cylinder(x, 1.27, z, 0.13, 0.035, '#4d6056', { appliance: true });
  solid(-4.05, 1.16, -4.12, 0.78, 1.85, 0.85, '#edf0e4');
  box(-4.04, 1.48, -3.67, 0.52, 0.015, 0.035, '#9aa993');
  solid(-6.1, 0.75, -2.5, 1.5, 0.9, 1.2, '#c29c70');
  box(-6.1, 1.24, -2.5, 1.66, 0.12, 1.3, '#d2b28a');
  for (const x of [-7.35, -4.95]) {
    cylinder(x, 0.53, -2.5, 0.3, 0.5, '#a38761');
    cylinder(x, 0.82, -2.5, 0.38, 0.1, '#d8bc92');
  }
  // Bathroom: tub, water, basin, mirror, toilet and tiled partition.
  solid(-6.6, 0.52, -8.9, 1.3, 0.65, 2.15, '#f1f2e7');
  box(-6.6, 0.86, -8.9, 0.99, 0.025, 1.77, '#a6cfd2', { opacity: 0.7 });
  solid(-4.3, 0.72, -9.6, 0.75, 1, 0.75, '#e8e9dc');
  cylinder(-4.3, 1.28, -9.6, 0.34, 0.12, '#fcf8e9');
  box(-4.3, 1.8, -10.8, 0.8, 0.75, 0.07, '#a1c5c5');
  cylinder(-5.1, 0.58, -7.15, 0.35, 0.5, '#f3f2e9');
  box(-5.1, 0.9, -7.52, 0.6, 0.86, 0.37, '#f3f2e9');
  // Utility: washer, dryer, service board and storage shelves.
  for (const x of [-2.3, -1.1]) {
    solid(x, 0.76, -9.8, 1.0, 1.1, 1.0, '#e6e9e0');
    mesh('cylinder', [x, 0.79, -9.25], [0.66, 0.07, 0.66], '#718582', {
      rotation: [Math.PI / 2, 0, 0],
    });
    mesh('cylinder', [x, 0.79, -9.2], [0.44, 0.08, 0.44], '#b7d0ce', {
      rotation: [Math.PI / 2, 0, 0],
    });
  }
  solid(0.4, 0.8, -9.1, 0.6, 1.2, 1.8, '#c2a886');
  for (const y of [0.55, 1, 1.45]) box(0.4, y, -9.1, 0.75, 0.08, 1.9, '#aa885f');
  box(0.4, 1.3, -10.82, 0.7, 0.6, 0.08, '#758d7b');
  // Garage: car, rubber tyres, workshop bench and motorised door panel.
  solid(-1.2, 0.6, -3.75, 1.65, 0.62, 2.9, '#87a386');
  box(-1.2, 1.15, -3.83, 1.5, 0.62, 1.55, '#9cb399');
  box(-1.2, 1.28, -2.98, 1.32, 0.45, 0.055, '#adc9c8');
  box(-1.2, 1.29, -4.62, 1.32, 0.42, 0.055, '#8db5b8');
  for (const x of [-2.03, -0.37])
    for (const z of [-4.65, -2.87])
      mesh('cylinder', [x, 0.48, z], [0.61, 0.15, 0.61], '#3b4843', {
        rotation: [0, 0, Math.PI / 2],
      });
  solid(0.75, 0.78, -4.8, 0.8, 0.9, 1.9, '#b4916d');
  box(0.7, 1.26, -4.8, 0.96, 0.12, 2, '#d0ad81');
  dynamic.garageDoor = box(-1.1, 0.38, -1, 3.1, 0.2, 0.16, '#a7b3ab');
  // Greenhouse has glass side panels, metal framing and a pitched glass roof.
  const gx = 9.9,
    gz = -7.1;
  box(gx, 0.12, gz, 4.5, 0.18, 4.8, '#e6d7b6');
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
  // Plants in raised garden beds and in the greenhouse.
  function plant(x, z, scale = 1) {
    const stem = cylinder(x, 0.65 * scale + 0.2, z, 0.047, 1.15 * scale, '#6c8e48');
    const leaves = [];
    for (let i = 0; i < 4; i++) {
      const a = i * 1.7;
      leaves.push(
        mesh(
          'sphere',
          [
            x + Math.sin(a) * 0.19 * scale,
            0.55 * scale + i * 0.14 * scale + 0.2,
            z + Math.cos(a) * 0.18 * scale,
          ],
          [0.48 * scale, 0.17 * scale, 0.28 * scale],
          '#709959',
          { rotation: [0, a, 0.35] },
        ),
      );
    }
    const fruit = sphere(x + 0.14 * scale, 1.1 * scale + 0.2, z, 0.115 * scale, '#ca7053');
    plants.push({ stem, leaves, fruit, base: scale });
  }
  for (const x of [6.0, 9.25, 12.5]) {
    solid(x, 0.22, 4.6, 2.35, 0.35, 5.5, '#b39166');
    box(x, 0.43, 4.6, 2.08, 0.08, 5.22, '#746a47');
    for (let i = 0; i < 4; i++) plant(x + (i % 2 ? -0.4 : 0.35), 2.5 + i * 1.37, 0.8 + i * 0.07);
    for (const z of [1.9, 7.3]) box(x, 0.5, z, 2.45, 0.2, 0.15, '#c3a073');
  }
  for (const x of [8.7, 11]) {
    box(x, 0.38, -7.2, 1.45, 0.42, 3.4, '#b99468');
    for (let i = 0; i < 3; i++) plant(x, -8.35 + i * 1.12, 0.75);
  }
  // Tank, inlet pipe, visible water volume, pump, and irrigation pipes.
  const tx = 13.05,
    tz = -1.9;
  colliders.push({ x: tx, z: tz, w: 2.12, d: 2.12 });
  shadow(tx, tz, 2.4, 2);
  cylinder(tx, 1.09, tz, 1.06, 2.05, '#7fa9b8');
  for (const y of [0.37, 0.82, 1.28, 1.76]) cylinder(tx, y, tz, 1.083, 0.065, '#658e9d');
  cylinder(tx, 2.13, tz, 1.1, 0.15, '#9fc1c8');
  dynamic.tankWater = cylinder(tx, 1.1, tz, 1.08, 1.76, '#3f93b1', { opacity: 0.55 });
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
  // Fence and entrance gate (openable through student output).
  for (let i = -15; i <= 15; i += 1.5) {
    if (Math.abs(i) < 1.6) continue;
    box(i, 0.62, 11.55, 0.13, 1.3, 0.13, '#b59970');
    for (const y of [0.35, 0.91]) box(i, y, 11.55, 1.45, 0.13, 0.12, '#c7a97b');
  }
  for (const x of [-15.5, 15.5])
    for (let z = -11.7; z < 12; z += 1.5) {
      box(x, 0.62, z, 0.13, 1.3, 0.13, '#b59970');
      for (const y of [0.35, 0.91]) box(x, y, z, 0.12, 0.13, 1.45, '#c7a97b');
    }
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
    cylinder(x, 1.1 * s, z, 0.18 * s, 2.0 * s, '#9f8966');
    for (const [dx, dy, dz, r] of [
      [0, 2.6, 0, 1.05],
      [-0.65, 2.0, 0.25, 0.82],
      [0.6, 2.15, -0.2, 0.78],
      [0.1, 3.1, 0.1, 0.64],
    ])
      sphere(
        x + dx * s,
        dy * s,
        z + dz * s,
        r * s,
        ['#7b9f64', '#85a971', '#93ad75'][Math.floor((x + z + 50) % 3)],
      );
    colliders.push({ x, z, w: 0.5 * s, d: 0.5 * s });
  }
  for (const [x, z, s] of [
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
  ])
    tree(x, z, s);
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
    objects,
    colliders,
    plants,
    lamps,
    actors,
    roofs,
    dynamic,
    rain,
    roof,
    pitchedRoof,
    flatRoof,
    mesh,
    box,
    sphere,
    cylinder,
    rooms,
  };
}
