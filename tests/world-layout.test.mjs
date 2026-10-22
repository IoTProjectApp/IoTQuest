import test from 'node:test';
import assert from 'node:assert/strict';
import { createRegionalModel } from '../public/regions.js';
import { addCommunityWorld } from '../public/community-world.js';
import { locationById, locations } from '../public/locations.js';
import { modelMatrix } from '../public/world-math.js';
import {
  applyWorldLayout,
  editGroups,
  snapshotGroup,
  transformGroup,
  turnRotation,
  groupTemplate,
} from '../public/world-layout.js';
import WORLD_LAYOUT from '../public/data/world-layout.js';

const build = (id) => {
  const model = createRegionalModel(id);
  addCommunityWorld(model, locationById(id));
  return model;
};
const geometryOf = (model) =>
  JSON.stringify(model.objects.map((m) => [m.shape, m.pos, m.size, m.rotation, m.color]));
const near = (a, b, message) =>
  a.forEach((v, i) => assert.ok(Math.abs(v - b[i]) < 1e-6, `${message}: ${a} vs ${b}`));

test('an empty layout leaves every world exactly as built', () => {
  for (const id of ['legacy', 'kyoto', 'marrakech', 'brisbane', 'fitzroy', 'gippsland']) {
    const built = geometryOf(build(id));
    const model = applyWorldLayout(build(id), id, { version: 1, locations: {} });
    assert.equal(geometryOf(model), built, id);
    assert.deepEqual(model.layoutWarnings, []);
  }
});

test('the saved layout only names groups the worlds still build', () => {
  for (const [id, changes] of Object.entries(WORLD_LAYOUT.locations)) {
    assert.ok(id === 'legacy' || locationById(id), `${id} is a destination`);
    const groups = editGroups(build(id));
    for (const groupId of Object.keys(changes.edits || {}))
      assert.ok(groups.has(groupId), `${id}: ${groupId} is still built`);
  }
});

test('every destination tags its furniture, garden and town as edit groups', () => {
  for (const { id } of [{ id: 'legacy' }, ...locations]) {
    const groups = editGroups(build(id));
    // (Some styles clear the house's rooms for a court or a compound, furniture and all.)
    for (const expected of [
      'garden/tank',
      'town/shop',
      'house/garage-door',
      ...(id === 'legacy' ? ['furniture/sofa#1', 'furniture/bed#1'] : []),
    ])
      assert.ok(groups.has(expected), `${id} has ${expected}`);
    // Fittings are their own objects, never part of the walls (which are not edit groups).
    for (const [groupId, group] of groups)
      if (groupId.startsWith('house/'))
        assert.ok(group.parts.length < 120, `${id} ${groupId} is a fitting, not the house`);
    // The house's furniture stays inside the house.
    for (const [groupId, group] of groups)
      if (groupId.startsWith('furniture/'))
        for (const part of group.parts)
          assert.ok(
            part.pos[0] > -13.5 && part.pos[0] < 1.8 && part.pos[2] > -11.5 && part.pos[2] < -0.5,
            `${id} ${groupId}`,
          );
  }
});

test('windows, the blinds and the garage door move on their own, apart from the house', () => {
  const kyoto = editGroups(build('kyoto'));
  for (const id of ['house/window#1', 'house/window#3', 'furniture/blinds#1', 'house/garage-door'])
    assert.ok(kyoto.has(id), id);
  assert.equal([...kyoto.keys()].filter((k) => k.startsWith('house/lattice-screen#')).length, 3);
  assert.equal([...kyoto.keys()].filter((k) => k.startsWith('house/tatami#')).length, 8);
  // A window is its glass and its frame, and the glass still glows at night after a move.
  const model = build('legacy'),
    window = editGroups(model).get('house/window#2');
  assert.equal(window.parts.length, 2);
  assert.ok(model.windows.includes(window.parts[0]));
  const snapshot = snapshotGroup(window);
  transformGroup(window, snapshot, { pos: [window.pivot[0] + 1, ...window.pivot.slice(1)] });
  assert.ok(model.windows.includes(window.parts[0]), 'still the same pane');
});

test('turning a part about the vertical axis composes with its own rotation', () => {
  for (const rotation of [
    [0, 0.4, 0],
    [Math.PI / 2, 0, 0],
    [0.3, -0.7, 1.1],
    [-0.12, 0, -0.2],
  ])
    for (const turn of [0.5, Math.PI / 2, -2.4]) {
      // Ry(turn) · R as matrices, against the turned Euler angles.
      const expected = modelMatrix([0, 0, 0], [1, 1, 1], [0, turn, 0]),
        own = modelMatrix([0, 0, 0], [1, 1, 1], rotation),
        product = new Array(16).fill(0);
      for (let c = 0; c < 4; c++)
        for (let r = 0; r < 4; r++)
          for (let k = 0; k < 4; k++) product[c * 4 + r] += expected[k * 4 + r] * own[c * 4 + k];
      near(
        [...modelMatrix([0, 0, 0], [1, 1, 1], turnRotation(rotation, turn))],
        product,
        `${rotation} turned ${turn}`,
      );
    }
});

