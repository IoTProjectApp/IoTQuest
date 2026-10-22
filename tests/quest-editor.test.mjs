// Quests written in the Quest Editor: public/authored-quests.js (the game's side) and the
// workspace's model and check (editor/workspaces/quest-editor/session.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { components, missions } from '../public/missions.js';
import {
  applyQuestEdits,
  isRuleQuest,
  isTimedQuest,
  sequencesData,
  ORIGINALS,
} from '../public/authored-quests.js';
import { defaults, program } from '../public/missions.js';
import { timelineResults, normalise } from '../public/quest-timeline.js';
import {
  buildAuthoredQuest,
  authoredQuests,
  AuthoredQuestError,
  conditionSignals,
} from '../public/authored-quests.js';
import {
  QuestSession,
  checkQuest,
  builtInQuests,
  canCopy,
  resultsFromRules,
  BOARDS,
  LANGUAGES,
} from '../editor/workspaces/quest-editor/session.js';

const night = () => ({
  id: 'night-light',
  title: 'Night light',
  area: 'Bedroom',
  resident: 'Nina',
  goal: 'Turn the lamp on when it is dark.',
  ids: ['ldr', 'led'],
  conditions: ['light < 1800'],
  scenarios: [
    ['Day', { light: 3000 / 40.95 }, [0]],
    ['Night', { light: 400 / 40.95 }, [1]],
  ],
});

test('a quest is rebuilt from the author’s choices, with sensible defaults', () => {
  const m = buildAuthoredQuest(night(), components);
  assert.equal(m.authored, 'night-light');
  assert.equal(m.xp, 100);
  assert.equal(m.quote, m.goal, 'the goal stands in for their words');
  assert.deepEqual(m.conditions, ['light < 1800']);
  assert.deepEqual(conditionSignals('(light < 1800) && motion == 1 || false'), ['light', 'motion']);
  assert.equal(conditionSignals('light is low'), null);
});

test('a quest that could not be played is refused, saying what to fix', () => {
  const broken = [
    [{ ids: ['ldr'] }, /at least one output/],
    [{ conditions: [] }, /one rule for each output/],
    [{ conditions: ['temp > 30'] }, /reads "temp"/],
    [{ conditions: ['light is low'] }, /not written as/],
    [{ scenarios: [['Only', {}, [1]]] }, /at least two tests/],
    [
      {
        scenarios: [
          ['A', {}, [1]],
          ['B', { nonsense: 1 }, [0]],
        ],
      },
      /not a reading the game has/,
    ],
    [
      {
        scenarios: [
          ['A', {}, [1, 0]],
          ['B', {}, [0]],
        ],
      },
      /on \(1\) or off \(0\)/,
    ],
    [{ ids: ['ldr', 'teleporter'] }, /Unknown device/],
    [{ id: 'Bad Id' }, /lower-case/],
  ];
  for (const [change, message] of broken)
    assert.throws(
      () => buildAuthoredQuest({ ...night(), ...change }, components),
      (e) => e instanceof AuthoredQuestError && message.test(e.message),
    );
});

test('saved quests join the game in order; one that does not build is left out', () => {
  const warn = console.warn;
  console.warn = () => {};
  try {
    const quests = authoredQuests(components, {
      version: 1,
      quests: [
        night(),
        { ...night(), id: 'broken', ids: ['ldr'] },
        { ...night(), id: 'second', title: 'Second' },
      ],
    });
    assert.deepEqual(
      quests.map((q) => q.authored),
      ['night-light', 'second'],
    );
  } finally {
    console.warn = warn;
  }
});

test('a new quest is ready to play: its worked solution passes on both boards in both languages', () => {
  const s = new QuestSession(),
    result = checkQuest(s.quest(s.create()), { others: s.quests });
  assert.deepEqual(result.errors, []);
  assert.equal(result.runs.length, 4);
  for (const run of result.runs)
    assert.ok(
      run.results.every((r) => r.pass),
      run.board + ' ' + run.language,
    );
});

