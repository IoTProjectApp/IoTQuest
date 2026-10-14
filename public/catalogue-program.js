import { ADC_SIGNALS, adcRead, isPico, picoWiring } from './signals.js';
import { IOTQUEST_FUNCTIONS } from './runtime.js';
// Worked programs for quests whose behaviour is more than one condition per output (timers,
// latches, counters, PWM, MQTT). Each quest writes its program once in a small C-like form, and
// this turns it into Arduino C++ or MicroPython for the quest's own wiring. The form:
// - state: the program's own variables and their starting values ({ fanOn: 0, cmd: '""' });
// - setup: statements run once (for example mqttConnect("lamp"););
// - loop: statements run on every pass, after every sensor has been read into a variable named
//   after its signal (temp, motion, light ...). Blocks use braces, one statement per line;
// - write(id, value) switches an output, pwm(id, level) sets a 0–255 brightness, print(value)
//   prints a line, csv(a, b) prints "a,b", idiv(a, b) divides whole numbers, isWhole(x) checks a
//   number has no fraction and millis() is the clock in milliseconds;
// - delay: milliseconds to wait at the end of each pass (200 unless set).
// The worked programs prove each quest can be passed; students still write their own.

const IOTQUEST = IOTQUEST_FUNCTIONS;
const lines = (text) =>
  String(text || '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

// C-like statement text to Python.
function pythonExpression(text, outputs) {
  return text
    .replace(/\bwrite\((\w+),\s*/g, (all, id) => (outputs.includes(id) ? id + '.value(' : all))
    .replace(
      /\bpwm\((\w+),\s*(.+)\)$/g,
      (all, id, level) => id + '.duty_u16((' + level + ') * 257)',
    )
    .replace(/\bidiv\(/g, 'IDIV(')
    .replace(/\bisWhole\((\w+)\)/g, '$1 == int($1)')
    .replace(/^csv\((.+), (.+)\)$/, 'print(str($1) + "," + str($2))')
    .replace(/\bmillis\(\)/g, 'time.ticks_ms()')
    .replace(/&&/g, 'and')
    .replace(/\|\|/g, 'or')
    .replace(/!(?!=)/g, 'not ')
    .replace(/\btrue\b/g, 'True')
    .replace(/\bfalse\b/g, 'False');
}
// IDIV(a, b) → (a) // (b), allowing nested brackets in a and b.
function integerDivision(text, op) {
  let at;
  while ((at = text.indexOf('IDIV(')) >= 0) {
    let depth = 0,
      comma = -1,
      end = -1;
    for (let i = at + 4; i < text.length; i++) {
      if (text[i] === '(') depth++;
      else if (text[i] === ')' && --depth === 0) {
        end = i;
        break;
      } else if (text[i] === ',' && depth === 1 && comma < 0) comma = i;
    }
    const a = text.slice(at + 5, comma).trim(),
      b = text.slice(comma + 1, end).trim();
    text = text.slice(0, at) + '((' + a + ') ' + op + ' (' + b + '))' + text.slice(end + 1);
  }
  return text;
}
function toPython(body, outputs, indent) {
  const out = [];
  let depth = indent;
  for (const line of lines(body)) {
    let m;
    if ((m = line.match(/^\}\s*else if\s*\((.*)\)\s*\{$/))) {
      depth--;
      out.push('    '.repeat(depth) + 'elif ' + pythonExpression(m[1], outputs) + ':');
      depth++;
    } else if (/^\}\s*else\s*\{$/.test(line)) {
      depth--;
      out.push('    '.repeat(depth) + 'else:');
      depth++;
    } else if ((m = line.match(/^if\s*\((.*)\)\s*\{$/))) {
      out.push('    '.repeat(depth) + 'if ' + pythonExpression(m[1], outputs) + ':');
      depth++;
    } else if (line === '}') depth--;
    else out.push('    '.repeat(depth) + pythonExpression(line.replace(/;$/, ''), outputs));
  }
  return out.map((l) => integerDivision(l, '//')).join('\n');
}
function toCpp(body, indent) {
  const out = [];
  let depth = indent;
  for (const line of lines(body)) {
    if (line.startsWith('}')) depth--;
    out.push(
      '  '.repeat(depth) +
        integerDivision(
          line
            .replace(/\bidiv\(/g, 'IDIV(')
            .replace(
              /\bwrite\((\w+),\s*([01])\)/g,
              (all, id, v) => 'digitalWrite(' + id + 'Pin, ' + (v === '1' ? 'HIGH' : 'LOW') + ')',
            )
            .replace(/\bwrite\((\w+),\s*/g, 'digitalWrite($1Pin, ')
            .replace(/\bpwm\((\w+),\s*/g, 'analogWrite($1Pin, ')
            .replace(/\bprint\(/g, 'Serial.println(')
            .replace(/\bisWhole\((\w+)\)/g, '$1 == (long)$1')
            .replace(
              /^csv\((.+), (.+)\);$/,
              'Serial.print($1);\n' +
                '  '.repeat(depth) +
                'Serial.print(",");\n' +
                '  '.repeat(depth) +
                'Serial.println($2);',
            ),
          '/',
        ),
    );
    if (line.endsWith('{')) depth++;
  }
  return out.join('\n');
}
const cppType = (value) =>
  /^"/.test(String(value)) ? 'String' : /\./.test(String(value)) ? 'float' : 'long';

// The worked program for `solution` in `language`, for the quest's devices as wired.
export function solutionProgram(mission, language, devices, board) {
  const s = mission.solution,
    inputs = devices.filter((d) => !d.output),
    outputs = devices.filter((d) => d.output),
    state = Object.entries(s.state || {}),
    wait = s.delay ?? 200,
    used = (name) => [s.setup, s.loop].some((t) => new RegExp('\\b' + name + '\\(').test(t || ''));
  if (language === 'python') {
    const pico = board ? isPico(board) : picoWiring(devices),
      pwm = outputs.filter((d) => new RegExp('\\bpwm\\(' + d.id + ',').test(s.loop)),
      imports = IOTQUEST.filter(used);
    return (
      '# ' +
      mission.title +
      '\nfrom machine import Pin' +
      (inputs.some((d) => d.analog) ? ', ADC' : '') +
      (pwm.length ? ', PWM' : '') +
      (imports.length ? '\nfrom iotquest import ' + imports.join(', ') : '') +
      '\nimport time\n\n' +
      inputs
        .map(
          (d) =>
            d.signal +
            '_sensor = ' +
            (d.analog ? 'ADC(Pin(' + d.pin + '))' : 'Pin(' + d.pin + ', Pin.IN)'),
        )
        .join('\n') +
      (inputs.length ? '\n' : '') +
      outputs
        .map((d) =>
          pwm.includes(d)
            ? d.id + ' = PWM(Pin(' + d.pin + '))'
            : d.id + ' = Pin(' + d.pin + ', Pin.OUT)',
        )
        .join('\n') +
      '\n' +
      state.map(([name, value]) => name + ' = ' + value).join('\n') +
      (state.length ? '\n' : '') +
      (s.setup
        ? toPython(
            s.setup,
            outputs.map((d) => d.id),
            0,
          ) + '\n'
        : '') +
      '\nwhile True:\n' +
      inputs
        .map(
          (d) =>
            '    ' +
            d.signal +
            ' = ' +
            d.signal +
            '_sensor.' +
            (d.analog ? adcRead(pico, d.signal) : 'value()'),
        )
        .join('\n') +
      (inputs.length ? '\n' : '') +
      toPython(
        s.loop,
        outputs.map((d) => d.id),
        1,
      ) +
      '\n    time.sleep_ms(' +
      wait +
      ')\n'
    );
  }
  return (
    '// ' +
    mission.title +
    '\n' +
    [...inputs, ...outputs].map((d) => 'const int ' + d.id + 'Pin = ' + d.pin + ';').join('\n') +
    '\n' +
    state.map(([name, value]) => cppType(value) + ' ' + name + ' = ' + value + ';\n').join('') +
    '\nvoid setup() {\n  Serial.begin(115200);\n' +
    outputs.map((d) => '  pinMode(' + d.id + 'Pin, OUTPUT);').join('\n') +
    (s.setup ? '\n' + toCpp(s.setup, 1) : '') +
    '\n}\n\nvoid loop() {\n' +
    inputs
      .map(
        (d) =>
          '  ' +
          (d.analog && !ADC_SIGNALS.includes(d.signal) ? 'float ' : 'int ') +
          d.signal +
          ' = ' +
          (d.analog ? 'analogRead' : 'digitalRead') +
          '(' +
          d.id +
          'Pin);',
      )
      .join('\n') +
    '\n' +
    toCpp(s.loop, 1) +
    '\n  delay(' +
    wait +
    ');\n}\n'
  );
}
