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
// A timed quest (whose outputs depend on what happened before: timers, latches, counters, MQTT)
// has, instead of conditions and scenarios,
// - sequences: [{ name, env?, tick?, steps: [{ label, env?, ms, expect?, restart?, network?,
//   send? }] }], played in order on one program as quest-timeline.js describes, each step's
//   expect one entry per output: 1, 0, null (either) or { level } for a 0–255 brightness;
// - solution: the worked program in the small C-like form catalogue-program.js describes
//   ({ state?, setup?, loop, delay? }), which must pass every sequence.
// Each is rebuilt and checked here, like teacher quests (custom-quests.js), and joins the game
// after the built-in quests, in the file's order, so saved progress for earlier quests is kept.
//
// The same file holds changes to built-in quests, keyed by the quest's place in the game's list:
//   edits: { 'builtin:12': { of: 'Storm Watch', title?, goal?, ... } }
// `of` is the quest's own title, so a change never lands on another quest if the code moves one;
// only the fields given change. Story fields (title, area, resident, role, quote, goal, xp, badge,
// learn, hint) can change on any quest; devices, rules and tests (ids, conditions, scenarios) only
// on rule quests, and sequences and the worked program (sequences, solution) only on timed quests,
// where they are checked like a new quest's and then apply at every level. A built-in step whose
// extra check is code (what a program printed or published) is saved as
// check: { coded: [sequence, step] }, naming where that check sits in the quest as coded.
import AUTHORED from './data/quests.js';
import { evaluateCondition } from './situation.js';
import { baseEnv } from './signals.js';

export { AUTHORED };
export class AuthoredQuestError extends Error {}

const CLAUSE = /^\(?\s*([a-zA-Z_]\w*)\s*(<=|>=|==|!=|<|>)\s*(-?\d+(?:\.\d+)?)\s*\)?$/;
const text = (v) => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ') : '');
const fail = (message) => {
  throw new AuthoredQuestError(message);
};

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

// Every reading the game has: what a test or a step may set.
const knownReadings = (components) =>
  new Set([...components.map((c) => c.signal).filter(Boolean), ...Object.keys(baseEnv)]);

// A playable quest from the author's choices, or an AuthoredQuestError saying what to fix.
// `components` is the device catalogue (passed in, as missions.js imports this module).
export function buildAuthoredQuest(spec, components) {
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
  const story = {
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
  };
  // A timed quest: sequences and a worked program instead of rules and tests.
  if (Array.isArray(spec.sequences))
    return {
      ...story,
      conditions: [],
      scenarios: [],
      sequences: timedSequences(spec, components),
      solution: timedSolution(spec.solution),
      authored: id,
    };
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
    known = knownReadings(components);
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
    ...story,
    conditions,
    scenarios: scenarios.map(([name, env, expected]) => [text(name), { ...env }, [...expected]]),
    authored: id,
  };
}

// ---- Timed quests ---------------------------------------------------------------------------
const STEP_KEYS = ['label', 'env', 'ms', 'expect', 'restart', 'network', 'send', 'check'];
// The longest a sequence may run, in ticks of the program's clock (a day at the usual 200 ms).
const MAX_TICKS = 432000;
// A variable's starting value as the worked program writes it: a number, or "text".
const STATE_VALUE = /^(-?\d+(\.\d+)?|"[^"\\\n]*")$/;
const isLevel = (v) =>
  !!v && typeof v === 'object' && Number.isInteger(v.level) && v.level >= 0 && v.level <= 255;

// A quest's sequences as data: every step an object, and a coded check named by where it sits.
export function sequencesData(sequences) {
  return (sequences || []).map((sequence, s) => ({
    name: sequence.name,
    ...(sequence.env ? { env: { ...sequence.env } } : {}),
    ...(sequence.tick ? { tick: sequence.tick } : {}),
    steps: sequence.steps.map((raw, i) => {
      const step = Array.isArray(raw)
        ? { label: raw[0], env: raw[1], ms: raw[2], expect: raw[3] }
        : raw;
      return Object.fromEntries(
        STEP_KEYS.filter((k) => step[k] !== undefined).map((k) => [
          k,
          k === 'check'
            ? { coded: [s, i] }
            : k === 'env'
              ? { ...step.env }
              : Array.isArray(step[k])
                ? step[k].map((v) => (v && typeof v === 'object' ? { ...v } : v))
                : step[k],
        ]),
      );
    }),
  }));
}

