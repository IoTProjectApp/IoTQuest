// Reactions: a clip a person plays when something happens, before going back to what they were
// doing. Set in the Character Editor and saved with the other character settings
// (data/characters.js, see character-settings.js) as an optional list for a person or the defaults:
//   reactions: [{ trigger, clip, seconds?, cooldown?, face? }]
// - trigger: one of TRIGGERS below;
// - clip: any clip the game has (character-clips.js), imported ones too;
// - seconds: how long it plays (looping), or absent to play it once through;
// - cooldown: seconds before the same reaction can play again (TRIGGERS gives each a default);
// - face: true to turn towards the technician while it plays.
// A person's reaction to a trigger replaces the defaults' reaction to it; { trigger, clip: false }
// keeps them still where the defaults would react. The judo class does not react. With no
// reactions, everyone is as before.
import { CLIPS } from './character-clips.js';
import { CHARACTER_SETTINGS } from './character-settings.js';

// What can set a reaction off: its name in the editor, and how soon it can play again.
export const TRIGGERS = {
  near: { label: 'The technician comes near', cooldown: 20 },
  chat: { label: 'A chat opens', cooldown: 0 },
  thanks: { label: 'One of their quests passes', cooldown: 0 },
  fail: { label: 'Their quest’s tests fail', cooldown: 10 },
  cold: { label: 'It is cold outside', cooldown: 45 },
  hot: { label: 'It is hot outside', cooldown: 45 },
  rain: { label: 'It is raining', cooldown: 45 },
  night: { label: 'It is night', cooldown: 60 },
};
// Triggers that happen to someone, rather than about them.
const EVENTS = ['chat', 'thanks', 'fail'];
// Seconds to blend into and out of a reaction.
export const FADE = 0.3;
// The technician sets off "near" within NEAR metres, and must go beyond AWAY to do so again.
export const NEAR = 3,
  AWAY = 4.5;
const MAX_SECONDS = 60,
  MAX_COOLDOWN = 600;

// The weather that sets off reactions, from the game's readings (signals.js).
export const conditionsFrom = (env = {}) => ({
  cold: (env.outdoorTemp ?? 24) < 10,
  hot: (env.outdoorTemp ?? 24) > 30,
  rain: (env.rain ?? 0) > 20,
  night: (env.light ?? 70) < 15,
});

// Problems with one reaction, as sentences; none means the game can play it.
export function checkReaction(r) {
  const problems = [];
  if (!r || typeof r !== 'object') return ['A reaction is not a setting.'];
  if (!(r.trigger in TRIGGERS)) problems.push(`"${r.trigger}" is not something to react to.`);
  if (r.clip !== false && !(typeof r.clip === 'string' && CLIPS[r.clip]))
    problems.push(`There is no clip called "${r.clip}".`);
  if (
    r.seconds !== undefined &&
    !(typeof r.seconds === 'number' && r.seconds > 0 && r.seconds <= MAX_SECONDS)
  )
    problems.push(`A reaction plays for 0–${MAX_SECONDS} seconds.`);
  if (
    r.cooldown !== undefined &&
    !(typeof r.cooldown === 'number' && r.cooldown >= 0 && r.cooldown <= MAX_COOLDOWN)
  )
    problems.push(`A cooldown is 0–${MAX_COOLDOWN} seconds.`);
  if (r.face !== undefined && typeof r.face !== 'boolean')
    problems.push('Facing the technician is on or off.');
  return problems;
}

// Someone's reactions by trigger: their own over the defaults', leaving out any the game cannot
// play (and those switched off with clip: false).
export function reactionsFor(id, settings = CHARACTER_SETTINGS) {
  const byTrigger = new Map();
  // The judo class's moves are timed to the lesson (judo-characters.js): they do not react.
  if (/^dojo:|^recreation:dojo$/.test(id)) return byTrigger;
  for (const list of [settings?.defaults?.reactions, settings?.people?.[id]?.reactions])
    for (const r of Array.isArray(list) ? list : []) if (r?.trigger) byTrigger.set(r.trigger, r);
  for (const [trigger, r] of byTrigger)
    if (r.clip === false || checkReaction(r).length) byTrigger.delete(trigger);
  return byTrigger;
}
// How long a reaction plays, in seconds.
export const lengthOf = (r) => r.seconds ?? CLIPS[r.clip]?.duration ?? 2;
const turn = (from, to, w) => {
  const d = Math.atan2(Math.sin(to - from), Math.cos(to - from));
  return from + d * w;
};

