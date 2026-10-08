import { components, defaults, missions } from './missions.js';
import { locations, locationById, adaptMissions } from './locations.js';
// Reads IoT Quest project ZIPs (our own exports, or the same files re-zipped by an operating
// system). Every field is validated and rebuilt from trusted catalogues; nothing from the file
// is used as markup, and rewards are never imported.
export const IMPORT_LIMITS = {
  zipBytes: 4 * 1024 * 1024,
  entries: 64,
  entryBytes: 2 * 1024 * 1024,
  codeChars: 30000,
  evidence: 50,
};
export const PROJECT_FORMAT = 'iot-quest-project';
const BOARDS = ['ESP32', 'Raspberry Pi Pico', 'Raspberry Pi Pico W'];

export class ImportError extends Error {}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const b of bytes) {
    crc ^= b;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

async function inflateRaw(data, expected) {
  if (typeof DecompressionStream !== 'function')
    throw new ImportError('This browser cannot open compressed ZIP files. Try another browser.');
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw')),
    reader = stream.getReader(),
    chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > expected || size > IMPORT_LIMITS.entryBytes) {
      await reader.cancel();
      throw new ImportError('A file inside the ZIP is larger than it claims to be.');
    }
    chunks.push(value);
  }
  const out = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}

// Returns a Map of entry name -> bytes. Supports stored and deflated entries without ZIP64.
export async function readZip(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes.length > IMPORT_LIMITS.zipBytes)
    throw new ImportError('The file is larger than 4 MB, so it is not an IoT Quest project.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 65535); i--)
    if (view.getUint32(i, true) === 0x06054b50) {
      end = i;
      break;
    }
  if (end < 0) throw new ImportError('This is not a ZIP file.');
  const count = view.getUint16(end + 10, true),
    directory = view.getUint32(end + 16, true);
  if (count > IMPORT_LIMITS.entries) throw new ImportError('The ZIP contains too many files.');
  const files = new Map(),
    decoder = new TextDecoder();
  let at = directory;
  for (let n = 0; n < count; n++) {
    if (at + 46 > bytes.length || view.getUint32(at, true) !== 0x02014b50)
      throw new ImportError('The ZIP file is damaged.');
    const flags = view.getUint16(at + 8, true),
      method = view.getUint16(at + 10, true),
      crc = view.getUint32(at + 16, true),
      packed = view.getUint32(at + 20, true),
      size = view.getUint32(at + 24, true),
      nameLength = view.getUint16(at + 28, true),
      extraLength = view.getUint16(at + 30, true),
      commentLength = view.getUint16(at + 32, true),
      local = view.getUint32(at + 42, true),
      name = decoder.decode(bytes.subarray(at + 46, at + 46 + nameLength));
    at += 46 + nameLength + extraLength + commentLength;
    if (flags & 1) throw new ImportError('Password-protected ZIP files are not supported.');
    if (packed === 0xffffffff || size === 0xffffffff || size > IMPORT_LIMITS.entryBytes)
      throw new ImportError('A file inside the ZIP is too large.');
    if (name.endsWith('/') || name.includes('__MACOSX/')) continue;
    if (local + 30 > bytes.length || view.getUint32(local, true) !== 0x04034b50)
      throw new ImportError('The ZIP file is damaged.');
    const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true),
      data = bytes.subarray(start, start + packed);
    if (data.length !== packed) throw new ImportError('The ZIP file is incomplete.');
    let content;
    if (method === 0) content = data;
    else if (method === 8) content = await inflateRaw(data, size);
    else throw new ImportError('The ZIP uses an unsupported compression method.');
    if (content.length !== size || crc32(content) !== crc)
      throw new ImportError('The ZIP file is damaged (checksum mismatch).');
    // Projects re-zipped from a folder have a leading directory; key by the base name.
    files.set(name.split('/').at(-1), content);
  }
  return files;
}

const text = (v, max = 200) => (typeof v === 'string' ? v.slice(0, max) : '');
const isRecord = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
function json(files, name) {
  if (!files.has(name)) return null;
  try {
    return JSON.parse(new TextDecoder().decode(files.get(name)));
  } catch {
    throw new ImportError(name + ' in the ZIP is not valid JSON.');
  }
}

// Rebuild devices from the component catalogue; only pins and wiring state come from the file.
export function importDevices(raw, board) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set(),
    out = [];
  for (const item of raw.slice(0, 24)) {
    const base = isRecord(item) && components.find((c) => c.id === item.id);
    if (!base || seen.has(base.id)) continue;
    seen.add(base.id);
    const planned = defaults([base.id], board)[0],
      pin = Number(item.pin);
    out.push({
      ...planned,
      pin: Number.isInteger(pin) && pin >= 0 && pin <= 39 ? pin : planned.pin,
      area: text(item.area, 40) || planned.area || base.area,
      power: item.power === true,
      ground: item.ground === true,
      resistorConnected: item.resistorConnected === true,
    });
  }
  return out;
}

