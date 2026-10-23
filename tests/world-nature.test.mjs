import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { buildWorldModel } from '../public/world3d.js';
import { applyWorldLayout, editGroups } from '../public/world-layout.js';
import { updateLandscape } from '../public/landscape.js';
import {
  applyNature,
  removeNature,
  hasNature,
  checkNature,
  paintArea,
  cellKey,
  HEIGHT_CELL,
  PAINT_CELL,
} from '../public/world-nature.js';
import {
  registerGeometry,
  retireGeometry,
  retiredGeometry,
  geometry,
} from '../public/world-geometry.js';
import { WorldSession } from '../editor/workspaces/map-editor/session.js';

// Everything drawn and walked into, for comparing worlds.
function worldHash(model) {
  const h = createHash('sha256'),
    r = (k, v) => (typeof v === 'number' ? Math.round(v * 1e5) / 1e5 : v);
  for (const o of model.objects)
    h.update(JSON.stringify([o.shape, o.pos, o.size, o.color, o.rotation, o.opacity], r));
  for (const c of model.colliders) h.update(JSON.stringify([c.x, c.z, c.w, c.d], r));
  return h.digest('hex');
}
// A round hill on open land west of the town (nothing is built there), `top` metres high.
function hill(cx, cz, radius, top) {
  const height = {};
  for (
    let i = Math.floor((cx - radius) / HEIGHT_CELL);
    i <= Math.ceil((cx + radius) / HEIGHT_CELL);
    i++
  )
    for (
      let j = Math.floor((cz - radius) / HEIGHT_CELL);
      j <= Math.ceil((cz + radius) / HEIGHT_CELL);
      j++
    ) {
      const d = Math.hypot(i * HEIGHT_CELL - cx, j * HEIGHT_CELL - cz);
      if (d < radius)
        height[cellKey(i, j)] = +(top * Math.cos((d / radius) * (Math.PI / 2))).toFixed(2);
    }
  return height;
}
// A painted disc on the paint grid.
function disc(cx, cz, radius) {
  const field = {};
  for (
    let i = Math.floor((cx - radius - 1) / PAINT_CELL);
    i <= Math.ceil((cx + radius + 1) / PAINT_CELL);
    i++
  )
    for (
      let j = Math.floor((cz - radius - 1) / PAINT_CELL);
      j <= Math.ceil((cz + radius + 1) / PAINT_CELL);
      j++
    ) {
      const w = Math.min(
        1,
        Math.max(0, radius + 0.5 - Math.hypot(i * PAINT_CELL - cx, j * PAINT_CELL - cz)),
      );
      if (w >= 0.05) field[cellKey(i, j)] = Math.round(w * 20) / 20;
    }
  return field;
}

test('with no nature saved every city builds exactly as before', () => {
  for (const id of ['legacy', 'kyoto', 'footscray']) {
    const plain = buildWorldModel(id),
      again = buildWorldModel(id);
    assert.equal(applyNature(again, {}).length, 0);
    assert.equal(applyNature(again, { trees: [], water: [], height: {} }).length, 0);
    assert.equal(worldHash(again), worldHash(plain), id);
    assert.equal(again.natureState, undefined);
  }
  assert.equal(hasNature(null), false);
  assert.equal(hasNature({ paint: { dirt: {} } }), false);
  assert.equal(hasNature({ trees: [['eucalypt', 1, 2, 1]] }), true);
});

test('hills rise on open land, but never under the house, roads or anything placed', () => {
  const model = buildWorldModel('legacy'),
    before = worldHash(model),
    houseFloor = model.floorHeight(-5, -6);
  const height = { ...hill(-90, 0, 14, 6), [cellKey(-3, -3)]: 4, [cellKey(12, -12)]: 4 };
  applyNature(model, { height });
  // The hill top lifts whatever stands there; the house floor and a road stay as built.
  assert.ok(model.floorHeight(-90, 0) > 5, 'the hill top is about 6 m up');
  assert.equal(model.floorHeight(-5, -6), houseFloor);
  assert.equal(model.natureLift(-6, -6), 0);
  assert.equal(model.natureLift(24, -24), 0, 'a road stays flat');
  // Its ground is drawn as one surface, with rock laid over the steepest slopes.
  const hills = model.objects.filter((o) => o.terrainFeature === 'hill');
  assert.equal(hills.length, 1);
  assert.match(hills[0].shape, /^custom:/);
  assert.equal(hills[0].emission, -1, 'hills keep the ground shade');
  // Taking it away puts every part of the world back.
  removeNature(model);
  assert.equal(worldHash(model), before);
  assert.equal(model.floorHeight(-90, 0), 0);
});

