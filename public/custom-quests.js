import { components } from './missions.js';
import { readingRange } from './diagnostics.js';
import { OPERATORS } from './code-coach.js';
import { ADC_SIGNALS, ADC_SCALE } from './signals.js';
import { compare } from './situation.js';
// Teacher quests: a teacher describes a one-sensor, one-output rule in teacher.html and shares a
// small quest file; students import it and play it like a built-in quest (Guide, tests at the
// exact threshold, progress reports). The file stores only the teacher's choices; every import
// rebuilds and re-validates the quest from them, so an edited file cannot produce a broken quest.

export const QUEST_FORMAT = 'iotquest-quest',
  QUEST_VERSION = 1,
  QUEST_LIMITS = { bytes: 20000, title: 60, resident: 30, request: 240, quests: 30 };
export class QuestError extends Error {}

const isRecord = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const text = (v, max) => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ').slice(0, max) : '');
const units = (sensor) => readingRange(sensor)?.[2] || '';
const isAdc = (sensor) => ADC_SIGNALS.includes(sensor.signal);

// Sensors a quest can use: those with a known reading range. Outputs: every output device.
export const questSensors = () =>
  components.filter((c) => !c.output && c.signal && readingRange(c));
export const questOutputs = () => components.filter((c) => c.output);
// On/off sensors read only 0 or 1; every other sensor (including distance in cm) is numeric.
const binary = (sensor) => readingRange(sensor)?.[1] === 1;
export const questOperators = (sensor) => (binary(sensor) ? ['=='] : ['<', '<=', '>', '>=']);

// Stable id from the teacher's choices, so every student's copy of a quest shares it.
function questId(fields) {
  let h = 5381;
  for (const c of JSON.stringify(fields)) h = ((h * 33) ^ c.charCodeAt(0)) >>> 0;
  return 'teacher-' + h.toString(36);
}

