import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { castFor, isWoman, WOMEN, MEN } from '../public/people-cast.js';
import { createRegionalModel } from '../public/regions.js';
import { addCommunityWorld } from '../public/community-world.js';
import { locations } from '../public/locations.js';
import { World3D } from '../public/world3d.js';
import { baseEnv } from '../public/missions.js';

test('the household of five is played by five different characters', () => {
  const household = [
    castFor('Maya', 'Maya'),
    castFor('Alex', 'Alex'),
    castFor('Sam', 'Sam'),
    castFor('section:Bedroom', 'Nina'),
    castFor('section:Living room', 'Jordan'),
  ];
  assert.equal(new Set(household).size, 5);
});

test('Sam is played by a woman where their local name is a woman’s', () => {
  const kyoto = locations.find((l) => l.names?.Sam === 'Haru'),
    other = locations.find((l) => l.names?.Sam === 'Priya');
  assert.ok(MEN.includes(castFor('Sam', kyoto.names.Sam)));
  assert.ok(WOMEN.includes(castFor('Sam', other.names.Sam)));
});

test('residents are cast by gender, the same way every time', () => {
  assert.ok(WOMEN.includes(castFor('civic-section:schoolClassroom1', 'Ms Rao')));
  assert.ok(MEN.includes(castFor('civic-section:schoolClassroom2', 'Mr Patel')));
  assert.ok(isWoman('recreation:zoo', 'Dr. Elena Rostova'));
  assert.equal(castFor('civic:fire', 'Captain Morgan'), castFor('civic:fire', 'Captain Morgan'));
});

test(
  'every resident and background person the world draws has a converted model',
  {
    skip: !existsSync('public/models/people/animations.json') && 'character models not downloaded',
  },
  () => {
    const frames = [];
    const canvas = {
      width: 0,
      height: 0,
      clientWidth: 800,
      clientHeight: 500,
      style: {},
      addEventListener() {},
      removeEventListener() {},
    };
    const raf = globalThis.requestAnimationFrame;
    globalThis.requestAnimationFrame = () => 1;
    try {
      const world = new World3D(canvas, {
        getState: () => ({
          devices: [],
          env: { ...baseEnv },
          outputs: {},
          player: { x: 48, y: 77 },
          speed: 1,
          areas: [],
        }),
        createRenderer: () => ({
          gl: {},
          maxPixelRatio: 1,
          geometries: {},
          drawsCharacters: true,
          render: (frame) => frames.push(frame),
          restore() {},
          dispose() {},
        }),
      });
      world.render(1, 0.016);
      const people = frames.at(-1).characters;
      // Bus-stop passengers, playground parents and the cross-trainer walker are among them.
      assert.ok(people.some((p) => p.key.startsWith('bus:')));
      assert.ok(people.some((p) => p.key.startsWith('parent:')));
      for (const p of people) {
        assert.ok(existsSync(`public/models/people/${p.model}.glb`), p.key + ' ' + p.model);
        assert.ok([p.x, p.y, p.z, p.angle].every(Number.isFinite), p.key);
        assert.ok(p.standIn.length > 0, p.key);
      }
    } finally {
      globalThis.requestAnimationFrame = raf;
    }
  },
);
