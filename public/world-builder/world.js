// A World Builder world (editor/workspaces/world-builder, saved in data/worlds.js): its devices and
// program, the IoT simulation that plays it, and the 3D scene it draws. Shared by the World
// Builder's Play Mode and the game, which plays saved worlds (world.html). Free of the DOM.
import { program, validate } from '../missions.js';
import { Runtime } from '../runtime.js';
import { baseEnv, ADC_SIGNALS } from '../signals.js';
import { prepareWorldMaterials } from '../world-materials.js';
import { addSky } from '../sky.js';
import { createTerrain, terrainHeightAt, buildTerrainMeshes } from './terrain.js';
import {
  getComponentSpec,
  buildAssetInstance,
  buildRoadMeshes,
  sampleRoadPoints,
} from './assets.js';

export const DEFAULT_LAYERS = [
  { id: 'terrain', name: 'Terrain & Water', visible: true, locked: false },
  { id: 'buildings', name: 'Buildings & Structure', visible: true, locked: false },
  { id: 'furniture', name: 'Furniture & Decor', visible: true, locked: false },
  { id: 'infrastructure', name: 'Roads & Infrastructure', visible: true, locked: false },
  { id: 'nature', name: 'Nature & Vegetation', visible: true, locked: false },
  { id: 'iot', name: 'IoT Components', visible: true, locked: false },
];
export const BOARDS = ['ESP32', 'Raspberry Pi Pico'];
export const LANGUAGES = ['cpp', 'python'];

const clone = (v) => JSON.parse(JSON.stringify(v));
const round = (v, p = 3) => Math.round((Number(v) || 0) * 10 ** p) / 10 ** p;

export function defaultEnvironment() {
  return {
    timeOfDay: 11.5, // 0..24 hours
    sunlight: 85, // 0..100
    rain: 0, // 0..100
    fog: 10, // 0..100
    wind: 12, // km/h
    temperature: 24, // °C
    humidity: 50, // %
    soilMoisture: 35, // 0..100 (ADC scaled in program)
    waterLevel: 80, // 0..100
    motion: 0, // 0 or 1
    distance: 120, // cm
    dust: 10, // 0..100 (smoke/gas/dust)
    pressed: 0, // button/keypad
    docked: 0, // rfid/dock
  };
}

export function layerForKind(kind = '') {
  if (kind.startsWith('building/') || kind.startsWith('modular/')) return 'buildings';
  if (kind.startsWith('furniture/')) return 'furniture';
  if (kind.startsWith('infra/')) return 'infrastructure';
  if (kind.startsWith('nature/')) return 'nature';
  if (kind.startsWith('iot/')) return 'iot';
  return 'furniture';
}

