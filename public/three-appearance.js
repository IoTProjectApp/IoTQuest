import * as THREE from './vendor/three.module.min.js';
import { eachVertex, recolour, LUMA, linear } from './three-outfits.js';
import { headCorrection } from './character-appearance.js';

// Draws a rigged person's appearance (character-appearance.js) on a fresh copy of their model:
// - skin: the body's skin tinted to a new tone, keeping the shading, eyes and lips of its texture;
// - hair: the model's own recoloured, or taken off and replaced by a style fitted to this head:
//   a cap shrink-wrapped to the skull (measured from the model, so it sits on any head) with a
//   natural hairline (temples, sideburns, round the ears, down to the nape), strands painted along
//   it and feathered tips, and for some styles a fall of hair resting on the back, a ponytail or a
//   bun;
// - beard: the face's own surface on the jaw, chin or upper lip, pushed out a little and fading at
//   its edges, bending with the jaw; or the model's own, recoloured or shaved;
// - bold brows, and the build's head correction (the head keeps its shape on a broader body).
// Height and build themselves are the person's scale, set every frame (three-characters.js).

// Mixamo's pieces: hair and beards, and the eyes and lashes, which keep their colours.
const HAIR = /Hair/i,
  BEARD = /Beard/i,
  EYES = /lash|Eye/i,
  SKIN = /Body|Face/i;
const isHairlike = (m) => HAIR.test(m.name) || BEARD.test(m.name) || EYES.test(m.name);
const darker = (color) => '#' + new THREE.Color(color).multiplyScalar(0.6).getHexString();
const smooth = THREE.MathUtils.smoothstep,
  clamp = THREE.MathUtils.clamp;

export class Appearance {
  constructor({ shadows = false } = {}) {
    this.shadows = shadows;
    this.cache = new Map();
  }
  once(key, make) {
    if (!this.cache.has(key)) this.cache.set(key, make());
    return this.cache.get(key);
  }
  // Gives root (a fresh copy of the model `file`, in its rest pose) this appearance.
  apply(root, file, appearance) {
    if (!appearance || !Object.keys(appearance).length) return;
    const meshes = [];
    root.traverse((o) => o.isSkinnedMesh && meshes.push(o));
    if (!meshes.length) return;
    root.updateMatrixWorld(true);
    const hairs = meshes.filter((m) => HAIR.test(m.name) && !EYES.test(m.name)),
      beards = meshes.filter((m) => BEARD.test(m.name)),
      style = appearance.hair?.style ?? 'own',
      hairColor = appearance.hair?.color,
      kind = appearance.beard?.kind ?? 'own',
      beardColor = appearance.beard?.color ?? hairColor;
    // A model in one piece has its skin in that piece; otherwise the body and face pieces.
    const named = meshes.filter((m) => SKIN.test(m.name) && !EYES.test(m.name)),
      skins = named.length ? named : meshes.filter((m) => !isHairlike(m));
    // Measured before anything changes, once per model: the head, and the colour of its own hair
    // (what new hair, a beard and brows match unless given a colour).
    const measured = this.once('head|' + file, () => measureHead(root, meshes)),
      ownColour = this.once('hair-colour|' + file, () => meanColour(hairs)),
      color = hairColor || ownColour || '#3a2416',
      beardColour = beardColor || color,
      // Beards grow from the skin: painted into it, fading out at their edges.
      painted = !['own', 'none'].includes(kind) && measured ? kind : null;
    // (The hairline the model has painted under its own hair is left as it is: where new hair
    // thins out at its edge, it shows as roots, as a real hairline does.)
    if (appearance.skin || painted)
      for (const piece of skins)
        piece.material = this.once(
          `skin|${file}|${piece.name}|${appearance.skin || ''}|${painted || ''}|${beardColour}`,
          () =>
            skinMaterial(piece, {
              tone: appearance.skin,
              beard: painted && { kind: painted, color: beardColour, head: measured },
            }),
        );
    if (style === 'own') {
      if (hairColor)
        for (const piece of hairs)
          piece.material = this.once(`recolour|${file}|${piece.name}|${hairColor}|`, () =>
            recolour(piece, hairColor, null),
          );
    } else for (const piece of hairs) piece.visible = false;
    if (kind === 'own') {
      if (beardColor || hairColor)
        for (const piece of beards)
          piece.material = this.once(`recolour|${file}|${piece.name}|${beardColour}|`, () =>
            recolour(piece, beardColour, null),
          );
    } else for (const piece of beards) piece.visible = false;
    const head = root.getObjectByName('mixamorigHead'),
      neck = root.getObjectByName('mixamorigNeck');
    const correction = headCorrection(appearance);
    if (correction && neck) neck.scale.set(...correction);
    if (!head || !measured) return;
    if (style !== 'own' && style !== 'bald')
      this.wear(head, this.hair(file, style, color, measured), root);
    if (appearance.brows === 'bold')
      // Brows a shade darker than the hair, as they usually are.
      this.wear(head, this.brows(file, darker(color), measured), root);
  }
  // Puts something placed for the rest pose, in the model's own space, on a bone.
  wear(bone, object, root) {
    root.add(object);
    object.traverse((o) => o.isMesh && (o.castShadow = this.shadows));
    bone.attach(object);
  }
  // A hairstyle: the cap (with its fall for long styles), and a ponytail or bun.
  hair(file, style, color, head) {
    const group = new THREE.Group(),
      cap = this.once(`hair|${file}|${style}`, () => capGeometry(head, STYLES[style]));
    group.add(new THREE.Mesh(cap, this.hairMaterial(style, color)));
    if (style === 'ponytail') {
      group.add(
        new THREE.Mesh(
          this.once(`tail|${file}`, () => ponytailGeometry(head)),
          this.hairMaterial('tail', color),
        ),
      );
      const band = new THREE.Mesh(
        this.once(`tie|${file}`, () =>
          new THREE.TorusGeometry(0.019, 0.0055, 8, 24).rotateX(Math.PI / 2 - 0.45),
        ),
        this.plain('#26211d', 0.5),
      );
      band.position.copy(head.tieAt).add(new THREE.Vector3(0, -0.006, -0.012));
      group.add(band);
    } else if (style === 'bun') {
      group.add(
        new THREE.Mesh(
          this.once(`bun|${file}`, () => bunGeometry(head)),
          this.hairMaterial('knot', color),
        ),
      );
    }
    return group;
  }
  hairMaterial(style, color) {
    const pattern =
      style === 'curly'
        ? 'curls'
        : style === 'buzz'
          ? 'fuzz'
          : style === 'knot'
            ? 'swirl'
            : 'strands';
    return this.once(`hair|${pattern}|${style === 'buzz'}|${color}`, () => {
      const { map, alphaMap } = this.once('texture|' + pattern, () => hairTexture(pattern));
      // A buzz cut: a close felt of short hair, fading out at its edge like the rest.
      return style === 'buzz'
        ? new THREE.MeshStandardMaterial({
            color,
            map,
            alphaMap,
            transparent: true,
            alphaTest: 0.03,
            roughness: 0.95,
          })
        : litOutside(
            new THREE.MeshStandardMaterial({
              color,
              map,
              alphaMap,
              // Blended where the hair thins out, so its edges fade softly into the skin.
              transparent: true,
              alphaTest: 0.03,
              side: THREE.DoubleSide,
              roughness: pattern === 'curls' ? 0.92 : 0.58,
            }),
          );
    });
  }
  plain(color, roughness) {
    return this.once(
      `plain|${color}|${roughness}`,
      () => new THREE.MeshStandardMaterial({ color, roughness }),
    );
  }
  // Two arched brows just over the painted ones, following the brow ridge.
  brows(file, color, head) {
    const group = new THREE.Group(),
      material = this.plain(color, 1);
    for (const side of [-1, 1])
      group.add(
        new THREE.Mesh(
          this.once(`brow|${file}|${side}`, () => browGeometry(head, side)),
          material,
        ),
      );
    return group;
  }
  dispose() {
    for (const value of this.cache.values())
      for (const part of value?.alphaMap && !value.isMaterial
        ? [value.map, value.alphaMap]
        : [value])
        part?.dispose?.();
    this.cache.clear();
  }
}

