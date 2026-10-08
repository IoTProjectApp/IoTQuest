import {
  createConversation,
  selectedRequest,
  chooseRequest,
  sendConversationMessage,
  conversationQuestions,
  nearestCharacter,
} from '../public/conversations.js';
import { residentsForSections, createGreetingTracker } from '../public/section-residents.js';
import { toWorld, fromWorld } from '../public/world-math.js';
import { ADC_SIGNALS, ADC_SCALE } from '../public/signals.js';
import { checkPredictions } from '../public/weather-quests.js';
import { conversationHTML } from '../public/conversation-view.js';
import { predictionHTML } from '../public/prediction-view.js';
import { declutterLabels } from '../public/world-labels.js';
import { simulateDay, dayLogQuestions, dayLogCSV } from '../public/day-log.js';
import { dayLogHTML } from '../public/day-log-view.js';
import { securityCases, dashboardQuests } from '../public/challenges.js';
import { dashboardHTML, dashboardLiveHTML } from '../public/dashboard-view.js';
import {
  parseQuestFile,
  loadCustomQuests,
  customChallenge,
  QuestError,
  QUEST_LIMITS,
} from '../public/custom-quests.js';
import { BoardLink, readingsToEnv, outputLine, boardProgram } from '../public/hardware.js';
import { boardPanelHTML } from '../public/board-view.js';
import test from 'node:test';
import { localSkyDate, DEFAULT_OBSERVER } from '../public/astronomy.js';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile, access } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { Runtime } from '../public/runtime.js';
import {
  components,
  missions,
  baseEnv,
  defaults,
  validate,
  program,
  missionBudget,
} from '../public/missions.js';
import {
  locations,
  locationById,
  adaptMissions,
  progressForLocation,
} from '../public/locations.js';
import { WeatherService, advanceEnvironment, fallbackWeather } from '../public/weather.js';
import {
  createLabState,
  simulateBatch,
  residentRoutine,
  updateResources,
  faultCases,
  scenarios,
} from '../public/lab.js';
import {
  renderLabPanel,
  updateCircuit,
  updateResourcesPanel,
  scenarioOptions,
} from '../public/lab-panels.js';
import { projectFiles, zipFiles } from '../public/project-package.js';
import { isLocationUnlocked, completedQuestCount } from '../public/locations.js';
import { advancedMenu } from '../public/advanced-tools.js';
import { weatherHTML } from '../public/travel.js';
import { esc, setHTML } from '../public/html.js';
import { sanitizeSaved } from '../public/persistence.js';
import { highlight } from '../public/syntax-highlight.js';
import { SerialPlotter, findThresholds, PLOT_LIMIT } from '../public/plotter.js';
import { diagnose } from '../public/diagnostics.js';
import { createBugHunt, scoreBugHunt } from '../public/bug-hunt.js';
import { explainCode, removeExplanations, hasExplanations } from '../public/code-explain.js';
import {
  readProject,
  ImportError,
  IMPORT_LIMITS,
  PROJECT_FORMAT,
} from '../public/project-import.js';
import { formatCode as formatSource, FormatError, INDENT } from '../public/code-format.js';
import { coachSteps, readingText } from '../public/code-coach.js';
import { buildProgressReport, progressFileName } from '../public/progress-report.js';
import {
  understandingQuestions,
  answerQuestion,
  understandingScore,
} from '../public/understanding.js';
const html = await readFile('public/game.html', 'utf8'),
  source = await readFile('public/game.js', 'utf8');
