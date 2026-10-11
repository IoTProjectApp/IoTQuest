import { residentialLots } from './community-residences.js';
import { communityStations, COMMUNITY_ORIGIN } from './community-world.js';
import { residentsForSections, createGreetingTracker } from './section-residents.js';
import {
  createConversation,
  chooseRequest,
  sendConversationMessage,
  nearestCharacter,
} from './conversations.js';
import {
  components,
  missions,
  baseEnv,
  defaults,
  validate,
  program,
  missionBudget,
} from './missions.js';
import { localSkyDate, DEFAULT_OBSERVER } from './astronomy.js';
import { Runtime } from './runtime.js';
import { World3D } from './world3d.js';
import { toWorld, fromWorld } from './world-math.js';
import { ADC_SIGNALS, ADC_SCALE, outputLevel } from './signals.js';
import { locations, locationById, adaptMissions, progressForLocation } from './locations.js';
import { WeatherService, advanceEnvironment } from './weather.js';
import { advancedMenu } from './advanced-tools.js';
import {
  createLabState,
  simulateBatch,
  residentRoutine,
  updateResources,
  faultCases,
  scenarios,
} from './lab.js';
import {
  renderLabPanel,
  updateCircuit,
  updateResourcesPanel,
  scenarioOptions,
} from './lab-panels.js';
import { projectFiles, zipFiles } from './project-package.js';
import { isLocationUnlocked, completedQuestCount } from './locations.js';
import { setupTravel, weatherHTML } from './travel.js';
import { esc, setHTML } from './html.js';
import { sanitizeSaved } from './persistence.js';
import { highlight } from './syntax-highlight.js';
import { SerialPlotter, findThresholds, PLOT_LIMIT } from './plotter.js';
import { diagnose } from './diagnostics.js';
import { createBugHunt, scoreBugHunt } from './bug-hunt.js';
import { explainCode, removeExplanations, hasExplanations } from './code-explain.js';
import { readProject, ImportError, IMPORT_LIMITS, PROJECT_FORMAT } from './project-import.js';
import { formatCode as formatSource, FormatError, INDENT } from './code-format.js';
import { coachSteps, readingText } from './code-coach.js';
import { checkPredictions } from './weather-quests.js';
import { neededNow, situationReason } from './situation.js';
import { boundaryScenarios } from './quest-boundaries.js';
import { conversationHTML } from './conversation-view.js';
import { predictionHTML } from './prediction-view.js';
import { declutterLabels } from './world-labels.js';
import { attachAssist } from './editor-assist.js';
import { simulateDay, dayLogQuestions, dayLogCSV } from './day-log.js';
import { dayLogHTML } from './day-log-view.js';
import { securityCases, dashboardQuests } from './challenges.js';
import { dashboardHTML, dashboardLiveHTML } from './dashboard-view.js';
import { BoardLink, readingsToEnv, outputLine, boardProgram } from './hardware.js';
import { boardPanelHTML } from './board-view.js';
import {
  parseQuestFile,
  loadCustomQuests,
  customChallenge,
  QuestError,
  QUEST_LIMITS,
} from './custom-quests.js';
import { buildProgressReport, progressFileName } from './progress-report.js';
import { understandingQuestions, answerQuestion, understandingScore } from './understanding.js';
const $ = (id) => document.getElementById(id);
// The test copy at /dev/ (channel.js) saves separately so trying it never changes the main site's
// progress. It starts from a copy of the main site's progress until it first saves.
const CHANNEL = globalThis.IOTQUEST_CHANNEL || '',
  MAIN_STORAGE_KEY = 'iotquest-v1',
  STORAGE_KEY = CHANNEL ? 'iotquest-' + CHANNEL + '-v1' : MAIN_STORAGE_KEY,
  TICK_MS = 200,
  ADVANCED_COMPONENT_XP = 150,
  EVIDENCE_LIMIT = 50,
  FULL_TEST_EVIDENCE = 5,
  IMPORT_BACKUPS = 3;
const areas = [
  ['Bedroom', 19, 17],
  ['Bathroom', 30, 15],
  ['Kitchen', 35, 31],
  ['Utility room', 48, 12],
  ['Living room', 20, 35],
  ['Garage', 50, 30],
  ['Greenhouse', 80, 20],
  ['Water tank', 91, 43],
  ['Plant beds', 77, 64],
  ['Garden path', 43, 60],
  ['Entrance', 32, 51],
];
const baseAreas = areas.map((a) => [...a]);
let saved = {};
try {
  saved = sanitizeSaved(
    JSON.parse(
      localStorage.getItem(STORAGE_KEY) ||
        (CHANNEL && localStorage.getItem(MAIN_STORAGE_KEY)) ||
        '{}',
    ),
  );
} catch {}
let state = {
  mission: 0,
  language: 'cpp',
  board: 'ESP32',
  projects: {},
  completed: {},
  xp: 0,
  env: { ...baseEnv },
  name: 'Technician',
  appearance: '🧑‍🔧',
  color: '#547b5b',
  reduced: matchMedia('(prefers-reduced-motion: reduce)').matches,
  sound: false,
  theme: 'system',
  player: { x: 48, y: 77 },
  ...saved,
};
state.env = { ...baseEnv, ...state.env };
state.projects = state.projects || {};
state.completed = state.completed || {};
state.activeLocation = locationById(state.activeLocation) ? state.activeLocation : 'legacy';
state.locationProgress = state.locationProgress || {};
state.weatherByLocation = state.weatherByLocation || {};
state.weatherMode = state.weatherMode || 'live';
state.difficulty = state.difficulty || 'beginner';
state.legacyMission = state.legacyMission ?? state.mission;
state.legacyBoard = state.legacyBoard || state.board;
state.legacyEnv = state.legacyEnv || { ...state.env };
state.travelScreen = true;
let travelController = null;
let weatherRevision = 0,
  weatherLoading = false;
const weatherService = new WeatherService({
  useProxy: true,
  // Relative, so the same build works at a domain root or under a path such as /IoTQuest/.
  proxyURL: 'api/weather',
  fetchImpl:
    typeof fetch === 'function'
      ? fetch
      : async () => {
          throw Error('Weather unavailable');
        },
  storage: localStorage,
});
const currentLocation = () => locationById(state.activeLocation);
function locationProfile() {
  if (state.activeLocation === 'legacy') return state;
  return (state.locationProgress[state.activeLocation] ??= {
    projects: {},
    completed: {},
    mission: 0,
    board: state.board,
    env: { ...baseEnv },
  });
}
const currentCompletions = () => locationProfile().completed;
// Adapting all quests copies each one, and mission() runs many times every 200 ms tick, so the
// list is kept until the destination or difficulty changes (quests are not modified once built).
let adaptedFor = null,
  adaptedMissions = null;
const activeMissions = () => {
  const key = state.activeLocation + '|' + state.difficulty;
  if (adaptedFor !== key) {
    adaptedMissions = adaptMissions(missions, currentLocation(), state.difficulty);
    adaptedFor = key;
  }
  return adaptedMissions;
};
let activeFault = null,
  selectedDevice = null,
  lastInputs = {},
  outputKinds = {},
  // The full scale of each output's last write (1 digital, 255 analogWrite, 1023 duty, ...).
  outputScales = {},
  inFlight = false,
  requestEnv = null,
  inspectionVariables = {};
const labState = () => (project().lab ??= createLabState());
let world3d = null;

const communityAreaNames = Object.fromEntries(
  Object.entries(communityStations).map(([type, [name]]) => [type, name]),
);
// Without the 3D world (before it loads, or without WebGL) the areas still exist for quests and
// installs; they lie beside the property, off the map, so renderAreas shows no marker for them.
function nativeAreas() {
  return (
    world3d?.model.community?.areas ||
    Object.entries(communityStations).map(([type, [name, x, z]]) => {
      const p = fromWorld(COMMUNITY_ORIGIN.x + x, COMMUNITY_ORIGIN.z + z);
      return [name, p.x, p.y, { communityType: type }];
    })
  );
}
function allAreas() {
  return [...areas, ...nativeAreas()];
}
function isNativeCommunityProject() {
  return (
    !activeFault &&
    ((!free && missions[state.mission]?.communityQuest) ||
      project().devices.some((d) => Object.values(communityAreaNames).includes(d.area)))
  );
}
// Slider values the student set for scene-driven channels; kept for this quest only, not saved.
let sensorOverrides = {};
function refreshCommunityInputs() {
  delete project().sensorOverrides;
  const sim = world3d?.model.community?.sim;
  if (!sim || !isNativeCommunityProject()) return;
  const sensors = sim.sensors();
  state.env = withBoard({
    ...state.env,
    bay: sensors.bay,
    spaces: sensors.spaces,
    pedRequest: sensors.request,
    vibration: sensors.vibration,
    ...sensorOverrides,
  });
}
let allConditions = false;
let tab = 'code',
  free = false,
  view = 'world',
  focusArea = null,
  zoom = 1,
  speed = 1,
  running = false,
  worker = null,
  timer = null,
  watchdog = null,
  outputs = {},
  logs = [],
  simTime = 0,
  testResults = [],
  currentPassed = false,
  edited = false,
  errorLine = null,
  npcTime = 0;
let activeConversation = null;
const greetingTracker = createGreetingTracker();
const mission = () =>
  activeFault?.track === 'custom'
    ? activeFault.mission
    : activeFault?.track
      ? {
          ...missions[0],
          title: activeFault.title,
          goal: activeFault.goal,
          ids: activeFault.ids,
          quote:
            activeFault.track === 'security'
              ? '“This works, but it is not safe. Can you find the weakness and fix it?”'
              : '“I would love to see and control the house from my phone. Can you connect it?”',
          hint: activeFault.hints[0],
          learn:
            activeFault.track === 'security'
              ? ['MQTT', 'Security', 'Testing']
              : ['MQTT', 'Publish', 'Subscribe'],
          badge: activeFault.track === 'security' ? 'Security fixer' : 'Dashboard builder',
          conditions: [],
          scenarios: [],
          xp: 40,
        }
      : activeFault
        ? {
            ...(activeFault.mission || missions[0]),
            title: activeFault.title,
            quote: activeFault.mission
              ? '“Someone broke my program. Can you spot what is wrong before you fix it?”'
              : '“Find the fault, repair it, and show why the circuit works.”',
            xp: 40,
          }
        : free
          ? {
              title: 'Your smart world',
              area: 'House & garden',
              resident: 'Maya',
              role: 'Your creative companion',
              quote:
                '“What would you like to make smarter? Explore, try an idea, and see what happens. Your toolkit is open.”',
              goal: 'Build your own connected home. Choose any components and use the language guide to program them.',
              ids: [],
              xp: 0,
              badge: 'Maker',
              learn: ['Experiment', 'Create', 'Debug'],
              hint: 'Start with one sensor and one output. Install both, connect 3.3 V, GND and signal pins, then read the sensor and write to the output.',
              conditions: ['light < 1800'],
              scenarios: [],
            }
          : activeMissions()[state.mission];
// Key for a quest's project and completion record in the current location profile.
const missionKey = (index = state.mission) =>
  (state.difficulty === 'advanced' && currentLocation() ? 'advanced:' : '') + index;
const activeKey = () => (activeFault ? 'fault:' + activeFault.id : missionKey());
// Where a pass is recorded; bug hunts reward once per mission, whatever the language or board.
const completionKey = () => activeFault?.rewardKey ?? activeKey();
const project = () => {
  const key = !activeFault && free ? 'free' : activeKey();
  const projects = locationProfile().projects;
  if (!projects[key]) projects[key] = { devices: [], code: {} };
  return projects[key];
};
const planned = () => defaults(mission().ids.length ? mission().ids : ['ldr', 'led'], state.board);
const code = () =>
  project().code[state.language] ??
  program(mission(), state.language, planned(), false, state.board);
let saveTimer = null;
// Coalesce saves during rapid input such as typing; flushed when the page is hidden.
function saveSoon() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(save, 600);
}
window.addEventListener('pagehide', () => saveTimer && save());
// All progress is one saved copy. When another tab (or the installed app) saves, this tab's copy
// is out of date: saving it would write older progress back over the newer one (a forgotten tab
// saves live weather every minute). So this tab stops saving and offers a reload instead.
let staleTab = false;
window.addEventListener('storage', (e) => {
  if (e.key !== STORAGE_KEY || staleTab) return;
  staleTab = true;
  clearTimeout(saveTimer);
  saveTimer = null;
  stop(false);
  $('saved').textContent = 'Not saved: progress changed in another tab';
  document.getElementById('updateBar')?.remove();
  const bar = document.createElement('div');
  bar.id = 'updateBar';
  bar.className = 'update-bar';
  bar.setAttribute('role', 'status');
  bar.innerHTML =
    '<span>Your progress changed in another tab.</span><button type="button">Reload</button>';
  bar.querySelector('button').onclick = () => location.reload();
  document.body.append(bar);
});
// Adopt simulation-owned fields from a worker/batch result without replacing the lab object,
// so panels holding a reference keep writing to the saved state.
function adoptSimulatedLab(next) {
  const lab = labState();
  lab.resources = next.resources;
  lab.elapsedMs = next.elapsedMs;
  if (next.stationSamples) lab.stationSamples = next.stationSamples;
}
// Record evidence; consecutive edits merge into one session entry, and test evidence
// is capped separately so editing cannot evict it.
function recordEvidence(entry) {
  const lab = labState(),
    last = lab.evidence.at(-1);
  if (
    entry.type === 'edit' &&
    last?.type === 'edit' &&
    last.owner === entry.owner &&
    last.role === entry.role &&
    Date.parse(entry.at) - Date.parse(last.lastAt || last.at) < 60000
  ) {
    last.lastAt = entry.at;
    last.count = (last.count || 1) + 1;
    return;
  }
  lab.evidence.push(entry);
  const tests = lab.evidence.filter((e) => e.type === 'test').slice(-EVIDENCE_LIMIT),
    other = lab.evidence.filter((e) => e.type !== 'test').slice(-EVIDENCE_LIMIT);
  lab.evidence = lab.evidence.filter((e) => tests.includes(e) || other.includes(e));
  // Every saved test run held a full copy of the code, wiring and results (about 2 KB each), and
  // all progress shares one browser store of about 5 MB. Older runs keep a short summary.
  for (const e of tests.slice(0, -FULL_TEST_EVIDENCE)) {
    delete e.code;
    delete e.devices;
    if (e.results) e.results = e.results.map(({ name, pass }) => ({ name, pass }));
  }
}
function save() {
  clearTimeout(saveTimer);
  saveTimer = null;
  if (staleTab) return;
  if (state.activeLocation !== 'legacy') {
    const p = locationProfile();
    p.mission = state.mission;
    p.board = state.board;
    p.env = { ...state.env };
  } else {
    state.legacyMission = state.mission;
    state.legacyBoard = state.board;
    state.legacyEnv = { ...state.env };
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    $('saved').textContent = '✓ Progress saved locally';
  } catch {
    $('saved').textContent = 'Local saving unavailable';
    // Usually the browser's storage is full (or blocked): say so once, clearly, so the student
    // can download their progress before closing the page.
    if (!save.warned) {
      save.warned = true;
      toast(
        'Your progress could not be saved in this browser. Download your progress or project before closing this page.',
      );
    }
  }
}
function toast(text) {
  $('toast').textContent = text;
  $('toast').classList.add('visible');
  clearTimeout(toast.timeout);
  toast.timeout = setTimeout(() => $('toast').classList.remove('visible'), 4300);
}
function modal(title, html) {
  activeConversation = null;
  $('modalTitle').textContent = title;
  $('modalBody').innerHTML = html;
  $('modal').showModal();
}
$('closeModal').onclick = () => $('modal').close();
$('modal').addEventListener('close', () => {
  activeConversation = null;
});
$('modal').addEventListener('click', (e) => {
  if (e.target === $('modal')) {
    const r = $('modal').getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom)
      $('modal').close();
  }
});
function markEdited({ typing = false } = {}) {
  labState().attempts++;
  recordEvidence({
    at: new Date().toISOString(),
    type: 'edit',
    owner: state.name,
    role: labState().role,
  });
  currentPassed = false;
  edited = true;
  testResults = [];
  errorLine = null;
  renderSteps();
  if (typing) saveSoon();
  else save();
}
// Badge icons repeat in order once every icon has been used (there are more quests than icons).
const BADGE_ICONS = [
  '☾',
  '⌂',
  '♧',
  '❄',
  '◈',
  '≋',
  '☀',
  '✧',
  '⚑',
  '✦',
  '♨',
  '☂',
  '⚙',
  '✪',
  '❖',
  '☘',
];
function renderMission() {
  // Pausing belongs to the clock the student sees (speed 0, or a program held in the debugger),
  // not to each quest's saved lab: otherwise a quest paused earlier stays frozen at 1×.
  labState().paused = speed === 0 || (!!state.debugPaused && running);
  syncSkyControls();
  let m = mission();
  $('missionTitle').textContent = m.title;
  $('mapMission').textContent = m.title;
  $('missionArea').textContent = '⌖ ' + m.area;
  $('missionXp').textContent = '✦ ' + m.xp + ' XP';
  $('missionBudget').textContent = free
    ? 'Free build · lifetime estimates in Budgets'
    : 'Assessment budget: ' +
      missionBudget(m).wh +
      ' Wh · ' +
      missionBudget(m).litres +
      ' L. Fixed test window.';
  $('missionNumber').innerHTML = free
    ? 'OPEN WORLD <span>EXPERIMENT</span>'
    : String(state.mission + 1).padStart(2, '0') +
      ' / ' +
      String(activeMissions().length).padStart(2, '0') +
      ' <span>' +
      (m.weatherQuest ? 'WEATHER QUEST' : state.mission < 3 ? 'BEGINNER' : 'LEVEL UP') +
      '</span>';
  $('residentName').textContent = m.resident;
  $('residentRole').textContent = m.role;
  $('residentAvatar').textContent =
    m.resident === 'Maya' ? '👩🏽‍🌾' : m.resident === 'Alex' ? '🧑🏻' : '🧑🏾‍🍳';
  $('request').textContent = m.quote;
  renderSituation();
  $('hint').textContent = m.hint;
  $('hint').hidden = true;
  $('xp').textContent = state.xp;
  $('testMission').textContent = free ? '▶ Run your creation' : '▶ Test your solution';
  renderSteps();
  renderAreas();
  renderEnvironment();
  renderBench();
  renderEffects();
}
function renderSteps() {
  let m = mission(),
    ds = project().devices,
    installed = m.ids.every((id) => ds.some((d) => d.id === id)) && ds.length > 0,
    wired = installed && validate(ds, state.board).length === 0;
  let checks = [installed, wired, running || currentPassed, currentPassed];
  let active = checks.findIndex((x) => !x);
  $('steps').innerHTML = [
    'Install your components',
    'Connect the circuit',
    'Write & run your code',
    'Test in different conditions',
  ]
    .map(
      (s, i) =>
        '<div class="step ' +
        (checks[i] ? 'complete' : i === active ? 'current' : '') +
        '"><i>' +
        (checks[i] ? '✓' : i + 1) +
        '</i><span>' +
        s +
        '</span></div>',
    )
    .join('');
  $('deviceCount').textContent = ds.length;
}
const envMeta = {
  light: ['☀', 'Sunlight', '%', 0, 100, 'Night', 'Day'],
  soil: ['♧', 'Soil moisture', '%', 0, 100, 'Dry', 'Wet'],
  tank: ['▥', 'Water tank', '%', 0, 100, 'Empty', 'Full'],
  temp: ['♨', 'Temperature', '°C', 0, 45, 'Cold', 'Hot'],
  outdoorTemp: ['♨', 'Outdoor temperature', '°C', -10, 45, 'Cold', 'Hot'],
  wind: ['≋', 'Wind speed', ' km/h', 0, 80, 'Calm', 'Windy'],
  cloud: ['☁', 'Cloud cover', '%', 0, 100, 'Clear', 'Overcast'],
  rain: ['☂', 'Rain', '%', 0, 100, 'Clear', 'Downpour'],
  distance: ['◍', 'Distance', 'cm', 0, 300, 'Near', 'Far'],
  pot: ['◴', 'Potentiometer', '%', 0, 100, 'Minimum', 'Maximum'],
  humidity: ['≋', 'Humidity', '%', 0, 100, 'Dry', 'Humid'],
  vibration: ['≋', 'Machine vibration', '', 0, 100, 'Normal', 'Fault'],
  bay: ['▣', 'Loading bay occupied', '', 0, 1, 'Clear', 'Vehicle present'],
  pedRequest: ['🚶', 'Pedestrian request', '', 0, 1, 'Released', 'Requested'],
  spaces: ['P', 'Available spaces', '', 0, 1, 'Occupied', 'Free'],
  pond: ['≈', 'Pond level', '%', 0, 100, 'Low', 'Full'],
};
// Conditions shown in the panel: only what this quest's sensors (and any extra sensors
// installed in the circuit) can read, unless the player asks to explore every condition.
function relevantSignals() {
  return [
    ...new Set([
      ...planned()
        .filter((d) => !d.output)
        .map((d) => d.signal),
      ...project()
        .devices.filter((d) => !d.output)
        .map((d) => d.signal),
      ...(free || allConditions
        ? [
            'light',
            'soil',
            'tank',
            'temp',
            'rain',
            'motion',
            'door',
            'armed',
            'distance',
            'pot',
            'humidity',
            'outdoorTemp',
            'wind',
            'cloud',
            'pond',
            'occupied',
          ]
        : []),
    ]),
  ];
}
// Predict, then check: in a live-weather quest, the student says whether each output will be on
// with today's readings, then compares that with their running program.
let prediction = { key: null, readings: '', picks: {}, result: null };
function renderPrediction(show) {
  const devices = project().devices,
    outputDevices = devices.filter((d) => d.output),
    readings = readingText(state.env, devices),
    key = state.activeLocation + '|' + activeKey();
  $('predictCheck').hidden = !show || !outputDevices.length;
  if ($('predictCheck').hidden) return;
  if (prediction.key !== key) prediction = { key, readings, picks: {}, result: null };
  // New live readings make an old comparison misleading.
  if (prediction.readings !== readings) Object.assign(prediction, { readings, result: null });
  $('predictCheck').innerHTML = predictionHTML(prediction, outputDevices, readings);
  document.querySelectorAll('[data-predict-pin]').forEach(
    (b) =>
      (b.onclick = () => {
        prediction.picks[b.dataset.predictPin] = b.dataset.predictOn === 'true';
        prediction.result = null;
        renderPrediction(true);
      }),
  );
  $('checkPrediction').onclick = () => {
    if (!running) {
      toast('Run your program first, then check your prediction.');
      return;
    }
    prediction.result = checkPredictions(prediction.picks, devices, outputs);
    renderPrediction(true);
  };
}
function renderEnvironment() {
  const weatherQuest = !free && !activeFault && mission().weatherQuest;
  $('weatherQuestNote').hidden = !weatherQuest;
  $('weatherQuestDescription').textContent = currentLocation()
    ? state.weatherMode === 'live'
      ? 'Run your code with local weather readings. Live data may use a labelled fallback if unavailable. Tests check fixed weather scenarios, so you can finish in any weather.'
      : 'Try the practice sliders or switch to live local weather. Tests check fixed weather scenarios, so you can finish in any weather.'
    : 'Choose a destination for live local weather, or use practice readings here. Tests check fixed weather scenarios.';
  $('useLiveQuestWeather').hidden = !!currentLocation() && state.weatherMode === 'live';
  $('useLiveQuestWeather').textContent = currentLocation()
    ? 'Use live weather'
    : 'Choose a destination';
  $('useLiveQuestWeather').onclick = () =>
    currentLocation() ? setWeatherMode('live') : returnToGlobe();
  renderPrediction(weatherQuest && !!currentLocation() && state.weatherMode === 'live');
  const signals = relevantSignals(),
    scope = free || allConditions ? '' : 'Showing what this quest’s sensors read. ';
  $('conditionsNote').textContent =
    scope +
    (currentLocation()
      ? state.weatherMode === 'live'
        ? 'Simulated sensors · outdoor climate follows local weather.'
        : 'Practice conditions · sliders control the simulated climate.'
      : 'Try a different day in your world.');
  $('envControls').innerHTML =
    signals
      .map((s) => {
        if (['motion', 'door', 'armed', 'occupied'].includes(s))
          return (
            '<label class="toggle-row">' +
            {
              motion: 'Resident moving nearby',
              door: 'Garage door open',
              armed: 'Security armed',
              occupied: 'Residents at home',
            }[s] +
            '<input type="checkbox" data-env="' +
            s +
            '" ' +
            (state.env[s] ? 'checked' : '') +
            '></label>'
          );
        let meta = envMeta[s];
        if (!meta) return '';
        return (
          '<div class="env-row"><label for="env-' +
          s +
          '"><span>' +
          meta[0] +
          ' &nbsp; ' +
          meta[1] +
          '</span><strong id="value-' +
          s +
          '">' +
          Math.round(state.env[s] ?? 0) +
          meta[2] +
          '</strong></label><input id="env-' +
          s +
          '" type="range" data-env="' +
          s +
          '" min="' +
          meta[3] +
          '" max="' +
          meta[4] +
          '" ' +
          (currentLocation() &&
          state.weatherMode === 'live' &&
          ['light', 'rain', 'humidity', 'wind', 'cloud', 'outdoorTemp'].includes(s)
            ? 'disabled'
            : '') +
          ' value="' +
          (state.env[s] ?? 0) +
          '"><div class="range-endpoints"><span>' +
          meta[5] +
          '</span><span>' +
          meta[6] +
          '</span></div></div>'
        );
      })
      .join('') +
    '<button class="text-btn more-conditions" id="moreConditions">' +
    (allConditions ? 'Show quest conditions' : 'Explore all conditions') +
    '</button>';
  $('moreConditions').onclick = () => {
    allConditions = !allConditions;
    renderEnvironment();
  };
  document.querySelectorAll('[data-env]').forEach((el) =>
    el.addEventListener('input', () => {
      state.env[el.dataset.env] = el.type === 'checkbox' ? Number(el.checked) : Number(el.value);
      if (
        isNativeCommunityProject() &&
        ['bay', 'spaces', 'pedRequest', 'vibration'].includes(el.dataset.env)
      )
        sensorOverrides[el.dataset.env] = state.env[el.dataset.env];
      updateReadings();
      renderEffects();
      // A slider fires on every step it moves; save once it settles.
      saveSoon();
    }),
  );
}
function renderAreas() {
  $('areas').innerHTML = allAreas()
    // The 3D world places every marker; the flat map can only show the ones on the property.
    .filter(([, x, y]) => world3d || (x >= 0 && x <= 100 && y >= 0 && y <= 100))
    .map(
      ([name, x, y]) =>
        '<button class="area-marker ' +
        (mission().area === name ? 'mission-area' : '') +
        '" data-area="' +
        esc(name) +
        '" style="left:' +
        x +
        '%;top:' +
        y +
        '%">' +
        esc(name) +
        '</button>',
    )
    .join('');
  document
    .querySelectorAll('[data-area]')
    .forEach((b) => (b.onclick = () => enterArea(b.dataset.area)));
}
function enterArea(name, { keepProject = false } = {}) {
  let a = allAreas().find((a) => a[0] === name);
  if (!a) return;
  const native = a[3]?.communityType;
  // Selecting a workstation uses the same immediate placement as home/garden areas.
  if (
    native &&
    !keepProject &&
    (free || activeFault || !mission().communityQuest || mission().area !== name)
  ) {
    const index = activeMissions().findIndex((m) => m.communityQuest && m.area === name);
    if (index >= 0) selectMission(index);
  }
  world3d?.returnToProperty();
  if (native) world3d?.focusCommunityArea(name);
  focusArea = a;
  view = 'detail';
  zoom = 1.9;
  state.player = world3d?.findFree({ x: a[1], y: a[2] + 5 }) ?? { x: a[1], y: a[2] + 5 };
  const p = toWorld(state.player);
  greetingTracker.acknowledge({ x: p[0], z: p[2] }, characterPositions());
  save();
  $('worldTip').textContent = 'Press E to install devices here';
  setMapView();
  if (native) {
    world3d?.snapCamera();
    setLayout('split');
    renderMission();
    switchTab('inventory');
  }
  updatePlayer();
  $('world').focus();
}
function setMapView() {
  $('world').classList.toggle('sky-view', view === 'sky');
  if (view === 'sky') $('worldTip').textContent = 'Drag to look around · scroll to zoom';
  else if (view === 'landscape')
    $('worldTip').textContent = 'Mountains · river valley · lake · wildlife';
  const a = focusArea,
    tx = a ? (50 - a[1]) * zoom : 0,
    ty = a ? (50 - a[2]) * zoom : 0;
  $('mapLayer').style.transform = world3d
    ? 'none'
    : 'translate(' + tx + '%,' + ty + '%) scale(' + zoom + ')';
  world3d?.setView(view, a, zoom);
  // The minimap matches the 3D view, which draws the community (and its buildings close up)
  // unflipped even when the home is mirrored.
  $('minimap')?.classList.toggle(
    'mirrored',
    !!world3d?.model.mirrored && !world3d.communityView && !world3d.indoorArea,
  );
  if ($('followCamera')) $('followCamera').setAttribute?.('aria-pressed', 'false');
  $('location').innerHTML =
    '<span>⌖</span> ' +
    esc(
      a?.[0] ??
        (view === 'house'
          ? 'Inside the house'
          : view === 'garden'
            ? 'The garden'
            : currentLocation()?.city || 'Willowbrook home'),
    );
  $('returnBtn').hidden = view === 'world';
  const inside =
    a && (a[0].includes('room') || ['Kitchen', 'Bathroom', 'Garage', 'Bedroom'].includes(a[0]));
  document
    .querySelectorAll('[data-view]')
    .forEach((b) =>
      b.classList.toggle(
        'selected',
        b.dataset.view === view ||
          (view === 'detail' && b.dataset.view === (inside ? 'house' : 'garden')),
      ),
    );
}
// Leaving a community workstation drops its room bounds and brings the player back home.
function leaveCommunityArea() {
  if (!world3d?.indoorArea) return;
  world3d.returnToProperty();
  state.player = world3d.findFree({ x: 48, y: 77 });
  updatePlayer();
}
function changeView(v) {
  if (state.layout === 'code') setLayout('split');
  leaveCommunityArea();
  view = v;
  focusArea = v === 'house' ? ['House', 34, 25] : v === 'garden' ? ['Garden', 74, 52] : null;
  zoom = v === 'world' || v === 'sky' || v === 'landscape' ? 1 : 1.5;
  setMapView();
}
document
  .querySelectorAll('[data-view]')
  .forEach((b) => (b.onclick = () => changeView(b.dataset.view)));
