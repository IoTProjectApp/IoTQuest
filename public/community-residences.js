export const residentialLots = [
  {
    id: 'residence1',
    type: 'residence1',
    name: 'Willow house',
    resident: 'Avery',
    x: -32,
    z: -74,
    w: 10,
    d: 8,
    residential: true,
    height: 5.2,
    district: 'Residential',
  },
  {
    id: 'residence2',
    type: 'residence2',
    name: 'Courtyard house',
    resident: 'Samira',
    x: -16,
    z: -74,
    w: 10,
    d: 8,
    residential: true,
    height: 5.2,
    district: 'Residential',
  },
  {
    id: 'residence3',
    type: 'residence3',
    name: 'Garden cottage',
    resident: 'Leo',
    x: 16,
    z: -74,
    w: 10,
    d: 8,
    residential: true,
    height: 5.2,
    district: 'Residential',
  },
  ...[
    ['residence4', 'Maple house', 'Jamie', 32],
    ['residence5', 'Cedar house', 'Robin', 64],
    ['residence6', 'Birch house', 'Drew', 80],
  ].map(([type, name, resident, x]) => ({
    id: type,
    type,
    name,
    resident,
    x,
    z: -74,
    w: 10,
    d: 8,
    residential: true,
    height: 5.2,
    district: 'Residential',
  })),
].map((b) => ({ ...b, lot: { x: b.x, z: b.z, w: 14, d: 22 } }));

