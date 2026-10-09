import { createLabState } from './lab.js';
import { missions } from './missions.js';
const isRecord = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
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
    evidence: Array.isArray(lab.evidence) ? lab.evidence.filter(isRecord) : [],
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
      };
  return {
    ...p,
    projects,
    completed: isRecord(p.completed) ? p.completed : {},
    mission:
      Number.isInteger(p.mission) && p.mission >= 0 && p.mission < missions.length ? p.mission : 0,
    env: isRecord(p.env) ? p.env : undefined,
  };
}
export function sanitizeSaved(raw) {
  if (!isRecord(raw)) return {};
  const s = { ...raw, ...sanitizeProfile(raw) };
  const typed = { language: 'string', board: 'string', xp: 'number', appearance: 'string' };
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
  return s;
}
