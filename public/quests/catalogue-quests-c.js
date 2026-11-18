import { A, L, home, town, quest, press, published } from './catalogue-kit.js';
// Catalogue quests Q061–Q100: water, energy, public spaces, visitor sites, networking, fault
// finding, security, data and the final expedition.

// Messages the tests send to the program, as the household's dashboard would.
const send = (label, topic, payload, ms, expect, extra = {}) => ({
  label,
  send: [topic, payload],
  ms,
  expect,
  ...extra,
});
const json = (o) => JSON.stringify(o);
// The worked example of a condition quest with `edit` applied to it (a repair starter). The game
// passes in its program builder, which this module cannot import (missions.js imports it).
const starter = (q, edit) => (language, devices, board, program) =>
  edit(program({ ...q, solution: undefined }, language, devices, true, board), language, devices);

const lamp = (topic) => `
if (!mqttConnected()) {
  lamp = 0;
  if (mqttReconnect()) {
    mqttSubscribe("${topic}");
    lastSeen = mqttLastDelivery();
  }
} else if (mqttLastDelivery() != lastSeen) {
  lastSeen = mqttLastDelivery();
  message = mqttRead("${topic}");`;

const q88 = {
  title: 'Threshold Detective',
  ids: ['ldr', 'led'],
  conditions: ['light < 1800'],
};

