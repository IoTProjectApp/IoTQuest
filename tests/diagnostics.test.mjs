import test from 'node:test';
import assert from 'node:assert/strict';
import { diagnose, readingRange } from '../public/diagnostics.js';
import { analyzeCode } from '../public/code-analysis.js';
import { highlight } from '../public/syntax-highlight.js';
import { missions, defaults, program, components } from '../public/missions.js';

const devices = defaults(['ldr', 'led', 'pir', 'temp'], 'ESP32'),
  [ldr, led, pir, temp] = devices,
  rules = (code, language = 'cpp', ds = devices) => diagnose(code, language, ds).map((d) => d.rule);
const underlined = (code, d) => code.slice(d.start, d.end);

test('starter and worked-example programs produce no diagnostics on either board', () => {
  for (const board of ['ESP32', 'Raspberry Pi Pico'])
    for (const m of missions)
      for (const language of ['cpp', 'python'])
        for (const example of [false, true]) {
          const ds = defaults(m.ids, board);
          assert.deepEqual(
            diagnose(program(m, language, ds, example), language, ds),
            [],
            board + ' ' + m.title + ' ' + language,
          );
        }
});

test('every sensor signal has a known reading range', () => {
  for (const c of components.filter((c) => !c.output))
    assert.ok(readingRange(c), c.id + ' has no reading range');
});

test('a pin that is not wired is flagged with a suggestion of the matching component', () => {
  const code = `void setup() { pinMode(${led.pin}, OUTPUT); }\nvoid loop() {\n  int v = analogRead(33);\n  digitalWrite(${led.pin}, v < 1800);\n}`;
  const [d] = diagnose(code, 'cpp', devices);
  assert.equal(d.rule, 'unconnected-pin');
  assert.equal(d.line, 3);
  assert.equal(underlined(code, d), '33');
  assert.match(d.message, /GPIO 33 isn't connected.*Light sensor \(GPIO 34\)/);
  const py = `from machine import Pin\nlamp = Pin(25, Pin.OUT)\nwhile True:\n    lamp.on()`;
  const [p] = diagnose(py, 'python', devices);
  assert.equal(p.rule, 'unconnected-pin');
  assert.match(p.message, /Path lights \(GPIO 26\)/);
  assert.doesNotMatch(p.message, /Light sensor/);
});

test('nothing is reported for unwired pins before any component is installed', () => {
  assert.deepEqual(rules('void loop() { analogRead(33); }', 'cpp', []), []);
});

test('writing to a sensor and reading from an output are warnings', () => {
  const code = `void setup() { pinMode(${ldr.pin}, OUTPUT); }\nvoid loop() { digitalWrite(${ldr.pin}, HIGH); int x = digitalRead(${led.pin}); }`;
  const found = rules(code);
  assert.ok(found.includes('write-to-input'));
  assert.ok(found.includes('read-from-output'));
  const py = `from machine import Pin\nled = Pin(${led.pin}, Pin.OUT)\nwhile True:\n    led.value(not led.value())`;
  assert.deepEqual(rules(py, 'python'), []);
});

test('analogue reads of digital sensors are tips', () => {
  const d = diagnose(`void loop() { int m = analogRead(${pir.pin}); }`, 'cpp', devices);
  assert.deepEqual(
    d.map((x) => [x.severity, x.rule]),
    [['info', 'analog-on-digital']],
  );
  assert.match(d[0].message, /digitalRead/);
});

test('outputs need pinMode OUTPUT in C and Pin.OUT in MicroPython', () => {
  const missing = diagnose(
    `const int lamp = ${led.pin};\nvoid setup() {}\nvoid loop() { digitalWrite(lamp, HIGH); }`,
    'cpp',
    devices,
  );
  assert.deepEqual(
    missing.map((d) => d.rule),
    ['missing-pinmode'],
  );
  assert.match(missing[0].message, /pinMode\(lamp, OUTPUT\)/);
  assert.deepEqual(
    rules(
      `void setup() { pinMode(${led.pin}, INPUT); }\nvoid loop() { digitalWrite(${led.pin}, 1); }`,
    ),
    ['missing-pinmode'],
  );
  const py = diagnose(
    `from machine import Pin\nled = Pin(${led.pin})\nwhile True:\n    led.on()`,
    'python',
    devices,
  );
  assert.deepEqual(
    py.map((d) => [d.severity, d.rule]),
    [['info', 'missing-pin-out']],
  );
});

test('thresholds outside what a sensor can read are never or always true', () => {
  const code = `void loop() {\n  int light = analogRead(${ldr.pin});\n  int t = analogRead(${temp.pin});\n  if (light > 5000) {}\n  if (light >= 0) {}\n  if (t > 2000) {}\n  if (digitalRead(${pir.pin}) == 2) {}\n  if (light < 1800) {}\n}`;
  const d = diagnose(code, 'cpp', devices).filter((x) => x.rule === 'threshold-range');
  assert.deepEqual(
    d.map((x) => [x.line, underlined(code, x)]),
    [
      [4, 'light > 5000'],
      [5, 'light >= 0'],
      [6, 't > 2000'],
      [7, `digitalRead(${pir.pin}) == 2`],
    ],
  );
  assert.match(d[0].message, /0–4095.*never true/);
  assert.match(d[1].message, /always true/);
  assert.match(d[2].message, /calibrated in °C/);
  const py = `from machine import ADC, Pin\ns = ADC(Pin(${ldr.pin}))\nwhile True:\n    if s.read_u16() > 70000:\n        pass`;
  assert.match(diagnose(py, 'python', devices)[0].message, /0–65520 with read_u16/);
});

test('analysis resolves pins through constants and MicroPython pin objects', () => {
  const { uses } = analyzeCode(
    'from machine import Pin, ADC\nLDR = 34\nsensor = ADC(Pin(LDR))\nlamp = Pin(26, Pin.OUT)\nwhile True:\n    lamp.value(sensor.read() < 1800)',
    'python',
  );
  assert.deepEqual(
    uses.map((u) => [u.pin, u.role, u.api]),
    [
      [34, 'read', 'ADC'],
      [26, 'mode', 'Pin'],
      [26, 'write', 'lamp.value'],
      [34, 'read', 'sensor.read'],
    ],
  );
});

test('the highlighter underlines diagnostic ranges and marks their lines', () => {
  const code = 'int a = 1;\nanalogRead(33);',
    html = highlight(code, 'cpp', {
      diagnostics: [{ severity: 'warning', line: 2, start: 22, end: 24 }],
    });
  assert.match(html, /code-line diag-line-warning"><span class="syn-builtin">analogRead/);
  assert.match(html, /<span class="syn-number diag-warning">33<\/span>/);
});
test('a problem fixed in one place is reported once', () => {
  const code = `const int lamp = ${led.pin};\nconst int ldrPin = 33;\nvoid loop() {\n  int a = analogRead(ldrPin);\n  int b = analogRead(ldrPin);\n  digitalWrite(lamp, HIGH);\n  digitalWrite(lamp, LOW);\n}`;
  assert.deepEqual(
    diagnose(code, 'cpp', devices).map((d) => [d.rule, d.line]),
    [
      ['unconnected-pin', 4],
      ['missing-pinmode', 6],
    ],
  );
});