test('landscape scenery and planted trees stand on the hills', () => {
  const model = buildWorldModel('legacy'),
    groups = editGroups(model),
    tree = groups.get('landscape/tree#2'),
    [x, , z] = tree.parts[0].pos,
    y = tree.parts.map((p) => p.pos[1]);
  applyNature(model, {
    height: hill(x, z, 12, 5),
    trees: [['conifer', x + 6, z, 1.2]],
  });
  const by = model.natureLift(x, z);
  assert.ok(by > 3);
  tree.parts.forEach((p, i) =>
    assert.ok(Math.abs(p.pos[1] - y[i] - by) < 1e-9, 'the whole tree rises together'),
  );
  const planted = model.objects.filter((o) => o.natureTree === 0);
  assert.ok(planted.length > 3);
  const trunk = planted[0];
  assert.ok(
    Math.abs(trunk.pos[1] - trunk.size[1] / 2 - model.natureLift(x + 6, z)) < 0.05,
    'its trunk stands on the ground',
  );
  assert.ok(
    model.colliders.some((c) => c.natureTree === 0),
    'its trunk is in the way',
  );
  removeNature(model);
  tree.parts.forEach((p, i) => assert.equal(p.pos[1], y[i]));
});

test('ponds, streams and pools: water, banks, edges people cannot walk through, and a level', () => {
  const model = buildWorldModel('legacy'),
    inside = (x, z) =>
      model.colliders.some(
        (c) => c.natureWater && Math.abs(c.x - x) < c.w / 2 && Math.abs(c.z - z) < c.d / 2,
      );
  applyNature(model, {
    water: [
      {
        kind: 'pond',
        pts: [
          [-70, 40],
          [-62, 38],
          [-60, 46],
          [-68, 49],
        ],
      },
      {
        kind: 'stream',
        pts: [
          [-90, 20],
          [-84, 26],
          [-78, 30],
        ],
        width: 2,
      },
      {
        kind: 'pool',
        pts: [
          [-100, 60],
          [-94, 64],
        ],
        level: 0.3,
      },
      {
        kind: 'pond',
        pts: [
          [-110, 0],
          [-104, 0],
          [-106, 5],
        ],
        walk: true,
      },
    ],
  });
  assert.ok(inside(-65, 42.5), 'the middle of the pond');
  assert.ok(!inside(-75, 43), 'beside the pond');
  assert.ok(inside(-84, 26), 'in the stream');
  assert.ok(inside(-97, 62), 'in the pool');
  assert.ok(!inside(-106, 2), 'a pond people may wade into');
  const pool = model.objects.find(
    (o) => o.natureWater && o.shape === 'box' && o.surface === 'water',
  );
  assert.ok(Math.abs(pool.pos[1] + pool.size[1] / 2 - 0.3) < 1e-9, 'the pool fills to its level');
  const water = model.objects.filter((o) => o.natureWater && o.surface === 'water');
  assert.equal(water.length, 4);
});

test('painted ground follows its weights with a smooth edge, and long grass grows in it', () => {
  const field = disc(0, 0, 4),
    { p } = paintArea(field, () => 0.1, null);
  let area = 0;
  for (let k = 0; k < p.length; k += 9) {
    const [ax, , az, bx, , bz, cx, , cz] = p.slice(k, k + 9);
    area += Math.abs((bx - ax) * (cz - az) - (cx - ax) * (bz - az)) / 2;
  }
  // About the area of a 4 m disc (its edge at weight one half, on a half-metre grid).
  assert.ok(Math.abs(area - Math.PI * 16) / (Math.PI * 16) < 0.08, `area ${area.toFixed(1)}`);
  const model = buildWorldModel('legacy');
  applyNature(model, {
    paint: { dirt: disc(-80, 10, 3) },
    grass: disc(-80, 30, 3),
    flowers: disc(-80, 30, 1.5),
    lawn: { height: 0.6, colour: '#6f9a52', density: 4 },
  });
  assert.ok(model.objects.some((o) => o.paint === 'dirt' && o.surface === 'soil'));
  const blades = model.objects.filter((o) => o.terrainFeature === 'long-grass'),
    heads = model.objects.filter((o) => o.terrainFeature === 'flowers');
  assert.equal(blades.length, 3, 'long grass in three shades');
  assert.ok(heads.length >= 1);
  assert.ok(
    blades.every((b) => b.size[1] <= 1.0 && b.size[1] > 0.3),
    'blades about as tall as asked',
  );
});

