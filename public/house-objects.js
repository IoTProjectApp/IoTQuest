// Furniture is assembled at metre scale. Its collision footprint stays separate
// from the visible legs, openings and cushions so small details never trap players.
import { furnishingTransform, placeFurnishing } from './house-design.js';
export function buildHouseObjects({ mesh, colliders, dynamic, design }) {
  let prop;
  const textiles = new Set(['#829b91', '#a0b5a7', '#a8b4a7']);
  const timbers = new Set(['#aa8868', '#b89978', '#9f8064', '#c5a882', '#b99b76']);
  const part = (shape, pos, size, color, extra = {}) => {
    const transform = furnishingTransform(prop, design);
    if (design) {
      if (textiles.has(color)) color = design.textile;
      else if (timbers.has(color)) color = design.timber;
      else if (color === '#bac6b7') color = design.cabinet;
    }
    const rotation = [...(extra.rotation || [0, 0, 0])];
    rotation[1] += transform?.angle || 0;
    return mesh(shape, placeFurnishing(pos, transform), size, color, { prop, ...extra, rotation });
  };
  const box = (x, y, z, w, h, d, c, extra = {}) => part('box', [x, y, z], [w, h, d], c, extra);
  const round = (x, y, z, w, h, d, c, extra = {}) =>
    box(x, y, z, w, h, d, c, { rounded: true, ...extra });
  const cylinder = (x, y, z, r, h, c, extra = {}) =>
    part('cylinder', [x, y, z], [r * 2, h, r * 2], c, extra);
  const ring = (x, y, z, d, c, extra = {}) => part('torus', [x, y, z], [d, d, d], c, extra);
  const footprint = (x, z, w, d) => {
    const transform = furnishingTransform(prop, design),
      position = placeFurnishing([x, 0, z], transform),
      cos = Math.abs(Math.cos(transform?.angle || 0)),
      sin = Math.abs(Math.sin(transform?.angle || 0));
    colliders.push({
      x: position[0],
      z: position[2],
      w: w * cos + d * sin,
      d: d * cos + w * sin,
      prop,
    });
    // Soft contact shadows sit above the room floor, below the visible furniture.
    part('sphere', [x, 0.242, z], [w * 1.04, 0.008, d * 1.04], '#394641', {
      opacity: 0.12,
      roughness: 1,
    });
  };
  const legs = (x, z, w, d, top, h, c = '#615349') => {
    for (const dx of [-w / 2, w / 2])
      for (const dz of [-d / 2, d / 2])
        cylinder(x + dx, top - h / 2, z + dz, 0.045, h, c, { roughness: 0.55 });
  };
  const metal = { roughness: 0.25 },
    fabric = { roughness: 1 };
  const faucet = (x, y, z) => {
    cylinder(x, y + 0.15, z, 0.026, 0.3, '#b9c7ca', metal);
    cylinder(x, y + 0.29, z + 0.075, 0.025, 0.15, '#b9c7ca', {
      ...metal,
      rotation: [Math.PI / 2, 0, 0],
    });
    cylinder(x, y + 0.25, z + 0.15, 0.026, 0.08, '#b9c7ca', metal);
    box(x + 0.085, y + 0.17, z, 0.11, 0.025, 0.04, '#ced7d8', metal);
  };
  const book = (x, y, z, w, d, c) => {
    box(x, y, z, w, 0.035, d, c);
    box(x, y + 0.028, z, w * 0.94, 0.025, d * 0.94, '#eee8da');
    box(x, y + 0.047, z, w, 0.012, d, c);
  };

  prop = 'bed';
  footprint(-11, -8.55, 2.55, 3);
  legs(-11, -8.55, 2.2, 2.6, 0.45, 0.22);
  round(-11, 0.51, -8.55, 2.55, 0.22, 3, '#957354');
  round(-11, 0.75, -8.5, 2.45, 0.28, 2.85, '#f5efe3', fabric);
  round(-11, 0.94, -7.98, 2.49, 0.16, 1.94, '#829b91', fabric);
  round(-11, 1.035, -8.82, 2.5, 0.065, 0.28, '#b6c8be', fabric);
  for (const x of [-11.53, -10.47]) {
    round(x, 0.99, -9.38, 0.96, 0.24, 0.58, '#fff5e3', {
      ...fabric,
      rotation: [0, 0, x < -11 ? -0.06 : 0.06],
    });
    round(x, 1.09, -10.03, 1.24, 0.83, 0.17, '#a5907c', fabric);
  }
  prop = 'nightstand';
  footprint(-8.95, -9.3, 0.65, 0.7);
  legs(-8.95, -9.3, 0.5, 0.54, 0.43, 0.2);
  round(-8.95, 0.64, -9.3, 0.65, 0.43, 0.7, '#aa8868');
  for (const y of [0.56, 0.74]) {
    round(-8.95, y, -8.94, 0.58, 0.15, 0.035, '#c7ab8e');
    box(-8.95, y, -8.91, 0.16, 0.02, 0.025, '#5b635f', metal);
  }
  prop = 'table-lamp';
  cylinder(-8.95, 0.9, -9.3, 0.18, 0.04, '#b7a38d', metal);
  cylinder(-8.95, 1.13, -9.3, 0.035, 0.43, '#a4937b', metal);
  part('shade', [-8.95, 1.43, -9.3], [0.52, 0.34, 0.52], '#f7ecda', { roughness: 1 });
  prop = 'blinds';
  dynamic.blinds = box(-11.5, 1.22, -10.74, 1.42, 0.83, 0.05, '#c6ad83');

  prop = 'sofa';
  box(-10.55, 0.255, -3.5, 3.5, 0.025, 3.1, '#c0b7a6', fabric);
  footprint(-11.8, -3.5, 1, 2.9);
  legs(-11.8, -3.5, 0.75, 2.5, 0.43, 0.2, '#574b42');
  round(-11.8, 0.53, -3.5, 1.06, 0.22, 2.9, '#8d9690', fabric);
  for (const z of [-4.3, -3.5, -2.7]) {
    round(-11.72, 0.74, z, 0.88, 0.23, 0.76, '#e1ded3', fabric);
    round(-12.12, 1.06, z, 0.25, 0.67, 0.77, '#d0d2c8', { ...fabric, rotation: [0, 0, -0.1] });
  }
  for (const z of [-4.82, -2.18]) round(-11.76, 0.89, z, 1.12, 0.54, 0.22, '#c3c9bd', fabric);
  round(-11.89, 1.03, -3.94, 0.24, 0.4, 0.43, '#a0b5a7', { ...fabric, rotation: [0.12, 0, -0.2] });
  round(-11.88, 1.01, -2.91, 0.24, 0.37, 0.4, '#cbb293', { ...fabric, rotation: [-0.12, 0, -0.2] });
  prop = 'coffee-table';
  footprint(-9.9, -3.6, 1.2, 0.9);
  legs(-9.9, -3.6, 1, 0.68, 0.76, 0.53);
  round(-9.9, 0.81, -3.6, 1.24, 0.1, 0.94, '#b89978');
  book(-10.05, 0.89, -3.7, 0.36, 0.27, '#657e85');
  part('bowl', [-9.62, 0.94, -3.4], [0.2, 0.16, 0.2], '#ede4d5', { roughness: 0.25 });
  ring(-9.51, 0.94, -3.4, 0.12, '#ede4d5', { rotation: [Math.PI / 2, 0, 0] });
  prop = 'television';
  footprint(-8.7, -4.8, 0.55, 1.3);
  legs(-8.7, -4.8, 0.36, 1.1, 0.43, 0.19);
  round(-8.7, 0.6, -4.8, 0.55, 0.34, 1.3, '#9f8064');
  box(-8.7, 0.79, -4.8, 0.35, 0.035, 0.6, '#333d40', metal);
  box(-8.7, 0.98, -4.8, 0.045, 0.35, 0.045, '#333d40', metal);
  round(-8.68, 1.42, -4.8, 0.055, 0.76, 1.28, '#222b30');
  box(-8.647, 1.44, -4.8, 0.01, 0.66, 1.17, '#52727a', { roughness: 0.18 });
  box(-8.638, 1.56, -4.94, 0.005, 0.18, 0.5, '#6d8990', { rotation: [0.08, 0, 0] });

  prop = 'kitchen-cabinets';
  footprint(-5.8, -5.3, 3.95, 0.72);
  box(-5.8, 0.38, -5.3, 3.85, 0.3, 0.64, '#526059');
  box(-5.8, 0.77, -5.3, 3.95, 0.74, 0.72, '#a5b99a');
  round(-5.8, 1.17, -5.3, 4.04, 0.09, 0.84, '#e7e4dc', { roughness: 0.4 });
  for (const x of [-7.24, -6.28, -5.32, -4.36]) {
    round(x, 0.79, -4.926, 0.91, 0.67, 0.035, '#bac6b7');
    box(x, 1.01, -4.894, 0.32, 0.02, 0.035, '#69736f', metal);
  }
  prop = 'kitchen-sink';
  part('bowl', [-6.3, 1.24, -5.3], [0.71, 0.16, 0.53], '#a3afb0', metal);
  faucet(-6.3, 1.26, -5.57);
  prop = 'cooktop';
  round(-4.82, 1.225, -5.3, 0.85, 0.035, 0.62, '#273236', { roughness: 0.25 });
  for (const x of [-5.02, -4.62])
    for (const z of [-5.46, -5.12]) ring(x, 1.251, z, 0.24, '#6a7474', metal);
  for (const x of [-5, -4.82, -4.64]) cylinder(x, 1.26, -4.98, 0.027, 0.025, '#bbc5c4', metal);
  prop = 'refrigerator';
  footprint(-4.05, -4.12, 0.78, 0.85);
  round(-4.05, 1.16, -4.12, 0.78, 1.85, 0.85, '#c5cecd', { roughness: 0.4 });
  for (const [y, h] of [
    [0.84, 1.14],
    [1.77, 0.63],
  ])
    round(-4.05, y, -3.677, 0.72, h, 0.055, '#dce1df', { roughness: 0.35 });
  for (const y of [1.12, 1.65]) round(-3.8, y, -3.627, 0.032, 0.28, 0.045, '#78898a', metal);
  box(-4.05, 1.62, -3.64, 0.2, 0.12, 0.015, '#394c50');
  prop = 'dining-table';
  footprint(-6.1, -2.5, 1.5, 1.2);
  legs(-6.1, -2.5, 1.23, 0.96, 1.17, 0.94, '#917252');
  round(-6.1, 1.23, -2.5, 1.66, 0.12, 1.3, '#c5a882');
  part('vase', [-6.1, 1.42, -2.5], [0.2, 0.26, 0.2], '#809b91', { roughness: 0.4 });
  for (const x of [-7.35, -4.95]) {
    prop = 'dining-chair';
    legs(x, -2.5, 0.36, 0.36, 0.76, 0.53, '#806750');
    round(x, 0.8, -2.5, 0.62, 0.1, 0.62, '#ceb997');
    const back = x < -6.1 ? x - 0.27 : x + 0.27;
    for (const z of [-2.73, -2.27]) cylinder(back, 1.02, z, 0.026, 0.53, '#806750');
    round(back, 1.15, -2.5, 0.075, 0.31, 0.58, '#bca488');
    round(x, 0.866, -2.5, 0.53, 0.055, 0.53, '#a8b4a7', fabric);
  }

  prop = 'bathtub';
  footprint(-6.6, -8.9, 1.3, 2.15);
  round(-6.6, 0.37, -8.9, 1.23, 0.22, 2.06, '#e8ede8', { roughness: 0.3 });
  for (const x of [-7.17, -6.03])
    round(x, 0.63, -8.9, 0.17, 0.57, 2.06, '#f1f2e7', { roughness: 0.28 });
  for (const z of [-9.88, -7.92])
    round(-6.6, 0.63, z, 1.3, 0.57, 0.19, '#f1f2e7', { roughness: 0.28 });
  round(-6.6, 0.72, -8.9, 0.99, 0.022, 1.77, '#a6cfd2', { opacity: 0.7, roughness: 0.2 });
  faucet(-6.6, 0.87, -9.9);
  prop = 'vanity';
  footprint(-4.3, -9.6, 0.75, 0.75);
  round(-4.3, 0.78, -9.6, 0.75, 0.95, 0.75, '#bba68c');
  for (const y of [0.62, 0.94]) {
    box(-4.3, y, -9.21, 0.67, 0.28, 0.025, '#d3c3ad');
    box(-4.3, y, -9.185, 0.2, 0.02, 0.035, '#7e8b87', metal);
  }
  part('bowl', [-4.3, 1.31, -9.6], [0.7, 0.24, 0.6], '#f7f6ed', { roughness: 0.2 });
  faucet(-4.3, 1.31, -9.88);
  round(-4.3, 1.82, -10.8, 0.9, 0.82, 0.065, '#c0b5a1');
  round(-4.3, 1.82, -10.755, 0.8, 0.72, 0.025, '#adc6c9', { roughness: 0.15 });
  prop = 'toilet';
  cylinder(-5.1, 0.42, -7.15, 0.21, 0.38, '#e6ebe7', { roughness: 0.3 });
  part('bowl', [-5.1, 0.64, -7.12], [0.62, 0.34, 0.75], '#f3f2e9', { roughness: 0.25 });
  part('torus', [-5.1, 0.82, -7.12], [0.64, 0.18, 0.77], '#fbfaf2', { roughness: 0.3 });
  round(-5.1, 0.97, -7.52, 0.6, 0.69, 0.29, '#f3f2e9', { roughness: 0.3 });
  cylinder(-5.1, 1.326, -7.52, 0.055, 0.014, '#adb9b8', metal);

  prop = 'laundry-machine';
  for (const x of [-2.3, -1.1]) {
    footprint(x, -9.8, 1, 1);
    round(x, 0.78, -9.8, 1, 1.1, 1, '#e6e9e0', { roughness: 0.4 });
    box(x, 1.17, -9.288, 0.91, 0.23, 0.025, '#cbd3ce');
    cylinder(x - 0.26, 1.18, -9.25, 0.072, 0.035, '#718582', {
      ...metal,
      rotation: [Math.PI / 2, 0, 0],
    });
    box(x + 0.18, 1.18, -9.267, 0.29, 0.1, 0.02, '#344b50');
    part('torus', [x, 0.77, -9.245], [0.69, 0.69, 0.69], '#788887', {
      ...metal,
      rotation: [Math.PI / 2, 0, 0],
    });
    part('sphere', [x, 0.77, -9.225], [0.49, 0.49, 0.09], '#4f737e', { roughness: 0.2 });
    round(x + 0.28, 0.79, -9.18, 0.065, 0.16, 0.045, '#cbd3ce');
  }
  prop = 'storage-shelf';
  footprint(0.4, -9.1, 0.6, 1.8);
  for (const z of [-9.97, -8.23]) box(0.4, 0.92, z, 0.6, 1.38, 0.08, '#aa885f');
  for (const y of [0.3, 0.72, 1.14, 1.55]) box(0.4, y, -9.1, 0.64, 0.07, 1.8, '#aa885f');
  for (let i = 0; i < 5; i++)
    box(0.4, 0.94, -9.8 + i * 0.22, 0.42, 0.35, 0.12, ['#6f8885', '#c4ac88', '#8d9eac'][i % 3]);
  box(0.4, 1.3, -10.82, 0.7, 0.6, 0.08, '#758d7b');

  prop = 'car';
  footprint(-1.2, -3.75, 1.65, 2.9);
  round(-1.2, 0.57, -3.75, 1.65, 0.46, 2.9, '#728f88', { roughness: 0.32 });
  round(-1.2, 0.99, -3.85, 1.38, 0.56, 1.55, '#8ea79e', { roughness: 0.32 });
  round(-1.2, 1.22, -3.9, 1.32, 0.09, 1.3, '#a6b9ad', { roughness: 0.32 });
  box(-1.2, 1.025, -3.055, 1.24, 0.4, 0.035, '#64838c', {
    rotation: [-0.32, 0, 0],
    roughness: 0.2,
  });
  box(-1.2, 1.025, -4.63, 1.24, 0.35, 0.035, '#64838c', { rotation: [0.24, 0, 0], roughness: 0.2 });
  for (const side of [-1, 1]) {
    for (const z of [-4.2, -3.52])
      box(-1.2 + side * 0.703, 1.05, z, 0.02, 0.31, 0.56, '#64838c', { roughness: 0.2 });
    for (const z of [-4.25, -3.53])
      box(-1.2 + side * 0.84, 0.75, z, 0.02, 0.035, 0.16, '#d2d9d5', metal);
    round(-1.2 + side * 0.83, 0.99, -3.1, 0.2, 0.12, 0.17, '#718c85');
    for (const z of [-4.65, -2.87]) {
      part('torus', [-1.2 + side * 0.83, 0.48, z], [0.61, 0.61, 0.61], '#303b3b', {
        rotation: [0, 0, Math.PI / 2],
        roughness: 1,
      });
      part('cylinder', [-1.2 + side * 0.91, 0.48, z], [0.36, 0.035, 0.36], '#b7c1bf', {
        rotation: [0, 0, Math.PI / 2],
        roughness: 0.3,
      });
      for (let i = 0; i < 5; i++)
        box(-1.2 + side * 0.935, 0.48, z, 0.018, 0.29, 0.033, '#778a89', {
          rotation: [(i * Math.PI) / 5, 0, 0],
        });
    }
  }
  for (const x of [-1.76, -0.64]) {
    round(x, 0.66, -2.285, 0.33, 0.13, 0.035, '#eee5c3', { roughness: 0.2 });
    round(x, 0.66, -5.215, 0.3, 0.13, 0.035, '#a1574a', { roughness: 0.3 });
  }
  box(-1.2, 0.49, -2.275, 1.3, 0.09, 0.06, '#465555');
  box(-1.2, 0.65, -2.263, 0.5, 0.13, 0.012, '#35454a');
  box(-1.2, 0.51, -2.233, 0.29, 0.08, 0.012, '#d8d9c9');
  prop = 'workbench';
  footprint(0.75, -4.8, 0.8, 1.9);
  legs(0.75, -4.8, 0.6, 1.65, 1.17, 0.94);
  box(0.75, 0.5, -4.8, 0.7, 0.06, 1.76, '#8b745e');
  round(0.7, 1.26, -4.8, 0.96, 0.12, 2, '#b99b76');
  round(0.7, 1.43, -5.22, 0.46, 0.21, 0.55, '#6b817e');
  box(0.7, 1.56, -5.22, 0.25, 0.035, 0.06, '#b1bfbb', metal);
  dynamic.garageDoor = box(-1.1, 0.38, -1, 3.1, 0.2, 0.16, '#a7b3ab');
}
