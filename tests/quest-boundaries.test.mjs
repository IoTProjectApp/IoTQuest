import test from 'node:test';
import assert from 'node:assert/strict';
import { missions, program, defaults, baseEnv } from '../public/missions.js';
import { locations, adaptMissions } from '../public/locations.js';
import { Runtime } from '../public/runtime.js';
import { boundaryScenarios } from '../public/quest-boundaries.js';

// Runs a program through scenarios the way the Test button does; returns the failing names.
function failures(quest, code, language, board, scenarios) {
  const devices = defaults(quest.ids, board),
    runtime = new Runtime(code, language, devices, board);
  return scenarios
    .filter(([, env, expected]) => {
      let result;
      for (let i = 0; i < 25; i++) result = runtime.step({ ...baseEnv, ...env });
      const actual = quest.ids
        .map((id) => devices.find((d) => d.id === id))
        .filter((d) => d.output)
        .map((d) => ((result.outputs[d.pin] || 0) > 0 ? 1 : 0));
      return !expected.every((v, i) => v === actual[i]);
    })
    .map(([name]) => name);
}

test('every worked example passes its limit checks at every destination and difficulty', () => {
  for (const location of [undefined, ...locations])
    for (const difficulty of ['beginner', 'advanced'])
      for (const quest of adaptMissions(missions, location, difficulty))
        for (const board of ['ESP32', 'Pico'])
          for (const language of ['cpp', 'python']) {
            const code = program(quest, language, defaults(quest.ids, board), true);
            assert.deepEqual(
              failures(quest, code, language, board, boundaryScenarios(quest, baseEnv)),
              [],
              `${location?.id || 'home'} ${difficulty} ${quest.title} ${board} ${language}`,
            );
          }
});

test('limit checks catch thresholds that are slightly wrong', () => {
  const cases = [
    ['Protect the Water Pump', 'tank > 400 && soil < 3200'],
    ['Protect the Water Pump', 'tank > 400 && soil < 2500'],
    ['Factory Conveyor Safety', null],
  ];
  for (const [title, wrong] of cases) {
    const quest = missions.find((m) => m.title.startsWith(title));
    assert.ok(quest, title);
    const conditions = wrong
      ? [wrong]
      : quest.conditions.map((c) => c.replace(/(\d+(?:\.\d+)?)/, (n) => String(Number(n) - 14)));
    const code = program({ ...quest, conditions }, 'cpp', defaults(quest.ids, 'ESP32'), true);
    assert.deepEqual(failures(quest, code, 'cpp', 'ESP32', quest.scenarios), [], 'old tests pass');
    assert.ok(
      failures(quest, code, 'cpp', 'ESP32', boundaryScenarios(quest, baseEnv)).length,
      `${title}: ${conditions} is caught`,
    );
  }
});

test('limit checks test both sides and the limit itself, in program units', () => {
  const quest = missions.find((m) => m.title === 'Protect the Water Pump'),
    checks = boundaryScenarios(quest, baseEnv),
    tank = checks.filter(([name]) => name.includes('tank'));
  assert.deepEqual(
    tank.map(([name, env, expected]) => [name, Math.round(env.tank * 40.95), expected]),
    [
      ['Limit check: tank just below 400', 399, [0]],
      ['Limit check: tank just above 400', 401, [1]],
    ],
    'The quest already tests exactly 400',
  );
  assert.ok(checks.some(([name]) => name === 'Limit check: soil at 2400'));
});
