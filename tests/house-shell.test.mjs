import test from 'node:test';
import assert from 'node:assert/strict';
import { createRegionalModel } from '../public/regions.js';
import { addCommunityWorld } from '../public/community-world.js';
import { locationById } from '../public/locations.js';
import { applyWorldLayout } from '../public/world-layout.js';
import {
  applyHouseShell,
  checkHouse,
  shellInfo,
  wallSpecs,
  segments,
  furnitureInWalls,
} from '../public/house-shell.js';
import { WorldSession } from '../editor/workspaces/map-editor/session.js';

const build = (id) => {
  const model = createRegionalModel(id);
  addCommunityWorld(model, locationById(id));
  return model;
};
const layout = (id, house) => ({
  version: 1,
  locations: { [id]: { edits: {}, added: [], house } },
});
const geometry = (model, sorted = false) => {
  const objects = model.objects.map((m) =>
      JSON.stringify([m.shape, m.pos, m.size, m.rotation, m.color]),
    ),
    colliders = model.colliders.map((c) => JSON.stringify([c.x, c.z, c.w, c.d]));
  if (sorted) [objects, colliders].forEach((list) => list.sort());
  return JSON.stringify([objects, colliders, model.rooms]);
};
const wall = (model, id) => model.shell.walls.find((w) => w.id === id);
const near = (a, b) => Math.abs(a - b) < 1e-9;

test('with no house changes every house is exactly as built', () => {
  for (const id of ['legacy', 'kyoto', 'marrakech', 'lamu', 'fitzroy', 'gippsland']) {
    const built = geometry(build(id));
    for (const house of [undefined, {}])
      assert.equal(geometry(applyWorldLayout(build(id), id, layout(id, house))), built, id);
  }
});

test('the shell knows every wall and room, and rebuilds a wall exactly as the code does', () => {
  const model = createRegionalModel('legacy');
  assert.deepEqual(shellInfo(model), {
    whole: true,
    walls: [
      'back',
      'middle-left',
      'middle-centre',
      'middle-right',
      'left',
      'right',
      'divider-left',
      'divider-right',
      'front-left',
      'front-centre',
      'front-right',
    ],
    rooms: ['Bedroom', 'Bathroom', 'Utility room', 'Living room', 'Kitchen', 'Garage'],
  });
  for (const spec of wallSpecs(model)) {
    const built = wall(model, spec.id);
    assert.equal(segments(spec).length, built.parts.length, spec.id);
    segments(spec).forEach(([a, b], i) => {
      const part = built.parts[i],
        k = spec.axis === 'x' ? 0 : 2;
      assert.ok(near(part.pos[k], (a + b) / 2) && near(part.size[k], b - a), spec.id);
      assert.ok(near(part.size[1], spec.height), spec.id);
    });
  }
});

test('moving an inner wall moves its line, stretches the walls ending on it and resizes the rooms', () => {
  const model = createRegionalModel('legacy');
  applyWorldLayout(model, 'legacy', layout('legacy', { lines: { 'divider-left': -7.6 } }));
  assert.deepEqual(model.layoutWarnings, []);
  for (const part of wall(model, 'divider-left').parts) assert.ok(near(part.pos[0], -7.6));
  for (const c of wall(model, 'divider-left').colliders) assert.ok(near(c.x, -7.6));
  // The walls either side now meet it.
  const left = wall(model, 'middle-left').parts.at(-1),
    centre = wall(model, 'middle-centre').parts[0];
  assert.ok(near(left.pos[0] + left.size[0] / 2, -7.6));
  assert.ok(near(centre.pos[0] - centre.size[0] / 2, -7.6));
  // The bedroom grows by 0.6 m, the bathroom shrinks, and the game finds both at their new size.
  const room = (name) => model.rooms.find((r) => r[0] === name);
  assert.ok(near(room('Bedroom')[4][0], 4.58 + 0.6 * (4.58 / 4.9)));
  assert.ok(room('Bathroom')[4][0] < 4.58);
  assert.equal(room('Utility room')[4], undefined);
  const floor = model.shell.rooms.find((r) => r.id === 'Bedroom').parts[0];
  assert.ok(near(floor.size[0], room('Bedroom')[4][0]));
  // The doorways stay in the middle of their rooms' walls.
  assert.deepEqual(
    wallSpecs(model, { lines: { 'divider-left': -7.6 } }).find((w) => w.id === 'middle-left')
      .openings,
    [{ at: -10.182, width: 1.5 }],
  );
  // The kitchen cabinets were against that wall: the editor points them out.
  assert.deepEqual(furnitureInWalls(model), [
    { group: 'furniture/kitchen-cabinets#1', wall: 'divider-left' },
  ]);
});

