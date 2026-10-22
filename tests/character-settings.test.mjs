// Hand-set looks and movement (public/character-settings.js) and the game applying them.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import {
  settingsFor,
  dressed,
  knownClip,
  CHARACTER_SETTINGS,
} from '../public/character-settings.js';
import { World3D } from '../public/world3d.js';

test('a person’s own settings come before the defaults, and both before the code', () => {
  const settings = {
    version: 1,
    defaults: { outfit: { hat: { kind: 'cap', color: '#111111' } }, rate: 0.5, walk: 'Walking' },
    people: { Maya: { model: 'Kate', outfit: { top: '#ff0000' }, rate: 2 } },
  };
  assert.deepEqual(settingsFor('Maya', settings), {
    model: 'Kate',
    outfit: { hat: { kind: 'cap', color: '#111111' }, top: '#ff0000' },
    walk: 'Walking',
    idle: null,
    activity: null,
    speed: 1,
    rate: 2,
    appearance: {},
  });
  assert.equal(settingsFor('someone-else', settings).rate, 0.5);
  assert.deepEqual(settingsFor('anyone', { version: 1, defaults: {}, people: {} }), {
    model: null,
    outfit: {},
    walk: null,
    idle: null,
    activity: null,
    speed: 1,
    rate: 1,
    appearance: {},
  });
});

test('outfit changes are laid over what they wore; null takes a piece off', () => {
  const outfit = { top: '#123456', hat: { kind: 'hardhat', color: '#ffffff' } };
  assert.equal(dressed(outfit, {}), outfit, 'no changes: the very same outfit');
  assert.deepEqual(dressed(outfit, { hat: null, bottom: '#000000' }), {
    top: '#123456',
    bottom: '#000000',
  });
  assert.equal(knownClip('Jogging'), 'Jogging');
  assert.equal(knownClip('NotConvertedYet'), 'Idle');
  assert.equal(knownClip(null, 'Walking'), 'Walking');
});

test('every clip the saved settings name is one the game has', () => {
  assert.equal(CHARACTER_SETTINGS.version, 1);
  for (const [id, own] of Object.entries(CHARACTER_SETTINGS.people))
    for (const clip of [own.walk, own.idle, own.activity].filter(Boolean))
      assert.equal(knownClip(clip, null), clip, `${id}'s ${clip} is a clip the game has`);
});

// One frame of the world, as the renderer is handed it.
function frame(state = {}) {
  const frames = [],
    canvas = {
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
        env: { light: 70, temperature: 22, humidity: 50, motion: true },
        outputs: {},
        player: { x: 48, y: 77 },
        speed: 1,
        areas: [],
        ...state,
      }),
      createRenderer: () => ({
        gl: {},
        maxPixelRatio: 1,
        geometries: {},
        drawsCharacters: true,
        render: (f) => frames.push(f),
        restore() {},
        dispose() {},
      }),
    });
    for (let i = 0; i < 4; i++) world.render(1 + i * 0.25, 0.25);
    return frames.at(-1).characters;
  } finally {
    globalThis.requestAnimationFrame = raf;
  }
}
// Runs `check` with these settings in force, then puts the saved ones back.
function withSettings(people, check) {
  const saved = { ...CHARACTER_SETTINGS.people };
  Object.assign(CHARACTER_SETTINGS.people, people);
  try {
    check();
  } finally {
    for (const id of Object.keys(people)) delete CHARACTER_SETTINGS.people[id];
    Object.assign(CHARACTER_SETTINGS.people, saved);
  }
}

test('the world plays each person with their set model, clothes and clips', () => {
  const people = frame();
  const passenger = people.find((p) => p.key.startsWith('bus:')).key,
    player = people.find((p) => p.key === 'player');
  assert.ok(player, 'the technician is drawn');
  withSettings(
    {
      player: { model: 'Kate', outfit: { hat: null, top: '#2244aa' }, idle: 'Talking', rate: 2 },
      [passenger]: { activity: 'AirSquat' },
    },
    () => {
      const now = frame(),
        tech = now.find((p) => p.key === 'player'),
        squatter = now.find((p) => p.key === passenger);
      assert.equal(tech.model, 'Kate');
      assert.equal(tech.outfit.hat, undefined, 'hard hat off');
      assert.equal(tech.outfit.top, '#2244aa');
      assert.ok(tech.outfit.vest, 'the vest stays on');
      assert.ok(tech.clips.some((c) => c.name === 'Talking'));
      assert.deepEqual(
        squatter.clips.map((c) => c.name),
        ['AirSquat'],
      );
    },
  );
  // Back to how the code makes them.
  assert.equal(frame().find((p) => p.key === 'player').model, player.model);
});

test('a clip that is not converted on this machine leaves its person standing', () => {
  const people = frame(),
    someone = people.find((p) => p.key.startsWith('parent:')).key;
  withSettings({ [someone]: { idle: 'NotConvertedYet', activity: null } }, () => {
    const now = frame().find((p) => p.key === someone);
    assert.ok(now.clips.every((c) => c.name === 'Idle' || c.name.includes('Walk')));
  });
});

test('the judo class can be dressed and recast, but keeps its moves', () => {
  const people = frame(),
    judoka = people.find((p) => p.key.startsWith('dojo:') || p.key === 'recreation:dojo');
  assert.ok(judoka, 'the judo class is drawn');
  withSettings(
    { [judoka.key]: { model: 'Brian', outfit: { top: '#1a1a6e' }, activity: 'AirSquat' } },
    () => {
      const now = frame().find((p) => p.key === judoka.key);
      assert.equal(now.model, 'Brian');
      assert.equal(now.outfit.top, '#1a1a6e');
      assert.ok(!now.clips.some((c) => c.name === 'AirSquat'), 'still the class routine');
    },
  );
});

test(
  'every model a setting names exists',
  {
    skip: !existsSync('public/models/people/animations.json') && 'character models not downloaded',
  },
  () => {
    for (const [id, own] of Object.entries(CHARACTER_SETTINGS.people))
      if (own.model) assert.ok(existsSync(`public/models/people/${own.model}.glb`), id);
  },
);
