import test from 'node:test';
import assert from 'node:assert/strict';
import { createRegionalModel } from '../public/regions.js';
import { addCommunityWorld } from '../public/community-world.js';
import { locationById } from '../public/locations.js';
import { LOCKS, movedByTheGame, tagLooseParts } from '../public/world-detach.js';
import {
  applyAddedWalls,
  checkWalls,
  wallPieces,
  cutOff,
  WALL_DEFAULTS,
} from '../public/added-walls.js';
import {
  applyWorldLayout,
  editGroups,
  snapshotGroup,
  transformGroup,
} from '../public/world-layout.js';
import { WorldSession, tidyWall } from '../editor/workspaces/map-editor/session.js';

const CITIES = ['legacy', 'kyoto', 'marrakech', 'brisbane', 'footscray', 'gippsland', 'lamu'];
const build = (id) => {
  const model = createRegionalModel(id);
  addCommunityWorld(model, locationById(id === 'legacy' ? null : id));
  return model;
};
const geometryOf = (model) =>
  JSON.stringify(model.objects.map((m) => [m.shape, m.pos, m.size, m.rotation, m.color]));

test('every part of every world can be selected: a group of its own, or locked with a reason', () => {
  for (const id of CITIES) {
    const model = build(id);
    const loose = model.objects.filter((m) => !m.editGroup && !m.editLock && !movedByTheGame(m));
    assert.equal(loose.length, 0, `${id}: ${loose.length} parts nobody can select`);
    for (const m of model.objects)
      if (m.editLock) assert.ok(LOCKS[m.editLock], `${id}: lock "${m.editLock}" has a reason`);
    assert.ok(model.detached.grouped > 0 && model.detached.joined > 0, id);
  }
});

test("the house's walls and floors stay the House tool's, and their colliders stay put", () => {
  for (const id of CITIES) {
    const model = build(id),
      built = new Set(model.objects);
    // (Cities that rebuild the house in their own style leave some walls out.)
    for (const wall of model.shell?.walls || []) {
      for (const part of wall.parts.filter((p) => built.has(p)))
        assert.ok(!part.editGroup && part.editLock === 'house', `${id}: ${wall.id}`);
      for (const c of wall.colliders) assert.ok(!c.editGroup, `${id}: ${wall.id}'s collider`);
    }
    for (const room of model.shell?.rooms || [])
      for (const part of room.parts) assert.ok(!part.editGroup, id);
  }
});

test('trees, town details and farm pieces move as whole objects', () => {
  const model = build('gippsland'),
    groups = editGroups(model);
  for (const kind of ['town/tree#1', 'landscape/tree#1', 'farm/fence#1', 'farm/feed-station#1'])
    assert.ok(groups.has(kind), `gippsland has ${kind}`);
  // A tree is its trunk and crown together, moving as one.
  const tree = groups.get('landscape/tree#1');
  assert.ok(tree.parts.length > 3);
  const before = tree.parts.map((p) => [...p.pos]);
  transformGroup(tree, snapshotGroup(tree), {
    pos: [
      snapshotGroup(tree).pivot[0] + 2,
      snapshotGroup(tree).pivot[1],
      snapshotGroup(tree).pivot[2],
    ],
  });
  tree.parts.forEach((p, i) => assert.ok(Math.abs(p.pos[0] - before[i][0] - 2) < 1e-9));
});

test('the pass is metadata only: the world is drawn as built, and running it again changes nothing', () => {
  for (const id of ['legacy', 'footscray', 'gippsland']) {
    const model = build(id),
      geometry = geometryOf(model),
      tags = JSON.stringify(model.objects.map((m) => [m.editGroup, m.editLock]));
    tagLooseParts(model);
    assert.equal(geometryOf(model), geometry, id);
    assert.equal(JSON.stringify(model.objects.map((m) => [m.editGroup, m.editLock])), tags, id);
  }
});

test('an added wall is built square, at an angle, and with doorways and windows', () => {
  const square = wallPieces({ id: 'a', from: [0, 0], to: [4, 0] });
  assert.equal(square.parts.length, 1);
  assert.deepEqual(square.colliders, [{ x: 2, z: 0, w: 4, d: WALL_DEFAULTS.thickness }]);
  const angled = wallPieces({ id: 'b', from: [0, 0], to: [3, 4] });
  assert.ok(angled.colliders.length > 5 && angled.colliders.every((c) => c.w === c.d));
  assert.ok(Math.abs(angled.parts[0].rotation[1] + Math.atan2(4, 3)) < 1e-9);
  const open = wallPieces({
    id: 'c',
    from: [0, 0],
    to: [6, 0],
    height: 2.2,
    openings: [
      { at: 1.5, width: 1, kind: 'door' },
      { at: 4, width: 1.2, kind: 'window' },
    ],
  });
  // Solid, doorway gap, solid, window (sill, lintel, glass), solid.
  assert.equal(open.parts.length, 6);
  assert.equal(open.parts.filter((p) => p.extra.opacity).length, 1);
  // The doorway is open to walk through; the window is not.
  assert.ok(!open.colliders.some((c) => c.x - c.w / 2 < 1.5 && c.x + c.w / 2 > 1.5));
  assert.ok(open.colliders.some((c) => c.x - c.w / 2 <= 4 && c.x + c.w / 2 >= 4));
});

