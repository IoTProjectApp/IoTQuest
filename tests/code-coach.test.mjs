import test from 'node:test';
import assert from 'node:assert/strict';
import { missions, defaults, program, baseEnv } from '../public/missions.js';
import { locations, adaptMissions } from '../public/locations.js';
import { Runtime } from '../public/runtime.js';
import { coachSteps, describeCondition, suggestedName } from '../public/code-coach.js';

const everyQuest = () => {
  const all = missions.map((m) => [m, 'Willowbrook']);
  for (const l of locations)
    for (const difficulty of ['beginner', 'advanced'])
      for (const m of adaptMissions(missions, l, difficulty))
        all.push([m, l.id + ' ' + difficulty]);
  return all;
};

// A program written line by line the way the guide teaches, with its suggested names.
export function studentProgram(m, language, devices) {
  const ins = devices.filter((d) => !d.output),
    outs = devices.filter((d) => d.output),
    n = (d) => suggestedName(d, language);
  if (language === 'python')
    return (
      '# ' +
      m.title +
      '\nfrom machine import Pin' +
      (devices.some((d) => d.analog) ? ', ADC' : '') +
      '\nimport time\n\n' +
      devices
        .map(
          (d) =>
            n(d) +
            ' = ' +
            (d.output
              ? 'Pin(' + d.pin + ', Pin.OUT)'
              : d.analog
                ? 'ADC(Pin(' + d.pin + '))'
                : 'Pin(' + d.pin + ', Pin.IN)'),
        )
        .join('\n') +
      '\n\nwhile True:\n' +
      ins
        .map((d) => '    ' + d.signal + ' = ' + n(d) + '.' + (d.analog ? 'read()' : 'value()'))
        .join('\n') +
      '\n' +
      outs
        .map(
          (d, i) =>
            '    if ' +
            m.conditions[i].replace(/&&/g, 'and').replace(/\|\|/g, 'or') +
            ':\n        ' +
            n(d) +
            '.value(1)\n    else:\n        ' +
            n(d) +
            '.value(0)',
        )
        .join('\n') +
      '\n    time.sleep_ms(200)\n'
    );
  return (
    '// ' +
    m.title +
    '\n' +
    devices.map((d) => 'const int ' + n(d) + ' = ' + d.pin + ';').join('\n') +
    '\n\nvoid setup() {\n  Serial.begin(115200);\n' +
    outs.map((d) => '  pinMode(' + n(d) + ', OUTPUT);').join('\n') +
    '\n}\n\nvoid loop() {\n' +
    ins
      .map(
        (d) =>
          '  int ' +
          d.signal +
          ' = ' +
          (d.analog ? 'analogRead' : 'digitalRead') +
          '(' +
          n(d) +
          ');',
      )
      .join('\n') +
    '\n' +
    outs
      .map(
        (d, i) =>
          '  if (' +
          m.conditions[i] +
          ') {\n    digitalWrite(' +
          n(d) +
          ', HIGH);\n  } else {\n    digitalWrite(' +
          n(d) +
          ', LOW);\n  }',
      )
      .join('\n') +
    '\n  delay(200);\n}\n'
  );
}

test('the editor starts with no code: only the quest title, goal and a pointer to the guide', () => {
  for (const language of ['cpp', 'python'])
    for (const m of missions) {
      const starter = program(m, language, defaults(m.ids, 'ESP32')),
        mark = language === 'python' ? '#' : '//';
      for (const line of starter.split('\n'))
        assert.ok(!line.trim() || line.trim().startsWith(mark), m.title + ': ' + line);
      assert.match(starter, /Guide beside the editor/);
    }
});