// Builds a playable quest from the teacher's choices, or throws a QuestError explaining what to fix.
export function buildCustomQuest(input) {
  if (!isRecord(input)) throw new QuestError('This quest has no details.');
  const title = text(input.title, QUEST_LIMITS.title),
    resident = text(input.resident, QUEST_LIMITS.resident) || 'Your teacher',
    request = text(input.request, QUEST_LIMITS.request),
    sensor = questSensors().find((c) => c.id === input.sensor),
    output = questOutputs().find((c) => c.id === input.output),
    operator = String(input.operator || ''),
    threshold = Number(input.threshold);
  if (!title) throw new QuestError('Give the quest a title.');
  if (!sensor) throw new QuestError('Choose a sensor for the quest.');
  if (!output) throw new QuestError('Choose an output for the quest.');
  if (!questOperators(sensor).includes(operator))
    throw new QuestError('Choose how the ' + sensor.name + ' reading is compared.');
  const [lo, hi] = readingRange(sensor);
  if (!Number.isFinite(threshold)) throw new QuestError('The threshold must be a number.');
  if (!binary(sensor) ? threshold <= lo || threshold >= hi : ![0, 1].includes(threshold))
    throw new QuestError(
      !binary(sensor)
        ? `The threshold must be between ${lo} and ${hi}${units(sensor) ? ' ' + units(sensor) : ''}, so the sensor can read values on both sides of it.`
        : 'A digital sensor reads 1 (HIGH) or 0 (LOW).',
    );
  // ADC sensors (0–4095) and distance (cm) report whole numbers.
  const whole = isAdc(sensor) || !sensor.analog;
  if (whole && !Number.isInteger(threshold))
    throw new QuestError(`The ${sensor.name} reads whole numbers from ${lo} to ${hi}.`);
  const fields = {
    title,
    resident,
    request,
    sensor: sensor.id,
    output: output.id,
    operator,
    threshold,
  };
  const signal = sensor.signal,
    env = (reading) => ({ [signal]: isAdc(sensor) ? reading / ADC_SCALE : reading }),
    step = whole ? 1 : 0.5,
    on = output.name.toLowerCase();
  // Tests check well away from the threshold, right next to it and exactly at it.
  const readings = !binary(sensor)
    ? [
        ['Well below the threshold', Math.round(lo + (threshold - lo) * 0.3)],
        ['Just below the threshold', threshold - step],
        ['At the threshold', threshold],
        ['Just above the threshold', threshold + step],
        ['Well above the threshold', Math.round(threshold + (hi - threshold) * 0.6)],
      ]
    : [
        [`The sensor reads ${threshold ? 'HIGH' : 'LOW'}`, threshold],
        [`The sensor reads ${threshold ? 'LOW' : 'HIGH'}`, 1 - threshold],
        [`Back to ${threshold ? 'HIGH' : 'LOW'}`, threshold],
      ];
  const scenarios = readings
    .filter(([, v], i, all) => v >= lo && v <= hi && all.findIndex(([, w]) => w === v) === i)
    .map(([name, v]) => [name, env(v), [compare(v, operator, threshold) ? 1 : 0]]);
  const when =
    sensor.name.toLowerCase() +
    (!binary(sensor)
      ? ` reading ${OPERATORS[operator][0]} ${threshold}${units(sensor) ? ' ' + units(sensor) : ''}`
      : ` reads ${threshold ? 'HIGH (1)' : 'LOW (0)'}`);
  return {
    id: questId(fields),
    fields,
    title,
    area: 'Teacher quest',
    resident,
    role: 'Your teacher',
    quote: '“' + (request || `Could you turn the ${on} on when the ${when}?`) + '”',
    goal: `Turn the ${on} on when the ${when}. Otherwise keep the ${on} off.`,
    ids: [sensor.id, output.id],
    xp: 100,
    badge: 'Teacher quest',
    learn: [sensor.analog ? 'Analogue input' : 'Digital input', 'Conditions', 'Digital output'],
    hint: `Read the ${sensor.name.toLowerCase()} into a variable, compare it with ${threshold} using ${operator}, and write HIGH when that is true, LOW otherwise.`,
    conditions: [`${signal} ${operator} ${threshold}`],
    scenarios,
  };
}

export function questFile(quest) {
  return JSON.stringify(
    { format: QUEST_FORMAT, version: QUEST_VERSION, quest: quest.fields },
    null,
    2,
  );
}
export const questFileName = (quest) =>
  'iotquest-quest-' +
  (quest.title
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'quest') +
  '.json';

// Reads a quest file a teacher shared, rejecting anything that is not one.
export function parseQuestFile(source) {
  if (typeof source !== 'string') throw new QuestError('This file could not be read.');
  if (source.length > QUEST_LIMITS.bytes)
    throw new QuestError('This file is too large to be a quest.');
  let raw;
  try {
    raw = JSON.parse(source);
  } catch {
    throw new QuestError('This is not an IoT Quest quest file (it is not JSON).');
  }
  if (!isRecord(raw) || raw.format !== QUEST_FORMAT)
    throw new QuestError(
      'This is not an IoT Quest quest file. Teachers make them in Class progress → Create a quest.',
    );
  if (raw.version !== QUEST_VERSION)
    throw new QuestError('This quest was made by a different version of IoT Quest.');
  return buildCustomQuest(raw.quest);
}

// Saved quests are kept as the teacher's choices; invalid ones are dropped.
export function loadCustomQuests(saved) {
  const quests = [];
  for (const fields of Array.isArray(saved) ? saved.slice(0, QUEST_LIMITS.quests) : [])
    try {
      const quest = buildCustomQuest(fields);
      if (!quests.some((q) => q.id === quest.id)) quests.push(quest);
    } catch {}
  return quests;
}

// A teacher quest played in the game, using the same machinery as other challenges.
export const customChallenge = (quest) => ({
  id: quest.id,
  track: 'custom',
  title: quest.title,
  goal: quest.goal,
  ids: quest.ids,
  hints: [quest.hint],
  mission: quest,
});