// Hair is seen from both sides (inside a fall, under a fringe) but lit as from outside, as hair
// cards are: three.js turns a back face's normal round, which would shade the underside dark.
function litOutside(material) {
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <normal_fragment_begin>',
      '#include <normal_fragment_begin>\n#ifdef DOUBLE_SIDED\nnormal *= faceDirection;\n#endif',
    );
  };
  material.customProgramCacheKey = () => 'hair';
  return material;
}

// ---- Measuring the head ------------------------------------------------------------------------
// The skull and face in the rest pose (metres, the model's own space), from the points the head
// bone moves on every piece but the hair: its centre, its surface in every direction from there
// (a grid of directions), the eyes, nose, mouth and chin, where the ears are, and the back of the
// neck and shoulders below (from every piece the neck and spine move), for hair to rest on.
const ROUND = 72,
  DOWN = 36,
  REACH = Math.PI * 0.9;
export function measureHead(root, meshes) {
  const points = [],
    below = [];
  for (const mesh of meshes) {
    if (isHairlike(mesh) || !mesh.skeleton) continue;
    eachVertex(mesh, (i, bone) => {
      const list = /Head/.test(bone) ? points : /Neck|Spine|Shoulder/.test(bone) ? below : null;
      list?.push(
        new THREE.Vector3()
          .fromBufferAttribute(mesh.geometry.attributes.position, i)
          .applyMatrix4(mesh.matrixWorld),
      );
    });
  }
  const neck = root.getObjectByName('mixamorigNeck')?.getWorldPosition(new THREE.Vector3());
  if (points.length < 200 || !neck) return null;
  const min = (list, axis) => list.reduce((m, v) => Math.min(m, v[axis]), Infinity),
    max = (list, axis) => list.reduce((m, v) => Math.max(m, v[axis]), -Infinity),
    top = max(points, 'y'),
    eyeY = top - (top - neck.y) * 0.42,
    crown = points.filter((v) => v.y > eyeY),
    cx = (min(crown, 'x') + max(crown, 'x')) / 2,
    cz = (min(crown, 'z') + max(crown, 'z')) / 2,
    centre = new THREE.Vector3(cx, eyeY - 0.01, cz),
    halfX = (max(crown, 'x') - min(crown, 'x')) / 2;
  // The skull's surface: the furthest point in each direction from the centre.
  let surface = new Float32Array(ROUND * (DOWN + 1));
  const cell = (i, j) => j * ROUND + (((i % ROUND) + ROUND) % ROUND);
  for (const v of points) {
    const d = v.clone().sub(centre),
      r = d.length(),
      phi = Math.atan2(d.x, d.z),
      theta = Math.acos(clamp(d.y / r, -1, 1));
    if (theta > REACH) continue;
    const i = Math.round(((phi + Math.PI) / (Math.PI * 2)) * ROUND),
      j = Math.round((theta / REACH) * DOWN);
    surface[cell(i, j)] = Math.max(surface[cell(i, j)], r);
  }
  // Directions the head has no points in (under the jaw, inside the neck) take their neighbours'.
  for (let pass = 0; pass < 40; pass++) {
    let empty = 0;
    const next = surface.slice();
    for (let j = 0; j <= DOWN; j++)
      for (let i = 0; i < ROUND; i++) {
        if (surface[cell(i, j)]) continue;
        let sum = 0,
          n = 0;
        for (const [di, dj] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ]) {
          const jj = j + dj;
          if (jj < 0 || jj > DOWN || !surface[cell(i + di, jj)]) continue;
          sum += surface[cell(i + di, jj)];
          n++;
        }
        if (n) next[cell(i, j)] = sum / n;
        else empty++;
      }
    surface = next;
    if (!empty) break;
  }
  // Smoothed, so the hair follows the skull, not each ear and bump.
  const smoothed = surface.slice();
  for (let j = 0; j <= DOWN; j++)
    for (let i = 0; i < ROUND; i++) {
      let sum = 0,
        n = 0;
      for (let dj = -1; dj <= 1; dj++)
        for (let di = -1; di <= 1; di++) {
          if (j + dj < 0 || j + dj > DOWN) continue;
          sum += surface[cell(i + di, j + dj)];
          n++;
        }
      smoothed[cell(i, j)] = sum / n;
    }
  // Straight up is one direction, whichever way round: the top row takes one radius, and the next
  // eases into it.
  let crownRadius = 0;
  for (let i = 0; i < ROUND; i++) crownRadius += smoothed[cell(i, 0)] / ROUND;
  for (let i = 0; i < ROUND; i++) {
    smoothed[cell(i, 0)] = crownRadius;
    smoothed[cell(i, 1)] = (smoothed[cell(i, 1)] + crownRadius) / 2;
  }
  const radius = (phi, theta) => {
    const x = (((((phi + Math.PI) / (Math.PI * 2)) % 1) + 1) % 1) * ROUND,
      y = clamp((theta / REACH) * DOWN, 0, DOWN),
      i = Math.floor(x),
      j = Math.min(DOWN - 1, Math.floor(y)),
      fx = x - i,
      fy = y - j,
      at = (a, b) => smoothed[cell(a, b)];
    return (
      (at(i, j) * (1 - fx) + at(i + 1, j) * fx) * (1 - fy) +
      (at(i, j + 1) * (1 - fx) + at(i + 1, j + 1) * fx) * fy
    );
  };
  // The face down its middle: how far forward it is at each height (a thin slice, 2 mm steps).
  const middle = points.filter((v) => Math.abs(v.x - cx) < 0.006 && v.z > cz),
    profile = [];
  for (let y = eyeY; y > neck.y - 0.02; y -= 0.002) {
    const slice = middle.filter((v) => Math.abs(v.y - y) < 0.002);
    if (slice.length) profile.push([y, max(slice, 'z')]);
  }
  const front = profile.length ? Math.max(...profile.map(([, z]) => z)) : cz + 0.1,
    face = profile.filter(([, z]) => z > front - 0.05),
    highest = (lo, hi) => face.filter(([y]) => y >= lo && y <= hi).sort((a, b) => b[1] - a[1])[0],
    lowest = (lo, hi) => face.filter(([y]) => y >= lo && y <= hi).sort((a, b) => a[1] - b[1])[0];
  // The nose's tip, the dip under it, and the mouth 1.6 cm below that (on every Mixamo face); the
  // chin is the face's front below the lips, and the jaw's underside where the face then falls away.
  const noseY = highest(eyeY - 0.06, eyeY - 0.005)?.[0] ?? eyeY - 0.03,
    underNose = lowest(noseY - 0.03, noseY - 0.01)?.[0] ?? noseY - 0.02,
    mouthY = underNose - 0.016,
    chin = highest(mouthY - 0.045, mouthY - 0.015) ?? [mouthY - 0.03, front - 0.02],
    jaw = face.find(([y, z]) => y < chin[0] && z < chin[1] - 0.025),
    chinY = jaw ? jaw[0] : chin[0] - 0.015;
  // The ears: the head's widest points around eye level, and how far round the head they are.
  const sides = points.filter(
      (v) => Math.abs(v.x - cx) > halfX * 0.9 && v.y > eyeY - 0.045 && v.y < eyeY + 0.01,
    ),
    earZ = sides.length ? sides.reduce((t, v) => t + v.z, 0) / sides.length : cz - 0.01,
    ear = Math.atan2(halfX, earZ - cz) / Math.PI;
  // How far forward the face is at a point of it (for brows that lie on the skin).
  const frontAt = (x, y, near = 0.004) => {
    const around = points.filter((v) => Math.abs(v.x - x) < near && Math.abs(v.y - y) < near);
    return around.length ? max(around, 'z') : null;
  };
  // The back of the neck, shoulders and upper back down the middle: hair lies on it, not in it.
  const spine = below.filter((v) => Math.abs(v.x - cx) < 0.09),
    backAt = (y) => {
      const slice = spine.filter((v) => Math.abs(v.y - y) < 0.012);
      return slice.length ? min(slice, 'z') : null;
    },
    back = min(crown, 'z');
  return {
    centre,
    radius,
    top,
    eyeY,
    neckY: neck.y,
    noseY,
    mouthY,
    chinY,
    halfX,
    ear,
    back,
    frontAt,
    backAt,
    tieAt: new THREE.Vector3(cx, eyeY + 0.025, back - 0.004),
  };
}

