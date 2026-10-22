// The Character Editor workspace's model (editor/workspaces/character-editor/session.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { CharacterSession, DEFAULTS } from '../editor/workspaces/character-editor/session.js';
import { settingsFor } from '../public/character-settings.js';

const empty = () => ({ version: 1, defaults: {}, people: {} });

test('settings for one person and for everyone, saved as small as they can be', () => {
  const s = new CharacterSession(empty());
  assert.equal(s.isChanged(), false);
  s.set('Maya', 'model', 'Kate');
  s.wear('Maya', 'hat', null);
  s.wear('Maya', 'top', '#2a5bd7');
  s.set(DEFAULTS, 'rate', 0.8);
  s.set('bus:0:1>1:1:0', 'activity', false);
  assert.deepEqual(s.settings, {
    version: 1,
    defaults: { rate: 0.8 },
    people: {
      Maya: { model: 'Kate', outfit: { hat: null, top: '#2a5bd7' } },
      'bus:0:1>1:1:0': { activity: false },
    },
  });
  // What the game makes of them.
  assert.deepEqual(settingsFor('Maya', s.settings), {
    model: 'Kate',
    outfit: { hat: null, top: '#2a5bd7' },
    walk: null,
    idle: null,
    activity: null,
    speed: 1,
    rate: 0.8,
  });
  assert.ok(s.isChanged() && s.isChanged('Maya') && !s.isChanged('Alex'));
  assert.deepEqual([...s.changedPeople()], ['Maya', 'bus:0:1>1:1:0']);
});

test('putting things back as built leaves nothing behind', () => {
  const s = new CharacterSession(empty());
  s.wear('Maya', 'hat', null);
  s.wear('Maya', 'hat', undefined);
  assert.deepEqual(s.settings.people, {}, 'an empty outfit and then an empty person are dropped');
  s.set('Maya', 'walk', 'Jogging');
  s.set('Maya', 'speed', 1.4);
  s.wear('Maya', 'top', '#111111');
  s.reset('Maya', 'movement');
  assert.deepEqual(s.settings.people.Maya, { outfit: { top: '#111111' } });
  s.reset('Maya');
  assert.equal(s.isChanged(), false);
});

test('every change undoes and redoes, and a change that changes nothing is not a step', () => {
  const s = new CharacterSession(empty());
  s.set('player', 'model', 'Kate');
  assert.equal(s.set('player', 'model', 'Kate'), false);
  s.wear('player', 'vest', { color: '#ff7a1a', text: 'CREW' });
  assert.equal(s.undoStack.length, 2);
  assert.equal(s.undo(), 'Change vest');
  assert.deepEqual(s.settings.people.player, { model: 'Kate' });
  s.redo();
  assert.deepEqual(s.settings.people.player.outfit.vest, { color: '#ff7a1a', text: 'CREW' });
  s.markSaved();
  assert.equal(s.isChanged(), false);
});

test('opening saved settings shows them unchanged', () => {
  const saved = { version: 1, defaults: { speed: 1.2 }, people: { Alex: { idle: 'Talking' } } };
  const s = new CharacterSession(saved);
  assert.equal(s.isChanged(), false);
  assert.deepEqual(s.own('Alex'), { idle: 'Talking' });
  assert.deepEqual(s.own(DEFAULTS), { speed: 1.2 });
});