export const catalogueQuestsC = [
  quest(61, home('Water tank'), {
    title: 'Flood-Level Beacon',
    quote: 'Give us an early warning when the pond rises, and a loud one when it floods.',
    goal: 'Light amber when the pond reading is from 2500 up to (not including) 3500. At 3500 or above, light red and sound the buzzer instead. Below 2500 everything is off.',
    ids: ['pond', 'amber', 'red', 'buzzer'],
    conditions: ['pond >= 2500 && pond < 3500', 'pond >= 3500', 'pond >= 3500'],
    learn: ['Ranges', 'Escalating warnings'],
    hint: 'Amber: pond >= 2500 && pond < 3500. Red and buzzer: pond >= 3500.',
    scenarios: [
      ['2499', { pond: A(2499) }, [0, 0, 0]],
      ['2500', { pond: A(2500) }, [1, 0, 0]],
      ['3499', { pond: A(3499) }, [1, 0, 0]],
      ['3500', { pond: A(3500) }, [0, 1, 1]],
    ],
    advanced: {
      ids: ['pond', 'resetButton', 'amber', 'red', 'buzzer'],
      goal: 'Once the pond reaches 3500, keep red and the buzzer on until the level is below 3000 and reset is pressed. Amber only shows when the alarm is not latched. It starts clear.',
      hint: 'Latch at pond >= 3500; clear only on reset with pond < 3000. Amber needs the latch to be clear.',
      techniques: ['latch'],
      sequences: [
        {
          name: 'The flood alarm stays on until reset',
          steps: [
            ['2000', { pond: A(2000) }, 1000, [0, 0, 0]],
            ['3500', { pond: A(3500) }, 1000, [0, 1, 1]],
            ['Falls to 3200', { pond: A(3200) }, 1000, [0, 1, 1]],
            ...press('reset', 'Reset at 3200', [0, 1, 1]),
            ['Falls to 2999', { pond: A(2999) }, 1000, [0, 1, 1]],
            ...press('reset', 'Reset at 2999', [1, 0, 0]),
            ['Steady', {}, 1000, [1, 0, 0]],
          ],
        },
      ],
      solution: {
        state: { latched: 0 },
        loop: `
if (pond >= 3500) {
  latched = 1;
}
if (latched == 1 && reset == 1 && pond < 3000) {
  latched = 0;
}
write(amber, latched == 0 && pond >= 2500 && pond < 3500);
write(red, latched);
write(buzzer, latched);`,
      },
    },
  }),
  quest(62, home('Water tank'), {
    title: 'Pond Refill and Drain',
    quote: 'Keep the pond between too low and too high, using the tank water wisely.',
    goal: 'Open the inlet valve when the pond reading is below 1200 and the tank reading is above 400. Open the drain (second valve) when the pond is above 3500. Both are closed otherwise.',
    ids: ['pond', 'level', 'valve', 'valve2'],
    conditions: ['pond < 1200 && tank > 400', 'pond > 3500'],
    learn: ['Two outputs', 'Reserve protection'],
    hint: 'Inlet: pond < 1200 && tank > 400. Drain: pond > 3500.',
    scenarios: [
      ['Low pond, full tank', { pond: A(1199), tank: 90 }, [1, 0]],
      ['High pond', { pond: A(3501), tank: 90 }, [0, 1]],
      ['Middle', { pond: A(2000), tank: 90 }, [0, 0]],
      ['Low pond, low tank', { pond: A(1199), tank: A(400) }, [0, 0]],
    ],
    advanced: {
      goal: 'Use two thresholds for each valve: the inlet opens at 1200 or below and closes at 2000 or above; the drain opens at 3500 or above and closes at 3000 or below. A tank at 400 or below closes the inlet at once and cancels the refill. Both start closed.',
      hint: 'Two hysteresis variables. The tank check sets the inlet to 0 whatever the pond says.',
      techniques: ['hysteresis'],
      sequences: [
        {
          name: 'Refill from 1200 to 2000',
          env: { tank: 90 },
          steps: [
            ['1500 at start', { pond: A(1500) }, 1000, [0, 0]],
            ['1200', { pond: A(1200) }, 1000, [1, 0]],
            ['1600', { pond: A(1600) }, 1000, [1, 0]],
            ['2000', { pond: A(2000) }, 1000, [0, 0]],
            ['1600 again', { pond: A(1600) }, 1000, [0, 0]],
          ],
        },
        {
          name: 'The tank reserve stops a refill',
          steps: [
            ['Low pond', { pond: A(1100), tank: 90 }, 1000, [1, 0]],
            ['Tank at 400', { tank: A(400) }, 200, [0, 0]],
            ['Tank refilled, pond 1500', { tank: 90, pond: A(1500) }, 1000, [0, 0]],
          ],
        },
        {
          name: 'Drain from 3500 to 3000',
          steps: [
            ['3500', { pond: A(3500) }, 1000, [0, 1]],
            ['3200', { pond: A(3200) }, 1000, [0, 1]],
            ['3000', { pond: A(3000) }, 1000, [0, 0]],
          ],
        },
      ],
      solution: {
        state: { inlet: 0, drain: 0 },
        loop: `
if (pond <= 1200) {
  inlet = 1;
} else if (pond >= 2000) {
  inlet = 0;
}
if (tank <= 400) {
  inlet = 0;
}
if (pond >= 3500) {
  drain = 1;
} else if (pond <= 3000) {
  drain = 0;
}
write(valve, inlet);
write(valve2, drain);`,
      },
    },
  }),
  quest(63, home('Water tank'), {
    title: 'Rainwater First',
    quote: 'Use the rainwater tank first, and only switch to the backup tank when it runs low.',
    goal: 'While the demand switch (arm button) is HIGH: open the rainwater valve if the rain tank is above 400; otherwise open the backup valve (second valve) if the backup tank is above 400. Never both.',
    ids: ['button', 'level', 'tank2', 'valve', 'valve2'],
    conditions: ['armed == 1 && tank > 400', 'armed == 1 && tank <= 400 && tank2 > 400'],
    learn: ['Priorities', 'Exclusive outputs'],
    hint: 'Rain: armed == 1 && tank > 400. Backup: armed == 1 && tank <= 400 && tank2 > 400.',
    scenarios: [
      ['Both full', { armed: 1, tank: 90, tank2: 90 }, [1, 0]],
      ['Rain tank low', { armed: 1, tank: A(400), tank2: 90 }, [0, 1]],
      ['Both low', { armed: 1, tank: A(400), tank2: A(400) }, [0, 0]],
      ['No demand', { armed: 0, tank: 90, tank2: 90 }, [0, 0]],
    ],
    advanced: {
      goal: 'When the supply changes from one tank to the other, keep both valves closed for 2 seconds first. Removing the demand closes both and cancels any change.',
      hint: 'Track which supply is open. When the wanted one differs, close both, note the time, and open the new one after 2000 ms.',
      techniques: ['phases'],
      sequences: [
        {
          name: 'A 2 s gap when switching supplies',
          env: { armed: 1, tank2: 90 },
          steps: [
            ['Rainwater', { tank: 90 }, 1000, [1, 0]],
            ['Rain tank runs low', { tank: A(400) }, 200, [0, 0]],
            ['1.8 s later', {}, 1800, [0, 0]],
            ['2 s later: backup', {}, 200, [0, 1]],
          ],
        },
        {
          name: 'Removing the demand cancels the change',
          env: { tank2: 90 },
          steps: [
            ['Rainwater', { armed: 1, tank: 90 }, 1000, [1, 0]],
            ['Rain tank low', { tank: A(400) }, 600, [0, 0]],
            ['Demand off', { armed: 0 }, 2000, [0, 0]],
            ['Demand back', { armed: 1 }, 200, [0, 1]],
          ],
        },
      ],
      solution: {
        state: { current: 0, target: 0, switching: 0, switchStart: 0 },
        loop: `
if (armed == 1 && tank > 400) {
  target = 1;
} else if (armed == 1 && tank2 > 400) {
  target = 2;
} else {
  target = 0;
}
if (target == 0) {
  current = 0;
  switching = 0;
} else if (switching == 1) {
  if (millis() - switchStart >= 2000) {
    current = target;
    switching = 0;
  }
} else if (current == 0) {
  current = target;
} else if (target != current) {
  switching = 1;
  switchStart = millis();
  current = 0;
}
write(valve, current == 1);
write(valve2, current == 2);`,
      },
    },
  }),
  quest(64, home('Water tank'), {
    title: 'Water Quality Demonstrator',
    quote: 'Only let clear water into the garden pond.',
    goal: 'Open the valve when the turbidity is below 40 (0–100 scale). At 40 or above, close it and light the red warning.',
    ids: ['turbidity', 'valve', 'red'],
    conditions: ['turbidity < 40', 'turbidity >= 40'],
    learn: ['Calibrated input', 'Water quality'],
    hint: 'Valve: turbidity < 40. Warning: turbidity >= 40.',
    scenarios: [
      ['39', { turbidity: 39 }, [1, 0]],
      ['40', { turbidity: 40 }, [0, 1]],
      ['Clear', { turbidity: 5 }, [1, 0]],
    ],
    advanced: {
      ids: ['turbidity', 'ph', 'valve', 'red'],
      conditions: ['turbidity < 40 && ph >= 6 && ph <= 8', 'turbidity >= 40 || ph < 6 || ph > 8'],
      goal: 'Also require a pH from 6 to 8 (both included). A missing pH reading (-1) is outside that range, so it closes the valve and lights the warning.',
      hint: 'Valve: turbidity < 40 && ph >= 6 && ph <= 8. The warning is the opposite: turbidity >= 40 || ph < 6 || ph > 8.',
      techniques: ['validate'],
      scenarios: [
        ['Clear, pH 6', { turbidity: 10, ph: 6 }, [1, 0]],
        ['Clear, pH 8', { turbidity: 10, ph: 8 }, [1, 0]],
        ['Clear, pH 5.9', { turbidity: 10, ph: 5.9 }, [0, 1]],
        ['Clear, pH 8.1', { turbidity: 10, ph: 8.1 }, [0, 1]],
        ['Missing pH', { turbidity: 10, ph: -1 }, [0, 1]],
        ['Murky, pH 7', { turbidity: 50, ph: 7 }, [0, 1]],
      ],
    },
  }),
  quest(65, home('Utility room'), {
    title: 'Leak by Unexpected Flow',
    quote: 'Water flowing when nobody is using any means a leak somewhere.',
    goal: 'The demand switch (arm button) is HIGH while someone is using water. Sound the buzzer when it is LOW but the flow meter reads above 0.',
    ids: ['button', 'flow', 'buzzer'],
    conditions: ['armed == 0 && flow > 0'],
    learn: ['Feedback sensors', 'Leak detection'],
    hint: 'armed == 0 && flow > 0.',
    scenarios: [
      ['Nobody using, water flowing', { armed: 0, flow: 3 }, [1]],
      ['Someone using water', { armed: 1, flow: 3 }, [0]],
      ['Nothing flowing', { armed: 0, flow: 0 }, [0]],
    ],
    advanced: {
      ids: ['button', 'flow', 'resetButton', 'buzzer'],
      goal: 'Only latch the alarm after 10 seconds of unexpected flow without a break. Demand, or the flow stopping, restarts the count. Reset clears the alarm, but only while the flow is 0.',
      hint: 'Time how long armed == 0 && flow > 0 has lasted; latch at 10000 ms. Reset needs flow == 0.',
      techniques: ['duration', 'latch'],
      sequences: [
        {
          name: '10 s of unexpected flow',
          steps: [
            ['9.8 s of unexpected flow', { armed: 0, flow: 3 }, 10000, [0]],
            ['10 s', {}, 200, [1]],
            ...press('reset', 'Reset while flowing', [1]),
            ['Flow stops', { flow: 0 }, 1000, [1]],
            ...press('reset', 'Reset with no flow', [0]),
          ],
        },
        {
          name: 'Demand restarts the count',
          steps: [
            ['6 s of unexpected flow', { armed: 0, flow: 3 }, 6000, [0]],
            ['Someone runs a tap', { armed: 1 }, 200, [0]],
            ['6 s more', { armed: 0 }, 6000, [0]],
          ],
        },
      ],
      solution: {
        state: { since: 0, latched: 0 },
        loop: `
if (armed == 0 && flow > 0) {
  if (since == 0) {
    since = millis();
  }
  if (millis() - since >= 10000) {
    latched = 1;
  }
} else {
  since = 0;
}
if (latched == 1 && reset == 1 && flow == 0) {
  latched = 0;
}
write(buzzer, latched);`,
      },
    },
  }),
  quest(66, home('Living room'), {
    title: 'Empty-Room Energy Saver',
    quote: 'Do not cool or light the living room when nobody is in it.',
    goal: 'Run the air-conditioning when presence is HIGH and the temperature is above 26 °C. Light the LED whenever presence is HIGH.',
    ids: ['occupancy', 'temp', 'ac', 'led'],
    conditions: ['occupied == 1 && temp > 26', 'occupied == 1'],
    learn: ['Independent outputs', 'AND logic', 'Energy use'],
    hint: 'Two if/else blocks: occupied == 1 && temp > 26 for the AC, occupied == 1 for the LED.',
    // The AC draws 800 W: correct code runs it in two 5-second tests.
    budget: { wh: 2.5, litres: 45 },
    scenarios: [
      ['Empty and hot', { occupied: 0, temp: 31 }, [0, 0]],
      ['Home and hot', { occupied: 1, temp: 31 }, [1, 1]],
      ['Home, 26 °C', { occupied: 1, temp: 26 }, [0, 1]],
    ],
    advanced: {
      ids: ['occupancy', 'temp', 'ldr', 'ac', 'led'],
      conditions: ['occupied == 1 && temp > 26', 'occupied == 1 && light < 1800'],
      goal: 'Keep the AC rule. Light the LED only when presence is HIGH and the light reading is below 1800.',
      hint: 'Add light < 1800 to the LED condition. The AC never looks at the light sensor.',
      scenarios: [
        ['Home, bright and hot', { occupied: 1, temp: 31, light: 80 }, [1, 0]],
        ['Home, dark and cool', { occupied: 1, temp: 22, light: 10 }, [0, 1]],
        ['Empty, dark and hot', { occupied: 0, temp: 31, light: 10 }, [0, 0]],
      ],
    },
  }),
  quest(67, home('Water tank'), {
    title: 'Solar Surplus Pump',
    quote: 'Pump water up to the header tank using sunshine we would otherwise waste.',
    goal: 'Run the pump when the solar power is 500 W or more and the tank reading is above 400.',
    ids: ['solar', 'level', 'pump'],
    conditions: ['solar >= 500 && tank > 400'],
    learn: ['Energy', 'AND logic'],
    hint: 'solar >= 500 && tank > 400.',
    scenarios: [
      ['499 W', { solar: 499, tank: 90 }, [0]],
      ['500 W', { solar: 500, tank: 90 }, [1]],
      ['Sunny, low tank', { solar: 900, tank: A(400) }, [0]],
    ],
    advanced: {
      ids: ['solar', 'load', 'level', 'pump'],
      goal: 'Use only the surplus: solar power minus the household load. The pump starts off, comes on at a surplus of 500 W or more and goes off at 300 W or less, keeping its state in between. A tank at 400 or below always stops it and cancels the run.',
      hint: 'surplus = solar - load. Hysteresis on the surplus, then force the pump off when tank <= 400.',
      techniques: ['hysteresis'],
      sequences: [
        {
          name: 'Surplus with two thresholds',
          env: { tank: 90, load: 500 },
          steps: [
            ['Surplus 400 W at start', { solar: 900 }, 1000, [0]],
            ['Surplus 500 W', { solar: 1000 }, 1000, [1]],
            ['Surplus 400 W', { solar: 900 }, 1000, [1]],
            ['Surplus 300 W', { solar: 800 }, 1000, [0]],
            ['Surplus 400 W again', { solar: 900 }, 1000, [0]],
          ],
        },
        {
          name: 'The tank reserve stops it',
          env: { load: 200 },
          steps: [
            ['Surplus 600 W', { solar: 800, tank: 90 }, 1000, [1]],
            ['Tank at 400', { tank: A(400) }, 200, [0]],
            ['Tank refilled, surplus 400 W', { tank: 90, solar: 600 }, 1000, [0]],
          ],
        },
      ],
      solution: {
        state: { running: 0, surplus: '0.0' },
        loop: `
surplus = solar - load;
if (surplus >= 500) {
  running = 1;
} else if (surplus <= 300) {
  running = 0;
}
if (tank <= 400) {
  running = 0;
}
write(pump, running);`,
      },
    },
  }),
  quest(68, home('Garage'), {
    title: 'Battery Reserve Lights',
    quote: 'During a power cut the garage runs on a battery. Save it for the emergency light.',
    goal: 'Light the path lights (normal light) while the battery is above 20 %. The red emergency light follows the emergency switch (arm button).',
    ids: ['battery', 'button', 'led', 'red'],
    conditions: ['battery > 20', 'armed == 1'],
    learn: ['Battery reserve', 'Independent outputs'],
    hint: 'Normal: battery > 20. Emergency: armed == 1.',
    scenarios: [
      ['20 %', { battery: 20, armed: 0 }, [0, 0]],
      ['21 %', { battery: 21, armed: 0 }, [1, 0]],
      ['Emergency', { battery: 50, armed: 1 }, [1, 1]],
    ],
    advanced: {
      conditions: ['battery > 20', 'armed == 1 && battery > 0'],
      goal: 'The emergency light may run on any charge above 0 % while the switch is on, but at 0 % everything is off. The normal light still needs more than 20 %.',
      hint: 'Emergency: armed == 1 && battery > 0.',
      scenarios: [
        ['5 %, emergency', { battery: 5, armed: 1 }, [0, 1]],
        ['0 %, emergency', { battery: 0, armed: 1 }, [0, 0]],
        ['21 %, emergency', { battery: 21, armed: 1 }, [1, 1]],
        ['50 %, no emergency', { battery: 50, armed: 0 }, [1, 0]],
      ],
    },
  }),
  quest(69, home('Kitchen'), {
    title: 'Peak-Load Scheduler',
    quote: 'If the oven, the pump and the fan all start at once, the fuse trips.',
    goal: 'Three appliances are requested by the arm button (A: heater, 600 W), the push button (B: pump, 400 W) and the second push button (C: fan, 300 W), held while wanted. Serve them in the order A, B, C, admitting each only if the total stays at 1000 W or less.',
    ids: ['button', 'pushButton', 'pushButton2', 'heater', 'pump', 'fan'],
    conditions: ['armed == 1', 'pressed == 1', 'pressed2 == 1 && (armed == 0 || pressed == 0)'],
    learn: ['Priorities', 'Load limits'],
    hint: 'A alone is 600 W and A+B is exactly 1000 W, so both fit. C (300 W) only fits when A and B are not both on.',
    budget: { wh: 1, litres: 45 },
    scenarios: [
      ['A, B and C', { armed: 1, pressed: 1, pressed2: 1 }, [1, 1, 0]],
      ['B and C', { armed: 0, pressed: 1, pressed2: 1 }, [0, 1, 1]],
      ['A and C', { armed: 1, pressed: 0, pressed2: 1 }, [1, 0, 1]],
      ['Nothing', { armed: 0, pressed: 0, pressed2: 0 }, [0, 0, 0]],
    ],
    advanced: {
      ids: ['button', 'pushButton', 'pushButton2', 'emergencyButton', 'heater', 'pump', 'fan'],
      conditions: [
        'emergency == 0 && armed == 1',
        'emergency == 0 && pressed == 1',
        'emergency == 0 && pressed2 == 1 && (armed == 0 || pressed == 0)',
      ],
      goal: 'An emergency (emergency switch HIGH) sheds every appliance until it clears; then the normal priority choice applies again, worked out from the requests on every pass.',
      hint: 'Add emergency == 0 && to each rule.',
      scenarios: [
        ['Emergency', { armed: 1, pressed: 1, pressed2: 1, emergency: 1 }, [0, 0, 0]],
        ['Emergency cleared', { armed: 1, pressed: 1, pressed2: 1, emergency: 0 }, [1, 1, 0]],
        ['B and C, no emergency', { armed: 0, pressed: 1, pressed2: 1, emergency: 0 }, [0, 1, 1]],
      ],
    },
  }),
  quest(70, home('Living room'), {
    title: 'Daily Consumption Challenge',
    quote: 'How much energy does the living-room lamp really use?',
    goal: 'The lamp (path lights) follows presence. While it is on, add up its energy at 20 W (Wh = 20 × hours on), and print the total in Wh on every pass.',
    ids: ['occupancy', 'led'],
    learn: ['Energy', 'Accumulating values', 'Floats'],
    hint: 'On each pass, if the lamp was on, add 20.0 * (millis() - last) / 3600000.0 to a float total.',
    techniques: ['log'],
    sequences: [
      {
        name: 'An hour on is 20 Wh',
        tick: 60000,
        steps: [
          ['Empty for 10 minutes', { occupied: 0 }, 600000, [0]],
          {
            label: 'Someone home for an hour',
            env: { occupied: 1 },
            ms: 3600000,
            expect: [1],
            check: (ctx) =>
              Math.abs(Number(ctx.logs.at(-1)) - 20) <= 0.5 ||
              'the total should be about 20 Wh, but it printed ' + ctx.logs.at(-1) + '.',
          },
          {
            label: 'Empty for an hour',
            env: { occupied: 0 },
            ms: 3600000,
            expect: [0],
            check: (ctx) =>
              Math.abs(Number(ctx.logs.at(-1)) - 20) <= 0.7 ||
              'the total should stay about 20 Wh, but it printed ' + ctx.logs.at(-1) + '.',
          },
        ],
      },
    ],
    solution: {
      state: { energy: '0.0', last: 0, wasOn: 0 },
      loop: `
if (wasOn == 1) {
  energy = energy + 20.0 * (millis() - last) / 3600000.0;
}
last = millis();
wasOn = occupied;
write(led, wasOn);
print(energy);`,
    },
    advanced: {
      ids: ['occupancy', 'clock', 'led'],
      goal: 'Allow 100 Wh a day. Once the total reaches 100 Wh, keep the lamp off until local midnight, when the total goes back to 0 (once per day). The clock reads 0 just after midnight.',
      hint: 'Spot midnight as the clock going down (2359 to 0). Turn the lamp on only while occupied and energy < 100.',
      techniques: ['schedule', 'log'],
      sequences: [
        {
          name: '100 Wh a day',
          tick: 60000,
          env: { occupied: 1 },
          steps: [
            ['On from 18:00 for 4 h 50 min', { clock: 1800 }, 290 * 60000, [1]],
            ['5 h 10 min', { clock: 2300 }, 20 * 60000, [0]],
            ['Still off at 23:50', { clock: 2350 }, 30 * 60000, [0]],
            ['Midnight', { clock: 0 }, 60000, [1]],
            ['Next morning', { clock: 900 }, 60000, [1]],
          ],
        },
      ],
      solution: {
        state: { energy: '0.0', last: 0, wasOn: 0, prevClock: -1 },
        loop: `
if (prevClock >= 0 && clock < prevClock) {
  energy = 0.0;
}
prevClock = clock;
if (wasOn == 1) {
  energy = energy + 20.0 * (millis() - last) / 3600000.0;
}
last = millis();
if (occupied == 1 && energy < 100) {
  wasOn = 1;
} else {
  wasOn = 0;
}
write(led, wasOn);
print(energy);`,
      },
    },
  }),
  quest(71, town('school', 'Neighbourhood school'), {
    title: 'Library Quiet Indicator',
    quote: 'Remind students in the school library to keep their voices down.',
    goal: 'Light green while the sound level is 40 or less (0–100). Light amber above 40.',
    ids: ['sound', 'green', 'amber'],
    conditions: ['sound <= 40', 'sound > 40'],
    learn: ['Calibrated input', 'Two indicators'],
    hint: 'Green: sound <= 40. Amber: sound > 40.',
    scenarios: [
      ['40', { sound: 40 }, [1, 0]],
      ['41', { sound: 41 }, [0, 1]],
      ['Silent', { sound: 5 }, [1, 0]],
    ],
    advanced: {
      goal: 'A single cough should not trip the sign: take a sample every second and use the average of the last five samples (or of all of them, until there are five).',
      hint: 'Shift samples along five variables each second, count how many you have, and compare the average with 40.',
      techniques: ['average'],
      sequences: [
        {
          name: 'One loud sample is averaged out',
          steps: [
            ['Quiet for 4 s', { sound: 20 }, 4000, [1, 0]],
            ['A loud cough', { sound: 100 }, 1000, [1, 0]],
            ['Stays loud', {}, 1000, [0, 1]],
          ],
        },
        {
          name: 'Five loud samples',
          steps: [['Chatter for 5 s', { sound: 50 }, 5000, [0, 1]]],
        },
        {
          name: 'Averages what it has at first',
          steps: [['Loud from the start', { sound: 50 }, 200, [0, 1]]],
        },
      ],
      solution: {
        state: { a: 0, b: 0, c: 0, d: 0, e: 0, count: 0, lastSample: 0, mean: '0.0' },
        loop: `
if (count == 0 || millis() - lastSample >= 1000) {
  lastSample = millis();
  e = d;
  d = c;
  c = b;
  b = a;
  a = sound;
  if (count < 5) {
    count = count + 1;
  }
  mean = (a + b + c + d + e) * 1.0 / count;
}
write(green, mean <= 40);
write(amber, mean > 40);`,
      },
    },
  }),
  quest(72, town('dojo', 'Riverside judo dojo'), {
    title: 'Community Hall Ventilation',
    quote: 'Ventilate the dojo hall only when it is open and needs fresh air.',
    goal: 'Run the fan when the enable switch (arm button) is HIGH and humidity is above 65 %.',
    ids: ['button', 'humidity', 'fan'],
    conditions: ['armed == 1 && humidity > 65'],
    learn: ['AND logic', 'Enable switches'],
    hint: 'armed == 1 && humidity > 65.',
    scenarios: [
      ['Enabled, 66 %', { armed: 1, humidity: 66 }, [1]],
      ['Disabled, 90 %', { armed: 0, humidity: 90 }, [0]],
      ['Enabled, 65 %', { armed: 1, humidity: 65 }, [0]],
    ],
    advanced: {
      ids: ['button', 'humidity', 'occupancy', 'fan'],
      conditions: ['armed == 1 && (humidity > 65 || occupied == 1)'],
      goal: 'While enabled, run the fan when humidity is above 65 % or people are in (presence HIGH). Disabled always means off.',
      hint: 'armed == 1 && (humidity > 65 || occupied == 1).',
      scenarios: [
        ['Enabled, class in, 50 %', { armed: 1, occupied: 1, humidity: 50 }, [1]],
        ['Enabled, empty, 65 %', { armed: 1, occupied: 0, humidity: 65 }, [0]],
        ['Disabled, class in', { armed: 0, occupied: 1, humidity: 80 }, [0]],
      ],
    },
  }),
  quest(73, town('playground', 'Riverside children’s playground'), {
    title: 'Playground Shade',
    quote: 'Put the shade sail out in strong sun, but pull it in before the wind rips it.',
    goal: 'Deploy the shade sail (servo on) at a light reading of 3000 or above. Retract it below 3000.',
    ids: ['ldr', 'servo'],
    conditions: ['light >= 3000'],
    learn: ['Analogue input', 'Inclusive thresholds', 'Servo output'],
    hint: 'Compare light >= 3000. Exactly 3000 deploys the sail.',
    scenarios: [
      ['Just below 3000', { light: A(2999) }, [0]],
      ['At 3000', { light: A(3000) }, [1]],
      ['Overcast', { light: 30 }, [0]],
    ],
    advanced: {
      ids: ['ldr', 'wind', 'servo'],
      conditions: ['light >= 3000 && wind < 30'],
      goal: 'Wind of 30 km/h or more overrides the sun: retract the sail. Otherwise deploy it at a light reading of 3000 or above.',
      hint: 'The override becomes wind < 30 in the deploy condition: light >= 3000 && wind < 30.',
      scenarios: [
        ['Bright, wind 30 km/h', { light: 90, wind: 30 }, [0]],
        ['Bright, wind 29 km/h', { light: 90, wind: 29 }, [1]],
        ['Overcast and calm', { light: 30, wind: 5 }, [0]],
      ],
    },
  }),
  quest(74, town('park', 'Riverside fountain park'), {
    title: 'Sports-Ground Irrigation',
    quote: 'Water the playing field when it is dry, but never soak the players.',
    goal: 'Open the valve when the soil reading is below 2400 and presence is LOW (nobody on the field).',
    ids: ['soil', 'occupancy', 'valve'],
    conditions: ['soil < 2400 && occupied == 0'],
    learn: ['AND logic', 'Checking for LOW'],
    hint: 'soil < 2400 && occupied == 0.',
    scenarios: [
      ['Dry and empty', { soil: 10, occupied: 0 }, [1]],
      ['Players on the field', { soil: 10, occupied: 1 }, [0]],
      ['Wet', { soil: 80, occupied: 0 }, [0]],
    ],
    advanced: {
      ids: ['soil', 'occupancy', 'clock', 'valve'],
      conditions: ['soil < 2400 && occupied == 0 && clock >= 500 && clock < 600'],
      goal: 'Only water from 05:00 until 05:59. Anyone arriving closes the valve at once, and there is no catching up outside the window.',
      hint: 'Add clock >= 500 && clock < 600.',
      techniques: ['schedule'],
      scenarios: [
        ['05:00, dry, empty', { soil: 10, occupied: 0, clock: 500 }, [1]],
        ['06:00', { soil: 10, occupied: 0, clock: 600 }, [0]],
        ['05:30, someone arrives', { soil: 10, occupied: 1, clock: 530 }, [0]],
        ['04:59', { soil: 10, occupied: 0, clock: 459 }, [0]],
      ],
    },
  }),
  quest(75, town('playground2', 'Meadow children’s playground'), {
    title: 'Public Bin Fill Alert',
    quote: 'Tell the council when the playground bin is full.',
    goal: 'The distance sensor looks down into the bin. Light the full indicator (path lights) when the distance is above 0 and at most 10 cm. A distance of 0 is a fault: light the fault indicator instead.',
    ids: ['ultra', 'led', 'faultLed'],
    conditions: ['distance > 0 && distance <= 10', 'distance <= 0'],
    learn: ['Distance sensing', 'Valid readings'],
    hint: 'Full: distance > 0 && distance <= 10. Fault: distance <= 0.',
    scenarios: [
      ['11 cm', { distance: 11 }, [0, 0]],
      ['10 cm', { distance: 10 }, [1, 0]],
      ['No reading', { distance: 0 }, [0, 1]],
    ],
    advanced: {
      goal: 'Also print REPORT once each time the bin becomes full. The bin only counts as emptied again at 25 cm or more, so it is reported once per full spell. A missing reading lights the fault and does not count as emptied.',
      hint: 'Remember whether this full spell has been reported; clear that only at distance >= 25.',
      techniques: ['latch', 'log'],
      sequences: [
        {
          name: 'One report per full bin',
          steps: [
            ['Empty bin', { distance: 30 }, 1000, [0, 0]],
            ['Full', { distance: 10 }, 3000, [1, 0]],
            ['Half emptied to 20 cm', { distance: 20 }, 1000, [0, 0]],
            ['Full again', { distance: 10 }, 1000, [1, 0]],
            ['Sensor fault', { distance: 0 }, 1000, [0, 1]],
            {
              label: 'Full after the fault',
              env: { distance: 10 },
              ms: 1000,
              expect: [1, 0],
              check: (ctx) =>
                ctx.logs.filter((l) => l === 'REPORT').length === 1 ||
                'REPORT should be printed once so far, but it was printed ' +
                  ctx.logs.filter((l) => l === 'REPORT').length +
                  ' times.',
            },
            ['Emptied to 25 cm', { distance: 25 }, 1000, [0, 0]],
            {
              label: 'Full again',
              env: { distance: 10 },
              ms: 1000,
              expect: [1, 0],
              check: (ctx) =>
                ctx.logs.filter((l) => l === 'REPORT').length === 2 ||
                'REPORT should now be printed twice, but it was printed ' +
                  ctx.logs.filter((l) => l === 'REPORT').length +
                  ' times.',
            },
          ],
        },
      ],
      solution: {
        state: { reported: 0 },
        loop: `
if (distance > 0 && distance <= 10 && reported == 0) {
  print("REPORT");
  reported = 1;
}
if (distance >= 25) {
  reported = 0;
}
write(led, distance > 0 && distance <= 10);
write(faultLed, distance <= 0);`,
      },
    },
  }),
  quest(76, town('park', 'Riverside fountain park'), {
    title: 'Courtyard Fountain Schedule',
    quote: 'Run the fountain for visitors, but not when the pond is low.',
    goal: 'Run the pump while presence is HIGH (visitors) and the pond reading is above 1000.',
    ids: ['occupancy', 'pond', 'pump'],
    conditions: ['occupied == 1 && pond > 1000'],
    learn: ['AND logic', 'Protecting a pump'],
    hint: 'occupied == 1 && pond > 1000.',
    scenarios: [
      ['Visitors, 1001', { occupied: 1, pond: A(1001) }, [1]],
      ['Empty', { occupied: 0, pond: 60 }, [0]],
      ['Visitors, 1000', { occupied: 1, pond: A(1000) }, [0]],
    ],
    advanced: {
      ids: ['occupancy', 'pond', 'clock', 'pump'],
      conditions: ['occupied == 1 && pond > 1000 && clock >= 900 && clock < 1800'],
      goal: 'Only run from 09:00 until 17:59. Any failed check stops the pump at once.',
      hint: 'Add clock >= 900 && clock < 1800.',
      techniques: ['schedule'],
      scenarios: [
        ['09:00', { occupied: 1, pond: 60, clock: 900 }, [1]],
        ['18:00', { occupied: 1, pond: 60, clock: 1800 }, [0]],
        ['08:59', { occupied: 1, pond: 60, clock: 859 }, [0]],
        ['Noon, low pond', { occupied: 1, pond: A(900), clock: 1200 }, [0]],
      ],
    },
  }),
  quest(77, home('Entrance'), {
    title: 'Raised Veranda Rain Screen',
    quote: 'Keep the rain off the front veranda by lowering the screen.',
    goal: 'Deploy the rain screen (servo on) at a rain reading of 400 or above. Retract it below 400.',
    ids: ['rain', 'servo'],
    conditions: ['rain >= 400'],
    learn: ['Analogue input', 'Inclusive thresholds', 'Weather response'],
    hint: 'Compare rain >= 400. Exactly 400 deploys the screen.',
    scenarios: [
      ['Dry', { rain: 0 }, [0]],
      ['Just below 400', { rain: A(399) }, [0]],
      ['At 400', { rain: A(400) }, [1]],
    ],
    advanced: {
      ids: ['rain', 'wind', 'servo'],
      conditions: ['rain >= 400 && wind < 40'],
      goal: 'Deploy the screen only when the rain reading is 400 or above and the wind is below 40 km/h. At 40 km/h or more, retract it to protect the screen.',
      hint: 'Use rain >= 400 && wind < 40. A gale retracts the screen even in heavy rain.',
      scenarios: [
        ['Wet, wind 39 km/h', { rain: 60, wind: 39 }, [1]],
        ['Wet, wind 40 km/h', { rain: 60, wind: 40 }, [0]],
        ['Dry and calm', { rain: 0, wind: 5 }, [0]],
      ],
    },
  }),
  quest(78, home('Garden path'), {
    title: 'Courtyard Night Lanterns',
    quote: 'Light the garden lanterns when it gets dark.',
    goal: 'Turn the lanterns (path lights) on when the light reading is below 1800.',
    ids: ['ldr', 'led'],
    conditions: ['light < 1800'],
    learn: ['Analogue input', 'Thresholds'],
    hint: 'light < 1800.',
    scenarios: [
      ['1799', { light: A(1799) }, [1]],
      ['1800', { light: A(1800) }, [0]],
    ],
    advanced: {
      ids: ['ldr', 'pir', 'led'],
      goal: 'Dim the lanterns when nobody is about: in the dark, brightness 255 with movement and 64 without. In daylight (1800 or above) brightness 0.',
      hint: 'Use analogWrite (duty_u16(level * 257) in MicroPython) with 255, 64 or 0.',
      techniques: ['pwm'],
      sequences: [
        {
          name: 'Bright for people, dim otherwise',
          steps: [
            ['Dark, someone walking', { light: A(1000), motion: 1 }, 400, [L(255)]],
            ['Dark, nobody', { motion: 0 }, 400, [L(64)]],
            ['Daylight, someone walking', { light: A(1800), motion: 1 }, 400, [L(0)]],
            ['1799, nobody', { light: A(1799), motion: 0 }, 400, [L(64)]],
          ],
        },
      ],
      solution: {
        state: { level: 0 },
        loop: `
if (light >= 1800) {
  level = 0;
} else if (motion == 1) {
  level = 255;
} else {
  level = 64;
}
pwm(led, level);`,
      },
    },
  }),
  quest(79, home('Utility room'), {
    title: 'Mountain Cabin Freeze Watch',
    quote: 'Our cabin pipes freeze in winter. Warn us when it gets that cold.',
    goal: 'Sound the buzzer at an outdoor temperature of 2 °C or below.',
    ids: ['outside', 'buzzer'],
    conditions: ['outdoorTemp <= 2'],
    learn: ['Negative readings', 'Inclusive thresholds'],
    hint: 'outdoorTemp <= 2.',
    scenarios: [
      ['3 °C', { outdoorTemp: 3 }, [0]],
      ['2 °C', { outdoorTemp: 2 }, [1]],
      ['-5 °C', { outdoorTemp: -5 }, [1]],
    ],
    advanced: {
      ids: ['outside', 'battery', 'buzzer', 'heater'],
      conditions: ['outdoorTemp <= 2', 'outdoorTemp <= 2 && battery > 20'],
      goal: 'Also run the pipe heater at 2 °C or below, but only while the battery is above 20 %. The alarm sounds even when the battery is too low to heat.',
      hint: 'Heater: outdoorTemp <= 2 && battery > 20. The buzzer rule does not change.',
      budget: { wh: 0.5, litres: 45 },
      scenarios: [
        ['Freezing, battery 20 %', { outdoorTemp: -3, battery: 20 }, [1, 0]],
        ['Freezing, battery 21 %', { outdoorTemp: -3, battery: 21 }, [1, 1]],
        ['Mild', { outdoorTemp: 10, battery: 80 }, [0, 0]],
      ],
    },
  }),
  quest(80, home('Water tank'), {
    title: 'Visitor Garden Water Feature',
    quote: 'Visitors press a button to start the water feature.',
    goal: 'A new press runs the pump for 15 seconds if the pond reading is above 1000. Presses while it runs are ignored.',
    ids: ['pushButton', 'pond', 'pump'],
    learn: ['Edges', 'Timers'],
    hint: 'Start a 15-second run on a new press while not running and pond > 1000.',
    techniques: ['edge', 'hold'],
    sequences: [
      {
        name: 'One 15 s run per press',
        env: { pond: 60 },
        steps: [
          ['Ready', {}, 1000, [0]],
          ['Pressed', { pressed: 1 }, 200, [1]],
          ['14.8 s later', { pressed: 0 }, 14800, [1]],
          ['15 s later', {}, 200, [0]],
        ],
      },
      {
        name: 'A low pond does not run',
        steps: [['Pressed with the pond at 1000', { pond: A(1000), pressed: 1 }, 400, [0]]],
      },
    ],
    solution: {
      state: { prev: 0, running: 0, started: 0 },
      loop: `
if (running == 1 && millis() - started >= 15000) {
  running = 0;
}
if (pressed == 1 && prev == 0 && running == 0 && pond > 1000) {
  running = 1;
  started = millis();
}
prev = pressed;
write(pump, running);`,
    },
    advanced: {
      goal: 'After each run there is a 30-second cool-down when presses are ignored. A low pond (1000 or below) stops a run at once and starts the cool-down. At first it is ready.',
      hint: 'End runs first (time up or low pond, starting the cool-down), end the cool-down after 30000 ms, then accept a new press only when neither is active.',
      sequences: [
        {
          name: '30 s cool-down',
          env: { pond: 60 },
          steps: [
            ['Pressed', { pressed: 1 }, 200, [1]],
            ['14.8 s', { pressed: 0 }, 14800, [1]],
            ['15 s: cool-down', {}, 200, [0]],
            ['15 s into the cool-down', {}, 15000, [0]],
            ...press('pressed', 'Pressed during the cool-down', [0]),
            ['Waiting', {}, 14600, [0]],
            ['Pressed at the end of the cool-down', { pressed: 1 }, 200, [1]],
          ],
        },
        {
          name: 'A low pond stops the run',
          env: { pond: 60 },
          steps: [
            ['Pressed', { pressed: 1 }, 200, [1]],
            ['Pond drops', { pressed: 0, pond: A(1000) }, 200, [0]],
            ['Pond refilled', { pond: 60 }, 1000, [0]],
            ...press('pressed', 'Pressed during the cool-down', [0]),
          ],
        },
      ],
      solution: {
        state: { prev: 0, running: 0, started: 0, cooling: 0, coolStart: 0 },
        loop: `
if (running == 1 && (millis() - started >= 15000 || pond <= 1000)) {
  running = 0;
  cooling = 1;
  coolStart = millis();
}
if (cooling == 1 && millis() - coolStart >= 30000) {
  cooling = 0;
}
if (pressed == 1 && prev == 0 && running == 0 && cooling == 0 && pond > 1000) {
  running = 1;
  started = millis();
}
prev = pressed;
write(pump, running);`,
      },
    },
  }),
  quest(81, home('Greenhouse'), {
    title: 'Publish the Weather',
    quote: 'Send the greenhouse temperature to my phone dashboard.',
    goal: 'Connect to the broker and publish the outdoor temperature to quest/weather/temp every 5 seconds while connected. The first message goes out at 5 seconds.',
    ids: ['outside'],
    learn: ['MQTT', 'Publishing', 'Timers'],
    hint: 'mqttConnect in setup; in the loop, publish when mqttConnected() and 5000 ms have passed since the last publish.',
    techniques: ['mqtt', 'hold'],
    sequences: [
      {
        name: 'Every 5 s',
        env: { outdoorTemp: 21 },
        steps: [
          { label: '4.8 s', ms: 4800, check: published('quest/weather/temp', 0) },
          { label: '5 s', ms: 200, check: published('quest/weather/temp', 1, 21) },
          { label: '10 s', ms: 5000, check: published('quest/weather/temp', 1, 21) },
        ],
      },
    ],
    solution: {
      state: { lastSent: 0 },
      setup: 'mqttConnect("weather");',
      loop: `
if (mqttConnected() && millis() - lastSent >= 5000) {
  mqttPublish("quest/weather/temp", outdoorTemp);
  lastSent = millis();
}`,
    },
    advanced: {
      goal: 'Survive outages: while the network is down, try to reconnect. On reconnecting, publish one current reading straight away, then every 5 seconds from then. Never send a burst of missed readings.',
      hint: 'Remember that you were offline. After mqttReconnect() succeeds, publish once at once and restart the 5-second timer.',
      sequences: [
        {
          name: 'One reading after an outage, no burst',
          env: { outdoorTemp: 21 },
          steps: [
            { label: 'Connected for 12 s', ms: 12000, check: published('quest/weather/temp', 2) },
            {
              label: 'Network down for 20 s',
              network: false,
              env: { outdoorTemp: 15 },
              ms: 20000,
              check: published('quest/weather/temp', 0),
            },
            {
              label: 'Network back',
              network: true,
              ms: 200,
              check: published('quest/weather/temp', 1, 15),
            },
            { label: '4.8 s later', ms: 4800, check: published('quest/weather/temp', 0) },
            { label: '5 s later', ms: 200, check: published('quest/weather/temp', 1, 15) },
          ],
        },
      ],
      solution: {
        state: { lastSent: 0, offline: 0 },
        setup: 'mqttConnect("weather");',
        loop: `
if (!mqttConnected()) {
  offline = 1;
  mqttReconnect();
}
if (mqttConnected()) {
  if (offline == 1 || millis() - lastSent >= 5000) {
    mqttPublish("quest/weather/temp", outdoorTemp);
    lastSent = millis();
    offline = 0;
  }
}`,
      },
    },
  }),
  quest(82, home('Living room'), {
    title: 'Remote Lamp Command',
    quote: 'Let me switch the living-room lamp from my phone.',
    goal: 'Subscribe to quest/lamp/set. The message ON turns the LED on and OFF turns it off; anything else (even "on") is ignored. The lamp starts off.',
    ids: ['led'],
    learn: ['MQTT', 'Subscribing', 'Exact commands'],
    hint: 'Read the topic with mqttRead and compare it with "ON" and "OFF" exactly. Leave the lamp as it is for any other text.',
    techniques: ['mqtt'],
    sequences: [
      {
        name: 'Exact commands only',
        steps: [
          ['Starts off', {}, 1000, [0]],
          send('ON', 'quest/lamp/set', 'ON', 400, [1]),
          send('on (lower case)', 'quest/lamp/set', 'on', 400, [1]),
          send('OFF', 'quest/lamp/set', 'OFF', 400, [0]),
          send('LIGHTS', 'quest/lamp/set', 'LIGHTS', 400, [0]),
          send('ON again', 'quest/lamp/set', 'ON', 400, [1]),
        ],
      },
    ],
    solution: {
      state: { lamp: 0, message: '""' },
      setup: 'mqttConnect("lamp");\nmqttSubscribe("quest/lamp/set");',
      loop: `
message = mqttRead("quest/lamp/set");
if (message == "ON") {
  lamp = 1;
} else if (message == "OFF") {
  lamp = 0;
}
write(led, lamp);`,
    },
    advanced: {
      goal: 'Also: if the network drops, switch the lamp off. After reconnecting, wait for a fresh command: an old ON from before the outage must not switch it back on. Messages on other topics never change it.',
      hint: 'Act only when mqttLastDelivery() changes. When disconnected, turn off, reconnect, subscribe again and note the delivery time so old messages are ignored.',
      sequences: [
        {
          name: 'Off during an outage, and no stale ON',
          steps: [
            ['Connecting', {}, 1000, null],
            send('ON', 'quest/lamp/set', 'ON', 400, [1]),
            send('ON on another topic', 'quest/lamp/other', 'OFF', 400, [1]),
            { label: 'Network down', network: false, ms: 1000, expect: [0] },
            { label: 'Network back', network: true, ms: 1000, expect: [0] },
            send('Fresh ON', 'quest/lamp/set', 'ON', 400, [1]),
          ],
        },
      ],
      solution: {
        state: { lamp: 0, lastSeen: 0, message: '""' },
        setup: 'mqttConnect("lamp");\nmqttSubscribe("quest/lamp/set");',
        loop:
          lamp('quest/lamp/set') +
          `
  if (message == "ON") {
    lamp = 1;
  } else if (message == "OFF") {
    lamp = 0;
  }
}
write(led, lamp);`,
      },
    },
  }),
  quest(83, home('Utility room'), {
    title: 'Sensor Heartbeat',
    quote: 'Is the weather station in the shed still alive? It sends a heartbeat.',
    goal: 'Subscribe to quest/station/heartbeat. Light the green online indicator for 15 seconds after each heartbeat message arrives. It starts offline.',
    ids: ['green'],
    learn: ['MQTT', 'Timeouts', 'Monitoring'],
    hint: 'When mqttLastDelivery() changes, a message arrived: note millis(). Online while millis() - lastBeat < 15000.',
    techniques: ['mqtt', 'hold'],
    sequences: [
      {
        name: 'Online for 15 s after a heartbeat',
        steps: [
          ['Starts offline', {}, 1000, [0]],
          send('Heartbeat arrives', 'quest/station/heartbeat', 'station-1', 200, [1]),
          ['14.8 s later', {}, 14800, [1]],
          ['15 s later', {}, 200, [0]],
        ],
      },
    ],
    solution: {
      state: { lastSeen: 0, lastBeat: 0, online: 0 },
      setup: 'mqttConnect("dashboard-led");\nmqttSubscribe("quest/station/heartbeat");',
      loop: `
if (mqttLastDelivery() != lastSeen) {
  lastSeen = mqttLastDelivery();
  lastBeat = millis();
  online = 1;
}
if (online == 1 && millis() - lastBeat >= 15000) {
  online = 0;
}
write(green, online);`,
    },
    advanced: {
      goal: 'Only heartbeats whose message is station-1 count. Heartbeats from other stations are ignored, so they cannot keep this one online.',
      hint: 'When a message arrives, read it and only refresh the time if it equals "station-1".',
      sequences: [
        {
          name: 'Only station-1 counts',
          steps: [
            ['Connecting', {}, 1000, null],
            send('station-2 heartbeat', 'quest/station/heartbeat', 'station-2', 1000, [0]),
            send('station-1 heartbeat', 'quest/station/heartbeat', 'station-1', 200, [1]),
            ['14.8 s later', {}, 14800, [1]],
            send('station-2 at 15 s', 'quest/station/heartbeat', 'station-2', 200, [0]),
            send('station-1 again', 'quest/station/heartbeat', 'station-1', 200, [1]),
          ],
        },
      ],
      solution: {
        state: { lastSeen: 0, lastBeat: 0, online: 0, message: '""' },
        setup: 'mqttConnect("dashboard-led");\nmqttSubscribe("quest/station/heartbeat");',
        loop: `
if (mqttLastDelivery() != lastSeen) {
  lastSeen = mqttLastDelivery();
  message = mqttRead("quest/station/heartbeat");
  if (message == "station-1") {
    lastBeat = millis();
    online = 1;
  }
}
if (online == 1 && millis() - lastBeat >= 15000) {
  online = 0;
}
write(green, online);`,
      },
    },
  }),
  quest(84, home('Garden path'), {
    title: 'Reconnect Without Freezing',
    quote: 'When the Wi-Fi drops, the path lights must still work.',
    goal: 'Connect to the broker in setup. Whatever the network does, light the path lights when the light reading is below 1800 and switch them off at 1800 or above.',
    ids: ['ldr', 'led'],
    learn: ['Non-blocking code', 'Local control'],
    hint: 'Never wait for the network in the loop: the light rule runs on every pass.',
    techniques: ['mqtt'],
    sequences: [
      {
        name: 'Local control during an outage',
        steps: [
          ['Connected, dark', { light: A(1000) }, 1000, [1]],
          { label: 'Network down, still dark', network: false, ms: 1000, expect: [1] },
          ['Daylight during the outage', { light: A(1800) }, 200, [0]],
          ['Dark again', { light: A(1799) }, 200, [1]],
        ],
      },
    ],
    solution: {
      state: {},
      setup: 'mqttConnect("path");',
      loop: `
write(led, light < 1800);`,
    },
    advanced: {
      goal: 'While disconnected, try to reconnect 1, 3, 7, 15 and 31 seconds after the network was found down, then every 30 seconds. A successful reconnect starts the schedule again for the next outage. Keep the lights responsive throughout.',
      hint: 'Note when the outage was first seen and the next try time; after each failed try move to the next gap (2, 4, 8, 16 s, then 30 s).',
      techniques: ['mqtt', 'phases'],
      sequences: [
        {
          name: 'Retry schedule',
          steps: [
            ['Connected', {}, 2000, null],
            {
              label: 'Network down for 100 s',
              network: false,
              env: { light: A(1000) },
              ms: 100000,
              expect: [1],
              check: (ctx) => retries(ctx, 2200, [1, 3, 7, 15, 31, 61, 91]),
            },
            {
              label: 'Network back',
              network: true,
              ms: 22000,
              check: (ctx) => retries(ctx, 2200, [1, 3, 7, 15, 31, 61, 91, 121]),
            },
            {
              label: 'A second outage starts the schedule again',
              network: false,
              ms: 4000,
              check: (ctx) => retries(ctx, 2200, [1, 3, 7, 15, 31, 61, 91, 121], 124200, [1, 3]),
            },
          ],
        },
      ],
      solution: {
        state: { downSince: 0, nextTry: 0, tries: 0 },
        setup: 'mqttConnect("path");',
        loop: `
if (!mqttConnected()) {
  if (downSince == 0) {
    downSince = millis();
    tries = 0;
    nextTry = 1000;
  }
  if (millis() - downSince >= nextTry) {
    if (mqttReconnect()) {
      downSince = 0;
    } else {
      tries = tries + 1;
      if (tries == 1) {
        nextTry = 3000;
      } else if (tries == 2) {
        nextTry = 7000;
      } else if (tries == 3) {
        nextTry = 15000;
      } else if (tries == 4) {
        nextTry = 31000;
      } else {
        nextTry = nextTry + 30000;
      }
    }
  }
}
write(led, light < 1800);`,
      },
    },
  }),
  quest(85, home('Entrance'), {
    title: 'Stale Remote Command',
    quote: 'Open the gate from the dashboard for deliveries.',
    goal: 'Subscribe to quest/gate/command. OPEN opens the gate, CLOSE closes it, and any other message is ignored. The gate starts closed.',
    ids: ['gate'],
    learn: ['MQTT', 'Commands'],
    hint: 'Compare the latest message with "OPEN" and "CLOSE".',
    techniques: ['mqtt'],
    sequences: [
      {
        name: 'Open and close commands',
        steps: [
          ['Starts closed', {}, 1000, [0]],
          send('OPEN', 'quest/gate/command', 'OPEN', 400, [1]),
          send('WAVE', 'quest/gate/command', 'WAVE', 400, [1]),
          send('CLOSE', 'quest/gate/command', 'CLOSE', 400, [0]),
        ],
      },
    ],
    solution: {
      state: { open: 0, message: '""' },
      setup: 'mqttConnect("gate");\nmqttSubscribe("quest/gate/command");',
      loop: `
message = mqttRead("quest/gate/command");
if (message == "OPEN") {
  open = 1;
} else if (message == "CLOSE") {
  open = 0;
}
write(gate, open);`,
    },
    advanced: {
      goal: 'Commands now arrive as JSON, such as {"command":"OPEN","sequence":4}. An OPEN keeps the gate open for 5 seconds after it is accepted, and each newer OPEN restarts the 5 seconds. Ignore any sequence number not greater than the last accepted one (replays). Losing the network closes the gate at once.',
      hint: 'Use jsonField(message, "command") and jsonField(message, "sequence"). Accept only when the sequence is greater than the last accepted.',
      techniques: ['mqtt', 'validate', 'hold'],
      sequences: [
        {
          name: 'OPEN lasts 5 s and replays are ignored',
          steps: [
            ['Connecting', {}, 1000, null],
            send(
              'OPEN, sequence 1',
              'quest/gate/command',
              json({ command: 'OPEN', sequence: 1 }),
              200,
              [1],
            ),
            ['4.8 s later', {}, 4800, [1]],
            ['5 s later', {}, 200, [0]],
            send('OPEN 2', 'quest/gate/command', json({ command: 'OPEN', sequence: 2 }), 3000, [1]),
            send('OPEN 3', 'quest/gate/command', json({ command: 'OPEN', sequence: 3 }), 3000, [1]),
            ['5 s after OPEN 3', {}, 2200, [0]],
            send(
              'Replay of OPEN 3',
              'quest/gate/command',
              json({ command: 'OPEN', sequence: 3 }),
              1000,
              [0],
            ),
            send(
              'Old OPEN 2',
              'quest/gate/command',
              json({ command: 'OPEN', sequence: 2 }),
              1000,
              [0],
            ),
          ],
        },
        {
          name: 'Losing the network closes it',
          steps: [
            ['Connecting', {}, 1000, null],
            send('OPEN', 'quest/gate/command', json({ command: 'OPEN', sequence: 7 }), 400, [1]),
            { label: 'Network down', network: false, ms: 200, expect: [0] },
            { label: 'Network back', network: true, ms: 1000, expect: [0] },
          ],
        },
      ],
      solution: {
        state: { open: 0, openedAt: 0, lastSeen: 0, lastSeq: -1, seq: 0, message: '""', cmd: '""' },
        setup: 'mqttConnect("gate");\nmqttSubscribe("quest/gate/command");',
        loop: `
if (!mqttConnected()) {
  open = 0;
  if (mqttReconnect()) {
    mqttSubscribe("quest/gate/command");
    lastSeen = mqttLastDelivery();
  }
} else if (mqttLastDelivery() != lastSeen) {
  lastSeen = mqttLastDelivery();
  message = mqttRead("quest/gate/command");
  cmd = jsonField(message, "command");
  seq = jsonField(message, "sequence");
  if (seq > lastSeq) {
    if (cmd == "OPEN") {
      open = 1;
      openedAt = millis();
      lastSeq = seq;
    } else if (cmd == "CLOSE") {
      open = 0;
      lastSeq = seq;
    }
  }
}
if (open == 1 && millis() - openedAt >= 5000) {
  open = 0;
}
write(gate, open);`,
      },
    },
  }),
  quest(86, home('Garden path'), {
    title: 'Find the Wrong Pin',
    quote: 'The path lights stopped working after someone tidied the wiring.',
    goal: 'The program declares the path lights on the wrong GPIO pin. Compare it with the Wiring tab, fix the pin, and keep the rule: on below a light reading of 1800, off at 1800 or above.',
    ids: ['ldr', 'led'],
    conditions: ['light < 1800'],
    learn: ['Fault finding', 'Pin mapping'],
    hint: 'Open Wiring: which GPIO is the path light really on? Change only that number.',
    scenarios: [
      ['Dark', { light: 10 }, [1]],
      ['Bright', { light: 80 }, [0]],
      ['1800', { light: A(1800) }, [0]],
    ],
    starter: null,
    advanced: {
      ids: ['ldr', 'pir', 'led', 'porch'],
      conditions: ['light < 1800', 'motion == 1'],
      goal: 'Now the path lights are declared on the porch light’s pin, so both outputs fight over one GPIO. Give the path lights their own pin from the Wiring tab, without changing the porch light or the rules.',
      hint: 'Two outputs must never share a GPIO. Check both declarations against Wiring.',
      scenarios: [
        ['Dark and quiet', { light: 10, motion: 0 }, [1, 0]],
        ['Bright, someone there', { light: 80, motion: 1 }, [0, 1]],
        ['Dark, someone there', { light: 10, motion: 1 }, [1, 1]],
      ],
    },
  }),
  quest(87, home('Entrance'), {
    title: 'Repair the Missing Ground',
    quote: 'The porch light ignores people walking up. The installer left in a hurry.',
    goal: 'The devices are already installed, but one connection is missing. Find it in Wiring and connect it, then make the porch light follow the motion sensor.',
    ids: ['pir', 'porch'],
    conditions: ['motion == 1'],
    learn: ['Wiring checks', 'Power and ground'],
    hint: 'Every device needs 3.3 V and GND. Wiring lists what is not connected.',
    scenarios: [
      ['Someone there', { motion: 1 }, [1]],
      ['Nobody', { motion: 0 }, [0]],
    ],
    prewired: null,
    advanced: {
      ids: ['pir', 'ldr', 'porch', 'led'],
      conditions: ['motion == 1', 'light < 1800'],
      goal: 'This time there is a missing ground and a pin conflict: the light sensor is on a pin that cannot read analogue values, and the path lights share the porch light’s pin. Fix the wiring so the board’s pin rules pass, then program both rules.',
      hint: 'Analogue sensors need an ADC pin; outputs need their own pins. Connect recommended circuit shows a valid layout.',
      scenarios: [
        ['Someone there, bright', { motion: 1, light: 80 }, [1, 0]],
        ['Nobody, dark', { motion: 0, light: 10 }, [0, 1]],
      ],
    },
  }),
  quest(88, home('Bedroom'), {
    ...q88,
    quote: 'My night light stays on at dusk when it should not. Can you find the bug?',
    goal: 'The program has a threshold bug. Fix it so the night light (path lights) is on below a light reading of 1800 and off at 1800 or above.',
    learn: ['Fault finding', '< and <='],
    hint: 'Test 1799, 1800 and 1801. Which comparison makes exactly 1800 count as dark?',
    scenarios: [
      ['1799', { light: A(1799) }, [1]],
      ['1800', { light: A(1800) }, [0]],
      ['1801', { light: A(1801) }, [0]],
    ],
    starter: null,
    advanced: {
      goal: 'This program has the same threshold bug and also never switches the light off again once it is on. Fix both, so the light follows the reading from dark to bright and back. Then answer the Check your understanding questions about < and <=.',
      hint: 'A light that never switches off needs an else.',
      scenarios: [
        ['1799', { light: A(1799) }, [1]],
        ['1800', { light: A(1800) }, [0]],
        ['Dark', { light: 5 }, [1]],
        ['Bright', { light: 90 }, [0]],
      ],
    },
  }),
  quest(89, home('Kitchen'), {
    title: 'Frozen Sensor Recovery',
    quote: 'The kitchen fan acted on a frozen temperature reading for an hour.',
    goal: 'The data age is the number of seconds since the last reading. At 5 s or older the reading is stale: keep the fan off and light the fault indicator. With fresh data, run the fan above 27 °C.',
    ids: ['temp', 'dataAge', 'fan', 'faultLed'],
    conditions: ['dataAge < 5 && temp > 27', 'dataAge >= 5'],
    learn: ['Stale data', 'Fail-safe outputs'],
    hint: 'Fan: dataAge < 5 && temp > 27. Fault: dataAge >= 5.',
    techniques: ['validate'],
    scenarios: [
      ['4.9 s old, hot', { dataAge: 4.9, temp: 30 }, [1, 0]],
      ['5 s old, hot', { dataAge: 5, temp: 30 }, [0, 1]],
      ['Fresh, cool', { dataAge: 0, temp: 20 }, [0, 0]],
    ],
    advanced: {
      ids: ['temp', 'dataAge', 'dataOk', 'fan', 'faultLed'],
      goal: 'Start in fault. Only recover after two fresh, valid samples in a row (a new sample arrives when the data age drops back towards 0; the data valid flag says whether it is valid). An invalid sample, or stale data, starts the count again.',
      hint: 'A new sample: dataAge is lower than last pass. Count valid ones (up to 2), reset the count on an invalid one or at dataAge >= 5. Healthy means count >= 2.',
      techniques: ['validate', 'counter'],
      sequences: [
        {
          name: 'Two good samples to recover',
          env: { temp: 30, dataOk: 1 },
          steps: [
            ['First sample at start', { dataAge: 0 }, 200, [0, 1]],
            ['Ageing', { dataAge: 1 }, 800, [0, 1]],
            ['Second good sample', { dataAge: 0 }, 200, [1, 0]],
            ['Goes stale', { dataAge: 5 }, 200, [0, 1]],
            ['Good sample', { dataAge: 0 }, 200, [0, 1]],
            ['Ageing', { dataAge: 1 }, 200, [0, 1]],
            ['Invalid sample', { dataAge: 0, dataOk: 0 }, 200, [0, 1]],
            ['Ageing', { dataAge: 1, dataOk: 1 }, 200, [0, 1]],
            ['Good sample', { dataAge: 0 }, 200, [0, 1]],
            ['Ageing', { dataAge: 1 }, 200, [0, 1]],
            ['Second good sample in a row', { dataAge: 0 }, 200, [1, 0]],
          ],
        },
      ],
      solution: {
        state: { prevAge: 100000, good: 0 },
        loop: `
if (dataAge < prevAge) {
  if (dataOk == 1) {
    if (good < 2) {
      good = good + 1;
    }
  } else {
    good = 0;
  }
}
prevAge = dataAge;
if (dataAge >= 5) {
  good = 0;
}
write(fan, good >= 2 && temp > 27);
write(faultLed, good < 2);`,
      },
    },
  }),
  quest(90, home('Entrance'), {
    title: 'Noisy Motion Signal',
    quote: 'The porch light flickers when the wind shakes the bushes.',
    goal: 'Only light the porch light once the motion sensor has stayed HIGH for 100 ms without a break. A LOW switches it off at once.',
    ids: ['pir', 'porch'],
    learn: ['Debouncing', 'Short timers'],
    hint: 'Note when motion became HIGH; switch on once 100 ms have passed. Check often: use a delay of 10 ms or so.',
    techniques: ['duration'],
    sequences: [
      {
        name: 'A blip is ignored',
        tick: 50,
        steps: [
          ['Quiet', {}, 500, [0]],
          ['HIGH for 50 ms', { motion: 1 }, 100, [0]],
          ['HIGH for 100 ms', {}, 50, [1]],
          ['LOW', { motion: 0 }, 50, [0]],
        ],
      },
    ],
    solution: {
      delay: 10,
      state: { highSince: 0, on: 0 },
      loop: `
if (motion == 1) {
  if (highSince == 0) {
    highSince = millis();
  }
  if (millis() - highSince >= 100) {
    on = 1;
  }
} else {
  highSince = 0;
  on = 0;
}
write(porch, on);`,
    },
    advanced: {
      goal: 'Switching off needs a steady LOW too: 200 ms of LOW without a break. Any HIGH during that time cancels the switch-off. It starts off.',
      hint: 'Mirror the switch-on timer: note when LOW began and switch off once it has lasted 200 ms; a HIGH clears it.',
      sequences: [
        {
          name: 'Steady LOW to switch off',
          tick: 50,
          steps: [
            ['Movement', { motion: 1 }, 500, [1]],
            ['LOW for 150 ms', { motion: 0 }, 200, [1]],
            ['LOW for 200 ms', {}, 50, [0]],
          ],
        },
        {
          name: 'A brief LOW does not switch off',
          tick: 50,
          steps: [
            ['Movement', { motion: 1 }, 500, [1]],
            ['LOW for 100 ms', { motion: 0 }, 100, [1]],
            ['HIGH again', { motion: 1 }, 50, [1]],
            ['Still on 300 ms later', {}, 300, [1]],
          ],
        },
      ],
      solution: {
        delay: 10,
        state: { highSince: 0, lowSince: 0, on: 0 },
        loop: `
if (motion == 1) {
  lowSince = 0;
  if (highSince == 0) {
    highSince = millis();
  }
  if (millis() - highSince >= 100) {
    on = 1;
  }
} else {
  highSince = 0;
  if (lowSince == 0) {
    lowSince = millis();
  }
  if (millis() - lowSince >= 200) {
    on = 0;
  }
}
write(porch, on);`,
      },
    },
  }),
  quest(91, home('Garage'), {
    title: 'Armed Door Alarm',
    quote: 'Sound the alarm if someone opens the garage while it is armed.',
    goal: 'Sound the buzzer when the door contact is HIGH (open) and the arm button reads HIGH (armed).',
    ids: ['door', 'button', 'buzzer'],
    conditions: ['door == 1 && armed == 1'],
    learn: ['AND logic', 'Security'],
    hint: 'door == 1 && armed == 1.',
    scenarios: [
      ['Closed, armed', { door: 0, armed: 1 }, [0]],
      ['Open, armed', { door: 1, armed: 1 }, [1]],
      ['Open, disarmed', { door: 1, armed: 0 }, [0]],
    ],
    advanced: {
      goal: 'An intrusion latches the alarm: closing the door does not silence it, only disarming does. Arming again with the door closed is quiet; arming with the door open sounds the alarm.',
      hint: 'Latch alarm = 1 on door == 1 && armed == 1; clear it whenever armed == 0.',
      techniques: ['latch'],
      sequences: [
        {
          name: 'The alarm stays on until disarmed',
          steps: [
            ['Armed, closed', { armed: 1, door: 0 }, 1000, [0]],
            ['Door opened', { door: 1 }, 200, [1]],
            ['Door closed again', { door: 0 }, 1000, [1]],
            ['Disarmed', { armed: 0 }, 200, [0]],
            ['Armed again, closed', { armed: 1 }, 1000, [0]],
          ],
        },
        {
          name: 'Arming with the door open',
          steps: [
            ['Disarmed, door open', { armed: 0, door: 1 }, 1000, [0]],
            ['Armed', { armed: 1 }, 200, [1]],
          ],
        },
      ],
      solution: {
        state: { alarm: 0 },
        loop: `
if (door == 1 && armed == 1) {
  alarm = 1;
}
if (armed == 0) {
  alarm = 0;
}
write(buzzer, alarm);`,
      },
    },
  }),
  quest(92, town('police', 'Police station'), {
    title: 'Authorised Locker Access',
    quote: 'The equipment locker opens with an access token sent from the front desk.',
    goal: 'Subscribe to quest/locker/token. Only the token DEMO-42 unlocks the locker (gate HIGH), for 5 seconds. Any other token is rejected. It starts locked.',
    ids: ['gate'],
    learn: ['MQTT', 'Authorisation', 'Timers'],
    hint: 'When a message arrives (mqttLastDelivery changes), compare it with "DEMO-42" and unlock for 5000 ms.',
    techniques: ['mqtt', 'hold'],
    sequences: [
      {
        name: 'Only DEMO-42',
        steps: [
          ['Locked at start', {}, 1000, [0]],
          send('Wrong token', 'quest/locker/token', 'DEMO-41', 1000, [0]),
          send('DEMO-42', 'quest/locker/token', 'DEMO-42', 200, [1]),
          ['4.8 s later', {}, 4800, [1]],
          ['5 s later', {}, 200, [0]],
        ],
      },
    ],
    solution: {
      state: { seen: 0, unlocked: 0, openedAt: 0, token: '""' },
      setup: 'mqttConnect("locker");\nmqttSubscribe("quest/locker/token");',
      loop: `
if (mqttLastDelivery() != seen) {
  seen = mqttLastDelivery();
  token = mqttRead("quest/locker/token");
  if (token == "DEMO-42") {
    unlocked = 1;
    openedAt = millis();
  }
}
if (unlocked == 1 && millis() - openedAt >= 5000) {
  unlocked = 0;
}
write(gate, unlocked);`,
    },
    advanced: {
      ids: ['gate', 'red'],
      goal: 'After 3 wrong tokens in a row, block all tokens for 30 seconds and light the red indicator. Tokens during the block neither unlock nor extend it. A correct token resets the count of wrong ones.',
      hint: 'Count failures; at 3 start a 30-second block. Ignore tokens while blocked.',
      techniques: ['mqtt', 'counter', 'hold'],
      sequences: [
        {
          name: 'Three wrong tokens block for 30 s',
          steps: [
            ['Connecting', {}, 1000, null],
            send('Wrong 1', 'quest/locker/token', 'A', 200, [0, 0]),
            send('Wrong 2', 'quest/locker/token', 'B', 200, [0, 0]),
            send('Wrong 3', 'quest/locker/token', 'C', 200, [0, 1]),
            ['Waiting', {}, 28600, [0, 1]],
            send('DEMO-42 at 28.8 s', 'quest/locker/token', 'DEMO-42', 1200, [0, 1]),
            send('DEMO-42 at 30 s', 'quest/locker/token', 'DEMO-42', 200, [1, 0]),
          ],
        },
        {
          name: 'A correct token resets the count',
          steps: [
            ['Connecting', {}, 1000, null],
            send('Wrong 1', 'quest/locker/token', 'A', 200, [0, 0]),
            send('Wrong 2', 'quest/locker/token', 'B', 200, [0, 0]),
            send('DEMO-42', 'quest/locker/token', 'DEMO-42', 200, [1, 0]),
            send('Wrong 3', 'quest/locker/token', 'C', 200, [1, 0]),
          ],
        },
      ],
      solution: {
        state: {
          seen: 0,
          unlocked: 0,
          openedAt: 0,
          fails: 0,
          blocked: 0,
          blockedAt: 0,
          token: '""',
        },
        setup: 'mqttConnect("locker");\nmqttSubscribe("quest/locker/token");',
        loop: `
if (blocked == 1 && millis() - blockedAt >= 30000) {
  blocked = 0;
  fails = 0;
}
if (mqttLastDelivery() != seen) {
  seen = mqttLastDelivery();
  token = mqttRead("quest/locker/token");
  if (blocked == 0) {
    if (token == "DEMO-42") {
      unlocked = 1;
      openedAt = millis();
      fails = 0;
    } else {
      fails = fails + 1;
      if (fails >= 3) {
        blocked = 1;
        blockedAt = millis();
      }
    }
  }
}
if (unlocked == 1 && millis() - openedAt >= 5000) {
  unlocked = 0;
}
write(gate, unlocked);
write(red, blocked);`,
      },
    },
  }),
  quest(93, town('office', 'Business office'), {
    title: 'Private Occupancy Dashboard',
    quote: 'Show whether the meeting room is in use, without tracking anyone.',
    goal: 'Publish occupied or unoccupied to quest/office/status whenever presence changes (and once at the start). Send nothing else: no names, ids or times.',
    ids: ['occupancy'],
    learn: ['Privacy', 'MQTT', 'Data minimisation'],
    hint: 'Remember the last status you sent and publish only when it changes.',
    techniques: ['mqtt'],
    sequences: [
      {
        name: 'Status only',
        tick: 1000,
        steps: [
          {
            label: 'Start',
            env: { occupied: 0 },
            ms: 2000,
            check: published('quest/office/status', 1, 'unoccupied'),
          },
          {
            label: 'Someone arrives',
            env: { occupied: 1 },
            ms: 2000,
            check: published('quest/office/status', 1, 'occupied'),
          },
          {
            label: 'They leave',
            env: { occupied: 0 },
            ms: 2000,
            check: (ctx) =>
              ctx.publishes.every((m) => ['occupied', 'unoccupied'].includes(String(m.payload))) ||
              'publish only occupied or unoccupied.',
          },
        ],
      },
    ],
    solution: {
      state: { lastStatus: -1 },
      setup: 'mqttConnect("office");',
      loop: `
if (occupied != lastStatus) {
  if (occupied == 1) {
    mqttPublish("quest/office/status", "occupied");
  } else {
    mqttPublish("quest/office/status", "unoccupied");
  }
  lastStatus = occupied;
}`,
    },
    advanced: {
      goal: 'Instead of every change, keep only totals: add up the seconds the room is occupied in each minute, keep the last 5 minutes, and at the end of each minute publish the occupied seconds over those 5 minutes to quest/office/minutes. Keep no individual arrival or departure times.',
      hint: 'Accumulate occupied milliseconds for the current minute. Each minute shift five bucket variables along, publish their sum in seconds, and start a new bucket.',
      techniques: ['average', 'mqtt'],
      sequences: [
        {
          name: 'Five-minute totals',
          tick: 1000,
          steps: [
            ...Array.from({ length: 6 }, (_, i) => [
              ['Minute ' + (i + 1) + ': in use for 30 s', { occupied: 1 }, 30000, null],
              {
                label: 'Minute ' + (i + 1) + ': empty for 30 s',
                env: { occupied: 0 },
                ms: 30000,
                check:
                  i === 5
                    ? (ctx) => {
                        const sums = ctx.publishes
                          .filter((m) => m.topic === 'quest/office/minutes')
                          .map((m) => Number(m.payload));
                        return (
                          (sums.length >= 5 && Math.abs(sums.at(-1) - 150) <= 5) ||
                          'after 6 minutes the 5-minute total should be about 150 s, but the messages were ' +
                            (sums.join(', ') || 'none') +
                            '.'
                        );
                      }
                    : null,
              },
            ]).flat(),
          ],
        },
      ],
      solution: {
        state: { bucketStart: 0, current: 0, last: 0, b0: 0, b1: 0, b2: 0, b3: 0, b4: 0 },
        setup: 'mqttConnect("office");',
        loop: `
if (bucketStart == 0) {
  bucketStart = millis();
  last = millis();
}
if (occupied == 1) {
  current = current + (millis() - last);
}
last = millis();
if (millis() - bucketStart >= 60000) {
  b4 = b3;
  b3 = b2;
  b2 = b1;
  b1 = b0;
  b0 = idiv(current, 1000);
  current = 0;
  bucketStart = bucketStart + 60000;
  mqttPublish("quest/office/minutes", b0 + b1 + b2 + b3 + b4);
}`,
      },
    },
  }),
  quest(94, home('Bedroom'), {
    title: 'Reject Untrusted Commands',
    quote: 'Anyone on the network can send my lamp a message. Make it fussy.',
    goal: 'Subscribe to quest/lamp-1/set. Accept only a JSON object with exactly one field, command, that is ON or OFF, such as {"command":"ON"}. Ignore everything else: bad JSON, extra fields or other words.',
    ids: ['led'],
    learn: ['Input validation', 'JSON', 'Security'],
    hint: 'jsonFieldCount(message) must be 1, and jsonField(message, "command") must be "ON" or "OFF".',
    techniques: ['mqtt', 'validate'],
    sequences: [
      {
        name: 'Only well-formed commands',
        steps: [
          ['Connecting', {}, 1000, null],
          send('Valid ON', 'quest/lamp-1/set', json({ command: 'ON' }), 400, [1]),
          send('Not JSON', 'quest/lamp-1/set', 'OFF please', 400, [1]),
          send(
            'Extra field',
            'quest/lamp-1/set',
            json({ command: 'OFF', from: 'stranger' }),
            400,
            [1],
          ),
          send('A list', 'quest/lamp-1/set', json(['OFF']), 400, [1]),
          send('Lower case', 'quest/lamp-1/set', json({ command: 'off' }), 400, [1]),
          send('Valid OFF', 'quest/lamp-1/set', json({ command: 'OFF' }), 400, [0]),
        ],
      },
    ],
    solution: {
      state: { lamp: 0, lastSeen: 0, message: '""', cmd: '""' },
      setup: 'mqttConnect("lamp-1");\nmqttSubscribe("quest/lamp-1/set");',
      loop: `
if (mqttLastDelivery() != lastSeen) {
  lastSeen = mqttLastDelivery();
  message = mqttRead("quest/lamp-1/set");
  if (jsonFieldCount(message) == 1) {
    cmd = jsonField(message, "command");
    if (cmd == "ON") {
      lamp = 1;
    } else if (cmd == "OFF") {
      lamp = 0;
    }
  }
}
write(led, lamp);`,
    },
    advanced: {
      goal: 'Require exactly three fields: command (ON or OFF), device (lamp-1) and sequence, a whole number of 0 or more that is greater than the last accepted one. The first accepted sequence can be 0.',
      hint: 'Check jsonFieldCount is 3, the device, the command, that the sequence is a whole number (isWhole) and that it is greater than lastSeq (starting at -1).',
      sequences: [
        {
          name: 'Device, command and a rising sequence',
          steps: [
            ['Connecting', {}, 1000, null],
            send(
              'ON, sequence 0',
              'quest/lamp-1/set',
              json({ command: 'ON', device: 'lamp-1', sequence: 0 }),
              400,
              [1],
            ),
            send(
              'Repeat of sequence 0',
              'quest/lamp-1/set',
              json({ command: 'OFF', device: 'lamp-1', sequence: 0 }),
              400,
              [1],
            ),
            send(
              'OFF, sequence 2',
              'quest/lamp-1/set',
              json({ command: 'OFF', device: 'lamp-1', sequence: 2 }),
              400,
              [0],
            ),
            send(
              'Out of order: sequence 1',
              'quest/lamp-1/set',
              json({ command: 'ON', device: 'lamp-1', sequence: 1 }),
              400,
              [0],
            ),
            send(
              'Wrong device',
              'quest/lamp-1/set',
              json({ command: 'ON', device: 'lamp-2', sequence: 3 }),
              400,
              [0],
            ),
            send(
              'Sequence 3.5',
              'quest/lamp-1/set',
              json({ command: 'ON', device: 'lamp-1', sequence: 3.5 }),
              400,
              [0],
            ),
            send(
              'A fourth field',
              'quest/lamp-1/set',
              json({ command: 'ON', device: 'lamp-1', sequence: 4, extra: 1 }),
              400,
              [0],
            ),
            send(
              'ON, sequence 3',
              'quest/lamp-1/set',
              json({ command: 'ON', device: 'lamp-1', sequence: 3 }),
              400,
              [1],
            ),
          ],
        },
      ],
      solution: {
        state: { lamp: 0, lastSeen: 0, lastSeq: -1, seq: '0.0', message: '""', cmd: '""' },
        setup: 'mqttConnect("lamp-1");\nmqttSubscribe("quest/lamp-1/set");',
        loop: `
if (mqttLastDelivery() != lastSeen) {
  lastSeen = mqttLastDelivery();
  message = mqttRead("quest/lamp-1/set");
  if (jsonFieldCount(message) == 3 && jsonField(message, "device") == "lamp-1") {
    cmd = jsonField(message, "command");
    seq = jsonField(message, "sequence");
    if (isWhole(seq) && seq > lastSeq) {
      if (cmd == "ON") {
        lamp = 1;
        lastSeq = seq;
      } else if (cmd == "OFF") {
        lamp = 0;
        lastSeq = seq;
      }
    }
  }
}
write(led, lamp);`,
      },
    },
  }),
  quest(95, home('Water tank'), {
    title: 'Safe Restart',
    quote: 'After a power cut the pump started by itself and flooded the garden.',
    goal: 'The pump starts off. It only starts on a new request (the arm switch going from LOW to HIGH) while the tank is above 400. A request held from the start does not count. Switching the request LOW stops it.',
    ids: ['button', 'level', 'pump'],
    learn: ['Edges', 'Safe start-up'],
    hint: 'Start with the previous request as 1, so a switch already on at power-up is not a new request.',
    techniques: ['edge'],
    sequences: [
      {
        name: 'A held request does not start it',
        env: { armed: 1, tank: 90 },
        steps: [
          ['Request held from the start', {}, 1000, [0]],
          ['Request off', { armed: 0 }, 200, [0]],
          ['Request on', { armed: 1 }, 200, [1]],
          ['Request off', { armed: 0 }, 200, [0]],
        ],
      },
    ],
    solution: {
      state: { prev: 1, running: 0 },
      loop: `
if (armed == 1 && prev == 0 && tank > 400) {
  running = 1;
}
if (armed == 0 || tank <= 400) {
  running = 0;
}
prev = armed;
write(pump, running);`,
    },
    advanced: {
      goal: 'The same after a restart or after the tank reserve stops the pump: it needs the request switched LOW and then HIGH again, even when the water comes back.',
      hint: 'The reserve stop already clears running; a held request is never a new one.',
      sequences: [
        {
          name: 'After a restart',
          env: { tank: 90 },
          steps: [
            ['Request off', { armed: 0 }, 200, [0]],
            ['Request on', { armed: 1 }, 1000, [1]],
            { label: 'Power cut and restart', restart: true, ms: 1000, expect: [0] },
            ['Request off', { armed: 0 }, 200, [0]],
            ['Request on', { armed: 1 }, 200, [1]],
          ],
        },
        {
          name: 'After the tank reserve trips',
          env: { tank: 90 },
          steps: [
            ['Request off', { armed: 0 }, 200, [0]],
            ['Request on', { armed: 1 }, 1000, [1]],
            ['Tank at 400', { tank: A(400) }, 200, [0]],
            ['Tank refilled', { tank: 90 }, 1000, [0]],
            ['Request off', { armed: 0 }, 200, [0]],
            ['Request on', { armed: 1 }, 200, [1]],
          ],
        },
      ],
    },
  }),
  quest(96, home('Greenhouse'), {
    title: 'One-Day Sensor Diary',
    quote: 'Keep a diary of the greenhouse temperature so I can see the coldest and hottest.',
    goal: 'Every 60 seconds print a record "seconds,temperature" (the first at 60 s). After each record print min,<lowest> and max,<highest> of the records so far.',
    ids: ['temp'],
    learn: ['Logging', 'Minimum and maximum'],
    hint: 'Keep low and high variables, starting far outside the range, and update them with each record.',
    techniques: ['log'],
    sequences: [
      {
        name: 'Records every minute',
        tick: 1000,
        steps: [
          {
            label: '59 s',
            env: { temp: 20 },
            ms: 59000,
            check: (ctx) => ctx.logs.length === 0 || 'nothing should be printed before 60 s.',
          },
          {
            label: '60 s',
            ms: 1000,
            check: (ctx) => diary(ctx, ['60,20', 'min,20', 'max,20']),
          },
          {
            label: '120 s, warmer',
            env: { temp: 25 },
            ms: 60000,
            check: (ctx) => diary(ctx, ['120,25', 'min,20', 'max,25']),
          },
        ],
      },
    ],
    solution: {
      delay: 1000,
      state: { lastLog: 0, low: '1000.0', high: '-1000.0' },
      loop: `
if (millis() - lastLog >= 60000) {
  lastLog = lastLog + 60000;
  if (temp < low) {
    low = temp;
  }
  if (temp > high) {
    high = temp;
  }
  csv(idiv(lastLog, 1000), temp);
  csv("min", low);
  csv("max", high);
}`,
    },
    advanced: {
      ids: ['temp', 'dataOk'],
      goal: 'Start by printing the header timestamp,temperature_c. When a sample is missing (data valid flag LOW) print the record with a blank temperature, such as 120, and leave it out of the statistics. Also print mean,<average> after max.',
      hint: 'Keep a total and a count of valid samples for the mean. For a blank record print the seconds followed by a comma.',
      sequences: [
        {
          name: 'Blanks are kept but not counted',
          tick: 1000,
          steps: [
            {
              label: 'Header',
              env: { temp: 20, dataOk: 1 },
              ms: 1000,
              check: (ctx) =>
                ctx.logs[0] === 'timestamp,temperature_c' ||
                'the first line should be timestamp,temperature_c.',
            },
            { label: '60 s: 20 °C', ms: 59000, check: (ctx) => diary(ctx, ['60,20']) },
            {
              label: '120 s: missing',
              env: { dataOk: 0 },
              ms: 60000,
              check: (ctx) => diary(ctx, ['120,']),
            },
            {
              label: '180 s: 30 °C',
              env: { dataOk: 1, temp: 30 },
              ms: 60000,
              check: (ctx) => diary(ctx, ['180,30', 'min,20', 'max,30', 'mean,25']),
            },
          ],
        },
      ],
      solution: {
        delay: 1000,
        state: { lastLog: 0, low: '1000.0', high: '-1000.0', total: '0.0', count: 0, started: 0 },
        loop: `
if (started == 0) {
  print("timestamp,temperature_c");
  started = 1;
}
if (millis() - lastLog >= 60000) {
  lastLog = lastLog + 60000;
  if (dataOk == 1) {
    if (temp < low) {
      low = temp;
    }
    if (temp > high) {
      high = temp;
    }
    total = total + temp;
    count = count + 1;
    csv(idiv(lastLog, 1000), temp);
  } else {
    csv(idiv(lastLog, 1000), "");
  }
  if (count > 0) {
    csv("min", low);
    csv("max", high);
    csv("mean", total / count);
  }
}`,
      },
    },
  }),
  quest(97, home('Entrance'), {
    title: 'Predict Then Test',
    quote: 'Before you test, tell me what you think will happen.',
    goal: 'Light the path lights below a light reading of 1800, the green indicator above 65 % humidity, and the amber indicator at 40 km/h of wind or more.',
    ids: ['ldr', 'humidity', 'wind', 'led', 'green', 'amber'],
    conditions: ['light < 1800', 'humidity > 65', 'wind >= 40'],
    learn: ['Independent outputs', 'Boundaries'],
    hint: 'Three separate rules; check each at its exact boundary.',
    scenarios: [
      ['All at their limits', { light: A(1800), humidity: 65, wind: 40 }, [0, 0, 1]],
      ['Dark, humid, calm', { light: 10, humidity: 80, wind: 5 }, [1, 1, 0]],
      ['Bright, dry, windy', { light: 90, humidity: 30, wind: 60 }, [0, 0, 1]],
    ],
    advanced: {
      goal: 'The same rules, but before the results are shown you must predict all three outputs at light 1800, humidity 65 % and wind 40 km/h. The prediction is scored on its own and never decides the tests.',
      hint: 'Work out each comparison at its boundary before you press Test.',
      predictFirst: {
        label: 'light 1800, humidity 65 %, wind 40 km/h',
        env: { light: A(1800), humidity: 65, wind: 40 },
      },
    },
  }),
  quest(98, home('Entrance'), {
    title: 'Smart Home Commissioning',
    quote: 'Hand over the entrance: path lights, porch light and fan, all on one controller.',
    goal: 'Path lights on below a light reading of 1800; porch light follows the motion sensor; fan on above 27 °C. Each output depends only on its own sensor.',
    ids: ['ldr', 'pir', 'temp', 'led', 'porch', 'fan'],
    conditions: ['light < 1800', 'motion == 1', 'temp > 27'],
    learn: ['System design', 'Independent outputs'],
    hint: 'Three if/else blocks. Changing one input must not change unrelated outputs.',
    scenarios: [
      ['Dark, someone there, hot', { light: 10, motion: 1, temp: 30 }, [1, 1, 1]],
      ['Only the temperature changes', { light: 10, motion: 1, temp: 22 }, [1, 1, 0]],
      ['Bright and quiet', { light: 90, motion: 0, temp: 22 }, [0, 0, 0]],
    ],
    advanced: {
      goal: 'For the handover: the fan uses two thresholds (on at 30 °C or above, off at 26 °C or below), and the porch light stays on for 10 s after the last movement. The path lights do not change. The fan and porch start off.',
      hint: 'Hysteresis for the fan, the hold pattern for the porch, a plain comparison for the path.',
      techniques: ['hysteresis', 'hold'],
      sequences: [
        {
          name: 'Fan with two thresholds',
          steps: [
            ['28 °C at start', { temp: 28 }, 1000, [null, 0, 0]],
            ['30 °C', { temp: 30 }, 1000, [null, 0, 1]],
            ['28 °C', { temp: 28 }, 1000, [null, 0, 1]],
            ['26 °C', { temp: 26 }, 1000, [null, 0, 0]],
          ],
        },
        {
          name: 'Porch holds for 10 s',
          steps: [
            ['Someone there', { motion: 1 }, 200, [null, 1, null]],
            ['9.8 s later', { motion: 0 }, 9800, [null, 1, null]],
            ['10 s later', {}, 200, [null, 0, null]],
          ],
        },
        {
          name: 'Path lights stay independent',
          steps: [
            ['Dark', { light: A(1799) }, 400, [1, null, null]],
            ['1800', { light: A(1800), motion: 1, temp: 35 }, 400, [0, 1, 1]],
          ],
        },
      ],
      solution: {
        state: { fanOn: 0, lastSeen: 0, porchOn: 0 },
        loop: `
if (temp >= 30) {
  fanOn = 1;
} else if (temp <= 26) {
  fanOn = 0;
}
if (motion == 1) {
  lastSeen = millis();
  porchOn = 1;
}
if (porchOn == 1 && millis() - lastSeen >= 10000) {
  porchOn = 0;
}
write(led, light < 1800);
write(porch, porchOn);
write(fan, fanOn);`,
      },
    },
  }),
  quest(99, town('office', 'Business office'), {
    title: 'Connected Community Challenge',
    quote: 'One controller for a house light, a shop sign and a garden: show us it all works.',
    goal: 'House light (path lights) on below a light reading of 1800. Shop sign (RGB light) on when the open switch (arm button) is HIGH and it is dark. Irrigation pump on when the soil reading is below 2400 and the tank reading is above 400.',
    ids: ['ldr', 'button', 'soil', 'level', 'led', 'rgb', 'pump'],
    conditions: ['light < 1800', 'armed == 1 && light < 1800', 'soil < 2400 && tank > 400'],
    learn: ['System design', 'Independent outputs'],
    hint: 'Three independent rules on one controller.',
    scenarios: [
      ['Dark, shop open, dry', { light: 10, armed: 1, soil: 10, tank: 90 }, [1, 1, 1]],
      ['Dark, shop closed', { light: 10, armed: 0, soil: 80, tank: 90 }, [1, 0, 0]],
      ['Bright, open, low tank', { light: 90, armed: 1, soil: 10, tank: A(400) }, [0, 0, 0]],
    ],
    advanced: {
      ids: ['ldr', 'button', 'soil', 'level', 'led', 'rgb', 'pump', 'amber'],
      goal: 'Report to the community dashboard: publish a state code (house light + 2 × sign + 4 × pump) to quest/community/state whenever it changes. If the network is down for 15 s or more, light amber to show the dashboard is stale, keep running the local rules, and on reconnecting publish the current state once, with no backlog.',
      hint: 'The local rules never wait for the network. Track when the outage started; after mqttReconnect() succeeds, publish once.',
      techniques: ['mqtt'],
      sequences: [
        {
          name: 'A 30 s outage',
          env: { light: A(1000), armed: 1, soil: 80, tank: 90 },
          steps: [
            {
              label: 'Connected',
              ms: 2000,
              expect: [1, 1, 0, 0],
              check: published('quest/community/state', 1, 3),
            },
            { label: 'Network down', network: false, ms: 200, expect: [1, 1, 0, 0] },
            ['14.6 s into the outage', {}, 14600, [1, 1, 0, 0]],
            ['15 s: stale', {}, 400, [1, 1, 0, 1]],
            ['Daylight during the outage', { light: A(3000) }, 14800, [0, 0, 0, 1]],
            {
              label: 'Network back',
              network: true,
              ms: 200,
              expect: [0, 0, 0, 0],
              check: published('quest/community/state', 1, 0),
            },
            { label: 'No backlog', ms: 2000, check: published('quest/community/state', 0) },
          ],
        },
      ],
      solution: {
        state: { home: 0, sign: 0, water: 0, code: 0, lastCode: -1, downSince: 0 },
        setup: 'mqttConnect("community");',
        loop: `
home = light < 1800;
sign = armed == 1 && light < 1800;
water = soil < 2400 && tank > 400;
code = home + sign * 2 + water * 4;
if (!mqttConnected()) {
  if (downSince == 0) {
    downSince = millis();
  }
  if (mqttReconnect()) {
    downSince = 0;
    mqttPublish("quest/community/state", code);
    lastCode = code;
  }
} else if (code != lastCode) {
  mqttPublish("quest/community/state", code);
  lastCode = code;
}
write(led, home);
write(rgb, sign);
write(pump, water);
write(amber, downSince != 0 && millis() - downSince >= 15000);`,
      },
    },
  }),
  quest(100, home('Living room'), {
    title: 'World Technician Final Expedition',
    quote: 'You have learned a lot. Show it on the road!',
    goal: 'Pass a lighting, an irrigation and a climate quest at three different destinations. Each pass keeps its wiring, code and test results as evidence. Then press Test your solution here.',
    ids: [],
    capstone: true,
    learn: ['Commissioning', 'Evidence'],
    hint: 'Lighting quests use lamps, irrigation quests water from soil readings, climate quests fans, air-conditioning or heaters.',
    scenarios: [],
    conditions: [],
    advanced: {
      goal: 'Also, somewhere on your travels: repair a wiring fault (Find the Wrong Pin or Repair the Missing Ground), handle stale data (Weather Data Goes Missing or Frozen Sensor Recovery), and meet a resource limit (Solar Surplus Pump or Daily Consumption Challenge). Your progress report is the handover.',
      hint: 'The expedition checks your saved passes at every destination.',
    },
  }),
];

