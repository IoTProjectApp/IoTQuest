import test from 'node:test';
import assert from 'node:assert/strict';
import {
  missions,
  components,
  defaults,
  validate,
  program,
  baseEnv,
  missionBudget,
} from '../public/missions.js';
import { Runtime } from '../public/runtime.js';
import { createLabState, updateResources } from '../public/lab.js';
import { sectionResidents } from '../public/section-residents.js';
import { componentQuests } from '../public/component-quests.js';

// Quests 18–25 (indices 17–24), after the original 17 and before the logic quests.
const first = 17;

test('the component quests together use every component', () => {
  const used = new Set(componentQuests.flatMap((q) => q.ids));
  assert.deepEqual(
    components.filter((c) => !used.has(c.id)).map((c) => c.id),
    [],
  );
});

test('component quests keep their numbers (18–25) so saved progress does not move', () => {
  assert.deepEqual(missions.slice(first, first + componentQuests.length), componentQuests);
  assert.equal(missions[16].title, 'Utility Room Safety Alert');
});
test('each component quest belongs to a section with a resident and has one condition per output', () => {
  for (const q of componentQuests) {
    const resident = sectionResidents.find(([area]) => area === q.area);
    assert.ok(resident, q.title + ': unknown area ' + q.area);
    assert.equal(q.resident, resident[1], q.title);
    const outputs = q.ids.filter((id) => components.find((c) => c.id === id).output);
    assert.equal(q.conditions.length, outputs.length, q.title);
    for (const [, , expected] of q.scenarios)
      assert.equal(expected.length, outputs.length, q.title);
  }
});

for (const board of ['ESP32', 'Raspberry Pi Pico'])
  for (const language of ['cpp', 'python'])
    test(`every component quest is solvable within its budget (${board}, ${language})`, () => {
      for (const m of componentQuests) {
        const devices = defaults(m.ids, board);
        assert.deepEqual(validate(devices, board), [], m.title + ': pins');
        const runtime = new Runtime(program(m, language, devices, true), language, devices, board),
          outs = m.ids.map((id) => devices.find((d) => d.id === id)).filter((d) => d.output);
        let used = createLabState().resources;
        for (const [name, env, expected] of m.scenarios) {
          let result;
          for (let i = 0; i < 25; i++) {
            result = runtime.step({ ...baseEnv, ...env });
            used = updateResources(used, devices, result.outputs, { ...baseEnv, ...env }, 0.2);
          }
          assert.deepEqual(
            outs.map((d) => ((result.outputs[d.pin] || 0) > 0 ? 1 : 0)),
            expected,
            m.title + ' / ' + name,
          );
        }
        const budget = missionBudget(m);
        assert.ok(used.wh <= budget.wh && used.litres <= budget.litres, m.title + ': budget');
      }
    });

test('air-conditioning left on when nobody is home breaks the energy budget', () => {
  const m = componentQuests.find((q) => q.ids.includes('ac')),
    devices = defaults(m.ids, 'ESP32'),
    careless = program({ ...m, conditions: ['temp > 26'] }, 'cpp', devices, true),
    runtime = new Runtime(careless, 'cpp', devices, 'ESP32');
  let used = createLabState().resources;
  for (const [, env] of m.scenarios)
    for (let i = 0; i < 25; i++) {
      const result = runtime.step({ ...baseEnv, ...env });
      used = updateResources(used, devices, result.outputs, { ...baseEnv, ...env }, 0.2);
    }
  assert.ok(used.wh > missionBudget(m).wh);
});
