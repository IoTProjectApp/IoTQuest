// People added to the world, and routines for anyone who walks by themselves, written by the
// Character Editor (editor/workspaces/character-editor, launched with scripts/world-editor.sh) to
// data/people.js:
//   { version: 1, people: [person...], routines: { [id]: { stops: [stop...] } } }
// A person is { id, name, city, at, role?, bio? }:
//   id     'own:' and a slug ('own:ana-baker'); their looks and clips are set like anyone's, under
//          this id in data/characters.js
//   city   where they live: a location id ('kyoto'), 'legacy' for the original home, or '*' for
//          every city
//   at     where they stand, [x, z] in world metres, when they have no routine
//   role   what they do ('Baker'), shown when they talk; bio a line about who they are
// A routine is { stops, city? }: with a city (a location id) it plays only there, as the town's
// buildings differ between cities; the routines of people added here play wherever they live.
// A stop is { at: [x, z], stay: seconds, clip?: a clip to play while there (see character-clips.js) }.
// Someone with a routine walks from stop to stop in a straight line, waits at each playing its
// clip, and after the last walks back to the first. With no people and no routines the game is as
// built.
import PEOPLE_SETTINGS from './data/people.js';

export { PEOPLE_SETTINGS };
export const OWN = 'own:';
export const isOwn = (id) => typeof id === 'string' && id.startsWith(OWN);
// How fast someone on a routine walks, in metres a second (their Character Editor speed scales it).
export const ROUTINE_WALK = 1.2;
// The longest a stop can last, in seconds, and the most stops a routine can have.
export const MAX_STAY = 600;
export const MAX_STOPS = 24;

export function ownPeopleIn(locationId, settings = PEOPLE_SETTINGS) {
  const here = locationId || 'legacy';
  return (settings?.people || []).filter((p) => p.city === '*' || p.city === here);
}
// Why someone never follows a routine, or null if they can.
export function routineLocked(id) {
  if (id === 'player') return 'The technician goes where you steer them.';
  if (['Maya', 'Alex', 'Sam'].includes(id) || id?.startsWith('section:'))
    return 'The household comes to the technician when a room needs them, so where they walk is the game’s.';
  if (id?.startsWith('dojo:') || id === 'recreation:dojo')
    return 'The judo class moves in time with its lesson.';
  return null;
}
// Someone's routine in a city: one drawn for a city (`city`) plays only there.
export function routineFor(id, locationId, settings = PEOPLE_SETTINGS) {
  const routine = settings?.routines?.[id];
  if (!routine?.stops?.length || routineLocked(id)) return null;
  return !routine.city || routine.city === (locationId || 'legacy') ? routine : null;
}
// Adds this city's people to a world model, standing where they were put.
export function addOwnPeople(model, locationId, settings = PEOPLE_SETTINGS) {
  for (const person of ownPeopleIn(locationId, settings)) {
    if (model.actors.some((a) => a.id === person.id)) continue;
    const [x, z] = person.at || [0, 0];
    model.addActor(person.id, x, z, '#7d8fa3', '#c39b7c');
    Object.assign(model.actors.at(-1), {
      name: person.name,
      role: person.role || '',
      section: person.role || 'Neighbour',
      bio: person.bio || '',
      own: true,
    });
  }
  return model;
}

// A routine laid out in time: each stop's stay, then the walk to the next (the last back to the
// first), at `speed` times the usual pace. Returns the legs and the length of one round.
export function routineLegs(routine, speed = 1) {
  const stops = routine?.stops || [],
    pace = ROUTINE_WALK * Math.max(0.1, speed),
    legs = [];
  let time = 0;
  stops.forEach((stop, i) => {
    const stay = Math.max(0, Math.min(MAX_STAY, Number(stop.stay) || 0));
    legs.push({ kind: 'stay', stop: i, at: stop.at, from: time, to: time + stay, clip: stop.clip });
    time += stay;
    if (stops.length < 2) return;
    const next = stops[(i + 1) % stops.length],
      length = Math.hypot(next.at[0] - stop.at[0], next.at[1] - stop.at[1]);
    legs.push({
      kind: 'walk',
      stop: i,
      a: stop.at,
      b: next.at,
      from: time,
      to: time + length / pace,
    });
    time += length / pace;
  });
  return { legs, round: time };
}
// Where someone on a routine is `time` seconds in: { x, z, angle, walking, clip, stop }. The angle
// is an actor's heading (they face its sine and cosine).
export function routinePose(routine, time, speed = 1) {
  const { legs, round } = routineLegs(routine, speed);
  if (!legs.length) return null;
  const at = round > 0 ? ((time % round) + round) % round : 0,
    index = legs.findIndex((leg) => at < leg.to),
    leg = legs[index < 0 ? legs.length - 1 : index];
  // Facing the way they last walked (at the first stop, the way they will walk next).
  const walk =
      legs.slice(0, legs.indexOf(leg) + 1).findLast((l) => l.kind === 'walk') ||
      legs.findLast((l) => l.kind === 'walk'),
    angle = walk ? Math.atan2(walk.b[0] - walk.a[0], walk.b[1] - walk.a[1]) : 0;
  if (leg.kind === 'stay')
    return {
      x: leg.at[0],
      z: leg.at[1],
      angle,
      walking: false,
      clip: leg.clip || null,
      stop: leg.stop,
    };
  const f = leg.to > leg.from ? (at - leg.from) / (leg.to - leg.from) : 1;
  return {
    x: leg.a[0] + (leg.b[0] - leg.a[0]) * f,
    z: leg.a[1] + (leg.b[1] - leg.a[1]) * f,
    angle,
    walking: true,
    clip: null,
    stop: leg.stop,
  };
}
