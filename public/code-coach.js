import { Runtime } from './runtime.js';
import { baseEnv, defaults } from './missions.js';
import { boundaryScenarios } from './quest-boundaries.js';
import { ADC_SIGNALS as ADC, ADC_SCALE, adcRead, isPico } from './signals.js';
// The code coach. Students write the whole program themselves: the editor starts with only the
// quest's title and goal as comments, and the guide walks through each part (imports, pin names,
// setup, the loop, sensor readings and decisions), explaining what the code does and why. Each
// step is checked as they type, and hints build up one at a time. No code is put in the editor.

const python = (language) => language === 'python';
const inputsOf = (devices) => devices.filter((d) => !d.output),
  outputsOf = (devices) => devices.filter((d) => d.output);
const escapeRe = (text) => String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const lower = (d) => d.name.toLowerCase();

// Names the guide suggests: lightPin / ledPin in C++, light_sensor / led in MicroPython.
export function suggestedName(d, language) {
  if (python(language)) return d.output ? d.id : d.signal + '_sensor';
  return (d.output ? d.id : d.signal) + 'Pin';
}

// The starting editor: comments only. Students write every line of code.
export function guidedStarter(mission, language) {
  const c = python(language) ? '# ' : '// ';
  return (
    c +
    mission.title +
    '\n' +
    c +
    'Goal: ' +
    mission.goal +
    '\n' +
    c +
    'Write your program below. The Guide beside the editor explains each step.\n\n'
  );
}