// ---- Hair ----------------------------------------------------------------------------------------
// Each style: how thick the hair stands off the skull (metres, at the crown, and at its edge), how
// it thins towards the edge (a power: higher keeps it full further down), how much of it is left
// over the ears (sides), how far back its crown is (radians from the top of the head: hair drawn
// back spreads from its knot), how far a parted style's front strands sweep aside (radians), its
// hairline (heights
// above the eyes: the forehead, the sideburns in front of the ears, over the ears and the nape;
// negative is below), and how far long hair falls below the line behind and at the sides.
const STYLES = {
  buzz: { thick: 0.003, edge: 0.0015, taper: 1, crown: 0.3, line: [0.06, -0.025, 0.022, -0.085] },
  short: {
    thick: 0.018,
    edge: 0.0025,
    taper: 2.4,
    crown: 0.35,
    sides: 0.35,
    line: [0.058, -0.02, 0.018, -0.08],
  },
  curly: {
    thick: 0.03,
    edge: 0.004,
    taper: 2.6,
    sides: 0.6,
    line: [0.055, -0.01, 0.015, -0.085],
    curls: 0.008,
  },
  bob: {
    thick: 0.016,
    edge: 0.008,
    taper: 3,
    part: 0.45,
    line: [0.06, -0.015, -0.005, -0.08],
    fall: { back: 0.04, side: 0.07, flare: 0.012 },
  },
  long: {
    thick: 0.016,
    edge: 0.008,
    taper: 3,
    part: 0.45,
    line: [0.06, -0.015, -0.005, -0.08],
    fall: { back: 0.2, side: 0.085, flare: 0.016 },
  },
  // Pulled back: no sideburns, the hair drawn up from the nape.
  ponytail: {
    thick: 0.007,
    edge: 0.0015,
    taper: 1.6,
    crown: 1.15,
    line: [0.062, 0.004, 0.022, -0.07],
  },
  bun: { thick: 0.007, edge: 0.0015, taper: 1.6, crown: 0.8, line: [0.062, 0.004, 0.022, -0.07] },
};

