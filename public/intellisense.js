import { suggestedName } from './code-coach.js';
// Code completion for the editor: what can be typed at the caret, with a short explanation, and
// parameter hints inside a call. It completes names only (functions, keywords, constants, the
// student's own variables and the installed devices' pins); it never writes statements, so
// students still write every line themselves. Only what the simulator runs is suggested.

const fn = (label, params, doc, extra = {}) => ({ label, kind: 'function', params, doc, ...extra });
const word = (label, kind, doc) => ({ label, kind, doc });

const CPP = [
  fn(
    'pinMode',
    ['pin', 'mode'],
    'Sets a pin as INPUT, INPUT_PULLUP or OUTPUT. Call it in setup().',
  ),
  fn('digitalWrite', ['pin', 'value'], 'Switches an output pin HIGH (on) or LOW (off).'),
  fn('digitalRead', ['pin'], 'Reads a digital input: HIGH (1) or LOW (0).'),
  fn(
    'analogRead',
    ['pin'],
    'Reads an analogue sensor: 0–4095 on ESP32, or calibrated units (°C, %, km/h).',
  ),
  fn(
    'analogWrite',
    ['pin', 'value'],
    'Sets an output level from 0 (off) to 255 (full), for example fan speed.',
  ),
  fn('ledcWrite', ['pin', 'duty'], 'ESP32 PWM output: duty from 0 to 255.'),
  fn('servoWrite', ['pin', 'angle'], 'Turns a servo to an angle from 0 to 180 degrees.'),
  fn('delay', ['ms'], 'Waits for a number of milliseconds (1000 ms = 1 second).'),
  fn(
    'millis',
    [],
    'Milliseconds since the program started. Use it to time things without waiting.',
  ),
  fn('abs', ['x'], 'The value without its sign: abs(-3) is 3.'),
  fn('min', ['a', 'b'], 'The smaller of two values.'),
  fn('max', ['a', 'b'], 'The larger of two values.'),
  fn('Serial.begin', ['baud'], 'Starts the serial monitor. Use 115200 in setup().'),
  fn('Serial.print', ['value'], 'Prints to the serial monitor and stays on the same line.'),
  fn('Serial.println', ['value'], 'Prints to the serial monitor and ends the line.'),
  word('HIGH', 'constant', 'On: 1, the pin is at 3.3 V.'),
  word('LOW', 'constant', 'Off: 0, the pin is at 0 V.'),
  word('INPUT', 'constant', 'pinMode: the pin reads a sensor.'),
  word(
    'INPUT_PULLUP',
    'constant',
    'pinMode: an input that reads HIGH until a button pulls it LOW.',
  ),
  word('OUTPUT', 'constant', 'pinMode: the pin drives an output such as a light or motor.'),
  word('true', 'constant', 'Boolean true.'),
  word('false', 'constant', 'Boolean false.'),
  ...[
    ['void', 'A function that returns nothing, like setup() and loop().'],
    ['int', 'A whole number, such as a pin number or a 0–4095 reading.'],
    ['float', 'A number with decimals, such as 23.5 °C.'],
    ['bool', 'true or false.'],
    ['long', 'A large whole number.'],
    ['unsigned', 'A number that is never negative, as in unsigned long for millis().'],
    ['const', 'A value that never changes, such as a pin number.'],
    ['if', 'Runs a block only when its condition is true.'],
    ['else', 'Runs when the if condition is false.'],
    ['while', 'Repeats a block while its condition is true.'],
    ['return', 'Ends a function, optionally giving back a value.'],
  ].map(([label, doc]) => word(label, 'keyword', doc)),
];

