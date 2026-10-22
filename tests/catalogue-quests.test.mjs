import test from 'node:test';
import assert from 'node:assert/strict';
import {
  missions,
  components,
  defaults,
  validate,
  program,
  baseEnv,
  missionBudget,
} from '../public/missions.js';
import { Runtime } from '../public/runtime.js';
import { createLabState, updateResources } from '../public/lab.js';
import { HOME_AREAS } from '../public/home-areas.js';
import { locations, adaptMissions } from '../public/locations.js';
import { communityQuests } from '../public/community-quests.js';
import { catalogueQuests } from '../public/catalogue-quests.js';
import { boundaryScenarios } from '../public/quest-boundaries.js';
import { timelineResults } from '../public/quest-timeline.js';
import { coachSteps } from '../public/code-coach.js';
import { expeditionResults, questThemes } from '../public/expedition.js';
import { createBugHunt } from '../public/bug-hunt.js';

const byNumber = (n) => catalogueQuests.find((q) => q.catalogue === n);
const advancedOf = (q) => ({ ...q, ...q.advanced });
// Both levels of every quest except the expedition, which has no program.
const levels = catalogueQuests
  .filter((q) => !q.capstone)
  .flatMap((q) => [
    ['beginner', q],
    ['advanced', advancedOf(q)],
  ]);
const name = (level, q) => 'Q' + q.catalogue + ' ' + q.title + ' (' + level + ')';
const outputsOf = (q) => q.ids.filter((id) => components.find((c) => c.id === id).output);

// Every result of Test your solution for `code`: scenarios, limit checks and timelines.
function testResults(m, code, language, board) {
  const devices = defaults(m.ids, board),
    out = [],
    outs = m.ids.map((id) => devices.find((d) => d.id === id)).filter((d) => d.output);
  try {
    const runtime = new Runtime(code, language, devices, board);
    for (const [label, env, expected] of [...m.scenarios, ...boundaryScenarios(m, baseEnv)]) {
      let result;
      for (let i = 0; i < 25; i++) result = runtime.step({ ...baseEnv, ...env });
      const actual = outs.map((d) => ((result.outputs[d.pin] || 0) > 0 ? 1 : 0));
      out.push({ name: label, pass: expected.every((v, i) => v === actual[i]), detail: actual });
    }
  } catch (e) {
    out.push({ name: 'Program execution', pass: false, detail: e.message });
  }
  return [...out, ...timelineResults(m, code, language, devices, board)];
}

test('catalogue quests come last, after the community quests, in catalogue order', () => {
  const first = missions.indexOf(catalogueQuests[0]);
  assert.equal(first, missions.indexOf(communityQuests.at(-1)) + 1);
  // (Quests written in the Quest Editor may follow them.)
  assert.deepEqual(missions.slice(first, first + catalogueQuests.length), catalogueQuests);
  // Everything in the catalogue except the quests the game already had.
  const existing = [21, 22, 23, 24, 25, 26, 56, 57, 58];
  assert.deepEqual(
    catalogueQuests.map((q) => q.catalogue),
    Array.from({ length: 100 }, (_, i) => i + 1).filter((n) => !existing.includes(n)),
  );
  assert.equal(new Set(catalogueQuests.map((q) => q.title)).size, catalogueQuests.length);
});

test('home quests come from whoever looks after the room; town quests from the building', () => {
  for (const q of catalogueQuests) {
    if (q.sectionQuest) {
      assert.ok(
        HOME_AREAS.some(([area]) => area === q.area),
        q.title + ': ' + q.area,
      );
      assert.ok(['Maya', 'Alex', 'Sam', 'Nina', 'Jordan'].includes(q.resident), q.title);
    } else {
      assert.ok(q.communityQuest, q.title);
      assert.ok(
        communityQuests.some((c) => c.communityType === q.communityType && c.area === q.area),
        q.title + ': ' + q.communityType + ' / ' + q.area,
      );
      assert.ok(q.resident && q.role, q.title);
    }
  }
});

test('every level is either one condition per output or a timeline with a worked program', () => {
  for (const [level, q] of levels) {
    const n = name(level, q);
    assert.ok(q.goal && q.hint, n);
    for (const id of q.ids)
      assert.ok(
        components.some((c) => c.id === id),
        n + ': ' + id,
      );
    if (q.sequences?.length) {
      assert.deepEqual(q.conditions, [], n);
      assert.ok(q.solution?.loop, n + ': worked program');
    } else {
      assert.equal(q.conditions.length, outputsOf(q).length, n);
      assert.ok(q.scenarios.length, n);
      for (const [, , expected] of q.scenarios)
        assert.equal(expected.length, outputsOf(q).length, n);
      assert.ok(!q.solution, n + ': a condition level has no worked program of its own');
    }
  }
});

