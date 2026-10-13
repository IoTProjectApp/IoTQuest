import test from 'node:test';
import assert from 'node:assert/strict';
import { visitRequest, visitEntry, stepToward } from '../public/household-visits.js';
import { clearPath } from '../public/world-math.js';

const quests = [
  { area: 'Kitchen', title: 'Extractor' },
  { area: 'Kitchen', title: 'Fume fan' },
  { area: 'Garage', title: 'Door' },
];

test('a visitor comes about the urgent request, then the one in progress, then the next', () => {
  const pick = (options) =>
    visitRequest({
      quests,
      done: () => false,
      urgent: new Set(),
      current: 2,
      area: 'Kitchen',
      ...options,
    })?.mission.title;
  assert.equal(pick({}), 'Extractor');
  assert.equal(pick({ current: 1 }), 'Fume fan');
  assert.equal(pick({ urgent: new Set([1]) }), 'Fume fan');
  assert.equal(pick({ done: (i) => i === 0 }), 'Fume fan');
  // A room with everything done brings nobody.
  assert.equal(pick({ done: () => true }), undefined);
});

test('a visitor walks in from open floor along a clear line, or arrives in place', () => {
  // A wall right behind the spot (as seen from the technician) sends them in from the side.
  const wall = [{ x: 0, z: 2, w: 10, d: 0.2 }];
  const entry = visitEntry({ spot: [0, 0], from: [0, -2], colliders: wall });
  assert.notDeepEqual(entry, [0, 0]);
  assert.ok(clearPath({ x: 0, z: 0 }, { x: entry[0], z: entry[1] }, wall));
  assert.ok(Math.abs(Math.hypot(...entry) - 3.5) < 1e-9);
  // Boxed in on every side: they are simply there.
  const walls = [-1, 1].flatMap((s) => [
    { x: s * 1, z: 0, w: 0.2, d: 4 },
    { x: 0, z: s * 1, w: 4, d: 0.2 },
  ]);
  assert.deepEqual(visitEntry({ spot: [0, 0], from: [0, -0.5], colliders: walls }), [0, 0]);
});

test('a walker steps towards its target and stops on arrival', () => {
  const walker = { x: 0, z: 0 };
  assert.equal(stepToward(walker, [3, 4], 1, 1), false);
  assert.ok(Math.abs(Math.hypot(walker.x, walker.z) - 1) < 1e-9);
  assert.equal(stepToward(walker, [3, 4], 10, 1), true);
  assert.deepEqual([walker.x, walker.z], [3, 4]);
});
