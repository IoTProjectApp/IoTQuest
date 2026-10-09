import { communityComponents, communityQuests } from './community-quests.js';
import { sectionQuests } from './section-quests.js';
import { weatherQuests } from './weather-quests.js';
import { componentQuests } from './component-quests.js';
import { logicQuests } from './logic-quests.js';
import { guidedStarter } from './code-coach.js';
import { ADC_SIGNALS, adcRead, isPico, picoWiring } from './signals.js';
export { ADC_SIGNALS };
export const components = [
  ...communityComponents,
  {
    id: 'wind',
    name: 'Wind speed station',
    icon: '≋',
    signal: 'wind',
    analog: true,
    area: 'Entrance',
    desc: 'Virtual calibrated wind speed in km/h, following local weather in Live mode. Physical anemometers need a sensor driver.',
  },
  {
    id: 'cloud',
    name: 'Cloud cover channel',
    icon: '☁',
    signal: 'cloud',
    analog: true,
    area: 'Greenhouse',
    desc: 'Virtual cloud cover percentage, 0–100, following local weather in Live mode. This is weather-service data rather than a physical GPIO sensor.',
  },
  {
    id: 'occupancy',
    name: 'Resident presence',
    icon: '⌂',
    signal: 'occupied',
    desc: 'Simulated household occupancy: HIGH when residents are home. Replace with a physical presence-sensing strategy on hardware.',
    area: 'Living room',
  },
  {
    id: 'outside',
    name: 'Outdoor weather station',
    icon: '☁',
    signal: 'outdoorTemp',
    analog: true,
    desc: 'Virtual calibrated outdoor temperature in °C. On physical hardware use a weatherproof sensor and its library.',
    area: 'Greenhouse',
  },
  {
    id: 'humidity',
    name: 'Humidity channel',
    icon: '≋',
    signal: 'humidity',
    analog: true,
    desc: 'Virtual calibrated humidity percentage, 0–100. Real sensors need a supported driver library.',
    area: 'Living room',
  },
  {
    id: 'pond',
    name: 'Pond level probe',
    icon: '≈',
    signal: 'pond',
    analog: true,
    desc: 'Simulated pond level, 0–4095. Use a waterproof level sensor on hardware.',
    area: 'Water tank',
  },
  {
    id: 'ldr',
    name: 'Light sensor',
    icon: '☀',
    signal: 'light',
    analog: true,
    desc: 'An LDR measures brightness. Pair it with a 10 kΩ resistor as a voltage divider. 0 = dark, 4095 = bright.',
    resistor: '10 kΩ',
    area: 'Garden path',
  },
  {
    id: 'led',
    name: 'Path lights',
    icon: '◉',
    output: true,
    desc: 'A warm LED lamp. Use a 220 Ω series resistor to limit current and protect the LED.',
    resistor: '220 Ω',
    area: 'Garden path',
  },
  {
    id: 'pir',
    name: 'Motion sensor',
    icon: '◌',
    signal: 'motion',
    desc: 'A PIR detects movement: HIGH when a resident moves nearby.',
    area: 'Entrance',
  },
  {
    id: 'porch',
    name: 'Porch light',
    icon: '♧',
    output: true,
    desc: 'An LED porch lamp. HIGH turns it on; LOW turns it off.',
    resistor: '220 Ω',
    area: 'Entrance',
  },
  {
    id: 'soil',
    name: 'Soil moisture',
    icon: '♧',
    signal: 'soil',
    analog: true,
    desc: 'A capacitive soil probe. 0 = dry and 4095 = saturated in this virtual model.',
    area: 'Plant beds',
  },
  {
    id: 'pump',
    name: 'Water pump',
    icon: '≋',
    output: true,
    desc: 'A pump feeds irrigation. A transistor driver and flyback diode are included in the virtual module; do not connect a real pump directly to GPIO.',
    area: 'Plant beds',
  },
  {
    id: 'temp',
    name: 'Temperature & humidity',
    icon: '♨',
    signal: 'temp',
    analog: true,
    desc: 'Virtual calibrated temperature channel returns degrees Celsius. Real DHT sensors need a library.',
    area: 'Living room',
  },
  {
    id: 'fan',
    name: 'Cooling fan',
    icon: '✣',
    output: true,
    desc: 'A PWM fan module with an integrated motor driver; output changes rotation speed and cooling.',
    area: 'Living room',
  },
  {
    id: 'door',
    name: 'Door contact',
    icon: '▣',
    signal: 'door',
    desc: 'HIGH when the garage door is open; LOW when closed.',
    area: 'Garage',
  },
  {
    id: 'buzzer',
    name: 'Buzzer',
    icon: '♪',
    output: true,
    desc: 'An active buzzer. HIGH triggers a visual alert and optional sound.',
    area: 'Garage',
  },
  {
    id: 'level',
    name: 'Water level',
    icon: '▥',
    signal: 'tank',
    analog: true,
    desc: 'Tank level mapped to 0–4095. Empty tanks need a pump interlock.',
    area: 'Water tank',
  },
  {
    id: 'button',
    name: 'Arm button',
    icon: '⊙',
    signal: 'armed',
    desc: 'A digital switch arms security. HIGH is armed.',
    area: 'Garage',
  },
  {
    id: 'rgb',
    name: 'RGB light',
    icon: '◈',
    output: true,
    desc: 'Virtual single-channel RGB module: PWM controls brightness; colour follows the character colour setting.',
    resistor: '220 Ω',
    area: 'Bedroom',
  },
  {
    id: 'servo',
    name: 'Servo / blinds',
    icon: '⚙',
    output: true,
    desc: 'servoWrite(pin, angle) sets 0–180 degrees. Use a separate power supply on physical hardware.',
    area: 'Bedroom',
  },
  {
    id: 'valve',
    name: 'Irrigation valve',
    icon: '⊞',
    output: true,
    desc: 'A driven solenoid valve controls visible water flow.',
    area: 'Greenhouse',
  },
  {
    id: 'ac',
    name: 'Air-conditioning',
    icon: '❄',
    output: true,
    desc: 'A simulated relay unit gradually cools the living room.',
    area: 'Living room',
  },
  {
    id: 'ultra',
    name: 'Ultrasonic distance',
    icon: '◍',
    signal: 'distance',
    desc: 'Virtual calibrated distance input in centimetres. Real HC-SR04 needs trigger and echo pins and level shifting.',
    area: 'Entrance',
  },
  {
    id: 'rain',
    name: 'Rain sensor',
    icon: '☂',
    signal: 'rain',
    analog: true,
    desc: 'Rain intensity from 0 to 4095.',
    area: 'Greenhouse',
  },
  {
    id: 'pot',
    name: 'Potentiometer',
    icon: '◴',
    signal: 'pot',
    analog: true,
    desc: 'An adjustable analogue input. Its wiper sets a 0–4095 reading.',
    area: 'Utility room',
  },
  {
    id: 'gate',
    name: 'Motorised gate',
    icon: '▤',
    output: true,
    desc: 'HIGH opens the driven gate module; LOW closes it.',
    area: 'Entrance',
  },
];
export const missions = [
  {
    title: 'Light the Path',
    area: 'Garden path',
    resident: 'Maya',
    role: 'The garden enthusiast',
    quote:
      '“I love an evening stroll, but the path gets so dark! Could you make the lights come on when the sun goes down?”',
    goal: 'Turn path lights on below a light reading of 1800. Switch them off at 1800 or above.',
    ids: ['ldr', 'led'],
    xp: 100,
    badge: 'Night owl',
    learn: ['Analogue input', 'Conditions', 'Digital output'],
    hint: 'Read the light sensor into a variable. Compare it with 1800 using <. Write HIGH when dark and LOW otherwise.',
    conditions: ['light < 1800'],
    scenarios: [
      ['Bright afternoon', { light: 90 }, [0]],
      ['Dark evening', { light: 15 }, [1]],
      ['Just below threshold', { light: 1799 / 40.95 }, [1]],
      ['At threshold', { light: 1800 / 40.95 }, [0]],
      ['Sunrise after darkness', { light: 80 }, [0]],
    ],
  },
  {
    title: 'Welcome Home',
    area: 'Entrance',
    resident: 'Alex',
    role: 'The evening commuter',
    quote:
      '“My hands are always full when I get home. A porch light that notices me would be wonderful.”',
    goal: 'Turn the porch light on when the PIR reads HIGH, and off when it reads LOW.',
    ids: ['pir', 'porch'],
    xp: 120,
    badge: 'Warm welcome',
    learn: ['Digital input', 'Pin modes', 'Resident motion'],
    hint: 'digitalRead(sensor) is HIGH when there is motion. Test both arrival and departure.',
    conditions: ['motion == 1'],
    scenarios: [
      ['Empty porch', { motion: 0 }, [0]],
      ['Resident arrives', { motion: 1 }, [1]],
      ['Resident leaves', { motion: 0 }, [0]],
      ['Another arrival', { motion: 1 }, [1]],
    ],
  },
  {
    title: 'Save the Plants',
    area: 'Plant beds',
    resident: 'Maya',
    role: 'The garden enthusiast',
    quote:
      '“My tomatoes keep drying out. Can you water them automatically and stop before their roots get soggy?”',
    goal: 'Run the pump below moisture reading 2400. Stop at 2400 or higher, and never run with an empty tank.',
    ids: ['soil', 'pump', 'level'],
    xp: 150,
    badge: 'Green thumb',
    learn: ['Multiple inputs', 'Logical AND', 'Feedback control'],
    hint: 'Use soil < 2400 && tank > 0 in Arduino, or soil < 2400 and tank > 0 in Python. The pump must turn off in the else branch.',
    conditions: ['soil < 2400 && tank > 0'],
    scenarios: [
      ['Dry soil', { soil: 20, tank: 80 }, [1]],
      ['At target', { soil: 2400 / 40.95, tank: 80 }, [0]],
      ['Below target', { soil: 2399 / 40.95, tank: 80 }, [1]],
      ['Wet soil', { soil: 90, tank: 80 }, [0]],
      ['Empty tank', { soil: 10, tank: 0 }, [0]],
    ],
  },
  {
    title: 'Keep the Room Comfortable',
    area: 'Living room',
    resident: 'Sam',
    role: 'The home cook',
    quote:
      '“The living room gets hot in the afternoon. Let’s keep the fan running only when we need it.”',
    goal: 'Run the fan above 27°C; stop at 27°C or below.',
    ids: ['temp', 'fan'],
    xp: 170,
    badge: 'Cool thinker',
    learn: ['Temperature', 'Functions', 'PWM extension'],
    hint: 'The calibrated virtual temperature input returns Celsius. Compare temperature > 27.',
    conditions: ['temp > 27'],
    scenarios: [
      ['Cool room', { temp: 22 }, [0]],
      ['Hot room', { temp: 32 }, [1]],
      ['At boundary', { temp: 27 }, [0]],
      ['Above boundary', { temp: 28 }, [1]],
    ],
  },
  {
    title: 'Guard the Garage',
    area: 'Garage',
    resident: 'Alex',
    role: 'The evening commuter',
    quote:
      '“Could you alert me if the garage opens while security is armed? I don’t want alerts while I’m working there.”',
    goal: 'Sound the buzzer only when the door is open AND security is armed.',
    ids: ['door', 'buzzer', 'button'],
    xp: 180,
    badge: 'House guardian',
    learn: ['Boolean logic', 'Security states', 'Failure cases'],
    hint: 'door == HIGH && armed == HIGH. Check every combination.',
    conditions: ['door == 1 && armed == 1'],
    scenarios: [
      ['Closed and armed', { door: 0, armed: 1 }, [0]],
      ['Intrusion', { door: 1, armed: 1 }, [1]],
      ['Working unarmed', { door: 1, armed: 0 }, [0]],
      ['Closed unarmed', { door: 0, armed: 0 }, [0]],
    ],
  },
  {
    title: 'Protect the Water Pump',
    area: 'Water tank',
    resident: 'Sam',
    role: 'The home cook',
    quote:
      '“The pump must never run dry. Please switch it off whenever the tank drops to its reserve level.”',
    goal: 'Run the pump only when tank reading is above 400 and soil is below 2400.',
    ids: ['level', 'pump', 'soil'],
    xp: 200,
    badge: 'Water wise',
    learn: ['Interlocks', 'Boundaries', 'Safe outputs'],
    hint: 'tank > 400 && soil < 2400. Exactly 400 must be off.',
    conditions: ['tank > 400 && soil < 2400'],
    scenarios: [
      ['Needs water', { tank: 80, soil: 10 }, [1]],
      ['Empty tank', { tank: 0, soil: 10 }, [0]],
      ['Reserve boundary', { tank: 400 / 40.95, soil: 10 }, [0]],
      ['Wet plants', { tank: 80, soil: 80 }, [0]],
    ],
  },
  {
    title: 'Smart Greenhouse',
    area: 'Greenhouse',
    resident: 'Maya',
    role: 'The garden enthusiast',
    quote:
      '“The seedlings need water, warmth, and enough light. Can one controller look after all three?”',
    goal: 'Fan on above 27°C; grow light on below 1800; valve on below soil 2400.',
    ids: ['temp', 'fan', 'ldr', 'led', 'soil', 'valve'],
    xp: 250,
    badge: 'Greenhouse genius',
    learn: ['Multiple outputs', 'Functions', 'Non-blocking timing'],
    hint: 'Use three independent if/else blocks. Each output has its own condition. Use millis() or time.ticks_ms() for timed extensions.',
    conditions: ['temp > 27', 'light < 1800', 'soil < 2400'],
    scenarios: [
      ['Hot, dark, dry', { temp: 32, light: 10, soil: 20 }, [1, 1, 1]],
      ['Cool, bright, wet', { temp: 20, light: 90, soil: 80 }, [0, 0, 0]],
      ['Only hot', { temp: 30, light: 80, soil: 80 }, [1, 0, 0]],
      ['Only dry', { temp: 25, light: 80, soil: 20 }, [0, 0, 1]],
      ['All boundaries', { temp: 27, light: 1800 / 40.95, soil: 2400 / 40.95 }, [0, 0, 0]],
    ],
  },
  {
    title: 'Whole-Home Challenge',
    area: 'House & garden',
    resident: 'Alex',
    role: 'The evening commuter',
    quote:
      '“You’ve made each room smarter. Now let’s bring everything together on one controller.”',
    goal: 'Control path lights in darkness, porch lights on motion, and cooling above 27°C independently.',
    ids: ['ldr', 'led', 'pir', 'porch', 'temp', 'fan'],
    xp: 300,
    badge: 'IoT architect',
    learn: ['System design', 'Shared controllers', 'Coordinated devices'],
    hint: 'Keep three independent control blocks. Changing one input should not change unrelated outputs.',
    conditions: ['light < 1800', 'motion == 1', 'temp > 27'],
    scenarios: [
      ['Quiet daytime', { light: 90, motion: 0, temp: 22 }, [0, 0, 0]],
      ['Night arrival', { light: 10, motion: 1, temp: 30 }, [1, 1, 1]],
      ['Motion only', { light: 90, motion: 1, temp: 22 }, [0, 1, 0]],
      ['Heat only', { light: 90, motion: 0, temp: 30 }, [0, 0, 1]],
      ['Dark only', { light: 10, motion: 0, temp: 22 }, [1, 0, 0]],
    ],
  },
  ...weatherQuests,
  ...sectionQuests,
  ...componentQuests,
  ...logicQuests,
  ...communityQuests,
];
// Energy and water allowed across a quest's tests; a quest can set its own (the AC draws 800 W).
export const missionBudget = (m) =>
  m.budget || { wh: m.ids.includes('pump') ? 0.35 : 0.15, litres: 45 };
