import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CommunitySimulation,
  Signals,
  overlaps,
  createCommunity,
} from '../public/community-sim.js';
import { Runtime } from '../public/runtime.js';
import { communityDevices, communityStarter } from '../public/community-missions.js';
import { locations } from '../public/locations.js';
const empty = () => {
  const s = new CommunitySimulation({ iso: 'AUS' });
  s.density = 0;
  s.pedestrianDensity = 0;
  return s;
};
function car(s, start = '0:1>1:1:out', goal = '1:1>2:1:in') {
  return s.addVehicle(start, goal);
}
function person(s) {
  return s.addPerson('1:1/-1/-1', '1:1/1/-1');
}
function checkSeparation(s) {
  for (const a of s.vehicles)
    for (const b of s.vehicles)
      if (a.id < b.id) assert.equal(overlaps(a, b, 0), false, `${a.id}/${b.id}`);
  for (const a of s.vehicles)
    for (const p of s.people)
      assert.equal(
        overlaps(a, { ...p, angle: 0, width: 0.6, length: 0.6 }, 0),
        false,
        `vehicle ${a.id} / person ${p.id}`,
      );
}
test('approaching car: pedestrian waits at kerb before entering', () => {
  const s = empty(),
    v = car(s),
    p = person(s);
  v.progress = 20;
  v.speed = 7;
  s.advance(0.1);
  assert.equal(p.progress, 0);
  assert.match(p.status, /kerb/);
  s.advance(40);
  assert.equal(p.status, 'Arrived');
  checkSeparation(s);
});
test('walk ends while pedestrian crosses: red held through occupancy and clearance', () => {
  const s = empty();
  s.signals.phase = 'WALK';
  s.signals.remaining = 0.1;
  const p = person(s);
  p.speed = 0.4;
  s.advance(1);
  assert.equal(p.status, 'Crossing');
  s.advance(10);
  assert.equal(s.signals.phase, 'CLEAR');
  assert.equal(s.signals.request(['EW'], true), false);
  assert.match(s.signals.messages.at(-1), /occupied/);
  s.advance(40);
  assert.equal(p.status, 'Arrived');
  assert.notEqual(s.signals.phase, 'CLEAR');
});
test('red light creates an orderly queue with following distances', () => {
  const s = empty();
  s.signals.phase = 'NS';
  s.signals.remaining = 1000;
  const a = car(s);
  s.advance(3);
  const b = car(s);
  assert.ok(b);
  s.advance(3);
  const c = car(s);
  assert.ok(c);
  for (let i = 0; i < 300; i++) {
    s.advance(0.1);
    checkSeparation(s);
  }
  assert.equal(s.vehicles.length, 3);
  assert.equal(a.index, 0);
  assert.ok(a.progress > b.progress && b.progress > c.progress);
  assert.ok(a.speed < 0.2);
});
test('blocked exit keeps a vehicle outside intersection', () => {
  const s = empty();
  const blocker = s.addVehicle('1:1>2:1:out', '1:1>2:1:in');
  blocker.dwell = 1000;
  const v = car(s);
  s.advance(30);
  assert.equal(v.index, 0);
  assert.equal(s.map.junctions.find((j) => j.signal).owner, null);
});
test('delivery visits bay using a connected road and driveway route', () => {
  const s = empty(),
    v = s.addVehicle('0:2>1:2:out', 'loading-bay', 'truck');
  assert.ok(v);
  assert.ok(v.route.some((e) => e.driveway));
  let arrived = false;
  for (let i = 0; i < 2000; i++) {
    s.advance(0.05);
    if (v.dwell > 0) {
      arrived = true;
      break;
    }
  }
  assert.ok(arrived);
  assert.equal(v.x, 22);
  assert.ok(Math.abs(v.z - 37) < 1e-6);
});
test('phase validation refuses conflicting greens and invalid interface values', () => {
  const s = new Signals();
  assert.equal(s.request(['EW', 'NS']), false);
  assert.equal(s.request(['BOGUS']), false);
  s.request(['NS']);
  s.remaining = 0;
  s.step(0.1, false, false);
  assert.equal(s.phase, 'AMBER');
  s.step(3, false, false);
  assert.equal(s.phase, 'RED');
  s.step(2, false, false);
  assert.equal(s.phase, 'NS');
});
test('acceleration retains identical movement and separation in rain', () => {
  const a = new CommunitySimulation({ iso: 'AUS' }),
    b = new CommunitySimulation({ iso: 'AUS' });
  a.rain = b.rain = 3;
  for (let i = 0; i < 100; i++) {
    a.advance(1.2);
    for (let j = 0; j < 12; j++) b.advance(0.1);
    checkSeparation(a);
  }
  assert.deepEqual(
    a.vehicles.map((v) => [v.id, v.x, v.z]),
    b.vehicles.map((v) => [v.id, v.x, v.z]),
  );
  assert.ok(a.sequence > 20);
  assert.ok(a.people.some((p) => p.progress > 0));
});
test('all playable towns and suburbs have connected community districts and correct driving lanes', () => {
  for (const location of locations) {
    const m = createCommunity(location);
    assert.equal(m.buildings.length, 9);
    assert.equal(m.crossings.length, 37);
    for (const a of m.buildings)
      for (const b of m.buildings)
        if (a.node !== b.node) assert.ok(m.walks.route(a.node, b.node).length, location.id);
    const a = m.roads.nodes['0:1>1:1:out'],
      b = m.roads.nodes['1:1>0:1:out'];
    assert.ok(a.z * b.z < 0);
    assert.equal(Math.sign(a.z), m.handedness);
    for (const [id, edges] of Object.entries(m.roads.edges))
      for (const e of edges) {
        const a = m.roads.nodes[id],
          b = m.roads.nodes[e.to];
        for (let t = 0; t <= 1; t += 0.05)
          for (const building of m.buildings.filter((b) => b.type !== 'parking')) {
            const x = a.x + (b.x - a.x) * t,
              z = a.z + (b.z - a.z) * t;
            assert.ok(
              Math.abs(x - building.x) > building.w / 2 ||
                Math.abs(z - building.z) > building.d / 2,
              `${location.id} road enters ${building.type}`,
            );
          }
      }
  }
});
for (const language of ['cpp', 'python'])
  test(`${language} controls community devices using real interpreter`, () => {
    const rt = new Runtime(communityStarter('warehouse', language), language, communityDevices);
    assert.equal(rt.step({ bay: 1 }).outputs[4], 1);
    let r;
    for (let i = 0; i < 3; i++) r = rt.step({ bay: 0 });
    assert.equal(r.outputs[4], 0);
  });