class Element {
  constructor(doc, attrs = {}, tag = 'DIV') {
    this.doc = doc;
    this.tagName = tag.toUpperCase();
    this.dataset = {};
    this.style = {};
    this.attrs = attrs;
    this.id = attrs.id;
    this.hidden = false;
    this.checked = 'checked' in attrs;
    this.value = attrs.value || '';
    this.type = attrs.type || '';
    this.listeners = {};
    this.children = [];
    this.selectionStart = 0;
    this.selectionEnd = 0;
    this.scrollWidth = 500;
    this.scrollTop = 0;
    this.textContent = '';
    this.open = false;
    this.classes = new Set((attrs.class || '').split(' '));
    this.classList = {
      add: (x) => this.classes.add(x),
      remove: (x) => this.classes.delete(x),
      toggle: (x, force) => {
        if (force === undefined) force = !this.classes.has(x);
        if (force) this.classes.add(x);
        else this.classes.delete(x);
      },
      contains: (x) => this.classes.has(x),
    };
    for (const [k, v] of Object.entries(attrs))
      if (k.startsWith('data-'))
        this.dataset[k.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = v;
  }
  set innerHTML(s) {
    this._html = s;
    this.doc.removeOwned(this);
    this.doc.parse(s, this);
  }
  get innerHTML() {
    return this._html || '';
  }
  querySelector(selector) {
    this.childMap ??= {};
    return (this.childMap[selector] ??= new Element(this.doc, {}, selector));
  }
  addEventListener(name, fn) {
    (this.listeners[name] ??= []).push(fn);
  }
  dispatchEvent(e) {
    e.target = this;
    for (const fn of this.listeners[e.type] || []) fn(e);
  }
  setAttribute(k, v) {
    this.attrs[k] = v;
  }
  focus() {
    this.doc.activeElement = this;
  }
  showModal() {
    this.open = true;
  }
  close() {
    this.open = false;
  }
  scrollIntoView() {}
  setPointerCapture() {}
  click() {
    return this.onclick?.({ target: this });
  }
  getBoundingClientRect() {
    return { left: 0, right: 700, top: 0, bottom: 600 };
  }
  setRangeText(t, start, end, mode) {
    this.value = this.value.slice(0, start) + t + this.value.slice(end);
    this.selectionStart = this.selectionEnd = start + t.length;
  }
}
class Document {
  constructor() {
    this.nodes = [];
    this.body = new Element(this);
    this.documentElement = new Element(this);
    this.activeElement = this.body;
    this.listeners = {};
    this.parse(html);
  }
  parse(s, owner) {
    for (const m of s.matchAll(/<([a-zA-Z][\w-]*)([^>]*?)>/g)) {
      let attrs = {};
      for (const a of m[2].matchAll(/([\w-]+)(?:="([^"]*)")?/g)) attrs[a[1]] = a[2] ?? '';
      if (attrs.id || Object.keys(attrs).some((a) => a.startsWith('data-'))) {
        const el = new Element(this, attrs, m[1]);
        if (m[1].toLowerCase() === 'select') {
          const opt = s.slice(m.index).match(/<option(?: value="([^"]*)")?[^>]*>([^<]*)<\/option>/);
          if (opt) el.value = opt[1] ?? opt[2];
        }
        el.owner = owner;
        this.nodes.push(el);
      }
    }
  }
  removeOwned(owner) {
    const remove = new Set(this.nodes.filter((n) => n.owner === owner));
    let changed = true;
    while (changed) {
      changed = false;
      for (const n of this.nodes)
        if (remove.has(n.owner) && !remove.has(n)) {
          remove.add(n);
          changed = true;
        }
    }
    this.nodes = this.nodes.filter((n) => !remove.has(n));
  }
  getElementById(id) {
    return this.nodes.findLast((n) => n.id === id) || null;
  }
  querySelectorAll(q) {
    let m = q.match(/^\[([^\]]+)\]$/);
    return m ? this.nodes.filter((n) => Object.hasOwn(n.attrs, m[1])) : [];
  }
  addEventListener(t, fn) {
    this.listeners[t] = fn;
  }
  createElement(tag) {
    return new Element(this, {}, tag);
  }
}
function harness(
  initialSaved = null,
  {
    deferWorker = false,
    darkPreference = false,
    weatherFetch = undefined,
    wideScreen = false,
  } = {},
) {
  const pending = [],
    intervals = [];
  const document = new Document(),
    storage = new Map(initialSaved ? [['iotquest-v1', JSON.stringify(initialSaved)]] : []);
  globalThis.document = document;
  class Worker {
    constructor() {
      this.rt = null;
      this.terminated = false;
    }
    postMessage(message) {
      const data = structuredClone(message);
      const deliver = () => {
        if (this.terminated) return;
        try {
          if (data.type === 'start' || data.type === 'debugStart')
            this.rt = new Runtime(data.code, data.language, data.devices, data.board);
          // Mirrors sim-worker.js: dashboard messages and broker changes send no state back.
          if (data.type === 'publish') {
            this.rt.broker.connect(data.client || 'dashboard');
            this.rt.broker.publish(data.client || 'dashboard', data.topic, data.payload);
            return;
          }
          if (data.type === 'broker') return this.rt.broker.setAvailable(data.online);
          const result =
            data.type === 'debugStep' || data.type === 'debugStart'
              ? this.rt.debugStep(data.env, data.ms || 200)
              : data.lab
                ? simulateBatch(this.rt, {
                    ...data,
                    count: data.type === 'start' ? 1 : data.count || 1,
                  })
                : this.rt.step(data.env, data.ms);
          this.onmessage?.({ data: { type: 'state', ...result } });
        } catch (e) {
          this.onmessage?.({
            data: {
              type: 'error',
              message: e.message,
              line: e.line || this.rt?.currentLine || null,
            },
          });
        }
      };
      if (deferWorker) pending.push(deliver);
      else deliver();
    }
    terminate() {
      this.terminated = true;
    }
  }
  const themeListeners = [],
    themeMedia = {
      matches: darkPreference,
      addEventListener: (type, listener) => themeListeners.push(listener),
    };
  const ctx = vm.createContext({
    document,
    fetch: weatherFetch,
    window: { addEventListener() {} },
    navigator: {},
    matchMedia: (query) => (query.includes('color-scheme') ? themeMedia : { matches: wideScreen }),
    localStorage: { getItem: (k) => storage.get(k), setItem: (k, v) => storage.set(k, v) },
    components,
    createConversation,
    selectedRequest,
    chooseRequest,
    sendConversationMessage,
    conversationQuestions,
    nearestCharacter,
    toWorld,
    fromWorld,
    residentsForSections,
    createGreetingTracker,
    localSkyDate,
    DEFAULT_OBSERVER,
    missions,
    baseEnv,
    defaults,
    validate,
    program,
    Runtime,
    Worker,
    locations,
    locationById,
    adaptMissions,
    progressForLocation,
    WeatherService,
    advanceEnvironment,
    weatherHTML,
    createLabState,
    simulateBatch,
    residentRoutine,
    updateResources,
    faultCases,
    scenarios,
    renderLabPanel,
    updateCircuit,
    updateResourcesPanel,
    scenarioOptions,
    projectFiles,
    zipFiles,
    isLocationUnlocked,
    completedQuestCount,
    advancedMenu,
    esc,
    setHTML,
    sanitizeSaved,
    highlight,
    formatSource,
    SerialPlotter,
    diagnose,
    createBugHunt,
    scoreBugHunt,
    explainCode,
    removeExplanations,
    hasExplanations,
    readProject,
    ImportError,
    IMPORT_LIMITS,
    PROJECT_FORMAT,
    findThresholds,
    PLOT_LIMIT,
    FormatError,
    INDENT,
    coachSteps,
    readingText,
    buildProgressReport,
    progressFileName,
    understandingQuestions,
    answerQuestion,
    understandingScore,
    ADC_SIGNALS,
    ADC_SCALE,
    missionBudget,
    checkPredictions,
    conversationHTML,
    predictionHTML,
    declutterLabels,
    simulateDay,
    dayLogQuestions,
    dayLogCSV,
    dayLogHTML,
    securityCases,
    dashboardQuests,
    dashboardHTML,
    dashboardLiveHTML,
    parseQuestFile,
    loadCustomQuests,
    customChallenge,
    QuestError,
    QUEST_LIMITS,
    BoardLink,
    readingsToEnv,
    outputLine,
    boardProgram,
    boardPanelHTML,
    structuredClone,
    Blob,
    URL,
    Event: class {
      constructor(type) {
        this.type = type;
      }
    },
    setTimeout: () => 1,
    clearTimeout() {},
    setInterval: (fn, ms) => {
      intervals.push({ fn, ms });
      return intervals.length;
    },
    clearInterval() {},
    requestAnimationFrame() {},
    console,
  });
  vm.runInContext(
    source.replace(/^import [^;]*;\n/gm, '') +
      '\nglobalThis.api={state,project,mission,selectMission,installDialog,switchTab,testSolution,run,stop,tick,changeBoard,move,code,loadExample,renderCode,renderMission,getOutputs:()=>outputs,getTests:()=>testResults,getPassed:()=>currentPassed,getRunning:()=>running,labState,startFault,exitFault,setClockSpeed,setDifficulty,pauseExecution,stepExecution,resumeExecution,enterLocation,resumeLegacy,returnToGlobe,applyLocalWeather,setWeatherMode,advanceWorld,refreshWeather,missionKey,getPlotSamples:()=>plotSamples,previewImport,exportManifest,startBugHunt,getActiveFault:()=>activeFault,setLayout,renderCoach,downloadProgress,labContext,exportProject,interact,enterArea,getConversation:()=>activeConversation,getTab:()=>tab,declutterLabels,startFault,importTeacherQuest,questList,boardLink};',
    ctx,
  );
  return {
    api: ctx.api,
    document,
    storage,
    flushWorker: () => pending.shift()?.(),
    advanceTimer: () => intervals.find((i) => i.ms === 200).fn(),
    changeSystemTheme: (dark) => {
      themeMedia.matches = dark;
      themeListeners.forEach((fn) => fn());
    },
  };
}
function installAndWire(h, index) {
  h.api.selectMission(index);
  h.api.switchTab('inventory');
  for (const id of missions[index].ids) {
    h.api.installDialog(id);
    h.document.getElementById('confirmInstall').click();
  }
  h.api.switchTab('wiring');
  h.document.getElementById('connectAll').click();
}
test('all referenced local assets exist and module scripts parse', async () => {
  for (const path of [
    'game.css',
    'game.js',
    'world.png',
    'sim-worker.js',
    'runtime.js',
    'missions.js',
    'favicon.svg',
    'world3d.js',
    'world-model.js',
    'world-math.js',
  ])
    await access('public/' + path);
  for (const path of [
    'game.js',
    'sim-worker.js',
    'runtime.js',
    'missions.js',
    'world3d.js',
    'world-model.js',
    'world-math.js',
  ])
    execFileSync(process.execPath, ['--check', 'public/' + path]);
  assert.ok(html.includes('aria-label="Student') === false);
  assert.match(source, /aria-label=\\?"Student program code/);
});
test('game initializes, shows first quest, and saves locally', () => {
  const h = harness();
  assert.equal(h.document.getElementById('missionTitle').textContent, 'Light the Path');
  assert.equal(h.api.project().devices.length, 0);
  assert.ok(h.storage.has('iotquest-v1'));
  assert.match(h.document.getElementById('highlight').innerHTML, /Write your program below/);
});
test('install → wire → example → test completes first mission and awards XP once', () => {
  const h = harness();
  installAndWire(h, 0);
  assert.equal(h.api.project().devices.length, 2);
  assert.deepEqual(validate(h.api.project().devices, 'ESP32'), []);
  h.api.switchTab('code');
  h.api.loadExample();
  h.api.testSolution();
  assert.equal(h.api.getPassed(), true);
  assert.equal(h.api.state.xp, 100);
  assert.equal(h.api.state.completed[0].badge, 'Night owl');
  h.api.testSolution();
  assert.equal(h.api.state.xp, 100);
});
test('incorrect starter fails tests and receives no rewards', () => {
  const h = harness();
  installAndWire(h, 0);
  h.api.testSolution();
  assert.equal(h.api.getPassed(), false);
  assert.equal(h.api.state.xp, 0);
  assert.ok(h.api.getTests().some((t) => !t.pass));
});
test('language switch preserves installed components and wiring', () => {
  const h = harness();
  installAndWire(h, 0);
  const before = JSON.stringify(h.api.project().devices);
  h.api.switchTab('code');
  const el = h.document.getElementById('languageSelect');
  el.value = 'python';
  el.onchange();
  assert.equal(h.api.state.language, 'python');
  assert.equal(JSON.stringify(h.api.project().devices), before);
  assert.match(h.api.code(), /^# Light the Path/);
  h.api.loadExample();
  h.api.testSolution();
  assert.equal(h.api.getPassed(), true);
});
test('running student code controls outputs and conditions change them', () => {
  const h = harness();
  installAndWire(h, 0);
  h.api.switchTab('code');
  h.api.loadExample();
  h.api.run();
  assert.equal(h.api.getOutputs()[26], 0);
  h.api.state.env.light = 10;
  h.api.tick();
  assert.equal(h.api.getOutputs()[26], 1);
  h.api.state.env.light = 90;
  h.api.tick();
  assert.equal(h.api.getOutputs()[26], 0);
  h.api.stop();
  assert.equal(h.api.getRunning(), false);
  assert.equal(Object.keys(h.api.getOutputs()).length, 0);
});
test('motion mission passes both arrival and departure in UI workflow', () => {
  const h = harness();
  installAndWire(h, 1);
  h.api.loadExample();
  h.api.testSolution();
  assert.equal(h.api.getPassed(), true);
  assert.equal(h.api.state.xp, 120);
});
test('watering UI tests include dynamic target stop and dry tank protection', () => {
  const h = harness();
  installAndWire(h, 2);
  h.api.loadExample();
  h.api.testSolution();
  assert.equal(h.api.getPassed(), true);
  assert.ok(h.api.getTests().some((r) => r.name.includes('target and stops')));
  h.api.run();
  h.api.tick();
  assert.ok(h.api.state.env.soil > 32);
  assert.ok(h.api.state.env.tank < 80);
});
test('code edits invalidate the current pass and stop running outputs', () => {
  const h = harness();
  installAndWire(h, 0);
  h.api.loadExample();
  h.api.testSolution();
  assert.equal(h.api.getPassed(), true);
  h.api.switchTab('code');
  h.api.run();
  const el = h.document.getElementById('codeInput');
  el.value = h.api.code().replace('light < 1800', 'true');
  el.dispatchEvent({ type: 'input' });
  assert.equal(h.api.getPassed(), false);
  assert.equal(h.api.getRunning(), false);
  h.api.testSolution();
  assert.equal(h.api.getPassed(), false);
});
test('missing connections prevent execution', () => {
  const h = harness();
  h.api.installDialog('ldr');
  h.document.getElementById('confirmInstall').click();
  h.api.run();
  assert.equal(h.api.getRunning(), false);
  assert.equal(Object.keys(h.api.getOutputs()).length, 0);
});
test('Pico remaps signals and solution works after controller change', () => {
  const h = harness();
  installAndWire(h, 0);
  h.api.changeBoard('Raspberry Pi Pico');
  assert.deepEqual(
    Array.from(h.api.project().devices, (d) => d.pin),
    [26, 15],
  );
  h.api.loadExample();
  h.api.testSolution();
  assert.equal(h.api.getPassed(), true);
});
test('movement changes technician coordinates and stays inside world bounds', () => {
  const h = harness();
  h.api.resumeLegacy();
  const x = h.api.state.player.x;
  h.api.move('right');
  assert.ok(h.api.state.player.x > x);
  for (let i = 0; i < 200; i++) h.api.move('left');
  assert.equal(h.api.state.player.x, 8);
});

test('mission installation puts the moisture probe in plant beds and tank sensor at the tank', () => {
  const h = harness();
  installAndWire(h, 2);
  assert.equal(h.api.project().devices.find((d) => d.id === 'soil').area, 'Plant beds');
  assert.equal(h.api.project().devices.find((d) => d.id === 'level').area, 'Water tank');
});
test('deployment Worker routes home and retains asset paths', async () => {
  const { default: worker } = await import('../scripts/asset-worker.mjs');
  const calls = [],
    env = {
      ASSETS: {
        fetch: async (req) => {
          calls.push(req.url);
          return new Response('OK');
        },
      },
    };
  assert.equal((await worker.fetch(new Request('https://quest.example/'), env)).status, 200);
  await worker.fetch(new Request('https://quest.example/sim-worker.js'), env);
  assert.deepEqual(calls, ['https://quest.example/', 'https://quest.example/sim-worker.js']);
});
test('global travel starts on the atlas and preserves legacy code, wiring, XP and badges', async () => {
  const old = {
    mission: 2,
    board: 'ESP32',
    xp: 100,
    name: 'Ari',
    color: '#123456',
    projects: {
      0: { devices: defaults(['ldr', 'led'], 'ESP32'), code: { cpp: 'old saved code' } },
    },
    completed: { 0: { badge: 'Night owl', xp: 100 } },
    env: { ...baseEnv, soil: 42 },
  };
  const h = harness(old);
  assert.equal(h.api.state.travelScreen, true);
  await h.api.enterLocation('kyoto', fallbackWeather(locations[0]));
  assert.equal(h.api.state.activeLocation, 'kyoto');
  assert.equal(h.document.getElementById('regionHeading').textContent, locations[0].title);
  assert.equal(h.api.state.projects[0].code.cpp, 'old saved code');
  assert.equal(h.api.state.xp, 100);
  assert.equal(h.api.state.name, 'Ari');
  assert.equal(h.api.state.completed[0].badge, 'Night owl');
  h.api.resumeLegacy();
  assert.equal(h.api.state.mission, 2);
  assert.equal(h.api.state.env.soil, 42);
  assert.equal(h.api.state.projects[0].devices.length, 2);
});
test('travel isolates regional projects and returns to the globe', async () => {
  const h = harness();
  await h.api.enterLocation('kyoto', fallbackWeather(locations[0]));
  h.api.project().code.cpp = 'kyoto code';
  await h.api.enterLocation('marrakech', fallbackWeather(locations[1]));
  assert.notEqual(h.api.project().code.cpp, 'kyoto code');
  h.api.project().code.cpp = 'riad code';
  await h.api.enterLocation('kyoto', fallbackWeather(locations[0]));
  assert.equal(h.api.code(), 'kyoto code');
  h.api.returnToGlobe();
  assert.equal(h.api.state.travelScreen, true);
  assert.equal(h.document.getElementById('travelScreen').hidden, false);
  assert.equal(h.document.getElementById('adventureScreen').hidden, true);
});
test('live weather changes simulated readings gradually without turning on student actuators', async () => {
  const h = harness(),
    l = locations[0];
  const w = {
    ...fallbackWeather(l),
    status: 'live',
    temperature: 39,
    isDay: false,
    precipitation: 6,
    cloud: 95,
  };
  await h.api.enterLocation(l.id, w);
  h.api.setWeatherMode('live');
  const before = { ...h.api.state.env };
  for (let i = 0; i < 40; i++) h.api.advanceWorld();
  assert.ok(h.api.state.env.temp > before.temp);
  assert.ok(h.api.state.env.rain > before.rain);
  assert.ok(h.api.state.env.soil > before.soil);
  assert.ok(h.api.state.env.light < before.light);
  assert.equal(Object.keys(h.api.getOutputs()).length, 0);
});
test('Landscape camera zoom-out works without leaving the panoramic view', () => {
  const h = harness();
  const button = h.document
    .querySelectorAll('[data-view]')
    .find((b) => b.dataset.view === 'landscape');
  button.click();
  h.document.getElementById('zoomOut').click();
  assert.ok(button.classList.contains('selected'));
  assert.equal(h.document.getElementById('returnBtn').hidden, false);
  // The transformed fallback view also exposes the zoom factor to the UI test.
  assert.match(h.document.getElementById('mapLayer').style.transform, /scale\(0\.75\)/);
});
test('sky controls save the simulated date and sky exploration does not move the technician', () => {
  const h = harness();
  h.api.state.travelScreen = false;
  const before = { ...h.api.state.player };
  h.document.getElementById('openSky').click();
  h.api.move('up');
  assert.deepEqual({ ...h.api.state.player }, before);
  const mode = h.document.getElementById('skyModeSelect'),
    date = h.document.getElementById('skyDateInput');
  mode.value = 'simulated';
  mode.onchange();
  assert.equal(date.disabled, false);
  date.value = '2024-09-18';
  date.checkValidity = () => true;
  date.onchange();
  assert.equal(JSON.parse(h.storage.get('iotquest-v1')).skyDate, '2024-09-18');
  mode.value = 'live';
  mode.onchange();
  assert.equal(date.disabled, true);
  assert.equal(h.api.state.skyMode, 'live');
});
test('weather quests show a live weather action, calibrated sensors and practice controls', async () => {
  const h = harness();
  await h.api.enterLocation('kyoto', fallbackWeather(locations[0]));
  h.api.setWeatherMode('practice');
  h.api.selectMission(8);
  assert.equal(h.document.getElementById('weatherQuestNote').hidden, false);
  assert.equal(h.document.getElementById('useLiveQuestWeather').hidden, false);
  assert.match(h.document.getElementById('missionTitle').textContent, /Storm Watch/);
  assert.match(h.document.getElementById('envControls').innerHTML, /data-env="wind"/);
  h.document.getElementById('useLiveQuestWeather').click();
  assert.equal(h.api.state.weatherMode, 'live');
  assert.equal(h.document.getElementById('useLiveQuestWeather').hidden, true);
  assert.match(
    h.document.getElementById('weatherQuestDescription').textContent,
    /fixed weather scenarios/,
  );
  h.api.selectMission(0);
  assert.equal(h.document.getElementById('weatherQuestNote').hidden, true);
});
test('a live weather quest asks for a prediction and checks it against the running program', async () => {
  const h = harness();
  await h.api.enterLocation('kyoto', fallbackWeather(locations[0]));
  h.api.selectMission(8);
  installAndWire(h, 8);
  h.api.setWeatherMode('live');
  const panel = h.document.getElementById('predictCheck');
  assert.equal(panel.hidden, false);
  assert.match(panel.innerHTML, /Predict, then check/);
  const check = () => h.document.getElementById('checkPrediction');
  assert.match(panel.innerHTML, /id="checkPrediction" disabled/);
  for (const b of h.document.querySelectorAll('[data-predict-on]'))
    if (b.dataset.predictOn === 'false') b.click();
  assert.doesNotMatch(panel.innerHTML, /id="checkPrediction" disabled/);
  h.api.switchTab('code');
  h.api.loadExample();
  h.api.run();
  h.api.tick();
  check().click();
  assert.match(panel.innerHTML, /you predicted off, your program turned it (on|off)/);
  h.api.setWeatherMode('practice');
  assert.equal(panel.hidden, true);
});
test('the day log runs the program through a day, offers a CSV and questions from the data', () => {
  const h = harness();
  installAndWire(h, 0);
  h.api.switchTab('code');
  h.api.loadExample();
  h.api.switchTab('daylog');
  const bench = h.document.getElementById('benchContent');
  assert.match(bench.innerHTML, /Run a simulated day/);
  h.document.getElementById('runDay').click();
  assert.match(bench.innerHTML, /<table class="day-log-table">/);
  assert.equal((bench.innerHTML.match(/<tr( class="on")?><th scope="row">/g) || []).length, 24);
  assert.match(bench.innerHTML, /Read the data/);
  const choice = h.document.querySelectorAll('[data-day-q]').find((b) => b.dataset.dayQ === '0');
  choice.click();
  assert.match(bench.innerHTML, /day-log-feedback/);
  assert.ok(h.document.getElementById('downloadDayLog'));
});
test('the day log explains why it cannot run before the circuit is ready', () => {
  const h = harness();
  h.api.switchTab('daylog');
  h.document.getElementById('runDay').click();
  assert.match(h.document.getElementById('benchContent').innerHTML, /day-log-error/);
});
test('a security repair starts from the unsafe program and passes once it is fixed', () => {
  const h = harness();
  h.api.startFault('spoof');
  assert.match(h.api.code(), /command != 0/);
  h.api.testSolution();
  assert.equal(h.api.getPassed(), false);
  assert.ok(h.api.getTests().some((t) => t.name === 'A stranger sends 1' && !t.pass));
  h.api.loadExample();
  h.api.testSolution();
  assert.equal(h.api.getPassed(), true);
  assert.ok(h.api.state.completed['fault:spoof']);
});
test('the dashboard shows the running program’s messages and its switch controls the fan', () => {
  const h = harness();
  h.api.startFault('remote-fan');
  assert.equal(h.api.getTab(), 'dashboard');
  const bench = () => h.document.getElementById('benchContent').innerHTML;
  assert.match(bench(), /Run your program/);
  h.api.loadExample();
  h.api.run();
  h.api.tick();
  h.api.switchTab('dashboard');
  const fanSwitch = h.document
    .querySelectorAll('[data-publish-topic]')
    .find((b) => b.dataset.publishTopic === 'home/fan/set');
  fanSwitch.click();
  h.api.tick();
  h.api.tick();
  const fan = h.api.project().devices.find((d) => d.id === 'fan');
  assert.ok(h.api.getOutputs()[fan.pin] > 0);
  assert.match(h.document.getElementById('dashLive').innerHTML, /home\/fan\/state/);
  h.api.testSolution();
  assert.equal(h.api.getPassed(), true);
});
test('a student imports a teacher quest, writes it with the Guide and passes its tests', async () => {
  const h = harness();
  const { buildCustomQuest, questFile } = await import('../public/custom-quests.js');
  const quest = buildCustomQuest({
    title: 'Frost guard',
    sensor: 'temp',
    output: 'buzzer',
    operator: '<=',
    threshold: 2,
  });
  h.api.importTeacherQuest(questFile(quest));
  h.api.importTeacherQuest(questFile(quest));
  assert.equal(h.api.state.customQuests.length, 1, 'importing twice keeps one copy');
  h.api.importTeacherQuest('not a quest');
  assert.equal(h.api.state.customQuests.length, 1);
  h.api.questList();
  h.document
    .querySelectorAll('[data-teacher-quest]')
    .find((b) => b.dataset.teacherQuest === quest.id)
    .click();
  assert.equal(h.api.mission().title, 'Frost guard');
  assert.equal(h.document.getElementById('coach').hidden, false, 'the Guide helps');
  assert.equal(h.api.project().devices.length, 0, 'students install the components themselves');
  h.api.switchTab('inventory');
  for (const id of quest.ids) {
    h.api.installDialog(id);
    h.document.getElementById('confirmInstall').click();
  }
  h.api.switchTab('wiring');
  h.document.getElementById('connectAll').click();
  h.api.loadExample();
  h.api.testSolution();
  assert.equal(h.api.getPassed(), true);
  assert.ok(h.api.state.completed['fault:' + quest.id]);
});
test('a real board’s readings replace the simulated sensor while the program runs', () => {
  const h = harness();
  installAndWire(h, 0);
  h.api.switchTab('code');
  h.api.loadExample();
  h.api.run();
  h.api.boardLink.onReadings({ light: 100 });
  for (let i = 0; i < 3; i++) h.api.tick();
  assert.ok(Math.abs(h.api.state.env.light - 100 / 40.95) < 1e-9, 'the board’s dark reading holds');
  const lamp = h.api.project().devices.find((d) => d.output);
  assert.ok(h.api.getOutputs()[lamp.pin] > 0, 'the program sees darkness and lights the path');
  h.api.switchTab('circuit');
  assert.ok(h.document.getElementById('boardPanel'));
});
test('regional rain-aware watering keeps installation, wiring, student code and deterministic tests', async () => {
  const h = harness();
  await h.api.enterLocation('kyoto', fallbackWeather(locations[0]));
  h.api.setDifficulty('advanced');
  h.api.selectMission(2);
  h.api.switchTab('inventory');
  for (const id of h.api.mission().ids) {
    h.api.installDialog(id);
    h.document.getElementById('confirmInstall').click();
  }
  h.api.switchTab('wiring');
  h.document.getElementById('connectAll').click();
  h.api.switchTab('code');
  h.api.loadExample();
  h.api.testSolution();
  assert.equal(h.api.getPassed(), true);
  assert.equal(h.api.state.weatherMode, 'practice');
  assert.ok(h.api.getTests().some((t) => t.name.includes('Rain at')));
  assert.equal(h.api.state.locationProgress.kyoto.completed['advanced:2'].badge, 'Green thumb');
  assert.equal(h.api.state.completed[2], undefined);
});
test('fault projects preserve normal code, fail while broken, and pass after a real repair', () => {
  const h = harness();
  h.api.resumeLegacy();
  h.api.project().code.cpp = 'saved normal project';
  h.api.startFault('ground');
  h.api.testSolution();
  assert.equal(h.api.getPassed(), false);
  assert.equal(h.api.state.xp, 0);
  h.api.switchTab('wiring');
  h.document.getElementById('connectAll').click();
  h.api.testSolution();
  assert.equal(h.api.getPassed(), true);
  assert.ok(h.api.getTests().some((r) => r.name.includes('budget')));
  h.api.exitFault();
  assert.equal(h.api.code(), 'saved normal project');
});
test('faulty sensor workshop cannot pass until its simulated reading is repaired', () => {
  const h = harness();
  h.api.resumeLegacy();
  h.api.startFault('sensor');
  h.api.testSolution();
  assert.equal(h.api.getPassed(), false);
  delete h.api.project().devices[0].faultValue;
  h.api.testSolution();
  assert.equal(h.api.getPassed(), true);
});
test('main UI clock runs fixed controller substeps at accelerated speed and freezes on pause', () => {
  const h = harness();
  installAndWire(h, 0);
  h.api.loadExample();
  h.api.run();
  const before = h.api.labState().elapsedMs;
  h.api.setClockSpeed(360);
  h.api.tick();
  assert.equal(h.api.labState().elapsedMs - before, 72000);
  const paused = h.api.labState().elapsedMs;
  h.api.setClockSpeed(0);
  h.api.tick();
  h.api.advanceWorld();
  assert.equal(h.api.labState().elapsedMs, paused);
});
test('live circuit can be opened during execution and reports the real lamp output', () => {
  const h = harness();
  installAndWire(h, 0);
  h.api.loadExample();
  h.api.state.env.light = 0;
  h.api.run();
  h.api.switchTab('circuit');
  assert.match(h.document.getElementById('circuitRows').innerHTML, /HIGH/);
  assert.match(h.document.getElementById('circuitRows').innerHTML, /GPIO 26/);
});
test('local cooperative ownership prevents programming-role changes to wiring', () => {
  const h = harness();
  installAndWire(h, 0);
  h.api.labState().coopEnabled = true;
  h.api.labState().role = 'Programmer';
  h.api.switchTab('wiring');
  const before = JSON.stringify(h.api.project().devices);
  h.api.project().devices[0].power = false;
  const current = JSON.stringify(h.api.project().devices);
  h.document.getElementById('connectAll').click();
  assert.equal(JSON.stringify(h.api.project().devices), current);
  assert.notEqual(current, before);
});

test('Format stops the old program and invalidates its test evidence when source changes', () => {
  const h = harness();
  installAndWire(h, 0);
  h.api.loadExample();
  h.api.switchTab('code');
  const input = h.document.getElementById('codeInput');
  input.value = '   ' + h.api.code();
  input.dispatchEvent({ type: 'input' });
  h.api.testSolution();
  assert.equal(h.api.getPassed(), true);
  h.api.switchTab('code');
  h.api.run();
  h.document.getElementById('formatBtn').click();
  assert.equal(h.api.getRunning(), false);
  assert.equal(h.api.getPassed(), false);
  assert.equal(Object.keys(h.api.getOutputs()).length, 0);
  assert.equal(h.api.getTests().length, 0);
  const restored = harness(JSON.parse(h.storage.get('iotquest-v1')));
  assert.equal(restored.api.code(), h.api.code());
});
test('runtime errors with source lines are visibly identified in the editor', () => {
  const h = harness();
  installAndWire(h, 0);
  h.api.switchTab('code');
  const input = h.document.getElementById('codeInput');
  input.value = 'void setup() {}\nvoid loop() {\n  int x = unknown;\n}';
  input.dispatchEvent({ type: 'input' });
  h.document.getElementById('runBtn').click();
  assert.equal(h.api.getRunning(), false);
  assert.match(h.document.getElementById('serialText').textContent, /Error at line 3/);
  assert.equal(h.document.getElementById('serialText').classList.contains('error'), true);
  assert.match(h.document.getElementById('editorStatus').textContent, /error/i);
});
test('editor typing, indentation, reset and language switching retain the intended project', () => {
  const h = harness();
  installAndWire(h, 0);
  h.api.switchTab('code');
  let input = h.document.getElementById('codeInput');
  input.value = 'void loop() {';
  input.selectionStart = input.selectionEnd = input.value.length;
  input.dispatchEvent({ type: 'keydown', key: 'Enter', preventDefault() {} });
  assert.equal(input.value, 'void loop() {\n  ');
  input.dispatchEvent({ type: 'keydown', key: 'Tab', preventDefault() {} });
  assert.equal(input.value, 'void loop() {\n    ');
  const cpp = input.value,
    wiring = JSON.stringify(h.api.project().devices);
  let language = h.document.getElementById('languageSelect');
  language.value = 'python';
  language.onchange();
  h.api.loadExample();
  const python = h.api.code();
  language = h.document.getElementById('languageSelect');
  language.value = 'cpp';
  language.onchange();
  assert.equal(h.api.code(), cpp);
  language = h.document.getElementById('languageSelect');
  language.value = 'python';
  language.onchange();
  assert.equal(h.api.code(), python);
  h.document.getElementById('runBtn').click();
  assert.equal(h.api.getRunning(), true);
  h.document.getElementById('resetCode').click();
  assert.equal(h.api.getRunning(), false);
  assert.match(h.api.code(), /^# .*\n# Goal:/);
  assert.equal(JSON.stringify(h.api.project().devices), wiring);
});

for (const language of ['cpp', 'python'])
  test(`${language}: editor Run button advances automatically and Stop cancels queued execution`, () => {
    const h = harness(null, { deferWorker: true });
    installAndWire(h, 0);
    h.api.switchTab('code');
    const lang = h.document.getElementById('languageSelect');
    lang.value = language;
    lang.onchange();
    h.api.loadExample();
    h.api.state.env.light = 10;
    h.document.getElementById('runBtn').click();
    assert.equal(h.api.getRunning(), true);
    assert.equal(Object.keys(h.api.getOutputs()).length, 0);
    h.flushWorker();
    assert.equal(h.api.getOutputs()[26], 1);
    h.api.state.env.light = 90;
    h.advanceTimer();
    h.flushWorker();
    assert.equal(h.api.getOutputs()[26], 0);
    h.api.state.env.light = 10;
    h.advanceTimer();
    h.document.getElementById('stopBtn').click();
    h.flushWorker();
    assert.equal(h.api.getRunning(), false);
    assert.equal(Object.keys(h.api.getOutputs()).length, 0);
  });
test('conditions changed while a worker tick is pending are retained for the next execution', () => {
  const h = harness(null, { deferWorker: true });
  installAndWire(h, 0);
  h.api.loadExample();
  h.api.state.env.light = 10;
  h.api.run();
  const slider = h.document.getElementById('env-light');
  slider.value = '90';
  slider.dispatchEvent({ type: 'input' });
  h.flushWorker();
  assert.equal(h.api.state.env.light, 90);
  h.advanceTimer();
  h.flushWorker();
  assert.equal(h.api.getOutputs()[26], 0);
});

test('appearance toggle persists both themes without changing running code or wiring', () => {
  const h = harness();
  installAndWire(h, 0);
  h.api.loadExample();
  h.api.state.env.light = 10;
  h.api.run();
  const code = h.api.code(),
    wiring = JSON.stringify(h.api.project().devices),
    output = h.api.getOutputs()[26];
  h.document.getElementById('themeToggle').click();
  assert.equal(h.api.state.theme, 'dark');
  assert.equal(h.document.documentElement.dataset.theme, 'dark');
  assert.equal(h.document.documentElement.style.colorScheme, 'dark');
  assert.equal(
    h.document.getElementById('themeToggle').attrs['aria-label'],
    'Switch to light mode',
  );
  assert.equal(h.api.getRunning(), true);
  assert.equal(h.api.code(), code);
  assert.equal(JSON.stringify(h.api.project().devices), wiring);
  assert.equal(h.api.getOutputs()[26], output);
  const restored = harness(JSON.parse(h.storage.get('iotquest-v1')));
  assert.equal(restored.document.documentElement.dataset.theme, 'dark');
  restored.document.getElementById('themeToggle').click();
  assert.equal(restored.api.state.theme, 'light');
  assert.equal(restored.document.documentElement.dataset.theme, 'light');
  assert.equal(JSON.parse(restored.storage.get('iotquest-v1')).theme, 'light');
});
test('appearance settings follow system changes only when System default is selected', () => {
  const h = harness(null, { darkPreference: true });
  assert.equal(h.api.state.theme, 'system');
  assert.equal(h.document.documentElement.dataset.theme, 'dark');
  h.changeSystemTheme(false);
  assert.equal(h.document.documentElement.dataset.theme, 'light');
  h.document.getElementById('settingsBtn').click();
  const select = h.document.getElementById('themeSetting');
  assert.equal(select.value, 'system');
  select.value = 'dark';
  select.onchange();
  assert.equal(h.document.documentElement.dataset.theme, 'dark');
  h.changeSystemTheme(false);
  assert.equal(h.document.documentElement.dataset.theme, 'dark');
  select.value = 'system';
  select.onchange();
  assert.equal(h.document.documentElement.dataset.theme, 'light');
  h.changeSystemTheme(true);
  assert.equal(h.document.documentElement.dataset.theme, 'dark');
  assert.equal(select.value, 'system');
});
test('early appearance bootstrap respects saved preferences and tolerates unavailable storage', async () => {
  const bootstrap = await readFile('public/theme-init.js', 'utf8');
  for (const [saved, dark, expected] of [
    [{ theme: 'dark' }, false, 'dark'],
    [{ theme: 'light' }, true, 'light'],
    [{}, true, 'dark'],
    [{ theme: 'invalid' }, false, 'light'],
  ]) {
    const root = { dataset: {}, style: {} };
    vm.runInNewContext(bootstrap, {
      document: { documentElement: root },
      localStorage: { getItem: () => JSON.stringify(saved) },
      matchMedia: () => ({ matches: dark }),
    });
    assert.equal(root.dataset.theme, expected);
    assert.equal(root.style.colorScheme, expected);
  }
  const root = { dataset: {}, style: {} };
  vm.runInNewContext(bootstrap, {
    document: { documentElement: root },
    localStorage: {
      getItem() {
        throw Error('Storage blocked');
      },
    },
    matchMedia: () => ({ matches: true }),
  });
  assert.equal(root.dataset.theme, 'dark');
});

test('weather Retry restores live readings without stopping running student code', async () => {
  let calls = 0;
  const live = {
    timezone: 'Asia/Tokyo',
    current: {
      temperature_2m: 30,
      relative_humidity_2m: 65,
      precipitation: 2,
      weather_code: 61,
      cloud_cover: 60,
      wind_speed_10m: 12,
      wind_direction_10m: 180,
      is_day: 1,
      time: 1700000000,
    },
  };
  const h = harness(null, {
    weatherFetch: async () => {
      calls++;
      return { ok: true, json: async () => live };
    },
  });
  await h.api.enterLocation('kyoto', fallbackWeather(locations[0]));
  assert.equal(h.api.state.weatherByLocation.kyoto.status, 'live');
  assert.match(h.document.getElementById('regionalWeatherDetails').innerHTML, /Open-Meteo/);
  h.api.selectMission(0);
  for (const id of h.api.mission().ids) {
    h.api.installDialog(id);
    h.document.getElementById('confirmInstall').click();
  }
  h.api.switchTab('wiring');
  h.document.getElementById('connectAll').click();
  h.api.loadExample();
  h.api.run();
  const code = h.api.code();
  await h.document.getElementById('weatherRetry').click();
  assert.equal(calls, 2);
  assert.equal(h.api.getRunning(), true);
  assert.equal(h.api.code(), code);
  assert.equal(h.document.getElementById('weatherRetry').disabled, false);
  h.api.setWeatherMode('practice');
  assert.equal(h.document.getElementById('weatherRetry').hidden, true);
});

test('lab edits made through a held reference survive simulation ticks and are saved', () => {
  const h = harness();
  h.api.state.travelScreen = false;
  const lab = h.api.labState();
  lab.coopEnabled = true;
  lab.upgrades.push('solar');
  const before = lab.elapsedMs;
  for (let i = 0; i < 3; i++) h.advanceTimer();
  assert.equal(h.api.labState(), lab);
  assert.ok(lab.elapsedMs > before);
  h.api.setClockSpeed(1);
  const saved = JSON.parse(h.storage.get('iotquest-v1'));
  assert.equal(saved.projects[0].lab.coopEnabled, true);
  assert.deepEqual(saved.projects[0].lab.upgrades, ['solar']);
});
test('typing coalesces edit evidence and never evicts test evidence', () => {
  const h = harness();
  installAndWire(h, 0);
  h.api.loadExample();
  h.api.testSolution();
  h.api.switchTab('code');
  const input = h.document.getElementById('codeInput');
  for (let i = 0; i < 80; i++) {
    input.value += ' ';
    input.dispatchEvent({ type: 'input' });
  }
  const evidence = h.api.labState().evidence;
  assert.ok(evidence.some((e) => e.type === 'test'));
  assert.ok(evidence.filter((e) => e.type === 'edit').length <= 3);
  assert.ok(evidence.at(-1).count >= 80);
});
test('syntax highlighting escapes after tokenising so quotes and hashes stay intact', () => {
  const h = harness();
  const cpp = highlight("char c = 'x'; // note <b>", 'cpp');
  assert.match(cpp, /<span class="syn-string">&#39;x&#39;<\/span>/);
  assert.match(cpp, /<span class="syn-comment">\/\/ note &lt;b&gt;<\/span>/);
  assert.doesNotMatch(cpp, /syn-comment">#39/);
  const py = highlight('s = "a # b"  # real\nx = 7 // 2', 'python');
  assert.match(py, /<span class="syn-string">&quot;a # b&quot;<\/span>/);
  assert.match(py, /<span class="syn-comment"># real<\/span>/);
  assert.doesNotMatch(py, /syn-comment">\/\//);
});
test('malformed saved progress falls back to defaults instead of breaking startup', () => {
  const h = harness({
    player: null,
    name: 5,
    color: 'red;background:url(x)',
    mission: 99,
    completed: [],
    projects: { 0: { devices: 'bad', lab: { evidence: 'bad' } } },
    locationProgress: { kyoto: { completed: null }, broken: 7 },
  });
  assert.equal(h.api.state.name, 'Technician');
  assert.equal(h.api.state.mission, 0);
  assert.equal(h.api.project().devices.length, 0);
  assert.equal(h.api.labState().evidence.length, 0);
  assert.equal(h.api.state.locationProgress.broken, undefined);
  assert.equal(Object.keys(h.api.state.locationProgress.kyoto.projects).length, 0);
});
test('fault repairs do not count as quests and advanced completions use their own key', () => {
  const state = {
    completed: { 0: {}, 'fault:ground': {} },
    locationProgress: {
      kyoto: { completed: { 'advanced:1': { xp: 10 }, 'fault:pin': { xp: 40 } } },
    },
  };
  assert.equal(completedQuestCount(state), 2);
  assert.deepEqual(progressForLocation(state, 'kyoto'), {
    completed: 1,
    total: missions.length * 2,
    xp: 10,
  });
  const h = harness();
  assert.equal(h.api.missionKey(3), '3');
});
test('the interact shortcut is ignored while a dialog is open', () => {
  const h = harness();
  h.api.state.travelScreen = false;
  h.api.switchTab('code');
  h.document.getElementById('modal').showModal();
  h.document.listeners.keydown({ key: 'e', target: { tagName: 'BUTTON' }, preventDefault() {} });
  assert.ok(h.document.getElementById('codeInput'));
});
test('pressing E at a room installs devices even with its resident beside the landing point', () => {
  const h = harness();
  h.api.state.travelScreen = false;
  h.api.switchTab('code');
  h.api.enterArea('Bedroom');
  h.api.interact();
  assert.equal(h.api.getConversation(), null);
  assert.equal(h.api.getTab(), 'inventory');
  // Arriving next to the resident is already acknowledged, so the first step does not greet.
  h.api.move('left', 0.55);
  assert.equal(h.api.getConversation(), null);
});
test('T talks to the resident at an install point, where E installs instead', () => {
  const h = harness();
  h.api.state.travelScreen = false;
  h.api.enterArea('Bedroom');
  const key = (k) =>
    h.document.listeners.keydown({ key: k, target: { tagName: 'DIV' }, preventDefault() {} });
  key('t');
  assert.equal(h.api.getConversation()?.key, 'section:Bedroom');
});
test('resident name tags lift clear of room buttons, or hide, so rooms stay clickable', () => {
  const h = harness();
  const el = (kind) => ({
    offsetWidth: 80,
    offsetHeight: 20,
    classList: { contains: (c) => c === kind },
    style: {},
  });
  const room = { el: el('area-marker'), x: 100, y: 100, visible: true, priority: 0 },
    // Stands on the room button: moved clear of it, still visible.
    resident = { el: el('npc'), x: 100, y: 105, visible: true, priority: 3 },
    // Surrounded on every side by room buttons: hidden rather than covering them.
    boxedIn = { el: el('npc'), x: 400, y: 300, visible: true, priority: 3 },
    walls = [];
  for (let x = 160; x <= 640; x += 40)
    for (let y = 180; y <= 420; y += 12)
      walls.push({ el: el('area-marker'), x, y, visible: true, priority: 0 });
  h.api.declutterLabels([resident, room, boxedIn, ...walls]);
  assert.equal(room.el.style.visibility, 'visible');
  assert.equal(resident.el.style.visibility, 'visible');
  assert.notEqual(resident.el.style.top ?? '105px', '105px');
  assert.equal(boxedIn.el.style.visibility, 'hidden');
  assert.ok(walls.every((w) => w.el.style.visibility === 'visible'));
});
test('several device labels at one installation point fan out and all stay visible', () => {
  const h = harness();
  const el = () => ({
    offsetWidth: 90,
    offsetHeight: 20,
    classList: { contains: (c) => c === 'world-device-target' },
    style: {},
  });
  const devices = [1, 2, 3, 4, 5].map(() => ({
    el: el(),
    x: 300,
    y: 200,
    visible: true,
    priority: 4,
  }));
  h.api.declutterLabels(devices);
  assert.ok(devices.every((d) => d.el.style.visibility === 'visible'));
  const spots = devices.map(
    (d) => (d.el.style.left ?? '300px') + ',' + (d.el.style.top ?? '200px'),
  );
  assert.equal(new Set(spots).size, 5, 'no two labels share a spot');
});
test('Tab indents in the editor until Escape releases focus', () => {
  const h = harness();
  h.api.switchTab('code');
  const input = h.document.getElementById('codeInput');
  input.value = '';
  let prevented = false;
  input.dispatchEvent({ type: 'keydown', key: 'Tab', preventDefault: () => (prevented = true) });
  assert.equal(prevented, true);
  assert.equal(input.value, '  ');
  prevented = false;
  input.dispatchEvent({ type: 'keydown', key: 'Escape', preventDefault() {} });
  input.dispatchEvent({ type: 'keydown', key: 'Tab', preventDefault: () => (prevented = true) });
  assert.equal(prevented, false);
});
test('editor shortcuts format code, split braces and step back on a closing brace', () => {
  const h = harness();
  installAndWire(h, 0);
  h.api.switchTab('code');
  let input = h.document.getElementById('codeInput');
  input.value = 'void setup(){pinMode(2,OUTPUT);}\nvoid loop() {}';
  input.dispatchEvent({ type: 'input' });
  input.dispatchEvent({
    type: 'keydown',
    key: 'F',
    shiftKey: true,
    altKey: true,
    preventDefault() {},
  });
  assert.equal(h.api.code(), 'void setup() { pinMode(2, OUTPUT); }\nvoid loop() {}\n');
  input = h.document.getElementById('codeInput');
  input.value = 'void loop() {}';
  input.selectionStart = input.selectionEnd = input.value.indexOf('}');
  input.dispatchEvent({ type: 'keydown', key: 'Enter', preventDefault() {} });
  assert.equal(input.value, 'void loop() {\n  \n}');
  input.value = 'void loop() {\n  if (x) {\n    ';
  input.selectionStart = input.selectionEnd = input.value.length;
  input.dispatchEvent({ type: 'keydown', key: '}', preventDefault() {} });
  assert.equal(input.value, 'void loop() {\n  if (x) {\n  }');
});
test('a runtime error line is marked in the editor until the code changes', () => {
  const h = harness();
  installAndWire(h, 0);
  h.api.switchTab('code');
  const input = h.document.getElementById('codeInput');
  input.value = 'void setup() {}\nvoid loop() {\n  int x = unknown;\n}';
  input.dispatchEvent({ type: 'input' });
  h.document.getElementById('runBtn').click();
  const lines = h.document.getElementById('highlight').innerHTML.split('class="code-line');
  assert.match(lines[3], /^ error-line/);
  input.value += ' ';
  input.dispatchEvent({ type: 'input' });
  assert.doesNotMatch(h.document.getElementById('highlight').innerHTML, /error-line/);
});

test('running a program feeds the serial plotter, which Clear and a new run reset', () => {
  const h = harness();
  h.api.state.travelScreen = false;
  installAndWire(h, 0);
  h.api.loadExample();
  h.api.switchTab('code');
  h.api.run();
  for (let i = 0; i < 3; i++) h.advanceTimer();
  const samples = h.api.getPlotSamples();
  assert.ok(samples.length >= 3);
  const ldr = h.api.project().devices.find((d) => d.id === 'ldr');
  assert.ok(samples.every((s) => s.inputs[ldr.pin] !== undefined));
  assert.equal(h.document.getElementById('plotEmpty').hidden, true);
  h.document.getElementById('plotClear').click();
  assert.equal(h.api.getPlotSamples().length, 0);
  h.advanceTimer();
  h.api.run();
  assert.equal(h.api.getPlotSamples().length, 1);
});
test('code checks appear under the editor, jump to the code, and clear when fixed', () => {
  const h = harness();
  installAndWire(h, 0);
  h.api.switchTab('code');
  // A program that reads the sensor, so a mis-numbered pin matters.
  h.api.loadExample();
  const ldr = h.api.project().devices.find((d) => d.id === 'ldr');
  let input = h.document.getElementById('codeInput');
  const code = h.api.code().replace('lightPin = ' + ldr.pin, 'lightPin = 33');
  assert.notEqual(code, h.api.code());
  input.value = code;
  input.dispatchEvent({ type: 'input' });
  const summary = h.document.getElementById('diagSummary');
  assert.equal(summary.hidden, false);
  assert.match(summary.textContent, /1 warning/);
  assert.match(
    h.document.getElementById('diagList').innerHTML,
    /lightPin \(GPIO 33\) isn&#39;t connected/,
  );
  input.selectionStart = input.selectionEnd = 0;
  input.dispatchEvent({ type: 'keydown', key: 'F8', preventDefault() {} });
  assert.equal(input.value.slice(input.selectionStart, input.selectionEnd), 'lightPin');
  assert.equal(h.document.getElementById('diagMessage').hidden, false);
  assert.match(h.document.getElementById('diagMessage').textContent, /Light sensor \(GPIO 34\)/);
  assert.match(h.document.getElementById('highlight').innerHTML, /diag-warning">lightPin</);
  input.value = code.replace('lightPin = 33', 'lightPin = ' + ldr.pin);
  input.dispatchEvent({ type: 'input' });
  assert.equal(h.document.getElementById('diagSummary').hidden, true);
  assert.doesNotMatch(h.document.getElementById('highlight').innerHTML, /diag-/);
});
test('importing an exported project restores it without granting rewards and backs up existing work', async () => {
  const author = harness();
  installAndWire(author, 0);
  author.api.loadExample();
  author.api.testSolution();
  assert.equal(author.api.getPassed(), true);
  const manifest = author.api.exportManifest(),
    bytes = zipFiles(
      projectFiles({
        name: 'Ari',
        language: manifest.language,
        board: manifest.board,
        code: manifest.code[manifest.language],
        devices: manifest.devices,
        mission: author.api.mission(),
        results: manifest.results,
        lab: manifest.lab,
        location: 'Original home',
        manifest,
      }),
    );
  const reviewer = harness();
  installAndWire(reviewer, 0);
  reviewer.api.switchTab('code');
  const mine = reviewer.api.code() + '\n// mine';
  reviewer.api.project().code.cpp = mine;
  const plan = await reviewer.api.previewImport(bytes, 'ari.zip');
  assert.equal(plan.technician, 'Technician');
  const body = reviewer.document.getElementById('modalBody').innerHTML;
  assert.match(body, /Light the Path/);
  assert.match(body, /replaces your current work/);
  assert.match(body, /\d+ of \d+ passed/);
  reviewer.document.getElementById('confirmImport').click();
  assert.equal(reviewer.api.code(), manifest.code.cpp);
  assert.deepEqual(
    reviewer.api.project().devices.map((d) => [d.id, d.pin]),
    manifest.devices.map((d) => [d.id, d.pin]),
  );
  assert.equal(reviewer.api.state.xp, 0);
  assert.equal(Object.keys(reviewer.api.state.completed).length, 0);
  const backup = Object.entries(reviewer.api.state.projects).find(([k]) =>
    k.startsWith('0~backup-'),
  );
  assert.equal(backup[1].code.cpp, mine);
  const entry = reviewer.api.labState().evidence.at(-1);
  assert.equal(entry.type, 'import');
  assert.equal(entry.file, 'ari.zip');
  reviewer.api.testSolution();
  assert.equal(reviewer.api.getPassed(), true);
  assert.equal(reviewer.api.state.xp, 100);
  assert.equal(reviewer.api.state.completed[0].imported, true);
});
test('a rejected import explains why and leaves the project untouched', async () => {
  const h = harness();
  installAndWire(h, 0);
  const before = JSON.stringify(h.api.project());
  assert.equal(await h.api.previewImport(new TextEncoder().encode('nope'), 'x.zip'), null);
  assert.match(h.document.getElementById('modalBody').innerHTML, /not a ZIP/);
  assert.equal(JSON.stringify(h.api.project()), before);
});

test('pages load every asset by relative path so the site works under a sub-path', async () => {
  const { readdir } = await import('node:fs/promises');
  for (const file of (await readdir('public')).filter((f) => /\.(html|js|css)$/.test(f))) {
    const text = await readFile('public/' + file, 'utf8');
    assert.doesNotMatch(
      text,
      /(?:src|href)="\/(?!\/)|(?:fetch|Worker)\(\s*['"`]\/(?!\/)|url\(\s*['"]?\/(?!\/)/,
      file + ' uses a root-absolute path',
    );
  }
});
test('spot the bugs: flag lines, check, fix and pass the tests for XP once', () => {
  const h = harness();
  h.api.state.travelScreen = false;
  installAndWire(h, 0);
  h.api.switchTab('tests');
  // Finished code is shown only after the student has solved the quest themselves.
  h.document.getElementById('huntBtn').click();
  assert.equal(h.api.getActiveFault(), null);
  assert.equal(h.document.getElementById('debugBtn'), null);
  h.api.state.completed[0] = { xp: 0 };
  h.api.switchTab('tests');
  assert.ok(h.document.getElementById('debugBtn'));
  h.document.getElementById('huntBtn').click();
  const hunt = h.api.project().hunt;
  assert.equal(hunt.bugs.length, 3);
  assert.equal(h.document.getElementById('codeInput').readOnly, true);
  assert.equal(h.document.getElementById('huntBanner').hidden, false);
  assert.equal(h.document.getElementById('diagSummary').hidden, true);
  const input = h.document.getElementById('codeInput'),
    caretAt = (line) =>
      input.value
        .split('\n')
        .slice(0, line - 1)
        .join('\n').length + 1;
  for (const line of [hunt.bugs[0].line, hunt.bugs[1].line, 1]) {
    input.selectionStart = input.selectionEnd = caretAt(line);
    h.document.getElementById('flagLine').click();
  }
  assert.match(h.document.getElementById('highlight').innerHTML, /hunt-flag/);
  h.document.getElementById('checkHunt').click();
  assert.deepEqual(hunt.score, { found: 2, total: 3, wrong: [1], perfect: false });
  assert.match(h.document.getElementById('huntBanner').innerHTML, /Found 2 of 3/);
  assert.match(h.document.getElementById('highlight').innerHTML, /hunt-missed/);
  assert.equal(h.api.labState().evidence.at(-1).type, 'bughunt');
  h.api.testSolution();
  assert.equal(h.api.getPassed(), false);
  const m = h.api.getActiveFault().mission;
  h.api.project().code.cpp = program(m, 'cpp', h.api.project().devices, true);
  h.api.testSolution();
  assert.equal(h.api.getPassed(), true);
  assert.equal(h.api.state.xp, 40);
  // Only the quest solved beforehand counts; a hunt is not a quest.
  assert.equal(completedQuestCount(h.api.state), 1);
  h.api.testSolution();
  assert.equal(h.api.state.xp, 40);
});
test('Explain adds and removes comments without invalidating test results', () => {
  const h = harness();
  installAndWire(h, 0);
  h.api.loadExample();
  h.api.testSolution();
  assert.equal(h.api.getPassed(), true);
  h.api.switchTab('code');
  h.document.getElementById('explainBtn').click();
  assert.match(h.api.code(), /\/\/ » /);
  assert.equal(h.api.getPassed(), true);
  assert.equal(h.document.getElementById('explainBtn').textContent, 'Hide explanations');
  h.document.getElementById('explainBtn').click();
  assert.doesNotMatch(h.api.code(), /» /);
});
test('bug hunts cannot be short-circuited and follow the board, roles and free build', () => {
  const h = harness();
  h.api.state.travelScreen = false;
  installAndWire(h, 0);
  h.api.startBugHunt();
  const buggy = h.api.code();
  // Worked example, Reset and Format would give away or erase the answers while spotting.
  h.api.loadExample();
  h.document.getElementById('resetCode').click();
  h.document.getElementById('formatBtn').click();
  assert.equal(h.api.code(), buggy);
  assert.equal(h.api.state.xp, 0);
  // Roles: only the Programmer may flag or check.
  h.api.labState().coopEnabled = true;
  h.api.labState().role = 'Installer';
  h.api.switchTab('code');
  h.document.getElementById('flagLine').click();
  assert.equal(h.api.project().hunt.flagged.length, 0);
  h.api.labState().coopEnabled = false;
  // Free build leaves the hunt.
  h.document.getElementById('freeBtn').click();
  assert.equal(h.api.getActiveFault(), null);
  h.document.getElementById('freeBtn').click();
  // A hunt started on another board uses that board's pins.
  h.api.changeBoard('Raspberry Pi Pico');
  h.api.startBugHunt();
  assert.deepEqual(validate(h.api.project().devices, 'Raspberry Pi Pico'), []);
});
test('bug hunt XP is awarded once per mission across languages', () => {
  const h = harness();
  h.api.state.travelScreen = false;
  installAndWire(h, 0);
  for (const language of ['cpp', 'python']) {
    h.api.state.language = language;
    h.api.startBugHunt();
    const m = h.api.getActiveFault().mission;
    h.api.project().code[language] = program(m, language, h.api.project().devices, true);
    h.api.testSolution();
    assert.equal(h.api.getPassed(), true, language);
    h.api.exitFault();
  }
  assert.equal(h.api.state.xp, 40);
});
test('after fixing starts, result line numbers are dropped and Explain stops a running program', () => {
  const h = harness();
  h.api.state.travelScreen = false;
  installAndWire(h, 0);
  h.api.startBugHunt();
  const input = h.document.getElementById('codeInput');
  input.selectionStart = input.selectionEnd = 0;
  h.document.getElementById('flagLine').click();
  h.document.getElementById('checkHunt').click();
  assert.match(h.document.getElementById('huntBanner').innerHTML, /· Ln \d+/);
  const editor = h.document.getElementById('codeInput');
  editor.value = editor.value + '\n';
  editor.dispatchEvent({ type: 'input' });
  assert.doesNotMatch(h.document.getElementById('huntBanner').innerHTML, /· Ln \d+/);
  h.api.exitFault();
  h.api.loadExample();
  h.api.run();
  assert.equal(h.api.getRunning(), true);
  h.api.switchTab('code');
  h.document.getElementById('explainBtn').click();
  assert.equal(h.api.getRunning(), false);
});
test('the conditions panel shows only what the quest sensors read, unless all are explored', async () => {
  const h = harness();
  const shown = () =>
    h.document
      .querySelectorAll('[data-env]')
      .map((el) => el.dataset.env)
      .sort();
  h.api.selectMission(1); // Welcome Home: motion sensor only
  assert.deepEqual(shown(), ['motion']);
  h.api.state.freeExploration = true;
  await h.api.enterLocation('kyoto');
  h.api.selectMission(5); // Protect the Courtyard Pump: water level and soil
  assert.deepEqual(shown(), ['soil', 'tank']);
  assert.match(h.document.getElementById('conditionsNote').textContent, /this quest’s sensors/);
  h.document.getElementById('moreConditions').onclick();
  assert.ok(shown().includes('outdoorTemp') && shown().includes('pond'));
  h.document.getElementById('moreConditions').onclick();
  assert.deepEqual(shown(), ['soil', 'tank']);
});

test('the World / Split / Code layout is saved and opening a workbench tab brings the bench back', () => {
  const h = harness();
  h.api.state.travelScreen = false;
  h.api.setLayout('world');
  assert.equal(h.document.getElementById('adventureScreen').dataset.layout, 'world');
  assert.equal(JSON.parse(h.storage.get('iotquest-v1')).layout, 'world');
  h.api.switchTab('wiring');
  assert.equal(h.api.state.layout, 'split');
  h.api.setLayout('code');
  h.api.setLayout('nonsense');
  assert.equal(h.api.state.layout, 'split');
  assert.equal(
    harness({ layout: 'code' }).document.getElementById('adventureScreen').dataset.layout,
    'code',
  );
});

test('the world/workbench divider resizes by keyboard, is clamped and saved', () => {
  const h = harness();
  const handle = h.document.getElementById('splitHandle');
  assert.equal(handle.attrs['aria-valuenow'], '60');
  handle.dispatchEvent({ type: 'keydown', key: 'ArrowDown', preventDefault() {} });
  assert.equal(h.api.state.worldShare, 65);
  handle.dispatchEvent({ type: 'keydown', key: 'End', preventDefault() {} });
  assert.equal(h.api.state.worldShare, 85);
  handle.ondblclick();
  assert.equal(h.api.state.worldShare, 60);
  handle.dispatchEvent({ type: 'keydown', key: 'Home', preventDefault() {} });
  assert.equal(JSON.parse(h.storage.get('iotquest-v1')).worldShare, 25);
  assert.equal(
    harness({ worldShare: 500 }).document.getElementById('splitHandle').attrs['aria-valuenow'],
    '85',
  );
});
test('wide screens use a vertical divider and left/right keys to resize the scene', () => {
  const h = harness(null, { wideScreen: true });
  const handle = h.document.getElementById('splitHandle');
  assert.equal(handle.attrs['aria-orientation'], 'vertical');
  handle.dispatchEvent({ type: 'keydown', key: 'ArrowRight', preventDefault() {} });
  assert.equal(h.api.state.worldShare, 65);
  handle.dispatchEvent({ type: 'keydown', key: 'ArrowLeft', preventDefault() {} });
  assert.equal(h.api.state.worldShare, 60);
  handle.dispatchEvent({ type: 'keydown', key: 'ArrowDown', preventDefault() {} });
  assert.equal(h.api.state.worldShare, 60);
});
test('the Day / Night switch sets the light, leaves live weather and moves the daily-cycle clock', async () => {
  const h = harness();
  h.api.state.travelScreen = false;
  const toggle = h.document.getElementById('dayNightToggle');
  toggle.click();
  assert.equal(h.api.state.env.light, 4);
  assert.equal(h.document.getElementById('dayLabel').textContent, 'Nighttime');
  assert.equal(toggle.attrs['aria-pressed'], 'true');
  for (let i = 0; i < 5; i++) h.advanceTimer();
  assert.ok(h.api.state.env.light < 44, 'night holds while time passes');
  toggle.click();
  assert.equal(h.api.state.env.light, 85);
  assert.equal(h.document.getElementById('dayLabel').textContent, 'Daytime');
  // At a destination with live weather, the switch moves to Practice Weather first.
  h.api.state.freeExploration = true;
  await h.api.enterLocation('kyoto');
  h.api.setWeatherMode('live');
  h.document.getElementById('dayNightToggle').click();
  assert.equal(h.api.state.weatherMode, 'practice');
  assert.equal(h.api.state.env.light, 4);
  // The clock moves with the switch (and the accelerated daily cycle follows it).
  h.api.setClockSpeed(60);
  const lab = h.api.labState(),
    hour = () => Math.round((lab.startHour + lab.elapsedMs / 3600000) % 24) % 24;
  for (let i = 0; i < 2; i++) {
    h.document.getElementById('dayNightToggle').click();
    const night = h.document.getElementById('dayLabel').textContent === 'Nighttime';
    assert.equal(hour(), night ? 22 : 12);
  }
});

test('the guide walks through the program step by step and checks the student’s code', () => {
  const h = harness();
  installAndWire(h, 0);
  h.api.switchTab('code');
  const coach = () => h.document.getElementById('coach'),
    input = h.document.getElementById('codeInput'),
    pin = (id) => h.api.project().devices.find((d) => d.id === id).pin,
    type = (text) => {
      input.value = h.api.code() + text;
      input.dispatchEvent({ type: 'input' });
      h.api.renderCoach();
    };
  // No code is provided: only the title and goal as comments.
  assert.ok(
    h.api
      .code()
      .split('\n')
      .every((l) => !l.trim() || l.startsWith('//')),
  );
  assert.equal(coach().hidden, false);
  assert.match(coach().innerHTML, /Step 1 of 6 · Name your pins/);
  assert.match(coach().innerHTML, /const int lightPin = ____;/);
  h.document.getElementById('coachHint').click();
  assert.match(coach().innerHTML, /Hint 1/);
  type('const int lightPin = ' + pin('ldr') + ';\nconst int ledPin = ' + pin('led') + ';\n');
  assert.match(coach().innerHTML, /coach-status ok/);
  h.document.getElementById('coachNext').click();
  assert.match(coach().innerHTML, /Step 2 of 6 · Write setup\(\)/);
  assert.match(coach().innerHTML, /coach-status wait/);
  type('\nvoid setup() {\n  Serial.begin(115200);\n  pinMode(ledPin, OUTPUT);\n}\n');
  assert.match(coach().innerHTML, /setup\(\) prepares the board/);
  h.document.getElementById('coachNext').click();
  assert.match(coach().innerHTML, /Write loop\(\)/);
  const body = '  int light = analogRead(lightPin);\n';
  type('\nvoid loop() {\n' + body + '  delay(200);\n}\n');
  h.document.getElementById('coachNext').click();
  assert.match(coach().innerHTML, /Read the light sensor/);
  assert.match(coach().innerHTML, /The reading is stored in/);
  h.document.getElementById('coachNext').click();
  assert.match(coach().innerHTML, /Switch the path lights/);
  assert.match(coach().innerHTML, /ON when the light reading is below 1800/);
  assert.match(coach().innerHTML, /should be ON, but it is OFF/);
  input.value = h.api
    .code()
    .replace(
      body,
      body +
        '  if (light < 1800) {\n    digitalWrite(ledPin, HIGH);\n  } else {\n    digitalWrite(ledPin, LOW);\n  }\n',
    );
  input.dispatchEvent({ type: 'input' });
  h.api.renderCoach();
  assert.match(coach().innerHTML, /Correct in every scenario/);
  h.document.getElementById('coachNext').click();
  // The student's own program passes the quest.
  h.document.getElementById('coachTest').click();
  h.api.testSolution();
  assert.equal(h.api.getPassed(), true);
  // The guide can be hidden and brought back.
  h.api.switchTab('code');
  h.document.getElementById('coachBtn').click();
  assert.equal(coach().hidden, true);
  h.document.getElementById('coachBtn').click();
  assert.equal(coach().hidden, false);
});

test('students hand in a progress report with their quests, attempts and hints', () => {
  const h = harness();
  installAndWire(h, 0);
  h.api.switchTab('code');
  h.document.getElementById('coachHint').click();
  assert.equal(h.api.project().coach.cpp.hints.pins, 1, 'hints are saved with the project');
  h.api.testSolution();
  h.api.switchTab('export');
  assert.ok(h.document.getElementById('downloadProgress'));
  // A name is required.
  assert.equal(h.api.downloadProgress('  ', '7B'), false);
  const report = h.api.downloadProgress('Amira', '7B');
  assert.equal(h.api.state.reportName, 'Amira');
  assert.equal(h.api.state.classCode, '7B');
  const first = report.quests[0];
  assert.equal(first.title, 'Light the Path');
  assert.equal(first.status, 'started');
  assert.equal(first.attempts, 1);
  assert.equal(first.hints, 1);
  assert.equal(first.stuck, 'Name your pins');
  h.api.loadExample();
  h.api.testSolution();
  assert.equal(h.api.downloadProgress('Amira', '7B').quests[0].status, 'passed');
});

test('after passing, students check their understanding and earn XP for right first tries', () => {
  const h = harness();
  installAndWire(h, 0);
  h.api.switchTab('code');
  h.api.loadExample();
  h.api.testSolution();
  const xp = h.api.state.xp,
    box = () => h.document.getElementById('understanding');
  h.api.switchTab('tests');
  assert.match(box().innerHTML, /Check your understanding/);
  assert.match(box().innerHTML, /Question 1 of 3/);
  assert.match(box().innerHTML, /“At threshold”/);
  const questions = understandingQuestions(h.api.mission(), 'cpp', h.api.project().devices);
  let current = 0;
  const pick = (text) => {
    const i = questions[current].choices.findIndex((c) => c.text.includes(text));
    h.document
      .querySelectorAll('[data-u-choice]')
      .find((b) => b.attrs['data-u-choice'] === String(i))
      .click();
  };
  pick('ON');
  assert.match(box().innerHTML, /Not quite\./);
  assert.match(box().innerHTML, /less than/);
  assert.equal(h.document.getElementById('understandNext'), null, 'try again before moving on');
  pick('OFF');
  assert.match(box().innerHTML, /✓ Correct\./);
  assert.equal(h.api.state.xp, xp, 'no XP after a wrong first try');
  h.document.getElementById('understandNext').click();
  current++;
  pick('0 to 4095');
  assert.equal(h.api.state.xp, xp + 10);
  h.document.getElementById('understandNext').click();
  current++;
  pick('The number 1800');
  h.document.getElementById('understandNext').click();
  assert.match(box().innerHTML, /got <strong>2 of 3<\/strong> right first time/);
  const q = h.api.downloadProgress('Amira', '7B').quests[0];
  assert.deepEqual([q.understood, q.understandAnswered, q.understandTotal], [2, 3, 3]);
  // Answers are saved: coming back shows the results, not the questions again.
  h.api.switchTab('code');
  h.api.switchTab('tests');
  assert.match(box().innerHTML, /2 of 3/);
});

test('regressions: Explain on an empty editor and Reset restarting the guide', () => {
  const h = harness();
  installAndWire(h, 0);
  h.api.switchTab('code');
  const before = h.api.code();
  h.document.getElementById('explainBtn').click();
  assert.equal(h.api.code(), before, 'nothing added to a comments-only editor');
  const input = h.document.getElementById('codeInput'),
    pin = (id) => h.api.project().devices.find((d) => d.id === id).pin;
  input.value =
    before + 'const int lightPin = ' + pin('ldr') + ';\nconst int ledPin = ' + pin('led') + ';\n';
  input.dispatchEvent({ type: 'input' });
  h.api.renderCoach();
  h.document.getElementById('coachNext').click();
  assert.match(h.document.getElementById('coach').innerHTML, /Write setup\(\)/);
  h.document.getElementById('resetCode').click();
  assert.match(h.document.getElementById('coach').innerHTML, /Step 1 of 6 · Name your pins/);
});

test('resident chat accepts safe typed questions and starts a chosen request without granting progress', () => {
  const h = harness();
  h.document.getElementById('resident').click();
  assert.equal(h.document.getElementById('modalTitle').textContent, 'A chat with Maya');
  assert.ok(h.document.getElementById('modal').open);
  const question = h.document
    .querySelectorAll('[data-chat-question]')
    .find((b) => b.dataset.chatQuestion === 'What will I see animated?');
  question.click();
  assert.match(h.document.getElementById('modalBody').innerHTML, /lights glow/);
  h.document.getElementById('chatInput').value = '<img src=x onerror=alert(1)>';
  h.document.getElementById('chatForm').onsubmit({ preventDefault() {} });
  assert.match(h.document.getElementById('modalBody').innerHTML, /&lt;img/);
  assert.doesNotMatch(h.document.getElementById('modalBody').innerHTML, /<img src=x/);
  h.document
    .querySelectorAll('[data-chat-request]')
    .find((b) => b.dataset.chatRequest === '2')
    .click();
  h.document.getElementById('startChatQuest').click();
  assert.equal(h.api.state.mission, 2);
  assert.equal(h.document.getElementById('modal').open, false);
  assert.equal(h.api.state.xp, 0);
  assert.equal(Object.keys(h.api.state.completed).length, 0);
  assert.equal(h.api.project().devices.length, 0);
});
test('pressing E near a resident opens their chat and typing does not move the technician', () => {
  const h = harness();
  h.api.state.travelScreen = false;
  h.api.state.player = { x: 70, y: 51 };
  h.document.listeners.keydown({ key: 'e', target: { tagName: 'BUTTON' }, preventDefault() {} });
  assert.equal(h.document.getElementById('modalTitle').textContent, 'A chat with Maya');
  const before = { ...h.api.state.player };
  h.document.listeners.keydown({ key: 'w', target: { tagName: 'INPUT' }, preventDefault() {} });
  h.api.move('up', 1);
  assert.deepEqual({ ...h.api.state.player }, before);
});
test('regional conversations use the destination resident names and requests', () => {
  const h = harness();
  h.api.enterLocation('kyoto');
  h.document.getElementById('resident').click();
  assert.equal(h.document.getElementById('modalTitle').textContent, 'A chat with Akari');
  assert.equal(h.document.getElementById('resident').attrs['aria-label'], 'Talk to Akari');
  h.document.getElementById('startChatQuest').click();
  assert.equal(h.api.mission().resident, 'Akari');
  assert.equal(h.api.state.activeLocation, 'kyoto');
});

test('approaching a section resident automatically opens its own quest and does not reopen after dismissal', () => {
  const h = harness();
  h.api.state.travelScreen = false;
  h.api.state.player = { x: 77, y: 67 };
  h.api.move('up', 0.5);
  assert.equal(h.document.getElementById('modalTitle').textContent, 'A chat with Robin');
  assert.match(h.document.getElementById('modalBody').innerHTML, /Plant beds/);
  assert.ok(
    h.document
      .querySelectorAll('[data-chat-request]')
      .every((b) => missions[Number(b.dataset.chatRequest)].area === 'Plant beds'),
  );
  h.document.getElementById('modal').close();
  h.api.move('right', 0.5);
  assert.equal(h.document.getElementById('modal').open, false);
  h.api.state.player = { x: 77, y: 90 };
  h.api.move('right', 0.5);
  h.api.state.player = { x: 77, y: 67 };
  h.api.move('up', 0.5);
  assert.equal(h.document.getElementById('modal').open, true);
});
test('bedroom resident starts its dedicated quest and installs components in the bedroom', () => {
  const h = harness();
  h.document
    .querySelectorAll('[data-section-npc]')
    .find((b) => b.dataset.sectionNpc === 'section:Bedroom')
    .click();
  assert.equal(h.document.getElementById('modalTitle').textContent, 'A chat with Nina');
  h.document.getElementById('startChatQuest').click();
  assert.equal(h.api.mission().title, 'Bedroom Night Light');
  h.api.installDialog('ldr');
  h.document.getElementById('confirmInstall').click();
  assert.equal(h.api.project().devices[0].area, 'Bedroom');
  assert.equal(h.api.state.xp, 0);
});
