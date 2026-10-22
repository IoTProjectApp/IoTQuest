import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from '../public/vendor/three.module.min.js';
import {
  BUILT_IN_MODELS,
  IMPORTED_MODELS,
  importedModels,
  validModel,
  modelFile,
  modelHeight,
  knownModel,
} from '../public/character-models.js';
import { WOMEN, MEN } from '../public/people-cast.js';
import {
  fitModel,
  rigName,
  ModelError,
  modelNameProblem,
  modelNameFromFile,
  modelEntry,
  HIPS_HEIGHT,
} from '../editor/workspaces/character-editor/model-import.js';

// A small humanoid rig: [bone, parent, [x, y, z] in metres when standing, facing +z].
const RIG = [
  ['Hips', null, [0, 1.0, 0]],
  ['Spine', 'Hips', [0, 1.1, 0]],
  ['Spine1', 'Spine', [0, 1.22, 0]],
  ['Spine2', 'Spine1', [0, 1.34, 0]],
  ['Neck', 'Spine2', [0, 1.5, 0]],
  ['Head', 'Neck', [0, 1.6, 0]],
  ['LeftShoulder', 'Spine2', [0.08, 1.45, 0]],
  ['LeftArm', 'LeftShoulder', [0.2, 1.45, 0]],
  ['LeftForeArm', 'LeftArm', [0.45, 1.45, 0]],
  ['LeftHand', 'LeftForeArm', [0.7, 1.45, 0]],
  ['RightShoulder', 'Spine2', [-0.08, 1.45, 0]],
  ['RightArm', 'RightShoulder', [-0.2, 1.45, 0]],
  ['RightForeArm', 'RightArm', [-0.45, 1.45, 0]],
  ['RightHand', 'RightForeArm', [-0.7, 1.45, 0]],
  ['LeftUpLeg', 'Hips', [0.1, 0.95, 0]],
  ['LeftLeg', 'LeftUpLeg', [0.1, 0.5, 0]],
  ['LeftFoot', 'LeftLeg', [0.1, 0.08, 0]],
  ['RightUpLeg', 'Hips', [-0.1, 0.95, 0]],
  ['RightLeg', 'RightUpLeg', [-0.1, 0.5, 0]],
  ['RightFoot', 'RightLeg', [-0.1, 0.08, 0]],
];
// Builds the rig as a file might hold it: bones named with `prefix`, in `unit`s (1 = metres,
// 100 = centimetres), under an armature turned by `turn`; one skinned piece, a box per bone.
function makeRig({ prefix = 'mixamorig:', unit = 1, turn = null, without = [] } = {}) {
  const scene = new THREE.Group(),
    armature = new THREE.Group();
  if (turn) armature.quaternion.copy(turn);
  scene.add(armature);
  const bones = new Map(),
    standing = new Map(RIG.map(([n, , p]) => [n, new THREE.Vector3(...p)]));
  const parentOf = new Map(RIG.map(([n, p]) => [n, p]));
  for (let [name, parent] of RIG) {
    if (without.includes(name)) continue;
    while (parent && without.includes(parent)) parent = parentOf.get(parent);
    const bone = new THREE.Bone();
    bone.name = prefix + name;
    const from = parent ? standing.get(parent) : new THREE.Vector3();
    bone.position.copy(standing.get(name)).sub(from).multiplyScalar(unit);
    (parent ? bones.get(parent) : armature).add(bone);
    bones.set(name, bone);
  }
  // Vertices: a cube round each bone, in the armature's space, bound wholly to it.
  const positions = [],
    indices = [],
    weights = [];
  const list = [...bones.keys()];
  list.forEach((name, b) => {
    const c = standing.get(name);
    for (const dx of [-0.03, 0.03])
      for (const dz of [-0.03, 0.03]) {
        positions.push((c.x + dx) * unit, (c.y - 0.06 + 0.06) * unit, (c.z + dz) * unit);
        indices.push(b, 0, 0, 0);
        weights.push(1, 0, 0, 0);
      }
  });
  // The soles: a little under each foot.
  for (const foot of ['LeftFoot', 'RightFoot']) {
    if (!bones.has(foot)) continue;
    const c = standing.get(foot);
    positions.push(c.x * unit, 0, (c.z + 0.1) * unit);
    indices.push(list.indexOf(foot), 0, 0, 0);
    weights.push(1, 0, 0, 0);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(indices, 4));
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weights, 4));
  const mesh = new THREE.SkinnedMesh(g, new THREE.MeshStandardMaterial());
  mesh.name = 'Wolf3D_Outfit_Top';
  armature.add(mesh);
  scene.updateMatrixWorld(true);
  mesh.bind(new THREE.Skeleton(list.map((n) => bones.get(n))));
  return scene;
}
// Where each vertex of the fitted model is drawn (metres), as the renderer skins it.
function drawn(root) {
  root.updateMatrixWorld(true);
  const points = [];
  root.traverse((o) => {
    if (!o.isSkinnedMesh) return;
    o.skeleton.update();
    const p = o.geometry.attributes.position;
    for (let i = 0; i < p.count; i++)
      points.push(
        o
          .applyBoneTransform(i, new THREE.Vector3().fromBufferAttribute(p, i))
          .applyMatrix4(o.matrixWorld),
      );
  });
  return points;
}
const bone = (root, name) => root.getObjectByName('mixamorig' + name);
const worldOf = (root, name) => bone(root, name).getWorldPosition(new THREE.Vector3());

