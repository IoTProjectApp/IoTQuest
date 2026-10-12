import test from 'node:test';
import assert from 'node:assert/strict';
import { createRegionalModel } from '../public/regions.js';
import { locations } from '../public/locations.js';
import { addCommunityWorld } from '../public/community-world.js';
import { overlaps } from '../public/community-sim.js';

test('the parked house car has a clear route from the garage through the opened gate to the street', () => {
  let checked = 0;
  for (const location of [undefined, ...locations]) {
    const model = createRegionalModel(location?.id || 'legacy');
    if (!model.homeDriveway || model.farm) continue;
    const c = addCommunityWorld(model, location),
      driveway = model.homeDriveway;
    checked++;
    assert.equal(driveway.car.prop, 'car');
    assert.ok(driveway.carParts.length > 20);
    assert.equal(driveway.road.z, 24);
    assert.ok(driveway.parts.some((m) => m.drivewaySection === 'garage-to-gate'));
    assert.ok(driveway.parts.some((m) => m.drivewaySection === 'gate-to-street'));
    const obstacles = model.colliders.filter(
      (b) => b.prop !== 'car' && b !== model.dynamic.gateCollider,
    );
    for (let i = 1; i < driveway.route.length; i++) {
      const a = driveway.route[i - 1],
        b = driveway.route[i],
        length = Math.hypot(b.x - a.x, b.z - a.z);
      for (let step = 0; step <= length; step += 0.1) {
        const f = step / length;
        const vehicle = {
          x: a.x + (b.x - a.x) * f,
          z: a.z + (b.z - a.z) * f,
          length: 2.9,
          width: 1.9,
          angle: Math.atan2(b.z - a.z, b.x - a.x),
        };
        for (const obstacle of obstacles)
          assert.equal(
            overlaps(
              vehicle,
              { ...obstacle, angle: 0, length: obstacle.w, width: obstacle.d },
              0.05,
            ),
            false,
            `${location?.id || 'legacy'} driveway obstructed: ${JSON.stringify(obstacle)}`,
          );
      }
    }
    const kerbs = c.objects.filter(
      (m) =>
        m.communityDetail &&
        m.size[1] === 0.18 &&
        Math.abs(m.pos[2] - (driveway.road.z - 6.15)) < 0.01,
    );
    for (const kerb of kerbs)
      assert.ok(
        Math.abs(kerb.pos[0] - driveway.gate.x) >= (kerb.size[0] + driveway.width) / 2 - 1e-8,
      );
  }
  assert.ok(checked > 10);
});
