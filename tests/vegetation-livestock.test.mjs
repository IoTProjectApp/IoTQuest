import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorldModel } from '../public/world-model.js';
import { buildCrop, buildTree } from '../public/vegetation.js';
import { addAnimal, updateAnimals, setGoal } from '../public/animals.js';
import { createRegionalModel } from '../public/regions.js';
import { locations } from '../public/locations.js';

test('crops have curved leaves and connected fruit clusters, with all parts available for raised beds', () => {
  const model = createWorldModel(),
    crop = buildCrop(model, 0, 0, 1, 0.6);
  assert.equal(crop.leaves.length, 6);
  assert.ok(crop.leaves.every((leaf) => leaf.shape === 'leaf'));
  assert.equal(crop.fruits.length, 3);
  assert.ok(crop.parts.includes(crop.stem));
  for (const part of [...crop.leaves, ...crop.fruits]) assert.ok(crop.parts.includes(part));
  assert.ok(
    crop.parts.filter((p) => p.shape === 'cylinder').length > 6,
    'leaves and fruit have connecting stems',
  );
  const location = locations.find((l) => ['terrace', 'seasonal'].includes(l.planting));
  assert.ok(location);
  const terraced = createRegionalModel(location.id);
  for (const plant of terraced.plants)
    assert.ok(plant.parts.every((p) => terraced.objects.includes(p)));
  for (const plant of terraced.plants.filter(
    (p) => Math.abs(p.stem.pos[0] - 9.25) < 1 && p.stem.pos[2] > 0,
  )) {
    assert.ok(Math.abs(plant.stem.pos[1] - (0.93 + 0.57 * plant.base)) < 1e-8);
    for (let i = 0; i < plant.fruits.length; i++)
      assert.ok(
        Math.abs(plant.fruits[i].pos[1] - (0.93 + (0.71 + i * 0.08) * plant.base)) < 1e-8,
        'fruit moves up with the raised bed',
      );
  }
  for (const plant of terraced.plants.filter((p) => p.stem.pos[2] < 0))
    assert.ok(
      Math.abs(plant.stem.pos[1] - (0.59 + 0.57 * plant.base)) < 1e-8,
      'greenhouse plants stay on their own soil surface',
    );
});

test('tree styles have different silhouettes and distant foliage uses a bounded mesh count', () => {
  const model = createWorldModel(),
    signatures = new Set();
  for (const style of ['broadleaf', 'eucalypt', 'palm', 'conifer', 'fruit']) {
    const tree = buildTree(model, 0, 0, 1, { style, detailed: true, fruit: style === 'fruit' });
    signatures.add(JSON.stringify(tree.parts.map((p) => [p.shape, p.pos, p.size])));
    assert.ok(
      tree.parts.some((p) => p.shape === 'cone'),
      'tapered trunk',
    );
    assert.ok(tree.parts.every((p) => p.size.every((v) => v > 0)));
  }
  assert.equal(signatures.size, 5);
  const distant = buildTree(model, 0, 0, 1, { style: 'fruit', detailed: false, fruit: true });
  assert.ok(
    distant.parts.length <= 13,
    'orchards use small shared crowns instead of individual leaf clouds',
  );
});

test('livestock models retain detail transforms, grounded feet and transparent contact shadows', () => {
  const model = createWorldModel();
  model.animals = [];
  for (const kind of ['cow', 'sheep', 'horse', 'goat', 'chicken', 'duck', 'dog']) {
    const animal = addAnimal(model, kind, [20, 20, 35, 35], 17);
    assert.ok(
      animal.parts.some((p) => p.role === 'hoof'),
      kind + ' feet',
    );
    const shadow = animal.parts.find((p) => p.role === 'shadow');
    assert.equal(shadow.mesh.opacity, 0.12);
    if (kind === 'sheep') assert.ok(animal.parts.some((p) => p.mesh.shape === 'wool'));
    if (kind === 'horse') assert.ok(animal.parts.some((p) => p.mesh.shape === 'leaf'));
    const tilted = animal.parts.find((p) => p.restRotation.some((v) => Math.abs(v) > 0));
    assert.ok(tilted, kind + ' details keep their intended tilt');
    updateAnimals([animal], 0, 0, true);
    assert.equal(tilted.mesh.rotation[0], tilted.restRotation[0]);
    assert.equal(shadow.mesh.opacity, 0.12);
    setGoal(animal, 'walk', [[animal.x + 1, animal.z]], animal.paddock);
    const before = animal.parts
      .filter((p) => p.role === 'leg' || p.role === 'hoof')
      .map((p) => p.mesh.pos.slice());
    updateAnimals([animal], 0.1, 0.1);
    assert.ok(animal.parts.every((p) => p.mesh.pos.every(Number.isFinite)));
    const after = animal.parts
      .filter((p) => p.role === 'leg' || p.role === 'hoof')
      .map((p) => p.mesh.pos);
    assert.notDeepEqual(after, before);
  }
});
