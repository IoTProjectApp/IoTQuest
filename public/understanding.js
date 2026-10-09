import {
  OPERATORS,
  describeCondition,
  readingText,
  suggestedName,
  questDevices,
} from './code-coach.js';
import { ADC_SIGNALS as ADC, adcRead, picoWiring } from './signals.js';
// "Check your understanding": three questions shown after a quest is passed, built from the
// quest's own rule, sensors and scenarios, so every quest has them. Every answer, right or
// wrong, comes with an explanation.

export const UNDERSTANDING_XP = 10;

// Deterministic shuffle, so a question's choices stay in the same order between visits.
function shuffle(items, seedText) {
  let seed = [...seedText].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) || 1;
  const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646,
    out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
function question(id, prompt, choices, seed) {
  const order = shuffle(choices, seed + id);
  return {
    id,
    prompt,
    choices: order.map((c) => ({ text: c.text, why: c.why })),
    answer: order.findIndex((c) => c.right),
  };
}
const lower = (d) => d.name.toLowerCase();
const comparison = /\b(\w+)\s*(<=|>=|==|!=|<|>)\s*(-?[\d.]+)/;

// Predict: what the output does in one of the quest's own scenarios, ideally at the threshold.
function predict(mission, devices, language) {
  const out = devices.find((d) => d.output),
    // Prefer the exact boundary ("At threshold", "Tank reserve boundary"), where students
    // most often slip.
    scenario =
      mission.scenarios.find(([name]) => /^at\b|boundary/i.test(name)) ||
      mission.scenarios.find(([name]) => /threshold|target|reserve/i.test(name)) ||
      mission.scenarios[1] ||
      mission.scenarios[0],
    [name, env, expected] = scenario,
    on = !!expected[0],
    condition = mission.conditions[0],
    op = condition.match(comparison)?.[2],
    plural = /s$/.test(lower(out)),
    rule =
      'The rule: the ' +
      lower(out) +
      (plural ? ' are' : ' is') +
      ' ON when ' +
      describeCondition(condition, devices) +
      '. With ' +
      readingText(env, devices) +
      ' that is ' +
      (on ? 'true' : 'false') +
      (plural ? ', so they are ' : ', so it is ') +
      (on ? 'ON' : 'OFF') +
      '.' +
      (op && OPERATORS[op] && /threshold|boundary|target|reserve/i.test(name)
        ? ' ' + OPERATORS[op][1]
        : '');
  return question(
    'predict',
    '“' +
      name +
      '”: the readings are ' +
      readingText(env, devices) +
      '. ' +
      (plural ? 'Are' : 'Is') +
      ' the ' +
      lower(out) +
      ' ON or OFF?',
    [
      { text: 'ON', right: on, why: rule },
      { text: 'OFF', right: !on, why: rule },
    ],
    mission.title + language,
  );
}

// Read: what the sensor-reading code gives the program.
function reading(mission, devices, language) {
  const d = devices.find((x) => !x.output),
    py = language === 'python',
    call = py
      ? suggestedName(d, language) +
        '.' +
        (d.analog ? adcRead(picoWiring(devices), d.signal) : 'value()')
      : (d.analog ? 'analogRead(' : 'digitalRead(') + suggestedName(d, language) + ')',
    range = ADC.includes(d.signal)
      ? 'A number from 0 to 4095: the higher the voltage from the sensor, the bigger the number'
      : ['temp', 'outdoorTemp'].includes(d.signal)
        ? 'The temperature in °C (this virtual sensor is calibrated)'
        : d.signal === 'humidity'
          ? 'The humidity as a percentage, from 0 to 100'
          : d.signal === 'cloud'
            ? 'The cloud cover as a percentage, from 0 to 100'
            : d.signal === 'wind'
              ? 'The wind speed in kilometres per hour'
              : d.signal === 'distance'
                ? 'The distance in centimetres'
                : '1 (HIGH) or 0 (LOW)',
    digital = range.startsWith('1 (HIGH)'),
    switchOutput = py ? '`.value()` on an output' : '`digitalWrite`';
  return question(
    'read',
    'What does `' + call + '` give your program?',
    [
      { text: range, right: true, why: 'Right. ' + d.desc },
      digital
        ? {
            text: 'A number from 0 to 4095',
            why: 'That is an analogue reading. The ' + lower(d) + ' is digital: only HIGH or LOW.',
          }
        : {
            text: '1 (HIGH) or 0 (LOW) only',
            why:
              'That is a digital reading. The ' +
              lower(d) +
              ' gives a range of values, so you can compare it with a threshold.',
          },
      {
        text: 'The GPIO pin number, ' + d.pin,
        why: 'The pin number only says where the sensor is wired. Reading it gives the sensor’s value.',
      },
      {
        text: 'It switches the ' + lower(d) + ' on',
        why: 'Reading never switches anything. Outputs are switched with ' + switchOutput + '.',
      },
    ],
    mission.title + language,
  );
}