$('returnBtn').onclick = () => changeView('world');
$('resetCamera').onclick = () => {
  world3d?.resetCamera(view, focusArea, zoom);
  $('followCamera').setAttribute('aria-pressed', 'false');
};
$('zoomIn').onclick = () => {
  zoom = Math.min(3, zoom + 0.25);
  setMapView();
};
$('zoomOut').onclick = () => {
  zoom = Math.max(view === 'landscape' ? 0.6 : 1, zoom - 0.25);
  if (zoom === 1 && !['sky', 'landscape', 'community'].includes(view)) {
    leaveCommunityArea();
    view = 'world';
    focusArea = null;
  }
  setMapView();
};
$('clockSpeed').onchange = () => setClockSpeed(Number($('clockSpeed').value));
function updatePlayer() {
  $('player').style.left = state.player.x + '%';
  $('player').style.top = state.player.y + '%';
  $('player').querySelector('.player-body').textContent = state.appearance;
  $('player').querySelector('small').textContent = state.name === 'Technician' ? 'You' : state.name;
  $('player').querySelector('small').style.background = state.color;
  $('miniPlayer').style.left = state.player.x + '%';
  $('miniPlayer').style.top = state.player.y + '%';
}
function move(dir, amount = 1.1) {
  if (view === 'sky') return;
  if (state.travelScreen || $('modal').open) return;
  if (world3d) {
    state.player = world3d.move(state.player, dir, amount);
    updatePlayer();
    checkResidentGreetings();
    return;
  }
  state.player.x = Math.max(
    8,
    Math.min(94, state.player.x + (dir === 'right' ? amount : dir === 'left' ? -amount : 0)),
  );
  state.player.y = Math.max(
    10,
    Math.min(92, state.player.y + (dir === 'down' ? amount : dir === 'up' ? -amount : 0)),
  );
  updatePlayer();
  checkResidentGreetings();
}
$('rotateLeft').onclick = () => {
  if (world3d) world3d.yaw -= Math.PI / 6;
};
$('rotateRight').onclick = () => {
  if (world3d) world3d.yaw += Math.PI / 6;
};
$('followCamera').onclick = () => {
  if (!world3d) return;
  if (view === 'sky') changeView('world');
  world3d.setFollow(!world3d.follow);
  $('followCamera').setAttribute('aria-pressed', String(world3d.follow));
};
$('openSky').onclick = () => changeView('sky');
$('findMoon').onclick = () => {
  changeView('sky');
  if (!world3d) toast('Finding the moon needs the 3D world view.');
  else if (world3d.findMoon()) zoom = 3;
  else
    toast(
      'The moon is below the horizon at this location and time. Try simulated time or a different date.',
    );
};
function syncSkyControls() {
  $('skyModeSelect').value = state.skyMode === 'simulated' ? 'simulated' : 'live';
  $('skyDateInput').disabled = state.skyMode !== 'simulated';
  $('skyDateInput').value =
    state.skyDate ||
    localSkyDate(new Date(), currentLocation()?.timezone || DEFAULT_OBSERVER.timezone);
}
$('skyModeSelect').onchange = () => {
  state.skyMode = $('skyModeSelect').value === 'simulated' ? 'simulated' : 'live';
  if (!state.skyDate)
    state.skyDate = localSkyDate(
      new Date(),
      currentLocation()?.timezone || DEFAULT_OBSERVER.timezone,
    );
  syncSkyControls();
  save();
};
$('skyDateInput').onchange = () => {
  if ($('skyDateInput').value && $('skyDateInput').checkValidity?.())
    state.skyDate = $('skyDateInput').value;
  syncSkyControls();
  save();
};
syncSkyControls();
$('expandWorld').onclick = () => {
  if (document.fullscreenElement) document.exitFullscreen?.();
  else
    $('world')
      .requestFullscreen?.()
      .catch(() => toast('Fullscreen is unavailable in this browser.'));
};
let keys = new Set(),
  moveFrame = 0;
const directions = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  w: 'up',
  s: 'down',
  a: 'left',
  d: 'right',
  W: 'up',
  S: 'down',
  A: 'left',
  D: 'right',
};
document.addEventListener('keydown', (e) => {
  if (
    ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName) ||
    e.ctrlKey ||
    e.metaKey ||
    state.travelScreen
  )
    return;
  if (directions[e.key]) {
    e.preventDefault();
    keys.add(directions[e.key]);
  }
  if (e.key.toLowerCase() === 'e' && !$('modal').open) {
    e.preventDefault();
    interact();
  }
  if (e.key.toLowerCase() === 't' && !$('modal').open) {
    e.preventDefault();
    talk();
  }
});
document.addEventListener('keyup', (e) => keys.delete(directions[e.key]));
window.addEventListener('blur', () => keys.clear());
function movementFrame(t) {
  if (t - moveFrame > 30) {
    for (const dir of keys) move(dir, 0.55);
    moveFrame = t;
  }
  requestAnimationFrame(movementFrame);
}
requestAnimationFrame(movementFrame);
document.querySelectorAll('[data-move]').forEach((b) => {
  b.onpointerdown = (e) => {
    e.preventDefault();
    keys.add(b.dataset.move);
    b.setPointerCapture(e.pointerId);
  };
  b.onpointerup = b.onpointercancel = () => keys.delete(b.dataset.move);
});
// Map-unit radius around an area point where E installs devices even if a resident is close by
// (enterArea lands the technician 5 units from the point, beside that room's resident).
const INSTALL_RADIUS = 6;
function nearestArea() {
  const distance = (a) => Math.hypot(a[1] - state.player.x, a[2] - state.player.y);
  const area = allAreas().reduce((best, a) => (distance(a) < distance(best) ? a : best), areas[0]);
  return { area, distance: distance(area) };
}
// The nearest resident within talking range and not behind a wall.
function nearbyResident(engine = world3d) {
  const p = toWorld(state.player);
  return nearestCharacter(
    { x: p[0], z: p[2] },
    characterPositions(engine),
    2.2,
    engine?.model.colliders || [],
  );
}
// The resident E would talk to, or null when installing takes priority or nobody is in reach.
function talkTarget(engine = world3d) {
  return nearestArea().distance <= INSTALL_RADIUS ? null : nearbyResident(engine);
}
// T always talks, even at an install point where E installs instead.
function talk() {
  if ($('modal').open || view === 'sky') return;
  const character = nearbyResident();
  if (character) openConversation(character.key);
  else toast('Walk up to a resident to talk.');
}
$('worldTalk').onclick = talk;
function interact() {
  if ($('modal').open || view === 'sky') return;
  if (world3d?.indoorArea) {
    switchTab('inventory');
    toast('Choose a component for ' + world3d.indoorArea + '.');
    return;
  }
  const character = talkTarget();
  if (character) {
    openConversation(character.key);
    return;
  }
  const { area: near, distance } = nearestArea();
  if (distance > 13) {
    toast('Walk closer to a room, garden bed, or installation point.');
    return;
  }
  enterArea(near[0]);
  switchTab('inventory');
  toast('You’re at ' + near[0] + '. Choose a component to install.');
}
// Split shares the column; World or Code enlarges one side (wide screens only, see layout.css).
function setLayout(layout) {
  state.layout = ['split', 'world', 'code'].includes(layout) ? layout : 'split';
  $('adventureScreen').dataset.layout = state.layout;
  document
    .querySelectorAll('.layout-switch [data-layout]')
    .forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.layout === state.layout)));
  save();
}
document
  .querySelectorAll('.layout-switch [data-layout]')
  .forEach((b) => (b.onclick = () => setLayout(b.dataset.layout)));
// Share of the column given to the 3D world in Split layout (percent).
const WORLD_SHARE = { min: 25, max: 85, default: 60 };
function setWorldShare(value, persist = true) {
  const share = Math.round(
    Math.min(WORLD_SHARE.max, Math.max(WORLD_SHARE.min, Number(value) || WORLD_SHARE.default)),
  );
  state.worldShare = share;
  $('adventureScreen').style.setProperty?.('--world-share', share + '%');
  $('splitHandle').setAttribute('aria-valuenow', String(share));
  if (persist) save();
}
{
  const handle = $('splitHandle'),
    wideLayout =
      typeof matchMedia === 'function'
        ? matchMedia('(min-width: 1600px) and (min-height: 640px)')
        : null,
    updateOrientation = () =>
      handle.setAttribute('aria-orientation', wideLayout?.matches ? 'vertical' : 'horizontal'),
    shareAt = (event) => {
      const column = handle.parentElement.getBoundingClientRect();
      return wideLayout?.matches
        ? ((event.clientX - column.left) / column.width) * 100
        : ((event.clientY - column.top) / column.height) * 100;
    };
  updateOrientation();
  wideLayout?.addEventListener?.('change', updateOrientation);
  handle.onpointerdown = (e) => {
    e.preventDefault();
    handle.setPointerCapture(e.pointerId);
    handle.classList.add('dragging');
    handle.onpointermove = (move) => setWorldShare(shareAt(move), false);
  };
  handle.onpointerup = handle.onpointercancel = () => {
    handle.onpointermove = null;
    handle.classList.remove('dragging');
    setWorldShare(state.worldShare);
  };
  handle.ondblclick = () => setWorldShare(WORLD_SHARE.default);
  handle.addEventListener('keydown', (e) => {
    const step = (
      wideLayout?.matches ? { ArrowLeft: -5, ArrowRight: 5 } : { ArrowUp: -5, ArrowDown: 5 }
    )[e.key];
    if (step) setWorldShare((state.worldShare ?? WORLD_SHARE.default) + step);
    else if (e.key === 'Home') setWorldShare(WORLD_SHARE.min);
    else if (e.key === 'End') setWorldShare(WORLD_SHARE.max);
    else return;
    e.preventDefault();
  });
}
function switchTab(next) {
  // Opening a workbench tab while the world fills the column brings the workbench back.
  if (state.layout === 'world' && next !== tab) setLayout('split');
  tab = next;
  document
    .querySelectorAll('[data-tab]')
    .forEach((b) => b.classList.toggle('selected', b.dataset.tab === tab));
  renderBench();
}
document
  .querySelectorAll('[data-tab]')
  .forEach((b) => (b.onclick = () => switchTab(b.dataset.tab)));
function renderBench() {
  if (tab === 'dashboard') return renderDashboard();
  if (['circuit', 'faults', 'resources', 'export'].includes(tab)) {
    renderLabPanel(tab, labContext());
    if (tab === 'circuit') renderBoardPanel();
    return;
  }
  if (tab === 'code') renderCode();
  else if (tab === 'daylog') renderDayLog();
  else if (tab === 'inventory') renderInventory();
  else if (tab === 'wiring') renderWiring();
  else renderTests();
}
// Real board over Web Serial: its readings replace the simulated sensors (withBoard), and the
// running program's outputs can be sent back to drive real pins.
let boardReadings = null,
  boardSendOutputs = true;
const withBoard = (env) => (boardReadings ? { ...env, ...boardReadings } : env);
const boardLink = new BoardLink({
  onReadings(readings) {
    boardReadings = { ...boardReadings, ...readingsToEnv(readings) };
    state.env = withBoard(state.env);
    updateReadings();
    if ($('boardStatus')) $('boardStatus').innerHTML = boardStatusHTML();
  },
  onStatus(status) {
    if (status === 'disconnected') boardReadings = null;
    if (tab === 'circuit') renderBoardPanel();
    toast(status === 'connected' ? 'Board connected.' : 'Board disconnected.');
  },
});
const boardStatusHTML = () =>
  (boardLink.port ? '● Connected' : '○ Not connected') +
  (boardLink.port && boardLink.lastLine ? ' · <code>' + esc(boardLink.lastLine) + '</code>' : '');
function sendBoardOutputs(current = outputs) {
  if (boardLink.port && boardSendOutputs) boardLink.send(outputLine(current, project().devices));
}
function renderBoardPanel() {
  if (!$('boardPanel')) return;
  $('boardPanel').innerHTML = boardPanelHTML({
    supported: BoardLink.supported(),
    connected: !!boardLink.port,
    lastLine: boardLink.lastLine,
    sendOutputs: boardSendOutputs,
    board: state.board,
  });
  if (!BoardLink.supported()) return;
  $('boardProgram').onclick = () =>
    state.board === 'ESP32'
      ? download('iotquest-board.ino', boardProgram(project().devices, state.board))
      : download('main.py', boardProgram(project().devices, state.board));
  if ($('boardConnect'))
    $('boardConnect').onclick = () =>
      boardLink.connect().catch((e) => {
        // Closing the port picker is not an error worth reporting.
        if (e?.name !== 'NotFoundError') toast('Could not open the board: ' + e.message);
      });
  if ($('boardDisconnect'))
    $('boardDisconnect').onclick = () => {
      sendBoardOutputs({});
      boardLink.disconnect();
    };
  $('boardOutputs').onchange = () => {
    boardSendOutputs = $('boardOutputs').checked;
    // Turning sending off leaves the real pins off, not stuck at the last command.
    if (!boardSendOutputs && boardLink.port) boardLink.send(outputLine({}, project().devices));
    else sendBoardOutputs();
  };
}
// Dashboard: MQTT traffic from the running program, and controls that publish back to it.
let mqttMessages = [],
  brokerOnline = true,
  dashboardSwitches = {};
