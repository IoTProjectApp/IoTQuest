// Hand-set looks and movement for the game's rigged people, written by the Character Editor
// (editor/workspaces/character-editor, launched with scripts/world-editor.sh) to
// data/characters.js:
//   { version: 1, defaults: { ...settings }, people: { [id]: { ...settings } } }
// where settings are any of:
//   model     which rigged character plays them ('Kate', 'Adam'...; see people-cast.js)
//   outfit    changes to what they wear (see character-outfits.js): a field set to null takes
//             that piece off (a hat: null bares their head)
//   walk      the clip they walk with, idle the one they stand with, activity one they play on
//             the spot instead of both, or false for none even where the code gives them one
//             (see character-clips.js)
//   speed     how fast they walk, as a factor (residents and the household)
//   rate      how fast their idle or activity clip plays, as a factor
//   reactions clips they play when something happens (see character-reactions.js)
//   appearance  their height, build, skin, hair, beard and brows (see character-appearance.js);
//             a person's own fields are laid over the defaults' one by one
// A person's own settings come before the defaults, and the defaults before what the code picks.
// Ids are the game's own: 'player' (the technician), 'Maya', 'worker:shop-floor:0',
// 'bus:0:1>1:1:2'... With no settings everyone is as the code makes them.
import CHARACTER_SETTINGS from './data/characters.js';
import { CLIPS } from './character-clips.js';

export { CHARACTER_SETTINGS };

export function settingsFor(id, settings = CHARACTER_SETTINGS) {
  const defaults = settings?.defaults || {},
    own = settings?.people?.[id] || {};
  return {
    model: own.model ?? defaults.model ?? null,
    outfit: { ...defaults.outfit, ...own.outfit },
    walk: own.walk ?? defaults.walk ?? null,
    idle: own.idle ?? defaults.idle ?? null,
    activity: own.activity ?? defaults.activity ?? null,
    speed: own.speed ?? defaults.speed ?? 1,
    rate: own.rate ?? defaults.rate ?? 1,
    appearance: { ...defaults.appearance, ...own.appearance },
  };
}
// An outfit with changes laid over it: a change of null takes that piece off.
export function dressed(outfit, changes) {
  if (!changes || !Object.keys(changes).length) return outfit;
  const result = { ...outfit };
  for (const [key, value] of Object.entries(changes))
    if (value === null) delete result[key];
    else result[key] = value;
  return result;
}
// A clip the game has, else `fallback`: a clip named in the settings but not converted on this
// machine (or not published yet) leaves its person standing rather than stopping the world.
export const knownClip = (name, fallback = 'Idle') => (name && CLIPS[name] ? name : fallback);
