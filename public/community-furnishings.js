// Shared metre-scale furniture and equipment. Materials use the existing lighting shader.
export const furnishingMaterials = {
  timber: { color: '#b18d69', roughness: 0.72 },
  fabric: { color: '#849a89', roughness: 1 },
  steel: { color: '#a2b2ad', roughness: 0.27 },
  glass: { color: '#759eaa', roughness: 0.12 },
  concrete: { color: '#aab0a7', roughness: 0.94 },
  ceramic: { color: '#e5e4d7', roughness: 0.34 },
  plastic: { color: '#536b70', roughness: 0.55 },
};

export function furnishCommunity(model, { sim, origin, areas, objects }) {
  const groups = [],
    indicators = [];
  let group;
  const part = (shape, x, y, z, w, h, d, material, color, extra = {}) => {
    const finish = furnishingMaterials[material];
    const m = model.mesh(shape, [origin.x + x, y, z], [w, h, d], color || finish.color, {
      community: true,
      communityFurnishing: group.id,
      furnishingArea: group.area,
      material,
      roughness: finish.roughness,
      ...extra,
    });
    objects.push(m);
    group.parts.push(m);
    return m;
  };
  const box = (x, y, z, w, h, d, material, color, extra = {}) =>
    part('box', x, y, z, w, h, d, material, color, extra);
  const round = (...args) => {
    const m = box(...args);
    m.rounded = true;
    return m;
  };
  const cylinder = (x, y, z, r, h, material, color, extra = {}) =>
    part('cylinder', x, y, z, r * 2, h, r * 2, material, color, extra);
  const routes = [];
  for (const [graph, margin] of [
    [sim.map.walks, 0.65],
    [sim.map.roads, 1.5],
  ])
    for (const [id, edges] of Object.entries(graph.edges))
      for (const e of edges) {
        if (graph === sim.map.walks && id > e.to) continue;
        for (let i = 1; i < e.points.length; i++)
          routes.push({ a: e.points[i - 1], b: e.points[i], margin });
      }
  const intersects = (a, b, minX, maxX, minZ, maxZ) => {
    let enter = 0,
      exit = 1;
    for (const [v, delta, min, max] of [
      [a.x, b.x - a.x, minX, maxX],
      [a.z, b.z - a.z, minZ, maxZ],
    ]) {
      if (Math.abs(delta) < 1e-9) {
        if (v < min || v > max) return false;
      } else {
        const t0 = (min - v) / delta,
          t1 = (max - v) / delta;
        enter = Math.max(enter, Math.min(t0, t1));
        exit = Math.min(exit, Math.max(t0, t1));
        if (enter > exit) return false;
      }
    }
    return true;
  };
  const clear = (x, z, w, d) => {
    // Preserve the central controller installation area and every public route.
    if (
      areas.some((a) => {
        const r = model.rooms.find((r) => r[0] === a[0]);
        return (
          r && Math.abs(x + origin.x - r[1]) < w / 2 + 2.59 && Math.abs(z - r[2]) < d / 2 + 2.7
        );
      })
    )
      return false;
    if (
      model.colliders.some(
        (o) =>
          Math.abs(x + origin.x - o.x) < (w + o.w) / 2 + 0.08 &&
          Math.abs(z - o.z) < (d + o.d) / 2 + 0.08,
      )
    )
      return false;
    for (const { a, b, margin } of routes)
      if (
        intersects(
          a,
          b,
          x - w / 2 - margin,
          x + w / 2 + margin,
          z - d / 2 - margin,
          z + d / 2 + margin,
        )
      )
        return false;
    return true;
  };
  const begin = (id, area, x, z, w, d, reuse = false) => {
    if (!reuse && !clear(x, z, w, d)) return false;
    group = {
      id,
      area,
      parts: [],
      footprint: { x: origin.x + x, z, w, d },
      reusedFootprint: reuse,
    };
    groups.push(group);
    if (!reuse)
      model.colliders.push({ ...group.footprint, community: true, communityFurnishing: id });
    // Soft contact shadow stays below the furniture, above the raised interior floor.
    part('sphere', x, 0.207, z, w * 1.02, 0.012, d * 1.02, 'concrete', '#3b4742', {
      opacity: 0.12,
    });
    return true;
  };
  const remove = (x, y, z) => {
    const old = objects.find(
      (m) =>
        m.shape === 'box' &&
        Math.abs(m.pos[0] - origin.x - x) < 0.001 &&
        Math.abs(m.pos[1] - y) < 0.001 &&
        Math.abs(m.pos[2] - z) < 0.001,
    );
    if (old)
      for (const list of [objects, model.objects]) {
        const i = list.indexOf(old);
        if (i >= 0) list.splice(i, 1);
      }
  };
  const legs = (x, z, w, d, top, height) => {
    for (const dx of [-w / 2, w / 2])
      for (const dz of [-d / 2, d / 2])
        cylinder(x + dx, top - height / 2, z + dz, 0.04, height, 'steel');
  };
  const chair = (x, z, color = '#7a9186') => {
    round(x, 0.67, z, 0.62, 0.13, 0.64, 'fabric', color);
    round(x, 1.03, z - 0.27, 0.62, 0.64, 0.13, 'fabric', color);
    legs(x, z, 0.43, 0.43, 0.59, 0.37);
  };
  const monitor = (x, z, top = 0.99) => {
    box(x, top + 0.39, z, 0.67, 0.43, 0.075, 'plastic', '#35494d');
    const screen = box(x, top + 0.39, z + 0.041, 0.58, 0.33, 0.016, 'glass', '#70978e', {
      emission: 0.05,
    });
    box(x, top + 0.11, z, 0.08, 0.2, 0.08, 'steel');
    box(x, top + 0.023, z, 0.32, 0.045, 0.2, 'steel');
    box(x, top + 0.023, z + 0.4, 0.54, 0.035, 0.2, 'plastic', '#c5ccc4');
    return screen;
  };
  const stock = (x, y, z, color = '#b5a27f') => {
    box(x, y, z, 0.55, 0.46, 0.55, 'timber', color);
    box(x, y + 0.238, z, 0.08, 0.017, 0.54, 'fabric', '#ded7bd');
    box(x, y, z + 0.282, 0.24, 0.12, 0.014, 'ceramic', '#e5ddc8');
  };
  const wardrobe = (x, z) => {
    box(x, 1.06, z, 1.2, 1.72, 1.1, 'timber');
    for (const dx of [-0.3, 0.3]) {
      box(x + dx, 1.08, z + 0.563, 0.57, 1.6, 0.03, 'timber', '#c4a381');
      box(x + dx * 0.2, 1.07, z + 0.6, 0.025, 0.18, 0.045, 'steel');
    }
  };
  const fridge = (x, z, w = 1, d = 0.85) => {
    box(x, 1.27, z, w, 2.12, d, 'steel', '#cbd3cc');
    for (const [y, h] of [
      [0.88, 1.25],
      [1.83, 0.59],
    ]) {
      box(x, y, z + d / 2 + 0.025, w * 0.92, h, 0.06, 'ceramic', '#e0e4da');
      box(x - w * 0.35, y, z + d / 2 + 0.08, 0.045, h * 0.55, 0.05, 'steel');
    }
    for (let i = 0; i < 4; i++)
      box(x - w * 0.35 + i * w * 0.23, 0.27, z + d / 2 + 0.05, 0.035, 0.1, 0.035, 'plastic');
  };
  for (const b of sim.map.buildings) {
    const area = areas.find((a) => a[3]?.communityType === b.type)?.[0];
    if (!area) continue;
    if (b.residential) {
      const x = b.x - 3.2,
        z = b.z - 1.4;
      begin(b.type + ':sofa', area, x, z, 2.2, 1.3, true);
      remove(x, 0.55, z);
      remove(x, 1.05, z);
      round(x, 0.47, z, 2.2, 0.3, 1.3, 'timber', '#6d6559');
      round(x, 0.79, z - 0.49, 2.2, 0.78, 0.26, 'fabric');
      for (const dx of [-0.45, 0.45])
        round(x + dx, 0.69, z + 0.06, 0.86, 0.2, 0.94, 'fabric', '#a3b29d');
      for (const dx of [-1, 1]) round(x + dx, 0.78, z, 0.21, 0.58, 1.25, 'fabric');
      begin(b.type + ':wardrobe', area, b.x + 3.3, b.z - 2, 1.2, 1.1, true);
      remove(b.x + 3.3, 0.85, b.z - 2);
      wardrobe(b.x + 3.3, b.z - 2);
      if (begin(b.type + ':bed', area, b.x - 3.6, b.z + 1.1, 1.6, 2.15)) {
        round(b.x - 3.6, 0.48, b.z + 1.1, 1.6, 0.35, 2.15, 'timber');
        round(b.x - 3.6, 0.76, b.z + 1.1, 1.55, 0.23, 2.07, 'fabric', '#f0ece1');
        round(b.x - 3.6, 0.91, b.z + 1.43, 1.57, 0.1, 1.42, 'fabric', '#8a9aa2');
        round(b.x - 3.6, 0.91, b.z + 0.34, 1.1, 0.16, 0.4, 'fabric', '#e9e5d6');
      }
      if (begin(b.type + ':kitchen', area, b.x + 0.8, b.z - 3.25, 4, 0.85)) {
        box(b.x + 0.8, 0.64, b.z - 3.25, 4, 0.88, 0.85, 'timber', '#baa486');
        box(b.x + 0.8, 1.11, b.z - 3.25, 4.05, 0.08, 0.9, 'ceramic');
        for (let dx = -0.7; dx < 2.4; dx += 0.75) {
          box(b.x + dx, 0.65, b.z - 2.814, 0.69, 0.78, 0.025, 'timber', '#c6b69b');
          box(b.x + dx, 0.85, b.z - 2.78, 0.24, 0.025, 0.035, 'steel');
        }
        part('bowl', b.x - 0.5, 1.15, b.z - 3.25, 0.55, 0.12, 0.42, 'steel');
        cylinder(b.x - 0.5, 1.34, b.z - 3.52, 0.025, 0.36, 'steel');
        box(b.x + 2, 1.16, b.z - 3.25, 0.74, 0.026, 0.55, 'plastic', '#3d494b');
        for (const dx of [-0.18, 0.18])
          for (const dz of [-0.13, 0.13])
            cylinder(b.x + 2 + dx, 1.185, b.z - 3.25 + dz, 0.09, 0.02, 'steel', '#788481');
      }
      if (begin(b.type + ':fridge', area, b.x + 3.65, b.z - 3.32, 0.95, 0.85))
        fridge(b.x + 3.65, b.z - 3.32, 0.95);
    } else if (b.type === 'shop') {
      begin('shop:counter', area, b.x - 6, b.z, 6, 1.5, true);
      remove(b.x - 6, 0.7, b.z);
      box(b.x - 6, 0.7, b.z, 5.9, 1, 1.45, 'timber');
      box(b.x - 6, 1.23, b.z, 6, 0.07, 1.5, 'ceramic');
      const screen = monitor(b.x - 4.3, b.z - 0.12, 1.265);
      indicators.push({ area, screen, ids: ['autoDoor'] });
      cylinder(b.x - 7.3, 1.55, b.z, 0.17, 0.6, 'steel');
      cylinder(b.x - 7.3, 1.84, b.z, 0.22, 0.06, 'steel');
      for (let i = 0; i < 3; i++)
        part('vase', b.x - 7 + i * 0.45, 1.37, b.z + 0.43, 0.2, 0.25, 0.2, 'ceramic');
      begin('shop:refrigeration', area, b.x + 6, b.z, 3, 2, true);
      remove(b.x + 6, 1, b.z);
      box(b.x + 6, 1.3, b.z - 0.9, 2.95, 2.2, 0.12, 'steel', '#c3d0c6');
      for (const dx of [-1.41, 1.41])
        box(b.x + 6 + dx, 1.3, b.z, 0.13, 2.2, 1.9, 'steel', '#c3d0c6');
      for (const y of [0.24, 2.41]) box(b.x + 6, y, b.z, 2.95, 0.08, 1.9, 'steel', '#c3d0c6');
      for (const dx of [-0.95, 0, 0.95]) {
        for (const y of [0.6, 1.2, 1.8]) {
          box(b.x + 6 + dx, y, b.z + 0.2, 0.84, 0.055, 1.35, 'steel');
          for (const side of [-0.22, 0.22])
            cylinder(b.x + 6 + dx + side, y + 0.21, b.z + 0.55, 0.1, 0.36, 'ceramic', '#a8b491');
        }
        box(b.x + 6 + dx, 1.35, b.z + 0.98, 0.88, 1.88, 0.035, 'glass', null, { opacity: 0.6 });
        box(b.x + 6 + dx + 0.36, 1.35, b.z + 1.02, 0.03, 0.5, 0.05, 'steel');
      }
      const alert = box(b.x + 6, 2.46, b.z + 0.97, 0.22, 0.1, 0.06, 'plastic', '#728575');
      indicators.push({ area, screen: alert, ids: ['warningLight'], alarm: true });
      for (const offset of [-5, 3])
        if (begin('shop:shelf' + offset, area, b.x + offset, b.z - 4.65, 3, 0.75)) {
          for (const y of [0.45, 1.08, 1.71]) {
            box(b.x + offset, y, b.z - 4.65, 3, 0.09, 0.75, 'timber');
            for (let i = -1; i <= 1; i++)
              stock(
                b.x + offset + i * 0.8,
                y + 0.27,
                b.z - 4.65,
                ['#b99e7c', '#8d9d86', '#aaa47f'][i + 1],
              );
          }
          for (const dx of [-1.45, 1.45])
            box(b.x + offset + dx, 1.1, b.z - 4.65, 0.1, 1.9, 0.75, 'steel');
        }
    } else if (b.type === 'office') {
      for (let i = 0; i < 4; i++) {
        const x = b.x - 7 + i * 4,
          z = b.z;
        begin('office:desk' + i, area, x, z, 2.6, 1.5, true);
        remove(x, 0.7, z);
        box(x, 0.94, z, 2.6, 0.1, 1.5, 'timber');
        legs(x, z, 2.3, 1.15, 0.89, 0.66);
        const screen = monitor(x, z - 0.35);
        indicators.push({ area, screen, ids: ['fan', 'led'] });
        box(x + 0.83, 1, z + 0.24, 0.48, 0.035, 0.36, 'fabric', '#e3ddc9');
        if (begin('office:chair' + i, area, x, z - 1.3, 0.68, 0.72)) chair(x, z - 1.3);
      }
    } else if (b.type === 'warehouse') {
      for (const dx of [-7, 0, 7]) {
        const x = b.x + dx,
          z = b.z - 3;
        begin('warehouse:rack' + dx, area, x, z, 5, 4, true);
        remove(x, 1, z);
        remove(x, 2.5, z);
        for (const ax of [-2.35, 2.35])
          for (const az of [-1.85, 1.85])
            box(x + ax, 1.65, z + az, 0.13, 2.9, 0.13, 'steel', '#657f80');
        for (const y of [0.4, 1.6, 2.8]) {
          box(x, y, z, 4.9, 0.12, 3.9, 'steel', '#909d94');
          for (const ax of [-1.5, 0, 1.5]) stock(x + ax, y + 0.31, z + 0.9);
        }
      }
      if (begin('warehouse:pallet-jack', area, b.x - 7, b.z + 5.5, 1, 1.85)) {
        box(b.x - 7, 0.36, b.z + 5.5, 0.75, 0.3, 0.6, 'steel', '#c6aa51');
        for (const dx of [-0.3, 0.3])
          box(b.x - 7 + dx, 0.25, b.z + 6, 0.18, 0.13, 1.45, 'steel', '#c6aa51');
        cylinder(b.x - 7, 0.95, b.z + 5.1, 0.035, 1.2, 'steel');
        box(b.x - 7, 1.5, b.z + 5.1, 0.5, 0.09, 0.12, 'plastic');
      }
    } else if (b.type === 'factory') {
      if (begin('factory:workbench', area, b.x - 10.5, b.z + 1, 2.2, 1.3)) {
        box(b.x - 10.5, 1.08, b.z + 1, 2.2, 0.12, 1.3, 'timber');
        legs(b.x - 10.5, b.z + 1, 1.9, 1, 1.02, 0.79);
        box(b.x - 10.5, 1.68, b.z + 0.5, 2.2, 1.05, 0.08, 'steel', '#7b8c87');
        for (let i = 0; i < 4; i++) {
          box(b.x - 11.2 + i * 0.45, 1.77, b.z + 0.59, 0.045, 0.42, 0.04, 'steel');
          box(b.x - 11.2 + i * 0.45, 1.98, b.z + 0.59, 0.18, 0.055, 0.05, 'steel');
        }
        round(b.x - 10.3, 1.31, b.z + 1.13, 0.62, 0.32, 0.4, 'plastic', '#7b8e89');
      }
      for (const dx of [-8, 0, 8]) {
        begin('factory:machine' + dx, area, b.x + dx, b.z - 4, 3, 3, true);
        const screen = box(b.x + dx + 0.55, 2.45, b.z - 2.43, 0.47, 0.3, 0.045, 'glass', '#7aa18b');
        indicators.push({ area, screen, ids: ['conveyor'], alarmId: 'warningLight' });
        cylinder(b.x + dx + 0.65, 1.4, b.z - 2.37, 0.14, 0.04, 'ceramic', null, {
          rotation: [Math.PI / 2, 0, 0],
        });
        box(b.x + dx + 0.65, 1.4, b.z - 2.33, 0.025, 0.18, 0.02, 'plastic', '#536a60', {
          rotation: [0, 0, 0.5],
        });
      }
      if (begin('factory:materials', area, b.x + 10, b.z + 1, 1.5, 1.4)) {
        box(b.x + 10, 0.4, b.z + 1, 1.5, 0.4, 1.4, 'timber');
        for (const z of [-0.35, 0, 0.35])
          cylinder(b.x + 10, 0.8, b.z + 1 + z, 0.13, 1.3, 'steel', null, {
            rotation: [0, 0, Math.PI / 2],
          });
      }
    } else if (b.type === 'parking' && begin('parking:bench', area, 37.5, 30, 1.8, 0.8)) {
      box(37.5, 0.62, 30, 1.8, 0.1, 0.65, 'timber');
      legs(37.5, 30, 1.5, 0.45, 0.57, 0.37);
      box(37.5, 0.98, 29.75, 1.8, 0.7, 0.1, 'timber');
    } else if (b.type === 'roads' && begin('roads:service-tools', area, -19.5, -15.5, 0.8, 1.3)) {
      box(-19.5, 0.75, -15.5, 0.8, 1.1, 1.3, 'steel', '#86958b');
      for (const y of [0.5, 0.85, 1.2]) box(-19.5, y, -14.82, 0.65, 0.035, 0.035, 'steel');
    }
  }
  return { groups, indicators };
}

export function updateCommunityEquipment(furnishings, state) {
  for (const item of furnishings.indicators) {
    const devices = state.devices.filter((d) => d.area === item.area);
    const on = (id) =>
      state.running && devices.some((d) => d.id === id && state.outputs[d.pin] > 0);
    const active = item.ids.some(on),
      alarm = item.alarmId && on(item.alarmId);
    item.screen.emission = active || alarm ? 0.45 : 0.05;
    item.screen.color =
      alarm || (item.alarm && active) ? '#d69664' : active ? '#8fb5a0' : '#547772';
  }
}
