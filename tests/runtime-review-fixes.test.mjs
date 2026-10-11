import test from 'node:test';
import assert from 'node:assert/strict';
import { Runtime, pythonToC } from '../public/runtime.js';
import { diagnose } from '../public/diagnostics.js';
import { formatCode } from '../public/code-format.js';
import { tokenize } from '../public/code-tokens.js';
import { completions } from '../public/intellisense.js';
import { attachAssist } from '../public/editor-assist.js';
import { checkOutput } from '../public/code-coach.js';
import { missions, defaults, program } from '../public/missions.js';

// Regression tests for the simulator and editor-tooling review fixes.
const led = [{ pin: 2, output: true, name: 'LED' }];
const run = (code, language = 'cpp', ticks = 1, devices = led) => {
  const rt = new Runtime(code, language, devices);
  let state;
  for (let i = 0; i < ticks; i++) state = rt.step({}, 200);
  return state;
};
const cpp = (globals, loop, ticks = 1) =>
  run(globals + '\nvoid setup() {}\nvoid loop() {\n' + loop + '\ndelay(1);\n}', 'cpp', ticks);
// A MicroPython program: `pre` at the top level, `body` inside the main loop.
const py = (body, pre = '', ticks = 1) =>
  run(
    pre +
      '\nwhile True:\n' +
      body
        .split('\n')
        .map((l) => '    ' + l)
        .join('\n') +
      '\n    time.sleep(1)',
    'python',
    ticks,
  );
const logs = (state) => state.logs;

// 1. A block header with no indented body.
test('Python: a block with no indented body is an error on the line that should be indented', () => {
  const code =
    'light = 0\nled = Pin(2, Pin.OUT)\nwhile True:\n    if light < 1800:\n    led.value(1)\n    time.sleep_ms(200)\n';
  assert.throws(
    () => pythonToC(code),
    (e) => /Expected an indented block after line 4/.test(e.message) && e.line === 5,
  );
  assert.throws(() => new Runtime(code, 'python', led), /Expected an indented block after line 4/);
  // A header on the last line has nothing after it at all.
  assert.throws(
    () => pythonToC('while True:\n    if x:'),
    (e) => /after line 2/.test(e.message) && e.line === 2,
  );
  const [problem] = diagnose(code, 'python', led).filter((d) => d.rule === 'syntax');
  assert.equal(problem.line, 5);
  assert.equal(problem.severity, 'warning');
  assert.equal(code.slice(problem.start, problem.end), 'led.value(1)');
  assert.match(problem.message, /indented block after line 4/);
});
test('C syntax errors are also reported by the editor checks', () => {
  const code = 'void setup() {}\nvoid loop() {\n  int x = 1\n}';
  const [problem] = diagnose(code, 'cpp', led).filter((d) => d.rule === 'syntax');
  assert.ok(problem);
  assert.match(problem.message, /Expected “;”/);
  assert.equal(diagnose('void setup() {}\nvoid loop() {}', 'cpp', led).length, 0);
});

// 2. Chained comparisons.
test('Python chains comparisons like a < b and b < c, working out b once', () => {
  assert.deepEqual(logs(py('print(20 < t < 30)', 't = 50')), ['False']);
  assert.deepEqual(logs(py('print(20 < t < 30)', 't = 25')), ['True']);
  assert.deepEqual(logs(py('print(1 < 2 == 2, 3 > 2 > 1, 1 < 5 <= 5 < 9)')), ['True True True']);
  assert.deepEqual(
    logs(
      py('print(1 < mid() < 9, n)', 'n = 0\ndef mid():\n    global n\n    n += 1\n    return 5\n'),
    ),
    ['True 1'],
  );
  // A false first comparison stops the chain before the rest is worked out.
  assert.deepEqual(
    logs(
      py('print(9 < 1 < mid(), n)', 'n = 0\ndef mid():\n    global n\n    n += 1\n    return 5\n'),
    ),
    ['False 0'],
  );
  assert.deepEqual(logs(py('print(not 1 < 2 < 3)')), ['False']);
});
test('C keeps C comparison semantics: 3 > 2 > 1 is (3 > 2) > 1', () => {
  assert.deepEqual(logs(cpp('', 'Serial.println(3 > 2 > 1);')), ['0']);
});

