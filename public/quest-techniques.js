// Programming patterns the Guide explains for quests that need more than one if/else per output.
// Each has a plain explanation and a pattern with blanks (____) in both languages. Quests list the
// ones they use in `techniques`. Patterns show the idea, never a quest's finished program.
export const TECHNIQUES = {
  hold: {
    title: 'Keep it on for a while',
    body: 'To keep an output on for some time after the last trigger, remember when the trigger was last seen with millis() (ticks_ms() in MicroPython). The output stays on while the time since then is less than the hold time. Subtracting (now minus then) keeps working even when the clock rolls over.',
    cpp: 'if (____) {\n  lastSeen = millis();\n  active = 1;\n}\nif (active == 1 && millis() - lastSeen >= ____) {\n  active = 0;\n}',
    python:
      'if ____:\n    last_seen = time.ticks_ms()\n    active = 1\nif active == 1 and time.ticks_diff(time.ticks_ms(), last_seen) >= ____:\n    active = 0',
  },
  duration: {
    title: 'Wait until it has lasted long enough',
    body: 'Some alarms only start when a condition has lasted continuously. Note the time it became true, forget it the moment it becomes false, and act once the difference reaches the limit.',
    cpp: 'if (____) {\n  if (started == 0) {\n    started = millis();\n  }\n} else {\n  started = 0;\n}\nif (started != 0 && millis() - started >= ____) {\n  // long enough\n}',
    python:
      'if ____:\n    if started == 0:\n        started = time.ticks_ms()\nelse:\n    started = 0\nif started != 0 and time.ticks_diff(time.ticks_ms(), started) >= ____:\n    pass  # long enough',
  },
  latch: {
    title: 'Remember an alarm until it is reset',
    body: 'A latch is a variable that is set by an event and stays set when the event goes away. Only a deliberate reset clears it, and the rule says when a reset is allowed.',
    cpp: 'if (____) {\n  latched = 1;\n}\nif (latched == 1 && ____) {\n  latched = 0;\n}',
    python: 'if ____:\n    latched = 1\nif latched == 1 and ____:\n    latched = 0',
  },
  hysteresis: {
    title: 'Two thresholds stop flicker',
    body: 'With one threshold a reading that wobbles around it switches the output on and off again and again. Use a higher threshold to switch on and a lower one to switch off; in between, keep what it was doing. The variable must be declared outside the loop so it keeps its value.',
    cpp: 'if (____) {\n  on = 1;\n} else if (____) {\n  on = 0;\n}\n// between the two: on keeps its value',
    python: 'if ____:\n    on = 1\nelif ____:\n    on = 0\n# between the two: on keeps its value',
  },
  edge: {
    title: 'React to a press, not to holding',
    body: 'A button reads HIGH for as long as it is held. To act once per press, compare this reading with the one from the previous pass: a press is LOW last time and HIGH now. Save the reading at the end of every pass.',
    cpp: 'if (____ == 1 && previous == 0) {\n  // a new press\n}\nprevious = ____;',
    python: 'if ____ == 1 and previous == 0:\n    pass  # a new press\nprevious = ____',
  },
  counter: {
    title: 'Count events',
    body: 'Count each new event once (use the press pattern for beams and buttons) and keep the count in a variable declared outside the loop. Check the limits every time it changes, so it never goes below zero or past the maximum.',
    cpp: 'if (____ == 1 && previous == 0) {\n  count = count + 1;\n}\nprevious = ____;\nSerial.println(count);',
    python: 'if ____ == 1 and previous == 0:\n    count = count + 1\nprevious = ____\nprint(count)',
  },
  pwm: {
    title: 'Set a brightness, not just on or off',
    body: 'analogWrite(pin, level) sets a brightness from 0 (off) to 255 (full). In MicroPython import PWM too (from machine import Pin, PWM), make the pin a PWM(Pin(n)) and use duty_u16(level * 257), which turns 0–255 into the 0–65535 range. To turn a 0–4095 reading into 0–255, multiply by 255 and divide by 4095, adding 2047 first to round to the nearest whole number.',
    cpp: 'int level = (____ * 255 + 2047) / 4095;\nanalogWrite(____, level);',
    python: 'level = (____ * 255 + 2047) // 4095\n____.duty_u16(level * 257)',
  },
  schedule: {
    title: 'Use the time of day',
    body: 'The clock reads the local time as one number: 2200 is 22:00 and 705 is 07:05. A daytime window is clock >= start && clock < end. A window that crosses midnight, such as 22:00–06:59, needs OR: clock >= 2200 || clock < 700.',
    cpp: 'if (clock >= ____ && clock < ____) {\n  // inside the window\n}',
    python: 'if clock >= ____ and clock < ____:\n    pass  # inside the window',
  },
  phases: {
    title: 'Step through phases with a timer',
    body: 'Signals and sequences move through phases (green, amber, red ...). Keep the current phase in a variable and the time it started. When the phase has lasted its time, move to the next one and note the new start time. Then set every output from the phase, so two phases can never be on together.',
    cpp: 'if (phase == 0 && millis() - phaseStart >= ____) {\n  phase = 1;\n  phaseStart = millis();\n}\n// ... one block per phase\ndigitalWrite(____, phase == 0 ? HIGH : LOW);',
    python:
      'if phase == 0 and time.ticks_diff(time.ticks_ms(), phase_start) >= ____:\n    phase = 1\n    phase_start = time.ticks_ms()\n# ... one block per phase',
  },
  mqtt: {
    title: 'Talk over the network',
    body: 'mqttConnect("name") joins the simulated broker, mqttSubscribe(topic) listens to a topic and mqttRead(topic) gives its latest message. mqttPublish(topic, value) sends one. mqttConnected() tells you whether the network is up; after an outage call mqttReconnect() and subscribe again. In MicroPython, import them with: from iotquest import mqttConnect, ...',
    cpp: 'if (!mqttConnected()) {\n  mqttReconnect();\n  mqttSubscribe("____");\n}\nauto message = mqttRead("____");',
    python:
      'if not mqttConnected():\n    mqttReconnect()\n    mqttSubscribe("____")\nmessage = mqttRead("____")',
  },
  memory: {
    title: 'Survive a restart',
    body: 'Variables are lost when the power goes off. memoryWrite("name", value) saves a number in the controller’s flash memory and memoryRead("name") reads it back after a restart (0 if nothing was saved). Read it in setup (before the loop in MicroPython), and save it whenever it changes.',
    cpp: 'latched = memoryRead("____");  // in setup()\n// ... when it changes:\nmemoryWrite("____", latched);',
    python:
      'latched = memoryRead("____")  # before the loop\n# ... when it changes:\nmemoryWrite("____", latched)',
  },
  validate: {
    title: 'Never trust a bad reading',
    body: 'Sensors and services sometimes give no reading, an impossible value or old data. Check the reading is valid before using it, and make the safe choice (outputs off, fault shown) when it is not. Do not keep acting on an old value.',
    cpp: 'if (____) {\n  // valid: use the reading\n} else {\n  // invalid: safe outputs, show the fault\n}',
    python:
      'if ____:\n    pass  # valid: use the reading\nelse:\n    pass  # invalid: safe outputs, show the fault',
  },
  average: {
    title: 'Average the last few readings',
    body: 'One loud or noisy sample should not flip an output. Keep the last few samples, add them up and divide by how many you have. With fixed variables a, b, c, d, e, shift each sample along when a new one arrives.',
    cpp: 'e = d;\nd = c;\nc = b;\nb = a;\na = ____;\nfloat mean = (a + b + c + d + e) / count;',
    python: 'e = d\nd = c\nc = b\nb = a\na = ____\nmean = (a + b + c + d + e) / count',
  },
  log: {
    title: 'Write a log',
    body: 'Serial.println (print in MicroPython) writes a line the dashboard, the plotter and the tests can read. Print exactly the lines the quest asks for, in the order it asks.',
    cpp: 'Serial.print(____);\nSerial.print(",");\nSerial.println(____);',
    python: 'print(str(____) + "," + str(____))',
  },
};