test('walls change height, colour and doorways; floors change colour', () => {
  const model = createRegionalModel('legacy');
  applyWorldLayout(
    model,
    'legacy',
    layout('legacy', {
      walls: {
        back: { height: 2, color: '#a0b0c0', openings: [{ at: -6, width: 1.2 }] },
        'middle-left': { openings: [] },
      },
      rooms: { Kitchen: { color: '#112233' } },
    }),
  );
  assert.deepEqual(model.layoutWarnings, []);
  const back = wall(model, 'back');
  assert.equal(back.parts.length, 2);
  assert.ok(back.parts.every((p) => p.color === '#a0b0c0' && near(p.size[1], 2)));
  assert.ok(model.objects.includes(back.parts[0]) && model.colliders.includes(back.colliders[0]));
  assert.equal(wall(model, 'middle-left').parts.length, 1);
  assert.equal(model.shell.rooms.find((r) => r.id === 'Kitchen').parts[0].color, '#112233');
  // Applying none puts the house back as built.
  const fresh = geometry(createRegionalModel('legacy'), true);
  applyHouseShell(model, null);
  assert.equal(geometry(model, true), fresh);
});

test('house changes are checked, and the game leaves out changes with problems', () => {
  const model = createRegionalModel('legacy'),
    texts = (house) => checkHouse(model, house).map((p) => p.text);
  assert.deepEqual(texts({ lines: { 'divider-left': -7.6 } }), []);
  assert.match(texts({ lines: { back: -12 } })[0], /outer walls/);
  assert.match(texts({ lines: { attic: 1 } })[0], /no wall line/);
  assert.match(texts({ walls: { porch: {} } })[0], /no wall "porch"/);
  assert.match(texts({ rooms: { Kitchen: { color: 'red' } } })[0], /not a colour/);
  assert.ok(texts({ lines: { 'divider-right': -6 } }).some((t) => /narrower than 2.5 m/.test(t)));
  assert.ok(
    texts({ lines: { 'divider-left': -9.5 } }).some((t) =>
      /living room's devices and resident/.test(t),
    ),
  );
  assert.ok(texts({ walls: { back: { height: 4 } } }).some((t) => /0.3–2.5 m high/.test(t)));
  assert.ok(
    texts({
      walls: {
        back: {
          openings: [
            { at: -6, width: 1 },
            { at: -5.6, width: 1 },
          ],
        },
      },
    }).some((t) => /overlap/.test(t)),
  );
  assert.ok(
    texts({ walls: { back: { openings: [{ at: 1, width: 1 }] } } }).some((t) =>
      /off the end/.test(t),
    ),
  );
  // The doorways into the garage and utility room: closing them all shuts both rooms off.
  assert.deepEqual(
    texts({ walls: { 'front-right': { openings: [] }, right: { openings: [] } } }),
    [],
  );
  assert.deepEqual(
    texts({
      walls: {
        'front-right': { openings: [] },
        right: { openings: [] },
        'divider-right': { openings: [] },
      },
    }),
    [
      'Nobody could walk into the utility room: it needs a doorway.',
      'Nobody could walk into the garage: it needs a doorway.',
    ],
  );
  const kept = createRegionalModel('legacy'),
    built = geometry(kept);
  applyWorldLayout(kept, 'legacy', layout('legacy', { walls: { back: { height: 9 } } }));
  assert.equal(geometry(kept), built);
  assert.match(kept.layoutWarnings[0], /^legacy: house changes left out: The back wall must be/);
});

test('a city that rebuilds the house lets its walls change but not move', () => {
  const model = createRegionalModel('lamu'),
    info = shellInfo(model);
  assert.equal(info.whole, false);
  assert.ok(info.walls.includes('back'));
  assert.match(
    checkHouse(model, { lines: { 'divider-left': -7.6 } })[0].text,
    /builds its own house/,
  );
  applyWorldLayout(model, 'lamu', layout('lamu', { walls: { back: { color: '#333333' } } }));
  assert.deepEqual(model.layoutWarnings, []);
  assert.ok(wall(model, 'back').parts.every((p) => p.color === '#333333'));
});

test('the Map Editor changes the house with undo, refuses changes with problems, and saves them', () => {
  const s = new WorldSession('legacy');
  assert.deepEqual(
    s.editHouse('Move', (h) => (h.lines = { 'divider-left': -7.6 })),
    [],
  );
  assert.deepEqual(s.saved().house, { lines: { 'divider-left': -7.6 } });
  assert.ok(s.walls().find((w) => w.id === 'divider-left').at === -7.6);
  assert.ok(s.houseWarnings().some((w) => /inside the left inner wall/.test(w.text)));
  const problems = s.editHouse('Squeeze', (h) => (h.lines['divider-right'] = -7));
  assert.ok(problems.length);
  assert.deepEqual(s.saved().house, { lines: { 'divider-left': -7.6 } });
  s.editHouse('Colour', (h) => (h.walls = { back: { color: '#123456' } }));
  assert.deepEqual(
    s.changeList().map((c) => c.id),
    ['house:lines:divider-left', 'house:walls:back'],
  );
  s.resetHouse('house:lines:divider-left');
  assert.deepEqual(s.saved().house, { walls: { back: { color: '#123456' } } });
  s.undo();
  s.undo();
  assert.deepEqual(s.saved().house, { lines: { 'divider-left': -7.6 } });
  s.undo();
  assert.equal(s.saved(), null);
  assert.equal(geometry(s.model, true), geometry(new WorldSession('legacy').model, true));
  // Opening a city with saved house changes shows them.
  const opened = new WorldSession('legacy', {
    edits: {},
    added: [],
    house: { lines: { middle: -6.4 } },
  });
  assert.ok(wall(opened.model, 'middle-left').parts.every((p) => near(p.pos[2], -6.4)));
});