function dashboardPublish(topic, payload, client = 'dashboard') {
  if (!worker || !running) return toast('Run your program first.');
  worker.postMessage({ type: 'publish', topic, payload, client });
}
function renderDashboard() {
  const completions = currentCompletions();
  $('benchContent').innerHTML = dashboardHTML({
    quests: dashboardQuests,
    active: activeFault?.track ? activeFault : null,
    passed: Object.fromEntries(dashboardQuests.map((q) => [q.id, !!completions['fault:' + q.id]])),
    running: !!(worker && running),
    brokerOnline,
    switches: dashboardSwitches,
    messages: mqttMessages,
  });
  document
    .querySelectorAll('[data-dashboard-quest]')
    .forEach((b) => (b.onclick = () => startFault(b.dataset.dashboardQuest)));
  if ($('exitFault')) $('exitFault').onclick = exitFault;
  if ($('testFault')) $('testFault').onclick = testSolution;
  $('progressiveHint')?.addEventListener('click', () => {
    const lab = labState(),
      index = Math.min(lab.hintIndex || 0, activeFault.hints.length - 1);
    $('faultHint').textContent = activeFault.hints[index];
    lab.hintIndex = index + 1;
    save();
  });
  document.querySelectorAll('[data-publish-topic]').forEach(
    (b) =>
      (b.onclick = () => {
        const topic = b.dataset.publishTopic;
        dashboardSwitches[topic] = !dashboardSwitches[topic];
        dashboardPublish(topic, dashboardSwitches[topic] ? 1 : 0);
        renderDashboard();
      }),
  );
  $('dashSend').onsubmit = (event) => {
    event.preventDefault();
    const topic = $('dashTopic').value.trim();
    if (topic) dashboardPublish(topic, Number($('dashPayload').value), $('dashClient').value);
  };
  $('dashBroker').onchange = () => {
    brokerOnline = $('dashBroker').checked;
    worker?.postMessage({ type: 'broker', online: brokerOnline });
  };
}
function updateDashboard() {
  if ($('dashLive'))
    $('dashLive').innerHTML = dashboardLiveHTML(
      mqttMessages,
      activeFault?.track ? activeFault.widgets : [],
    );
}
// Day log: the student's program run through a simulated day, kept until the quest changes.
let dayLog = null;
function renderDayLog() {
  const devices = project().devices,
    key =
      state.activeLocation +
      '|' +
      activeKey() +
      '|' +
      state.language +
      '|' +
      devices.map((d) => d.id + ':' + d.pin).join(',');
  if (dayLog?.key !== key) dayLog = null;
  $('benchContent').innerHTML = dayLogHTML(dayLog, devices);
  $('runDay').onclick = () => {
    const scenario = $('dayScenario').value,
      errors = prerequisites();
    if (errors.length) {
      dayLog = { key, scenario, error: errors[0] };
      return renderDayLog();
    }
    const result = simulateDay(code(), state.language, devices, state.board, { scenario });
    dayLog = result.error
      ? { key, scenario, error: result.error }
      : {
          key,
          scenario,
          rows: result.rows,
          questions: dayLogQuestions(result.rows, devices),
          answers: {},
        };
    renderDayLog();
  };
  if ($('downloadDayLog'))
    $('downloadDayLog').onclick = () =>
      download(
        'iot-quest-day-log-' + dayLog.scenario + '.csv',
        dayLogCSV(dayLog.rows, devices),
        'text/csv',
      );
  document.querySelectorAll('[data-day-q]').forEach(
    (b) =>
      (b.onclick = () => {
        // The first choice counts; the explanation then shows how to read the answer.
        const q = Number(b.dataset.dayQ);
        if (dayLog.answers[q] === undefined) dayLog.answers[q] = Number(b.dataset.dayChoice);
        renderDayLog();
      }),
  );
}
// The step-by-step coding guide: explains each part of the program as the student writes it,
// checks each step against the code, and reveals hints one at a time.
let coachTimer = null;
// Hints and finished explanation steps are saved with the project (they appear in progress
// reports); the step on screen is remembered only for this session.
const coachStep = {};
function renderCoach() {
  const el = $('coach'),
    button = $('coachBtn');
  if (!el) return;
  // Teacher quests are written from scratch, so the Guide helps with them too.
  const available =
    !free &&
    (!activeFault || activeFault.track === 'custom') &&
    !huntPhase() &&
    mission().ids.length > 0;
  if (button) {
    button.hidden = !available;
    button.setAttribute('aria-pressed', String(!state.coachHidden));
  }
  el.hidden = !available || !!state.coachHidden;
  $('editorLayout')?.classList.toggle('with-coach', !el.hidden);
  if (el.hidden) return;
  const devices = project().devices.length ? project().devices : planned(),
    steps = coachSteps(mission(), state.language, devices, state.board),
    key = state.activeLocation + ':' + activeKey() + ':' + state.language,
    progress = ((project().coach ??= {})[state.language] ??= { seen: {}, hints: {} }),
    source = code(),
    results = steps.map((step) =>
      step.manual ? { done: !!progress.seen[step.key] } : step.check(source),
    ),
    firstOpen = results.findIndex((r) => !r.done),
    // Start at the first unfinished step, then stay there until the student moves on, so a
    // finished step shows its explanation and tick before Next.
    index = Math.min(
      steps.length - 1,
      (coachStep[key] ??= firstOpen < 0 ? steps.length - 1 : firstOpen),
    ),
    step = steps[index],
    result = results[index],
    shown = progress.hints[step.key] || 0,
    rich = (text) => esc(text).replace(/`([^`]+)`/g, '<code>$1</code>'),
    [lead, rule, ...more] = step.body;
  setHTML(
    el,
    '<div class="coach-head"><strong>Guide</strong><ol class="coach-steps">' +
      steps
        .map(
          (s, i) =>
            '<li><button data-coach-step="' +
            i +
            '" class="' +
            (results[i].done ? 'done' : '') +
            (i === index ? ' current' : '') +
            '"' +
            (i === index ? ' aria-current="step"' : '') +
            ' title="' +
            esc(s.title) +
            '" aria-label="Step ' +
            (i + 1) +
            ': ' +
            esc(s.title) +
            (results[i].done ? ' (done)' : '') +
            '">' +
            (results[i].done ? '✓' : i + 1) +
            '</button></li>',
        )
        .join('') +
      '</ol><button class="coach-hide" id="coachHide" aria-label="Hide the guide">✕</button></div>' +
      '<div class="coach-body"><h4>Step ' +
      (index + 1) +
      ' of ' +
      steps.length +
      ' · ' +
      esc(step.title) +
      '</h4><p>' +
      rich(lead) +
      '</p>' +
      (rule ? '<p>' + rich(rule) + '</p>' : '') +
      (more.length
        ? '<details><summary>More about this</summary>' +
          more.map((t) => '<p>' + rich(t) + '</p>').join('') +
          '</details>'
        : '') +
      '<p class="coach-task">' +
      rich(step.task) +
      '</p>' +
      (step.pattern ? '<pre class="coach-pattern">' + esc(step.pattern) + '</pre>' : '') +
      (step.hints || [])
        .slice(0, shown)
        .map((h, i) => '<p class="coach-hint"><b>Hint ' + (i + 1) + '</b> ' + rich(h) + '</p>')
        .join('') +
      (step.manual
        ? ''
        : '<p class="coach-status ' +
          (result.done ? 'ok' : 'wait') +
          '" role="status">' +
          (result.done ? '✓ ' : '') +
          rich(result.message || '') +
          '</p>') +
      '<div class="coach-nav"><button class="text-btn" id="coachBack"' +
      (index === 0 ? ' disabled' : '') +
      '>← Back</button>' +
      (step.hints && shown < step.hints.length
        ? '<button class="text-btn" id="coachHint">Hint ' +
          (shown + 1) +
          ' of ' +
          step.hints.length +
          '</button>'
        : '') +
      (index < steps.length - 1
        ? '<button class="' +
          (result.done || step.manual ? 'primary' : 'text-btn') +
          '" id="coachNext">' +
          (result.done || step.manual ? 'Next step →' : 'Skip for now →') +
          '</button>'
        : '<button class="primary" id="coachTest">Test your solution</button>') +
      '</div></div>',
  );
  const go = (i) => {
    coachStep[key] = Math.max(0, Math.min(steps.length - 1, i));
    renderCoach();
  };
  document
    .querySelectorAll('[data-coach-step]')
    .forEach((b) => (b.onclick = () => go(Number(b.dataset.coachStep))));
  $('coachHide').onclick = () => {
    state.coachHidden = true;
    save();
    renderCoach();
  };
  $('coachBack').onclick = () => go(index - 1);
  if ($('coachHint'))
    $('coachHint').onclick = () => {
      progress.hints[step.key] = shown + 1;
      renderCoach();
    };
  if ($('coachNext'))
    $('coachNext').onclick = () => {
      if (step.manual) progress.seen[step.key] = true;
      go(index + 1);
    };
  if ($('coachTest'))
    $('coachTest').onclick = () => {
      progress.seen[step.key] = true;
      switchTab('tests');
    };
}
function renderCode() {
  $('benchContent').innerHTML =
    '<div class="editor-layout" id="editorLayout"><section class="coach" id="coach" aria-label="Step-by-step coding guide" hidden></section><div class="editor-main"><div class="editor-toolbar"><div class="select-group"><select id="languageSelect" aria-label="Programming language"><option value="cpp">Arduino C++</option><option value="python">MicroPython</option></select><select id="boardSelect" aria-label="Controller"><option>ESP32</option><option>Raspberry Pi Pico</option>' +
    (completedQuestCount(state) >= 4 ||
    state.freeExploration ||
    state.board === 'Raspberry Pi Pico W'
      ? '<option>Raspberry Pi Pico W</option>'
      : '') +
    '</select><button class="text-btn" id="coachBtn" aria-pressed="true" aria-controls="coach">Guide</button><button class="text-btn" id="languageHelp">Language guide</button></div><div class="editor-actions"><button id="explainBtn" aria-pressed="false" title="Add or remove plain-English comments">Explain</button><button id="formatBtn" title="Format code (Shift+Alt+F)" aria-keyshortcuts="Shift+Alt+F">Format</button><button id="resetCode" title="Reset starter code">↺ Reset</button><button id="stopBtn">■ Stop</button><button class="primary" id="runBtn">▶ Run</button></div></div><div class="hunt-banner" id="huntBanner" hidden></div><div class="editor-wrap" id="editorWrap"><div class="line-numbers" id="lineNumbers"></div><div class="code-scroll" id="codeScroll"><pre class="highlight" id="highlight" aria-hidden="true"></pre><textarea class="code-input" id="codeInput" spellcheck="false" autocapitalize="off" aria-label="Student program code. Press Escape, then Tab, to leave the editor."></textarea></div></div><div class="diag-panel" id="diagPanel" hidden><ul id="diagList" aria-label="Code checks"></ul></div><p class="diag-message" id="diagMessage" role="status" aria-live="polite" hidden></p><div class="editor-status"><span id="editorStatus">' +
    (running ? 'Running · simulated devices connected' : 'Ready when you are') +
    '</span><button class="diag-summary" id="diagSummary" aria-expanded="false" aria-controls="diagPanel" hidden></button><span id="cursorPos">Ln 1, Col 1</span></div>' +
    SerialPlotter.markup() +
    '</div><aside class="live-panel"><div class="live-title"><span>Live readings</span><span id="liveTime">0.0 s</span></div><p>Watch your code come to life.</p><div id="liveReadings"></div><div class="serial"><div class="serial-title"><span>Serial monitor</span><button id="clearSerial">Clear</button></div><pre id="serialText"></pre></div></aside></div>';
  $('languageSelect').value = state.language;
  $('boardSelect').value = state.board;
  $('codeInput').value = code();
  $('codeInput').readOnly = labState().coopEnabled && labState().role !== 'Programmer';
  updateHighlight();
  updateReadings();
  $('codeInput').addEventListener('input', () => {
    if (!canEdit('Programmer') || huntPhase() === 'spot') {
      $('codeInput').value = code();
      return;
    }
    project().code[state.language] = $('codeInput').value;
    stop(false);
    markEdited({ typing: true });
    if (huntPhase() === 'fix') renderHunt();
    updateHighlight();
    clearTimeout(coachTimer);
    coachTimer = setTimeout(renderCoach, 350);
  });
  // Code suggestions and parameter hints (registered first: they claim Enter/Tab while open).
  attachAssist($('codeInput'), $('editorWrap'), () => ({
    enabled: state.codeSuggestions !== false,
    language: state.language,
    devices: project().devices.length ? project().devices : planned(),
  }));
  // Tab indents; Escape releases it so keyboard users can leave the editor (WCAG 2.1.2).
  let tabReleased = false;
  $('codeInput').addEventListener('keydown', (e) => {
    if (e.assistHandled) return;
    if (e.key === 'Escape') {
      tabReleased = true;
      $('editorStatus').textContent = 'Tab now moves focus. Type to resume indenting.';
      return;
    }
    if (e.key === 'Tab' && (tabReleased || e.ctrlKey || e.metaKey || e.altKey)) return;
    if (e.key !== 'Tab' && e.key !== 'Shift') tabReleased = false;
    // Read-only code (Spot the bugs, another role's turn) must not change: browsers let
    // setRangeText edit a read-only field, so the editing keys below are skipped.
    if (e.isComposing || (e.target.readOnly && e.key !== 'F8')) return;
    const el = e.target,
      unit = INDENT[state.language] || '    ',
      start = el.selectionStart,
      lineStart = el.value.lastIndexOf('\n', start - 1) + 1,
      before = el.value.slice(lineStart, start);
    if (e.key === 'F8') {
      e.preventDefault();
      nextDiagnostic();
    } else if (e.key.toLowerCase() === 'f' && e.shiftKey && e.altKey) {
      e.preventDefault();
      formatCode();
    } else if (e.key === 'Tab' && e.shiftKey) {
      // Shift+Tab removes one indentation unit from the current line.
      e.preventDefault();
      const remove = el.value.slice(lineStart).match(/^ */)[0].length;
      if (!remove) return;
      const width = Math.min(remove, unit.length);
      el.setRangeText('', lineStart, lineStart + width, 'preserve');
      el.selectionStart = el.selectionEnd = Math.max(lineStart, start - width);
      el.dispatchEvent(new Event('input'));
    } else if (e.key === 'Tab') {
      e.preventDefault();
      el.setRangeText(unit, start, el.selectionEnd, 'end');
      el.dispatchEvent(new Event('input'));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      let indent = before.match(/^ */)[0];
      const opens = /[{:]\s*$/.test(before),
        closesNext = state.language === 'cpp' && el.value[el.selectionEnd] === '}';
      if (opens) indent += unit;
      // Between a pair of braces, put the closing brace on its own line.
      const tail = opens && closesNext ? '\n' + indent.slice(unit.length) : '';
      el.setRangeText('\n' + indent + tail, start, el.selectionEnd, 'end');
      el.selectionStart = el.selectionEnd = start + 1 + indent.length;
      el.dispatchEvent(new Event('input'));
    } else if (e.key === '}' && state.language === 'cpp' && /^ +$/.test(before)) {
      // A closing brace typed on an indentation-only line steps back one level.
      e.preventDefault();
      const width = Math.min(before.length, unit.length);
      el.setRangeText('}', start - width, el.selectionEnd, 'end');
      el.dispatchEvent(new Event('input'));
    }
  });
  $('codeInput').addEventListener('blur', () => (tabReleased = false));
  $('codeInput').addEventListener('click', updateCursor);
  $('codeInput').addEventListener('keyup', updateCursor);
  $('codeInput').addEventListener('focus', updateCursor);
  $('codeScroll').onscroll = () => {
    $('lineNumbers').scrollTop = $('codeScroll').scrollTop;
  };
  $('languageSelect').onchange = () => {
    if (huntPhase()) {
      $('languageSelect').value = state.language;
      toast('Leave the bug hunt to change language.');
      return;
    }
    stop(false);
    state.language = $('languageSelect').value;
    currentPassed = false;
    testResults = [];
    save();
    renderCode();
    renderSteps();
    toast('Language changed. Your installed components and wiring are preserved.');
  };
  $('boardSelect').onchange = () => changeBoard($('boardSelect').value);
  $('coachBtn').onclick = () => {
    state.coachHidden = !state.coachHidden;
    save();
    renderCoach();
  };
  renderCoach();
  $('languageHelp').onclick = languageGuide;
  $('formatBtn').onclick = formatCode;
  $('explainBtn').onclick = toggleExplanations;
  $('explainBtn').textContent = hasExplanations(code()) ? 'Hide explanations' : 'Explain';
  $('explainBtn').setAttribute('aria-pressed', String(hasExplanations(code())));
  $('lineNumbers').onclick = (e) => {
    if (huntPhase() !== 'spot') return;
    const gutter = $('lineNumbers'),
      top = parseFloat(getComputedStyle(gutter).paddingTop) || 16;
    toggleBugFlag(Math.floor((e.offsetY + gutter.scrollTop - top) / 21) + 1);
  };
  renderHunt();
  $('resetCode').onclick = () => {
    if (!canEdit('Programmer') || blockedByHunt('Reset')) return;
    stop(false);
    project().code[state.language] = program(
      mission(),
      state.language,
      planned(),
      false,
      state.board,
    );
    // Start the Guide again from the first unfinished step.
    delete coachStep[state.activeLocation + ':' + activeKey() + ':' + state.language];
    markEdited();
    renderCode();
    toast('Starter code restored. Components and wiring are preserved.');
  };
  $('runBtn').onclick = run;
  $('stopBtn').onclick = () => stop(true);
  $('clearSerial').onclick = () => {
    logs = [];
    updateReadings();
  };
  $('diagSummary').onclick = () => {
    const open = $('diagPanel').hidden;
    $('diagPanel').hidden = !open;
    $('diagSummary').setAttribute('aria-expanded', String(open));
  };
  diagnosticsKey = '';
  renderHighlight();
  plotter ??= new SerialPlotter({
    onDownload: (csv) => download('iot-quest-plot.csv', csv, 'text/csv'),
  });
  plotter.attach({
    onClear: () => {
      plotSamples = [];
      refreshPlot();
    },
  });
  refreshPlot();
}
// Serial plotter state: samples survive Stop and tab switches, and reset when a run starts.
let plotter = null,
  plotSamples = [],
  plotPrinted = 0,
  plotThresholds = { key: null, list: [] };
function recordPlot(data) {
  let samples = data.trace;
  if (!samples) {
    const fresh = Math.min((data.printed || 0) - plotPrinted, data.logs?.length || 0);
    samples = [
      {
        t: data.time,
        inputs: data.inputs || {},
        outputs: data.outputs || {},
        scales: data.outputScales || {},
        lines: fresh > 0 ? data.logs.slice(-fresh) : [],
      },
    ];
  }
  plotPrinted = data.printed || 0;
  plotSamples.push(...samples);
  if (plotSamples.length > PLOT_LIMIT) plotSamples.splice(0, plotSamples.length - PLOT_LIMIT);
  refreshPlot();
}
function refreshPlot() {
  if (!plotter || tab !== 'code' || !$('plotLegend')) return;
  const devices = project().devices,
    source = code(),
    key = state.language + '\0' + JSON.stringify(devices.map((d) => d.pin)) + '\0' + source;
  if (plotThresholds.key !== key)
    plotThresholds = { key, list: findThresholds(source, state.language, devices) };
  plotter.update({ samples: plotSamples, devices, thresholds: plotThresholds.list, speed });
}
function updateHighlight() {
  let el = $('codeInput');
  if (!el) return;
  renderHighlight();
  $('lineNumbers').textContent = Array.from(
    { length: el.value.split('\n').length + 1 },
    (_, i) => i + 1,
  ).join('\n');
  el.style.height = Math.max(280, (el.value.split('\n').length + 2) * 21) + 'px';
  $('highlight').style.minWidth = el.scrollWidth + 'px';
  updateCursor();
}
let highlightedKey = '';
// Redraw the highlight overlay; the caret drives the current-line and bracket-match marks.
let diagnostics = [],
  diagnosticsKey = '';
// Re-run the code checks when the source, language or wiring changes.
function refreshDiagnostics(source) {
  const devices = project().devices,
    key = [
      state.language,
      JSON.stringify(devices.map((d) => [d.id, d.pin, d.output, d.signal])),
      huntPhase(),
      source,
    ].join('\0');
  if (key === diagnosticsKey) return false;
  diagnosticsKey = key;
  // While spotting bugs, the checks would give the answers away.
  diagnostics = huntPhase() === 'spot' ? [] : diagnose(source, state.language, devices);
  return true;
}
function renderHighlight() {
  const el = $('codeInput');
  if (!el || !$('highlight')) return;
  const changed = refreshDiagnostics(el.value),
    caret = el.selectionStart === el.selectionEnd ? el.selectionStart : null,
    lineClasses = huntLineClasses(),
    key = [
      state.language,
      caret,
      errorLine,
      diagnosticsKey,
      JSON.stringify([...lineClasses]),
      el.value,
    ].join('\0');
  if (changed) renderDiagnosticList();
  updateDiagnosticMessage();
  if (key === highlightedKey && $('highlight').innerHTML) return;
  highlightedKey = key;
  $('highlight').innerHTML =
    highlight(el.value, state.language, { caret, errorLine, diagnostics, lineClasses }) + '\n';
}
const diagIcon = (d) => (d.severity === 'warning' ? '⚠' : 'ⓘ');
function renderDiagnosticList() {
  const summary = $('diagSummary');
  if (!summary) return;
  const warnings = diagnostics.filter((d) => d.severity === 'warning').length,
    tips = diagnostics.length - warnings;
  summary.hidden = !diagnostics.length;
  summary.className = 'diag-summary' + (warnings ? ' has-warnings' : '');
  summary.textContent = [
    warnings ? '⚠ ' + warnings + (warnings === 1 ? ' warning' : ' warnings') : '',
    tips ? 'ⓘ ' + tips + (tips === 1 ? ' tip' : ' tips') : '',
  ]
    .filter(Boolean)
    .join(' · ');
  summary.title = 'Show code checks (F8 jumps to the next one)';
  if (!diagnostics.length) {
    $('diagPanel').hidden = true;
    summary.setAttribute('aria-expanded', 'false');
  }
  $('diagList').innerHTML = diagnostics
    .map(
      (d, i) =>
        '<li><button class="diag-item ' +
        d.severity +
        '" data-diag="' +
        i +
        '"><span>' +
        diagIcon(d) +
        ' Ln ' +
        d.line +
        '</span>' +
        esc(d.message) +
        '</button></li>',
    )
    .join('');
  document
    .querySelectorAll('[data-diag]')
    .forEach((b) => (b.onclick = () => jumpToDiagnostic(Number(b.dataset.diag))));
}
// Show the check for the caret's line under the editor, so it is readable without hovering.
function updateDiagnosticMessage() {
  const el = $('codeInput'),
    message = $('diagMessage');
  if (!el || !message) return;
  const line = el.value.slice(0, el.selectionStart).split('\n').length,
    here = diagnostics.find((d) => d.line === line);
  message.hidden = !here;
  message.className = 'diag-message ' + (here?.severity || '');
  message.textContent = here ? diagIcon(here) + ' Ln ' + here.line + ': ' + here.message : '';
}
function jumpToDiagnostic(index) {
  const d = diagnostics[index],
    el = $('codeInput');
  if (!d || !el) return;
  el.focus();
  el.selectionStart = d.start;
  el.selectionEnd = d.end;
  updateCursor();
}
function nextDiagnostic() {
  if (!diagnostics.length) return;
  const caret = $('codeInput').selectionEnd,
    next = diagnostics.findIndex((d) => d.start >= caret);
  jumpToDiagnostic(next < 0 ? 0 : next);
}
function updateCursor() {
  if (!$('codeInput')) return;
  if (huntPhase() === 'spot' && $('flagLine')) {
    const line = $('codeInput').value.slice(0, $('codeInput').selectionStart).split('\n').length;
    $('flagLine').textContent =
      (huntState().flagged.includes(line) ? 'Unflag line ' : 'Flag line ') + line;
  }
  let before = $('codeInput').value.slice(0, $('codeInput').selectionStart),
    lines = before.split('\n');
  $('cursorPos').textContent = 'Ln ' + lines.length + ', Col ' + (lines.at(-1).length + 1);
  renderHighlight();
}
// Actions that replace the program would give away (or erase) a bug hunt's answers.
function blockedByHunt(action, phases = ['spot', 'fix']) {
  if (!phases.includes(huntPhase())) return false;
  toast(action + ' is not available during Spot the bugs.');
  return true;
}
// Loads the full worked solution. Students are guided instead (see renderCoach); this remains
// for automated checks of each quest.
function loadExample() {
  if (!canEdit('Programmer') || blockedByHunt('The worked example')) return;
  let ds = project().devices.length ? project().devices : planned();
  project().code[state.language] = activeFault?.solution
    ? activeFault.solution(state.language, ds)
    : activeFault?.source
      ? activeFault.source(state.language, ds, true)
      : program(mission(), state.language, ds, true, state.board);
  stop(false);
  markEdited();
  renderCode();
}
function formatCode() {
  if (!canEdit('Programmer') || blockedByHunt('Format', ['spot'])) return;
  let formatted;
  try {
    formatted = formatSource(code(), state.language);
  } catch (e) {
    if (!(e instanceof FormatError)) throw e;
    toast('Not formatted: ' + e.message);
    return;
  }
  // The formatter normalises the final newline; ignore that alone when deciding if code changed.
  const changed = formatted.trimEnd() !== code().trimEnd();
  if (changed) {
    stop(false);
    project().code[state.language] = formatted;
    markEdited();
  }
  renderCode();
  $('codeInput')?.focus?.();
  toast(changed ? 'Code formatted. Spacing and indentation tidied.' : 'Code is already formatted.');
}
function changeBoard(board) {
  if (huntPhase()) {
    toast('Leave the bug hunt to change controller.');
    renderBench();
    return;
  }
  if (!canEdit('Installer')) {
    renderBench();
    return;
  }
  stop(false);
  const p = project(),
    previous = state.board;
  state.board = board;
  const plannedDevices = defaults(
    p.devices.map((d) => d.id),
    board,
  );
  p.devices = p.devices.map((d, i) => ({ ...d, pin: plannedDevices[i].pin }));
  // Each controller keeps its own code (its pin numbers differ), so switching back restores it.
  p.codeByBoard = { ...p.codeByBoard, [previous]: p.code };
  const kept = p.codeByBoard[board];
  delete p.codeByBoard[board];
  // A challenge starts again from its own program (the unsafe one to repair), not a blank one.
  const source = activeFault?.source || activeFault?.starter,
    rebuilt = (lang) => source(lang, plannedDevices);
  p.code = kept || (source ? { cpp: rebuilt('cpp'), python: rebuilt('python') } : {});
  // The editor shows different code now, so the Guide starts from its first unfinished step.
  for (const key of Object.keys(coachStep))
    if (key.startsWith(state.activeLocation + ':' + activeKey() + ':')) delete coachStep[key];
  markEdited();
  renderBench();
  toast(
    kept
      ? 'Controller changed. Pins were remapped and your ' + board + ' code is back.'
      : 'Controller changed. Pins were remapped and starter code loaded for ' +
          board +
          '. Your ' +
          previous +
          ' code is kept: switch back to get it.',
  );
}
function renderInventory() {
  let required = mission().ids,
    ds = project().devices;
  let sorted = [...components].sort(
    (a, b) => Number(required.includes(b.id)) - Number(required.includes(a.id)),
  );
  $('benchContent').innerHTML =
    '<div class="inventory-panel"><div class="bench-heading"><div><h3>Your component toolkit</h3><p>Explore a location, choose a device, and install it. Mission components are highlighted.</p></div><button class="outline" id="goWiring">Open wiring</button></div><div class="component-grid">' +
    sorted
      .map((c) => {
        let installed = ds.some((d) => d.id === c.id),
          unlocked =
            free ||
            required.includes(c.id) ||
            state.xp >= ADVANCED_COMPONENT_XP ||
            ['ldr', 'led', 'pir', 'porch', 'soil', 'pump', 'level'].includes(c.id);
        return (
          '<article class="component-card ' +
          (required.includes(c.id) ? 'required' : '') +
          '">' +
          (installed ? '<span class="installed-badge">✓ Installed</span>' : '') +
          '<div class="component-icon">' +
          esc(c.icon) +
          '</div><h4>' +
          esc(c.name) +
          '</h4><div class="component-label">' +
          (c.output ? 'Actuator · OUT' : c.analog ? 'Sensor · ADC' : 'Sensor · IN') +
          (required.includes(c.id) ? ' · QUEST' : '') +
          '</div><p>' +
          esc(c.desc) +
          '</p><button data-install="' +
          esc(c.id) +
          '" ' +
          (installed || !unlocked ? 'disabled' : '') +
          '>' +
          (installed
            ? 'Installed'
            : unlocked
              ? '＋ Install component'
              : 'Unlock at ' + ADVANCED_COMPONENT_XP + ' XP') +
          '</button></article>'
        );
      })
      .join('') +
    '</div></div>';
  $('goWiring').onclick = () => switchTab('wiring');
  document
    .querySelectorAll('[data-install]')
    .forEach((b) => (b.onclick = () => installDialog(b.dataset.install)));
}
function installDialog(id) {
  if (!canEdit('Installer')) return;
  let c = components.find((c) => c.id === id);
  let valid = free
    ? allAreas().map((a) => a[0])
    : [
        mission().sectionQuest || mission().communityQuest || mission().area === 'Greenhouse'
          ? mission().area
          : c.area,
      ];
  modal(
    'Install ' + c.name,
    '<div class="install-dialog"><div class="component-icon">' +
      esc(c.icon) +
      '</div><p>' +
      esc(c.desc) +
      '</p><label for="installArea">Installation point</label><select id="installArea">' +
      valid.map((a) => '<option>' + esc(a) + '</option>').join('') +
      '</select><p>Signal → GPIO &nbsp; · &nbsp; VCC → 3.3 V &nbsp; · &nbsp; GND → GND' +
      (c.resistor ? '<br>Include a ' + esc(c.resistor) + ' resistor.' : '') +
      '</p><button class="primary" id="confirmInstall">Install here</button></div>',
  );
  $('confirmInstall').onclick = () => {
    const area = $('installArea').value;
    if (nativeAreas().some((a) => a[0] === area)) enterArea(area, { keepProject: true });
    if (project().devices.some((d) => d.id === id)) {
      $('modal').close();
      return;
    }
    const base =
      planned().find((d) => d.id === id) ||
      defaults([...project().devices.map((d) => d.id), id], state.board).at(-1);
    project().devices.push({
      ...base,
      area,
      power: false,
      ground: false,
      resistorConnected: false,
    });
    enterArea(area, { keepProject: true });
    $('modal').close();
    markEdited();
    renderBench();
    renderSteps();
    renderEffects();
    save();
    toast(c.name + ' installed in ' + area + '. Connect it in Wiring.');
  };
}
function renderWiring() {
  let ds = project().devices,
    errors = validate(ds, state.board);
  $('benchContent').innerHTML =
    '<div class="wiring-panel"><div class="bench-heading"><div><h3>Make the connections</h3><p>Assign each signal to a GPIO. Connect power and ground; add the indicated resistor.</p></div><select class="board-select" id="wireBoard" aria-label="Controller"><option>ESP32</option><option>Raspberry Pi Pico</option>' +
    (completedQuestCount(state) >= 4 ||
    state.freeExploration ||
    state.board === 'Raspberry Pi Pico W'
      ? '<option>Raspberry Pi Pico W</option>'
      : '') +
    '</select></div><div class="wiring-layout"><div class="board-card"><div class="board-graphic"><strong>' +
    esc(state.board) +
    '</strong><div class="board-chip">MCU</div><small>3.3 V &nbsp; GND &nbsp; GPIO</small></div><p>' +
    (state.board === 'ESP32'
      ? 'ADC: 32, 33, 34, 35, 36, 39.<br>34–39 are input-only.<br>GPIO 6–11 are reserved for flash.'
      : 'ADC: 26, 27, 28.<br>Digital I/O and PWM: 0–28.<br>GPIO 29 is not exposed.') +
    '<br>All signals use 3.3 V logic.</p></div><div>' +
    (!ds.length
      ? '<div class="empty-bench">No components installed yet. Open Components and install the devices for your quest.</div>'
      : ds
          .map(
            (d) =>
              '<div class="wiring-row"><div><strong>' +
              esc(d.icon) +
              ' ' +
              esc(d.name) +
              '</strong><small>' +
              esc(d.area) +
              ' · ' +
              (d.output ? 'OUT / PWM' : d.analog ? 'ADC input' : 'Digital input') +
              '</small></div><label>Signal pin<input type="number" min="0" max="39" data-pin="' +
              esc(d.id) +
              '" value="' +
              esc(d.pin) +
              '" aria-label="' +
              esc(d.name) +
              ' signal pin"></label><label><input type="checkbox" data-wire="' +
              esc(d.id) +
              '" data-field="power" ' +
              (d.power ? 'checked' : '') +
              '> 3.3 V</label><label><input type="checkbox" data-wire="' +
              esc(d.id) +
              '" data-field="ground" ' +
              (d.ground ? 'checked' : '') +
              '> GND</label><label class="resistor-label">' +
              (d.resistor
                ? '<input type="checkbox" data-wire="' +
                  esc(d.id) +
                  '" data-field="resistorConnected" ' +
                  (d.resistorConnected ? 'checked' : '') +
                  '> ' +
                  esc(d.resistor)
                : 'Driver<br>included') +
              '</label><button class="remove" data-remove="' +
              esc(d.id) +
              '" aria-label="Remove ' +
              esc(d.name) +
              '">×</button></div>',
          )
          .join('')) +
    '<div id="wireErrors">' +
    (errors.length
      ? '<div class="wire-error">' + errors.map(esc).join('<br>') + '</div>'
      : ds.length
        ? '<div class="wire-good">✓ All connections are valid. GPIO numbers in your code must match this panel.</div>'
        : '') +
    '</div><div class="bench-heading" style="margin-top:20px"><button class="outline" id="connectAll">Connect recommended circuit</button><button class="primary" id="goCode">Open code editor</button></div></div></div></div>';
  $('wireBoard').value = state.board;
  $('wireBoard').onchange = () => changeBoard($('wireBoard').value);
  $('connectAll').onclick = () => {
    if (!canEdit('Installer')) return;
    const defs = defaults(
      ds.map((d) => d.id),
      state.board,
    );
    ds.forEach((d, i) => {
      d.pin = defs[i].pin;
      d.power = true;
      d.ground = true;
      d.resistorConnected = !!d.resistor;
    });
    stop(false);
    markEdited();
    renderWiring();
    renderSteps();
    toast('Power, ground, and resistors connected. Review the signal pins before running.');
  };
  $('goCode').onclick = () => switchTab('code');
  document.querySelectorAll('[data-pin]').forEach(
    (el) =>
      (el.onchange = () => {
        if (!canEdit('Installer')) {
          renderWiring();
          return;
        }
        let d = ds.find((d) => d.id === el.dataset.pin);
        d.pin = Number(el.value);
        stop(false);
        markEdited();
        renderWiring();
      }),
  );
  document.querySelectorAll('[data-wire]').forEach(
    (el) =>
      (el.onchange = () => {
        if (!canEdit('Installer')) {
          renderWiring();
          return;
        }
        let d = ds.find((d) => d.id === el.dataset.wire);
        d[el.dataset.field] = el.checked;
        stop(false);
        markEdited();
        renderWiring();
      }),
  );
  document.querySelectorAll('[data-remove]').forEach(
    (el) =>
      (el.onclick = () => {
        if (!canEdit('Installer')) return;
        stop(false);
        project().devices = ds.filter((d) => d.id !== el.dataset.remove);
        markEdited();
        renderWiring();
        renderEffects();
      }),
  );
}
function prerequisites() {
  let ds = project().devices;
  let missing = mission().ids.filter((id) => !ds.some((d) => d.id === id));
  if (missing.length)
    return [
      'Install ' + missing.map((id) => components.find((c) => c.id === id).name).join(', ') + '.',
    ];
  if (!ds.length) return ['Install at least one component first.'];
  return validate(ds, state.board);
}
const START_TIMEOUT_MS = 15000,
  TICK_TIMEOUT_MS = 10000;
function run() {
  if (!canEdit('Tester')) return;
  state.debugPaused = false;
  stop(false);
  labState().paused = false;
  if (speed === 0) setClockSpeed(1);
  let errors = prerequisites();
  if (errors.length) {
    logs = errors.map((e) => 'Connection: ' + e);
    switchTab('wiring');
    toast(errors[0]);
    return;
  }
  running = true;
  errorLine = null;
  plotSamples = [];
  plotPrinted = 0;
  renderHighlight();
  logs = ['Controller connected. Program started.'];
  simTime = 0;
  worker = new Worker('sim-worker.js', { type: 'module' });
  // Each run starts with a fresh broker: no messages, network online, switches off.
  mqttMessages = [];
  brokerOnline = true;
  dashboardSwitches = {};
  worker.onmessage = ({ data }) => {
    clearTimeout(watchdog);
    inFlight = false;
    if (data.type === 'error') {
      logs.push('Error' + (data.line ? ' at line ' + data.line : '') + ': ' + data.message);
      errorLine = data.line || null;
      renderHighlight();
      stop(false);
      toast(data.message);
      updateReadings();
      return;
    }
    outputs = data.outputs;
    sendBoardOutputs();
    if (data.messages) {
      mqttMessages = data.messages;
      if (tab === 'dashboard') updateDashboard();
    }
    simTime = data.time;
    lastInputs = data.inputs || {};
    outputKinds = data.outputKinds || {};
    outputScales = data.outputScales || {};
    inspectionVariables = data.variables || {};
    if (data.env) {
      const changes = requestEnv
        ? Object.fromEntries(
            Object.entries(state.env).filter(([key, value]) => !Object.is(value, requestEnv[key])),
          )
        : {};
      state.env = withBoard({ ...data.env, ...changes });
    }
    if (data.lab) {
      adoptSimulatedLab(data.lab);
      labState().paused = !!state.debugPaused || speed === 0;
    }
    if (data.tickComplete) {
      const lab = labState();
      lab.resources = updateResources(
        lab.resources,
        project().devices,
        outputs,
        state.env,
        0.2,
        lab.upgrades,
        outputScales,
      );
      state.env = withBoard(
        advanceEnvironment(state.env, project().devices, outputs, 0.2, {
          scales: outputScales,
          mode: state.weatherMode,
          weather: state.weatherByLocation[state.activeLocation],
          location: currentLocation(),
        }),
      );
      lab.elapsedMs += 200;
    }
    refreshDebugView(data.line);
    updateLabViews();
    recordPlot(data);
    logs = [
      state.debugPaused
        ? 'Controller paused. Step to advance actual execution.'
        : 'Program running on ' + state.board + '.',
      ...data.logs,
      ...(isNativeCommunityProject()
        ? (world3d?.model.community?.sim.signals.messages || []).map(
            (reason) => 'Traffic interlock: ' + reason,
          )
        : []),
      ...(data.pendingLine ? [data.pendingLine] : []),
    ];
    renderEffects();
    updateReadings();
  };
  worker.onerror = (e) => {
    logs.push('Error: ' + e.message);
    stop(false);
    updateReadings();
  };
  inFlight = true;
  // Only this run's interlock rejections are shown in the Serial log.
  if (world3d?.model.community) world3d.model.community.sim.signals.messages = [];
  refreshCommunityInputs();
  requestEnv = { ...state.env };
  worker.postMessage({
    type: 'start',
    code: code(),
    language: state.language,
    devices: project().devices,
    board: state.board,
    env: state.env,
    ms: 200,
    ...batchOptions(1),
    trace: true,
  });
  // A backstop for a worker that stops answering: the runtime itself stops infinite loops with
  // "Execution limit reached". The first answer includes loading the worker and compiling the
  // program, which takes several seconds on a slow Chromebook, so allow plenty of time.
  watchdog = setTimeout(() => {
    logs.push('Error: execution timed out.');
    stop(false);
    updateReadings();
  }, START_TIMEOUT_MS);
  renderSteps();
  updateReadings();
  if (tab === 'dashboard') renderDashboard();
  toast('Your program is running. Try changing the conditions.');
}
// Callers refresh the community inputs first, so state.env holds this step's readings.
function batchOptions(count = speed) {
  return {
    env: state.env,
    lab: labState(),
    devices: project().devices,
    mode: currentLocation() ? state.weatherMode : 'practice',
    weather: state.weatherByLocation[state.activeLocation] || null,
    location: currentLocation(),
    count,
    dtMs: 200,
    routines: !!state.routinesEnabled,
  };
}
function advanceWorld() {
  if (labState().paused || speed === 0) return;
  const passive = {
    outputs: {},
    logs: [],
    time: labState().elapsedMs,
    step(env, ms) {
      this.time += ms;
      return { outputs: {}, logs: [], time: this.time };
    },
  };
  refreshCommunityInputs();
  const result = simulateBatch(passive, batchOptions());
  state.env = withBoard(result.env);
  adoptSimulatedLab(result.lab);
  updateReadings();
  renderEffects();
  updateLabViews();
}
function tick() {
  if (!worker || !running || inFlight || labState().paused || speed === 0) return;
  inFlight = true;
  refreshCommunityInputs();
  requestEnv = { ...state.env };
  worker.postMessage({ type: 'tick', ...batchOptions(), trace: true });
  watchdog = setTimeout(() => {
    logs.push('Error: execution timed out.');
    stop(false);
    updateReadings();
  }, TICK_TIMEOUT_MS);
}

function stop(notify = false) {
  clearInterval(timer);
  clearTimeout(watchdog);
  worker?.terminate();
  worker = null;
  running = false;
  inFlight = false;
  requestEnv = null;
  outputs = {};
  lastInputs = {};
  outputKinds = {};
  outputScales = {};
  sendBoardOutputs({});
  renderEffects();
  renderSteps();
  updateReadings();
  if (tab === 'dashboard') renderDashboard();
  if (notify) {
    logs.push('Stopped. Outputs reset to OFF.');
    updateReadings();
    toast('Simulation stopped. All outputs are off.');
  }
}
const isNight = () =>
  currentLocation() && state.weatherMode === 'live' && typeof state.env.isDay === 'boolean'
    ? !state.env.isDay
    : state.env.light < 44;
// Day / Night switch: sets the simulated light level, so students can check that their
// circuits respond, and moves the simulated clock to 12:00 or 22:00 so the clock, the daily
// cycle and resident routines agree. Live weather follows the real sky, so it switches to
// Practice first.
function setDayNight(night) {
  if (currentLocation() && state.weatherMode === 'live') {
    setWeatherMode('practice');
    toast('Switched to Practice Weather so you can choose day or night.');
  }
  const lab = labState(),
    hoursRun = lab.elapsedMs / 3600000;
  lab.startHour = ((((night ? 22 : 12) - hoursRun) % 24) + 24) % 24;
  state.env = { ...state.env, light: night ? 4 : 85, isDay: !night };
  situationAlert = null;
  situationAlertQuiet = true;
  renderEnvironment();
  updateReadings();
  situationAlertQuiet = false;
  renderEffects();
  updateClockLabel();
  save();
  // Say who now needs what, if the switch made a request urgent.
  toast(
    (night ? '☾ Night: it is dark outside. ' : '☀ Day: the sun is up. ') +
      (situationAlert || (night ? 'Do your lights come on?' : '')),
  );
}
$('dayNightToggle').onclick = () => setDayNight(!isNight());
// Needed now: residents' requests that the current conditions make urgent (see situation.js).
// Rechecked with every reading; the note and the alert only change when the situation does.
let situationKey = null,
  situationIndices = null,
  situationLocation = null,
  situationAlert = null,
  // Set while needs are not shown (a fault or free build), and while a caller toasts the alert.
  situationPaused = false,
  situationAlertQuiet = false;
function currentNeeds() {
  if (free || activeFault) return [];
  return neededNow(activeMissions(), state.env, (i) => !!currentCompletions()[missionKey(i)]);
}
function checkSituation() {
  const needs = currentNeeds(),
    key = state.activeLocation + '|' + needs.map((n) => n.index + n.reason.text).join('|');
  if (key === situationKey) return;
  // The first check after arriving somewhere sets the scene quietly; later changes are announced.
  // Coming back from a fault or free build is like arriving: nothing changed outside.
  const arrived = situationLocation !== state.activeLocation || situationPaused,
    fresh = !arrived && situationIndices && needs.filter((n) => !situationIndices.has(n.index));
  situationLocation = state.activeLocation;
  situationPaused = !!(free || activeFault);
  situationKey = key;
  situationIndices = new Set(needs.map((n) => n.index));
  renderSituation(needs);
  situationAlert = fresh?.length
    ? fresh[0].reason.icon +
      ' ' +
      fresh[0].reason.text +
      ': ' +
      fresh[0].quest.resident +
      ' needs “' +
      fresh[0].quest.title +
      '”' +
      (fresh.length > 1 ? ' (and ' + (fresh.length - 1) + ' more).' : '.')
    : null;
  if (situationAlert && !situationAlertQuiet) toast(situationAlert);
}
function renderSituation(needs = currentNeeds()) {
  $('neededNow').hidden = !needs.length;
  $('neededNow').innerHTML = needs.length
    ? '<strong>Needed now</strong>' +
      needs
        .slice(0, 4)
        .map(
          (n) =>
            '<button class="needed-request' +
            (n.index === state.mission ? ' current' : '') +
            '" data-needed-quest="' +
            n.index +
            '"><span aria-hidden="true">' +
            esc(n.reason.icon) +
            '</span><span><small>' +
            esc(n.reason.text) +
            '</small>' +
            esc(n.quest.resident) +
            ': ' +
            esc(n.quest.title) +
            (n.index === state.mission ? ' · your quest' : '') +
            '</span></button>',
        )
        .join('') +
      (needs.length > 4 ? '<small>and ' + (needs.length - 4) + ' more in All quests</small>' : '')
    : '';
  document
    .querySelectorAll('[data-needed-quest]')
    .forEach((b) => (b.onclick = () => selectMission(Number(b.dataset.neededQuest))));
  const reason = free || activeFault ? null : situationReason(mission(), state.env);
  $('situationLine').hidden = !reason;
  $('situationLine').textContent = reason
    ? reason.icon + ' ' + reason.text + ', so ' + mission().resident + ' needs this now.'
    : '';
}
function updateReadings() {
  checkSituation();
  const dark = isNight();
  $('dayLabel').textContent = dark ? 'Nighttime' : 'Daytime';
  $('dayIcon').textContent = dark ? '☾' : '☀';
  $('dayNightToggle').setAttribute('aria-pressed', String(dark));
  $('dayNightToggle').title = dark ? 'Switch to day' : 'Switch to night';
  for (const [signal, meta] of Object.entries(envMeta)) {
    if ($('value-' + signal))
      $('value-' + signal).textContent = Math.round(state.env[signal]) + meta[2];
    let range = $('env-' + signal);
    if (range && document.activeElement !== range) range.value = state.env[signal];
  }
  if (!$('liveReadings')) return;
  let inputs = project().devices.filter((d) => !d.output),
    outs = project().devices.filter((d) => d.output);
  let readings = inputs.length ? inputs : planned().filter((d) => !d.output);
  setHTML(
    $('liveReadings'),
    readings
      .map((d) => {
        let raw =
          lastInputs[d.pin] ??
          (d.analog && ADC_SIGNALS.includes(d.signal)
            ? Math.round(state.env[d.signal] * ADC_SCALE)
            : state.env[d.signal]);
        return (
          '<div class="live-reading"><span>' +
          esc(d.icon) +
          ' &nbsp; ' +
          esc(d.name) +
          '</span><strong>' +
          esc(raw) +
          (d.signal === 'temp' ? '°' : '') +
          '</strong></div>'
        );
      })
      .join('') +
      outs
        .map(
          (d) =>
            '<div class="live-reading"><span>' +
            esc(d.icon) +
            ' &nbsp; ' +
            esc(d.name) +
            '</span><strong class="output-state ' +
            ((outputs[d.pin] || 0) > 0 ? 'on' : '') +
            '">' +
            ((outputs[d.pin] || 0) > 0 ? 'ON' : 'OFF') +
            '</strong></div>',
        )
        .join(''),
  );
  $('liveTime').textContent = (simTime / 1000).toFixed(1) + ' s';
  $('serialText').textContent = logs.length
    ? logs.slice(-12).join('\n')
    : project().devices.length
      ? 'Ready. Run your code to connect the controller.'
      : 'Install your devices, then connect the circuit in Wiring.';
  $('serialText').classList.toggle(
    'error',
    logs.some((x) => /^Error(?: at line \d+)?:/.test(x)),
  );
  if ($('editorStatus'))
    $('editorStatus').textContent = running
      ? state.debugPaused || labState().paused
        ? 'Paused · inspect or step your program'
        : 'Running · ' + state.board + ' connected'
      : logs.some((x) => /^Error(?: at line \d+)?:/.test(x))
        ? 'Stopped · program error. See Serial monitor.'
        : 'Ready when you are';
}
function renderEffects() {
  $('nightShade').style.opacity = String(Math.max(0, (44 - state.env.light) / 60));
  $('rainEffect').style.opacity = String(state.env.rain / 100);
  let html = '';
  for (const d of project().devices) {
    const area = allAreas().find((a) => a[0] === d.area) || areas[9];
    let x = area[1],
      y = area[2],
      on = (outputs[d.pin] || 0) > 0;
    const peers = project().devices.filter((p) => p.area === d.area),
      index = peers.indexOf(d);
    x += (index % 3) * 3 - 2;
    y += Math.floor(index / 3) * 4 + 4;
    let effect = '';
    if (['led', 'porch', 'rgb'].includes(d.id) && on)
      effect =
        '<div class="lamp-glow" style="' +
        (d.id === 'rgb'
          ? 'background:radial-gradient(circle,' + esc(state.color) + 'bb,transparent 68%);'
          : '') +
        'opacity:' +
        outputLevel(outputs[d.pin], outputScales[d.pin]) +
        '"></div>';
    if (d.id === 'fan')
      effect =
        '<span class="fan-rotor ' +
        (on ? 'spinning' : '') +
        '" style="animation-duration:' +
        Math.max(0.15, 1 / Math.max(1, 5.1 * outputLevel(outputs[d.pin], outputScales[d.pin]))) +
        's">✣</span>';
    if (['pump', 'valve'].includes(d.id) && on && state.env.tank > 0)
      effect = '<div class="water-flow"></div>';
    if (d.id === 'buzzer' && on) effect = '<span class="buzzer-alert">◉</span>';
    if (['servo', 'gate'].includes(d.id))
      effect =
        '<span class="servo-door" style="transform:rotate(' +
        (d.id === 'gate' && on ? 90 : Math.min(180, outputs[d.pin] || 0)) +
        'deg)"></span>';
    if (d.id === 'level')
      effect = '<div class="tank-meter"><i style="height:' + state.env.tank + '%"></i></div>';
    if (d.id === 'soil')
      effect =
        '<span class="plant-status ' +
        (state.env.soil < 30 ? 'dry' : state.env.soil > 85 ? 'wet' : '') +
        '">' +
        (state.env.soil < 30
          ? 'Dry plants'
          : state.env.soil > 85
            ? 'Overwatered'
            : 'Healthy plants') +
        '</span>';
    if (d.id === 'ac' && on) effect = '<span class="buzzer-alert" style="color:#b0d5ee">❄</span>';
    html +=
      '<div class="device-effect" style="left:' +
      x +
      '%;top:' +
      y +
      '%">' +
      effect +
      '<span class="device-label ' +
      (on ? 'on' : '') +
      '">' +
      esc(d.icon) +
      ' ' +
      (d.output ? (on ? 'ON' : 'OFF') : 'GPIO ' + esc(d.pin)) +
      '</span></div>';
  }
  if (project().devices.some((d) => d.id === 'led' && (outputs[d.pin] || 0) > 0)) {
    for (const [x, y] of [
      [35, 51],
      [44, 49],
      [39, 69],
      [53, 73],
      [58, 69],
    ])
      html +=
        '<div class="device-effect" style="left:' +
        x +
        '%;top:' +
        y +
        '%"><div class="lamp-glow"></div></div>';
  }
  setHTML($('deviceEffects'), html);
  if (state.sound && project().devices.some((d) => d.id === 'buzzer' && (outputs[d.pin] || 0) > 0))
    beep();
}
let audio,
  lastBeep = 0;
function beep() {
  if (Date.now() - lastBeep < 1500) return;
  lastBeep = Date.now();
  try {
    audio ??= new (window.AudioContext || window.webkitAudioContext)();
    const o = audio.createOscillator(),
      g = audio.createGain();
    o.frequency.value = 620;
    g.gain.value = 0.035;
    o.connect(g);
    g.connect(audio.destination);
    o.start();
    o.stop(audio.currentTime + 0.15);
  } catch {}
}
function testSolution() {
  if (!canEdit('Tester')) return;
  labState().testAttempts = (labState().testAttempts || 0) + 1;
  if (currentLocation() && state.weatherMode === 'live') {
    setWeatherMode('practice');
    toast('Mission tests use repeatable Practice Weather scenarios.');
  }
  if (free) {
    run();
    return;
  }
  stop(false);
  const errors = prerequisites();
  if (errors.length) {
    testResults = [{ name: 'Circuit validation', pass: false, detail: errors.join(' ') }];
    currentPassed = false;
    switchTab('tests');
    toast('Finish the circuit before running mission tests.');
    return;
  }
  testResults = [];
  const m = mission(),
    ds = project().devices,
    outs = ds.filter((d) => d.output);
  // Connected challenges (security repairs, dashboard quests) bring their own MQTT tests.
  if (activeFault?.tests) testResults = activeFault.tests(code(), state.language, ds, state.board);
  else {
    let assessment = createLabState().resources;
    try {
      const runtime = new Runtime(code(), state.language, ds, state.board),
        // Limit checks test every threshold from both sides; they are not part of the
        // energy and water budget, which is measured over the quest's own scenarios.
        limitChecks = boundaryScenarios(m, baseEnv);
      for (const [name, env, expected] of [...m.scenarios, ...limitChecks]) {
        let result;
        const budgeted = !limitChecks.some((c) => c[0] === name);
        for (let i = 0; i < 25; i++) {
          result = runtime.step({ ...baseEnv, ...env });
          if (budgeted)
            assessment = updateResources(
              assessment,
              ds,
              result.outputs,
              { ...baseEnv, ...env },
              0.2,
              undefined,
              result.outputScales,
            );
        }
        let actual = m.ids
          .map((id) => ds.find((d) => d.id === id))
          .filter((d) => d.output)
          .map((d) => ((result.outputs[d.pin] || 0) > 0 ? 1 : 0));
        let pass = expected.every((v, i) => v === actual[i]);
        testResults.push({
          name,
          pass,
          detail:
            'Expected ' +
            expected.map((v) => (v ? 'ON' : 'OFF')).join(', ') +
            ' · observed ' +
            actual.map((v) => (v ? 'ON' : 'OFF')).join(', '),
          env,
        });
      }
      if (!activeFault && state.mission === 2) {
        const dynamic = new Runtime(code(), state.language, ds, state.board);
        let env = { ...baseEnv, soil: 20, tank: 80 },
          first = false,
          reached = false,
          stopped = false;
        const pump = ds.find((d) => d.id === 'pump');
        for (let i = 0; i < 220; i++) {
          let r = dynamic.step(env);
          assessment = updateResources(
            assessment,
            ds,
            r.outputs,
            env,
            0.2,
            undefined,
            r.outputScales,
          );
          let on = (r.outputs[pump.pin] || 0) > 0;
          if (i === 0) first = on;
          if (on && env.tank > 0) {
            env.soil += 0.5;
            env.tank -= 0.2;
          }
          if (Math.round(env.soil * ADC_SCALE) >= 2400) {
            reached = true;
            if (!on) stopped = true;
          }
        }
        testResults.push({
          name: 'Water reaches target and stops',
          pass: first && reached && stopped && env.soil < 65,
          detail:
            'Final soil: ' +
            env.soil.toFixed(1) +
            '%. Pump must start dry, reach the target, and switch off before overwatering.',
        });
      }
    } catch (e) {
      testResults.push({ name: 'Program execution', pass: false, detail: e.message });
    }
    const budget = missionBudget(m);
    testResults.push({
      name: 'Energy and water budget',
      pass: assessment.wh <= budget.wh && assessment.litres <= budget.litres,
      detail:
        assessment.wh.toFixed(3) +
        ' / ' +
        budget.wh +
        ' Wh · ' +
        assessment.litres.toFixed(2) +
        ' / ' +
        budget.litres +
        ' L across 5-second scenarios and the irrigation feedback test',
    });
    labState().assessment = { budget, consumption: assessment };
  }
  currentPassed = testResults.length > 0 && testResults.every((r) => r.pass);
  if (currentPassed) {
    if (!currentCompletions()[completionKey()]) {
      state.xp += m.xp;
      currentCompletions()[completionKey()] = {
        badge: m.badge,
        xp: m.xp,
        date: new Date().toISOString(),
        language: state.language,
        board: state.board,
        code: code(),
        devices: structuredClone(ds),
        results: structuredClone(testResults),
        // Passing code that arrived by import (and has not been edited since) is flagged.
        imported: importedUnedited(),
      };
    }
    logs = [m.resident + ': Great work! ' + m.title + ' is complete.'];
    toast('✦ Quest complete! ' + m.badge + ' badge · ' + m.xp + ' XP');
  } else {
    logs = ['Tests found something to improve. Review the failed scenarios.'];
    toast('Some scenarios failed. Check the conditions and try again.');
  }
  recordEvidence({
    at: new Date().toISOString(),
    type: 'test',
    passed: currentPassed,
    results: structuredClone(testResults),
    code: code(),
    devices: structuredClone(ds),
    board: state.board,
  });
  if (currentPassed && activeFault) logs.push(activeFault.explain);
  save();
  $('xp').textContent = state.xp;
  renderSteps();
  switchTab('tests');
}
$('testMission').onclick = testSolution;
function renderTests() {
  let m = mission();
  $('benchContent').innerHTML =
    '<div class="tests-panel"><div class="bench-heading"><div><h3>' +
    esc(m.title) +
    ' · mission tests</h3><p>' +
    esc(m.goal) +
    '</p></div><button class="primary" id="testAgain">▶ Run all tests</button></div>' +
    (!testResults.length
      ? '<div class="empty-bench">Your solution is tested against normal conditions, exact thresholds, and relevant failures. Install and wire the components, then test your code.</div>'
      : testResults
          .map(
            (r) =>
              '<div class="test-row"><div><strong>' +
              esc(r.name) +
              '</strong><small>' +
              esc(r.detail) +
              '</small></div><span class="' +
              (r.pass ? 'passed' : 'failed') +
              '">' +
              (r.pass ? '✓ Passed' : '× Failed') +
              '</span></div>',
          )
          .join('') +
        '<div class="test-summary ' +
        (currentPassed ? '' : 'fail') +
        '">' +
        (currentPassed
          ? '✓ All scenarios passed. ' +
            esc(m.resident) +
            ' says: “That’s exactly what I needed!” Your ' +
            esc(m.badge) +
            ' badge is saved.'
          : 'Keep going: ' +
            testResults.filter((r) => r.pass).length +
            ' of ' +
            testResults.length +
            ' tests passed. ' +
            esc(m.hint)) +
        '</div>') +
    (currentPassed && activeFault
      ? '<p class="repair-explanation">' + esc(activeFault.explain) + '</p>'
      : '') +
    (!free && !activeFault && solvedOwnCode(state.mission)
      ? '<section class="understand" id="understanding" aria-labelledby="understandTitle"></section>'
      : '') +
    '<div class="bench-heading"><button class="outline" id="backCode">Back to code</button>' +
    (currentPassed && !activeFault && state.mission < activeMissions().length - 1
      ? '<button class="primary" id="nextMission">Next quest</button>'
      : solvedOwnCode(state.mission)
        ? '<button class="outline" id="debugBtn">Try a debugging challenge</button>'
        : '') +
    (free || activeFault ? '' : '<button class="outline" id="huntBtn">Spot the bugs</button>') +
    '</div></div>';
  $('testAgain').onclick = testSolution;
  renderUnderstanding();
  $('backCode').onclick = () => switchTab('code');
  if ($('nextMission')) $('nextMission').onclick = () => selectMission(state.mission + 1);
  if ($('debugBtn')) $('debugBtn').onclick = debugChallenge;
  if ($('huntBtn')) $('huntBtn').onclick = () => ownCodeFirst(state.mission) && startBugHunt();
}
// "Check your understanding": questions about the passed quest. Answers are saved with the
// quest's completion record (and appear in progress reports); a right first try earns XP.
const understandView = {};
function renderUnderstanding() {
  const el = $('understanding');
  if (!el) return;
  const done = currentCompletions()[completionKey()],
    language = done?.language === 'python' ? 'python' : done?.language ? 'cpp' : state.language,
    devices = done?.devices?.length
      ? done.devices
      : project().devices.length
        ? project().devices
        : planned(),
    questions = understandingQuestions(mission(), language, devices, state.board);
  if (!done || !questions.length) {
    el.hidden = true;
    return;
  }
  const record = (done.understanding ??= {}),
    answers = record.answers || {},
    key = state.activeLocation + ':' + completionKey(),
    firstOpen = questions.findIndex((q) => !answers[q.id]?.solved),
    index = (understandView[key] ??= firstOpen < 0 ? questions.length : firstOpen),
    score = understandingScore(record, questions.length),
    rich = (text) => esc(text).replace(/`([^`]+)`/g, '<code>$1</code>'),
    heading =
      '<h4 id="understandTitle">Check your understanding</h4><p class="u-progress">' +
      (index < questions.length
        ? 'Question ' + (index + 1) + ' of ' + questions.length + ' · '
        : '') +
      score.right +
      ' right first time' +
      (record.xp ? ' · +' + record.xp + ' XP' : '') +
      '</p>';
  if (index >= questions.length) {
    setHTML(
      el,
      heading +
        '<p>You answered all ' +
        questions.length +
        ' questions and got <strong>' +
        score.right +
        ' of ' +
        questions.length +
        '</strong> right first time.' +
        (score.right < questions.length
          ? ' Read the explanations again for the ones you missed, then try the simulation at the threshold.'
          : ' Excellent: you understand how your program works.') +
        '</p><ul class="u-summary">' +
        questions
          .map((q) => '<li>' + (answers[q.id]?.first ? '✓ ' : '↺ ') + rich(q.prompt) + '</li>')
          .join('') +
        '</ul><button class="outline" id="understandReview">Review the questions</button>',
    );
    $('understandReview').onclick = () => {
      understandView[key] = 0;
      renderUnderstanding();
    };
    return;
  }
  const q = questions[index],
    a = answers[q.id],
    chosen = a?.last,
    solved = !!a?.solved;
  setHTML(
    el,
    heading +
      '<p class="u-prompt">' +
      rich(q.prompt) +
      '</p><div class="u-choices" role="group" aria-label="Answers">' +
      q.choices
        .map(
          (c, i) =>
            '<button class="u-choice' +
            (i === chosen ? (i === q.answer ? ' right' : ' wrong') : '') +
            (solved && i === q.answer ? ' right' : '') +
            '" data-u-choice="' +
            i +
            '" aria-pressed="' +
            (i === chosen) +
            '">' +
            rich(c.text) +
            '</button>',
        )
        .join('') +
      '</div>' +
      (chosen !== undefined
        ? '<p class="u-feedback ' +
          (chosen === q.answer ? 'ok' : 'no') +
          '" role="status">' +
          (chosen === q.answer ? '✓ Correct. ' : 'Not quite. ') +
          rich(q.choices[chosen].why.replace(/^Right\. /, '')) +
          (chosen === q.answer ? '' : ' Try another answer.') +
          '</p>'
        : '') +
      (solved
        ? '<button class="primary" id="understandNext">' +
          (index < questions.length - 1 ? 'Next question →' : 'See your results') +
          '</button>'
        : ''),
  );
  document.querySelectorAll('[data-u-choice]').forEach(
    (b) =>
      (b.onclick = () => {
        const result = answerQuestion(record, q, Number(b.dataset.uChoice));
        if (result.xp) {
          state.xp += result.xp;
          record.xp = (record.xp || 0) + result.xp;
          $('xp').textContent = state.xp;
          toast('✦ Right first time · +' + result.xp + ' XP');
        }
        save();
        renderUnderstanding();
      }),
  );
  if ($('understandNext'))
    $('understandNext').onclick = () => {
      understandView[key] = index + 1;
      renderUnderstanding();
    };
}
function debugChallenge() {
  const m = mission();
  project().code[state.language] = program(
    m,
    state.language,
    project().devices.length ? project().devices : planned(),
    true,
    state.board,
  ).replace(
    state.language === 'cpp' ? 'HIGH' : 'value(1)',
    state.language === 'cpp' ? 'LOW' : 'value(0)',
  );
  markEdited();
  switchTab('code');
  toast('Debug challenge: one output command is wrong. Use mission tests to find and fix it.');
}
function selectMission(index) {
  stop(false);
  activeFault = null;
  sensorOverrides = {};
  // Opening the destination restores its 3D graphics and starts the player at home.
  if (state.travelScreen) showLocation();
  free = false;
  // A quest chosen because the situation needs it keeps that situation (at sunset the path is
  // still dark); any other quest starts from fresh practice conditions.
  const needed = !!situationReason(activeMissions()[index], state.env);
  state.mission = index;
  currentPassed = false;
  testResults = [];
  edited = false;
  outputs = {};
  if (!needed) state.env = { ...baseEnv, ...(currentLocation()?.practice || {}), temp: 24 };
  $('modal').close();
  changeView('world');
  save();
  renderMission();
  toast('New quest: ' + mission().title + '. Start by installing the highlighted components.');
}
function questList() {
  const needed = new Map(currentNeeds().map((n) => [n.index, n.reason]));
  modal(
    'Your neighborhood quests',
    activeMissions()
      .map(
        (m, i) =>
          '<button class="quest-option ' +
          (!free && state.mission === i ? 'selected' : '') +
          '" data-quest="' +
          i +
          '"><span>' +
          String(i + 1).padStart(2, '0') +
          '</span><div><strong>' +
          esc(m.title) +
          '</strong><small>' +
          esc(m.area) +
          ' · ' +
          esc(m.learn.join(' · ')) +
          (needed.has(i)
            ? '<b class="needed-tag">' +
              esc(needed.get(i).icon + ' Needed now: ' + needed.get(i).text.toLowerCase()) +
              '</b>'
            : '') +
          '</small></div><em>' +
          (currentCompletions()[missionKey(i)] ? '✓ Complete' : m.xp + ' XP') +
          '</em></button>',
      )
      .join('') +
      '<h3 class="quest-section">Teacher quests</h3>' +
      teacherQuests()
        .map(
          (q) =>
            '<button class="quest-option ' +
            (activeFault?.id === q.id ? 'selected' : '') +
            '" data-teacher-quest="' +
            q.id +
            '"><span>✎</span><div><strong>' +
            esc(q.title) +
            '</strong><small>' +
            esc(q.resident) +
            ' · ' +
            esc(q.learn.join(' · ')) +
            '</small></div><em>' +
            (currentCompletions()['fault:' + q.id] ? '✓ Complete' : q.xp + ' XP') +
            '</em></button>',
        )
        .join('') +
      '<button class="outline" id="importTeacherQuest">Import a teacher quest…</button>',
  );
  document
    .querySelectorAll('[data-quest]')
    .forEach((b) => (b.onclick = () => selectMission(Number(b.dataset.quest))));
  document.querySelectorAll('[data-teacher-quest]').forEach(
    (b) =>
      (b.onclick = () => {
        $('modal').close();
        startFault(b.dataset.teacherQuest);
      }),
  );
  $('importTeacherQuest').onclick = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (file) importTeacherQuest(await file.text());
    };
    input.click();
  };
}
// Quests a teacher shared as files (see teacher.html → Create a quest), kept as their choices.
const teacherQuests = () => loadCustomQuests(state.customQuests);
function importTeacherQuest(source) {
  let quest;
  try {
    quest = parseQuestFile(source);
  } catch (e) {
    if (!(e instanceof QuestError)) throw e;
    return toast(e.message);
  }
  const quests = teacherQuests();
  if (quests.some((q) => q.id === quest.id))
    toast('“' + quest.title + '” is already in your quests.');
  else if (quests.length >= QUEST_LIMITS.quests) toast('You have the most teacher quests allowed.');
  else {
    state.customQuests = [...quests.map((q) => q.fields), quest.fields];
    save();
    toast('Added “' + quest.title + '” to your teacher quests.');
  }
  questList();
}
$('questList').onclick = questList;
$('hintBtn').onclick = () => {
  $('hint').hidden = !$('hint').hidden;
};
$('freeBtn').onclick = () => {
  stop(false);
  activeFault = null;
  free = !free;
  currentPassed = false;
  testResults = [];
  $('freeBtn').textContent = free ? '⚑ Back to quests' : '◇ Free build';
  renderMission();
  toast(free ? 'Free build unlocked: every component is available.' : 'Back to your active quest.');
};
function progress() {
  modal(
    'Your technician journey',
    '<div class="guide"><p>You’ve earned <strong>' +
      state.xp +
      ' XP</strong> and completed <strong>' +
      activeMissions().filter((_, i) => currentCompletions()[missionKey(i)]).length +
      ' of ' +
      activeMissions().length +
      '</strong> ' +
      (state.difficulty === 'advanced' && currentLocation() ? 'advanced ' : '') +
      'neighborhood quests.</p></div><div class="badges">' +
      activeMissions()
        .map(
          (m, i) =>
            '<div class="badge ' +
            (currentCompletions()[missionKey(i)] ? '' : 'locked') +
            '"><span class="badge-icon">' +
            BADGE_ICONS[i % BADGE_ICONS.length] +
            '</span><strong>' +
            esc(m.badge) +
            '</strong><small>' +
            (currentCompletions()[missionKey(i)]
              ? 'Earned · ' + m.xp + ' XP'
              : 'Complete ' + esc(m.title)) +
            '</small></div>',
        )
        .join('') +
      '</div><p class="unlock-note">' +
      (state.xp >= ADVANCED_COMPONENT_XP
        ? 'Your advanced components are unlocked.'
        : 'Earn ' +
          ADVANCED_COMPONENT_XP +
          ' XP to unlock advanced components. All components are available in free build.') +
      '</p>',
  );
}
$('progressBtn').onclick = progress;
const themeMedia = matchMedia('(prefers-color-scheme: dark)');
function setTheme(preference, persist = true) {
  state.theme = ['light', 'dark', 'system'].includes(preference) ? preference : 'system';
  const dark = state.theme === 'dark' || (state.theme === 'system' && themeMedia.matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
  const toggle = $('themeToggle'),
    label = dark ? 'Switch to light mode' : 'Switch to dark mode';
  toggle.textContent = dark ? '☀' : '☾';
  toggle.setAttribute('aria-label', label);
  toggle.setAttribute('title', label);
  toggle.setAttribute('aria-pressed', String(dark));
  if ($('themeSetting')) $('themeSetting').value = state.theme;
  if (persist) save();
}
$('themeToggle').onclick = () =>
  setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
themeMedia.addEventListener?.('change', () => {
  if (state.theme === 'system') setTheme('system', false);
});
setTheme(state.theme, false);
function settings() {
  modal(
    'Make yourself comfortable',
    '<label class="setting-row"><span>Appearance<small>Choose a theme or follow your device settings.</small></span><select id="themeSetting" aria-label="Appearance theme"><option value="system">System default</option><option value="light">Light</option><option value="dark">Dark</option></select></label><label class="setting-row"><span>Reduced motion<small>Keep effects visible without looping animations.</small></span><input id="reducedSetting" type="checkbox" ' +
      (state.reduced ? 'checked' : '') +
      '></label><label class="setting-row"><span>Code suggestions<small>Suggest names and show what each function needs while you type (Ctrl+Space to ask).</small></span><input id="suggestSetting" type="checkbox" ' +
      (state.codeSuggestions !== false ? 'checked' : '') +
      '></label><label class="setting-row"><span>Sound effects<small>Optional buzzer alerts. Sound is off by default.</small></span><input id="soundSetting" type="checkbox" ' +
      (state.sound ? 'checked' : '') +
      '></label>' +
      (globalThis.iotQuestInstall?.available()
        ? '<div class="setting-row"><span>Install app<small>Add IoT Quest to this device so it opens in its own window and works offline.</small></span><button class="outline" id="installApp">Install</button></div>'
        : '') +
      '<div class="setting-row"><span>Get the latest version<small>Forget the saved offline copy and load the newest IoT Quest. Your progress is kept.</small></span><button class="outline" id="freshStart">Reload latest</button></div>' +
      '<div class="guide"><p>Progress is stored in this browser. Export your project to keep a portable copy.</p></div><div class="bench-actions"><button class="outline" id="exportSettings">Export project</button><button class="outline" id="importSettings">Import project…</button></div><button class="outline" id="resetProgress">Reset local progress…</button>',
  );
  $('resetProgress').onclick = () => {
    if (!confirm('Delete all saved progress, projects and badges in this browser?')) return;
    try {
      // The test copy keeps an empty save, or the reload would copy the main site's back in.
      if (CHANNEL) localStorage.setItem(STORAGE_KEY, '{}');
      else localStorage.removeItem(STORAGE_KEY);
    } catch {}
    window.location.reload();
  };
  if ($('installApp'))
    $('installApp').onclick = async () => {
      if (await globalThis.iotQuestInstall.prompt())
        toast('IoT Quest is installed on this device.');
      $('installApp').closest('.setting-row').remove();
    };
  $('freshStart').onclick = () => {
    save();
    globalThis.iotQuestFreshStart?.() ?? location.reload();
  };
  $('themeSetting').value = state.theme;
  $('themeSetting').onchange = () => setTheme($('themeSetting').value);
  $('reducedSetting').onchange = () => {
    state.reduced = $('reducedSetting').checked;
    document.body.classList.toggle('reduced-motion', state.reduced);
    save();
  };
  $('suggestSetting').onchange = () => {
    state.codeSuggestions = $('suggestSetting').checked;
    save();
  };
  $('soundSetting').onchange = () => {
    state.sound = $('soundSetting').checked;
    save();
  };
  $('exportSettings').onclick = exportProject;
  $('importSettings').onclick = chooseImportFile;
}
$('settingsBtn').onclick = settings;
$('characterBtn').onclick = () => {
  modal(
    'Your IoT technician',
    '<label class="setting-row"><span>Technician name</span><input id="nameSetting" type="text" maxlength="18" value="' +
      esc(state.name) +
      '"></label><label class="setting-row"><span>Character appearance</span><select id="appearanceSetting" class="board-select" aria-label="Character appearance"><option value="🧑‍🔧">Technician</option><option value="👩🏽‍🔧">Garden engineer</option><option value="👨🏻‍🔧">Home engineer</option></select></label><label class="setting-row"><span>Toolkit colour</span><input id="colorSetting" type="color" value="' +
      esc(state.color) +
      '"></label><div class="guide"><p>Your toolkit grows as you solve residents’ requests. Use WASD, the arrow keys, or the on-screen controls to explore.</p></div>',
  );
  $('appearanceSetting').value = state.appearance;
  $('appearanceSetting').onchange = () => {
    state.appearance = $('appearanceSetting').value;
    updatePlayer();
    save();
  };
  $('nameSetting').oninput = () => {
    state.name = $('nameSetting').value || 'Technician';
    $('characterBtn').textContent = state.name[0].toUpperCase();
    updatePlayer();
    save();
  };
  $('colorSetting').oninput = () => {
    state.color = $('colorSetting').value;
    updatePlayer();
    save();
  };
};
function languageGuide() {
  modal(
    'Your programming field guide',
    '<div class="guide"><h3>Two languages. One connected world.</h3><p>Arduino runs <code>setup()</code> once and <code>loop()</code> every simulation tick. MicroPython creates its pin objects once, then runs a <code>while True:</code> loop. Switch languages to load its starter without losing devices or wires.</p><h3>Supported language subset</h3><p>Numbers (including hex such as <code>0xFF</code> and <code>1000UL</code>), booleans, strings, variables, arithmetic (+ − * / %), bit operators (&amp; | ^ ~ &lt;&lt; &gt;&gt;), comparisons, logical operators, assignments including <code>+=</code>, <code>-=</code>, <code>*=</code>, <code>/=</code> and <code>%=</code>, if/else (and Python elif), while loops, functions with parameters and return values. Use <code>delay(ms)</code> or <code>time.sleep_ms(ms)</code> to pause until the next tick. Integer C variables drop decimals, so <code>7 / 2</code> is 3, and whole numbers wrap at 32 bits like on the board; Python has <code>//</code> and <code>global</code>. Blocks use braces in Arduino and exactly four spaces per level in Python.</p><p>Arduino: <code>pinMode</code>, <code>digitalRead</code>, <code>digitalWrite</code>, <code>analogRead</code>, <code>analogWrite</code>, <code>servoWrite</code>, <code>millis</code>, <code>delay</code>, <code>map</code>, <code>constrain</code>, <code>abs/min/max</code>, <code>Serial.begin/print/println</code> (<code>print</code> continues a line; <code>println</code> ends it; decimals print with 2 places, or <code>println(x, 3)</code> for 3). Print <code>label:value</code> pairs, e.g. <code>Serial.print("light:"); Serial.println(light);</code>, to graph them in the Serial plotter.</p><p>MicroPython: <code>Pin</code>, <code>ADC</code>, <code>PWM</code>; <code>value</code>, <code>on/off</code>, <code>read</code>, <code>read_u16</code>, <code>duty/duty_u16</code>, <code>freq</code>; <code>time.ticks_ms</code>, <code>time.ticks_diff</code>, <code>time.sleep/sleep_ms</code>, <code>print</code>. Helpers: <code>abs/min/max/int/float/round/str</code>. On the Raspberry Pi Pico, analogue pins only have <code>read_u16()</code> (use <code>read_u16() &gt;&gt; 4</code> for 0–4095) and PWM only <code>duty_u16()</code>; <code>read()</code> and <code>duty()</code> are ESP32 only.</p><h3>Virtual device readings</h3><p>Light, moisture, rain, tank and potentiometer: 0–4095, or 0–65520 with <code>read_u16()</code>. Temperature is a calibrated Celsius channel; distance is centimetres. These virtual channels replace physical sensor libraries for beginner exercises. <code>digitalWrite</code> values are 0/1. PWM uses 0–255 (<code>analogWrite</code>), 0–1023 (<code>duty</code>) or 0–65535 (<code>duty_u16</code>); <code>servoWrite</code> uses 0–180 degrees.</p><h3>Timing & sandbox limits</h3><p>One tick is 200 ms at 1× speed. A delay suspends the program until the next tick and resumes on the following line; its argument does not schedule a real sleep. Use <code>millis()</code> or <code>time.ticks_ms()</code> for accurate simulated timing. Every tick has a 20,000-operation budget and runs in an isolated worker. Infinite loops produce a useful error.</p><h3>Unsupported features</h3><p>This is a teaching interpreter, not a complete compiler. Arrays, lists, dictionaries, classes, pointers, for loops, comprehensions, external libraries, #include, hardware interrupts, network access, dynamic code, and file access are unsupported. Unsupported syntax stops the program with an error. Motors and pumps use virtual driver modules.</p></div>',
  );
}
function help() {
  modal(
    'Welcome to Willowbrook',
    '<div class="guide"><p>You’re the neighborhood IoT technician. A little observation and a little code can make this home smarter.</p><ol><li><strong>Explore in 3D:</strong> drag to orbit the camera, scroll to zoom, and click a room or garden area for a detailed view, or walk there and press E.</li><li><strong>Install:</strong> open Components and select the highlighted devices. Choose their installation point.</li><li><strong>Wire:</strong> assign GPIOs and connect power, ground, and resistors. The recommended circuit can help you get started.</li><li><strong>Program:</strong> pick Arduino C++ or MicroPython, then follow the Guide beside the editor. It explains each part of the program, checks each step as you write it, and offers hints one at a time.</li><li><strong>Run:</strong> change sunlight, motion, or moisture and watch your outputs change.</li><li><strong>Test:</strong> pass every scenario to earn XP and a badge. Failed tests show what to improve.</li></ol><p>Keyboard: WASD / arrow keys walk relative to your camera; E interacts. Drag the world to orbit, scroll to zoom, or use the camera buttons. Follow technician gives a close camera view. On-screen arrows work on touch devices. Use Return to world to leave a detailed area.</p><button class="primary" id="guideLang">Open language guide</button></div>',
  );
  $('guideLang').onclick = () => {
    $('modal').close();
    languageGuide();
  };
}
document.querySelectorAll('[data-nav]').forEach(
  (b) =>
    (b.onclick = () => {
      document.querySelectorAll('[data-nav]').forEach((n) => n.classList.toggle('active', n === b));
      let v = b.dataset.nav;
      if (v === 'world') {
        returnToGlobe();
      } else if (v === 'missions') questList();
      else if (v === 'inventory') {
        switchTab('inventory');
        $('benchContent').scrollIntoView({
          behavior: state.reduced ? 'auto' : 'smooth',
          block: 'center',
        });
      } else if (v === 'progress') progress();
      else help();
    }),
);
// ---- Explain code -------------------------------------------------------------
function toggleExplanations() {
  if (!canEdit('Programmer')) return;
  if (huntPhase() === 'spot') {
    toast('Explanations are off while you spot the bugs.');
    return;
  }
  const source = code(),
    showing = hasExplanations(source);
  if (!showing && explainCode(source, state.language, project().devices) === source) {
    toast('Nothing to explain yet: write some code, then press Explain.');
    return;
  }
  // Comments do not change behaviour, so test results are kept. A running program and an
  // error marker refer to the old line numbers, so they are reset.
  if (running) stop(false);
  errorLine = null;
  project().code[state.language] = showing
    ? removeExplanations(source)
    : explainCode(source, state.language, project().devices);
  save();
  renderCode();
  toast(
    showing
      ? 'Explanations removed. Your own comments are kept.'
      : 'Explanations added as » comments. Press Explain again to remove them.',
  );
}

// Activities that start from finished code (the debugging challenge, Spot the bugs and the
// fault workshop) open only after the student has passed that quest with their own program.
const solvedOwnCode = (index) => !!currentCompletions()[missionKey(index)];
function ownCodeFirst(index) {
  if (free || activeFault || solvedOwnCode(index)) return true;
  toast(
    'First write and pass “' +
      activeMissions()[index].title +
      '” with your own code. This activity starts from finished code.',
  );
  return false;
}
// ---- Spot the bugs ------------------------------------------------------------
const huntState = () => (activeFault?.kind === 'hunt' ? project().hunt : null);
const huntPhase = () => huntState()?.phase || null;
function startBugHunt(fresh = false) {
  if (fresh && !canEdit('Programmer')) return;
  if (free) {
    toast('Choose a quest first: bug hunts use the current mission.');
    return;
  }
  const base = activeFault?.mission ?? activeMissions()[state.mission],
    id = 'hunt:' + state.board.replace(/\s+/g, '-') + ':' + state.language + ':' + missionKey(),
    key = 'fault:' + id,
    profile = locationProfile();
  stop(false);
  let saved = profile.projects[key];
  if (!saved?.hunt || fresh) {
    const devices = defaults(base.ids, state.board).map((d) => ({
        ...d,
        power: true,
        ground: true,
        resistorConnected: !!d.resistor,
      })),
      seed = (saved?.hunt?.seed ?? 0) + 1,
      hunt = createBugHunt(base, state.language, devices, state.board, { seed });
    saved = profile.projects[key] = {
      devices,
      code: { [state.language]: hunt.code },
      lab: saved?.lab,
      hunt: { seed, bugs: hunt.bugs, flagged: [], phase: 'spot' },
    };
  }
  activeFault = {
    id,
    kind: 'hunt',
    rewardKey: 'fault:hunt:' + missionKey(),
    mission: base,
    title: 'Spot the bugs · ' + base.title,
    hints: saved.hunt.bugs.map((b) => b.fix),
    explain: 'Every planted bug is fixed and the mission tests pass.',
  };
  currentPassed = false;
  testResults = [];
  renderMission();
  switchTab('code');
  save();
  toast(
    'This program has ' + saved.hunt.bugs.length + ' bugs. Flag the lines you think are wrong.',
  );
}
function toggleBugFlag(line) {
  if (!canEdit('Programmer')) return;
  const hunt = huntState();
  if (!hunt || hunt.phase !== 'spot' || line < 1 || line > code().split('\n').length) return;
  hunt.flagged = hunt.flagged.includes(line)
    ? hunt.flagged.filter((l) => l !== line)
    : [...hunt.flagged, line].sort((a, b) => a - b);
  save();
  renderHunt();
  renderHighlight();
}
function checkBugHunt() {
  const hunt = huntState();
  if (!hunt || !canEdit('Programmer')) return;
  const score = scoreBugHunt(hunt.bugs, hunt.flagged);
  hunt.phase = 'fix';
  hunt.score = score;
  hunt.checkedCode = code();
  hunt.best = Math.max(hunt.best || 0, score.found);
  recordEvidence({
    at: new Date().toISOString(),
    type: 'bughunt',
    mission: activeFault.mission.title,
    language: state.language,
    found: score.found,
    total: score.total,
    wrongFlags: score.wrong.length,
  });
  save();
  renderCode();
  toast(
    score.perfect
      ? 'You spotted every bug! Now fix them and run the tests.'
      : 'You found ' +
          score.found +
          ' of ' +
          score.total +
          '. The answers are shown; now fix them.',
  );
}
// Line classes for the editor overlay: flags while spotting, results afterwards.
function huntLineClasses() {
  const hunt = huntState(),
    classes = new Map();
  if (!hunt) return classes;
  if (hunt.phase === 'spot') for (const line of hunt.flagged) classes.set(line, 'hunt-flag');
  // Result markers refer to the checked code; once it is edited, lines may have moved.
  else if (hunt.checkedCode === code()) {
    for (const bug of hunt.bugs)
      classes.set(bug.line, hunt.flagged.includes(bug.line) ? 'hunt-found' : 'hunt-missed');
    for (const line of scoreBugHunt(hunt.bugs, hunt.flagged).wrong) classes.set(line, 'hunt-wrong');
  }
  return classes;
}
function renderHunt() {
  const banner = $('huntBanner'),
    hunt = huntState();
  if (!banner) return;
  banner.hidden = !hunt;
  $('editorWrap')?.classList.toggle('hunting', hunt?.phase === 'spot');
  if (!hunt) return;
  const input = $('codeInput');
  if (hunt.phase === 'spot') {
    input.readOnly = true;
    const line = input.value.slice(0, input.selectionStart).split('\n').length;
    banner.innerHTML =
      '<div><strong>🐞 Spot the bugs</strong><p>This program has <b>' +
      hunt.bugs.length +
      ' bugs</b> on different lines. Click a line number, or put the cursor on a line and press Flag. Then check your answers.</p></div><div class="bench-actions"><button class="outline" id="flagLine">' +
      (hunt.flagged.includes(line) ? 'Unflag line ' : 'Flag line ') +
      line +
      '</button><button class="primary" id="checkHunt"' +
      (hunt.flagged.length ? '' : ' disabled') +
      '>Check ' +
      hunt.flagged.length +
      ' flagged</button><button class="text-btn" id="leaveHunt">Leave</button></div>';
    $('flagLine').onclick = () =>
      toggleBugFlag(
        $('codeInput').value.slice(0, $('codeInput').selectionStart).split('\n').length,
      );
    $('checkHunt').onclick = checkBugHunt;
  } else {
    const score = scoreBugHunt(hunt.bugs, hunt.flagged),
      // After edits, line numbers may no longer match what is on screen.
      at = (line) => (hunt.checkedCode === code() ? ' · Ln ' + line : '');
    banner.innerHTML =
      '<div><strong>🐞 ' +
      (score.perfect ? 'All bugs spotted!' : 'Found ' + score.found + ' of ' + score.total) +
      '</strong><ul class="hunt-results">' +
      hunt.bugs
        .map(
          (b) =>
            '<li class="' +
            (hunt.flagged.includes(b.line) ? 'found' : 'missed') +
            '"><span>' +
            (hunt.flagged.includes(b.line) ? '✓ Found' : '✗ Missed') +
            at(b.line) +
            '</span>' +
            esc(b.explain) +
            ' <em>' +
            esc(b.fix) +
            '</em></li>',
        )
        .join('') +
      score.wrong
        .map((l) => '<li class="wrong"><span>○ Flagged' + at(l) + '</span>This line was fine.</li>')
        .join('') +
      '</ul><p>Fix the bugs, then run the tests to prove the repair.</p></div><div class="bench-actions"><button class="primary" id="huntTest">▶ Run tests</button><button class="outline" id="huntAgain">New bugs</button><button class="text-btn" id="leaveHunt">Back to quest</button></div>';
    $('huntTest').onclick = testSolution;
    $('huntAgain').onclick = () => startBugHunt(true);
  }
  $('leaveHunt').onclick = exitFault;
}

function exportManifest() {
  return {
    format: PROJECT_FORMAT,
    version: 1,
    exportedAt: new Date().toISOString(),
    technician: state.name,
    locationId: state.activeLocation,
    slot: activeFault ? 'fault' : free ? 'free' : 'mission',
    missionIndex: activeFault || free ? null : state.mission,
    difficulty: state.difficulty,
    missionTitle: mission().title,
    board: state.board,
    language: state.language,
    code: { ...project().code, [state.language]: code() },
    devices: structuredClone(project().devices),
    results: testResults.length
      ? testResults
      : currentCompletions()[completionKey()]?.results || [],
    lab: { evidence: labState().evidence },
  };
}
function exportProject() {
  const files = projectFiles({
      manifest: exportManifest(),
      name: state.name,
      language: state.language,
      board: state.board,
      code: code(),
      devices: structuredClone(project().devices),
      mission: mission(),
      // In-memory results are lost on reload; fall back to the saved completion record.
      results: testResults.length
        ? testResults
        : currentCompletions()[completionKey()]?.results || [],
      lab: labState(),
      location: currentLocation()
        ? currentLocation().city + ', ' + currentLocation().country
        : 'Original home',
    }),
    bytes = zipFiles(files),
    blob = new Blob([bytes], { type: 'application/zip' }),
    url = URL.createObjectURL(blob),
    a = document.createElement('a');
  a.href = url;
  a.download = 'iot-quest-' + state.activeLocation + '-project.zip';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast('Project ZIP exported with source, wiring and assessment evidence.');
}

function chooseImportFile() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.zip,application/zip';
  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file) return;
    if (file.size > IMPORT_LIMITS.zipBytes) {
      toast('That file is larger than 4 MB, so it is not an IoT Quest project.');
      return;
    }
    previewImport(new Uint8Array(await file.arrayBuffer()), file.name);
  };
  input.click();
}
// Validate an exported project ZIP and show what it contains before anything changes.
async function previewImport(bytes, fileName) {
  let plan;
  try {
    plan = await readProject(bytes, fileName);
  } catch (e) {
    if (!(e instanceof ImportError)) throw e;
    modal('Project not imported', '<div class="guide"><p>' + esc(e.message) + '</p></div>');
    return null;
  }
  const location = locationById(plan.locationId),
    target = targetProfile(plan),
    key = plan.slot === 'free' ? 'free' : importKey(plan),
    existing = target?.projects?.[key],
    occupied = !!(
      existing &&
      (existing.devices?.length || Object.keys(existing.code || {}).length)
    ),
    passed = plan.results.filter((r) => r.pass).length,
    wiring = validate(plan.devices, plan.board);
  const row = (term, value) => '<dt>' + term + '</dt><dd>' + value + '</dd>';
  modal(
    'Import project',
    '<dl class="import-summary">' +
      row('File', esc(plan.fileName)) +
      row('Technician', esc(plan.technician || 'Not recorded')) +
      (plan.exportedAt ? row('Exported', esc(new Date(plan.exportedAt).toLocaleString())) : '') +
      row(
        'Mission',
        plan.slot === 'free'
          ? 'Free build'
          : esc(plan.missionTitle) + (plan.difficulty === 'advanced' ? ' · advanced' : ''),
      ) +
      row(
        'Destination',
        esc(location ? location.city + ', ' + location.country : 'Original home'),
      ) +
      row(
        'Controller',
        esc(plan.board) + ' · ' + (plan.language === 'cpp' ? 'Arduino C++' : 'MicroPython'),
      ) +
      row(
        'Components',
        plan.devices.length
          ? plan.devices.map((d) => esc(d.name) + ' (GPIO ' + d.pin + ')').join(', ')
          : 'None installed',
      ) +
      row(
        'Exported tests',
        plan.results.length ? passed + ' of ' + plan.results.length + ' passed' : 'Not run',
      ) +
      '</dl>' +
      (plan.warnings.length || wiring.length
        ? '<div class="import-warnings">' +
          [...plan.warnings, ...wiring.map((w) => 'Wiring: ' + w)]
            .map((w) => '<p>' + esc(w) + '</p>')
            .join('') +
          '</div>'
        : '') +
      '<div class="guide"><p>' +
      (occupied
        ? 'This replaces your current work on this mission. Your version is kept as a backup in the Teacher dashboard.'
        : 'The project opens in its mission slot.') +
      ' Badges and XP are not imported: run the tests here to earn them.</p></div>' +
      '<div class="bench-actions"><button class="outline" id="cancelImport">Cancel</button><button class="primary" id="confirmImport">Open project</button></div>',
  );
  $('cancelImport').onclick = () => $('modal').close();
  $('confirmImport').onclick = () => {
    $('modal').close();
    applyImport(plan);
  };
  return plan;
}
function importedUnedited() {
  const evidence = labState().evidence,
    last = evidence.findLastIndex((e) => e.type === 'import');
  return last >= 0 && !evidence.slice(last + 1).some((e) => e.type === 'edit');
}
const importKey = (plan) =>
  (plan.difficulty === 'advanced' && plan.locationId !== 'legacy' ? 'advanced:' : '') +
  plan.missionIndex;
