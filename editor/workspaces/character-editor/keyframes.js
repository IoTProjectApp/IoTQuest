// Clips made in the Character Editor's pose editor: a few poses (keyframes) on a timeline, the
// moments in between filled in smoothly, built into an animation clip the game plays like any
// other. Free of the DOM so it runs under Node in the tests.
//
// A made clip, as data/clips.js keeps it (under `made`, beside the clip's file and duration):
//   { length, loop, base: { hips: [x, y, z], bones: { [bone]: [x, y, z, w] } },
//     keys: [{ t, ease?, pose: { [bone]: [x, y, z, w] } }] }
// `base` is the whole body's pose it starts from (a moment of another clip); each key turns some
// of the joints below. A joint a key leaves out holds the base pose.
import * as THREE from '../../../public/vendor/three.module.min.js';

export class PoseError extends Error {}

// The joints the pose editor turns, each a bone of the game's skeleton (Mixamo names). `pair` is
// the same joint on the other side.
const SIDES = [
  ['Shoulder', 'shoulder', 'Arm'],
  ['Elbow', 'elbow', 'ForeArm'],
  ['Wrist', 'wrist', 'Hand'],
  ['Hip', 'hip', 'UpLeg'],
  ['Knee', 'knee', 'Leg'],
  ['Ankle', 'ankle', 'Foot'],
  ['Collarbone', 'collar', 'Shoulder'],
];
export const JOINTS = [
  { id: 'hips', name: 'Hips (whole body)', bone: 'mixamorigHips' },
  { id: 'spine', name: 'Lower back', bone: 'mixamorigSpine' },
  { id: 'chest', name: 'Chest', bone: 'mixamorigSpine2' },
  { id: 'neck', name: 'Neck', bone: 'mixamorigNeck' },
  { id: 'head', name: 'Head', bone: 'mixamorigHead' },
  ...SIDES.flatMap(([name, id, bone]) => [
    {
      id: id + 'L',
      name: 'Left ' + name.toLowerCase(),
      bone: 'mixamorigLeft' + bone,
      pair: id + 'R',
    },
    {
      id: id + 'R',
      name: 'Right ' + name.toLowerCase(),
      bone: 'mixamorigRight' + bone,
      pair: id + 'L',
    },
  ]),
];
export const JOINT_BONES = new Set(JOINTS.map((j) => j.bone));
export const jointOf = (bone) => JOINTS.find((j) => j.bone === bone);

// How the moments between two keys are filled in.
export const EASES = {
  smooth: (u) => u * u * (3 - 2 * u),
  linear: (u) => u,
  // Gets going quickly and settles gently, like a wave or a reach.
  out: (u) => 1 - (1 - u) * (1 - u),
  // Holds the pose, then snaps to the next one at the end.
  hold: (u) => (u < 1 ? 0 : 1),
};
export const FPS = 30;
export const MIN_LENGTH = 0.2,
  MAX_LENGTH = 60;
const round = (v, places = 5) => +v.toFixed(places);
const quat = (q) => new THREE.Quaternion().fromArray(q);
export const tidyQuat = (q) =>
  new THREE.Quaternion()
    .fromArray(q)
    .normalize()
    .toArray()
    .map((v) => round(v));

// The whole body's pose at one moment of a clip: { hips, bones } (every bone the clip moves).
export function poseFromClip(clip, time) {
  const bones = {};
  let hips = [0, 0, 0];
  const t = Math.min(Math.max(0, time), clip.duration);
  for (const track of clip.tracks) {
    const dot = track.name.lastIndexOf('.'),
      bone = track.name.slice(0, dot),
      prop = track.name.slice(dot + 1),
      value = [...track.createInterpolant().evaluate(t)];
    if (prop === 'quaternion') bones[bone] = tidyQuat(value);
    else if (prop === 'position' && bone === 'mixamorigHips') hips = value.map((v) => round(v, 3));
  }
  return { hips, bones };
}

// A new clip starting from a moment of another: one key at the start holding its pose.
export function newClip(base, { length = 2, loop = true } = {}) {
  return {
    length,
    loop,
    base: structuredClone(base),
    keys: [{ t: 0, pose: jointsOf(base.bones) }],
  };
}
// The joints of a whole-body pose.
export const jointsOf = (bones) =>
  Object.fromEntries(
    Object.entries(bones)
      .filter(([bone]) => JOINT_BONES.has(bone))
      .map(([bone, q]) => [bone, [...q]]),
  );

export const sortKeys = (made) => made.keys.sort((a, b) => a.t - b.t);
// The key at a moment (within half a frame), if any.
export const keyAt = (made, t) => made.keys.find((k) => Math.abs(k.t - t) < 0.5 / FPS);

// A bone's turn at time t: between the keys either side, eased by the earlier key's ease (or
// smooth). Past the last key a looping clip heads back to the first; one that does not holds.
export function boneAt(made, bone, t) {
  const keys = made.keys.filter((k) => k.pose[bone]),
    base = made.base.bones[bone];
  if (!keys.length) return base ? [...base] : null;
  const len = made.length;
  let prev = null,
    next = null;
  for (const k of keys) {
    if (k.t <= t + 1e-9) prev = k;
    else if (!next) next = k;
  }
  let t0, t1;
  if (prev && next) [t0, t1] = [prev.t, next.t];
  else if (keys.length === 1 || !made.loop) return [...(prev || next).pose[bone]];
  else if (prev) {
    next = keys[0];
    [t0, t1] = [prev.t, next.t + len];
  } else {
    prev = keys.at(-1);
    [t0, t1] = [prev.t - len, next.t];
  }
  const u = t1 > t0 ? Math.min(1, Math.max(0, (t - t0) / (t1 - t0))) : 1,
    eased = (EASES[prev.ease] || EASES.smooth)(u);
  return quat(prev.pose[bone]).slerp(quat(next.pose[bone]), eased).toArray();
}
// Every bone's turn at time t, as { [bone]: [x, y, z, w] }.
export function poseAt(made, t) {
  const bones = { ...made.base.bones };
  for (const bone of JOINT_BONES) {
    const q = boneAt(made, bone, t);
    if (q) bones[bone] = q;
  }
  return bones;
}

