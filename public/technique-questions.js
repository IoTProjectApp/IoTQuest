// "Check your understanding" questions about the programming patterns in quest-techniques.js.
// One is right; every answer explains why.
const q = (prompt, right, ...wrong) => ({
  prompt,
  choices: [
    { text: right[0], right: true, why: 'Right. ' + right[1] },
    ...wrong.map(([text, why]) => ({ text, why })),
  ],
});
export const TECHNIQUE_QUESTIONS = {
  hold: q(
    'Why does the program store millis() each time the trigger is seen?',
    [
      'To measure how long it has been since the last trigger',
      'The output stays on while millis() minus that time is less than the hold time.',
    ],
    [
      'To pause the program for that long',
      'Pausing would freeze the loop, so new readings would be missed until it finished.',
    ],
    [
      'To count how many triggers there have been',
      'A time is stored, not a count: each new trigger replaces it.',
    ],
    [
      'Because reading millis() resets the sensor',
      'millis() only reads the clock; it does not touch any sensor.',
    ],
  ),
  duration: q(
    'Why is the start time set back to 0 as soon as the condition stops?',
    [
      'So only an unbroken stretch counts towards the limit',
      'Any break starts the count again, so brief moments never add up.',
    ],
    [
      'To save memory on the controller',
      'One number takes the same memory whatever it holds; this is about the timing rule.',
    ],
    [
      'Because millis() cannot go above 0',
      'millis() keeps counting up from when the controller started.',
    ],
    [
      'So the output switches on immediately',
      'It does the opposite: the output waits until the condition has lasted long enough.',
    ],
  ),
  latch: q(
    'Once the alarm has latched, what switches it off again?',
    [
      'Only the reset rule the quest describes',
      'A latch remembers the event, so the alarm stays on even after the cause goes away.',
    ],
    [
      'The cause going away',
      'That is a plain if/else. A latch keeps the alarm on after the cause has gone.',
    ],
    ['A timer running out', 'Nothing in the rule clears it by time; someone has to reset it.'],
    [
      'Restarting the loop',
      'The latch variable is declared outside the loop, so it keeps its value from pass to pass.',
    ],
  ),
  hysteresis: q(
    'Why use one threshold to switch on and a different one to switch off?',
    [
      'So a reading that wobbles around one value does not switch it on and off again and again',
      'Between the two thresholds the output keeps what it was doing.',
    ],
    [
      'To make the program shorter',
      'It needs a little more code, not less; it is about steady behaviour.',
    ],
    [
      'Because sensors cannot read the same value twice',
      'They can; the problem is noise around a single threshold.',
    ],
    [
      'So the output is on more often',
      'It changes when the output switches, not how much it is on overall.',
    ],
  ),
  edge: q(
    'How does the program tell a new press from a button that is being held down?',
    [
      'The button is HIGH now and was LOW on the last pass',
      'Saving each reading for the next pass lets the program spot the moment it changes.',
    ],
    [
      'The button is HIGH now',
      'That is true for every pass while it is held, so one press would act many times.',
    ],
    [
      'The button has been HIGH for exactly 200 ms',
      'Presses last different times; the change from LOW to HIGH is what matters.',
    ],
    ['The button reads 2 when it is first pressed', 'A digital input only reads 0 or 1.'],
  ),
  counter: q(
    'Why does the counter only count a LOW-to-HIGH change of the beam?',
    [
      'So one person or part in the beam is counted once, however long it stays',
      'A beam stays broken for many passes; the change marks one arrival.',
    ],
    [
      'Because HIGH readings are less accurate',
      'Both readings are equally reliable; the issue is counting once.',
    ],
    [
      'So the count goes down when the beam clears',
      'Clearing the beam is not an event in these quests; the count only changes on arrivals.',
    ],
    [
      'To make the count reset every pass',
      'The count lives outside the loop so it keeps growing between passes.',
    ],
  ),
  pwm: q(
    'What does analogWrite(pin, 128) do to a lamp?',
    [
      'It sets the lamp to about half brightness',
      'Levels go from 0 (off) to 255 (full), so 128 is roughly halfway.',
    ],
    ['It switches the lamp on fully', 'Full brightness is 255; 128 is about half.'],
    [
      'It reads the lamp’s brightness',
      'analogWrite sets an output; analogRead is the one that reads.',
    ],
    ['It waits 128 milliseconds', 'That would be delay(128).'],
  ),
  schedule: q(
    'How do you write a window from 22:00 to 06:59 with the clock (2200 means 22:00)?',
    [
      'clock >= 2200 || clock < 700',
      'The window crosses midnight, so it is “late evening OR early morning”.',
    ],
    [
      'clock >= 2200 && clock < 700',
      'No time can be after 22:00 and before 07:00 on the same day, so this is never true.',
    ],
    ['clock > 2200 || clock < 659', 'That misses exactly 22:00 and 06:59.'],
    ['clock >= 700 && clock < 2200', 'That is the daytime window, the opposite of what is asked.'],
  ),
  phases: q(
    'Why set every lamp from the phase variable, rather than switching lamps one by one?',
    [
      'So two conflicting lamps can never be on together',
      'Each phase says exactly which lamps are on, so a mistake cannot leave an old lamp lit.',
    ],
    ['Because digitalWrite only works once per pass', 'You can write a pin as often as you like.'],
    [
      'So the phases change faster',
      'The timings come from the phase lengths, not from how the lamps are written.',
    ],
    ['To save electricity', 'The same lamps are lit either way; it is about safety and clarity.'],
  ),
  mqtt: q(
    'What should the program do while the network is down?',
    [
      'Keep its local control working and try to reconnect without stopping the loop',
      'The house must still work offline; the network is extra.',
    ],
    [
      'Wait in a loop until the network comes back',
      'That freezes every output that depends on the program until the network returns.',
    ],
    [
      'Send every missed reading at once when it reconnects',
      'A burst of old readings floods the dashboard; send the current one instead.',
    ],
    [
      'Restart the controller',
      'Restarting loses the program’s state and does not bring the network back.',
    ],
  ),
  memory: q(
    'Why save the shutdown with memoryWrite?',
    [
      'So it is still set after a power cut and restart',
      'Ordinary variables start again from their first value when the controller restarts.',
    ],
    [
      'So the loop runs faster',
      'Saving to flash memory is slower, and is only needed for values that must survive.',
    ],
    ['Because variables cannot hold numbers', 'They can; they just do not survive a restart.'],
    [
      'To send it to the dashboard',
      'memoryWrite stays on the controller; mqttPublish sends messages.',
    ],
  ),
  validate: q(
    'What should the program do with a missing or invalid reading?',
    [
      'Make the safe choice and show a fault, instead of acting on it',
      'Acting on a bad reading can switch equipment on or off for the wrong reason.',
    ],
    [
      'Use the last good reading for ever',
      'Old data can be very wrong; the quest asks for a fault instead.',
    ],
    ['Treat it as 0', 'A made-up value can look real and trigger the wrong output.'],
    [
      'Ignore it and keep the outputs as they are',
      'The quests define a safe response, such as closing a valve and lighting a fault lamp.',
    ],
  ),
  average: q(
    'Why average the last few samples?',
    [
      'So one odd sample does not flip the output',
      'A single cough or spike is diluted by the samples around it.',
    ],
    [
      'So the output reacts faster',
      'Averaging makes it react a little slower, which is the point.',
    ],
    [
      'Because the sensor needs five readings to work',
      'Each reading is valid on its own; averaging is a choice in the program.',
    ],
    [
      'To store the readings for later',
      'The quest only keeps the last few, to work out the average.',
    ],
  ),
  log: q(
    'Why print exactly the lines the quest asks for?',
    [
      'Because dashboards, spreadsheets and the tests read them in that format',
      'A CSV line such as 60,21.5 can be opened straight in a spreadsheet.',
    ],
    [
      'Because extra lines slow the controller down',
      'A few lines are cheap; the reason is that readers expect a format.',
    ],
    [
      'Because Serial.println only prints numbers',
      'It prints text too; the format is what matters.',
    ],
    ['So the program runs again', 'Printing does not restart anything.'],
  ),
};
