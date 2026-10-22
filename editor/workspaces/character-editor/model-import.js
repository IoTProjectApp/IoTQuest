// Importing a character model into the game (Character Editor): a rigged body from a glTF or FBX
// file (a Mixamo character, a Ready Player Me avatar, a Blender export) put into the form the
// game's own models have, so every clip plays on it and outfits fit it:
// - its bones renamed to Mixamo's (mixamorigHips…), whatever prefix they had;
// - stood upright, facing +z, its feet on the ground and its hips as high as the game's people's;
// - in centimetres under a 0.01 scale, its bones' rest turns kept, each piece rebound to them;
// - just its skinned pieces (anything else is left out and counted).
// The file reading and export take three's loaders and exporter as arguments, so the rest runs
// under Node in the tests.
import * as THREE from '../../../public/vendor/three.module.min.js';
import { BUILT_IN_MODELS, IMPORTED_MODELS, MODEL_NAME } from '../../../public/character-models.js';

export class ModelError extends Error {}

// The bones the game's clips and outfits need (without the mixamorig prefix).
export const NEEDED = [
  'Hips',
  'Spine',
  'Spine1',
  'Neck',
  'Head',
  'LeftShoulder',
  'LeftArm',
  'LeftForeArm',
  'LeftHand',
  'RightShoulder',
  'RightArm',
  'RightForeArm',
  'RightHand',
  'LeftUpLeg',
  'LeftLeg',
  'LeftFoot',
  'RightUpLeg',
  'RightLeg',
  'RightFoot',
];
// Bones that help (the chest for aprons and ties, the toes for walking) but can be done without.
export const HELPFUL = ['Spine2', 'LeftToeBase', 'RightToeBase'];
// The game's people stand with their hips this high (metres) in their rest pose, as its clips do.
export const HIPS_HEIGHT = 0.977;
// How tall the game's people are (metres), to compare a model's own height with.
const GAME_HEIGHT = 1.75;

// A bone's name as the game's skeleton has it: 'mixamorig:Hips', 'mixamorig7Hips',
// 'mixamorig_Hips', 'Armature|Hips', 'Hips_01' and a Ready Player Me 'Hips' all become
// 'mixamorigHips'.
export function rigName(raw) {
  const name = String(raw)
    .replace(/^.*\|/, '')
    .replace(/\s/g, '')
    .replace(/^mixamorig\d*[:_]?/, '')
    .replace(/_\d+$/, '');
  return 'mixamorig' + name;
}

// The model in a picked file ({ ext, bytes }): its scene.
export async function readModelFile({ ext, bytes }, { GLTFLoader, FBXLoader }) {
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  try {
    if (ext === 'fbx') return new FBXLoader().parse(buffer, '');
    return (await new GLTFLoader().parseAsync(buffer, '')).scene;
  } catch (error) {
    throw new ModelError(
      'The file could not be read' +
        (ext === 'gltf' ? ' (a .gltf must hold its data inside it; try a .glb)' : '') +
        ': ' +
        error.message,
    );
  }
}

// Mixamo names pieces Shirt, Pants, Shoes…; other tools name them otherwise ('Wolf3D_Outfit_Top').
// A piece that is clearly a top, trousers or shoes gets the word the game's outfits look for.
function pieceName(name) {
  if (/Suit|Hoodie|Sweater|Cloth|Shirt|Pants|Shorts|Shoe|Boot|Sneaker|Footwear/i.test(name))
    return name;
  if (/top|jacket|coat|blouse|tee\b/i.test(name)) return name + '_Shirt';
  if (/bottom|trouser|jean|legging/i.test(name)) return name + '_Pants';
  return name;
}

// A piece's material as the game's people have theirs (as scripts/convert-mixamo.mjs makes
// them). One with no picture keeps its colour, which the renderer otherwise turns white (Mixamo's
// grey would darken its pictures).
const standards = new WeakMap();
function standard(m) {
  if (!standards.has(m)) {
    const made = m.isMeshStandardMaterial
      ? m
      : new THREE.MeshStandardMaterial({
          name: m.name,
          color: m.color,
          map: m.map || null,
          normalMap: m.normalMap || null,
          roughness: 0.85,
          metalness: 0,
          transparent: m.transparent,
          alphaTest: m.transparent ? 0.5 : 0,
          side: m.side,
        });
    if (!made.map) made.userData.keepColour = true;
    standards.set(m, made);
  }
  return standards.get(m);
}