test('the shipped models file is empty, so everyone is played as before', async () => {
  const text = await readFile(new URL('../public/data/models.js', import.meta.url), 'utf8');
  assert.match(text, /export default \{ version: 1, models: \{\} \};/);
  assert.deepEqual(IMPORTED_MODELS, {});
  assert.deepEqual(BUILT_IN_MODELS, [...WOMEN, ...MEN, 'Chad', 'Jennifer']);
  assert.equal(modelFile('Kate'), 'Kate');
  assert.equal(modelFile('Kate', true), 'Kate-low');
  assert.equal(modelHeight('Kate'), 1);
  assert.ok(knownModel('Chad'));
  assert.ok(!knownModel('Robin'));
});

test('imported model entries are checked before the game uses them', () => {
  assert.ok(validModel('Robin', { file: 'model-Robin.glb', woman: true, height: 0.9 }));
  assert.ok(!validModel('Kate', { file: 'model-Kate.glb' }), 'a built-in name');
  assert.ok(!validModel('robin', { file: 'model-robin.glb' }), 'starts lower-case');
  assert.ok(!validModel('Robin', { file: '../game.js' }), 'another file');
  assert.ok(!validModel('Robin', { file: 'model-Robin.glb', height: 3 }), 'too tall');
  const models = importedModels({
    version: 1,
    models: {
      Robin: { file: 'model-Robin.glb', height: 0.8 },
      Bad: { file: 'x.glb' },
    },
  });
  assert.deepEqual(Object.keys(models), ['Robin']);
});

test('bone names from Mixamo, Blender and Ready Player Me become the game’s', () => {
  for (const raw of [
    'mixamorig:Hips',
    'mixamorig7:Hips',
    'mixamorig12Hips',
    'mixamorig_Hips',
    'Armature|mixamorig:Hips',
    'Hips',
    'Hips_01',
  ])
    assert.equal(rigName(raw), 'mixamorigHips', raw);
  assert.equal(rigName('LeftHandThumb1'), 'mixamorigLeftHandThumb1');
});

for (const [label, options] of [
  ['a Mixamo rig in centimetres', { prefix: 'mixamorig:', unit: 100 }],
  ['a Ready Player Me rig in metres', { prefix: '', unit: 1 }],
  [
    'a Blender rig lying down and facing away',
    {
      prefix: 'mixamorig_',
      unit: 1,
      turn: new THREE.Quaternion()
        .setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI)
        .multiply(
          new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2),
        ),
    },
  ],
])
  test(`${label} is stood up in the game's form`, () => {
    const fitted = fitModel(makeRig(options)),
      { root } = fitted;
    assert.equal(root.scale.x, 0.01);
    assert.equal(fitted.bones, RIG.length);
    // Hips as high as the game's people's, feet on the ground, facing +z (left hip on +x).
    assert.ok(Math.abs(worldOf(root, 'Hips').y - HIPS_HEIGHT) < 1e-4);
    assert.ok(worldOf(root, 'Head').y > worldOf(root, 'Hips').y + 0.4);
    assert.ok(worldOf(root, 'LeftUpLeg').x > worldOf(root, 'RightUpLeg').x);
    const points = drawn(root),
      lowest = Math.min(...points.map((p) => p.y));
    assert.ok(Math.abs(lowest) < 1e-4, 'its feet are on the ground: ' + lowest);
    // In centimetres under the 0.01 scale, like the game's models; bones keep scale 1.
    assert.ok(Math.abs(bone(root, 'Hips').position.y - HIPS_HEIGHT * 100) < 0.01);
    root.traverse((o) => o.isBone && assert.ok(Math.abs(o.scale.x - 1) < 1e-6));
    // Drawn where it stood: each bone's piece sits on its bone.
    const head = worldOf(root, 'Head');
    assert.ok(points.some((p) => p.distanceTo(head) < 0.06));
    // A clip turns its bones: the arm swings, and the hand's piece goes with it.
    const hand = root.getObjectByName('mixamorigLeftHand');
    const before = drawn(root).filter((p) => p.distanceTo(worldOf(root, 'LeftHand')) < 0.06);
    bone(root, 'LeftArm').quaternion.multiply(
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -1.2),
    );
    root.updateMatrixWorld(true);
    const after = worldOf(root, 'LeftHand');
    assert.ok(after.y < 1.2, 'the hand dropped with the arm');
    assert.ok(drawn(root).some((p) => p.distanceTo(after) < 0.06));
    assert.ok(before.length && hand);
    // Its piece named for the outfits.
    assert.ok(root.getObjectByName('Wolf3D_Outfit_Top_Shirt'));
    if (options.turn) assert.ok(fitted.turned.length);
  });