const PYTHON = [
  fn(
    'Pin',
    ['pin', 'mode'],
    'A GPIO pin: Pin(26, Pin.OUT) for an output, Pin(27, Pin.IN) for an input.',
  ),
  fn('ADC', ['pin'], 'An analogue input: ADC(Pin(34)). Read it with .read().'),
  fn('PWM', ['pin'], 'A variable-level output: PWM(Pin(26)). Set it with .duty() or .duty_u16().'),
  fn('print', ['value'], 'Prints to the serial monitor.'),
  fn('abs', ['x'], 'The value without its sign: abs(-3) is 3.'),
  fn('min', ['a', 'b'], 'The smaller of two values.'),
  fn('max', ['a', 'b'], 'The larger of two values.'),
  fn('int', ['x'], 'Turns a value into a whole number.'),
  fn('time.sleep', ['seconds'], 'Waits for a number of seconds.'),
  fn('time.sleep_ms', ['ms'], 'Waits for a number of milliseconds (1000 ms = 1 second).'),
  fn(
    'time.ticks_ms',
    [],
    'Milliseconds since the program started. Use it to time things without waiting.',
  ),
  fn('sleep_ms', ['ms'], 'Waits for a number of milliseconds (after from time import sleep_ms).'),
  fn('ticks_ms', [], 'Milliseconds since start (after from time import ticks_ms).'),
  word('Pin.IN', 'constant', 'Pin mode: the pin reads a sensor.'),
  word('Pin.OUT', 'constant', 'Pin mode: the pin drives an output.'),
  word('Pin.PULL_UP', 'constant', 'Input that reads 1 until a button pulls it to 0.'),
  word('Pin.PULL_DOWN', 'constant', 'Input that reads 0 until a button pulls it to 1.'),
  word('True', 'constant', 'Boolean true.'),
  word('False', 'constant', 'Boolean false.'),
  ...[
    ['from', 'Imports names from a module: from machine import Pin, ADC.'],
    ['import', 'Loads a module, such as import time.'],
    ['machine', 'The module with Pin, ADC and PWM.'],
    ['time', 'The module with sleep_ms and ticks_ms.'],
    ['iotquest', 'The simulator module with the MQTT functions.'],
    ['def', 'Defines a function.'],
    ['if', 'Runs a block only when its condition is true.'],
    ['elif', 'Checks another condition when the ones before were false.'],
    ['else', 'Runs when the if condition is false.'],
    ['while', 'Repeats a block; while True: runs forever.'],
    ['and', 'True only when both sides are true.'],
    ['or', 'True when either side is true.'],
    ['not', 'Flips true and false.'],
    ['return', 'Ends a function, optionally giving back a value.'],
    ['pass', 'Does nothing; a placeholder for an empty block.'],
    ['global', 'Lets a function change a variable defined outside it.'],
  ].map(([label, doc]) => word(label, 'keyword', doc)),
];
// After a dot on a pin, ADC or PWM object (led.value(1), sensor.read()).
const PYTHON_METHODS = [
  fn('value', ['v'], 'Reads the pin with .value(), or sets it with .value(1) / .value(0).', {
    method: true,
  }),
  fn('on', [], 'Sets an output pin to 1.', { method: true }),
  fn('off', [], 'Sets an output pin to 0.', { method: true }),
  fn('read', [], 'Reads an ADC: 0–4095, or calibrated units for weather and climate sensors.', {
    method: true,
  }),
  fn('read_u16', [], 'Reads an ADC as 0–65535.', { method: true }),
  fn('duty', ['level'], 'Sets a PWM level from 0 to 1023.', { method: true }),
  fn('duty_u16', ['level'], 'Sets a PWM level from 0 to 65535.', { method: true }),
  fn('freq', ['hz'], 'Sets the PWM frequency.', { method: true }),
];
const MQTT = [
  fn('mqttConnect', ['clientId'], 'Connects to the simulated MQTT broker with a client name.'),
  fn(
    'mqttPublish',
    ['topic', 'value'],
    'Sends a number or text to a topic, such as "home/temperature".',
  ),
  fn('mqttSubscribe', ['topic'], 'Listens to a topic. Read the latest message with mqttRead.'),
  fn('mqttRead', ['topic'], 'The latest message on a subscribed topic (0 if none yet).'),
  fn('mqttConnected', [], 'true while connected to the broker.'),
  fn('mqttReconnect', [], 'Reconnects after the network drops. Subscribe again afterwards.'),
  fn('mqttLastDelivery', [], 'When the last message arrived, in milliseconds.'),
];
export const catalog = (language) => [...(language === 'python' ? PYTHON : CPP), ...MQTT];

