import { A, home, town, quest, press, presses, printed, phaseSteps } from './catalogue-kit.js';
// Catalogue quests Q031–Q060: shops, warehouses, factories, roads, parking and weather. Q056–Q058
// are already in the game as the weather quests Storm Watch, Heat & Humidity Response and
// Cloudy-Day Grow Lights, so they are not repeated.

// Signal outputs in the order the signal quests list them.
const R = [1, 0, 0],
  Y = [0, 1, 0],
  G = [0, 0, 1];
// Two signal heads (red, amber, green; then the crossing road's red, amber, green).
const heads = (a, b) => [...a, ...b];
// The two-road cycle: all red 2 s, first road green 10 s and amber 3 s, all red 2 s, then the
// crossing road green 10 s and amber 3 s.
const CYCLE = [
  [2000, heads(R, R)],
  [10000, heads(G, R)],
  [3000, heads(Y, R)],
  [2000, heads(R, R)],
  [10000, heads(R, G)],
  [3000, heads(R, Y)],
];
// The worked two-road controller: phases 0–5 as in CYCLE; `greenA`/`greenB` set the green times.
const twoRoads = (greens) => `
if (phaseStart == 0) {
  phaseStart = millis();
}
${greens}
if (phase == 0 || phase == 3) {
  length = 2000;
} else if (phase == 1) {
  length = greenA;
} else if (phase == 4) {
  length = greenB;
} else {
  length = 3000;
}
if (millis() - phaseStart >= length) {
  phaseStart = phaseStart + length;
  phase = phase + 1;
  if (phase == 6) {
    phase = 0;
  }
}
write(red, phase != 1 && phase != 2);
write(amber, phase == 2);
write(green, phase == 1);
write(red2, phase != 4 && phase != 5);
write(amber2, phase == 5);
write(green2, phase == 4);`;
const SIGNALS = ['red', 'amber', 'green', 'red2', 'amber2', 'green2'];

