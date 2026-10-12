import test from 'node:test';
import assert from 'node:assert/strict';
import { createRegionalModel } from '../public/regions.js';
import { addCommunityWorld } from '../public/community-world.js';
import { victorianFarms } from '../public/farms.js';
import { overlaps } from '../public/community-sim.js';

test('farm cars have a clear route through their private gate to the car park and main street', () => {
  for (const farm of victorianFarms) {
    const m = createRegionalModel(farm.id),
      c = addCommunityWorld(m, farm),
      roads = c.sim.map.roads;
    const access = m.farm.homeVehicleAccess;
    assert.ok(m.homeDriveway.carParts.length > 20);
    assert.ok(access.parkedCar.length > 20);
    const routes = [
      roads.route('homestead-car', 'farm-car-park'),
      roads.route('farm-car-park', '0:2>0:1:in'),
      roads.route('farm-parked-car', '0:2>0:1:in'),
    ];
    const obstacles = [
      ...m.colliders.filter(
        (b) => b.prop !== 'car' && !b.parkedFarmCar && b !== m.dynamic.gateCollider,
      ),
      ...m.farm.obstacles.filter((b) => !b.vehicleLane),
    ];
    for (const mesh of m.objects.filter(
      (o) =>
        o.farmFence ||
        o.farmHomeLaneFence ||
        o.farmPrivateCarGate ||
        o.farmYardFence ||
        o.farmVehicleGate,
    ))
      obstacles.push({ x: mesh.pos[0], z: mesh.pos[2], w: mesh.size[0], d: mesh.size[2] });
    for (const [index, route] of routes.entries()) {
      assert.ok(route.length);
      for (const edge of route)
        for (let i = 1; i < edge.points.length; i++) {
          const a = edge.points[i - 1],
            b = edge.points[i],
            length = Math.hypot(b.x - a.x, b.z - a.z);
          for (let step = 0; step <= length; step += 0.1) {
            const f = length ? step / length : 0;
            const car = {
              x: c.origin.x + a.x + (b.x - a.x) * f,
              z: c.origin.z + a.z + (b.z - a.z) * f,
              angle: Math.atan2(b.z - a.z, b.x - a.x),
              length: 2.9,
              width: 1.9,
            };
            for (const obstacle of [
              ...obstacles,
              ...(index < 2 ? m.colliders.filter((b) => b.parkedFarmCar) : []),
            ])
              assert.equal(
                overlaps(
                  car,
                  { ...obstacle, angle: 0, length: obstacle.w, width: obstacle.d },
                  0.04,
                ),
                false,
                `${farm.id}: ${JSON.stringify(car)} obstructed by ${JSON.stringify(obstacle)}`,
              );
          }
        }
    }
  }
});
