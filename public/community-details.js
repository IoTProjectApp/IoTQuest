import { buildTree } from './vegetation.js';

// Architectural detail in metres, built on the existing district footprints and routes.
export function detailCommunity(model, { sim, origin, location, box, objects }) {
  const japan = location?.iso === 'JPN',
    desert = location?.iso === 'MAR';
  const palette = {
    wall: desert ? '#ddc1a0' : japan ? '#ddd7c8' : '#c3c7c0',
    brick: desert ? '#c89976' : japan ? '#807567' : '#a97964',
    trim: japan ? '#544d43' : desert ? '#a77c57' : '#59686b',
    glass: '#75989e',
    metal: '#899598',
    paving: '#b7b9ad',
  };
  const detail = (x, y, z, w, h, d, color, extra = {}) =>
    box(x, y, z, w, h, d, color, {
      communityDetail: true,
      architectureMesh: true,
      roughness: 0.85,
      ...extra,
    });
  const cylinder = (x, y, z, r, h, color, extra = {}) => {
    const m = model.cylinder(origin.x + x, y, origin.z + z, r, h, color, {
      community: true,
      communityDetail: true,
      ...extra,
    });
    objects.push(m);
    return m;
  };
  const roof = (...args) => {
    const m = detail(...args);
    m.opacity = 0.17;
    model.roofs.push(m);
    return m;
  };
  // Keep new ground furniture away from every lane and pedestrian route, not just nodes.
  const routeClear = (x, z, w, d) => {
    for (const [graph, margin] of [
      [sim.map.walks, 0.65],
      [sim.map.roads, 1.5],
    ])
      for (const edges of Object.values(graph.edges))
        for (const edge of edges)
          for (let i = 1; i < edge.points.length; i++) {
            const a = edge.points[i - 1],
              b = edge.points[i],
              length = Math.hypot(b.x - a.x, b.z - a.z);
            for (let t = 0; t <= length; t += 0.25) {
              const f = length ? t / length : 0;
              if (
                Math.abs(a.x + (b.x - a.x) * f - x) < w / 2 + margin &&
                Math.abs(a.z + (b.z - a.z) * f - z) < d / 2 + margin
              )
                return false;
            }
          }
    return true;
  };
  const prop = (x, y, z, w, h, d, color, extra = {}) => {
    if (!routeClear(x, z, w, d)) return null;
    return detail(x, y, z, w, h, d, color, { solid: true, ...extra });
  };
  // Continuous gutters, raised kerbs and pavement expansion joints make the lanes readable.
  for (const [a, b] of sim.map.segments) {
    const horizontal = a.z === b.z,
      x = (a.x + b.x) / 2,
      z = (a.z + b.z) / 2;
    for (const side of [-1, 1]) {
      detail(
        x + (horizontal ? 0 : side * 6.15),
        0.16,
        z + (horizontal ? side * 6.15 : 0),
        horizontal ? 35 : 0.22,
        0.18,
        horizontal ? 0.22 : 35,
        '#adafa6',
      );
      detail(
        x + (horizontal ? 0 : side * 5.7),
        0.126,
        z + (horizontal ? side * 5.7 : 0),
        horizontal ? 35 : 0.1,
        0.012,
        horizontal ? 0.1 : 35,
        '#dedbd0',
      );
      for (let t = 8; t < 43; t += 7) {
        const px = a.x + ((b.x - a.x) * t) / 48,
          pz = a.z + ((b.z - a.z) * t) / 48;
        detail(
          px + (horizontal ? 0 : side * 7.4),
          0.19,
          pz + (horizontal ? side * 7.4 : 0),
          horizontal ? 0.035 : 2,
          0.012,
          horizontal ? 2 : 0.035,
          '#9d9f96',
        );
      }
    }
  }
  for (const b of sim.map.buildings) {
    if (b.residential || ['home', 'roads', 'parking'].includes(b.type)) continue;
    const h = b.type === 'office' ? 6 : b.type === 'factory' ? 5 : 4,
      front = b.z + b.d / 2;
    detail(
      b.x,
      0.1,
      b.z,
      b.w + 3,
      0.055,
      b.d + 3,
      ['warehouse', 'factory'].includes(b.type) ? '#a5aaa2' : '#cbc8ba',
    );
    roof(
      b.x,
      (h + 2.6) / 2,
      front,
      b.w,
      h - 2.6,
      0.25,
      ['factory', 'warehouse'].includes(b.type) ? '#9da7a2' : palette.wall,
      { cutawayFacade: true },
    );
    // A masonry plinth, corner pilasters and inset frames give walls physical depth.
    for (const side of [-1, 1]) {
      detail(b.x + side * (b.w / 4 + 1), 0.45, front + 0.15, b.w / 2 - 2, 0.5, 0.12, palette.brick);
      detail(b.x + side * (b.w / 2 - 0.18), h / 2, front + 0.18, 0.38, h, 0.36, palette.trim);
      detail(
        b.x + side * (b.w / 2 + 0.1),
        h / 2,
        b.z - b.d / 2 + 0.4,
        0.18,
        h,
        0.22,
        palette.metal,
      );
    }
    if (['shop', 'office'].includes(b.type)) {
      for (const side of [-1, 1]) {
        const x = b.x + side * (b.w / 4 + 1),
          w = b.w / 2 - 3;
        detail(x, 1.6, front + 0.24, w, 1.7, 0.055, palette.glass, {
          opacity: 0.8,
          roughness: 0.18,
        });
        for (const dx of [-w / 2, 0, w / 2])
          detail(x + dx, 1.6, front + 0.3, 0.075, 1.85, 0.08, palette.trim);
        for (const y of [0.7, 2.5]) detail(x, y, front + 0.3, w + 0.12, 0.08, 0.16, palette.trim);
        detail(x, 0.62, front + 0.43, w + 0.35, 0.1, 0.5, '#c8c4b9');
      }
      detail(b.x, 3, front + 0.48, b.w - 1, 0.55, 0.26, b.type === 'shop' ? '#385c53' : '#3d5362', {
        signText: b.name,
      });
      if (b.type === 'shop') {
        // Striped shop canopy and its slender support brackets.
        for (let i = 0; i < 10; i++)
          detail(
            b.x - b.w / 2 + 1 + (i * (b.w - 2)) / 10,
            2.67,
            front + 0.9,
            (b.w - 2) / 10,
            0.1,
            1.25,
            i % 2 ? '#e2d8bf' : palette.trim,
            { rotation: [0.14, 0, 0] },
          );
        for (const side of [-1, 1])
          detail(b.x + side * (b.w / 2 - 1), 2.3, front + 0.7, 0.06, 0.5, 0.8, palette.trim);
        // Café furniture stays on the forecourt, off the approach and door opening.
        for (const side of [-1, 1]) {
          const x = b.x + side * 7,
            z = front + 2.3;
          if (prop(x, 0.73, z, 1.2, 0.12, 1.2, '#b3a083')) {
            cylinder(x, 0.4, z, 0.1, 0.65, '#535c5a');
            for (const dz of [-0.95, 0.95]) {
              if (prop(x, 0.4, z + dz, 0.6, 0.12, 0.6, '#64766b'))
                detail(x, 0.75, z + dz, 0.6, 0.6, 0.08, '#64766b');
            }
          }
        }
      } else {
        for (let x = b.x - 8; x <= b.x + 8; x += 4) {
          roof(x, 4.4, front + 0.2, 2.6, 1.8, 0.08, palette.glass, { cutawayFacade: true });
          for (const dx of [-1.35, 0, 1.35])
            roof(x + dx, 4.4, front + 0.28, 0.08, 2, 0.1, palette.trim, { cutawayFacade: true });
          roof(x, 3.42, front + 0.3, 2.8, 0.13, 0.4, '#a9ada6', { cutawayFacade: true });
        }
      }
    } else {
      // Industrial sheet-metal ribs and a high clerestory window band.
      for (let x = b.x - b.w / 2 + 0.8; x < b.x + b.w / 2; x += 1.4)
        detail(x, h / 2, b.z - b.d / 2 - 0.18, 0.055, h - 0.3, 0.08, '#84908d');
      for (let x = b.x - b.w / 2 + 2; x < b.x + b.w / 2 - 1; x += 4) {
        detail(x, h - 0.85, front + 0.17, 2.8, 0.75, 0.08, '#87a7a7');
        detail(x, h - 0.85, front + 0.23, 0.08, 0.85, 0.12, '#535e61');
      }
      detail(b.x + 5, 2.7, front + 0.18, 5.5, 0.7, 0.12, '#425359', { signText: b.name });
      if (b.type === 'warehouse') {
        // Recessed roller shutter, bumper pads, pallets and a clearly marked loading apron.
        detail(b.x + 6, 1.3, front + 0.2, 4.1, 2.25, 0.16, '#87928d');
        for (let y = 0.35; y < 2.5; y += 0.24)
          detail(b.x + 6, y, front + 0.31, 4, 0.045, 0.05, '#667470');
        for (const dx of [-2.3, 2.3])
          detail(b.x + 6 + dx, 0.58, front + 0.3, 0.3, 0.75, 0.25, '#3c4647');
        for (let i = 0; i < 3; i++) {
          const x = b.x - 8 + i * 2.3,
            z = b.z + 3;
          prop(x, 0.34, z, 1.7, 0.24, 1.25, '#998464');
          if (prop(x, 0.95, z, 1.5, 1, 1.1, i % 2 ? '#ad9d83' : '#c5b291'))
            detail(x, 1, z + 0.56, 0.12, 0.9, 0.025, '#dfd8c4');
        }
      } else {
        detail(b.x, 1.36, b.z + 3, 18, 0.06, 2.85, '#394346', { roughness: 0.65 });
        for (let x = b.x - 8.4; x < b.x + 8.5; x += 1.4)
          cylinder(x, 1.41, b.z + 3, 0.075, 2.85, '#99a6a4', { rotation: [Math.PI / 2, 0, 0] });
        // Factory pipework and machine service panels, clear of the central workstation.
        for (const x of [b.x - 8, b.x, b.x + 8]) {
          detail(x, 2.5, b.z - 2.45, 1.9, 1, 0.15, '#44565a');
          detail(x - 0.5, 2.55, b.z - 2.34, 0.8, 0.5, 0.04, '#8aafa3');
          for (const y of [1.1, 1.5, 1.9])
            detail(x + 0.65, y, b.z - 2.34, 0.65, 0.06, 0.04, '#a6b2ab');
          cylinder(x + 1.25, 3.55, b.z - 4, 0.12, 0.6, '#b3beb6');
          detail(x + 0.7, 3.9, b.z - 4, 1.2, 0.15, 0.15, '#b3beb6');
        }
        cylinder(b.x - 8, 4.3, b.z - 10, 0.63, 8.1, '#7e8a89');
        for (const y of [1, 3, 5, 7]) cylinder(b.x - 8, y, b.z - 10, 0.69, 0.13, '#515e60');
        detail(b.x, 4.3, b.z - b.d / 2 + 0.25, b.w - 2, 0.17, 0.17, '#b3b0a3');
        // Yellow/black hazard striping along the conveyor footprint.
        for (let x = b.x - 8; x < b.x + 8; x += 1.1)
          detail(x, 0.224, b.z + 5, 0.55, 0.025, 0.5, '#d0b74e', { rotation: [0, 0.5, 0] });
      }
    }
    // Roofs and rooftop units use the existing cutaway toggle, preserving interior visibility.
    if (['factory', 'warehouse'].includes(b.type) || japan) {
      const oldRoof = model.roofs.find(
        (m) =>
          m.community &&
          m.pos[0] === origin.x + b.x &&
          Math.abs(m.pos[1] - (h + 0.1)) < 0.001 &&
          m.pos[2] === b.z,
      );
      if (oldRoof)
        for (const list of [model.roofs, model.objects, objects])
          list.splice(list.indexOf(oldRoof), 1);
      const pitch = japan ? 0.32 : 0.16,
        run = b.d / 2 + 0.5;
      for (const side of [-1, 1])
        roof(
          b.x,
          h + 0.15 + (run * Math.tan(pitch)) / 2,
          b.z + (side * run) / 2,
          b.w + 0.8,
          0.15,
          run / Math.cos(pitch),
          palette.trim,
          { rotation: [side * pitch, 0, 0] },
        );
      roof(b.x, h + run * Math.tan(pitch) + 0.2, b.z, b.w + 0.9, 0.12, 0.22, '#536060');
    } else {
      for (const dz of [-b.d / 2, b.d / 2])
        roof(b.x, h + 0.4, b.z + dz, b.w + 0.4, 0.45, 0.18, palette.wall);
      roof(b.x - 5, h + 0.8, b.z - 2, 2.4, 1.2, 1.8, '#929b95');
      for (let i = 0; i < 4; i++)
        roof(b.x - 5.7 + i * 0.45, h + 1.45, b.z - 2, 0.08, 0.08, 1.4, '#556260');
    }
  }
  // Landscaped pockets, shrubs and planted trees between the street and building blocks.
  for (const [x, z] of [
    [-38, -28],
    [-15, -27],
    [39, -32],
    [40, -13],
    [-40, 25],
    [38, 23],
    [-28, 42],
  ]) {
    if (
      sim.map.buildings.some(
        (b) => b.residential && Math.abs(x - b.x) < b.w / 2 + 2 && Math.abs(z - b.z) < b.d / 2 + 3,
      )
    )
      continue;
    if (!prop(x, 0.25, z, 2.4, 0.38, 2.4, desert ? '#ba9877' : '#a6ac9b')) continue;
    detail(x, 0.47, z, 2.1, 0.07, 2.1, '#6e795a');
    const tree = buildTree(model, origin.x + x, z, 1.05, {
      style: desert ? 'palm' : location?.iso === 'AUS' ? 'eucalypt' : 'broadleaf',
      detailed: false,
      extra: { community: true, communityDetail: true },
    });
    for (const mesh of tree.parts) {
      mesh.pos[1] += 0.4;
      objects.push(mesh);
    }
  }
  // Parking wheel stops and paint only; keep the delivery/parking routes unobstructed.
  for (let x = 26; x <= 38; x += 4) {
    prop(x, 0.2, 40.6, 2.1, 0.22, 0.24, '#babcae');
    detail(x, 0.173, 34, 1.3, 0.012, 0.12, '#e2dfcc');
  }
}
