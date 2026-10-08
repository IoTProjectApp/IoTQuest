import { program, baseEnv } from './missions.js';
import { Runtime } from './runtime.js';
// "Spot the bugs": plants a few realistic bugs on separate lines of a mission's worked
// example. Each bug alone makes the mission tests fail, so finding it can be followed by
// fixing it and proving the repair with the real tests.
const ADC_PINS = { ESP32: [32, 33, 34, 35, 36, 39], Pico: [26, 27, 28] };
const DIGITAL_PINS = { ESP32: [4, 5, 13, 14, 16, 17, 18, 19, 21, 22, 23, 25, 26, 27, 32, 33] };

// Whether the mission's own test scenarios fail for this code (a runtime error counts).
export function testsCatch(mission, code, language, devices, board) {
  try {
    const runtime = new Runtime(code, language, devices, board);
    for (const [, env, expected] of mission.scenarios) {
      let result;
      for (let i = 0; i < 25; i++) result = runtime.step({ ...baseEnv, ...env });
      const actual = mission.ids
        .map((id) => devices.find((d) => d.id === id))
        .filter((d) => d?.output)
        .map((d) => ((result.outputs[d.pin] || 0) > 0 ? 1 : 0));
      if (!expected.every((v, i) => v === actual[i])) return true;
    }
    return false;
  } catch {
    return true;
  }
}

// Small deterministic generator so a seed always produces the same hunt.
function random(seed) {
  let s = seed >>> 0 || 1;
  return () => ((s = (Math.imul(s ^ (s >>> 15), 2246822507) + 0x9e3779b9) >>> 0) % 1e6) / 1e6;
}
const pick = (rand, list) => list[Math.floor(rand() * list.length)];

function unusedPin(devices, board, analog, rand, avoid) {
  const used = new Set(devices.map((d) => Number(d.pin))),
    pool =
      board === 'ESP32'
        ? analog
          ? ADC_PINS.ESP32
          : DIGITAL_PINS.ESP32
        : analog
          ? ADC_PINS.Pico
          : Array.from({ length: 23 }, (_, i) => i + 2),
    free = pool.filter((p) => !used.has(p) && p !== avoid);
  return free.length ? pick(rand, free) : null;
}

