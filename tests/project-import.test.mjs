import test from 'node:test';
import assert from 'node:assert/strict';
import { deflateRawSync } from 'node:zlib';
import {
  readProject,
  readZip,
  importDevices,
  ImportError,
  PROJECT_FORMAT,
} from '../public/project-import.js';
import { projectFiles, zipFiles } from '../public/project-package.js';
import { missions, defaults, program } from '../public/missions.js';
import { locations, adaptMissions } from '../public/locations.js';

const wired = (ids, board) =>
  defaults(ids, board).map((d) => ({
    ...d,
    power: true,
    ground: true,
    resistorConnected: !!d.resistor,
  }));

// Mirrors game.js exportManifest for a mission project.
function exportZip({
  locationId = 'legacy',
  missionIndex = 0,
  difficulty = 'beginner',
  board = 'ESP32',
  language = 'cpp',
  slot = 'mission',
  extra = {},
}) {
  const location = locations.find((l) => l.id === locationId),
    list = location ? adaptMissions(missions, location, difficulty) : missions,
    mission = slot === 'mission' ? list[missionIndex] : missions[0],
    devices = wired(mission.ids, board),
    code = {
      cpp: program(mission, 'cpp', devices, true),
      python: program(mission, 'python', devices),
    };
  const manifest = {
    format: PROJECT_FORMAT,
    version: 1,
    exportedAt: '2026-10-08T10:00:00.000Z',
    technician: 'Ari',
    locationId,
    slot,
    missionIndex: slot === 'mission' ? missionIndex : null,
    difficulty,
    missionTitle: mission.title,
    board,
    language,
    code,
    devices,
    results: [{ name: 'Night', pass: true, detail: 'Expected ON · observed ON' }],
    lab: { evidence: [{ type: 'test', at: '2026-10-08T09:00:00Z', passed: true }] },
    ...extra,
  };
  const files = projectFiles({
    name: 'Ari',
    language,
    board,
    code: code[language],
    devices,
    mission,
    results: manifest.results,
    lab: manifest.lab,
    location: location ? location.city + ', ' + location.country : 'Original home',
    manifest,
  });
  return { bytes: zipFiles(files), files, manifest, devices, code };
}

