import test from 'node:test';
import assert from 'node:assert/strict';
import { Runtime } from '../public/runtime.js';

const led = [{ pin: 2, output: true, name: 'LED' }];
const run = (code, language = 'cpp', ticks = 1, devices = led) => {
  const rt = new Runtime(code, language, devices);
  let state;
  for (let i = 0; i < ticks; i++) state = rt.step({}, 200);
  return { rt, state };
};
const cpp = (globals, loop, setup = '') =>
  run(globals + ' void setup() {' + setup + '} void loop() {' + loop + '}');
const py = (code, ticks = 1) => run(code, 'python', ticks);

test('C parameters and locals do not overwrite same-named globals', () => {
  const { rt } = cpp(
    'int x = 100; int i = 100; int r = 0; int f(int x) { x = x + 1; return x; } void g() { int i = 0; i = i + 1; }',
    'r = f(5); g();',
  );
  assert.equal(rt.vars.get('x'), 100);
  assert.equal(rt.vars.get('i'), 100);
  assert.equal(rt.vars.get('r'), 6);
});
test('C functions can still update globals they do not shadow', () => {
  const { rt } = cpp('int count = 0; void bump() { count = count + 1; }', 'bump(); bump();');
  assert.equal(rt.vars.get('count'), 2);
});
test('C block-scoped declarations do not leak or clobber outer variables', () => {
  const { rt } = cpp('int v = 1; int seen = 0;', 'int v = 5; if (true) { int v = 9; } seen = v;');
  assert.equal(rt.vars.get('v'), 1);
  assert.equal(rt.vars.get('seen'), 5);
});
test('Python def: assignment creates a local unless declared global', () => {
  const { rt } = py(
    'x = 1\ny = 1\ndef f(x):\n    x = x + 10\n    return x\ndef g():\n    global y\n    y = y + 1\nr = 0\nwhile True:\n    r = f(5)\n    g()\n    time.sleep(1)',
  );
  assert.equal(rt.vars.get('x'), 1);
  assert.equal(rt.vars.get('y'), 2);
  assert.equal(rt.vars.get('r'), 15);
  assert.throws(
    () => py('n = 0\ndef inc():\n    n = n + 1\nwhile True:\n    inc()\n    time.sleep(1)'),
    /used before it is assigned.*global n/,
  );
});
test('function calls are O(1) in the number of globals', () => {
  let globals = '';
  for (let i = 0; i < 3000; i++) globals += 'int v' + i + ';';
  const rt = new Runtime(
    globals + 'void f() {} void setup() {} void loop() { while (true) { f(); } }',
    'cpp',
    [],
  );
  const started = performance.now();
  assert.throws(() => rt.step({}, 200), /Execution limit/);
  assert.ok(performance.now() - started < 200);
});
test('failed calls restore scope and recursion depth', () => {
  const rt = new Runtime(
    'int g = 1; void f(int loc) { g = 1 / 0; } void setup() {} void loop() { f(5); }',
    'cpp',
    [],
  );
  assert.throws(() => rt.step({}, 200), /Division by zero/);
  assert.equal(rt.depth, 0);
  assert.equal(rt.vars.has('loc'), false);
});
test('recursion allows exactly 30 nested calls', () => {
  const code = (n) =>
    'int r = 0; int f(int n) { if (n <= 1) return 1; return 1 + f(n - 1); } void setup() {} void loop() { r = f(' +
    n +
    '); }';
  assert.equal(run(code(30)).rt.vars.get('r'), 30);
  assert.throws(() => run(code(31)), /recursion limit/);
});
test('C delay suspends loop() and the next tick resumes after it', () => {
  const rt = new Runtime(
    'void setup() { pinMode(2, OUTPUT); } void loop() { digitalWrite(2, HIGH); delay(500); digitalWrite(2, LOW); delay(500); }',
    'cpp',
    led,
  );
  assert.deepEqual(
    [1, 2, 3, 4].map(() => rt.step({}, 200).outputs[2]),
    [1, 0, 1, 0],
  );
});
test('C delay inside a nested while ends the whole tick, not just the inner loop', () => {
  const rt = new Runtime(
    'int n = 0; int done = 0; void setup() { pinMode(2, OUTPUT); } void loop() { n = 0; while (n < 3) { delay(10); n++; } done = done + 1; digitalWrite(2, HIGH); }',
    'cpp',
    led,
  );
  const states = [1, 2, 3, 4].map(() => rt.step({}, 200));
  assert.deepEqual(
    states.map((s) => s.variables.n),
    [0, 1, 2, 0],
  );
  assert.equal(states[2].outputs[2], undefined);
  assert.equal(states[3].variables.done, 1);
  assert.equal(states[3].outputs[2], 1);
});
test('a delay does not leak into later statements', () => {
  const { state } = cpp('int n = 0;', 'n = 0; delay(10); while (n < 5) { n++; }');
  assert.equal(state.variables.n, 0);
  const next = new Runtime(
    'int n = 0; int m = 0; void setup() {} void loop() { n = 0; delay(10); m = 0; while (m < 5) { m++; } }',
    'cpp',
    [],
  );
  next.step({}, 200);
  assert.equal(next.step({}, 200).variables.m, 5);
});
test('C delay in setup() pauses setup and resumes it next tick', () => {
  const rt = new Runtime(
    'int ready = 0; void setup() { delay(1000); pinMode(2, OUTPUT); ready = 1; } void loop() { digitalWrite(2, ready); delay(100); }',
    'cpp',
    led,
  );
  assert.equal(rt.step({}, 200).outputs[2], undefined);
  assert.equal(rt.step({}, 200).outputs[2], 1);
});
test('Python sleep inside a nested loop ends the tick and resumes', () => {
  const { rt } = py(
    'c = 0\nwhile True:\n    c = c + 1\n    i = 0\n    while i < 3:\n        time.sleep_ms(10)\n        i = i + 1',
    4,
  );
  assert.equal(rt.vars.get('c'), 2);
  assert.equal(rt.vars.get('i'), 0);
});
test('Python blink with two sleeps alternates each tick', () => {
  const rt = new Runtime(
    'from machine import Pin\nimport time\nled = Pin(2, Pin.OUT)\nwhile True:\n    led.value(1)\n    time.sleep(0.5)\n    led.value(0)\n    time.sleep(0.5)',
    'python',
    led,
  );
  assert.deepEqual(
    [1, 2, 3].map(() => rt.step({}, 200).outputs[2]),
    [1, 0, 1],
  );
});
test('Python not has lower precedence than comparisons', () => {
  const { rt } = py(
    'x = 3\na = not x == 5\nb = not x == 3 or x == 3\nc = x == 3 and not x == 4\nwhile True:\n    time.sleep(1)',
  );
  assert.equal(rt.vars.get('a'), true);
  assert.equal(rt.vars.get('b'), true);
  assert.equal(rt.vars.get('c'), true);
});
test('Python floor division and floored modulo', () => {
  const { rt } = py(
    'a = 7 // 2\nb = -7 // 2\nc = -7 % 3\nd = 7 % -3\ne = 7 / 2\nwhile True:\n    time.sleep(1)',
  );
  assert.deepEqual(
    ['a', 'b', 'c', 'd', 'e'].map((k) => rt.vars.get(k)),
    [3, -4, 2, -2, 3.5],
  );
  assert.throws(() => py('a = 1 % 0\nwhile True:\n    time.sleep(1)'), /Division by zero\./);
  assert.throws(() => py('a = 1 // 0\nwhile True:\n    time.sleep(1)'), /Division by zero\./);
});
test('C modulo by zero is an error and C modulo keeps the dividend sign', () => {
  assert.throws(() => cpp('int a = 0;', 'a = 1 % 0;'), /Division by zero\./);
  assert.equal(cpp('int a = 0;', 'a = -7 % 3;').rt.vars.get('a'), -1);
});
test('C integer types truncate and integer division truncates toward zero', () => {
  const { rt } = cpp(
    'int a = 7 / 2; int b = -7 / 2; float c = 7 / 2; float d = 7.0 / 2; float t = 9; float e = 0; int f = 2.9; byte g = 300; long h = -2.5; unsigned int u = 0; float pct = 0;',
    'e = t / 2; u = -1; pct = 2048 / 40.95;',
  );
  assert.equal(rt.vars.get('a'), 3);
  assert.equal(rt.vars.get('b'), -3);
  assert.equal(rt.vars.get('c'), 3);
  assert.equal(rt.vars.get('d'), 3.5);
  assert.equal(rt.vars.get('e'), 4.5);
  assert.equal(rt.vars.get('f'), 2);
  assert.equal(rt.vars.get('g'), 44);
  assert.equal(rt.vars.get('h'), -2);
  assert.equal(rt.vars.get('u'), 4294967295);
  assert.ok(Math.abs(rt.vars.get('pct') - 50.012) < 0.001);
});
test('C int parameters and return values are truncated', () => {
  const { rt } = cpp(
    'int r = 0; float q = 0; int half(int x) { return x / 2.0; }',
    'r = half(7.9); q = half(9);',
  );
  assert.equal(rt.vars.get('r'), 3);
  assert.equal(rt.vars.get('q'), 4);
});
test('== and != compare booleans with numbers', () => {
  const { rt } = cpp('int a = 0; int b = 0;', 'a = ((3 > 1) == 1); b = (true != 1);');
  assert.equal(rt.vars.get('a'), 1);
  assert.equal(rt.vars.get('b'), 0);
  const p = py('a = (3 > 1) == 1\nb = True == 1\nwhile True:\n    time.sleep(1)').rt;
  assert.equal(p.vars.get('a'), true);
  assert.equal(p.vars.get('b'), true);
});
test('MicroPython output pins read back their level and pull constants are accepted', () => {
  const rt = new Runtime(
    'from machine import Pin\nimport time\nled = Pin(2, Pin.OUT)\nb = Pin(4, Pin.IN, Pin.PULL_UP)\nup = Pin.PULL_UP\ndown = Pin.PULL_DOWN\nwhile True:\n    led.value(not led.value())\n    time.sleep(1)',
    'python',
    led,
  );
  assert.deepEqual(
    [1, 2, 3].map(() => rt.step({}, 200).outputs[2]),
    [1, 0, 1],
  );
  assert.ok(rt.vars.get('up') > 0 && rt.vars.get('down') > 0);
  assert.notEqual(rt.vars.get('up'), rt.vars.get('down'));
});
test('Python top-level statements run in order and code after the main loop is unreachable', () => {
  const { rt, state } = py('a = 1\nprint(a)\nwhile True:\n    print(a)\n    time.sleep(1)\na = 99');
  assert.equal(rt.vars.get('a'), 1);
  assert.deepEqual(state.logs, ['1', '1']);
  assert.equal(py('a = 1\nb = a + 1\nwhile True:\n    time.sleep(1)').rt.vars.get('b'), 2);
});
test('functions defined inside blocks give a clear error', () => {
  assert.throws(
    () => py('while True:\n    def f():\n        return 1\n    time.sleep(1)'),
    (e) => /defined at top level/.test(e.message) && e.line === 2,
  );
  assert.throws(
    () => new Runtime('void setup() {} void loop() { if (true) { int f() { return 1; } } }', 'cpp'),
    /defined at top level/,
  );
});
test('deep nesting is rejected with a line number instead of crashing', () => {
  const deep =
    'int a = ' + '('.repeat(5000) + '1' + ')'.repeat(5000) + ';\nvoid setup() {} void loop() {}';
  assert.throws(
    () => new Runtime(deep, 'cpp'),
    (e) => /nested too deeply/.test(e.message) && e.line === 1,
  );
  assert.ok(
    new Runtime(
      'int a = ' + '('.repeat(40) + '1' + ')'.repeat(40) + '; void setup() {} void loop() {}',
      'cpp',
    ),
  );
});
test('string escapes are decoded', () => {
  const { state } = cpp('', 'Serial.println("say \\"hi\\"\\tback\\\\slash\\nnext");');
  assert.equal(state.logs[0], 'say "hi"\tback\\slash\nnext');
  const p = py("s = 'it\\'s # not a comment'\nprint(s)\nwhile True:\n    time.sleep(1)");
  assert.equal(p.state.logs[0], "it's # not a comment");
});
test('pinMode validates pin numbers and ignores prototype keys', () => {
  assert.throws(
    () => run('void setup() { pinMode("__proto__", 5); } void loop() {}'),
    /pinMode needs a GPIO pin number/,
  );
  const { state } = run(
    'int __proto__ = 5; void setup() { pinMode(2, OUTPUT); } void loop() { digitalWrite(2, __proto__); }',
  );
  assert.equal(state.outputs[2], 5);
  assert.equal(Object.getPrototypeOf(state.variables), Object.prototype);
});
test('debug stepping walks statements and steps into statement-level user calls', () => {
  const rt = new Runtime(
    'int n = 0; void bump() { n = n + 1; } void setup() {} void loop() { bump(); delay(100); }',
    'cpp',
    [],
  );
  const lines = [];
  let r;
  do {
    r = rt.debugStep({});
    lines.push(r.variables.n);
  } while (!r.tickComplete && lines.length < 20);
  assert.equal(r.tickComplete, true);
  assert.equal(r.variables.n, 1);
  assert.equal(rt.step({}).variables.n, 2);
});
