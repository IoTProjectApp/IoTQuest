import { ADC_SIGNALS, programReading, baseEnv } from './signals.js';
// Quests that matter right now. A quest is needed when its own rule gives a different answer in
// the current conditions than on a calm, ordinary day: at sunset "light < 1800" turns the path
// lights on, so Light the Path becomes urgent; in a gale "wind < 40" closes the gate. This works
// from each quest's conditions, so every quest (teacher quests too) reacts without extra data.

// An ordinary day: daylight, mild (away from every quest's limits), dry and calm, nobody moving,
// the alarm armed.
export const CALM_DAY = {
  ...baseEnv,
  light: 70,
  isDay: true,
  temp: 21,
  outdoorTemp: 18,
  rain: 0,
  wind: 12,
  cloud: 20,
};
// How far past a threshold a reading must be before the situation counts as changed, so a
// reading hovering at a limit does not make a quest flicker in and out of "needed now".
const MARGIN = { temp: 1, outdoorTemp: 1, humidity: 3, wind: 3, cloud: 5, distance: 5 };
const margin = (signal) => (ADC_SIGNALS.includes(signal) ? 100 : (MARGIN[signal] ?? 0));

// What the program would read: ADC sensors as 0–4095, everything else as stored.
const reading = (signal, env) => programReading(signal, Number(env[signal] ?? 0));
const ATOM = /^\(?\s*(\w+)\s*(<=|>=|==|!=|<|>)\s*(-?\d+(?:\.\d+)?)\s*\)?$/;
export const compare = (a, op, b) =>
  op === '<'
    ? a < b
    : op === '<='
      ? a <= b
      : op === '>'
        ? a > b
        : op === '>='
          ? a >= b
          : op === '=='
            ? a === b
            : a !== b;

// Evaluates a quest condition such as "(motion == 1 || door == 1) && armed == 1", like C and
// Python do: brackets first, then &&, then ||. Anything it cannot read counts as false.
const TOKEN = /\s*(\(|\)|&&|\|\||(\w+)\s*(<=|>=|==|!=|<|>)\s*(-?\d+(?:\.\d+)?))/y;
export function evaluateCondition(condition, env) {
  const source = String(condition),
    tokens = [];
  TOKEN.lastIndex = 0;
  for (let m; TOKEN.lastIndex < source.trim().length && (m = TOKEN.exec(source));)
    tokens.push(m[2] ? compare(reading(m[2], env), m[3], Number(m[4])) : m[1]);
  if (source.slice(TOKEN.lastIndex).trim()) return false;
  let at = 0;
  const or = () => {
    let value = and();
    while (tokens[at] === '||') (at++, (value = and() || value));
    return value;
  };
  const and = () => {
    let value = atom();
    while (tokens[at] === '&&') (at++, (value = atom() && value));
    return value;
  };
  const atom = () => {
    const token = tokens[at++];
    if (token !== '(') return token === true;
    const value = or();
    return tokens[at++] === ')' && value;
  };
  const value = or();
  return at === tokens.length && value;
}
// The comparisons in a condition, e.g. [['temp', '>', 30], ...].
const atomsIn = (condition) =>
  String(condition)
    .split(/&&|\|\|/)
    .map((part) => part.trim().match(ATOM))
    .filter(Boolean)
    .map(([, signal, op, value]) => [signal, op, Number(value)]);

// [lower than usual, higher than usual] for each reading, with an icon.
const REASONS = {
  light: ['🌇', 'It is getting dark', 'The sun is very bright'],
  temp: ['🌡', 'It is getting cold indoors', 'It is getting hot indoors'],
  outdoorTemp: ['🌡', 'It is cold outside', 'It is hot outside'],
  humidity: ['💧', 'The air is very dry', 'The air is muggy'],
  rain: ['🌧', 'The rain has stopped', 'It is raining'],
  wind: ['🌬', 'The wind has dropped', 'The wind is strong'],
  cloud: ['☁', 'The sky has cleared', 'It is very cloudy'],
  soil: ['🌱', 'The soil is drying out', 'The soil is soaked'],
  tank: ['🛢', 'The water tank is low', 'The water tank is full'],
  pond: ['🐟', 'The pond is low', 'The pond is rising'],
  motion: ['👣', 'Nobody is moving', 'Someone is moving nearby'],
  door: ['🚪', 'The door is closed', 'A door has opened'],
  armed: ['🔔', 'The alarm is off', 'The alarm is armed'],
  occupied: ['🏠', 'Nobody is home', 'Someone is home'],
  distance: ['🚗', 'Something is close to the sensor', 'Nothing is near the sensor'],
  pot: ['🎛', 'The dial is turned down', 'The dial is turned up'],
};

// Why a quest is needed now, e.g. { icon: '🌇', text: 'It is getting dark' }, or null.
export function situationReason(quest, env, calm = CALM_DAY) {
  const conditions = quest.conditions || [];
  if (!conditions.some((c) => evaluateCondition(c, env) !== evaluateCondition(c, calm)))
    return null;
  // Explain with the comparison that actually changed, clearly past its threshold (in a
  // heatwave the kitchen fan is needed for the heat, even though the air is also drier).
  for (const [signal, op, value] of conditions.flatMap(atomsIn)) {
    const now = reading(signal, env),
      usual = reading(signal, calm);
    if (
      compare(now, op, value) !== compare(usual, op, value) &&
      Math.abs(now - value) >= margin(signal) &&
      REASONS[signal]
    ) {
      const [icon, low, high] = REASONS[signal];
      return { icon, text: now < usual ? low : high };
    }
  }
  // Only hovering at a limit: not a change worth calling a resident about.
  return null;
}

// Unfinished quests that are needed now, as [{ index, quest, reason }], in quest order.
export function neededNow(quests, env, isComplete = () => false) {
  return quests
    .map((quest, index) => ({ index, quest, reason: situationReason(quest, env) }))
    .filter((n) => n.reason && !isComplete(n.index));
}