// Sequences the timeline can play, from their data, or an AuthoredQuestError saying what to fix.
// Coded checks come back from `coded`: the quest's sequences as the code made them.
export function timedSequences(spec, components, coded = []) {
  const outputs = (spec.ids || [])
      .map((d) => components.find((c) => c.id === d))
      .filter((d) => d?.output).length,
    known = knownReadings(components);
  const readings = (env, where) => {
    if (env === undefined) return;
    if (!env || typeof env !== 'object' || Array.isArray(env)) fail(`${where} needs its readings.`);
    for (const [k, v] of Object.entries(env)) {
      if (!known.has(k)) fail(`${where} sets "${k}", which is not a reading the game has.`);
      if (!Number.isFinite(v)) fail(`${where} sets ${k} to something that is not a number.`);
    }
  };
  const sequences = spec.sequences;
  if (!Array.isArray(sequences) || !sequences.length) fail('Add at least one sequence.');
  return sequences.map((sequence, s) => {
    const name = text(sequence?.name);
    if (!name) fail(`Sequence ${s + 1} needs a name.`);
    readings(sequence.env, `"${name}"`);
    const tick = sequence.tick ?? 200;
    if (!Number.isFinite(tick) || tick < 10 || tick > 3600000)
      fail(`"${name}" moves its clock on in ticks of 10 ms to an hour.`);
    if (!Array.isArray(sequence.steps) || !sequence.steps.length)
      fail(`"${name}" needs at least one step.`);
    let ticks = 0;
    const steps = sequence.steps.map((step, i) => {
      const at = `Step ${i + 1} of "${name}"`;
      if (!step || typeof step !== 'object' || Array.isArray(step)) fail(`${at} is not a step.`);
      const stray = Object.keys(step).find((k) => !STEP_KEYS.includes(k));
      if (stray) fail(`${at} has "${stray}", which steps do not have.`);
      if (!text(step.label)) fail(`${at} needs a label.`);
      readings(step.env, at);
      if (!Number.isFinite(step.ms) || step.ms <= 0) fail(`${at} needs a length in milliseconds.`);
      ticks += Math.round(step.ms / tick);
      if (step.expect !== undefined && step.expect !== null) {
        if (!Array.isArray(step.expect) || step.expect.length !== outputs)
          fail(`${at} needs on, off or either for each of the ${outputs} outputs.`);
        if (step.expect.some((v) => v !== 0 && v !== 1 && v !== null && !isLevel(v)))
          fail(`${at} expects something other than on, off, either or a 0–255 brightness.`);
      }
      for (const k of ['restart', 'network'])
        if (step[k] !== undefined && typeof step[k] !== 'boolean')
          fail(`${at}: ${k} is true or false.`);
      if (
        step.send !== undefined &&
        (!Array.isArray(step.send) ||
          step.send.length < 2 ||
          step.send.length > 3 ||
          step.send.some((v) => typeof v !== 'string') ||
          !text(step.send[0]))
      )
        fail(`${at} sends a message as a topic, a payload and, if you like, who sends it.`);
      const out = { ...step, label: text(step.label) };
      if (step.check !== undefined) {
        const [cs, ci] = Array.isArray(step.check?.coded) ? step.check.coded : [],
          original = coded[cs]?.steps?.[ci],
          check = original && !Array.isArray(original) ? original.check : undefined;
        if (typeof check !== 'function') fail(`${at} keeps a coded check the quest does not have.`);
        out.check = check;
      }
      return out;
    });
    if (ticks > MAX_TICKS) fail(`"${name}" runs for longer than a day of ticks.`);
    if (!steps.some((step) => step.expect || step.check))
      fail(`"${name}" checks nothing: expect an output on or off at some step.`);
    return { ...sequence, name, steps };
  });
}

// The worked program, checked: a copy, or an AuthoredQuestError saying what to fix.
export function timedSolution(solution) {
  if (!solution || typeof solution !== 'object') fail('Write the worked program.');
  const stray = Object.keys(solution).find((k) => !['state', 'setup', 'loop', 'delay'].includes(k));
  if (stray) fail(`The worked program has "${stray}", which it does not use.`);
  if (typeof solution.loop !== 'string' || !solution.loop.trim())
    fail('Write what the worked program does on every pass.');
  if (solution.setup !== undefined && typeof solution.setup !== 'string')
    fail('The worked program’s setup is text.');
  const state = solution.state ?? {};
  if (!state || typeof state !== 'object' || Array.isArray(state))
    fail('The worked program’s variables are names and starting values.');
  for (const [name, value] of Object.entries(state)) {
    if (!/^[a-zA-Z_]\w*$/.test(name)) fail(`"${name}" is not a variable name.`);
    if (!(Number.isFinite(value) || (typeof value === 'string' && STATE_VALUE.test(value))))
      fail(`${name} starts as a number or "text".`);
  }
  if (
    solution.delay !== undefined &&
    (!Number.isFinite(solution.delay) || solution.delay < 0 || solution.delay > 10000)
  )
    fail('The worked program waits 0 to 10000 ms on each pass.');
  return JSON.parse(JSON.stringify(solution));
}

