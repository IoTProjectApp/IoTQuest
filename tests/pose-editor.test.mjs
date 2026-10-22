import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import * as THREE from '../public/vendor/three.module.min.js';
import {
  JOINTS,
  JOINT_BONES,
  EASES,
  FPS,
  PoseError,
  poseFromClip,
  newClip,
  keyAt,
  boneAt,
  poseAt,
  mirrorPose,
  buildClip,
  checkMade,
  tidyMade,
} from '../editor/workspaces/character-editor/keyframes.js';
import { validClip, importedClips } from '../public/character-clips.js';
import { clipEntry } from '../editor/workspaces/character-editor/clip-import.js';

const turn = (axis, degrees) =>
  new THREE.Quaternion()
    .setFromAxisAngle(new THREE.Vector3(...axis), (degrees * Math.PI) / 180)
    .toArray();
const angle = (a, b) =>
  (new THREE.Quaternion().fromArray(a).angleTo(new THREE.Quaternion().fromArray(b)) * 180) /
  Math.PI;
const BONES = [
  'mixamorigHips',
  'mixamorigSpine',
  'mixamorigLeftArm',
  'mixamorigRightArm',
  'mixamorigLeftForeArm',
  'mixamorigLeftHandIndex1',
];
// A stand-in for a game clip: every bone still, the left arm raising 60° over a second.
function sourceClip() {
  const tracks = [
    new THREE.VectorKeyframeTrack('mixamorigHips.position', [0, 1], [1, 98, 2, 1, 98, 2]),
  ];
  for (const bone of BONES) {
    const end = bone === 'mixamorigLeftArm' ? turn([0, 0, 1], 60) : [0, 0, 0, 1];
    tracks.push(
      new THREE.QuaternionKeyframeTrack(bone + '.quaternion', [0, 1], [0, 0, 0, 1, ...end]),
    );
  }
  return new THREE.AnimationClip('Idle', 1, tracks);
}

test('a pose is taken from any moment of a clip', () => {
  const pose = poseFromClip(sourceClip(), 0.5);
  assert.deepEqual(pose.hips, [1, 98, 2]);
  assert.deepEqual(Object.keys(pose.bones).sort(), [...BONES].sort());
  assert.ok(Math.abs(angle(pose.bones.mixamorigLeftArm, [0, 0, 0, 1]) - 30) < 0.01);
  // Past the end holds the last frame.
  assert.ok(
    Math.abs(angle(poseFromClip(sourceClip(), 9).bones.mixamorigLeftArm, [0, 0, 0, 1]) - 60) < 0.01,
  );
});

test('a new clip starts with one pose: the joints of the moment it starts from', () => {
  const made = newClip(poseFromClip(sourceClip(), 0), { length: 2 });
  assert.equal(made.keys.length, 1);
  assert.deepEqual(
    Object.keys(made.keys[0].pose).sort(),
    BONES.filter((b) => JOINT_BONES.has(b)).sort(),
  );
  // Fingers are not joints: they hold the base pose.
  assert.ok(!('mixamorigLeftHandIndex1' in made.keys[0].pose));
  assert.ok(checkMade(made));
  assert.equal(JOINTS.length, 19);
  assert.ok(JOINTS.every((j) => !j.pair || JOINTS.find((o) => o.id === j.pair).pair === j.id));
});

test('the moments between poses are filled in, eased, and loop back', () => {
  const made = newClip(poseFromClip(sourceClip(), 0), { length: 2, loop: true });
  made.keys.push({ t: 1, pose: { mixamorigRightArm: turn([1, 0, 0], 90) } });
  const arm = (t) => angle(boneAt(made, 'mixamorigRightArm', t), [0, 0, 0, 1]);
  assert.ok(Math.abs(arm(0)) < 1e-6);
  assert.ok(Math.abs(arm(1) - 90) < 1e-6);
  // Smooth by default: half way in time is half way in turn, a quarter is less than a quarter.
  assert.ok(Math.abs(arm(0.5) - 45) < 1e-4);
  assert.ok(arm(0.25) < 22.5 - 1);
  // Looping: from the last pose back to the first by the end.
  assert.ok(Math.abs(arm(1.5) - 45) < 1e-4);
  assert.ok(arm(1.99) < 1);
  // Not looping: holds the last pose.
  made.loop = false;
  assert.ok(Math.abs(arm(1.9) - 90) < 1e-6);
  // Other ways to move.
  made.keys[0].ease = 'linear';
  assert.ok(Math.abs(arm(0.25) - 22.5) < 1e-4);
  made.keys[0].ease = 'hold';
  assert.ok(arm(0.99) < 1e-6);
  assert.equal(EASES.out(0.5), 0.75);
  // A joint no pose turns holds its base.
  assert.deepEqual(poseAt(made, 0.7).mixamorigLeftHandIndex1, [0, 0, 0, 1]);
  assert.equal(keyAt(made, 1 + 0.4 / FPS), made.keys[1]);
  assert.equal(keyAt(made, 1.1), undefined);
});

