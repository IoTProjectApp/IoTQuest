// A world built in the World Builder, played in the game (world.html?id=<world id>): the
// technician walks it, its devices are wired as the World Builder placed them, and the mission is
// to program them so each output switches as the world's own program does. Progress is kept for
// each world, apart from the game's own; a play-test from the editor (&editor-play) saves nothing.
import * as THREE from './vendor/three.module.min.js';
import { ThreeWorldRenderer } from './world-renderer-three.js';
import { multiply, perspective, lookAt } from './world-math.js';
import { worldSunlight } from './world-materials.js';
import { updateSky } from './sky.js';
import { Runtime } from './runtime.js';
import { validate } from './missions.js';
import { programReading } from './signals.js';
import { CLIPS, walkTime } from './character-clips.js';
import { settingsFor, dressed } from './character-settings.js';
import { knownModel } from './character-models.js';
import { TECHNICIAN } from './people-cast.js';
import { TECHNICIAN_OUTFIT } from './character-outfits.js';
import { GLTFLoader } from './vendor/three-addons/GLTFLoader.js';
import { esc } from './html.js';
import { worldById, WORLD_ID } from './custom-worlds.js';
import {
  worldDevices,
  worldAgents,
  stepWorldSim,
  buildWorldScene,
  prepareWorldScene,
  checkWorldProgram,
  starterCode,
  sunlightAt,
  walkStep,
  startPosition,
  nearestUsable,
  motionSeen,
} from './world-builder/world.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const PLAY = params.has('editor-play');
const id = params.get('id') || '';
const world = WORLD_ID.test(id) ? worldById(id) : null;
const CHANNEL = globalThis.IOTQUEST_CHANNEL || '';
// Progress in each world, kept apart from the game's own save: { [world id]: { language, code,
// passed } }.
const PROGRESS_KEY = CHANNEL ? 'iotquest-' + CHANNEL + '-worlds-v1' : 'iotquest-worlds-v1';
const GAME_KEY = CHANNEL ? 'iotquest-' + CHANNEL + '-v1' : 'iotquest-v1';
const FOV = 0.82;
const STEP_SECONDS = 0.2;

