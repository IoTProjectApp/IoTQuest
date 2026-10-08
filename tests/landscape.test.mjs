import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorldModel } from '../public/world-model.js';
import { createRegionalModel } from '../public/regions.js';
import { locations } from '../public/locations.js';
import { addLandscape, updateLandscape } from '../public/landscape.js';
import { collides, findFree, toWorld } from '../public/world-math.js';

test('every destination has mountains, a river valley, a lake, wildlife and flying birds', () => {
  const signatures = new Set();
  for (const location of [{ id: 'legacy' }, ...locations]) {
    const model = createRegionalModel(location.id),
      landscape = model.landscape;
    assert.ok(landscape.mountains.length >= 6, location.id);
    assert.ok(landscape.waters.some((w) => w.kind === 'river'));
    assert.ok(landscape.waters.some((w) => w.kind === 'lake'));
    assert.equal(landscape.birds.length, 7);
    assert.equal(landscape.wildlife.length, 4);
    signatures.add(JSON.stringify(landscape.mountains.map((m) => [m.pos, m.size])));
    for (const m of model.objects) {
      assert.ok(m.pos.every(Number.isFinite), location.id + ' finite positions');
      assert.ok(
        m.size.every((v) => Number.isFinite(v) && v > 0),
        location.id + ' positive dimensions',
      );
    }
    for (const w of landscape.waters) {
      assert.ok(
        w.mesh.pos[0] < -38 || w.mesh.pos[2] < -37,
        'water outside properties and paddocks',
      );
    }
    for (const animal of landscape.wildlife) assert.ok(animal.x > 38 && animal.z > 32);
    assert.ok(landscape.birds.every((b) => b.height > 6));
  }
  assert.equal(signatures.size, locations.length + 1, 'landscapes are distinct');
});

test('landscape scenery keeps collision footprints and quest installation points intact', () => {
  const model = createWorldModel(),
    before = JSON.stringify(model.colliders);
  addLandscape(model, { id: 'test-landscape', iso: 'AUS', climate: 'temperate' });
  assert.equal(JSON.stringify(model.colliders), before);
  const objects = model.objects.length;
  addLandscape(model, { id: 'test-landscape' });
  assert.equal(model.objects.length, objects, 'adding the same scenery twice is safe');
  for (const [x, y] of [
    [19, 17],
    [30, 15],
    [35, 31],
    [48, 12],
    [20, 35],
    [50, 30],
    [80, 20],
    [91, 43],
    [77, 64],
    [43, 60],
    [32, 51],
  ]) {
    const p = toWorld(findFree({ x, y: y + 5 }, model.colliders));
    assert.equal(collides(p[0], p[2], model.colliders), false);
  }
});

test('birds flap and travel, water flows, and pause/reduced motion freezes scenery', () => {
  const model = createRegionalModel('legacy'),
    landscape = model.landscape,
    env = { light: 70, wind: 12, cloud: 20, rain: 0 };
  const snapshot = () =>
    JSON.stringify({
      birds: landscape.birds.map((b) => b.parts.map((p) => [p.mesh.pos, p.mesh.rotation])),
      water: landscape.waters.map((w) => w.flow?.pos || w.ripples.map((r) => r.size)),
      animals: landscape.wildlife.map((a) => [a.x, a.z]),
    });
  const start = snapshot();
  for (let i = 0; i < 150; i++) updateLandscape(model, env, 0.1);
  assert.notEqual(snapshot(), start);
  updateLandscape(model, env, 0.1, true);
  const frozen = snapshot(),
    clock = landscape.clock;
  for (let i = 0; i < 100; i++) updateLandscape(model, env, 0.1, true);
  assert.equal(snapshot(), frozen);
  assert.equal(landscape.clock, clock);
  updateLandscape(model, { ...env, light: 3 }, 0.1, true);
  assert.ok(landscape.birds.every((b) => b.parts.every((p) => p.mesh.opacity === 0)));
  assert.equal(
    JSON.stringify(env),
    JSON.stringify({ light: 70, wind: 12, cloud: 20, rain: 0 }),
    'visual scenery never changes sensor conditions',
  );
});

test('weather changes never teleport bird positions or wing poses', () => {
  const model = createRegionalModel('legacy');
  for (let i = 0; i < 250; i++) updateLandscape(model, { light: 70, wind: 12, rain: 0 }, 0.1);
  const snapshot = () =>
    JSON.stringify(
      model.landscape.birds.map((b) => b.parts.map((p) => [p.mesh.pos, p.mesh.rotation])),
    );
  const before = snapshot();
  updateLandscape(model, { light: 70, wind: 65, rain: 85 }, 0);
  assert.equal(snapshot(), before);
  updateLandscape(model, { light: 70, wind: 0, rain: 0 }, 0, true);
  assert.equal(snapshot(), before);
});
test('regional wildlife stays separate from farm animals and their IoT routines', () => {
  const dairy = createRegionalModel('gippsland'),
    arid = createRegionalModel('marrakech'),
    africa = createRegionalModel('lamu');
  assert.ok(dairy.animals.every((a) => a.kind === 'cow'));
  assert.ok(dairy.landscape.wildlife.every((a) => a.kind === 'kangaroo'));
  assert.ok(arid.landscape.wildlife.every((a) => a.kind === 'rabbit'));
  assert.ok(africa.landscape.wildlife.every((a) => a.kind === 'antelope'));
});