test('every built-in rule quest, and every timed one whose checks are data, can be copied, and the copy passes its check', () => {
  const s = new QuestSession(),
    copyable = builtInQuests().filter(canCopy);
  assert.ok(copyable.length > 100);
  for (const m of copyable) {
    const result = checkQuest(s.quest(s.copy(m)), { others: s.quests });
    assert.deepEqual(result.errors, [], m.title);
  }
});

test('the check catches a wrong result, a quest nothing can fail, and a taken title', () => {
  const s = new QuestSession(),
    id = s.create();
  s.edit(id, 'flip', (q) => (q.scenarios[0][2] = [1]));
  assert.ok(checkQuest(s.quest(id)).errors.some((e) => /disagree with the rules/.test(e)));
  // Results from the rules put it right.
  s.edit(id, 'fix', (q) => resultsFromRules(q).forEach((r, i) => (q.scenarios[i][2] = r)));
  assert.deepEqual(checkQuest(s.quest(id)).errors, []);
  // A light that never comes on: a do-nothing program would pass every test.
  s.edit(id, 'all off', (q) => {
    q.conditions = ['false'];
    q.scenarios = [
      ['Day', { light: 90 }, [0]],
      ['Dusk', { light: 50 }, [0]],
    ];
  });
  assert.ok(checkQuest(s.quest(id)).errors.some((e) => /does nothing passes/.test(e)));
  s.edit(id, 'title', (q) => (q.title = builtInQuests()[0].title));
  assert.ok(checkQuest(s.quest(id)).errors.some((e) => /Another quest is called/.test(e)));
});

test('undo and redo cover every change, and saving keeps only the quests', () => {
  const s = new QuestSession(),
    id = s.create();
  s.edit(id, 'Change title', (q) => (q.title = 'Porch light'));
  assert.equal(s.undo(), 'Change title');
  assert.equal(s.quest(id).title, 'New quest');
  s.redo();
  assert.equal(s.savedFile().quests[0].title, 'Porch light');
  s.markSaved();
  assert.equal(s.isChanged(), false);
  s.remove(id);
  assert.equal(s.quests.length, 0);
});

// ---- Changing built-in quests ----

// The game's quests as plain copies, so a test's changes stay in the test.
const fresh = () => missions.map((m) => ({ ...m }));
const quiet = (fn) => {
  const warn = console.warn,
    warnings = [];
  console.warn = (message) => warnings.push(message);
  try {
    fn();
  } finally {
    console.warn = warn;
  }
  return warnings;
};

test('saved changes to built-in quests apply in the game, story and rules', () => {
  const quests = fresh(),
    withAdvanced = quests.findIndex((m) => m.advanced?.conditions && isRuleQuest(m)),
    original = quests[withAdvanced];
  const warnings = quiet(() =>
    applyQuestEdits(quests, components, {
      edits: {
        'builtin:0': { of: 'Light the Path', title: 'Light the Garden Path', xp: 150 },
        [`builtin:${withAdvanced}`]: {
          of: original.title,
          conditions: original.conditions,
          scenarios: original.scenarios,
          goal: 'A clearer goal',
        },
      },
    }),
  );
  assert.deepEqual(warnings, []);
  assert.equal(quests[0].title, 'Light the Garden Path');
  assert.equal(quests[0].xp, 150);
  assert.deepEqual(quests[0].conditions, missions[0].conditions, 'the rest as it was');
  assert.equal(ORIGINALS.get(0).title, 'Light the Path', 'Reset knows the original');
  // Changed rules hold at the Advanced level too.
  assert.equal(quests[withAdvanced].advanced.conditions, undefined);
  assert.equal(quests[withAdvanced].goal, 'A clearer goal');
});

test('a change is left out if its quest has moved, or if it would break the quest', () => {
  const quests = fresh(),
    timed = quests.findIndex((m) => !isRuleQuest(m));
  const warnings = quiet(() =>
    applyQuestEdits(quests, components, {
      edits: {
        'builtin:1': { of: 'Not this quest', title: 'Wrong' },
        'builtin:2': { of: quests[2].title, conditions: [] },
        [`builtin:${timed}`]: { of: quests[timed].title, conditions: ['light < 5'] },
      },
    }),
  );
  assert.equal(warnings.length, 3);
  assert.equal(quests[1].title, missions[1].title);
  assert.deepEqual(quests[2].conditions, missions[2].conditions);
});