// Where the hair texture's tips begin (strands stop between here and its end).
const TIPS = 0.74;
// Where the hairline runs round the head: a = 0 at the middle of the forehead to 1 at the back of
// the neck. The forehead line rises a little at the temples, comes down in front of each ear as a
// sideburn, climbs over the ear and drops behind it to the nape.
function hairline(head, style, a) {
  const [forehead, sideburn, over, nape] = style.line,
    ear = head.ear,
    keys = [
      [0, forehead - 0.006],
      [0.08, forehead - 0.003],
      [0.16, forehead - 0.001],
      [Math.max(0.24, ear - 0.2), forehead - 0.012],
      [ear - 0.1, sideburn],
      [ear - 0.06, sideburn],
      [ear - 0.02, over],
      [ear + 0.06, over - 0.02],
      [Math.min(0.88, ear + 0.15), over + (nape - over) * 0.8],
      [1, nape],
    ];
  for (let k = 1; k < keys.length; k++)
    if (a <= keys[k][0]) {
      const [a0, y0] = keys[k - 1],
        [a1, y1] = keys[k],
        t = smooth(a, a0, a1);
      return head.eyeY + y0 + (y1 - y0) * t;
    }
  return head.eyeY + nape;
}

// The cap: columns round the head from the crown down to the hairline (and on, for long hair),
// following the skull at the style's thickness, thinning towards the edge; long hair keeps its
// fullness and falls on, lying on the neck and back.
function capGeometry(head, style) {
  const { centre, radius, neckY } = head,
    columns = 120,
    rows = 36,
    tail = style.fall ? 14 : 0,
    position = [],
    uv = [],
    index = [];
  // How much of a fall this column has: none in front of the face, most behind.
  const fallShare = (a) => (style.fall ? smooth(a, head.ear - 0.17, head.ear - 0.05) : 0),
    fallLength = (a) =>
      style.fall.side + (style.fall.back - style.fall.side) * smooth(a, head.ear + 0.05, 0.85);
  const curls = (phi, theta) =>
    style.curls
      ? style.curls *
        (0.55 +
          0.25 *
            Math.sin(phi * 17 + Math.cos(theta * 11) * 2) *
            Math.sin(theta * 19 + Math.sin(phi * 9)) +
          0.2 * Math.sin(phi * 29 + 1.3) * Math.cos(theta * 27 + phi * 3))
      : 0;
  const direction = (phi, theta) =>
    new THREE.Vector3(
      Math.sin(theta) * Math.sin(phi),
      Math.cos(theta),
      Math.sin(theta) * Math.cos(phi),
    );
  // The columns spread from the crown: the top of the head, or for hair drawn back, further back
  // towards the knot, so strands run from there to the hairline.
  const turn = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(1, 0, 0),
      -(style.crown || 0),
    ),
    // A parted style's front strands sweep aside as they come down, off the middle of the forehead.
    toward = (phi, theta) =>
      direction(
        phi +
          (style.part || 0) *
            Math.tanh(phi * 6) *
            (1 - smooth(Math.abs(phi) / Math.PI, 0.12, 0.4)) *
            Math.min(1, theta / (Math.PI / 2)) ** 1.5,
        theta,
      ).applyQuaternion(turn),
    // The skull's surface (and how far round the head it is) in a direction.
    skull = (d) => {
      const round = Math.atan2(d.x, d.z),
        down = Math.acos(clamp(d.y, -1, 1));
      return { r: radius(round, Math.min(down, REACH)), a: Math.abs(round) / Math.PI, down };
    };
  for (let i = 0; i <= columns; i++) {
    const phi = -Math.PI + (i / columns) * Math.PI * 2,
      a = Math.abs(phi) / Math.PI,
      share = fallShare(a);
    // How far along the column the skull comes down to the hairline.
    let end = Math.PI * 0.95,
      edgeA = a;
    for (let k = 1; k <= 360; k++) {
      const theta = (k / 360) * Math.PI * 0.95,
        d = toward(phi, theta),
        { r, a: round, down } = skull(d);
      if (down >= REACH || centre.y + r * d.y <= hairline(head, style, round)) {
        end = theta;
        edgeA = round;
        break;
      }
    }
    const column = [],
      out = new THREE.Vector3(Math.sin(phi), 0, Math.cos(phi)),
      // How far out from the head's middle a point is, this way round.
      reachOf = (p) => (p.x - centre.x) * out.x + (p.z - centre.z) * out.z,
      // Where this way round a point at height y and that reach is.
      at = (y, reach) => new THREE.Vector3(centre.x + out.x * reach, y, centre.z + out.z * reach),
      // Fine hair ends thin at the hairline; long hair keeps its body where it falls.
      edgeLift = 0.0008 + (style.edge - 0.0008) * share;
    let widest = 0;
    for (let j = 0; j <= rows; j++) {
      const v = j / rows,
        theta = end * v,
        // Full at the crown, thinning smoothly to the edge (long hair stays full where it falls),
        // and soonest over the forehead, so the hairline is soft.
        full = 1 - v ** (1.3 + (style.taper - 1.3) * smooth(edgeA, 0.12, 0.35)),
        body = full + (1 - full) * share * 0.85,
        d = toward(phi, theta),
        here = skull(d),
        // Cut closer over the ears than on top, for styles that are.
        sides = 1 - (1 - (style.sides ?? 1)) * Math.sin(here.a * Math.PI) * smooth(v, 0.25, 0.7),
        lift =
          style.thick * (1 + 0.2 * (1 - v)) * body * sides +
          edgeLift +
          curls(phi, theta) * (1 - smooth(v, 0.8, 1)),
        p = d
          .clone()
          .multiplyScalar(here.r + lift)
          .add(centre);
      // Long hair hangs from the widest part of the head instead of following it back in.
      const reach = reachOf(p);
      widest = Math.max(widest, reach);
      column.push(share && reach < widest ? at(p.y, reach + (widest - reach) * share) : p);
    }
    // The fall: on down from the hairline, standing off the neck and lying on the back.
    if (tail) {
      const start = column[rows],
        length = share * fallLength(a),
        // Over the shoulders only behind them: the side fall stops above the shoulders.
        floor = neckY + 0.005 - smooth(a, 0.6, 0.86) * 0.6,
        drop = Math.max(0, Math.min(length, start.y - floor)),
        behind = -Math.cos(phi);
      // Behind, the hair rests on whatever is there (the neck, the collar, the back): how far out
      // each row must be, eased in from the sides, then worked back up the column so the hair
      // starts to lean out a little above where it must, never in a step, and never folds back in.
      const first = reachOf(start),
        lean = smooth(behind, 0.2, 0.8),
        ys = [],
        need = [];
      for (let k = 1; k <= tail; k++) {
        const t = k / tail,
          y = start.y - drop * t,
          back = y < neckY + 0.02 ? head.backAt(y) : null;
        ys.push(y);
        need.push(
          Math.max(
            first + style.fall.flare * t ** 1.5 * share,
            back === null || behind <= 0.05
              ? 0
              : first +
                  lean * Math.min(0.05, Math.max(0, (centre.z - (back - 0.012)) / behind - first)),
          ),
        );
      }
      for (let k = need.length - 2; k >= 0; k--) need[k] = Math.max(need[k], need[k + 1] - 0.004);
      for (let k = 1; k < need.length; k++) need[k] = Math.max(need[k], need[k - 1]);
      // Whatever the first row must stand out is eased in over the cap's last rows: no kink.
      const extra = need[0] - first,
        ease = Math.min(10, rows);
      if (extra > 0)
        for (let j = rows - ease + 1; j <= rows; j++) {
          const p = column[j];
          column[j] = at(p.y, reachOf(p) + extra * smooth((j - (rows - ease)) / ease, 0, 1));
        }
      need.forEach((reach, k) => column.push(at(ys[k], reach)));
    }
    // Texture down the hair by distance, so strands run evenly; the tips (the texture's last
    // quarter, where strands stop at their own lengths) are the last centimetre or so at a
    // hairline and a few centimetres at the ends of long hair.
    let length = 0;
    const along = [0];
    for (let k = 1; k < column.length; k++)
      along.push((length += column[k].distanceTo(column[k - 1])));
    const tips = Math.min(length * 0.5, 0.02 + 0.022 * share);
    column.forEach((p, k) => {
      const fromTip = length - along[k],
        v =
          fromTip >= tips
            ? TIPS * (along[k] / Math.max(1e-6, length - tips))
            : TIPS + (1 - TIPS) * (1 - fromTip / tips);
      position.push(p.x, p.y, p.z);
      uv.push((i / columns) * 10, v);
    });
  }
  const per = rows + tail + 1;
  for (let i = 0; i < columns; i++)
    for (let k = 0; k < per - 1; k++) {
      const a = i * per + k,
        b = (i + 1) * per + k;
      // Wound to face out.
      index.push(a, a + 1, b, b, a + 1, b + 1);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(index);
  g.computeVertexNormals();
  // The cap is lit as the head it covers: facing straight out from the head's middle, so its
  // shading runs smoothly to the hairline instead of darkening where the hair turns in to the
  // skin; long hair turns from that to its own surface's facing as it falls.
  const normal = g.attributes.normal,
    p = new THREE.Vector3(),
    n = new THREE.Vector3(),
    out = new THREE.Vector3();
  for (let i = 0; i <= columns; i++)
    for (let k = 0; k < per; k++) {
      const at = i * per + k,
        cap = k <= rows ? 1 : 1 - smooth(k - rows, 0, 4);
      p.fromBufferAttribute(g.attributes.position, at);
      out.copy(p).sub(centre).normalize();
      n.fromBufferAttribute(normal, at).lerp(out, cap).normalize();
      normal.setXYZ(at, n.x, n.y, n.z);
    }
  // The first and last columns meet at the back: one normal for both, so they show no seam.
  for (let k = 0; k < per; k++) {
    const a = new THREE.Vector3().fromBufferAttribute(normal, k),
      b = new THREE.Vector3().fromBufferAttribute(normal, columns * per + k),
      n = a.add(b).normalize();
    normal.setXYZ(k, n.x, n.y, n.z);
    normal.setXYZ(columns * per + k, n.x, n.y, n.z);
  }
  return g;
}

