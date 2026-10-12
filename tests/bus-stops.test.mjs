import test from 'node:test';
import assert from 'node:assert/strict';
import { createRegionalModel } from '../public/regions.js';
import { locations } from '../public/locations.js';
import { addCommunityWorld, updateCommunityWorld } from '../public/community-world.js';
import { BUS_DWELL } from '../public/community-sim.js';

const state = { env: { light: 70 }, devices: [], outputs: {}, running: false, paused: false };

test('every location has bus stop shelters on clear pavement', () => {
  for (const location of [undefined, ...locations]) {
    const model = createRegionalModel(location?.id || 'legacy'),
      c = addCommunityWorld(model, location);
    assert.ok(c.busStops.length >= 4, location?.id);
    for (const s of c.busStops) assert.ok(!s.stop.removed && s.parts.length > 10);
  }
});

test('a bus brakes to a halt at a stop, opens its door, waits, boards passengers and leaves', () => {
  const model = createRegionalModel('legacy'),
    c = addCommunityWorld(model),
    sim = c.sim;
  sim.density = sim.pedestrianDensity = 0;
  const { stop } = c.busStops[0];
  const [from] = stop.id.split('>');
  const bus = sim.addVehicle(`${stop.id}:out`, `${stop.id}:in`, 'bus');
  assert.ok(bus, from);
  let halted = null;
  for (let i = 0; i < 200 && !halted; i++) {
    updateCommunityWorld(model, state, 0.1);
    if (bus.atStop === stop && bus.dwell > 0) halted = bus.progress;
  }
  assert.ok(Math.abs(halted - stop.at) < 0.3, 'Stops at the shelter');
  const door = c.vehicles[sim.vehicles.indexOf(bus)].door;
  updateCommunityWorld(model, state, 0.1);
  assert.equal(door.color, '#1d2528', 'Door open at the stop');
  for (let i = 0; i < (BUS_DWELL + 1) * 10; i++) updateCommunityWorld(model, state, 0.1);
  const waiting = c.busStops[0].waiting;
  assert.ok(
    waiting.every((w) => w.boarded),
    'Passengers boarded',
  );
  assert.ok(bus.progress > halted, 'Bus moves on after the dwell');
});