// The quest's devices in the quest's own order (output i follows condition i), whatever order
// the student installed them in; devices the quest does not use are left out.
export function questDevices(mission, devices, board = 'ESP32') {
  const planned = defaults(mission.ids, board);
  return mission.ids.map(
    (id) => devices.find((d) => d.id === id) ?? planned.find((d) => d.id === id),
  );
}
// Strips comments so examples in comments never count as code.
function codeOnly(code, language) {
  if (!python(language))
    code = code.replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, ' '));
  return code
    .split('\n')
    .map((line) => line.replace(python(language) ? /#.*$/ : /\/\/.*$/, ''))
    .join('\n');
}
// The name the student gave a device's pin (or pin object), found by its GPIO number.
function pinName(code, d, language) {
  const pin = escapeRe(d.pin);
  const m = python(language)
    ? code.match(
        d.output
          ? new RegExp(
              '^\\s*(\\w+)\\s*=\\s*Pin\\(\\s*' + pin + '\\s*,\\s*Pin\\.OUT\\b[^)]*\\)',
              'm',
            )
          : d.analog
            ? new RegExp(
                '^\\s*(\\w+)\\s*=\\s*ADC\\(\\s*(?:Pin\\(\\s*' + pin + '\\s*\\)|' + pin + ')\\s*\\)',
                'm',
              )
            : new RegExp(
                '^\\s*(\\w+)\\s*=\\s*Pin\\(\\s*' + pin + '\\s*,\\s*Pin\\.IN\\b[^)]*\\)',
                'm',
              ),
      )
    : code.match(
        new RegExp(
          '\\b(?:const\\s+)?(?:unsigned\\s+)?(?:int|byte|uint8_t|long|short)\\s+(\\w+)\\s*=\\s*' +
            pin +
            '\\s*;',
        ),
      );
  return m ? m[1] : null;
}
// Where the repeating part starts, so readings can be checked to be inside it.
const loopStart = (code, language) =>
  code.search(python(language) ? /^while\s+True\s*:/m : /\bvoid\s+loop\s*\(\s*\)\s*\{/);

export const OPERATORS = {
  '<': [
    'is below',
    '< means “less than”. The threshold itself is not less than itself, so it counts as false.',
  ],
  '<=': [
    'is at or below',
    '<= means “less than or equal to”. The threshold itself counts as true.',
  ],
  '>': ['is above', '> means “greater than”. The threshold itself counts as false.'],
  '>=': [
    'is at or above',
    '>= means “greater than or equal to”. The threshold itself counts as true.',
  ],
  '==': ['is', '== compares two values. Use two equals signs: a single = stores a value instead.'],
  '!=': ['is not', '!= means “not equal to”.'],
};
const label = (devices, signal) =>
  (devices.find((d) => d.signal === signal)?.name || signal).toLowerCase();

// Plain-English reading of a mission condition such as "soil < 2400 && tank > 0".
export function describeCondition(condition, devices) {
  return condition
    .split(/\s*(&&|\|\|)\s*/)
    .map((part) => {
      if (part === '&&') return 'and';
      if (part === '||') return 'or';
      const m = part.match(/^\(?\s*(\w+)\s*(<=|>=|==|!=|<|>)\s*(-?[\d.]+)\s*\)?$/);
      if (!m) return part;
      const [, signal, op, value] = m,
        digital = !devices.find((d) => d.signal === signal)?.analog;
      if (digital && op === '==' && (value === '1' || value === '0'))
        return 'the ' + label(devices, signal) + ' reads ' + (value === '1' ? 'HIGH' : 'LOW');
      return 'the ' + signal + ' reading ' + OPERATORS[op][0] + ' ' + value;
    })
    .join(' ');
}
const conditionFor = (condition, language) =>
  python(language) ? condition.replace(/&&/g, 'and').replace(/\|\|/g, 'or') : condition;

export function readingText(env, devices) {
  return Object.entries(env)
    .map(([signal, v]) => {
      const d = devices.find((d) => d.signal === signal);
      if (!d) return null;
      if (!d.analog) return signal + ' ' + (v ? 'HIGH' : 'LOW');
      return signal + ' ' + (ADC.includes(signal) ? Math.round(v * ADC_SCALE) : v);
    })
    .filter(Boolean)
    .join(', ');
}

// Runs the student's program through the mission scenarios and the limit checks either side of
// every threshold (the same ones Test your solution runs) and checks one output.
export function checkOutput(code, language, devices, board, mission, index) {
  let runtime;
  try {
    runtime = new Runtime(code, language, devices, board);
  } catch (e) {
    return { done: false, message: 'The program has an error: ' + e.message };
  }
  const out = outputsOf(devices)[index];
  for (const [name, env, expected] of [
    ...mission.scenarios,
    ...boundaryScenarios(mission, baseEnv),
  ]) {
    let result;
    try {
      // As many steps as the mission tests, so a program that reads, waits and then decides
      // gets the same verdict here as in Test your solution.
      for (let i = 0; i < 25; i++) result = runtime.step({ ...baseEnv, ...env });
    } catch (e) {
      return { done: false, message: 'The program stopped with an error: ' + e.message };
    }
    const on = (result.outputs[out.pin] || 0) > 0 ? 1 : 0;
    if (on !== expected[index])
      return {
        done: false,
        message:
          'Not yet. In “' +
          name +
          '” (' +
          readingText(env, devices) +
          ') the ' +
          lower(out) +
          ' should be ' +
          (expected[index] ? 'ON' : 'OFF') +
          ', but it is ' +
          (on ? 'ON' : 'OFF') +
          '.',
      };
  }
  return { done: true, message: 'Correct in every scenario, including the exact threshold.' };
}

const done = (message) => ({ done: true, message }),
  waiting = (message) => ({ done: false, message });

// Python: import the hardware and time tools.
function importStep(devices) {
  const analog = devices.some((d) => d.analog);
  return {
    key: 'imports',
    title: 'Bring in the tools',
    body: [
      'A MicroPython program starts by importing the tools it needs. `machine` talks to the board’s hardware: `Pin` controls a GPIO pin' +
        (analog
          ? ' and `ADC` (analogue-to-digital converter) measures a voltage as a number.'
          : '.'),
      '`time` lets the program pause between checks, so it does not run flat out and waste energy.',
    ],
    task: 'At the top of the editor, write:',
    pattern: 'from machine import Pin' + (analog ? ', ADC' : '') + '\nimport time',
    hints: ['Spelling and capital letters matter: `Pin` and `ADC` start with capitals.'],
    check: (raw) => {
      const code = codeOnly(raw, 'python');
      const machine = code.match(/^from\s+machine\s+import\s+(.+)$/m),
        names = machine ? machine[1].split(',').map((s) => s.trim()) : [];
      if (!machine) return waiting('Waiting for: from machine import …');
      if (!names.includes('Pin')) return waiting('Import Pin from machine as well.');
      if (analog && !names.includes('ADC'))
        return waiting('This circuit has an analogue sensor, so also import ADC.');
      if (!/^import\s+time\s*$/m.test(code)) return waiting('Waiting for: import time');
      return done('The hardware and time tools are ready.');
    },
  };
}

function pinsStep(devices, language) {
  const py = python(language),
    line = (d, pin = '____') =>
      py
        ? suggestedName(d, language) +
          ' = ' +
          (d.output
            ? 'Pin(' + pin + ', Pin.OUT)'
            : d.analog
              ? 'ADC(Pin(' + pin + '))'
              : 'Pin(' + pin + ', Pin.IN)')
        : 'const int ' + suggestedName(d, language) + ' = ' + pin + ';';
  return {
    key: 'pins',
    title: 'Name your pins',
    body: [
      'Each device is wired to a GPIO pin (see the Wiring tab): ' +
        devices.map((d) => 'the ' + lower(d) + ' is on GPIO ' + d.pin).join(', ') +
        '.',
      py
        ? 'Create one object per pin. `ADC(Pin(n))` reads an analogue sensor as a number, `Pin(n, Pin.IN)` reads a digital sensor as 1 or 0, and `Pin(n, Pin.OUT)` is an output you can switch on and off. The name on the left is how the rest of your code refers to it.'
        : 'Give each pin a name with `const int`, so your code says `' +
          suggestedName(devices[0], language) +
          '` instead of a bare number. `int` is a whole number and `const` means it never changes. If you rewire, you only change this one line.',
    ],
    task: 'Under the comments, write one line per device and fill in its GPIO number:',
    pattern: devices.map((d) => line(d)).join('\n'),
    hints: [
      'The numbers are in the sentence above, and in the Wiring tab.',
      'The lines are:\n' + devices.map((d) => line(d, d.pin)).join('\n'),
    ],
    check: (raw) => {
      const code = codeOnly(raw, language);
      for (const d of devices) {
        if (pinName(code, d, language)) continue;
        const wrong = code.match(
          new RegExp(
            '\\b' +
              escapeRe(suggestedName(d, language)) +
              (py ? '\\s*=\\s*(?:ADC\\()?Pin\\(\\s*(\\d+)' : '\\s*=\\s*(\\d+)'),
          ),
        );
        if (wrong && wrong[1] !== String(d.pin))
          return waiting(
            '`' +
              suggestedName(d, language) +
              '` uses GPIO ' +
              wrong[1] +
              ', but the ' +
              lower(d) +
              ' is wired to GPIO ' +
              d.pin +
              '.',
          );
        if (!py && /#define\b/.test(code))
          return waiting('Use `const int` for pin names: the simulator does not support #define.');
        if (py && new RegExp('Pin\\(\\s*' + d.pin + '\\b').test(code))
          return waiting(
            'Check the ' +
              lower(d) +
              ' line: ' +
              (d.output
                ? 'outputs use Pin(n, Pin.OUT).'
                : d.analog
                  ? 'analogue sensors use ADC(Pin(n)).'
                  : 'digital sensors use Pin(n, Pin.IN).'),
          );
        return waiting('Still to name: the ' + lower(d) + ' on GPIO ' + d.pin + '.');
      }
      return done('Every device has a name.');
    },
  };
}

function setupStep(devices) {
  const outputs = outputsOf(devices);
  return {
    key: 'setup',
    title: 'Write setup()',
    body: [
      '`setup()` runs once, when the board powers on. `void` means it does not give back a value; the code between `{` and `}` belongs to it.',
      '`Serial.begin(115200);` opens the Serial monitor (115200 is the speed), so you can print readings with `Serial.println()`. `pinMode(pin, OUTPUT);` makes a pin send power out. Each statement ends with a semicolon.',
    ],
    task: 'Write setup() below your pin names:',
    pattern:
      'void setup() {\n  Serial.begin(115200);\n' +
      outputs.map(() => '  pinMode(____, OUTPUT);').join('\n') +
      '\n}',
    hints: [
      'Inside pinMode, use the name you gave the output pin' + (outputs.length > 1 ? 's.' : '.'),
      'The pinMode line' +
        (outputs.length > 1 ? 's are' : ' is') +
        ': ' +
        outputs.map((d) => '`pinMode(' + suggestedName(d, 'cpp') + ', OUTPUT);`').join(' '),
    ],
    check: (raw) => {
      const code = codeOnly(raw, 'cpp');
      if (!/\bvoid\s+setup\s*\(\s*\)\s*\{/.test(code))
        return waiting('Waiting for: void setup() {');
      for (const d of outputs) {
        const name = pinName(code, d, 'cpp'),
          target = name ? escapeRe(name) + '|' + d.pin : String(d.pin);
        if (!new RegExp('pinMode\\s*\\(\\s*(' + target + ')\\s*,\\s*OUTPUT\\s*\\)').test(code))
          return waiting('Set the ' + lower(d) + ' pin as an OUTPUT with pinMode.');
      }
      return done('setup() prepares the board.');
    },
  };
}

function loopStep(language) {
  const py = python(language);
  return {
    key: 'loop',
    title: py ? 'Repeat forever' : 'Write loop()',
    body: py
      ? [
          '`while True:` repeats the indented lines under it forever. The colon starts a block, and every line inside it is indented by four spaces.',
          '`time.sleep_ms(200)` pauses for 200 milliseconds, so the program checks its sensors five times a second.',
        ]
      : [
          'After setup(), the board runs `loop()` again and again, forever. Your readings and decisions go inside it.',
          '`delay(200);` pauses for 200 milliseconds at the end of each pass, so the program checks its sensors five times a second.',
        ],
    task: py ? 'Below your pins, write:' : 'Below setup(), write:',
    pattern: py
      ? 'while True:\n    # readings and decisions go here\n    time.sleep_ms(200)'
      : 'void loop() {\n  // readings and decisions go here\n  delay(200);\n}',
    hints: [
      py
        ? 'Indent time.sleep_ms(200) by four spaces so it is inside the loop.'
        : 'Remember the semicolon after delay(200).',
    ],
    check: (raw) => {
      const code = codeOnly(raw, language);
      if (py) {
        if (!/^while\s+True\s*:\s*$/m.test(code)) return waiting('Waiting for: while True:');
        if (!/^\s+time\.sleep(_ms)?\s*\(/m.test(code))
          return waiting('Add time.sleep_ms(200), indented inside the loop.');
        return done('The program now repeats forever.');
      }
      if (!/\bvoid\s+loop\s*\(\s*\)\s*\{/.test(code)) return waiting('Waiting for: void loop() {');
      if (!/\bdelay\s*\(\s*\d+\s*\)\s*;/.test(code.slice(loopStart(code, language))))
        return waiting('Add delay(200); inside loop().');
      return done('loop() repeats forever.');
    },
  };
}

function readStep(d, language, board) {
  const py = python(language),
    pico = isPico(board),
    calibrated = d.analog && !ADC.includes(d.signal),
    fn = py
      ? d.analog
        ? adcRead(pico, d.signal)
        : 'value()'
      : d.analog
        ? 'analogRead'
        : 'digitalRead',
    line = (source = '____') =>
      py
        ? d.signal + ' = ' + source + '.' + fn
        : (calibrated ? 'float ' : 'int ') + d.signal + ' = ' + fn + '(' + source + ');';
  return {
    key: 'read-' + d.signal,
    title: 'Read the ' + lower(d),
    body: [
      (d.analog
        ? 'The ' +
          lower(d) +
          (calibrated
            ? ' is a virtual calibrated channel: `' + fn + '` gives a reading in its stated units. '
            : ' is analogue: `' + fn + '` turns its voltage into a number. ')
        : 'The ' + lower(d) + ' is digital: `' + fn + '` gives 1 (HIGH) or 0 (LOW). ') + d.desc,
      'Store the reading in a variable called `' +
        d.signal +
        '`. A variable is a named box: your decision will compare `' +
        d.signal +
        '` with a threshold.' +
        (py
          ? ''
          : calibrated
            ? ' `float` keeps decimal readings, so your threshold comparisons stay accurate.'
            : ' `int` means it holds a whole number.') +
        ' Read it inside the loop, so it is measured again on every pass.',
      ...(py && pico && d.analog
        ? [
            'The Pico’s MicroPython has no `read()`: `read_u16()` measures from 0 to 65535, and ' +
              (calibrated
                ? '`/ 16` turns that into this channel’s units.'
                : '`>> 4` (shift right by 4 bits, the same as dividing by 16) gives 0–4095 like the other boards.'),
          ]
        : []),
    ],
    task: 'At the start of the loop' + (py ? ' (indented four spaces)' : '') + ', write:',
    pattern: line(),
    hints: [
      'Use the name you gave the ' + lower(d) + ' in “Name your pins”.',
      'The line is: `' + line(suggestedName(d, language)) + '`',
    ],
    check: (raw) => {
      const code = codeOnly(raw, language),
        name = pinName(code, d, language);
      if (!name) return waiting('First name the ' + lower(d) + ' pin (step “Name your pins”).');
      const read = py
          ? new RegExp(
              '^\\s*(\\w+)\\s*=\\s*' +
                escapeRe(name) +
                '\\.(read|read_u16|value)\\s*\\(\\s*\\)[ \\t]*((?:>>|\\/\\/?)[ \\t]*\\d+)?',
              'm',
            )
          : new RegExp(
              '(?:\\b(?:int|long|float|double|bool|byte)\\s+)?\\b(\\w+)\\s*=\\s*(analogRead|digitalRead)\\s*\\(\\s*(?:' +
                escapeRe(name) +
                '|' +
                d.pin +
                ')\\s*\\)',
            ),
        m = code.match(read);
      if (!m) return waiting('Waiting for: ' + line(name).replace(/;$/, ''));
      // A Pico reading is read_u16() scaled down: `>> 4` or `/ 16` (or `// 16`) both count.
      const used = py ? m[2] + '()' + (m[3] ? (m[3].includes('>') ? ' >> 4' : ' / 16') : '') : m[2];
      if (py && pico && m[2] === 'read')
        return waiting('The Pico has no ADC read(): use `' + fn + '`.');
      if (py && m[2] === 'read_u16' && !/^(>>\s*4|\/\/?\s*16)$/.test(m[3] || ''))
        return waiting(
          'read_u16() gives 0–65535: write `' + fn + '` to get the same units as the thresholds.',
        );
      if (used !== fn && !(py && d.analog && used.startsWith('read_u16() ')))
        return waiting(
          'This sensor is ' + (d.analog ? 'analogue' : 'digital') + ', so use `' + fn + '`.',
        );
      const start = loopStart(code, language);
      if (start < 0 || code.indexOf(m[0]) < start)
        return waiting('Move the reading inside the loop, so it is measured again on every pass.');
      return done('The reading is stored in `' + m[1] + '`.');
    },
  };
}

function decideStep(mission, d, i, devices, language, board) {
  const py = python(language),
    condition = mission.conditions[i] || 'false',
    words = describeCondition(condition, devices),
    ops = [...new Set(condition.match(/<=|>=|==|!=|<|>|&&|\|\|/g) || [])],
    used = [...new Set(condition.match(/[a-zA-Z_]\w*/g) || [])].filter((s) =>
      devices.some((x) => x.signal === s),
    ),
    name = suggestedName(d, language),
    outputs = outputsOf(devices);
  return {
    key: 'decide-' + i,
    title: 'Switch the ' + lower(d),
    body: [
      'Now the decision. An `if` checks a condition: when it is true the first block runs, otherwise the `else` block runs. With both, the ' +
        lower(d) +
        ' is always told what to do, so it switches off again.',
      'Mission rule: turn the ' + lower(d) + ' ON when ' + words + '. Otherwise turn it OFF.',
      ...ops.map((op) =>
        op === '&&'
          ? (py ? '`and`' : '`&&`') + ' (AND) is true only when both sides are true.'
          : op === '||'
            ? (py ? '`or`' : '`||`') + ' (OR) is true when either side is true.'
            : OPERATORS[op][1],
      ),
      py
        ? '`' + name + '.value(1)` switches it on and `' + name + '.value(0)` switches it off.'
        : '`digitalWrite(' + name + ', HIGH);` switches it on and `LOW` switches it off.',
    ],
    task:
      'After the reading' +
      (used.length > 1 ? 's' : '') +
      (py ? ', indented inside the loop' : '') +
      ', write an if/else' +
      (outputs.length > 1 ? ' for the ' + lower(d) : '') +
      ' and replace ____ with your condition:',
    pattern: py
      ? 'if ____:\n    ' + name + '.value(1)\nelse:\n    ' + name + '.value(0)'
      : 'if (____) {\n  digitalWrite(' +
        name +
        ', HIGH);\n} else {\n  digitalWrite(' +
        name +
        ', LOW);\n}',
    hints: [
      'Your condition uses the variable' +
        (used.length > 1 ? 's ' : ' ') +
        used.map((s) => '`' + s + '`').join(' and ') +
        (ops.length
          ? ' and ' +
            ops
              .map((o) => '`' + (py ? o.replace('&&', 'and').replace('||', 'or') : o) + '`')
              .join(', ')
          : '') +
        '.',
      'In words: ON when ' + words + '.',
      'The condition is `' + conditionFor(condition, language) + '`',
    ],
    check: (code) => {
      if (loopStart(codeOnly(code, language), language) < 0)
        return waiting(
          'Write the loop first (step “' + (py ? 'Repeat forever' : 'Write loop()') + '”).',
        );
      return checkOutput(code, language, devices, board, mission, i);
    },
  };
}

// The guide for a mission: one step per part of the program, each explaining what to write.
export function coachSteps(mission, language, installed, board = 'ESP32') {
  const py = python(language),
    devices = questDevices(mission, installed, board),
    steps = [];
  if (py) steps.push(importStep(devices));
  steps.push(pinsStep(devices, language));
  if (!py) steps.push(setupStep(devices));
  steps.push(loopStep(language));
  for (const d of inputsOf(devices)) steps.push(readStep(d, language, board));
  outputsOf(devices).forEach((d, i) =>
    steps.push(decideStep(mission, d, i, devices, language, board)),
  );
  steps.push({
    key: 'test',
    title: 'Run it and test it',
    body: [
      'Press Run, then change the conditions and watch the 3D world respond. Live readings show each value your code sees.',
      'Try the exact threshold: a good program behaves correctly right at the boundary, not just far from it.',
      'When you are happy, press “Test your solution” to check every scenario and earn the badge.',
    ],
    task: 'Run your program, then test it.',
    manual: true,
  });
  return steps;
}