export const catalogueQuestsB = [
  quest(31, town('shop', 'Shop floor'), {
    title: 'Market Fridge Reminder',
    quote: 'Customers leave the drinks fridge open, and then the milk warms up.',
    goal: 'Light the LED while the fridge door contact reads HIGH (open). Sound the buzzer when the temperature is above 8 °C.',
    ids: ['door', 'temp', 'led', 'buzzer'],
    conditions: ['door == 1', 'temp > 8'],
    learn: ['Independent outputs', 'Refrigeration'],
    hint: 'Two rules: door == 1 for the LED, temp > 8 for the buzzer.',
    scenarios: [
      ['Closed and cold', { door: 0, temp: 5 }, [0, 0]],
      ['Open and cold', { door: 1, temp: 5 }, [1, 0]],
      ['Closed and warm', { door: 0, temp: 9 }, [0, 1]],
    ],
    advanced: {
      goal: 'Also sound the buzzer once the door has been open continuously for 15 seconds. Closing the door clears the door timer, but not a temperature alarm.',
      hint: 'Time how long door == 1 has lasted. The buzzer is on when temp > 8 OR the door has been open for 15000 ms.',
      techniques: ['duration'],
      sequences: [
        {
          name: 'A door left open sounds the buzzer',
          steps: [
            ['Closed and cold', { door: 0, temp: 5 }, 1000, [0, 0]],
            ['Open for 14.8 s', { door: 1 }, 15000, [1, 0]],
            ['Open for 15 s', {}, 200, [1, 1]],
            ['Closed', { door: 0 }, 200, [0, 0]],
          ],
        },
        {
          name: 'Closing does not clear a warm fridge',
          steps: [
            ['Open and warm', { door: 1, temp: 9 }, 1000, [1, 1]],
            ['Closed, still warm', { door: 0 }, 1000, [0, 1]],
          ],
        },
      ],
      solution: {
        state: { openedAt: 0 },
        loop: `
if (door == 1) {
  if (openedAt == 0) {
    openedAt = millis();
  }
} else {
  openedAt = 0;
}
write(led, door);
if (temp > 8 || (openedAt != 0 && millis() - openedAt >= 15000)) {
  write(buzzer, 1);
} else {
  write(buzzer, 0);
}`,
      },
    },
  }),
  quest(32, town('shop', 'Shop floor'), {
    title: 'Bakery Proofing Cabinet',
    quote: 'Dough rises best when it is kept warm. Keep the proofing cabinet at about 28 °C.',
    goal: 'Run the heater below 28 °C. Switch it off at 28 °C or above.',
    ids: ['temp', 'heater'],
    conditions: ['temp < 28'],
    learn: ['Heating control', 'Thresholds'],
    hint: 'temp < 28.',
    budget: { wh: 0.5, litres: 45 },
    scenarios: [
      ['27 °C', { temp: 27 }, [1]],
      ['28 °C', { temp: 28 }, [0]],
      ['Hot cabinet', { temp: 32 }, [0]],
    ],
    advanced: {
      ids: ['temp', 'humidity', 'heater', 'fan'],
      goal: 'The heater starts off, switches on at 27 °C or below and off at 29 °C or above, keeping its state in between. Separately, run the fan when humidity is above 80 %.',
      hint: 'Hysteresis for the heater; a plain humidity > 80 for the fan.',
      techniques: ['hysteresis'],
      sequences: [
        {
          name: 'Heater with two thresholds, fan on its own',
          steps: [
            ['Starts at 28 °C', { temp: 28, humidity: 60 }, 1000, [0, 0]],
            ['27 °C', { temp: 27 }, 1000, [1, 0]],
            ['28 °C', { temp: 28 }, 1000, [1, 0]],
            ['29 °C', { temp: 29 }, 1000, [0, 0]],
            ['28 °C again', { temp: 28 }, 1000, [0, 0]],
            ['Steamy', { humidity: 85 }, 1000, [0, 1]],
            ['80 %', { humidity: 80 }, 1000, [0, 0]],
          ],
        },
      ],
      solution: {
        state: { heat: 0 },
        loop: `
if (temp <= 27) {
  heat = 1;
} else if (temp >= 29) {
  heat = 0;
}
write(heater, heat);
if (humidity > 80) {
  write(fan, 1);
} else {
  write(fan, 0);
}`,
      },
    },
  }),
  quest(33, town('shop', 'Shop floor'), {
    title: 'Cafe Queue Counter',
    quote: 'How many people are queueing? Count them in and out at the door.',
    goal: 'Start at 0. Each break of the entry beam adds one; each break of the exit beam takes one away, never below 0. Print the count (Serial.println or print) on every pass.',
    ids: ['entryBeam', 'exitBeam'],
    learn: ['Counting', 'Edges', 'Limits'],
    hint: 'Count a beam only when it changes from LOW to HIGH, and never let the count go below 0.',
    techniques: ['edge', 'counter'],
    sequences: [
      {
        name: 'Counting people in and out',
        steps: [
          { label: 'Start', ms: 1000, check: printed(0) },
          ...press('entry', 'Someone comes in'),
          { label: 'After one entry', ms: 200, check: printed(1) },
          ...press('exit', 'Someone leaves'),
          { label: 'After one exit', ms: 200, check: printed(0) },
          ...press('exit', 'An extra exit'),
          { label: 'Never below 0', ms: 200, check: printed(0) },
          ['Someone stands in the beam', { entry: 1 }, 2000, null],
          { label: 'Counted once', env: { entry: 0 }, ms: 200, check: printed(1) },
        ],
      },
    ],
    solution: {
      state: { count: 0, prevEntry: 0, prevExit: 0 },
      loop: `
if (entry == 1 && prevEntry == 0) {
  count = count + 1;
}
if (exit == 1 && prevExit == 0 && count > 0) {
  count = count - 1;
}
prevEntry = entry;
prevExit = exit;
print(count);`,
    },
    advanced: {
      ids: ['entryBeam', 'exitBeam', 'red', 'green'],
      goal: 'With 8 or more people show BUSY (red on); below 8 show READY (green on). If someone enters and someone leaves in the same pass, the count does not change. Keep printing the count.',
      hint: 'A new entry and a new exit together cancel out. Then set red for count >= 8 and green otherwise.',
      sequences: [
        {
          name: 'BUSY at 8 or more',
          steps: [
            ...presses('entry', 'Customer', 7),
            { label: 'Seven queueing', ms: 200, expect: [0, 1], check: printed(7) },
            ...press('entry', 'Eighth customer'),
            { label: 'Eight queueing', ms: 200, expect: [1, 0], check: printed(8) },
            ...press('exit', 'One served'),
            { label: 'Seven again', ms: 200, expect: [0, 1], check: printed(7) },
            ['In and out together', { entry: 1, exit: 1 }, 200, null],
            {
              label: 'After both at once',
              env: { entry: 0, exit: 0 },
              ms: 200,
              expect: [0, 1],
              check: printed(7),
            },
          ],
        },
      ],
      solution: {
        state: { count: 0, prevEntry: 0, prevExit: 0, came: 0, went: 0 },
        loop: `
came = entry == 1 && prevEntry == 0;
went = exit == 1 && prevExit == 0;
if (came && !went) {
  count = count + 1;
}
if (went && !came && count > 0) {
  count = count - 1;
}
prevEntry = entry;
prevExit = exit;
write(red, count >= 8);
write(green, count < 8);
print(count);`,
      },
    },
  }),
  quest(34, town('shop', 'Shop floor'), {
    title: 'Cold-Drink Vending Demo',
    quote: 'Our demonstration vending machine should give exactly one drink per press.',
    goal: 'While the machine is switched on (arm button HIGH), each new press of the push button opens the servo chute for 1 second. Presses while it is open are ignored.',
    ids: ['pushButton', 'button', 'servo'],
    learn: ['Edges', 'Timers', 'One action per event'],
    hint: 'Start a 1-second dispense on a new press (HIGH now, LOW last pass) if the machine is on and not already dispensing.',
    techniques: ['edge', 'hold'],
    sequences: [
      {
        name: 'One drink per press',
        steps: [
          ['Ready', { armed: 1 }, 1000, [0]],
          ['Press', { pressed: 1 }, 200, [1]],
          ['0.8 s later', { pressed: 0 }, 800, [1]],
          ['1 s later', {}, 200, [0]],
        ],
      },
      {
        name: 'Holding the button gives one drink',
        steps: [
          ['Ready', { armed: 1 }, 1000, [0]],
          ['Button held for 3 s', { pressed: 1 }, 3000, [0]],
        ],
      },
      {
        name: 'Presses during a drink are ignored',
        steps: [
          ['Ready', { armed: 1 }, 1000, [0]],
          ...press('pressed', 'Press'),
          ...press('pressed', 'Press again while dispensing'),
          ['1 s after the first press', {}, 400, [0]],
          ['Later', {}, 1000, [0]],
        ],
      },
      {
        name: 'Switched off: no drink',
        steps: [['Press while switched off', { armed: 0, pressed: 1 }, 400, [0]]],
      },
    ],
    solution: {
      state: { prev: 0, dispensing: 0, started: 0 },
      loop: `
if (pressed == 1 && prev == 0 && armed == 1 && dispensing == 0) {
  dispensing = 1;
  started = millis();
}
prev = pressed;
if (dispensing == 1 && millis() - started >= 1000) {
  dispensing = 0;
}
write(servo, dispensing);`,
    },
    advanced: {
      goal: 'Also: switching the machine off cancels a drink at once, and a button still held after a drink must be released before the next press counts. The chute starts closed.',
      hint: 'Clear the dispense whenever armed == 0. The press check (HIGH now, LOW last pass) already needs a release.',
      sequences: [
        {
          name: 'Switching off cancels the drink',
          steps: [
            ['Ready', { armed: 1 }, 1000, [0]],
            ['Press', { pressed: 1 }, 200, [1]],
            ['Switched off', { armed: 0, pressed: 0 }, 200, [0]],
            ['Switched on again', { armed: 1 }, 600, [0]],
          ],
        },
        {
          name: 'Release before the next drink',
          steps: [
            ['Ready', { armed: 1 }, 1000, [0]],
            ['Held through a drink', { pressed: 1 }, 2000, [0]],
            ['Released', { pressed: 0 }, 200, [0]],
            ['New press', { pressed: 1 }, 200, [1]],
          ],
        },
      ],
      solution: {
        state: { prev: 0, dispensing: 0, started: 0 },
        loop: `
if (pressed == 1 && prev == 0 && armed == 1 && dispensing == 0) {
  dispensing = 1;
  started = millis();
}
prev = pressed;
if (dispensing == 1 && millis() - started >= 1000) {
  dispensing = 0;
}
if (armed == 0) {
  dispensing = 0;
}
write(servo, dispensing);`,
      },
    },
  }),
  quest(35, town('shop', 'Shop floor'), {
    title: 'Shop Shutter Weather Guard',
    quote: 'Close the shop’s shutter (the motorised gate) when the wind gets strong.',
    goal: 'Keep the shutter open (HIGH) while the wind is below 40 km/h. Close it (LOW) at 40 km/h or above.',
    ids: ['wind', 'gate'],
    conditions: ['wind < 40'],
    learn: ['Live wind readings', 'Less than', 'Protecting equipment'],
    hint: 'Compare wind < 40. Exactly 40 km/h closes the shutter.',
    scenarios: [
      ['Calm', { wind: 10 }, [1]],
      ['39 km/h', { wind: 39 }, [1]],
      ['40 km/h', { wind: 40 }, [0]],
    ],
    advanced: {
      ids: ['wind', 'door', 'gate', 'buzzer'],
      conditions: ['wind < 40', 'wind >= 40 && door == 1'],
      goal: 'Keep the shutter rule, and sound the buzzer when the wind is 40 km/h or above while the shop door contact reads HIGH (open).',
      hint: 'The buzzer needs wind >= 40 && door == 1, in its own if/else. It does not wait for the shutter.',
      scenarios: [
        ['Gale, door open', { wind: 40, door: 1 }, [0, 1]],
        ['Gale, door shut', { wind: 40, door: 0 }, [0, 0]],
        ['39 km/h, door open', { wind: 39, door: 1 }, [1, 0]],
        ['Calm, door shut', { wind: 10, door: 0 }, [1, 0]],
      ],
    },
  }),
  quest(36, town('warehouse', 'Loading bay'), {
    title: 'Loading-Bay Parking Guide',
    quote: 'Help delivery drivers judge the last part of their approach.',
    goal: 'Light the LED when the distance is above 0 and at most 50 cm. Sound the buzzer when it is above 0 and at most 20 cm. A distance of 0 means no reading.',
    ids: ['ultra', 'led', 'buzzer'],
    conditions: ['distance > 0 && distance <= 50', 'distance > 0 && distance <= 20'],
    learn: ['Escalating thresholds', 'Valid readings', 'Distance sensing'],
    hint: 'Each output has its own range: distance > 0 && distance <= 50 for the LED, distance > 0 && distance <= 20 for the buzzer.',
    scenarios: [
      ['Far away', { distance: 80 }, [0, 0]],
      ['At 50 cm', { distance: 50 }, [1, 0]],
      ['At 20 cm', { distance: 20 }, [1, 1]],
      ['No reading', { distance: 0 }, [0, 0]],
    ],
    advanced: {
      conditions: ['distance <= 50', 'distance > 0 && distance <= 20'],
      goal: 'When the sensor gives no reading (0 or below), keep the LED on as a caution and the buzzer off. Otherwise keep the beginner rules, so a valid reading recovers on its own.',
      hint: 'The LED is distance <= 50, which also covers a missing reading. The buzzer still needs distance > 0.',
      techniques: ['validate'],
      scenarios: [
        ['No reading', { distance: 0 }, [1, 0]],
        ['Recovered, far away', { distance: 80 }, [0, 0]],
        ['At 50 cm', { distance: 50 }, [1, 0]],
        ['At 20 cm', { distance: 20 }, [1, 1]],
      ],
    },
  }),
  quest(37, town('warehouse', 'Loading bay'), {
    title: 'Parcel Locker Demonstration',
    quote: 'Couriers press the button to open the parcel locker for a few seconds.',
    goal: 'The locker starts locked (gate LOW). A new press unlocks it (HIGH) for 5 seconds; presses while it is unlocked are ignored.',
    ids: ['pushButton', 'gate'],
    learn: ['Edges', 'Timers'],
    hint: 'Unlock on a new press while locked, note the time, and lock again once 5000 ms have passed.',
    techniques: ['edge', 'hold'],
    sequences: [
      {
        name: 'Unlocked for 5 s',
        steps: [
          ['Locked at start', {}, 1000, [0]],
          ['Press', { pressed: 1 }, 200, [1]],
          ['4.8 s later', { pressed: 0 }, 4800, [1]],
          ['5 s later', {}, 200, [0]],
        ],
      },
      {
        name: 'Pressing again does not extend it',
        steps: [
          ['Press', { pressed: 1 }, 200, [1]],
          ['Released', { pressed: 0 }, 2000, [1]],
          ['Pressed again', { pressed: 1 }, 200, [1]],
          ['5 s after the first press', { pressed: 0 }, 2800, [0]],
        ],
      },
    ],
    solution: {
      state: { prev: 0, unlocked: 0, started: 0 },
      loop: `
if (pressed == 1 && prev == 0 && unlocked == 0) {
  unlocked = 1;
  started = millis();
}
prev = pressed;
if (unlocked == 1 && millis() - started >= 5000) {
  unlocked = 0;
}
write(gate, unlocked);`,
    },
    advanced: {
      ids: ['pushButton', 'door', 'gate', 'led'],
      goal: 'After 5 seconds, lock only if the locker door is closed (door contact LOW). If it is still open, stay unlocked and light the warning LED; closing the door then locks at once and clears the warning.',
      hint: 'When the 5 s are up, check the door: closed locks, open lights the warning and waits.',
      sequences: [
        {
          name: 'Locks once the door is closed',
          steps: [
            ['Press', { pressed: 1 }, 200, [1, 0]],
            ['Door opened', { pressed: 0, door: 1 }, 4800, [1, 0]],
            ['5 s, door still open', {}, 200, [1, 1]],
            ['Door closed', { door: 0 }, 200, [0, 0]],
          ],
        },
        {
          name: 'Locks on time when closed',
          steps: [
            ['Press', { pressed: 1 }, 200, [1, 0]],
            ['5 s later, door closed', { pressed: 0 }, 5000, [0, 0]],
          ],
        },
      ],
      solution: {
        state: { prev: 0, unlocked: 0, started: 0, warn: 0 },
        loop: `
if (pressed == 1 && prev == 0 && unlocked == 0) {
  unlocked = 1;
  started = millis();
}
prev = pressed;
if (unlocked == 1 && millis() - started >= 5000) {
  if (door == 0) {
    unlocked = 0;
    warn = 0;
  } else {
    warn = 1;
  }
}
write(gate, unlocked);
write(led, warn);`,
      },
    },
  }),
  quest(38, town('warehouse', 'Loading bay'), {
    title: 'Warehouse Aisle Lights',
    quote: 'Only light the aisles people are actually working in.',
    goal: 'The first light zone (path lights) follows the first motion sensor; the second light zone follows the second motion sensor.',
    ids: ['pir', 'pir2', 'led', 'lightB'],
    conditions: ['motion == 1', 'motion2 == 1'],
    learn: ['Independent zones', 'Digital input'],
    hint: 'Two rules: motion == 1 and motion2 == 1.',
    scenarios: [
      ['First aisle only', { motion: 1, motion2: 0 }, [1, 0]],
      ['Second aisle only', { motion: 0, motion2: 1 }, [0, 1]],
      ['Nobody', { motion: 0, motion2: 0 }, [0, 0]],
      ['Both', { motion: 1, motion2: 1 }, [1, 1]],
    ],
    advanced: {
      goal: 'Each zone stays lit for 15 seconds after its own sensor last read HIGH. The two zones keep separate timers.',
      hint: 'Two copies of the hold pattern, each with its own last-seen time.',
      techniques: ['hold'],
      sequences: [
        {
          name: 'Separate timers',
          steps: [
            ['Movement in the first aisle', { motion: 1 }, 200, [1, 0]],
            ['10 s later', { motion: 0 }, 10000, [1, 0]],
            ['Movement in the second aisle', { motion2: 1 }, 200, [1, 1]],
            ['14.8 s after the first', { motion2: 0 }, 4600, [1, 1]],
            ['15 s after the first', {}, 200, [0, 1]],
            ['14.8 s after the second', {}, 10000, [0, 1]],
            ['15 s after the second', {}, 200, [0, 0]],
          ],
        },
      ],
      solution: {
        state: { lastA: 0, onA: 0, lastB: 0, onB: 0 },
        loop: `
if (motion == 1) {
  lastA = millis();
  onA = 1;
}
if (motion2 == 1) {
  lastB = millis();
  onB = 1;
}
if (onA == 1 && millis() - lastA >= 15000) {
  onA = 0;
}
if (onB == 1 && millis() - lastB >= 15000) {
  onB = 0;
}
write(led, onA);
write(lightB, onB);`,
      },
    },
  }),
  quest(39, town('factory', 'Factory floor'), {
    title: 'Conveyor Box Stop',
    quote: 'Boxes fall off the end of the conveyor. Stop the belt when one reaches the end.',
    goal: 'Run the conveyor while the end-of-belt distance is above 15 cm. Stop at 15 cm or less, including a missing reading (0).',
    ids: ['ultra', 'conveyor'],
    conditions: ['distance > 15'],
    learn: ['Distance sensing', 'Fail-safe stops'],
    hint: 'distance > 15 covers both a box at the end and a missing reading.',
    budget: { wh: 0.35, litres: 45 },
    scenarios: [
      ['Clear belt', { distance: 30 }, [1]],
      ['Box at 15 cm', { distance: 15 }, [0]],
      ['No reading', { distance: 0 }, [0]],
    ],
    advanced: {
      ids: ['ultra', 'pushButton', 'conveyor'],
      goal: 'The belt starts stopped. A box at the end (15 cm or less, or no reading) stops it and keeps it stopped even after the box is taken. Only a new press of the restart button while the end is clear (above 15 cm) runs it again.',
      hint: 'Latch running = 0 whenever distance <= 15. Set running = 1 only on a new press with distance > 15.',
      techniques: ['latch', 'edge'],
      sequences: [
        {
          name: 'A box latches the stop',
          env: { distance: 30 },
          steps: [
            ['Starts stopped', {}, 1000, [0]],
            ...press('pressed', 'Restart pressed', [1]),
            ['Running', {}, 1000, [1]],
            ['Box at the end', { distance: 10 }, 200, [0]],
            ['Box taken away', { distance: 30 }, 1000, [0]],
            ...press('pressed', 'Restart pressed', [1]),
          ],
        },
        {
          name: 'No restart while blocked',
          steps: [
            ['Box at the end', { distance: 10 }, 1000, [0]],
            ...press('pressed', 'Restart while blocked', [0]),
            ['Box taken away', { distance: 30 }, 1000, [0]],
          ],
        },
        {
          name: 'A missing reading also stops it',
          env: { distance: 30 },
          steps: [
            ...press('pressed', 'Restart pressed', [1]),
            ['No reading', { distance: 0 }, 200, [0]],
            ['Reading back', { distance: 30 }, 1000, [0]],
          ],
        },
      ],
      solution: {
        state: { running: 0, prev: 0 },
        loop: `
if (distance <= 15) {
  running = 0;
}
if (pressed == 1 && prev == 0 && distance > 15) {
  running = 1;
}
prev = pressed;
write(conveyor, running);`,
      },
    },
  }),
  quest(40, town('warehouse', 'Loading bay'), {
    title: 'Warehouse Inventory Alert',
    quote: 'Tell us when the shelf is running low so we can reorder in time.',
    goal: 'Start with 10 items. The entry beam counts an arrival (+1), the exit beam a removal (−1, never below 0). Light the LED when 3 or fewer are left. Print the count on every pass.',
    ids: ['entryBeam', 'exitBeam', 'led'],
    learn: ['Counting', 'Thresholds on a count'],
    hint: 'Count beam edges as in the queue counter, starting at 10, and light the LED for count <= 3.',
    techniques: ['edge', 'counter'],
    sequences: [
      {
        name: 'Low stock lights the LED',
        steps: [
          { label: 'Start', ms: 400, expect: [0], check: printed(10) },
          ...[1, 2, 3, 4, 5, 6].flatMap((n) => press('exit', 'Removal ' + n)),
          { label: 'Four left', ms: 200, expect: [0], check: printed(4) },
          ...press('exit', 'Removal 7'),
          { label: 'Three left', ms: 200, expect: [1], check: printed(3) },
          ...[8, 9, 10, 11].flatMap((n) => press('exit', 'Removal ' + n)),
          { label: 'Never below 0', ms: 200, expect: [1], check: printed(0) },
        ],
      },
    ],
    solution: {
      state: { count: 10, prevIn: 0, prevOut: 0 },
      loop: `
if (entry == 1 && prevIn == 0) {
  count = count + 1;
}
if (exit == 1 && prevOut == 0 && count > 0) {
  count = count - 1;
}
prevIn = entry;
prevOut = exit;
write(led, count <= 3);
print(count);`,
    },
    advanced: {
      goal: 'Turn the LED into a reorder flag: it comes on at 3 or fewer and stays on until the stock is back to 8 or more. It starts off.',
      hint: 'Hysteresis on the count: flag = 1 at count <= 3, flag = 0 at count >= 8.',
      techniques: ['edge', 'counter', 'hysteresis'],
      sequences: [
        {
          name: 'Reorder until restocked to 8',
          steps: [
            ...[1, 2, 3, 4, 5, 6, 7].flatMap((n) => press('exit', 'Removal ' + n)),
            { label: 'Three left', ms: 200, expect: [1], check: printed(3) },
            ...press('entry', 'Delivery 1'),
            ...press('entry', 'Delivery 2'),
            { label: 'Five', ms: 200, expect: [1], check: printed(5) },
            ...press('entry', 'Delivery 3'),
            ...press('entry', 'Delivery 4'),
            { label: 'Seven', ms: 200, expect: [1], check: printed(7) },
            ...press('entry', 'Delivery 5'),
            { label: 'Eight', ms: 200, expect: [0], check: printed(8) },
          ],
        },
      ],
      solution: {
        state: { count: 10, prevIn: 0, prevOut: 0, reorder: 0 },
        loop: `
if (entry == 1 && prevIn == 0) {
  count = count + 1;
}
if (exit == 1 && prevOut == 0 && count > 0) {
  count = count - 1;
}
prevIn = entry;
prevOut = exit;
if (count <= 3) {
  reorder = 1;
} else if (count >= 8) {
  reorder = 0;
}
write(led, reorder);
print(count);`,
      },
    },
  }),
  quest(41, town('factory', 'Factory floor'), {
    title: 'Machine Guard Interlock',
    quote: 'The press must never run while its guard is open.',
    goal: 'Run the machine motor only while the guard door contact is LOW (closed) and the enable switch (arm button) is HIGH.',
    ids: ['door', 'button', 'motor'],
    conditions: ['door == 0 && armed == 1'],
    learn: ['Safety interlocks', 'AND logic'],
    hint: 'door == 0 && armed == 1.',
    budget: { wh: 0.35, litres: 45 },
    scenarios: [
      ['Closed and enabled', { door: 0, armed: 1 }, [1]],
      ['Guard open', { door: 1, armed: 1 }, [0]],
      ['Disabled', { door: 0, armed: 0 }, [0]],
    ],
    advanced: {
      ids: ['door', 'button', 'pushButton', 'motor'],
      goal: 'The motor starts stopped. Opening the guard (or disabling) stops it and keeps it stopped. It only runs again after a new press of the start button while the guard is closed and enabled.',
      hint: 'Latch running = 0 on door == 1 or armed == 0; set running = 1 only on a new press with the guard closed and enabled.',
      techniques: ['latch', 'edge'],
      sequences: [
        {
          name: 'Reclosing the guard does not restart',
          env: { door: 0, armed: 1 },
          steps: [
            ['Starts stopped', {}, 1000, [0]],
            ...press('pressed', 'Start pressed', [1]),
            ['Running', {}, 1000, [1]],
            ['Guard opened', { door: 1 }, 200, [0]],
            ['Guard closed again', { door: 0 }, 1000, [0]],
            ...press('pressed', 'Start pressed', [1]),
          ],
        },
        {
          name: 'Start with the guard open does nothing',
          env: { armed: 1 },
          steps: [
            ['Guard open, start held', { door: 1, pressed: 1 }, 400, [0]],
            ['Guard closed, still held', { door: 0 }, 400, [0]],
            ['Released', { pressed: 0 }, 200, [0]],
            ['Fresh press', { pressed: 1 }, 200, [1]],
            ['Disabled', { armed: 0, pressed: 0 }, 200, [0]],
          ],
        },
      ],
      solution: {
        state: { running: 0, prev: 0 },
        loop: `
if (door == 1 || armed == 0) {
  running = 0;
}
if (pressed == 1 && prev == 0 && door == 0 && armed == 1) {
  running = 1;
}
prev = pressed;
write(motor, running);`,
      },
    },
  }),
  quest(42, town('factory', 'Factory floor'), {
    title: 'Workshop Extraction',
    quote: 'Sawdust builds up fast. Run the extractor when the air gets dusty.',
    goal: 'Run the fan at a dust level of 60 or above (0–100 scale).',
    ids: ['dust', 'fan'],
    conditions: ['dust >= 60'],
    learn: ['Calibrated input', 'Inclusive thresholds'],
    hint: 'dust >= 60.',
    scenarios: [
      ['59', { dust: 59 }, [0]],
      ['60', { dust: 60 }, [1]],
      ['Clean', { dust: 10 }, [0]],
    ],
    advanced: {
      ids: ['dust', 'fan', 'buzzer'],
      goal: 'The fan starts off, comes on at 60 or above and goes off at 40 or below, keeping its state in between. Sound the buzzer at 85 or above.',
      hint: 'Hysteresis for the fan; dust >= 85 for the buzzer.',
      techniques: ['hysteresis'],
      sequences: [
        {
          name: 'Fan with two thresholds',
          steps: [
            ['50 at start', { dust: 50 }, 1000, [0, 0]],
            ['60', { dust: 60 }, 1000, [1, 0]],
            ['50', { dust: 50 }, 1000, [1, 0]],
            ['41', { dust: 41 }, 1000, [1, 0]],
            ['40', { dust: 40 }, 1000, [0, 0]],
            ['50 again', { dust: 50 }, 1000, [0, 0]],
            ['85', { dust: 85 }, 1000, [1, 1]],
            ['84', { dust: 84 }, 1000, [1, 0]],
          ],
        },
      ],
      solution: {
        state: { fanOn: 0 },
        loop: `
if (dust >= 60) {
  fanOn = 1;
} else if (dust <= 40) {
  fanOn = 0;
}
write(fan, fanOn);
write(buzzer, dust >= 85);`,
      },
    },
  }),
  quest(43, town('factory', 'Factory floor'), {
    title: 'Motor Overheat Lockout',
    quote: 'If the motor overheats it must stop before it burns out.',
    goal: 'The run switch (arm button) asks the motor to run. Run it while asked and the motor temperature probe reads below 70 °C. At 70 °C or above, stop it and sound the buzzer.',
    ids: ['motorTemp', 'button', 'motor', 'buzzer'],
    conditions: ['armed == 1 && motorTemp < 70', 'motorTemp >= 70'],
    learn: ['Safety limits', 'Two outputs'],
    hint: 'Motor: armed == 1 && motorTemp < 70. Buzzer: motorTemp >= 70.',
    budget: { wh: 0.35, litres: 45 },
    scenarios: [
      ['Running at 69 °C', { armed: 1, motorTemp: 69 }, [1, 0]],
      ['70 °C', { armed: 1, motorTemp: 70 }, [0, 1]],
      ['Not asked to run', { armed: 0, motorTemp: 50 }, [0, 0]],
    ],
    advanced: {
      ids: ['motorTemp', 'button', 'resetButton', 'motor', 'buzzer'],
      goal: 'At 70 °C or above, lock the motor out and sound the buzzer until someone presses reset with the motor at 50 °C or below. Even then it only runs while the run switch is on.',
      hint: 'Latch lockout at motorTemp >= 70. Reset clears it only when motorTemp <= 50. Motor = armed && !lockout; buzzer = lockout.',
      techniques: ['latch'],
      sequences: [
        {
          name: 'Lockout until cool and reset',
          env: { armed: 1 },
          steps: [
            ['Running at 60 °C', { motorTemp: 60 }, 1000, [1, 0]],
            ['70 °C', { motorTemp: 70 }, 200, [0, 1]],
            ['Cooled to 60 °C', { motorTemp: 60 }, 1000, [0, 1]],
            ...press('reset', 'Reset at 60 °C', [0, 1]),
            ['Cooled to 50 °C', { motorTemp: 50 }, 1000, [0, 1]],
            ...press('reset', 'Reset at 50 °C', [1, 0]),
            ['Run switch off', { armed: 0 }, 400, [0, 0]],
          ],
        },
      ],
      solution: {
        state: { locked: 0 },
        loop: `
if (motorTemp >= 70) {
  locked = 1;
}
if (locked == 1 && reset == 1 && motorTemp <= 50) {
  locked = 0;
}
write(motor, armed == 1 && locked == 0);
write(buzzer, locked);`,
      },
    },
  }),
  quest(44, town('factory', 'Factory floor'), {
    title: 'Parts Counter',
    quote: 'Count the parts coming off the line.',
    goal: 'Start at 0 and add one each time a part breaks the beam (a LOW-to-HIGH change). A part resting in the beam counts once. Print the count on every pass.',
    ids: ['entryBeam'],
    learn: ['Edges', 'Counting'],
    hint: 'Count only when the beam reads HIGH now and LOW last pass.',
    techniques: ['edge', 'counter'],
    sequences: [
      {
        name: 'One count per part',
        steps: [
          { label: 'Start', ms: 400, check: printed(0) },
          ...press('entry', 'Part 1'),
          { label: 'One part', ms: 200, check: printed(1) },
          ['Part 2 rests in the beam', { entry: 1 }, 2000, null],
          { label: 'Still two', ms: 200, check: printed(2) },
          ['Gone', { entry: 0 }, 200, null],
          ...press('entry', 'Part 3'),
          { label: 'Three parts', ms: 200, check: printed(3) },
        ],
      },
    ],
    solution: {
      state: { count: 0, prev: 0 },
      loop: `
if (entry == 1 && prev == 0) {
  count = count + 1;
}
prev = entry;
print(count);`,
    },
    advanced: {
      ids: ['entryBeam', 'resetButton', 'conveyor'],
      goal: 'Run the conveyor until 20 parts are counted, then stop it. Reset sets the count back to 0 and restarts the conveyor, but only while it is stopped. If a part and a reset arrive together, count the part and ignore the reset.',
      hint: 'conveyor = count < 20. Reset only when count >= 20 and no new part arrived on this pass.',
      sequences: [
        {
          name: 'Stops at 20, reset restarts',
          steps: [
            ...Array.from({ length: 19 }, (_, i) => press('entry', 'Part ' + (i + 1))).flat(),
            { label: '19 parts', ms: 200, expect: [1], check: printed(19) },
            ...press('entry', 'Part 20'),
            { label: '20 parts', ms: 200, expect: [0], check: printed(20) },
            ['Part and reset together', { entry: 1, reset: 1 }, 200, null],
            {
              label: 'Part counted, reset ignored',
              env: { entry: 0, reset: 0 },
              ms: 200,
              expect: [0],
              check: printed(21),
            },
            ...press('reset', 'Reset while stopped'),
            { label: 'Back to 0', ms: 200, expect: [1], check: printed(0) },
          ],
        },
        {
          name: 'Reset while running is ignored',
          steps: [
            ...Array.from({ length: 5 }, (_, i) => press('entry', 'Part ' + (i + 1))).flat(),
            ...press('reset', 'Reset while running'),
            { label: 'Still 5', ms: 200, expect: [1], check: printed(5) },
          ],
        },
      ],
      solution: {
        state: { count: 0, prev: 0, part: 0 },
        loop: `
part = entry == 1 && prev == 0;
if (part) {
  count = count + 1;
}
prev = entry;
if (reset == 1 && count >= 20 && !part) {
  count = 0;
}
write(conveyor, count < 20);
print(count);`,
      },
    },
  }),
  quest(45, town('factory', 'Factory floor'), {
    title: 'Two-Hand Start Demonstration',
    quote: 'Operators must keep both hands on the buttons, away from the press.',
    goal: 'Run the machine motor only while both push buttons are held.',
    ids: ['pushButton', 'pushButton2', 'motor'],
    conditions: ['pressed == 1 && pressed2 == 1'],
    learn: ['AND logic', 'Safety controls'],
    hint: 'pressed == 1 && pressed2 == 1.',
    budget: { wh: 0.35, litres: 45 },
    scenarios: [
      ['Neither', { pressed: 0, pressed2: 0 }, [0]],
      ['One hand', { pressed: 1, pressed2: 0 }, [0]],
      ['Both hands', { pressed: 1, pressed2: 1 }, [1]],
    ],
    advanced: {
      goal: 'Both buttons must be pressed fresh within 500 ms of each other. Buttons already held when the program starts cannot start it. Releasing either stops the motor, and both must be released before it can start again.',
      hint: 'Note the time of each new press. Start only when both are held and the two press times are at most 500 ms apart, and only after both have been released since the last run.',
      techniques: ['edge', 'duration'],
      sequences: [
        {
          name: 'Presses 0.5 s apart start it',
          tick: 100,
          steps: [
            ['Both released', {}, 500, [0]],
            ['First button', { pressed: 1 }, 100, [0]],
            ['Waiting', {}, 400, [0]],
            ['Second button 0.5 s later', { pressed2: 1 }, 100, [1]],
            ['Second released', { pressed2: 0 }, 100, [0]],
            ['Second pressed again', { pressed2: 1 }, 300, [0]],
            ['Both released', { pressed: 0, pressed2: 0 }, 100, [0]],
          ],
        },
        {
          name: 'Presses 0.6 s apart do not',
          tick: 100,
          steps: [
            ['Both released', {}, 500, [0]],
            ['First button', { pressed: 1 }, 100, [0]],
            ['Waiting', {}, 500, [0]],
            ['Second button 0.6 s later', { pressed2: 1 }, 300, [0]],
          ],
        },
        {
          name: 'Held at startup cannot start it',
          tick: 100,
          env: { pressed: 1, pressed2: 1 },
          steps: [['Both held from the start', {}, 1000, [0]]],
        },
      ],
      solution: {
        delay: 100,
        state: { prevA: 0, prevB: 0, timeA: 0, timeB: 0, running: 0, ready: 0 },
        loop: `
if (pressed == 1 && prevA == 0) {
  timeA = millis();
}
if (pressed2 == 1 && prevB == 0) {
  timeB = millis();
}
prevA = pressed;
prevB = pressed2;
if (pressed == 0 || pressed2 == 0) {
  running = 0;
}
if (pressed == 0 && pressed2 == 0) {
  ready = 1;
}
if (ready == 1 && pressed == 1 && pressed2 == 1 && abs(timeA - timeB) <= 500) {
  running = 1;
  ready = 0;
}
write(motor, running);`,
      },
    },
  }),
  quest(46, town('roads', 'Community roads'), {
    title: 'Timed Junction',
    quote: 'Our model junction needs a proper traffic-light sequence.',
    goal: 'Start on red. Repeat red 10 s, green 10 s, amber 3 s, back to red. Use the red, amber and green indicators.',
    ids: ['red', 'amber', 'green'],
    learn: ['Phases', 'Timers', 'State machines'],
    hint: 'Keep the phase and when it started. When the phase has lasted its time, move on and add its length to the start time.',
    techniques: ['phases'],
    sequences: [
      {
        name: 'Red, green, amber, red',
        steps: phaseSteps(
          [
            [10000, R],
            [10000, G],
            [3000, Y],
          ],
          2,
        ),
      },
    ],
    solution: {
      state: { phase: 0, phaseStart: 0, length: 10000 },
      loop: `
if (phaseStart == 0) {
  phaseStart = millis();
}
if (phase == 2) {
  length = 3000;
} else {
  length = 10000;
}
if (millis() - phaseStart >= length) {
  phaseStart = phaseStart + length;
  phase = phase + 1;
  if (phase == 3) {
    phase = 0;
  }
}
write(red, phase == 0);
write(amber, phase == 2);
write(green, phase == 1);`,
    },
    advanced: {
      ids: SIGNALS,
      goal: 'Run two signal heads for crossing roads. Start all red for 2 s, then: first road green 10 s, amber 3 s; all red 2 s; second road green 10 s, amber 3 s; all red 2 s; and repeat. The two roads are never green together.',
      hint: 'Six phases with their own lengths. Set every lamp from the phase, so conflicting greens are impossible.',
      sequences: [{ name: 'Two roads with all-red between', steps: phaseSteps(CYCLE, 2) }],
      solution: {
        state: { phase: 0, phaseStart: 0, length: 2000, greenA: 10000, greenB: 10000 },
        loop: twoRoads(''),
      },
    },
  }),
  quest(47, town('roads', 'Community roads'), {
    title: 'Pedestrian Request Crossing',
    quote: 'People wait ages to cross. Give them a button that brings the walk signal.',
    goal: 'Cars start on green and pedestrians on don’t-walk. A press asks to cross. Once the cars have had at least 5 s of green: amber 3 s, all red 1 s, walk 6 s, all red 1 s, then cars green again. Outputs: car green, amber, red, walk, don’t-walk.',
    ids: ['pushButton', 'green', 'amber', 'red', 'walkLight', 'waitLight'],
    learn: ['Phases', 'Requests', 'Pedestrian safety'],
    hint: 'Remember a request, and only leave car green when there is one and the green has lasted 5000 ms. Then step through the timed phases.',
    techniques: ['edge', 'phases'],
    sequences: [
      {
        name: 'Cars keep green until someone asks',
        steps: [['No request', {}, 8000, [1, 0, 0, 0, 1]]],
      },
      {
        name: 'A press at the start waits for 5 s of green',
        steps: [
          ['Pressed at once', { pressed: 1 }, 200, [1, 0, 0, 0, 1]],
          ['4.8 s of green', { pressed: 0 }, 4800, [1, 0, 0, 0, 1]],
          ['5 s: amber', {}, 200, [0, 1, 0, 0, 1]],
          ['Amber 2.8 s', {}, 2800, [0, 1, 0, 0, 1]],
          ['All red', {}, 200, [0, 0, 1, 0, 1]],
          ['All red 0.8 s', {}, 800, [0, 0, 1, 0, 1]],
          ['Walk', {}, 200, [0, 0, 1, 1, 0]],
          ['Walk 5.8 s', {}, 5800, [0, 0, 1, 1, 0]],
          ['All red again', {}, 200, [0, 0, 1, 0, 1]],
          ['All red 0.8 s', {}, 800, [0, 0, 1, 0, 1]],
          ['Cars green', {}, 200, [1, 0, 0, 0, 1]],
          ['No new request', {}, 8000, [1, 0, 0, 0, 1]],
        ],
      },
      {
        name: 'A late press changes at once',
        steps: [
          ['Long green', {}, 10000, [1, 0, 0, 0, 1]],
          ['Pressed', { pressed: 1 }, 200, [0, 1, 0, 0, 1]],
        ],
      },
    ],
    solution: {
      state: { phase: 0, phaseStart: 0, request: 0, prev: 0 },
      loop: `
if (phaseStart == 0) {
  phaseStart = millis();
}
if (pressed == 1 && prev == 0 && phase == 0) {
  request = 1;
}
prev = pressed;
if (phase == 0 && request == 1 && millis() - phaseStart >= 5000) {
  phase = 1;
  phaseStart = millis();
  request = 0;
} else if (phase == 1 && millis() - phaseStart >= 3000) {
  phase = 2;
  phaseStart = phaseStart + 3000;
} else if (phase == 2 && millis() - phaseStart >= 1000) {
  phase = 3;
  phaseStart = phaseStart + 1000;
} else if (phase == 3 && millis() - phaseStart >= 6000) {
  phase = 4;
  phaseStart = phaseStart + 6000;
} else if (phase == 4 && millis() - phaseStart >= 1000) {
  phase = 0;
  phaseStart = phaseStart + 1000;
}
write(green, phase == 0);
write(amber, phase == 1);
write(red, phase >= 2);
write(walkLight, phase == 3);
write(waitLight, phase != 3);`,
    },
    advanced: {
      goal: 'Presses while a crossing is on its way all join that one crossing. Holding the button through a crossing does not ask for another: it must be released and pressed again after the walk.',
      hint: 'Only accept a new press (HIGH now, LOW last pass) while the cars are green; ignore presses during the crossing.',
      sequences: [
        {
          name: 'Many presses, one walk',
          steps: [
            ['Long green', {}, 10000, [1, 0, 0, 0, 1]],
            ...press('pressed', 'Pressed', [0, 1, 0, 0, 1]),
            ...press('pressed', 'Pressed during amber', [0, 1, 0, 0, 1]),
            ['Walk', {}, 3600, [0, 0, 1, 1, 0]],
            ...press('pressed', 'Pressed during the walk', [0, 0, 1, 1, 0]),
            ['Cars green again', {}, 6600, [1, 0, 0, 0, 1]],
            ['No second crossing', {}, 8000, [1, 0, 0, 0, 1]],
          ],
        },
        {
          name: 'A held button gives one crossing',
          steps: [
            ['Long green', {}, 10000, [1, 0, 0, 0, 1]],
            ['Pressed and held', { pressed: 1 }, 200, [0, 1, 0, 0, 1]],
            ['Held through the crossing', {}, 11000, [1, 0, 0, 0, 1]],
            ['Still held', {}, 8000, [1, 0, 0, 0, 1]],
            ['Released', { pressed: 0 }, 200, [1, 0, 0, 0, 1]],
            ['Pressed again', { pressed: 1 }, 200, [0, 1, 0, 0, 1]],
          ],
        },
      ],
    },
  }),
  quest(48, town('roads', 'Community roads'), {
    title: 'Emergency Vehicle Priority',
    quote: 'Fire engines need a green light, but never at the cost of a crash.',
    goal: 'Run the two-road cycle (all red 2 s, first road green 10 s, amber 3 s, all red 2 s, second road green 10 s, amber 3 s). The push buttons are emergency requests for the first and second road. A request for the road that is red ends the other road’s green at once with its amber and all red, then gives the requested road a fresh 10 s green. A request for the road already green restarts its 10 s.',
    ids: ['pushButton', 'pushButton2', ...SIGNALS],
    learn: ['Priority', 'Safe transitions', 'State machines'],
    hint: 'Remember each request. During a green, a request for the other road moves straight to amber. After any all red, a waiting request chooses the next green.',
    techniques: ['edge', 'phases'],
    sequences: [
      {
        name: 'Emergency for the crossing road',
        steps: [
          ['First road green', {}, 5000, heads(G, R)],
          ['Request for the second road', { pressed2: 1 }, 200, heads(Y, R)],
          ['Amber for 2.8 s', { pressed2: 0 }, 2800, heads(Y, R)],
          ['All red', {}, 200, heads(R, R)],
          ['All red 1.8 s', {}, 1800, heads(R, R)],
          ['Second road green', {}, 200, heads(R, G)],
          ['9.8 s of green', {}, 9800, heads(R, G)],
          ['Amber', {}, 200, heads(R, Y)],
        ],
      },
      {
        name: 'Emergency for the road already green',
        steps: [
          ['First road green', {}, 5000, heads(G, R)],
          ['Request for the first road', { pressed: 1 }, 200, heads(G, R)],
          ['9.8 s after the request', { pressed: 0 }, 9800, heads(G, R)],
          ['10 s after it: amber', {}, 200, heads(Y, R)],
        ],
      },
    ],
    solution: {
      state: {
        phase: 0,
        phaseStart: 0,
        length: 2000,
        wantA: 0,
        wantB: 0,
        prevA: 0,
        prevB: 0,
        held: 0,
      },
      loop: `
if (phaseStart == 0) {
  phaseStart = millis();
}
if (pressed == 1 && prevA == 0) {
  wantA = 1;
}
if (pressed2 == 1 && prevB == 0) {
  wantB = 1;
}
prevA = pressed;
prevB = pressed2;
if (phase == 1 && wantA == 1) {
  wantA = 0;
  held = 1;
  phaseStart = millis();
}
if (phase == 4 && wantB == 1) {
  wantB = 0;
  held = 1;
  phaseStart = millis();
}
if (phase == 1 && wantB == 1 && held == 0) {
  phase = 2;
  phaseStart = millis();
}
if (phase == 4 && wantA == 1 && held == 0) {
  phase = 5;
  phaseStart = millis();
}
if (phase == 0 || phase == 3) {
  length = 2000;
} else if (phase == 1 || phase == 4) {
  length = 10000;
} else {
  length = 3000;
}
if (millis() - phaseStart >= length) {
  phaseStart = phaseStart + length;
  held = 0;
  if (phase == 0 || phase == 3) {
    if (wantA == 1) {
      phase = 1;
      wantA = 0;
      held = 1;
    } else if (wantB == 1) {
      phase = 4;
      wantB = 0;
      held = 1;
    } else if (phase == 0) {
      phase = 1;
    } else {
      phase = 4;
    }
  } else {
    phase = phase + 1;
    if (phase == 6) {
      phase = 0;
    }
  }
}
write(red, phase != 1 && phase != 2);
write(amber, phase == 2);
write(green, phase == 1);
write(red2, phase != 4 && phase != 5);
write(amber2, phase == 5);
write(green2, phase == 4);`,
    },
    advanced: {
      goal: 'A priority green is held for its full 10 s: a request for the other road made during it waits, then gets the normal amber 3 s and all red 2 s before its own green. Repeated requests for the same road count once.',
      hint: 'Mark a green given for a request as held; while held, a request for the other road only waits.',
      sequences: [
        {
          name: 'The other road waits for the priority green',
          steps: [
            ['First road green', {}, 3000, heads(G, R)],
            ['Request for the second road', { pressed2: 1 }, 200, heads(Y, R)],
            ['Second road green', { pressed2: 0 }, 5000, heads(R, G)],
            ...press('pressed', 'Request for the first road', heads(R, G)),
            ['Priority green held', {}, 9400, heads(R, G)],
            ['10 s of priority green: amber', {}, 400, heads(R, Y)],
            ['All red', {}, 3000, heads(R, R)],
            ['First road green', {}, 2000, heads(G, R)],
          ],
        },
        {
          name: 'Repeated requests count once',
          steps: [
            ['First road green', {}, 3000, heads(G, R)],
            ...press('pressed2', 'Request for the second road', heads(Y, R)),
            ...press('pressed2', 'Again', heads(Y, R)),
            ['Second road green', {}, 5000, heads(R, G)],
            ['Its 10 s end', {}, 9600, heads(R, Y)],
            ['Then the normal cycle', {}, 5000, heads(G, R)],
          ],
        },
      ],
    },
  }),
  quest(49, town('school', 'Neighbourhood school'), {
    title: 'School-Zone Speed Sign',
    quote: 'Cars speed past the school gate. Flash a warning at drivers going too fast.',
    goal: 'Light the warning LED when the speed radar reads above 40 km/h.',
    ids: ['speed', 'led'],
    conditions: ['speed > 40'],
    learn: ['Calibrated input', 'Road safety'],
    hint: 'speed > 40.',
    scenarios: [
      ['40 km/h', { speed: 40 }, [0]],
      ['41 km/h', { speed: 41 }, [1]],
      ['Slow', { speed: 20 }, [0]],
    ],
    advanced: {
      ids: ['speed', 'clock', 'led', 'buzzer'],
      conditions: [
        '((clock >= 800 && clock < 900) || (clock >= 1500 && clock < 1600)) && speed > 40 || (clock < 800 || (clock >= 900 && clock < 1500) || clock >= 1600) && speed > 60',
        '((clock >= 800 && clock < 900) || (clock >= 1500 && clock < 1600)) && speed > 50 || (clock < 800 || (clock >= 900 && clock < 1500) || clock >= 1600) && speed > 70',
      ],
      goal: 'The limit is 40 km/h from 08:00 to 08:59 and from 15:00 to 15:59 (school times), and 60 km/h otherwise. Light the LED above the limit, and also sound the buzzer more than 10 km/h above it.',
      hint: 'Work out whether it is school time from the clock, then compare speed with the limit (LED) and the limit plus 10 (buzzer).',
      techniques: ['schedule'],
      scenarios: [
        ['09:00, 50 km/h', { clock: 900, speed: 50 }, [0, 0]],
        ['08:00, 50 km/h', { clock: 800, speed: 50 }, [1, 0]],
        ['08:00, 51 km/h', { clock: 800, speed: 51 }, [1, 1]],
        ['15:30, 45 km/h', { clock: 1530, speed: 45 }, [1, 0]],
        ['Noon, 60 km/h', { clock: 1200, speed: 60 }, [0, 0]],
        ['Noon, 61 km/h', { clock: 1200, speed: 61 }, [1, 0]],
        ['Noon, 71 km/h', { clock: 1200, speed: 71 }, [1, 1]],
        ['07:59, 50 km/h', { clock: 759, speed: 50 }, [0, 0]],
      ],
    },
  }),
  quest(50, town('roads', 'Community roads'), {
    title: 'Traffic Queue Detector',
    quote: 'The two roads should take turns safely.',
    goal: 'Run two signal heads: all red 2 s, first road green 10 s, amber 3 s, all red 2 s, second road green 10 s, amber 3 s, and repeat. Never two greens.',
    ids: SIGNALS,
    learn: ['Phases', 'Safe sequencing'],
    hint: 'Six phases; set every lamp from the phase.',
    techniques: ['phases'],
    sequences: [{ name: 'Two roads take turns', steps: phaseSteps(CYCLE, 2) }],
    solution: {
      state: { phase: 0, phaseStart: 0, length: 2000, greenA: 10000, greenB: 10000 },
      loop: twoRoads(''),
    },
    advanced: {
      ids: ['queue', 'queue2', ...SIGNALS],
      goal: 'At the start of each green, give that road 20 s if 5 or more vehicles are queueing on it (its queue counter), or 10 s otherwise. A queue that changes during a green does not change that green.',
      hint: 'Choose the green time during the all red just before it, from that road’s queue.',
      sequences: [
        {
          name: 'Long queues get longer greens',
          env: { queue: 4, queue2: 5 },
          steps: phaseSteps(
            [
              [2000, heads(R, R)],
              [10000, heads(G, R)],
              [3000, heads(Y, R)],
              [2000, heads(R, R)],
              [20000, heads(R, G)],
              [3000, heads(R, Y)],
            ],
            1,
          ),
        },
        {
          name: 'A queue changing mid-green does not change it',
          env: { queue: 6, queue2: 2 },
          steps: [
            ['Green starts', {}, 2200, heads(G, R)],
            ['Queue drops mid-green', { queue: 0 }, 19800, heads(G, R)],
            ['20 s green ends', {}, 200, heads(Y, R)],
          ],
        },
      ],
      solution: {
        state: { phase: 0, phaseStart: 0, length: 2000, greenA: 10000, greenB: 10000 },
        loop: twoRoads(`
if (phase == 0) {
  if (queue >= 5) {
    greenA = 20000;
  } else {
    greenA = 10000;
  }
}
if (phase == 3) {
  if (queue2 >= 5) {
    greenB = 20000;
  } else {
    greenB = 10000;
  }
}`),
      },
    },
  }),
  quest(51, town('parking', 'Parking area'), {
    title: 'Car-Park Availability',
    quote: 'Our car park has 10 spaces. Stop letting cars in when it is full.',
    goal: 'Count cars: start at 0; the entry beam adds one (only while there is space), the exit beam takes one away (never below 0). Keep the barrier open while fewer than 10 cars are parked. Print the count on every pass.',
    ids: ['entryBeam', 'exitBeam', 'parkBarrier'],
    learn: ['Counting', 'Capacity limits'],
    hint: 'Count beam edges; the barrier is count < 10.',
    techniques: ['edge', 'counter'],
    sequences: [
      {
        name: 'Fills up at 10',
        steps: [
          ...presses('entry', 'Car', 9),
          { label: 'Nine parked', ms: 200, expect: [1], check: printed(9) },
          ...press('entry', 'Tenth car'),
          { label: 'Full', ms: 200, expect: [0], check: printed(10) },
          ...press('exit', 'A car leaves'),
          { label: 'Space again', ms: 200, expect: [1], check: printed(9) },
        ],
      },
    ],
    solution: {
      state: { count: 0, prevIn: 0, prevOut: 0 },
      loop: `
if (exit == 1 && prevOut == 0 && count > 0) {
  count = count - 1;
}
if (entry == 1 && prevIn == 0 && count < 10) {
  count = count + 1;
}
prevIn = entry;
prevOut = exit;
write(parkBarrier, count < 10);
print(count);`,
    },
    advanced: {
      goal: 'Handle the exit before the entry in the same pass, so a car arriving just as one leaves a full car park gets in. An arrival at a full car park with nobody leaving is turned away. The exit always works.',
      hint: 'Process the exit beam first, then the entry beam with the updated count.',
      sequences: [
        {
          name: 'Out and in together when full',
          steps: [
            ...presses('entry', 'Car', 10),
            { label: 'Full', ms: 200, expect: [0], check: printed(10) },
            ...press('entry', 'Arrival while full'),
            { label: 'Turned away', ms: 200, expect: [0], check: printed(10) },
            ['One out, one in together', { entry: 1, exit: 1 }, 200, null],
            {
              label: 'Still 10',
              env: { entry: 0, exit: 0 },
              ms: 200,
              expect: [0],
              check: printed(10),
            },
          ],
        },
      ],
    },
  }),
  quest(52, town('parking', 'Parking area'), {
    title: 'Bicycle Dock Check-In',
    quote: 'Show riders their bike is properly docked.',
    goal: 'Light the green indicator while the dock contact reads HIGH.',
    ids: ['dock', 'green'],
    conditions: ['docked == 1'],
    learn: ['Digital input', 'Feedback'],
    hint: 'docked == 1.',
    scenarios: [
      ['Docked', { docked: 1 }, [1]],
      ['Empty', { docked: 0 }, [0]],
    ],
    advanced: {
      goal: 'Only confirm a bike after the contact has stayed HIGH for 2 seconds without a break. Any LOW clears the confirmation at once and starts the 2 seconds again.',
      hint: 'Time how long docked == 1 has lasted; reset the start time on any LOW.',
      techniques: ['duration'],
      sequences: [
        {
          name: 'Two seconds of contact',
          tick: 100,
          steps: [
            ['Empty dock', {}, 500, [0]],
            ['Pushed in, 1.9 s', { docked: 1 }, 2000, [0]],
            ['2 s', {}, 100, [1]],
            ['Wobbles out', { docked: 0 }, 100, [0]],
            ['Back in, 1.9 s', { docked: 1 }, 2000, [0]],
            ['2 s again', {}, 100, [1]],
          ],
        },
      ],
      solution: {
        delay: 100,
        state: { since: 0 },
        loop: `
if (docked == 1) {
  if (since == 0) {
    since = millis();
  }
} else {
  since = 0;
}
write(green, since != 0 && millis() - since >= 2000);`,
      },
    },
  }),
  quest(53, town('busdepot', 'Riverside bus depot'), {
    title: 'Bus Shelter Lighting',
    quote: 'Keep the depot’s bus shelter welcoming after dark when someone is waiting.',
    goal: 'Turn the porch light on when the motion sensor reads HIGH and the light reading is below 1800. Otherwise keep it off.',
    ids: ['pir', 'ldr', 'porch'],
    conditions: ['motion == 1 && light < 1800'],
    learn: ['AND logic', 'Digital and analogue', 'Saving energy'],
    hint: 'Combine motion == 1 with light < 1800. Nobody there means no light.',
    scenarios: [
      ['Dark, someone waiting', { motion: 1, light: 10 }, [1]],
      ['Bright, someone waiting', { motion: 1, light: 80 }, [0]],
      ['Dark and empty', { motion: 0, light: 10 }, [0]],
    ],
    advanced: {
      ids: ['pir', 'ldr', 'rain', 'porch'],
      conditions: ['motion == 1 && (light < 1800 || rain >= 2500)'],
      goal: 'Turn the light on when someone is there (motion HIGH) and it is either dark (below 1800) or raining heavily (2500 or more).',
      hint: 'Group the OR in brackets: motion == 1 && (light < 1800 || rain >= 2500).',
      scenarios: [
        ['Bright, heavy rain, someone waiting', { motion: 1, light: 80, rain: 70 }, [1]],
        ['Heavy rain, empty', { motion: 0, light: 80, rain: 70 }, [0]],
        ['Dark, someone waiting', { motion: 1, light: 10, rain: 0 }, [1]],
        ['Bright and dry, someone waiting', { motion: 1, light: 80, rain: 0 }, [0]],
      ],
    },
  }),
  quest(54, town('parking', 'Parking area'), {
    title: 'Charging-Bay Demonstration',
    quote: 'Charge the demonstration battery, but never overcharge it.',
    goal: 'Run the charger while the enable switch (arm button) is HIGH and the battery is below 90 %.',
    ids: ['battery', 'button', 'charger'],
    conditions: ['armed == 1 && battery < 90'],
    learn: ['AND logic', 'Battery care'],
    hint: 'armed == 1 && battery < 90.',
    scenarios: [
      ['Enabled, 89 %', { armed: 1, battery: 89 }, [1]],
      ['Enabled, 90 %', { armed: 1, battery: 90 }, [0]],
      ['Disabled', { armed: 0, battery: 50 }, [0]],
    ],
    advanced: {
      goal: 'The charger starts off. While enabled, start charging at 30 % or below and stop at 90 % or above, keeping its state in between. Disabling stops it and forgets it was charging.',
      hint: 'Hysteresis on battery while armed == 1; set charging = 0 whenever armed == 0.',
      techniques: ['hysteresis'],
      sequences: [
        {
          name: 'Charge from 30 % to 90 %',
          env: { armed: 1 },
          steps: [
            ['50 % at start', { battery: 50 }, 1000, [0]],
            ['30 %', { battery: 30 }, 1000, [1]],
            ['70 %', { battery: 70 }, 1000, [1]],
            ['89 %', { battery: 89 }, 1000, [1]],
            ['90 %', { battery: 90 }, 1000, [0]],
            ['70 % again', { battery: 70 }, 1000, [0]],
          ],
        },
        {
          name: 'Disabling clears it',
          env: { armed: 1 },
          steps: [
            ['30 %', { battery: 30 }, 1000, [1]],
            ['Disabled at 50 %', { battery: 50, armed: 0 }, 1000, [0]],
            ['Enabled again at 50 %', { armed: 1 }, 1000, [0]],
          ],
        },
      ],
      solution: {
        state: { charging: 0 },
        loop: `
if (armed == 0) {
  charging = 0;
} else if (battery <= 30) {
  charging = 1;
} else if (battery >= 90) {
  charging = 0;
}
write(charger, charging);`,
      },
    },
  }),
  quest(55, town('roads', 'Community roads'), {
    title: 'Railway-Crossing Model',
    quote: 'Our model railway crossing must close before the train arrives.',
    goal: 'The barrier (gate) starts open. A train breaking the approach beam (entry beam) starts the red warning lamp, and 3 seconds later the barrier closes. A train breaking the clear beam (exit beam) opens the barrier and stops the warning.',
    ids: ['entryBeam', 'exitBeam', 'gate', 'red'],
    learn: ['Events', 'Timed sequences', 'Safety'],
    hint: 'Use a phase: idle, warning (note the time), closed. Move from warning to closed after 3000 ms; the clear beam returns to idle.',
    techniques: ['edge', 'phases'],
    sequences: [
      {
        name: 'Warn, close, then open',
        steps: [
          ['Idle', {}, 1000, [1, 0]],
          ['Train approaching', { entry: 1 }, 200, [1, 1]],
          ['2.8 s of warning', { entry: 0 }, 2800, [1, 1]],
          ['3 s: barrier down', {}, 200, [0, 1]],
          ['Train passing', {}, 3000, [0, 1]],
          ['Train clear', { exit: 1 }, 200, [1, 0]],
          ['Clear beam released', { exit: 0 }, 1000, [1, 0]],
        ],
      },
    ],
    solution: {
      state: { phase: 0, started: 0, cleared: 0, prevIn: 0, prevOut: 0 },
      loop: `
if (entry == 1 && prevIn == 0 && phase == 0) {
  phase = 1;
  started = millis();
  cleared = 0;
}
if (exit == 1 && prevOut == 0 && phase != 0) {
  cleared = 1;
}
prevIn = entry;
prevOut = exit;
if (phase == 2 && cleared == 1) {
  phase = 0;
}
if (phase == 1 && millis() - started >= 3000) {
  phase = 2;
}
write(gate, phase != 2);
write(red, phase != 0);`,
    },
    advanced: {
      goal: 'A clear signal during the 3-second warning must not cut it short: the barrier still closes, then opens. Another approach while the crossing is protected changes nothing. A clear signal with no train approaching is ignored.',
      hint: 'Remember a clear that arrives during the warning, and act on it only once the barrier has closed.',
      sequences: [
        {
          name: 'An early clear still closes first',
          steps: [
            ['Train approaching', { entry: 1 }, 200, [1, 1]],
            ['Clear 1 s later', { entry: 0, exit: 1 }, 1000, [1, 1]],
            ['Warning continues', { exit: 0 }, 1800, [1, 1]],
            ['3 s: barrier down', {}, 200, [0, 1]],
            ['Then up', {}, 200, [1, 0]],
          ],
        },
        {
          name: 'A second approach keeps it closed',
          steps: [
            ['Train approaching', { entry: 1 }, 200, [1, 1]],
            ['Barrier down', { entry: 0 }, 3000, [0, 1]],
            ...press('entry', 'Another approach', [0, 1]),
            ['Still closed', {}, 3000, [0, 1]],
          ],
        },
        {
          name: 'A clear with no train is ignored',
          steps: [...press('exit', 'Clear while idle', [1, 0]), ['Idle', {}, 1000, [1, 0]]],
        },
      ],
    },
  }),
  quest(59, home('Greenhouse'), {
    title: 'Weather Data Goes Missing',
    quote: 'The greenhouse fan follows the weather service. What if the service fails?',
    goal: 'With valid data (data valid flag HIGH), run the fan at an outdoor temperature of 30 °C or above. With invalid data, keep the fan off and light the fault indicator.',
    ids: ['outside', 'dataOk', 'fan', 'faultLed'],
    conditions: ['dataOk == 1 && outdoorTemp >= 30', 'dataOk == 0'],
    learn: ['Validating data', 'Fail-safe outputs'],
    hint: 'Fan: dataOk == 1 && outdoorTemp >= 30. Fault: dataOk == 0.',
    techniques: ['validate'],
    scenarios: [
      ['Valid, 31 °C', { dataOk: 1, outdoorTemp: 31 }, [1, 0]],
      ['Invalid, 31 °C', { dataOk: 0, outdoorTemp: 31 }, [0, 1]],
      ['Valid, 25 °C', { dataOk: 1, outdoorTemp: 25 }, [0, 0]],
    ],
    advanced: {
      ids: ['outside', 'dataOk', 'dataAge', 'fan', 'faultLed'],
      conditions: [
        'dataOk == 1 && dataAge < 900 && outdoorTemp >= 30',
        'dataOk == 0 || dataAge >= 900',
      ],
      goal: 'Treat data 900 seconds old or older as stale, like invalid data. Only valid, fresh data clears the fault, and the fan never acts on stale readings.',
      hint: 'Valid and fresh means dataOk == 1 && dataAge < 900.',
      scenarios: [
        ['899 s old, 31 °C', { dataOk: 1, dataAge: 899, outdoorTemp: 31 }, [1, 0]],
        ['900 s old', { dataOk: 1, dataAge: 900, outdoorTemp: 31 }, [0, 1]],
        ['Fresh update', { dataOk: 1, dataAge: 0, outdoorTemp: 31 }, [1, 0]],
        ['Fresh but invalid', { dataOk: 0, dataAge: 0, outdoorTemp: 31 }, [0, 1]],
      ],
    },
  }),
  quest(60, home('Greenhouse'), {
    title: 'Forecast-Aware Garden Plan',
    quote: 'Why water the beds if it is going to pour tomorrow?',
    goal: 'Open the valve when the soil reading is below 2400 and the tank reading is above 400.',
    ids: ['soil', 'level', 'valve'],
    conditions: ['soil < 2400 && tank > 400'],
    learn: ['AND logic', 'Irrigation'],
    hint: 'soil < 2400 && tank > 400.',
    scenarios: [
      ['Dry, full tank', { soil: 10, tank: 90 }, [1]],
      ['Wet soil', { soil: 80, tank: 90 }, [0]],
      ['Low tank', { soil: 10, tank: A(400) }, [0]],
    ],
    advanced: {
      ids: ['soil', 'level', 'forecast', 'valve', 'amber'],
      conditions: ['tank > 400 && (soil < 1000 || (soil < 2400 && forecast < 70))', 'forecast < 0'],
      goal: 'If the rain forecast is 70 % or more, wait for the rain unless the soil is very dry (below 1000). The tank must always be above 400. With no forecast (-1), use the normal rule and light the amber indicator to show the plan is uncertain.',
      hint: 'Valve: tank > 400 && (soil < 1000 || (soil < 2400 && forecast < 70)). A forecast of -1 is below 70, so it falls back to the normal rule. Amber: forecast < 0.',
      techniques: ['validate'],
      scenarios: [
        ['Soil 1500, 70 % forecast', { soil: A(1500), tank: 90, forecast: 70 }, [0, 0]],
        ['Soil 999, 70 % forecast', { soil: A(999), tank: 90, forecast: 70 }, [1, 0]],
        ['Soil 1000, 70 % forecast', { soil: A(1000), tank: 90, forecast: 70 }, [0, 0]],
        ['Soil 1500, 69 % forecast', { soil: A(1500), tank: 90, forecast: 69 }, [1, 0]],
        ['Soil 1500, no forecast', { soil: A(1500), tank: 90, forecast: -1 }, [1, 1]],
        ['Very dry, low tank', { soil: 5, tank: A(400), forecast: 10 }, [0, 0]],
      ],
    },
  }),
];
