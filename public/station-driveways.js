// Both emergency stations use the road immediately east of their existing vehicle bays.
export function stationVehicleAccess(b) {
  if (!['police', 'fire'].includes(b.type)) return null;
  return {
    type: b.type,
    gateX: b.x + b.w / 2,
    roadX: 96,
    z: b.z + (b.type === 'police' ? 3.5 : 3),
    width: 6.4,
    bayX: b.x + (b.type === 'police' ? 6.2 : 4.8),
    length: b.type === 'police' ? 4.4 : 6,
  };
}

export function buildStationDriveway({ b, add }) {
  const access = stationVehicleAccess(b);
  if (!access) return null;
  const { gateX, roadX, z, width, bayX } = access;
  const draw = (x, y, zz, w, h, d, color, extra = {}) =>
    add(x, y, zz, w, h, d, color, { stationDriveway: b.type, surface: 'steel', ...extra });
  if (b.type === 'fire') {
    draw(bayX, 0.215, z, 8, 0.04, 5.8, '#7d898c', { surface: 'asphalt' });
    for (const side of [-1, 1])
      draw(bayX, 0.245, z + side * 2.5, 8, 0.012, 0.09, '#eee7c8', { surface: 'plain' });
  }
  draw((gateX + roadX) / 2, 0.12, z, roadX - gateX, 0.04, width, '#657276', { surface: 'asphalt' });
  draw(gateX + 0.3, 0.145, z, 1.2, 0.04, width, '#aeb4aa', {
    surface: 'stone',
    rotation: [0, 0, -0.07],
  });
  for (const side of [-1, 1]) {
    draw(gateX, 0.9, z + side * (width / 2 + 0.15), 0.22, 1.6, 0.22, '#697e83', {
      solid: true,
      stationVehicleGate: b.type,
    });
    // Hinged leaves are fully open along the sides of the apron, outside vehicle clearance.
    for (const y of [0.45, 0.95, 1.45])
      draw(gateX + 1.6, y, z + (side * width) / 2, 3.2, 0.07, 0.08, '#94a7aa', {
        stationVehicleGate: b.type,
      });
    for (const x of [gateX + 0.2, gateX + 1.6, gateX + 3.1])
      draw(x, 0.95, z + (side * width) / 2, 0.07, 1.05, 0.08, '#94a7aa', {
        solid: true,
        stationVehicleGate: b.type,
      });
    draw((gateX + 89) / 2, 0.16, z + side * (width / 2 - 0.2), 89 - gateX, 0.012, 0.09, '#e8e6cf', {
      surface: 'plain',
    });
  }
  // A marked apron and directional arrows connect the bay directly to the main street.
  for (const direction of [-1, 1]) {
    const x = 86,
      zz = z + direction * 1.6;
    draw(x, 0.16, zz, 2, 0.012, 0.1, '#eee8cd', { surface: 'plain' });
    for (const side of [-1, 1])
      draw(x + direction * 0.65, 0.16, zz + side * 0.24, 0.65, 0.012, 0.09, '#eee8cd', {
        surface: 'plain',
        rotation: [0, (-side * direction * Math.PI) / 4, 0],
      });
  }
  for (let offset = -2.5; offset <= 2.5; offset += 1)
    draw(88, 0.165, z + offset, 1.8, 0.012, 0.45, '#eee8cd', {
      surface: 'plain',
      stationPedestrianCrossing: b.type,
    });
  // Give the physical opening a visible frame and a raised roller shutter above truck height.
  draw(gateX, 3.4, z, 0.35, 0.35, width, b.type === 'fire' ? '#a94f43' : '#526f8a', {
    stationBayDoor: b.type,
  });
  return {
    ...access,
    route: [
      { x: bayX, z },
      { x: gateX, z },
      { x: roadX, z },
    ],
  };
}