test('moving a group moves its parts and colliders together about its base centre', () => {
  const model = build('legacy'),
    sofa = editGroups(model).get('furniture/sofa#1'),
    snapshot = snapshotGroup(sofa),
    [px, py, pz] = sofa.pivot;
  assert.ok(sofa.colliders.length > 0, 'the sofa has its collider');
  transformGroup(sofa, snapshot, { pos: [px + 2, py, pz - 1], turn: 0, scale: 1 });
  sofa.parts.forEach((part, i) =>
    near(
      part.pos,
      [snapshot.parts[i].pos[0] + 2, snapshot.parts[i].pos[1], snapshot.parts[i].pos[2] - 1],
      'moved part',
    ),
  );
  // A quarter turn swaps the collider's width and depth.
  transformGroup(sofa, snapshot, { pos: [px, py, pz], turn: Math.PI / 2, scale: 1 });
  const [c] = sofa.colliders,
    [o] = snapshot.colliders;
  near([c.w, c.d], [o.d, o.w], 'turned collider');
  // Back where it was, exactly.
  transformGroup(sofa, snapshot, { pos: [px, py, pz], turn: 0, scale: 1 });
  sofa.parts.forEach((part, i) => near(part.pos, snapshot.parts[i].pos, 'restored part'));
});

test('stretching a group one way stretches its parts and collider that way only', () => {
  const model = build('legacy'),
    table = editGroups(model).get('furniture/dining-table#1'),
    snapshot = snapshotGroup(table),
    [px, py, pz] = table.pivot;
  transformGroup(table, snapshot, { pos: [px, py, pz], turn: 0, scale: [2, 1, 1] });
  table.parts.forEach((part, i) => {
    const o = snapshot.parts[i];
    near(part.pos, [px + (o.pos[0] - px) * 2, o.pos[1], o.pos[2]], 'part placed');
    // The table's parts are square-on, so only their width doubles.
    if (!o.rotation[0] && !o.rotation[2])
      near(part.size, [o.size[0] * 2, o.size[1], o.size[2]], 'part sized');
  });
  near(
    [table.colliders[0].w, table.colliders[0].d],
    [snapshot.colliders[0].w * 2, snapshot.colliders[0].d],
    'collider',
  );
  // A quarter turn after stretching: the long side now runs north-south.
  transformGroup(table, snapshot, { pos: [px, py, pz], turn: Math.PI / 2, scale: [2, 1, 1] });
  near(
    [table.colliders[0].w, table.colliders[0].d],
    [snapshot.colliders[0].d, snapshot.colliders[0].w * 2],
    'turned',
  );
  // One number means the same every way.
  transformGroup(table, snapshot, { pos: [px, py, pz], turn: 0, scale: 1.5 });
  near(
    table.parts[2].size,
    snapshot.parts[2].size.map((v) => v * 1.5),
    'even',
  );
});

test('a layout moves, removes and adds groups, and reports changes it cannot apply', () => {
  const plain = build('legacy'),
    sofa = editGroups(plain).get('furniture/sofa#1'),
    template = groupTemplate(editGroups(plain).get('garden/tree#1')),
    layout = {
      version: 1,
      locations: {
        legacy: {
          edits: {
            'furniture/sofa#1': {
              pos: [sofa.pivot[0] + 1, sofa.pivot[1], sofa.pivot[2]],
              turn: 0,
              scale: 1,
            },
            'furniture/car#1': { removed: true },
            'garden/nothing-here': { removed: true },
          },
          added: [
            { id: 'added/1', name: 'Tree', pos: [5, 0, 8], turn: 0, scale: 1.2, ...template },
          ],
        },
      },
    };
  const model = applyWorldLayout(build('legacy'), 'legacy', layout),
    groups = editGroups(model);
  assert.ok(Math.abs(groups.get('furniture/sofa#1').pivot[0] - (sofa.pivot[0] + 1)) < 1e-6);
  assert.equal(groups.has('furniture/car#1'), false);
  assert.equal(
    model.colliders.some((c) => c.editGroup === 'furniture/car#1'),
    false,
  );
  assert.ok(groups.has('added/1'));
  near(groups.get('added/1').pivot, [5, 0, 8], 'added tree base');
  assert.ok(
    model.colliders.some((c) => c.editGroup === 'added/1'),
    'the added tree is solid',
  );
  assert.deepEqual(model.layoutWarnings, ['legacy: no "garden/nothing-here" to remove']);
  // Added copies keep how parts look, not what the game does with the original.
  assert.ok(
    groups
      .get('added/1')
      .parts.every((p) => !('prop' in p) && !('vegetation' in p && p.vegetation === undefined)),
  );
});
