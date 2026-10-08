import test from 'node:test';
import assert from 'node:assert/strict';
import { missions, defaults, validate, program, baseEnv } from '../public/missions.js';
import { adaptMissions, locations, progressForLocation } from '../public/locations.js';
import { Runtime } from '../public/runtime.js';
import { advanceEnvironment, fallbackWeather } from '../public/weather.js';
import { understandingQuestions } from '../public/understanding.js';

test('five appended weather quests work at both levels on both boards in both languages', () => {
  assert.equal(missions.filter((m) => m.weatherQuest).length, 5);
  assert.equal(missions[7].title, 'Whole-Home Challenge');
  for (const difficulty of ['beginner', 'advanced'])
    for (const board of ['ESP32', 'Raspberry Pi Pico'])
      for (const language of ['cpp', 'python'])
        for (const m of adaptMissions(missions, locations[0], difficulty).filter(
          (m) => m.weatherQuest,
        )) {
          const devices = defaults(m.ids, board);
          assert.deepEqual(validate(devices, board), []);
          const runtime = new Runtime(
            program(m, language, devices, true),
            language,
            devices,
            board,
          );
          for (const [name, readings, expected] of m.scenarios) {
            const result = runtime.step({ ...baseEnv, ...readings });
            assert.deepEqual(
              devices.filter((d) => d.output).map((d) => +(result.outputs[d.pin] > 0)),
              expected,
              m.title + ' ' + name,
            );
          }
        }
  assert.equal(progressForLocation({}, 'legacy').total, missions.length);
  assert.equal(progressForLocation({}, locations[0].id).total, missions.length * 2);
});

test('live weather changes the new sensor readings and student code controls storm warnings', () => {
  const location = locations[0],
    m = missions.find((m) => m.title === 'Storm Watch'),
    devices = defaults(m.ids, 'ESP32');
  const weather = {
    ...fallbackWeather(location),
    status: 'live',
    wind: 65,
    cloud: 92,
    temperature: 31.5,
    humidity: 80,
    precipitation: 6,
  };
  let env = { ...baseEnv };
  for (let i = 0; i < 100; i++)
    env = advanceEnvironment(env, devices, {}, 1, { mode: 'live', weather });
  assert.ok(env.wind > 40);
  assert.ok(env.cloud > 80);
  for (const language of ['cpp', 'python']) {
    const runtime = new Runtime(program(m, language, devices, true), language, devices, 'ESP32');
    const buzzer = devices.find((d) => d.output);
    assert.equal(runtime.step(env).outputs[buzzer.pin], 1);
    // Neither external weather nor a previous ON state may override an OFF decision.
    assert.equal(runtime.step({ ...env, wind: 12 }).outputs[buzzer.pin], 0);
  }
});

test('calibrated weather readings retain decimals in Arduino and their teaching questions use correct units', () => {
  for (const [title, env, expected] of [
    ['Garden Frost Alert', { outdoorTemp: 2.9 }, 0],
    ['Storm Watch', { wind: 39.9 }, 0],
    ['Cloudy-Day Grow Lights', { cloud: 79.9 }, 0],
    ['Heat & Humidity Response', { outdoorTemp: 29.9 }, 0],
  ]) {
    const m = missions.find((m) => m.title === title),
      devices = defaults(m.ids, 'ESP32');
    const runtime = new Runtime(program(m, 'cpp', devices, true), 'cpp', devices, 'ESP32');
    assert.equal(
      runtime.step({ ...baseEnv, ...env }).outputs[devices.find((d) => d.output).pin],
      expected,
      title,
    );
    const q = understandingQuestions(m, 'cpp', devices)[1];
    if (title === 'Storm Watch') assert.match(q.choices[q.answer].text, /kilometres per hour/);
    if (title === 'Cloudy-Day Grow Lights')
      assert.match(q.choices[q.answer].text, /cloud cover.*percentage/);
  }
});
