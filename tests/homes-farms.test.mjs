import test from 'node:test';
import assert from 'node:assert/strict';
import { locations, adaptMissions, isLocationUnlocked } from '../public/locations.js';
import { missions } from '../public/missions.js';
import { homeVariant, VARIANT_OPTIONS } from '../public/home-variants.js';
import { createRegionalModel } from '../public/regions.js';
import { victorianFarms } from '../public/farms.js';
import { updateAnimals } from '../public/animals.js';
import { resolveMove, toWorld, findFree, collides } from '../public/world-math.js';
import { houseDesign } from '../public/house-design.js';
import { updateFarm } from '../public/farm-assets.js';
import { advanceEnvironment } from '../public/weather.js';

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

test('every destination has distinct actual house geometry and a stable interior design', () => {
  const seenGeometry = new Map(),
    seenDesign = new Map();
  for (const l of locations) {
    const model = createRegionalModel(l.id),
      design = houseDesign(l);
    assert.deepEqual(
      design,
      houseDesign({ id: l.id, farm: l.farm }),
      l.id + ' identity does not depend on catalogue position',
    );
    const signature = JSON.stringify([
      design.bedroom,
      design.living,
      design.dining,
      design.fitting,
      design.textile,
      design.floor,
    ]);
    assert.ok(!seenDesign.has(signature), l.id + ' repeats interior ' + seenDesign.get(signature));
    seenDesign.set(signature, l.id);
    // No colours, names, seed metadata, landscaping or animated actors count as
    // unique house geometry: compare the actual meshes within the house.
    const geometry = JSON.stringify(
      model.objects
        .filter(
          (o) =>
            !o.actor &&
            !o.landscape &&
            !o.interiorFloor &&
            o.pos[0] > -13.4 &&
            o.pos[0] < 1.7 &&
            o.pos[2] > -11.4 &&
            o.pos[2] < -1,
        )
        .map((o) => [
          o.shape,
          o.pos.map((n) => +n.toFixed(4)),
          o.size.map((n) => +n.toFixed(4)),
          o.rotation.map((n) => +n.toFixed(4)),
        ])
        .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
    );
    assert.ok(
      !seenGeometry.has(geometry),
      l.id + ' repeats house geometry ' + seenGeometry.get(geometry),
    );
    seenGeometry.set(geometry, l.id);
    for (const [name, x, y] of [
      ['Bedroom', 19, 17],
      ['Bathroom', 30, 15],
      ['Kitchen', 35, 31],
      ['Utility room', 48, 12],
      ['Living room', 20, 35],
      ['Garage', 50, 30],
      ['Greenhouse', 80, 20],
      ['Water tank', 91, 43],
      ['Plant beds', 77, 64],
      ['Garden path', 43, 60],
      ['Entrance', 32, 51],
    ]) {
      const [ax, ay] = model.areaOverrides?.[name] || l.areaOverrides?.[name] || [x, y];
      const landing = findFree({ x: ax, y: ay + 5 }, model.colliders),
        point = toWorld(landing);
      assert.equal(collides(point[0], point[2], model.colliders), false, l.id + ' ' + name);
    }
  }
  assert.equal(seenGeometry.size, locations.length);
});