test('ten-minute community soak continues serving traffic without collisions or abandoned reservations', () => {
  const s = new CommunitySimulation({ iso: 'AUS' });
  let completed = 0,
    halfway = 0,
    last = new Set();
  for (let i = 0; i < 12000; i++) {
    s.advance(0.05);
    checkSeparation(s);
    if (i === 6000) halfway = completed;
    const now = new Set(s.vehicles.map((v) => v.id));
    completed += [...last].filter((id) => !now.has(id)).length;
    last = now;
    for (const v of s.vehicles)
      for (const b of s.map.buildings.filter((b) => b.type !== 'parking'))
        assert.equal(overlaps(v, { ...b, angle: 0, length: b.w, width: b.d }, 0), false);
  }
  assert.ok(completed > halfway, `No trips completed in second half: ${completed}`);
});

test('parking controller barrier stops entry and permits a routed parking visit when opened', () => {
  const s = empty();
  s.parkingControlled = true;
  const v = s.addVehicle('1:2>2:2:out', 'parking');
  s.advance(30);
  assert.equal(v.route[v.index].to, 'parking');
  assert.equal(v.speed, 0);
  s.outputs[6] = 1;
  let parked = false;
  for (let i = 0; i < 400; i++) {
    s.advance(0.05);
    if (v.dwell > 0) {
      parked = true;
      break;
    }
  }
  assert.ok(parked);
  assert.equal(s.sensors().spaces, 0);
});

test('native code maintains its requested traffic phase across full cycles and releases it on stop', async () => {
  const { applyNativeCommunityOutputs } = await import('../public/community-quests.js');
  const s = empty(),
    devices = [{ id: 'trafficEW', output: true, pin: 2 }];
  const phases = new Set();
  for (let i = 0; i < 400; i++) {
    applyNativeCommunityOutputs(s, devices, { 2: 1 }, true);
    s.advance(0.2);
    phases.add(s.signals.phase);
  }
  assert.ok(phases.has('EW'));
  assert.equal(phases.has('NS'), false, 'An unrequested conflicting movement never starts');
  for (let i = 0; i < 150; i++) {
    applyNativeCommunityOutputs(s, devices, {}, true);
    s.advance(0.2);
  }
  assert.equal(s.signals.phase, 'RED', 'All LOW holds red rather than resuming automatic greens');
  applyNativeCommunityOutputs(s, devices, {}, false);
  s.advance(15);
  assert.ok(['EW', 'NS', 'AMBER', 'RED'].includes(s.signals.phase));
  assert.equal(s.signals.pending, null);
  assert.notEqual(s.signals.phase, 'RED', 'Automatic coordination resumes after stop');
});
