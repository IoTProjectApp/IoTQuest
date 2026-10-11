import test from 'node:test';
import assert from 'node:assert/strict';
import { Runtime } from '../public/runtime.js';
import { outputLevel } from '../public/signals.js';
import { updateResources, createLabState } from '../public/lab.js';
import { advanceEnvironment } from '../public/weather.js';
import { buildLanes } from '../public/plotter.js';
import { analyzeCode } from '../public/code-analysis.js';
import { coachSteps } from '../public/code-coach.js';
import { defaults, missions, program, validate } from '../public/missions.js';

const led = [{ pin: 2, output: true, name: 'LED' }];
const run = (code, language = 'cpp', ticks = 1, devices = led, board = 'ESP32') => {
  const rt = new Runtime(code, language, devices, board);
  let state;
  for (let i = 0; i < ticks; i++) state = rt.step({ light: 50, temp: 22.5 }, 200);
  return { rt, state };
};
const cpp = (globals, loop) => run(globals + ' void setup() {} void loop() {' + loop + '}');
const logsOf = (globals, loop) => cpp(globals, loop).state.logs;

test('a MicroPython main loop without a sleep ends the tick each pass, like loop()', () => {
  const { rt } = run('n = 0\nwhile True:\n    n = n + 1', 'python', 3);
  assert.equal(rt.vars.get('n'), 3);
  const { rt: c } = cpp('int n = 0;', 'n = n + 1;');
  assert.equal(c.vars.get('n'), 1);
});

test('a top-level call to a function holding the forever loop is the main loop', () => {
  const { rt } = run(
    'n = 0\ndef main():\n    global n\n    while True:\n        n = n + 1\n        time.sleep_ms(200)\nmain()',
    'python',
    4,
  );
  assert.equal(rt.vars.get('n'), 4);
  assert.throws(() => run('x = 1', 'python'), /while True: main loop/);
});

test('each output write records its full scale, and one helper turns it into a level', () => {
  const pwm = [{ pin: 2, output: true, name: 'Fan' }];
  const scale = (code, language = 'python') => run(code, language, 1, pwm).state.outputScales[2];
  assert.equal(scale('p = PWM(Pin(2))\nwhile True:\n    p.duty(512)'), 1023);
  assert.equal(scale('p = PWM(Pin(2))\nwhile True:\n    p.duty_u16(200)'), 65535);
  assert.equal(
    scale('void setup() { pinMode(2, OUTPUT); } void loop() { analogWrite(2, 1); }', 'cpp'),
    255,
  );
  assert.equal(
    scale('void setup() { pinMode(2, OUTPUT); } void loop() { digitalWrite(2, HIGH); }', 'cpp'),
    1,
  );
  assert.equal(outputLevel(512, 1023), 512 / 1023);
  assert.equal(outputLevel(200, 65535), 200 / 65535);
  assert.equal(outputLevel(1, 255), 1 / 255);
  assert.equal(outputLevel(1, 1), 1);
  assert.equal(outputLevel(0, 1), 0);
  // Energy, cooling and the plotter agree on the level.
  const fan = [{ id: 'fan', pin: 2, output: true, name: 'Fan' }],
    half = updateResources(createLabState().resources, fan, { 2: 512 }, {}, 3600, [], { 2: 1023 }),
    full = updateResources(createLabState().resources, fan, { 2: 1 }, {}, 3600, [], { 2: 1 }),
    tiny = updateResources(createLabState().resources, fan, { 2: 200 }, {}, 3600, [], { 2: 65535 });
  const fanWh = (r) => r.byDevice.fan.wh;
  assert.ok(Math.abs(fanWh(half) - fanWh(full) / 2) < 0.05 * fanWh(full));
  assert.ok(fanWh(tiny) < 0.01 * fanWh(full));
  const env = { temp: 30, outdoorTemp: 30, soil: 50, tank: 50 },
    cool = (outputs, scales) => advanceEnvironment(env, fan, outputs, 1, { scales }).temp;
  assert.ok(cool({ 2: 512 }, { 2: 1023 }) > cool({ 2: 1 }, { 2: 1 }));
  const { strips } = buildLanes([{ t: 0, outputs: { 2: 512 }, scales: { 2: 1023 } }], fan);
  assert.equal(strips[0].points[0][1], 512 / 1023);
});

test('abs, min and max of a float stay floats in C', () => {
  const { rt } = cpp(
    'float f = 7; float r = 0; float m = 0;',
    'r = abs(f) / 2; m = max(f, 1) / 2;',
  );
  assert.equal(rt.vars.get('r'), 3.5);
  assert.equal(rt.vars.get('m'), 3.5);
});

test('the Pico has no ADC.read() or PWM.duty(); generated code and the coach use read_u16', () => {
  const sensor = [{ pin: 26, name: 'Light', signal: 'light', analog: true }];
  assert.throws(
    () =>
      run(
        's = ADC(Pin(26))\nwhile True:\n    x = s.read()',
        'python',
        1,
        sensor,
        'Raspberry Pi Pico',
      ),
    /read_u16/,
  );
  assert.throws(
    () => run('p = PWM(Pin(2))\nwhile True:\n    p.duty(5)', 'python', 1, led, 'Raspberry Pi Pico'),
    /duty_u16/,
  );
  const { rt } = run(
    's = ADC(Pin(26))\nwhile True:\n    x = s.read_u16() >> 4',
    'python',
    1,
    sensor,
    'Raspberry Pi Pico',
  );
  assert.equal(rt.vars.get('x'), Math.round(50 * 40.95));
  // ESP32 keeps read().
  assert.equal(
    run('s = ADC(Pin(26))\nwhile True:\n    x = s.read()', 'python', 1, sensor).rt.vars.get('x'),
    2048,
  );
  const light = missions[0],
    pico = defaults(light.ids, 'Raspberry Pi Pico'),
    example = program(light, 'python', pico, true);
  assert.match(example, /read_u16\(\) >> 4/);
  assert.doesNotMatch(example, /\.read\(\)/);
  assert.match(program(light, 'python', defaults(light.ids, 'ESP32'), true), /\.read\(\)/);
  const step = coachSteps(light, 'python', pico, 'Raspberry Pi Pico').find((s) =>
    s.key.startsWith('read'),
  );
  assert.match(step.pattern, /read_u16\(\) >> 4/);
  assert.equal(step.check(example).done, true, step.check(example).message);
  assert.equal(step.check(example.replace('read_u16() >> 4', 'read()')).done, false);
});

