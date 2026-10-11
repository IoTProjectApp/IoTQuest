import { missions, defaults } from './missions.js';
import { locationById, adaptMissions } from './locations.js';
import { coachSteps } from './code-coach.js';
import { understandingQuestions, understandingScore } from './understanding.js';
import { loadCustomQuests } from './custom-quests.js';
// Progress reports: a student downloads one small file and hands it in; a teacher loads the
// class's files into the class progress view (teacher.html). Nothing is sent anywhere.

export const PROGRESS_FORMAT = 'iotquest-progress',
  PROGRESS_VERSION = 1,
  PROGRESS_LIMITS = { bytes: 2_000_000, quests: 2000, code: 20000, text: 120 };

export class ProgressError extends Error {}

const isRecord = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const LEGACY_NAME = 'Willowbrook (original home)',
  TEACHER_NAME = 'Teacher quests';
// Code the student wrote, ignoring comments and blank lines.
const ownCode = (source = '', language) =>
  String(source)
    .split('\n')
    .map((line) => line.replace(language === 'python' ? /#.*$/ : /\/\/.*$/, '').trim())
    .filter(Boolean).length > 0;

// `custom` describes a teacher quest: { mission, key }.
function questRecord(profile, location, index, difficulty, state, custom = null) {
  const legacy = !location,
    key = custom ? custom.key : (difficulty === 'advanced' ? 'advanced:' : '') + index,
    list = legacy ? missions : adaptMissions(missions, location, difficulty),
    m = custom ? custom.mission : list[index],
    project = profile.projects?.[key],
    done = profile.completed?.[key],
    languages = Object.keys(project?.code || {}).filter((l) => ownCode(project.code[l], l)),
    language =
      done?.language ||
      (languages.includes(state.language) ? state.language : languages[0]) ||
      state.language,
    hints = Object.values(project?.coach || {}).reduce(
      (sum, byStep) =>
        sum +
        Object.values(isRecord(byStep?.hints) ? byStep.hints : {}).reduce(
          (n, v) => n + (Number.isFinite(v) ? v : 0),
          0,
        ),
      0,
    ),
    attempts = Number.isFinite(project?.lab?.testAttempts) ? project.lab.testAttempts : 0,
    chats = Number.isFinite(profile.chats?.[key]) ? profile.chats[key] : 0,
    status = done ? 'passed' : languages.length || attempts ? 'started' : 'not-started';
  let stepsDone = 0,
    stepsTotal = 0,
    stuck = null,
    understanding = { right: 0, answered: 0, total: 0 };
  if (m.ids.length) {
    const devices = done?.devices?.length
        ? done.devices
        : project?.devices?.length
          ? project.devices
          : defaults(m.ids, profile.board || state.board || 'ESP32'),
      steps = coachSteps(m, language, devices, profile.board || state.board).filter((s) => s.check),
      source = done?.code ?? project?.code?.[language] ?? '';
    stepsTotal = steps.length;
    if (done)
      understanding = understandingScore(
        done.understanding,
        understandingQuestions(m, language, devices, profile.board || state.board).length,
      );
    if (status === 'passed') stepsDone = stepsTotal;
    else if (status === 'started')
      for (const step of steps) {
        if (step.check(source).done) stepsDone++;
        else stuck ??= step.title;
      }
  }
  const code = String(done?.code ?? project?.code?.[language] ?? '').slice(0, PROGRESS_LIMITS.code);
  return {
    location: custom ? 'teacher' : legacy ? 'legacy' : location.id,
    locationName: custom
      ? TEACHER_NAME
      : legacy
        ? LEGACY_NAME
        : location.city + ' · ' + location.country,
    difficulty: legacy ? 'original' : difficulty,
    index,
    // Teacher quests sit at different positions in each student's list; their id matches them.
    ...(custom && { questId: String(m.id) }),
    title: m.title,
    status,
    attempts,
    hints,
    chats,
    stepsDone,
    stepsTotal,
    stuck: status === 'started' ? stuck : null,
    understood: understanding.right,
    understandAnswered: understanding.answered,
    understandTotal: understanding.total,
    passedAt: done?.date || null,
    lastActive: project?.lab?.evidence?.at(-1)?.at || done?.date || null,
    language,
    code: status === 'not-started' || !ownCode(code, language) ? '' : code,
  };
}

// Builds a report from the saved game state. Visited destinations and difficulty levels the
// student has worked on are included; the original home is always included.
export function buildProgressReport(state, { student, classCode = '', now = new Date() } = {}) {
  const quests = [];
  for (let i = 0; i < missions.length; i++)
    quests.push(questRecord(state, null, i, 'original', state));
  for (const [id, profile] of Object.entries(state.locationProgress || {})) {
    const location = locationById(id);
    if (!location || !isRecord(profile)) continue;
    const keys = [...Object.keys(profile.projects || {}), ...Object.keys(profile.completed || {})];
    for (const difficulty of ['beginner', 'advanced']) {
      if (difficulty === 'advanced' && !keys.some((k) => k.startsWith('advanced:'))) continue;
      for (let i = 0; i < missions.length; i++)
        quests.push(questRecord(profile, location, i, difficulty, state));
    }
  }
  // Teacher quests can be played at any destination: report the profile that holds the work.
  const profiles = [state, ...Object.values(state.locationProgress || {}).filter(isRecord)];
  loadCustomQuests(state.customQuests).forEach((mission, i) => {
    const key = 'fault:' + mission.id,
      profile =
        profiles.find((p) => p.completed?.[key]) ||
        profiles.find((p) => p.projects?.[key]) ||
        state;
    quests.push(questRecord(profile, null, i, 'original', state, { mission, key }));
  });
  return {
    format: PROGRESS_FORMAT,
    version: PROGRESS_VERSION,
    student: String(student || state.name || '').slice(0, PROGRESS_LIMITS.text),
    classCode: String(classCode).slice(0, PROGRESS_LIMITS.text),
    createdAt: now.toISOString(),
    xp: Number.isFinite(state.xp) ? state.xp : 0,
    quests,
  };
}

// Keeps letters and digits in any script (for example Arabic or Chinese names).
export const progressFileName = (report) =>
  'iotquest-progress-' +
  ((report.student || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'student') +
  '-' +
  report.createdAt.slice(0, 10) +
  '.json';

const text = (v, max = PROGRESS_LIMITS.text) => (typeof v === 'string' ? v.slice(0, max) : '');
const count = (v) => (Number.isFinite(v) && v >= 0 ? Math.min(Math.floor(v), 1e6) : 0);
// Dates are stored as ISO strings, so they sort correctly.
const date = (v) =>
  typeof v === 'string' && v.length <= 40 && !Number.isNaN(Date.parse(v))
    ? new Date(v).toISOString()
    : null;

// Reads a handed-in file, rejecting anything that is not a progress report and normalising every
// field, so a damaged or edited file cannot break the class view.
export function parseProgressReport(source) {
  if (typeof source !== 'string') throw new ProgressError('This file could not be read.');
  if (source.length > PROGRESS_LIMITS.bytes)
    throw new ProgressError('This file is too large to be a progress report.');
  let raw;
  try {
    raw = JSON.parse(source);
  } catch {
    throw new ProgressError('This is not an IoT Quest progress report (it is not JSON).');
  }
  if (!isRecord(raw) || raw.format !== PROGRESS_FORMAT)
    throw new ProgressError(
      'This is not an IoT Quest progress report. Students download it from Package → Hand in your progress.',
    );
  if (raw.version !== PROGRESS_VERSION)
    throw new ProgressError('This progress report was made by a different version of IoT Quest.');
  const student = text(raw.student).trim();
  if (!student) throw new ProgressError('This progress report has no student name.');
  if (!Array.isArray(raw.quests) || raw.quests.length > PROGRESS_LIMITS.quests)
    throw new ProgressError('This progress report has no readable quests.');
  const quests = raw.quests.filter(isRecord).map((q) => ({
    location: text(q.location) || 'legacy',
    locationName: text(q.locationName) || text(q.location) || LEGACY_NAME,
    difficulty: ['original', 'beginner', 'advanced'].includes(q.difficulty)
      ? q.difficulty
      : 'original',
    index: Math.min(count(q.index), 99),
    ...(text(q.questId) && { questId: text(q.questId) }),
    title: text(q.title) || 'Quest ' + (Math.min(count(q.index), 99) + 1),
    status: ['passed', 'started', 'not-started'].includes(q.status) ? q.status : 'not-started',
    attempts: count(q.attempts),
    hints: count(q.hints),
    chats: count(q.chats),
    stepsDone: count(q.stepsDone),
    stepsTotal: count(q.stepsTotal),
    stuck: text(q.stuck) || null,
    understood: count(q.understood),
    understandAnswered: count(q.understandAnswered),
    understandTotal: count(q.understandTotal),
    passedAt: date(q.passedAt),
    lastActive: date(q.lastActive),
    language: q.language === 'python' ? 'python' : 'cpp',
    code: text(q.code, PROGRESS_LIMITS.code),
  }));
  return {
    student,
    classCode: text(raw.classCode).trim(),
    createdAt: date(raw.createdAt) || new Date(0).toISOString(),
    xp: count(raw.xp),
    quests,
  };
}

// Keeps the newest report per student (a student may hand in more than once).
export function latestReports(reports) {
  const byStudent = new Map();
  for (const r of reports) {
    const key = r.student.toLowerCase() + '\u0000' + r.classCode.toLowerCase(),
      old = byStudent.get(key);
    if (!old || r.createdAt > old.createdAt) byStudent.set(key, r);
  }
  return [...byStudent.values()].sort((a, b) => a.student.localeCompare(b.student));
}

// Destinations and difficulty levels that appear in any report, original home first.
export function reportViews(reports) {
  const views = new Map();
  for (const r of reports)
    for (const q of r.quests) {
      const id = q.location + '|' + q.difficulty;
      if (!views.has(id))
        views.set(id, {
          id,
          location: q.location,
          difficulty: q.difficulty,
          label:
            q.locationName +
            (q.difficulty === 'original'
              ? ''
              : ' · ' + q.difficulty[0].toUpperCase() + q.difficulty.slice(1)),
        });
    }
  return [...views.values()].sort(
    (a, b) =>
      (b.location === 'legacy') - (a.location === 'legacy') || a.label.localeCompare(b.label),
  );
}

// A student needs help on a quest they have started but not passed after several tries or hints.
export const needsHelp = (q) => q.status === 'started' && (q.attempts >= 3 || q.hints >= 3);
// A passed quest needs review when the understanding questions are all answered and fewer than
// half were right first time.
export const needsReview = (q) =>
  q.status === 'passed' &&
  q.understandTotal > 0 &&
  q.understandAnswered >= q.understandTotal &&
  q.understood * 2 < q.understandTotal;

// Numbers the quests the same way for the grid and the CSV. Built-in quests keep their quest
// number; teacher quests (which each student may have imported in a different order) are numbered
// by quest id, in the order they first appear going through the students alphabetically, so the
// same quest has the same number for every student. Returns the 0-based number of a quest.
function questNumbers() {
  const teacher = new Map();
  return (q) => {
    if (q.location !== 'teacher') return q.index;
    if (!teacher.has(q.difficulty)) teacher.set(q.difficulty, new Map());
    const ids = teacher.get(q.difficulty),
      id = q.questId || q.title;
    if (!ids.has(id)) ids.set(id, ids.size);
    return ids.get(id);
  };
}

// The class grid for one destination and level: quest columns and one row per student.
export function classGrid(reports, viewId) {
  const columns = [],
    column = questNumbers(),
    rows = latestReports(reports).map((r) => {
      const cells = [];
      for (const q of r.quests)
        if (q.location + '|' + q.difficulty === viewId) {
          const at = column(q);
          cells[at] = q;
          columns[at] ??= q.title;
        }
      return { student: r.student, classCode: r.classCode, createdAt: r.createdAt, cells };
    });
  const quests = columns.map((title, index) => {
    const cells = rows.map((r) => r.cells[index]).filter(Boolean);
    return {
      index,
      title,
      passed: cells.filter((q) => q.status === 'passed').length,
      started: cells.filter((q) => q.status === 'started').length,
      helping: cells.filter(needsHelp).length,
      reviewing: cells.filter(needsReview).length,
    };
  });
  return { quests: quests.filter(Boolean), rows };
}

// Quote CSV cells and neutralise spreadsheet formula prefixes.
const csvCell = (s) =>
  '"' +
  String(s ?? '')
    .replace(/^[=+\-@\t\r]/, "'$&")
    .replace(/"/g, '""') +
  '"';
export function progressCSV(reports) {
  const header = [
    'Student',
    'Class',
    'Destination',
    'Level',
    'Quest number',
    'Quest',
    'Status',
    'Test attempts',
    'Hints used',
    'Resident chats',
    'Guide steps done',
    'Guide steps total',
    'Stuck at',
    'Understanding right first time',
    'Understanding questions answered',
    'Understanding questions',
    'Passed at',
    'Language',
    'Report date',
  ];
  const lines = [header.map(csvCell).join(',')],
    number = questNumbers();
  for (const r of latestReports(reports))
    for (const q of r.quests)
      lines.push(
        [
          r.student,
          r.classCode,
          q.locationName,
          q.difficulty,
          number(q) + 1,
          q.title,
          q.status,
          q.attempts,
          q.hints,
          q.chats,
          q.stepsDone,
          q.stepsTotal,
          q.stuck || '',
          q.understood,
          q.understandAnswered,
          q.understandTotal,
          q.passedAt || '',
          q.language === 'python' ? 'MicroPython' : 'Arduino C++',
          r.createdAt,
        ]
          .map(csvCell)
          .join(','),
      );
  // The byte order mark tells Excel the file is UTF-8, so names in any script open correctly.
  return '\ufeff' + lines.join('\r\n') + '\r\n';
}
