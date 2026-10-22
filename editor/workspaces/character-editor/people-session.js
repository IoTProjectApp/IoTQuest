// People added in the Character Editor and the routines drawn for anyone who walks by themselves
// (saved in public/data/people.js; the format is in public/people-settings.js). It shares the
// Character Editor's undo history: changes go through CharacterSession.commit. Free of the DOM so
// it runs under Node in the tests.
import {
  OWN,
  isOwn,
  routineLocked,
  routineLegs,
  MAX_STAY,
  MAX_STOPS,
} from '../../../public/people-settings.js';
import { collides, clearPath } from '../../../public/world-math.js';
import { CLIPS } from '../../../public/character-clips.js';
import { locations } from '../../../public/locations.js';

const clone = (value) => JSON.parse(JSON.stringify(value));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const empty = () => ({ version: 1, people: [], routines: {} });
// Where a routine or a new person is checked and drawn: their city ('*' is checked at home).
export const cityOf = (person) => (!person || person.city === '*' ? 'legacy' : person.city);
// Metres, to the centimetre, as saved.
const metres = (v) => Math.round(Number(v) * 100) / 100;
const point = ([x, z]) => [metres(x), metres(z)];

export class PeopleSession {
  // characters: the CharacterSession whose history this joins.
  constructor(characters, saved = empty()) {
    this.characters = characters;
    this.data = { ...empty(), ...clone(saved) };
    this.saved = clone(this.data);
    characters.attach(this);
  }
  snapshot() {
    return clone(this.data);
  }
  restore(data) {
    this.data = data;
  }
  isChanged() {
    return !same(this.data, this.saved);
  }
  markSaved() {
    this.saved = clone(this.data);
  }
  savedFile() {
    return clone(this.data);
  }
  commit(label, change) {
    return this.characters.commit(label, (settings) => change(this.data, settings));
  }

  // ---- New people ----------------------------------------------------------------------------
  person(id) {
    return this.data.people.find((p) => p.id === id) || null;
  }
  // A new person standing at `at` ([x, z]) in a city; returns their id.
  add({ name = 'New person', city = 'legacy', at = [0, 8], role = '', bio = '' } = {}) {
    const id = this.freeId(name);
    this.commit('Add ' + name, (data) => {
      data.people.push({ id, name, city, at: point(at), role, bio });
    });
    return id;
  }
  freeId(name) {
    const slug =
      String(name)
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') || 'person';
    let id = OWN + slug;
    for (let n = 2; this.person(id); n++) id = `${OWN}${slug}-${n}`;
    return id;
  }
  // Changes who they are: name, city, role, bio or where they stand.
  update(id, fields, label = 'Change person') {
    return this.commit(label, (data) => {
      const person = data.people.find((p) => p.id === id);
      if (!person) return false;
      for (const [key, value] of Object.entries(fields))
        person[key] = key === 'at' ? point(value) : value;
    });
  }
  // Takes them out of the game, with their routine and their looks.
  remove(id) {
    return this.commit('Remove person', (data, settings) => {
      data.people = data.people.filter((p) => p.id !== id);
      delete data.routines[id];
      delete settings.people[id];
    });
  }

  // ---- Routines ------------------------------------------------------------------------------
  routine(id) {
    return this.data.routines[id] || null;
  }
  // Who can have one: new people, and anyone the game moves as an actor who is not locked.
  // actorIds: the ids of everyone who is an actor where the routine plays.
  canHaveRoutine(id, actorIds) {
    if (isOwn(id)) return { ok: true };
    const locked = routineLocked(id);
    if (locked) return { ok: false, reason: locked };
    if (!actorIds.has(id))
      return {
        ok: false,
        reason: 'They are moved by what they are doing (a game, a swim, a queue), not by a plan.',
      };
    return { ok: true };
  }
  editRoutine(id, label, change) {
    return this.commit(label, (data) => {
      // Someone the game already has walks their routine only at home, where it was drawn.
      const routine = (data.routines[id] ??= isOwn(id)
        ? { stops: [] }
        : { city: 'legacy', stops: [] });
      if (change(routine) === false) return false;
      if (!routine.stops.length) delete data.routines[id];
    });
  }
  addStop(id, at, { stay = 10, clip = null, index = null } = {}) {
    return this.editRoutine(id, 'Add stop', (routine) => {
      if (routine.stops.length >= MAX_STOPS) return false;
      const stop = { at: point(at), stay };
      if (clip) stop.clip = clip;
      routine.stops.splice(index ?? routine.stops.length, 0, stop);
    });
  }
  moveStop(id, i, at) {
    return this.editRoutine(id, 'Move stop', (routine) => {
      if (!routine.stops[i]) return false;
      routine.stops[i].at = point(at);
    });
  }
  setStop(id, i, fields) {
    return this.editRoutine(id, 'Change stop', (routine) => {
      const stop = routine.stops[i];
      if (!stop) return false;
      if ('stay' in fields) stop.stay = Math.max(0, Math.min(MAX_STAY, Number(fields.stay) || 0));
      if ('clip' in fields) {
        if (fields.clip) stop.clip = fields.clip;
        else delete stop.clip;
      }
    });
  }
  removeStop(id, i) {
    return this.editRoutine(id, 'Remove stop', (routine) => {
      if (!routine.stops[i]) return false;
      routine.stops.splice(i, 1);
    });
  }
  // Moves a stop earlier (-1) or later (+1) in the round.
  reorderStop(id, i, by) {
    return this.editRoutine(id, 'Reorder stops', (routine) => {
      const j = i + by;
      if (!routine.stops[i] || !routine.stops[j]) return false;
      [routine.stops[i], routine.stops[j]] = [routine.stops[j], routine.stops[i]];
    });
  }
  clearRoutine(id) {
    return this.commit('Clear routine', (data) => {
      delete data.routines[id];
    });
  }