// The pose with left and right swapped, as in a mirror: each joint takes its pair's turn,
// reflected (the game's skeleton is symmetric about its x axis, so (x, y, z, w) → (x, -y, -z, w)).
export function mirrorPose(pose) {
  const flip = ([x, y, z, w]) => [x, -y, -z, w].map((v) => (v === 0 ? 0 : v)),
    swap = (bone) =>
      bone.replace(
        /^mixamorig(Left|Right)/,
        (_, side) => 'mixamorig' + (side === 'Left' ? 'Right' : 'Left'),
      );
  return Object.fromEntries(Object.entries(pose).map(([bone, q]) => [swap(bone), flip(q)]));
}

// The made clip as an animation clip: every bone the base moves, sampled at FPS, the hips held
// where the base has them (the game moves the character itself).
export function buildClip(made, name) {
  checkMade(made);
  const frames = Math.max(1, Math.round(made.length * FPS)),
    // Every frame, and each pose's own moment so none is cut short between frames.
    times = [
      ...new Set([
        ...Array.from({ length: frames + 1 }, (_, i) => round((i / frames) * made.length, 4)),
        ...made.keys.map((k) => round(k.t, 4)),
      ]),
    ].sort((a, b) => a - b),
    tracks = [
      new THREE.VectorKeyframeTrack(
        'mixamorigHips.position',
        [0, made.length],
        [...made.base.hips, ...made.base.hips],
      ),
    ];
  for (const bone of Object.keys(made.base.bones)) {
    if (!JOINT_BONES.has(bone)) {
      const q = made.base.bones[bone];
      tracks.push(
        new THREE.QuaternionKeyframeTrack(bone + '.quaternion', [0, made.length], [...q, ...q]),
      );
      continue;
    }
    const values = [];
    for (const t of times) values.push(...boneAt(made, bone, t));
    tracks.push(new THREE.QuaternionKeyframeTrack(bone + '.quaternion', times, values));
  }
  return new THREE.AnimationClip(name, made.length, tracks);
}

// Every problem with a made clip, as a PoseError (the first one).
export function checkMade(made) {
  const fail = (text) => {
    throw new PoseError(text);
  };
  if (!made || typeof made !== 'object') fail('There is no clip.');
  if (!(made.length >= MIN_LENGTH && made.length <= MAX_LENGTH))
    fail(`A clip lasts ${MIN_LENGTH}–${MAX_LENGTH} seconds.`);
  const isQuat = (q) =>
    Array.isArray(q) &&
    q.length === 4 &&
    q.every(Number.isFinite) &&
    Math.abs(Math.hypot(...q) - 1) < 0.01;
  if (!made.base?.bones || !Object.keys(made.base.bones).length) fail('It has no starting pose.');
  if (
    !Array.isArray(made.base.hips) ||
    made.base.hips.length !== 3 ||
    !made.base.hips.every(Number.isFinite)
  )
    fail('Its starting pose has no hips position.');
  for (const [bone, q] of Object.entries(made.base.bones))
    if (!/^mixamorig\w+$/.test(bone) || !isQuat(q))
      fail(`Its starting pose has a bad turn for ${bone}.`);
  if (!Array.isArray(made.keys) || !made.keys.length) fail('It needs at least one pose.');
  const times = [];
  for (const k of made.keys) {
    if (!(k.t >= 0 && k.t <= made.length)) fail(`A pose at ${k.t} s is outside the clip.`);
    if (times.some((t) => Math.abs(t - k.t) < 0.5 / FPS))
      fail(`Two poses are at ${round(k.t, 2)} s.`);
    times.push(k.t);
    if (k.ease !== undefined && !(k.ease in EASES)) fail(`"${k.ease}" is not a way to move.`);
    for (const [bone, q] of Object.entries(k.pose || {})) {
      if (!JOINT_BONES.has(bone)) fail(`${bone} is not a joint the pose editor turns.`);
      if (!isQuat(q)) fail(`The pose at ${round(k.t, 2)} s has a bad turn for ${bone}.`);
    }
  }
  return true;
}
// The made clip tidied for saving: keys in order, turns rounded.
export function tidyMade(made) {
  return {
    length: round(made.length, 3),
    loop: !!made.loop,
    base: {
      hips: made.base.hips.map((v) => round(v, 3)),
      bones: Object.fromEntries(Object.entries(made.base.bones).map(([b, q]) => [b, tidyQuat(q)])),
    },
    keys: [...made.keys]
      .sort((a, b) => a.t - b.t)
      .map((k) => ({
        t: round(k.t, 3),
        ...(k.ease && k.ease !== 'smooth' ? { ease: k.ease } : {}),
        pose: Object.fromEntries(Object.entries(k.pose).map(([b, q]) => [b, tidyQuat(q)])),
      })),
  };
}
