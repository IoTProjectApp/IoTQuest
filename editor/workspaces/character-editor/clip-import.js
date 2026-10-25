// Importing an animation clip into the game (Character Editor): the clip from a glTF or FBX file
// (a Mixamo download, say), its tracks renamed to the game's skeleton by bone name, its travel
// taken out so the game moves the character itself, and the result as a binary glTF holding just
// the clip. The file reading and export take three's loaders and exporter as arguments, so the
// rest runs under Node in the tests.
import * as THREE from '../../../public/vendor/three.module.min.js';
import { CLIPS, CLIP_NAME } from '../../../public/character-clips.js';

export class ClipError extends Error {}

// A bone's name as the game's skeleton has it: Mixamo writes 'mixamorig:Hips' (or 'mixamorig1:'),
// loaders drop the colon, and some rigs leave the prefix off.
export function boneName(raw, bones) {
  const name = String(raw)
    .replace(/[:|\s]/g, '')
    .replace(/^mixamorig\d*/, 'mixamorig');
  if (bones.has(name)) return name;
  if (bones.has('mixamorig' + name)) return 'mixamorig' + name;
  return name;
}

// The clip in a picked file ({ ext, bytes }): its first animation and how many it has.
export async function readClipFile({ ext, bytes }, { GLTFLoader, FBXLoader }) {
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  let animations;
  try {
    if (ext === 'fbx') animations = new FBXLoader().parse(buffer, '').animations;
    else animations = (await new GLTFLoader().parseAsync(buffer, '')).animations;
  } catch (error) {
    throw new ClipError(
      'The file could not be read' +
        (ext === 'gltf' ? ' (a .gltf must hold its data inside it; try a .glb)' : '') +
        ': ' +
        error.message,
    );
  }
  if (!animations?.length) throw new ClipError('The file has no animation in it.');
  return { clip: animations[0], count: animations.length };
}

const round = (v) => +v.toFixed(3);
// The clip fitted to the game's skeleton (`bones`: the game's bone names). kind 'spot' plays where
// the character stands; 'walk' measures how far one cycle travels (its stride) for the game to
// move them that far. Returns { clip, matched, unmatched, missing, duration, stride, travel }.
export function fitClip(source, bones, { name = source.name, kind = 'spot' } = {}) {
  bones = new Set(bones);
  const matched = new Set(),
    unmatched = new Set(),
    tracks = [];
  for (const track of source.tracks) {
    const dot = track.name.lastIndexOf('.'),
      node = track.name.slice(0, dot),
      bone = boneName(node, bones);
    if (!bones.has(bone)) {
      unmatched.add(node);
      continue;
    }
    matched.add(bone);
    const copy = track.clone();
    copy.name = bone + track.name.slice(dot);
    tracks.push(copy);
  }
  if (!matched.size)
    throw new ClipError(
      "None of its bones match the game's skeleton (Mixamo bones such as mixamorigHips). Export it on a Mixamo character.",
    );
  const hips = tracks.find((t) => t.name === 'mixamorigHips.position');
  // The game's clips are in centimetres; a clip in metres (hips under 5 units high) is scaled up.
  if (hips) {
    let top = 0;
    for (let i = 1; i < hips.values.length; i += 3) top = Math.max(top, Math.abs(hips.values[i]));
    if (top > 0 && top < 5)
      for (const t of tracks)
        if (t.name.endsWith('.position')) t.values = t.values.map((v) => v * 100);
  }
  let travel = [0, 0];
  if (hips) {
    const v = hips.values,
      start = [v[0], v[2]],
      end = [v[v.length - 3], v[v.length - 1]];
    travel = [round((end[0] - start[0]) / 100), round((end[1] - start[1]) / 100)];
    // Played in place: the game moves the character itself.
    for (let i = 0; i < v.length; i += 3) {
      v[i] = start[0];
      v[i + 2] = start[1];
    }
  }
  const clip = new THREE.AnimationClip(name, source.duration, tracks);
  const duration = round(clip.duration);
  if (!(duration > 0)) throw new ClipError('The clip has no length.');
  let stride;
  if (kind === 'walk') {
    stride = round(Math.hypot(travel[0], travel[1]));
    if (stride < 0.05)
      throw new ClipError(
        'It does not travel, so its stride cannot be measured: download the walk with "In Place" off, or import it on the spot.',
      );
    if (stride > 10) throw new ClipError('It travels over 10 metres a cycle, too far for a walk.');
  }
  return {
    clip,
    matched: [...matched],
    unmatched: [...unmatched],
    missing: [...bones].filter((b) => !matched.has(b)),
    duration,
    stride,
    travel,
  };
}

// Why a name cannot be used for a new clip, or null.
export function nameProblem(name) {
  if (!CLIP_NAME.test(name))
    return 'Name it with letters and digits only, starting with a capital (e.g. Waving).';
  if (name in CLIPS) return `There is already a clip called ${name}.`;
  return null;
}
// A clip name from a file name: 'Happy Idle (2).fbx' → 'HappyIdle2'.
export function nameFromFile(file) {
  const words = String(file)
    .replace(/\.[^.]*$/, '')
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1));
  let name = words.join('').replace(/^\d+/, '').slice(0, 38) || 'Clip';
  name = name.charAt(0).toUpperCase() + name.slice(1);
  for (let n = 2; name in CLIPS; n++) name = name.replace(/\d*$/, '') + n;
  return name;
}

// The fitted clip as a binary glTF: a bare skeleton of the bones it moves, and the clip.
export async function clipToGlb(clip, GLTFExporter) {
  const root = new THREE.Group();
  root.name = 'Clip';
  for (const bone of new Set(clip.tracks.map((t) => t.name.slice(0, t.name.lastIndexOf('.'))))) {
    const b = new THREE.Bone();
    b.name = bone;
    root.add(b);
  }
  return new GLTFExporter().parseAsync(root, { binary: true, animations: [clip] });
}

// The entry data/clips.js keeps for a clip.
export const clipEntry = (name, { duration, stride }) => ({
  file: 'clip-' + name + '.glb',
  duration,
  ...(stride ? { stride } : {}),
});
