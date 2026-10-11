// A staffed bus depot with an open street gate and three marked pull-through bays.
export function buildBusDepot(model, { b, origin, box }) {
  const furniture = [],
    buses = [],
    x0 = origin.x + b.x,
    z0 = origin.z + b.z;
  const add = (x, y, z, w, h, d, color, extra = {}) => {
    const mesh = box(b.x + x, y, b.z + z, w, h, d, color, {
      roughness: 0.7,
      ...extra,
      recreation: 'busdepot',
      architectureMesh: !extra.recreationFurniture,
    });
    furniture.push(mesh);
    return mesh;
  };
  const prop = (x, y, z, w, h, d, color, extra = {}) =>
    add(x, y, z, w, h, d, color, { recreationFurniture: true, roughness: 0.8, ...extra });

  // Landscaped fenced parcel; a broad paved apron joins the southern gate to the street.
  add(0, 0.015, 0, 28, 0.035, 28, '#91a67f', { surface: 'grass' });
  // Stop at the road edge: the town street supplies the remaining width outside the gate.
  prop(0, 0.065, 16, 10.6, 0.07, 4, '#69716f', { surface: 'asphalt' });
  for (const x of [-4.9, 4.9]) prop(x, 0.11, 16, 0.11, 0.025, 4, '#e9dfb9', { surface: 'plain' });
  // Low boundary fences keep the buses in their yard, with an eight-metre street opening.
  for (const x of [-14, 14]) {
    for (const z of [-9, -3, 3, 9]) {
      prop(x, 0.72, z, 0.16, 1.35, 0.16, '#66787a', { solid: true });
      prop(x, 1.16, z, 0.12, 0.1, 5.8, '#84938b');
      prop(x, 0.61, z, 0.1, 0.09, 5.8, '#84938b');
    }
  }
  for (const z of [-14, 14]) {
    const spans =
      z > 0
        ? [
            [-14, -5.5],
            [5.5, 14],
          ]
        : [[-14, 14]];
    for (const [a, end] of spans) {
      prop((a + end) / 2, 0.72, z, end - a, 1.35, 0.16, '#66787a', { solid: true });
      prop((a + end) / 2, 1.16, z, end - a, 0.1, 0.12, '#84938b');
      prop((a + end) / 2, 0.61, z, end - a, 0.09, 0.1, '#84938b');
    }
  }
  for (const x of [-5.5, 5.5]) {
    prop(x, 1.2, 14, 0.35, 2.2, 0.35, '#596d72', { solid: true });
    prop(x, 2.34, 14, 0.7, 0.14, 0.7, '#e4c675');
  }
  // Roofed entrance marker and a two-part gate held open beside the bus lane.
  prop(-7.1, 2.85, 14, 0.18, 0.18, 0.18, '#455b62');
  prop(7.1, 2.85, 14, 0.18, 0.18, 0.18, '#455b62');
  prop(0, 3.05, 14, 14.2, 0.22, 0.28, '#526a71');
  prop(-8.3, 1.2, 10.5, 0.1, 1.9, 4.8, '#b7a16e', { solid: true });
  prop(8.3, 1.2, 10.5, 0.1, 1.9, 4.8, '#b7a16e', { solid: true });

  // Three pull-through bays leave the wide middle aisle open to the street gate.
  const bays = [
    [-9, 4.5],
    [9, 4.5],
    [-9, -5],
  ];
  for (const [x, z] of bays) {
    prop(x, 0.11, z - 4.5, 7.8, 0.025, 0.12, '#e8dfbe', { surface: 'plain' });
    prop(x, 0.11, z + 4.5, 7.8, 0.025, 0.12, '#e8dfbe', { surface: 'plain' });
    for (const dx of [-3.9, 3.9])
      prop(x + dx, 0.11, z, 0.12, 0.025, 9.1, '#e8dfbe', { surface: 'plain' });
  }

  const makeBus = (x, z, number, color) => {
    const bodyY = 1.55;
    const busPart = (dx, y, dz, w, h, d, shade, extra = {}) =>
      prop(x + dx, y, z + dz, w, h, d, shade, { busNumber: number, ...extra });
    busPart(0, bodyY, 0, 2.85, 2.65, 8, color, { solid: true, surface: 'fabric' });
    busPart(0, 2.96, -0.1, 2.55, 0.16, 6.9, '#d9d7c9', { surface: 'steel' });
    // Forward facing destination display and windscreen face the depot exit.
    busPart(0, 2.12, 4.035, 2.25, 0.86, 0.035, '#50717a', { surface: 'glass', opacity: 0.92 });
    busPart(0, 2.58, 4.07, 1.25, 0.24, 0.04, '#eedc9e', { surface: 'plain' });
    busPart(0, 1.45, 4.08, 1.9, 0.12, 0.06, '#e5d7ab', { surface: 'plain' });
    busPart(-1.47, 1.85, 0, 0.035, 0.88, 6.45, '#67909a', { surface: 'glass', opacity: 0.88 });
    busPart(1.47, 1.85, 0, 0.035, 0.88, 6.45, '#67909a', { surface: 'glass', opacity: 0.88 });
    for (const side of [-1, 1]) {
      for (const wz of [-2.55, 0.3, 2.95])
        busPart(side * 1.505, 1.88, wz, 0.04, 0.96, 0.12, '#c8d0c7');
      for (const wz of [-2.65, 2.65])
        busPart(side * 1.42, 0.52, wz, 0.26, 0.66, 0.96, '#344146', { surface: 'rubber' });
    }
    for (const side of [-1, 1])
      busPart(side * 0.88, 1.18, 4.08, 0.32, 0.22, 0.06, '#eedc9e', { surface: 'plain' });
    busPart(0, 0.45, -3.98, 1.3, 0.38, 0.08, '#ce6854', { surface: 'plain' });
    busPart(0, 0.15, 0, 2.2, 0.06, 7.2, '#253337', { opacity: 0.25 });
    const vehicle = { x: x0 + x, z: z0 + z, w: 3.1, d: 8.2, number };
    buses.push(vehicle);
    model.colliders.push({
      x: vehicle.x,
      z: vehicle.z,
      w: vehicle.w,
      d: vehicle.d,
      parkedBus: true,
    });
  };
  makeBus(-9, 4.5, '101', '#e0c77c');
  makeBus(9, 4.5, '204', '#72969a');
  makeBus(-9, -5, '315', '#bf866d');

  // A small operations building faces the bays; reception and dispatch desk are visible in the cutaway.
  prop(0, 0.16, -10.1, 19, 0.14, 7, '#d5d3c2', { surface: 'tile' });
  for (const x of [-5.5, 5.5]) prop(x, 1.85, -10.1, 0.2, 3.5, 7, '#bdc5b8', { solid: true });
  prop(0, 1.85, -13.6, 11, 3.5, 0.2, '#bdc5b8', { solid: true });
  for (const [a, end] of [
    [-5.5, -1.6],
    [1.6, 5.5],
  ])
    prop((a + end) / 2, 1.85, -6.6, end - a, 3.5, 0.2, '#bdc5b8', { solid: true });
  const roof = prop(0, 3.75, -10.1, 11.4, 0.22, 7.4, '#536d79', { opacity: 0, cutawayOpacity: 0 });
  model.roofs.push(roof);
  prop(0, 1.65, -8.1, 6.5, 1.1, 0.5, '#8a765e', { solid: true, surface: 'timber' });
  prop(0, 2.25, -8.1, 5.8, 0.14, 0.56, '#60777b', { surface: 'plain' });
  for (const x of [-3.5, 3.5]) {
    prop(x, 0.85, -10.1, 2.4, 1.55, 1.9, '#81979a', { solid: true });
    prop(x, 1.7, -10.1, 1.7, 0.18, 1.55, '#d5d0bc', { surface: 'plain' });
  }
  for (const x of [-3.3, 3.3])
    prop(x, 1.9, -13.48, 3.2, 1.2, 0.045, '#7fa2a5', { surface: 'glass', opacity: 0.83 });
  // Depot sign and live equipment indicator.
  prop(0, 3.05, -6.28, 7.2, 0.48, 0.16, '#526a71');
  prop(0, 3.05, -6.17, 4.8, 0.24, 0.04, '#ebdfbd', { surface: 'plain' });
  const lamp = prop(-8.5, 3.2, -6.8, 0.45, 0.45, 0.45, '#eed7a5', { emission: 0 });
  const indicator = prop(8.5, 2, -7.7, 0.6, 0.55, 0.15, '#547572', { emission: 0 });
  // Depot forecourt, planting and two bicycle racks soften the bus yard edges.
  for (const x of [-12, 12]) {
    prop(x, 0.22, -4.5, 2.4, 0.22, 2.4, '#a4ae94', { solid: true, surface: 'stone' });
    prop(x, 0.65, -4.5, 0.18, 0.86, 0.18, '#75827a');
    prop(x, 0.86, -4.5, 0.85, 0.1, 0.85, '#a3ad9a');
  }
  for (const x of [-4.7, 4.7]) {
    prop(x, 0.48, -3, 2.4, 0.12, 0.5, '#697d80', { solid: true });
    for (const dx of [-0.8, 0.8]) prop(x + dx, 0.75, -3, 0.08, 0.55, 0.08, '#697d80');
  }
  model.addActor(
    'recreation:busdepot',
    origin.x + b.stationX,
    origin.z + b.stationZ,
    '#536d79',
    '#c79878',
  );
  const manager = model.actors.at(-1);
  Object.assign(manager, {
    community: true,
    name: b.resident,
    role: b.role,
    area: b.name,
    section: b.name,
  });
  return {
    building: b,
    lamp,
    indicator,
    sections: [],
    furniture,
    buses,
    driveway: { x: x0, minZ: z0 + b.d / 2, maxZ: z0 + 18, width: 10.6 },
  };
}
