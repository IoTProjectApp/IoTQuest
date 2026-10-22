// Quests written in the Quest Editor (editor/workspaces/quest-editor, launched with
// scripts/world-editor.sh), saved in data/quests.js as the author's choices:
//   { version: 1, quests: [{ id, title, area, resident, role?, quote?, goal, ids, conditions,
//     scenarios, xp?, badge?, learn?, hint? }] }
// - ids: the devices to wire (see components in missions.js), sensors and outputs;
// - conditions: one per output, in the order the outputs appear in ids: when that output is on,
//   as 'reading op number' clauses joined by && and || ('light < 1800 && motion == 1'), or false
//   for an output that stays off;
// - scenarios: [name, readings, expected]: sensor levels as the game stores them (ADC sensors
//   0-100, read by the program as level x 40.95), and 1 or 0 for each output in order.
// Each is rebuilt and checked here, like teacher quests (custom-quests.js), and joins the game
// after the built-in quests, in the file's order, so saved progress for earlier quests is kept.
import AUTHORED from './data/quests.js';
import { evaluateCondition } from './situation.js';
import { baseEnv } from './signals.js';

export { AUTHORED };
export class AuthoredQuestError extends Error {}

const CLAUSE = /^\(?\s*([a-zA-Z_]\w*)\s*(<=|>=|==|!=|<|>)\s*(-?\d+(?:\.\d+)?)\s*\)?$/;
const text = (v) => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ') : '');

// The signals a condition reads, or null if it is not written as the game reads conditions.
export function conditionSignals(condition) {
  const clauses = String(condition)
    .split(/&&|\|\|/)
    .map((c) => c.trim());
  const signals = [];
  for (const clause of clauses) {
    // An output that is always off (or on) has the rule false (or true).
    if (clause === 'false' || clause === 'true') continue;
    const m = clause.match(CLAUSE);
    if (!m) return null;
    signals.push(m[1]);
  }
  return signals;
}

// A playable quest from the author's choices, or an AuthoredQuestError saying what to fix.
// `components` is the device catalogue (passed in, as missions.js imports this module).
export function buildAuthoredQuest(spec, components) {
  const fail = (message) => {
    throw new AuthoredQuestError(message);
  };
  if (!spec || typeof spec !== 'object') fail('This quest has no details.');
  const id = text(spec.id),
    title = text(spec.title),
    goal = text(spec.goal),
    area = text(spec.area),
    resident = text(spec.resident);
  if (!/^[a-z0-9][a-z0-9-]*$/.test(id))
    fail('The quest needs an id of lower-case letters, digits and dashes.');
  if (!title) fail('Give the quest a title.');
  if (!goal) fail('Describe the goal: what the student’s program must do.');
  if (!area) fail('Choose where the quest happens.');
  if (!resident) fail('Name who asks for the quest.');
  const ids = Array.isArray(spec.ids) ? spec.ids : [],
    devices = ids.map((d) => components.find((c) => c.id === d));
  if (devices.some((d) => !d)) fail(`Unknown device: ${ids[devices.indexOf(undefined)]}.`);
  if (new Set(ids).size !== ids.length) fail('Each device can be used once.');
  const outputs = devices.filter((d) => d.output),
    sensors = devices.filter((d) => !d.output),
    signals = new Set(sensors.map((d) => d.signal));
  if (!outputs.length) fail('Add at least one output (a light, fan, buzzer…).');
  if (!sensors.length) fail('Add at least one sensor.');
  const conditions = Array.isArray(spec.conditions) ? spec.conditions.map(text) : [];
  if (conditions.length !== outputs.length)
    fail(`Write one rule for each output: ${outputs.length} needed, ${conditions.length} written.`);
  conditions.forEach((condition, i) => {
    const used = conditionSignals(condition);
    if (!used)
      fail(`The rule for ${outputs[i].name} is not written as "reading < number": ${condition}`);
    const unknown = used.find((s) => !signals.has(s));
    if (unknown)
      fail(`The rule for ${outputs[i].name} reads "${unknown}", which no chosen sensor gives.`);
  });
  const scenarios = Array.isArray(spec.scenarios) ? spec.scenarios : [],
    known = new Set([...components.map((c) => c.signal).filter(Boolean), ...Object.keys(baseEnv)]);
  if (scenarios.length < 2) fail('Add at least two tests.');
  scenarios.forEach((s, i) => {
    if (!Array.isArray(s) || s.length !== 3)
      fail(`Test ${i + 1} is not a name, readings and results.`);
    const [name, env, expected] = s;
    if (!text(name)) fail(`Test ${i + 1} needs a name.`);
    if (!env || typeof env !== 'object') fail(`"${name}" needs its readings.`);
    // A test may set any reading the game knows (an alarm left armed, say), not only the
    // chosen sensors'.
    const stray = Object.keys(env).find((k) => !known.has(k));
    if (stray) fail(`"${name}" sets "${stray}", which is not a reading the game has.`);
    if (
      !Array.isArray(expected) ||
      expected.length !== outputs.length ||
      expected.some((v) => v !== 0 && v !== 1)
    )
      fail(`"${name}" needs on (1) or off (0) for each of the ${outputs.length} outputs.`);
  });
  return {
    title,
    area,
    resident,
    role: text(spec.role) || 'Resident',
    quote: text(spec.quote) || goal,
    goal,
    ids: [...ids],
    xp: Number.isFinite(spec.xp) ? Math.max(10, Math.min(500, Math.round(spec.xp))) : 100,
    badge: text(spec.badge) || title,
    learn: Array.isArray(spec.learn) ? spec.learn.map(text).filter(Boolean) : [],
    hint: text(spec.hint),
    conditions,
    scenarios: scenarios.map(([name, env, expected]) => [text(name), { ...env }, [...expected]]),
    authored: id,
  };
}

// What each rule says should happen for a test's readings: the result a correct program gives.
// `env` holds levels as the game stores them; the rules are read in the program's units.
export const expectedFor = (conditions, env) =>
  conditions.map((condition) => (evaluateCondition(condition, env) ? 1 : 0));

// Every saved quest that builds; one that does not is left out (and reported) rather than
// stopping the game.
export function authoredQuests(components, saved = AUTHORED) {
  const quests = [];
  for (const spec of saved?.quests || [])
    try {
      quests.push(buildAuthoredQuest(spec, components));
    } catch (error) {
      if (error instanceof AuthoredQuestError)
        console.warn(`Quest "${spec?.title || spec?.id}" left out: ${error.message}`);
      else throw error;
    }
  return quests;
}