const targetProfile = (plan) =>
  plan.locationId === 'legacy' ? state : state.locationProgress[plan.locationId];
function applyImport(plan) {
  stop(false);
  // Save the current place first: opening a destination saves the current quest into it, which
  // would otherwise replace the imported project's quest when importing into the same place.
  save();
  state.difficulty = plan.difficulty;
  $('difficultySelect').value = state.difficulty;
  const here = state.activeLocation === plan.locationId;
  // Imported work opens its destination even if it is still locked for this player.
  if (plan.locationId === 'legacy') {
    state.legacyMission = plan.missionIndex ?? state.legacyMission;
    state.legacyBoard = plan.board;
    if (here) [state.mission, state.board] = [state.legacyMission, plan.board];
    resumeLegacy();
  } else {
    const profile = (state.locationProgress[plan.locationId] ??= {
      projects: {},
      completed: {},
      mission: 0,
      board: plan.board,
      env: { ...baseEnv },
    });
    if (plan.missionIndex !== null) profile.mission = plan.missionIndex;
    profile.board = plan.board;
    if (here) [state.mission, state.board] = [profile.mission, plan.board];
    enterLocation(plan.locationId);
  }
  free = plan.slot === 'free';
  $('freeBtn').textContent = free ? '⚑ Back to quests' : '◇ Free build';
  const projects = locationProfile().projects,
    key = free ? 'free' : missionKey(),
    existing = projects[key];
  if (existing && (existing.devices?.length || Object.keys(existing.code || {}).length))
    projects[key + '~backup-' + new Date().toISOString().slice(0, 19)] = existing;
  // Keep the newest few backups of this quest (each is a whole project).
  for (const old of Object.keys(projects)
    .filter((k) => k.startsWith(key + '~backup-'))
    .sort()
    .slice(0, -IMPORT_BACKUPS))
    delete projects[old];
  projects[key] = {
    devices: plan.devices,
    code: plan.code,
    lab: { ...createLabState(), evidence: plan.evidence },
  };
  state.board = plan.board;
  state.language = plan.language;
  recordEvidence({
    at: new Date().toISOString(),
    type: 'import',
    file: plan.fileName,
    technician: plan.technician,
    exportedAt: plan.exportedAt,
    mission: plan.missionTitle,
    exportedResults: plan.results,
  });
  currentPassed = false;
  testResults = [];
  renderMission();
  switchTab('code');
  save();
  toast('Imported ' + plan.fileName + '. Run the tests to check it here.');
}

