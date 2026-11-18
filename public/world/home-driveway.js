const curve = (a, b, c, d) =>
  Array.from({ length: 25 }, (_, i) => {
    const t = i / 24,
      u = 1 - t;
    return {
      x: u ** 3 * a.x + 3 * u * u * t * b.x + 3 * u * t * t * c.x + t ** 3 * d.x,
      z: u ** 3 * a.z + 3 * u * u * t * b.z + 3 * u * t * t * c.z + t ** 3 * d.z,
    };
  });

export function buildHomeDriveway(model) {
  const car = model.colliders.find((c) => c.prop === 'car');
  if (!car || !model.objects.some((m) => m.prop === 'car')) return;
  for (const leaf of [model.dynamic.gate, model.dynamic.gateRight]) {
    leaf.baseHeight = 0.78;
    leaf.pos[1] = 0.78;
  }
  const gate = { x: model.dynamic.gateCollider.x, z: model.dynamic.gateCollider.z };
  const route = [
    { x: car.x, z: car.z },
    { x: car.x, z: -1 },
    ...curve({ x: car.x, z: 0 }, { x: car.x, z: 3 }, { x: gate.x, z: 5.5 }, { x: gate.x, z: 8 }),
    gate,
  ];
  const driveway = (model.homeDriveway = {
    car,
    carParts: model.objects.filter((m) => m.prop === 'car'),
    gate,
    width: 3.2,
    route,
    parts: [],
  });
  // Move the path lanterns onto the verges instead of leaving them in the driving lane.
  for (const [x, z, nextX] of [
    [-1.1, 4.3, -2.8],
    [1.35, 6.8, 2.4],
    [-1.1, 9, -2.3],
  ])
    for (const mesh of model.objects)
      if (
        Math.abs(mesh.pos[0] - x) < 1e-6 &&
        Math.abs(mesh.pos[2] - z) < 1e-6 &&
        mesh.pos[1] < 1.7 &&
        mesh.size[0] < 0.6
      )
        mesh.pos[0] = nextX;
  const floor = model.floorHeight?.(car.x, -1.1) ?? 0.23;
  const height = (z) => 0.16 + Math.max(0, floor - 0.16) * Math.max(0, Math.min(1, (8 - z) / 9));
  for (let i = 2; i < route.length; i++) {
    const a = route[i - 1],
      b = route[i],
      length = Math.hypot(b.x - a.x, b.z - a.z);
    const z = (a.z + b.z) / 2;
    const dy = height(a.z) - height(b.z),
      y = (height(a.z) + height(b.z)) / 2;
    const mesh = model.box(
      (a.x + b.x) / 2,
      y,
      z,
      3.2,
      0.04,
      Math.hypot(length, dy) + 0.035,
      '#858e86',
      {
        homeDriveway: true,
        drivewaySection: 'garage-to-gate',
        surface: 'asphalt',
        roughness: 0.85,
        rotation: [Math.atan2(dy, length), Math.atan2(b.x - a.x, b.z - a.z), 0],
      },
    );
    driveway.parts.push(mesh);
  }
}

export function connectHomeDriveway(model, sim, origin) {
  const driveway = model.homeDriveway;
  if (!driveway || model.farm) return;
  // The existing house faces the shared east-west street at world z=24.
  const road = sim.map.segments.find(
    ([a, b]) =>
      a.z === b.z &&
      a.z + origin.z > driveway.gate.z &&
      a.x + origin.x <= driveway.gate.x &&
      b.x + origin.x >= driveway.gate.x,
  );
  if (!road) return;
  const roadZ = road[0].z + origin.z;
  driveway.road = { x: driveway.gate.x, z: roadZ };
  driveway.route.push(driveway.road);
  sim.map.homeDriveway = {
    x: driveway.gate.x - origin.x,
    z: roadZ - origin.z,
    width: driveway.width,
  };
}

export function drawHomeStreetDriveway(model, { origin, box }) {
  const driveway = model.homeDriveway;
  if (!driveway?.road) return;
  const { gate, road, width } = driveway;
  const streetEdge = road.z - 6,
    length = streetEdge - gate.z;
  driveway.parts.push(
    box(
      gate.x - origin.x,
      0.1275,
      (gate.z + streetEdge) / 2 - origin.z,
      width,
      0.04,
      Math.hypot(length, 0.065),
      '#858e86',
      {
        homeDriveway: true,
        drivewaySection: 'gate-to-street',
        surface: 'asphalt',
        rotation: [Math.atan2(0.065, length), 0, 0],
      },
    ),
  );
  // Mark the pavement crossover, leaving the traffic lanes and their centre line intact.
  for (const side of [-1, 1])
    driveway.parts.push(
      box(
        gate.x - origin.x + side * (width / 2 - 0.1),
        0.1525,
        (gate.z + streetEdge) / 2 - origin.z,
        0.07,
        0.012,
        Math.hypot(length, 0.065),
        '#dddccc',
        {
          homeDriveway: true,
          drivewaySection: 'gate-to-street',
          surface: 'plain',
          rotation: [Math.atan2(0.065, length), 0, 0],
        },
      ),
    );
}