function parseCSVRow(line) {
  const cells = [];
  for (const m of line.matchAll(/"((?:[^"]|"")*)"|([^,]+)|(?<=,)(?=,|$)/g))
    cells.push((m[1] ?? m[2] ?? '').replace(/""/g, '"').replace(/^'(?=[=+\-@])/, ''));
  return cells;
}

function resolveLocation(value) {
  if (!value || value === 'legacy' || value === 'Original home') return 'legacy';
  if (locationById(value)) return value;
  return locations.find((l) => l.city + ', ' + l.country === value)?.id ?? null;
}

function findMission(title, locationId) {
  const location = locationId === 'legacy' ? null : locationById(locationId);
  // Beginner and advanced versions share titles, so older exports open at beginner.
  const list = location ? adaptMissions(missions, location, 'beginner') : missions,
    index = list.findIndex((m) => m.title === title);
  return index >= 0 ? { index, difficulty: 'beginner' } : null;
}

const cleanResults = (results) =>
  Array.isArray(results)
    ? results
        .filter(isRecord)
        .slice(0, 20)
        .map((r) => ({
          name: text(r.name, 80),
          pass: r.pass === true,
          detail: text(r.detail, 300),
        }))
    : [];

// Turn the files of an exported project into a validated import plan.
export function parseProject(files, fileName = 'project.zip') {
  const manifest = json(files, 'project.json'),
    warnings = [];
  let plan;
  if (manifest) {
    if (manifest.format !== PROJECT_FORMAT || manifest.version !== 1)
      throw new ImportError('This ZIP was made by a different program or a newer IoT Quest.');
    plan = {
      technician: text(manifest.technician, 40),
      exportedAt: text(manifest.exportedAt, 40),
      locationId: resolveLocation(manifest.locationId),
      missionIndex: manifest.missionIndex,
      difficulty: manifest.difficulty,
      slot: manifest.slot,
      missionTitle: text(manifest.missionTitle, 80),
      board: manifest.board,
      language: manifest.language,
      code: isRecord(manifest.code) ? manifest.code : {},
      devices: manifest.devices,
      results: manifest.results,
      lab: isRecord(manifest.lab) ? manifest.lab : {},
    };
  } else {
    // Exports from before project.json: recover what the human-readable files record.
    const source = [...files.keys()].find((n) => /^student-code\.(ino|py)$/.test(n));
    const results = json(files, 'mission-results.json');
    if (!source || !results)
      throw new ImportError(
        'This ZIP does not contain an IoT Quest project (student code and mission results are missing).',
      );
    const language = source.endsWith('.py') ? 'python' : 'cpp',
      csv = files.has('pin-assignments.csv')
        ? new TextDecoder().decode(files.get('pin-assignments.csv')).split('\n')[1]
        : '',
      locationId = resolveLocation(results.location),
      found = findMission(results.mission?.title, locationId ?? 'legacy');
    plan = {
      technician: text(results.technician, 40),
      exportedAt: '',
      locationId,
      missionIndex: found?.index ?? null,
      difficulty: found?.difficulty ?? 'beginner',
      slot: found ? 'mission' : 'free',
      missionTitle: text(results.mission?.title, 80),
      board: csv ? parseCSVRow(csv)[1] : 'ESP32',
      language,
      code: { [language]: new TextDecoder().decode(files.get(source)) },
      devices: json(files, 'components.json'),
      results: results.results,
      lab: { evidence: json(files, 'evidence.json')?.evidence },
    };
    warnings.push(
      'Older export: the mission was matched by its title and opens at beginner difficulty.',
    );
  }
  if (plan.locationId === null) {
    warnings.push('The destination was not recognised, so the project opens at the original home.');
    plan.locationId = 'legacy';
  }
  if (!BOARDS.includes(plan.board)) {
    warnings.push('Unknown controller; using ESP32.');
    plan.board = 'ESP32';
  }
  if (!['cpp', 'python'].includes(plan.language)) plan.language = 'cpp';
  plan.difficulty =
    plan.difficulty === 'advanced' && plan.locationId !== 'legacy' ? 'advanced' : 'beginner';
  const location = plan.locationId === 'legacy' ? null : locationById(plan.locationId),
    list = location ? adaptMissions(missions, location, plan.difficulty) : missions;
  if (
    plan.slot !== 'mission' ||
    !Number.isInteger(plan.missionIndex) ||
    plan.missionIndex < 0 ||
    plan.missionIndex >= list.length
  ) {
    if (plan.slot === 'mission' || plan.slot === 'fault')
      warnings.push('The mission was not found, so the project opens in Free build.');
    plan.slot = 'free';
    plan.missionIndex = null;
  } else plan.missionTitle = list[plan.missionIndex].title;
  const code = {};
  for (const language of ['cpp', 'python'])
    if (typeof plan.code[language] === 'string') {
      if (plan.code[language].length > IMPORT_LIMITS.codeChars)
        throw new ImportError('The program is longer than 30,000 characters.');
      code[language] = plan.code[language];
    }
  if (!Object.keys(code).length)
    throw new ImportError('The ZIP does not contain any program code.');
  plan.code = code;
  if (!code[plan.language]) plan.language = Object.keys(code)[0];
  plan.devices = importDevices(plan.devices, plan.board);
  plan.results = cleanResults(plan.results);
  const evidence = Array.isArray(plan.lab.evidence) ? plan.lab.evidence.filter(isRecord) : [];
  plan.evidence = [
    ...evidence.filter((e) => e.type === 'test').slice(-IMPORT_LIMITS.evidence),
    ...evidence.filter((e) => e.type !== 'test').slice(-IMPORT_LIMITS.evidence),
  ].sort((a, b) => String(a.at).localeCompare(String(b.at)));
  delete plan.lab;
  plan.fileName = text(fileName, 120);
  plan.warnings = warnings;
  return plan;
}

export async function readProject(bytes, fileName) {
  return parseProject(await readZip(bytes), fileName);
}