test('saved nature is checked, and the game leaves out what it cannot take', () => {
  assert.deepEqual(
    checkNature({
      trees: [['eucalypt', 0, 0, 1]],
      water: [
        {
          kind: 'pond',
          pts: [
            [0, 0],
            [1, 0],
            [1, 1],
          ],
        },
      ],
    }),
    [],
  );
  assert.equal(checkNature({ height: { '0,0': 99 } }).length, 1);
  assert.equal(checkNature({ paint: { lava: {} } }).length, 1);
  assert.equal(checkNature({ trees: [['cactus', 0, 0, 1]] }).length, 1);
  assert.equal(checkNature({ water: [{ kind: 'pond', pts: [[0, 0]] }] }).length, 1);
  const model = buildWorldModel('legacy');
  applyWorldLayout(model, 'legacy', {
    version: 1,
    locations: {
      legacy: {
        edits: {},
        added: [],
        nature: {
          trees: [
            ['cactus', 0, 0, 1],
            ['palm', -80, 0, 1],
          ],
        },
      },
    },
  });
  assert.ok(model.layoutWarnings.some((w) => /nature: tree 1 left out/.test(w)));
  assert.ok(
    model.objects.some((o) => o.natureTree === 1),
    'the good tree is planted',
  );
});

test('the lake, the river and the forest are edit groups, and the river flows where it is moved', () => {
  const model = buildWorldModel('legacy'),
    groups = editGroups(model);
  assert.ok(groups.has('landscape/lake'));
  assert.ok(groups.has('landscape/river'));
  assert.equal([...groups.keys()].filter((id) => id.startsWith('landscape/tree#')).length, 18);
  const river = model.landscape.waters.find((w) => w.flow);
  river.mesh.pos[0] += 30;
  updateLandscape(model, { light: 70, wind: 0 }, 0.05);
  assert.ok(
    Math.abs(river.flow.pos[0] - river.mesh.pos[0]) < river.length,
    'its ripples run along it',
  );
});

test('run-time shapes are kept as unit shapes and let go of when replaced', () => {
  const { key, pos, size } = registerGeometry(
    [0, 0, 0, 4, 0, 0, 0, 2, 6],
    [0, 1, 0, 0, 1, 0, 0, 1, 0],
  );
  assert.deepEqual(pos, [2, 1, 3]);
  assert.deepEqual(size, [4, 2, 6]);
  const g = geometry(key);
  assert.ok([...g.positions].every((v) => v >= -0.5 && v <= 0.5));
  assert.deepEqual([...g.normals.slice(0, 3)], [0, 2, 0], 'normals times the size');
  retireGeometry(key);
  assert.equal(retiredGeometry().at(-1), key);
});

test('the Map Editor changes nature with undo, and saves it as the game reads it', () => {
  const s = new WorldSession('legacy');
  assert.equal(s.saved(), null);
  s.editNature('Raise ground', (nature) => (nature.height = hill(-90, 0, 10, 4)));
  s.editNature('Plant a tree', (nature) => (nature.trees = [['eucalypt', -90, 0, 1]]));
  assert.equal(s.undoStack.length, 2);
  assert.ok(s.model.natureLift(-90, 0) > 3);
  assert.ok(s.model.objects.some((o) => o.natureTree === 0));
  // A change with problems is refused and leaves nothing behind.
  assert.equal(s.editNature('Bad', (nature) => (nature.trees = [['cactus', 0, 0, 1]])).length, 1);
  assert.equal(s.changes.nature.trees[0][0], 'eucalypt');
  const saved = s.saved();
  assert.deepEqual(Object.keys(saved), ['edits', 'added', 'nature']);
  // The game builds the same from the saved layout.
  const model = buildWorldModel('legacy');
  applyWorldLayout(model, 'legacy', { version: 1, locations: { legacy: saved } });
  assert.equal(model.natureLift(-90, 0), s.model.natureLift(-90, 0));
  assert.ok(s.changeList().some((c) => c.id === 'nature:height'));
  s.resetNature('nature:height');
  assert.equal(s.model.natureLift(-90, 0), 0);
  s.undo();
  s.undo();
  s.undo();
  assert.equal(s.saved(), null, 'undone back to nothing');
  assert.equal(s.model.objects.filter((o) => o.nature).length, 0);
});
