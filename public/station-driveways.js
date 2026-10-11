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
  part(0, 0.95, 0, length, 1.35, 2.5, fire ? '#b94c42' : '#527a9c', { solid: true });
  part(length / 2 - 1, 1.8, 0, 1.4, 0.6, 2.2, '#8cadb6', { surface: 'glass' });
  for (const side of [-1, 1]) {
    part(length / 2 - 1, 2.2, side * 0.6, 0.3, 0.15, 0.5, side < 0 ? '#d76457' : '#5b8cd0');
    for (const dx of [-length / 2 + 0.9, length / 2 - 0.9])
      part(dx, 0.5, side * 1.2, 0.65, 0.65, 0.25, '#344149');
    part(length / 2 + 0.025, 0.9, side * 0.8, 0.06, 0.25, 0.4, '#e8dfb0');
    if (fire) {
      part(-0.8, 1.25, side * 1.26, 2.6, 0.8, 0.06, '#d5d2b9', { surface: 'steel' });
      part(-0.8, 0.7, side * 1.3, 2.6, 0.12, 0.08, '#d1b35a');
      part(-0.7, 1.72, side * 0.7, 3.5, 0.08, 0.1, '#c4c9bf', { surface: 'steel' });
    }
  }
  if (fire)
    for (let dx = -2.4; dx <= 1; dx += 0.5)
      part(dx, 1.75, 0, 0.08, 0.06, 1.45, '#d5d7c8', { surface: 'steel' });
  return access;
}