test('the editor keeps only what differs from a built-in quest, and resets it', () => {
  const s = new QuestSession();
  s.editBuiltIn(0, 'Change title', (q) => (q.title = 'Light the Garden Path'));
  s.editBuiltIn(0, 'Change rule', (q) => (q.conditions = ['light < 2000']));
  assert.deepEqual(s.edits['builtin:0'], {
    of: 'Light the Path',
    title: 'Light the Garden Path',
    conditions: ['light < 2000'],
  });
  // The threshold test at 1800 now disagrees, and the goal still names 1800.
  const check = s.checkBuiltIn(0);
  assert.ok(check.errors.some((e) => /disagree with the rules/.test(e)));
  assert.ok(check.warnings.some((w) => /goal still says 1800/.test(w)));
  s.editBuiltIn(0, 'Fix', (q) => resultsFromRules(q).forEach((r, i) => (q.scenarios[i][2] = r)));
  assert.deepEqual(s.checkBuiltIn(0).errors, []);
  // What the editor saves, the game applies.
  const quests = fresh();
  quiet(() => applyQuestEdits(quests, components, s.savedFile()));
  assert.equal(quests[0].title, 'Light the Garden Path');
  assert.deepEqual(quests[0].conditions, ['light < 2000']);
  s.resetBuiltIn(0);
  assert.deepEqual(s.edits, {});
  assert.equal(s.undo(), 'Reset to original');
  assert.ok(s.isEdited(0));
});

test('a timed quest’s story can change, its rules cannot, and its sequences are checked', () => {
  const s = new QuestSession(),
    timed = missions.findIndex((m) => !isRuleQuest(m));
  s.editBuiltIn(timed, 'goal', (q) => {
    q.goal = 'A clearer goal';
    q.conditions = ['light < 5'];
  });
  assert.deepEqual(Object.keys(s.edits[`builtin:${timed}`]), ['of', 'goal']);
  assert.ok(s.checkBuiltIn(timed).timed);
  assert.deepEqual(s.checkBuiltIn(timed).errors, []);
  s.editBuiltIn(timed, 'empty', (q) => (q.title = ''));
  assert.ok(s.checkBuiltIn(timed).errors.length);
});

// ---- Timed quests: sequences and worked programs ----
const timedIndex = (title) => missions.findIndex((m) => m.title === title);
// Every board and language run the worked program through the quest's sequences.
function timedRuns(m) {
  return BOARDS.flatMap((board) =>
    LANGUAGES.map(([language]) => {
      const devices = defaults(m.ids, board);
      return timelineResults(
        m,
        program(m, language, devices, true, board),
        language,
        devices,
        board,
      );
    }),
  ).flat();
}

test('with no changes, every timed quest is as coded', () => {
  const quests = fresh();
  quiet(() => applyQuestEdits(quests, components, { edits: {} }));
  for (const [i, m] of missions.entries()) assert.equal(quests[i].sequences, m.sequences);
});

test('a timed quest’s steps and worked program change together, and the game plays them', () => {
  const s = new QuestSession(),
    i = timedIndex('Stop the Fan Flicker');
  assert.ok(isTimedQuest(missions[i]));
  s.editBuiltIn(i, 'Program', (q) => {
    q.solution.loop = q.solution.loop.replace('temp >= 30', 'temp >= 31');
  });
  assert.match(s.checkBuiltIn(i).errors[0], /program and the steps disagree/);
  s.editBuiltIn(i, 'Step', (q) => (q.sequences[0].steps[2].env.temp = 31));
  const check = s.checkBuiltIn(i);
  assert.deepEqual(check.errors, []);
  assert.equal(check.runs.length, 4);
  assert.deepEqual(Object.keys(s.edits['builtin:' + i]), ['of', 'sequences', 'solution']);
  // What the editor saves, the game applies, at both levels.
  const quests = fresh();
  quiet(() => applyQuestEdits(quests, components, s.savedFile()));
  const m = quests[i];
  assert.equal(normalise(m.sequences[0].steps[2]).env.temp, 31);
  assert.match(m.solution.loop, /temp >= 31/);
  assert.equal(m.advanced.sequences, undefined);
  assert.equal(m.advanced.solution, undefined);
  assert.ok(timedRuns(m).every((r) => r.pass));
  assert.ok(timedRuns({ ...m, ...m.advanced }).every((r) => r.pass));
  s.resetBuiltIn(i);
  assert.deepEqual(s.edits, {});
});