test('every quest’s guide covers the whole program; the student’s program passes every step', () => {
  for (const [m, where] of everyQuest())
    for (const language of ['cpp', 'python']) {
      const devices = defaults(m.ids, 'ESP32'),
        steps = coachSteps(m, language, devices, 'ESP32'),
        starter = program(m, language, devices),
        mine = studentProgram(m, language, devices),
        example = program(m, language, devices, true),
        label = where + ' · ' + m.title + ' · ' + language;
      assert.deepEqual(
        steps.map((s) => s.key.replace(/-.*/, '')),
        [
          ...(language === 'python' ? ['imports'] : []),
          'pins',
          ...(language === 'cpp' ? ['setup'] : []),
          'loop',
          ...devices.filter((d) => !d.output).map(() => 'read'),
          ...devices.filter((d) => d.output).map(() => 'decide'),
          'test',
        ],
        label,
      );
      for (const step of steps.filter((s) => s.check)) {
        assert.equal(step.check(starter).done, false, label + ' / starter ' + step.key);
        assert.equal(
          step.check(mine).done,
          true,
          label + ' / ' + step.key + ': ' + step.check(mine).message,
        );
        // Other names work too, such as the reference program's output0.
        assert.equal(step.check(example).done, true, label + ' / example ' + step.key);
      }
      // The program the guide teaches really passes the quest.
      const runtime = new Runtime(mine, language, devices, 'ESP32');
      for (const [name, env, expected] of m.scenarios) {
        const r = runtime.step({ ...baseEnv, ...env });
        assert.deepEqual(
          devices.filter((d) => d.output).map((d) => ((r.outputs[d.pin] || 0) > 0 ? 1 : 0)),
          expected,
          label + ' / ' + name,
        );
      }
      // Hints end with the condition, never the whole if/else.
      steps
        .filter((s) => s.key.startsWith('decide-'))
        .forEach((s, i) => {
          const condition =
            language === 'python'
              ? m.conditions[i].replace(/&&/g, 'and').replace(/\|\|/g, 'or')
              : m.conditions[i];
          assert.ok(s.hints.at(-1).includes(condition), label);
          assert.ok(!/HIGH\);|value\(1\)/.test(s.hints.join(' ')), label);
        });
    }
});

