import test from 'node:test';
import assert from 'node:assert/strict';
import { missions, defaults, program } from '../public/missions.js';
import {
  simulateDay,
  dayLogQuestions,
  dayLogCSV,
  dayEnvironment,
  DAY_SAMPLE_MINUTES,
} from '../public/day-log.js';

const run = (index, scenario = 'normal', language = 'cpp') => {
  const devices = defaults(missions[index].ids, 'ESP32');
  return {
    devices,
    ...simulateDay(program(missions[index], language, devices, true), language, devices, 'ESP32', {
      scenario,
    }),
  };
};

test('a simulated day has a reading every 10 minutes from midnight to midnight', () => {
  const { rows } = run(0);
  assert.equal(rows.length, (24 * 60) / DAY_SAMPLE_MINUTES);
  assert.equal(rows[0].time, '00:00');
  assert.equal(rows.at(-1).time, '23:50');
});

test('the day follows the sun: dark at night, bright at noon, rain only in wet afternoons', () => {
  assert.equal(dayEnvironment('normal', 2).light, 0);
  assert.ok(dayEnvironment('normal', 12).light > 50);
  assert.ok(dayEnvironment('normal', 15).temp > dayEnvironment('normal', 4).temp);
  assert.equal(dayEnvironment('storm', 10).rain, 0);
  assert.ok(dayEnvironment('storm', 15).rain > 0);
});

test('path lights are on at night and off at noon in the logged data', () => {
  const { rows, devices } = run(0);
  const light = devices.find((d) => d.output).pin;
  assert.ok(rows.find((r) => r.time === '02:00').outputs[light] > 0);
  assert.equal(rows.find((r) => r.time === '12:00').outputs[light], 0);
});

test('MicroPython programs log the same day as Arduino ones', () => {
  const cpp = run(0, 'normal', 'cpp'),
    py = run(0, 'normal', 'python');
  assert.deepEqual(
    py.rows.map((r) => Object.values(r.outputs)),
    cpp.rows.map((r) => Object.values(r.outputs)),
  );
});

test('the CSV has a header and one line per reading, with ADC sensors on the 0–4095 scale', () => {
  const { rows, devices } = run(0);
  const lines = dayLogCSV(rows, devices).trim().split('\r\n');
  assert.equal(lines.length, rows.length + 1);
  assert.match(lines[0], /^"Time","Light sensor","Path lights"$/);
  const noon = lines.find((l) => l.startsWith('"12:00"')).split(',');
  assert.ok(Number(noon[1].replace(/"/g, '')) > 1500);
});

test('questions are answered by the data, with sorted choices and an explanation', () => {
  const { rows, devices } = run(0);
  const questions = dayLogQuestions(rows, devices);
  assert.deepEqual(
    questions.map((q) => q.id),
    ['first-on', 'time-on', 'highest'],
  );
  for (const q of questions) {
    assert.ok(q.choices.length >= 2 && q.answer >= 0);
    assert.equal(new Set(q.choices).size, q.choices.length);
    assert.ok(q.explanation.length > 10);
  }
  const lightPin = devices.find((d) => !d.output).pin,
    max = Math.max(...rows.map((r) => r.readings[lightPin]));
  assert.equal(questions[2].choices[questions[2].answer], max);
});

test('a program that never switches its output on gets a yes/no question instead', () => {
  const devices = defaults(missions[0].ids, 'ESP32');
  const { rows } = simulateDay('void setup(){}\nvoid loop(){}', 'cpp', devices, 'ESP32');
  assert.deepEqual(dayLogQuestions(rows, devices)[0].choices, ['Yes', 'No']);
});

test('errors are reported instead of producing a log', () => {
  const devices = defaults(missions[0].ids, 'ESP32');
  assert.match(simulateDay('void setup(){', 'cpp', devices, 'ESP32').error, /error/);
});
