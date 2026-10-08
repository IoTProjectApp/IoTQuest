import test from 'node:test';
import assert from 'node:assert/strict';
import { missions, defaults, program } from '../public/missions.js';
import {
  buildProgressReport,
  parseProgressReport,
  latestReports,
  reportViews,
  classGrid,
  progressCSV,
  needsHelp,
  needsReview,
  progressFileName,
  ProgressError,
  PROGRESS_LIMITS,
} from '../public/progress-report.js';
import { cellSummary } from '../public/teacher.js';

const devices = (i) => defaults(missions[i].ids, 'ESP32');
// A student who passed quest 1, is stuck on quest 2 and visited Fitzroy.
function savedGame() {
  const passedCode = program(missions[0], 'cpp', devices(0), true);
  return {
    name: 'Technician',
    language: 'cpp',
    board: 'ESP32',
    xp: 100,
    completed: {
      0: {
        badge: 'Night owl',
        xp: 100,
        date: '2026-10-01T10:00:00.000Z',
        language: 'cpp',
        code: passedCode,
      },
    },
    projects: {
      0: {
        devices: devices(0),
        code: { cpp: passedCode },
        lab: { testAttempts: 2 },
        coach: { cpp: { hints: { pins: 1 } } },
      },
      1: {
        devices: devices(1),
        code: { cpp: '// Welcome Home\nconst int motionPin = 27;\nconst int porchPin = 26;\n' },
        lab: { testAttempts: 3, evidence: [{ at: '2026-10-02T09:30:00.000Z', type: 'edit' }] },
        coach: { cpp: { hints: { pins: 2, setup: 1 } } },
      },
    },
    locationProgress: {
      fitzroy: {
        projects: { 0: { devices: devices(0), code: { cpp: '// only comments\n' } } },
        completed: {},
      },
    },
  };
}

test('a progress report lists every quest with status, attempts, hints, guide steps and code', () => {
  const report = buildProgressReport(savedGame(), {
    student: 'Amira K',
    classCode: '7B',
    now: new Date('2026-10-03T08:00:00Z'),
  });
  assert.equal(report.format, 'iotquest-progress');
  assert.equal(report.student, 'Amira K');
  assert.equal(progressFileName(report), 'iotquest-progress-amira-k-2026-10-03.json');
  const legacy = report.quests.filter((q) => q.location === 'legacy'),
    fitzroy = report.quests.filter((q) => q.location === 'fitzroy');
  assert.equal(legacy.length, missions.length);
  assert.equal(fitzroy.length, missions.length, 'beginner only: no advanced work in Fitzroy');
  assert.deepEqual(
    [legacy[0].status, legacy[1].status, legacy[2].status],
    ['passed', 'started', 'not-started'],
  );
  assert.equal(legacy[0].attempts, 2);
  assert.equal(legacy[0].hints, 1);
  assert.equal(legacy[0].stepsDone, legacy[0].stepsTotal);
  assert.match(legacy[0].code, /analogRead/);
  assert.equal(legacy[0].passedAt, '2026-10-01T10:00:00.000Z');
  // Quest 2: pins written, stuck at setup().
  assert.equal(legacy[1].attempts, 3);
  assert.equal(legacy[1].hints, 3);
  assert.equal(legacy[1].stuck, 'Write setup()');
  assert.equal(legacy[1].stepsDone, 1);
  assert.equal(legacy[1].lastActive, '2026-10-02T09:30:00.000Z');
  assert.ok(needsHelp(legacy[1]));
  // A comments-only starter is not "started" and carries no code.
  assert.equal(fitzroy[0].status, 'not-started');
  assert.equal(fitzroy[0].code, '');
  assert.equal(fitzroy[0].locationName, 'Fitzroy · Australia');
  // The report survives being handed in and read back.
  const back = parseProgressReport(JSON.stringify(report));
  assert.equal(back.student, 'Amira K');
  assert.deepEqual(back.quests[1], report.quests[1]);
});

test('the class view rejects files that are not progress reports and cleans bad fields', () => {
  const bad = (text, pattern) =>
    assert.throws(
      () => parseProgressReport(text),
      (e) => e instanceof ProgressError && pattern.test(e.message),
    );
  bad('not json', /not JSON/);
  bad('{"format":"other"}', /not an IoT Quest progress report/);
  bad('{"format":"iotquest-progress","version":9,"student":"A","quests":[]}', /different version/);
  bad('{"format":"iotquest-progress","version":1,"student":"  ","quests":[]}', /no student name/);
  bad('x'.repeat(PROGRESS_LIMITS.bytes + 1), /too large/);
  const r = parseProgressReport(
    JSON.stringify({
      format: 'iotquest-progress',
      version: 1,
      student: 'Ben',
      quests: [
        {
          status: 'hacked',
          attempts: -4,
          hints: 'many',
          code: 'x'.repeat(50000),
          difficulty: '<b>',
        },
        'junk',
      ],
    }),
  );
  assert.equal(r.quests.length, 1);
  assert.deepEqual(
    [r.quests[0].status, r.quests[0].attempts, r.quests[0].hints, r.quests[0].difficulty],
    ['not-started', 0, 0, 'original'],
  );
  assert.equal(r.quests[0].code.length, PROGRESS_LIMITS.code);
});

