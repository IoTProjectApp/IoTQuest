// The Quest Editor's model: the quests written here (saved in public/data/quests.js, the format is
// in public/authored-quests.js), the built-in quests to read and copy from, undo history, and the
// check that proves a quest can be played. Free of the DOM so it runs under Node in the tests.
import {
  missions,
  components,
  defaults,
  validate,
  program,
  baseEnv,
} from '../../../public/missions.js';
import { Runtime } from '../../../public/runtime.js';
import { boundaryScenarios } from '../../../public/quest-boundaries.js';
import { timelineResults } from '../../../public/quest-timeline.js';
import { ADC_SIGNALS, ADC_SCALE } from '../../../public/signals.js';
import {
  buildAuthoredQuest,
  AuthoredQuestError,
  expectedFor,
  ORIGINALS,
  STORY,
  RULES,
  TIMED,
  isRuleQuest,
  isTimedQuest,
  sequencesData,
  timedSequences,
  timedSolution,
} from '../../../public/authored-quests.js';

export const BOARDS = ['ESP32', 'Raspberry Pi Pico'];
export const LANGUAGES = [
  ['cpp', 'Arduino C++'],
  ['python', 'MicroPython'],
];
const clone = (value) => JSON.parse(JSON.stringify(value));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
// The built-in quests: every quest in the game that was not written here.
export const builtInQuests = () => missions.filter((m) => !m.authored);
// Readings in the program's units (ADC sensors 0-4095) and as the game stores them (0-100).
export const isAdc = (signal) => ADC_SIGNALS.includes(signal);
export const toReading = (signal, level) => (isAdc(signal) ? Math.round(level * ADC_SCALE) : level);
export const toLevel = (signal, reading) => (isAdc(signal) ? reading / ADC_SCALE : reading);
export const device = (id) => components.find((c) => c.id === id);
export const outputsOf = (spec) => spec.ids.filter((id) => device(id)?.output);
export const sensorsOf = (spec) => spec.ids.filter((id) => device(id) && !device(id).output);

