// The Street Editor workspace's model (editor/workspaces/street-editor/session.js), and what the
// game does with the layouts it saves: signal phases, stop and give-way junctions, angled drawing.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  StreetSession,
  segmentHitsBox,
  crossingPoint,
} from '../editor/workspaces/street-editor/session.js';
import {
  defaultStreetLayout,
  buildStreetNetwork,
  armPhases,
  LOCKED,
} from '../public/street-network.js';
import { CommunitySimulation, Network } from '../public/community-sim.js';
import { createRegionalModel } from '../public/regions.js';
import { addCommunityWorld } from '../public/community-world.js';

const empty = { version: 1, town: null, locations: {} };
const eastLoop = (s) => {
  // A new junction east of the town, joined to two edge junctions: no dead end, no lots crossed.
  s.drawRoad({ x: 250, z: 70 }, { junction: '5:2' });
  const id = s.layout.junctions.at(-1).id;
  s.drawRoad({ junction: id }, { junction: '5:3' });
  return id;
};

test('the original grid has no problems, for either driving side', () => {
  for (const iso of ['AUS', 'MAR']) {
    const s = new StreetSession(empty, 'town', { iso });
    assert.deepEqual(s.problems, [], iso);
    assert.equal(s.isChanged(), false);
    assert.deepEqual(s.savedWith(), empty, 'nothing to save');
  }
});

test('drawing a road from open ground adds its junction, in one undoable step', () => {
  const s = new StreetSession(empty);
  const id = eastLoop(s);
  assert.equal(id, 'n1');
  assert.deepEqual(s.junction('n1'), { id: 'n1', x: 250, z: 70 });
  assert.ok(s.hasRoad('n1', '5:2') && s.hasRoad('n1', '5:3'));
  assert.deepEqual(s.problems, []);
  assert.equal(s.undoStack.length, 2);
  s.undo();
  s.undo();
  assert.equal(s.junction('n1'), undefined);
  assert.equal(s.isChanged(), false);
});

test('a road drawn onto the middle of another road joins it with a new junction', () => {
  const s = new StreetSession(empty);
  const end = s.drawRoad({ x: 230, z: -100 }, { road: ['5:0', '5:1'], x: 192, z: -24 });
  assert.ok(end);
  assert.equal(s.hasRoad('5:0', '5:1'), false, 'the road was divided');
  assert.ok(s.hasRoad('5:0', end) && s.hasRoad(end, '5:1'));
});

test('locked junctions and roads stay, with their reasons', () => {
  const s = new StreetSession(empty);
  for (const id of Object.keys(LOCKED.junctions)) {
    assert.equal(s.moveJunction(id, 0, 0), false, `${id} cannot move`);
    assert.equal(s.removeJunction(id), false, `${id} cannot be removed`);
    assert.ok(s.lockedJunction(id));
  }
  assert.equal(s.removeRoad('1:2', '2:2'), false);
  assert.equal(s.removeRoad('2:2', '1:2'), false, 'either way round');
  assert.equal(s.setControl('1:1', 'stop'), false, "students' junction keeps its signals");
  assert.equal(s.undoStack.length, 0);
});

test('the checks find roads through lots, crossings without junctions, dead ends and short roads', () => {
  const s = new StreetSession(empty);
  s.moveJunction('4:1', 154, -14);
  assert.ok(
    s.errors.some((p) => /runs through/.test(p.message)),
    'road through a lot',
  );
  s.undo();
  s.removeRoad('4:1', '5:1');
  s.removeRoad('4:0', '4:1');
  s.removeRoad('4:1', '4:2');
  assert.ok(s.errors.some((p) => /4:1 is a dead end/.test(p.message)));
  s.undo();
  s.undo();
  s.undo();
  // A road straight across the town's east edge, over 5:1–5:2 without meeting it.
  s.drawRoad({ x: 230, z: 20 }, { x: 160, z: 30 });
  assert.ok(s.errors.some((p) => /cross without a junction/.test(p.message)));
  const t = new StreetSession(empty);
  t.drawRoad({ x: 250, z: 70 }, { junction: '5:2' });
  t.drawRoad({ x: 260, z: 80 }, { junction: 'n1' });
  assert.ok(
    t.errors.some((p) => /at least 28 m/.test(p.message)),
    'short road',
  );
});