export function buildCommunityResidences(model, { sim, origin, location, box, objects }) {
  const homes = [],
    japan = location?.iso === 'JPN',
    desert = location?.iso === 'MAR';
  const roof = (...args) => {
    const m = box(...args);
    m.opacity = 0.17;
    model.roofs.push(m);
    return m;
  };
  for (const b of sim.map.buildings.filter((b) => b.residential)) {
    const wall = desert
      ? '#dac09c'
      : japan
        ? '#ddd6c3'
        : ['#c4b59c', '#c0c4b6', '#b9a18d'][homes.length % 3];
    const trim = japan ? '#5b4c3d' : desert ? '#a17b57' : '#697574',
      front = b.z + b.d / 2;
    const extra = { residence: b.type, architectureMesh: true };
    const add = (x, y, z, w, h, d, c, props = {}) =>
      box(x, y, z, w, h, d, c, { ...extra, ...props });
    // Each home owns a distinct lawn parcel. The front fence has a pedestrian
    // opening aligned with its door route; every parcel stays inside its block.
    const lot = b.lot,
      lotFront = lot.z + lot.d / 2;
    add(lot.x, -0.005, lot.z, lot.w, 0.06, lot.d, '#a9bd89', {
      residentialParcel: b.type,
      surface: 'grass',
      rounded: false,
    });
    add(b.x, 0.05, (lotFront + front) / 2, 1.4, 0.055, lotFront - front, '#d7ceae', {
      residentialEntrance: b.type,
      rounded: false,
    });
    const fence = (x, z, w, d) => {
      add(x, 0.45, z, w, 0.65, d, '#bca98b', { solid: true, residentialBoundary: b.type });
      add(x, 0.8, z, w + 0.04, 0.06, d + 0.04, '#d5c5a8', { residentialBoundary: b.type });
    };
    for (const side of [-1, 1]) {
      fence(b.x + (side * lot.w) / 2, b.z, 0.1, lot.d);
      const width = (lot.w - 2.4) / 2;
      fence(b.x + side * (1.2 + width / 2), lotFront, width, 0.1);
    }
    fence(b.x, b.z - lot.d / 2, lot.w, 0.1);

    add(b.x, 0.12, b.z, b.w, 0.16, b.d, '#d3cbb7');
    add(b.x, 1.6, b.z - b.d / 2, b.w, 3.2, 0.25, wall, { solid: true });
    for (const side of [-1, 1]) {
      add(b.x + (side * b.w) / 2, 1.6, b.z, 0.25, 3.2, b.d, wall, { solid: true });
      const windowX = b.x + side * 3;
      add(windowX, 0.52, front, 4, 1.04, 0.25, wall, { solid: true });
      add(windowX, 2.9, front, 4, 0.6, 0.25, wall, { solid: true });
      for (const dx of [-1.58, 1.58])
        add(windowX + dx, 1.82, front, 0.84, 1.56, 0.25, wall, { solid: true });
      add(windowX, 1.8, front, 2.2, 1.5, 0.06, '#7d9f9e', {
        roughness: 0.18,
        surface: 'glass',
        opacity: 0.72,
        solid: true,
      });
      for (const dx of [-1.15, 0, 1.15])
        add(b.x + side * 3 + dx, 1.8, front + 0.22, 0.075, 1.65, 0.1, trim);
      for (const y of [1, 2.6]) add(b.x + side * 3, y, front + 0.22, 2.4, 0.1, 0.18, trim);
      add(b.x + side * 3, 0.4, front + 0.2, 4, 0.5, 0.12, desert ? '#bda081' : '#9e8470');
      // Garden beds sit beside the entrance, leaving the shared door path clear.
      add(b.x + side * 3.2, 0.35, front + 1.7, 2.4, 0.45, 1.2, '#927b5b', { solid: true });
      add(b.x + side * 3.2, 0.61, front + 1.7, 2.15, 0.07, 0.95, '#665d44', { surface: 'soil' });
      for (let i = 0; i < 3; i++) {
        const leaf = model.mesh(
          'foliage',
          [origin.x + b.x + side * 3.2 - 0.6 + i * 0.6, 0.9, origin.z + front + 1.7],
          [0.7, 0.55, 0.75],
          '#718b57',
          { community: true, ...extra },
        );
        objects.push(leaf);
      }
    }
    add(b.x, 2.95, front, 2, 0.5, 0.25, wall); // clear doorway below lintel
    add(b.x, 2.8, front + 0.8, 2.8, 0.13, 1.8, trim);
    for (const dx of [-1.25, 1.25]) add(b.x + dx, 1.4, front + 1.25, 0.12, 2.8, 0.12, trim);
    if (desert) {
      roof(b.x, 3.3, b.z, 10.5, 0.2, 8.5, '#c7ab89', extra);
      for (const dz of [-4.1, 4.1]) roof(b.x, 3.65, b.z + dz, 10.5, 0.55, 0.18, wall, extra);
    } else {
      const pitch = japan ? 0.36 : 0.42,
        run = 4.5;
      for (const side of [-1, 1])
        roof(
          b.x,
          3.3 + (run * Math.tan(pitch)) / 2,
          b.z + (side * run) / 2,
          10.8,
          0.16,
          run / Math.cos(pitch),
          japan ? '#626a67' : '#89705d',
          { ...extra, rotation: [side * pitch, 0, 0] },
        );
      roof(b.x, 3.3 + run * Math.tan(pitch), b.z, 10.9, 0.15, 0.24, trim, extra);
      // Close the triangular roof ends, and carry rainwater to downpipes.
      const rise = (b.d / 2) * Math.tan(pitch);
      for (const side of [-1, 1]) {
        roof(b.x + (side * b.w) / 2, 3.3 + rise / 2, b.z, b.d, rise, 0.18, wall, {
          ...extra,
          shape: 'gable',
          rotation: [0, Math.PI / 2, 0],
          surface: 'plaster',
        });
        roof(b.x, 3.25, b.z + side * run, 10.8, 0.12, 0.16, trim, { ...extra, surface: 'steel' });
        add(b.x + side * 4.8, 1.65, front + 0.45, 0.09, 3.3, 0.09, trim, { surface: 'steel' });
      }
      if (homes.length % 2 === 0)
        roof(b.x - 1, 3.47 + 2.3 * Math.tan(pitch), b.z - 2.2, 2.6, 0.06, 1.8, '#344e60', {
          ...extra,
          rotation: [-pitch, 0, 0],
          surface: 'glass',
          roughness: 0.2,
        });
    }
    // Interior furniture stays outside the central installation/movement area.
    add(b.x - 3.2, 0.55, b.z - 1.4, 2.2, 1.1, 1.3, '#8c9d8a', { solid: true });
    add(b.x + 3.3, 0.85, b.z - 2, 1.2, 1.7, 1.1, '#a68d6b', { solid: true });
    add(b.x - 3.2, 1.05, b.z - 1.4, 2.1, 0.16, 1.15, '#aebca2');
    const lamp = add(b.x + 1.55, 2.1, front + 0.22, 0.24, 0.38, 0.2, '#eed7a5', { emission: 0 });
    const windows = [];
    for (const side of [-1, 1])
      windows.push(
        add(b.x + side * 3, 1.8, front - 0.12, 2.1, 1.35, 0.025, '#d4c9a5', {
          emission: 0,
          surface: 'fabric',
        }),
      );
    const water = [];
    for (let i = 0; i < 8; i++) {
      const drop = model.sphere(
        origin.x + b.x - 3.8 + (i % 3) * 0.55,
        0.9,
        origin.z + front + 1.3 + (i % 2) * 0.65,
        0.045,
        '#b9dce4',
        { community: true, ...extra, opacity: 0 },
      );
      objects.push(drop);
      water.push(drop);
    }
    const plants = objects.filter((m) => m.residence === b.type && m.shape === 'foliage');
    model.addActor(
      'residence:' + b.type,
      origin.x + b.x + 1.7,
      origin.z + b.z + 0.3,
      '#78937e',
      '#bc9276',
    );
    Object.assign(model.actors.at(-1), {
      community: true,
      name: b.resident,
      area: b.name,
      section: 'Neighbourhood home',
    });
    homes.push({ building: b, lamp, windows, water, plants });
  }
  return homes;
}

export function updateResidentialDevices(homes, state, time) {
  for (const home of homes) {
    const devices = state.devices.filter((d) => d.area === home.building.name);
    const on = (ids) =>
      state.running && devices.some((d) => ids.includes(d.id) && state.outputs[d.pin] > 0);
    home.lamp.emission = on(['porch', 'led']) ? 1 : 0;
    for (const m of home.windows) m.emission = on(['led', 'porch']) ? 0.45 : 0;
    for (const [i, drop] of home.water.entries()) {
      drop.opacity = on(['pump', 'valve']) && state.env.tank > 0 ? 0.7 : 0;
      drop.pos[1] = state.reduced ? 0.95 : 0.8 + ((time * 1.5 + i * 0.13) % 0.55);
    }
    for (const plant of home.plants) plant.color = state.env.soil < 30 ? '#9b995e' : '#718b57';
  }
}
