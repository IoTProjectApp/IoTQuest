import { addSectionResidents } from './section-residents.js';
// Region-specific geometry augments the shared learning property. Inspiration is
// labelled in the location card; these are adapted homes, not national archetypes.
import { buildDestinationModel } from './regional-assets.js';
import { createWorldModel } from './world-model.js';
import { addClouds } from './clouds.js';
import { addSky } from './sky.js';
import { homeVariant } from './home-variants.js';
import { locationById } from './locations.js';
import { addLandscape } from './landscape.js';
export function createRegionalModel(id) {
  const destination = buildDestinationModel(id);
  if (destination) {
    addSectionResidents(destination, locationById(id));
    addLandscape(destination, locationById(id));
    return destination;
  }
  const m = createWorldModel(id && id !== 'legacy' ? homeVariant(locationById(id)) : {});
  m.region = id || 'legacy';
  m.floorHeight = (x, z) => (x > -13.1 && x < 1.4 && z > -11 && z < -1 ? 0.23 : 0);
  if (!id || id === 'legacy') {
    m.wetSurface = m.box(0, 0.025, 3, 29, 0.005, 18, '#6c9296', { opacity: 0 });
    m.clouds = addClouds(m);
    m.sky = addSky(m);
    m.pitchedRoof('#a8735a', { ridge: '#8b5d48' });
    addSectionResidents(m);
    addLandscape(m);
    return m;
  }
  const { box, cylinder, sphere, mesh } = m;
  const houseObjects = m.objects.filter(
    (o) => !o.actor && o.pos[0] >= -13.3 && o.pos[0] <= 1.6 && o.pos[2] < -1 && o.pos[2] > -11.3,
  );
  const palettes =
    id === 'kyoto'
      ? { '#f1e5cc': '#a5977f', '#eadbbf': '#8e7b60', '#abc68b': '#91ad86', '#dfd4b1': '#bfc6b1' }
      : id === 'marrakech'
        ? { '#f1e5cc': '#e6bd96', '#eadbbf': '#d6a67f', '#abc68b': '#cabb8e', '#dfd4b1': '#dabda0' }
        : {
            '#f1e5cc': '#e7eee0',
            '#eadbbf': '#c8d5c0',
            '#abc68b': '#a8bc7e',
            '#dfd4b1': '#ddc9a4',
          };
  for (const o of m.objects) if (palettes[o.color]) o.color = palettes[o.color];
  if (id === 'kyoto') {
    // Timber uprights, horizontal lintels and translucent lattice screens.
    for (const x of [-13.03, -8.2, -3.4, 1.32])
      for (const z of [-10.9, -6, -1]) box(x, 0.96, z, 0.15, 1.65, 0.15, '#635546');
    for (const z of [-10.9, -6, -1]) box(-5.8, 1.82, z, 14.65, 0.15, 0.21, '#655345');
    for (const x of [-11.5, -6.7, -1.9]) {
      for (let j = 0; j < 6; j++)
        box(x - 0.62 + j * 0.25, 1.12, -10.7, 0.025, 0.8, 0.08, '#6b5946');
      for (const y of [0.87, 1.13, 1.38]) box(x, y, -10.7, 1.38, 0.025, 0.08, '#6b5946');
    }
    for (const [x, z] of [
      [-10.55, -3.5],
      [-10.55, -8.5],
    ])
      for (let i = 0; i < 2; i++)
        for (let j = 0; j < 2; j++) {
          box(x - 0.85 + i * 1.7, 0.255, z - 0.95 + j * 1.8, 1.64, 0.028, 1.74, '#b7bf8f');
          box(x - 0.85 + i * 1.7, 0.275, z - 0.95 + j * 1.8, 0.035, 0.012, 1.75, '#617952');
        }
    // Tile roof edges remain low so the furnished interiors are visible.
    for (const z of [-11.1, -0.88])
      for (let i = 0; i < 30; i++)
        mesh('cylinder', [-12.95 + i * 0.48, 1.98, z], [0.22, 0.65, 0.22], '#6b7470', {
          rotation: [Math.PI / 2, 0, 0],
        });
    box(3.8, 0.045, -4.1, 4.1, 0.1, 5.4, '#c6cbb4');
    box(1.95, 0.19, -4.1, 0.95, 0.22, 5.6, '#aa8e64');
    for (let i = 0; i < 12; i++) box(1.95, 0.31, -6.65 + i * 0.46, 1.0, 0.025, 0.025, '#79674b');
    for (let i = 0; i < 6; i++)
      sphere(3.45 + Math.sin(i * 1.8) * 0.7, 0.17, -5.9 + i * 0.62, 0.3, '#8f9f88');
    for (const [x, z] of [
      [4.5, -5.6],
      [5, -3.1],
    ]) {
      for (let i = 0; i < 4; i++) {
        cylinder(x + i * 0.13, 1.25 + i * 0.14, z, 0.034, 2.3 + i * 0.28, '#729356');
        sphere(x + i * 0.13, 2.1, z, 0.18, '#7a9f66');
      }
    }
    m.lamps.push(box(3.2, 1.12, -3.05, 0.3, 0.24, 0.3, '#dac7a1'));
    cylinder(3.2, 0.56, -3.05, 0.13, 0.9, '#b7b9a5');
    box(3.2, 1.09, -3.05, 0.52, 0.39, 0.52, '#c3c8b1');
    mesh('cone', [3.2, 1.38, -3.05], [0.78, 0.24, 0.78], '#9eaa95');
    cylinder(4.8, 0.3, -4, 0.48, 0.36, '#9faca0');
    cylinder(4.8, 0.5, -4, 0.36, 0.035, '#9bc5c7');
    // Low-pitched grey tile roof sitting on the tile edges.
    m.pitchedRoof('#5f6a68', { pitch: 0.33, eaveY: 2.0, overhang: 0.55, ridge: '#4a5452' });
    m.architecture = 'timber-lattice-courtyard';
    m.gardenLayout = 'stone-bamboo-courtyard';
  } else if (id === 'marrakech') {
    // A tiled patio enclosed by low arcades, with a four-part planted court.
    box(7.1, 0.08, 3.1, 13.2, 0.17, 11.4, '#e3c5a3');
    for (let x = 1.2; x <= 13; x += 0.7)
      for (let z = -2; z <= 8; z += 0.7)
        box(x, 0.175, z, 0.3, 0.012, 0.3, Math.round(x * 10 + z * 10) % 2 ? '#719f94' : '#e9dcc4', {
          rotation: [0, Math.PI / 4, 0],
        });
    m.lamps.push(box(2.3, 1.7, -2.6, 0.35, 0.45, 0.35, '#d6c28d'));
    for (const z of [-2.6, 8.85])
      for (let x = 1.1; x <= 14; x += 2.2) {
        box(x, 1.07, z, 0.25, 2.05, 0.25, '#d5ab83');
        box(x + 1.02, 2.05, z, 1.8, 0.2, 0.28, '#dab38a');
        for (let a = 0; a < 7; a++) {
          const angle = (a / 6) * Math.PI;
          box(
            x + 1.02 + Math.cos(angle) * 0.83,
            1.32 + Math.sin(angle) * 0.55,
            z,
            0.3,
            0.2,
            0.27,
            '#ddb78f',
            { rotation: [0, 0, angle - Math.PI / 2] },
          );
        }
      }
    for (const x of [1.1, 14])
      for (let z = -0.6; z < 8; z += 2.4) box(x, 1.0, z, 0.2, 1.9, 0.2, '#d5ab83');
    // Fountain and shade structure leave a navigable central passage.
    cylinder(3.5, 0.31, 3.2, 0.85, 0.42, '#a5bcb1');
    cylinder(3.5, 0.55, 3.2, 0.7, 0.055, '#78b7ba');
    cylinder(3.5, 0.8, 3.2, 0.13, 0.6, '#e4ccb0');
    m.colliders.push({ x: 3.5, z: 3.2, w: 1.7, d: 1.7 });
    for (const x of [4.8, 12.9])
      for (const z of [-1.5, 7.9]) {
        cylinder(x, 0.38, z, 0.45, 0.6, '#c08b61');
        cylinder(x, 1.5, z, 0.07, 2.1, '#a78d65');
        for (let i = 0; i < 5; i++)
          sphere(
            x + Math.sin(i * 1.4) * 0.33,
            2.15 + Math.cos(i) * 0.2,
            z + Math.cos(i * 1.4) * 0.33,
            0.45,
            '#7f9d64',
          );
        sphere(x + 0.24, 1.98, z, 0.12, '#d5a55e');
      }
    for (const x of [5, 11.9]) box(x, 2.3, 7.8, 0.14, 2.3, 0.14, '#b19570');
    for (let i = 0; i < 10; i++) box(5.4 + i * 0.68, 3.48, 7.8, 0.25, 0.08, 2.3, '#c4a783');
    for (const o of houseObjects)
      if (o.color === '#d9c6a0' || o.color === '#d9bd92') o.color = '#d4ad85';
    // Flat roof terrace with a stucco parapet.
    m.flatRoof('#d9b08b', { parapet: '#e6bd96' });
    m.architecture = 'stucco-arched-riad';
    m.gardenLayout = 'tiled-citrus-patio';
  } else if (id === 'brisbane') {
    // Raised timber rooms with veranda posts, metal eaves and a broad stair.
    for (const o of houseObjects) o.pos[1] += 0.68;
    box(-5.8, 0.68, -6, 14.8, 0.16, 10.35, '#9d8c6e');
    for (const x of [-12.5, -8, -3.7, 0.8])
      for (const z of [-10.5, -5.8, -1.1]) box(x, 0.34, z, 0.18, 0.68, 0.18, '#716b55');
    box(-5.8, 0.71, -0.23, 14.9, 0.17, 1.75, '#c1aa82');
    for (let i = 0; i < 32; i++) box(-13 + i * 0.46, 0.805, -0.23, 0.025, 0.02, 1.8, '#8f815f');
    for (const x of [-13, -9, -2, 1.4]) {
      box(x, 1.6, 0.35, 0.14, 1.7, 0.14, '#eeeed8');
      box(x, 1.05, 0.38, 0.85, 0.07, 0.08, '#dedfc9');
    }
    m.roof('box', [-5.8, 2.52, 0.25], [15.2, 0.12, 2.2], '#9ca8a3');
    for (let i = 0; i < 38; i++)
      m.roof('box', [-13.1 + i * 0.4, 2.6, 0.25], [0.06, 0.07, 2.25], '#839590');
    m.lamps.push(box(-5.8, 2.2, 0.28, 0.28, 0.36, 0.28, '#d5c28d'));
    for (let i = 0; i < 6; i++)
      box(-5.8, 0.07 + i * 0.12, 0.92 - i * 0.27, 1.7, 0.13, 0.29, '#bbaa86');
    for (const x of [-11.5, -6.7, -1.9])
      for (const y of [1.75, 1.95, 2.15]) box(x, y, -10.74, 1.34, 0.08, 0.06, '#e5e8d4');
    for (const [x, z] of [
      [-8, 4],
      [3.8, 7.9],
      [12, 9.7],
    ]) {
      for (let i = 0; i < 5; i++)
        mesh(
          'sphere',
          [x + Math.sin(i) * 0.4, 0.55 + i * 0.15, z + Math.cos(i) * 0.3],
          [0.75, 0.12, 0.15],
          '#899d6b',
          { rotation: [0, i, 0] },
        );
      cylinder(x, 0.8, z, 0.06, 1.3, '#9a8f70');
      sphere(x, 1.5, z, 0.32, '#b6ac65');
    }
    m.floorHeight = (x, z) =>
      x > -13.1 && x < 1.4 && z > -11 && z < -1
        ? 0.91
        : Math.abs(x + 5.8) < 1 && z >= -1 && z < 1
          ? Math.max(0, (1 - z) * 0.45)
          : 0;
    // Corrugated-iron gable over the raised rooms; the veranda eave above is part of the roof.
    m.pitchedRoof('#9aa6a9', { pitch: 0.48, eaveY: 2.4, overhang: 0.3, ridge: '#7f8b8e' });
    m.architecture = 'raised-timber-veranda';
    m.gardenLayout = 'native-inspired-rainwater-garden';
  }
  m.windObjects = m.objects
    .filter(
      (o) => ['foliage', 'leaf'].includes(o.shape) && o.vegetation === 'tree' && o.pos[1] > 1.5,
    )
    .map((o) => ({ mesh: o, base: [...o.pos] }));
  m.clouds = addClouds(m);
  m.sky = addSky(m);
  m.wetSurface = box(0, 0.025, 3, 29, 0.005, 18, '#6c9296', { opacity: 0 });
  addSectionResidents(m, locationById(id));
  addLandscape(m, locationById(id));
  return m;
}