function readJSON(key) {
  if (PLAY) return {};
  try {
    const value = JSON.parse(localStorage.getItem(key) || '{}');
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}
const allProgress = readJSON(PROGRESS_KEY);
// The technician as the player dressed them in the game (read only).
const game = readJSON(GAME_KEY);

if (PLAY) {
  $('back').hidden = true;
  $('worldNote').textContent = 'Editor play-test · progress is not saved';
}
if (!world) {
  $('message').innerHTML = id
    ? 'This world is not in the game. It may have been renamed or removed in the World Builder.' +
      (PLAY ? '' : ' <a href="./game.html">Back to the destinations</a>')
    : 'No world chosen. <a href="./game.html">Back to the destinations</a>';
  $('message').hidden = false;
} else play();

// The world, played.
function play() {
  // ---- The world's state ------------------------------------------------------------------------
  document.title = world.name + ' · IoT Quest';
  $('worldName').textContent = world.name;
  const devices = worldDevices(world),
    outputs = devices.filter((d) => d.output),
    sensors = devices.filter((d) => !d.output && d.signal);
  const saved = allProgress[world.id];
  const progress = {
    language: ['cpp', 'python'].includes(saved?.language) ? saved.language : world.iot.language,
    code: {
      cpp: typeof saved?.code?.cpp === 'string' ? saved.code.cpp : null,
      python: typeof saved?.code?.python === 'string' ? saved.code.python : null,
    },
    passed: saved?.passed === true,
  };
  function save() {
    if (PLAY) return;
    allProgress[world.id] = progress;
    try {
      localStorage.setItem(PROGRESS_KEY, JSON.stringify(allProgress));
    } catch {}
  }
  const codeFor = (language) =>
    progress.code[language] ?? starterCode(world, language, { worked: false });
  const sim = {
    simEnvironment: { ...world.environment },
    simOutputs: {},
    simAgents: worldAgents(world),
    simTime: 0,
    simLogs: [],
    simError: null,
    runtime: null,
    // Signals set by hand: buttons pressed, a card scanned, someone seen by a motion sensor. A
    // button starts up (the game's homes start with their alarm armed).
    readings: { armed: 0 },
  };
  const opened = new Set();
  let running = false,
    manualMotion = false,
    scene = null,
    sceneKey = '';

  function rebuild() {
    const key = JSON.stringify([sim.simOutputs, [...opened], sim.simAgents.map((a) => a.pos)]);
    if (scene && key === sceneKey) return;
    sceneKey = key;
    scene = prepareWorldScene(
      buildWorldScene(world, {
        playing: true,
        outputs: sim.simOutputs,
        agents: sim.simAgents,
        opened,
      }),
    );
    syncImported();
  }

  // ---- Drawing ----------------------------------------------------------------------------------
  const canvas = $('view');
  let renderer = null;
  try {
    renderer = new ThreeWorldRenderer(canvas);
  } catch (error) {
    $('message').textContent = 'This device could not start 3D graphics: ' + error.message;
    $('message').hidden = false;
  }
  // Models imported into the World Builder: from a file under models/, or packed in the world.
  const loader = new GLTFLoader(),
    models = new Map(),
    importedGroup = renderer ? new THREE.Group() : null;
  if (importedGroup) renderer.world.add(importedGroup);
  const modelSource = (asset) =>
    [asset.file, asset.url, asset.dataUrl].find(
      (s) =>
        typeof s === 'string' &&
        (/^data:model\/gltf-binary;base64,/.test(s) ||
          (/^models\/[\w./-]+\.glb$/.test(s) && !s.includes('..'))),
    );
  function syncImported() {
    if (!importedGroup) return;
    while (importedGroup.children.length) importedGroup.remove(importedGroup.children[0]);
    for (const asset of world.importedAssets || []) {
      const source = modelSource(asset);
      if (!source || models.has(asset.id)) continue;
      models.set(asset.id, null);
      loader.load(
        source,
        (gltf) => {
          models.set(asset.id, gltf.scene);
          syncImported();
        },
        undefined,
        () => {},
      );
    }
    for (const obj of world.objects) {
      if (obj.hidden || !obj.kind.startsWith('imported/')) continue;
      const id = obj.kind.slice('imported/'.length),
        model = models.get(id),
        meta = world.importedAssets.find((a) => a.id === id);
      if (!model || !meta) continue;
      const copy = model.clone(true),
        base = Number(meta.scale) || 1,
        scale = Array.isArray(obj.scale) ? obj.scale : [obj.scale, obj.scale, obj.scale];
      copy.position.set(...obj.pos);
      const [rx, ry, rz] = meta.rotation || [0, 0, 0];
      copy.rotation.set(rx, ry + (obj.turn || 0), rz);
      copy.scale.set(base * scale[0], base * scale[1], base * scale[2]);
      importedGroup.add(copy);
    }
  }

  // The technician: where they are, which way they face, and how far they have walked.
  const player = { pos: [0, 0, 0], heading: 0, walked: 0, pace: 0 };
  const look = { yaw: Math.PI, pitch: 0.42, distance: 7 };
  rebuild();
  player.pos = startPosition(world, scene.colliders);
  const keys = new Set();
  const set = settingsFor('player'),
    technicianModel = (knownModel(set.model) && set.model) || TECHNICIAN[game.appearance] || 'Adam';
  // A simple figure until the rigged technician has loaded (or where it cannot).
  const standIn = [
    {
      shape: 'cylinder',
      pos: [0, 0, 0],
      size: [0.5, 1.2, 0.5],
      color: '#f2d43c',
      rotation: [0, 0, 0],
    },
    {
      shape: 'sphere',
      pos: [0, 0, 0],
      size: [0.32, 0.32, 0.32],
      color: '#c79a76',
      rotation: [0, 0, 0],
    },
  ];
  function technician(t) {
    const [x, y, z] = player.pos;
    standIn[0].pos = [x, y + 0.75, z];
    standIn[1].pos = [x, y + 1.55, z];
    const loop = (name) => ({ name, time: (t * set.rate) % CLIPS[name].duration });
    const walk = 'Jogging';
    return {
      key: 'player',
      model: technicianModel,
      x,
      y,
      z,
      carry: game.color,
      scale: 1.15,
      outfit: dressed(TECHNICIAN_OUTFIT, set.outfit),
      appearance: set.appearance,
      angle: Math.atan2(Math.cos(player.heading), Math.sin(player.heading)),
      clips:
        player.pace > 0.05
          ? [
              { name: walk, time: walkTime(walk, player.walked), weight: player.pace },
              { ...loop('Idle'), weight: 1 - player.pace },
            ]
          : [{ ...loop('Idle'), weight: 1 }],
      standIn,
    };
  }

  let last = performance.now();
  function frame(time) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.1, Math.max(0.001, (time - last) / 1000));
    last = time;
    walk(dt);
    if (!renderer) return;
    const width = Math.max(1, canvas.clientWidth),
      height = Math.max(1, canvas.clientHeight),
      dpr = Math.min(renderer.maxPixelRatio || 2, globalThis.devicePixelRatio || 1);
    if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
    }
    const [px, py, pz] = player.pos,
      target = [px, py + 1.3, pz],
      eye = [
        px + Math.sin(look.yaw) * Math.cos(look.pitch) * look.distance,
        py + 1.3 + Math.sin(look.pitch) * look.distance,
        pz + Math.cos(look.yaw) * Math.cos(look.pitch) * look.distance,
      ],
      near = 0.1,
      far = 600,
      matrix = multiply(perspective(FOV, width / height, near, far), lookAt(eye, target));
    const environment = sim.simEnvironment,
      daylight = Math.max(0.08, Math.min(1, Number(environment.sunlight ?? 85) / 100)),
      env = {
        light: environment.sunlight,
        cloud: environment.fog,
        rain: environment.rain,
        wind: environment.wind,
      },
      tod = Number(environment.timeOfDay ?? 11.5),
      date = new Date(Date.UTC(2026, 2, 20, 0) + (tod - 145 / 15) * 3600000);
    updateSky(scene.sky, daylight, time / 1000, false, 0, env, 0, { eye, mirrored: false, date });
    const fog = (environment.fog || 0) / 100,
      person = technician(time / 1000);
    renderer.render({
      pixelWidth: canvas.width,
      pixelHeight: canvas.height,
      camera: { eye, target, fov: FOV, near, far, aspect: width / height, mirrored: false },
      matrix,
      pixelScale: height / 2 / Math.tan(FOV / 2),
      eye,
      fog: [
        (0.68 * daylight + 0.05) * (1 - fog * 0.2),
        (0.8 * daylight + 0.06) * (1 - fog * 0.15),
        (0.92 * daylight + 0.1) * (1 - fog * 0.1),
      ],
      day: daylight,
      sun: worldSunlight({ env, skyMode: 'simulated' }, scene.sky?.ephemeris),
      time: time / 1000,
      shadows: [],
      wet: Math.min(1, (environment.rain || 0) / 100),
      haze: fog * 0.85,
      fogOffset: Math.max(0, (1 - fog) * 45),
      lights: scene.lamps.slice(0, 8),
      objects: [...scene.objects, ...standIn],
      characters: [person],
    });
  }

  // ---- Walking and looking ----------------------------------------------------------------------
  const typing = () => /^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement?.tagName);
  function walk(dt) {
    let forward = 0,
      right = 0;
    if (keys.has('KeyW') || keys.has('ArrowUp')) forward += 1;
    if (keys.has('KeyS') || keys.has('ArrowDown')) forward -= 1;
    if (keys.has('KeyD') || keys.has('ArrowRight')) right += 1;
    if (keys.has('KeyA') || keys.has('ArrowLeft')) right -= 1;
    const moving = forward || right;
    player.pace += ((moving ? 1 : 0) - player.pace) * Math.min(1, dt * 8);
    if (!moving) return;
    // Forward is away from the camera.
    const fx = -Math.sin(look.yaw),
      fz = -Math.cos(look.yaw),
      length = Math.hypot(forward, right),
      dx = ((fx * forward - fz * right) / length) * 4.2 * dt,
      dz = ((fz * forward + fx * right) / length) * 4.2 * dt,
      before = player.pos;
    player.pos = walkStep(world, scene.colliders, player.pos, dx, dz);
    const moved = Math.hypot(player.pos[0] - before[0], player.pos[2] - before[2]);
    player.walked += moved;
    if (moved > 1e-4) player.heading = Math.atan2(dx, dz);
    updateHint();
  }
  addEventListener('keydown', (e) => {
    if (typing() || e.metaKey || e.ctrlKey) return;
    if (e.code === 'KeyE') return use();
    if (/^(Key[WASD]|Arrow)/.test(e.code)) {
      keys.add(e.code);
      e.preventDefault();
    }
  });
  addEventListener('keyup', (e) => keys.delete(e.code));
  addEventListener('blur', () => keys.clear());
  let drag = null;
  canvas.addEventListener('pointerdown', (e) => {
    drag = { x: e.clientX, y: e.clientY };
    canvas.setPointerCapture(e.pointerId);
    canvas.classList.add('dragging');
    canvas.focus();
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag) return;
    look.yaw -= (e.clientX - drag.x) * 0.006;
    look.pitch = Math.max(0.05, Math.min(1.3, look.pitch + (e.clientY - drag.y) * 0.005));
    drag = { x: e.clientX, y: e.clientY };
  });
  const endDrag = () => {
    drag = null;
    canvas.classList.remove('dragging');
  };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      look.distance = Math.max(3, Math.min(30, look.distance * (1 + Math.sign(e.deltaY) * 0.1)));
    },
    { passive: false },
  );
  canvas.tabIndex = 0;

  // Using what is within reach: an input sets its signal; a door or gate opens and closes.
  function updateHint() {
    const near = nearestUsable(world, player.pos);
    $('hint').hidden = !near;
    if (near) $('hint').textContent = `Press E to ${near.verb} ${near.obj.name}`;
    const seen = motionSeen(world, player.pos);
    if (!!sim.readings.motion !== (seen || manualMotion)) {
      sim.readings.motion = sim.readings.occupied = seen || manualMotion ? 1 : 0;
      renderConditions();
    }
  }
  function use() {
    const near = nearestUsable(world, player.pos);
    if (!near) return;
    if (near.kind === 'door') {
      if (opened.has(near.obj.id)) opened.delete(near.obj.id);
      else opened.add(near.obj.id);
      rebuild();
    } else {
      sim.readings[near.signal] = sim.readings[near.signal] ? 0 : 1;
      renderConditions();
      step();
    }
  }

  // ---- The program ------------------------------------------------------------------------------
  function compile() {
    const language = progress.language,
      code = codeFor(language);
    sim.runtime = null;
    sim.simError = null;
    try {
      const wiring = validate(devices, world.iot.board);
      if (wiring.length) sim.simError = wiring[0];
      sim.runtime = new Runtime(code, language, devices, world.iot.board);
    } catch (error) {
      sim.simError = error.message || String(error);
    }
  }
  // Cars and people keep moving; the program runs only while Run is on.
  function step() {
    stepWorldSim(sim, world, STEP_SECONDS);
    rebuild();
    renderProgramState();
  }
  setInterval(step, STEP_SECONDS * 1000);
  function setRunning(value) {
    running = value;
    if (running) compile();
    else {
      sim.runtime = null;
      sim.simError = null;
      sim.simOutputs = {};
    }
    $('run').textContent = running ? 'Stop' : 'Run';
    rebuild();
    renderProgramState();
  }
  $('run').addEventListener('click', () => setRunning(!running));
  $('language').value = progress.language;
  $('code').value = codeFor(progress.language);
  $('language').addEventListener('change', () => {
    progress.language = $('language').value;
    $('code').value = codeFor(progress.language);
    save();
    if (running) compile();
    renderMission();
  });
  $('code').addEventListener('input', () => {
    progress.code[progress.language] = $('code').value;
    save();
  });
  $('code').addEventListener('change', () => running && compile());
  $('starter').addEventListener('click', () => {
    if (!confirm('Start this program again from the starter? Your changes will be lost.')) return;
    progress.code[progress.language] = null;
    $('code').value = codeFor(progress.language);
    save();
    if (running) compile();
  });
  function renderProgramState() {
    const on = (d) => (sim.simOutputs[d.pin] || 0) > 0;
    $('programState').innerHTML =
      (sim.simError ? `<p class="error">${esc(sim.simError)}</p>` : '') +
      `<p>${running ? 'Running on the ' + esc(world.iot.board) + '.' : 'Not running: press Run.'}</p>` +
      (outputs.length
        ? `<table class="world-table"><tr><th>Output</th><th>Pin</th><th>Now</th></tr>${outputs
            .map(
              (d) =>
                `<tr><td>${esc(d.name)}</td><td>${esc(d.pin)}</td><td class="${on(d) ? 'on' : 'off'}">${on(d) ? 'ON' : 'off'}</td></tr>`,
            )
            .join('')}</table>`
        : '') +
      (sim.simLogs.length
        ? `<h3>Serial</h3><pre class="world-log">${esc(sim.simLogs.slice(-6).join('\n'))}</pre>`
        : '');
  }

  // ---- The mission ------------------------------------------------------------------------------
  function renderMission(result = null) {
    const status = $('status');
    status.hidden = !progress.passed;
    status.textContent = 'Passed ✓';
    status.classList.toggle('passed', progress.passed);
    const row = (d) =>
      `<tr><td>${esc(d.name)}</td><td>${d.output ? 'output' : esc(d.signal || 'input')}</td><td>${esc(d.pin)}</td></tr>`;
    $('mission').innerHTML =
      `<p>Program this world's devices on the ${esc(world.iot.board)}. Each output should switch on and off as the world needs it, in every condition.</p>` +
      (devices.length
        ? `<table class="world-table"><tr><th>Device</th><th>Kind</th><th>GPIO</th></tr>${devices.map(row).join('')}</table>`
        : '<p>This world has no devices yet.</p>') +
      `<p><small>Walk near a motion sensor to be seen by it. Press E beside a button, keypad, card reader, door or gate to use it. Change the weather and time in Conditions.</small></p>` +
      `<button class="primary" id="check" ${outputs.length ? '' : 'disabled'}>Check my program</button>` +
      (result ? verdict(result) : progress.passed ? verdict({ pass: true, rows: [] }) : '');
    $('check')?.addEventListener('click', () => {
      const result = checkWorldProgram(world, codeFor(progress.language), progress.language);
      if (result.pass && !progress.passed) {
        progress.passed = true;
        save();
      }
      renderMission(result);
    });
  }
  function verdict(result) {
    if (result.pass)
      return `<div class="world-verdict pass"><strong>Passed.</strong> Every output switches as ${esc(world.name)} needs it.</div>`;
    if (result.problem)
      return `<div class="world-verdict fail"><strong>Not yet.</strong> ${esc(result.problem)}</div>`;
    const names = result.outputs.map((d) => esc(d.name)).join(', ');
    return (
      `<div class="world-verdict fail"><strong>Not yet.</strong> ${result.wiring?.length ? esc(result.wiring[0]) : 'Some conditions switch the outputs the wrong way.'}</div>` +
      `<table class="world-table"><tr><th>Condition</th><th>Should be</th><th>Yours</th></tr>${result.rows
        .map(
          (r) =>
            `<tr class="${r.pass ? '' : 'wrong'}"><td>${esc(r.name)}</td><td>${r.expected.map((v) => (v ? 'ON' : 'off')).join(' · ')}</td><td>${r.actual.map((v) => (v ? 'ON' : 'off')).join(' · ')}</td></tr>`,
        )
        .join('')}</table><p><small>Outputs, in order: ${names}.</small></p>`
    );
  }

  // ---- Conditions -------------------------------------------------------------------------------
  const SLIDERS = [
    ['timeOfDay', 'Time of day', 0, 24, 0.5, (v) => `${Math.floor(v)}:${v % 1 ? '30' : '00'}`],
    ['sunlight', 'Sunlight', 0, 100, 1, (v) => v + '%'],
    ['temperature', 'Temperature', -5, 45, 1, (v) => v + ' °C'],
    ['humidity', 'Humidity', 0, 100, 1, (v) => v + '%'],
    ['rain', 'Rain', 0, 100, 1, (v) => v + '%'],
    ['soilMoisture', 'Soil moisture', 0, 100, 1, (v) => v + '%'],
    ['waterLevel', 'Water level', 0, 100, 1, (v) => v + '%'],
    ['distance', 'Distance', 2, 400, 1, (v) => v + ' cm'],
    ['fog', 'Fog', 0, 100, 1, (v) => v + '%'],
  ];
  function renderConditions() {
    const env = sim.simEnvironment,
      readings = sensors
        .map(
          (d) =>
            `<tr><td>${esc(d.name)}</td><td>${esc(
              programReading(
                d.signal,
                sim.readings[d.signal] ??
                  {
                    light: env.sunlight,
                    temp: env.temperature,
                    humidity: env.humidity,
                    rain: env.rain,
                    soil: env.soilMoisture,
                    tank: env.waterLevel,
                    pond: env.waterLevel,
                    distance: env.distance,
                  }[d.signal] ??
                  0,
              ),
            )}</td></tr>`,
        )
        .join('');
    $('conditions').innerHTML =
      '<p>Practice conditions for this world: change them and watch what your program does.</p>' +
      SLIDERS.map(
        ([key, label, min, max, step, show]) =>
          `<label class="condition"><span>${label}</span><input type="range" data-env="${key}" min="${min}" max="${max}" step="${step}" value="${esc(env[key])}" /><output>${esc(show(Number(env[key])))}</output></label>`,
      ).join('') +
      `<div class="condition-toggles">
        <button class="outline ${manualMotion ? 'on' : ''}" data-toggle="motion">Motion: ${sim.readings.motion ? 'seen' : 'none'}</button>
        <button class="outline ${sim.readings.pressed || sim.readings.armed ? 'on' : ''}" data-toggle="pressed">Button: ${sim.readings.pressed || sim.readings.armed ? 'pressed' : 'released'}</button>
        <button class="outline ${sim.readings.docked ? 'on' : ''}" data-toggle="docked">Card: ${sim.readings.docked ? 'scanned' : 'none'}</button>
      </div>` +
      (readings
        ? `<h3>What the sensors read</h3><table class="world-table">${readings}</table>`
        : '');
    for (const input of $('conditions').querySelectorAll('[data-env]'))
      input.addEventListener('input', () => {
        const key = input.dataset.env,
          value = Number(input.value);
        sim.simEnvironment[key] = value;
        if (key === 'timeOfDay') sim.simEnvironment.sunlight = sunlightAt(value);
        input.nextElementSibling.textContent = SLIDERS.find(([k]) => k === key)[5](value);
        if (key === 'timeOfDay') {
          const sun = $('conditions').querySelector('[data-env="sunlight"]');
          sun.value = sim.simEnvironment.sunlight;
          sun.nextElementSibling.textContent = sim.simEnvironment.sunlight + '%';
        }
      });
    for (const input of $('conditions').querySelectorAll('[data-env]'))
      input.addEventListener('change', () => renderConditions());
    for (const button of $('conditions').querySelectorAll('[data-toggle]'))
      button.addEventListener('click', () => {
        const signal = button.dataset.toggle;
        if (signal === 'motion') {
          manualMotion = !manualMotion;
          sim.readings.motion = sim.readings.occupied =
            manualMotion || motionSeen(world, player.pos) ? 1 : 0;
        } else if (signal === 'pressed') {
          const value = sim.readings.pressed || sim.readings.armed ? 0 : 1;
          sim.readings.pressed = sim.readings.armed = value;
        } else sim.readings[signal] = sim.readings[signal] ? 0 : 1;
        renderConditions();
        step();
      });
  }

  // ---- Tabs -------------------------------------------------------------------------------------
  for (const tab of document.querySelectorAll('[data-tab]'))
    tab.addEventListener('click', () => {
      for (const t of document.querySelectorAll('[data-tab]'))
        t.classList.toggle('active', t === tab);
      for (const panel of document.querySelectorAll('[data-panel]'))
        panel.hidden = panel.dataset.panel !== tab.dataset.tab;
    });

  renderMission();
  renderConditions();
  renderProgramState();
  updateHint();
  requestAnimationFrame(frame);
  // For tests and the developer console.
  globalThis.worldPlay = {
    world,
    sim,
    player,
    look,
    progress,
    opened,
    keys,
    step,
    use,
    setRunning,
  };
}
