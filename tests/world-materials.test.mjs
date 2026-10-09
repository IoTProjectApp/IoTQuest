import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SURFACE,
  surfaceForMesh,
  worldSunlight,
  prepareWorldMaterials,
} from '../public/world-materials.js';
import { createRegionalModel } from '../public/regions.js';
import { addCommunityWorld } from '../public/community-world.js';

test('world surfaces recognize explicit finishes, thick grass ground, water and terrain', () => {
  const mesh = (extra = {}) => ({
    shape: 'box',
    pos: [0, 0, 0],
    size: [3, 0.2, 3],
    color: '#888888',
    ...extra,
  });
  assert.equal(surfaceForMesh(mesh({ material: 'timber' })), SURFACE.timber);
  assert.equal(surfaceForMesh(mesh({ material: 'glass' })), SURFACE.glass);
  assert.equal(surfaceForMesh(mesh({ material: 'fabric' })), SURFACE.fabric);
  assert.equal(surfaceForMesh(mesh({ size: [122, 1, 122], color: '#99b780' })), SURFACE.grass);
  assert.equal(surfaceForMesh(mesh({ terrainFeature: 'river' })), SURFACE.water);
  assert.equal(surfaceForMesh(mesh({ terrainFeature: 'mountain' })), SURFACE.terrain);
  assert.equal(surfaceForMesh(mesh({ surface: 'plain', color: '#d9ae6b' })), SURFACE.plain);
});
test('practice sunlight follows the simulation clock, softens in cloud and disappears at night', () => {
  const state = {
    env: { light: 85, cloud: 0 },
    weatherMode: 'practice',
    skyStartHour: 8,
    simClockMs: 0,
  };
  const morning = worldSunlight(state),
    noon = worldSunlight({ ...state, skyStartHour: 12 }),
    evening = worldSunlight({ ...state, skyStartHour: 17 });
  assert.ok(morning.direction[0] > 0);
  assert.ok(evening.direction[0] < 0);
  assert.ok(noon.direction[1] > morning.direction[1]);
  assert.ok(
    worldSunlight({ ...state, env: { light: 85, cloud: 100 } }).strength < morning.strength,
  );
  const night = worldSunlight({ ...state, skyStartHour: 22, env: { light: 4 } });
  assert.equal(night.strength, 0);
  assert.ok(night.direction[1] < 0);
  assert.deepEqual(worldSunlight({ ...state, simClockMs: 4 * 3600000 }).direction, noon.direction);
});
test('live and astronomical lighting use the selected location sun direction', () => {
  const sky = { sun: { direction: [0.2, 0.9, -0.3] } };
  for (const settings of [{ weatherMode: 'live' }, { skyMode: 'simulated' }]) {
    const light = worldSunlight({ env: { light: 70 }, ...settings }, sky);
    assert.ok(Math.abs(Math.hypot(...light.direction) - 1) < 1e-9);
    assert.ok(light.direction[2] < 0);
  }
});
test('visual materials and ground shadows preserve geometry, collisions and routes', () => {
  const m = createRegionalModel('legacy');
  addCommunityWorld(m);
  const geometry = m.objects.map((o) => JSON.stringify([o.pos, o.size, o.rotation]));
  const colliders = JSON.stringify(m.colliders),
    routes = JSON.stringify(m.community.sim.map.roads.edges);
  prepareWorldMaterials(m);
  assert.deepEqual(
    m.objects.map((o) => JSON.stringify([o.pos, o.size, o.rotation])),
    geometry,
  );
  assert.equal(JSON.stringify(m.colliders), colliders);
  assert.equal(JSON.stringify(m.community.sim.map.roads.edges), routes);
  assert.ok(m.visualShadows.length <= 12);
  assert.ok(
    m.visualShadows.every((s) => [s.x, s.z, s.w, s.d, s.h, s.opacity].every(Number.isFinite)),
  );
  assert.equal(surfaceForMesh(m.dynamic.tankWater), SURFACE.water);
});