test('a model whose bones are not Mixamo-style is refused, with what it lacks', () => {
  assert.throws(
    () => fitModel(makeRig({ without: ['LeftForeArm', 'Neck'] })),
    (e) => e instanceof ModelError && /no Neck, LeftForeArm/.test(e.message),
  );
  const unrigged = new THREE.Group();
  unrigged.add(new THREE.Mesh(new THREE.BoxGeometry()));
  assert.throws(() => fitModel(unrigged), /no rigged \(skinned\) body/);
  // Missing helpful bones are listed, not refused.
  assert.deepEqual(fitModel(makeRig({ without: ['Spine2'] })).missing, [
    'Spine2',
    'LeftToeBase',
    'RightToeBase',
  ]);
});

test('model names and entries', () => {
  assert.equal(modelNameProblem('Robin'), null);
  assert.match(modelNameProblem('Kate'), /already a model/);
  assert.match(modelNameProblem('my model'), /letters and digits/);
  assert.equal(modelNameFromFile('my avatar (2).glb'), 'MyAvatar2');
  assert.equal(modelNameFromFile('kate.fbx'), 'Kate2');
  assert.deepEqual(modelEntry('Robin', { woman: true, height: 0.8 }), {
    file: 'model-Robin.glb',
    woman: true,
    height: 0.8,
  });
  assert.deepEqual(modelEntry('Robin'), { file: 'model-Robin.glb', woman: false });
});

test('pieces get the game’s material; untextured ones keep their colour', () => {
  const scene = makeRig();
  scene.traverse((o) => {
    if (o.isSkinnedMesh) o.material = new THREE.MeshPhongMaterial({ color: 0x3366cc });
  });
  const { root } = fitModel(scene);
  let piece;
  root.traverse((o) => o.isSkinnedMesh && (piece = o));
  assert.ok(piece.material.isMeshStandardMaterial);
  assert.equal(piece.material.color.getHex(), 0x3366cc);
  assert.equal(piece.material.userData.keepColour, true);
});

test('the renderer and the editor shell handle imported models safely', async () => {
  const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
  const renderer = await read('../public/three-characters.js');
  assert.match(renderer, /file = modelFile\(state\.model, low\)/);
  assert.match(renderer, /if \(!m\.userData\.keepColour\) m\.color\.set/);
  const world = await read('../public/world3d.js');
  assert.equal((world.match(/knownModel\(set\.model\)/g) || []).length, 2);
  const shell = await read('../editor/main.mjs');
  // Only names like the clips' (no path), only binary glTF, written whole.
  assert.match(
    shell,
    /const modelFile = \(name\) => \{\s+if \(typeof name !== 'string' \|\| !CLIP_NAME\.test\(name\)\)/,
  );
  assert.match(shell, /join\(CLIP_FOLDER, 'model-' \+ name \+ '\.glb'\)/);
  assert.match(shell, /'glTF'\) throw Error\('Not a binary glTF model'\)/);
  assert.match(shell, /models: \{\s+file: join\(PUBLIC, 'data', 'models\.js'\)/);
  const preload = await read('../editor/preload.cjs');
  for (const call of ['openModel', 'saveModel', 'removeModel'])
    assert.match(preload, new RegExp(call));
});
