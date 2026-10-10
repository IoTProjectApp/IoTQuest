import { Runtime } from './runtime.js';
import { baseEnv } from './missions.js';
import { ADC_SCALE, adcRead, picoWiring } from './signals.js';
// Connected challenges that run over the simulated MQTT broker:
// - security repairs: a working-but-unsafe program to fix (Fault finding tab);
// - dashboard quests: the student writes a program a phone-style dashboard talks to (Dashboard tab).
// Each challenge brings its own tests, so assessment never depends on a predetermined output.

// The code the household's own dashboard sends to open the gate (the "shared secret").
export const GATE_CODE = 4729;
const DOOR_CODE = 4729;

const py = (language) => language === 'python';
const pinOf = (devices, id) => devices.find((d) => d.id === id).pin;
const header = (language, lines) =>
  lines.map((l) => (py(language) ? '# ' : '// ') + l).join('\n') + '\n';
const pyImports = (names, adc = false) =>
  'from machine import Pin' +
  (adc ? ', ADC' : '') +
  '\nfrom iotquest import ' +
  names.join(', ') +
  '\nimport time\n';

// The game's simulator ends a step at any delay, whatever its length. Timing matters in these
// challenges, so their tests honour delay lengths as real hardware does: while a program sleeps,
// the clock moves on without running it. A delay(1000) fix and a millis() timer both pass.
const DELAYS = { delay: 1, sleep_ms: 1, 'time.sleep_ms': 1, sleep: 1000, 'time.sleep': 1000 };
function honourDelays(runtime) {
  const call = runtime.call.bind(runtime);
  runtime.wakeAt = 0;
  runtime.call = (name, args) => {
    if (name in DELAYS) runtime.wakeAt = runtime.time + Number(args[0] || 0) * DELAYS[name] - 200;
    return call(name, args);
  };
  return runtime;
}
// Runs the program for `seconds` of its own clock under `env` (a step is 200 ms).
function run(runtime, seconds, env = {}) {
  let result = runtime.lastResult;
  for (let i = 0; i < seconds * 5; i++) {
    if (result && runtime.time < runtime.wakeAt) runtime.time += 200;
    else result = runtime.lastResult = runtime.step({ ...baseEnv, ...env });
    runtime.broker.now = runtime.time;
  }
  return result;
}
// Counts every publish (the broker itself keeps only the latest 100 messages).
function recordPublishes(runtime) {
  const sent = [],
    publish = runtime.broker.publish.bind(runtime.broker);
  runtime.broker.publish = (id, topic, payload) => {
    sent.push({ client: id, topic: String(topic), payload });
    return publish(id, topic, payload);
  };
  return sent;
}
const say = (runtime, client, topic, payload) => {
  runtime.broker.connect(client);
  runtime.broker.publish(client, topic, payload);
};
const isOn = (result, pin) => (result.outputs[pin] || 0) > 0;
const check = (name, pass, detail) => ({ name, pass: !!pass, detail });
// Runs the challenge's test body, turning a program error into a failed test.
function guarded(body) {
  return (code, language, devices, board) => {
    let runtime;
    try {
      const make = () => honourDelays(new Runtime(code, language, devices, board));
      runtime = make();
      return body(runtime, devices, make);
    } catch (e) {
      return [check('Program execution', false, e.message)];
    }
  };
}