// The model `scene` in the game's form. Returns { root, bones, missing, meshes, left, height,
// turned } where root is the new model (a Group at 0.01 scale), missing the helpful bones it
// lacks, left how many pieces were left out (not skinned), height its own height against the
// game's people (when its units could be told) and turned how it was stood up.
export function fitModel(scene) {
  scene.updateMatrixWorld(true);
  const meshes = [];
  let left = 0;
  scene.traverse((o) => {
    if (o.isSkinnedMesh) meshes.push(o);
    else if (o.isMesh) left++;
  });
  if (!meshes.length)
    throw new ModelError(
      'It has no rigged (skinned) body. Rig it first, for example by uploading it to Mixamo.',
    );
  // Every bone the pieces use, with its world matrix at the bind pose.
  const bind = new Map();
  for (const mesh of meshes)
    mesh.skeleton.bones.forEach((bone, i) => {
      if (!bind.has(bone))
        bind.set(bone, new THREE.Matrix4().copy(mesh.skeleton.boneInverses[i]).invert());
    });
  const byName = new Map();
  for (const bone of bind.keys()) {
    bone.name = rigName(bone.name);
    if (!byName.has(bone.name)) byName.set(bone.name, bone);
  }
  const lacking = NEEDED.filter((n) => !byName.has('mixamorig' + n));
  if (lacking.length)
    throw new ModelError(
      `Its skeleton is not a Mixamo-style one: it has no ${lacking.slice(0, 5).join(', ')}${lacking.length > 5 ? ` (and ${lacking.length - 5} more)` : ''}. ` +
        'Rig it in Mixamo (or export a Ready Player Me avatar) so its bones have the names the clips move.',
    );
  const at = (name) => new THREE.Vector3().setFromMatrixPosition(bind.get(byName.get(name)));

  // Stand it up: head above hips, then facing +z (its left leg on +x).
  const turn = new THREE.Quaternion(),
    up = at('mixamorigHead').sub(at('mixamorigHips')).normalize();
  turn.setFromUnitVectors(up, new THREE.Vector3(0, 1, 0));
  const leftHip = at('mixamorigLeftUpLeg').applyQuaternion(turn),
    right = at('mixamorigRightUpLeg').applyQuaternion(turn);
  const across = new THREE.Vector3(leftHip.x - right.x, 0, leftHip.z - right.z);
  // Turn about the vertical until the left hip is on +x.
  const spin = new THREE.Quaternion().setFromAxisAngle(
    new THREE.Vector3(0, 1, 0),
    -Math.atan2(-across.z, across.x),
  );
  turn.premultiply(spin);
  const turned = [];
  if (up.y < 0.9) turned.push('stood up');
  if (Math.abs(Math.atan2(-across.z, across.x)) > 0.3) turned.push('turned to face forward');

  // Its size: the hips as high as the game's people's above its lowest point.
  const box = new THREE.Box3(),
    v = new THREE.Vector3();
  for (const mesh of meshes) {
    const p = mesh.geometry.attributes.position;
    for (let i = 0; i < p.count; i++)
      box.expandByPoint(
        v.fromBufferAttribute(p, i).applyMatrix4(mesh.bindMatrix).applyQuaternion(turn),
      );
  }
  const hips = at('mixamorigHips').applyQuaternion(turn),
    hipsAbove = hips.y - box.min.y;
  if (!(hipsAbove > 0)) throw new ModelError('Its hips are not above its feet.');
  const scale = HIPS_HEIGHT / hipsAbove,
    // The whole move into the game's space (metres): turn, scale, then feet to the ground under
    // the hips.
    fit = new THREE.Matrix4()
      .makeTranslation(-hips.x * scale, -box.min.y * scale, -hips.z * scale)
      .multiply(new THREE.Matrix4().makeScale(scale, scale, scale))
      .multiply(new THREE.Matrix4().makeRotationFromQuaternion(turn));
  // Its own height, if its units are metres or centimetres (anything else: as tall as the game's).
  const tall = box.max.y - box.min.y,
    metres = tall > 1 && tall < 2.4 ? tall : tall > 100 && tall < 240 ? tall / 100 : null,
    height = metres ? Math.min(1.25, Math.max(0.6, +(metres / GAME_HEIGHT).toFixed(2))) : 1;

  // The new model: bones in centimetres under a 0.01 scale, each where it stood, turned as before.
  const root = new THREE.Group();
  root.name = 'Model';
  root.scale.setScalar(0.01);
  root.updateMatrixWorld(true);
  const world = new Map(),
    position = new THREE.Vector3(),
    quaternion = new THREE.Quaternion(),
    size = new THREE.Vector3(),
    cm = new THREE.Vector3(0.01, 0.01, 0.01);
  for (const [bone, matrix] of bind) {
    new THREE.Matrix4().multiplyMatrices(fit, matrix).decompose(position, quaternion, size);
    world.set(bone, new THREE.Matrix4().compose(position, quaternion, cm));
  }
  // Each bone under the nearest bone above it, or the model itself.
  const parentOf = (bone) => {
    for (let p = bone.parent; p; p = p.parent) if (bind.has(p)) return p;
    return null;
  };
  const parents = new Map([...bind.keys()].map((b) => [b, parentOf(b)]));
  for (const bone of bind.keys()) {
    bone.removeFromParent();
    for (const child of [...bone.children]) if (!bind.has(child)) bone.remove(child);
  }
  for (const [bone, parent] of parents) {
    const local = new THREE.Matrix4()
      .copy(parent ? world.get(parent) : root.matrixWorld)
      .invert()
      .multiply(world.get(bone));
    local.decompose(bone.position, bone.quaternion, bone.scale);
    bone.scale.set(1, 1, 1);
    (parent || root).add(bone);
  }
  root.updateMatrixWorld(true);

  // Each piece, its vertices in the model's centimetres (from where they stood at the bind pose),
  // bound again to the moved bones. Morph targets are offsets: turned and scaled, never moved.
  const toModel = new THREE.Matrix4().copy(root.matrixWorld).invert().multiply(fit);
  for (const mesh of meshes) {
    const move = new THREE.Matrix4().multiplyMatrices(toModel, mesh.bindMatrix),
      linear = new THREE.Matrix4().copy(move).setPosition(0, 0, 0),
      normals = new THREE.Matrix3().getNormalMatrix(move),
      geometry = mesh.geometry.clone();
    geometry.deleteAttribute('tangent');
    geometry.applyMatrix4(move);
    for (const [key, morphs] of Object.entries(geometry.morphAttributes))
      for (const m of morphs)
        if (key === 'normal') m.applyNormalMatrix(normals);
        else if (key === 'position') m.applyMatrix4(linear);
    const piece = new THREE.SkinnedMesh(geometry, [].concat(mesh.material).map(standard));
    if (piece.material.length === 1) piece.material = piece.material[0];
    piece.name = pieceName(mesh.name || 'Body');
    if (mesh.morphTargetDictionary) {
      piece.morphTargetDictionary = mesh.morphTargetDictionary;
      piece.morphTargetInfluences = mesh.morphTargetInfluences.slice();
    }
    root.add(piece);
    piece.updateMatrixWorld(true);
    const skeleton = new THREE.Skeleton(mesh.skeleton.bones);
    skeleton.calculateInverses();
    piece.bind(skeleton, piece.matrixWorld);
  }
  return {
    root,
    bones: bind.size,
    missing: HELPFUL.filter((n) => !byName.has('mixamorig' + n)),
    meshes: meshes.length,
    left,
    height,
    turned,
  };
}

