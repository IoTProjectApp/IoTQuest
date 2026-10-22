import test from 'node:test';
import assert from 'node:assert/strict';
import {
  defaultStreetLayout,
  streetLayoutFor,
  buildStreetNetwork,
  pavement,
} from '../public/street-network.js';
import { createCommunity, CommunitySimulation, Network } from '../public/community-sim.js';

const grid = () => defaultStreetLayout();
const build = (layout, handedness = -1) => {
  const roads = new Network(),
    walks = new Network();
  return { roads, walks, ...buildStreetNetwork(layout, { roads, walks, handedness }) };
};
const moved = (layout, id, dx, dz) => {
  const j = layout.junctions.find((j) => j.id === id);
  j.x += dx;
  j.z += dz;
  return layout;
};

test('with no saved changes the town is the original grid', () => {
  const layout = grid();
  assert.equal(layout.junctions.length, 30);
  assert.equal(layout.roads.length, 49);
  assert.deepEqual(streetLayoutFor('kyoto', { version: 1, town: null, locations: {} }), layout);
  // Every junction has four corners and four crossings, as the grid always had.
  const { walks, crossings } = build(layout);
  assert.equal(crossings.length, 120);
  for (const j of layout.junctions)
    for (const sx of [-1, 1])
      for (const sz of [-1, 1]) {
        const corner = walks.nodes[`${j.id}/${sx}/${sz}`];
        assert.deepEqual([corner.x, corner.z], [j.x + sx * 8, j.z + sz * 8]);
      }
});

test("a destination's own layout comes before the shared town's", () => {
  const town = moved(grid(), '3:1', 4, 0),
    own = moved(grid(), '3:1', 0, 6),
    saved = { version: 1, town, locations: { kyoto: own } };
  assert.deepEqual(streetLayoutFor('kyoto', saved), own);
  assert.deepEqual(streetLayoutFor('marrakech', saved), town);
});

test('moving a junction takes its lanes, corners and crossings with it', () => {
  const { roads, walks } = build(moved(grid(), '3:1', 6, -4));
  // The lane arriving from the west now ends 12 m short of the moved junction, still on its side.
  const lane = roads.nodes['2:1>3:1:in'],
    [jx, jz] = [96 + 6, -4];
  assert.ok(Math.abs(Math.hypot(lane.x - jx, lane.z - jz) - Math.hypot(12, 2.2)) < 1e-9);
  for (const id of ['3:1/-1/-1', '3:1/1/1']) {
    const c = walks.nodes[id];
    assert.ok(Math.hypot(c.x - jx, c.z - jz) < 13, `${id} stays at the junction`);
  }
});

test('removing a road removes its lanes but keeps the pavement round the corner', () => {
  const layout = grid();
  layout.roads = layout.roads.filter((r) => !(r.a === '2:1' && r.b === '3:1'));
  const { roads, walks, crossings } = build(layout);
  assert.equal(roads.nodes['2:1>3:1:out'], undefined);
  assert.equal(crossings.length, 120);
  // People can still walk from one side of the closed block to the other.
  assert.ok(walks.route('2:1/1/-1', '3:1/-1/-1').length > 0);
  // Cars route round it.
  assert.ok(roads.route('1:1>2:1:out', '3:1>4:1:in').length > 0);
});

test('an angled road gets lanes along it and turns at both ends', () => {
  const layout = grid();
  layout.junctions.push({ id: 'n1', x: 130, z: 30 });
  layout.roads.push({ a: '3:1', b: 'n1' });
  const { roads, junctions } = build(layout);
  const out = roads.nodes['3:1>n1:out'],
    dir = [130 - 96, 30 - 0].map((v) => v / Math.hypot(34, 30));
  // The lane leaves along the road, offset to the driving side.
  const along = (out.x - 96) * dir[0] + (out.z - 0) * dir[1];
  assert.ok(Math.abs(along - 12) < 1e-9);
  // Turning into it from the west, and out of it again.
  assert.ok(roads.edges['2:1>3:1:in'].some((e) => e.to === '3:1>n1:out' && e.turn));
  assert.ok(roads.edges['n1>3:1:in'].some((e) => e.to === '3:1>4:1:out'));
  // 3:1 now has five ways in; it keeps its signals.
  assert.ok(junctions.find((j) => j.id === '3:1').signal);
});

test("a junction's control can be set: signals, or none", () => {
  const layout = grid();
  layout.junctions.find((j) => j.id === '2:1').control = 'none';
  layout.junctions.find((j) => j.id === '0:0').control = 'signals';
  const { junctions, crossings } = build(layout);
  assert.equal(junctions.find((j) => j.id === '2:1').signal, false);
  assert.ok(crossings.filter((c) => c.junction === '2:1').every((c) => !c.signal));
  assert.equal(junctions.find((j) => j.id === '0:0').signal, true);
});

test('paths to doors join the nearest corner once the one they were designed for has moved', () => {
  const { walks } = build(moved(grid(), '4:3', 10, 10));
  assert.equal(pavement(walks, '4:3/-1/-1'), '4:3/-1/-1');
  const layout = grid();
  layout.junctions = layout.junctions.filter((j) => j.id !== '4:3');
  const without = build(layout).walks;
  // 4:3 is gone; its north-west corner's stand-in is the nearest remaining corner.
  const stand = pavement(without, '4:3/-1/-1');
  assert.ok(stand && !stand.startsWith('4:3'));
  assert.throws(() => pavement(without, 'not-a-corner'));
});

test('the town simulates on an edited layout: traffic and people keep moving', () => {
  const layout = moved(grid(), '3:2', 5, 3);
  layout.roads = layout.roads.filter((r) => !(r.a === '4:1' && r.b === '4:2'));
  layout.junctions.push({ id: 'n1', x: 130, z: 30 });
  layout.roads.push({ a: '3:1', b: 'n1' }, { a: 'n1', b: '4:2' });
  for (const iso of ['AUS', 'MAR']) {
    const sim = new CommunitySimulation({ id: 'test', iso }, layout);
    sim.advance(180);
    assert.ok(sim.vehicles.length > 0, 'vehicles spawn');
    assert.ok(sim.people.length > 0, 'people spawn');
    for (const v of sim.vehicles)
      assert.ok(Number.isFinite(v.x) && Number.isFinite(v.z), 'vehicle placed');
    for (const p of sim.people)
      assert.ok(Number.isFinite(p.x) && Number.isFinite(p.z), 'person placed');
  }
  // And the full town still builds on it, buildings and all.
  const map = createCommunity({ id: 'test', iso: 'AUS' }, layout);
  assert.ok(
    map.buildings.every((b) => map.walks.nodes[b.node]),
    'every building has a way in',
  );
});