// Change: which part of the condition sets where the decision flips; or, without a numeric
// threshold, what the else block is for.
function change(mission, devices, language) {
  const out = devices.find((d) => d.output),
    py = language === 'python',
    condition = py
      ? mission.conditions[0].replace(/&&/g, 'and').replace(/\|\|/g, 'or')
      : mission.conditions[0],
    m = condition.match(comparison),
    sensor = m && devices.find((d) => d.signal === m[1]),
    threshold = m && sensor && !(sensor && !sensor.analog && /^[01]$/.test(m[3]));
  if (threshold) {
    const [, signal, op, value] = m,
      flipped = { '<': '>', '>': '<', '<=': '>=', '>=': '<=', '==': '!=', '!=': '==' }[op];
    return question(
      'change',
      mission.resident +
        ' wants the ' +
        lower(out) +
        ' to switch at a different ' +
        signal +
        ' reading. In `' +
        (py ? 'if ' + condition + ':' : 'if (' + condition + ')') +
        '`, what should you change?',
      [
        {
          text: 'The number ' + value + ' (the threshold)',
          right: true,
          why: 'Right. The threshold is the reading where the decision flips. Change it, then test right at the new boundary.',
        },
        {
          text: 'The `' + op + '` to `' + flipped + '`',
          why:
            'That reverses the rule: the ' +
            lower(out) +
            ' would switch on in the opposite conditions.',
        },
        {
          text: 'The pin name `' + suggestedName(sensor, language) + '`',
          why: 'The pin decides which sensor is read, not where the decision flips.',
        },
        {
          text: py ? '`value(1)` to `value(0)`' : '`HIGH` to `LOW`',
          why: 'That would turn the output OFF when the condition is true: the opposite of the rule.',
        },
      ],
      mission.title + language,
    );
  }
  return question(
    'change',
    'What does the `else` part of your if/else do for the ' + lower(out) + '?',
    [
      {
        text: 'Turns the ' + lower(out) + ' OFF whenever the condition is false',
        right: true,
        why: 'Right. Without the else, nothing would switch the output off again once it was on.',
      },
      {
        text: 'Runs once when the board starts',
        why: py
          ? 'Code before `while True:` runs once. The else runs on every pass when the condition is false.'
          : 'That is `setup()`. The else runs on every pass of loop() when the condition is false.',
      },
      {
        text: 'Runs only when the condition is true',
        why: 'That is the if block. The else runs when the condition is false.',
      },
      {
        text: 'Nothing: it can be left out',
        why: 'Then nothing would ever turn the output off again after it was switched on.',
      },
    ],
    mission.title + language,
  );
}

export function understandingQuestions(mission, language, installed, board = 'ESP32') {
  if (!mission?.ids?.length) return [];
  // Output i follows condition i, whatever order the devices were installed in.
  const devices = questDevices(mission, installed, board);
  if (!devices.some((d) => d.output) || !devices.some((d) => !d.output)) return [];
  return [predict, reading, change].map((make) => make(mission, devices, language));
}

// Applies an answer to the saved record: { answers: { id: { first, tries, solved } } }.
// Returns whether it was right and the XP earned (only for a right first try).
export function answerQuestion(record, q, choice) {
  const answers = (record.answers ??= {}),
    a = (answers[q.id] ??= { first: null, tries: 0, solved: false }),
    right = choice === q.answer;
  if (a.solved) return { right, xp: 0 };
  a.tries++;
  a.last = choice;
  if (a.first === null) a.first = right;
  if (right) a.solved = true;
  return { right, xp: right && a.tries === 1 ? UNDERSTANDING_XP : 0 };
}

// Summary for reports: right first time, answered, and how many questions there are.
export function understandingScore(record, total) {
  const answers = Object.values(record?.answers || {});
  return {
    right: answers.filter((a) => a.first === true).length,
    answered: answers.filter((a) => a.solved).length,
    total,
  };
}
