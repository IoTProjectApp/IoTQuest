import test from 'node:test';
import assert from 'node:assert/strict';
import { defaults } from '../public/missions.js';
import { Runtime } from '../public/runtime.js';
import {
  completions,
  applyCompletion,
  signatureAt,
  declaredSymbols,
  catalog,
} from '../public/intellisense.js';

const at = (text) => [text.replace('|', ''), text.indexOf('|')];
const labels = (text, language = 'cpp', devices = []) =>
  completions(...at(text), language, devices).map((c) => c.insert);

test('Arduino functions are suggested from the first letters', () => {
  assert.deepEqual(labels('void loop() {\n  digi|'), ['digitalRead', 'digitalWrite']);
  assert.ok(labels('  Serial.pr|').includes('println'));
  assert.deepEqual(labels('  pinMode(ledPin, OU|'), ['OUTPUT']);
});

test('MicroPython completes modules, pin modes and methods after a dot', () => {
  assert.deepEqual(labels('led = Pin(26, Pin.|', 'python'), ['IN', 'OUT', 'PULL_UP', 'PULL_DOWN']);
  assert.ok(labels('time.sl|', 'python').includes('sleep_ms'));
  assert.deepEqual(labels('led = Pin(26, Pin.OUT)\nled.v|', 'python'), ['value']);
});

test('the student’s own names come first, then the installed devices’ pin names', () => {
  const devices = defaults(['ldr', 'led'], 'ESP32');
  assert.equal(
    labels('const int lampLevel = 3;\nvoid loop() {\n  l|', 'cpp', devices)[0],
    'lampLevel',
  );
  assert.ok(labels('  li|', 'cpp', devices).includes('lightPin'));
  assert.ok(labels('    li|', 'python', devices).includes('light_sensor'));
});

test('nothing is suggested inside a comment or a string, or with nothing typed', () => {
  assert.deepEqual(labels('  // digi|'), []);
  assert.deepEqual(labels('  Serial.println("digi|'), []);
  assert.deepEqual(labels('    # led.v|', 'python'), []);
  assert.deepEqual(labels('  |'), []);
  assert.ok(
    completions('  ', 2, 'cpp', [], { manual: true }).length > 0,
    'Ctrl+Space lists everything',
  );
});

test('functions are inserted with their brackets, and the caret goes where typing continues', () => {
  const [source, caret] = at('  digi|');
  const write = completions(source, caret, 'cpp').find((c) => c.insert === 'digitalWrite');
  assert.deepEqual(applyCompletion(source, caret, write), {
    source: '  digitalWrite()',
    caret: 15,
  });
  const [s2, c2] = at('  mil|');
  const millis = completions(s2, c2, 'cpp').find((c) => c.insert === 'millis');
  assert.deepEqual(applyCompletion(s2, c2, millis), { source: '  millis()', caret: 10 });
  const [s3, c3] = at('  pinMode(ledPin, OU|);');
  assert.equal(
    applyCompletion(s3, c3, completions(s3, c3, 'cpp')[0]).source,
    '  pinMode(ledPin, OUTPUT);',
  );
});

test('parameter hints follow the argument being typed, including nested calls', () => {
  assert.deepEqual(signatureAt(...at('  digitalWrite(ledPin, |'), 'cpp'), {
    label: 'digitalWrite',
    params: ['pin', 'value'],
    active: 1,
    doc: 'Switches an output pin HIGH (on) or LOW (off).',
  });
  assert.equal(signatureAt(...at('  analogWrite(fanPin, min(a, |'), 'cpp').label, 'min');
  // After min(a, b) closes, the caret is on analogWrite's third argument.
  assert.equal(signatureAt(...at('  analogWrite(fanPin, min(a, b), |'), 'cpp').active, 2);
  assert.equal(signatureAt(...at('    led.value(|'), 'python').label, 'value');
  assert.equal(signatureAt(...at('  x = 1|'), 'cpp'), null);
});

test('declared names are found in both languages, ignoring comments', () => {
  assert.deepEqual(
    declaredSymbols(
      'const int lightPin = 34;\nfloat t;\nvoid blink(int n) {}\n// int ghost = 1;',
      'cpp',
    ).map((s) => s.label),
    ['lightPin', 't', 'blink'],
  );
  assert.deepEqual(
    declaredSymbols('led = Pin(26, Pin.OUT)\ndef blink():\n    pass\n# ghost = 1', 'python').map(
      (s) => s.label,
    ),
    ['led', 'blink'],
  );
});

test('every suggested function is one the simulator can run', () => {
  const devices = defaults(['ldr', 'led'], 'ESP32');
  for (const c of catalog('cpp').filter((c) => c.kind === 'function')) {
    // Reads use the sensor's pin, writes the output's.
    const pin = /Read/.test(c.label) ? devices[0].pin : devices[1].pin,
      args = c.params.map((p) => (/pin/.test(p) ? pin : /topic|clientId/.test(p) ? '"t"' : 1));
    const call = c.label + '(' + args.join(', ') + ')';
    assert.doesNotThrow(
      () =>
        new Runtime(
          `void setup() { pinMode(${devices[1].pin}, OUTPUT); }\nvoid loop() { ${call}; delay(1); }`,
          'cpp',
          devices,
          'ESP32',
        ).step({ light: 50 }),
      call,
    );
  }
});
