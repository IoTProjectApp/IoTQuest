// Quests written in the Quest Editor: public/authored-quests.js (the game's side) and the
// workspace's model and check (editor/workspaces/quest-editor/session.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { components } from '../public/missions.js';
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

test('every built-in rule quest can be copied, and the copy passes its check', () => {
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
