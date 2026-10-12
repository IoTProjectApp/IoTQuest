import test from 'node:test';
import assert from 'node:assert/strict';
import { createRegionalModel } from '../public/regions.js';
import { locations } from '../public/locations.js';
import { addCommunityWorld, updateCommunityWorld } from '../public/community-world.js';

test('clouds and birds fill the sky over the whole world in every location', () => {
  for (const location of [undefined, ...locations]) {
    const model = createRegionalModel(location?.id || 'legacy'),
      c = addCommunityWorld(model, location);
    assert.ok(c.sky.clouds.length >= 20 && c.sky.birds.length >= 15, location?.id);
    assert.ok(c.sky.objects.every((m) => !m.solid));
  }
});

test('clouds drift and birds fly as time passes; clouds follow cloud cover', () => {
  const model = createRegionalModel('legacy'),
    c = addCommunityWorld(model);
  const state = (cloud) => ({
    env: { light: 70, rain: 0, wind: 20, cloud },
    devices: [],
    outputs: {},
    running: false,
    paused: false,
  });
  const before = [
    c.sky.clouds[0].puffs[0].mesh.pos.slice(),
    c.sky.birds[0].parts[0].mesh.pos.slice(),
  ];
  for (let i = 0; i < 20; i++) updateCommunityWorld(model, state(60), 0.1);
  assert.notDeepEqual(c.sky.clouds[0].puffs[0].mesh.pos, before[0]);
  assert.notDeepEqual(c.sky.birds[0].parts[0].mesh.pos, before[1]);
  const shown = (cloud) => {
    updateCommunityWorld(model, state(cloud), 0);
    return c.sky.clouds.filter((k) => k.puffs[0].mesh.opacity > 0).length;
  };
  assert.ok(shown(90) > shown(10));
});