test('added walls are checked: sizes, openings, roads, quest spots and a way into every room', () => {
  const model = build('legacy'),
    texts = (walls) =>
      checkWalls(model, walls)
        .filter((p) => p.error)
        .map((p) => p.text);
  assert.deepEqual(texts([{ id: 'g', from: [-12, 6], to: [-6, 6] }]), []);
  assert.match(texts([{ id: 'g', from: [0, 0], to: [0.1, 0] }])[0], /length/);
  assert.match(texts([{ id: 'g', from: [-12, 6], to: [-6, 6], height: 9 }])[0], /height/);
  assert.match(
    texts([
      { id: 'g', from: [-12, 6], to: [-6, 6], openings: [{ at: 1, width: 1, kind: 'window' }] },
    ])[0],
    /too low for a window/,
  );
  assert.match(
    texts([
      {
        id: 'g',
        from: [-12, 6],
        to: [-6, 6],
        openings: [
          { at: 2, width: 1 },
          { at: 2.5, width: 1 },
        ],
      },
    ])[0],
    /overlap/,
  );
  assert.match(texts([{ id: 'r', from: [10, 20], to: [10, 40] }])[0], /road or the driveway/);
  assert.match(texts([{ id: 's', from: [-12, -9], to: [-9, -9] }])[0], /quest spot/);
  // Shutting the bedroom in: both its doorways closed.
  assert.match(
    texts([
      { id: 'a', from: [-11.5, -6], to: [-9.5, -6] },
      { id: 'b', from: [-8.2, -9.5], to: [-8.2, -7.5] },
    ])[0],
    /walk to the bedroom/,
  );
  // As built, every quest area can be reached.
  for (const id of CITIES) {
    const m = build(id);
    assert.deepEqual(
      cutOff(
        m,
        (m.shell?.walls || []).flatMap((w) => w.colliders),
      ),
      [],
      id,
    );
  }
});

test('added walls join the world from the layout, and none leaves it exactly as built', () => {
  const plain = geometryOf(build('legacy'));
  const none = applyWorldLayout(build('legacy'), 'legacy', {
    version: 1,
    locations: { legacy: { edits: {}, added: [], walls: [] } },
  });
  assert.equal(geometryOf(none), plain);
  const walls = [
    { id: 'wall/1', from: [-12, 6], to: [-6, 6], openings: [{ at: 3, width: 1, kind: 'door' }] },
  ];
  const model = applyWorldLayout(build('legacy'), 'legacy', {
    version: 1,
    locations: { legacy: { edits: {}, added: [], walls } },
  });
  assert.deepEqual(model.layoutWarnings, []);
  assert.equal(model.objects.filter((m) => m.addedWall === 'wall/1').length, 2);
  assert.equal(model.colliders.filter((c) => c.addedWall === 'wall/1').length, 2);
  // Built again (as the editor does), it replaces itself rather than doubling.
  applyAddedWalls(model, walls);
  assert.equal(model.objects.filter((m) => m.addedWall === 'wall/1').length, 2);
  applyAddedWalls(model, []);
  assert.equal(geometryOf(model), plain);
  // A wall with a problem is left out, with a warning.
  const bad = applyWorldLayout(build('legacy'), 'legacy', {
    version: 1,
    locations: { legacy: { walls: [{ id: 'r', from: [10, 20], to: [10, 40] }] } },
  });
  assert.equal(bad.objects.filter((m) => m.addedWall).length, 0);
  assert.match(bad.layoutWarnings[0], /added walls left out/);
});

test('the Map Editor draws, changes, undoes and saves added walls', () => {
  const s = new WorldSession('legacy');
  assert.deepEqual(
    s.editWalls('Add a wall', (walls) =>
      walls.push({ id: s.nextWallId(), from: [-12, 6], to: [-6.00004, 6] }),
    ),
    [],
  );
  assert.deepEqual(s.saved().walls, [{ id: 'wall/1', from: [-12, 6], to: [-6, 6] }]);
  const refused = s.editWalls('Into the road', (walls) => (walls[0].to = [10, 30]));
  assert.match(refused[0].text, /road/);
  assert.deepEqual(s.addedWalls()[0].to, [-6, 6]);
  s.editWalls('Taller', (walls) => (walls[0].height = 2.2));
  s.editWalls('Window', (walls) => (walls[0].openings = [{ at: 3, width: 1.2, kind: 'window' }]));
  assert.equal(s.model.objects.filter((m) => m.addedWall).length, 5);
  s.undo();
  s.undo();
  assert.deepEqual(s.saved().walls, [{ id: 'wall/1', from: [-12, 6], to: [-6, 6] }]);
  assert.equal(s.changeList().find((c) => c.id === 'wall:wall/1').name, 'Added wall 1');
  s.undo();
  assert.equal(s.saved(), null);
  assert.equal(s.model.objects.filter((m) => m.addedWall).length, 0);
  // Opening a city with saved walls builds them.
  const reopened = new WorldSession('legacy', {
    edits: {},
    added: [],
    walls: [{ id: 'wall/2', from: [-12, 6], to: [-6, 6] }],
  });
  assert.equal(reopened.model.objects.filter((m) => m.addedWall === 'wall/2').length, 1);
  assert.deepEqual(tidyWall({ id: 'w', from: [0, 0], to: [1, 0], ...WALL_DEFAULTS }), {
    id: 'w',
    from: [0, 0],
    to: [1, 0],
  });
});
