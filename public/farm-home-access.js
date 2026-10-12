// A private car lane skirts the orchard pond before entering the existing service yard.
export function buildFarmHomeLane(model) {
  const farm = model.farm,
    parts = [];
  const route = [
    { x: 0, z: 11.55 },
    { x: 0, z: 15.2 },
  ];
  for (let i = 1; i <= 16; i++) {
    const a = (i * Math.PI) / 32;
    route.push({ x: -2 + 2 * Math.cos(a), z: 15.2 + 2 * Math.sin(a) });
  }
  route.push({ x: -8, z: 17.2 });
  for (let i = 1; i <= 16; i++) {
    const a = (i * Math.PI) / 32;
    route.push({ x: -8 - 2 * Math.sin(a), z: 19.2 - 2 * Math.cos(a) });
  }
  route.push({ x: -10, z: 31 }, { x: -10, z: 32.2 });
  for (let i = 1; i <= 16; i++) {
    const a = (i * Math.PI) / 32;
    route.push({ x: -8 - 2 * Math.cos(a), z: 32.2 + 2 * Math.sin(a) });
  }
  route.push({ x: -2, z: 34.2 });
  const add = (x, y, z, w, h, d, color, extra = {}) => {
    const mesh = model.box(x, y, z, w, h, d, color, {
      farmHomeDriveway: true,
      roughness: 0.85,
      ...extra,
    });
    parts.push(mesh);
    return mesh;
  };
  for (let i = 1; i < route.length; i++) {
    const a = route[i - 1],
      b = route[i],
      length = Math.hypot(b.x - a.x, b.z - a.z);
    add((a.x + b.x) / 2, 0.16, (a.z + b.z) / 2, 3.6, 0.04, length + 0.07, '#858e86', {
      surface: 'asphalt',
      rotation: [0, Math.atan2(b.x - a.x, b.z - a.z), 0],
    });
  }
  // Fences reserve the lane as vehicle access instead of grazing space.
  const fence = (x, z, w, d) => {
    for (const y of [0.4, 0.75, 1.1])
      add(x, y, z, w, 0.035, d, '#a0aaa4', { farmHomeLaneFence: true, surface: 'steel' });
    const length = Math.max(w, d);
    for (let t = -length / 2; t <= length / 2; t += 3)
      add(x + (w > d ? t : 0), 0.7, z + (d > w ? t : 0), 0.12, 1.4, 0.12, '#8f785b', {
        farmHomeLaneFence: true,
      });
  };
  fence(-12.2, 22.8, 0.04, 16.4);
  fence(-7.8, 25.2, 0.04, 11.6);
  fence(-2.4, 19.4, 10.8, 0.04);
  fence(3, 17, 0.04, 4.8);
  for (const side of [-1, 1]) {
    add(-10 + side * 2.7, 0.8, 31, 0.22, 1.6, 0.22, '#7f8c85', { farmPrivateCarGate: true });
    for (const y of [0.4, 0.8, 1.2])
      add(-10 + side * 2.7, y, 29.7, 0.07, 0.06, 2.6, '#a9b5aa', {
        farmPrivateCarGate: true,
        surface: 'steel',
      });
  }
  farm.obstacles.push(
    { x: -5, z: 17.2, w: 14, d: 5.2, vehicleLane: true },
    { x: -10, z: 25.2, w: 5.2, d: 13.6, vehicleLane: true },
  );
  farm.homeVehicleAccess = {
    route,
    parts,
    gate: { x: -10, z: 31, width: 5.4 },
    carPark: { x: 18, z: 56 },
  };
}

export function connectFarmHomeCars(model, sim, origin) {
  const access = model.farm?.homeVehicleAccess,
    car = model.homeDriveway?.car;
  if (!access || !car) return;
  const roads = sim.map.roads,
    local = (p) => ({ x: p.x - origin.x, z: p.z - origin.z });
  roads.node('homestead-car', car.x - origin.x, car.z - origin.z);
  const route = [...model.homeDriveway.route, ...access.route.slice(1)].map(local);
  roads.edge('homestead-car', 'farm-parking', { driveway: true, homestead: true, points: route });
  roads.edge('farm-parking', 'homestead-car', {
    driveway: true,
    homestead: true,
    points: [...route].reverse(),
  });
  roads.node('farm-car-park', 18 - origin.x, 56 - origin.z);
  const curve = (a, b, c, d) =>
    Array.from({ length: 33 }, (_, i) => {
      const t = i / 32,
        u = 1 - t;
      return local({
        x: u ** 3 * a.x + 3 * u * u * t * b.x + 3 * u * t * t * c.x + t ** 3 * d.x,
        z: u ** 3 * a.z + 3 * u * u * t * b.z + 3 * u * t * t * c.z + t ** 3 * d.z,
      });
    });
  const parking = curve({ x: -2, z: 34.2 }, { x: 6, z: 34.2 }, { x: 18, z: 47 }, { x: 18, z: 56 });
  roads.edge('farm-parking', 'farm-car-park', { driveway: true, points: parking });
  roads.edge('farm-car-park', 'farm-parking', { driveway: true, points: [...parking].reverse() });
  roads.edge('farm-car-park', 'farm-departure', {
    driveway: true,
    points: curve({ x: 18, z: 56 }, { x: 18, z: 54 }, { x: 22, z: 48 }, { x: 28, z: 45.8 }),
  });
  roads.node('farm-parked-car', 22 - origin.x, 56 - origin.z);
  roads.edge('farm-parked-car', 'farm-departure', {
    driveway: true,
    points: curve({ x: 22, z: 56 }, { x: 22, z: 54 }, { x: 22, z: 48 }, { x: 28, z: 45.8 }),
  });
  // A second parked car makes the marked car-park bays visible and identifiable.
  const source = model.homeDriveway.carParts;
  access.parkedCar = source.map((part) =>
    model.mesh(
      part.shape,
      [part.pos[0] + 22 - car.x, part.pos[1] - 0.11, part.pos[2] + 56 - car.z],
      part.size,
      part.color,
      {
        rotation: [...part.rotation],
        opacity: part.opacity,
        roughness: part.roughness,
        community: true,
        parkedFarmCar: true,
      },
    ),
  );
  model.colliders.push({ x: 22, z: 56, w: 1.9, d: 3.1, parkedFarmCar: true });
  access.car = car;
  access.carParkRoute = parking.map((p) => ({ x: p.x + origin.x, z: p.z + origin.z }));
  sim.map.farmDriveway.homestead = 'homestead-car';
  sim.map.farmDriveway.carPark = 'farm-car-park';
}
