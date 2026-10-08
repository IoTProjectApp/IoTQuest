import test from 'node:test';
import assert from 'node:assert/strict';
import {
  missions,
  defaults,
  validate,
  program,
  baseEnv,
  missionBudget,
} from '../public/missions.js';
import { Runtime } from '../public/runtime.js';
import { createLabState, updateResources } from '../public/lab.js';
import { sectionResidents } from '../public/section-residents.js';
import { logicQuests } from '../public/logic-quests.js';
import { componentQuests } from '../public/component-quests.js';

const byTitle = (title) => logicQuests.find((q) => q.title === title);
// Runs `code` through a quest's scenarios and returns each scenario's outputs as 0/1.
function outcomes(m, code, language = 'cpp', board = 'ESP32') {
  const devices = defaults(m.ids, board),
    runtime = new Runtime(code ?? program(m, language, devices, true), language, devices, board),
    outs = m.ids.map((id) => devices.find((d) => d.id === id)).filter((d) => d.output);
  return m.scenarios.map(([, env]) => {
    let result;
    for (let i = 0; i < 25; i++) result = runtime.step({ ...baseEnv, ...env });
    return outs.map((d) => ((result.outputs[d.pin] || 0) > 0 ? 1 : 0));
  });
}

test('logic quests come after the component quests (26–33), keeping earlier numbers', () => {
  const first = missions.indexOf(logicQuests[0]);
  assert.equal(first, 17 + componentQuests.length);
  assert.deepEqual(missions.slice(first), logicQuests);
});

test('each logic quest belongs to a section with a resident', () => {
  for (const q of logicQuests)
    assert.equal(q.resident, sectionResidents.find(([area]) => area === q.area)?.[1], q.title);
});

for (const board of ['ESP32', 'Raspberry Pi Pico'])
  for (const language of ['cpp', 'python'])
    test(`every logic quest is solvable within its budget (${board}, ${language})`, () => {
      for (const m of logicQuests) {
        const devices = defaults(m.ids, board);
        assert.deepEqual(validate(devices, board), [], m.title);
        assert.deepEqual(
          outcomes(m, undefined, language, board),
          m.scenarios.map(([, , expected]) => expected),
          m.title,
        );
        let used = createLabState().resources;
        const runtime = new Runtime(program(m, language, devices, true), language, devices, board);
        for (const [, env] of m.scenarios)
          for (let i = 0; i < 25; i++)
            used = updateResources(
              used,
              devices,
              runtime.step({ ...baseEnv, ...env }).outputs,
              { ...baseEnv, ...env },
              0.2,
            );
        assert.ok(used.wh <= missionBudget(m).wh, m.title + ': budget');
      }
    });

// A common mistake must fail the quest it teaches.
const mistakes = [
  ['Comfort Zone', 'temp > 18 && temp < 24', 'leaving out the range ends'],
  ['Welcome Either Way', 'motion == 1 && door == 1', 'AND instead of OR'],
  ['Kitchen Fume Fan', 'humidity > 60 && temp > 30', 'AND instead of OR'],
  ['Frost or Flood', 'outdoorTemp < 0 || rain > 3000', 'leaving out the boundaries'],
  ['Safe Garage Door', 'distance < 40', 'ignoring the alarm'],
];
for (const [title, condition, why] of mistakes)
  test(`${title} fails a program that makes the mistake of ${why}`, () => {
    const m = byTitle(title),
      wrong = program({ ...m, conditions: [condition] }, 'cpp', defaults(m.ids, 'ESP32'), true);
    assert.notDeepEqual(
      outcomes(m, wrong),
      m.scenarios.map(([, , expected]) => expected),
    );
  });

test('the pond warning swaps thresholds wrongly and fails', () => {
  const m = byTitle('Pond Overflow Warning'),
    wrong = program(
      { ...m, conditions: ['pond > 3900', 'pond > 3500'] },
      'cpp',
      defaults(m.ids, 'ESP32'),
      true,
    );
  assert.notDeepEqual(
    outcomes(m, wrong),
    m.scenarios.map(([, , expected]) => expected),
  );
});