$('exportBtn').onclick = exportProject;
function residentialResidents(engine = world3d) {
  return residentialLots.map((b) => {
    const actor = engine?.model.actors.find((a) => a.id === 'residence:' + b.type);
    const area = nativeAreas().find((a) => a[3]?.communityType === b.type);
    const p = toWorld({ x: area[1], y: area[2] });
    return {
      key: 'residence:' + b.type,
      name: b.resident,
      area: b.name,
      section: 'Neighbourhood home',
      x: actor?.x ?? p[0] + 1.7,
      z: actor?.z ?? p[2] + 0.3,
    };
  });
}
function characterPositions(engine = world3d) {
  if (engine)
    return engine.model.actors
      .filter((a) => a.id !== 'player')
      .map((actor) => {
        const body = actor.parts.find((p) => p.local[1] === 0.8) || actor.parts[0];
        return {
          key: actor.id,
          name: actor.name || currentLocation()?.names[actor.id] || actor.id,
          area: actor.area,
          section: actor.section,
          x: engine.matrix ? body.pos[0] : actor.x,
          z: engine.matrix ? body.pos[2] : actor.z,
        };
      });
  return [
    ...residentialResidents(null),
    ...residentsForSections(
      currentLocation(),
      Object.fromEntries(areas.map(([area, x, y]) => [area, [x, y]])),
    ),
    ...[
      ['Maya', 70, 51],
      ['Alex', 49, 48],
      ['Sam', 35, 35],
    ].map(([key, x, y]) => {
      const p = toWorld({ x, y });
      return { key, name: currentLocation()?.names[key] || key, x: p[0], z: p[2] };
    }),
  ];
}
function renderSectionResidents() {
  $('sectionResidents').innerHTML = residentsForSections(
    currentLocation(),
    Object.fromEntries(areas.map(([area, x, y]) => [area, [x, y]])),
  )
    .concat(
      residentialResidents(),
      characterPositions().filter((c) => c.key.startsWith('worker:')),
    )
    .map((c) => {
      const point = fromWorld(c.x, c.z);
      return (
        '<button class="map-resident npc section-resident" data-section-npc="' +
        esc(c.key) +
        '" id="resident-' +
        esc(c.key) +
        '" style="left:' +
        point.x +
        '%;top:' +
        point.y +
        '%" aria-label="Talk to ' +
        esc(c.name) +
        ' about ' +
        esc(c.section) +
        '"><span aria-hidden="true">🧑</span><small>' +
        esc(c.name) +
        ' · ' +
        esc(c.section) +
        '</small></button>'
      );
    })
    .join('');
  document
    .querySelectorAll('[data-section-npc]')
    .forEach((b) => (b.onclick = () => openConversation(b.dataset.sectionNpc)));
}
function checkResidentGreetings() {
  const p = toWorld(state.player);
  const character = greetingTracker.approach(
    { x: p[0], z: p[2] },
    characterPositions().filter((c) => c.area),
    !state.travelScreen && !$('modal').open && view !== 'sky',
    world3d?.model.colliders || [],
  );
  if (character) {
    keys.clear();
    openConversation(character.key);
  }
}
function openConversation(key) {
  const character = characterPositions().find((c) => c.key === key);
  const player = toWorld(state.player);
  greetingTracker.acknowledge({ x: player[0], z: player[2] }, characterPositions());
  const resident = character?.name || currentLocation()?.names[key] || key,
    quests = activeMissions();
  const done = (i) => currentCompletions()[missionKey(i)];
  activeConversation = createConversation({
    key,
    resident,
    quests,
    currentIndex: state.mission,
    completed: Object.fromEntries(quests.map((m, i) => [i, !!done(i)])),
    thanked: Object.fromEntries(quests.map((m, i) => [i, !!done(i)?.thanked])),
    // A resident opens with whatever the current conditions make urgent.
    urgent: Object.fromEntries(currentNeeds().map((n) => [n.index, n.reason.text])),
    area: character?.area,
  });
  activeConversation.section = character?.section;
  // Thanks are said once; chats count towards each of this resident's quests in progress reports.
  for (const i of activeConversation.thanked) done(i).thanked = true;
  const chats = (locationProfile().chats ??= {});
  for (const r of activeConversation.requests)
    chats[missionKey(r.index)] = (chats[missionKey(r.index)] || 0) + 1;
  save();
  renderConversation();
}
function renderConversation() {
  const chat = activeConversation;
  if (!chat) return;
  const wasOpen = $('modal').open;
  $('modalTitle').textContent = 'A chat with ' + chat.resident;
  $('modalBody').innerHTML = conversationHTML(chat, state.name || 'You');
  if (!wasOpen) $('modal').showModal();
  const log = $('chatMessages');
  log.scrollTop = log.scrollHeight;
  const send = (text) => {
    const failedTests =
      !free && !activeFault && state.mission === chat.selectedIndex ? testResults : [];
    if (
      sendConversationMessage(chat, text, {
        failedTests,
        weatherMode: state.weatherMode,
      })
    ) {
      renderConversation();
      $('chatInput').focus();
    }
  };
  $('chatForm').onsubmit = (event) => {
    event.preventDefault();
    send($('chatInput').value);
  };
  document
    .querySelectorAll('[data-chat-question]')
    .forEach((b) => (b.onclick = () => send(b.dataset.chatQuestion)));
  document.querySelectorAll('[data-chat-request]').forEach(
    (b) =>
      (b.onclick = () => {
        chooseRequest(chat, Number(b.dataset.chatRequest));
        renderConversation();
      }),
  );
  if ($('startChatQuest'))
    $('startChatQuest').onclick = () => {
      const index = chat.selectedIndex;
      activeConversation = null;
      selectMission(index);
    };
}
document
  .querySelectorAll('[data-npc]')
  .forEach((n) => (n.onclick = () => openConversation(n.dataset.npc)));
