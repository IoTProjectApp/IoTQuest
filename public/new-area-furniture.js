// Furniture has a reserved footprint, a clear approach and a material finish.
export function furnishNewAreas(model, { sim, origin, objects, materials }) {
  const groups = [];
  let group;
  const intersects = (a, b, box, margin) => {
    let enter = 0,
      exit = 1;
    for (const [v, delta, centre, half] of [
      [a.x, b.x - a.x, box.x, box.w / 2 + margin],
      [a.z, b.z - a.z, box.z, box.d / 2 + margin],
    ]) {
      if (Math.abs(delta) < 1e-9) {
        if (Math.abs(v - centre) > half) return false;
      } else {
        const t0 = (centre - half - v) / delta,
          t1 = (centre + half - v) / delta;
        enter = Math.max(enter, Math.min(t0, t1));
        exit = Math.min(exit, Math.max(t0, t1));
        if (enter > exit) return false;
      }
    }
    return true;
  };
  const routes = [];
  for (const [graph, margin] of [
    [sim.map.walks, 0.35],
    [sim.map.roads, 1.5],
  ])
    for (const edges of Object.values(graph.edges))
      for (const e of edges)
        for (let i = 1; i < e.points.length; i++)
          routes.push([e.points[i - 1], e.points[i], margin]);
  const place = (b, kind, x, z, w, d, build, area = b.name) => {
    const footprint = { x: x + origin.x, z: z + origin.z, w, d };
    if (
      model.colliders.some(
        (c) =>
          !c.disabled &&
          Math.abs(c.x - footprint.x) < (c.w + w) / 2 + 0.08 &&
          Math.abs(c.z - footprint.z) < (c.d + d) / 2 + 0.08,
      )
    )
      return;
    if (routes.some(([a, q, margin]) => intersects(a, q, { x, z, w, d }, margin))) return;
    if (
      model.rooms.some(
        (r) =>
          r[3]?.community &&
          Math.abs(r[1] - footprint.x) < w / 2 + 0.8 &&
          Math.abs(r[2] - footprint.z) < d / 2 + 0.8,
      )
    )
      return;
    if (
      model.actors.some(
        (a) =>
          Math.abs(a.x - footprint.x) < w / 2 + 0.45 && Math.abs(a.z - footprint.z) < d / 2 + 0.45,
      )
    )
      return;
    group = { id: b.type + ':' + kind, area, parts: [], footprint, roomFurniture: true };
    groups.push(group);
    model.colliders.push({ ...footprint, community: true, communityFurnishing: group.id });
    build(x, z);
  };
  const part = (shape, x, y, z, w, h, d, material, color, extra = {}) => {
    const finish = materials[material];
    const mesh = model.mesh(
      shape,
      [origin.x + x, y, origin.z + z],
      [w, h, d],
      color || finish.color,
      {
        community: true,
        communityFurnishing: group.id,
        furnishingArea: group.area,
        furnitureKind: group.id.split(':').at(-1),
        material,
        roughness: finish.roughness,
        ...extra,
      },
    );
    group.parts.push(mesh);
    objects.push(mesh);
    return mesh;
  };
  const box = (...args) => part('box', ...args);
  const legs = (x, z, w, d, top = 0.94) => {
    for (const dx of [-w / 2 + 0.1, w / 2 - 0.1])
      for (const dz of [-d / 2 + 0.1, d / 2 - 0.1])
        box(x + dx, (top + 0.2) / 2, z + dz, 0.06, top - 0.2, 0.06, 'steel');
  };
  const table = (x, z, w = 1.8, d = 0.9) => {
    box(x, 0.99, z, w, 0.1, d, 'timber');
    legs(x, z, w, d);
  };
  const chair = (x, z, yaw = 0) => {
    const first = group.parts.length;
    box(x, 0.65, z, 0.6, 0.12, 0.6, 'fabric');
    box(x, 0.96, z - 0.25, 0.6, 0.58, 0.1, 'fabric');
    legs(x, z, 0.5, 0.5, 0.59);
    for (const mesh of group.parts.slice(first)) {
      const dx = mesh.pos[0] - origin.x - x,
        dz = mesh.pos[2] - origin.z - z;
      mesh.pos[0] = origin.x + x + Math.cos(yaw) * dx + Math.sin(yaw) * dz;
      mesh.pos[2] = origin.z + z - Math.sin(yaw) * dx + Math.cos(yaw) * dz;
      mesh.rotation = [0, yaw, 0];
    }
  };
  const cabinet = (x, z, w = 0.9, d = 0.65, h = 1.5) => {
    box(x, 0.2 + h / 2, z, w, h, d, 'steel', '#b9c6bd');
    for (const fraction of [0.2, 0.5, 0.8]) {
      const y = 0.2 + h * fraction;
      box(x, y, z + d / 2 + 0.02, w * 0.85, 0.025, 0.03, 'steel', '#788b85');
      box(x, y + 0.06, z + d / 2 + 0.05, w * 0.28, 0.04, 0.04, 'steel');
    }
  };
  const desk = (x, z) => {
    table(x, z, 2.2, 1.1);
    box(x, 1.38, z - 0.25, 0.65, 0.45, 0.08, 'plastic', '#3c565c');
    box(x, 1.11, z - 0.25, 0.08, 0.22, 0.08, 'steel');
    box(x, 1.06, z + 0.25, 0.55, 0.04, 0.2, 'plastic');
    box(x + 0.7, 1.06, z, 0.4, 0.035, 0.5, 'fabric', '#e6dfc9');
  };
  const sofa = (x, z, w = 2.2) => {
    box(x, 0.47, z, w, 0.54, 0.9, 'fabric', '#7b9a91');
    box(x, 0.98, z - 0.36, w, 0.7, 0.16, 'fabric', '#6e8a83');
    for (const side of [-1, 1]) box(x + side * (w / 2 - 0.1), 0.79, z, 0.2, 0.36, 0.9, 'fabric');
  };
  const trolley = (x, z) => {
    for (const y of [0.45, 0.9]) box(x, y, z, 0.7, 0.07, 1.1, 'steel');
    legs(x, z, 0.7, 1.1, 0.87);
    for (const dx of [-0.25, 0.25])
      for (const dz of [-0.45, 0.45])
        part('cylinder', x + dx, 0.275, z + dz, 0.15, 0.07, 0.15, 'plastic', '#43585a', {
          rotation: [0, 0, Math.PI / 2],
        });
    for (const dz of [-0.3, 0.3]) box(x, 1.01, z + dz, 0.4, 0.13, 0.28, 'ceramic');
  };
  for (const b of sim.map.buildings) {
    if (b.type === 'hospital') {
      place(b, 'waiting-sofa', b.x - 5, b.z + 3.4, 2.2, 0.9, sofa);
      place(b, 'waiting-table', b.x - 5, b.z + 5, 1.4, 0.7, (x, z) => table(x, z, 1.4, 0.7));
      place(b, 'visitor-chair', b.x - 2.2, b.z + 4.8, 0.6, 0.6, (x, z) =>
        chair(x, z, Math.atan2(-2.8, 0.2)),
      );
      place(b, 'nurses-desk', b.x, b.z - 5.3, 2.2, 1.1, desk);
      place(b, 'nurses-chair', b.x, b.z - 3.9, 0.6, 0.6, (x, z) => chair(x, z, Math.PI));
      place(b, 'treatment-trolley', b.x + 7.6, b.z, 0.7, 1.1, trolley);
      place(b, 'medicine-cabinet', b.x + 7.8, b.z - 2.2, 0.9, 0.65, cabinet);
      for (const side of [-1, 1])
        place(b, 'bedside-cabinet-' + side, b.x + 7.5, b.z + side * 4.1, 0.75, 0.65, (x, z) =>
          cabinet(x, z, 0.75, 0.65, 0.7),
        );
      place(b, 'washbasin', b.x + 0.4, b.z + 6.3, 1.5, 0.65, (x, z) => {
        cabinet(x, z, 1.5, 0.65, 0.8);
        part('bowl', x, 1.04, z, 0.6, 0.16, 0.4, 'ceramic');
        box(x, 1.26, z - 0.2, 0.05, 0.36, 0.05, 'steel');
        box(x, 1.42, z - 0.08, 0.05, 0.05, 0.25, 'steel');
      });
    } else if (b.type === 'school') {
      place(b, 'reception-files', b.x - 7.5, b.z - 4.5, 0.9, 0.65, cabinet);
      place(b, 'waiting-chair', b.x - 5, b.z + 4.5, 0.6, 0.6, (x, z) => chair(x, z, Math.PI));
      for (const [i, dz] of [-4.6, 0, 4.6].entries())
        place(
          b,
          'classroom-lectern-' + i,
          b.x + 7.5,
          b.z + dz,
          0.65,
          0.75,
          (x, z) => {
            box(x, 0.68, z, 0.4, 0.95, 0.55, 'timber');
            box(x, 1.22, z, 0.65, 0.1, 0.75, 'timber', null, { rotation: [0.12, 0, 0] });
            box(x, 1.29, z, 0.4, 0.04, 0.3, 'fabric', '#ebe3cc');
          },
          'School classroom ' + (i + 1),
        );
    } else if (b.type === 'police') {
      place(b, 'reception-seating', b.x - 6.5, b.z + 4.5, 2.2, 0.9, sofa);
      place(b, 'office-files', b.x - 2.3, b.z - 5.8, 0.9, 0.65, cabinet, 'Police office');
      place(
        b,
        'office-printer',
        b.x - 2.5,
        b.z - 3.1,
        0.9,
        0.65,
        (x, z) => {
          cabinet(x, z, 0.9, 0.65, 0.7);
          box(x, 1.08, z, 0.7, 0.35, 0.5, 'plastic');
          box(x, 1.27, z, 0.45, 0.03, 0.3, 'fabric', '#e9e5d5');
        },
        'Police office',
      );
      place(
        b,
        'custody-desk',
        b.x + 2,
        b.z - 6.3,
        1,
        0.65,
        (x, z) => table(x, z, 1, 0.65),
        'Police jail',
      );
      for (const [i, dz] of [-6.35, -3.35].entries())
        place(
          b,
          'cell-washbasin-' + i,
          b.x + 7.9,
          b.z + dz,
          0.5,
          0.5,
          (x, z) => {
            box(x, 0.5, z, 0.35, 0.6, 0.35, 'ceramic');
            part('bowl', x, 0.85, z, 0.5, 0.15, 0.45, 'steel');
          },
          'Police jail',
        );
      place(
        b,
        'garage-workbench',
        b.x + 6.5,
        b.z + 6.3,
        2,
        0.6,
        (x, z) => {
          table(x, z, 2, 0.6);
          box(x, 1.23, z, 0.6, 0.4, 0.4, 'plastic', '#718b81');
        },
        'Police parking',
      );
    } else if (b.type === 'fire') {
      place(b, 'office-chair', b.x - 4, b.z - 4.8, 0.6, 0.6, (x, z) => chair(x, z, Math.PI));
      place(b, 'staff-table', b.x - 5, b.z + 3.5, 2, 1, (x, z) => table(x, z, 2, 1));
      for (const side of [-1, 1])
        place(b, 'staff-chair-' + side, b.x - 5 + side * 1.5, b.z + 3.5, 0.6, 0.6, (x, z) =>
          chair(x, z, (-side * Math.PI) / 2),
        );
      place(b, 'staff-kitchen', b.x - 6, b.z - 3.8, 2.6, 0.65, (x, z) => {
        cabinet(x, z, 2.6, 0.65, 0.8);
        box(x + 0.7, 1.15, z, 0.45, 0.3, 0.4, 'plastic');
        part('bowl', x - 0.7, 1.07, z, 0.55, 0.12, 0.4, 'steel');
      });
      place(b, 'rest-bed', b.x - 6.8, b.z + 6, 2.4, 1.2, (x, z) => {
        box(x, 0.48, z, 2.4, 0.35, 1.2, 'timber');
        box(x, 0.77, z, 2.35, 0.23, 1.15, 'fabric', '#bdc8c1');
        legs(x, z, 2.4, 1.2, 0.305);
        box(x - 0.8, 0.96, z, 0.55, 0.17, 0.9, 'fabric', '#ece8d9');
      });
      place(b, 'equipment-trolley', b.x + 6.8, b.z - 4, 0.7, 1.1, trolley);
    } else if (b.residential) {
      place(b, 'garden-table', b.x - 3.5, b.z + b.d / 2 + 4.5, 1.4, 0.8, (x, z) =>
        table(x, z, 1.4, 0.8),
      );
      for (const side of [-1, 1])
        place(
          b,
          'garden-chair-' + side,
          b.x - 3.5 + side * 1.2,
          b.z + b.d / 2 + 4.5,
          0.6,
          0.6,
          (x, z) => chair(x, z, (-side * Math.PI) / 2),
        );
    } else if (b.regionalNeighbour) {
      place(b, 'terrace-bench', b.x - 3.5, b.z + b.facing * (b.d / 2 + 1.5), 1.2, 0.6, (x, z) => {
        box(x, 0.55, z, 1.2, 0.1, 0.6, 'timber');
        legs(x, z, 1.2, 0.6, 0.5);
        box(x, 0.84, z - b.facing * 0.25, 1.2, 0.5, 0.1, 'timber');
      });
    }
  }
  return groups;
}