export const securityCases = [
  {
    id: 'spoof',
    track: 'security',
    title: 'The gate anyone can open',
    type: 'Security · Spoofed command',
    ids: ['gate'],
    goal: `Open the gate only when the household dashboard sends the gate code ${GATE_CODE} on home/gate. Ignore every other message.`,
    explain: `Anyone on the network can publish to home/gate. If the device checks for the shared code ${GATE_CODE} instead of accepting any command, it ignores a stranger's message. Real systems also use broker passwords and encryption, but the device should still check what it receives.`,
    hints: [
      'Send different messages from the Dashboard tab and watch the gate.',
      'The program opens the gate for any non-zero message.',
      `Compare the message with ${GATE_CODE} using == instead of != 0.`,
    ],
    source(language, devices, fixed = false) {
      const pin = pinOf(devices, 'gate'),
        test = fixed ? `== ${GATE_CODE}` : '!= 0';
      return py(language)
        ? header(language, [
            'The gate anyone can open',
            'Opens the gate when a command arrives on home/gate.',
          ]) +
            pyImports(['mqttConnect', 'mqttSubscribe', 'mqttRead']) +
            `\ngate = Pin(${pin}, Pin.OUT)\nmqttConnect("gate")\nmqttSubscribe("home/gate")\n\nwhile True:\n    command = mqttRead("home/gate")\n    if command ${test}:\n        gate.value(1)\n    else:\n        gate.value(0)\n    time.sleep_ms(200)\n`
        : header(language, [
            'The gate anyone can open',
            'Opens the gate when a command arrives on home/gate.',
          ]) +
            `const int gatePin = ${pin};\n\nvoid setup() {\n  pinMode(gatePin, OUTPUT);\n  mqttConnect("gate");\n  mqttSubscribe("home/gate");\n}\n\nvoid loop() {\n  long command = mqttRead("home/gate");\n  if (command ${test}) {\n    digitalWrite(gatePin, HIGH);\n  } else {\n    digitalWrite(gatePin, LOW);\n  }\n  delay(200);\n}\n`;
    },
    tests: guarded((runtime, devices) => {
      const pin = pinOf(devices, 'gate');
      run(runtime, 1);
      say(runtime, 'stranger', 'home/gate', 1);
      const stranger = isOn(run(runtime, 1), pin);
      say(runtime, 'stranger', 'home/gate', 9999);
      const guess = isOn(run(runtime, 1), pin);
      say(runtime, 'dashboard', 'home/gate', GATE_CODE);
      const owner = isOn(run(runtime, 1), pin);
      say(runtime, 'dashboard', 'home/gate', 0);
      const closed = !isOn(run(runtime, 1), pin);
      return [
        check(
          'A stranger sends 1',
          !stranger,
          stranger ? 'The gate opened.' : 'The gate stayed closed.',
        ),
        check(
          'A stranger guesses 9999',
          !guess,
          guess ? 'The gate opened.' : 'The gate stayed closed.',
        ),
        check(
          `The dashboard sends ${GATE_CODE}`,
          owner,
          owner ? 'The gate opened.' : 'The gate stayed closed.',
        ),
        check(
          'The dashboard sends 0',
          closed,
          closed ? 'The gate closed.' : 'The gate stayed open.',
        ),
      ];
    }),
  },
  {
    id: 'leak',
    track: 'security',
    title: 'The chatty thermometer',
    type: 'Security · Data leak',
    ids: ['temp'],
    goal: 'Keep publishing the temperature on home/temperature, but never publish the door code.',
    explain:
      'Anything published can be read by every subscriber. A debug message that included the door code leaked a secret to the whole network. Publish only the data the dashboard needs.',
    hints: [
      'Open the Dashboard tab while the program runs and read every topic.',
      'One topic carries something that is not a temperature.',
      'Delete the line that publishes doorCode on home/debug, and keep the temperature.',
    ],
    source(language, devices, fixed = false) {
      const pin = pinOf(devices, 'temp');
      return py(language)
        ? header(language, [
            'The chatty thermometer',
            'Publishes the temperature for the dashboard.',
          ]) +
            pyImports(['mqttConnect', 'mqttPublish'], true) +
            `\ntemp_sensor = ADC(Pin(${pin}))\ndoor_code = ${DOOR_CODE}\nmqttConnect("thermometer")\n\nwhile True:\n    temp = temp_sensor.${adcRead(picoWiring(devices), 'temp')}\n    mqttPublish("home/temperature", temp)\n` +
            (fixed ? '' : '    mqttPublish("home/debug", door_code)\n') +
            '    time.sleep(1)\n'
        : header(language, [
            'The chatty thermometer',
            'Publishes the temperature for the dashboard.',
          ]) +
            `const int tempPin = ${pin};\nconst int doorCode = ${DOOR_CODE};\n\nvoid setup() {\n  mqttConnect("thermometer");\n}\n\nvoid loop() {\n  float temp = analogRead(tempPin);\n  mqttPublish("home/temperature", temp);\n` +
            (fixed ? '' : '  mqttPublish("home/debug", doorCode);\n') +
            '  delay(1000);\n}\n';
    },
    tests: guarded((runtime) => {
      const sent = recordPublishes(runtime);
      run(runtime, 5, { temp: 23 });
      const temps = sent.filter((m) => m.topic === 'home/temperature'),
        leaks = sent.filter((m) => String(m.payload).includes(String(DOOR_CODE)));
      return [
        check(
          'Temperature is still published',
          temps.length && temps.at(-1).payload === 23,
          temps.length
            ? 'Last temperature: ' + temps.at(-1).payload
            : 'Nothing on home/temperature.',
        ),
        check(
          'The door code is never published',
          !leaks.length,
          leaks.length ? 'Seen on ' + leaks[0].topic + '.' : 'No message contained the door code.',
        ),
      ];
    }),
  },
  {
    id: 'failsafe',
    track: 'security',
    title: 'The valve that floods the garden',
    type: 'Security · Fail-safe',
    ids: ['valve'],
    goal: 'Follow on/off commands on garden/valve, close the valve whenever the network is down, and recover when it returns.',
    explain:
      'When the broker drops, the last command is stale. A safe device chooses a safe state (valve closed) instead of trusting old data, then reconnects and resubscribes when the network returns.',
    hints: [
      'In the Dashboard tab, open the valve, then turn the broker off.',
      'mqttRead keeps returning the last value even after the connection is lost.',
      'Check mqttConnected(): if it is false, close the valve and call mqttReconnect() and mqttSubscribe() again.',
    ],
    source(language, devices, fixed = false) {
      const pin = pinOf(devices, 'valve');
      return py(language)
        ? header(language, [
            'The valve that floods the garden',
            'Opens the valve on command from garden/valve.',
          ]) +
            pyImports([
              'mqttConnect',
              'mqttSubscribe',
              'mqttRead',
              'mqttConnected',
              'mqttReconnect',
            ]) +
            `\nvalve = Pin(${pin}, Pin.OUT)\nmqttConnect("valve")\nmqttSubscribe("garden/valve")\n\nwhile True:\n` +
            (fixed
              ? '    if not mqttConnected():\n        valve.value(0)\n        mqttReconnect()\n        mqttSubscribe("garden/valve")\n    else:\n        valve.value(mqttRead("garden/valve"))\n'
              : '    valve.value(mqttRead("garden/valve"))\n') +
            '    time.sleep_ms(200)\n'
        : header(language, [
            'The valve that floods the garden',
            'Opens the valve on command from garden/valve.',
          ]) +
            `const int valvePin = ${pin};\n\nvoid setup() {\n  pinMode(valvePin, OUTPUT);\n  mqttConnect("valve");\n  mqttSubscribe("garden/valve");\n}\n\nvoid loop() {\n` +
            (fixed
              ? '  if (!mqttConnected()) {\n    digitalWrite(valvePin, LOW);\n    mqttReconnect();\n    mqttSubscribe("garden/valve");\n  } else {\n    digitalWrite(valvePin, mqttRead("garden/valve"));\n  }\n'
              : '  digitalWrite(valvePin, mqttRead("garden/valve"));\n') +
            '  delay(200);\n}\n';
    },
    tests: guarded((runtime, devices) => {
      const pin = pinOf(devices, 'valve');
      run(runtime, 1);
      say(runtime, 'dashboard', 'garden/valve', 1);
      const opens = isOn(run(runtime, 1), pin);
      runtime.broker.setAvailable(false);
      const safe = !isOn(run(runtime, 1), pin);
      runtime.broker.setAvailable(true);
      run(runtime, 1);
      say(runtime, 'dashboard', 'garden/valve', 1);
      const recovers = isOn(run(runtime, 1), pin);
      say(runtime, 'dashboard', 'garden/valve', 0);
      const closes = !isOn(run(runtime, 1), pin);
      return [
        check('The dashboard opens the valve', opens, opens ? 'Open.' : 'Still closed.'),
        check('The network drops', safe, safe ? 'The valve closed.' : 'The valve stayed open.'),
        check(
          'The network returns',
          recovers,
          recovers
            ? 'Commands work again.'
            : 'The valve ignored the new command: reconnect and resubscribe.',
        ),
        check('The dashboard closes the valve', closes, closes ? 'Closed.' : 'Still open.'),
      ];
    }),
  },
  {
    id: 'flood',
    track: 'security',
    title: 'The sensor that never stops talking',
    type: 'Security · Message flood',
    ids: ['soil'],
    goal: 'Publish the soil reading on garden/soil about once a second, not on every loop.',
    explain:
      'Publishing on every loop sends hundreds of messages a second. That wastes battery and network capacity and can drown out other devices, which is an accidental denial of service. Publishing on a timer keeps the dashboard up to date without flooding the network.',
    hints: [
      'Count how quickly messages arrive in the Dashboard tab.',
      'The loop has almost no delay, and it publishes every time round.',
      'Keep the time of the last publish (millis() in Arduino, ticks_ms() in MicroPython) and only publish when 1000 ms have passed.',
    ],
    source(language, devices, fixed = false) {
      const pin = pinOf(devices, 'soil');
      return py(language)
        ? header(language, [
            'The sensor that never stops talking',
            'Publishes the soil reading for the dashboard.',
          ]) +
            'from machine import Pin, ADC\nfrom iotquest import mqttConnect, mqttPublish\nfrom time import sleep_ms, ticks_ms\n' +
            `\nsoil_sensor = ADC(Pin(${pin}))\nmqttConnect("soil")\nlast = 0\n\nwhile True:\n    soil = soil_sensor.${adcRead(picoWiring(devices), 'soil')}\n` +
            (fixed
              ? '    if ticks_ms() - last >= 1000:\n        last = ticks_ms()\n        mqttPublish("garden/soil", soil)\n'
              : '    mqttPublish("garden/soil", soil)\n') +
            '    sleep_ms(10)\n'
        : header(language, [
            'The sensor that never stops talking',
            'Publishes the soil reading for the dashboard.',
          ]) +
            `const int soilPin = ${pin};\nunsigned long last = 0;\n\nvoid setup() {\n  mqttConnect("soil");\n}\n\nvoid loop() {\n  int soil = analogRead(soilPin);\n` +
            (fixed
              ? '  if (millis() - last >= 1000) {\n    last = millis();\n    mqttPublish("garden/soil", soil);\n  }\n'
              : '  mqttPublish("garden/soil", soil);\n') +
            '  delay(10);\n}\n';
    },
    tests: guarded((runtime) => {
      const sent = recordPublishes(runtime);
      run(runtime, 10, { soil: 40 });
      const soil = sent.filter((m) => m.topic === 'garden/soil');
      return [
        check(
          'Readings are still published',
          soil.length >= 5,
          soil.length + ' readings in 10 seconds.',
        ),
        check(
          'No more than about one a second',
          soil.length <= 12,
          soil.length + ' messages in 10 seconds (at most 12 allowed).',
        ),
        check(
          'The reading is correct',
          soil.length && soil.at(-1).payload === Math.round(40 * ADC_SCALE),
          soil.length ? 'Last reading: ' + soil.at(-1).payload : 'No readings.',
        ),
      ];
    }),
  },
];