test('farm facilities are specific to their agricultural purpose', () => {
  const expected = {
    gippsland: 'milk-silo',
    westerndistrict: 'sorting-pen',
    yarravalley: 'fruit-crate',
    macedon: 'tack-rack',
  };
  for (const l of victorianFarms) {
    const m = createRegionalModel(l.id);
    assert.ok(
      m.objects.some((o) => o.farmFeature === expected[l.id]),
      l.id,
    );
    for (const feature of Object.values(expected).filter((f) => f !== expected[l.id]))
      assert.ok(
        !m.objects.some((o) => o.farmFeature === feature),
        l.id + ' should not repeat ' + feature,
      );
  }
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

test('each farm has a signature quest that passes with its worked example at both levels', async () => {
  const { defaults, program, baseEnv } = await import('../public/missions.js');
  const { Runtime } = await import('../public/runtime.js');
  const expected = {
    orchard: 'Hen-House Door at Dusk',
    sheep: 'Fill the Stock Trough',
    dairy: 'Open the Dairy Gate',
    horse: 'Cool the Horses',
  };
  for (const farm of victorianFarms)
    for (const difficulty of ['beginner', 'advanced']) {
      const list = adaptMissions(missions, farm, difficulty),
        m = list.find((q) => q.farmQuest);
      assert.equal(m.title, expected[farm.style]);
      assert.equal(list.filter((q) => q.farmQuest).length, 1);
      const devices = defaults(m.ids, 'ESP32'),
        runtime = new Runtime(program(m, 'cpp', devices, true), 'cpp', devices, 'ESP32');
      for (const [name, env, want] of m.scenarios) {
        const r = runtime.step({ ...baseEnv, ...env });
        assert.deepEqual(
          devices.filter((d) => d.output).map((d) => ((r.outputs[d.pin] || 0) > 0 ? 1 : 0)),
          want,
          farm.id + ' ' + difficulty + ': ' + name,
        );
      }
    }
  // Homes elsewhere keep their usual quests.
  assert.ok(!adaptMissions(missions, locations[0]).some((q) => q.farmQuest));
});

const farmModel = (id) => createRegionalModel(id);
const run = (model, devices, outputs, env, seconds) => {
  for (let i = 0; i < seconds * 10; i++) {
    updateFarm(model, devices, outputs, { ...baseEnvLite, ...env }, i / 10, false);
    updateAnimals(model.animals, i / 10, 0.1);
  }
};
const baseEnvLite = { light: 70, temp: 24, tank: 80, pond: 60 };

test('hens roost at dusk through an open door and wait outside a shut one', () => {
  const door = [{ id: 'gate', pin: 5 }];
  let m = farmModel('yarravalley');
  const hens = () => m.animals.filter((a) => a.kind === 'chicken');
  run(m, door, { 5: 1 }, { light: 5 }, 120);
  assert.ok(
    hens().every((a) => a.hidden),
    'all hens roosting',
  );
  // Door shut in the morning: hens stay in; opened: they come out.
  run(m, door, { 5: 0 }, { light: 90 }, 10);
  assert.ok(hens().every((a) => a.hidden));
  run(m, door, { 5: 1 }, { light: 90 }, 60);
  assert.ok(hens().every((a) => !a.hidden));
  m = farmModel('yarravalley');
  run(m, door, { 5: 0 }, { light: 5 }, 120);
  assert.ok(hens().every((a) => !a.hidden && a.goalKey === 'waiting'));
  assert.ok(hens().every((a) => a.z > -21 && a.z < -17 && Math.abs(a.x + 6) < 2.5));
});

test('the dairy gate lets the herd into the yard and the cows go home when it closes', () => {
  const m = farmModel('gippsland'),
    gate = [{ id: 'gate', pin: 5 }],
    cows = m.animals.filter((a) => a.kind === 'cow');
  run(m, gate, {}, {}, 2);
  assert.ok(
    cows.every((a) => Math.abs(a.x) > 17.6),
    'cows stay in paddocks while closed',
  );
  run(m, gate, { 5: 1 }, {}, 120);
  assert.ok(m.farm.gates.every((g) => g.angle > 1.5));
  assert.ok(cows.every((a) => Math.abs(a.x) < 6.5 && a.z < -17));
  run(m, gate, { 5: 0 }, {}, 120);
  assert.ok(cows.every((a) => Math.abs(a.x) > 17.6));
});

test('the trough level shows and thirsty sheep crowd it; pumping refills it', () => {
  const m = farmModel('westerndistrict'),
    near = m.animals.filter((a) => a.kind === 'sheep' && a.paddock[0] > 0);
  run(m, [], {}, { pond: 5 }, 90);
  assert.ok(m.farm.troughWater.size[1] < 0.1);
  assert.ok(near.every((a) => Math.hypot(a.x - 23.5, a.z + 20) < 5.5));
  run(m, [], {}, { pond: 90 }, 1);
  assert.ok(m.farm.troughWater.size[1] > 0.35);
  assert.ok(near.every((a) => a.goalKey === 'home'));
  const farm = victorianFarms.find((f) => f.id === 'westerndistrict'),
    devices = [
      { id: 'pond', pin: 34 },
      { id: 'pump', pin: 26 },
    ],
    pumping = advanceEnvironment({ ...baseEnvLite, soil: 30, pond: 20 }, devices, { 26: 1 }, 1, {
      location: farm,
    }),
    idle = advanceEnvironment({ ...baseEnvLite, soil: 30, pond: 20 }, devices, {}, 1, {
      location: farm,
    });
  assert.ok(pumping.pond > 20 && idle.pond < 20, 'pump fills; the flock drinks it down');
  assert.ok(pumping.soil <= 30, 'the trough pump does not water the beds');
});

test('horses shelter on hot days and misting runs only when the valve is on', () => {
  const m = farmModel('macedon'),
    horses = m.animals.filter((a) => a.kind === 'horse'),
    valve = [{ id: 'valve', pin: 26 }],
    mist = () => m.farm.shelters.flatMap((s) => s.mist).some((d) => d.opacity > 0);
  run(m, valve, {}, { temp: 36 }, 90);
  assert.ok(!mist());
  assert.ok(horses.every((a) => Math.abs(Math.abs(a.x) - 31) < 3 && Math.abs(a.z + 25) < 2.5));
  run(m, valve, { 26: 1 }, { temp: 36 }, 1);
  assert.ok(mist());
  const farm = victorianFarms.find((f) => f.id === 'macedon'),
    env = { ...baseEnvLite, outdoorTemp: 36, temp: 36, soil: 30 },
    cooled = advanceEnvironment(env, valve, { 26: 1 }, 1, { location: farm }),
    hot = advanceEnvironment(env, valve, {}, 1, { location: farm });
  assert.ok(cooled.temp < hot.temp);
});