  // ---- The check -----------------------------------------------------------------------------
  // Problems, as { id, text, error, stop?, leg? }. worldFor(city) gives { colliders, actorIds,
  // names } for a city: what is in the way, who can walk, and the names already used there.
  check(worldFor) {
    const problems = [],
      cities = new Set(['legacy', '*', ...locations.map((l) => l.id)]);
    const seen = new Map();
    for (const p of this.data.people) {
      const name = String(p.name || '').trim();
      if (!name) problems.push({ id: p.id, text: 'They need a name.', error: true });
      if (/[<>{}]/.test(name))
        problems.push({ id: p.id, text: 'Names are plain text: no < > { or }.', error: true });
      if (!cities.has(p.city))
        problems.push({ id: p.id, text: `There is no city "${p.city}".`, error: true });
      const key = name.toLowerCase();
      if (seen.has(key))
        problems.push({ id: p.id, text: `${seen.get(key)} is also called ${name}.`, error: true });
      seen.set(key, p.id);
      if (!cities.has(p.city)) continue;
      const world = worldFor(cityOf(p));
      if (world.names.has(key))
        problems.push({
          id: p.id,
          text: `Someone in the game is already called ${name}: their quests and chats would mix.`,
          error: true,
        });
      if (!this.data.routines[p.id] && collides(p.at[0], p.at[1], world.colliders))
        problems.push({
          id: p.id,
          text: 'Where they stand is inside a wall or furniture.',
          error: true,
        });
    }
    for (const [id, routine] of Object.entries(this.data.routines)) {
      const own = this.person(id);
      if (isOwn(id) && !own) {
        problems.push({ id, text: 'This routine belongs to no one.', error: true });
        continue;
      }
      const world = worldFor(own ? cityOf(own) : routine.city || 'legacy'),
        can = this.canHaveRoutine(id, world.actorIds);
      if (!can.ok) problems.push({ id, text: can.reason, error: true });
      if (routine.stops.length > MAX_STOPS)
        problems.push({ id, text: `A routine has at most ${MAX_STOPS} stops.`, error: true });
      routine.stops.forEach((stop, i) => {
        if (collides(stop.at[0], stop.at[1], world.colliders))
          problems.push({
            id,
            stop: i,
            text: `Stop ${i + 1} is inside a wall or furniture.`,
            error: true,
          });
        if (stop.clip && !CLIPS[stop.clip])
          problems.push({
            id,
            stop: i,
            text: `Stop ${i + 1} plays "${stop.clip}", which is not a clip.`,
            error: true,
          });
      });
      if (routine.stops.length > 1)
        routine.stops.forEach((stop, i) => {
          const next = routine.stops[(i + 1) % routine.stops.length];
          if (
            !clearPath(
              { x: stop.at[0], z: stop.at[1] },
              { x: next.at[0], z: next.at[1] },
              world.colliders,
            )
          )
            problems.push({
              id,
              leg: i,
              text: `The walk from stop ${i + 1} to stop ${((i + 1) % routine.stops.length) + 1} goes through a wall or furniture: add a stop to go round.`,
              error: true,
            });
        });
      if (routine.stops.length && routineLegs(routine).round === 0)
        problems.push({
          id,
          text: 'Every stop is in one place with no wait: they would never move.',
          error: false,
        });
    }
    return problems;
  }
}