// Candidate bugs per line. Each returns { line, kind, replace(text) => text, explain, fix }.
function candidates(lines, language, devices, board, rand) {
  const out = { input: [], condition: [], output: [], setup: [] },
    cpp = language === 'cpp',
    inputs = devices.filter((d) => !d.output);
  lines.forEach((text, index) => {
    const line = index + 1;
    // Input pin declarations: const int lightPin = 34;  /  light_sensor = ADC(Pin(34))
    const decl = cpp
      ? text.match(/^const int (\w+) = (\d+);/)
      : text.match(/^(\w+) = (?:ADC\(Pin\((\d+)\)\)|Pin\((\d+), Pin\.IN\))/);
    if (decl) {
      const pin = Number(decl[2] ?? decl[3]),
        device = inputs.find((d) => Number(d.pin) === pin);
      if (device) {
        const wrong = unusedPin(
          devices,
          board === 'ESP32' ? 'ESP32' : 'Pico',
          device.analog,
          rand,
          pin,
        );
        if (wrong !== null)
          out.input.push({
            line,
            kind: 'wrong-pin',
            replace: (t) => t.replace(new RegExp('\\b' + pin + '\\b'), String(wrong)),
            explain: `The ${device.name} is wired to GPIO ${pin}, but this line uses GPIO ${wrong}.`,
            fix: `Use GPIO ${pin} to match the Wiring panel.`,
          });
      }
      return;
    }
    // Conditions: if (light < 1800) {  /  if light < 1800:
    const condition = text.match(cpp ? /^\s*if \((.*)\) \{$/ : /^\s*if (.*):$/);
    if (condition) {
      const body = condition[1],
        options = [];
      const comparison = body.match(/(\w+) ([<>]) (\d+)/);
      if (comparison) {
        const [, name, op, value] = comparison,
          flipped = op === '<' ? '>' : '<';
        options.push({
          kind: 'flipped-comparison',
          replace: (t) => t.replace(`${name} ${op} ${value}`, `${name} ${flipped} ${value}`),
          explain: `The comparison is reversed: it should be ${name} ${op} ${value}, not ${name} ${flipped} ${value}.`,
          fix: `Change ${flipped} back to ${op}.`,
        });
        const n = Number(value);
        for (const wrongValue of n >= 100
          ? [n + 1500, Math.round(n / 4), n * 2, n - 300]
          : [n + 25, n - 15, n + 8])
          if (wrongValue > 0 && wrongValue !== n)
            options.push({
              kind: 'wrong-threshold',
              replace: (t) => t.replace(`${name} ${op} ${value}`, `${name} ${op} ${wrongValue}`),
              explain: `The threshold is wrong: the mission needs ${name} ${op} ${value}, not ${wrongValue}.`,
              fix: `Set the threshold back to ${value}.`,
            });
      }
      const equals = body.match(/(\w+) == 1/);
      if (equals && !comparison)
        options.push({
          kind: 'flipped-comparison',
          replace: (t) => t.replace(`${equals[1]} == 1`, `${equals[1]} == 0`),
          explain: `This checks for ${equals[1]} == 0, so it reacts when the sensor is NOT triggered.`,
          fix: `Check ${equals[1]} == 1.`,
        });
      const [and, or] = cpp ? [' && ', ' || '] : [' and ', ' or '];
      if (body.includes(and))
        options.push({
          kind: 'wrong-logic',
          replace: (t) => t.replace(and, or),
          explain: `Both conditions must be true, so they need${and}not${or}.`,
          fix: `Replace${or}with${and}.`,
        });
      for (const option of options) out.condition.push({ line, ...option });
      return;
    }
    // The ON command inside an if-block: digitalWrite(output0, HIGH);  /  output0.value(1)
    const on = text.match(cpp ? /^\s+digitalWrite\((\w+), HIGH\);/ : /^\s+(\w+)\.value\(1\)/);
    if (on && /\bif\b/.test(lines[index - 1] || ''))
      out.output.push({
        line,
        kind: 'wrong-output',
        replace: (t) => (cpp ? t.replace('HIGH', 'LOW') : t.replace('value(1)', 'value(0)')),
        explain: `When the condition is true this should switch ${on[1]} ON, but it switches it OFF.`,
        fix: cpp ? 'Use HIGH.' : 'Use value(1).',
      });
    // Setup: pinMode(output0, OUTPUT);  /  output0 = Pin(26, Pin.OUT)
    if (cpp) {
      const mode = text.match(/^\s+pinMode\((\w+), OUTPUT\);/);
      if (mode)
        out.setup.push({
          line,
          kind: 'wrong-mode',
          replace: (t) => t.replace('OUTPUT', 'INPUT'),
          explain: `${mode[1]} drives an actuator, so it must be set up as OUTPUT, not INPUT.`,
          fix: 'Use OUTPUT.',
        });
    } else {
      const pinOut = text.match(/^(\w+) = Pin\((\d+), Pin\.OUT\)/);
      if (pinOut) {
        const wrong = unusedPin(
          devices,
          board === 'ESP32' ? 'ESP32' : 'Pico',
          false,
          rand,
          Number(pinOut[2]),
        );
        if (wrong !== null)
          out.setup.push({
            line,
            kind: 'wrong-pin',
            replace: (t) => t.replace(`Pin(${pinOut[2]},`, `Pin(${wrong},`),
            explain: `${pinOut[1]} is wired to GPIO ${pinOut[2]}, but this line uses GPIO ${wrong}.`,
            fix: `Use GPIO ${pinOut[2]}.`,
          });
      }
    }
  });
  return out;
}

export function createBugHunt(mission, language, devices, board, { seed = 1, count = 3 } = {}) {
  const source = program(mission, language, devices, true),
    lines = source.split('\n'),
    rand = random(seed * 7919 + mission.title.length * 31 + (language === 'cpp' ? 1 : 2)),
    groups = candidates(lines, language, devices, board, rand),
    // Keep only bugs the mission tests actually catch, so fixing them can be verified.
    caught = (bug) => {
      const copy = [...lines];
      copy[bug.line - 1] = bug.replace(copy[bug.line - 1]);
      return testsCatch(mission, copy.join('\n'), language, devices, board);
    },
    order = Object.keys(groups).sort(() => rand() - 0.5),
    bugs = [],
    used = new Set();
  // One bug from each of the first `count` kinds of mistake that apply, on distinct lines.
  for (const group of [...order, ...order]) {
    if (bugs.length >= count) break;
    if (bugs.some((b) => b.group === group)) continue;
    const options = groups[group].filter((c) => !used.has(c.line));
    let bug = null;
    // Try candidates in a seeded order until one is caught by the tests.
    for (const option of [...options].sort(() => rand() - 0.5))
      if (caught(option)) {
        bug = option;
        break;
      }
    if (!bug) continue;
    used.add(bug.line);
    bugs.push({ ...bug, group });
  }
  for (const bug of bugs) lines[bug.line - 1] = bug.replace(lines[bug.line - 1]);
  return {
    code: lines.join('\n'),
    original: source,
    bugs: bugs
      .sort((a, b) => a.line - b.line)
      .map(({ line, kind, explain, fix }) => ({ line, kind, explain, fix })),
  };
}

// Score flagged lines against the planted bugs.
export function scoreBugHunt(bugs, flagged) {
  const flags = new Set(flagged.map(Number)),
    found = bugs.filter((b) => flags.has(b.line)),
    wrong = [...flags].filter((line) => !bugs.some((b) => b.line === line));
  return {
    found: found.length,
    total: bugs.length,
    wrong,
    perfect: found.length === bugs.length && !wrong.length,
  };
}
