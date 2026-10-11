import { createLabState } from './lab.js';
import { missions } from './missions.js';
const isRecord = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
export const BOARDS = ['ESP32', 'Raspberry Pi Pico', 'Raspberry Pi Pico W'];
export const EVIDENCE_LIMIT = 50;
const CODE_CHARS = 30000;
const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : undefined);
const num = (v) => (Number.isFinite(v) ? v : undefined);
// Test results as the game records them: a short list of { name, pass } (plus an optional detail).
export const sanitizeResults = (results, max = 40) =>
  Array.isArray(results)
    ? results
        .filter((r) => isRecord(r) && typeof r.name === 'string')
        .slice(0, max)
        .map((r) => ({
          name: r.name.slice(0, 120),
          pass: r.pass === true,
          ...(typeof r.detail === 'string' ? { detail: r.detail.slice(0, 300) } : {}),
        }))
    : [];
// A device recorded with a test run: only plain values, so it can be shown and exported safely.
const evidenceDevice = (d) =>
  Object.fromEntries(
    Object.entries(d)
      .slice(0, 30)
      .filter(([, v]) => ['string', 'number', 'boolean'].includes(typeof v))
      .map(([k, v]) => [k, typeof v === 'string' ? v.slice(0, 120) : v]),
  );
// One evidence record, rebuilt field by field. Imported files and old saves can hold anything,
// and the game reads these fields directly (recordEvidence trims results, the reports count them).
function sanitizeEvidenceEntry(e) {
  if (!isRecord(e) || typeof e.type !== 'string' || !e.type) return null;
  const out = {
    type: e.type.slice(0, 20),
    at: str(e.at, 40) ?? '',
    lastAt: str(e.lastAt, 40),
    count: Number.isInteger(e.count) && e.count > 0 ? e.count : undefined,
    owner: str(e.owner, 60),
    role: str(e.role, 40),
    passed: typeof e.passed === 'boolean' ? e.passed : undefined,
    board: BOARDS.includes(e.board) ? e.board : undefined,
    language: ['cpp', 'python'].includes(e.language) ? e.language : undefined,
    mission: str(e.mission, 120),
    file: str(e.file, 120),
    technician: str(e.technician, 60),
    exportedAt: str(e.exportedAt, 40),
    from: str(e.from, 120),
    found: num(e.found),
    total: num(e.total),
    wrongFlags: num(e.wrongFlags),
    code: str(e.code, CODE_CHARS),
    sourceA: str(e.sourceA, CODE_CHARS),
    sourceB: str(e.sourceB, CODE_CHARS),
  };
  if ('results' in e) out.results = sanitizeResults(e.results);
  if ('exportedResults' in e) out.exportedResults = sanitizeResults(e.exportedResults);
  if (Array.isArray(e.devices))
    out.devices = e.devices.filter(isRecord).slice(0, 40).map(evidenceDevice);
  if (Array.isArray(e.messages))
    out.messages = e.messages
      .filter(isRecord)
      .slice(-10)
      .map((m) => ({
        topic: str(m.topic, 120),
        payload: str(String(m.payload ?? ''), 200),
        status: str(m.status, 40),
      }));
  if (isRecord(e.outputs))
    out.outputs = Object.fromEntries(
      Object.entries(e.outputs)
        .slice(0, 40)
        .filter(([, v]) => Number.isFinite(v)),
    );
  for (const key of Object.keys(out)) if (out[key] === undefined) delete out[key];
  return out;
}
// Evidence list: valid records only, the latest EVIDENCE_LIMIT test runs and other records each.
export function sanitizeEvidence(list) {
  if (!Array.isArray(list)) return [];
  const clean = list.map(sanitizeEvidenceEntry).filter(Boolean),
    tests = clean.filter((e) => e.type === 'test').slice(-EVIDENCE_LIMIT),
    other = clean.filter((e) => e.type !== 'test').slice(-EVIDENCE_LIMIT);
  return clean.filter((e) => tests.includes(e) || other.includes(e));
}
// A saved bug hunt is kept only if its bugs and flags have the shapes the editor relies on.
function sanitizeHunt(hunt) {
  if (!isRecord(hunt) || !Array.isArray(hunt.bugs) || !hunt.bugs.length) return undefined;
  const bugs = hunt.bugs.filter(
    (b) =>
      isRecord(b) &&
      Number.isInteger(b.line) &&
      typeof b.explain === 'string' &&
      typeof b.fix === 'string',
  );
  if (bugs.length !== hunt.bugs.length) return undefined;
  return {
    ...hunt,
    bugs,
    flagged: Array.isArray(hunt.flagged) ? hunt.flagged.filter(Number.isInteger) : [],
    phase: hunt.phase === 'fix' ? 'fix' : 'spot',
    seed: Number.isInteger(hunt.seed) ? hunt.seed : 1,
    checkedCode: typeof hunt.checkedCode === 'string' ? hunt.checkedCode : undefined,
  };
}
function sanitizeLab(lab) {
  const base = createLabState();
  return {
    ...base,
    ...lab,
    elapsedMs: Number.isFinite(lab.elapsedMs) ? lab.elapsedMs : 0,
    evidence: sanitizeEvidence(lab.evidence),
    upgrades: Array.isArray(lab.upgrades) ? lab.upgrades : [],
    resources: isRecord(lab.resources)
      ? {
          ...base.resources,
          ...lab.resources,
          history: Array.isArray(lab.resources.history) ? lab.resources.history : [],
        }
      : base.resources,
  };
}
// Drop saved fields whose shape would break startup; defaults then fill the gaps.
function sanitizeProfile(p) {
  if (!isRecord(p)) return null;
  const projects = {};
  for (const [key, project] of Object.entries(isRecord(p.projects) ? p.projects : {}))
    if (isRecord(project))
      projects[key] = {
        ...project,
        devices: Array.isArray(project.devices) ? project.devices.filter(isRecord) : [],
        code: isRecord(project.code) ? project.code : {},
        codeByBoard: isRecord(project.codeByBoard) ? project.codeByBoard : undefined,
        lab: isRecord(project.lab) ? sanitizeLab(project.lab) : undefined,
        hunt: sanitizeHunt(project.hunt),
        // The controller the wiring and code are for (older saves did not record it).
        board: BOARDS.includes(project.board) ? project.board : undefined,
      };
  return {
    ...p,
    projects,
    completed: isRecord(p.completed) ? p.completed : {},
    mission:
      Number.isInteger(p.mission) && p.mission >= 0 && p.mission < missions.length ? p.mission : 0,
    env: isRecord(p.env) ? p.env : undefined,
    board: BOARDS.includes(p.board) ? p.board : undefined,
  };
}
export function sanitizeSaved(raw) {
  if (!isRecord(raw)) return {};
  const s = { ...raw, ...sanitizeProfile(raw) };
  const typed = { language: 'string', xp: 'number', appearance: 'string' };
  for (const [key, type] of Object.entries(typed)) if (typeof s[key] !== type) delete s[key];
  if (typeof s.name !== 'string' || !s.name.trim()) delete s.name;
  if (typeof s.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(s.color)) delete s.color;
  if (!isRecord(s.player) || !Number.isFinite(s.player.x) || !Number.isFinite(s.player.y))
    delete s.player;
  if (!['cpp', 'python'].includes(s.language)) delete s.language;
  if (!isRecord(s.env)) delete s.env;
  s.locationProgress = Object.fromEntries(
    Object.entries(isRecord(s.locationProgress) ? s.locationProgress : {})
      .map(([id, p]) => [id, sanitizeProfile(p)])
      .filter(([, p]) => p),
  );
  if (!isRecord(s.weatherByLocation)) delete s.weatherByLocation;
  if (!isRecord(s.legacyEnv)) delete s.legacyEnv;
  // "Original home" restores these: an unknown quest or controller would break it.
  if (
    !Number.isInteger(s.legacyMission) ||
    s.legacyMission < 0 ||
    s.legacyMission >= missions.length
  )
    delete s.legacyMission;
  if (!BOARDS.includes(s.legacyBoard)) delete s.legacyBoard;
  if (!BOARDS.includes(s.board)) delete s.board;
  return s;
}