test('steps explain mistakes: wrong pin, wrong read, reading outside the loop, wrong threshold', () => {
  const m = missions[0],
    devices = defaults(m.ids, 'ESP32'),
    steps = coachSteps(m, 'cpp', devices),
    step = (key) => steps.find((s) => s.key === key),
    good = studentProgram(m, 'cpp', devices);
  assert.match(
    step('pins').check(good.replace('lightPin = 34', 'lightPin = 33')).message,
    /lightPin` uses GPIO 33, but the light sensor is wired to GPIO 34/,
  );
  assert.match(step('setup').check(good.replace('pinMode(ledPin, OUTPUT);', '')).message, /OUTPUT/);
  assert.match(
    step('read-light').check(good.replace('analogRead(lightPin)', 'digitalRead(lightPin)')).message,
    /analogue, so use `analogRead`/,
  );
  const outside = good
    .replace('  int light = analogRead(lightPin);\n', '')
    .replace('void setup() {', 'int light = analogRead(lightPin);\nvoid setup() {');
  assert.match(step('read-light').check(outside).message, /inside the loop/);
  const result = step('decide-0').check(good.replace('light < 1800', 'light <= 1800'));
  assert.equal(result.done, false);
  assert.match(
    result.message,
    /In “At threshold” \(light 1800\) the path lights should be OFF, but it is ON/,
  );
  assert.match(
    step('decide-0').check(good.replace('delay(200);\n}', 'delay(200);')).message,
    /error/,
  );
  // Commented-out code does not count.
  assert.equal(
    step('pins').check('// const int lightPin = 34;\n// const int ledPin = 26;').done,
    false,
  );
  const py = coachSteps(m, 'python', devices);
  assert.match(py[0].check('from machine import Pin\nimport time').message, /also import ADC/);
});

test('conditions are explained in plain English', () => {
  const devices = defaults(['soil', 'pump', 'level', 'rain'], 'ESP32');
  assert.equal(
    describeCondition('soil < 2400 && tank > 0 && rain < 400', devices),
    'the soil reading is below 2400 and the tank reading is above 0 and the rain reading is below 400',
  );
  assert.equal(
    describeCondition('door == 1 && armed == 1', defaults(['door', 'buzzer', 'button'], 'ESP32')),
    'the door contact reads HIGH and the arm button reads HIGH',
  );
});

test('regressions: install order, extra devices, timing and other ways of writing correct code', async () => {
  const { understandingQuestions } = await import('../public/understanding.js');
  // Smart Greenhouse installed in a different order, plus a device the quest does not use.
  const m = missions[6],
    planned = defaults(m.ids, 'ESP32'),
    byId = (id) => planned.find((d) => d.id === id),
    installed = [
      ...['ldr', 'led', 'temp', 'fan', 'soil', 'valve'].map(byId),
      { ...defaults(['buzzer'], 'ESP32')[0], pin: 4 },
    ],
    steps = coachSteps(m, 'cpp', installed),
    decide = steps.filter((s) => s.key.startsWith('decide-'));
  assert.deepEqual(
    decide.map((s) => s.title),
    ['Switch the cooling fan', 'Switch the path lights', 'Switch the irrigation valve'],
  );
  assert.match(decide[0].body[1], /temp reading is above 27/);
  const solution = studentProgram(m, 'cpp', planned);
  assert.ok(decide.every((s) => s.check(solution).done));
  assert.match(understandingQuestions(m, 'cpp', installed)[0].prompt, /cooling fan/);

  const light = missions[0],
    devices = defaults(light.ids, 'ESP32'),
    cpp = coachSteps(light, 'cpp', devices),
    step = (key, list = cpp) => list.find((s) => s.key === key);
  // Reading, then waiting, then deciding: same verdict as the mission tests.
  const waitFirst = studentProgram(light, 'cpp', devices).replace(
    '  int light = analogRead(lightPin);\n',
    '  int light = analogRead(lightPin);\n  delay(200);\n',
  );
  assert.equal(step('decide-0').check(waitFirst).done, true);
  // Other integer types and an untyped reading into a global variable.
  const byteProgram = studentProgram(light, 'cpp', devices)
    .replace('const int lightPin', 'const byte lightPin')
    .replace('const int ledPin', 'const uint8_t ledPin')
    .replace('void setup() {', 'int light = 0;\nvoid setup() {')
    .replace('  int light = analogRead', '  light = analogRead');
  for (const key of ['pins', 'setup', 'read-light', 'decide-0'])
    assert.equal(step(key).check(byteProgram).done, true, key);
  // #define is not supported by the simulator, so it is not accepted as done.
  const defined = '#define LIGHT 34\n#define LED 26\n';
  assert.equal(step('pins').check(defined).done, false);
  assert.match(step('pins').check(defined).message, /does not support #define/);
  // A program hidden in a block comment is not code.
  const hidden = '/*\n' + studentProgram(light, 'cpp', devices) + '*/\n';
  for (const key of ['pins', 'setup', 'loop'])
    assert.equal(step(key).check(hidden).done, false, key);
  // MicroPython: pull-down option on a digital input, and ADC(n) on a Pico.
  const motion = missions[1],
    py = coachSteps(motion, 'python', defaults(motion.ids, 'ESP32')),
    pulled = studentProgram(motion, 'python', defaults(motion.ids, 'ESP32')).replace(
      'Pin(27, Pin.IN)',
      'Pin(27, Pin.IN, Pin.PULL_DOWN)',
    );
  assert.equal(step('pins', py).check(pulled).done, true, step('pins', py).check(pulled).message);
  const picoDevices = defaults(light.ids, 'Raspberry Pi Pico'),
    pico = coachSteps(light, 'python', picoDevices, 'Raspberry Pi Pico'),
    adc = studentProgram(light, 'python', picoDevices).replace('ADC(Pin(26))', 'ADC(26)');
  assert.equal(step('pins', pico).check(adc).done, true);
});
