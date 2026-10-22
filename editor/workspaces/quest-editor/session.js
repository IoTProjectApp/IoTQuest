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
  constructor(saved = { version: 1, quests: [] }) {
    this.saved = clone(saved);
    this.quests = clone(saved.quests || []);
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
  commit(label, change) {
    const before = clone(this.quests);
    const result = change(this.quests);
    if (result === false) {
      this.quests = before;
      return false;
    }
    if (same(before, this.quests)) return false;
    this.undoStack.push({ label, quests: before });
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
    to.push({ label: entry.label, quests: clone(this.quests) });
    this.quests = entry.quests;
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
        ...(fields.title ? {} : {}),
        id,
      }),
    );
    return id;
  }
  // A copy of a built-in quest to change. Only rule quests (one rule per output, with tests) can
  // be copied; timed quests run sequences the editor does not write.
  copy(mission) {
    if (!canCopy(mission)) return null;
    return this.create({
      title: mission.title + ' (copy)',
      area: mission.area,
      resident: mission.resident,
      role: mission.role || 'Resident',
      quote: mission.quote || '',
      goal: mission.goal,
      ids: [...mission.ids],
      conditions: [...mission.conditions],
      scenarios: clone(mission.scenarios),
      xp: mission.xp || 100,
      badge: '',
      learn: [...(mission.learn || [])],
      hint: mission.hint || '',
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
  isChanged() {
    return !same(this.quests, this.saved.quests || []);
  }
  savedFile() {
    return { version: 1, quests: clone(this.quests) };
  }
  markSaved() {
    this.saved = this.savedFile();
    this.emit();
  }
}

export const canCopy = (mission) =>
  Array.isArray(mission.conditions) &&
  mission.conditions.length > 0 &&
  Array.isArray(mission.scenarios) &&
  !mission.sequences &&
  !mission.starter &&
  !mission.prewired;

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
export function checkQuest(spec, { others = [] } = {}) {
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
  const titles = [...builtInQuests(), ...others.filter((q) => q.id !== spec.id)].map((q) =>
    q.title.toLowerCase(),
  );
  if (titles.includes(mission.title.toLowerCase()))
    errors.push(`Another quest is called "${mission.title}".`);
  for (const board of BOARDS) {
    const wiring = validate(defaults(mission.ids, board), board);
    for (const problem of wiring) errors.push(`${board}: ${problem}`);
  }
  if (errors.length) return { errors, warnings, runs, mission };
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
            )}${failed.length > 3 ? '…' : ''}): a test's results disagree with the rules.`,
        );
    }
  // A program that does nothing must not pass: some test has to need an output on.
  const idle = runTests(mission, IDLE.cpp, 'cpp', 'ESP32');
  if (idle.every((r) => r.pass))
    errors.push(
      'A program that does nothing passes every test: add a test where an output turns on.',
    );
  // Each output tested both on and off.
  outputsOf(spec).forEach((id, i) => {
    const values = new Set(spec.scenarios.map(([, , expected]) => expected[i]));
    if (values.size < 2)
      warnings.push(`No test turns ${device(id).name} ${values.has(1) ? 'off' : 'on'}: test both.`);
  });
  if (!spec.quote) warnings.push(`${spec.resident} has no words of their own: the goal is used.`);
  return { errors, warnings, runs, mission };
}