test('the class grid keeps each student’s newest report and summarises each quest', () => {
  const at = (iso) => new Date(iso),
    older = buildProgressReport(savedGame(), {
      student: 'Amira K',
      classCode: '7B',
      now: at('2026-10-01'),
    }),
    game = savedGame();
  game.completed[1] = { date: '2026-10-04T00:00:00Z', language: 'cpp', code: 'void loop(){}' };
  const newer = buildProgressReport(game, {
      student: 'amira k',
      classCode: '7b',
      now: at('2026-10-05'),
    }),
    ben = buildProgressReport(
      { name: 'Ben', language: 'python' },
      { student: 'Ben', now: at('2026-10-02') },
    ),
    reports = [older, newer, ben].map((r) => parseProgressReport(JSON.stringify(r)));
  assert.equal(latestReports(reports).length, 2);
  const views = reportViews(reports);
  assert.equal(views[0].id, 'legacy|original');
  assert.ok(views.some((v) => v.label === 'Fitzroy · Australia · Beginner'));
  const grid = classGrid(reports, 'legacy|original');
  assert.deepEqual(
    grid.rows.map((r) => r.student),
    ['amira k', 'Ben'],
  );
  assert.equal(grid.quests.length, missions.length);
  assert.equal(grid.quests[0].passed, 1);
  assert.equal(grid.quests[1].passed, 1, 'the newer report shows quest 2 passed');
  assert.equal(grid.rows[1].cells[0].status, 'not-started');
});

test('cells say what they mean in words, not colour alone', () => {
  assert.deepEqual(cellSummary(undefined), { kind: 'none', icon: '–', text: 'Not started' });
  assert.equal(cellSummary({ status: 'passed', attempts: 1, hints: 0 }).effort, '1 test · 0 hints');
  const stuck = cellSummary({ status: 'started', attempts: 4, hints: 0, stuck: 'Write loop()' });
  assert.deepEqual([stuck.kind, stuck.icon, stuck.text], ['help', '!', 'At: Write loop()']);
  assert.equal(cellSummary({ status: 'started', attempts: 1, hints: 1 }).kind, 'started');
});

test('the CSV has a row per student and quest and cannot run spreadsheet formulas', () => {
  const report = parseProgressReport(
    JSON.stringify(
      buildProgressReport(savedGame(), { student: '=HYPERLINK("x")', classCode: '7B' }),
    ),
  );
  const csv = progressCSV([report]),
    lines = csv.trim().split('\r\n');
  assert.match(lines[0], /^"Student","Class","Destination"/);
  assert.equal(lines.length, 1 + report.quests.length);
  assert.match(
    lines[1],
    /^"'=HYPERLINK\(""x""\)","7B","Willowbrook \(original home\)","original","1","Light the Path","passed"/,
  );
});

test('understanding results reach the report, the grid and the CSV', () => {
  const game = savedGame();
  game.completed[0].understanding = {
    answers: {
      predict: { first: false, tries: 2, solved: true },
      read: { first: true, tries: 1, solved: true },
      change: { first: false, tries: 3, solved: true },
    },
  };
  const report = parseProgressReport(
      JSON.stringify(buildProgressReport(game, { student: 'Ben', classCode: '7B' })),
    ),
    q = report.quests[0];
  assert.deepEqual([q.understood, q.understandAnswered, q.understandTotal], [1, 3, 3]);
  assert.ok(needsReview(q));
  assert.equal(report.quests[1].understandTotal, 0, 'not passed: no questions yet');
  const cell = cellSummary(q);
  assert.deepEqual([cell.kind, cell.icon, cell.text], ['review', '?', 'Passed · review']);
  assert.match(cell.effort, /1\/3 understood/);
  assert.equal(classGrid([report], 'legacy|original').quests[0].reviewing, 1);
  const csv = progressCSV([report]);
  assert.match(
    csv.split('\r\n')[0],
    /"Understanding right first time","Understanding questions answered","Understanding questions"/,
  );
  assert.match(csv.split('\r\n')[1], /"passed","2","1","5","5","","1","3","3"/);
  // Half or more right first time is fine.
  assert.equal(needsReview({ ...q, understood: 2 }), false);
  assert.equal(needsReview({ ...q, understandAnswered: 2 }), false, 'not finished yet');
});

test('regressions: names in any script, Pico pins, normalised dates and bounded quest numbers', () => {
  assert.equal(
    progressFileName({ student: 'محمد علي', createdAt: '2026-10-08T00:00:00Z' }),
    'iotquest-progress-محمد-علي-2026-10-08.json',
  );
  assert.equal(
    progressFileName({ student: '!!!', createdAt: '2026-10-08T00:00:00Z' }),
    'iotquest-progress-student-2026-10-08.json',
  );
  // On a Pico the student's pins are the Pico's, so the guide steps are judged on those.
  const pico = buildProgressReport(
    {
      name: 'x',
      board: 'Raspberry Pi Pico',
      language: 'cpp',
      projects: {
        0: { devices: [], code: { cpp: 'const int lightPin = 26;\nconst int ledPin = 15;\n' } },
      },
    },
    { student: 'x' },
  );
  assert.equal(pico.quests[0].stuck, 'Write setup()');
  const mk = (createdAt, quests = []) =>
    parseProgressReport(
      JSON.stringify({ format: 'iotquest-progress', version: 1, student: 'A', createdAt, quests }),
    );
  const older = mk('2026-10-08T00:00:00Z'),
    newer = mk('Oct 9 2026 10:00 UTC');
  assert.equal(newer.createdAt, '2026-10-09T10:00:00.000Z');
  assert.equal(latestReports([newer, older])[0], newer);
  assert.equal(mk('2026-10-08', [{ index: 999999 }]).quests[0].index, 99);
});
