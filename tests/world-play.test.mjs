import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { WorldBuilderSession } from '../editor/workspaces/world-builder/session.js';
import {
  WORLDS,
  savedWorlds,
  worldById,
  worldSummaries,
  worldUrl,
} from '../public/custom-worlds.js';
import {
  buildWorldScene,
  prepareWorldScene,
  checkWorldProgram,
  starterCode,
  worldScenarios,
  walkStep,
  startPosition,
  nearestUsable,
  motionSeen,
  stepWorldSim,
  worldAgents,
  WALK_LIMIT,
} from '../public/world-builder/world.js';

// A small world built with the World Builder's own session.
function street() {
  const s = new WorldBuilderSession();
  s.renameWorld('Test Street');
  s.addObject('building/house', { pos: [10, 0, -6] });
  s.addObject('iot/ldr', { pos: [2, 0, 6] });
  s.addObject('iot/led', { pos: [3, 0, 6] });
  s.addObject('iot/pir', { pos: [-4, 0, 8] });
  s.addObject('iot/button', { pos: [-2, 0, 10] });
  s.addObject('modular/gate', { pos: [6, 0, 10] });
  s.addObject('infra/vehicle-car', { pos: [0, 0, -20] });
  s.addRoad({
    points: [
      { x: -40, z: -20 },
      { x: 40, z: -20 },
    ],
  });
  s.world.iot.code.cpp = s.generateStarterCode('cpp');
  return s;
}

test('with no worlds saved, the game lists none and adds nothing', async () => {
  assert.deepEqual(WORLDS.worlds, []);
  assert.deepEqual(savedWorlds(), []);
  assert.deepEqual(worldSummaries(), []);
  const game = await readFile(new URL('../public/game.js', import.meta.url), 'utf8');
  // The button is made only when there are worlds; game.html itself is unchanged.
  assert.match(
    game,
    /const worlds = worldSummaries\(\);\s+if \(!worlds\.length \|\| !\$\('resumeLegacy'\)\) return;/,
  );
  const html = await readFile(new URL('../public/game.html', import.meta.url), 'utf8');
  assert.doesNotMatch(html, /customWorlds|world\.html/);
});

test('saved worlds are listed, checked and filled in, and the saved data is left alone', () => {
  const s = street(),
    data = s.toStoreData();
  data.worlds.push({ id: '../../bad', name: 'Bad' }, { id: 'half', name: '<b>Half</b>' });
  const before = JSON.stringify(data);
  const list = savedWorlds(data);
  assert.deepEqual(
    list.map((w) => w.id),
    ['starter-world', 'half'],
  );
  assert.equal(JSON.stringify(data), before);
  // A world with only an id gets what it needs to be played.
  const half = worldById('half', data);
  assert.equal(half.name, '<b>Half</b>');
  assert.deepEqual(half.objects, []);
  assert.ok(half.terrain && half.environment && half.iot.code.cpp);
  assert.deepEqual(worldSummaries(data)[0], {
    id: 'starter-world',
    name: 'Test Street',
    objects: 7,
    sensors: 3,
    outputs: 1,
  });
  assert.equal(worldUrl('starter-world'), 'world.html?id=starter-world');
  assert.equal(worldUrl('a b', { editorPlay: true }), 'world.html?id=a%20b&editor-play=1');
});

test("the game draws a world with the World Builder's own scene, in Play Mode too", () => {
  const s = street();
  s.setEnvironment({ sunlight: 5 });
  s.enterPlayMode();
  for (let i = 0; i < 5; i++) s.stepSimulation(0.2);
  const game = prepareWorldScene(
    buildWorldScene(s.world, { playing: true, outputs: s.simOutputs, agents: s.simAgents }),
  );
  assert.deepEqual(game.objects, s.model.objects);
  assert.deepEqual(game.colliders, s.model.colliders);
  assert.deepEqual(game.lamps, s.model.lamps);
  assert.ok(game.lamps.length, 'the path light is on in the dark');
});

