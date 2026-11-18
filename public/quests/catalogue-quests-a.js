import { A, L, home, town, quest, press } from './catalogue-kit.js';
// Catalogue quests Q001–Q030: home lighting and comfort, bathrooms and kitchens, bedrooms and
// assisted living, gardens, and rural infrastructure. Q021–Q026 are already in the game (the
// Victorian farm quests and Garden Frost Alert), so they are not repeated.
export const catalogueQuestsA = [
  quest(1, home('Utility room'), {
    title: 'Keep the Harvest Cool',
    quote:
      'Our picked vegetables wait in the utility room before market day. Could the buzzer warn me when it gets too warm in there?',
    goal: 'Sound the buzzer when the temperature is above 8 °C. Keep it off at 8 °C or below.',
    ids: ['temp', 'buzzer'],
    conditions: ['temp > 8'],
    learn: ['Analogue input', 'Comparisons', 'Cold storage'],
    hint: 'Compare temp > 8. Exactly 8 °C is still cool enough, so the buzzer stays off.',
    scenarios: [
      ['Cold store', { temp: 5 }, [0]],
      ['Exactly 8 °C', { temp: 8 }, [0]],
      ['Too warm', { temp: 9 }, [1]],
    ],
    advanced: {
      ids: ['temp', 'door', 'buzzer', 'led'],
      conditions: ['temp > 8', 'door == 1'],
      goal: 'Sound the buzzer above 8 °C and light the warning LED while the door contact reads HIGH (open). Each output works on its own.',
      hint: 'Write two separate if/else blocks: temp > 8 for the buzzer and door == 1 for the LED. An open door must not change the temperature warning.',
      scenarios: [
        ['Cold and closed', { temp: 5, door: 0 }, [0, 0]],
        ['Door left open', { temp: 5, door: 1 }, [0, 1]],
        ['Warm and closed', { temp: 9, door: 0 }, [1, 0]],
        ['Warm and open', { temp: 9, door: 1 }, [1, 1]],
        ['Exactly 8 °C, open', { temp: 8, door: 1 }, [0, 1]],
      ],
    },
  }),
  quest(2, town('shop', 'Shop floor'), {
    title: "The Shop's Evening Sign",
    quote: 'Please light the sign after dark, but only while we are open.',
    goal: 'Turn the sign (RGB light) on when the light reading is below 1800 and the open switch (arm button) reads HIGH. Otherwise keep it off.',
    ids: ['ldr', 'button', 'rgb'],
    conditions: ['light < 1800 && armed == 1'],
    learn: ['AND logic', 'Analogue and digital', 'Opening hours'],
    hint: 'Combine light < 1800 with armed == 1 using &&. A dark, closed shop keeps the sign off.',
    scenarios: [
      ['Dark and open', { light: 10, armed: 1 }, [1]],
      ['Dark and closed', { light: 10, armed: 0 }, [0]],
      ['Bright and open', { light: 80, armed: 1 }, [0]],
      ['Light at 1800, open', { light: A(1800), armed: 1 }, [0]],
    ],
    advanced: {
      ids: ['ldr', 'button', 'pot', 'rgb', 'led'],
      conditions: ['light < 1800 && armed == 1', 'armed == 0 && pot >= 2048'],
      goal: 'Keep the sign rule. Also light the warning LED when the shop is closed (switch LOW) and the dial reads 2048 or more, as a reminder that the sign is still turned up.',
      hint: 'The warning needs armed == 0 && pot >= 2048. The sign stays off while the shop is closed, whatever the dial says.',
      scenarios: [
        ['Dark and open', { light: 10, armed: 1, pot: 10 }, [1, 0]],
        ['Closed, dial up', { light: 10, armed: 0, pot: A(2048) }, [0, 1]],
        ['Closed, dial just down', { light: 10, armed: 0, pot: A(2047) }, [0, 0]],
        ['Open, dial up', { light: 10, armed: 1, pot: 90 }, [1, 0]],
        ['Bright and open', { light: 80, armed: 1, pot: 10 }, [0, 0]],
      ],
    },
  }),
  quest(3, home('Living room'), {
    title: 'Reading Corner',
    quote: 'I read in the corner chair in the evening. Light the lamp when I turn the dial up.',
    goal: 'Turn the lamp on when the dial reads 2048 or more and the light reading is below 2000. Otherwise keep it off.',
    ids: ['pot', 'ldr', 'led'],
    conditions: ['pot >= 2048 && light < 2000'],
    learn: ['AND logic', 'Two analogue inputs', 'User input'],
    hint: 'pot >= 2048 && light < 2000. Exactly 2048 counts as turned up; exactly 2000 is too bright.',
    scenarios: [
      ['Dial up, dim room', { pot: A(2048), light: A(1999) }, [1]],
      ['Dial just down', { pot: A(2047), light: A(1999) }, [0]],
      ['Full dial, bright room', { pot: 100, light: A(2000) }, [0]],
      ['Full dial at night', { pot: 100, light: 5 }, [1]],
    ],
    advanced: {
      goal: 'Set the lamp brightness from the dial: 0–4095 maps to 0–255, rounded to the nearest whole number, while the light reading is below 2000. At 2000 or above the brightness is 0.',
      hint: 'Brightness is (pot * 255 + 2047) / 4095 with whole numbers. Use analogWrite (duty_u16(level * 257) in MicroPython), and write 0 when the room is bright.',
      techniques: ['pwm'],
      sequences: [
        {
          name: 'The dial sets the brightness',
          steps: [
            ['Dark, dial at 0', { light: A(1000), pot: 0 }, 400, [L(0)]],
            ['Dark, dial at 2048', { pot: A(2048) }, 400, [L(128)]],
            ['Dark, full dial', { pot: A(4095) }, 400, [L(255)]],
            ['Light at 1999', { light: A(1999) }, 400, [L(255)]],
            ['Bright room, full dial', { light: A(2000) }, 400, [L(0)]],
          ],
        },
      ],
      solution: {
        state: { level: 0 },
        loop: `
if (light < 2000) {
  level = idiv(pot * 255 + 2047, 4095);
} else {
  level = 0;
}
pwm(led, level);`,
      },
    },
  }),
  quest(4, home('Living room'), {
    title: 'Curtains for a Hot Afternoon',
    quote: 'The afternoon sun makes the living room far too warm. Could the blinds close for it?',
    goal: 'Close the blinds (servo on) when the light reading is above 3000. Open them (servo off) at 3000 or below.',
    ids: ['ldr', 'servo'],
    conditions: ['light > 3000'],
    learn: ['Analogue input', 'Servo output', 'Greater than'],
    hint: 'Compare light > 3000. Exactly 3000 leaves the blinds open.',
    scenarios: [
      ['Soft light', { light: A(1000) }, [0]],
      ['At 3000', { light: A(3000) }, [0]],
      ['Just above 3000', { light: A(3001) }, [1]],
    ],
    advanced: {
      ids: ['ldr', 'temp', 'servo'],
      conditions: ['light > 3000 && temp > 26'],
      goal: 'Close the blinds only when the light reading is above 3000 and the temperature is above 26 °C. Otherwise open them.',
      hint: 'Join light > 3000 and temp > 26 with &&. Bright sun in a cool room leaves the blinds open.',
      scenarios: [
        ['Bright and hot', { light: A(3500), temp: 27 }, [1]],
        ['Bright, exactly 26 °C', { light: A(3500), temp: 26 }, [0]],
        ['Dim and hot', { light: A(1000), temp: 30 }, [0]],
        ['Bright and cool', { light: A(3500), temp: 20 }, [0]],
      ],
    },
  }),
  quest(5, home('Living room'), {
    title: 'Stop the Fan Flicker',
    quote:
      'When it hovers around 28 °C the fan clicks on and off all afternoon. Can it settle down?',
    goal: 'The fan starts off. Switch it on at 30 °C or above and off at 26 °C or below. In between, keep doing what it was doing.',
    ids: ['temp', 'fan'],
    learn: ['Hysteresis', 'Remembering state', 'Two thresholds'],
    hint: 'Keep fanOn in a variable outside the loop: set it to 1 at temp >= 30, to 0 at temp <= 26, and leave it alone in between.',
    techniques: ['hysteresis'],
    sequences: [
      {
        name: 'Two thresholds, no flicker',
        steps: [
          ['Starts at 28 °C', { temp: 28 }, 1000, [0]],
          ['29.5 °C', { temp: 29.5 }, 1000, [0]],
          ['30 °C', { temp: 30 }, 1000, [1]],
          ['Back to 28 °C', { temp: 28 }, 1000, [1]],
          ['26.5 °C', { temp: 26.5 }, 1000, [1]],
          ['26 °C', { temp: 26 }, 1000, [0]],
          ['28 °C again', { temp: 28 }, 1000, [0]],
        ],
      },
    ],
    solution: {
      state: { fanOn: 0 },
      loop: `
if (temp >= 30) {
  fanOn = 1;
} else if (temp <= 26) {
  fanOn = 0;
}
write(fan, fanOn);`,
    },
    advanced: {
      ids: ['temp', 'occupancy', 'fan'],
      goal: 'While someone is home (presence HIGH) use on at 28 °C or above and off at 24 °C or below; otherwise use 30 °C and 26 °C. Choose the thresholds again on every pass.',
      hint: 'Pick onAt and offAt from occupied first, then apply the same hysteresis with those two numbers.',
      sequences: [
        {
          name: 'Empty room uses 30 °C and 26 °C',
          env: { occupied: 0 },
          steps: [
            ['Starts at 28 °C', { temp: 28 }, 1000, [0]],
            ['30 °C', { temp: 30 }, 1000, [1]],
            ['28 °C', { temp: 28 }, 1000, [1]],
            ['26 °C', { temp: 26 }, 1000, [0]],
          ],
        },
        {
          name: 'Occupied room uses 28 °C and 24 °C',
          env: { occupied: 1 },
          steps: [
            ['Starts at 25 °C', { temp: 25 }, 1000, [0]],
            ['28 °C', { temp: 28 }, 1000, [1]],
            ['25 °C', { temp: 25 }, 1000, [1]],
            ['24 °C', { temp: 24 }, 1000, [0]],
          ],
        },
        {
          name: 'The thresholds follow who is home',
          steps: [
            ['Empty at 29 °C', { occupied: 0, temp: 29 }, 1000, [0]],
            ['Someone arrives', { occupied: 1 }, 1000, [1]],
            ['Leaves at 27 °C', { occupied: 0, temp: 27 }, 1000, [1]],
            ['Empty at 25 °C', { temp: 25 }, 1000, [0]],
          ],
        },
      ],
      solution: {
        state: { fanOn: 0, onAt: 30, offAt: 26 },
        loop: `
if (occupied == 1) {
  onAt = 28;
  offAt = 24;
} else {
  onAt = 30;
  offAt = 26;
}
if (temp >= onAt) {
  fanOn = 1;
} else if (temp <= offAt) {
  fanOn = 0;
}
write(fan, fanOn);`,
      },
    },
  }),
  quest(6, home('Bathroom'), {
    title: 'After-Shower Extractor',
    quote: 'The mirror fogs up after every shower. Run the extractor while it is steamy.',
    goal: 'Run the fan when humidity is above 65 %. Stop at 65 % or below.',
    ids: ['humidity', 'fan'],
    conditions: ['humidity > 65'],
    learn: ['Humidity', 'Ventilation', 'Boundaries'],
    hint: 'Compare humidity > 65. Exactly 65 % leaves the fan off.',
    scenarios: [
      ['64 %', { humidity: 64 }, [0]],
      ['65 %', { humidity: 65 }, [0]],
      ['66 %', { humidity: 66 }, [1]],
    ],
    advanced: {
      goal: 'The fan starts off. It runs while humidity is above 65 %, and keeps running for 30 seconds after the last reading above 65 %. Every new high reading starts the 30 seconds again.',
      hint: 'Note millis() whenever humidity > 65. The fan is on while millis() - lastHigh < 30000.',
      techniques: ['hold'],
      sequences: [
        {
          name: 'Runs on for 30 s after the steam clears',
          steps: [
            ['Dry bathroom at start', { humidity: 50 }, 1000, [0]],
            ['Shower', { humidity: 80 }, 2000, [1]],
            ['Dry, 29.8 s after the last high reading', { humidity: 50 }, 29800, [1]],
            ['30 s after it', {}, 200, [0]],
          ],
        },
        {
          name: 'A new high reading restarts the 30 s',
          steps: [
            ['Shower', { humidity: 80 }, 1000, [1]],
            ['Drying for 29 s', { humidity: 50 }, 29000, [1]],
            ['Steamy again', { humidity: 70 }, 200, [1]],
            ['29.8 s later', { humidity: 50 }, 29800, [1]],
            ['30 s later', {}, 200, [0]],
          ],
        },
      ],
      solution: {
        state: { lastHigh: 0, running: 0 },
        loop: `
if (humidity > 65) {
  lastHigh = millis();
  running = 1;
}
if (running == 1 && millis() - lastHigh >= 30000) {
  running = 0;
}
write(fan, running);`,
      },
    },
  }),
  quest(7, home('Kitchen'), {
    title: 'Kitchen Heat Watch',
    quote: 'Warn me when the stove area gets hot, and sound the alarm if it gets dangerous.',
    goal: 'Light the LED above 35 °C. Sound the buzzer above 45 °C. Each output has its own rule.',
    ids: ['temp', 'led', 'buzzer'],
    conditions: ['temp > 35', 'temp > 45'],
    learn: ['Escalating thresholds', 'Independent outputs', 'Kitchen safety'],
    hint: 'Two if/else blocks on the same reading: temp > 35 for the LED and temp > 45 for the buzzer.',
    scenarios: [
      ['35 °C', { temp: 35 }, [0, 0]],
      ['40 °C', { temp: 40 }, [1, 0]],
      ['46 °C', { temp: 46 }, [1, 1]],
      ['45 °C', { temp: 45 }, [1, 0]],
    ],
    advanced: {
      ids: ['temp', 'pushButton', 'led', 'buzzer'],
      goal: 'A press of the push button while the buzzer sounds silences it for this hot spell. Once the temperature falls to 45 °C or below, the acknowledgement is forgotten, so the next spell sounds again. The LED still follows the temperature.',
      hint: 'Act on a new press (HIGH now, LOW last pass) only while temp > 45. Clear the acknowledgement whenever temp <= 45.',
      techniques: ['edge', 'latch'],
      sequences: [
        {
          name: 'Acknowledging silences this hot spell only',
          steps: [
            ['Very hot', { temp: 46 }, 1000, [1, 1]],
            ...press('pressed', 'Acknowledge', [1, 0]),
            ['Still very hot', { temp: 50 }, 1000, [1, 0]],
            ['Cools to 45 °C', { temp: 45 }, 1000, [1, 0]],
            ['Hot again at 46 °C', { temp: 46 }, 1000, [1, 1]],
          ],
        },
        {
          name: 'A press at a normal temperature changes nothing',
          steps: [
            ['Warm', { temp: 40 }, 1000, [1, 0]],
            ...press('pressed', 'Press while warm', [1, 0]),
            ['Very hot', { temp: 46 }, 1000, [1, 1]],
          ],
        },
      ],
      solution: {
        state: { acked: 0, previous: 0 },
        loop: `
if (pressed == 1 && previous == 0 && temp > 45) {
  acked = 1;
}
previous = pressed;
if (temp <= 45) {
  acked = 0;
}
if (temp > 35) {
  write(led, 1);
} else {
  write(led, 0);
}
if (temp > 45 && acked == 0) {
  write(buzzer, 1);
} else {
  write(buzzer, 0);
}`,
      },
    },
  }),
  quest(8, home('Utility room'), {
    title: 'Washing-Machine Leak',
    quote: 'If the washing machine leaks, shut off its water and warn me before the floor floods.',
    goal: 'Keep the supply valve open while the leak sensor is LOW (dry). When it reads HIGH (wet), close the valve and sound the buzzer.',
    ids: ['leak', 'valve', 'buzzer'],
    conditions: ['leak == 0', 'leak == 1'],
    learn: ['Digital input', 'Fail-safe outputs', 'Two outputs'],
    hint: 'The valve is on when leak == 0 and the buzzer is on when leak == 1.',
    scenarios: [
      ['Dry floor', { leak: 0 }, [1, 0]],
      ['Wet floor', { leak: 1 }, [0, 1]],
      ['Dry again', { leak: 0 }, [1, 0]],
    ],
    advanced: {
      ids: ['leak', 'resetButton', 'valve', 'buzzer'],
      goal: 'A leak shuts the valve and sounds the buzzer until someone presses reset while the floor is dry. The shutdown must survive a power cut: after a restart it stays shut until reset.',
      hint: 'Latch a shut variable when leak == 1 and save it with memoryWrite. Read it back with memoryRead before the loop. Reset only clears it when leak == 0.',
      techniques: ['latch', 'memory'],
      sequences: [
        {
          name: 'The shutdown stays latched',
          steps: [
            ['Dry floor', { leak: 0 }, 1000, [1, 0]],
            ['Leak', { leak: 1 }, 1000, [0, 1]],
            ['Floor dries', { leak: 0 }, 1000, [0, 1]],
          ],
        },
        {
          name: 'Reset only works once the floor is dry',
          steps: [
            ['Leak', { leak: 1 }, 1000, [0, 1]],
            ...press('reset', 'Reset while wet', [0, 1]),
            ['Floor dries', { leak: 0 }, 1000, [0, 1]],
            ...press('reset', 'Reset while dry', [1, 0]),
            ['Dry floor', {}, 1000, [1, 0]],
          ],
        },
        {
          name: 'Still shut after a power cut',
          steps: [
            ['Leak', { leak: 1 }, 1000, [0, 1]],
            ['Floor dries', { leak: 0 }, 1000, [0, 1]],
            { label: 'Power cut and restart', restart: true, ms: 1000, expect: [0, 1] },
            ...press('reset', 'Reset after the restart', [1, 0]),
          ],
        },
      ],
      solution: {
        state: { shut: 0 },
        setup: 'shut = memoryRead("leakShut");',
        loop: `
if (leak == 1) {
  shut = 1;
  memoryWrite("leakShut", 1);
}
if (shut == 1 && reset == 1 && leak == 0) {
  shut = 0;
  memoryWrite("leakShut", 0);
}
if (shut == 1) {
  write(valve, 0);
  write(buzzer, 1);
} else {
  write(valve, 1);
  write(buzzer, 0);
}`,
      },
    },
  }),
  quest(9, home('Utility room'), {
    title: 'Utility Door Reminder',
    quote: 'The utility door lets the cat out. Remind me when it is open.',
    goal: 'Sound the buzzer while the door contact reads HIGH (open). Silence it when closed.',
    ids: ['door', 'buzzer'],
    conditions: ['door == 1'],
    learn: ['Digital input', 'Reminders'],
    hint: 'The buzzer follows door == 1.',
    scenarios: [
      ['Closed', { door: 0 }, [0]],
      ['Open', { door: 1 }, [1]],
    ],
    advanced: {
      goal: 'Only sound the buzzer once the door has stayed open for 20 seconds without closing. Closing silences it at once and starts the count again next time.',
      hint: 'Note the time the door was first seen open, forget it when it closes, and sound the buzzer once millis() minus that time reaches 20000.',
      techniques: ['duration'],
      sequences: [
        {
          name: 'Open for 20 s before the reminder',
          steps: [
            ['Closed', { door: 0 }, 1000, [0]],
            ['Opened, 19.8 s after it was first seen open', { door: 1 }, 20000, [0]],
            ['20 s after it was first seen open', {}, 200, [1]],
            ['Closed', { door: 0 }, 200, [0]],
            ['Reopened: a new 19.8 s', { door: 1 }, 20000, [0]],
            ['20 s again', {}, 200, [1]],
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
if (openedAt != 0 && millis() - openedAt >= 20000) {
  write(buzzer, 1);
} else {
  write(buzzer, 0);
}`,
      },
    },
  }),
  quest(10, home('Kitchen'), {
    title: 'Hands-Free Tap',
    quote:
      'With dough on my hands I cannot turn the tap. Could it run when I hold my hands under it?',
    goal: 'Open the valve while the distance is above 0 and below 15 cm. A distance of 0 means no reading, so the tap stays closed.',
    ids: ['ultra', 'valve'],
    conditions: ['distance > 0 && distance < 15'],
    learn: ['Distance sensing', 'Valid readings', 'Ranges'],
    hint: 'distance > 0 && distance < 15. Exactly 15 cm is too far; 0 is no reading.',
    scenarios: [
      ['Hands under the tap', { distance: 10 }, [1]],
      ['15 cm away', { distance: 15 }, [0]],
      ['No reading', { distance: 0 }, [0]],
      ['Nobody there', { distance: 80 }, [0]],
    ],
    advanced: {
      goal: 'Limit each wash to 10 seconds. After that the tap stays closed until the hands move 15 cm or more away. A reading of 0 closes the tap and does not count as moving away.',
      hint: 'Use an armed variable: the tap runs only while armed, a run longer than 10 s disarms it, and only distance >= 15 arms it again.',
      techniques: ['duration', 'validate'],
      sequences: [
        {
          name: 'Each wash lasts at most 10 s',
          steps: [
            ['Nobody there', { distance: 40 }, 1000, [0]],
            ['Hands held for 9.8 s', { distance: 10 }, 10000, [1]],
            ['10 s', {}, 200, [0]],
            ['Still holding', {}, 3000, [0]],
            ['Hands taken away', { distance: 40 }, 1000, [0]],
            ['Hands back', { distance: 10 }, 1000, [1]],
          ],
        },
        {
          name: 'A missing reading does not rearm the tap',
          steps: [
            ['Hands held for 10 s', { distance: 10 }, 10200, [0]],
            ['No reading', { distance: 0 }, 1000, [0]],
            ['Hands seen again', { distance: 10 }, 1000, [0]],
            ['Hands taken away', { distance: 40 }, 1000, [0]],
            ['Hands back', { distance: 10 }, 1000, [1]],
            ['No reading mid-wash', { distance: 0 }, 400, [0]],
          ],
        },
      ],
      solution: {
        state: { armed: 1, started: 0 },
        loop: `
if (distance >= 15) {
  armed = 1;
  started = 0;
}
if (distance > 0 && distance < 15 && armed == 1) {
  if (started == 0) {
    started = millis();
  }
  if (millis() - started >= 10000) {
    armed = 0;
  }
}
if (distance > 0 && distance < 15 && armed == 1) {
  write(valve, 1);
} else {
  write(valve, 0);
}`,
      },
    },
  }),
  quest(11, home('Garden path'), {
    title: 'Light the Walk Home',
    quote:
      'Light the path when someone walks up it, and keep it lit long enough to reach the door.',
    goal: 'The path lights start off. Motion (HIGH) turns them on. They switch off once 10 seconds have passed since the motion sensor last read HIGH.',
    ids: ['pir', 'led'],
    learn: ['Timers', 'millis()', 'Motion sensing'],
    hint: 'Store millis() each time motion == 1. Keep the lights on while millis() - lastSeen < 10000.',
    techniques: ['hold'],
    sequences: [
      {
        name: 'Lights stay on for 10 s after the last movement',
        steps: [
          ['Nobody there', { motion: 0 }, 1000, [0]],
          ['Someone walks up', { motion: 1 }, 200, [1]],
          ['9.8 s since the last movement', { motion: 0 }, 9800, [1]],
          ['10 s since it', {}, 200, [0]],
        ],
      },
      {
        name: 'More movement keeps them on',
        steps: [
          ['Someone walks up', { motion: 1 }, 200, [1]],
          ['Stops for 8 s', { motion: 0 }, 8000, [1]],
          ['Moves again', { motion: 1 }, 200, [1]],
          ['9.8 s later', { motion: 0 }, 9800, [1]],
          ['10 s later', {}, 200, [0]],
        ],
      },
    ],
    solution: {
      state: { lastSeen: 0, active: 0 },
      loop: `
if (motion == 1) {
  lastSeen = millis();
  active = 1;
}
if (active == 1 && millis() - lastSeen >= 10000) {
  active = 0;
}
write(led, active);`,
    },
    advanced: {
      ids: ['pir', 'ldr', 'led'],
      goal: 'Only work in the dark: at a light reading of 1800 or above the lights go off and the countdown is cleared. When it gets dark again, they need fresh movement to come on.',
      hint: 'Check light >= 1800 first and clear the timer there. Only movement in the dark (light < 1800) starts it.',
      sequences: [
        {
          name: 'Movement in the dark',
          env: { light: A(1799) },
          steps: [
            ['Dark at 1799, nobody there', { motion: 0 }, 1000, [0]],
            ['Someone walks up', { motion: 1 }, 200, [1]],
            ['9.8 s later', { motion: 0 }, 9800, [1]],
            ['10 s later', {}, 200, [0]],
          ],
        },
        {
          name: 'Daylight switches off and clears the countdown',
          env: { light: A(1000) },
          steps: [
            ['Someone walks up in the dark', { motion: 1 }, 200, [1]],
            ['Gone for 2 s', { motion: 0 }, 2000, [1]],
            ['Light reaches 1800', { light: A(1800) }, 200, [0]],
            ['Dark again, no movement', { light: A(1000) }, 1000, [0]],
            ['Movement in daylight', { light: A(3000), motion: 1 }, 1000, [0]],
          ],
        },
      ],
      solution: {
        state: { lastSeen: 0, active: 0 },
        loop: `
if (light >= 1800) {
  active = 0;
} else if (motion == 1) {
  lastSeen = millis();
  active = 1;
}
if (active == 1 && millis() - lastSeen >= 10000) {
  active = 0;
}
write(led, active);`,
      },
    },
  }),
  quest(12, home('Entrance'), {
    title: 'Quiet-Hours Doorbell',
    quote: 'Visitors should know the bell works, but please do not wake the baby at night.',
    goal: 'While the push button is held, light the porch light and sound the buzzer. Otherwise both are off.',
    ids: ['pushButton', 'porch', 'buzzer'],
    conditions: ['pressed == 1', 'pressed == 1'],
    learn: ['Digital input', 'Two outputs'],
    hint: 'Both outputs follow pressed == 1.',
    scenarios: [
      ['Released', { pressed: 0 }, [0, 0]],
      ['Pressed', { pressed: 1 }, [1, 1]],
    ],
    advanced: {
      ids: ['pushButton', 'clock', 'porch', 'buzzer'],
      conditions: ['pressed == 1', 'pressed == 1 && clock >= 700 && clock < 2200'],
      goal: 'From 22:00 until 06:59 a press lights the porch light only. From 07:00 until 21:59 it lights the porch light and sounds the buzzer. The clock reads the time as a number: 2200 is 22:00.',
      hint: 'The buzzer needs pressed == 1 && clock >= 700 && clock < 2200.',
      techniques: ['schedule'],
      scenarios: [
        ['21:59, pressed', { pressed: 1, clock: 2159 }, [1, 1]],
        ['22:00, pressed', { pressed: 1, clock: 2200 }, [1, 0]],
        ['03:00, pressed', { pressed: 1, clock: 300 }, [1, 0]],
        ['06:59, pressed', { pressed: 1, clock: 659 }, [1, 0]],
        ['07:00, pressed', { pressed: 1, clock: 700 }, [1, 1]],
        ['Noon, released', { pressed: 0, clock: 1200 }, [0, 0]],
      ],
    },
  }),
  quest(13, home('Bathroom'), {
    title: 'Help Button',
    quote: 'If I slip in the bathroom, I need a help button that everyone notices.',
    goal: 'While the help button (push button) is held, light the LED and sound the buzzer. Both go off when it is released.',
    ids: ['pushButton', 'led', 'buzzer'],
    conditions: ['pressed == 1', 'pressed == 1'],
    learn: ['Digital input', 'Assisted living'],
    hint: 'Both outputs follow pressed == 1.',
    scenarios: [
      ['Pressed', { pressed: 1 }, [1, 1]],
      ['Released', { pressed: 0 }, [0, 0]],
    ],
    advanced: {
      ids: ['pushButton', 'resetButton', 'led', 'buzzer'],
      goal: 'A help press is remembered until a carer presses the reset button. It never clears by itself. If help and reset are pressed together, help wins.',
      hint: 'Latch help when pressed == 1 and clear it when reset == 1. Check reset first and help second, so help wins a tie.',
      techniques: ['latch'],
      sequences: [
        {
          name: 'Help stays on until reset',
          steps: [
            ['Quiet', {}, 1000, [0, 0]],
            ...press('pressed', 'Help pressed', [1, 1]),
            ['Released for 30 s', {}, 30000, [1, 1]],
            ...press('reset', 'Carer resets', [0, 0]),
            ['Quiet again', {}, 1000, [0, 0]],
          ],
        },
        {
          name: 'Help wins over reset',
          steps: [
            ['Both pressed together', { pressed: 1, reset: 1 }, 200, [1, 1]],
            ['Both released', { pressed: 0, reset: 0 }, 1000, [1, 1]],
          ],
        },
      ],
      solution: {
        state: { help: 0 },
        loop: `
if (reset == 1) {
  help = 0;
}
if (pressed == 1) {
  help = 1;
}
write(led, help);
write(buzzer, help);`,
      },
    },
  }),
  quest(14, home('Bedroom'), {
    title: 'Bedside Brightness',
    quote: 'I would love to dim my bedside light with the dial, not just switch it on and off.',
    goal: 'Set the RGB light brightness from the dial: 0–4095 maps to 0–255, rounded to the nearest whole number.',
    ids: ['pot', 'rgb'],
    learn: ['PWM', 'Mapping ranges', 'Rounding'],
    hint: 'Brightness is (pot * 255 + 2047) / 4095 with whole numbers, written with analogWrite (duty_u16(level * 257) in MicroPython).',
    techniques: ['pwm'],
    sequences: [
      {
        name: 'The dial sets the brightness',
        steps: [
          ['Dial at 0', { pot: 0 }, 400, [L(0)]],
          ['Dial at 1024', { pot: A(1024) }, 400, [L(64)]],
          ['Dial at 2048', { pot: A(2048) }, 400, [L(128)]],
          ['Full dial', { pot: A(4095) }, 400, [L(255)]],
        ],
      },
    ],
    solution: {
      state: { level: 0 },
      loop: `
level = idiv(pot * 255 + 2047, 4095);
pwm(rgb, level);`,
    },
    advanced: {
      ids: ['pot', 'ldr', 'rgb'],
      goal: 'When the light reading is 2500 or more, cap the brightness at 80 so the lamp is not glaring; in the dark the full range is allowed.',
      hint: 'Work out the mapped level first, then if light >= 2500 and level > 80, use 80.',
      sequences: [
        {
          name: 'Bright rooms cap the brightness at 80',
          steps: [
            ['Bright, full dial', { light: A(2500), pot: A(4095) }, 400, [L(80)]],
            ['Dark, full dial', { light: A(2499) }, 400, [L(255)]],
            ['Bright, dial at 0', { light: A(3000), pot: 0 }, 400, [L(0)]],
            ['Bright, dial at 1000', { pot: A(1000) }, 400, [L(62)]],
          ],
        },
      ],
      solution: {
        state: { level: 0 },
        loop: `
level = idiv(pot * 255 + 2047, 4095);
if (light >= 2500 && level > 80) {
  level = 80;
}
pwm(rgb, level);`,
      },
    },
  }),
  quest(15, home('Kitchen'), {
    title: 'Room Comfort Indicator',
    quote: 'One glance should tell me whether the room is cold, comfortable or warm.',
    goal: 'Light blue below 18 °C, green from 18 °C to 24 °C (both included) and red above 24 °C. Exactly one is on.',
    ids: ['temp', 'blue', 'green', 'red'],
    conditions: ['temp < 18', 'temp >= 18 && temp <= 24', 'temp > 24'],
    learn: ['Ranges', 'Exactly one output', 'Inclusive bounds'],
    hint: 'Three rules that never overlap: temp < 18, temp >= 18 && temp <= 24, temp > 24.',
    scenarios: [
      ['17 °C', { temp: 17 }, [1, 0, 0]],
      ['18 °C', { temp: 18 }, [0, 1, 0]],
      ['24 °C', { temp: 24 }, [0, 1, 0]],
      ['25 °C', { temp: 25 }, [0, 0, 1]],
    ],
    advanced: {
      ids: ['temp', 'dataOk', 'blue', 'green', 'red', 'faultLed'],
      conditions: [
        'dataOk == 1 && temp < 18',
        'dataOk == 1 && temp >= 18 && temp <= 24',
        'dataOk == 1 && temp > 24',
        'dataOk == 0',
      ],
      goal: 'When the reading is missing or invalid (data valid flag LOW), turn every colour off and light the fault indicator instead. A valid reading brings the right colour back.',
      hint: 'Add dataOk == 1 && to each colour, and light the fault indicator when dataOk == 0.',
      techniques: ['validate'],
      scenarios: [
        ['Missing reading', { dataOk: 0, temp: 21 }, [0, 0, 0, 1]],
        ['Valid 17 °C', { dataOk: 1, temp: 17 }, [1, 0, 0, 0]],
        ['Valid 21 °C', { dataOk: 1, temp: 21 }, [0, 1, 0, 0]],
        ['Valid 30 °C', { dataOk: 1, temp: 30 }, [0, 0, 1, 0]],
      ],
    },
  }),
  quest(16, home('Garden path'), {
    title: 'Rescue the Washing',
    quote:
      'The washing line runs beside the garden path. Bring it under cover (the motorised gate) before the rain soaks everything.',
    goal: 'Extend the washing line (gate HIGH) while the rain reading is below 400. Retract it (LOW) at 400 or above.',
    ids: ['rain', 'gate'],
    conditions: ['rain < 400'],
    learn: ['Analogue input', 'Less than', 'Weather response'],
    hint: 'Compare rain < 400. HIGH means the line is out in the open.',
    scenarios: [
      ['Dry day', { rain: 0 }, [1]],
      ['Just below 400', { rain: A(399) }, [1]],
      ['At 400', { rain: A(400) }, [0]],
      ['Downpour', { rain: 80 }, [0]],
    ],
    advanced: {
      ids: ['rain', 'wind', 'gate'],
      conditions: ['rain < 400 && wind < 30'],
      goal: 'Extend the line only while the rain reading is below 400 and the wind is below 30 km/h. Retract it otherwise.',
      hint: 'Use rain < 400 && wind < 30. Strong wind alone is enough to bring the washing in.',
      scenarios: [
        ['Dry and calm', { rain: 0, wind: 10 }, [1]],
        ['Dry, wind at 30 km/h', { rain: 0, wind: 30 }, [0]],
        ['Light rain, breeze', { rain: A(399), wind: 29 }, [1]],
        ['Rain, calm', { rain: 60, wind: 5 }, [0]],
      ],
    },
  }),
  quest(17, home('Greenhouse'), {
    title: 'Water at the Right Time',
    quote: 'Water the beds when they are dry, but never empty the tank.',
    goal: 'Run the pump when the soil reading is below 2400 and the tank reading is above 400.',
    ids: ['soil', 'level', 'pump'],
    conditions: ['soil < 2400 && tank > 400'],
    learn: ['AND logic', 'Protecting a reserve'],
    hint: 'soil < 2400 && tank > 400.',
    scenarios: [
      ['Dry, full tank', { soil: 10, tank: 90 }, [1]],
      ['Soil at 2400', { soil: A(2400), tank: 90 }, [0]],
      ['Tank at 400', { soil: 10, tank: A(400) }, [0]],
    ],
    advanced: {
      ids: ['soil', 'level', 'clock', 'pump'],
      conditions: ['soil < 2400 && tank > 400 && clock >= 600 && clock < 800'],
      goal: 'Only water from 06:00 until 07:59, when less water evaporates. Every check must pass: dry soil, water in the tank and the right time. The clock reads 600 for 06:00.',
      hint: 'Add clock >= 600 && clock < 800 to the condition.',
      techniques: ['schedule'],
      scenarios: [
        ['05:59', { soil: 10, tank: 90, clock: 559 }, [0]],
        ['06:00', { soil: 10, tank: 90, clock: 600 }, [1]],
        ['07:59', { soil: 10, tank: 90, clock: 759 }, [1]],
        ['08:00', { soil: 10, tank: 90, clock: 800 }, [0]],
        ['06:30, moist soil', { soil: 80, tank: 90, clock: 630 }, [0]],
      ],
    },
  }),
  quest(18, home('Greenhouse'), {
    title: 'Two Garden Beds',
    quote: 'The vegetable bed and the flower bed dry out at different speeds.',
    goal: 'Open each bed’s valve when its own soil reading is below 2400 and the shared tank reading is above 400. The second valve follows the second soil probe.',
    ids: ['soil', 'soil2', 'level', 'valve', 'valve2'],
    conditions: ['soil < 2400 && tank > 400', 'soil2 < 2400 && tank > 400'],
    learn: ['Independent outputs', 'Shared reserve'],
    hint: 'Two rules, one per bed, both needing tank > 400.',
    budget: { wh: 0.15, litres: 45 },
    scenarios: [
      ['First bed dry', { soil: 10, soil2: 80, tank: 90 }, [1, 0]],
      ['Second bed dry', { soil: 80, soil2: 10, tank: 90 }, [0, 1]],
      ['Both dry', { soil: 10, soil2: 10, tank: 90 }, [1, 1]],
      ['Low tank', { soil: 10, soil2: 10, tank: A(400) }, [0, 0]],
    ],
    advanced: {
      goal: 'The pipe can only feed one bed at a time. When both beds need water, water the first for 10 seconds, then the second for 10 seconds, and keep alternating. A bed that needs water alone gets it continuously. A low tank closes both at once.',
      hint: 'Keep whose turn it is and when the turn started. Only alternate while both beds need water.',
      techniques: ['phases'],
      sequences: [
        {
          name: 'Both beds dry take turns',
          env: { tank: 90 },
          steps: [
            ['Both dry', { soil: 10, soil2: 10 }, 200, [1, 0]],
            ['9.8 s in', {}, 9800, [1, 0]],
            ['10 s: second bed’s turn', {}, 200, [0, 1]],
            ['19.8 s in', {}, 9800, [0, 1]],
            ['20 s: first bed again', {}, 200, [1, 0]],
          ],
        },
        {
          name: 'A bed on its own is watered continuously',
          env: { tank: 90 },
          steps: [['Only the first bed dry', { soil: 10, soil2: 80 }, 15000, [1, 0]]],
        },
        {
          name: 'A low tank closes both',
          steps: [
            ['Both dry', { soil: 10, soil2: 10, tank: 90 }, 3000, [1, 0]],
            ['Tank at 400', { tank: A(400) }, 200, [0, 0]],
          ],
        },
      ],
      solution: {
        state: { needA: 0, needB: 0, turn: 0, turnStart: 0 },
        loop: `
if (soil < 2400 && tank > 400) {
  needA = 1;
} else {
  needA = 0;
}
if (soil2 < 2400 && tank > 400) {
  needB = 1;
} else {
  needB = 0;
}
if (needA == 1 && needB == 1) {
  if (turnStart == 0) {
    turnStart = millis();
    turn = 0;
  }
  if (millis() - turnStart >= 10000) {
    turn = 1 - turn;
    turnStart = millis();
  }
} else {
  turnStart = 0;
}
if (needA == 1 && (needB == 0 || turn == 0)) {
  write(valve, 1);
} else {
  write(valve, 0);
}
if (needB == 1 && (needA == 0 || turn == 1)) {
  write(valve2, 1);
} else {
  write(valve2, 0);
}`,
      },
    },
  }),
  quest(19, home('Water tank'), {
    title: 'Rain Barrel Overflow',
    quote: 'The rain barrel overflows in storms. Drain some off, and warn me if it is nearly full.',
    goal: 'Open the drain valve when the barrel (tank) reading is above 3500. Sound the buzzer above 3900.',
    ids: ['level', 'valve', 'buzzer'],
    conditions: ['tank > 3500', 'tank > 3900'],
    learn: ['Escalating thresholds', 'One sensor, two outputs'],
    hint: 'tank > 3500 for the valve, tank > 3900 for the buzzer.',
    scenarios: [
      ['3500', { tank: A(3500) }, [0, 0]],
      ['3501', { tank: A(3501) }, [1, 0]],
      ['3900', { tank: A(3900) }, [1, 0]],
      ['3901', { tank: A(3901) }, [1, 1]],
    ],
    advanced: {
      goal: 'The drain starts closed. It opens at 3500 or above and closes at 3000 or below, keeping its state in between. The buzzer sounds only above 3900.',
      hint: 'Use hysteresis for the drain (open at tank >= 3500, close at tank <= 3000). The buzzer is a plain tank > 3900.',
      techniques: ['hysteresis'],
      sequences: [
        {
          name: 'The drain uses two thresholds',
          steps: [
            ['3400', { tank: A(3400) }, 1000, [0, 0]],
            ['3500', { tank: A(3500) }, 1000, [1, 0]],
            ['3200', { tank: A(3200) }, 1000, [1, 0]],
            ['3001', { tank: A(3001) }, 1000, [1, 0]],
            ['3000', { tank: A(3000) }, 1000, [0, 0]],
            ['3400 again', { tank: A(3400) }, 1000, [0, 0]],
            ['3901', { tank: A(3901) }, 1000, [1, 1]],
            ['3900', { tank: A(3900) }, 1000, [1, 0]],
          ],
        },
      ],
      solution: {
        state: { drain: 0 },
        loop: `
if (tank >= 3500) {
  drain = 1;
} else if (tank <= 3000) {
  drain = 0;
}
write(valve, drain);
if (tank > 3900) {
  write(buzzer, 1);
} else {
  write(buzzer, 0);
}`,
      },
    },
  }),
  quest(20, home('Greenhouse'), {
    title: 'Greenhouse Water Reserve',
    quote:
      'Care for the greenhouse plants without wasting our reserve water, and clear the air when it gets too damp.',
    goal: 'Run the pump when the soil reading is below 2400 and the tank reading is above 400. Run the fan when humidity is above 70 %. Each output works on its own.',
    ids: ['soil', 'level', 'humidity', 'pump', 'fan'],
    conditions: ['soil < 2400 && tank > 400', 'humidity > 70'],
    learn: ['Independent outputs', 'AND logic', 'Protecting a reserve'],
    hint: 'Write two if/else blocks. The pump needs soil < 2400 && tank > 400; the fan needs humidity > 70.',
    scenarios: [
      ['Dry, full tank, humid', { soil: 10, tank: 90, humidity: 80 }, [1, 1]],
      ['Dry, tank at 400', { soil: 10, tank: A(400), humidity: 50 }, [0, 0]],
      ['Moist soil', { soil: 80, tank: 90, humidity: 50 }, [0, 0]],
      ['Humidity at 70 %', { soil: 80, tank: 90, humidity: 70 }, [0, 0]],
    ],
    advanced: {
      conditions: ['soil < 2400 && tank > 400 && humidity < 90', 'humidity > 70'],
      goal: 'Keep both rules, but stop the pump when humidity is 90 % or more: the air is already wet enough. The fan does not change.',
      hint: 'Add humidity < 90 to the pump condition with another &&. Leave the fan block as it was.',
      scenarios: [
        ['Dry, full tank, humid', { soil: 10, tank: 90, humidity: 80 }, [1, 1]],
        ['Humidity at 90 %', { soil: 10, tank: 90, humidity: 90 }, [0, 1]],
        ['Humidity 89 %', { soil: 10, tank: 90, humidity: 89 }, [1, 1]],
        ['Dry, tank at 400', { soil: 10, tank: A(400), humidity: 50 }, [0, 0]],
        ['Moist and calm', { soil: 80, tank: 90, humidity: 50 }, [0, 0]],
      ],
    },
  }),
  quest(27, home('Garage'), {
    title: 'Grain Shed Ventilation',
    quote: 'We keep the chicken grain in the garage. Ventilate it when the air gets damp.',
    goal: 'Run the fan when humidity is above 70 %. Stop at 70 % or below.',
    ids: ['humidity', 'fan'],
    conditions: ['humidity > 70'],
    learn: ['Humidity', 'Ventilation', 'Boundaries'],
    hint: 'Compare humidity > 70. Exactly 70 % leaves the fan off.',
    scenarios: [
      ['Dry store', { humidity: 50 }, [0]],
      ['At 70 %', { humidity: 70 }, [0]],
      ['71 %', { humidity: 71 }, [1]],
    ],
    advanced: {
      ids: ['humidity', 'outside', 'fan'],
      conditions: ['humidity > 70 && outdoorTemp > 5'],
      goal: 'Run the fan only when humidity is above 70 % and the outdoor temperature is above 5 °C, so it never blows freezing air over the grain.',
      hint: 'Use humidity > 70 && outdoorTemp > 5. Exactly 5 °C outside is still too cold.',
      scenarios: [
        ['Damp, mild outside', { humidity: 80, outdoorTemp: 6 }, [1]],
        ['Damp, 5 °C outside', { humidity: 80, outdoorTemp: 5 }, [0]],
        ['Dry, mild outside', { humidity: 50, outdoorTemp: 15 }, [0]],
        ['Damp, frost outside', { humidity: 85, outdoorTemp: -2 }, [0]],
      ],
    },
  }),
  quest(28, home('Plant beds'), {
    title: 'Orchard Shade Screen',
    quote: 'Give the young fruit trees shade, but only when the sun is really strong.',
    goal: 'Deploy the shade screen (servo on) at a light reading of 3200 or above. Raise it (off) below 3200.',
    ids: ['ldr', 'servo'],
    conditions: ['light >= 3200'],
    learn: ['Analogue input', 'Inclusive thresholds', 'Servo output'],
    hint: 'Compare light >= 3200. Exactly 3200 deploys the shade.',
    scenarios: [
      ['Cloudy', { light: 40 }, [0]],
      ['Just below 3200', { light: A(3199) }, [0]],
      ['At 3200', { light: A(3200) }, [1]],
    ],
    advanced: {
      ids: ['ldr', 'outside', 'servo'],
      conditions: ['light >= 3200 && outdoorTemp >= 32'],
      goal: 'Deploy the shade only when the light reading is 3200 or above and the outdoor temperature is 32 °C or above.',
      hint: 'Use light >= 3200 && outdoorTemp >= 32. Both ends are inclusive.',
      scenarios: [
        ['Bright, 31 °C', { light: A(3500), outdoorTemp: 31 }, [0]],
        ['Bright, 32 °C', { light: A(3500), outdoorTemp: 32 }, [1]],
        ['Dim, hot', { light: 40, outdoorTemp: 38 }, [0]],
      ],
    },
  }),
  quest(29, home('Water tank'), {
    title: 'Remote Tank Trend',
    quote: 'I check the tank from work. Warn me when it gets low.',
    goal: 'Light the LED when the tank reading is below 800.',
    ids: ['level', 'led'],
    conditions: ['tank < 800'],
    learn: ['Thresholds', 'Monitoring'],
    hint: 'tank < 800.',
    scenarios: [
      ['799', { tank: A(799) }, [1]],
      ['800', { tank: A(800) }, [0]],
      ['Full', { tank: 90 }, [0]],
    ],
    advanced: {
      goal: 'Also warn when the tank is falling fast: sample the level every 10 seconds, and light the LED when the latest sample is 300 or more below the sample from 60 seconds earlier. Until a minute of samples exists, use the low-level rule only.',
      hint: 'Keep seven samples (now, 10 s ago … 60 s ago) in variables and shift them along every 10 s. Count samples so the trend waits for a full minute.',
      techniques: ['average', 'validate'],
      sequences: [
        {
          name: 'A fall of 300 within a minute warns',
          steps: [
            ['Steady at 3000', { tank: A(3000) }, 70000, [0]],
            ['Falls to 2700, 30 s later', { tank: A(2700) }, 30000, [1]],
            ['Steady at 2700 for longer', {}, 50000, [0]],
          ],
        },
        {
          name: 'A fall of 299 is not a trend',
          steps: [
            ['Steady at 3000', { tank: A(3000) }, 70000, [0]],
            ['Falls to 2701', { tank: A(2701) }, 30000, [0]],
          ],
        },
        {
          name: 'No trend before a minute of history',
          steps: [
            ['Steady at 3000', { tank: A(3000) }, 20000, [0]],
            ['Falls to 2700', { tank: A(2700) }, 20000, [0]],
          ],
        },
        {
          name: 'Low level still warns at once',
          steps: [
            ['799', { tank: A(799) }, 200, [1]],
            ['800', { tank: A(800) }, 200, [0]],
          ],
        },
      ],
      solution: {
        state: {
          lastSample: 0,
          count: 0,
          h0: 0,
          h1: 0,
          h2: 0,
          h3: 0,
          h4: 0,
          h5: 0,
          h6: 0,
          falling: 0,
        },
        loop: `
if (count == 0 || millis() - lastSample >= 10000) {
  lastSample = millis();
  h6 = h5;
  h5 = h4;
  h4 = h3;
  h3 = h2;
  h2 = h1;
  h1 = h0;
  h0 = tank;
  if (count < 7) {
    count = count + 1;
  }
  if (count >= 7 && h6 - h0 >= 300) {
    falling = 1;
  } else {
    falling = 0;
  }
}
if (tank < 800 || falling == 1) {
  write(led, 1);
} else {
  write(led, 0);
}`,
      },
    },
  }),
  quest(30, home('Greenhouse'), {
    title: 'Irrigation Pipe Fault',
    quote: 'Last summer a pipe split and the pump ran dry for hours. Tell me when no water flows.',
    goal: 'The switch (arm button) asks for the pump. Run the pump while it is HIGH, and sound the buzzer if the pump is asked to run but the flow meter reads 0.',
    ids: ['button', 'flow', 'pump', 'buzzer'],
    conditions: ['armed == 1', 'armed == 1 && flow == 0'],
    learn: ['Feedback sensors', 'Fault detection'],
    hint: 'The pump follows armed == 1. The buzzer needs armed == 1 && flow == 0.',
    scenarios: [
      ['Pump on, no flow', { armed: 1, flow: 0 }, [1, 1]],
      ['Pump on, water flowing', { armed: 1, flow: 6 }, [1, 0]],
      ['Pump off', { armed: 0, flow: 0 }, [0, 0]],
    ],
    advanced: {
      ids: ['button', 'flow', 'resetButton', 'pump', 'buzzer'],
      goal: 'Only after 5 seconds without flow while the pump is asked to run: stop the pump and sound the buzzer, and keep it that way. Reset clears it, but only while the switch is LOW. It starts clear.',
      hint: 'Time how long armed == 1 && flow == 0 has lasted. At 5000 ms latch a fault. Pump = armed && no fault; buzzer = fault.',
      techniques: ['duration', 'latch'],
      sequences: [
        {
          name: '5 s without flow trips the pump',
          steps: [
            ['4.8 s of no flow', { armed: 1, flow: 0 }, 5000, [1, 0]],
            ['5 s of no flow', {}, 200, [0, 1]],
            ['Flow returns', { flow: 6 }, 1000, [0, 1]],
          ],
        },
        {
          name: 'Flow returning restarts the count',
          steps: [
            ['4 s without flow', { armed: 1, flow: 0 }, 4000, [1, 0]],
            ['Water flows', { flow: 6 }, 1000, [1, 0]],
            ['4 s without flow again', { flow: 0 }, 4000, [1, 0]],
          ],
        },
        {
          name: 'Reset needs the switch LOW',
          steps: [
            ['No flow for 6 s', { armed: 1, flow: 0 }, 6000, [0, 1]],
            ...press('reset', 'Reset with the switch on', [0, 1]),
            ['Switch off', { armed: 0 }, 200, [0, 1]],
            ...press('reset', 'Reset with the switch off', [0, 0]),
            ['Switch on, water flowing', { armed: 1, flow: 6 }, 1000, [1, 0]],
          ],
        },
      ],
      solution: {
        state: { dryStart: 0, latched: 0 },
        loop: `
if (armed == 1 && flow == 0 && latched == 0) {
  if (dryStart == 0) {
    dryStart = millis();
  }
  if (millis() - dryStart >= 5000) {
    latched = 1;
  }
} else {
  dryStart = 0;
}
if (latched == 1 && reset == 1 && armed == 0) {
  latched = 0;
}
if (armed == 1 && latched == 0) {
  write(pump, 1);
} else {
  write(pump, 0);
}
write(buzzer, latched);`,
      },
    },
  }),
];