const starter = (language, devices, lines) =>
  header(language, lines) +
  (py(language)
    ? pyImports(
        [
          'mqttConnect',
          'mqttPublish',
          'mqttSubscribe',
          'mqttRead',
          'mqttConnected',
          'mqttReconnect',
        ],
        devices.some((d) => d.analog),
      )
    : '') +
  '\n' +
  devices
    .map((d) =>
      py(language)
        ? '# ' + d.name + ' is on GPIO ' + d.pin
        : '// ' + d.name + ' is on GPIO ' + d.pin,
    )
    .join('\n') +
  '\n';

export const dashboardQuests = [
  {
    id: 'live-temp',
    track: 'dashboard',
    title: 'Temperature on the dashboard',
    type: 'Dashboard · Publish',
    ids: ['temp'],
    goal: 'Connect as "house" and publish the temperature (°C) on home/temperature about once a second.',
    explain:
      'The device is a publisher: it sends readings to a topic, and any dashboard subscribed to that topic shows them. Publishing on a timer keeps the dashboard current without flooding the network.',
    hints: [
      'Call mqttConnect("house") once at the start.',
      'Read the temperature, then mqttPublish("home/temperature", temp).',
      'Wait about a second between publishes (delay(1000) or time.sleep(1)).',
    ],
    widgets: [{ type: 'gauge', topic: 'home/temperature', label: 'Temperature', unit: '°C' }],
    starter: (language, devices) =>
      starter(language, devices, [
        'Temperature on the dashboard',
        'Goal: connect as "house" and publish the temperature on home/temperature once a second.',
        'Write the program below.',
      ]),
    solution(language, devices) {
      const pin = pinOf(devices, 'temp');
      return py(language)
        ? pyImports(['mqttConnect', 'mqttPublish'], true) +
            `\ntemp_sensor = ADC(Pin(${pin}))\nmqttConnect("house")\n\nwhile True:\n    mqttPublish("home/temperature", temp_sensor.${adcRead(picoWiring(devices), 'temp')})\n    time.sleep(1)\n`
        : `const int tempPin = ${pin};\n\nvoid setup() {\n  mqttConnect("house");\n}\n\nvoid loop() {\n  float temp = analogRead(tempPin);\n  mqttPublish("home/temperature", temp);\n  delay(1000);\n}\n`;
    },
    tests: guarded((runtime) => {
      const sent = recordPublishes(runtime);
      run(runtime, 3, { temp: 23 });
      const warm = sent.filter((m) => m.topic === 'home/temperature');
      run(runtime, 3, { temp: 31 });
      const all = sent.filter((m) => m.topic === 'home/temperature');
      const connected = runtime.broker.connected('house');
      return [
        check(
          'Connects as "house"',
          connected,
          connected ? 'Connected.' : 'No client called "house".',
        ),
        check(
          'Publishes on home/temperature',
          warm.length && warm.at(-1).payload === 23,
          warm.length ? 'Read ' + warm.at(-1).payload + ' °C at 23 °C.' : 'Nothing published.',
        ),
        check(
          'The dashboard follows a change',
          all.length && all.at(-1).payload === 31,
          all.length ? 'Read ' + all.at(-1).payload + ' °C at 31 °C.' : 'Nothing published.',
        ),
        check(
          'About once a second',
          all.length >= 4 && all.length <= 9,
          all.length + ' messages in about 6 seconds.',
        ),
      ];
    }),
  },
  {
    id: 'remote-fan',
    track: 'dashboard',
    title: 'A fan switch on the dashboard',
    type: 'Dashboard · Subscribe',
    ids: ['fan'],
    goal: 'Subscribe to home/fan/set: 1 turns the fan on, 0 turns it off. Confirm by publishing the fan state (1 or 0) on home/fan/state.',
    explain:
      'Now the device is a subscriber: the dashboard publishes commands and the device acts on them. When the device publishes its real state back, the dashboard can show what the fan is actually doing, which may differ from what was requested.',
    hints: [
      'Connect, then mqttSubscribe("home/fan/set") once at the start.',
      'Each loop, read the command with mqttRead("home/fan/set") and write it to the fan.',
      'Publish the same value on home/fan/state so the dashboard can confirm it.',
    ],
    widgets: [
      { type: 'switch', topic: 'home/fan/set', label: 'Fan switch' },
      { type: 'status', topic: 'home/fan/state', label: 'Fan reports' },
    ],
    starter: (language, devices) =>
      starter(language, devices, [
        'A fan switch on the dashboard',
        'Goal: follow commands on home/fan/set and publish the fan state on home/fan/state.',
        'Write the program below.',
      ]),
    solution(language, devices) {
      const pin = pinOf(devices, 'fan');
      return py(language)
        ? pyImports(['mqttConnect', 'mqttSubscribe', 'mqttRead', 'mqttPublish']) +
            `\nfan = Pin(${pin}, Pin.OUT)\nmqttConnect("house")\nmqttSubscribe("home/fan/set")\n\nwhile True:\n    command = mqttRead("home/fan/set")\n    fan.value(command)\n    mqttPublish("home/fan/state", command)\n    time.sleep_ms(500)\n`
        : `const int fanPin = ${pin};\n\nvoid setup() {\n  pinMode(fanPin, OUTPUT);\n  mqttConnect("house");\n  mqttSubscribe("home/fan/set");\n}\n\nvoid loop() {\n  int command = mqttRead("home/fan/set");\n  digitalWrite(fanPin, command);\n  mqttPublish("home/fan/state", command);\n  delay(500);\n}\n`;
    },
    tests: guarded((runtime, devices) => {
      const pin = pinOf(devices, 'fan'),
        sent = recordPublishes(runtime);
      run(runtime, 1);
      say(runtime, 'dashboard', 'home/fan/set', 1);
      const on = isOn(run(runtime, 1.5), pin),
        stateOn = sent.filter((m) => m.topic === 'home/fan/state').at(-1)?.payload;
      say(runtime, 'dashboard', 'home/fan/set', 0);
      const off = !isOn(run(runtime, 1.5), pin),
        stateOff = sent.filter((m) => m.topic === 'home/fan/state').at(-1)?.payload;
      return [
        check('The switch turns the fan on', on, on ? 'Fan on.' : 'Fan stayed off.'),
        check(
          'The fan reports it is on',
          stateOn === 1,
          'home/fan/state: ' + (stateOn ?? 'nothing'),
        ),
        check('The switch turns the fan off', off, off ? 'Fan off.' : 'Fan stayed on.'),
        check(
          'The fan reports it is off',
          stateOff === 0,
          'home/fan/state: ' + (stateOff ?? 'nothing'),
        ),
      ];
    }),
  },
  {
    id: 'plant-alert',
    track: 'dashboard',
    title: 'A plant alert on the dashboard',
    type: 'Dashboard · Events',
    ids: ['soil'],
    goal: 'Publish 1 on garden/alert once when the soil reading drops below 1500, and 0 once when it is back at 1500 or above. Do not repeat the alert while nothing changes.',
    explain:
      'An alert is an event rather than a reading, so send it once when something changes instead of on every loop. Real devices remember the previous state and publish only when it changes, so they do not repeat the same alert.',
    hints: [
      'Keep a variable that remembers whether the plant was dry last time round.',
      'Work out dry = soil < 1500 each loop.',
      'Only publish when dry is different from the remembered value, then update the remembered value.',
    ],
    widgets: [
      {
        type: 'alert',
        topic: 'garden/alert',
        label: 'Plant alert',
        on: 'Water the plants!',
        off: 'Plants are fine',
      },
    ],
    starter: (language, devices) =>
      starter(language, devices, [
        'A plant alert on the dashboard',
        'Goal: publish 1 on garden/alert once when the soil drops below 1500, and 0 once when it recovers.',
        'Write the program below.',
      ]),
    solution(language, devices) {
      const pin = pinOf(devices, 'soil');
      return py(language)
        ? pyImports(['mqttConnect', 'mqttPublish'], true) +
            `\nsoil_sensor = ADC(Pin(${pin}))\nmqttConnect("garden")\nwas_dry = 0\n\nwhile True:\n    dry = 0\n    if soil_sensor.${adcRead(picoWiring(devices), 'soil')} < 1500:\n        dry = 1\n    if dry != was_dry:\n        mqttPublish("garden/alert", dry)\n        was_dry = dry\n    time.sleep_ms(200)\n`
        : `const int soilPin = ${pin};\nint wasDry = 0;\n\nvoid setup() {\n  mqttConnect("garden");\n}\n\nvoid loop() {\n  int dry = 0;\n  if (analogRead(soilPin) < 1500) {\n    dry = 1;\n  }\n  if (dry != wasDry) {\n    mqttPublish("garden/alert", dry);\n    wasDry = dry;\n  }\n  delay(200);\n}\n`;
    },
    tests: guarded((runtime) => {
      const sent = recordPublishes(runtime),
        alerts = () => sent.filter((m) => m.topic === 'garden/alert').map((m) => Number(m.payload));
      run(runtime, 2, { soil: 60 });
      const wet = alerts();
      run(runtime, 3, { soil: 20 });
      const dry = alerts().slice(wet.length);
      run(runtime, 3, { soil: 70 });
      const recovered = alerts().slice(wet.length + dry.length);
      return [
        check(
          'No alert while the soil is wet',
          !wet.includes(1),
          wet.length ? 'Sent: ' + wet.join(', ') : 'No messages.',
        ),
        check(
          'One alert when it dries out',
          dry.length === 1 && dry[0] === 1,
          'Sent: ' + (dry.join(', ') || 'nothing'),
        ),
        check(
          'One all-clear when it is watered',
          recovered.length === 1 && recovered[0] === 0,
          'Sent: ' + (recovered.join(', ') || 'nothing'),
        ),
      ];
    }),
  },
];
