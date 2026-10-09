import test from 'node:test';
import assert from 'node:assert/strict';
import { Runtime, pythonToC } from '../public/runtime.js';
import { missions, defaults, validate, program, baseEnv } from '../public/missions.js';
for (const board of ['ESP32', 'Raspberry Pi Pico'])
  for (const language of ['cpp', 'python'])
    for (const [index, mission] of missions.entries()) {
      test(`${board} ${language}: ${mission.title} passes all scenarios`, () => {
        const devices = defaults(mission.ids, board);
        assert.deepEqual(validate(devices, board), []);
        const rt = new Runtime(program(mission, language, devices, true), language, devices, board);
        for (const [name, env, expected] of mission.scenarios) {
          let r;
          for (let i = 0; i < 3; i++) r = rt.step({ ...baseEnv, ...env });
          const actual = devices
            .filter((d) => d.output)
            .map((d) => ((r.outputs[d.pin] || 0) > 0 ? 1 : 0));
          assert.deepEqual(actual, expected, name);
        }
      });
      if (index < 3)
        test(`${board} ${language}: ${mission.title} starter has no program to run`, () => {
          // Students write the whole program; the starter is the quest's title and goal only.
          const devices = defaults(mission.ids, board);
          assert.throws(
            () =>
              new Runtime(
                program(mission, language, devices, false),
                language,
                devices,
                board,
              ).step(baseEnv),
            /needs/,
          );
        });
    }
for (const language of ['cpp', 'python']) {
  test(`${language}: changing a threshold changes device state`, () => {
    const devices = defaults(missions[0].ids, 'ESP32');
    const original = program(missions[0], language, devices, true),
      altered = original.replace('light < 1800', 'light < 3000');
    const env = { ...baseEnv, light: 60 };
    const a = new Runtime(original, language, devices).step(env);
    const b = new Runtime(altered, language, devices).step(env);
    assert.equal(a.outputs[26], 0);
    assert.equal(b.outputs[26], 1);
  });
  test(`${language}: watering reaches target then stops and responds to an empty tank`, () => {
    const devices = defaults(missions[2].ids, 'ESP32'),
      rt = new Runtime(program(missions[2], language, devices, true), language, devices);
    const env = { ...baseEnv, soil: 20, tank: 80 };
    let started = false,
      stopped = false;
    for (let i = 0; i < 220; i++) {
      const r = rt.step(env);
      const on = r.outputs[26] > 0;
      if (i === 0) started = on;
      if (on) {
        env.soil += 0.5;
        env.tank -= 0.2;
      }
      if (env.soil > 58 && !on) stopped = true;
    }
    assert.ok(started && stopped);
    assert.ok(env.soil >= 58 && env.soil < 60);
    assert.equal(rt.step({ ...env, soil: 10, tank: 0 }).outputs[26], 0);
  });
  test(`${language}: always-on wrong solution fails bright-day test`, () => {
    const devices = defaults(missions[0].ids, 'ESP32');
    const source = program(missions[0], language, devices, true).replace(
      'light < 1800',
      language === 'cpp' ? 'true' : 'True',
    );
    assert.equal(
      new Runtime(source, language, devices).step({ ...baseEnv, light: 90 }).outputs[26],
      1,
    );
  });
  test(`${language}: infinite loops are bounded`, () => {
    const source =
      language === 'cpp'
        ? 'void setup() {} void loop() { while (true) {} }'
        : 'from machine import Pin\nwhile True:\n    while True:\n        x = 1';
    assert.throws(() => new Runtime(source, language, []).step(baseEnv), /Execution limit/);
  });
  test(`${language}: undefined pins stop execution`, () => {
    const source = program(missions[0], language, defaults(missions[0].ids, 'ESP32'), true);
    assert.throws(
      () => new Runtime(source, language, []).step(baseEnv),
      /not connected|connected actuator/,
    );
  });
}
test('wiring catches missing power, ground, resistor, conflicts and unsupported ADC', () => {
  const ds = defaults(['ldr', 'led'], 'ESP32');
  ds[0].power = false;
  ds[1].ground = false;
  ds[1].resistorConnected = false;
  ds[0].pin = 18;
  ds[1].pin = 18;
  assert.ok(validate(ds, 'ESP32').length >= 5);
});
test('ESP32 input-only pins cannot drive outputs', () => {
  const ds = defaults(['led'], 'ESP32');
  ds[0].pin = 34;
  assert.ok(validate(ds, 'ESP32').some((x) => x.includes('input-only')));
});
test('Pico does not accept ESP32-only pins', () => {
  const ds = defaults(['ldr'], 'ESP32');
  assert.ok(validate(ds, 'Raspberry Pi Pico').length);
});
test('Arduino variables, functions, arithmetic, serial, and non-blocking millis work', () => {
  const ds = defaults(['led'], 'ESP32');
  const rt = new Runtime(
    'int last = 0; int f(int x) { return x * 2; } void setup() { pinMode(26, OUTPUT); } void loop() { if (millis() - last >= 400) { digitalWrite(26, f(1)); last = millis(); Serial.println(last); } }',
    'cpp',
    ds,
  );
  assert.deepEqual(rt.step(baseEnv).outputs, {});
  assert.equal(rt.step(baseEnv).outputs[26], 2);
  assert.equal(rt.logs.at(-1), '400');
  assert.equal(rt.vars.get('last'), 400);
});
test('MicroPython functions, elif, PWM and ticks_ms work', () => {
  const ds = defaults(['led'], 'ESP32');
  const rt = new Runtime(
    'from machine import Pin, PWM\nimport time\npwm = PWM(Pin(26))\ndef twice(x):\n    return x * 2\nwhile True:\n    if time.ticks_ms() < 300:\n        pwm.duty(twice(50))\n    elif time.ticks_ms() < 500:\n        pwm.duty(200)\n    else:\n        pwm.duty(0)\n    time.sleep_ms(200)',
    'python',
    ds,
  );
  assert.equal(rt.step(baseEnv).outputs[26], 100);
  assert.equal(rt.step(baseEnv).outputs[26], 200);
  assert.equal(rt.step(baseEnv).outputs[26], 0);
});
test('sandbox blocks arbitrary browser/network/filesystem code', () => {
  for (const source of [
    'fetch("https://example.com");',
    'eval("x");',
    'window.location();',
    'process.exit();',
  ])
    assert.throws(() =>
      new Runtime('void setup() {} void loop() {' + source + '}', 'cpp', []).step(baseEnv),
    );
});
test('unsupported imports and syntax produce clear errors', () => {
  assert.throws(() => pythonToC('import os'), /Supported imports/);
  assert.throws(() => new Runtime('#include <x>\nvoid loop() {}', 'cpp'), /Unsupported syntax/);
  assert.throws(() => new Runtime('x = [1,2]', 'python'), /Unsupported syntax/);
});
test('comments do not corrupt text literals', () => {
  const rt = new Runtime(
    'void setup() {} void loop() { Serial.println("https://example.com"); /* block */ // comment\n delay(200); }',
    'cpp',
    [],
  );
  assert.equal(rt.step(baseEnv).logs[0], 'https://example.com');
});
test('string growth cannot exhaust worker memory', () => {
  const rt = new Runtime(
    'void setup() {} void loop() { auto text = "a"; while (true) { text = text + text; } }',
    'cpp',
    [],
  );
  assert.throws(() => rt.step(baseEnv), /String length limit/);
});
