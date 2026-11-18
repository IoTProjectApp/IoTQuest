import { buildFacingBench } from './outdoor-seating.js';
import { buildTree } from './vegetation.js';
// All play equipment fits inside its own plot, with a clear southern entrance.
export function buildChildrenPlayground(model, { b, origin, box }) {
  const furniture = [],
    features = [];
  let feature = 'ground';
  const add = (x, y, z, w, h, d, color, extra = {}) => {
    const mesh = box(b.x + x, y, b.z + z, w, h, d, color, {
      recreation: b.type,
      playgroundEquipment: feature,
      surface: 'steel',
      roughness: 0.75,
      ...extra,
    });
    furniture.push(mesh);
    return mesh;
  };
  const zone = (type, x, z, w, d, color) => {
    feature = type;
    features.push({ type, x: origin.x + b.x + x, z: origin.z + b.z + z, w, d });
    add(x, 0.22, z, w, 0.045, d, color, { surface: 'fabric', playgroundSurface: true });
  };
  add(0, 0.12, 0, b.w, 0.15, b.d, '#93ad7e', { surface: 'grass' });
  add(0, 0.22, (9 + b.d / 2) / 2, 2, 0.04, b.d / 2 - 9, '#d5ceb8', { surface: 'stone' });
  zone('swings', 0, -8, 9, 7, '#b59b88');
  for (const side of [-1, 1]) {
    for (const z of [-9.5, -6.5])
      add(side * 3, 1.65, z, 0.16, 2.8, 0.16, '#6e91a0', { solid: true });
    add(side * 3, 2.94, -8, 0.2, 0.14, 3.2, '#6e91a0');
  }
  add(0, 3.02, -8, 6.4, 0.2, 0.2, '#d9b46c');
  for (const x of [-1.35, 1.35]) {
    add(x, 0.8, -8, 0.9, 0.12, 0.42, '#5d91ac', { solid: true, surface: 'plastic' });
    for (const side of [-1, 1]) add(x + side * 0.37, 1.9, -8, 0.035, 2.1, 0.035, '#a4b3b0');
  }
  zone('climbing-frame', -2.25, -1.9, 3.4, 4.2, '#82a5a4');
  for (const x of [-3.4, -1.1])
    for (const z of [-3.2, -0.6]) add(x, 1.2, z, 0.12, 1.9, 0.12, '#ae8fa7', { solid: true });
  for (const x of [-3.4, -1.1])
    for (const y of [0.55, 0.9, 1.25, 1.6, 1.95]) add(x, y, -1.9, 0.08, 0.08, 2.6, '#dbc27e');
  for (let z = -3.2; z <= -0.6; z += 0.43) add(-2.25, 2.17, z, 2.4, 0.08, 0.08, '#7a9fb1');
  zone('slide', 2, 0, 3.4, 8, '#bba393');
  add(2, 1.73, -1, 1.5, 0.15, 1.5, '#d4b171', { solid: true, surface: 'timber' });
  for (const x of [1.4, 2.6])
    for (const z of [-1.6, -0.4]) add(x, 0.98, z, 0.12, 1.5, 0.12, '#749b9f');
  for (let i = 0; i < 6; i++)
    add(2, 0.4 + i * 0.24, -3.6 + i * 0.35, 1, 0.12, 0.4, '#d4b171', {
      solid: true,
      surface: 'timber',
    });
  for (const x of [1.3, 2.7]) {
    add(x, 2.1, -1, 0.08, 0.65, 1.5, '#7997a5');
    for (const z of [-1.6, -0.4]) add(x, 2.1, z, 0.08, 0.75, 0.08, '#7997a5');
  }
  const slope = Math.atan2(1.47, 4),
    length = Math.hypot(1.47, 4);
  add(2, 1.065, 1.5, 1, 0.1, length, '#dc9464', {
    solid: true,
    surface: 'plastic',
    rotation: [slope, 0, 0],
  });
  for (const x of [1.5, 2.5])
    add(x, 1.16, 1.5, 0.08, 0.22, length, '#e4b378', {
      surface: 'plastic',
      rotation: [slope, 0, 0],
    });
  add(2, 0.29, 3.7, 1, 0.08, 0.7, '#dc9464', { surface: 'plastic' });
  zone('sandpit', -2.3, 3.4, 3.5, 4.2, '#d4bd91');
  for (const side of [-1, 1]) {
    add(-2.3 + side * 1.6, 0.35, 3.4, 0.12, 0.22, 4, '#b89a74', { surface: 'timber' });
    add(-2.3, 0.35, 3.4 + side * 2, 3.3, 0.22, 0.12, '#b89a74', { surface: 'timber' });
  }
  add(-2.8, 0.48, 3.2, 0.3, 0.3, 0.3, '#be806c', { surface: 'plastic' });
  add(-1.7, 0.34, 4, 0.55, 0.08, 0.12, '#769aaf', { surface: 'plastic' });
  zone('seesaw', 0, 7.5, 7, 2.8, '#a4b694');
  add(0, 0.55, 7.5, 0.7, 0.6, 0.8, '#7796a1', { solid: true });
  add(0, 0.78, 7.5, 4.6, 0.16, 0.4, '#d5b072', { surface: 'timber', rotation: [0, 0, 0.09] });
  for (const side of [-1, 1]) {
    add(side * 1.9, 0.9 + side * 0.17, 7.5, 0.65, 0.12, 0.7, '#bd8da5', {
      solid: true,
      surface: 'plastic',
    });
    add(side * 1.5, 1.16 + side * 0.13, 7.5, 0.08, 0.65, 0.08, '#7796a1');
    add(side * 1.5, 1.45 + side * 0.13, 7.5, 0.08, 0.08, 0.55, '#7796a1');
  }
  feature = 'seating';
  for (const x of [-3.5, 3.5])
    buildFacingBench(model, {
      x,
      z: 11.8,
      targetX: 0,
      targetZ: 3,
      worldX: origin.x + b.x + x,
      worldZ: origin.z + b.z + 11.8,
      add,
      length: 2,
    });
  if (b.w > 20) {
    feature = 'landscaping';
    for (const side of [-1, 1]) {
      for (const z of [-8, 0, 8]) {
        const tree = buildTree(model, origin.x + b.x + side * 9, origin.z + b.z + z, 0.85, {
          style: 'broadleaf',
          detailed: false,
          extra: { community: true, recreation: b.type },
        });
        furniture.push(...tree.parts);
        add(side * 9, 0.32, z, 1.5, 0.25, 1.5, '#a5b297', { solid: true, surface: 'stone' });
      }
      buildFacingBench(model, {
        x: side * 8,
        z: 12,
        targetX: 0,
        targetZ: 3,
        worldX: origin.x + b.x + side * 8,
        worldZ: origin.z + b.z + 12,
        add,
        length: 2.2,
      });
    }
  }
  // Small figures bring the playground to life without occupying its walking entrance.
  feature = 'children';
  for (const [x, z, shirt, skin] of [
    [-0.5, 5.6, '#83a2bb', '#d2aa87'],
    [3.1, 5.5, '#ba92af', '#a77d5e'],
  ]) {
    add(x, 0.86, z, 0.3, 0.38, 0.25, shirt, { surface: 'fabric' });
    const head = model.sphere(origin.x + b.x + x, 1.19, origin.z + b.z + z, 0.17, skin, {
      community: true,
      recreation: b.type,
      playgroundEquipment: feature,
      roughness: 0.8,
    });
    furniture.push(head);
    for (const side of [-1, 1]) {
      add(x + side * 0.09, 0.5, z, 0.12, 0.36, 0.13, '#607782', { surface: 'fabric' });
      add(x + side * 0.09, 0.29, z + 0.03, 0.14, 0.08, 0.2, '#445c66');
      add(x + side * 0.21, 0.83, z, 0.1, 0.3, 0.12, shirt, { surface: 'fabric' });
    }
  }
  feature = 'lighting';
  add(-4.7, 1.5, 12, 0.1, 2.6, 0.1, '#708587', { solid: true });
  const lamp = add(-4.7, 2.85, 12, 0.4, 0.25, 0.4, '#eddeb3', { emission: 0 });
  const indicator = add(4.6, 1.2, 12, 0.35, 0.6, 0.3, '#547572', { emission: 0 });
  model.addActor(
    'recreation:' + b.type,
    origin.x + b.stationX + 1,
    origin.z + b.stationZ + 1,
    '#8fa183',
    '#c79878',
  );
  Object.assign(model.actors.at(-1), {
    community: true,
    name: b.resident,
    role: b.role,
    area: b.name,
    section: b.name,
  });
  return { building: b, lamp, indicator, sections: [], furniture, features };
}
