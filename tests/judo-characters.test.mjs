import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { existsSync, readdirSync } from 'node:fs';
import { createRegionalModel } from '../public/regions.js';
import { addCommunityWorld } from '../public/community-world.js';
import { judoCharacters, CLIPS, CAST } from '../public/judo-characters.js';
import { World3D } from '../public/world3d.js';
import { baseEnv } from '../public/missions.js';

// The models come from a private repository (scripts/fetch-models.mjs); without them the tests
// that read them are skipped.
const modelsMissing =
  !existsSync('public/models/people/animations.json') &&
  'character models not downloaded (node scripts/fetch-models.mjs)';
const converted = modelsMissing
  ? {}
  : JSON.parse(await readFile('public/models/people/animations.json', 'utf8'));
const dojo = () => {
  const model = createRegionalModel('legacy');
  const c = addCommunityWorld(model);
  return {
    judo: c.recreationPeople.find((g) => g.judo).judo,
    mat: c.recreation.find((r) => r.building.type === 'dojo').mat,
  };
};

test(
  'the choreography uses the converted clips’ real lengths and hip positions',
  { skip: modelsMissing },
  () => {
    for (const [name, clip] of Object.entries(CLIPS)) {
      const real = converted[name];
      assert.ok(real, name + ' is converted');
      assert.equal(clip.duration, real.duration, name + ' duration');
      if (clip.stride) assert.equal(clip.stride, real.move[1], name + ' stride');
      if (clip.end) assert.deepEqual(clip.end, [real.end[0], real.end[2]], name + ' end');
      if (clip.start) assert.deepEqual(clip.start, [real.start[0], real.start[2]], name + ' start');
    }
  },
);

test(
  'every judoka plays real clips, fully weighted, on the tatami through two rounds',
  { skip: modelsMissing },
  async () => {
    const { judo, mat } = dojo();
    const models = new Set(readdirSync('public/models/people').map((f) => f.replace('.glb', '')));
    for (let t = 0; t < 40; t += 1 / 15) {
      const people = judoCharacters(judo, t, false);
      assert.equal(people.length, 5);
      for (const p of people) {
        assert.equal(p.model, CAST[p.key]);
        assert.ok(models.has(p.model), p.model + ' has a converted model');
        assert.ok(p.standIn.length > 10, 'a stand-in figure to hide');
        assert.equal(p.y, 0.27);
        assert.ok(Math.abs(p.x - mat.x) < mat.w / 2 && Math.abs(p.z - mat.z) < mat.d / 2, p.key);
        assert.ok(Number.isFinite(p.angle));
        const total = p.clips.reduce((sum, c) => sum + c.weight, 0);
        assert.ok(Math.abs(total - 1) < 1e-9, `${p.key} weights add to ${total} at ${t}`);
        for (const c of p.clips) {
          assert.ok(converted[c.name], c.name + ' is a converted clip');
          assert.ok(
            c.time >= 0 && c.time <= converted[c.name].duration + 1e-9,
            `${c.name} ${c.time}`,
          );
        }
      }
    }
  },
);

test('partners take turns throwing, and reduced motion holds the class still', () => {
  const { judo } = dojo();
  const thrower = (t) =>
    judoCharacters(judo, t, false).find((p) => p.clips.some((c) => c.name === 'TakedownAttacker'))
      ?.key;
  // The first pair throws about 4–7 s into each 18.5 s round.
  assert.equal(thrower(5), 'dojo:student:0');
  assert.equal(thrower(5 + 18.5), 'dojo:student:1');
  assert.deepEqual(judoCharacters(judo, 3, true), judoCharacters(judo, 30, true));
});

test('the world builds characters only for a renderer that draws them', () => {
  const frames = [];
  const fake = (drawsCharacters) => () => ({
    gl: {},
    maxPixelRatio: 1,
    geometries: {},
    drawsCharacters,
    render: (frame) => frames.push(frame),
    restore() {},
    dispose() {},
  });
  const canvas = {
    width: 0,
    height: 0,
    clientWidth: 800,
    clientHeight: 500,
    style: {},
    addEventListener() {},
    removeEventListener() {},
  };
  const state = {
    devices: [],
    env: { ...baseEnv },
    outputs: {},
    player: { x: 48, y: 77 },
    speed: 1,
    areas: [],
  };
  const raf = globalThis.requestAnimationFrame;
  globalThis.requestAnimationFrame = () => 1;
  try {
    for (const draws of [true, false]) {
      const world = new World3D(canvas, { getState: () => state, createRenderer: fake(draws) });
      world.render(1, 0.016);
      const people = frames.at(-1).characters;
      assert.equal(people.length, draws ? 5 : 0);
      if (draws) assert.deepEqual(people.map((p) => p.model).sort(), Object.values(CAST).sort());
    }
  } finally {
    globalThis.requestAnimationFrame = raf;
  }
});
