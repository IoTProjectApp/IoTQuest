import { ADC_SCALE } from './signals.js';
import { seconds } from './quest-timeline.js';
// Helpers for writing the catalogue quests (catalogue-quests-*.js).
export const ADC = ADC_SCALE;
// The stored level that a program reads back as this 0–4095 reading.
export const A = (reading) => reading / ADC;
// A PWM brightness (0–255) a timeline step expects.
export const L = (level) => ({ level });

// Who asks for work in each room or garden area of the home.
const KEEPERS = {
  Bedroom: 'Nina',
  'Living room': 'Jordan',
  Kitchen: 'Sam',
  Bathroom: 'Sam',
  'Water tank': 'Sam',
  'Utility room': 'Alex',
  Garage: 'Alex',
  Entrance: 'Alex',
  'Garden path': 'Alex',
  Greenhouse: 'Maya',
  'Plant beds': 'Maya',
};
export const home = (area) => ({
  sectionQuest: true,
  area,
  resident: KEEPERS[area],
  role: area + ' resident',
});
// A quest at a community building; catalogue-quests.js sets who asks for it.
export const town = (type, area) => ({ communityQuest: true, communityType: type, area });

// A level checked by timelines has no single condition per output, and a level checked by
// conditions has no worked program or timelines of its own.
const level = (l) =>
  l.sequences
    ? { conditions: [], scenarios: [], ...l }
    : l.conditions
      ? { solution: undefined, sequences: undefined, techniques: undefined, ...l }
      : l;
export function quest(number, place, q) {
  const { advanced, ...beginner } = q;
  return {
    catalogueQuest: true,
    catalogue: number,
    xp: 150,
    badge: q.title,
    ...place,
    ...level(beginner),
    ...(advanced ? { advanced: level(advanced) } : {}),
  };
}

// A press of a momentary input: held for one step, then released.
export const press = (signal, label, expect = null, ms = 200) => [
  [label, { [signal]: 1 }, ms, expect],
  [label + ' (released)', { [signal]: 0 }, 200, null],
];
// `n` presses one after another.
export const presses = (signal, label, n) =>
  Array.from({ length: n }, (_, i) => press(signal, label + ' ' + (i + 1), null)).flat();
// A check that the last line the program printed is this number.
export const printed = (value) => (ctx) => {
  const last = ctx.logs.at(-1);
  return Number(last) === value
    ? true
    : 'the last number printed should be ' + value + ', but it was ' + (last ?? 'nothing') + '.';
};
// A check on what the program published to `topic` during this step.
export const published =
  (topic, count, payload = undefined) =>
  (ctx) => {
    const sent = ctx.stepPublishes.filter((m) => m.topic === topic);
    if (sent.length !== count)
      return (
        'it should publish ' +
        count +
        ' message' +
        (count === 1 ? '' : 's') +
        ' to ' +
        topic +
        ', but it published ' +
        sent.length +
        '.'
      );
    if (payload !== undefined && count && !sent.every((m) => sameValue(m.payload, payload)))
      return 'the message should be ' + payload + ', but it was ' + sent.at(-1).payload + '.';
    return true;
  };
const sameValue = (a, b) =>
  typeof b === 'number' ? Math.abs(Number(a) - b) < 0.01 : String(a) === String(b);
// Signal timings: steps that check a phase table just before and exactly at each change.
// `phases` is [[ms, outputs], ...] from the first pass of the program; it repeats `cycles` times.
export function phaseSteps(phases, cycles = 1, env = {}) {
  const steps = [['First pass', env, 200, phases[0][1]]];
  let at = 0;
  const all = Array.from({ length: cycles }, () => phases).flat();
  all.forEach(([ms, outputs], i) => {
    const next = all[i + 1]?.[1] ?? phases[0][1],
      end = at + ms;
    steps.push([seconds(end - 200) + ' in', {}, ms - 200, outputs]);
    steps.push([seconds(end) + ' in: next phase', {}, 200, next]);
    at = end;
  });
  return steps;
}