test('Serial and print output match the boards', () => {
  assert.deepEqual(
    logsOf(
      'float pi = 3.14159; float f = 5; bool b = true;',
      'Serial.println(pi); Serial.println(f); Serial.println(b); Serial.println(pi, 3); Serial.println(255, HEX); Serial.println(5, BIN); Serial.println(7);',
    ),
    ['3.14', '5.00', '1', '3.142', 'FF', '101', '7'],
  );
  assert.deepEqual(
    run(
      'while True:\n    print(True)\n    print(10 / 2)\n    x = 7 / 2\n    print(x, 3)\n    print("t: " + str(2.0))',
      'python',
    ).state.logs,
    ['True', '5.0', '3.5 3', 't: 2.0'],
  );
});

test('compound assignments, integer suffixes, hex literals and Arduino types parse', () => {
  const { rt } = cpp(
    'int x = 10; unsigned long t = 1000UL; long l = 10L; int h = 0xFF; boolean ok = true; byte by = 300; word w = 70000;',
    'x *= 2; x /= 4; x %= 3; h = h & 0x0F;',
  );
  assert.equal(rt.vars.get('x'), 2);
  assert.equal(rt.vars.get('t'), 1000);
  assert.equal(rt.vars.get('l'), 10);
  assert.equal(rt.vars.get('h'), 15);
  assert.equal(rt.vars.get('ok'), true);
  assert.equal(rt.vars.get('by'), 44);
  assert.equal(rt.vars.get('w'), 70000 & 0xffff);
});

test('C bool variables hold only true or false', () => {
  const { rt, state } = cpp('bool b = false; int n = 0;', 'b = 5; n = b + 1; Serial.println(b);');
  assert.equal(rt.vars.get('b'), true);
  assert.equal(rt.vars.get('n'), 2);
  assert.deepEqual(state.logs, ['1']);
});

test('unsigned and int middle results wrap like 32-bit integers', () => {
  const { rt } = cpp(
    'unsigned long a = 100; unsigned long b = 200; int late = 0; int big = 2147483647; int over = 0;',
    'late = (a - b) > 1000; over = big + 1;',
  );
  assert.equal(rt.vars.get('late'), 1);
  assert.equal(rt.vars.get('over'), -2147483648);
  // millis() rollover: the elapsed time is still right.
  const roll = cpp(
    'unsigned long start = 4294967000; unsigned long now = 200; unsigned long gap = 0;',
    'gap = now - start;',
  );
  assert.equal(roll.rt.vars.get('gap'), 496);
});

test('a variable is a sensor reading only while it holds exactly the read call', () => {
  const scaled = analyzeCode(
    'void loop() {\n  float f = analogRead(35) * 9.0 / 5 + 32;\n  if (f > 80) {}\n}',
  );
  assert.equal(scaled.comparisons.length, 0);
  const reassigned = analyzeCode(
    'void loop() {\n  int l = analogRead(34);\n  if (l > 500) {}\n  l = l / 4;\n  if (l > 100) {}\n}',
  );
  assert.deepEqual(
    reassigned.comparisons.map((c) => c.raw),
    [500],
  );
  const pico = analyzeCode(
    's = ADC(Pin(26))\nwhile True:\n    l = s.read_u16() >> 4\n    if l > 1800:\n        pass',
    'python',
  );
  assert.equal(pico.comparisons[0].value, 1800);
});

test('helpers: map, constrain, round, float, int, str and ticks_diff', () => {
  const { rt } = cpp(
    'long m = 0; int c = 0; int lo = 0;',
    'm = map(512, 0, 1023, 0, 100); c = constrain(300, 0, 255); lo = constrain(-5, 0, 255);',
  );
  assert.equal(rt.vars.get('m'), 50);
  assert.equal(rt.vars.get('c'), 255);
  assert.equal(rt.vars.get('lo'), 0);
  const py = run(
    'from time import ticks_ms, ticks_diff\nstart = ticks_ms()\nwhile True:\n    a = round(2.5)\n    b = round(3.14159, 2)\n    f = float("2.5")\n    i = int("12")\n    d = ticks_diff(ticks_ms(), start)\n    time.sleep_ms(200)',
    'python',
    2,
  ).rt;
  assert.equal(py.vars.get('a'), 2);
  assert.equal(py.vars.get('b'), 3.14);
  assert.equal(py.vars.get('f'), 2.5);
  assert.equal(py.vars.get('i'), 12);
  assert.equal(py.vars.get('d'), 200);
});

test('the Pico rejects pins that are not on its header', () => {
  const at = (pin) => [{ name: 'LED', pin, output: true, power: true, ground: true }];
  for (const pin of [23, 24, 25, 29])
    assert.ok(validate(at(pin), 'Raspberry Pi Pico').length, 'GP' + pin);
  for (const pin of [0, 22, 26, 28]) assert.deepEqual(validate(at(pin), 'Raspberry Pi Pico'), []);
});
