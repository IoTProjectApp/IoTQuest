import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  PLAY_PARAM,
  readPlayTarget,
  playTargetUrl,
  findPerson,
  besidePerson,
} from '../public/editor-play.js';

const known = { locationIds: ['kyoto', 'brisbane'], questCount: 160 };

test('a page not opened for a play-test has no target', () => {
  assert.equal(readPlayTarget('', known), null);
  assert.equal(readPlayTarget('?renderer=webgl', known), null);
  assert.equal(readPlayTarget(undefined, known), null);
});

test('a target goes into the address and comes back out the same', () => {
  const target = { city: 'kyoto', quest: 12, person: 'Maya', name: 'Akari', chat: true };
  const url = playTargetUrl('http://127.0.0.1:1/public/game.html', target);
  assert.ok(url.startsWith('http://127.0.0.1:1/public/game.html?' + PLAY_PARAM + '='));
  assert.deepEqual(readPlayTarget(new URL(url).search, known), {
    ...target,
    at: null,
    place: null,
  });
  // From the beginning: still a play-test (nothing saved), with nowhere to go.
  assert.deepEqual(readPlayTarget(new URL(playTargetUrl('x', null), 'http://h/').search, known), {
    city: null,
    quest: null,
    person: null,
    name: null,
    chat: false,
    at: null,
    place: null,
  });
  // Empty parts are left out of the address.
  assert.equal(
    playTargetUrl('g', { city: 'kyoto', person: null, chat: false }),
    'g?editor-play=' + encodeURIComponent('{"city":"kyoto"}'),
  );
});

test('anything the game cannot use is dropped, not trusted', () => {
  const read = (value) =>
    readPlayTarget('?' + PLAY_PARAM + '=' + encodeURIComponent(JSON.stringify(value)), known);
  assert.equal(read({ city: 'atlantis' }).city, null);
  assert.equal(read({ city: 'legacy' }).city, 'legacy');
  assert.equal(read({ quest: 160 }).quest, null);
  assert.equal(read({ quest: -1 }).quest, null);
  assert.equal(read({ quest: 1.5 }).quest, null);
  assert.equal(read({ quest: '3' }).quest, null);
  assert.equal(read({ at: [1, 'x'] }).at, null);
  assert.equal(read({ at: [1, 2, 3] }).at, null);
  assert.deepEqual(read({ at: [-3.5, 12] }).at, [-3.5, 12]);
  assert.equal(read({ place: 'moon' }).place, null);
  assert.equal(read({ chat: true }).chat, false, 'a chat needs someone to talk to');
  assert.equal(read({ person: '  ' }).person, null);
  assert.equal(read({ person: 'x'.repeat(200) }).person.length, 80);
  assert.equal(readPlayTarget('?' + PLAY_PARAM + '=not-json', known).city, null);
  assert.equal(readPlayTarget('?' + PLAY_PARAM + '=[1]', known).quest, null);
});

test('the person is found by id, then by their city name, then by their quest name', () => {
  const around = [
    { key: 'Maya', name: 'Akari', x: 1, z: 2 },
    { key: 'civic:school:0', name: 'Ms Chen', x: 5, z: 5 },
  ];
  assert.equal(findPerson(around, { person: 'Maya' }).key, 'Maya');
  assert.equal(findPerson(around, { person: 'Nobody', name: 'Akari' }).key, 'Maya');
  assert.equal(findPerson(around, { person: 'Ms Chen' }).key, 'civic:school:0');
  assert.equal(findPerson(around, { person: 'Nobody' }), null);
  assert.equal(findPerson(around, {}), null);
});

test('the player stands a step from the person, on the side they come from', () => {
  const [x, z] = besidePerson({ x: 0, z: 0 }, [10, 0]);
  assert.ok(Math.abs(x - 1.4) < 1e-9 && Math.abs(z) < 1e-9);
  assert.deepEqual(besidePerson({ x: 2, z: 3 }), [2, 4.4]);
  assert.deepEqual(besidePerson({ x: 2, z: 3 }, [2, 3]), [2, 4.4]);
});

test('the game never loads or saves progress in a play-test, and the editor sends targets', async () => {
  const game = await readFile(new URL('../public/game.js', import.meta.url), 'utf8');
  assert.match(game, /if \(!PLAY\)\s+try \{\s+saved = sanitizeSaved/);
  assert.match(game, /if \(PLAY\) \{\s+\$\('saved'\)\.textContent = 'Editor play-test/);
  assert.match(game, /if \(!PLAY\) localStorage\.setItem\(RECOVERY_KEY/);
  const shell = await readFile(new URL('../editor/main.mjs', import.meta.url), 'utf8');
  assert.match(shell, /game\.loadURL\(playTargetUrl\(/);
  assert.match(shell, /partition: 'playtest-' \+ Date\.now\(\)/);
  for (const workspace of [
    'map-editor',
    'street-editor',
    'character-editor',
    'quest-editor',
    'conversation-editor',
  ]) {
    const app = await readFile(
      new URL(`../editor/workspaces/${workspace}/app.js`, import.meta.url),
      'utf8',
    );
    assert.match(app, /playstart/, workspace + ' offers the beginning too');
    assert.match(
      app,
      /shell\.openGame\(\s*(fromStart\s*\?\s*null\s*:\s*)?\{/,
      workspace + ' sends a target',
    );
  }
});