test('the mission: a program must switch each output as the world itself does', () => {
  const w = street().world;
  assert.deepEqual(
    worldScenarios(w).map(([name]) => name),
    [
      'Dark · No motion · Button up',
      'Dark · No motion · Button pressed',
      'Dark · Motion · Button up',
      'Dark · Motion · Button pressed',
      'Bright · No motion · Button up',
      'Bright · No motion · Button pressed',
      'Bright · Motion · Button up',
      'Bright · Motion · Button pressed',
    ],
  );
  for (const language of ['cpp', 'python']) {
    const starter = starterCode(w, language, { worked: false });
    assert.match(starter, /Your program: replace each (false|False)/);
    const fails = checkWorldProgram(w, starter, language);
    assert.equal(fails.pass, false, language + ' starter');
    assert.ok(fails.rows.some((r) => !r.pass));
    assert.equal(checkWorldProgram(w, starterCode(w, language), language).pass, true, language);
  }
  // The world's own program (in its own language) is what counts, even when its other language
  // was never rewritten after the devices were placed.
  w.iot.code.python = '# never written\nwhile True:\n    pass\n';
  assert.equal(checkWorldProgram(w, starterCode(w, 'python'), 'python').pass, true);
  // A program that does not run says why.
  assert.match(checkWorldProgram(w, 'void loop( {', 'cpp').problem, /./);
  // A world without outputs has nothing to check.
  const empty = new WorldBuilderSession().world;
  assert.equal(checkWorldProgram(empty, '', 'cpp').pass, false);
});

test('the technician walks the world: solid objects stop them and the edge holds them in', () => {
  const s = street(),
    w = s.world,
    { colliders } = buildWorldScene(w);
  const start = startPosition(w, colliders);
  assert.ok(
    !colliders.some(
      (c) => Math.abs(start[0] - c.x) < c.w / 2 && Math.abs(start[2] - c.z) < c.d / 2,
    ),
  );
  // Walking east into the house stops at its wall.
  let at = [-2, 0, -6];
  for (let i = 0; i < 100; i++) at = walkStep(w, colliders, at, 0.2, 0);
  assert.ok(at[0] > 3 && at[0] < 10, 'stopped at the wall: ' + at[0]);
  // Sliding: a step into the wall at an angle still moves along it.
  const slid = walkStep(w, colliders, at, 0.2, 0.2);
  assert.ok(slid[2] > at[2] && slid[0] === at[0]);
  at = [0, 0, 0];
  for (let i = 0; i < 400; i++) at = walkStep(w, colliders, at, 0, -0.5);
  assert.equal(at[2], -WALK_LIMIT);
});

test('what the technician can use, and what the motion sensor sees', () => {
  const w = street().world;
  assert.equal(nearestUsable(w, [-2, 0, 11]).kind, 'input');
  assert.equal(nearestUsable(w, [-2, 0, 11]).signal, 'armed');
  assert.equal(nearestUsable(w, [6, 0, 11]).kind, 'door');
  assert.equal(nearestUsable(w, [30, 0, 30]), null);
  assert.equal(motionSeen(w, [-4, 0, 10]), true);
  assert.equal(motionSeen(w, [20, 0, 20]), false);
});

test('a hand-set reading reaches the program, and cars drive the road', () => {
  const s = street(),
    w = s.world;
  // A program that lights the path while the button is held.
  const code =
    'const int b = 14;\nconst int led = 26;\nvoid setup() { pinMode(led, OUTPUT); }\nvoid loop() {\n  if (digitalRead(b) == 1) digitalWrite(led, HIGH); else digitalWrite(led, LOW);\n  delay(200);\n}\n';
  const sim = {
    simEnvironment: { ...w.environment },
    simOutputs: {},
    simAgents: worldAgents(w),
    simTime: 0,
    simLogs: [],
    simError: null,
    runtime: null,
    readings: { armed: 0 },
  };
  return import('../public/runtime.js').then(({ Runtime }) => {
    sim.runtime = new Runtime(code, 'cpp', s.iotDevices(), 'ESP32');
    stepWorldSim(sim, w, 0.2);
    assert.ok(!sim.simOutputs[26]);
    sim.readings.armed = 1;
    stepWorldSim(sim, w, 0.2);
    assert.equal(sim.simOutputs[26], 1);
    const car = sim.simAgents[0].pos.join();
    stepWorldSim(sim, w, 0.2);
    assert.notEqual(sim.simAgents[0].pos.join(), car);
  });
});

test('the world page saves progress per world, and nothing in a play-test', async () => {
  const page = await readFile(new URL('../public/world-play.js', import.meta.url), 'utf8');
  assert.match(page, /'iotquest-worlds-v1'/);
  assert.match(page, /function readJSON\(key\) \{\s+if \(PLAY\) return \{\};/);
  assert.match(
    page,
    /function save\(\) \{\s+if \(PLAY\) return;\s+allProgress\[world\.id\] = progress;/,
  );
  const html = await readFile(new URL('../public/world.html', import.meta.url), 'utf8');
  assert.match(html, /<script type="module" src="\.\/world-play\.js"><\/script>/);
  const builder = await readFile(
    new URL('../editor/workspaces/world-builder/app.js', import.meta.url),
    'utf8',
  );
  assert.match(
    builder,
    /shell\?\.openGame\(fromStart \? null : \{ world: state\.session\?\.activeWorldId \}\)/,
  );
});
