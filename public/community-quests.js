import { residentialLots } from './community-residences.js';
// These quests are appended, so existing home/farm project and completion indices stay stable.
export const communityComponents = [
  {
    id: 'autoDoor',
    name: 'Automatic shop door',
    icon: '▤',
    output: true,
    area: 'Shop floor',
    desc: 'A virtual sliding-door driver: HIGH opens the door, LOW closes it.',
  },
  {
    id: 'warningLight',
    name: 'Equipment warning light',
    icon: '◉',
    output: true,
    resistor: '220 Ω',
    area: 'Factory floor',
    desc: 'A visible warning lamp. Connect its power, ground, signal and 220 Ω resistor.',
  },
  {
    id: 'vibration',
    name: 'Machine vibration sensor',
    icon: '≋',
    analog: true,
    signal: 'vibration',
    area: 'Factory floor',
    desc: 'Calibrated virtual vibration level, 0–100. Read it before enabling machinery.',
  },
  {
    id: 'conveyor',
    name: 'Conveyor motor driver',
    icon: '⇢',
    output: true,
    area: 'Factory floor',
    desc: 'Simulated motor driver: HIGH runs the visible factory conveyor; LOW stops it.',
  },
  {
    id: 'baySensor',
    name: 'Loading-bay detector',
    icon: '▣',
    signal: 'bay',
    area: 'Loading bay',
    desc: 'HIGH while a vehicle occupies the loading bay. In Practice mode use the bay test control.',
  },
  {
    id: 'streetLight',
    name: 'Street lighting module',
    icon: '☀',
    output: true,
    area: 'Community roads',
    desc: 'Driven street lamps: HIGH lights the neighbourhood, LOW switches them off.',
  },
  {
    id: 'walkButton',
    name: 'Pedestrian request button',
    icon: '🚶',
    signal: 'pedRequest',
    area: 'Community roads',
    desc: 'HIGH when a pedestrian requests a crossing. Use the world crossing button or practice controls.',
  },
  ...['EW', 'NS'].map((axis) => ({
    id: 'traffic' + axis,
    name: axis + ' traffic movement',
    icon: '●',
    output: true,
    area: 'Community roads',
    desc:
      'HIGH proposes ' +
      axis +
      ' green. Every proposal passes the traffic safety interlock; conflicting greens are rejected.',
  })),
  {
    id: 'walkPhase',
    name: 'Pedestrian walk phase',
    icon: '🚶',
    output: true,
    area: 'Community roads',
    desc: 'HIGH proposes WALK; LOW withdraws it. The interlock inserts amber and clearance and protects crossing occupants.',
  },
  {
    id: 'spaceSensor',
    name: 'Parking-space detector',
    icon: 'P',
    analog: true,
    signal: 'spaces',
    area: 'Parking area',
    desc: 'Calibrated virtual free-space count: 0 when occupied, 1 when available.',
  },
  {
    id: 'parkBarrier',
    name: 'Parking entry barrier',
    icon: '▤',
    output: true,
    area: 'Parking area',
    desc: 'HIGH opens the barrier along the designated parking route; LOW closes it.',
  },
];
const quest = (type, area, title, ids, conditions, scenarios, goal, learn) => ({
  communityQuest: true,
  communityType: type,
  area,
  title,
  ids,
  conditions,
  scenarios,
  goal,
  learn,
  resident: 'Alex',
  role: 'Community technician',
  quote: '“Can you install and wire these devices, then program this part of our community?”',
  xp: 180,
  badge: title,
  hint: goal + ' Give every output an OFF path. Use the Guide, Run, and Test in the main editor.',
});
export const communityQuests = [
  quest(
    'shop',
    'Shop floor',
    'Shop Automatic Door',
    ['occupancy', 'autoDoor'],
    ['occupied == 1'],
    [
      ['Customer arrives', { occupied: 1 }, [1]],
      ['Empty entrance', { occupied: 0 }, [0]],
    ],
    'Open the automatic door while presence is HIGH. Close it when the entrance is empty.',
    ['Digital input', 'Doors', 'Occupancy'],
  ),
  quest(
    'shop',
    'Shop floor',
    'Refrigeration Temperature Alert',
    ['temp', 'warningLight'],
    ['temp > 8'],
    [
      ['Chilled', { temp: 4 }, [0]],
      ['Warm fridge', { temp: 12 }, [1]],
      ['At boundary', { temp: 8 }, [0]],
    ],
    'Turn the warning lamp on above 8°C and off at 8°C or below.',
    ['Temperature', 'Refrigeration', 'Boundary tests'],
  ),
  quest(
    'office',
    'Business office',
    'Business Comfort and Energy',
    ['temp', 'occupancy', 'ldr', 'fan', 'led'],
    ['temp > 26 && occupied == 1', 'light < 1500 && occupied == 1'],
    [
      ['Busy warm dark room', { temp: 30, occupied: 1, light: 10 }, [1, 1]],
      ['Empty office', { temp: 30, occupied: 0, light: 10 }, [0, 0]],
      ['Bright comfortable room', { temp: 24, occupied: 1, light: 80 }, [0, 0]],
      ['Cool dark room', { temp: 24, occupied: 1, light: 10 }, [0, 1]],
    ],
    'Ventilate above 26°C and light the room below light reading 1500, only while occupied. Watch energy use in Resources.',
    ['Occupancy', 'Comfort', 'Energy monitoring'],
  ),
  quest(
    'office',
    'Business office',
    'Business Access Alert',
    ['door', 'button', 'buzzer'],
    ['door == 1 && armed == 1'],
    [
      ['Armed access', { door: 1, armed: 1 }, [1]],
      ['Closed door', { door: 0, armed: 1 }, [0]],
      ['Authorised service', { door: 1, armed: 0 }, [0]],
    ],
    'Alert only when the access door is open and the security switch is armed.',
    ['Digital inputs', 'Access', 'Logical AND'],
  ),
  quest(
    'warehouse',
    'Loading bay',
    'Warehouse Loading-Bay Warning',
    ['baySensor', 'warningLight'],
    ['bay == 1'],
    [
      ['Truck at bay', { bay: 1 }, [1]],
      ['Bay clear', { bay: 0 }, [0]],
    ],
    'Light the warning while a delivery occupies the loading bay. Switch it off when clear.',
    ['Vehicle sensing', 'Loading bays', 'Warning lights'],
  ),
  quest(
    'warehouse',
    'Loading bay',
    'Warehouse Stock-Area Monitoring',
    ['humidity', 'warningLight'],
    ['humidity > 75'],
    [
      ['Damp stock area', { humidity: 85 }, [1]],
      ['Dry stock area', { humidity: 50 }, [0]],
      ['At boundary', { humidity: 75 }, [0]],
    ],
    'Warn above humidity 75% and switch the warning off at 75% or below.',
    ['Humidity', 'Stock monitoring', 'Boundaries'],
  ),
  quest(
    'factory',
    'Factory floor',
    'Factory Conveyor Safety',
    ['temp', 'vibration', 'conveyor', 'warningLight'],
    ['temp < 40 && vibration < 80', 'temp >= 40 || vibration >= 80'],
    [
      ['Safe machine', { temp: 25, vibration: 20 }, [1, 0]],
      ['Hot machine', { temp: 45, vibration: 20 }, [0, 1]],
      ['High vibration', { temp: 25, vibration: 90 }, [0, 1]],
      ['Temperature boundary', { temp: 40, vibration: 20 }, [0, 1]],
      ['Vibration boundary', { temp: 25, vibration: 80 }, [0, 1]],
    ],
    'Run the conveyor only below 40°C AND vibration 80. Otherwise stop it and light the warning.',
    ['Temperature', 'Vibration', 'Machine interlocks'],
  ),
  quest(
    'roads',
    'Community roads',
    'Community Street Lighting',
    ['ldr', 'streetLight'],
    ['light < 1500'],
    [
      ['Night street', { light: 10 }, [1]],
      ['Day street', { light: 80 }, [0]],
      ['At boundary', { light: 1500 / 40.95 }, [0]],
    ],
    'Switch the street lights on below light reading 1500 and off at 1500 or above.',
    ['Light sensors', 'Street lighting', 'Daily activity'],
  ),
  quest(
    'roads',
    'Community roads',
    'Safe Pedestrian Signal Proposals',
    ['walkButton', 'trafficEW', 'trafficNS', 'walkPhase'],
    ['pedRequest == 0', 'false', 'pedRequest == 1'],
    [
      ['Vehicle phase', { pedRequest: 0 }, [1, 0, 0]],
      ['Pedestrian request', { pedRequest: 1 }, [0, 0, 1]],
    ],
    'Propose EW green when no crossing is requested; propose WALK when requested. Keep NS red. Rejected proposals appear in Serial debugging.',
    ['Requests', 'Signal phases', 'Safety interlock'],
  ),
  quest(
    'parking',
    'Parking area',
    'Parking Space and Entry Barrier',
    ['spaceSensor', 'parkBarrier'],
    ['spaces > 0'],
    [
      ['Space available', { spaces: 1 }, [1]],
      ['Parking occupied', { spaces: 0 }, [0]],
    ],
    'Open the entry barrier while a parking space is available. Close it when no space remains.',
    ['Space detection', 'Barriers', 'Occupancy'],
  ),
];
// Append residential quests after existing community projects to preserve saved indices.
communityQuests.push(
  quest(
    'residence1',
    'Willow house',
    'Neighbourhood Porch Lighting',
    ['ldr', 'porch'],
    ['light < 1800'],
    [
      ['After sunset', { light: 20 }, [1]],
      ['Daylight', { light: 80 }, [0]],
      ['At threshold', { light: 1800 / 40.95 }, [0]],
    ],
    'Light the porch when the light reading is below 1800. Turn it off in daylight.',
    ['Light sensors', 'Residential lighting'],
  ),
  quest(
    'residence2',
    'Courtyard house',
    'Neighbourhood Room Comfort',
    ['temp', 'fan'],
    ['temp > 28'],
    [
      ['Hot room', { temp: 32 }, [1]],
      ['Comfortable room', { temp: 24 }, [0]],
      ['At threshold', { temp: 28 }, [0]],
    ],
    'Run the fan above 28°C and switch it off at 28°C or below.',
    ['Temperature', 'Room comfort'],
  ),
  quest(
    'residence3',
    'Garden cottage',
    'Neighbourhood Garden Watering',
    ['soil', 'pump', 'level'],
    ['soil < 2048 && tank > 0'],
    [
      ['Dry garden', { soil: 20, tank: 80 }, [1]],
      ['Moist garden', { soil: 80, tank: 80 }, [0]],
      ['Empty tank', { soil: 20, tank: 0 }, [0]],
    ],
    'Water below soil reading 2048 while water remains in the tank. Stop when moist or the tank is empty.',
    ['Moisture', 'Irrigation', 'Water conservation'],
  ),
);
for (const q of communityQuests) {
  const home = residentialLots.find((b) => b.type === q.communityType);
  if (home) {
    q.resident = home.resident;
    q.role = 'Neighbourhood resident';
    q.quote = '“Can you help automate our home and garden?”';
  }
}

