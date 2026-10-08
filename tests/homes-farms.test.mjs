import test from 'node:test';
import assert from 'node:assert/strict';
import { locations, adaptMissions, isLocationUnlocked } from '../public/locations.js';
import { missions } from '../public/missions.js';
import { homeVariant, VARIANT_OPTIONS } from '../public/home-variants.js';
import { createRegionalModel } from '../public/regions.js';
import { victorianFarms } from '../public/farms.js';
import { updateAnimals } from '../public/animals.js';
import { resolveMove, toWorld } from '../public/world-math.js';

const signature = (v) =>
  Object.keys(VARIANT_OPTIONS)
    .map((k) => v[k])
    .join('|');

test('every destination gets its own garden combination, unlike the original home', () => {
  const seen = new Map(),
    original = signature({
      mirror: false,
      outbuilding: 'glasshouse',
      beds: 'timber',
      tank: 'poly',
      fence: 'rail',
      path: 'gravel',
      feature: 'none',
    });
  for (const l of locations) {
    const v = homeVariant(l),
      key = signature(v);
    assert.notEqual(key, original, l.id + ' looks like the original home');
    assert.ok(!seen.has(key), l.id + ' repeats ' + seen.get(key));
    seen.set(key, l.id);
    for (const [option, values] of Object.entries(VARIANT_OPTIONS))
      if (!(l.farm && option === 'fence'))
        assert.ok(values.includes(v[option]), l.id + ' ' + option);
  }
  // A good spread: every option value is used somewhere, and both orientations appear.
  for (const [option, values] of Object.entries(VARIANT_OPTIONS))
    for (const value of values)
      assert.ok(
        locations.some((l) => homeVariant(l)[option] === value),
        option + ' ' + value + ' unused',
      );
  assert.deepEqual(createRegionalModel('legacy').variant, {});
});

test('garden variants change what is built, and farms are fenced with wire', () => {
  const tankColour = (id) =>
      createRegionalModel(id).objects.find(
        (o) => o.shape === 'cylinder' && Math.abs(o.pos[0] - 13.05) < 1e-9 && o.size[1] > 2,
      ).color,
    byTank = {};
  for (const l of locations) byTank[homeVariant(l).tank] ??= l.id;
  assert.equal(new Set(Object.values(byTank).map(tankColour)).size, 3);
  for (const farm of victorianFarms) assert.equal(homeVariant(farm).fence, 'wire');
});

test('mirrored homes draw flipped and keep movement matching the screen', async () => {
  const mirrored = locations.find((l) => homeVariant(l).mirror),
    plain = locations.find((l) => !homeVariant(l).mirror);
  assert.equal(createRegionalModel(mirrored.id).mirrored, true);
  assert.equal(createRegionalModel(plain.id).mirrored, false);
  // On a mirrored home, "left" moves the technician the opposite way in model space.
  const start = { x: 48, y: 77 },
    model = createRegionalModel(mirrored.id),
    { World3D } = await import('../public/world3d.js');
  const left = World3D.prototype.move.call({ model, yaw: 0 }, start, 'left', 3),
    unmirroredLeft = resolveMove(start, 'left', 3, 0, model.colliders);
  assert.ok(toWorld(left)[0] > toWorld(start)[0]);
  assert.ok(toWorld(unmirroredLeft)[0] < toWorld(start)[0]);
});

test('four Victorian farms with their own animals, buildings and farm quests', () => {
  assert.deepEqual(
    victorianFarms.map((f) => f.city),
    ['Warragul', 'Hamilton', 'Healesville', 'Woodend'],
  );
  const expected = {
    gippsland: ['cow'],
    westerndistrict: ['sheep', 'dog'],
    yarravalley: ['chicken', 'duck'],
    macedon: ['horse', 'goat'],
  };
  for (const farm of victorianFarms) {
    assert.ok(locations.includes(farm) && farm.farm && farm.group === 'Victorian farms');
    assert.equal(farm.timezone, 'Australia/Melbourne');
    assert.ok(isLocationUnlocked({}, farm));
    const m = createRegionalModel(farm.id),
      kinds = [...new Set(m.animals.map((a) => a.kind))];
    assert.deepEqual(kinds.sort(), [...expected[farm.id]].sort(), farm.id);
    assert.ok(m.animals.length >= 4, farm.id + ' animals');
    for (const a of m.animals) for (const { mesh } of a.parts) assert.ok(m.objects.includes(mesh));
    assert.ok(m.roofs.length > 0);
    assert.equal(m.skyDistance, 24);
    const titles = adaptMissions(missions, farm, 'beginner').map((q) => q.title);
    assert.equal(titles[7], farm.missionNames[7]);
    assert.ok(!titles.some((t) => t.includes('Brisbane')));
  }
  assert.ok(createRegionalModel('gippsland').windmills.length >= 1);
  assert.ok(createRegionalModel('westerndistrict').windmills.length >= 1);
});

test('animals roam, graze and stay inside their paddocks; reduced motion holds them still', () => {
  const m = createRegionalModel('westerndistrict'),
    start = m.animals.map((a) => [a.x, a.z]);
  for (let i = 0; i < 2000; i++) updateAnimals(m.animals, i * 0.05, 0.05);
  let moved = 0;
  m.animals.forEach((a, i) => {
    const [x0, z0, x1, z1] = a.paddock;
    assert.ok(a.x >= x0 && a.x <= x1 && a.z >= z0 && a.z <= z1, a.kind + ' left its paddock');
    if (Math.hypot(a.x - start[i][0], a.z - start[i][1]) > 0.5) moved++;
    for (const { mesh } of a.parts) assert.ok(mesh.pos.every(Number.isFinite));
  });
  assert.ok(moved > m.animals.length / 2, 'most animals moved');
  const still = m.animals.map((a) => [a.x, a.z]);
  for (let i = 0; i < 100; i++) updateAnimals(m.animals, i, 0.05, true);
  assert.deepEqual(
    m.animals.map((a) => [a.x, a.z]),
    still,
  );
});

test('quest names name their destination, and farms use farm quests', () => {
  for (const l of locations) {
    const last = adaptMissions(missions, l, 'beginner')[7].title;
    if (l.id !== 'brisbane') assert.ok(!last.includes('Brisbane'), l.id + ': ' + last);
  }
  assert.equal(
    adaptMissions(
      missions,
      locations.find((l) => l.id === 'fitzroy'),
      'beginner',
    )[7].title,
    'Fitzroy Connected Home',
  );
});
