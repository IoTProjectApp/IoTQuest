// The motion-captured clips characters play (public/models/people/animations.glb): each one's
// length, and for walks the distance one cycle covers, so feet keep pace with the ground. Values
// come from animations.json (a test checks they match). Travel is in metres in the character's
// frame: [sideways, forward].
//
// Clips imported in the Character Editor (editor/workspaces/character-editor, launched with
// scripts/world-editor.sh) join them from data/clips.js:
//   { version: 1, clips: { [Name]: { file: 'clip-Name.glb', duration, stride? } } }
// each in its own file beside the models (public/models/people), played in place; a walk has a
// stride. One that is not valid, or is named like a built-in clip, is left out.
import IMPORTED from './data/clips.js';

const BUILT_IN = {
  Bow: { duration: 2.733 },
  FightingIdle: { duration: 3.3 },
  Idle: { duration: 8.333 },
  Walking: { duration: 1.233, stride: 1.274 },
  FemaleWalk: { duration: 1.167, stride: 1.41 },
  TakedownAttacker: { duration: 3.5, end: [-0.164, 0.798] },
  TakedownVictim: { duration: 3.5, end: [-0.142, -1.143] },
  GettingUp: { duration: 8.333, start: [0.045, -0.214], end: [0.085, 0.469] },
  Jogging: { duration: 2.567, stride: 4.817 },
  Talking: { duration: 10.267 },
  TalkingAsk: { duration: 3.767 },
  SittingIdle: { duration: 2.967 },
  Dribble: { duration: 2.1 },
  Breaststroke: { duration: 5 },
  TreadingWater: { duration: 3 },
  KettlebellSwing: { duration: 1.967 },
  OverheadSquat: { duration: 1.867 },
  AirSquat: { duration: 1.867 },
  SoccerPass: { duration: 1.6 },
  GoalkeeperIdle: { duration: 4.633 },
};
export const CLIP_NAME = /^[A-Z][A-Za-z0-9]{0,39}$/;
// Whether an imported clip's entry can be played.
export const validClip = (name, clip) =>
  CLIP_NAME.test(name) &&
  !(name in BUILT_IN) &&
  clip?.file === 'clip-' + name + '.glb' &&
  Number.isFinite(clip.duration) &&
  clip.duration > 0 &&
  clip.duration <= 600 &&
  (clip.stride === undefined ||
    (Number.isFinite(clip.stride) && clip.stride > 0 && clip.stride <= 10));
// The imported clips that can be played, by name.
export function importedClips(saved = IMPORTED) {
  return Object.fromEntries(
    Object.entries(saved?.clips || {}).filter(([name, clip]) => {
      const ok = validClip(name, clip);
      if (!ok) console.warn(`Imported clip "${name}" left out: its entry is not valid.`);
      return ok;
    }),
  );
}
export const IMPORTED_CLIPS = importedClips();
export const BUILT_IN_CLIPS = BUILT_IN;
export const CLIPS = {
  ...BUILT_IN,
  ...Object.fromEntries(
    Object.entries(IMPORTED_CLIPS).map(([name, { duration, stride }]) => [
      name,
      stride ? { duration, stride } : { duration },
    ]),
  ),
};
// The time a walk clip has reached after `distance` metres (negative walks backwards).
export function walkTime(clip, distance) {
  const { duration, stride } = CLIPS[clip];
  return ((((distance / stride) * duration) % duration) + duration) % duration;
}