// What each rule says should happen for a test's readings: the result a correct program gives.
// `env` holds levels as the game stores them; the rules are read in the program's units.
export const expectedFor = (conditions, env) =>
  conditions.map((condition) => (evaluateCondition(condition, env) ? 1 : 0));

export const STORY = [
  'title',
  'area',
  'resident',
  'role',
  'quote',
  'goal',
  'xp',
  'badge',
  'learn',
  'hint',
];
export const RULES = ['ids', 'conditions', 'scenarios'];
export const TIMED = ['sequences', 'solution'];
// What an Advanced version loses when its quest's behaviour changes: it plays the changed one.
const ADVANCED_BEHAVIOUR = [...RULES, ...TIMED, 'techniques'];
// A built-in quest whose devices, rules and tests can be edited.
export const isRuleQuest = (m) =>
  Array.isArray(m.conditions) &&
  m.conditions.length > 0 &&
  Array.isArray(m.scenarios) &&
  !m.sequences &&
  !m.starter &&
  !m.prewired;
// A built-in quest whose sequences and worked program can be edited.
export const isTimedQuest = (m) =>
  Array.isArray(m.sequences) &&
  m.sequences.length > 0 &&
  typeof m.solution?.loop === 'string' &&
  !m.starter &&
  !m.prewired;
// A copy that keeps functions (coded checks), which structuredClone cannot copy.
const copyData = (value) =>
  Array.isArray(value)
    ? value.map(copyData)
    : value && typeof value === 'object'
      ? Object.fromEntries(Object.entries(value).map(([k, v]) => [k, copyData(v)]))
      : value;
// Each changed quest's fields as the code made them, by place: what Reset puts back.
export const ORIGINALS = new Map();

// Applies the saved changes to built-in quests, in place. A change that names a quest no longer
// there, or that would leave it unplayable, is left out (and reported).
export function applyQuestEdits(missions, components, saved = AUTHORED) {
  for (const [key, edit] of Object.entries(saved?.edits || {})) {
    const index = Number(key.split(':')[1]),
      m = missions[index];
    try {
      if (!m || m.title !== edit.of)
        throw new AuthoredQuestError(`no built-in quest "${edit.of}" at place ${index}`);
      const fields = Object.fromEntries(
        Object.entries(edit).filter(
          ([k]) => STORY.includes(k) || RULES.includes(k) || TIMED.includes(k),
        ),
      );
      const rules = RULES.some((k) => k in fields),
        timed = TIMED.some((k) => k in fields);
      if (rules && !isRuleQuest(m))
        throw new AuthoredQuestError('its rules are timed and cannot change');
      if (timed && !isTimedQuest(m)) throw new AuthoredQuestError('it has no sequences to change');
      // A rule quest is checked as a whole new quest would be; a timed quest's sequences and
      // program are checked as data (CI runs the program through them), and every quest's story
      // must still have a title, a goal, a place and someone asking.
      if (isRuleQuest(m))
        buildAuthoredQuest({ ...m, ...fields, id: 'builtin-' + index }, components);
      else {
        for (const k of ['title', 'goal', 'area', 'resident'])
          if (k in fields && !text(fields[k])) throw new AuthoredQuestError(`its ${k} is empty`);
        // Sequences come back from their data, with the quest's own coded checks.
        if ('sequences' in fields)
          fields.sequences = timedSequences({ ...m, ...fields }, components, m.sequences);
        if ('solution' in fields) fields.solution = timedSolution(fields.solution);
      }
      ORIGINALS.set(
        index,
        Object.fromEntries([...STORY, ...RULES, ...TIMED].map((k) => [k, copyData(m[k])])),
      );
      Object.assign(m, copyData(fields));
      // Changed behaviour holds at every level: the Advanced version's own gives way to it.
      if ((rules || timed) && m.advanced) {
        m.advanced = { ...m.advanced };
        for (const k of ADVANCED_BEHAVIOUR) delete m.advanced[k];
      }
    } catch (error) {
      if (!(error instanceof AuthoredQuestError)) throw error;
      console.warn(`Change to quest "${edit?.of}" left out: ${error.message}`);
    }
  }
}

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