export const baseEnv = {
  vibration: 5,
  bay: 0,
  pedRequest: 0,
  spaces: 1,
  light: 70,
  motion: 0,
  soil: 32,
  tank: 80,
  temp: 24,
  rain: 0,
  door: 0,
  armed: 1,
  distance: 100,
  pot: 50,
  humidity: 50,
  occupied: 1,
  appliance: 0,
  pond: 60,
  outdoorTemp: 24,
  wind: 12,
  cloud: 20,
};
export function defaults(ids, board) {
  let a = 0,
    d = 0,
    o = 0;
  const analog = board === 'ESP32' ? [34, 35, 32, 33, 36, 39] : [26, 27, 28];
  const digital = board === 'ESP32' ? [27, 14, 13] : [16, 17, 18];
  const outputs = board === 'ESP32' ? [26, 25, 18, 19, 21, 22] : [15, 14, 13, 12, 11, 10];
  return ids.map((id) => {
    const c = components.find((c) => c.id === id);
    return {
      ...c,
      pin: c.output ? outputs[o++] : c.analog ? analog[a++] : digital[d++],
      power: true,
      ground: true,
      resistorConnected: !!c.resistor,
      area: c.area,
    };
  });
}
export function validate(devices, board) {
  const errors = [],
    used = new Set();
  for (const d of devices) {
    if (!d.power || !d.ground) errors.push(d.name + ': connect 3.3 V and GND.');
    if (used.has(d.pin)) errors.push('GPIO ' + d.pin + ' has a conflict. Assign a different pin.');
    used.add(d.pin);
    const allowed =
      board === 'ESP32'
        ? [
            0, 2, 4, 5, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 23, 25, 26, 27, 32, 33, 34, 35, 36,
            39,
          ]
        : // The Pico's header has GP0–GP22 and GP26–GP28. GP23–GP25 are used on the board
          // itself (power supply control, USB sensing and the onboard LED).
          [...Array.from({ length: 23 }, (_, i) => i), 26, 27, 28];
    if (!allowed.includes(d.pin))
      errors.push(
        'GPIO ' +
          d.pin +
          ' is unavailable on ' +
          board +
          (board === 'ESP32' ? '.' : ': use a header pin, GP0–GP22 or GP26–GP28.'),
      );
    if (d.output && board === 'ESP32' && d.pin >= 34)
      errors.push('GPIO ' + d.pin + ' is input-only on ESP32.');
    if (d.analog && !(board === 'ESP32' ? [32, 33, 34, 35, 36, 39] : [26, 27, 28]).includes(d.pin))
      errors.push(d.name + ' needs an ADC pin.');
    if (d.resistor && !d.resistorConnected)
      errors.push(d.name + ': connect the ' + d.resistor + ' resistor.');
  }
  return errors;
}
// `board` picks the Pico's read_u16() for analogue readings; without it, the wiring decides.
export function program(mission, language, devices, worked = false, board) {
  // Students write the readings and decisions themselves, guided by the code coach.
  if (!worked) return guidedStarter(mission, language, devices);
  const inputs = devices.filter((d) => !d.output),
    outputs = devices.filter((d) => d.output),
    pico = board ? isPico(board) : picoWiring(devices);
  let conditions = mission.conditions.map((c) => (worked ? c : 'false'));
  if (language === 'cpp')
    return (
      '// ' +
      mission.title +
      '\n// ' +
      (worked
        ? 'Worked example — change a threshold and test again.'
        : 'TODO: replace false with the condition in your mission.') +
      '\n' +
      inputs.map((d) => 'const int ' + d.signal + 'Pin = ' + d.pin + ';').join('\n') +
      '\n' +
      outputs.map((d, i) => 'const int output' + i + ' = ' + d.pin + ';').join('\n') +
      '\n\nvoid setup() {\n  Serial.begin(115200);\n' +
      outputs.map((d, i) => '  pinMode(output' + i + ', OUTPUT);').join('\n') +
      '\n}\n\nvoid loop() {\n' +
      inputs
        .map(
          (d) =>
            '  ' +
            (d.analog && !ADC_SIGNALS.includes(d.signal) ? 'float ' : 'int ') +
            d.signal +
            ' = ' +
            (d.analog ? 'analogRead' : 'digitalRead') +
            '(' +
            d.signal +
            'Pin);',
        )
        .join('\n') +
      '\n\n' +
      outputs
        .map(
          (d, i) =>
            '  if (' +
            (conditions[i] || 'false') +
            ') {\n    digitalWrite(output' +
            i +
            ', HIGH);\n  } else {\n    digitalWrite(output' +
            i +
            ', LOW);\n  }',
        )
        .join('\n\n') +
      '\n  delay(200);\n}\n'
    );
  return (
    '# ' +
    mission.title +
    '\n# ' +
    (worked
      ? 'Worked example — try changing a threshold.'
      : 'TODO: replace False with your mission condition.') +
    '\nfrom machine import Pin, ADC\nimport time\n\n' +
    inputs
      .map(
        (d) =>
          d.signal +
          '_sensor = ' +
          (d.analog ? 'ADC(Pin(' + d.pin + '))' : 'Pin(' + d.pin + ', Pin.IN)'),
      )
      .join('\n') +
    '\n' +
    outputs.map((d, i) => 'output' + i + ' = Pin(' + d.pin + ', Pin.OUT)').join('\n') +
    '\n\nwhile True:\n' +
    inputs
      .map(
        (d) =>
          '    ' +
          d.signal +
          ' = ' +
          d.signal +
          '_sensor.' +
          (d.analog ? adcRead(pico, d.signal) : 'value()'),
      )
      .join('\n') +
    '\n\n' +
    outputs
      .map(
        (d, i) =>
          '    if ' +
          (conditions[i] || 'false')
            .replace(/&&/g, 'and')
            .replace(/\|\|/g, 'or')
            .replace(/false/g, 'False') +
          ':\n        output' +
          i +
          '.value(1)\n    else:\n        output' +
          i +
          '.value(0)',
      )
      .join('\n\n') +
    '\n    time.sleep_ms(200)\n'
  );
}