test('controls and crossings are recorded on the junction and change the town', () => {
  const s = new StreetSession(empty);
  s.setControl('3:3', 'stop');
  s.toggleCrossing('2:2', '3:2');
  assert.equal(s.junction('3:3').control, 'stop');
  assert.deepEqual(s.junction('2:2').closedCrossings, ['3:2']);
  assert.equal(s.map.junctions.find((j) => j.id === '3:3').priority, 'stop');
  assert.equal(s.map.crossings.filter((c) => c.junction === '2:2').length, 3);
  s.toggleCrossing('2:2', '3:2');
  assert.equal(s.junction('2:2').closedCrossings, undefined);
  s.setControl('3:3', null);
  assert.equal(s.junction('3:3').control, undefined);
});

test('a city layout starts from the shared town and saves only when it differs', () => {
  const town = new StreetSession(empty);
  eastLoop(town);
  const saved = town.savedWith();
  assert.equal(saved.town.junctions.length, 31);
  // Opening the town again shows what was saved.
  assert.ok(new StreetSession(saved, 'town').junction('n1'), 'the saved town reopens as saved');
  const kyoto = new StreetSession(saved, 'kyoto');
  assert.ok(kyoto.junction('n1'), "Kyoto starts from the town's layout");
  assert.deepEqual(kyoto.savedWith().locations, {}, 'nothing of its own yet');
  kyoto.setControl('3:3', 'giveway');
  assert.equal(
    kyoto.savedWith().locations.kyoto.junctions.find((j) => j.id === '3:3').control,
    'giveway',
  );
  kyoto.resetToInherited();
  assert.deepEqual(kyoto.savedWith().locations, {});
});

test('geometry helpers: a segment through a box, and two segments crossing', () => {
  const box = { x: 0, z: 0, w: 10, d: 10 };
  assert.ok(segmentHitsBox({ x: -20, z: 0 }, { x: 20, z: 0 }, box, 0));
  assert.equal(segmentHitsBox({ x: -20, z: 8 }, { x: 20, z: 8 }, box, 2), false);
  assert.ok(segmentHitsBox({ x: -20, z: 8 }, { x: 20, z: 8 }, box, 4));
  assert.deepEqual(
    crossingPoint({ x: 0, z: 0 }, { x: 10, z: 10 }, { x: 0, z: 10 }, { x: 10, z: 0 }),
    { x: 5, z: 5 },
  );
  assert.equal(
    crossingPoint({ x: 0, z: 0 }, { x: 10, z: 0 }, { x: 10, z: 0 }, { x: 10, z: 10 }),
    null,
    'meeting at an end',
  );
});

test('an angled road at a signalled junction gets the phase opposite its partner, not its compass axis', () => {
  // Four arms at a junction: east, west, south and one coming in from the north-east at 30°.
  const arms = [
    { to: 'e', dir: [1, 0] },
    { to: 'w', dir: [-1, 0] },
    { to: 's', dir: [0, 1] },
    { to: 'ne', dir: [Math.cos(-Math.PI / 6), Math.sin(-Math.PI / 6)] },
  ];
  // By compass the north-east arm would be EW, with east and west: three arms on one green.
  const phases = armPhases(arms, true);
  assert.equal(phases.e, 'EW');
  assert.equal(phases.w, 'EW');
  assert.equal(phases.ne, 'NS');
  assert.equal(phases.s, 'NS');
  // Without signals the phase does not matter and stays by compass.
  assert.equal(armPhases(arms, false).ne, 'EW');
});