// A ponytail from a tie at the back of the head, out and down onto the back, full in the middle
// and narrowing to its tip.
function ponytailGeometry({ tieAt, neckY, backAt }) {
  const rest = (y, z) => {
      const back = backAt(y);
      return back === null ? z : Math.min(z, back - 0.028);
    },
    points = [
      tieAt.clone().add(new THREE.Vector3(0, -0.004, -0.012)),
      tieAt.clone().add(new THREE.Vector3(0, -0.022, -0.042)),
      new THREE.Vector3(tieAt.x, (tieAt.y + neckY) / 2 - 0.02, tieAt.z - 0.05),
      new THREE.Vector3(tieAt.x, neckY - 0.04, tieAt.z - 0.045),
      new THREE.Vector3(tieAt.x, neckY - 0.13, tieAt.z - 0.04),
    ].map((p) => p.setZ(rest(p.y, p.z))),
    curve = new THREE.CatmullRomCurve3(points),
    segments = 36,
    around = 16,
    g = new THREE.TubeGeometry(curve, segments, 1, around, false),
    position = g.attributes.position,
    uv = g.attributes.uv;
  for (let i = 0; i <= segments; i++) {
    const t = i / segments,
      centre = curve.getPointAt(t),
      r = 0.012 + 0.017 * Math.sin(Math.PI * Math.min(1, t * 1.25 + 0.08)) * (1 - 0.6 * t) + 0.003;
    for (let j = 0; j <= around; j++) {
      const k = i * (around + 1) + j,
        p = new THREE.Vector3().fromBufferAttribute(position, k).sub(centre);
      p.multiplyScalar(Math.max(0.002, r * (1 - smooth(t, 0.88, 1) * 0.8))).add(centre);
      position.setXYZ(k, p.x, p.y, p.z);
      uv.setXY(k, (j / around) * 3, t);
    }
  }
  g.computeVertexNormals();
  return g;
}

