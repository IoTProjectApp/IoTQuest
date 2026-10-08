import test from 'node:test';
import assert from 'node:assert/strict';
import { defaults, program, baseEnv } from '../public/missions.js';
import { Runtime } from '../public/runtime.js';
import { readingRange } from '../public/diagnostics.js';
import {
  buildProgressReport,
  parseProgressReport,
  reportViews,
} from '../public/progress-report.js';
import {
  buildCustomQuest,
  parseQuestFile,
  questFile,
  questSensors,
  questOutputs,
  questOperators,
  loadCustomQuests,
  QuestError,
} from '../public/custom-quests.js';

const night = {
  title: 'Night light',
  resident: 'Ms Rivera',
  sensor: 'ldr',
  output: 'led',
  operator: '<',
  threshold: 1800,
};
function passesOwnTests(quest, language, board = 'ESP32') {
  const devices = defaults(quest.ids, board),
    runtime = new Runtime(program(quest, language, devices, true), language, devices, board),
    pin = devices.find((d) => d.output).pin;
  return quest.scenarios.every(([, env, [expected]]) => {
    let result;
    for (let i = 0; i < 25; i++) result = runtime.step({ ...baseEnv, ...env });
    return ((result.outputs[pin] || 0) > 0 ? 1 : 0) === expected;
  });
}

test('every sensor and comparison makes a quest whose worked example passes its own tests', () => {
  for (const sensor of questSensors())
    for (const operator of questOperators(sensor)) {
      const [lo, hi] = readingRange(sensor),
        threshold = sensor.analog ? Math.round((lo + hi) / 2) : 1,
        quest = buildCustomQuest({
          title: 'T',
          sensor: sensor.id,
          output: 'led',
          operator,
          threshold,
        });
      for (const language of ['cpp', 'python'])
        assert.ok(
          passesOwnTests(quest, language),
          `${sensor.id} ${operator} ${threshold} ${language}`,
        );
    }
});

test('every output can be used, on both boards', () => {
  for (const output of questOutputs())
    for (const board of ['ESP32', 'Raspberry Pi Pico']) {
      const quest = buildCustomQuest({ ...night, output: output.id });
      assert.ok(passesOwnTests(quest, 'cpp', board), output.id + ' ' + board);
    }
});

test('tests sit right at the threshold, so < and <= are told apart', () => {
  const below = buildCustomQuest(night),
    atOrBelow = buildCustomQuest({ ...night, operator: '<=' });
  const at = (q) => q.scenarios.find(([name]) => name === 'At the threshold')[2][0];
  assert.equal(at(below), 0);
  assert.equal(at(atOrBelow), 1);
  // A program written for one rule fails the other quest.
  const devices = defaults(below.ids, 'ESP32'),
    wrong = new Runtime(program(atOrBelow, 'cpp', devices, true), 'cpp', devices, 'ESP32');
  const [, env, [expected]] = below.scenarios.find(([name]) => name === 'At the threshold');
  let result;
  for (let i = 0; i < 25; i++) result = wrong.step({ ...baseEnv, ...env });
  assert.notEqual((result.outputs[devices[1].pin] || 0) > 0 ? 1 : 0, expected);
});

test('a quest file round-trips and keeps a stable id', () => {
  const quest = buildCustomQuest(night),
    again = parseQuestFile(questFile(quest));
  assert.equal(again.id, quest.id);
  assert.deepEqual(again.scenarios, quest.scenarios);
  assert.match(quest.goal, /path lights on when the light sensor reading is below 1800/i);
});

test('invalid quests explain what to fix', () => {
  const bad = [
    [{ ...night, title: ' ' }, /title/],
    [{ ...night, sensor: 'led' }, /sensor/],
    [{ ...night, output: 'ldr' }, /output/],
    [{ ...night, operator: '==' }, /compared/],
    [{ ...night, threshold: 4095 }, /between 0 and 4095/],
    [{ ...night, threshold: 1800.5 }, /whole numbers from 0 to 4095/],
    [{ ...night, sensor: 'ultra', threshold: 49.5 }, /whole numbers from 0 to 300/],
    [{ ...night, sensor: 'pir', operator: '==', threshold: 2 }, /HIGH/],
  ];
  for (const [fields, message] of bad)
    assert.throws(
      () => buildCustomQuest(fields),
      (e) => e instanceof QuestError && message.test(e.message),
    );
});

test('files that are not quests are rejected, and edited files are re-validated', () => {
  assert.throws(() => parseQuestFile('nope'), /not JSON/);
  assert.throws(() => parseQuestFile('{"format":"other"}'), /not an IoT Quest quest file/);
  assert.throws(
    () => parseQuestFile(JSON.stringify({ format: 'iotquest-quest', version: 9 })),
    /version/,
  );
  const edited = JSON.parse(questFile(buildCustomQuest(night)));
  edited.quest.threshold = 99999;
  assert.throws(() => parseQuestFile(JSON.stringify(edited)), /between/);
  assert.throws(() => parseQuestFile('x'.repeat(30000)), /too large/);
});

test('text is trimmed and limited, and markup stays plain text', () => {
  const quest = buildCustomQuest({
    ...night,
    title: '  <b>Hi</b>  there ',
    request: 'x'.repeat(500),
  });
  assert.equal(quest.title, '<b>Hi</b> there');
  assert.ok(quest.quote.length <= 242);
});

test('saved quests reload, dropping duplicates and invalid entries', () => {
  const fields = buildCustomQuest(night).fields;
  assert.equal(loadCustomQuests([fields, fields, { title: 'broken' }, null]).length, 1);
  assert.deepEqual(loadCustomQuests('not a list'), []);
});

test('teacher quests appear in progress reports as their own group', () => {
  const quest = buildCustomQuest(night),
    state = {
      name: 'Ana',
      customQuests: [quest.fields],
      completed: {},
      projects: {},
      locationProgress: {
        kyoto: {
          completed: { ['fault:' + quest.id]: { date: '2026-10-01T00:00:00Z' } },
          projects: {},
        },
      },
    };
  const report = parseProgressReport(JSON.stringify(buildProgressReport(state)));
  const record = report.quests.find((q) => q.location === 'teacher');
  assert.equal(record.title, 'Night light');
  assert.equal(record.status, 'passed');
  assert.ok(reportViews([report]).some((v) => v.label === 'Teacher quests'));
});
