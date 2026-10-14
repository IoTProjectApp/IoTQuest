import { Runtime } from './runtime.js';
import { baseEnv, outputLevel } from './signals.js';
// Timeline tests for quests whose outputs depend on what happened before: timers, latches,
// hysteresis, button presses, counters, network outages and restarts. A single snapshot cannot
// prove these, so each sequence feeds the program an ordered list of steps on one runtime, keeping
// its variables from step to step, and checks the outputs at the end of each step.
//
// A quest's `sequences` is a list of { name, env, tick, steps }. Each step is
// [label, env, ms, expect] or an object { label, env, ms, expect, restart, network, send, check }:
// - env: readings that change at the start of the step (earlier readings carry on);
// - ms: how long the step lasts on the program's clock;
// - expect: one entry per output, in the quest's order: 1 (on), 0 (off), null (either) or
//   { level } for a PWM brightness of 0–255;
// - restart: the controller restarts (a power cut): variables are lost, memoryWrite values kept;
// - network: false drops the network, true brings it back (the program must reconnect);
// - send: [topic, payload] or [topic, payload, client] published at the start of the step;
// - check(ctx): extra checks on what the program published, printed or tried (ctx.attempts holds
//   the times it called mqttReconnect); returns true, or a sentence saying what went wrong.
// The clock moves on in ticks (200 ms unless the sequence sets `tick`). Delays are honoured as on
// hardware: while a program sleeps, the clock moves on without running it.

const DELAYS = { delay: 1, sleep_ms: 1, 'time.sleep_ms': 1, sleep: 1000, 'time.sleep': 1000 };

// `previous` is the runtime before a restart, whose broker (the network) carries on.
function makeRuntime(code, language, devices, board, tick, memory, previous, sent, attempts) {
  const runtime = new Runtime(code, language, devices, board),
    call = runtime.call.bind(runtime);
  runtime.memory = memory;
  if (previous) {
    // After a restart the board is a new client: it has to connect and subscribe again.
    previous.broker.clients.delete(previous.clientId);
    runtime.broker = previous.broker;
  }
  runtime.wakeAt = 0;
  runtime.call = (name, args) => {
    if (name in DELAYS) runtime.wakeAt = runtime.time + Number(args[0] || 0) * DELAYS[name] - tick;
    if (name === 'mqttReconnect') attempts.push(runtime.time);
    // What the program itself publishes, whatever client name it connected with.
    // (A publish while disconnected is dropped, so it does not count.)
    if (name === 'mqttPublish' && runtime.broker.connected(runtime.clientId))
      sent.push({ at: runtime.time, topic: String(args[0]), payload: args[1] });
    return call(name, args);
  };
  return runtime;
}

export const normalise = (step) =>
  Array.isArray(step) ? { label: step[0], env: step[1], ms: step[2], expect: step[3] } : step;
export const seconds = (ms) => (ms / 1000).toFixed(ms % 1000 ? 1 : 0) + ' s';
const show = (value) =>
  value === null || value === undefined
    ? 'either'
    : typeof value === 'object'
      ? 'brightness ' + value.level
      : value
        ? 'ON'
        : 'OFF';

// Runs one sequence and returns { pass, detail }.
export function runSequence(quest, sequence, code, language, devices, board) {
  const tick = sequence.tick || 200,
    outputs = quest.ids.map((id) => devices.find((d) => d.id === id)).filter((d) => d?.output),
    memory = new Map(),
    sent = [],
    attempts = [];
  let runtime = makeRuntime(code, language, devices, board, tick, memory, null, sent, attempts),
    env = { ...baseEnv, ...sequence.env },
    result = null,
    elapsed = 0,
    checks = 0;
  try {
    for (const raw of sequence.steps) {
      const step = normalise(raw);
      if (step.restart) {
        runtime = makeRuntime(
          code,
          language,
          devices,
          board,
          tick,
          memory,
          runtime,
          sent,
          attempts,
        );
        result = null;
      }
      if (step.network !== undefined) runtime.broker.setAvailable(step.network);
      env = { ...env, ...step.env };
      runtime.broker.now = runtime.time;
      if (step.send) {
        const [topic, payload, client = 'dashboard'] = step.send;
        runtime.broker.connect(client);
        runtime.broker.publish(client, topic, payload);
      }
      const sentBefore = sent.length,
        printedBefore = runtime.printed;
      for (let t = 0; t < Math.round((step.ms ?? tick) / tick); t++) {
        if (result && runtime.time < runtime.wakeAt) runtime.time += tick;
        else result = runtime.step({ ...env }, tick);
        runtime.broker.now = runtime.time;
      }
      elapsed += step.ms ?? tick;
      const levels = outputs.map((d) =>
          Math.round(outputLevel(result?.outputs[d.pin] || 0, result?.outputScales[d.pin]) * 255),
        ),
        at = '“' + step.label + '” (' + seconds(elapsed) + ' in)';
      if (step.expect) {
        checks++;
        const wrong = step.expect.findIndex((want, i) =>
          want === null || want === undefined
            ? false
            : typeof want === 'object'
              ? Math.abs(levels[i] - want.level) > 1
              : (levels[i] > 0 ? 1 : 0) !== want,
        );
        if (wrong >= 0) {
          const d = outputs[wrong],
            got =
              typeof step.expect[wrong] === 'object' ? { level: levels[wrong] } : levels[wrong] > 0;
          return {
            pass: false,
            detail:
              'At ' +
              at +
              ' the ' +
              d.name.toLowerCase() +
              ' should be ' +
              show(step.expect[wrong]) +
              ', but it is ' +
              show(got) +
              '.',
          };
        }
      }
      if (step.check) {
        checks++;
        const printed = runtime.printed - printedBefore,
          verdict = step.check({
            outputs: levels.map((l) => (l > 0 ? 1 : 0)),
            levels,
            publishes: [...sent],
            stepPublishes: sent.slice(sentBefore),
            logs: [...runtime.logs],
            stepLogs: printed > 0 ? runtime.logs.slice(-printed) : [],
            attempts: [...attempts],
            time: runtime.time,
          });
        if (verdict !== true) return { pass: false, detail: 'At ' + at + ': ' + verdict };
      }
    }
  } catch (e) {
    return { pass: false, detail: 'The program stopped with an error: ' + e.message };
  }
  return {
    pass: true,
    detail:
      checks + ' check' + (checks === 1 ? '' : 's') + ' passed over ' + seconds(elapsed) + '.',
  };
}

// One test result per sequence, in the form Test your solution shows.
export function timelineResults(quest, code, language, devices, board) {
  return (quest.sequences || []).map((sequence) => ({
    name: sequence.name,
    ...runSequence(quest, sequence, code, language, devices, board),
  }));
}