for (const board of ['ESP32', 'Raspberry Pi Pico'])
  for (const language of ['cpp', 'python'])
    test(`every catalogue level passes its own tests with its worked program (${board}, ${language})`, () => {
      for (const [level, m] of levels) {
        const n = name(level, m),
          devices = defaults(m.ids, board);
        assert.deepEqual(validate(devices, board), [], n);
        const code = program(m, language, devices, true, board),
          failed = testResults(m, code, language, board).filter((r) => !r.pass);
        assert.deepEqual(failed, [], n + '\n' + code);
        let used = createLabState().resources;
        const runtime = new Runtime(code, language, devices, board);
        for (const [, env] of m.scenarios)
          for (let i = 0; i < 25; i++)
            used = updateResources(
              used,
              devices,
              runtime.step({ ...baseEnv, ...env }).outputs,
              { ...baseEnv, ...env },
              0.2,
            );
        assert.ok(used.wh <= missionBudget(m).wh, n + ': budget ' + used.wh);
      }
    });

test('a program that does nothing fails every level', () => {
  for (const [level, m] of levels) {
    const devices = defaults(m.ids, 'ESP32'),
      outs = devices.filter((d) => d.output),
      code =
        'void setup() {\n' +
        outs.map((d) => '  pinMode(' + d.pin + ', OUTPUT);').join('\n') +
        '\n}\nvoid loop() {\n  delay(200);\n}\n';
    assert.ok(
      testResults(m, code, 'cpp', 'ESP32').some((r) => !r.pass),
      name(level, m),
    );
  }
});

test('advanced destinations get the advanced level; beginner ones and the original home do not', () => {
  const advanced = adaptMissions(missions, locations[0], 'advanced'),
    beginner = adaptMissions(missions, locations[0], 'beginner'),
    original = adaptMissions(missions, null),
    find = (list, q) => list.find((m) => m.catalogue === q.catalogue);
  for (const q of catalogueQuests.filter((q) => q.advanced?.ids)) {
    assert.deepEqual(find(advanced, q).ids, q.advanced.ids);
    assert.deepEqual(find(beginner, q).ids, q.ids);
    assert.deepEqual(find(original, q).ids, q.ids);
  }
  // Timeline checks and repair starters are functions; adapting quests keeps them.
  assert.equal(typeof find(advanced, byNumber(96)).sequences[0].steps[0].check, 'function');
  assert.equal(typeof find(beginner, byNumber(88)).starter, 'function');
  assert.equal(typeof find(advanced, byNumber(87)).prewired, 'function');
});

test('the Guide explains the patterns and checks the timeline', () => {
  const m = advancedOf(byNumber(6)),
    steps = coachSteps(m, 'cpp', [], 'ESP32');
  assert.ok(steps.some((s) => s.key === 'technique-hold'));
  const behaviour = steps.find((s) => s.key === 'behaviour');
  assert.equal(behaviour.check('void setup() {}\nvoid loop() {\n}\n').done, false);
  const worked = program(m, 'cpp', defaults(m.ids, 'ESP32'), true, 'ESP32');
  assert.equal(behaviour.check(worked).done, true);
  // Condition levels keep their usual decision steps; the expedition has a single step.
  assert.ok(coachSteps(byNumber(1), 'python', [], 'ESP32').some((s) => s.key === 'decide-0'));
  assert.equal(coachSteps(byNumber(100), 'cpp', [], 'ESP32').length, 1);
});

test('repair quests start broken and the tests catch it', () => {
  for (const [level, m] of [
    ['beginner', byNumber(86)],
    ['advanced', advancedOf(byNumber(86))],
    ['beginner', byNumber(88)],
    ['advanced', advancedOf(byNumber(88))],
  ])
    for (const board of ['ESP32', 'Raspberry Pi Pico'])
      for (const language of ['cpp', 'python']) {
        const devices = defaults(m.ids, board),
          code = program(m, language, devices, false, board);
        assert.notEqual(code, program(m, language, devices, true, board), name(level, m));
        assert.ok(
          testResults(m, code, language, board).some((r) => !r.pass),
          name(level, m) + ' ' + board + ' ' + language + '\n' + code,
        );
      }
  for (const board of ['ESP32', 'Raspberry Pi Pico']) {
    assert.ok(validate(byNumber(87).prewired(board, defaults), board).some((e) => /GND/.test(e)));
    const errors = validate(byNumber(87).advanced.prewired(board, defaults), board);
    assert.ok(errors.some((e) => /GND/.test(e)));
    assert.ok(errors.some((e) => /conflict/.test(e)));
    assert.ok(errors.some((e) => /ADC/.test(e)));
  }
});