document.body.classList.toggle('reduced-motion', state.reduced);
$('characterBtn').textContent = state.name[0].toUpperCase();
$('resident').style.left = '70%';
$('resident').style.top = '51%';
renderSectionResidents();
renderMission();
setLayout(state.layout);
setWorldShare(state.worldShare ?? WORLD_SHARE.default, false);
updatePlayer();
setMapView();
save();
function canEdit(role) {
  if (!labState().coopEnabled || labState().role === role) return true;
  toast('Local role mode: ' + role + ' owns this action. Switch roles in Advanced tools.');
  return false;
}
// A progress report for the teacher's class view: quests, attempts, hints, guide steps and code.
function downloadProgress(student, classCode) {
  student = String(student || '').trim();
  classCode = String(classCode || '').trim();
  if (!student) {
    toast('Type your name first, so your teacher knows whose report it is.');
    return false;
  }
  state.reportName = student;
  state.classCode = classCode;
  save();
  const report = buildProgressReport(state, { student, classCode });
  download(progressFileName(report), JSON.stringify(report, null, 2), 'application/json');
  toast('Progress report downloaded. Hand the file in to your teacher.');
  return report;
}
function download(name, text, type = 'text/plain') {
  const url = URL.createObjectURL(new Blob([text], { type })),
    a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function pauseExecution() {
  if (!state.debugPaused) {
    labState().debugAttempts = (labState().debugAttempts || 0) + 1;
  }
  if (!worker) run();
  state.debugPaused = true;
  labState().paused = true;
  save();
}
function resumeExecution() {
  state.debugPaused = false;
  labState().paused = false;
  if (speed === 0) speed = 1;
  if (!worker) run();
  save();
}
function stepExecution() {
  labState().debugSteps = (labState().debugSteps || 0) + 1;
  if (inFlight) {
    toast('Wait for the current controller tick to finish.');
    return;
  }
  if (!worker) {
    run();
    pauseExecution();
    return;
  }
  state.debugPaused = true;
  labState().paused = true;
  inFlight = true;
  worker.postMessage({ type: 'debugStep', env: state.env, ms: 200 });
}
function refreshDebugView(line = null) {
  if ($('debugLocation'))
    $('debugLocation').textContent =
      'Controller ' +
      (simTime / 1000).toFixed(1) +
      ' s · ' +
      (line ? 'last executed line ' + line : 'paused at the tick boundary');
  if ($('debugVariables'))
    $('debugVariables').textContent = JSON.stringify(
      { variables: inspectionVariables, GPIO: outputs, inputs: lastInputs },
      null,
      2,
    );
}
$('advancedTools').onclick = () =>
  advancedMenu({
    state,
    lab: labState,
    recordEvidence,
    modal,
    save,
    missions: activeMissions(),
    completed: () => completedQuestCount(state),
    pause: pauseExecution,
    resume: resumeExecution,
    debugStep: stepExecution,
    refreshDebug: refreshDebugView,
    refresh: renderBench,
    download,
    applyAssignment: (index, difficulty, scenario) => {
      setDifficulty(difficulty);
      selectMission(index);
      setScenario(scenario);
      labState().assignment = {
        mission: index,
        difficulty,
        scenario,
        assignedAt: new Date().toISOString(),
        mode: 'local demonstration',
      };
      save();
    },
  });
function labContext() {
  return {
    lab: labState(),
    labState,
    devices: project().devices,
    outputs,
    inputs: lastInputs,
    kinds: outputKinds,
    env: state.env,
    selected: selectedDevice,
    code: code(),
    board: state.board,
    fault: activeFault,
    switchTab,
    selectDevice,
    startFault: (id) => ownCodeFirst(0) && startFault(id),
    exitFault,
    startBugHunt: () => ownCodeFirst(state.mission) && startBugHunt(),
    huntTitle: free ? null : activeMissions()[state.mission]?.title,
    test: testSolution,
    save,
    modal,
    exportProject,
    importProject: chooseImportFile,
    reportName: state.reportName || (state.name !== 'Technician' ? state.name : ''),
    classCode: state.classCode || '',
    downloadProgress,
    repairSensor: (id) => {
      stop(false);
      const d = project().devices.find((d) => d.id === id);
      delete d.faultValue;
      markEdited();
      switchTab('circuit');
      toast('Simulated sensor replaced. Test the repaired circuit.');
    },
  };
}
function updateLabViews() {
  if (tab === 'circuit') updateCircuit(labContext());
  if (tab === 'resources') updateResourcesPanel(labContext());
}
function selectDevice(id) {
  selectedDevice = id;
  switchTab('circuit');
  $('benchContent').scrollIntoView({
    behavior: state.reduced ? 'auto' : 'smooth',
    block: 'nearest',
  });
}
function startFault(id) {
  stop(false);
  activeFault = [
    ...faultCases,
    ...securityCases,
    ...dashboardQuests,
    ...teacherQuests().map(customChallenge),
  ].find((f) => f.id === id);
  if (!activeFault) return;
  const key = 'fault:' + id,
    profile = locationProfile();
  if (!profile.projects[key] && activeFault.track) {
    // Security repairs start from the unsafe program; dashboard quests from a blank starter.
    const devices = defaults(activeFault.ids, state.board),
      make = (lang) =>
        activeFault.source
          ? activeFault.source(lang, devices)
          : activeFault.starter
            ? activeFault.starter(lang, devices)
            : program(activeFault.mission, lang, devices);
    profile.projects[key] = {
      // Teacher quests are full quests: students install and wire the components themselves.
      devices: activeFault.track === 'custom' ? [] : devices,
      code: { cpp: make('cpp'), python: make('python') },
    };
  } else if (!profile.projects[key]) {
    const devices = defaults(missions[0].ids, state.board),
      source = {
        cpp: program(missions[0], 'cpp', devices, true),
        python: program(missions[0], 'python', devices, true),
      };
    if (id === 'ground') devices[1].ground = false;
    if (id === 'pin') devices[0].pin = devices[1].pin;
    if (id === 'sensor') devices[0].faultValue = 100;
    if (id === 'code')
      for (const lang of ['cpp', 'python'])
        source[lang] = source[lang].replace('light < 1800', 'light > 1800');
    profile.projects[key] = { devices, code: source };
  }
  currentPassed = false;
  testResults = [];
  renderMission();
  switchTab(
    activeFault.track === 'dashboard'
      ? 'dashboard'
      : activeFault.track === 'custom'
        ? 'code'
        : 'faults',
  );
  save();
}
function exitFault() {
  stop(false);
  activeFault = null;
  currentPassed = false;
  testResults = [];
  renderMission();
  switchTab('code');
}
function setClockSpeed(value) {
  speed = [0, 1, 4, 12, 60, 360].includes(value) ? value : 1;
  labState().paused = speed === 0;
  labState().dailyCycle = speed >= 60;
  if (speed >= 60) {
    setWeatherMode('practice');
    toast('Accelerated time uses a simulated daily practice scenario, not future live weather.');
  }
  $('clockSpeed').value = String(speed);
  updateClockLabel();
  save();
}
function updateClockLabel() {
  const lab = labState(),
    hours = (lab.startHour + lab.elapsedMs / 3600000) % 24;
  $('simClock').textContent =
    String(Math.floor(hours)).padStart(2, '0') +
    ':' +
    String(Math.floor((hours % 1) * 60)).padStart(2, '0') +
    ' simulated';
  $('weatherClockSource').textContent =
    state.weatherMode === 'live'
      ? 'Weather: current API conditions, held between updates.'
      : 'Weather: simulated ' +
        (lab.dailyCycle ? 'daily cycle · ' : 'practice · ') +
        (scenarios[lab.scenario]?.name || 'normal');
}
function setScenario(id) {
  if (!scenarios[id]) return;
  stop(false);
  setWeatherMode('practice');
  labState().scenario = id;
  const s = scenarios[id];
  state.env = {
    ...state.env,
    outdoorTemp: s.temp,
    temp: s.temp,
    rain: s.rain,
    humidity: s.humidity,
    wind: s.wind,
    cloud: s.cloud,
    soil: s.soil ?? state.env.soil,
    tank: s.tank ?? state.env.tank,
  };
  renderEnvironment();
  renderRegionalWeather();
  updateClockLabel();
  save();
}
function setDifficulty(value) {
  stop(false);
  activeFault = null;
  state.difficulty = value === 'advanced' ? 'advanced' : 'beginner';
  currentPassed = false;
  testResults = [];
  renderMission();
  save();
}
$('clockSpeed').value = String(speed);
$('difficultySelect').value = state.difficulty;
$('difficultySelect').onchange = () => setDifficulty($('difficultySelect').value);
$('scenarioSelect').innerHTML = scenarioOptions();
$('scenarioSelect').onchange = () => setScenario($('scenarioSelect').value);
function updateRoofToggle() {
  $('roofToggle').textContent = state.roofsVisible ? 'Roof: visible' : 'Roof: cutaway';
  $('roofToggle').setAttribute('aria-pressed', String(!!state.roofsVisible));
}
$('roofToggle').onclick = () => {
  state.roofsVisible = !state.roofsVisible;
  updateRoofToggle();
  save();
};
updateRoofToggle();
$('freeExploration').onclick = () => {
  state.freeExploration = !state.freeExploration;
  $('freeExploration').textContent = state.freeExploration
    ? 'Free exploration enabled · all destinations'
    : 'Free exploration · all destinations';
  travelController?.refresh();
  save();
};
function applyLocalWeather(weather) {
  if (weather.locationId !== state.activeLocation) return;
  state.weatherByLocation[weather.locationId] = weather;
  renderRegionalWeather();
  save();
}
function renderRegionalWeather() {
  const location = currentLocation();
  $('regionalWeather').hidden = !location;
  if (!location) return;
  $('weatherModeSelect').value = state.weatherMode;
  $('weatherRetry').hidden = state.weatherMode !== 'live';
  $('weatherRetry').disabled = weatherLoading;
  $('weatherRetry').textContent = weatherLoading
    ? 'Connecting…'
    : state.weatherByLocation[location.id]?.status === 'live'
      ? 'Refresh live weather'
      : 'Retry live weather';
  $('regionalWeatherDetails').innerHTML =
    weatherHTML(state.weatherByLocation[location.id], location, state.weatherMode, state.env) +
    '<div class="weather-readings-note">' +
    (state.weatherMode === 'live' && state.weatherByLocation[location.id]?.status === 'live'
      ? 'API outdoor climate above.'
      : 'Simulated outdoor climate above.') +
    '<br>Simulated: indoor ' +
    state.env.temp.toFixed(1) +
    '°C · soil ' +
    Math.round(state.env.soil) +
    '% · tank ' +
    Math.round(state.env.tank) +
    '%.</div>';
}
$('weatherRetry').onclick = () => refreshWeather(true);
async function refreshWeather(refresh = false) {
  const location = currentLocation(),
    revision = ++weatherRevision;
  if (!location || state.weatherMode !== 'live') return;
  weatherLoading = true;
  renderRegionalWeather();
  const weather = await weatherService.get(location, { refresh });
  if (revision === weatherRevision && state.activeLocation === location.id) {
    weatherLoading = false;
    applyLocalWeather(weather);
  }
}
function setWeatherMode(mode) {
  state.weatherMode = mode === 'live' ? 'live' : 'practice';
  weatherRevision++;
  weatherLoading = false;
  if (mode === 'practice') {
    const p = currentLocation()?.practice || {};
    state.env = { ...state.env, ...p, isDay: true, precipitation: 0, weatherCode: null };
  } else refreshWeather();
  renderEnvironment();
  renderRegionalWeather();
  save();
}
function returnToGlobe() {
  save();
  stop(false);
  state.travelScreen = true;
  world3d?.releaseGraphics();
  travelController?.restoreGraphics();
  $('travelScreen').hidden = false;
  $('adventureScreen').hidden = true;
  keys.clear();
  travelController?.refresh();
  save();
}
function showLocation() {
  greetingTracker.reset();
  travelController?.releaseGraphics();
  world3d?.restoreGraphics();
  state.travelScreen = false;
  $('travelScreen').hidden = true;
  $('adventureScreen').hidden = false;
  const location = currentLocation();
  world3d?.setRegion(state.activeLocation);
  setCommunityDensity();
  for (let i = 0; i < areas.length; i++) {
    const base = baseAreas[i],
      override = world3d?.model.areaOverrides?.[base[0]] || location?.areaOverrides?.[base[0]];
    areas[i] = [base[0], ...(override || base.slice(1))];
  }
  $('regionHeading').textContent = location ? location.title : 'Make yourself at home.';
  $('regionSubtitle').textContent = location
    ? location.city + ', ' + location.country + ' · ' + location.architecture
    : 'Your original Willowbrook home · saved progress preserved';
  for (const [id, key] of [
    ['resident', 'Maya'],
    ['alexNpc', 'Alex'],
    ['samNpc', 'Sam'],
  ]) {
    const name = location?.names[key] || key;
    $(id).querySelector('small').textContent = name;
    $(id).setAttribute('aria-label', 'Talk to ' + name);
  }
  renderSectionResidents();
  state.player = world3d?.findFree({ x: 48, y: 77 }) ?? { x: 48, y: 77 };
  changeView('world');
  renderMission();
  renderRegionalWeather();
  updatePlayer();
  save();
}
async function enterLocation(id, weather = null) {
  const location = locationById(id);
  if (!location) return;
  if (!isLocationUnlocked(state, location)) {
    toast(
      'Complete ' +
        location.unlockAfter +
        ' quests to unlock this destination, or choose Free exploration.',
    );
    return;
  }
  save();
  stop(false);
  weatherRevision++;
  weatherLoading = false;
  free = false;
  activeFault = null;
  sensorOverrides = {};
  state.activeLocation = id;
  const profile = locationProfile();
  state.mission = profile.mission || 0;
  state.board = profile.board || 'ESP32';
  state.env = { ...baseEnv, ...location.practice, ...profile.env, temp: profile.env?.temp ?? 24 };
  currentPassed = false;
  testResults = [];
  if (state.weatherMode === 'live' && labState().elapsedMs === 0) {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: location.timezone,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date());
    labState().startHour =
      Number(parts.find((p) => p.type === 'hour').value) +
      Number(parts.find((p) => p.type === 'minute').value) / 60;
  }
  showLocation();
  if (weather) {
    applyLocalWeather(weather);
    if (weather.status !== 'live' && state.weatherMode === 'live') await refreshWeather();
  } else await refreshWeather();
}
function resumeLegacy() {
  save();
  stop(false);
  free = false;
  activeFault = null;
  state.activeLocation = 'legacy';
  state.mission = state.legacyMission || 0;
  state.board = state.legacyBoard || 'ESP32';
  state.env = { ...baseEnv, ...state.legacyEnv };
  currentPassed = false;
  testResults = [];
  showLocation();
}
$('backToGlobe').onclick = returnToGlobe;
$('resumeLegacy').onclick = resumeLegacy;
$('weatherModeSelect').onchange = () => setWeatherMode($('weatherModeSelect').value);
setInterval(() => {
  if (state.travelScreen) return;
  if (running) tick();
  else advanceWorld();
  updateClockLabel();
}, TICK_MS);
setInterval(() => {
  if (state.travelScreen) travelController?.refreshWeather();
  else {
    renderRegionalWeather();
    if (state.weatherMode === 'live') refreshWeather();
  }
}, 60000);
if (typeof fetch === 'function' && typeof $('globeCanvas')?.getContext === 'function')
  setupTravel({
    getState: () => state,
    onEnter: enterLocation,
    onLegacy: resumeLegacy,
    onWeather: applyLocalWeather,
    onMode: setWeatherMode,
    onSave: save,
    modal,
    missions,
    weatherService,
  }).then((controller) => {
    travelController = controller;
  });