// 3. Autocomplete keys.
function fakeElement() {
  const listeners = {};
  return {
    attrs: {},
    style: {},
    dataset: {},
    hidden: false,
    value: '',
    selectionStart: 0,
    selectionEnd: 0,
    innerHTML: '',
    setAttribute(k, v) {
      this.attrs[k] = String(v);
    },
    removeAttribute(k) {
      delete this.attrs[k];
    },
    append() {},
    querySelectorAll: () => [],
    querySelector: () => null,
    getBoundingClientRect: () => ({ left: 0, top: 0, right: 700, bottom: 600 }),
    addEventListener(type, fn) {
      (listeners[type] ??= []).push(fn);
    },
    dispatchEvent(e) {
      for (const fn of listeners[e.type] || []) fn(e);
    },
  };
}
function editor() {
  globalThis.document ??= { createElement: () => fakeElement() };
  const input = fakeElement(),
    assist = attachAssist(input, fakeElement(), () => ({
      enabled: true,
      language: 'python',
      devices: [],
    }));
  const type = (value) => {
    input.value = value;
    input.selectionStart = input.selectionEnd = value.length;
    input.dispatchEvent({ type: 'input' });
  };
  const key = (k) => {
    const e = { type: 'keydown', key: k, preventDefault() {} };
    input.dispatchEvent(e);
    return e;
  };
  return { input, assist, type, key };
}
test('Enter starts a new line instead of replacing the word unless a suggestion was picked', () => {
  const { input, assist, type, key } = editor();
  const source = 'light_sensor = 0\nlight = 0\nlevel = light';
  type(source);
  assert.ok(assist.items().length, 'the list is open');
  const enter = key('Enter');
  assert.equal(enter.assistHandled, undefined, 'the editor handles Enter');
  assert.equal(input.value, source, 'the typed word is kept');
  assert.equal(assist.items().length, 0, 'the list closes');
  // Arrow keys pick from the list; then Enter accepts.
  type(source);
  key('ArrowDown');
  key('ArrowUp');
  assert.equal(key('Enter').assistHandled, true);
  assert.equal(input.value, 'light_sensor = 0\nlight = 0\nlevel = light_sensor');
  // Tab always accepts.
  type(source);
  assert.equal(key('Tab').assistHandled, true);
  assert.equal(input.value, 'light_sensor = 0\nlight = 0\nlevel = light_sensor');
  // Ctrl+Space asks for the list, so Enter then accepts.
  type('light_sensor = 0\nlevel = lig');
  input.dispatchEvent({ type: 'keydown', key: ' ', ctrlKey: true, preventDefault() {} });
  assert.equal(key('Enter').assistHandled, true);
  assert.equal(input.value, 'light_sensor = 0\nlevel = light_sensor');
});
test('suggestions only match inside names from three typed letters on', () => {
  const src = 'count = 0\nwhile True:\n    x = 1\n    total = x';
  assert.deepEqual(
    completions(src, src.length, 'python', []).map((c) => c.insert),
    [],
    'x is not offered max()',
  );
  const two = 'int t = 0;\nvoid loop() {\n  if (t';
  assert.ok(
    completions(two, two.length, 'cpp', []).every((c) => c.insert.toLowerCase().startsWith('t')),
  );
  const three = 'light_sensor = 0\nv = sen';
  assert.ok(
    completions(three, three.length, 'python', []).some((c) => c.insert === 'light_sensor'),
  );
});

// 4. Numeric suffixes.
test('the formatter keeps C++ number suffixes attached and the result still runs', () => {
  const src =
    'unsigned long last = 0;\nconst unsigned long period = 1000UL;\nfloat k = 1.5f;\nint m = 0x1Fu;\nvoid setup() { pinMode(2, OUTPUT); }\nvoid loop() {\n  if (millis() - last >= period) { last = millis(); }\n  Serial.println(k);\n  Serial.println(m);\n  delay(1);\n}\n';
  const out = formatCode(src, 'cpp');
  for (const literal of ['1000UL', '1.5f', '0x1Fu']) assert.ok(out.includes(literal), literal);
  assert.deepEqual(
    tokenize('1000UL 1.5f 0x1Fu 10L 2.5e3f', 'cpp')
      .filter((t) => t.type === 'number')
      .map((t) => t.text),
    ['1000UL', '1.5f', '0x1Fu', '10L', '2.5e3f'],
  );
  assert.deepEqual(run(out, 'cpp', 1, led).logs, ['1.50', '31']);
  // Diagnostics read suffixed pin numbers and thresholds.
  const unconnected = diagnose(
    'void setup() { pinMode(9U, OUTPUT); }\nvoid loop() { digitalWrite(9U, 1); }',
    'cpp',
    led,
  ).filter((d) => d.rule === 'unconnected-pin');
  assert.ok(unconnected.length && unconnected.every((d) => d.message.includes('GPIO 9')));
});