// Waits for every texture's picture (an FBX's embedded ones arrive after it is read).
export async function texturesReady(root) {
  const waits = [];
  root.traverse((o) => {
    for (const m of [].concat(o.material || []))
      for (const t of [m.map, m.normalMap, m.emissiveMap, m.roughnessMap, m.metalnessMap]) {
        const image = t?.image;
        if (image && 'complete' in image && !image.complete)
          waits.push(
            new Promise((resolve) => {
              image.addEventListener('load', resolve, { once: true });
              image.addEventListener('error', resolve, { once: true });
            }),
          );
      }
  });
  await Promise.all(waits);
}

// The fitted model as a binary glTF, its textures no bigger than the game's own (1024).
export async function modelToGlb(root, GLTFExporter) {
  await texturesReady(root);
  return new GLTFExporter().parseAsync(root, { binary: true, maxTextureSize: 1024 });
}

// Why a name cannot be used for a new model, or null.
export function modelNameProblem(name) {
  if (!MODEL_NAME.test(name))
    return 'Name it with letters and digits only, starting with a capital (e.g. Robin).';
  if (BUILT_IN_MODELS.includes(name) || name in IMPORTED_MODELS)
    return `There is already a model called ${name}.`;
  return null;
}
// A model name from a file name: 'my avatar (2).glb' → 'MyAvatar2'.
export function modelNameFromFile(file) {
  const words = String(file)
    .replace(/\.[^.]*$/, '')
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1));
  let name = words.join('').replace(/^\d+/, '').slice(0, 38) || 'Model';
  name = name.charAt(0).toUpperCase() + name.slice(1);
  for (let n = 2; modelNameProblem(name); n++) name = name.replace(/\d*$/, '') + n;
  return name;
}
// The entry data/models.js keeps for a model.
export const modelEntry = (name, { woman = false, height = 1 } = {}) => ({
  file: 'model-' + name + '.glb',
  woman: !!woman,
  ...(height !== 1 ? { height: +height.toFixed(2) } : {}),
});
