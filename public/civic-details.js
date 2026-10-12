// A small, shared detail pass keeps the service buildings at the town's metre scale.
// Interior props sit against walls, leaving entrances, classroom aisles and stations clear.
export function detailCivicBuilding(model, { b, add }) {
  const front = b.x - b.w / 2;
  const accent = { hospital: '#4b837d', school: '#af8550', police: '#456780', fire: '#a8493e' }[
    b.type
  ];
  const detail = (x, y, z, w, h, d, color, extra = {}) =>
    add(x, y, z, w, h, d, color, { civicDetail: b.type, surface: 'plaster', ...extra });
  const furniture = (...args) => {
    const extra = args[7] || {};
    args[7] = { architectureMesh: false, surface: 'timber', ...extra };
    return detail(...args);
  };
  const roof = (...args) => {
    const mesh = detail(...args);
    mesh.cutawayOpacity = 0;
    mesh.opacity = 0;
    model.roofs.push(mesh);
  };
  // Plinth, entrance surround, window mullions and a coloured fascia.
  for (const side of [-1, 1]) {
    detail(front - 0.16, 0.36, b.z + side * 4.1, 0.12, 0.5, 5.8, '#9b9d90', { surface: 'stone' });
    detail(front - 0.18, 1.7, b.z + side * 1.3, 0.16, 3.3, 0.18, accent);
    const z = b.z + side * 4.1;
    for (const dz of [-1.75, 0, 1.75])
      detail(front - 0.16, 1.8, z + dz, 0.13, 1.8, 0.075, '#536b6d', { surface: 'steel' });
    for (const y of [0.97, 2.63]) detail(front - 0.19, y, z, 0.25, 0.1, 3.65, '#e0ddd0');
    for (const x of [front + 0.15, b.x + b.w / 2 - 0.15])
      detail(x, 1.8, b.z + side * (b.d / 2 + 0.04), 0.32, 3.6, 0.18, '#e0ddd0');
  }
  detail(front - 0.22, 3.35, b.z, 0.2, 0.5, b.d - 0.5, accent);
  detail(front - 0.6, 0.205, b.z, 1.1, 0.018, 2, '#687873', { surface: 'fabric' });
  for (const dz of [-b.d / 2, b.d / 2]) roof(b.x, 3.96, b.z + dz, b.w + 0.4, 0.4, 0.18, b.color);
  roof(b.x + 4, 4.1, b.z - 3, 2, 0.6, 1.5, '#94a09b', { surface: 'steel' });
  for (const dx of [-0.6, -0.2, 0.2, 0.6])
    roof(b.x + 4 + dx, 4.42, b.z - 3, 0.08, 0.04, 1.3, '#536566', { surface: 'steel' });

  const bench = (x, z) => {
    furniture(x, 0.65, z, 0.7, 0.14, 2.1, accent, { surface: 'fabric', solid: true });
    furniture(x - 0.3, 1, z, 0.12, 0.65, 2.1, accent, { surface: 'fabric' });
    for (const dz of [-0.75, 0.75])
      furniture(x, 0.41, z + dz, 0.5, 0.32, 0.1, '#68787b', { surface: 'steel' });
  };
  if (b.type === 'school' || b.type === 'hospital') {
    bench(front + 1.1, b.z + 4.4);
    furniture(b.x - 5, 0.85, b.z - 5.9, 3, 1.2, 1.1, '#b9ad8f', { solid: true });
    furniture(b.x - 5, 1.5, b.z - 5.9, 3.2, 0.12, 1.25, '#e4e0d0');
    furniture(b.x - 5, 1.82, b.z - 6.1, 0.65, 0.5, 0.08, '#3d575d', { surface: 'steel' });
    furniture(b.x - 5, 1.6, b.z - 5.6, 0.55, 0.04, 0.22, '#627477', { surface: 'steel' });
    // A noticeboard gives reception a recognisable public face.
    detail(front + 0.18, 2, b.z + 4.4, 0.08, 1.1, 2.3, '#876c4f', { surface: 'timber' });
    for (const dz of [-0.65, 0, 0.65])
      detail(front + 0.23, 2, b.z + 4.4 + dz, 0.02, 0.7, 0.45, '#ece6d6');
  }
  if (b.type === 'hospital') {
    for (const dz of [-5, 5]) {
      // Bed frames, rails, monitor stands and curtains make the treatment bays legible.
      for (const dx of [-0.9, 0.9]) {
        furniture(b.x + 5 + dx, 0.4, b.z + dz, 0.1, 0.38, 3, '#7c9193', { surface: 'steel' });
        furniture(b.x + 5 + dx, 1.05, b.z + dz, 0.06, 0.06, 2.7, '#8ca2a2', { surface: 'steel' });
      }
      furniture(b.x + 7, 1.65, b.z + dz, 0.12, 2.8, 0.12, '#829594', { surface: 'steel' });
      furniture(b.x + 7, 1.8, b.z + dz, 0.5, 0.5, 0.16, '#365d60', { surface: 'steel' });
      for (const side of [-1, 1])
        detail(
          b.x + 7 + side * 0.12,
          1.8 + side * 0.06,
          b.z + dz + 0.09,
          0.13,
          0.035,
          0.015,
          '#89b6a0',
        );
      furniture(b.x + 2.8, 1.5, b.z + dz, 0.06, 2.5, 3.1, '#c4d9d0', { surface: 'fabric' });
    }
  } else if (b.type === 'fire') {
    // Equipment rack, hoses and lockers stay beside the appliance bay.
    for (let i = 0; i < 3; i++) {
      furniture(b.x + i * 1.3, 1.3, b.z - 6.2, 1.1, 2.2, 0.65, '#677b7b', {
        surface: 'steel',
        solid: true,
      });
      furniture(b.x - 0.3 + i * 1.3, 1.35, b.z - 5.85, 0.06, 0.22, 0.06, '#c6c8b8', {
        surface: 'steel',
      });
      for (const y of [0.6, 2])
        furniture(b.x + i * 1.3, y, b.z - 5.85, 0.7, 0.035, 0.025, '#455c5e', { surface: 'steel' });
    }
  }
}