test('the clip is built for the game: every bone, sampled, the hips held', () => {
  const made = newClip(poseFromClip(sourceClip(), 0), { length: 1.5 });
  made.keys.push({ t: 0.75, pose: { mixamorigRightArm: turn([1, 0, 0], 80) } });
  const clip = buildClip(made, 'Waving');
  assert.equal(clip.name, 'Waving');
  assert.equal(clip.duration, 1.5);
  assert.equal(clip.tracks.length, BONES.length + 1);
  const arm = clip.tracks.find((t) => t.name === 'mixamorigRightArm.quaternion');
  // Each frame, and the pose at 0.75 s, which falls between two.
  assert.equal(arm.times.length, 1.5 * FPS + 2);
  const mid = [...arm.createInterpolant().evaluate(0.75)];
  // Tracks are single precision: within a tenth of a degree.
  assert.ok(Math.abs(angle(mid, turn([1, 0, 0], 80))) < 0.1);
  const hips = clip.tracks.find((t) => t.name === 'mixamorigHips.position');
  assert.deepEqual([...hips.values], [1, 98, 2, 1, 98, 2]);
  assert.equal(clip.validate(), true);
});

test('mirroring swaps left and right', () => {
  const pose = { mixamorigLeftArm: [0.1, 0.2, 0.3, 0.927], mixamorigSpine: [0.1, 0.2, 0, 0.975] };
  const mirrored = mirrorPose(pose);
  assert.deepEqual(mirrored, {
    mixamorigRightArm: [0.1, -0.2, -0.3, 0.927],
    mixamorigSpine: [0.1, -0.2, 0, 0.975],
  });
  assert.deepEqual(mirrorPose(mirrored), pose);
});

test(
  'mirroring a real pose puts each joint where the other side was',
  {
    skip: !existsSync('public/models/people/Kate.glb') && 'character models not downloaded',
  },
  async () => {
    globalThis.self ??= globalThis;
    const { GLTFLoader } = await import('../public/vendor/three-addons/GLTFLoader.js');
    const load = async (file) => {
      const b = await readFile(file);
      return new GLTFLoader().parseAsync(
        b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength),
        '',
      );
    };
    const kate = await load('public/models/people/Kate.glb'),
      animations = await load('public/models/people/animations.glb');
    const bones = new Map();
    kate.scene.traverse((o) => o.isBone && !bones.has(o.name) && bones.set(o.name, o));
    const pose = poseFromClip(
      animations.animations.find((a) => a.name === 'Walking'),
      0.31,
    ).bones;
    const place = (p) => {
      for (const [bone, q] of Object.entries(p)) bones.get(bone)?.quaternion.fromArray(q);
      kate.scene.updateMatrixWorld(true);
      return (name) => bones.get('mixamorig' + name).getWorldPosition(new THREE.Vector3());
    };
    let at = place(pose);
    const before = Object.fromEntries(['LeftHand', 'RightFoot', 'Head'].map((n) => [n, at(n)]));
    at = place(mirrorPose(pose));
    for (const [name, was] of Object.entries(before)) {
      const now = at(name.replace(/Left|Right/, (s) => (s === 'Left' ? 'Right' : 'Left')));
      assert.ok(now.distanceTo(new THREE.Vector3(-was.x, was.y, was.z)) < 0.005, name);
    }
  },
);

test('a made clip is checked before it is built', () => {
  const good = () => newClip(poseFromClip(sourceClip(), 0), { length: 2 });
  const fails = (change, pattern) => {
    const made = good();
    change(made);
    assert.throws(
      () => checkMade(made),
      (e) => e instanceof PoseError && pattern.test(e.message),
    );
  };
  fails((m) => (m.length = 0.1), /lasts/);
  fails((m) => (m.length = 61), /lasts/);
  fails((m) => (m.keys = []), /at least one pose/);
  fails((m) => m.keys.push({ t: 3, pose: {} }), /outside the clip/);
  fails((m) => m.keys.push({ t: 0.01, pose: {} }), /Two poses/);
  fails((m) => m.keys.push({ t: 1, ease: 'wobbly', pose: {} }), /not a way to move/);
  fails(
    (m) => m.keys.push({ t: 1, pose: { mixamorigLeftHandIndex1: [0, 0, 0, 1] } }),
    /not a joint/,
  );
  fails((m) => m.keys.push({ t: 1, pose: { mixamorigLeftArm: [0, 0, 0, 2] } }), /bad turn/);
  fails((m) => (m.base.hips = [0, 0]), /hips/);
  assert.throws(() => buildClip({ ...good(), length: 0 }, 'X'), PoseError);
});

test('a made clip saves like an imported one, keeping its poses to change later', () => {
  const made = newClip(poseFromClip(sourceClip(), 0.5), { length: 1.234567 });
  made.keys.push({
    t: 0.6000001,
    ease: 'smooth',
    pose: { mixamorigRightArm: turn([1, 0, 0], 33.3333) },
  });
  made.keys.reverse();
  const tidy = tidyMade(made);
  assert.equal(tidy.length, 1.235);
  assert.deepEqual(
    tidy.keys.map((k) => k.t),
    [0, 0.6],
  );
  assert.ok(!('ease' in tidy.keys[1]), 'smooth is the default and is left out');
  assert.ok(Object.values(tidy.keys[1].pose)[0].every((v) => String(v).length <= 8));
  assert.ok(checkMade(tidy));
  const entry = { ...clipEntry('Waving', { duration: tidy.length }), made: tidy };
  assert.ok(validClip('Waving', entry));
  // The game plays it like any imported clip, and the entry survives a save as JSON.
  const again = JSON.parse(JSON.stringify(entry));
  assert.deepEqual(importedClips({ version: 1, clips: { Waving: again } }), { Waving: again });
  assert.ok(buildClip(again.made, 'Waving').validate());
});