// A bun high on the back of the head: a coil, a little flattened against it.
function bunGeometry({ tieAt }) {
  const g = new THREE.SphereGeometry(0.036, 32, 20).scale(1.05, 0.88, 0.8);
  g.translate(tieAt.x, tieAt.y + 0.03, tieAt.z - 0.014);
  return g;
}

// Hair painted as strands (along v, the hair's length; feathered at the tips), tight curls, a
// swirl (a bun's coil) or short fuzz (a buzz cut). Grey: the material's colour
// tints it.
function hairTexture(pattern) {
  const size = 512,
    canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const c = canvas.getContext('2d');
  let seed = 11;
  const random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  const grey = (shade, alpha = 1) => `rgba(${shade},${shade},${shade},${alpha})`;
  c.fillStyle = grey(140);
  c.fillRect(0, 0, size, size);
  if (pattern === 'strands' || pattern === 'swirl') {
    for (let k = 0; k < 3400; k++) {
      const x = random() * size,
        bend = random() * 10 - 5;
      c.strokeStyle = grey(90 + random() * 165, 0.3 + random() * 0.5);
      c.lineWidth = 0.6 + random() * 1.4;
      c.beginPath();
      if (pattern === 'swirl') {
        const r = random() * size * 0.5;
        c.arc(size / 2, size / 2, r, random() * 6, random() * 6 + 1.5);
      } else {
        c.moveTo(x, -2);
        c.bezierCurveTo(x + bend, size * 0.35, x - bend, size * 0.65, x + bend * 0.5, size + 2);
      }
      c.stroke();
    }
  } else if (pattern === 'curls') {
    for (let k = 0; k < 2600; k++) {
      c.strokeStyle = grey(70 + random() * 180, 0.75);
      c.lineWidth = 1.2 + random() * 1.6;
      c.beginPath();
      c.arc(random() * size, random() * size, 3 + random() * 6, random() * 6, random() * 6 + 4);
      c.stroke();
    }
  } else {
    // Fuzz: short flecks.
    for (let k = 0; k < 26000; k++) {
      c.fillStyle = grey(50 + random() * 200, 0.85);
      c.fillRect(random() * size, random() * size, 1 + random() * 1.2, 1.5 + random() * 3);
    }
  }
  // Transparency, in its own texture (white shows), so the colour keeps its shades where the hair
  // ends.
  const alphaCanvas = document.createElement('canvas');
  alphaCanvas.width = alphaCanvas.height = size;
  const a = alphaCanvas.getContext('2d');
  a.fillStyle = '#fff';
  a.fillRect(0, 0, size, size);
  const image = a.getImageData(0, 0, size, size),
    d = image.data;
  if (pattern !== 'swirl') {
    // The hair thins smoothly over its tips: each strand (a texel column, a little over a tenth of a
    // millimetre on the head) fades out at its own pace, so the edge is soft and fine, never torn.
    const [from, to] = pattern === 'curls' ? [0.9, 1] : pattern === 'fuzz' ? [0.86, 1] : [TIPS, 1],
      start = from * size;
    for (let x = 0; x < size; x++) {
      const reach = 0.75 + 0.25 * random(),
        softness = 0.9 + random() * 0.6;
      for (let y = Math.floor(start); y < size; y++) {
        const t = (y - start) / ((to - from) * size * reach),
          at = (y * size + x) * 4,
          shade = 255 * Math.max(0, 1 - t) ** softness;
        d[at] = d[at + 1] = d[at + 2] = shade;
      }
    }
  }
  a.putImageData(image, 0, 0);
  const texture = (source, colour) => {
    const t = new THREE.CanvasTexture(source);
    if (colour) t.colorSpace = THREE.SRGBColorSpace;
    // v runs down the canvas, as the hair does: from its roots to its tips.
    t.flipY = false;
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = pattern === 'swirl' ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
    t.anisotropy = 4;
    return t;
  };
  return { map: texture(canvas, true), alphaMap: texture(alphaCanvas, false) };
}

