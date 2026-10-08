import { clamp } from './world-math.js';
import { ADC_SIGNALS } from './missions.js';
import { advanceEnvironment } from './weather.js';
export const RESOURCE_ASSUMPTIONS = {
  tankLitres: 100,
  pumpLitresPerSecond: 1.1,
  valveLitresPerSecond: 0.4,
  controllerWatts: 1,
  householdApplianceWatts: 120,
  watts: {
    led: 3,
    porch: 5,
    rgb: 3,
    buzzer: 0.2,
    servo: 2,
    gate: 30,
    fan: 15,
    ac: 800,
    pump: 25,
    valve: 3,
  },
  solarPeakWatts: 50,
  batteryCapacityWh: 100,
};
export const scenarios = {
  normal: { name: 'Normal day', temp: 24, rain: 0, humidity: 55, wind: 10, cloud: 25 },
  heatwave: { name: 'Simulated heatwave', temp: 41, rain: 0, humidity: 25, wind: 12, cloud: 5 },
  storm: { name: 'Simulated storm', temp: 23, rain: 85, humidity: 92, wind: 65, cloud: 95 },
  drought: {
    name: 'Simulated drought',
    temp: 34,
    rain: 0,
    humidity: 20,
    wind: 18,
    cloud: 5,
    soil: 15,
    tank: 25,
  },
  frost: { name: 'Simulated frost', temp: -4, rain: 0, humidity: 70, wind: 10, cloud: 30 },
  heavyRain: {
    name: 'Simulated heavy rain',
    temp: 22,
    rain: 100,
    humidity: 96,
    wind: 35,
    cloud: 100,
  },
};
export function createLabState() {
  return {
    elapsedMs: 0,
    startHour: 8,
    paused: false,
    scenario: 'normal',
    dailyCycle: false,
    resources: {
      wh: 0,
      litres: 0,
      solarWh: 0,
      gridWh: 0,
      batteryWh: 20,
      byDevice: {},
      history: [],
    },
    upgrades: [],
    evidence: [],
    role: 'Installer',
    attempts: 0,
  };
}
export function samplePractice(env, lab, location) {
  const s = scenarios[lab.scenario] || scenarios.normal,
    hour = ((Number.isFinite(lab.startHour) ? lab.startHour : 8) + lab.elapsedMs / 3600000) % 24,
    day = Math.max(0, Math.sin(((hour - 6) / 12) * Math.PI)),
    cycle = lab.dailyCycle;
  const out = { ...env };
  if (cycle) {
    out.light = clamp(day * (95 - s.cloud * 0.5), 2, 95);
    out.isDay = hour >= 6 && hour < 18;
    out.outdoorTemp =
      (lab.scenario === 'normal' ? (location?.practice.outdoorTemp ?? 24) : s.temp) +
      Math.sin(((hour - 9) / 12) * Math.PI) * 4;
    out.rain = s.rain;
    out.humidity = s.humidity;
    out.cloud = s.cloud;
    out.wind = s.wind;
  }
  return out;
}
export function residentRoutine(elapsedMs, startHour = 8) {
  const hour = (startHour + elapsedMs / 3600000) % 24,
    night = hour < 6 || hour >= 20,
    away = hour >= 8.5 && hour < 17,
    arrival = hour >= 17 && hour < 17.5;
  return {
    hour,
    occupied: away ? 0 : 1,
    motion: arrival || (hour >= 11 && hour < 12) ? 1 : 0,
    appliance: (hour >= 11.5 && hour < 12.5) || (hour >= 17.5 && hour < 18.5) ? 1 : 0,
    door: arrival ? 1 : 0,
    actors: {
      Maya: night ? [-10.5, -8.5] : hour >= 11 && hour < 16 ? [7, 2.4] : [-10.5, -3.5],
      Alex: away ? [0, 10] : arrival ? [-5.8, 0.4] : [-10, -3.5],
      Sam: night ? [-10, -8] : [-5.8, -3.5],
    },
  };
}
export function updateResources(resources, devices, outputs, env, seconds, upgrades = []) {
  const a = RESOURCE_ASSUMPTIONS,
    next = {
      ...resources,
      byDevice: { ...resources.byDevice },
      history: [...(resources.history || [])],
    };
  const capacity = a.tankLitres * (upgrades.includes('rainTank') ? 2 : 1),
    available =
      ((env.tank || 0) / 100) * capacity +
      (env.rain || 0) * 0.003 * seconds * (upgrades.includes('rainTank') ? 2 : 1);
  let watts = a.controllerWatts + (env.appliance ? a.householdApplianceWatts : 0),
    waterDemand = 0;
  if (env.appliance) {
    const old = next.byDevice.householdAppliance || { wh: 0, litres: 0 };
    next.byDevice.householdAppliance = {
      wh: old.wh + (a.householdApplianceWatts * seconds) / 3600,
      litres: 0,
    };
  }
  for (const d of devices) {
    const value = Number(outputs[d.pin] || 0),
      level = value === 1 ? 1 : clamp(value / (value > 255 ? 65535 : 255), 0, 1),
      power = (a.watts[d.id] || 0) * level;
    watts += power;
    const prior = next.byDevice[d.id] || { wh: 0, litres: 0 };
    next.byDevice[d.id] = { wh: prior.wh + (power * seconds) / 3600, litres: prior.litres };
    if (value > 0 && ['pump', 'valve'].includes(d.id)) {
      const litres = Math.min(
        Math.max(0, available - waterDemand),
        seconds * (d.id === 'pump' ? a.pumpLitresPerSecond : a.valveLitresPerSecond),
      );
      next.byDevice[d.id].litres += litres;
      waterDemand += litres;
    }
  }
  waterDemand = Math.min(waterDemand, available);
  const energy = (watts * seconds) / 3600,
    solar = upgrades.includes('solar')
      ? (a.solarPeakWatts * clamp((env.light || 0) / 100, 0, 1) * seconds) / 3600
      : 0;
  next.wh += energy;
  next.litres += waterDemand;
  next.solarWh += solar;
  let deficit = Math.max(0, energy - solar),
    surplus = Math.max(0, solar - energy);
  if (upgrades.includes('battery')) {
    const fromBattery = Math.min(next.batteryWh, deficit);
    next.batteryWh -= fromBattery;
    deficit -= fromBattery;
    next.batteryWh = Math.min(a.batteryCapacityWh, next.batteryWh + surplus);
  }
  next.gridWh += deficit;
  return next;
}
export function simulateBatch(
  runtime,
  {
    env,
    lab,
    devices,
    mode = 'practice',
    weather = null,
    location = null,
    count = 1,
    dtMs = 200,
    routines = false,
    trace = false,
  },
) {
  const next = structuredClone(lab),
    iterations = Math.min(3600, Math.max(1, Math.round(count))),
    samples = [];
  let current = { ...env },
    result,
    printed = runtime.printed || 0;
  for (let i = 0; i < iterations; i++) {
    if (next.paused) break;
    if (mode === 'practice') current = samplePractice(current, next, location);
    if (routines) {
      const r = residentRoutine(next.elapsedMs, next.startHour);
      current.motion = r.motion;
      current.door = r.door;
      current.occupied = r.occupied;
      current.appliance = r.appliance;
    }
    result = runtime.step(current, dtMs);
    if (trace) {
      // New serial lines since the previous step (logs keep only the latest 100).
      const fresh = Math.min((result.printed || 0) - printed, result.logs.length);
      printed = result.printed || 0;
      samples.push({
        t: result.time,
        inputs: { ...result.inputs },
        outputs: { ...result.outputs },
        lines: fresh > 0 ? result.logs.slice(-fresh) : [],
      });
    }
    next.resources = updateResources(
      next.resources,
      devices,
      result.outputs,
      current,
      dtMs / 1000,
      next.upgrades,
    );
    current = advanceEnvironment(current, devices, result.outputs, dtMs / 1000, {
      mode,
      weather,
      location,
      tankCapacity: 100 * (next.upgrades.includes('rainTank') ? 2 : 1),
      collectionFactor: next.upgrades.includes('rainTank') ? 2 : 1,
    });
    current.pond = clamp(
      (current.pond ?? 60) + ((current.rain || 0) * 0.001 * dtMs) / 1000 - (0.005 * dtMs) / 1000,
      0,
      100,
    );
    next.elapsedMs += dtMs;
  }
  if (next.elapsedMs && Math.floor(next.elapsedMs / 60000) !== Math.floor(lab.elapsedMs / 60000)) {
    next.resources.history.push({
      seconds: next.elapsedMs / 1000,
      wh: next.resources.wh,
      litres: next.resources.litres,
    });
    next.resources.history = next.resources.history.slice(-240);
    if (next.upgrades.includes('weatherStation')) {
      next.stationSamples = [
        ...(next.stationSamples || []),
        {
          atSeconds: next.elapsedMs / 1000,
          temperature: current.outdoorTemp,
          humidity: current.humidity,
          rain: current.rain,
          wind: current.wind,
        },
      ].slice(-240);
    }
  }
  return {
    ...(result || {
      outputs: { ...runtime.outputs },
      logs: runtime.logs,
      time: runtime.time,
      inputs: {},
      variables: {},
    }),
    env: current,
    lab: next,
    ...(trace ? { trace: condenseTrace(samples) } : {}),
  };
}
// At accelerated speeds a batch holds hundreds of steps; keep at most `limit` evenly spaced
// samples (always the last), carrying forward serial lines from the steps that were dropped.
export function condenseTrace(samples, limit = 12) {
  if (samples.length <= limit) return samples;
  const out = [],
    stride = samples.length / limit;
  let lines = [];
  for (let i = 0; i < samples.length; i++) {
    lines.push(...samples[i].lines);
    const keep = Math.floor((i + 1) / stride) > Math.floor(i / stride) || i === samples.length - 1;
    if (keep) {
      out.push({ ...samples[i], lines: lines.slice(-4) });
      lines = [];
    }
  }
  return out;
}
export function circuitSnapshot(devices, outputs, inputs = {}, kinds = {}, env = {}) {
  const used = new Map();
  for (const d of devices) used.set(d.pin, (used.get(d.pin) || 0) + 1);
  return devices.map((d) => {
    const adc = ADC_SIGNALS.includes(d.signal),
      raw = d.faultValue ?? env[d.signal] ?? 0;
    return {
      id: d.id,
      name: d.name,
      pin: d.pin,
      type: d.output ? 'Output' : d.analog ? 'Analogue input' : 'Digital input',
      value: d.output
        ? (outputs[d.pin] ?? 0)
        : (inputs[d.pin] ?? (d.analog && adc ? Math.round(raw * 40.95) : raw)),
      kind: kinds[d.pin] || 'digital',
      sampled: d.output ? Object.hasOwn(outputs, d.pin) : Object.hasOwn(inputs, d.pin),
      connected: d.power && d.ground,
      conflict: used.get(d.pin) > 1,
      fault: d.faultValue !== undefined,
    };
  });
}
export const faultCases = [
  {
    id: 'ground',
    title: 'The silent path lamp',
    type: 'Disconnected wire',
    explain:
      'Without a shared ground the lamp circuit is incomplete. Restoring GND lets the commanded current return to the controller.',
    hints: [
      'Inspect the lamp’s power and ground.',
      'The signal pin is correct, but one supply connection is missing.',
      'Reconnect the Path lights GND checkbox in Wiring.',
    ],
  },
  {
    id: 'pin',
    title: 'Two devices, one pin',
    type: 'Incorrect pin',
    explain:
      'The LDR needs an ADC-capable input, distinct from the lamp output. GPIO assignments in code and Wiring must agree.',
    hints: [
      'Compare pin labels in Wiring and the code.',
      'The sensor is connected to the output pin.',
      'Use the recommended circuit, then confirm the light input matches the code.',
    ],
  },
  {
    id: 'sensor',
    title: 'A sensor stuck at noon',
    type: 'Faulty reading',
    explain:
      'A stuck reading never reflects darkness. Replacing or recalibrating the simulated probe restores truthful analogue readings.',
    hints: [
      'Change sunlight and watch the light reading.',
      'The sensor keeps reporting full brightness.',
      'In Live circuit, select the probe and replace the faulty simulated sensor.',
    ],
  },
  {
    id: 'code',
    title: 'The upside-down lantern',
    type: 'Programming error',
    explain:
      'The comparison must be light < 1800. The reversed comparison turns the lamp on in daylight and off at night.',
    hints: [
      'Run bright and dark tests separately.',
      'Inspect which branch is taken when the light reading is low.',
      'Change the light comparison from > to <, then rerun all tests.',
    ],
  },
];
