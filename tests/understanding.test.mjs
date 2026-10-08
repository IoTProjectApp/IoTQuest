import test from 'node:test';
import assert from 'node:assert/strict';
import { missions, defaults, program, baseEnv } from '../public/missions.js';
import { locations, adaptMissions } from '../public/locations.js';
import { Runtime } from '../public/runtime.js';
import {
  understandingQuestions,
  answerQuestion,
  understandingScore,
  UNDERSTANDING_XP,
} from '../public/understanding.js';

const everyQuest = () => {
  const all = missions.map((m) => [m, 'Willowbrook']);
  for (const l of locations)
    for (const difficulty of ['beginner', 'advanced'])
      for (const m of adaptMissions(missions, l, difficulty))
        all.push([m, l.id + ' ' + difficulty]);
  return all;
};

test('every quest gets three well-formed questions whose answers match the real program', () => {
  for (const [m, where] of everyQuest())
    for (const language of ['cpp', 'python']) {
      const devices = defaults(m.ids, 'ESP32'),
        qs = understandingQuestions(m, language, devices),
        label = where + ' · ' + m.title + ' · ' + language;
      assert.deepEqual(
        qs.map((q) => q.id),
        ['predict', 'read', 'change'],
        label,
      );
      for (const q of qs) {
        assert.ok(q.answer >= 0 && q.answer < q.choices.length, label + ' ' + q.id);
        assert.equal(new Set(q.choices.map((c) => c.text)).size, q.choices.length, label);
        assert.ok(
          q.choices.every((c) => c.why.length > 20),
          label + ' every answer is explained',
        );
      }
      // The predicted output is what the worked solution really does.
      const predict = qs[0],
        scenario = m.scenarios.find(([name]) => predict.prompt.startsWith('“' + name + '”')),
        runtime = new Runtime(program(m, language, devices, true), language, devices, 'ESP32'),
        out = devices.find((d) => d.output),
        on = (runtime.step({ ...baseEnv, ...scenario[1] }).outputs[out.pin] || 0) > 0;
      assert.equal(predict.choices[predict.answer].text, on ? 'ON' : 'OFF', label);
      // Same order every time.
      assert.deepEqual(understandingQuestions(m, language, devices), qs);
    }
});

test('questions are about the quest: threshold, sensor reading and what to change', () => {
  const light = understandingQuestions(missions[0], 'cpp', defaults(missions[0].ids, 'ESP32'));
  assert.match(
    light[0].prompt,
    /“At threshold”: the readings are light 1800\. Are the path lights ON or OFF\?/,
  );
  assert.equal(light[0].choices[light[0].answer].text, 'OFF');
  assert.match(light[0].choices[light[0].answer].why, /< means “less than”/);
  assert.match(light[1].prompt, /`analogRead\(lightPin\)`/);
  assert.match(light[1].choices[light[1].answer].text, /0 to 4095/);
  assert.match(light[2].choices[light[2].answer].text, /The number 1800/);
  const py = understandingQuestions(missions[0], 'python', defaults(missions[0].ids, 'ESP32'));
  assert.match(py[1].prompt, /`light_sensor\.read\(\)`/);
  assert.match(py[2].prompt, /`if light < 1800:`/);
  // Without a numeric threshold, the third question is about else.
  const motion = understandingQuestions(missions[1], 'cpp', defaults(missions[1].ids, 'ESP32'));
  assert.match(motion[1].choices[motion[1].answer].text, /1 \(HIGH\) or 0 \(LOW\)/);
  assert.match(motion[2].prompt, /`else`/);
  assert.match(motion[2].choices[motion[2].answer].text, /OFF whenever the condition is false/);
  // Temperature is calibrated in °C.
  const temp = understandingQuestions(missions[3], 'cpp', defaults(missions[3].ids, 'ESP32'));
  assert.match(temp[1].choices[temp[1].answer].text, /°C/);
});

test('XP only for a right first try; answers are recorded for the report', () => {
  const [q] = understandingQuestions(missions[0], 'cpp', defaults(missions[0].ids, 'ESP32')),
    wrong = q.answer === 0 ? 1 : 0,
    record = {};
  assert.deepEqual(answerQuestion(record, q, wrong), { right: false, xp: 0 });
  assert.deepEqual(answerQuestion(record, q, q.answer), { right: true, xp: 0 });
  assert.deepEqual(answerQuestion(record, q, q.answer), { right: true, xp: 0 }, 'already solved');
  assert.deepEqual(record.answers.predict, {
    first: false,
    tries: 2,
    solved: true,
    last: q.answer,
  });
  const fresh = {};
  assert.deepEqual(answerQuestion(fresh, q, q.answer), { right: true, xp: UNDERSTANDING_XP });
  assert.deepEqual(understandingScore(record, 3), { right: 0, answered: 1, total: 3 });
  assert.deepEqual(understandingScore(fresh, 3), { right: 1, answered: 1, total: 3 });
});