// ---- Beards and brows ------------------------------------------------------------------------
// How much beard grows at a point of the face (0 to 1), by kind, in GLSL: the cheeks below a line
// from the cheekbones to the corners of the mouth, the chin, under the jaw for a full beard and the
// upper lip (up to just under the nose), never on the lips. Every edge is a soft gradient, so the
// beard thins out into the skin as a real one does. `p` is a point of the face in the model's own
// space; the head's measurements are uniforms.
const BEARD_GLSL = `
uniform vec3 beardCentre;
uniform vec4 beardFace; // mouth, chin, neck, half the head's width
uniform int beardKind; // 1 stubble, 2 short, 3 full, 4 goatee, 5 moustache
float beardDensity(vec3 p) {
  float mouth = beardFace.x, chin = beardFace.y, neck = beardFace.z, wide = beardFace.w;
  float x = abs(p.x - beardCentre.x), side = min(1.0, x / wide);
  // The lips: an oval round the mouth, a little taller below it.
  float lipY = (p.y - mouth) / (p.y > mouth ? 0.0115 : 0.013);
  float lips = smoothstep(0.9, 1.25, length(vec2(x / 0.028, lipY)));
  // Above the upper lip, up to just under the nose.
  float lip = (1.0 - smoothstep(0.024, 0.036, x)) * smoothstep(mouth + 0.006, mouth + 0.011, p.y) *
    (1.0 - smoothstep(mouth + 0.017, mouth + 0.022, p.y));
  // The cheeks and jaw: below a line from the cheekbones to the corners of the mouth, in front of
  // the ears.
  float cheekLine = mouth + 0.006 + side * 0.03;
  float cheeks = (1.0 - smoothstep(cheekLine - 0.012, cheekLine + 0.004, p.y)) *
    smoothstep(beardCentre.z - 0.03, beardCentre.z - 0.006, p.z) *
    (1.0 - smoothstep(wide * 1.0, wide * 1.15, x));
  float chinPatch = (1.0 - smoothstep(0.016, 0.03, x)) * (1.0 - smoothstep(mouth - 0.012, mouth - 0.004, p.y)) *
    smoothstep(chin - 0.014, chin - 0.002, p.y);
  float d;
  if (beardKind == 5) d = lip;
  else if (beardKind == 4) d = max(lip, chinPatch);
  else if (beardKind == 3) d = max(lip, cheeks * smoothstep(neck + 0.004, neck + 0.03, p.y));
  else d = max(lip, cheeks * smoothstep(chin - 0.026, chin - 0.006, p.y));
  return d * lips * step(neck - 0.01, p.y) * (1.0 - smoothstep(0.08, 0.1, x));
}
// Hairs: a fine hash of where on the face, so each patch of skin has its own few bristles.
float beardHash(vec3 p) {
  return fract(sin(dot(floor(p), vec3(12.9898, 78.233, 37.719))) * 43758.5453);
}
`;

// A brow: a slim arched strand along the brow ridge, just off the skin.
function browGeometry({ centre, eyeY, halfX, frontAt }, side) {
  const xs = [0.011, 0.027, 0.044].map((d) => centre.x + side * Math.min(d, halfX * 0.6)),
    ys = [eyeY + 0.014, eyeY + 0.021, eyeY + 0.016];
  const points = xs.map((x, k) => {
    const z = frontAt(x, ys[k]) ?? centre.z + 0.08;
    return new THREE.Vector3(x, ys[k], z + 0.0012);
  });
  const curve = new THREE.CatmullRomCurve3(points),
    segments = 18,
    around = 8,
    g = new THREE.TubeGeometry(curve, segments, 1, around, false),
    position = g.attributes.position;
  for (let i = 0; i <= segments; i++) {
    const t = i / segments,
      at = curve.getPointAt(t),
      r = 0.0026 * (1 - 0.5 * t) + 0.0009;
    for (let j = 0; j <= around; j++) {
      const k = i * (around + 1) + j,
        q = new THREE.Vector3().fromBufferAttribute(position, k).sub(at);
      // Flatter than tall, lying on the skin.
      q.set(q.x * r, q.y * r * 0.75, q.z * r * 0.45).add(at);
      position.setXYZ(k, q.x, q.y, q.z);
    }
  }
  g.computeVertexNormals();
  return g;
}