export class QuestSession {
  constructor(saved = { version: 1, quests: [], edits: {} }) {
    this.saved = { version: 1, quests: clone(saved.quests || []), edits: clone(saved.edits || {}) };
    this.quests = clone(saved.quests || []);
    // Changes to built-in quests, by place ('builtin:12'), as saved.
    this.edits = clone(saved.edits || {});
    this.undoStack = [];
    this.redoStack = [];
    this.listeners = new Set();
  }
  on(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  emit() {
    for (const listener of this.listeners) listener(this);
  }
  quest(id) {
    return this.quests.find((q) => q.id === id);
  }
  // Everything that can change, for undo: your quests and your changes to built-in ones.
  snapshot() {
    return clone({ quests: this.quests, edits: this.edits });
  }
  restoreSnapshot({ quests, edits }) {
    this.quests = quests;
    this.edits = edits;
  }
  commit(label, change) {
    const before = this.snapshot();
    const result = change(this.quests);
    if (result === false) {
      this.restoreSnapshot(before);
      return false;
    }
    if (same(before, this.snapshot())) return false;
    this.undoStack.push({ label, state: before });
    this.redoStack = [];
    this.emit();
    return true;
  }
  undo() {
    return this.step(this.undoStack, this.redoStack);
  }
  redo() {
    return this.step(this.redoStack, this.undoStack);
  }
  step(from, to) {
    const entry = from.pop();
    if (!entry) return null;
    to.push({ label: entry.label, state: this.snapshot() });
    this.restoreSnapshot(entry.state);
    this.emit();
    return entry.label;
  }
  // Changes one quest: `change(quest)` edits it in place.
  edit(id, label, change) {
    return this.commit(label, (quests) => change(quests.find((q) => q.id === id)));
  }
  // A new quest: a light that comes on in the dark, ready to change. Returns its id.
  create(fields = {}) {
    const id = this.freeId(fields.title || 'new-quest');
    this.commit('New quest', (quests) =>
      quests.push({
        id,
        title: 'New quest',
        area: 'Garden path',
        resident: 'Maya',
        role: 'Resident',
        quote: '',
        goal: 'Turn the light on when it gets dark.',
        ids: ['ldr', 'led'],
        conditions: ['light < 1800'],
        scenarios: [
          ['Daylight', { light: 3000 / ADC_SCALE }, [0]],
          ['Dark', { light: 400 / ADC_SCALE }, [1]],
        ],
        xp: 100,
        badge: '',
        learn: [],
        hint: '',
        ...fields,
        id,
      }),
    );
    // A timed quest has sequences and a worked program instead of rules and tests.
    const made = this.quest(id);
    if (Array.isArray(made.sequences)) {
      delete made.conditions;
      delete made.scenarios;
    }
    return id;
  }
  // A copy of a built-in quest to change: a rule quest, or a timed quest whose checks are all data
  // (one that checks what the program printed or published keeps code the editor cannot copy).
  copy(mission) {
    if (!canCopy(mission)) return null;
    const timed = isTimedQuest(mission);
    return this.create({
      title: mission.title + ' (copy)',
      area: mission.area,
      resident: mission.resident,
      role: mission.role || 'Resident',
      quote: mission.quote || '',
      goal: mission.goal,
      ids: [...mission.ids],
      ...(timed
        ? { sequences: sequencesData(mission.sequences), solution: clone(mission.solution) }
        : { conditions: [...mission.conditions], scenarios: clone(mission.scenarios) }),
      xp: mission.xp || 100,
      badge: '',
      learn: [...(mission.learn || [])],
      hint: mission.hint || '',
    });
  }
  // A quest of yours made timed: its tests become steps, its rules a worked program.
  makeTimed(id) {
    return this.commit('Make it timed', (quests) => {
      const at = quests.findIndex((q) => q.id === id);
      if (at < 0 || Array.isArray(quests[at].sequences)) return false;
      quests[at] = timedFromRules(quests[at]);
    });
  }
  remove(id) {
    return this.commit('Delete quest', (quests) => {
      const at = quests.findIndex((q) => q.id === id);
      if (at < 0) return false;
      quests.splice(at, 1);
    });
  }
  freeId(title) {
    const base =
      String(title)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 40) || 'quest';
    let id = base,
      n = 2;
    while (this.quest(id)) id = `${base}-${n++}`;
    return id;
  }
  // ---- Built-in quests: changed in place, by their place in the game's list ----
  // The quest's fields as the code makes them.
  // A timed quest's sequences come as data, a coded check named by where it sits.
  original(index) {
    const m = ORIGINALS.get(index) ?? missions[index],
      fields = Object.fromEntries([...STORY, ...RULES].map((k) => [k, clone(m[k] ?? null)]));
    if (isTimedQuest(missions[index]))
      Object.assign(fields, {
        sequences: sequencesData(m.sequences),
        solution: clone(m.solution),
      });
    return fields;
  }
  // The sequences as the code made them, coded checks and all.
  codedSequences(index) {
    return (ORIGINALS.get(index) ?? missions[index]).sequences || [];
  }
  // The quest as it now stands: as the code makes it, with your changes.
  builtInSpec(index) {
    const { of, ...changes } = this.edits['builtin:' + index] || {};
    return { id: 'builtin-' + index, ...this.original(index), ...clone(changes) };
  }
  isEdited(index) {
    return 'builtin:' + index in this.edits;
  }
  // Changes a built-in quest: `change(spec)` edits it in place; only what differs from the original
  // is kept. Devices, rules and tests change only on rule quests.
  editBuiltIn(index, label, change) {
    return this.commit(label, () => {
      const spec = this.builtInSpec(index),
        original = this.original(index);
      change(spec);
      const m = missions[index],
        differs = [
          ...STORY,
          ...(isRuleQuest(m) ? RULES : []),
          ...(isTimedQuest(m) ? TIMED : []),
        ].filter((k) => !same(spec[k], original[k]));
      if (!differs.length) delete this.edits['builtin:' + index];
      else
        this.edits['builtin:' + index] = {
          of: original.title,
          ...Object.fromEntries(differs.map((k) => [k, spec[k]])),
        };
    });
  }
  resetBuiltIn(index) {
    return this.commit('Reset to original', () => {
      delete this.edits['builtin:' + index];
    });
  }
  // Every quest's title but this one's, as they now stand: titles must stay their own.
  titlesBut(id) {
    return [
      ...builtInQuests()
        .map((m) => missions.indexOf(m))
        .map((i) => ['builtin-' + i, this.builtInSpec(i).title]),
      ...this.quests.map((q) => [q.id, q.title]),
    ]
      .filter(([other]) => other !== id)
      .map(([, title]) => String(title).toLowerCase());
  }
  // The check for a built-in quest as you have changed it.
  checkBuiltIn(index) {
    const spec = this.builtInSpec(index);
    if (isRuleQuest(missions[index])) {
      const result = checkQuest(spec, { titles: this.titlesBut(spec.id) }),
        original = this.original(index),
        numbers = (conditions) =>
          new Set((conditions || []).join(' ').match(/-?\d+(\.\d+)?/g) || []);
      // A threshold taken out of the rules but still in the words students read.
      const now = numbers(spec.conditions);
      for (const n of numbers(original.conditions))
        if (!now.has(n))
          for (const k of ['goal', 'hint', 'quote'])
            if (new RegExp(`(^|[^\\d.])${n.replace('.', '\\.')}([^\\d]|$)`).test(spec[k] || ''))
              result.warnings.push(`The ${k} still says ${n}, which the rules no longer use.`);
      return result;
    }
    // Any other quest: its story must still have a title, a goal, a place and someone asking.
    const errors = ['title', 'goal', 'area', 'resident']
      .filter((k) => !String(spec[k] ?? '').trim())
      .map((k) => `Its ${k} is empty.`);
    if (this.titlesBut(spec.id).includes(String(spec.title).toLowerCase()))
      errors.push(`Another quest is called "${spec.title}".`);
    if (!isTimedQuest(missions[index]))
      return { errors, warnings: [], runs: [], mission: null, storyOnly: true };
    // A timed quest: its sequences and worked program are checked as a new timed quest's are,
    // keeping the coded checks the quest has.
    const warnings = [],
      runs = [];
    let mission = null;
    try {
      mission = {
        ...missions[index],
        ...Object.fromEntries(STORY.map((k) => [k, spec[k]])),
        conditions: [],
        scenarios: [],
        sequences: timedSequences(spec, components, this.codedSequences(index)),
        solution: timedSolution(spec.solution),
      };
    } catch (error) {
      if (!(error instanceof AuthoredQuestError)) throw error;
      errors.push(error.message);
    }
    if (mission && !errors.length) prove(mission, spec, errors, warnings, runs);
    return { errors, warnings, runs, mission, timed: true };
  }
  // Whether a quest's sequences keep checks only the code can make (so it cannot be copied).
  hasCodedChecks(index) {
    return this.builtInSpec(index).sequences?.some((s) => s.steps.some((step) => step.check));
  }
  isChanged() {
    return !same(this.snapshot(), { quests: this.saved.quests, edits: this.saved.edits });
  }
  savedFile() {
    return { version: 1, quests: clone(this.quests), edits: clone(this.edits) };
  }
  markSaved() {
    this.saved = this.savedFile();
    this.emit();
  }
}