// Names the student declared: C++ variables and functions; Python assignments and functions.
export function declaredSymbols(source, language) {
  const symbols = new Map(),
    lines = String(source).split('\n');
  const add = (label, kind, line) => {
    if (!symbols.has(label)) symbols.set(label, { label, kind, detail: line.trim(), doc: '' });
  };
  for (const line of lines) {
    const code = line.replace(language === 'python' ? /#.*$/ : /\/\/.*$/, '');
    if (language === 'python') {
      let m = code.match(/^\s*def\s+(\w+)\s*\(/);
      if (m) add(m[1], 'function', code);
      m = code.match(/^\s*(\w+)\s*=(?!=)/);
      if (m) add(m[1], 'variable', code);
    } else {
      const m = code.match(
        /^\s*(?:(?:const|static|volatile|unsigned|signed)\s+)*(?:void|int|float|double|bool|long|short|byte|char|uint8_t|int16_t|uint16_t|uint32_t|int32_t|size_t)\s+(\w+)\s*([=;(\[])/,
      );
      if (m && !['setup', 'loop'].includes(m[1]))
        add(m[1], m[2] === '(' ? 'function' : 'variable', code);
    }
  }
  return [...symbols.values()];
}

// The word being typed at the caret, and whether it follows an object and a dot.
export function completionContext(source, caret, language) {
  const line = source.slice(source.lastIndexOf('\n', caret - 1) + 1, caret);
  // Nothing to suggest inside a comment or a string.
  const comment = language === 'python' ? '#' : '//';
  if (line.includes(comment)) return null;
  if ((line.match(/"/g) || []).length % 2 || (line.match(/'/g) || []).length % 2) return null;
  const m = line.match(/([A-Za-z_][\w]*\.)?([A-Za-z_]\w*)?$/),
    owner = m?.[1]?.slice(0, -1) || '',
    prefix = m?.[2] || '';
  return { owner, prefix, from: caret - prefix.length - (owner ? owner.length + 1 : 0), line };
}

// Suggestions for the caret, best first. `devices` are the installed devices (for pin names).
export function completions(source, caret, language, devices = [], { manual = false } = {}) {
  const ctx = completionContext(source, caret, language);
  if (!ctx || (!ctx.prefix && !ctx.owner && !manual)) return [];
  const own = declaredSymbols(source, language),
    pins = devices.map((d) => ({
      label: suggestedName(d, language),
      kind: 'pin',
      detail: d.name + ' · GPIO ' + d.pin,
      doc: (d.output ? 'Output' : 'Sensor') + ' on GPIO ' + d.pin + '. A name for its pin number.',
    }));
  let pool;
  if (ctx.owner) {
    // led.va → methods for Python objects; Serial.pr / time.sl / Pin.O → dotted names.
    const dotted = catalog(language)
      .filter((c) => c.label.startsWith(ctx.owner + '.'))
      .map((c) => ({ ...c, insert: c.label.slice(ctx.owner.length + 1) }));
    pool = dotted.length
      ? dotted
      : language === 'python'
        ? PYTHON_METHODS.map((c) => ({ ...c, insert: c.label }))
        : [];
  } else
    pool = [
      ...own.map((c) => ({ ...c, rank: 0 })),
      ...pins.filter((p) => !own.some((o) => o.label === p.label)).map((c) => ({ ...c, rank: 1 })),
      ...catalog(language)
        .filter((c) => !c.label.startsWith('Pin.'))
        .map((c) => ({ ...c, rank: 2 })),
    ];
  const typed = ctx.prefix.toLowerCase();
  // Exact-start matches first, then names containing what was typed; the student's own names
  // before the installed pins before the built-in catalogue; shorter names first.
  const score = (c) => {
    const name = (c.insert ?? c.label).toLowerCase();
    if (!typed) return 1;
    if (name.startsWith(typed)) return name === typed ? 0 : 1;
    return name.includes(typed) ? 2 : 9;
  };
  return pool
    .map((c) => ({ ...c, insert: c.insert ?? c.label, score: score(c) }))
    .filter((c) => c.score < 9 && !(c.insert.toLowerCase() === typed && !manual))
    .sort(
      (a, b) =>
        a.score - b.score ||
        (a.rank ?? 2) - (b.rank ?? 2) ||
        a.insert.length - b.insert.length ||
        a.insert.localeCompare(b.insert),
    )
    .slice(0, 12)
    .map((c) => ({ ...c, from: ctx.from + (ctx.owner ? ctx.owner.length + 1 : 0) }));
}

// What to put in the editor for a chosen suggestion, and where the caret ends up.
export function applyCompletion(source, caret, item) {
  const after = source.slice(caret),
    call = item.kind === 'function' && !after.startsWith('(');
  const text = item.insert + (call ? '()' : ''),
    next = source.slice(0, item.from) + text + after;
  // Inside the brackets when the function takes arguments, after them when it does not.
  const at = item.from + item.insert.length + (call ? (item.params?.length ? 1 : 2) : 0);
  return { source: next, caret: at };
}

// Parameter hints: inside an unfinished call such as digitalWrite(ledPin, |, which function and
// which argument the caret is on.
export function signatureAt(source, caret, language, extra = []) {
  const line = source.slice(source.lastIndexOf('\n', caret - 1) + 1, caret);
  let depth = 0,
    commas = 0;
  for (let i = line.length - 1; i >= 0; i--) {
    const ch = line[i];
    if (ch === ')') depth++;
    else if (ch === ',' && depth === 0) commas++;
    else if (ch === '(') {
      if (depth) {
        depth--;
        continue;
      }
      const name = line.slice(0, i).match(/([A-Za-z_][\w.]*)\s*$/)?.[1];
      if (!name) return null;
      const method = name.includes('.') ? name.split('.').pop() : null,
        entry =
          [...catalog(language), ...extra].find((c) => c.label === name && c.params) ||
          (language === 'python' && method && PYTHON_METHODS.find((c) => c.label === method));
      return entry
        ? { label: entry.label, params: entry.params, active: commas, doc: entry.doc }
        : null;
    }
  }
  return null;
}