export function buildStationVehicle(b, add) {
  const access = stationVehicleAccess(b),
    fire = b.type === 'fire';
  const { bayX: x, z, length } = access;
  const part = (dx, y, dz, w, h, d, color, extra = {}) =>
    add(x + dx, y, z + dz, w, h, d, color, { stationVehicle: b.type, ...extra });
  // The collider keeps the bay's full footprint; the visible body sits inside it.
  part(0, 0.95, 0, length, 1.35, 2.5, fire ? '#b94c42' : '#527a9c', { solid: true, opacity: 0 });
  const wheel = (dx, dz, diameter, thickness) => {
    part(dx, diameter / 2 + 0.19, dz, diameter, thickness, diameter, '#262d30', {
      shape: 'cylinder',
      rotation: [Math.PI / 2, 0, 0],
      surface: 'rubber',
    });
    part(
      dx,
      diameter / 2 + 0.19,
      dz + Math.sign(dz) * 0.01,
      diameter * 0.55,
      thickness,
      diameter * 0.55,
      '#b9bdb8',
      { shape: 'cylinder', rotation: [Math.PI / 2, 0, 0], surface: 'steel' },
    );
  };
  const glass = { surface: 'glass', opacity: 0.9 };
  if (fire) {
    const red = '#b8302a',
      front = length / 2;
    // Forward-control crew cab, then the equipment body with roller-door lockers.
    part(front - 0.95, 1.5, 0, 1.9, 1.9, 2.45, red, { bevel: [0.38, 0.28, 0.32] });
    part(front - 0.02, 1.95, 0, 0.06, 0.78, 2.05, '#36505a', { ...glass, bevel: 0.03 });
    part(front - 0.95, 1.95, 0, 1.3, 0.62, 2.47, '#36505a', { ...glass, bevel: [0.1, 0.1, 0.02] });
    part(front - 3.1, 1.52, 0, 4.2, 1.95, 2.45, red, { bevel: [0.22, 0.16, 0.18] });
    part(0, 0.45, 0, length - 0.2, 0.32, 2.15, '#2f3638', { bevel: 0.08 });
    part(front + 0.04, 0.62, 0, 0.18, 0.26, 2.4, '#c9ccc6', { surface: 'steel', bevel: 0.07 });
    part(front + 0.01, 0.98, 0, 0.05, 0.3, 1.1, '#3a4447');
    // Red light bar with white centre on the cab roof.
    part(front - 0.95, 2.52, 0, 0.36, 0.13, 2.0, '#d7473b', { bevel: 0.06 });
    part(front - 0.95, 2.53, 0, 0.3, 0.12, 0.5, '#f1eee2', { bevel: 0.05 });
    // Roof ladder over the equipment body.
    for (const side of [-1, 1])
      part(front - 3.1, 2.62, side * 0.45, 4.1, 0.07, 0.07, '#c4c9bf', { surface: 'steel' });
    for (let dx = front - 5; dx <= front - 1.2; dx += 0.42)
      part(dx, 2.62, 0, 0.05, 0.05, 0.9, '#d5d7c8', { surface: 'steel' });
    for (const side of [-1, 1]) {
      part(front + 0.03, 0.98, side * 0.85, 0.05, 0.2, 0.34, '#f1ead0', { emission: 0.2 });
      part(front - 5.98, 1.1, side * 0.95, 0.05, 0.22, 0.24, '#c4473c');
      // Reflective band, then lockers clear of the rear wheels.
      part(0, 0.74, side * 1.235, length - 0.3, 0.14, 0.03, '#e9c84a');
      for (const [dx, w, y, h] of [
        [front - 5.55, 0.8, 1.6, 1.4],
        [front - 3.55, 1.1, 1.6, 1.4],
        [front - 2.45, 0.8, 1.6, 1.4],
        [front - 4.6, 0.9, 1.95, 0.75],
      ]) {
        part(dx, y, side * 1.24, w, h, 0.03, '#c9cbc4', { surface: 'steel' });
        for (let r = y - h / 2 + 0.12; r < y + h / 2; r += 0.2)
          part(dx, r, side * 1.255, w - 0.06, 0.025, 0.01, '#a9aca5', { surface: 'steel' });
      }
      wheel(front - 1.05, side * 1.08, 0.86, 0.3);
      wheel(front - 4.6, side * 1.0, 0.86, 0.48);
    }
  } else {
    const white = '#eef0ec',
      blue = '#24418f',
      front = length / 2 - 0.05;
    // Sedan body and cabin, with a dark glasshouse wrapping the cabin.
    part(0, 0.78, 0, length - 0.1, 0.62, 1.85, white, { bevel: [0.5, 0.22, 0.35] });
    part(-0.3, 1.33, 0, 2.2, 0.56, 1.6, white, { bevel: [0.5, 0.24, 0.32] });
    part(-0.3, 1.3, 0, 2.26, 0.4, 1.63, '#2b3b44', { ...glass, bevel: [0.48, 0.12, 0.3] });
    // Blue and white chequered side band.
    for (const side of [-1, 1]) {
      for (const [row, y] of [
        [0, 0.73],
        [1, 0.87],
      ])
        for (let i = 0, dx = -1.85; dx <= 1.85; i++, dx += 0.31)
          if ((i + row) % 2 === 0) part(dx, y, side * 0.93, 0.31, 0.14, 0.02, blue);
      part(front, 0.9, side * 0.6, 0.06, 0.14, 0.36, '#f1ead0', { emission: 0.2 });
      part(-front, 0.92, side * 0.62, 0.06, 0.14, 0.32, '#c4473c');
      // Light bar: red on the left, blue on the right.
      part(-0.25, 1.67, side * 0.3, 0.26, 0.1, 0.56, side < 0 ? '#d76457' : '#5b8cd0', {
        bevel: 0.05,
      });
      for (const dx of [-1.4, 1.35]) wheel(dx, side * 0.82, 0.66, 0.24);
    }
    part(-0.25, 1.63, 0, 0.3, 0.05, 1.25, '#2d3437');
    for (const dx of [-front, front]) part(dx, 0.56, 0, 0.16, 0.2, 1.8, '#2d3437', { bevel: 0.07 });
    part(front + 0.01, 0.82, 0, 0.04, 0.18, 0.7, '#39494b');
  }
  return access;
}
