import test from 'node:test';
import assert from 'node:assert/strict';
import { Worker } from 'node:worker_threads';
import { once } from 'node:events';
import { missions, baseEnv, defaults, program } from '../public/missions.js';
import { createLabState } from '../public/lab.js';

// Browser-worker bridge: load the production worker, retaining asynchronous
// messages, structured cloning and a separate interpreter execution context.
async function controller(t) {
  const moduleURL = new URL('../public/sim-worker.js', import.meta.url).href;
  const worker = new Worker(
    new URL(
      'data:text/javascript,' +
        encodeURIComponent(`
  import {parentPort} from 'node:worker_threads';
  globalThis.self={postMessage:data=>parentPort.postMessage(data)};
  await import(${JSON.stringify(moduleURL)});
  parentPort.on('message',data=>self.onmessage({data}));
  parentPort.postMessage({type:'ready'});
 `),
    ),
    { type: 'module' },
  );
  t.after(() => worker.terminate());
  await once(worker, 'message');
  return async (data) => {
    const response = once(worker, 'message', { signal: AbortSignal.timeout(3000) });
    worker.postMessage(data);
    return (await response)[0];
  };
}
for (const language of ['cpp', 'python'])
  for (const board of ['ESP32', 'Raspberry Pi Pico']) {
    test(`editor worker: ${language} / ${board} runs edited source and responds to changing inputs`, async (t) => {
      const send = await controller(t),
        devices = defaults(missions[0].ids, board),
        lamp = devices.find((d) => d.output).pin;
      const initial = program(missions[0], language, devices, true);
      let state = await send({
        type: 'start',
        code: initial,
        language,
        devices,
        board,
        env: { ...baseEnv, light: 10 },
        lab: createLabState(),
        count: 1,
      });
      assert.equal(state.type, 'state');
      assert.equal(state.outputs[lamp], 1);
      assert.equal(state.time, 200);
      state = await send({
        type: 'tick',
        devices,
        env: { ...state.env, light: 90 },
        lab: state.lab,
        count: 4,
      });
      assert.equal(state.outputs[lamp], 0);
      assert.equal(state.time, 1000);
      assert.equal(state.lab.elapsedMs, 1000);
      // Same dark input, different student comparison: output must change.
      const edited = initial.replace('light < 1800', 'light > 1800');
      state = await send({
        type: 'start',
        code: edited,
        language,
        devices,
        board,
        env: { ...baseEnv, light: 10 },
        lab: createLabState(),
      });
      assert.equal(state.outputs[lamp], 0);
      assert.equal(state.time, 200);
      const serial =
        language === 'cpp'
          ? edited.replace('delay(200);', 'Serial.println(light);\n  delay(200);')
          : edited.replace('time.sleep_ms(200)', 'print(light)\n    time.sleep_ms(200)');
      state = await send({
        type: 'start',
        code: serial,
        language,
        devices,
        board,
        env: { ...baseEnv, light: 10 },
        ms: 200,
      });
      assert.equal(state.logs.at(-1), '410');
    });
  }
for (const language of ['cpp', 'python'])
  test(`editor worker: ${language} reports actual error lines and restarts after failure`, async (t) => {
    const send = await controller(t),
      devices = defaults(['ldr', 'led'], 'ESP32');
    const broken =
      language === 'cpp'
        ? 'void setup() {}\nvoid loop() {\n  int reading = unknown;\n}'
        : 'from machine import Pin\nwhile True:\n    reading = unknown';
    const error = await send({
      type: 'start',
      code: broken,
      language,
      devices,
      board: 'ESP32',
      env: baseEnv,
      ms: 200,
    });
    assert.equal(error.type, 'error');
    assert.equal(error.line, 3);
    assert.match(error.message, /unknown/);
    const state = await send({
      type: 'start',
      code: program(missions[0], language, devices, true),
      language,
      devices,
      board: 'ESP32',
      env: { ...baseEnv, light: 0 },
      ms: 200,
    });
    assert.equal(state.type, 'state');
    assert.equal(state.outputs[26], 1);
  });
test('editor worker bounds infinite loops without blocking the editor process', async (t) => {
  const send = await controller(t);
  const error = await send({
    type: 'start',
    code: 'void setup() {}\nvoid loop() { while (true) {} }',
    language: 'cpp',
    devices: [],
    board: 'ESP32',
    env: baseEnv,
    ms: 200,
  });
  assert.equal(error.type, 'error');
  assert.match(error.message, /Execution limit/);
});
test('editor worker pause/step/resume uses real execution and preserves the pending clock tick', async (t) => {
  const send = await controller(t),
    devices = defaults(['led'], 'ESP32');
  const code =
    'int counter = 0;\nvoid setup() { pinMode(26, OUTPUT); }\nvoid loop() {\n counter = counter + 1;\n digitalWrite(26, counter);\n delay(200);\n}';
  const initial = await send({
    type: 'start',
    code,
    language: 'cpp',
    devices,
    board: 'ESP32',
    env: baseEnv,
    ms: 200,
  });
  assert.equal(initial.outputs[26], 1);
  const step = await send({ type: 'debugStep', env: baseEnv, ms: 200 });
  assert.equal(step.tickComplete, false);
  assert.equal(step.variables.counter, 2);
  assert.equal(step.outputs[26], 1);
  assert.equal(step.line, 4);
  const resume = await send({ type: 'tick', env: baseEnv, ms: 200 });
  assert.equal(resume.outputs[26], 2);
  assert.equal(resume.time, 400);
});