export const canCopy = (mission) =>
  isRuleQuest(mission) ||
  (isTimedQuest(mission) &&
    !mission.sequences.some((s) => s.steps.some((step) => typeof step.check === 'function')));

// What a correct program would do in each test, from the rules, every other reading as usual.
export function resultsFromRules(spec) {
  return spec.scenarios.map(([, env]) => expectedFor(spec.conditions, { ...baseEnv, ...env }));
}

// Runs a program against a quest's tests, the automatic threshold checks and any timed tests, as
// Test your solution does in the game.
export function runTests(mission, code, language, board) {
  const devices = defaults(mission.ids, board),
    outs = mission.ids.map((id) => devices.find((d) => d.id === id)).filter((d) => d.output),
    out = [];
  try {
    const runtime = new Runtime(code, language, devices, board);
    for (const [label, env, expected] of [
      ...mission.scenarios,
      ...boundaryScenarios(mission, baseEnv),
    ]) {
      let result;
      for (let i = 0; i < 25; i++) result = runtime.step({ ...baseEnv, ...env });
      const actual = outs.map((d) => ((result.outputs[d.pin] || 0) > 0 ? 1 : 0));
      out.push({ name: label, pass: expected.every((v, i) => v === actual[i]), expected, actual });
    }
  } catch (error) {
    out.push({ name: 'Program runs', pass: false, detail: error.message });
  }
  return [...out, ...timelineResults(mission, code, language, devices, board)];
}
const IDLE = {
  cpp: 'void setup() {}\nvoid loop() {\n  delay(100);\n}\n',
  python: 'import time\nwhile True:\n    time.sleep(0.1)\n',
};

