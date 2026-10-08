import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePlotLine, findThresholds, buildLanes, plotCSV } from '../public/plotter.js';
import { condenseTrace, simulateBatch, createLabState } from '../public/lab.js';
import { Runtime } from '../public/runtime.js';
import { missions, defaults, program, baseEnv } from '../public/missions.js';

test('plot lines follow the Arduino Serial Plotter format', () => {
  assert.deepEqual(parsePlotLine('light:1234 temp:22.5'), [
    ['light', 1234],
    ['temp', 22.5],
  ]);
  assert.deepEqual(parsePlotLine('1, -2\t3e2'), [
    ['value 1', 1],
    ['value 2', -2],
    ['value 3', 300],
  ]);
  assert.deepEqual(parsePlotLine('Light is 5'), []);
  assert.deepEqual(parsePlotLine(''), []);
});

test('Serial.print continues a line and println ends it', () => {
  const rt = new Runtime(
    'void setup() {}\nvoid loop() {\n  Serial.print("light:");\n  Serial.print(5);\n  Serial.println(" x:2");\n  Serial.print("partial");\n}',
    'cpp',
    [],
    'ESP32',
  );
  const r = rt.step(baseEnv, 200);
  assert.equal(r.logs.at(-1), 'light:5 x:2');
  assert.equal(r.pendingLine, 'partial');
  assert.equal(r.printed, 1);
});

test('thresholds resolve pins through constants, variables, calls and pin objects', () => {
  const pins = [{ pin: 34 }, { pin: 26, output: true }];
  assert.deepEqual(
    findThresholds(
      'const int ldr = 34;\nint limit = 1800;\nvoid loop() {\n  int light = analogRead(ldr);\n  if (light < limit) {}\n  if (2000 >= analogRead(34)) {}\n  if (digitalRead(26) == 1) {}\n}',
      'cpp',
      pins,
    ),
    [
      { pin: 34, value: 1800, op: '<', line: 5 },
      { pin: 34, value: 2000, op: '<=', line: 6 },
    ],
  );
  assert.deepEqual(
    findThresholds(
      'from machine import Pin, ADC\ns = ADC(Pin(34))\nwhile True:\n    if s.read_u16() > 32000:\n        pass',
      'python',
      pins,
    ),
    [{ pin: 34, value: 2000, op: '>', line: 4 }],
  );
});

test('every mission starter exposes its thresholds to the plotter', () => {
  for (const m of missions)
    for (const language of ['cpp', 'python']) {
      const devices = defaults(m.ids, 'ESP32');
      assert.ok(
        findThresholds(program(m, language, devices, true), language, devices).length > 0,
        m.title + ' ' + language,
      );
    }
});

test('condensed traces are bounded, keep the final sample and carry serial lines', () => {
  const samples = Array.from({ length: 360 }, (_, i) => ({
    t: (i + 1) * 200,
    inputs: {},
    outputs: {},
    lines: i === 5 ? ['a:1'] : [],
  }));
  const out = condenseTrace(samples);
  assert.equal(out.length, 12);
  assert.equal(out.at(-1).t, 72000);
  assert.deepEqual(
    out.flatMap((s) => s.lines),
    ['a:1'],
  );
  assert.equal(condenseTrace(samples.slice(0, 3)).length, 3);
});

test('a traced batch records per-step inputs, outputs and new serial lines', () => {
  const devices = defaults(['ldr', 'led'], 'ESP32');
  const code = `void setup() { pinMode(${devices[1].pin}, OUTPUT); }\nvoid loop() {\n  int v = analogRead(${devices[0].pin});\n  Serial.println(v);\n  digitalWrite(${devices[1].pin}, v < 1800);\n  delay(200);\n}`;
  const rt = new Runtime(code, 'cpp', devices, 'ESP32');
  const result = simulateBatch(rt, {
    env: { ...baseEnv, light: 10 },
    lab: createLabState(),
    devices,
    count: 4,
    trace: true,
  });
  assert.equal(result.trace.length, 4);
  for (const s of result.trace) {
    assert.ok(s.inputs[devices[0].pin] !== undefined);
    assert.equal(s.lines.length, 1);
  }
  assert.equal(result.trace.at(-1).outputs[devices[1].pin], 1);
  assert.equal(
    simulateBatch(rt, { env: baseEnv, lab: createLabState(), devices }).trace,
    undefined,
  );
});

test('lanes separate analogue lines, serial series, digital inputs and output levels', () => {
  const devices = [
    { id: 'ldr', name: 'Light', pin: 34, analog: true },
    { id: 'pir', name: 'Motion', pin: 27 },
    { id: 'led', name: 'Lamp', pin: 26, output: true },
    { id: 'servo', name: 'Vent', pin: 25, output: true },
  ];
  const samples = [
    { t: 200, inputs: { 34: 100, 27: 1 }, outputs: { 26: 128, 25: 90 }, lines: ['a:1 b:2'] },
    { t: 400, inputs: { 34: 300, 27: 0 }, outputs: { 26: 0 }, lines: ['text only'] },
  ];
  const { lanes, strips } = buildLanes(samples, devices, [{ pin: 34, value: 200, op: '<' }]);
  assert.deepEqual(
    lanes.map((l) => l.id),
    ['pin-34', 'serial'],
  );
  assert.equal(lanes[0].thresholds.length, 1);
  assert.deepEqual(
    lanes[1].series.map((s) => [s.label, s.slot]),
    [
      ['a', 1],
      ['b', 2],
    ],
  );
  assert.deepEqual(
    strips.map((s) => [s.label, s.points.map((p) => +p[1].toFixed(2))]),
    [
      ['Motion', [1, 0]],
      ['Lamp', [0.5, 0]],
      ['Vent', [0.5, 0]],
    ],
  );
  assert.match(
    plotCSV(samples, devices).split('\n')[0],
    /"seconds","Light","a","b","Motion","Lamp","Vent"/,
  );
});
