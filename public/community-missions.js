export const communityDevices = [
  ...['door', 'lights', 'warning', 'comfort', 'barrier', 'conveyor', 'phase'].map((id, i) => ({
    id,
    pin: i + 2,
    output: true,
    wired: true,
  })),
  ...['presence', 'temperature', 'vibration', 'bay', 'request', 'traffic', 'spaces', 'light'].map(
    (signal, i) => ({ id: signal, pin: i + 20, signal, analog: true, wired: true }),
  ),
];
export const communityMissions = {
  home: [
    'Garden and street lighting',
    'Use light channel GPIO 27 to control lights on GPIO 3. Walk home after visiting the community.',
    'light',
    27,
    '<',
    35,
    3,
  ],
  shop: [
    'Automatic door & refrigeration',
    'Presence GPIO 20 opens the door GPIO 2. Monitor calibrated refrigeration temperature GPIO 21 and use warning GPIO 4 above 28°C.',
    'presence',
    20,
    '>',
    0,
    2,
  ],
  office: [
    'Comfort, energy & access',
    'Temperature GPIO 21 controls ventilation GPIO 5 above 26°C. Presence GPIO 20 and warning GPIO 4 can form an access alert. Energy follows powered equipment.',
    'temperature',
    21,
    '>',
    26,
    5,
  ],
  warehouse: [
    'Loading-bay warning',
    'Bay detector GPIO 23 turns warning GPIO 4 on when a delivery arrives. Traffic GPIO 25 measures the stopped queue.',
    'bay',
    23,
    '>',
    0,
    4,
  ],
  factory: [
    'Temperature & vibration interlock',
    'Run conveyor GPIO 7 only below 28°C and vibration GPIO 22 below 80. The moving belt and monitoring display respond to your program.',
    'temperature',
    21,
    '<',
    28,
    7,
  ],
  parking: [
    'Space detection & barrier',
    'Spaces GPIO 26 opens entry barrier GPIO 6 when a space is available. Occupancy display uses the same detector.',
    'spaces',
    26,
    '>',
    0,
    6,
  ],
  roads: [
    'Safe signal controller',
    'GPIO 24 is the pedestrian request. GPIO 8 proposes phases: 1 EW, 2 NS, 3 WALK, 4 RED. Requests use amber and clearance; occupied crossings reject vehicle phases. Street lights use GPIO 3.',
    'request',
    24,
    '>',
    0,
    8,
  ],
};
export function communityStarter(type, language) {
  const [, , name, input, op, threshold, output] = communityMissions[type];
  const result = type === 'roads' ? '3' : '1';
  if (language === 'python' && type === 'roads')
    return `from machine import Pin, ADC, PWM\nimport time\nrequest = ADC(Pin(24))\nphase = PWM(Pin(8))\nwhile True:\n    if request.read() > 0:\n        phase.duty(3)\n    else:\n        phase.duty(0)\n    time.sleep_ms(200)\n`;
  if (language === 'python')
    return `from machine import Pin, ADC\nimport time\nsensor = ADC(Pin(${input}))\nactuator = Pin(${output}, Pin.OUT)\nwhile True:\n    ${name} = sensor.read()\n    if ${name} ${op} ${threshold}:\n        actuator.value(${result})\n    else:\n        actuator.value(0)\n    time.sleep_ms(200)\n`;
  return `void setup() {\n    pinMode(${output}, OUTPUT);\n}\nvoid loop() {\n    int ${name} = analogRead(${input});\n    if (${name} ${op} ${threshold}) {\n        ${type === 'roads' ? 'analogWrite' : 'digitalWrite'}(${output}, ${result});\n    } else {\n        ${type === 'roads' ? 'analogWrite' : 'digitalWrite'}(${output}, 0);\n    }\n    delay(200);\n}\n`;
}
