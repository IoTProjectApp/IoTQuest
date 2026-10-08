import test from 'node:test';
import assert from 'node:assert/strict';
import { formatCode, FormatError } from '../public/code-format.js';
import { highlight } from '../public/syntax-highlight.js';
import { tokenize } from '../public/code-tokens.js';
import { missions, defaults, program } from '../public/missions.js';
import { Runtime } from '../public/runtime.js';

test('tokenizer round-trips source exactly', () => {
  for (const [source, language] of [
    ['int x=1; /* a\nb */ // c\nx++;', 'cpp'],
    ['x = 7 // 2  # note\ns = "a # b"\n', 'python'],
  ])
    assert.equal(
      tokenize(source, language)
        .map((t) => t.text)
        .join(''),
      source,
    );
});

test('C++ formatting normalises spacing and indentation without changing tokens', () => {
  const source = [
    'const int pin=26;',
    'void setup(){pinMode(pin,OUTPUT);}',
    'void loop()',
    '{',
    'int x=analogRead(34)/40.95;   //reading',
    'if(x<10&&!flag){digitalWrite(pin,HIGH);}else{',
    'digitalWrite(pin , LOW) ;',
    '}',
    '',
    '',
    '',
    'x = -5; y = x - -3; i++; z = ++i; f( -1 , a*b );',
    '}',
  ].join('\n');
  assert.equal(
    formatCode(source, 'cpp'),
    [
      'const int pin = 26;',
      'void setup() { pinMode(pin, OUTPUT); }',
      'void loop()',
      '{',
      '  int x = analogRead(34) / 40.95; // reading',
      '  if (x < 10 && !flag) { digitalWrite(pin, HIGH); } else {',
      '    digitalWrite(pin, LOW);',
      '  }',
      '',
      '  x = -5; y = x - -3; i++; z = ++i; f(-1, a * b);',
      '}',
      '',
    ].join('\n'),
  );
});

test('Python formatting re-indents blocks to four spaces and keeps keyword arguments tight', () => {
  const source = [
    'from machine import Pin,ADC',
    'led=Pin(26,Pin.OUT)',
    'def f(a,b = 2):',
    '  global count',
    '  return a+b   #sum',
    'while True:',
    '  if not led.value()==1 and x>=3:',
    '        led.value(not led.value())',
    '  else :',
    '        print ("x",x//2,-x)',
    '  time.sleep_ms(200)',
  ].join('\n');
  assert.equal(
    formatCode(source, 'python'),
    [
      'from machine import Pin, ADC',
      'led = Pin(26, Pin.OUT)',
      'def f(a, b=2):',
      '    global count',
      '    return a + b  # sum',
      'while True:',
      '    if not led.value() == 1 and x >= 3:',
      '        led.value(not led.value())',
      '    else:',
      '        print("x", x // 2, -x)',
      '    time.sleep_ms(200)',
      '',
    ].join('\n'),
  );
});

test('formatting refuses inconsistent Python indentation instead of guessing', () => {
  assert.throws(
    () => formatCode('while True:\n    x = 1\n  y = 2\n', 'python'),
    (e) => e instanceof FormatError && /Line 3/.test(e.message),
  );
});

test('formatted starter and example programs are unchanged, idempotent and still run', () => {
  for (const board of ['ESP32', 'Raspberry Pi Pico'])
    for (const m of missions)
      for (const language of ['cpp', 'python'])
        for (const example of [false, true]) {
          const devices = defaults(m.ids, board),
            source = program(m, language, devices, example),
            formatted = formatCode(source, language);
          assert.equal(formatted.trimEnd(), source.trimEnd(), m.title + ' ' + language);
          assert.equal(formatCode(formatted, language), formatted);
          const messy = source.replace(/ = /g, '=').replace(/, /g, ',');
          assert.equal(formatCode(messy, language).trimEnd(), source.trimEnd());
          new Runtime(formatted, language, devices, board).step({}, 200);
        }
});

test('highlighter classifies Arduino and MicroPython vocabulary', () => {
  const cpp = highlight('void loop() { digitalWrite(LED, HIGH); blink(2); }', 'cpp');
  assert.match(cpp, /<span class="syn-type">void<\/span>/);
  assert.match(cpp, /<span class="syn-builtin">digitalWrite<\/span>/);
  assert.match(cpp, /<span class="syn-constant">HIGH<\/span>/);
  assert.match(cpp, /<span class="syn-function">blink<\/span>/);
  const py = highlight('if not x: led.value(True)', 'python');
  assert.match(py, /<span class="syn-keyword">not<\/span>/);
  assert.match(py, /<span class="syn-builtin">value<\/span>/);
  assert.match(py, /<span class="syn-constant">True<\/span>/);
});

test('highlighter marks the caret line, matching brackets and the error line', () => {
  const source = 'if (a) {\n  f(b);\n}',
    html = highlight(source, 'cpp', { caret: source.indexOf('{') + 1, errorLine: 2 });
  const lines = html.split('</span><span class="code-line');
  assert.equal(lines.length, 3);
  assert.match(lines[0], /current-line/);
  assert.match(lines[1], /error-line/);
  assert.equal(html.match(/syn-match/g).length, 2);
  assert.match(highlight('f(a', 'cpp', { caret: 2 }), /syn-unmatched/);
});

test('highlighter escapes markup and splits block comments across lines', () => {
  const html = highlight('/* <b>\n& */ int x;', 'cpp');
  assert.match(html, /&lt;b&gt;/);
  assert.equal(html.match(/code-line/g).length, 2);
  assert.doesNotMatch(html, /<b>/);
});