// Reconnect attempts relative to when the outage was first seen, in seconds.
function retries(ctx, downAt, expected, secondDownAt, secondExpected = []) {
  const want = [
    ...expected.map((s) => downAt + s * 1000),
    ...secondExpected.map((s) => secondDownAt + s * 1000),
  ];
  const got = ctx.attempts;
  return (
    (got.length === want.length && got.every((t, i) => t === want[i])) ||
    'reconnect attempts should be ' +
      want.map((t) => (t - downAt) / 1000 + ' s').join(', ') +
      ' after the outage began, but they were ' +
      (got.map((t) => (t - downAt) / 1000 + ' s').join(', ') || 'none') +
      '.'
  );
}
// The lines printed during the step include `lines`, comparing numbers as numbers.
function diary(ctx, lines) {
  const printed = ctx.stepLogs,
    same = (got, want) => {
      const [a, ...restA] = String(got).split(','),
        [b, ...restB] = want.split(',');
      const x = restA.join(','),
        y = restB.join(',');
      return (
        (a === b || Number(a) === Number(b)) &&
        (x === y || (x !== '' && y !== '' && Math.abs(Number(x) - Number(y)) < 0.01))
      );
    };
  return (
    lines.every((want) => printed.some((got) => same(got, want))) ||
    'it should print ' +
      lines.join(' / ') +
      ', but it printed ' +
      (printed.join(' / ') || 'nothing') +
      '.'
  );
}

