import { buildTree } from './vegetation.js';

// The dairy pond opens into the homestead garden through two aligned fence openings.
export function buildFarmPondGarden(model) {
  const farm = model.farm;
  if (farm.style !== 'dairy') return;
  const parts = [],
    opening = { minX: 6.75, maxX: 9.75 };
  const keep = model.objects.filter(
    (m) =>
      !(
        m.propertyFence &&
        m.fenceSegmentZ === 11.55 &&
        m.fenceSegmentX > opening.minX &&
        m.fenceSegmentX < opening.maxX
      ),
  );
  model.objects.splice(0, model.objects.length, ...keep);
  const fence = model.colliders.find((c) => c.x === 7.75 && c.z === 11.55 && c.w === 12.5);
  if (fence) {
    model.colliders.splice(model.colliders.indexOf(fence), 1);
    for (const [a, b] of [
      [1.5, opening.minX],
      [opening.maxX, 14],
    ])
      model.colliders.push({
        x: (a + b) / 2,
        z: 11.55,
        w: b - a,
        d: fence.d,
        pondGardenFence: true,
      });
  }
  const add = (x, y, z, w, h, d, color, extra = {}) => {
    const mesh = model.box(x, y, z, w, h, d, color, {
      farmPondGarden: true,
      roughness: 0.85,
      ...extra,
    });
    parts.push(mesh);
    return mesh;
  };
  add(8.25, 0.018, 20, 13, 0.035, 20, '#96b883', { surface: 'grass' });
  add(8.25, 0.07, 15.3, 2.4, 0.04, 9.6, '#d2c9b0', { surface: 'stone', pondGardenPath: true });
  // A walking loop stays outside the pond's stone bank.
  for (let i = 0; i < 48; i++) {
    const a = ((i + 0.5) * Math.PI * 2) / 48;
    add(8 + Math.cos(a) * 4.45, 0.07, 24 + Math.sin(a) * 4.45, 0.9, 0.035, 0.64, '#d2c9b0', {
      surface: 'stone',
      pondGardenPath: true,
      rotation: [0, -a, 0],
    });
  }
  for (const [x, z] of [
    [4.8, 19],
    [12.5, 20],
    [12.7, 28],
    [4.2, 28.5],
  ]) {
    const tree = buildTree(model, x, z, 0.48, {
      style: 'broadleaf',
      detailed: false,
      extra: { farmPondGarden: true, pondGardenTree: true },
    });
    parts.push(...tree.parts);
    model.colliders.push({ x, z, w: 0.4, d: 0.4, pondGardenTree: true });
  }
  for (const [x, z, color] of [
    [2.3, 23, '#d990ae'],
    [14, 24, '#a393ce'],
    [8, 30, '#e1ba65'],
  ]) {
    add(x, 0.15, z, 1.1, 0.22, 1.6, '#a8b092', { surface: 'stone', pondGardenFlowers: true });
    add(x, 0.27, z, 0.95, 0.035, 1.45, '#746b52', { surface: 'soil' });
    model.colliders.push({ x, z, w: 1.1, d: 1.6, pondGardenFlowers: true });
    for (const dx of [-0.28, 0.28])
      for (const dz of [-0.45, 0, 0.45]) {
        add(x + dx, 0.44, z + dz, 0.025, 0.32, 0.025, '#62875b');
        for (let petal = 0; petal < 5; petal++) {
          const a = (petal * Math.PI * 2) / 5;
          const mesh = model.sphere(
            x + dx + Math.cos(a) * 0.065,
            0.63,
            z + dz + Math.sin(a) * 0.065,
            0.065,
            color,
            { farmPondGarden: true, pondGardenFlowers: true, roughness: 0.9 },
          );
          parts.push(mesh);
        }
      }
  }
  farm.pondGarden = {
    parts,
    opening,
    pond: { x: 8, z: 24, r: 3.2 },
    path: { x: 8.25, minZ: 10.5, maxZ: 20.1 },
  };
}