test('the bug hunt plants bugs that the timelines catch', () => {
  const m = advancedOf(byNumber(5));
  assert.ok(createBugHunt(m, 'cpp', defaults(m.ids, 'ESP32'), 'ESP32', { seed: 3 }).bugs.length);
});

test('the expedition counts lighting, irrigation and climate passes at three destinations', () => {
  const index = (n) => missions.findIndex((m) => m.catalogue === n),
    pass = { code: 'x' },
    site = { completed: { [index(11)]: pass, [index(17)]: pass, [index(5)]: pass } };
  assert.deepEqual(questThemes(byNumber(11)), ['lighting']);
  assert.ok(questThemes(byNumber(17)).includes('irrigation'));
  assert.ok(questThemes(byNumber(5)).includes('climate'));
  const two = { locationProgress: { a: site, b: site } },
    three = { locationProgress: { a: site, b: site, c: site } };
  assert.equal(expeditionResults(two, missions, false)[0].pass, false);
  assert.equal(expeditionResults(three, missions, false)[0].pass, true);
  const advanced = expeditionResults(three, missions, true);
  assert.equal(advanced.length, 4);
  assert.equal(
    advanced.every((r) => r.pass),
    false,
  );
  const done = {
    locationProgress: {
      ...three.locationProgress,
      d: { completed: { [index(87)]: pass, [index(89)]: pass, [index(70)]: pass } },
    },
  };
  assert.ok(expeditionResults(done, missions, true).every((r) => r.pass));
});

// A common mistake must fail the level it teaches.
const mistakes = [
  [1, 'beginner', ['temp >= 8'], 'including the boundary'],
  [2, 'beginner', ['light < 1800'], 'ignoring the open switch'],
  [20, 'beginner', ['soil < 2400', 'humidity > 70'], 'draining the reserve'],
  [36, 'beginner', ['distance <= 50', 'distance <= 20'], 'trusting a reading of 0'],
  [53, 'advanced', ['motion == 1 && light < 1800 || rain >= 2500'], 'leaving out the brackets'],
  [73, 'advanced', ['light >= 3000 || wind < 30'], 'OR instead of AND'],
  [64, 'advanced', ['turbidity < 40 && ph > 6 && ph < 8', 'turbidity >= 40'], 'excluding the ends'],
];
for (const [number, level, conditions, why] of mistakes)
  test(`Q${number} (${level}) fails a program that makes the mistake of ${why}`, () => {
    const q = byNumber(number),
      m = level === 'advanced' ? advancedOf(q) : q,
      wrong = program({ ...m, conditions }, 'cpp', defaults(m.ids, 'ESP32'), true);
    assert.ok(testResults(m, wrong, 'cpp', 'ESP32').some((r) => !r.pass));
  });

// Timeline mistakes: the worked program with one change must fail.
const timelineMistakes = [
  [5, 'beginner', 'temp >= 30', 'temp > 30', 'switching on above 30 instead of at 30'],
  [6, 'advanced', '>= 30000', '>= 3000', 'a 3 s hold'],
  [9, 'advanced', '>= 20000', '> 20000', 'being one pass late'],
  [13, 'advanced', 'help = 0;', 'help = 1;', 'a reset that does not clear'],
  [19, 'advanced', 'tank <= 3000', 'tank < 3000', 'leaving out the off threshold itself'],
];
for (const [number, level, find, replace, why] of timelineMistakes)
  test(`Q${number} (${level}) fails the mistake of ${why}`, () => {
    const q = byNumber(number),
      m = level === 'advanced' ? advancedOf(q) : q,
      devices = defaults(m.ids, 'ESP32'),
      code = program(m, 'cpp', devices, true, 'ESP32');
    assert.ok(code.includes(find), code);
    assert.ok(
      timelineResults(m, code.replace(find, replace), 'cpp', devices, 'ESP32').some((r) => !r.pass),
    );
  });

// The device-spot tests cover each quest's beginner devices; advanced levels often add more.
test('advanced levels also give every device its own spot at every destination', async () => {
  const { addCommunityWorld } = await import('../public/community-world.js'),
    { createRegionalModel } = await import('../public/regions.js'),
    { deviceSpots, collides, DEVICE_GAP } = await import('../public/world-math.js');
  for (const id of ['legacy', ...locations.map((l) => l.id)]) {
    const model = createRegionalModel(id),
      location = locations.find((l) => l.id === id);
    addCommunityWorld(model, location);
    const areas = [
        ...model.community.areas,
        ...HOME_AREAS.map(([a, x, y]) => [
          a,
          ...(model.areaOverrides?.[a] || location?.areaOverrides?.[a] || [x, y]),
        ]),
      ],
      gap = id === 'legacy' ? DEVICE_GAP : 0.6;
    for (const q of catalogueQuests.filter((q) => q.advanced?.ids)) {
      const devices = q.advanced.ids.map((d) => ({ id: d, area: q.area })),
        spots = deviceSpots(devices, areas, model.colliders, model.rooms);
      devices.forEach((d, i) => {
        const p = spots.get(d);
        assert.equal(collides(p.x, p.z, model.colliders, 0.3), false, id + ' Q' + q.catalogue);
        for (const other of devices.slice(i + 1)) {
          const o = spots.get(other);
          assert.ok(Math.hypot(p.x - o.x, p.z - o.z) >= gap - 1e-9, id + ' Q' + q.catalogue);
        }
      });
    }
  }
});

