import { tokenize } from './code-tokens.js';
import { analyzeCode } from './code-analysis.js';
// "Explain code": inserts plain-English comments above the lines of a program, using the
// installed wiring to name devices. Generated comments carry a » marker so they can be
// removed again without touching the student's own comments.
const MARK = { cpp: '// » ', python: '# » ' };
const isExplanation = (line) => /^\s*(\/\/|#) » /.test(line);

export const hasExplanations = (code) => code.split('\n').some(isExplanation);
export const removeExplanations = (code) =>
  code
    .split('\n')
    .filter((line) => !isExplanation(line))
    .join('\n');

// What a reading means for each sensor signal: [low meaning, high meaning, unit].
const MEANING = {
  light: ['dark', 'bright'],
  soil: ['dry', 'wet'],
  tank: ['empty', 'full'],
  rain: ['dry', 'heavy rain'],
  pot: ['turned fully left', 'turned fully right'],
  pond: ['empty', 'full'],
  temp: ['°C'],
  outdoorTemp: ['°C'],
  humidity: ['% humidity'],
  distance: ['cm'],
  motion: ['no movement', 'movement detected'],
  door: ['closed', 'open'],
  armed: ['not pressed', 'pressed'],
  occupied: ['nobody home', 'someone home'],
};
// How "below" / "above" a threshold reads for each sensor.
const DIRECTION = {
  light: ['darker', 'brighter'],
  soil: ['drier', 'wetter'],
  tank: ['emptier', 'fuller'],
  pond: ['emptier', 'fuller'],
  rain: ['less rain', 'more rain'],
  pot: ['turned lower', 'turned higher'],
  temp: ['colder', 'hotter'],
  outdoorTemp: ['colder', 'hotter'],
  humidity: ['drier air', 'more humid'],
  distance: ['closer', 'further away'],
};
const DIGITAL = new Set(['motion', 'door', 'armed', 'occupied']);
const COMPARE = {
  '<': 'below',
  '<=': 'at most',
  '>': 'above',
  '>=': 'at least',
  '==': 'equal to',
  '!=': 'not equal to',
};

function readingNote(device) {
  const m = MEANING[device?.signal];
  if (!m) return '';
  if (m.length === 1) return ' (in ' + m[0].replace(/^% /, '%, ') + ')';
  return DIGITAL.has(device.signal)
    ? ' (1 = ' + m[1] + ', 0 = ' + m[0] + ')'
    : ' (0 = ' + m[0] + ', 4095 = ' + m[1] + ')';
}

// Describe a condition such as `light < 1800 && tank > 0` in words.
function describeCondition(text, language, readings) {
  const tokens = tokenize(text, language).filter((t) => t.type !== 'space' && t.type !== 'comment'),
    words = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i],
      next = tokens[i + 1],
      after = tokens[i + 2];
    if (t.type === 'word' && next?.type === 'operator' && COMPARE[next.text] && after) {
      const device = readings.get(t.text),
        value = after.text,
        direction = DIRECTION[device?.signal]?.[next.text.startsWith('<') ? 0 : 1];
      if (device && DIGITAL.has(device.signal) && /^[01]$/.test(value))
        words.push(
          device.name.toLowerCase() +
            ' reports ' +
            MEANING[device.signal][(value === '1') === (next.text === '==') ? 1 : 0],
        );
      else
        words.push(
          t.text +
            ' is ' +
            COMPARE[next.text] +
            ' ' +
            value +
            (value === '0' && next.text === '>' && MEANING[device?.signal]
              ? ' (not ' + MEANING[device.signal][0] + ')'
              : direction && !next.text.includes('=')
                ? ' (' + direction + ')'
                : ''),
        );
      i += 2;
    } else if (['&&', 'and'].includes(t.text)) words.push('and');
    else if (['||', 'or'].includes(t.text)) words.push('or');
    else if (['!', 'not'].includes(t.text)) words.push('not');
    else if (t.text === 'True' || t.text === 'true') words.push('always');
    else if (t.text === 'False' || t.text === 'false')
      words.push('never (replace false with your condition)');
    else if (t.type === 'word') words.push(t.text + ' is true');
  }
  return words.join(' ');
}

