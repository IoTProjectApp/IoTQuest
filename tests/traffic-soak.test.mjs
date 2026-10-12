import test from 'node:test';
import assert from 'node:assert/strict';
import { victorianFarms } from '../public/farms.js';
import { createRegionalModel } from '../public/regions.js';
import { addCommunityWorld } from '../public/community-world.js';

// A deadlock anywhere in the network shows up as trips that stop finishing. Runs the real town at
// rush-hour density, with pedestrians calling walk phases, for 20 simulated minutes. Congestion
// can stall finishes for a minute, so each check spans three.
for (const id of ['legacy', victorianFarms[0].id]) {
  test(`traffic keeps flowing through a 20 minute rush hour (${id})`, () => {
    const sim = addCommunityWorld(createRegionalModel(id)).sim;
    sim.initialHour = 7.5;
    sim.density = 16;
    sim.pedestrianDensity = 14;
    let seen = new Set(),
      finished = 0,
      frozenFor = 0;
    const byMinute = [];
    for (let minute = 0; minute < 20; minute++) {
      for (let s = 0; s < 60; s++) {
        sim.advance(1);
        const now = new Set(sim.vehicles.map((v) => v.id));
        for (const v of seen) if (!now.has(v)) finished++;
        seen = now;
        frozenFor =
          sim.vehicles.length && sim.vehicles.every((v) => v.speed < 0.1) ? frozenFor + 1 : 0;
        assert.ok(frozenFor < 90, `Every vehicle stood still for 90 s at minute ${minute}`);
      }
      byMinute.push(finished);
      if (minute >= 4)
        assert.ok(
          finished > byMinute[minute - 3],
          `No trip finished in minutes ${minute - 2}–${minute}`,
        );
    }
    assert.ok(finished >= 40, `Only ${finished} trips finished in 20 minutes`);
  });
}