test('at a stop junction every car halts at the line before going through', () => {
  const layout = defaultStreetLayout();
  layout.junctions.find((j) => j.id === '3:1').control = 'stop';
  const sim = new CommunitySimulation({ id: 'test', iso: 'AUS' }, layout);
  sim.density = 0;
  sim.pedestrianDensity = 0;
  const car = sim.addVehicle('2:1>3:1:out', '3:1>4:1:in');
  let stoppedAtLine = false,
    through = false;
  for (let t = 0; t < 60 && !through; t += 0.05) {
    sim.step(0.05);
    const edge = car.route[car.index];
    if (edge?.approach === '3:1' && edge.length - car.progress < 1.5 && car.speed < 0.1)
      stoppedAtLine = true;
    if (!sim.vehicles.includes(car) || edge?.from?.startsWith('3:1>')) through = true;
  }
  assert.ok(stoppedAtLine, 'the car stopped at the line');
  assert.ok(through, 'and then went through');
});

test('cars meeting at a give-way junction go one at a time and nobody gets stuck', () => {
  const layout = defaultStreetLayout();
  for (const j of layout.junctions)
    if (!['1:1', '1:2', '2:2'].includes(j.id)) j.control = 'giveway';
  const sim = new CommunitySimulation({ id: 'test', iso: 'AUS' }, layout);
  sim.advance(240);
  // Traffic still flows: vehicles keep finishing trips and new ones keep coming.
  const before = sim.sequence;
  sim.advance(120);
  assert.ok(sim.sequence > before, 'new trips started');
  assert.ok(
    sim.vehicles.some((v) => v.speed > 1),
    'cars are moving',
  );
});

test('the town draws an angled road turned along its length, and the grid unturned', () => {
  const layout = defaultStreetLayout();
  layout.junctions.push({ id: 'n1', x: 250, z: 70 });
  layout.roads.push({ a: '5:2', b: 'n1' }, { a: 'n1', b: '5:3' });
  const model = createRegionalModel('legacy');
  addCommunityWorld(model, undefined, { streets: layout });
  const asphalt = model.objects.filter(
    (m) => m.community && m.color === '#414950' && m.shape === 'box' && m.size[1] === 0.05,
  );
  const turned = asphalt.filter((m) => m.rotation[1] !== 0);
  assert.equal(turned.length, 2, 'the two new angled roads');
  for (const m of turned) assert.equal(m.size[2], 12, 'twelve metres of asphalt across');
  // Traffic lights at 5:2 face up every lane into it, the angled one included.
  const heads = model.community.signals.filter((h) => h.junction === '5:2');
  assert.equal(heads.length, 4);
  assert.ok(heads.some((h) => Math.abs(h.facing[0]) > 0.1 && Math.abs(h.facing[1]) > 0.1));
});

test('a network of only roads at angles still builds corners, crossings and turns', () => {
  const layout = {
    junctions: [
      { id: 'a', x: 0, z: 0 },
      { id: 'b', x: 60, z: 25 },
      { id: 'c', x: 20, z: 70 },
      { id: 'd', x: -40, z: 40 },
    ],
    roads: [
      { a: 'a', b: 'b' },
      { a: 'b', b: 'c' },
      { a: 'c', b: 'd' },
      { a: 'd', b: 'a' },
      { a: 'a', b: 'c' },
    ],
  };
  const roads = new Network(),
    walks = new Network(),
    built = buildStreetNetwork(layout, { roads, walks, handedness: 1 });
  assert.equal(built.crossings.length, 16);
  for (const j of layout.junctions)
    assert.ok(Object.keys(walks.nodes).filter((id) => id.startsWith(j.id + '/')).length >= 4);
  assert.ok(roads.route('a>b:out', 'c>d:in').length > 0, 'cars can drive round');
  assert.ok(
    walks.route(Object.keys(walks.nodes)[0], Object.keys(walks.nodes).at(-1)).length > 0,
    'people can walk round',
  );
});
