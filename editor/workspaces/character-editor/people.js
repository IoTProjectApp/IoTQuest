// Everyone the game draws as a rigged character, as the code makes them: their id, a readable
// name, a group for the list, and the model and outfit they have when nothing is set. Found the way
// the game finds them, by building the world and reading one frame's characters with every
// Character Editor setting set aside.
import { World3D } from '../../../public/world3d.js';
import { CHARACTER_SETTINGS } from '../../../public/character-settings.js';
import { isHousehold } from '../../../public/section-residents.js';
import { WOMEN } from '../../../public/people-cast.js';

// Clips that are walking or standing rather than an activity of their own.
const EVERYDAY = new Set(['Idle', 'Talking', 'Walking', 'FemaleWalk', 'Jogging']);

export const GROUPS = [
  { id: 'technician', label: 'Technician' },
  { id: 'household', label: 'Household' },
  { id: 'residents', label: 'Town residents' },
  { id: 'workers', label: 'Workers' },
  { id: 'passengers', label: 'Passengers & parents' },
  { id: 'sport', label: 'Sport & leisure' },
  { id: 'judo', label: 'Judo class' },
];

export function groupOf(id) {
  if (id === 'player') return 'technician';
  if (id.startsWith('dojo:') || id === 'recreation:dojo') return 'judo';
  if (isHousehold(id)) return 'household';
  if (id.startsWith('worker:')) return 'workers';
  if (/^(bus|parent):/.test(id)) return 'passengers';
  if (/^(football|basketball|gym|outdoorgym|swimmer):/.test(id)) return 'sport';
  return 'residents';
}
// Who walks about by themselves (their walking speed is theirs to set); everyone else is moved by
// what they are doing (a game, a swim, a queue) and only their clip speed changes.
export const walksAlone = (id) => ['household', 'residents', 'workers'].includes(groupOf(id));
// The judo class's moves are timed to the clips it plays: only its looks can change.
export const movesLocked = (id) => groupOf(id) === 'judo';

const sentence = (text) => text.charAt(0).toUpperCase() + text.slice(1);
// A name for people the game does not name: 'bus:0:1>1:1:2' → 'Passenger 3 at a bus stop'.
function describe(id) {
  const [kind, ...rest] = id.split(':'),
    last = rest.at(-1),
    number = Number.isFinite(Number(last)) ? ` ${Number(last) + 1}` : '';
  return (
    {
      bus: `Passenger${number} at a bus stop`,
      parent: `Parent${number} at the ${rest[0]}`,
      football: `Football player${number}`,
      basketball: `Basketball player${number}`,
      swimmer: `Swimmer${number}`,
      gym: `Gym: ${rest.join(' ')}`,
      outdoorgym: `Outdoor gym: ${rest.join(' ')}`,
      dojo: `Judo student${number}`,
    }[kind] || sentence(id.replace(/[:-]/g, ' '))
  );
}

// The list, sorted by group and then name.
export function findPeople(locationId = 'legacy') {
  const saved = {
    defaults: CHARACTER_SETTINGS.defaults,
    people: CHARACTER_SETTINGS.people,
  };
  // As the code makes them: no settings while the frame is drawn.
  CHARACTER_SETTINGS.defaults = {};
  CHARACTER_SETTINGS.people = {};
  const frames = [],
    canvas = document.createElement('canvas');
  let world;
  try {
    world = new World3D(canvas, {
      getState: () => ({
        locationId,
        devices: [],
        env: { light: 70, temperature: 22, humidity: 50, motion: true },
        outputs: {},
        player: { x: 48, y: 77 },
        speed: 1,
        areas: [],
        appearance: '🧑‍🔧',
        // Everyone in the household is shown visiting, so they are drawn too.
        talkingNpc: null,
      }),
      createRenderer: () => ({
        gl: {},
        maxPixelRatio: 1,
        geometries: {},
        drawsCharacters: true,
        render: (frame) => frames.push(frame),
        restore() {},
        dispose() {},
      }),
    });
    for (const actor of world.model.actors) if (isHousehold(actor.id)) actor.present = true;
    world.render(1, 0.016);
  } finally {
    Object.assign(CHARACTER_SETTINGS, saved);
    world?.dispose();
  }
  const names = Object.fromEntries((world?.model.actors || []).map((a) => [a.id, a.name])),
    seen = new Set();
  const people = [];
  for (const c of frames.at(-1)?.characters || []) {
    if (seen.has(c.key)) continue;
    seen.add(c.key);
    const playing = c.clips.map((clip) => clip.name);
    people.push({
      id: c.key,
      name:
        c.key === 'player'
          ? 'The technician'
          : names[c.key] && names[c.key] !== c.key
            ? names[c.key]
            : describe(c.key),
      group: groupOf(c.key),
      model: c.model,
      outfit: c.outfit || {},
      scale: c.scale || 1,
      carry: c.carry,
      belt: c.belt,
      // What they do as built: an activity on the spot (the gym's squats), and how they walk.
      activity: playing.length === 1 && !EVERYDAY.has(playing[0]) ? playing[0] : null,
      walk: c.key === 'player' ? 'Jogging' : WOMEN.includes(c.model) ? 'FemaleWalk' : 'Walking',
    });
  }
  const order = Object.fromEntries(GROUPS.map((g, i) => [g.id, i]));
  return people.sort((a, b) => order[a.group] - order[b.group] || a.name.localeCompare(b.name));
}
