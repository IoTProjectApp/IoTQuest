import { Runtime } from './runtime.js';
import { baseEnv } from './missions.js';
import { scenarios, residentRoutine } from './lab.js';
import { advanceEnvironment } from './weather.js';
import { ADC_SIGNALS, ADC_SCALE } from './signals.js';
import { clamp } from './world-math.js';
// Day log: runs the student's program through a stylised 24-hour day, records a reading every
// few minutes, and builds questions that can only be answered from that data.

export const DAY_SAMPLE_MINUTES = 10;
// Each sample gives the program 25 steps (5 simulated seconds) to react, the same as the
// mission tests, then lets the house change for a compressed minute before the next reading.
const PROGRAM_STEPS = 25,
  WORLD_SECONDS = 60;

// Weather for an hour of the day: the sun rises at 6 and sets at 18, it is warmest mid-afternoon,
// and wet scenarios rain in the afternoon. Resident routines set motion and occupancy.
export function dayEnvironment(scenario, hour, env = {}) {
  const s = scenarios[scenario] || scenarios.normal,
    sun = Math.max(0, Math.sin(((hour - 6) / 12) * Math.PI)),
    swing = Math.sin(((hour - 9) / 24) * 2 * Math.PI),
    routine = residentRoutine(0, hour),
    temp = Math.round((s.temp + 5 * swing) * 10) / 10;
  return {
    ...env,
    light: Math.round(sun * 95 * (1 - s.cloud / 150)),
    isDay: sun > 0,
    temp,
    outdoorTemp: temp,
    humidity: Math.round(clamp(s.humidity - 10 * swing, 0, 100)),
    rain: s.rain && hour >= 13 && hour < 19 ? s.rain : 0,
    wind: s.wind,
    cloud: s.cloud,
    motion: routine.motion,
    occupied: routine.occupied,
    door: routine.door,
    appliance: routine.appliance,
  };
}

const sensorsOf = (devices) => devices.filter((d) => !d.output && d.signal);
const outputsOf = (devices) => devices.filter((d) => d.output);
// What the program would read: ADC sensors as 0–4095, calibrated ones in their own units.
export function shownReading(device, env) {
  const v = Number(env[device.signal] ?? 0);
  if (!device.analog) return v ? 1 : 0;
  return ADC_SIGNALS.includes(device.signal) ? Math.round(v * ADC_SCALE) : Math.round(v * 10) / 10;
}
const clock = (minutes) =>
  String(Math.floor(minutes / 60)).padStart(2, '0') + ':' + String(minutes % 60).padStart(2, '0');

// Returns { rows } or { error } when the program cannot run.
export function simulateDay(code, language, devices, board, { scenario = 'normal' } = {}) {
  let runtime;
  try {
    runtime = new Runtime(code, language, devices, board);
  } catch (e) {
    return { error: 'The program has an error: ' + e.message };
  }
  const s = scenarios[scenario] || scenarios.normal;
  let env = { ...baseEnv, soil: s.soil ?? baseEnv.soil, tank: s.tank ?? baseEnv.tank },
    result;
  const rows = [];
  for (let minutes = 0; minutes < 24 * 60; minutes += DAY_SAMPLE_MINUTES) {
    env = dayEnvironment(scenario, minutes / 60, env);
    try {
      for (let i = 0; i < PROGRAM_STEPS; i++) result = runtime.step(env);
    } catch (e) {
      return { error: 'The program stopped at ' + clock(minutes) + ' with an error: ' + e.message };
    }
    rows.push({
      minutes,
      time: clock(minutes),
      readings: Object.fromEntries(sensorsOf(devices).map((d) => [d.pin, shownReading(d, env)])),
      outputs: Object.fromEntries(
        outputsOf(devices).map((d) => [d.pin, result.outputs[d.pin] || 0]),
      ),
    });
    for (let t = 0; t < WORLD_SECONDS; t += 2)
      env = advanceEnvironment(env, devices, result.outputs, 2, { mode: 'practice' });
  }
  return { rows };
}

const csvCell = (v) => '"' + String(v).replace(/"/g, '""') + '"';
export function dayLogCSV(rows, devices) {
  const sensors = sensorsOf(devices),
    outputs = outputsOf(devices);
  return (
    [
      ['Time', ...sensors.map((d) => d.name), ...outputs.map((d) => d.name)],
      ...rows.map((r) => [
        r.time,
        ...sensors.map((d) => r.readings[d.pin]),
        ...outputs.map((d) => r.outputs[d.pin]),
      ]),
    ]
      .map((line) => line.map(csvCell).join(','))
      .join('\r\n') + '\r\n'
  );
}

const duration = (minutes) =>
  minutes < 60
    ? minutes + ' min'
    : Math.floor(minutes / 60) + ' h' + (minutes % 60 ? ' ' + (minutes % 60) + ' min' : '');
// Choices are sorted, so the answer's position gives nothing away.
function choiceQuestion(id, prompt, correct, distractors, explanation, order = (a, b) => a - b) {
  const values = [...new Set([correct, ...distractors])].slice(0, 4).sort(order);
  return { id, prompt, choices: values, answer: values.indexOf(correct), explanation };
}

// Up to three questions that can only be answered from this day's data.
export function dayLogQuestions(rows, devices) {
  const questions = [],
    output = outputsOf(devices)[0],
    sensor = sensorsOf(devices).find((d) => d.analog) || sensorsOf(devices)[0];
  if (output) {
    const on = rows.filter((r) => r.outputs[output.pin] > 0);
    if (!on.length)
      questions.push({
        id: 'first-on',
        prompt: `Did the ${output.name} turn on at any time during the day?`,
        choices: ['Yes', 'No'],
        answer: 1,
        explanation: `It stayed off in all ${rows.length} readings. Compare the day's readings with the threshold in your code.`,
      });
    else {
      const first = on[0].minutes;
      questions.push(
        choiceQuestion(
          'first-on',
          `At what time did the ${output.name} first turn on?`,
          first,
          [first - 120, first + 60, first + 180, first - 60, first + 240].filter(
            (m) => m >= 0 && m < 1440,
          ),
          `The first reading with the ${output.name} on is at ${clock(first)}.`,
        ),
      );
      questions.at(-1).choices = questions.at(-1).choices.map(clock);
      const total = on.length * DAY_SAMPLE_MINUTES;
      questions.push(
        choiceQuestion(
          'time-on',
          `About how much time did the ${output.name} spend switched on in total?`,
          total,
          [
            Math.round(total / 2 / 10) * 10,
            total * 2,
            total + 120,
            Math.max(10, total - 120),
          ].filter((m) => m > 0 && m <= 1440 && m !== total),
          `${on.length} of the ${rows.length} readings show the ${output.name} on, and each reading covers ${DAY_SAMPLE_MINUTES} minutes: ${duration(total)}.`,
        ),
      );
      questions.at(-1).choices = questions.at(-1).choices.map(duration);
    }
  }
  const values = sensor ? rows.map((r) => r.readings[sensor.pin]) : [];
  if (sensor?.analog && new Set(values).size > 1) {
    const max = Math.max(...values),
      at = rows[values.indexOf(max)].time,
      sorted = [...new Set(values)].sort((a, b) => a - b);
    questions.push(
      choiceQuestion(
        'highest',
        `What was the highest ${sensor.name} reading of the day?`,
        max,
        [sorted[0], sorted[Math.floor(sorted.length / 2)], sorted[Math.floor(sorted.length * 0.8)]],
        `The highest reading was ${max}, at ${at}.`,
      ),
    );
  }
  return questions;
}
