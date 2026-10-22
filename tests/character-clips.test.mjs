import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from '../public/vendor/three.module.min.js';
import {
  CLIPS,
  BUILT_IN_CLIPS,
  IMPORTED_CLIPS,
  importedClips,
  validClip,
} from '../public/character-clips.js';
import {
  boneName,
  fitClip,
  nameProblem,
  nameFromFile,
  clipEntry,
  ClipError,
} from '../editor/workspaces/character-editor/clip-import.js';

const BONES = ['mixamorigHips', 'mixamorigSpine', 'mixamorigHead', 'mixamorigLeftLeg'];

test('with no imported clips, the game has exactly its built-in clips', async () => {
  const saved = (await import('../public/data/clips.js')).default;
  assert.deepEqual(saved, { version: 1, clips: {} });
  assert.deepEqual(IMPORTED_CLIPS, {});
  assert.deepEqual(CLIPS, BUILT_IN_CLIPS);
});

test('imported clips join only when their entry can be played', () => {
  const clips = importedClips({
    version: 1,
    clips: {
      Waving: { file: 'clip-Waving.glb', duration: 2.4 },
      Strut: { file: 'clip-Strut.glb', duration: 1.1, stride: 1.3 },
      Idle: { file: 'clip-Idle.glb', duration: 3 },
      Elsewhere: { file: '../game.js', duration: 1 },
      lower: { file: 'clip-lower.glb', duration: 1 },
      Long: { file: 'clip-Long.glb', duration: 0 },
      Far: { file: 'clip-Far.glb', duration: 1, stride: 40 },
    },
  });
  assert.deepEqual(Object.keys(clips), ['Waving', 'Strut']);
  assert.ok(validClip('Waving', { file: 'clip-Waving.glb', duration: 2.4 }));
  assert.ok(!validClip('Waving', { file: 'clip-Other.glb', duration: 2.4 }));
});

test('bones are matched by name, whatever prefix the rig uses', () => {
  const bones = new Set(BONES);
  assert.equal(boneName('mixamorig:Hips', bones), 'mixamorigHips');
  assert.equal(boneName('mixamorig1:Spine', bones), 'mixamorigSpine');
  assert.equal(boneName('mixamorig2Head', bones), 'mixamorigHead');
  assert.equal(boneName('LeftLeg', bones), 'mixamorigLeftLeg');
  assert.equal(boneName('Tail', bones), 'Tail');
});

// A two-second clip in metres whose hips travel 1.2 m forward.
const source = (travel = 1.2) =>
  new THREE.AnimationClip('mixamo.com', 2, [
    new THREE.VectorKeyframeTrack(
      'mixamorig:Hips.position',
      [0, 1, 2],
      [0, 0.95, 0, 0.02, 0.93, travel / 2, 0, 0.95, travel],
    ),
    new THREE.QuaternionKeyframeTrack(
      'mixamorig1:Spine.quaternion',
      [0, 2],
      [0, 0, 0, 1, 0, 0.1, 0, 0.995],
    ),
    new THREE.QuaternionKeyframeTrack('Head.quaternion', [0, 2], [0, 0, 0, 1, 0, 0, 0, 1]),
    new THREE.QuaternionKeyframeTrack('Tail.quaternion', [0, 2], [0, 0, 0, 1, 0, 0, 0, 1]),
  ]);

test('a walk is fitted to the skeleton, in centimetres, in place, with its stride', () => {
  const fit = fitClip(source(), BONES, { name: 'Strut', kind: 'walk' });
  assert.equal(fit.clip.name, 'Strut');
  assert.deepEqual(
    fit.clip.tracks.map((t) => t.name),
    ['mixamorigHips.position', 'mixamorigSpine.quaternion', 'mixamorigHead.quaternion'],
  );
  assert.deepEqual(fit.unmatched, ['Tail']);
  assert.deepEqual(fit.missing, ['mixamorigLeftLeg']);
  assert.equal(fit.duration, 2);
  assert.equal(fit.stride, 1.2);
  assert.deepEqual(fit.travel, [0, 1.2]);
  // Metres became centimetres, and the travel is gone (the height still moves).
  const hips = [...fit.clip.tracks[0].values].map((v) => Math.round(v * 1000) / 1000);
  assert.deepEqual(hips, [0, 95, 0, 0, 93, 0, 0, 95, 0]);
  assert.deepEqual(clipEntry('Strut', fit), { file: 'clip-Strut.glb', duration: 2, stride: 1.2 });
  // The source is left as it was.
  assert.equal(source().tracks[0].name, 'mixamorig:Hips.position');
});

test('a clip on the spot keeps no stride; one that cannot fit is refused', () => {
  const spot = fitClip(source(0), BONES, { name: 'Sway' });
  assert.equal(spot.stride, undefined);
  assert.deepEqual(clipEntry('Sway', spot), { file: 'clip-Sway.glb', duration: 2 });
  assert.throws(() => fitClip(source(0), BONES, { kind: 'walk' }), ClipError);
  const alien = new THREE.AnimationClip('x', 1, [
    new THREE.QuaternionKeyframeTrack('Bone001.quaternion', [0, 1], [0, 0, 0, 1, 0, 0, 0, 1]),
  ]);
  assert.throws(() => fitClip(alien, BONES), /None of its bones match/);
});

test('new clips need a free name of letters and digits', () => {
  assert.equal(nameProblem('Waving'), null);
  assert.match(nameProblem('Idle'), /already a clip/);
  assert.match(nameProblem('waving'), /starting with a capital/);
  assert.match(nameProblem('../x'), /letters and digits/);
  assert.equal(nameFromFile('Happy Idle (2).fbx'), 'HappyIdle2');
  assert.equal(nameFromFile('idle.fbx'), 'Idle2');
  assert.equal(nameFromFile('3d-wave.glb'), 'DWave');
});

test('the shell saves clips only by a safe name, as binary glTF, beside the models', async () => {
  const shell = await readFile(new URL('../editor/main.mjs', import.meta.url), 'utf8');
  assert.match(shell, /const CLIP_NAME = \/\^\[A-Z\]\[A-Za-z0-9\]\{0,39\}\$\/;/);
  assert.match(shell, /'glTF'\) throw Error\('Not a binary glTF clip'\)/);
  assert.match(shell, /join\(CLIP_FOLDER, 'clip-' \+ name \+ '\.glb'\)/);
  assert.match(shell, /clips: \{\s+file: join\(PUBLIC, 'data', 'clips\.js'\)/);
});
