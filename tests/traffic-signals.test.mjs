import test from 'node:test';
import assert from 'node:assert/strict';
import { createRegionalModel } from '../public/regions.js';
import { addCommunityWorld, updateCommunityWorld } from '../public/community-world.js';
import { CommunitySimulation } from '../public/community-sim.js';
import { locations } from '../public/locations.js';
import { modelMatrix } from '../public/world-math.js';

test('expanded town junctions have a correctly facing head for each actual incoming lane', () => {
  for (const location of [undefined, ...locations]) {
    const m = createRegionalModel(location?.id || 'legacy'),
      c = addCommunityWorld(m, location);
    const headings = new Set();
    for (const j of c.sim.map.junctions.filter((j) => j.id !== 'yard')) {
      const lanes = Object.values(c.sim.map.roads.nodes).filter((n) =>
        n.id.endsWith('>' + j.id + ':in'),
      );
      assert.equal(j.signal, lanes.length >= 3);
      const heads = c.signals.filter((s) => s.junction === j.id);
      assert.equal(heads.length, j.signal ? lanes.length : 0);
      for (const head of heads) {
        const lane = c.sim.map.roads.nodes[head.incomingLane];
        const expected =
          head.axis === 'EW' ? [Math.sign(lane.x - j.x), 0] : [0, Math.sign(lane.z - j.z)];
        const housing = modelMatrix([0, 0, 0], [1, 1, 1], head.housing.rotation);
        const lens = modelMatrix([0, 0, 0], [1, 1, 1], head.red.rotation);
        assert.ok(
          Math.abs(housing[8] - expected[0]) < 1e-6 && Math.abs(housing[10] - expected[1]) < 1e-6,
        );
        assert.ok(Math.abs(lens[4] - expected[0]) < 1e-6 && Math.abs(lens[6] - expected[1]) < 1e-6);
        assert.ok(head.red.pos[1] > head.amber.pos[1] && head.amber.pos[1] > head.green.pos[1]);
        assert.ok(
          Math.abs(
            head.axis === 'EW'
              ? head.pole.pos[2] - c.origin.z - j.z
              : head.pole.pos[0] - c.origin.x - j.x,
          ) > (j.farmAccess && head.axis === 'EW' ? 3 : 6),
          'Poles stand outside the vehicle lanes',
        );
        const laneSide = head.axis === 'EW' ? lane.z - j.z : lane.x - j.x;
        const poleSide =
          head.axis === 'EW'
            ? head.pole.pos[2] - c.origin.z - j.z
            : head.pole.pos[0] - c.origin.x - j.x;
        assert.ok(
          laneSide * poleSide > 0,
          'Signal stands on the kerb beside its own incoming lane',
        );
        headings.add(expected.join(','));
      }
    }
    assert.equal(headings.size, 4);
    assert.ok(
      c.signals.some((s) => s.junction === '3:1'),
      'Civic street has lights',
    );
    assert.ok(
      c.signals.some((s) => s.junction === '1:-1'),
      'New northern neighbourhood has lights',
    );
    if (location?.metro === 'Melbourne') assert.ok(c.signals.some((s) => s.junction === '1:3'));
  }
});

test('traffic heads display one lamp, with conflicting lanes red and pedestrian phases all red', () => {
  const m = createRegionalModel('legacy'),
    c = addCommunityWorld(m);
  for (const [phase, next, ew, ns] of [
    ['EW', 'NS', 'green', 'red'],
    ['NS', 'EW', 'red', 'green'],
    ['AMBER', 'NS', 'amber', 'red'],
    ['AMBER', 'EW', 'red', 'amber'],
    ['RED', 'NS', 'red', 'red'],
    ['WALK', 'NS', 'red', 'red'],
    ['CLEAR', 'EW', 'red', 'red'],
  ]) {
    for (const head of c.signals) Object.assign(c.sim.signalsAt(head.junction), { phase, next });
    updateCommunityWorld(
      m,
      { env: { light: 70, rain: 0 }, devices: [], outputs: {}, running: false, paused: true },
      0,
    );
    for (const head of c.signals) {
      const lit = ['red', 'amber', 'green'].filter((name) => head[name].emission > 0);
      assert.deepEqual(lit, [head.axis === 'EW' ? ew : ns], phase + ': ' + head.incomingLane);
    }
  }
});

test('a pedestrian at a new civic junction holds its own traffic, not the whole network', () => {
  const sim = new CommunitySimulation({ iso: 'AUS' });
  sim.density = sim.pedestrianDensity = 0;
  const crossing = sim.map.crossings.find((c) => c.junction === '3:1');
  const outer = sim.signalsAt('3:1');
  assert.notEqual(outer, sim.signals, 'Outer junctions run their own controller');
  crossing.occupants.add('test-pedestrian');
  Object.assign(outer, { phase: 'CLEAR', remaining: 0, next: 'EW' });
  Object.assign(sim.signals, { phase: 'CLEAR', remaining: 0, next: 'EW' });
  sim.step(0.05);
  assert.equal(outer.phase, 'CLEAR', 'The occupied junction holds its traffic red');
  assert.equal(sim.signals.phase, 'EW', 'Other junctions keep cycling');
  crossing.occupants.clear();
  sim.step(0.05);
  assert.equal(outer.phase, 'EW');
});

test('a pedestrian waiting at an outer junction requests a walk there only', () => {
  const sim = new CommunitySimulation({ iso: 'AUS' });
  sim.density = sim.pedestrianDensity = 0;
  const outer = sim.signalsAt('3:1');
  const crossing = sim.map.crossings.find((c) => c.junction === '3:1' && c.signal);
  const person = sim.addPerson(crossing.a, crossing.b);
  assert.ok(person);
  sim.step(0.05);
  assert.equal(outer.requested || outer.phase === 'WALK', true);
  assert.equal(sim.signals.requested, false);
});

test('a vehicle held inside an outer junction does not freeze the controller junction', () => {
  const sim = new CommunitySimulation({ iso: 'AUS' });
  sim.density = sim.pedestrianDensity = 0;
  const outer = sim.map.junctions.find((j) => j.id === '3:1');
  sim.addVehicle('2:1>3:1:out', '3:1>3:2:in');
  outer.owner = sim.vehicles[0].id;
  Object.assign(sim.signals, { phase: 'RED', remaining: 0, next: 'NS' });
  sim.step(0.05);
  assert.notEqual(sim.signals.phase, 'RED');
});

test('outer junction cycles are offset for a green wave', () => {
  const sim = new CommunitySimulation({ iso: 'AUS' });
  const near = sim.signalsAt('2:1'),
    far = sim.signalsAt('3:1');
  assert.notDeepEqual([near.phase, near.remaining], [far.phase, far.remaining]);
});

test('vehicles approaching the new civic junction stop on red and proceed on their green', () => {
  const sim = new CommunitySimulation({ iso: 'AUS' });
  sim.density = sim.pedestrianDensity = 0;
  Object.assign(sim.signalsAt('3:1'), { phase: 'NS', remaining: 1000 });
  const vehicle = sim.addVehicle('2:1>3:1:out', '3:1>3:2:in');
  sim.advance(20);
  assert.equal(vehicle.index, 0);
  assert.ok(vehicle.speed < 0.2);
  Object.assign(sim.signalsAt('3:1'), { phase: 'EW', remaining: 1000 });
  sim.advance(25);
  assert.ok(vehicle.index > 0, 'Vehicle never passed its new traffic light');
});
