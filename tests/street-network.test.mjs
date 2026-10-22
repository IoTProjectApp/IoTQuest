import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  defaultStreetLayout,
  streetLayoutFor,
  buildStreetNetwork,
  pavement,
  roadLine,
  roadDirection,
  LANE_OFFSET,
  LANE_SPACING,
  PAVEMENT_OFFSET,
  ROAD_SIZES,
  ROUNDABOUT,
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

// ---- Road shapes: lanes, curves and roundabouts -----------------------------------------------
const shaped = () => {
  const layout = grid(),
    road = (a, b) => layout.roads.find((r) => (r.a === a && r.b === b) || (r.a === b && r.b === a));
  road('2:1', '3:1').lanes = 2;
  road('4:1', '5:1').lanes = 2;
  road('3:-1', '4:-1').bend = { x: 120, z: -104 };
  road('4:2', '4:3').bend = { x: 154, z: 72 };
  layout.junctions.find((j) => j.id === '4:1').control = 'roundabout';
  layout.junctions.find((j) => j.id === '2:3').control = 'roundabout';
  return layout;
};

test('a layout without the new fields builds exactly as before', () => {
  // Hashes of the grid's network, taken before lanes, curves and roundabouts existed.
  const hash = (layout, handedness) => {
    const { roads, walks, junctions, crossings } = build(layout, handedness);
    return createHash('sha256')
      .update(
        JSON.stringify(
          [roads, walks, junctions, crossings.map((c) => [c.id, c.a, c.b, c.signal])],
          (k, x) =>
            x instanceof Set ? [...x] : typeof x === 'number' ? Math.round(x * 1e6) / 1e6 : x,
        ),
      )
      .digest('hex')
      .slice(0, 12);
  };
  assert.equal(hash(grid(), 1), '7502d148ef34');
  assert.equal(hash(grid(), -1), '9050ad1a7116');
});

test('a road with two lanes each way gets a second lane outside the first, and wider corners', () => {
  const layout = grid();
  layout.roads.find((r) => r.a === '2:1' && r.b === '3:1').lanes = 2;
  const { roads, walks } = build(layout, 1);
  const one = roads.nodes['2:1>3:1:out'],
    two = roads.nodes['2:1>3:1:out:2'];
  // Eastbound in right-hand traffic: south of the centre line (z = 0), 3.2 m further out.
  assert.equal(one.z, LANE_OFFSET);
  assert.equal(two.z, LANE_OFFSET + LANE_SPACING);
  assert.ok(roads.edges['2:1>3:1:out:2'].some((e) => e.to === '2:1>3:1:in:2'));
  // Both lanes turn into every road out of the junction.
  for (const lane of ['2:1>3:1:in', '2:1>3:1:in:2'])
    assert.ok(roads.edges[lane].some((e) => e.to === '3:1>3:2:out'));
  // The corners beside the wide road are as far out as its pavement.
  assert.equal(walks.nodes['3:1/-1/1'].z, ROAD_SIZES[2].pavement);
  assert.equal(walks.nodes['3:1/-1/1'].x, 96 - PAVEMENT_OFFSET);
  assert.ok(roads.route('2:1>3:1:out:2', '3:1>4:1:in').length, 'the outer lane drives on');
});

test('a curved road bends its lanes and pavements through the bend point', () => {
  const layout = grid();
  const road = layout.roads.find((r) => r.a === '3:-1' && r.b === '4:-1');
  road.bend = { x: 120, z: -104 };
  const a = { x: 96, z: -96 },
    b = { x: 144, z: -96 },
    line = roadLine(a, b, road);
  // The centre line passes through the bend, halfway along.
  assert.deepEqual(line[12], { x: 120, z: -104 });
  const { roads, walks } = build(layout, 1),
    lane = roads.edges['3:-1>4:-1:out'].find((e) => e.to === '3:-1>4:-1:in');
  assert.ok(lane.points.length > 10, 'the lane follows the curve');
  // Halfway along, the eastbound lane is LANE_OFFSET to the right (south) of the bend.
  const middle = lane.points.reduce((best, p) =>
    Math.abs(p.x - 120) < Math.abs(best.x - 120) ? p : best,
  );
  assert.ok(Math.abs(middle.z - (-104 + LANE_OFFSET)) < 0.3, `lane at ${middle.z}`);
  // The road leaves its junctions along the curve, not straight at the other end.
  const [dx, dz] = roadDirection(a, b, road);
  assert.ok(dz < -0.2 && dx > 0.7, `leaves along ${dx}, ${dz}`);
  const pavement = Object.values(walks.edges)
    .flat()
    .find((e) => e.points.length > 2);
  assert.ok(pavement, 'the pavements follow the curve too');
  assert.ok(roads.route('2:-1>3:-1:out', '4:-1>5:-1:in').length, 'cars drive along it');
});

test('a roundabout takes traffic round its island, anticlockwise on the right, clockwise on the left', () => {
  const layout = grid();
  layout.junctions.find((j) => j.id === '4:1').control = 'roundabout';
  for (const [handedness, north] of [
    [1, true],
    [-1, false],
  ]) {
    const { roads, junctions } = build(layout, handedness),
      j = junctions.find((j) => j.id === '4:1');
    assert.equal(j.signal, false);
    assert.equal(j.roundabout, true);
    assert.equal(j.priority, 'giveway');
    // Straight through from the east to the west: round the north side on the right, south on
    // the left; never through the island.
    const through = roads.edges['5:1>4:1:in'].find((e) => e.to === '4:1>3:1:out');
    const middle = through.points[Math.floor(through.points.length / 2)];
    assert.equal(middle.z < j.z, north);
    for (const p of through.points.slice(1, -1))
      assert.ok(Math.hypot(p.x - j.x, p.z - j.z) >= ROUNDABOUT.island + 1, 'clear of the island');
  }
});

test('traffic keeps flowing over wide roads, curves and roundabouts', () => {
  for (const iso of ['AUS', 'JPN']) {
    const sim = new CommunitySimulation({ id: 'test', iso }, shaped());
    const used = { second: false, round: false, curve: false };
    // A car sent along the curve, and on through the roundabout's neighbour, gets there.
    const car = sim.addVehicle('3:-1>4:-1:out', '4:-1>5:-1:in');
    for (let t = 0; t < 400; t += 0.1) {
      sim.step(0.1);
      for (const v of sim.vehicles) {
        assert.ok(Number.isFinite(v.x) && Number.isFinite(v.z), 'vehicle placed');
        const edge = v.route[v.index];
        if (edge?.from?.endsWith(':2')) used.second = true;
        if (sim.map.junctions.find((j) => j.id === edge?.junction)?.roundabout) used.round = true;
        if (edge?.points?.length > 2 && !edge.junction) used.curve = true;
      }
    }
    assert.deepEqual(used, { second: true, round: true, curve: true });
    assert.ok(!sim.vehicles.includes(car), 'the car on the curve finished its trip');
    const before = sim.sequence;
    sim.advance(120);
    assert.ok(sim.sequence > before, 'new trips keep starting');
    assert.ok(
      sim.vehicles.some((v) => v.speed > 1),
      'cars are moving',
    );
  }
});