// The reactions playing in a world: started by fire() (or by what apply() sees: the technician
// near, the weather), and laid over each person's clips by apply(), every frame.
export class Reactions {
  constructor(settings = CHARACTER_SETTINGS) {
    this.settings = settings;
    this.cache = new Map();
    // Who is playing what: id -> { reaction, start }.
    this.playing = new Map();
    // When each person last started each reaction: 'id|trigger' -> time.
    this.started = new Map();
    // Whom the technician is near, so "near" plays once per approach.
    this.close = new Set();
  }
  reactions(id) {
    if (!this.cache.has(id)) this.cache.set(id, reactionsFor(id, this.settings));
    return this.cache.get(id);
  }
  // Starts someone's reaction to a trigger at `now` (seconds) unless it is cooling down or they
  // are already reacting. Returns the reaction started, or null.
  fire(id, trigger, now) {
    const reaction = this.reactions(id).get(trigger);
    // Something that happens to them (a chat, a pass, a failure) cuts short a reaction to the
    // weather or the technician coming near; otherwise one reaction plays at a time.
    if (!reaction || (this.playing.has(id) && !EVENTS.includes(trigger))) return null;
    const key = id + '|' + trigger,
      last = this.started.get(key),
      cooldown = reaction.cooldown ?? TRIGGERS[trigger].cooldown;
    if (last !== undefined && now - last < Math.max(cooldown, lengthOf(reaction))) return null;
    this.started.set(key, now);
    this.playing.set(id, { reaction, start: now });
    return reaction;
  }
  // Lays someone's reaction over a character as the game describes it (three-characters.js):
  // their clips give way to the reaction's, blended in and out, and they turn to the technician if
  // asked. `player`: where the technician is ({ x, z }), `conditions`: from conditionsFrom();
  // `sense: false` only plays what fire() started (the editor's stage).
  apply(character, now, { player = null, conditions = {}, sense = true } = {}) {
    const id = character.key;
    if (id === 'player') return character;
    const mine = this.reactions(id);
    if (!mine.size && !this.playing.has(id)) return character;
    if (sense && player && mine.has('near')) {
      const d = Math.hypot(character.x - player.x, character.z - player.z);
      if (d < NEAR && !this.close.has(id)) {
        this.close.add(id);
        this.fire(id, 'near', now);
      } else if (d > AWAY) this.close.delete(id);
    }
    if (sense)
      for (const [trigger, on] of Object.entries(conditions))
        if (on && mine.has(trigger)) this.fire(id, trigger, now);
    const playing = this.playing.get(id);
    if (!playing) return character;
    const { reaction, start } = playing,
      elapsed = now - start,
      length = lengthOf(reaction);
    if (elapsed >= length || elapsed < 0) {
      this.playing.delete(id);
      return character;
    }
    const w = Math.max(0, Math.min(1, elapsed / FADE, (length - elapsed) / FADE)),
      duration = CLIPS[reaction.clip].duration;
    character.clips = [
      ...character.clips.map((c) => ({ ...c, weight: c.weight * (1 - w) })),
      { name: reaction.clip, time: elapsed % duration, weight: w },
    ];
    if (reaction.face && player)
      character.angle = turn(
        character.angle,
        Math.atan2(player.z - character.z, player.x - character.x),
        w,
      );
    return character;
  }
  // Stops everything (a new city, a reload of the settings).
  clear() {
    this.playing.clear();
    this.started.clear();
    this.close.clear();
    this.cache.clear();
  }
}