// Everything that must hold before a quest is saved: it builds, its title is its own, it wires on
// both boards, the worked solution passes every test on both boards in both languages, and a
// program that does nothing fails. Errors stop saving; warnings do not.
export function checkQuest(spec, { others = [], titles = null } = {}) {
  const errors = [],
    warnings = [],
    runs = [];
  let mission = null;
  try {
    mission = buildAuthoredQuest(spec, components);
  } catch (error) {
    if (!(error instanceof AuthoredQuestError)) throw error;
    errors.push(error.message);
    return { errors, warnings, runs, mission };
  }
  const taken =
    titles ??
    [...builtInQuests(), ...others.filter((q) => q.id !== spec.id)].map((q) =>
      q.title.toLowerCase(),
    );
  if (taken.includes(mission.title.toLowerCase()))
    errors.push(`Another quest is called "${mission.title}".`);
  for (const board of BOARDS) {
    const wiring = validate(defaults(mission.ids, board), board);
    for (const problem of wiring) errors.push(`${board}: ${problem}`);
  }
  if (errors.length) return { errors, warnings, runs, mission };
  prove(mission, spec, errors, warnings, runs);
  return { errors, warnings, runs, mission, timed: Array.isArray(spec.sequences) };
}

// What each output is expected to do over a quest's tests or steps: the values given, per output.
export function expectations(spec) {
  const outputs = outputsOf(spec).length;
  const rows = Array.isArray(spec.sequences)
    ? spec.sequences.flatMap((s) => s.steps.map((step) => step.expect).filter(Array.isArray))
    : spec.scenarios.map(([, , expected]) => expected);
  return Array.from({ length: outputs }, (_, i) => new Set(rows.map((r) => r[i])));
}

// The worked solution on both boards in both languages, and a program that does nothing.
function prove(mission, spec, errors, warnings, runs) {
  const timed = Array.isArray(spec.sequences);
  for (const board of BOARDS)
    for (const [language, name] of LANGUAGES) {
      const devices = defaults(mission.ids, board),
        code = program(mission, language, devices, true, board),
        results = runTests(mission, code, language, board);
      runs.push({ board, language, name, code, results });
      const failed = results.filter((r) => !r.pass);
      if (failed.length)
        errors.push(
          `The worked solution fails ${failed.length} test${failed.length > 1 ? 's' : ''} on ${board} in ${name} (${failed
            .slice(0, 3)
            .map((r) => `"${r.name}"`)
            .join(
              ', ',
            )}${failed.length > 3 ? '…' : ''}): ${timed ? 'the program and the steps disagree' : "a test's results disagree with the rules"}.`,
        );
    }
  // A program that does nothing must not pass: some test has to need an output on.
  const idle = runTests(mission, IDLE.cpp, 'cpp', 'ESP32');
  if (idle.every((r) => r.pass))
    errors.push(
      `A program that does nothing passes every test: add a ${timed ? 'step' : 'test'} where an output turns on.`,
    );
  // Each output tested both on and off.
  const values = expectations(spec);
  outputsOf(spec).forEach((id, i) => {
    const on = values[i].has(1) || [...values[i]].some((v) => v?.level > 0),
      off = values[i].has(0) || [...values[i]].some((v) => v?.level === 0);
    if (!on || !off)
      warnings.push(
        `No ${timed ? 'step' : 'test'} expects ${device(id).name} ${on ? 'off' : 'on'}: test both.`,
      );
  });
  if (!spec.quote) warnings.push(`${spec.resident} has no words of their own: the goal is used.`);
}

// A rule quest made timed: one sequence playing its tests in order, a second each, and a worked
// program written from its rules. Its tests become steps; what each output does stays the same.
export function timedFromRules(spec) {
  const outputs = outputsOf(spec),
    { conditions = [], scenarios = [], ...rest } = clone(spec);
  return {
    ...rest,
    sequences: [
      {
        name: 'Tests in order',
        steps: scenarios.map(([label, env, expect]) => ({ label, env, ms: 1000, expect })),
      },
    ],
    solution: {
      loop: outputs
        .map((id, i) =>
          !conditions[i] || conditions[i] === 'false'
            ? `write(${id}, 0);`
            : `if (${conditions[i]}) {\n  write(${id}, 1);\n} else {\n  write(${id}, 0);\n}`,
        )
        .join('\n'),
    },
  };
}
