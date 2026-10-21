// The Map Editor workspace's model of a destination (editor/workspaces/map-editor/session.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { WorldSession } from '../editor/workspaces/map-editor/session.js';
import { nameOf, categoryOf, kindOf } from '../editor/workspaces/map-editor/names.js';
import { applyWorldLayout, editGroups } from '../public/world-layout.js';
import { createRegionalModel } from '../public/regions.js';
import { addCommunityWorld } from '../public/community-world.js';

test('group ids read as names and catalogue categories', () => {
  assert.equal(nameOf('furniture/dining-chair#2'), 'Dining chair 2');
  assert.equal(nameOf('furniture/sofa#1', 1), 'Sofa');
  assert.equal(nameOf('town/furniture/office:desk0'), 'Office · desk 0');
  assert.equal(kindOf('garden/tree#12'), 'garden/tree');
  assert.equal(categoryOf('town/furniture/shop:counter'), 'furniture');
  assert.equal(categoryOf('town/shop'), 'buildings');
  assert.equal(categoryOf('town/street-light#3'), 'street');
  assert.equal(categoryOf('garden/lantern#2'), 'garden');
});

test('moves, removals and additions undo and redo, and save in the layout format', () => {
  const session = new WorldSession('legacy');
  assert.equal(session.saved(), null, 'a fresh city has nothing to save');
  const sofa = session.groups.get('furniture/sofa#1'),
    start = [...sofa.placement.pos];
  session.move(sofa.id, { pos: [start[0] + 1.23456, start[1], start[2]], turn: 0, scale: 1 });
  // Stored to the millimetre.
  const mm = (v) => Math.round(v * 1000) / 1000;
  assert.deepEqual(
    session.saved().edits[sofa.id].pos,
    [start[0] + 1.23456, start[1], start[2]].map(mm),
  );
  session.remove('furniture/car#1');
  assert.ok(session.groups.get('furniture/car#1').hidden);
  assert.equal(
    session.model.objects.some((m) => m.editGroup === 'furniture/car#1'),
    false,
  );
  const id = session.add(session.groups.get('garden/tree#1'), {
    pos: [3, 0, 6],
    turn: 0,
    scale: 1,
  });
  assert.equal(id, 'added/1');
  assert.ok(session.model.objects.some((m) => m.editGroup === id));
  assert.deepEqual(
    session.changeList().map((c) => c.what),
    ['Moved', 'Removed', 'Added'],
  );

  assert.equal(session.undo(), 'Add Tree');
  assert.equal(
    session.model.objects.some((m) => m.editGroup === id),
    false,
  );
  session.undo();
  assert.ok(!session.groups.get('furniture/car#1').hidden, 'the car is back');
  session.undo();
  assert.deepEqual(session.groups.get(sofa.id).placement.pos, start, 'the sofa is back');
  assert.equal(session.saved(), null);
  session.redo();
  session.redo();
  session.redo();
  assert.equal(session.changeList().length, 3);

  // What the editor saves, the game applies to the same effect.
  const saved = session.saved(),
    model = createRegionalModel('legacy');
  addCommunityWorld(model);
  applyWorldLayout(model, 'legacy', { version: 1, locations: { legacy: saved } });
  const groups = editGroups(model);
  assert.deepEqual(
    groups.get(sofa.id).pivot.map((v) => Math.round(v * 1000) / 1000),
    saved.edits[sofa.id].pos,
  );
  assert.equal(groups.has('furniture/car#1'), false);
  assert.ok(groups.has('added/1'));
  assert.deepEqual(model.layoutWarnings, []);
});

test('moving a group back to where it was built clears its change', () => {
  const session = new WorldSession('kyoto'),
    lantern = session.groups.get('garden/stone-lantern'),
    original = lantern.original;
  session.move(lantern.id, {
    ...original,
    pos: [original.pos[0] + 2, original.pos[1], original.pos[2]],
  });
  assert.ok(session.isChanged(lantern.id));
  session.move(lantern.id, original);
  assert.equal(session.isChanged(lantern.id), false);
  assert.equal(session.saved(), null);
});

test('opening a city with saved changes shows them, and flags ones it cannot place', () => {
  const session = new WorldSession('legacy', {
    edits: { 'furniture/car#1': { removed: true }, 'garden/gone#1': { removed: true } },
    added: [],
  });
  assert.ok(session.groups.get('furniture/car#1').hidden);
  assert.deepEqual(session.missing, ['garden/gone#1']);
  assert.equal(session.undoStack.length, 0, 'opening is not an undoable step');
});
