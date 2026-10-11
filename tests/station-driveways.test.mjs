import test from 'node:test';
import assert from 'node:assert/strict';
import { createRegionalModel } from '../public/regions.js';
import { locations } from '../public/locations.js';
import { addCommunityWorld } from '../public/community-world.js';
import { overlaps } from '../public/community-sim.js';

test('police cars and eight metre fire trucks can pass through their gates to the main road', () => {
  for (const location of [undefined, ...locations]) {
    const model = createRegionalModel(location?.id || 'legacy'),
      c = addCommunityWorld(model, location);
    assert.equal(c.sim.map.stationDriveways.length, 2);
    for (const access of c.sim.map.stationDriveways) {
      const vehicle = model.objects.find((m) => m.stationVehicle === access.type && m.solid);
      const obstacles = model.colliders.filter(
        (b) =>
          b.x !== vehicle.pos[0] ||
          b.z !== vehicle.pos[2] ||
          b.w !== vehicle.size[0] ||
          b.d !== vehicle.size[2],
      );
      for (let x = access.bayX; x <= access.roadX; x += 0.2) {
        const body = {
          x: c.origin.x + x,
          z: c.origin.z + access.z,
          angle: 0,
          length: access.type === 'fire' ? 8 : 4.4,
          width: 2.5,
        };
        for (const b of obstacles)
          assert.equal(
            overlaps(body, { ...b, angle: 0, length: b.w, width: b.d }, 0.08),
            false,
            `${location?.id || 'legacy'} ${access.type} vehicle obstructed at x=${x}: ${JSON.stringify(b)}`,
          );
      }
      assert.ok(model.objects.some((m) => m.stationVehicleGate === access.type));
      assert.ok(model.objects.some((m) => m.stationPedestrianCrossing === access.type));
      const gate = c.civic.find((b) => b.building.type === access.type).driveway;
      assert.equal(gate.width, 6.4);
      assert.equal(gate.route.at(-1).x, access.roadX);
      assert.ok(
        c.sim.map.segments.some(
          ([a, b]) =>
            a.x === access.roadX && b.x === access.roadX && a.z < access.z && b.z > access.z,
        ),
      );
      const kerbs = c.objects.filter(
        (m) =>
          m.communityDetail &&
          Math.abs(m.pos[0] - c.origin.x - (access.roadX - 6.15)) < 0.01 &&
          m.size[1] === 0.18,
      );
      for (const kerb of kerbs)
        assert.ok(
          Math.abs(kerb.pos[2] - c.origin.z - access.z) >= (kerb.size[2] + access.width) / 2 - 1e-8,
          'Raised road kerbs stop before the driveway entrance',
        );
    }
  }
});