export function explainCode(code, language = 'cpp', devices = []) {
  const clean = removeExplanations(code),
    lines = clean.split('\n'),
    { constants, pinObjects } = analyzeCode(clean, language),
    devicePin = (expr) => {
      const n = /^\d+$/.test(expr) ? Number(expr) : constants.get(expr);
      return devices.find((d) => Number(d.pin) === n) || null;
    },
    pinOf = (expr) => (/^\d+$/.test(expr) ? Number(expr) : constants.get(expr)),
    named = (d, pin) => (d ? 'the ' + d.name + ' on GPIO ' + d.pin : 'GPIO ' + pin),
    wired = (name, pin, d) =>
      d ? name + ' is GPIO ' + pin + ': the ' + d.name + ' pin' : name + ' always stores ' + pin,
    readings = new Map(), // variable name -> device it reads
    cpp = language === 'cpp',
    out = [];
  // Lines inside a multi-line comment or string must not receive generated comments.
  const covered = new Set();
  for (const t of tokenize(clean, language))
    if ((t.type === 'comment' || t.type === 'string') && t.text.includes('\n')) {
      const first = clean.slice(0, t.start).split('\n').length - 1,
        span = t.text.split('\n').length - 1;
      for (let i = first + 1; i <= first + span; i++) covered.add(i);
    }
  // The file's opening comment block describes the program, not the first line of code.
  const header = lines.findIndex((l) => l.trim() && !/^\s*(\/\/|#)/.test(l));
  let previous = '';
  lines.forEach((line, index) => {
    const text = line.trim(),
      indent = line.match(/^\s*/)[0];
    let note = null,
      m;
    if (cpp) {
      if ((m = text.match(/^const int (\w+) = (\d+);/))) {
        note = wired(m[1], m[2], devicePin(m[2]));
      } else if (/^void setup\(\)/.test(text))
        note = 'setup() runs once, when the controller starts';
      else if (/^void loop\(\)/.test(text))
        note = 'loop() runs again and again, once every simulation tick';
      else if ((m = text.match(/^Serial\.begin\((\d+)\)/)))
        note = 'Start the serial monitor at ' + m[1] + ' baud so messages appear';
      else if ((m = text.match(/^pinMode\((\w+), (\w+)\)/)))
        note =
          m[2] === 'OUTPUT'
            ? 'Make ' + named(devicePin(m[1]), pinOf(m[1])) + ' an output so the code can switch it'
            : 'Make ' + named(devicePin(m[1]), pinOf(m[1])) + ' an input so the code can read it';
      else if ((m = text.match(/^(?:int|long|float) (\w+) = (analogRead|digitalRead)\((\w+)\);/))) {
        const d = devicePin(m[3]);
        if (d) readings.set(m[1], d);
        note = 'Read ' + named(d, pinOf(m[3])) + readingNote(d) + ' into ' + m[1];
      } else if ((m = text.match(/^(?:\} )?(else )?if \((.*)\) \{$/)))
        note =
          (m[1] ? 'Otherwise, if ' : 'If ') +
          describeCondition(m[2], language, readings) +
          ', run the block below';
      else if (/^\} else \{$/.test(text) || text === 'else {')
        note = 'Otherwise (the condition was false), run this block';
      else if ((m = text.match(/^while \((.*)\) \{$/)))
        note = 'Repeat the block below while ' + describeCondition(m[1], language, readings);
      else if ((m = text.match(/^digitalWrite\((\w+), (HIGH|LOW|1|0)\);/))) {
        const on = m[2] === 'HIGH' || m[2] === '1';
        note =
          (on ? 'HIGH sends 3.3 V to ' : 'LOW sets 0 V on ') +
          named(devicePin(m[1]), pinOf(m[1])) +
          ': ' +
          (on ? 'ON' : 'OFF');
      } else if ((m = text.match(/^digitalWrite\((\w+), (.+)\);/)))
        note =
          'Turn ON ' + named(devicePin(m[1]), pinOf(m[1])) + ' when ' + m[2] + ' is true, else OFF';
      else if ((m = text.match(/^analogWrite\((\w+), (.+)\);/)))
        note = 'PWM: set ' + named(devicePin(m[1]), pinOf(m[1])) + ' to ' + m[2] + ' out of 255';
      else if ((m = text.match(/^servoWrite\((\w+), (.+)\);/)))
        note =
          'Turn the servo on ' + named(devicePin(m[1]), pinOf(m[1])) + ' to ' + m[2] + ' degrees';
      else if ((m = text.match(/^delay\((\d+)\);/)))
        note = 'Pause until the next tick (' + m[1] + ' ms on real hardware)';
      else if ((m = text.match(/^Serial\.println\((.+)\);/)))
        note = 'Print ' + m[1] + ' on its own line in the serial monitor (and the plotter)';
      else if ((m = text.match(/^(?:int|long|float|bool|void) (\w+)\((.*)\) \{$/)))
        note =
          'Define a function ' +
          m[1] +
          (m[2] ? ' that takes ' + m[2] : '') +
          '; call it as ' +
          m[1] +
          '(…)';
      else if ((m = text.match(/^return (.+);/))) note = 'Send ' + m[1] + ' back to the caller';
      else if ((m = text.match(/^(?:unsigned )?long (\w+) = millis\(\);/)))
        note = m[1] + ' = time since the program started, in milliseconds';
    } else {
      if ((m = text.match(/^from machine import (.+)/)))
        note = 'Load the controller tools: ' + m[1].replace(/\bADC\b/, 'ADC (analogue reader)');
      else if (/^import time$/.test(text)) note = 'Load time, for sleeps and timers';
      else if ((m = text.match(/^(\w+) = ADC\(Pin\((\w+)\)\)/))) {
        const d = devicePin(m[2]);
        note = m[1] + ' reads ' + named(d, pinOf(m[2])) + ' as an analogue value';
      } else if ((m = text.match(/^(\w+) = Pin\((\w+), Pin\.(OUT|IN)\)/)))
        note =
          m[1] +
          (m[3] === 'OUT' ? ' controls ' : ' reads ') +
          named(devicePin(m[2]), pinOf(m[2])) +
          (m[3] === 'OUT' ? ' as an output' : ' as a digital input');
      else if ((m = text.match(/^(\w+) = (\w+)\.(read|read_u16|value)\(\)$/))) {
        const pin = pinObjects.get(m[2])?.pin,
          d = devices.find((x) => Number(x.pin) === pin) || null;
        if (d) readings.set(m[1], d);
        note = 'Read ' + named(d, pin) + readingNote(d) + ' into ' + m[1];
      } else if (/^while True:$/.test(text))
        note = 'Repeat forever: this is the main loop, once every simulation tick';
      else if ((m = text.match(/^(el)?if (.*):$/)))
        note =
          (m[1] ? 'Otherwise, if ' : 'If ') +
          describeCondition(m[2], language, readings) +
          ', run the indented block';
      else if (text === 'else:') note = 'Otherwise (the condition was false), run this block';
      else if ((m = text.match(/^while (.*):$/)))
        note = 'Repeat the indented block while ' + describeCondition(m[1], language, readings);
      else if ((m = text.match(/^(\w+)\.(on|off)\(\)$|^(\w+)\.value\(([01])\)$/))) {
        const name = m[1] ?? m[3],
          on = m[2] === 'on' || m[4] === '1',
          pin = pinObjects.get(name)?.pin;
        note =
          'Turn ' +
          (on ? 'ON ' : 'OFF ') +
          named(
            devices.find((x) => Number(x.pin) === pin),
            pin,
          );
      } else if ((m = text.match(/^(\w+)\.value\((.+)\)$/))) {
        const pin = pinObjects.get(m[1])?.pin;
        note =
          'Turn ON ' +
          named(
            devices.find((x) => Number(x.pin) === pin),
            pin,
          ) +
          ' when ' +
          m[2] +
          ' is true, else OFF';
      } else if ((m = text.match(/^time\.sleep_ms\((\d+)\)$/)))
        note = 'Pause until the next tick (' + m[1] + ' ms on real hardware)';
      else if ((m = text.match(/^print\((.+)\)$/)))
        note = 'Print ' + m[1] + ' in the serial monitor (and the plotter)';
      else if ((m = text.match(/^def (\w+)\((.*)\):$/)))
        note = 'Define a function ' + m[1] + (m[2] ? ' that takes ' + m[2] : '');
      else if ((m = text.match(/^return (.+)$/))) note = 'Send ' + m[1] + ' back to the caller';
      else if ((m = text.match(/^(\w+) = (\d+)$/)) && indent === '') {
        note = devicePin(m[2]) ? wired(m[1], m[2], devicePin(m[2])) : null;
      }
    }
    // Leave lines the student already commented alone.
    if (note && !covered.has(index) && !/^(\/\/|#)/.test(previous.trim()))
      out.push(indent + MARK[cpp ? 'cpp' : 'python'] + note);
    out.push(line);
    if (text) previous = index < header ? '' : line;
  });
  return out.join('\n');
}
