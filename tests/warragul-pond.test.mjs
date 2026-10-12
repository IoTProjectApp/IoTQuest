import test from 'node:test';
import assert from 'node:assert/strict';
import { createRegionalModel } from '../public/regions.js';
import { addCommunityWorld } from '../public/community-world.js';
import { locationById } from '../public/locations.js';
import { collides } from '../public/world-math.js';

test('Warragul silage bales sit beside the dairy shed, outside the driveway', () => {
  const model = createRegionalModel('gippsland');
  addCommunityWorld(model, locationById('gippsland'));
  const bales = model.objects.filter((m) => m.farmFeature === 'bale');
  assert.equal(bales.length, 6);
  for (const bale of bales) {
    assert.ok(bale.pos[2] < -14.6);
    assert.ok(
      model.colliders.some((c) => c.farmBale && c.x === bale.pos[0] && c.z === bale.pos[2]),
    );
  }
});

test('Warragul pond planting keeps the garden opening and walking loop clear', () => {
  const model = createRegionalModel('gippsland');
  addCommunityWorld(model, locationById('gippsland'));
  assert.ok(model.farm.pondGarden);
  assert.ok(model.objects.filter((m) => m.pondGardenTree).length > 10);
  assert.ok(model.objects.filter((m) => m.pondGardenFlowers).length > 30);
  for (let z = 10.5; z <= 19.55; z += 0.1)
    assert.equal(
      collides(8.25, z, model.colliders),
      false,
      'Garden opens through both former fence lines',
    );
  for (let i = 0; i < 120; i++) {
    const a = (i * Math.PI * 2) / 120;
    assert.equal(
      collides(8 + Math.cos(a) * 4.45, 24 + Math.sin(a) * 4.45, model.colliders),
      false,
      'Pond loop stays clear of planting',
    );
  }
});
