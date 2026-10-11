import test from 'node:test';
import assert from 'node:assert/strict';
import { Runtime, pythonToC } from '../public/runtime.js';
import { defaults, baseEnv, missions, program } from '../public/missions.js';
import {
  createLabState,
  simulateBatch,
  updateResources,
  circuitSnapshot,
  residentRoutine,
  samplePractice,
} from '../public/lab.js';
import { projectFiles, zipFiles } from '../public/project-package.js';
import { SimulatedBroker } from '../public/mqtt.js';
import { isLocationUnlocked, locations, adaptMissions } from '../public/locations.js';
test('a daily cycle that starts at midnight stays dark rather than falling back to 08:00', () => {
  const lab = createLabState();
  lab.startHour = 0;
  lab.dailyCycle = true;
  const env = samplePractice(baseEnv, lab);
  assert.equal(env.isDay, false);
  assert.equal(env.light, 2);
});
for (const language of ['cpp', 'python']) {
  test(`${language}: fast batches keep controller millis and world time synchronized`, () => {
    const ds = defaults(['ldr', 'led'], 'ESP32'),
      rt = new Runtime(program(missions[0], language, ds, true), language, ds),
      lab = createLabState();
    lab.dailyCycle = true;
    lab.startHour = 12;
    const r = simulateBatch(rt, { env: baseEnv, lab, devices: ds, count: 360, dtMs: 200 });
    assert.equal(rt.time, 72000);
    assert.equal(r.lab.elapsedMs, 72000);
    assert.ok(r.lab.resources.wh > 0);
    assert.equal(r.outputs[26], 0);
  });
  test(`${language}: pausing does not advance time or consume resources`, () => {
    const ds = defaults(['ldr', 'led'], 'ESP32'),
      rt = new Runtime(program(missions[0], language, ds, true), language, ds),
      lab = createLabState();
    lab.paused = true;
    const r = simulateBatch(rt, { env: baseEnv, lab, devices: ds, count: 360 });
    assert.equal(rt.time, 0);
    assert.equal(r.lab.elapsedMs, 0);
    assert.equal(r.lab.resources.wh, 0);
  });
  test(`${language}: statement debugging exposes actual variables and output transitions`, () => {
    const ds = defaults(['led'], 'ESP32'),
      code =
        language === 'cpp'
          ? 'int value = 0;\nvoid setup() { pinMode(26, OUTPUT); }\nvoid loop() {\n  value = value + 1;\n  digitalWrite(26, value);\n  delay(200);\n}'
          : 'from machine import Pin\nimport time\nled = Pin(26, Pin.OUT)\nvalue = 0\nwhile True:\n    value = value + 1\n    led.value(value)\n    time.sleep_ms(200)';
    const rt = new Runtime(code, language, ds),
      states = [];
    let r;
    for (let i = 0; i < 40; i++) {
      r = rt.debugStep(baseEnv);
      states.push(r);
      if (r.tickComplete) break;
    }
    assert.ok(states.some((s) => s.variables.value === 1));
    assert.ok(states.some((s) => s.outputs[26] === 1));
    assert.ok(states.some((s) => s.outputs[26] === undefined));
    assert.equal(rt.time, 200);
    assert.ok(states.every((s) => s.line > 0));
    assert.equal(r.tickComplete, true);
    rt.step(baseEnv);
    assert.equal(rt.time, 400);
    assert.equal(rt.outputs[26], 2);
  });
}
test('electricity and water meters follow activity with documented units', () => {
  const ds = defaults(['pump', 'fan'], 'ESP32'),
    r = updateResources(createLabState().resources, ds, { 26: 1, 25: 255 }, baseEnv, 10);
  assert.ok(Math.abs(r.wh - (41 * 10) / 3600) < 1e-9);
  assert.equal(r.litres, 11);
  assert.equal(r.byDevice.pump.litres, 11);
  const off = updateResources(createLabState().resources, ds, {}, baseEnv, 10);
  assert.equal(off.litres, 0);
  assert.ok(Math.abs(off.wh - 10 / 3600) < 1e-9);
});
test('water usage cannot exceed available tank volume', () => {
  const r = updateResources(
    createLabState().resources,
    defaults(['pump'], 'ESP32'),
    { 26: 1 },
    { ...baseEnv, tank: 0.2 },
    10,
  );
  assert.equal(r.litres, 0.2);
});
test('solar depends on sunlight and batteries respect capacity', () => {
  const r = updateResources(createLabState().resources, [], {}, { ...baseEnv, light: 100 }, 3600, [
    'solar',
    'battery',
  ]);
  assert.equal(r.solarWh, 50);
  assert.equal(r.gridWh, 0);
  assert.ok(r.batteryWh > 20 && r.batteryWh <= 100);
  const empty = { ...createLabState().resources, batteryWh: 0 };
  const night = updateResources(empty, [], {}, { ...baseEnv, light: 0 }, 3600, [
    'solar',
    'battery',
  ]);
  assert.equal(night.solarWh, 0);
  assert.equal(night.batteryWh, 0);
  assert.equal(night.gridWh, 1);
});
test('circuit indicators match executed GPIO values including MicroPython read_u16 and PWM', () => {
  const ds = defaults(['ldr', 'led'], 'ESP32'),
    rt = new Runtime(
      'from machine import Pin, ADC, PWM\nimport time\nsensor = ADC(Pin(34))\nled = PWM(Pin(26))\nwhile True:\n    x = sensor.read_u16()\n    led.duty_u16(32768)\n    time.sleep_ms(200)',
      'python',
      ds,
    ),
    r = rt.step({ ...baseEnv, light: 100 }),
    rows = circuitSnapshot(ds, r.outputs, r.inputs, r.outputKinds, baseEnv);
  assert.equal(rows[0].value, 65520);
  assert.equal(rows[1].value, 32768);
  assert.equal(rows[1].kind, 'pwm');
  assert.equal(rows[0].sampled, true);
});
test('faulty sensor readings are interpreted and repaired readings change the result', () => {
  const ds = defaults(['ldr', 'led'], 'ESP32'),
    code = program(missions[0], 'cpp', ds, true);
  ds[0].faultValue = 100;
  const bad = new Runtime(code, 'cpp', ds).step({ ...baseEnv, light: 0 });
  assert.equal(bad.outputs[26], 0);
  delete ds[0].faultValue;
  const good = new Runtime(code, 'cpp', ds).step({ ...baseEnv, light: 0 });
  assert.equal(good.outputs[26], 1);
});
test('circuit highlights missing connections and conflicts', () => {
  const ds = defaults(['ldr', 'led'], 'ESP32');
  ds[1].pin = 34;
  ds[1].ground = false;
  const rows = circuitSnapshot(ds, {}, {});
  assert.equal(rows[0].conflict, true);
  assert.equal(rows[1].connected, false);
});
test('runtime errors carry meaningful source lines', () => {
  const rt = new Runtime('void setup() {}\nvoid loop() {\n int x = unknown;\n}', 'cpp', []);
  assert.throws(() => rt.step(baseEnv), /Unknown variable/);
  assert.equal(rt.currentLine, 3);
  assert.throws(
    // Any consistent indentation width is valid; a line indented with no block above is not.
    () => pythonToC('x = 1\n  y = 2'),
    (e) => e.line === 2,
  );
});
test('Python string literals retain keywords and hash characters', () => {
  const rt = new Runtime(
    'while True:\n    print("True and not # comment")\n    sleep_ms(200)',
    'python',
    [],
  );
  assert.equal(rt.step(baseEnv).logs[0], 'True and not # comment');
});
test('export ZIP contains exact source, pins, board and evidence', () => {
  const ds = defaults(['ldr', 'led'], 'Raspberry Pi Pico'),
    source = program(missions[0], 'python', ds, true),
    files = projectFiles({
      name: 'Ari',
      language: 'python',
      board: 'Raspberry Pi Pico',
      code: source,
      devices: ds,
      mission: missions[0],
      results: [{ pass: true }],
      lab: createLabState(),
      location: 'kyoto',
    }),
    bytes = zipFiles(files),
    view = new DataView(bytes.buffer);
  assert.equal(view.getUint32(0, true), 0x04034b50);
  assert.equal(files['student-code.py'], source);
  assert.match(files['pin-assignments.csv'], /Raspberry Pi Pico/);
  assert.match(files['pin-assignments.csv'], /"26"/);
  assert.match(files['wiring.svg'], /GPIO 15/);
  assert.match(files['hardware-notes.md'], /3.3 V/);
  assert.deepEqual(JSON.parse(files['components.json']), ds);
  let at = 0,
    count = 0;
  const decoder = new TextDecoder();
  while (view.getUint32(at, true) === 0x04034b50) {
    const size = view.getUint32(at + 18, true),
      nameLength = view.getUint16(at + 26, true),
      name = decoder.decode(bytes.slice(at + 30, at + 30 + nameLength)),
      data = decoder.decode(bytes.slice(at + 30 + nameLength, at + 30 + nameLength + size));
    assert.equal(data, files[name]);
    count++;
    at += 30 + nameLength + size;
  }
  assert.equal(count, Object.keys(files).length);
});
test('simulated MQTT publishes, drops during loss, and reconnects through student code', () => {
  const broker = new SimulatedBroker(),
    sender = new Runtime(
      'void setup(){ mqttConnect("A"); } void loop(){ if (!mqttConnected()) { mqttReconnect(); } mqttPublish("fan", 1); delay(200); }',
      'cpp',
      [],
    ),
    ds = defaults(['fan'], 'ESP32'),
    receiver = new Runtime(
      'void setup(){pinMode(26, OUTPUT);mqttConnect("B");mqttSubscribe("fan");} void loop(){if(!mqttConnected()){mqttReconnect();mqttSubscribe("fan");} if(mqttConnected()){digitalWrite(26,mqttRead("fan"));}else{digitalWrite(26,LOW);}delay(200);}',
      'cpp',
      ds,
    );
  sender.broker = receiver.broker = broker;
  receiver.step(baseEnv);
  sender.step(baseEnv);
  assert.equal(receiver.step(baseEnv).outputs[26], 1);
  broker.setAvailable(false);
  sender.step(baseEnv);
  assert.equal(receiver.step(baseEnv).outputs[26], 0);
  assert.match(broker.messages.at(-1).status, /dropped/);
  broker.setAvailable(true);
  receiver.step(baseEnv);
  sender.step(baseEnv);
  assert.equal(receiver.step(baseEnv).outputs[26], 1);
});
test('destination unlocks use actual completions and free exploration opens all', () => {
  const l = locations.find((l) => l.unlockAfter === 4);
  assert.equal(isLocationUnlocked({ completed: {}, locationProgress: {} }, l), false);
  assert.equal(
    isLocationUnlocked({ completed: { 0: {}, 1: {}, 2: {}, 3: {} }, locationProgress: {} }, l),
    true,
  );
  assert.equal(isLocationUnlocked({ freeExploration: true }, l), true);
});
test('resident routines trigger arrival motion, door contacts and empty-house occupancy', () => {
  const empty = residentRoutine(2 * 3600000, 8),
    arrival = residentRoutine(9 * 3600000, 8);
  assert.equal(empty.occupied, 0);
  assert.equal(arrival.motion, 1);
  assert.equal(arrival.door, 1);
});
for (const l of locations)
  for (const language of ['cpp', 'python'])
    test(`${l.city}: beginner missions work without advanced sensor dependencies (${language})`, () => {
      for (const m of adaptMissions(missions, l, 'beginner')) {
        const ds = defaults(m.ids, 'ESP32'),
          rt = new Runtime(program(m, language, ds, true), language, ds);
        for (const [name, env, expected] of m.scenarios) {
          const r = rt.step({ ...baseEnv, ...env });
          assert.deepEqual(
            ds.filter((d) => d.output).map((d) => (r.outputs[d.pin] > 0 ? 1 : 0)),
            expected,
            name,
          );
        }
      }
    });
test('the ADC signal list and scale are defined once, in signals.js', async () => {
  const { readdir, readFile } = await import('node:fs/promises');
  for (const file of (await readdir('public')).filter((f) => f.endsWith('.js'))) {
    if (file === 'signals.js') continue;
    const source = await readFile('public/' + file, 'utf8');
    assert.doesNotMatch(source, /\['light', 'soil', 'tank', 'rain', 'pot', 'pond'\]/, file);
    assert.doesNotMatch(source, /\*\s*40\.95/, file);
  }
});