// A ZIP as an operating system would write it: deflated, inside a folder, with __MACOSX noise.
function deflatedZip(files, folder = 'iot-quest-project/') {
  const encoder = new TextEncoder(),
    parts = [],
    central = [];
  let offset = 0;
  const crc32 = (bytes) => {
    let crc = 0xffffffff;
    for (const b of bytes) {
      crc ^= b;
      for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
    return (crc ^ 0xffffffff) >>> 0;
  };
  const entries = [
    [folder, ''],
    ...Object.entries(files).map(([n, c]) => [folder + n, c]),
    ['__MACOSX/._x', 'junk'],
  ];
  for (const [filename, content] of entries) {
    const name = encoder.encode(filename),
      raw = encoder.encode(content),
      data = deflateRawSync(raw),
      local = Buffer.alloc(30),
      dir = Buffer.alloc(46);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(crc32(raw), 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(name.length, 26);
    dir.writeUInt32LE(0x02014b50, 0);
    dir.writeUInt16LE(8, 10);
    dir.writeUInt32LE(crc32(raw), 16);
    dir.writeUInt32LE(data.length, 20);
    dir.writeUInt32LE(raw.length, 24);
    dir.writeUInt16LE(name.length, 28);
    dir.writeUInt32LE(offset, 42);
    parts.push(local, name, data);
    central.push(dir, name);
    offset += 30 + name.length + data.length;
  }
  const size = central.reduce((s, b) => s + b.length, 0),
    end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(size, 12);
  end.writeUInt32LE(offset, 16);
  return new Uint8Array(Buffer.concat([...parts, ...central, end]));
}

test('exported projects round-trip for every mission, language, board and difficulty', async () => {
  const cases = [
    ['legacy', 'beginner'],
    ['kyoto', 'beginner'],
    ['kyoto', 'advanced'],
    ['cusco', 'advanced'],
  ];
  for (const [locationId, difficulty] of cases)
    for (const board of ['ESP32', 'Raspberry Pi Pico'])
      for (const language of ['cpp', 'python'])
        for (let missionIndex = 0; missionIndex < missions.length; missionIndex++) {
          const sent = exportZip({ locationId, missionIndex, difficulty, board, language }),
            plan = await readProject(sent.bytes, 'p.zip'),
            label = [locationId, difficulty, board, language, missionIndex].join(' ');
          assert.equal(plan.locationId, locationId, label);
          assert.equal(plan.missionIndex, missionIndex, label);
          assert.equal(plan.difficulty, difficulty, label);
          assert.equal(plan.board, board, label);
          assert.equal(plan.language, language, label);
          assert.deepEqual(plan.code, sent.code, label);
          assert.deepEqual(plan.devices, sent.devices, label);
          assert.deepEqual(plan.warnings, [], label);
        }
});

test('ZIPs re-compressed inside a folder by an operating system still import', async () => {
  const { files, code } = exportZip({ locationId: 'kyoto', missionIndex: 2 });
  const plan = await readProject(deflatedZip(files), 'zipped-again.zip');
  assert.equal(plan.missionIndex, 2);
  assert.deepEqual(plan.code, code);
});

test('older exports without project.json are matched by mission title and location name', async () => {
  const { files, devices } = exportZip({
    locationId: 'kyoto',
    missionIndex: 3,
    difficulty: 'advanced',
    language: 'python',
  });
  delete files['project.json'];
  const plan = await readProject(zipFiles(files), 'old.zip');
  assert.equal(plan.locationId, 'kyoto');
  assert.equal(plan.missionIndex, 3);
  assert.equal(plan.difficulty, 'beginner');
  assert.equal(plan.language, 'python');
  assert.deepEqual(plan.devices, devices);
  assert.match(plan.warnings[0], /Older export.*beginner difficulty/);
  const legacy = exportZip({ missionIndex: 1 }).files;
  delete legacy['project.json'];
  const results = JSON.parse(legacy['mission-results.json']);
  legacy['mission-results.json'] = JSON.stringify({ ...results, location: 'legacy' });
  assert.equal((await readProject(zipFiles(legacy))).locationId, 'legacy');
});

test('free-build and fault projects, unknown places and missions open safely', async () => {
  const free = await readProject(exportZip({ slot: 'free' }).bytes);
  assert.equal(free.slot, 'free');
  assert.deepEqual(free.warnings, []);
  const fault = await readProject(exportZip({ slot: 'fault' }).bytes);
  assert.equal(fault.slot, 'free');
  assert.match(fault.warnings.join(' '), /Free build/);
  const odd = await readProject(
    exportZip({ extra: { locationId: 'atlantis', missionIndex: 99, board: 'Z80' } }).bytes,
  );
  assert.equal(odd.locationId, 'legacy');
  assert.equal(odd.slot, 'free');
  assert.equal(odd.board, 'ESP32');
  assert.equal(odd.warnings.length, 3);
});

test('devices are rebuilt from the catalogue, so file content cannot inject names or markup', () => {
  const devices = importDevices(
    [
      { id: 'led', pin: 26, name: '<img src=x onerror=alert(1)>', icon: '<b>', power: true },
      { id: 'led', pin: 25 },
      { id: 'laser', pin: 4 },
      { id: 'ldr', pin: 99, ground: 'yes' },
      'nonsense',
    ],
    'ESP32',
  );
  assert.deepEqual(
    devices.map((d) => [d.id, d.name, d.pin, d.power, d.ground]),
    [
      ['led', 'Path lights', 26, true, false],
      ['ldr', 'Light sensor', defaults(['ldr'], 'ESP32')[0].pin, false, false],
    ],
  );
});

test('evidence is capped per type and exported results are reduced to plain fields', async () => {
  const evidence = Array.from({ length: 120 }, (_, i) => ({
    type: i % 2 ? 'test' : 'edit',
    at: new Date(Date.UTC(2026, 0, 1, 0, 0, i)).toISOString(),
  }));
  const plan = await readProject(
    exportZip({
      extra: {
        lab: { evidence },
        results: [{ name: 'A', pass: 'yes', detail: 5, extra: '<script>' }],
      },
    }).bytes,
  );
  assert.equal(plan.evidence.filter((e) => e.type === 'test').length, 50);
  assert.equal(plan.evidence.filter((e) => e.type === 'edit').length, 50);
  assert.deepEqual(plan.results, [{ name: 'A', pass: false, detail: '' }]);
});

test('damaged, foreign and oversized files are rejected with a clear reason', async () => {
  const reject = (bytes, pattern) =>
    assert.rejects(readProject(bytes), (e) => e instanceof ImportError && pattern.test(e.message));
  await reject(new TextEncoder().encode('hello'), /not a ZIP/);
  const good = exportZip({}).bytes;
  const corrupt = good.slice();
  corrupt[100] ^= 0xff;
  await reject(corrupt, /damaged|not valid JSON/);
  const locked = good.slice(),
    view = new DataView(locked.buffer),
    directory = view.getUint32(locked.length - 6, true);
  view.setUint16(directory + 8, 1, true);
  await reject(locked, /Password/);
  await reject(new Uint8Array(5 * 1024 * 1024), /larger than 4 MB/);
  await reject(zipFiles({ 'notes.txt': 'hi' }), /does not contain an IoT Quest project/);
  await reject(zipFiles({ 'project.json': '{"format":"other"}' }), /different program/);
  await reject(
    exportZip({ extra: { code: { cpp: 'x'.repeat(30001) } } }).bytes,
    /longer than 30,000/,
  );
  await reject(exportZip({ extra: { code: {} } }).bytes, /any program code/);
  await reject(zipFiles({ 'project.json': '{oops' }), /not valid JSON/);
  const many = Object.fromEntries(Array.from({ length: 70 }, (_, i) => ['f' + i, '']));
  await reject(zipFiles(many), /too many files/);
});

test('readZip ignores folders and keys files by base name', async () => {
  const files = await readZip(deflatedZip({ 'a.txt': 'A' }, 'deep/folder/'));
  assert.deepEqual([...files.keys()], ['a.txt']);
});
