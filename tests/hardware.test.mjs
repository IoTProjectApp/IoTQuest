import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { defaults } from '../public/missions.js';
import {
  parseReadingLine,
  readingsToEnv,
  outputLine,
  boardProgram,
  BoardLink,
  BAUD,
} from '../public/hardware.js';

test('reading lines become sensor readings; anything else is ignored', () => {
  assert.deepEqual(parseReadingLine('IOTQ light=2310 motion=1 temp=23.5'), {
    light: 2310,
    motion: 1,
    temp: 23.5,
  });
  assert.deepEqual(parseReadingLine('IOTQ light=12 bogus=4 soil=abc'), { light: 12 });
  assert.equal(parseReadingLine('Booting...'), null);
  assert.equal(parseReadingLine('IOTQ'), null);
  assert.equal(parseReadingLine('IOTQ light=' + '9'.repeat(1000)), null);
});

test('ADC readings are converted to the simulation’s scale and out-of-range values clamped', () => {
  const env = readingsToEnv({ light: 4095, soil: 99999, temp: 23.5, motion: 1 });
  assert.equal(env.light, 100);
  assert.equal(env.soil, 100);
  assert.equal(env.temp, 23.5);
  assert.equal(env.motion, 1);
});

test('outputs are sent as one OUT line for the installed outputs', () => {
  const devices = defaults(['ldr', 'led', 'fan'], 'ESP32');
  const [, led, fan] = devices;
  assert.equal(
    outputLine({ [led.pin]: 1, [fan.pin]: 127.6 }, devices),
    `OUT ${led.pin}=1 ${fan.pin}=128\n`,
  );
  assert.equal(outputLine({}, defaults(['ldr'], 'ESP32')), '');
});

test('the ESP32 board program reads each simple sensor on its pin and obeys OUT lines', () => {
  const devices = defaults(['ldr', 'pir', 'temp', 'led'], 'ESP32'),
    source = boardProgram(devices, 'ESP32');
  assert.match(source, new RegExp('Serial.begin\\(' + BAUD + '\\)'));
  assert.match(source, new RegExp('analogRead\\(' + devices[0].pin + '\\)'));
  assert.match(source, new RegExp('digitalRead\\(' + devices[1].pin + '\\)'));
  assert.match(source, /TODO: read the Temperature & humidity/);
  assert.match(source, new RegExp('pinMode\\(' + devices[3].pin + ', OUTPUT\\)'));
  assert.match(source, /startsWith\("OUT "\)/);
});

test('the Pico board program is valid Python that scales readings to 0–4095', (t) => {
  const devices = defaults(['ldr', 'pir', 'led'], 'Raspberry Pi Pico'),
    source = boardProgram(devices, 'Raspberry Pi Pico');
  assert.match(source, /read_u16\(\) >> 4/);
  try {
    execFileSync('python3', ['-c', 'import ast, sys; ast.parse(sys.stdin.read())'], {
      input: source,
    });
  } catch (e) {
    if (e.code === 'ENOENT') return t.skip('python3 is not installed');
    throw e;
  }
});

// A stand-in for a Web Serial port: delivers `chunks` then ends, and records what is written.
function fakePort(chunks) {
  const written = [];
  return {
    written,
    opened: null,
    closed: false,
    async open(options) {
      this.opened = options;
    },
    async close() {
      this.closed = true;
    },
    readable: new ReadableStream({
      start(controller) {
        for (const c of chunks) controller.enqueue(new TextEncoder().encode(c));
        controller.close();
      },
    }),
    writable: new WritableStream({
      write(chunk) {
        written.push(new TextDecoder().decode(chunk));
      },
    }),
  };
}

test('the link rebuilds lines split across USB packets and reports each reading', async () => {
  const seen = [],
    statuses = [];
  const link = new BoardLink({
    onReadings: (r) => seen.push(r),
    onStatus: (s) => statuses.push(s),
  });
  const port = fakePort([
    'noise\r\nIOTQ li',
    'ght=100\r\nIOTQ light=',
    '200 motion=1\n',
    'IOTQ soil=5',
  ]);
  await link.connect(port);
  await link.reading;
  assert.deepEqual(port.opened, { baudRate: BAUD });
  assert.deepEqual(seen, [{ light: 100 }, { light: 200, motion: 1 }]);
  assert.equal(link.lastLine, 'IOTQ light=200 motion=1');
  assert.deepEqual(statuses, ['connected', 'disconnected']);
});

test('outputs are only sent when they change, and disconnecting closes the port', async () => {
  const link = new BoardLink(),
    port = fakePort([]);
  await link.connect(port);
  await link.send('OUT 26=1\n');
  await link.send('OUT 26=1\n');
  await link.send('OUT 26=0\n');
  assert.deepEqual(port.written, ['OUT 26=1\n', 'OUT 26=0\n']);
  await link.disconnect();
  assert.equal(port.closed, true);
  assert.equal(link.port, null);
});