// ---- Skin ------------------------------------------------------------------------------------------
// The piece's material with its skin (warm, moderately saturated texels) turned to a new tone,
// keeping its light and shade (eyes, lips, brows and clothes painted on it stay as they are), and a
// beard grown into it: the skin darkened and tinted towards the beard's colour, densest in the
// middle of the beard and thinning at its edges, with fine bristles (and, for longer beards,
// clumps) so it reads as hair growing from the skin.
const BEARDS = { stubble: 1, short: 2, full: 3, goatee: 4, moustache: 5 };
function skinMaterial(piece, { tone, beard }) {
  const material = piece.material.clone(),
    mean = meanSkin(piece),
    LUM = `vec3(${LUMA.join(', ')})`;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.skinTone = { value: new THREE.Color(tone || '#ffffff') };
    shader.uniforms.skinMean = { value: mean };
    let vertex = shader.vertexShader,
      fragment = 'uniform vec3 skinTone;\nuniform float skinMean;\n' + shader.fragmentShader,
      paint = '';
    if (tone)
      paint += `{
        vec3 c = diffuseColor.rgb;
        float high = max(c.r, max(c.g, c.b)), low = min(c.r, min(c.g, c.b));
        float saturation = (high - low) / max(high, 0.001);
        float warm = smoothstep(-0.01, 0.02, c.r - c.g) * smoothstep(-0.01, 0.02, c.g - c.b);
        float skin = warm * smoothstep(0.1, 0.22, saturation) * (1.0 - smoothstep(0.78, 0.92, saturation));
        float shade = clamp(dot(c, ${LUM}) / skinMean, 0.4, 1.5);
        diffuseColor.rgb = mix(c, skinTone * shade, skin);
      }`;
    if (beard) {
      const { centre, mouthY, chinY, neckY, halfX } = beard.head;
      Object.assign(shader.uniforms, {
        beardColour: { value: new THREE.Color(beard.color) },
        beardCentre: { value: centre.clone() },
        beardFace: { value: new THREE.Vector4(mouthY, chinY, neckY, halfX) },
        beardKind: { value: BEARDS[beard.kind] },
        beardSpace: { value: piece.matrixWorld.clone() },
      });
      // Where on the face, in the model's own space, as it stands at rest (before skinning).
      vertex =
        'uniform mat4 beardSpace;\nvarying vec3 vBeardAt;\n' +
        vertex.replace(
          '#include <begin_vertex>',
          '#include <begin_vertex>\nvBeardAt = (beardSpace * vec4(transformed, 1.0)).xyz;',
        );
      fragment = 'uniform vec3 beardColour;\nvarying vec3 vBeardAt;\n' + BEARD_GLSL + fragment;
      paint += `{
        float d = beardDensity(vBeardAt);
        if (d > 0.0) {
          // Bristles 0.5 mm across; longer beards also grow in clumps a few millimetres across.
          float bristle = beardHash(vBeardAt * 2000.0), clump = beardHash(vBeardAt * 450.0);
          float shade = clamp(dot(diffuseColor.rgb, ${LUM}) / skinMean, 0.55, 1.3);
          vec3 hair = beardColour * shade * (0.75 + 0.5 * bristle);
          float cover = beardKind == 1
            ? d * (0.25 + 0.45 * step(0.45, bristle))
            : beardKind == 3
              ? d * mix(0.7 + 0.3 * step(0.2, bristle), 0.95 + 0.05 * clump, d)
              : d * mix(0.55 + 0.45 * step(0.3, bristle), 0.85 + 0.15 * clump, d);
          diffuseColor.rgb = mix(diffuseColor.rgb, hair * (beardKind == 3 ? 0.85 : 1.0), clamp(cover, 0.0, 1.0));
        }
      }`;
    }
    shader.vertexShader = vertex;
    shader.fragmentShader = fragment.replace(
      '#include <map_fragment>',
      '#include <map_fragment>\n' + paint,
    );
  };
  material.customProgramCacheKey = () => `skin|${!!tone}|${!!beard}`;
  return material;
}
// The average colour of a model's own hair (as painted on its hair pieces), or null.
function meanColour(pieces) {
  const piece = pieces.find((p) => p.material?.map?.image && p.geometry.attributes.uv);
  if (!piece) return null;
  const size = 64,
    canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(piece.material.map.image, 0, 0, size, size);
  const data = context.getImageData(0, 0, size, size).data,
    uv = piece.geometry.attributes.uv,
    step = Math.max(1, Math.floor(uv.count / 3000)),
    wrap = (x) => Math.min(size - 1, Math.floor((x - Math.floor(x)) * size)),
    sum = [0, 0, 0];
  let n = 0;
  for (let i = 0; i < uv.count; i += step) {
    const at = (wrap(uv.getY(i)) * size + wrap(uv.getX(i))) * 4;
    if (data[at + 3] < 128) continue;
    for (let k = 0; k < 3; k++) sum[k] += linear(data[at + k] / 255);
    n++;
  }
  if (!n) return null;
  return (
    '#' +
    new THREE.Color().setRGB(...sum.map((v) => v / n), THREE.LinearSRGBColorSpace).getHexString()
  );
}
// The average brightness (linear) of the skin painted on this piece.
function meanSkin(piece) {
  const image = piece.material.map?.image;
  if (!image) return 0.4;
  const size = 96,
    canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(image, 0, 0, size, size);
  const data = context.getImageData(0, 0, size, size).data,
    uv = piece.geometry.attributes.uv,
    step = Math.max(1, Math.floor(uv.count / 4000)),
    wrap = (x) => Math.min(size - 1, Math.floor((x - Math.floor(x)) * size));
  let sum = 0,
    n = 0;
  for (let i = 0; i < uv.count; i += step) {
    const at = (wrap(uv.getY(i)) * size + wrap(uv.getX(i))) * 4,
      [r, g, b] = [0, 1, 2].map((k) => linear(data[at + k] / 255)),
      high = Math.max(r, g, b),
      saturation = (high - Math.min(r, g, b)) / Math.max(high, 0.001);
    if (!(r > g && g > b && saturation > 0.18 && saturation < 0.85)) continue;
    sum += LUMA[0] * r + LUMA[1] * g + LUMA[2] * b;
    n++;
  }
  return Math.max(0.03, n ? sum / n : 0.4);
}