renderRegionalWeather();
function projectWorldLabels(engine) {
  if (view !== 'sky' && !$('modal').open) {
    const near = talkTarget(engine);
    const tip = near
      ? 'Press E to talk to ' + near.name
      : view === 'detail' || nearestArea().distance <= INSTALL_RADIUS
        ? 'Press E to install devices here'
        : view === 'landscape'
          ? 'Mountains · river valley · lake · wildlife'
          : 'Drag to orbit · scroll to zoom';
    // Runs every frame: only touch the DOM when the tip actually changes.
    if ($('worldTip').textContent !== tip) $('worldTip').textContent = tip;
    // At an install point E installs, so offer talking to the resident standing there as well.
    const resident = near ? null : nearbyResident(engine),
      talkLabel = resident ? 'Talk to ' + resident.name + ' (T)' : '';
    if ($('worldTalk').textContent !== talkLabel) {
      $('worldTalk').textContent = talkLabel;
      $('worldTalk').hidden = !resident;
    }
  }
  const sky = engine.model.sky;
  if (sky?.ephemeris) {
    const e = sky.ephemeris,
      key = e.date + ':' + sky.visibleStars + ':' + state.skyMode + ':' + state.activeLocation;
    if ($('skyDetails').dataset.signature !== key) {
      $('skyDetails').dataset.signature = key;
      const location = currentLocation() || DEFAULT_OBSERVER;
      const time = new Intl.DateTimeFormat('en-GB', {
        timeZone: location.timezone,
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(new Date(e.date));
      $('skyDetails').textContent =
        time +
        ' · ' +
        location.timezone +
        '\n' +
        e.moon.phase +
        ' · ' +
        Math.round(e.moon.illumination * 100) +
        '% illuminated\nMoon: ' +
        (e.moon.altitude > 0
          ? Math.round(e.moon.altitude) +
            '° above horizon · azimuth ' +
            Math.round(e.moon.azimuth) +
            '°'
          : 'below the horizon') +
        '\n' +
        sky.visibleStars +
        ' bright catalogue stars visible. North 0° · east 90°.';
    }
  }
  // Labels are collected first, then declutterLabels decides which name tags fit on screen.
  const labels = [];
  const place = (el, p, priority) => {
    if (!el) return;
    const v = engine.project(p);
    el.style.left = v.x + 'px';
    el.style.top = v.y + 'px';
    if (priority === undefined) el.style.visibility = v.visible ? 'visible' : 'hidden';
    else
      labels.push({
        el,
        x: v.x,
        y: v.y,
        visible: v.visible,
        priority,
        movable: el.id === 'player' && !!engine.indoorArea,
        // Community building (and crossing) buttons stay reachable by keyboard even when there
        // is no room to show them.
        essential: !!el.classList?.contains('community-building-target'),
      });
  };
  for (const el of document.querySelectorAll('[data-area]')) {
    const a = allAreas().find((a) => a[0] === el.dataset.area);
    const p = toWorld({ x: a[1], y: a[2] });
    p[1] = 1.65 + (engine.model.floorHeight?.(p[0], p[2]) || 0);
    if (engine.communityView && a[3]?.communityType) el.style.visibility = 'hidden';
    else place(el, p, engine.communityView ? 2 : 0);
  }
  const targets = world3d?.deviceObjects || [];
  if ($('deviceWorldTargets').dataset.signature !== targets.map((r) => r.device.id).join(',')) {
    $('deviceWorldTargets').dataset.signature = targets.map((r) => r.device.id).join(',');
    $('deviceWorldTargets').innerHTML = targets
      .map(
        (r) =>
          '<button class="world-device-target" data-world-device="' +
          esc(r.device.id) +
          '" id="world-target-' +
          esc(r.device.id) +
          '">' +
          esc(r.device.name) +
          '</button>',
      )
      .join('');
    document
      .querySelectorAll('[data-world-device]')
      .forEach((b) => (b.onclick = () => selectDevice(b.dataset.worldDevice)));
  }
  // Device labels go last: several devices at one installation point fan out instead of piling up.
  for (const r of targets)
    place($('world-target-' + r.device.id), [r.face.pos[0], r.face.pos[1] + 0.2, r.face.pos[2]], 4);
  const p = toWorld(state.player);
  p[1] = 1.95 + (engine.model.floorHeight?.(p[0], p[2]) || 0);
  place($('player'), p, 1);
  for (const actor of engine.model.actors) {
    if (actor.id === 'player') continue;
    const part = actor.parts.find((p) => p.shape === 'sphere' && p.local[1] === 1.27);
    place(
      $(
        actor.area
          ? 'resident-' + actor.id
          : actor.id === 'Maya'
            ? 'resident'
            : actor.id === 'Alex'
              ? 'alexNpc'
              : 'samNpc',
      ),
      [part.pos[0], part.pos[1] + 0.58, part.pos[2]],
      actor.area ? 3 : 2,
    );
  }
  const communityTargets = $('communityWorldTargets');
  communityTargets.hidden = !engine.communityView;
  if (engine.communityView) {
    const sim = engine.model.community.sim;
    if (communityTargets.communitySimulation !== sim) {
      communityTargets.communitySimulation = sim;
      communityTargets.dataset.region = state.activeLocation;
      communityTargets.innerHTML =
        sim.map.buildings
          .map(
            (b) =>
              `<button class="world-device-target community-building-target" data-community-building="${esc(b.type)}">${esc(b.name)}</button>`,
          )
          .join('') +
        '<button class="world-device-target community-building-target" data-community-crossing>Request pedestrian crossing</button><span class="world-device-target" data-community-signal></span>';
      communityTargets.querySelector('[data-community-crossing]').onclick = () => {
        sim.signals.requested = true;
      };
      communityTargets.querySelectorAll('[data-community-building]').forEach((button) => {
        button.onclick = () => {
          const type = button.dataset.communityBuilding;
          if (type === 'home') {
            engine.returnToProperty();
            enterArea('Living room');
            return;
          }
          enterArea(communityAreaNames[type]);
        };
      });
    }
    const signal = communityTargets.querySelector('[data-community-signal]');
    signal.textContent = `${sim.signals.phase} · ${Math.ceil(sim.signals.remaining)}s`;
    place(signal, [engine.model.community.origin.x, 4, engine.model.community.origin.z], 6);
    place(
      communityTargets.querySelector('[data-community-crossing]'),
      [engine.model.community.origin.x, 1, 8],
      5,
    );
    communityTargets.querySelectorAll('[data-community-building]').forEach((button) => {
      const b = sim.map.buildings.find((b) => b.type === button.dataset.communityBuilding);
      // Placed before resident tags (2) so the buttons get first choice of the free space.
      place(
        button,
        [engine.model.community.origin.x + b.x, b.type === 'factory' ? 8 : 5, b.z],
        1.5,
      );
    });
  }
  const { rect, blocked } = worldControlBoxes(engine);
  declutterLabels(labels, {
    bounds: rect ? { left: 4, top: 4, right: engine.width - 4, bottom: engine.height - 4 } : null,
    blocked,
  });
}
// Where the camera controls cover the 3D view. Measuring forces a page layout, so this runs only
// when the view's size, the layout or the view mode changes, not on every frame.
let controlBoxes = null;
function worldControlBoxes(engine) {
  const key = [engine.width, engine.height, state.layout, view].join();
  if (controlBoxes?.key === key) return controlBoxes;
  const rect = engine.canvas?.getBoundingClientRect?.();
  const blocked = rect
    ? ['.camera-bar', '.quest-locator', '.map-tools', '.map-location', '.minimap', '.dpad']
        .map((selector) => $('world').querySelector(selector)?.getBoundingClientRect())
        .filter((r) => r?.width && r?.height)
        .map((r) => ({
          left: r.left - rect.left,
          right: r.right - rect.left,
          top: r.top - rect.top,
          bottom: r.bottom - rect.top,
        }))
    : [];
  return (controlBoxes = { key, rect, blocked });
}
if (typeof $('worldCanvas')?.getContext === 'function') {
  try {
    world3d = new World3D($('worldCanvas'), {
      getState: () => ({
        devices: project().devices,
        env: state.env,
        outputs,
        outputScales,
        player: state.player,
        color: state.color,
        appearance: state.appearance,
        reduced: state.reduced,
        speed,
        areas: allAreas(),
        running,
        communityMission: isNativeCommunityProject(),
        locationId: state.activeLocation,
        visible: !state.travelScreen,
        upgrades: labState().upgrades,
        batteryWh: labState().resources.batteryWh,
        roofsVisible: state.roofsVisible,
        simClockMs: labState().elapsedMs,
        weatherMode: state.weatherMode,
        skyMode: state.skyMode || 'live',
        skyDate: state.skyDate,
        skyStartHour: labState().startHour,
        talkingNpc: $('modal').open ? activeConversation?.key : null,
        paused: labState().paused,
        routine: state.routinesEnabled
          ? residentRoutine(labState().elapsedMs, labState().startHour)
          : null,
      }),
      onFrame: projectWorldLabels,
      onBuildingSelect: selectCommunityBuilding,
      onError: (message) => {
        if (state.travelScreen && message.includes('connection was lost')) return;
        $('graphicsMessage').textContent = message;
        $('graphicsMessage').hidden = false;
      },
      onRecover: () => {
        $('graphicsMessage').hidden = true;
      },
    });
    // Keep only the travel globe's WebGL context active on the destination screen.
    if (state.travelScreen) world3d.releaseGraphics();
    $('world').classList.add('is-3d');
    renderSectionResidents();
    state.player = world3d.findFree(state.player);
    setMapView();
    updatePlayer();
  } catch (e) {
    $('graphicsMessage').textContent = e.message;
    $('graphicsMessage').hidden = false;
  }
}
// Structured, local WebMCP tools for the game’s primary learning journey.
if (navigator.modelContext?.registerTool) {
  navigator.modelContext.registerTool({
    name: 'iot_quest_read_state',
    description: 'Read current mission, controller, wiring, student code and simulated conditions.',
    inputSchema: { type: 'object', properties: {} },
    execute: async () => ({
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            mission: mission(),
            board: state.board,
            language: state.language,
            devices: project().devices,
            code: code(),
            environment: state.env,
            outputs,
            tests: testResults,
          }),
        },
      ],
    }),
  });
  navigator.modelContext.registerTool({
    name: 'iot_quest_test_solution',
    description:
      'Run all deterministic tests for the active student mission; reports each scenario.',
    inputSchema: { type: 'object', properties: {} },
    execute: async () => {
      testSolution();
      return {
        content: [
          { type: 'text', text: JSON.stringify({ passed: currentPassed, results: testResults }) },
        ],
      };
    },
  });
}