// 5. The Guide checks the same limits as Test your solution.
test('the Guide does not say Correct when a limit check fails', () => {
  const quest = missions.find((m) => m.title === 'Keep the Room Comfortable');
  const devices = defaults(quest.ids, 'ESP32');
  const wrongLimit = program(
    { ...quest, conditions: ['temp >= 28'] },
    'cpp',
    devices,
    true,
    'ESP32',
  );
  const verdict = checkOutput(wrongLimit, 'cpp', devices, 'ESP32', quest, 0);
  assert.equal(verdict.done, false);
  assert.match(verdict.message, /Limit check/);
  const right = program(quest, 'cpp', devices, true, 'ESP32');
  assert.equal(checkOutput(right, 'cpp', devices, 'ESP32', quest, 0).done, true);
});

// 6. Static locals.
test('C static locals keep one value per function, set up once', () => {
  assert.deepEqual(logs(cpp('', 'static int count = 0;\ncount++;\nSerial.println(count);', 3)), [
    '1',
    '2',
    '3',
  ]);
  const state = cpp(
    'int calls = 0;\nint start() { calls++; return 10; }\nint a() { static int n = start(); n += 1; return n; }\nint b() { static int n = 100; n += 5; return n; }',
    'Serial.print(a()); Serial.print(" "); Serial.print(b()); Serial.print(" "); Serial.println(calls);',
    2,
  );
  assert.deepEqual(state.logs, ['11 105 1', '12 110 1']);
});

// 7. Undeclared C variables.
test('C assignment to an undeclared variable is an error naming the likely variable', () => {
  assert.throws(
    () => cpp('int ledState = 0;', 'ledstate = 1;'),
    /'ledstate' was not declared in this scope\. Did you mean 'ledState'\?/,
  );
  assert.throws(() => cpp('', 'total = 1;'), /'total' was not declared in this scope\. Declare it/);
  assert.throws(
    () => cpp('int level = 0;', 'int x = levle;'),
    /Unknown variable: levle\. Did you mean level\?/,
  );
  // Python creates variables when they are assigned.
  assert.deepEqual(logs(py('total = 3\nprint(total)')), ['3']);
});

// 8. Text + number.
test('text + number is a clear error in both languages; text + text still joins', () => {
  assert.throws(
    () => py('print("x=" + x)', 'x = 5'),
    /TypeError: can only concatenate str \(not "int"\) to str\. .*str\(x\)/,
  );
  assert.throws(() => py('print("t=" + t)', 't = 2.5'), /not "float"/);
  assert.throws(
    () => py('print(x + "!")', 'x = 5'),
    /unsupported operand type\(s\) for \+: 'int' and 'str'/,
  );
  assert.deepEqual(logs(py('print("x=" + str(x) + "!")', 'x = 5')), ['x=5!']);
  assert.throws(
    () => cpp('int t = 5;', 'Serial.println("T: " + t);'),
    /Print the parts separately: Serial\.print\("T: "\); Serial\.println\(t\);/,
  );
  assert.deepEqual(logs(cpp('', 'Serial.println("on" + "line");')), ['online']);
});

// 9. C logical operators.
test('C && and || give 1 or 0; Python and/or give an operand', () => {
  assert.deepEqual(
    logs(
      cpp(
        '',
        'int x = 5 && 3; int y = 0 || 7; Serial.println(x); Serial.println(y); Serial.println(2 && 3); Serial.println(0 || 0);',
      ),
    ),
    ['1', '1', '1', '0'],
  );
  assert.deepEqual(logs(py('print(5 and 3, 0 or 7, 0 and 9)')), ['3 7 0']);
});

// 10. One-digit unsigned literals.
test('a U suffix on a one-digit literal makes it unsigned', () => {
  assert.deepEqual(
    logs(cpp('', 'Serial.println(1UL << 31); Serial.println(1U << 31); Serial.println(1 << 31);')),
    ['2147483648', '2147483648', '-2147483648'],
  );
});

// 11. Python min/max.
test('Python min and max keep the type of the argument they choose', () => {
  assert.deepEqual(logs(py('print(max(1, 2.5), max(3, 2.5), min(2, 3.5), min(1.0, 2))')), [
    '2.5 3 2 1.0',
  ]);
  assert.deepEqual(logs(py('y = max(4, 2.0)\nprint(y)\nz = min(4, 2.0)\nprint(z)')), ['4', '2.0']);
});