// Repair quests: a worked program (or wiring) with a fault in it.
const fix = (number, patch) =>
  Object.assign(
    catalogueQuestsC.find((q) => q.catalogue === number),
    patch,
  );
fix(86, {
  starter: starter(
    { title: 'Find the Wrong Pin', ids: ['ldr', 'led'], conditions: ['light < 1800'] },
    (code, language, devices) => {
      const led = devices.find((d) => d.id === 'led'),
        wrong = [18, 19, 14, 13, 12].find((p) => !devices.some((d) => d.pin === p));
      return language === 'python'
        ? code.replace('Pin(' + led.pin + ', Pin.OUT)', 'Pin(' + wrong + ', Pin.OUT)')
        : code.replace('output0 = ' + led.pin + ';', 'output0 = ' + wrong + ';');
    },
  ),
});
fix(86, {
  advanced: {
    ...catalogueQuestsC.find((q) => q.catalogue === 86).advanced,
    starter: starter(
      {
        title: 'Find the Wrong Pin',
        ids: ['ldr', 'pir', 'led', 'porch'],
        conditions: ['light < 1800', 'motion == 1'],
      },
      (code, language, devices) => {
        const led = devices.find((d) => d.id === 'led'),
          porch = devices.find((d) => d.id === 'porch');
        return language === 'python'
          ? code.replace('Pin(' + led.pin + ', Pin.OUT)', 'Pin(' + porch.pin + ', Pin.OUT)')
          : code.replace('output0 = ' + led.pin + ';', 'output0 = ' + porch.pin + ';');
      },
    ),
  },
});
fix(88, {
  starter: starter(q88, (code) => code.replace('light < 1800', 'light <= 1800')),
});
fix(88, {
  advanced: {
    ...catalogueQuestsC.find((q) => q.catalogue === 88).advanced,
    starter: starter(q88, (code, language) =>
      language === 'python'
        ? code
            .replace('light < 1800', 'light <= 1800')
            .replace(/\n    else:\n        output0\.value\(0\)/, '')
        : code
            .replace('light < 1800', 'light <= 1800')
            .replace(/ else \{\n    digitalWrite\(output0, LOW\);\n  \}/, ''),
    ),
  },
});

// The installer's wiring for Repair the Missing Ground: everything connected except the faults.
const wired = (ids, board, defaults) =>
  defaults(ids, board).map((d) => ({
    ...d,
    power: true,
    ground: true,
    resistorConnected: !!d.resistor,
  }));
fix(87, {
  prewired: (board, defaults) =>
    wired(['pir', 'porch'], board, defaults).map((d) =>
      d.id === 'pir' ? { ...d, ground: false } : d,
    ),
});
fix(87, {
  advanced: {
    ...catalogueQuestsC.find((q) => q.catalogue === 87).advanced,
    // A missing ground, the light sensor on a pin with no ADC, and two outputs on one pin.
    prewired: (board, defaults) => {
      const devices = wired(['pir', 'ldr', 'porch', 'led'], board, defaults),
        porch = devices.find((d) => d.id === 'porch');
      return devices.map((d) =>
        d.id === 'pir'
          ? { ...d, ground: false }
          : d.id === 'ldr'
            ? { ...d, pin: board === 'ESP32' ? 13 : 20 }
            : d.id === 'led'
              ? { ...d, pin: porch.pin }
              : d,
      );
    },
  },
});
