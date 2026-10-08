import test from 'node:test';
import assert from 'node:assert/strict';
import { createBugHunt, scoreBugHunt, testsCatch } from '../public/bug-hunt.js';
import { explainCode, removeExplanations, hasExplanations } from '../public/code-explain.js';
import { missions, defaults, program, baseEnv } from '../public/missions.js';
import { adaptMissions, locationById } from '../public/locations.js';
import { Runtime } from '../public/runtime.js';

const wired = (ids, board) =>
  defaults(ids, board).map((d) => ({
    ...d,
    power: true,
    ground: true,
    resistorConnected: !!d.resistor,
  }));
const missionSets = [
  missions,
  adaptMissions(missions, locationById('kyoto'), 'advanced'),
  adaptMissions(missions, locationById('cusco'), 'beginner'),
];

test('every hunt plants three test-detectable bugs on distinct lines', () => {
  for (const list of missionSets)
    for (const board of ['ESP32', 'Raspberry Pi Pico'])
      for (const language of ['cpp', 'python'])
        for (const m of list)
          for (let seed = 1; seed <= 3; seed++) {
            const devices = wired(m.ids, board),
              hunt = createBugHunt(m, language, devices, board, { seed }),
              label = [m.title, board, language, seed].join(' ');
            assert.equal(hunt.bugs.length, 3, label);
            assert.equal(new Set(hunt.bugs.map((b) => b.line)).size, 3, label);
            assert.equal(testsCatch(m, hunt.original, language, devices, board), false, label);
            const original = hunt.original.split('\n'),
              buggy = hunt.code.split('\n');
            assert.equal(buggy.length, original.length, label);
            for (const bug of hunt.bugs) {
              assert.notEqual(buggy[bug.line - 1], original[bug.line - 1], label);
              const single = [...original];
              single[bug.line - 1] = buggy[bug.line - 1];
              assert.ok(
                testsCatch(m, single.join('\n'), language, devices, board),
                label + ' ' + bug.kind,
              );
              assert.ok(bug.explain && bug.fix, label);
            }
          }
});

test('hunts are reproducible from their seed and vary between seeds', () => {
  const m = missions[2],
    devices = wired(m.ids, 'ESP32'),
    a = createBugHunt(m, 'cpp', devices, 'ESP32', { seed: 4 }),
    b = createBugHunt(m, 'cpp', devices, 'ESP32', { seed: 4 });
  assert.deepEqual(a.bugs, b.bugs);
  const variants = new Set(
    Array.from(
      { length: 8 },
      (_, i) => createBugHunt(m, 'cpp', devices, 'ESP32', { seed: i + 1 }).code,
    ),
  );
  assert.ok(variants.size > 3);
});

test('scoring counts found bugs and lines flagged by mistake', () => {
  const bugs = [{ line: 3 }, { line: 9 }, { line: 14 }];
  assert.deepEqual(scoreBugHunt(bugs, [3, 9, 14]), {
    found: 3,
    total: 3,
    wrong: [],
    perfect: true,
  });
  assert.deepEqual(scoreBugHunt(bugs, [3, 4]), { found: 1, total: 3, wrong: [4], perfect: false });
});

test('explanations round-trip, are idempotent and leave programs runnable', () => {
  for (const board of ['ESP32', 'Raspberry Pi Pico'])
    for (const m of missions)
      for (const language of ['cpp', 'python'])
        for (const example of [false, true]) {
          const devices = wired(m.ids, board),
            source = program(m, language, devices, example),
            explained = explainCode(source, language, devices),
            label = [m.title, board, language, example].join(' ');
          // The starter is comments only: nothing to explain or run.
          if (!example) {
            assert.equal(explained, source, label);
            continue;
          }
          assert.ok(hasExplanations(explained), label);
          assert.equal(removeExplanations(explained), source, label);
          assert.equal(explainCode(explained, language, devices), explained, label);
          const run = (code) =>
            new Runtime(code, language, devices, board).step(baseEnv, 200).outputs;
          assert.deepEqual(run(explained), run(source), label);
        }
});

test('explanations name wired devices, describe conditions and respect student comments', () => {
  const devices = wired(['ldr', 'led'], 'ESP32'),
    cpp = explainCode(program(missions[0], 'cpp', devices, true), 'cpp', devices);
  assert.match(cpp, /\/\/ » lightPin is GPIO 34: the Light sensor pin\nconst int lightPin = 34;/);
  assert.match(
    cpp,
    /\/\/ » Read the Light sensor on GPIO 34 \(0 = dark, 4095 = bright\) into light/,
  );
  assert.match(cpp, /\/\/ » If light is below 1800 \(darker\), run the block below/);
  assert.match(cpp, /\/\/ » HIGH sends 3\.3 V to the Path lights on GPIO 26: ON/);
  const python = explainCode(
    program(missions[1], 'python', wired(['pir', 'led'], 'ESP32'), true),
    'python',
    wired(['pir', 'led'], 'ESP32'),
  );
  assert.match(python, /# » If motion sensor reports movement detected, run the indented block/);
  assert.match(python, /\n {8}# » Turn ON the Path lights on GPIO 26\n {8}output0\.value\(1\)/);
  const mine = 'void loop() {\n  // my note\n  delay(200);\n}';
  assert.equal(explainCode(mine, 'cpp', devices).includes('Pause until'), false);
  assert.match(removeExplanations(explainCode(mine, 'cpp', devices)), /\/\/ my note/);
});
test('explanations are never inserted inside block comments', () => {
  const devices = wired(['ldr', 'led'], 'ESP32'),
    source =
      'void setup() {\n  /* old code:\n  pinMode(26, OUTPUT);\n  */\n  pinMode(26, OUTPUT);\n}\nvoid loop() {}',
    explained = explainCode(source, 'cpp', devices);
  assert.match(explained, /\/\* old code:\n {2}pinMode\(26, OUTPUT\);\n {2}\*\//);
  assert.match(explained, /\/\/ » Make the Path lights on GPIO 26 an output[^\n]*\n {2}pinMode/);
});