// Improvements.
test('break and continue work in both languages', () => {
  assert.deepEqual(
    logs(cpp('int i = 0;', 'while (true) { i++; if (i > 3) break; }\nSerial.println(i);')),
    ['4'],
  );
  assert.deepEqual(
    logs(
      cpp(
        '',
        'int i = 0; int odd = 0;\nwhile (i < 10) { i++; if (i % 2 == 0) continue; odd += i; }\nSerial.println(odd);',
      ),
    ),
    ['25'],
  );
  assert.deepEqual(
    logs(py('while True:\n    i += 1\n    if i > 3:\n        break\nprint(i)', 'i = 0')),
    ['4'],
  );
  assert.deepEqual(
    logs(
      py(
        'i = 0\nodd = 0\nwhile i < 10:\n    i += 1\n    if i % 2 == 0:\n        continue\n    odd += i\nprint(odd)',
      ),
    ),
    ['25'],
  );
  // continue in the main loop ends that pass like reaching its end, and the loop carries on.
  const skipped = run(
      'n = 0\nwhile True:\n    n += 1\n    time.sleep(1)\n    if n % 2:\n        continue\n    print(n)',
      'python',
      12,
    ),
    plain = run(
      'n = 0\nwhile True:\n    n += 1\n    time.sleep(1)\n    if n % 2 == 0:\n        print(n)',
      'python',
      12,
    );
  assert.deepEqual(skipped.logs, plain.logs);
  assert.deepEqual(skipped.logs.slice(0, 3), ['2', '4', '6']);
  assert.throws(
    () => new Runtime('void setup() {}\nvoid loop() { break; }', 'cpp'),
    /inside a while loop/,
  );
  assert.throws(() => new Runtime('break\nwhile True:\n    pass', 'python'), /inside a while loop/);
});
test('Python accepts if(x):, while(True):, elif(...): and else :', () => {
  assert.deepEqual(
    logs(
      run(
        'x = 5\nwhile(True):\n    if(x > 9):\n        print("big")\n    elif(x > 3):\n        print("mid")\n    else :\n        print("small")\n    time.sleep(1)',
        'python',
      ),
    ),
    ['mid'],
  );
});
test('Python accepts any consistent indentation width but not a mix within a block', () => {
  assert.deepEqual(
    logs(run('x = 5\nwhile True:\n  if x > 3:\n    print(x)\n  time.sleep(1)', 'python')),
    ['5'],
  );
  assert.throws(
    () => pythonToC('while True:\n    x = 1\n      y = 2'),
    (e) => /Unexpected indentation/.test(e.message) && e.line === 3,
  );
  assert.throws(
    () => pythonToC('while True:\n    if x:\n        y = 1\n      z = 2'),
    (e) => /does not line up/.test(e.message) && e.line === 4,
  );
});
test('C accepts several declarators in one declaration', () => {
  assert.deepEqual(
    logs(
      cpp(
        'int a = 1, b = 2, c;',
        'float f = 0.5, g; Serial.println(a + b + c); Serial.println(f + g);',
      ),
    ),
    ['3', '0.50'],
  );
});
test('C casts and the conditional operator work; unsupported constructs explain themselves', () => {
  assert.deepEqual(
    logs(
      cpp(
        'int x = 7;',
        'Serial.println((float)x / 2); Serial.println((int)3.9); Serial.println((byte)300); Serial.println(x > 3 ? 1 : 0); Serial.println(x > 9 ? 1 : x > 5 ? 2 : 3);',
      ),
    ),
    ['3.50', '3', '44', '1', '2'],
  );
  assert.deepEqual(logs(cpp('int i = 0;', '++i; ++i; --i; Serial.println(i);')), ['1']);
  assert.throws(
    () => new Runtime('void setup() {}\nvoid loop() { for (int i = 0; i < 3; i++) {} }', 'cpp'),
    /for loops are not supported here\. Use a while loop/,
  );
  assert.throws(
    () => new Runtime('while True:\n    for i in range(3):\n        pass', 'python'),
    /for loops are not supported here/,
  );
  assert.throws(
    () => new Runtime('int a[3];\nvoid loop() {}', 'cpp'),
    /Arrays and lists are not supported/,
  );
  assert.throws(
    () => new Runtime('void setup() {}\nvoid loop() { int x = 1 int y = 2; }', 'cpp'),
    /Expected “;” but found “int”/,
  );
});