export const nativeOutputChannels = {
  autoDoor: 2,
  warningLight: 4,
  conveyor: 7,
  streetLight: 3,
  parkBarrier: 6,
  fan: 5,
  led: 3,
  buzzer: 4,
};
export function applyNativeCommunityOutputs(sim, devices, outputs, running) {
  sim.nativeActive = true;
  const next = {};
  for (const d of devices)
    if (d.output && nativeOutputChannels[d.id] && !residentialLots.some((b) => b.name === d.area))
      next[nativeOutputChannels[d.id]] = Number(outputs[d.pin] || 0);
  sim.outputs = next;
  sim.parkingControlled = devices.some((d) => d.id === 'parkBarrier');
  const phases = devices.filter((d) => ['trafficEW', 'trafficNS', 'walkPhase'].includes(d.id));
  if (running && phases.length) {
    const movements = phases
      .filter((d) => outputs[d.pin] > 0)
      .map((d) => ({ trafficEW: 'EW', trafficNS: 'NS', walkPhase: 'WALK' })[d.id]);
    const request = movements.length ? movements : ['RED'],
      signature = request.join(',');
    if (sim.signals.request(request, sim.occupied('1:1'))) sim.nativePhaseSignature = signature;
  } else {
    if (sim.nativePhaseSignature) sim.signals.pending = null;
    sim.nativePhaseSignature = null;
  }
}

// The simulated conveyor has a larger electrical load than household indicator lamps.
communityQuests.find((q) => q.communityType === 'factory').budget = { wh: 0.35, litres: 45 };
