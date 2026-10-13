import * as THREE from './vendor/three.module.min.js';

// Dresses a rigged character (three-characters.js) in an outfit (character-outfits.js):
// - top/bottom/stripes recolour the model's own shirt and trousers pieces, keeping the folds and
//   shading of their texture;
// - vest: a hi-vis vest made from the torso of the shirt, pushed out a little, so it bends with
//   the body; hat and backpack ride on the head and spine bones;
// - badge: painted onto a copy of the shirt's texture, on the left of the chest.
// Everything is worked out from the model's pieces, bones and skin weights, so any Mixamo
// character can wear it. Materials, textures and shapes are made once per model and shared.

// Mixamo names each piece; a jacket or hoodie is worn over the shirt, so it is the one shown.
const OUTER = /Suit|Hoodie|Sweater|Cloth/i,
  SHIRT = /Shirt/i,
  BOTTOM = /Pants|Shorts/i;
const LUMA = [0.2126, 0.7152, 0.0722];
const linear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

export class Outfits {
  constructor({ shadows = false } = {}) {
    this.shadows = shadows;
    this.cache = new Map();
  }
  once(key, make) {
    if (!this.cache.has(key)) this.cache.set(key, make());
    return this.cache.get(key);
  }
  // Dresses root (a fresh copy of the model `file`, in its rest pose) in outfit.
  dress(root, file, outfit) {
    const meshes = [];
    root.traverse((o) => o.isSkinnedMesh && meshes.push(o));
    if (!outfit || !meshes.length) return;
    const named = (re) => meshes.filter((m) => re.test(m.name)),
      tops = named(OUTER).length ? named(OUTER) : named(SHIRT),
      bottoms = named(BOTTOM);
    root.updateMatrixWorld(true);
    const body = this.measure(file, root, meshes);
    for (const [pieces, color] of [
      [tops, outfit.top],
      [bottoms, outfit.bottom],
    ])
      if (color)
        for (const piece of pieces)
          piece.material = this.once(
            `recolour|${file}|${piece.name}|${color}|${(pieces === tops && outfit.stripes) || ''}`,
            () => recolour(piece, color, pieces === tops && outfit.stripes),
          );
    // The shirt (or, for a model in one piece, its largest piece) carries the badge and the vest.
    const shirt =
      tops[0] ||
      meshes.reduce((a, b) =>
        b.geometry.attributes.position.count > a.geometry.attributes.position.count ? b : a,
      );
    if (outfit.badge) {
      const material = this.once(`badge|${file}|${shirt.name}|${outfit.badge}`, () =>
        badgeMaterial(shirt, outfit.badge, body),
      );
      if (material) shirt.material = material;
    }
    if (outfit.vest) {
      const geometry = this.once(`vest|${file}|${shirt.name}`, () => vestGeometry(shirt, body)),
        material = this.once(`vest|${outfit.vest.color}|${outfit.vest.text || ''}`, () =>
          vestMaterial(outfit.vest),
        );
      if (geometry) {
        // A child of the shirt shares its place and its bind pose, so the same bones move both.
        const vest = new THREE.SkinnedMesh(geometry, material);
        vest.frustumCulled = false;
        vest.castShadow = this.shadows;
        shirt.add(vest);
        vest.bind(shirt.skeleton, shirt.bindMatrix);
      }
    }
    const head = root.getObjectByName('mixamorigHead'),
      spine = root.getObjectByName('mixamorigSpine2') || root.getObjectByName('mixamorigSpine1');
    if (outfit.hat && head && body.head) this.wear(head, this.hat(file, outfit.hat, body), root);
    if (outfit.backpack && spine && body.back)
      this.wear(spine, this.backpack(file, outfit.backpack, body), root);
  }
  // Puts an accessory, placed for the rest pose in the model's own space, on a bone.
  wear(bone, object, root) {
    root.add(object);
    object.traverse((o) => o.isMesh && (o.castShadow = this.shadows));
    bone.attach(object);
  }
  material(color, roughness = 0.6) {
    return this.once(
      `plain|${color}|${roughness}`,
      () => new THREE.MeshStandardMaterial({ color, roughness }),
    );
  }
  hat(file, { kind, color }, { head }) {
    const r = head.radius,
      group = new THREE.Group(),
      shell = this.material(color, kind === 'hardhat' ? 0.35 : 0.8);
    const dome = this.once(`dome|${file}|${kind}`, () =>
      new THREE.SphereGeometry(1, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2).scale(
        r,
        r * (kind === 'hardhat' ? 0.85 : 0.9),
        r * 1.08,
      ),
    );
    group.add(new THREE.Mesh(dome, shell));
    if (kind === 'hardhat') {
      // A brim all round and a ridge over the crown.
      group.add(
        new THREE.Mesh(
          this.once(`brim|${file}`, () =>
            new THREE.CylinderGeometry(1, 1, 0.012, 28).scale(r * 1.2, 1, r * 1.32),
          ),
          shell,
        ),
        new THREE.Mesh(
          this.once(`ridge|${file}`, () =>
            new THREE.SphereGeometry(1, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(
              r * 0.18,
              r * 0.92,
              r * 1.12,
            ),
          ),
          shell,
        ),
      );
    } else {
      // A peak at the front (+z, the way the model faces), angled down a little.
      const peak = new THREE.Mesh(
        this.once(`peak|${file}`, () =>
          new THREE.CylinderGeometry(1, 1, 0.008, 16, 1, false, -Math.PI / 2, Math.PI).scale(
            r * 0.95,
            1,
            r * 0.85,
          ),
        ),
        shell,
      );
      peak.position.set(0, 0.006, r * 0.72);
      peak.rotation.x = 0.18;
      group.add(peak);
    }
    // A hard hat rides on top of the hair; a cap is pulled down over it.
    group.position.set(head.x, head.top - r * (kind === 'hardhat' ? 0.5 : 0.82), head.z);
    return group;
  }
  // A rounded pack with a front pocket, against the upper back.
  backpack(file, color, { back }) {
    const group = new THREE.Group(),
      fabric = this.material(color, 0.85);
    group.add(
      new THREE.Mesh(
        this.once('pack', () => new THREE.CapsuleGeometry(0.12, 0.1, 6, 16).scale(1, 1, 0.45)),
        fabric,
      ),
    );
    const pocket = new THREE.Mesh(
      this.once('pocket', () => new THREE.CapsuleGeometry(0.07, 0.04, 4, 12).scale(1.2, 1, 0.4)),
      fabric,
    );
    pocket.position.set(0, -0.07, -0.05);
    group.add(pocket);
    group.position.set(back.x, back.y - 0.04, back.z - 0.05);
    return group;
  }
  // Where the head and the back are in the rest pose (metres, the model's own space), from the
  // points each bone mostly moves.
  measure(file, root, meshes) {
    return this.once('measure|' + file, () => measureBody(root, meshes));
  }
  dispose() {
    for (const value of this.cache.values()) {
      if (!value?.dispose) continue;
      if (value.map?.userData.outfit) value.map.dispose();
      value.dispose();
    }
    this.cache.clear();
  }
}

function measureBody(root, meshes) {
  const neck = root.getObjectByName('mixamorigNeck')?.getWorldPosition(new THREE.Vector3());
  const head = [],
    torso = [];
  for (const mesh of meshes)
    eachVertex(mesh, (i, bone) => {
      const list = /Head/.test(bone) ? head : /Spine/.test(bone) ? torso : null;
      list?.push(
        new THREE.Vector3()
          .fromBufferAttribute(mesh.geometry.attributes.position, i)
          .applyMatrix4(mesh.matrixWorld),
      );
    });
  const bone = (name) =>
      root.getObjectByName('mixamorig' + name)?.getWorldPosition(new THREE.Vector3()),
    hips = bone('Hips'),
    arm = bone('LeftArm');
  const result = {
    chestY: neck ? neck.y - 0.15 : null,
    centreX: neck ? neck.x : 0,
    neckY: neck?.y,
    hipsY: hips?.y,
    shoulder: neck && arm ? Math.abs(arm.x - neck.x) : null,
  };
  if (head.length) {
    const top = Math.max(...head.map((v) => v.y)),
      crown = head.filter((v) => v.y > top - 0.1),
      span = (axis) => [
        Math.min(...crown.map((v) => v[axis])),
        Math.max(...crown.map((v) => v[axis])),
      ],
      [x0, x1] = span('x'),
      [z0, z1] = span('z');
    result.head = {
      top,
      x: (x0 + x1) / 2,
      z: (z0 + z1) / 2,
      radius: Math.max(x1 - x0, z1 - z0) / 2 + 0.012,
    };
  }
  if (torso.length && neck) {
    const y = neck.y - 0.22,
      band = torso.filter((v) => Math.abs(v.y - y) < 0.08);
    if (band.length) result.back = { x: neck.x, y, z: Math.min(...band.map((v) => v.z)) };
  }
  return result;
}

// Calls fn(vertex, bone name) with the bone that moves each vertex most.
function eachVertex(mesh, fn) {
  const { skinIndex, skinWeight, position } = mesh.geometry.attributes,
    bones = mesh.skeleton.bones;
  for (let i = 0; i < position.count; i++) {
    let best = 0;
    for (let k = 1; k < 4; k++)
      if (skinWeight.getComponent(i, k) > skinWeight.getComponent(i, best)) best = k;
    fn(i, bones[skinIndex.getComponent(i, best)]?.name || '');
  }
}

// The piece's material, with its texture turned to shades of the new colour (and, for stripes,
// bands of a second colour 4 cm wide round the body).
function recolour(piece, color, stripes) {
  const material = piece.material.clone(),
    mean = meanLuminance(piece);
  material.onBeforeCompile = (shader) => {
    shader.uniforms.outfitTint = { value: new THREE.Color(color) };
    shader.uniforms.outfitStripe = { value: new THREE.Color(stripes || color) };
    shader.uniforms.outfitMean = { value: mean };
    shader.vertexShader =
      'varying float vOutfitY;\n' +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvOutfitY = position.y;',
      );
    shader.fragmentShader =
      'uniform vec3 outfitTint;\nuniform vec3 outfitStripe;\nuniform float outfitMean;\nvarying float vOutfitY;\n' +
      shader.fragmentShader.replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        float outfitShade = clamp(dot(diffuseColor.rgb, vec3(${LUMA.join(', ')})) / outfitMean, 0.35, 1.5);
        diffuseColor.rgb = (mod(vOutfitY, 8.0) < 4.0 ? outfitTint : outfitStripe) * outfitShade;`,
      );
  };
  material.customProgramCacheKey = () => 'outfit';
  return material;
}

// The average brightness (linear) of the texture where this piece is painted, so the recoloured
// piece has its new colour on average and keeps its lighter and darker folds.
function meanLuminance(piece) {
  const image = piece.material.map?.image;
  if (!image) return 0.5;
  const size = 64,
    canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(image, 0, 0, size, size);
  const data = context.getImageData(0, 0, size, size).data,
    uv = piece.geometry.attributes.uv,
    step = Math.max(1, Math.floor(uv.count / 3000)),
    wrap = (x) => Math.min(size - 1, Math.floor((x - Math.floor(x)) * size));
  let sum = 0,
    n = 0;
  for (let i = 0; i < uv.count; i += step) {
    // glTF textures are not flipped: v = 0 is the top row.
    const at = (wrap(uv.getY(i)) * size + wrap(uv.getX(i))) * 4;
    sum += LUMA.reduce((s, w, c) => s + w * linear(data[at + c] / 255), 0);
    n++;
  }
  return Math.max(0.03, n ? sum / n : 0.5);
}

// The torso of the piece (what the spine, hips and shoulders move), pushed 1.3 cm out along its
// normals, with its texture laid flat across the front and the back: from the shoulder joints
// across, and from just above the neck down to the hips. The texture cuts the vest's shape.
function vestGeometry(piece, { neckY, hipsY, shoulder, centreX }) {
  if (neckY == null || hipsY == null || !shoulder) return null;
  const g = piece.geometry,
    { position, normal, skinIndex, skinWeight } = g.attributes,
    index = g.index;
  const torso = new Uint8Array(position.count);
  eachVertex(piece, (i, bone) => (torso[i] = /Spine|Hips|Shoulder/.test(bone) ? 1 : 0));
  const offset = 0.013 / piece.matrixWorld.getMaxScaleOnAxis(),
    world = (i) =>
      new THREE.Vector3().fromBufferAttribute(position, i).applyMatrix4(piece.matrixWorld);
  const faces = [];
  const count = index ? index.count : position.count;
  for (let f = 0; f < count; f += 3) {
    const v = [0, 1, 2].map((k) => (index ? index.getX(f + k) : f + k));
    if (v.every((i) => torso[i])) faces.push(v);
  }
  if (faces.length < 20) return null;
  const points = faces.flat().map(world),
    top = neckY + 0.05;
  const out = { position: [], normal: [], skinIndex: [], skinWeight: [], uv: [] };
  faces.forEach((v, f) => {
    const [a, b, c] = points.slice(f * 3, f * 3 + 3),
      // Front (+z, the way the model faces) on the left half of the texture, back on the right;
      // each read left to right by someone looking at it.
      back = new THREE.Vector3().crossVectors(b.clone().sub(a), c.clone().sub(a)).z < 0;
    v.forEach((i, k) => {
      const p = points[f * 3 + k],
        across = Math.min(
          1,
          Math.max(0, ((back ? centreX - p.x : p.x - centreX) / shoulder) * 0.5 + 0.5),
        );
      out.position.push(
        position.getX(i) + normal.getX(i) * offset,
        position.getY(i) + normal.getY(i) * offset,
        position.getZ(i) + normal.getZ(i) * offset,
      );
      out.normal.push(normal.getX(i), normal.getY(i), normal.getZ(i));
      for (let j = 0; j < 4; j++) {
        out.skinIndex.push(skinIndex.getComponent(i, j));
        out.skinWeight.push(skinWeight.getComponent(i, j));
      }
      out.uv.push((back ? 0.5 : 0) + across * 0.5, (top - p.y) / (top - hipsY));
    });
  });
  const vest = new THREE.BufferGeometry();
  vest.setAttribute('position', new THREE.Float32BufferAttribute(out.position, 3));
  vest.setAttribute('normal', new THREE.Float32BufferAttribute(out.normal, 3));
  vest.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(out.skinIndex, 4));
  vest.setAttribute('skinWeight', new THREE.Float32BufferAttribute(out.skinWeight, 4));
  vest.setAttribute('uv', new THREE.Float32BufferAttribute(out.uv, 2));
  return vest;
}

// Fluorescent cloth with silver reflective bands round the body and up over the shoulders, and
// lettering across the back. Outside the vest's outline (the neck, the armholes, below the hem)
// the texture is clear and the vest is cut away there.
function vestMaterial({ color, text }) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const c = canvas.getContext('2d');
  // Each half (front, back) in units of its own width and height.
  const half = (x, neck) => {
    c.setTransform(256, 0, 0, 256, x, 0);
    c.beginPath();
    c.moveTo(0.2, 0.03);
    c.lineTo(0.34, 0.03);
    c.lineTo(0.5, neck);
    c.lineTo(0.66, 0.03);
    c.lineTo(0.8, 0.03);
    c.quadraticCurveTo(0.8, 0.3, 1, 0.38);
    c.lineTo(1, 0.9);
    c.lineTo(0, 0.9);
    c.lineTo(0, 0.38);
    c.quadraticCurveTo(0.2, 0.3, 0.2, 0.03);
    c.closePath();
    c.save();
    c.clip();
    c.fillStyle = color;
    c.fillRect(0, 0, 1, 1);
    c.fillStyle = '#c9ccd2';
    for (const v of [0.58, 0.76]) c.fillRect(0, v, 1, 0.07);
    for (const u of [0.22, 0.7]) c.fillRect(u, 0, 0.08, 0.58);
    c.restore();
  };
  half(0, 0.34);
  half(256, 0.09);
  c.setTransform(1, 0, 0, 1, 0, 0);
  if (text) {
    c.fillStyle = '#1d2430';
    c.font = 'bold 34px sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(text, 384, 0.4 * 256, 150);
  }
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  // Laid out like the models' own textures: v = 0 is the top row.
  map.flipY = false;
  map.userData.outfit = true;
  // A little glow: hi-vis cloth is fluorescent and catches the eye even in shade.
  return new THREE.MeshStandardMaterial({
    map,
    alphaTest: 0.5,
    side: THREE.DoubleSide,
    roughness: 0.7,
    emissive: 0xffffff,
    emissiveMap: map,
    emissiveIntensity: 0.12,
  });
}

// The texture coordinates (u, v) of the front of the piece within 4 cm of (x, y) as linear
// functions of x and y ([a, b, c]: a + b x + c y), or null if they do not fit one (a seam).
function fitTexture(piece, x, y) {
  const { position, normal, uv } = piece.geometry.attributes,
    rows = [],
    p = new THREE.Vector3(),
    n = new THREE.Vector3(),
    normalMatrix = new THREE.Matrix3().getNormalMatrix(piece.matrixWorld);
  for (let i = 0; i < position.count; i++) {
    p.fromBufferAttribute(position, i).applyMatrix4(piece.matrixWorld);
    if (Math.hypot(p.x - x, p.y - y) > 0.04) continue;
    if (n.fromBufferAttribute(normal, i).applyMatrix3(normalMatrix).normalize().z < 0.4) continue;
    rows.push([p.x, p.y, uv.getX(i), uv.getY(i)]);
  }
  if (rows.length < 6) return null;
  // Least squares.
  const solve = (col) => {
    const m = [
        [0, 0, 0],
        [0, 0, 0],
        [0, 0, 0],
      ],
      r = [0, 0, 0];
    for (const row of rows) {
      const q = [1, row[0], row[1]];
      for (let a = 0; a < 3; a++) {
        r[a] += q[a] * row[col];
        for (let b = 0; b < 3; b++) m[a][b] += q[a] * q[b];
      }
    }
    return solve3(m, r);
  };
  const fit = [solve(2), solve(3)];
  if (!fit[0] || !fit[1]) return null;
  const off = (f, row, col) => Math.abs(f[0] + f[1] * row[0] + f[2] * row[1] - row[col]);
  const error = Math.max(...rows.map((row) => Math.max(off(fit[0], row, 2), off(fit[1], row, 3))));
  return error > 0.01 ? null : fit;
}

// The piece's material with a badge painted on a copy of its texture: the texture coordinates
// of the chest are fitted to the body's own x and y, so the badge is drawn upright and to scale
// whichever way the texture is laid out. null if the chest's texture is not in one piece
// anywhere it could go (the badge would tear).
function badgeMaterial(piece, kind, { chestY, centreX }) {
  const map = piece.material.map;
  if (!map?.image || chestY == null) return null;
  // The left of the chest if the texture is in one piece there, else the right, else the middle.
  let fit, x;
  for (const side of [0.085, -0.085, 0]) {
    x = centreX + side;
    fit = fitTexture(piece, x, chestY);
    if (fit) break;
  }
  if (!fit) return null;
  const [fu, fv] = fit;
  const { width, height } = map.image,
    canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const c = canvas.getContext('2d');
  c.drawImage(map.image, 0, 0);
  // Body metres to texture pixels, then millimetres from the badge's centre, y down.
  c.setTransform(
    fu[1] * width,
    fv[1] * height,
    fu[2] * width,
    fv[2] * height,
    fu[0] * width,
    fv[0] * height,
  );
  c.translate(x, chestY);
  c.scale(0.001, -0.001);
  drawBadge(c, kind);
  const texture = new THREE.CanvasTexture(canvas);
  for (const key of [
    'flipY',
    'colorSpace',
    'wrapS',
    'wrapT',
    'magFilter',
    'minFilter',
    'anisotropy',
  ])
    texture[key] = map[key];
  texture.userData.outfit = true;
  const material = piece.material.clone();
  material.map = texture;
  return material;
}

// Badges, in millimetres about their centre.
function drawBadge(c, kind) {
  const rounded = (x, y, w, h, r) => {
    c.beginPath();
    c.roundRect(x, y, w, h, r);
    c.fill();
  };
  if (kind === 'medical') {
    c.fillStyle = '#ffffff';
    rounded(-26, -26, 52, 52, 8);
    c.fillStyle = '#d42a2a';
    c.fillRect(-18, -6, 36, 12);
    c.fillRect(-6, -18, 12, 36);
  } else if (kind === 'lifeguard') {
    c.fillStyle = '#ffffff';
    c.fillRect(-24, -8, 48, 16);
    c.fillRect(-8, -24, 16, 48);
  } else if (kind === 'name') {
    c.fillStyle = '#ffffff';
    rounded(-34, -13, 68, 26, 3);
    c.fillStyle = '#2f5d8a';
    c.fillRect(-34, -13, 68, 8);
    c.fillStyle = '#2b2f36';
    c.fillRect(-26, 0, 52, 3);
    c.fillRect(-26, 6, 34, 3);
  }
}

function solve3(m, r) {
  const det = (a) =>
    a[0][0] * (a[1][1] * a[2][2] - a[1][2] * a[2][1]) -
    a[0][1] * (a[1][0] * a[2][2] - a[1][2] * a[2][0]) +
    a[0][2] * (a[1][0] * a[2][1] - a[1][1] * a[2][0]);
  const d = det(m);
  if (Math.abs(d) < 1e-12) return null;
  return [0, 1, 2].map((k) => det(m.map((row, i) => row.map((v, j) => (j === k ? r[i] : v)))) / d);
}