test('coded checks stay with their steps, and only where the quest has them', () => {
  const s = new QuestSession(),
    i = timedIndex('Cafe Queue Counter');
  assert.ok(s.hasCodedChecks(i));
  assert.ok(!canCopy(missions[i]), 'its coded checks cannot be copied');
  s.editBuiltIn(i, 'Label', (q) => (q.sequences[0].steps[1].label = 'A customer comes in'));
  assert.deepEqual(s.checkBuiltIn(i).errors, []);
  const saved = s.savedFile().edits['builtin:' + i];
  assert.deepEqual(saved.sequences[0].steps[0].check, { coded: [0, 0] });
  const quests = fresh();
  quiet(() => applyQuestEdits(quests, components, s.savedFile()));
  assert.equal(quests[i].sequences[0].steps[0].check, missions[i].sequences[0].steps[0].check);
  assert.equal(quests[i].sequences[0].steps[1].label, 'A customer comes in');
  assert.ok(timedRuns(quests[i]).every((r) => r.pass));
  // A check the quest does not have is not saved into it.
  s.editBuiltIn(i, 'Bad', (q) => (q.sequences[0].steps[1].check = { coded: [5, 5] }));
  assert.match(s.checkBuiltIn(i).errors[0], /coded check the quest does not have/);
});

test('timed changes that would break a quest are left out', () => {
  const i = timedIndex('Stop the Fan Flicker'),
    data = () => sequencesData(missions[i].sequences);
  const bad = [
    (seq) => (seq[0].steps[0].expect = [1, 0]),
    (seq) => (seq[0].steps[0].env = { nonsense: 1 }),
    (seq) => (seq[0].steps[0].ms = 0),
    (seq) => (seq[0].steps[0].wobble = true),
    (seq) => seq[0].steps.forEach((step) => delete step.expect),
  ];
  for (const change of bad) {
    const sequences = data();
    change(sequences);
    const quests = fresh(),
      warnings = quiet(() =>
        applyQuestEdits(quests, components, {
          edits: { ['builtin:' + i]: { of: missions[i].title, sequences } },
        }),
      );
    assert.equal(warnings.length, 1, String(change));
    assert.equal(quests[i].sequences, missions[i].sequences);
  }
  // Nor can a rule quest be given sequences, or a program a variable it cannot name.
  const quests = fresh(),
    warnings = quiet(() =>
      applyQuestEdits(quests, components, {
        edits: {
          'builtin:0': { of: missions[0].title, sequences: data() },
          ['builtin:' + i]: { of: missions[i].title, solution: { loop: 'x', state: { '1x': 0 } } },
        },
      }),
    );
  assert.equal(warnings.length, 2);
});

test('a quest of yours can be made timed, and plays as written', () => {
  const s = new QuestSession(),
    id = s.create();
  s.makeTimed(id);
  const q = s.quest(id);
  assert.equal(q.conditions, undefined);
  assert.equal(q.sequences[0].steps.length, 2);
  assert.match(q.solution.loop, /if \(light < 1800\) \{/);
  assert.deepEqual(checkQuest(q, { others: s.quests }).errors, []);
  // A step that disagrees with the program is caught.
  s.edit(id, 'Flip', (x) => (x.sequences[0].steps[1].expect = [0]));
  assert.ok(checkQuest(s.quest(id), { others: s.quests }).errors.length);
  s.undo();
  const [built] = authoredQuests(components, s.savedFile());
  assert.deepEqual(built.conditions, []);
  assert.ok(timedRuns(built).every((r) => r.pass));
});