// Fills in what a world needs, in place. A world can come from a file (Import Project) or a saved
// store: its numbers and names are made what the panels and the game expect, so a hand-edited
// world can neither break them nor put markup in them.
export function normaliseWorld(w) {
  if (!w) return w;
  w.version ??= 1;
  w.units ||= 'm';
  w.terrain ||= createTerrain('flat', 42);
  w.terrain.waters ||= [];
  w.objects ||= [];
  w.roads ||= [];
  w.groups ||= [];
  w.importedAssets ||= [];
  w.layers ||= clone(DEFAULT_LAYERS);
  const num = (v, fallback = 0) => (Number.isFinite(Number(v)) ? Number(v) : fallback);
  const environment = defaultEnvironment();
  for (const [k, v] of Object.entries(w.environment || {}))
    if (k in environment) environment[k] = num(v, environment[k]);
  w.environment = environment;
  if (!['m', 'cm', 'ft'].includes(w.units)) w.units = 'm';
  w.name = String(w.name ?? 'Imported World');
  w.terrain.waterLevel = num(w.terrain.waterLevel, -2);
  w.spawn = Array.isArray(w.spawn)
    ? [0, 1, 2].map((i) => num(w.spawn[i]))
    : [0, terrainHeightAt(w.terrain, 0, 12), 12];
  for (const o of w.objects) {
    o.id = String(o.id);
    o.name = String(o.name ?? o.kind);
    o.kind = String(o.kind ?? '');
    o.pos = [0, 1, 2].map((i) => num(o.pos?.[i]));
    o.turn = num(o.turn);
    o.scale = Array.isArray(o.scale) ? [0, 1, 2].map((i) => num(o.scale[i], 1)) : num(o.scale, 1);
    o.props ||= {};
    if (o.props.color !== undefined && !/^#[0-9a-f]{6}$/i.test(o.props.color)) delete o.props.color;
  }
  for (const r of w.roads) r.width = num(r.width, 8);
  w.iot ||= { board: 'ESP32', language: 'cpp', code: { cpp: '', python: '' } };
  if (!BOARDS.includes(w.iot.board)) w.iot.board = 'ESP32';
  if (!LANGUAGES.includes(w.iot.language)) w.iot.language = 'cpp';
  w.iot.code ||= { cpp: '', python: '' };
  assignPins(w);
  if (!w.iot.code.cpp && !w.iot.code.python) {
    w.iot.code.cpp = starterCode(w, 'cpp');
    w.iot.code.python = starterCode(w, 'python');
  }
  return w;
}

// ---- Devices and program ----------------------------------------------------------------------
// The world's sensors and outputs, as the game's runtime and wiring checks take devices.
export function worldDevices(w) {
  const list = [];
  for (const obj of w.objects || []) {
    if (!obj.kind.startsWith('iot/') || obj.kind.startsWith('iot/board-')) continue;
    const compId = obj.props?.componentId || obj.kind.slice(4);
    const spec = getComponentSpec(compId);
    if (!spec) continue;
    list.push({
      objectId: obj.id,
      id: spec.id,
      name: obj.name || spec.name,
      signal: spec.signal,
      output: !!spec.output,
      analog: !!spec.analog,
      resistor: spec.resistor,
      pin: obj.props?.pin,
      power: obj.props?.power !== false,
      ground: obj.props?.ground !== false,
      resistorConnected: obj.props?.resistorConnected !== false,
      area: 'World Builder',
    });
  }
  return list;
}

// Gives every device a free pin of the right kind for the world's board, in place; pins already
// set and valid are kept.
export function assignPins(w) {
  const board = w.iot?.board || 'ESP32';
  const analogPins = board === 'ESP32' ? [34, 35, 32, 33, 36, 39] : [26, 27, 28];
  const digitalPins = board === 'ESP32' ? [27, 14, 13, 4, 16, 17] : [16, 17, 18, 19, 20, 21];
  const outputPins =
    board === 'ESP32'
      ? [26, 25, 18, 19, 21, 22, 23, 5, 2, 15]
      : [15, 14, 13, 12, 11, 10, 9, 8, 7, 6];
  const allowed = new Set([...analogPins, ...digitalPins, ...outputPins]);
  const used = new Set();
  let a = 0,
    d = 0,
    o = 0;

  for (const obj of w.objects || []) {
    if (!obj.kind.startsWith('iot/') || obj.kind.startsWith('iot/board-')) continue;
    const compId = obj.props?.componentId || obj.kind.slice(4);
    const spec = getComponentSpec(compId);
    if (!spec) continue;
    obj.props ||= {};
    const currentPin = Number(obj.props.pin);
    if (
      Number.isInteger(currentPin) &&
      allowed.has(currentPin) &&
      !used.has(currentPin) &&
      (!spec.analog || analogPins.includes(currentPin))
    ) {
      used.add(currentPin);
      continue;
    }
    const pool = spec.output ? outputPins : spec.analog ? analogPins : digitalPins;
    let picked = pool.find((p) => !used.has(p));
    if (picked === undefined)
      picked = pool[(spec.output ? o++ : spec.analog ? a++ : d++) % pool.length];
    obj.props.pin = picked;
    used.add(picked);
  }
}

// When each output should be on, guessed from the sensors beside it (a lamp in the dark, a pump in
// dry soil...): the rules a world's starter program follows.
export function starterConditions(w) {
  const devices = worldDevices(w),
    sensors = devices.filter((d) => !d.output && d.signal);
  return devices
    .filter((d) => d.output)
    .map((out) => {
      if (sensors.some((s) => s.signal === 'light') && ['led', 'porch', 'rgb'].includes(out.id))
        return 'light < 1800';
      if (sensors.some((s) => s.signal === 'soil') && ['pump', 'valve'].includes(out.id))
        return 'soil < 2400';
      if (sensors.some((s) => s.signal === 'motion') && ['led', 'porch', 'buzzer'].includes(out.id))
        return 'motion == 1';
      if (sensors.some((s) => s.signal === 'temp') && ['fan', 'ac'].includes(out.id))
        return 'temp > 27';
      if (sensors.some((s) => s.signal === 'distance') && ['servo', 'gate'].includes(out.id))
        return 'distance < 50';
      const s0 = sensors[0];
      if (!s0) return 'true';
      return ADC_SIGNALS.includes(s0.signal) ? `${s0.signal} < 2000` : `${s0.signal} == 1`;
    });
}

// A program for the world's devices, in 'cpp' or 'python': worked (the rules filled in), or a
// starter with the pins, readings and outputs written and every decision left false, for a student
// to complete.
export function starterCode(w, language = w.iot?.language || 'cpp', { worked = true } = {}) {
  const devices = worldDevices(w);
  const board = w.iot?.board || 'ESP32';
  if (!devices.length) {
    return language === 'cpp'
      ? '// Place IoT sensors and actuators in the world, then program them here.\nvoid setup() {\n  Serial.begin(115200);\n}\n\nvoid loop() {\n  delay(200);\n}\n'
      : '# Place IoT sensors and actuators in the world, then program them here.\nfrom machine import Pin, ADC\nimport time\n\nwhile True:\n    time.sleep_ms(200)\n';
  }
  const syntheticMission = {
    title: w.name || 'World Builder Mission',
    goal: 'switch each output on when the world needs it, and off again.',
    conditions: starterConditions(w).map((c) => (worked ? c : 'false')),
  };
  // Deduplicate by signal for starter code generation while preserving device pins
  const uniqueDevices = [];
  const seenSignals = new Set();
  for (const d of devices) {
    if (!d.output && seenSignals.has(d.signal)) continue;
    if (!d.output && d.signal) seenSignals.add(d.signal);
    uniqueDevices.push(d);
  }
  const code = program(syntheticMission, language, uniqueDevices, true, board);
  return worked
    ? code
    : code.replace(
        /Worked example — .*/,
        `Your program: replace each ${language === 'cpp' ? 'false' : 'False'} with when that output should be on.`,
      );
}

// ---- The world's mission ----------------------------------------------------------------------
// Readings each sensor is tested at, low then high, with names for them.
const TEST_READINGS = {
  light: [10, 90, 'Dark', 'Bright'],
  soil: [10, 90, 'Dry soil', 'Wet soil'],
  tank: [10, 90, 'Tank low', 'Tank full'],
  pond: [10, 90, 'Pond low', 'Pond full'],
  rain: [0, 90, 'Dry', 'Raining'],
  temp: [16, 34, 'Cool', 'Hot'],
  outdoorTemp: [8, 34, 'Cold outside', 'Hot outside'],
  humidity: [30, 85, 'Dry air', 'Humid'],
  distance: [20, 200, 'Something close', 'Nothing near'],
  motion: [0, 1, 'No motion', 'Motion'],
  armed: [0, 1, 'Button up', 'Button pressed'],
  pressed: [0, 1, 'Button up', 'Button pressed'],
  docked: [0, 1, 'No card', 'Card scanned'],
};
// The conditions a world's program is tested in: each sensor low and high, every combination
// for up to three kinds of sensor (more vary one at a time). [name, readings] pairs, readings as
// the program's runtime takes them.
export function worldScenarios(w) {
  const base = runtimeEnv(w.environment),
    signals = [
      ...new Set(
        worldDevices(w)
          .filter((d) => !d.output && d.signal)
          .map((d) => d.signal),
      ),
    ],
    levels = (signal) => {
      const known = TEST_READINGS[signal];
      if (known)
        return [
          [known[0], known[2]],
          [known[1], known[3]],
        ];
      return ADC_SIGNALS.includes(signal)
        ? [
            [10, signal + ' low'],
            [90, signal + ' high'],
          ]
        : [
            [0, signal + ' off'],
            [1, signal + ' on'],
          ];
    };
  if (!signals.length) return [['As built', base]];
  if (signals.length > 3)
    return signals.flatMap((signal) =>
      levels(signal).map(([value, name]) => [name, { ...base, [signal]: value }]),
    );
  let list = [['', base]];
  for (const signal of signals)
    list = list.flatMap(([name, env]) =>
      levels(signal).map(([value, label]) => [
        name ? name + ' · ' + label : label,
        { ...env, [signal]: value },
      ]),
    );
  return list;
}
// What a program switches on in each scenario: per output device (in the world's order), 1 or 0;
// or an error.
export function runWorldProgram(w, code, language) {
  const devices = worldDevices(w),
    board = w.iot?.board || 'ESP32',
    outputs = devices.filter((d) => d.output);
  try {
    const runtime = new Runtime(String(code ?? ''), language, devices, board);
    return {
      results: worldScenarios(w).map(([name, env]) => {
        let result;
        for (let i = 0; i < 25; i++) result = runtime.step(env);
        return { name, outputs: outputs.map((d) => ((result.outputs[d.pin] || 0) > 0 ? 1 : 0)) };
      }),
    };
  } catch (error) {
    return { error: error.message || String(error) };
  }
}
// The world's mission: a student's program must switch each output as the world's own program
// (the one written in the World Builder) does, in every scenario.
export function checkWorldProgram(w, code, language = w.iot?.language || 'cpp') {
  const devices = worldDevices(w),
    outputs = devices.filter((d) => d.output),
    board = w.iot?.board || 'ESP32',
    wiring = validate(devices, board),
    actual = runWorldProgram(w, code, language);
  // What the outputs should do: as the world's own program does them, in the language it was
  // written in; one that never switches anything on (never written after placing devices) gives
  // way to the rules guessed from the devices.
  const own = w.iot?.language || 'cpp';
  let expected = runWorldProgram(w, w.iot?.code?.[own] || starterCode(w, own), own);
  if (!expected.error && expected.results.every((r) => r.outputs.every((v) => !v)))
    expected = runWorldProgram(w, starterCode(w, own), own);
  if (!outputs.length)
    return { pass: false, problem: 'This world has no outputs to program.', rows: [], outputs };
  if (expected.error)
    return {
      pass: false,
      problem: "The world's own program does not run: " + expected.error,
      rows: [],
      outputs,
    };
  if (actual.error) return { pass: false, problem: actual.error, rows: [], outputs, wiring };
  const rows = expected.results.map((e, i) => ({
    name: e.name,
    expected: e.outputs,
    actual: actual.results[i].outputs,
    pass: e.outputs.every((v, k) => v === actual.results[i].outputs[k]),
  }));
  return { pass: !wiring.length && rows.every((r) => r.pass), rows, outputs, wiring };
}

// ---- Simulation -------------------------------------------------------------------------------
// The readings a program sees for the world's conditions (as the game stores them: ADC sensors
// 0-100, read by the program as level x 40.95).
export function runtimeEnv(envCfg = defaultEnvironment()) {
  return {
    ...baseEnv,
    light: envCfg.sunlight ?? 80,
    temp: envCfg.temperature ?? 24,
    outdoorTemp: envCfg.temperature ?? 24,
    humidity: envCfg.humidity ?? 50,
    rain: envCfg.rain ?? 0,
    wind: envCfg.wind ?? 12,
    cloud: envCfg.fog ?? 10,
    soil: envCfg.soilMoisture ?? 35,
    tank: envCfg.waterLevel ?? 80,
    pond: envCfg.waterLevel ?? 80,
    motion: envCfg.motion ? 1 : 0,
    occupied: envCfg.motion ? 1 : 0,
    distance: envCfg.distance ?? 120,
    dust: envCfg.dust ?? 10,
    pressed: envCfg.pressed ? 1 : 0,
    docked: envCfg.docked ? 1 : 0,
  };
}
// Sunlight 0..100 for an hour of the day (6:00..18:00 daylight curve).
export const sunlightAt = (hour) =>
  Math.max(5, Math.round(Math.max(0, Math.sin((((Number(hour) || 12) - 6) / 12) * Math.PI)) * 95));

// The cars and people that move along the world's roads in a simulation.
export const worldAgents = (w) =>
  (w.objects || [])
    .filter((o) => o.kind === 'infra/vehicle-car' || o.kind === 'infra/pedestrian')
    .map((o) => ({
      objectId: o.id,
      kind: o.kind,
      pos: [...o.pos],
      startPos: [...o.pos],
      turn: o.turn || 0,
      speed: Number(o.props?.speed) || (o.kind === 'infra/vehicle-car' ? 6 : 1.4),
      progress: 0,
    }));

const isOn = (outputs, d) => (outputs[d.pin] || 0) > 0;
// What the outputs do to the world: whether a gate is open.
export const gateOpen = (w, outputs) =>
  worldDevices(w).some((d) => ['servo', 'gate', 'motor'].includes(d.id) && isOn(outputs, d));

// One step of a simulation. `sim` holds simEnvironment, simOutputs, simAgents, simTime, simLogs,
// simError and runtime (a Runtime running the world's program, or null), as the World Builder's
// session and the game's world player both keep them, and optionally readings: signals set by
// hand (a button pressed, someone in front of a motion sensor) over the conditions. It is updated
// in place.
export function stepWorldSim(sim, w, dtSeconds = 0.2) {
  sim.simTime = round(sim.simTime + dtSeconds, 2);

  // Step microcontroller program
  if (sim.runtime) {
    try {
      const res = sim.runtime.step({
        ...runtimeEnv(sim.simEnvironment || w.environment),
        ...sim.readings,
      });
      sim.simOutputs = res.outputs || {};
      if (res.logs?.length) {
        sim.simLogs.push(...res.logs);
        if (sim.simLogs.length > 40) sim.simLogs.splice(0, sim.simLogs.length - 40);
      }
    } catch (err) {
      sim.simError = err.message || String(err);
    }
  }

  // Apply actuator outputs to world objects (e.g. pump waters soil, fan cools the room)
  const devices = worldDevices(w),
    outputs = sim.simOutputs;
  const pumpActive = devices.some(
    (d) => ['pump', 'valve', 'valve2'].includes(d.id) && isOn(outputs, d),
  );
  const coolingActive = devices.some((d) => ['fan', 'ac'].includes(d.id) && isOn(outputs, d));

  if (pumpActive && sim.simEnvironment) {
    sim.simEnvironment.soilMoisture = Math.min(
      100,
      round(sim.simEnvironment.soilMoisture + dtSeconds * 2, 1),
    );
  }
  if (coolingActive && sim.simEnvironment) {
    sim.simEnvironment.temperature = Math.max(
      16,
      round(sim.simEnvironment.temperature - dtSeconds * 0.4, 1),
    );
  }

  // Step road/path agents while obeying red traffic signals
  const redSignalActive = devices.some(
    (d) => ['red', 'red2', 'waitLight'].includes(d.id) && isOn(outputs, d),
  );
  const roads = w.roads || [];
  for (const agent of sim.simAgents || []) {
    if (redSignalActive || !roads.length) continue;
    const road =
      roads.find((r) =>
        agent.kind === 'infra/pedestrian' ? r.kind === 'footpath' : r.kind !== 'footpath',
      ) || roads[0];
    const pts = sampleRoadPoints(road.points, road.curvature);
    if (pts.length < 2) continue;
    agent.progress = (agent.progress + dtSeconds * agent.speed * 0.05) % 1;
    const idx = Math.min(pts.length - 2, Math.floor(agent.progress * (pts.length - 1)));
    const localT = agent.progress * (pts.length - 1) - idx;
    const a = pts[idx],
      b = pts[idx + 1];
    const nx = a.x + (b.x - a.x) * localT;
    const nz = a.z + (b.z - a.z) * localT;
    const ny = terrainHeightAt(w.terrain, nx, nz);
    agent.pos = [round(nx, 2), round(ny, 2), round(nz, 2)];
    agent.turn = round(Math.atan2(b.x - a.x, b.z - a.z), 3);
  }
}

// ---- The 3D scene -----------------------------------------------------------------------------
// The world as the game's renderers draw it (objects, colliders, roofs, lamps, sky). In a
// simulation (`playing`), outputs light lamps and open gates and agents move. Returns the model,
// with each placed object's parts in model.objectParts.
export function buildWorldScene(
  w,
  {
    playing = false,
    outputs = {},
    agents = [],
    hideRoofs = false,
    maxVisibleStory = 10,
    layers = w.layers,
    // Doors and gates opened by hand in a simulation, by object id.
    opened = null,
    // Imported models' measured sizes, by asset id ([w, h, d, centre y]), once each has loaded.
    // A model not yet measured gets a faint stand-in box in the editor and nothing in the game,
    // which draws the model itself.
    modelSizes = null,
  } = {},
) {
  const objects = [];
  const colliders = [];
  const roofs = [];
  const lamps = [];

  const model = {
    objects,
    colliders,
    roofs,
    rooms: [],
    lamps,
    mesh(shape, pos, size, color, extra = {}) {
      const m = {
        shape,
        pos: [...pos],
        size: [...size],
        color,
        rotation: [0, 0, 0],
        ...extra,
      };
      objects.push(m);
      return m;
    },
    cylinder(x, y, z, r, h, color, extra = {}) {
      return this.mesh('cylinder', [x, y, z], [r * 2, h, r * 2], color, extra);
    },
    sphere(x, y, z, r, color, extra = {}) {
      return this.mesh('sphere', [x, y, z], [r * 2, r * 2, r * 2], color, extra);
    },
    floorHeight: (x, z) => terrainHeightAt(w.terrain, x, z),
  };

  const layerMap = new Map((layers || DEFAULT_LAYERS).map((l) => [l.id, l]));
  const isLayerVisible = (layerId) => layerMap.get(layerId)?.visible !== false;

  // 1. Sky
  model.sky = addSky(model);

  // 2. Terrain & Water
  if (isLayerVisible('terrain')) buildTerrainMeshes(model, w.terrain);

  // 3. Roads & Footpaths
  if (isLayerVisible('infrastructure')) buildRoadMeshes(model, w.roads, w.terrain, terrainHeightAt);

  // 4. Placed Objects (Buildings, Modular Parts, Furniture, Nature, IoT)
  model.objectParts = new Map();
  const activeOutputs = playing ? outputs : {};
  const devices = worldDevices(w);
  const anyLampOn = devices.some(
    (d) => ['led', 'porch', 'rgb', 'lightB'].includes(d.id) && isOn(activeOutputs, d),
  );
  const gateActive = playing && gateOpen(w, activeOutputs);

  for (const obj of w.objects || []) {
    if (obj.hidden) continue;
    if (!isLayerVisible(obj.layer || layerForKind(obj.kind))) continue;

    // In a simulation, agents move and servo/gate doors open
    let instanceObj = obj;
    if (playing) {
      const agent = agents.find((a) => a.objectId === obj.id);
      if (agent) {
        instanceObj = { ...obj, pos: agent.pos, turn: agent.turn };
      } else if (opened?.has(obj.id)) {
        instanceObj = { ...obj, props: { ...(obj.props || {}), doorOpen: true } };
      } else if (
        gateActive &&
        (obj.kind === 'modular/gate' ||
          obj.kind === 'modular/door' ||
          obj.kind === 'building/garage' ||
          obj.props?.behavior === 'servo')
      ) {
        instanceObj = { ...obj, props: { ...(obj.props || {}), doorOpen: true } };
      }
    }

    const imported = obj.kind.startsWith('imported/') ? obj.kind.slice('imported/'.length) : null;
    if (imported && !modelSizes) {
      model.objectParts.set(obj.id, []);
      continue;
    }
    const built = buildAssetInstance(model, instanceObj, {
      hideRoofs,
      maxVisibleStory,
      deviceOutputs: activeOutputs,
      importedSize: imported ? modelSizes.get(imported) : undefined,
    });
    model.objectParts.set(obj.id, built.parts);

    // Point lights for lamps and streetlights that are on
    if (
      (anyLampOn && obj.kind === 'furniture/streetlight') ||
      (obj.kind.startsWith('iot/') &&
        ['led', 'porch', 'rgb'].includes(obj.props?.componentId || obj.kind.slice(4)) &&
        (activeOutputs[obj.props?.pin] || 0) > 0)
    ) {
      lamps.push({
        pos: [instanceObj.pos[0], instanceObj.pos[1] + 2.2, instanceObj.pos[2]],
        color: [1.0, 0.92, 0.72],
        range: 9.5,
      });
    }
  }
  return model;
}

// Finishes a scene for drawing (materials); kept apart so the editor can add its markers first.
export const prepareWorldScene = (model) => (prepareWorldMaterials(model), model);

// ---- Walking a world --------------------------------------------------------------------------
// How far from the centre anyone can walk (the terrain is 128 m across), and how wide a walker is.
export const WALK_LIMIT = 62;
const BODY = 0.45;
const blockedAt = (colliders, x, z) =>
  colliders.some((c) => Math.abs(x - c.x) < c.w / 2 + BODY && Math.abs(z - c.z) < c.d / 2 + BODY);
const inside = (v) => Math.max(-WALK_LIMIT, Math.min(WALK_LIMIT, v));
// A step from [x, y, z] by (dx, dz) across the world: walls and solid objects stop it, sliding
// along them; the walker stands on the ground. Returns the new [x, y, z].
export function walkStep(w, colliders, [x, , z], dx, dz) {
  let nx = x,
    nz = z;
  if (!blockedAt(colliders, inside(x + dx), z)) nx = inside(x + dx);
  if (!blockedAt(colliders, nx, inside(z + dz))) nz = inside(z + dz);
  return [nx, terrainHeightAt(w.terrain, nx, nz), nz];
}
// Where a walker starts: the world's spawn, or the nearest free spot to it.
export function startPosition(w, colliders) {
  const [sx, , sz] = w.spawn || [0, 0, 12];
  for (let r = 0; r <= 30; r += 1.5)
    for (let a = 0; a < (r ? 12 : 1); a++) {
      const x = sx + Math.cos((a / 12) * Math.PI * 2) * r,
        z = sz + Math.sin((a / 12) * Math.PI * 2) * r;
      if (Math.abs(x) <= WALK_LIMIT && Math.abs(z) <= WALK_LIMIT && !blockedAt(colliders, x, z))
        return [x, terrainHeightAt(w.terrain, x, z), z];
    }
  return [sx, terrainHeightAt(w.terrain, sx, sz), sz];
}

// What a walker can use by hand: inputs (a button, keypad or card reader, by the signal it sets)
// and doors and gates.
const HAND_SIGNALS = { pressed: 'press', armed: 'press', docked: 'scan a card at' };
const DOORS = ['modular/door', 'modular/gate', 'modular/wall-door', 'building/garage'];
export function usable(obj) {
  if (obj.kind.startsWith('iot/')) {
    const signal = getComponentSpec(obj.props?.componentId || obj.kind.slice(4))?.signal;
    return HAND_SIGNALS[signal] ? { kind: 'input', signal, verb: HAND_SIGNALS[signal] } : null;
  }
  if (DOORS.includes(obj.kind)) return { kind: 'door', verb: 'open or close' };
  return null;
}
// The nearest object within reach to use, as { obj, kind, verb }, or null.
export function nearestUsable(w, [x, , z], reach = 2.6) {
  let best = null,
    distance = reach;
  for (const obj of w.objects || []) {
    if (obj.hidden) continue;
    const use = usable(obj);
    if (!use) continue;
    const d = Math.hypot(obj.pos[0] - x, obj.pos[2] - z);
    if (d <= distance) [best, distance] = [{ obj, ...use }, d];
  }
  return best;
}
// Whether a walker at [x, y, z] is seen by one of the world's motion sensors.
export const motionSeen = (w, [x, , z], range = 4.5) =>
  worldDevices(w).some((d) => {
    if (d.signal !== 'motion') return false;
    const obj = w.objects.find((o) => o.id === d.objectId);
    return !!obj && Math.hypot(obj.pos[0] - x, obj.pos[2] - z) <= range;
  });