test('timed levels name their patterns, and a timed prediction matches the worked program', async () => {
  const { understandingQuestions } = await import('../public/understanding.js'),
    { runSequence, normalise } = await import('../public/quest-timeline.js');
  for (const [level, m] of levels.filter(([, m]) => m.sequences?.length)) {
    assert.ok(m.techniques?.length, name(level, m) + ': no patterns for the Guide');
    const qs = understandingQuestions(m, 'cpp', defaults(m.ids, 'ESP32'), 'ESP32'),
      predict = qs.find((q) => q.id === 'predict');
    assert.ok(qs.length >= 2, name(level, m));
    if (!predict) continue;
    // Run the worked program up to the step the question names and look at the output.
    const [, sequenceName, stepLabel] = predict.prompt.match(/^“(.+)”: after “(.+)”, /),
      sequence = m.sequences.find((s) => s.name === sequenceName),
      upTo = sequence.steps.map(normalise).findIndex((s) => s.label === stepLabel),
      truncated = { ...sequence, steps: sequence.steps.slice(0, upTo + 1) },
      devices = defaults(m.ids, 'ESP32'),
      code = program(m, 'cpp', devices, true, 'ESP32'),
      answer = predict.choices[predict.answer].text,
      step = normalise(truncated.steps.at(-1)),
      k = step.expect.findIndex((v) => v === (answer === 'ON' ? 1 : 0));
    assert.ok(k >= 0, name(level, m));
    assert.ok(runSequence(m, truncated, code, 'cpp', devices, 'ESP32').pass, name(level, m));
  }
});

test('the debugging challenge can plant a bug in every level, even with no HIGH to flip', () => {
  for (const [level, m] of levels) {
    const devices = defaults(m.ids, 'ESP32'),
      example = program(m, 'cpp', devices, true, 'ESP32');
    // Like the game: flip a HIGH if there is one, else plant an output bug (quests with no
    // outputs, such as the counters and loggers, have no debugging challenge).
    if (example.includes('HIGH') || !devices.some((d) => d.output)) continue;
    const hunt = createBugHunt(m, 'cpp', devices, 'ESP32', { count: 1, kinds: ['output'] });
    assert.equal(hunt.bugs.length, 1, name(level, m));
    assert.ok(
      testResults(m, hunt.code, 'cpp', 'ESP32').some((r) => !r.pass),
      name(level, m),
    );
  }
});

test('Find the Wrong Pin plants a usable header pin on both boards', () => {
  for (const board of ['ESP32', 'Raspberry Pi Pico']) {
    const m = byNumber(86),
      devices = defaults(m.ids, board),
      starter = program(m, 'cpp', devices, false, board),
      pin = Number(starter.match(/output0 = (\d+);/)[1]);
    assert.ok(!devices.some((d) => d.pin === pin), board);
    assert.deepEqual(
      validate([{ ...devices[1], pin }], board).filter((e) => /unavailable/.test(e)),
      [],
      board,
    );
  }
});

test('the expedition counts the themes of the level that was passed', () => {
  const m = { ids: ['button', 'pump'], advanced: { ids: ['soil', 'button', 'pump'] } };
  assert.deepEqual(questThemes(m), []);
  assert.deepEqual(questThemes(m, true), ['irrigation']);
});

test('messages published while the network is down do not count as sent', () => {
  const m = {
      ids: ['outside'],
      sequences: [
        {
          name: 'Offline',
          steps: [
            ['Connected', {}, 1000, null],
            {
              label: 'Down',
              network: false,
              ms: 1000,
              check: (ctx) => ctx.stepPublishes.length === 0 || 'counted a dropped message',
            },
          ],
        },
      ],
    },
    devices = defaults(m.ids, 'ESP32'),
    code =
      'void setup() {\n  mqttConnect("t");\n}\nvoid loop() {\n  mqttPublish("a/b", 1);\n  delay(200);\n}\n';
  assert.deepEqual(
    timelineResults(m, code, 'cpp', devices, 'ESP32').map((r) => r.pass),
    [true],
  );
});