// A click in the overview only visits the building while a free build, teacher quest or program
// is under way; otherwise it starts that building's quest.
function selectCommunityBuilding(type) {
  enterArea(type === 'home' ? 'Living room' : communityAreaNames[type], {
    keepProject: free || !!activeFault || running,
  });
}
function openWorldCommunityProgramming() {
  enterArea(world3d?.indoorArea || 'Factory floor');
}
$('exploreCommunity').onclick = () => {
  if (!world3d) {
    openWorldCommunityProgramming();
    return;
  }
  changeView('world');
  world3d.snapCamera();
};
$('communityProgram').onclick = openWorldCommunityProgramming;

function setCommunityDensity() {
  const settings = locationProfile().community || {};
  $('trafficDensity').value = String(settings.trafficDensity ?? 12);
  $('pedestrianDensity').value = String(settings.pedestrianDensity ?? 10);
  if (world3d?.model.community) {
    world3d.model.community.sim.density = Number($('trafficDensity').value);
    world3d.model.community.sim.pedestrianDensity = Number($('pedestrianDensity').value);
  }
}
for (const [id, key, field] of [
  ['trafficDensity', 'trafficDensity', 'density'],
  ['pedestrianDensity', 'pedestrianDensity', 'pedestrianDensity'],
])
  $(id).oninput = () => {
    const value = Number($(id).value);
    (locationProfile().community ||= {})[key] = value;
    if (world3d?.model.community) world3d.model.community.sim[field] = value;
    save();
  };
setCommunityDensity();
