import * as THREE from './vendor/three.module.min.js';

// Dresses a rigged character (three-characters.js) in an outfit (character-outfits.js):
// - top/bottom/stripes recolour the model's own shirt and trousers pieces, keeping the folds and
//   shading of their texture;
// - vest: a hi-vis vest made from the torso of the shirt, pushed out a little, so it bends with
//   the body; a jacket (the whole top, sleeves too) and an apron (the front of the top and the
//   trousers), a long coat, a dress's top and gloves are made the same way, and a skirt (or a
//   dress's skirt) is shaped from the waist to the knees, swinging with the hips and both thighs;
// - hats (cap, hard hat, beanie, sun hat, bucket hat, beret, helmet, headband, headscarf,
//   turban), glasses, a face mask, scarf, tie or bow tie, lanyard, watch and backpack ride on the
//   head, neck, spine and forearm bones;
// - shoes are recoloured like the top and trousers;
// - badge: painted onto a copy of the shirt's texture, on the left of the chest.
// Everything is worked out from the model's pieces, bones and skin weights, so any Mixamo
// character can wear it. Materials, textures and shapes are made once per model and shared.

// Mixamo names each piece; a jacket or hoodie is worn over the shirt, so it is the one shown.
const OUTER = /Suit|Hoodie|Sweater|Cloth/i,
  SHIRT = /Shirt/i,
  BOTTOM = /Pants|Shorts/i;
const LUMA = [0.2126, 0.7152, 0.0722];
// The hats built by moreHat (the cap, hard hat and beanie are built by hat itself).
const MORE_HATS = new Set([
  'sunhat',
  'bucket',
  'beret',
  'helmet',
  'headband',
  'headscarf',
  'turban',
]);
// Mixamo's names for shoes.
const SHOES = /Shoe|Boot|Sneaker|Footwear/i;
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
    // Clothes that bend with the body: shells over the model's own pieces, bound to its bones.
    const trousers = bottoms[0];
    if (outfit.jacket)
      this.skinned(
        shirt,
        this.once(`jacket|${file}|${shirt.name}`, () =>
          shellGeometry(shirt, { bones: /Spine|Hips|Shoulder|Arm|Neck/, offset: 0.016 }),
        ),
        this.cloth(file, shirt, outfit.jacket),
      );
    if (outfit.apron && body.waist && body.kneeY != null && body.chestFront != null) {
      // A cloth panel in front: a bib on the chest and a skirt below the waist, made for this body
      // and bound to the bones under each part, with straps up round the neck.
      // Bound to whichever piece of the model is skinned to every bone the apron needs.
      const needs = /^mixamorig(Spine2|Spine1|Hips|LeftUpLeg|RightUpLeg)(_\d+)?$/,
        host = meshes.find(
          (m) =>
            new Set(m.skeleton.bones.map((b) => b.name.match(needs)?.[1]).filter(Boolean)).size ===
            5,
        );
      if (host)
        this.skinned(
          host,
          this.once(`apron|${file}|${host.name}`, () => apronGeometry(host, body)),
          this.drape(outfit.apron),
        );
      const chest =
        root.getObjectByName('mixamorigSpine2') || root.getObjectByName('mixamorigSpine1');
      if (chest && body.neck) this.wear(chest, this.apronStraps(outfit.apron, body), root);
    }
    if (outfit.skirt && trousers && body.waist && body.kneeY != null)
      this.skinned(
        trousers,
        this.once(`skirt|${file}|${trousers.name}`, () => skirtGeometry(trousers, body)),
        this.drape(outfit.skirt),
      );
    if (outfit.coat) {
      // A long coat: over the whole top, and from the waist to below the knees like a skirt.
      this.skinned(
        shirt,
        this.once(`coat|${file}|${shirt.name}`, () =>
          shellGeometry(shirt, { bones: /Spine|Hips|Shoulder|Arm|Neck/, offset: 0.022 }),
        ),
        this.cloth(file, shirt, outfit.coat),
      );
      if (trousers && body.waist && body.kneeY != null)
        this.skinned(
          trousers,
          this.once(`coat-skirt|${file}|${trousers.name}`, () =>
            skirtGeometry(trousers, body, { hem: -0.12, flare: 0.16, pleats: 0, rise: 0.06 }),
          ),
          this.drape(outfit.coat),
        );
    }
    if (outfit.dress) {
      // A sleeveless top and a skirt in one colour.
      this.skinned(
        shirt,
        this.once(`dress-top|${file}|${shirt.name}`, () =>
          shellGeometry(shirt, { bones: /Spine|Hips|Neck/, offset: 0.014 }),
        ),
        this.cloth(file, shirt, outfit.dress),
      );
      if (trousers && body.waist && body.kneeY != null)
        this.skinned(
          trousers,
          this.once(`skirt|${file}|${trousers.name}`, () => skirtGeometry(trousers, body)),
          this.drape(outfit.dress),
        );
    }
    // Gloves: a thin layer over whatever the hands move (the body's own skin).
    if (outfit.gloves)
      for (const mesh of meshes) {
        const gloves = this.once(`gloves|${file}|${mesh.name}`, () =>
          shellGeometry(mesh, { bones: /Hand/, offset: 0.004 }),
        );
        if (gloves) this.skinned(mesh, gloves, this.material(outfit.gloves, 0.7));
      }
    if (outfit.shoes)
      for (const piece of meshes.filter((m) => SHOES.test(m.name)))
        piece.material = this.once(`recolour|${file}|${piece.name}|${outfit.shoes}|`, () =>
          recolour(piece, outfit.shoes, null),
        );
    const head = root.getObjectByName('mixamorigHead'),
      neck = root.getObjectByName('mixamorigNeck'),
      spine = root.getObjectByName('mixamorigSpine2') || root.getObjectByName('mixamorigSpine1');
    if (outfit.hat && head && body.head) this.wear(head, this.hat(file, outfit.hat, body), root);
    if (outfit.glasses && head && body.face && body.head)
      this.wear(head, this.glasses(file, outfit.glasses, body), root);
    // How far out a jacket, coat or apron puts the front of the chest, for what hangs over it.
    const layer = outfit.apron
        ? 0.03
        : outfit.coat
          ? 0.026
          : outfit.jacket
            ? 0.02
            : outfit.dress
              ? 0.016
              : outfit.vest
                ? 0.015
                : 0,
      over = { ...body, chestFront: body.chestFront + layer, layer };
    if (outfit.scarf && neck && spine && body.neck) {
      const { wrap, tail } = this.scarf(file, outfit.scarf, over);
      this.wear(neck, wrap, root);
      this.wear(spine, tail, root);
    }
    if (outfit.mask && head && body.face && body.head)
      this.wear(head, this.mask(file, outfit.mask, body), root);
    if (outfit.tie && spine && body.neck && body.chestFront != null)
      this.wear(spine, this.tie(file, outfit.tie, over), root);
    if (outfit.lanyard && spine && body.neck && body.chestFront != null)
      this.wear(spine, this.lanyard(file, outfit.lanyard, over), root);
    const forearm = root.getObjectByName('mixamorigLeftForeArm'),
      wrist = root.getObjectByName('mixamorigLeftHand');
    if (outfit.watch && forearm && wrist) this.wear(forearm, this.watch(outfit.watch, wrist), root);
    if (outfit.backpack && spine && body.back)
      this.wear(spine, this.backpack(file, outfit.backpack, body), root);
  }
  // An apron's straps: from the bib's top corners up to the back of the neck.
  apronStraps(color, { neck, chestY, chestFront }) {
    const group = new THREE.Group(),
      cloth = this.material(color, 0.9);
    for (const side of [-1, 1]) {
      const from = new THREE.Vector3(neck.x + side * 0.085, chestY + 0.06, chestFront + 0.018),
        to = new THREE.Vector3(neck.x + side * (neck.rx + 0.01), neck.y, neck.z),
        strap = new THREE.Mesh(
          this.once('apron-strap', () => new THREE.BoxGeometry(0.018, 1, 0.004)),
          cloth,
        );
      strap.scale.y = from.distanceTo(to);
      strap.position.copy(from).add(to).multiplyScalar(0.5);
      strap.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        to.clone().sub(from).normalize(),
      );
      group.add(strap);
    }
    return group;
  }
  // A face mask over the nose and mouth, curved round the face, with loops to the ears.
  mask(file, color, { head, face }) {
    const group = new THREE.Group(),
      cloth = this.material(color, 0.9),
      r = face.half * 1.02;
    const cover = new THREE.Mesh(
      this.once(
        `mask|${file}`,
        () => new THREE.CylinderGeometry(r, r * 0.92, 0.075, 24, 1, true, -0.95, 1.9),
      ),
      cloth,
    );
    cover.material = this.once(`mask|${color}`, () => {
      const m = cloth.clone();
      m.side = THREE.DoubleSide;
      return m;
    });
    cover.position.z = -r;
    group.add(cover);
    for (const side of [-1, 1]) {
      const loop = new THREE.Mesh(
        this.once('mask-loop', () => new THREE.BoxGeometry(0.003, 0.003, 0.07)),
        cloth,
      );
      loop.position.set(side * r * 0.82, 0.02, -r * 0.62);
      loop.rotation.x = -0.4;
      group.add(loop);
    }
    group.position.set(head.x, face.eyeY - 0.068, face.front + 0.01);
    return group;
  }
  // A necktie hanging from the collar down the chest, or a bow tie at the collar.
  tie(file, { kind = 'tie', color }, { neck, chestFront, chestY, layer = 0 }) {
    const group = new THREE.Group(),
      silk = this.material(color, 0.45),
      collar = neck.z + neck.rz + layer;
    if (kind === 'bowtie') {
      for (const side of [-1, 1]) {
        const wing = new THREE.Mesh(
          this.once('bow-wing', () => new THREE.ConeGeometry(0.022, 0.05, 4).rotateZ(Math.PI / 2)),
          silk,
        );
        // Each wing's point at the knot, its broad end outwards.
        wing.position.x = side * 0.024;
        wing.rotation.y = side < 0 ? Math.PI : 0;
        group.add(wing);
      }
      group.add(
        new THREE.Mesh(
          this.once('bow-knot', () => new THREE.BoxGeometry(0.016, 0.02, 0.016)),
          silk,
        ),
      );
      group.position.set(neck.x, neck.y - 0.045, collar + 0.012);
      return group;
    }
    const length = Math.max(0.22, neck.y - 0.05 - (chestY - 0.22)),
      knot = new THREE.Mesh(
        this.once('tie-knot', () => new THREE.BoxGeometry(0.03, 0.03, 0.02)),
        silk,
      ),
      blade = new THREE.Mesh(
        this.once(`tie-blade|${file}`, () =>
          new THREE.CylinderGeometry(0.036, 0.024, length, 4, 1)
            .rotateY(Math.PI / 4)
            .scale(1, 1, 0.25),
        ),
        silk,
      );
    // Lying on the chest: from the collar down and out to the chest's front.
    blade.position.set(0, -length / 2 - 0.012, 0);
    group.add(knot, blade);
    group.position.set(neck.x, neck.y - 0.05, collar + 0.012 + layer);
    group.rotation.x = -Math.atan2(chestFront + 0.022 + layer * 1.5 - (collar + 0.012), length);
    return group;
  }
  // A cord round the neck with an ID card on the chest.
  lanyard(file, color, { neck, chestFront, chestY }) {
    const group = new THREE.Group(),
      cord = this.material(color, 0.8),
      drop = neck.y - chestY;
    // The cord: an oval from the collar down to the card, leaning out over the chest.
    const loop = new THREE.Mesh(
      this.once(`lanyard|${file}`, () =>
        new THREE.TorusGeometry(1, 0.004, 6, 32).scale(neck.rx + 0.02, drop * 0.375, 1),
      ),
      cord,
    );
    loop.position.set(0, -drop * 0.375, (chestFront - neck.z) * 0.5);
    loop.rotation.x = -0.35;
    group.add(loop);
    const card = new THREE.Mesh(
      this.once('id-card', () => new THREE.BoxGeometry(0.055, 0.08, 0.004)),
      this.once(
        'id-card|material',
        () => new THREE.MeshStandardMaterial({ color: '#f4f4f0', roughness: 0.4 }),
      ),
    );
    card.position.set(0, -drop * 0.75 - 0.03, chestFront + 0.012 - neck.z);
    group.add(card);
    group.position.set(neck.x, neck.y - 0.02, neck.z);
    return group;
  }
  // A wristwatch on the left wrist: a band round the forearm's end and a face on top.
  watch(color, wrist) {
    const group = new THREE.Group(),
      band = this.material(color, 0.5),
      at = wrist.getWorldPosition(new THREE.Vector3());
    group.add(
      new THREE.Mesh(
        this.once('watch-band', () =>
          new THREE.TorusGeometry(0.03, 0.007, 6, 20).rotateY(Math.PI / 2),
        ),
        band,
      ),
    );
    const dial = new THREE.Mesh(
      this.once('watch-face', () => new THREE.CylinderGeometry(0.014, 0.014, 0.007, 16)),
      this.once(
        'watch-face|material',
        () => new THREE.MeshStandardMaterial({ color: '#dfe3e6', metalness: 0.6, roughness: 0.25 }),
      ),
    );
    dial.position.y = 0.035;
    group.add(dial);
    // Just up the arm from the wrist joint (the T-pose arm runs along x).
    group.position.set(at.x - Math.sign(at.x || 1) * 0.035, at.y, at.z);
    return group;
  }
  // A garment that bends with the body: a child of the piece it was made from, sharing its place,
  // bind pose and bones.
  skinned(piece, geometry, material) {
    if (!geometry) return;
    const mesh = new THREE.SkinnedMesh(geometry, material);
    mesh.frustumCulled = false;
    mesh.castShadow = this.shadows;
    piece.add(mesh);
    mesh.bind(piece.skeleton, piece.bindMatrix);
  }
  // Glasses: two rims (or dark lenses), a bridge and arms back to the ears, at the eyes.
  glasses(file, { kind = 'glasses', color = '#222222' }, { head, face }) {
    const group = new THREE.Group(),
      frame = this.material(color, 0.35),
      lens =
        kind === 'sunglasses'
          ? this.once(
              'lens|dark',
              () =>
                new THREE.MeshStandardMaterial({
                  color: '#111418',
                  roughness: 0.15,
                  metalness: 0.4,
                  transparent: true,
                  opacity: 0.88,
                }),
            )
          : this.once(
              'lens|clear',
              () =>
                new THREE.MeshStandardMaterial({
                  color: '#dfe9ef',
                  roughness: 0.05,
                  transparent: true,
                  opacity: 0.18,
                  depthWrite: false,
                }),
            ),
      r = kind === 'sunglasses' ? 0.022 : 0.019,
      apart = 0.032;
    const rim = this.once(`rim|${kind}`, () => new THREE.TorusGeometry(r, 0.0025, 6, 24)),
      glass = this.once(`glass|${kind}`, () => new THREE.CircleGeometry(r, 24));
    for (const side of [-1, 1]) {
      const ring = new THREE.Mesh(rim, frame),
        pane = new THREE.Mesh(glass, lens);
      ring.position.set(side * apart, 0, 0);
      pane.position.set(side * apart, 0, -0.001);
      // An arm from the outer edge of the rim back along the side of the head.
      const arm = new THREE.Mesh(
        this.once(`arm|${file}`, () => new THREE.BoxGeometry(0.003, 0.003, 1)),
        frame,
      );
      const back = Math.max(0.06, face.front - head.z);
      arm.scale.z = back;
      arm.position.set(side * Math.max(apart + r, face.half * 0.92), 0.004, -back / 2);
      group.add(ring, pane, arm);
    }
    const bridge = new THREE.Mesh(
      this.once('bridge', () => new THREE.BoxGeometry(apart * 2 - r * 2, 0.003, 0.003)),
      frame,
    );
    bridge.position.y = 0.006;
    group.add(bridge);
    group.position.set(head.x, face.eyeY, face.front + 0.012);
    return group;
  }
  // A scarf: a soft roll snug round the collar, and one end hanging down the chest.
  scarf(file, color, { neck, layer = 0 }) {
    const cloth = this.material(color, 0.95),
      wrap = new THREE.Mesh(
        this.once(`scarf|${file}|${layer}`, () =>
          new THREE.TorusGeometry(1, 0.42, 12, 32)
            .rotateX(Math.PI / 2)
            .scale(neck.rx + 0.022 + layer, 0.055, neck.rz + 0.022 + layer),
        ),
        cloth,
      ),
      // A soft, slightly rounded end, narrowing a little to its fringe.
      tail = new THREE.Mesh(
        this.once('scarf-tail', () =>
          new THREE.CylinderGeometry(0.048, 0.042, 0.3, 12, 4).scale(1, 1, 0.28),
        ),
        cloth,
      );
    wrap.position.set(neck.x, neck.y - 0.035, neck.z);
    tail.position.set(neck.x + 0.05, neck.y - 0.2, neck.z + neck.rz + 0.035 + layer * 1.4);
    tail.rotation.set(-0.12, 0, 0.06);
    return { wrap, tail };
  }
  // Puts an accessory, placed for the rest pose in the model's own space, on a bone.
  wear(bone, object, root) {
    root.add(object);
    object.traverse((o) => o.isMesh && (o.castShadow = this.shadows));
    bone.attach(object);
  }
  // Cloth for a garment made over `piece`: the piece's own material in the garment's colour, so
  // it keeps the folds and seams of the piece's texture (plain cloth if the piece has none).
  cloth(file, piece, color) {
    if (!piece.material?.map) return this.material(color, 0.85);
    return this.once(`recolour|${file}|${piece.name}|${color}|`, () =>
      recolour(piece, color, null),
    );
  }
  // Cloth with no texture of its own (a skirt, a coat's skirt), seen from either side.
  drape(color) {
    return this.once(
      `drape|${color}`,
      () => new THREE.MeshStandardMaterial({ color, roughness: 0.9, side: THREE.DoubleSide }),
    );
  }
  material(color, roughness = 0.6) {
    return this.once(
      `plain|${color}|${roughness}`,
      () => new THREE.MeshStandardMaterial({ color, roughness }),
    );
  }
  hat(file, { kind, color }, body) {
    if (MORE_HATS.has(kind)) return this.moreHat(file, kind, color, body);
    const { head } = body,
      r = head.radius,
      group = new THREE.Group(),
      shell = this.material(color, kind === 'hardhat' ? 0.35 : 0.8);
    const dome = this.once(`dome|${file}|${kind}`, () =>
      new THREE.SphereGeometry(1, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2).scale(
        r * (kind === 'beanie' ? 1.03 : 1),
        r * (kind === 'hardhat' ? 0.85 : kind === 'beanie' ? 1.05 : 0.9),
        r * 1.08 * (kind === 'beanie' ? 1.03 : 1),
      ),
    );
    group.add(new THREE.Mesh(dome, shell));
    if (kind === 'beanie') {
      // A knitted hat pulled well down, with its turned-up band round the bottom.
      group.add(
        new THREE.Mesh(
          this.once(`band|${file}`, () =>
            new THREE.CylinderGeometry(1, 1, 1, 28, 1, true).scale(r * 1.06, r * 0.32, r * 1.14),
          ),
          shell,
        ),
      );
      group.children[1].position.y = r * 0.12;
      group.position.set(head.x, head.top - r * 1.02, head.z);
      return group;
    }
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
  // Hats beyond the cap, hard hat and beanie, each fitted to the head's size.
  moreHat(file, kind, color, { head, neckY, face }) {
    // Between the head itself and its hair: a full hairstyle makes the crown measure much wider
    // than the face, and a hat sized to either looks wrong.
    const r = face ? (Math.min(head.radius, face.half * 1.2) + head.radius) / 2 : head.radius,
      group = new THREE.Group(),
      // Open shapes (a headscarf's sides, a brim seen from below) show their inside too.
      cloth = kind === 'helmet' ? this.material(color, 0.4) : this.drape(color),
      add = (key, make, setup = () => {}) => {
        const mesh = new THREE.Mesh(this.once(`${kind}|${key}|${file}`, make), cloth);
        setup(mesh);
        group.add(mesh);
        return mesh;
      },
      dome = (x, y, z) => () =>
        new THREE.SphereGeometry(1, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2).scale(x, y, z);
    let y = head.top - r * 0.82;
    if (kind === 'sunhat') {
      // The crown down over the hair to the forehead, the brim level with it.
      add('crown', dome(r * 1.06, r * 0.92, r * 1.14));
      add('brim', () => new THREE.CylinderGeometry(r * 1.85, r * 1.95, 0.012, 40));
      y = head.top - r * 0.9;
    } else if (kind === 'bucket') {
      add('crown', dome(r * 1.02, r * 0.9, r * 1.1));
      y = head.top - r * 0.8;
      add(
        'brim',
        () => new THREE.CylinderGeometry(r * 1.02, r * 1.3, r * 0.22, 32, 1, true),
        (m) => (m.position.y = -r * 0.08),
      );
    } else if (kind === 'beret') {
      // A soft flat disc worn tipped to one side.
      add('disc', () => new THREE.SphereGeometry(1, 24, 12).scale(r * 1.2, r * 0.36, r * 1.16));
      group.rotation.z = 0.22;
      y = head.top - r * 0.2;
      group.position.x = 0.012;
    } else if (kind === 'helmet') {
      // A cycling helmet: a long shell with a short visor at the front.
      add('shell', dome(r * 1.14, r * 1.02, r * 1.28));
      add(
        'visor',
        () => new THREE.BoxGeometry(r * 1.3, 0.012, r * 0.35),
        (m) => {
          m.position.set(0, r * 0.08, r * 1.2);
          m.rotation.x = 0.25;
        },
      );
      y = head.top - r * 0.62;
    } else if (kind === 'headband') {
      add('band', () => new THREE.CylinderGeometry(r * 1.04, r * 1.04, 0.035, 32, 1, true));
      y = head.top - r * 0.62;
    } else if (kind === 'headscarf') {
      // Over the crown, down round the ears and the back of the head, the face left open, and a
      // wide fall of cloth behind to the shoulders.
      const drop = Math.max(0.14, head.top - r * 1.2 - (neckY ?? head.top - 0.3) + 0.06),
        open = 0.62;
      add('cap', dome(r * 1.05, r * 1.0, r * 1.1));
      add('sides', () =>
        new THREE.SphereGeometry(
          1,
          28,
          8,
          Math.PI / 2 + open,
          Math.PI * 2 - open * 2,
          Math.PI / 2,
          Math.PI * 0.2,
        ).scale(r * 1.05, r * 1.0, r * 1.1),
      );
      add(
        'drape',
        () =>
          new THREE.CylinderGeometry(
            r * 1.02,
            r * 1.45,
            drop,
            28,
            1,
            true,
            Math.PI * 0.62,
            Math.PI * 0.76,
          ),
        (m) => m.position.set(0, -r * 0.55 - drop / 2, -r * 0.1),
      );
      y = head.top - r * 0.94;
    } else if (kind === 'turban') {
      // A smooth wound crown, with two folds crossing at the front.
      add(
        'crown',
        () => new THREE.SphereGeometry(1, 28, 16).scale(r * 1.2, r * 0.8, r * 1.28),
        (m) => (m.position.y = r * 0.42),
      );
      for (const side of [-1, 1])
        add(
          'fold' + side,
          () =>
            new THREE.TorusGeometry(1, 0.1, 8, 36)
              .rotateX(Math.PI / 2)
              .scale(r * 1.16, r * 0.8, r * 1.24),
          (m) => {
            m.position.y = r * 0.42;
            m.rotation.z = side * 0.32;
          },
        );
      y = head.top - r * 0.95;
    }
    group.position.set(head.x + group.position.x, y, head.z);
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
    torso = [],
    neckRing = [],
    waist = [];
  for (const mesh of meshes)
    eachVertex(mesh, (i, bone) => {
      const list = /Head/.test(bone)
        ? head
        : /Spine/.test(bone)
          ? torso
          : /Neck/.test(bone)
            ? neckRing
            : /Hips|UpLeg/.test(bone)
              ? waist
              : null;
      list?.push(
        new THREE.Vector3()
          .fromBufferAttribute(mesh.geometry.attributes.position, i)
          .applyMatrix4(mesh.matrixWorld),
      );
    });
  const bone = (name) =>
      root.getObjectByName('mixamorig' + name)?.getWorldPosition(new THREE.Vector3()),
    hips = bone('Hips'),
    arm = bone('LeftArm'),
    knee = bone('LeftLeg');
  const result = {
    chestY: neck ? neck.y - 0.15 : null,
    centreX: neck ? neck.x : 0,
    neckY: neck?.y,
    hipsY: hips?.y,
    shoulder: neck && arm ? Math.abs(arm.x - neck.x) : null,
    kneeY: knee?.y,
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
    // The eyes: about 42% of the way down from the crown to the neck joint; the face's front there
    // is the furthest forward point beside (not on) the nose.
    if (neck) {
      const eyeY = top - (top - neck.y) * 0.42,
        band = head.filter(
          (v) => Math.abs(v.y - eyeY) < 0.02 && Math.abs(v.x - result.head.x) > 0.022,
        ),
        sides = head.filter((v) => Math.abs(v.y - eyeY) < 0.03);
      if (band.length && sides.length)
        result.face = {
          eyeY,
          front: Math.max(...band.map((v) => v.z)),
          // Half the head's width at the eyes, where glasses' arms run back to the ears.
          half: (Math.max(...sides.map((v) => v.x)) - Math.min(...sides.map((v) => v.x))) / 2,
        };
    }
  }
  // Round the neck, just above where it meets the shoulders: every point there, whichever bone
  // moves it (some models weight the neck to the head or the spine).
  if (neck) {
    const y = neck.y + 0.03,
      ring = [...neckRing, ...head, ...torso].filter(
        (v) => Math.abs(v.y - y) < 0.02 && Math.hypot(v.x - neck.x, v.z - neck.z) < 0.11,
      );
    if (ring.length) {
      // The neck itself, not the collar round it: the nearer 40% of the points.
      const cx = ring.reduce((t, v) => t + v.x, 0) / ring.length,
        cz = ring.reduce((t, v) => t + v.z, 0) / ring.length,
        near = ring.map((v) => Math.hypot(v.x - cx, v.z - cz)).sort((a, b) => a - b),
        r = Math.max(0.045, near[Math.floor(near.length * 0.4)]);
      result.neck = { x: cx, y, z: cz, rx: r * 1.05, rz: r * 0.95 };
    }
  }
  // Round the hips, at the hip joint: how wide and deep a skirt's waist must be.
  if (waist.length && hips) {
    const ring = waist.filter((v) => Math.abs(v.y - hips.y) < 0.05);
    if (ring.length) {
      const xs = ring.map((v) => v.x),
        zs = ring.map((v) => v.z);
      result.waist = {
        x: (Math.min(...xs) + Math.max(...xs)) / 2,
        z: (Math.min(...zs) + Math.max(...zs)) / 2,
        rx: (Math.max(...xs) - Math.min(...xs)) / 2,
        rz: (Math.max(...zs) - Math.min(...zs)) / 2,
      };
    }
  }
  if (torso.length && neck) {
    const y = neck.y - 0.22,
      band = torso.filter((v) => Math.abs(v.y - y) < 0.08);
    if (band.length) result.back = { x: neck.x, y, z: Math.min(...band.map((v) => v.z)) };
    // The front of the chest, where a tie or an ID card hangs.
    const chest = torso.filter(
      (v) => Math.abs(v.y - (neck.y - 0.15)) < 0.05 && Math.abs(v.x - neck.x) < 0.05,
    );
    if (chest.length) result.chestFront = Math.max(...chest.map((v) => v.z));
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

// A garment over part of a piece: the faces whose vertices `bones` move most (and, given
// `faces(point, normal)` in the model's space, only those it keeps), pushed `offset` metres out
// along their normals, keeping the piece's skinning so it bends with the body.
function shellGeometry(piece, { bones, offset, faces = null }) {
  const g = piece.geometry,
    { position, normal, skinIndex, skinWeight } = g.attributes,
    index = g.index,
    scale = piece.matrixWorld.getMaxScaleOnAxis(),
    turn = new THREE.Matrix3().getNormalMatrix(piece.matrixWorld);
  const keep = new Uint8Array(position.count);
  eachVertex(piece, (i, bone) => (keep[i] = bones.test(bone) ? 1 : 0));
  const uv = g.attributes.uv,
    out = { position: [], normal: [], skinIndex: [], skinWeight: [], uv: [] },
    count = index ? index.count : position.count,
    at = new THREE.Vector3(),
    facing = new THREE.Vector3();
  for (let f = 0; f < count; f += 3) {
    const v = [0, 1, 2].map((k) => (index ? index.getX(f + k) : f + k));
    if (!v.every((i) => keep[i])) continue;
    if (faces) {
      // The face's middle and its outward direction, in the model's space.
      at.set(0, 0, 0);
      facing.set(0, 0, 0);
      for (const i of v) {
        at.add(
          new THREE.Vector3().fromBufferAttribute(position, i).applyMatrix4(piece.matrixWorld),
        );
        facing.add(new THREE.Vector3().fromBufferAttribute(normal, i).applyMatrix3(turn));
      }
      if (!faces(at.divideScalar(3), facing.normalize())) continue;
    }
    for (const i of v) {
      for (const axis of ['X', 'Y', 'Z'])
        out.position.push(position['get' + axis](i) + (normal['get' + axis](i) * offset) / scale);
      out.normal.push(normal.getX(i), normal.getY(i), normal.getZ(i));
      if (uv) out.uv.push(uv.getX(i), uv.getY(i));
      for (let j = 0; j < 4; j++) {
        out.skinIndex.push(skinIndex.getComponent(i, j));
        out.skinWeight.push(skinWeight.getComponent(i, j));
      }
    }
  }
  if (out.position.length < 60 * 3) return null;
  const shell = new THREE.BufferGeometry();
  shell.setAttribute('position', new THREE.Float32BufferAttribute(out.position, 3));
  shell.setAttribute('normal', new THREE.Float32BufferAttribute(out.normal, 3));
  shell.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(out.skinIndex, 4));
  shell.setAttribute('skinWeight', new THREE.Float32BufferAttribute(out.skinWeight, 4));
  // The piece's own texture layout, so the garment keeps its folds and seams in its new colour.
  if (out.uv.length) shell.setAttribute('uv', new THREE.Float32BufferAttribute(out.uv, 2));
  return shell;
}

// An apron: a panel curved round the front of the body, from the top of the chest to just above
// the knees, a narrow bib above the waist and a wider skirt below. Each part moves with what it
// covers: the bib with the chest, the waist with the hips, the skirt more and more with each thigh.
function apronGeometry(piece, { waist, kneeY, hipsY, chestY, chestFront }) {
  const bones = piece.skeleton.bones,
    find = (name) => bones.findIndex((b) => new RegExp(`^mixamorig${name}(_\\d+)?$`).test(b.name));
  const chest = find('Spine2'),
    belly = find('Spine1'),
    hips = find('Hips'),
    left = find('LeftUpLeg'),
    right = find('RightUpLeg');
  if ([chest, belly, hips, left, right].some((i) => i < 0)) return null;
  const leftX = bones[left].getWorldPosition(new THREE.Vector3()).x - waist.x,
    top = chestY + 0.06,
    bottom = kneeY + 0.1,
    waistY = hipsY + 0.1,
    across = 14,
    down = 18,
    rx = waist.rx * 1.12,
    toLocal = piece.matrixWorld.clone().invert(),
    position = [],
    skinIndex = [],
    skinWeight = [],
    index = [];
  for (let r = 0; r <= down; r++) {
    const y = top + ((bottom - top) * r) / down,
      // 0 at the top of the bib, 1 at the waist, then on down the skirt.
      below = Math.max(0, (waistY - y) / (waistY - bottom)),
      above = Math.max(0, (y - waistY) / (top - waistY)),
      half = above > 0 ? 0.1 + (1 - above) * 0.05 : 0.15 + below * 0.05,
      // How far forward the front of the body is here: the chest above, the hips and thighs below.
      front =
        above > 0
          ? chestFront - waist.z + 0.016 - (1 - above) * 0.02
          : waist.rz * 1.08 + 0.012 + below * 0.03;
    for (let c = 0; c <= across; c++) {
      const u = (c / across) * 2 - 1,
        x = u * Math.min(half, rx * 0.95),
        z = front * Math.sqrt(Math.max(0, 1 - (x / rx) ** 2)) + 0.004,
        local = new THREE.Vector3(waist.x + x, y, waist.z + z).applyMatrix4(toLocal);
      position.push(local.x, local.y, local.z);
      if (above > 0) {
        skinIndex.push(chest, belly, 0, 0);
        skinWeight.push(above, 1 - above, 0, 0);
      } else {
        const legs = Math.min(1, below * 1.2) * 0.8,
          side = Math.min(1, Math.max(0, 0.5 + (Math.sign(leftX) * x) / (rx * 1.2)));
        skinIndex.push(hips, left, right, 0);
        skinWeight.push(1 - legs, legs * side, legs * (1 - side), 0);
      }
    }
  }
  for (let r = 0; r < down; r++)
    for (let c = 0; c < across; c++) {
      const p = r * (across + 1) + c,
        q = p + 1,
        s = p + across + 1,
        u = s + 1;
      index.push(p, s, q, q, s, u);
    }
  const apron = new THREE.BufferGeometry();
  apron.setIndex(index);
  apron.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  apron.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndex, 4));
  apron.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeight, 4));
  apron.computeVertexNormals();
  return apron;
}

// A skirt from just above the hip joint to just above the knees (or `hem` metres from there),
// flaring by `flare`, with soft `pleats` round it. Near the waist it moves with the hips; lower
// down, each side moves more and more with its own thigh, blended across the middle so the hem
// swings as they walk without splitting.
function skirtGeometry(
  piece,
  { waist, kneeY, hipsY },
  { hem = 0.07, flare = 0.32, pleats = 14, rise = 0 } = {},
) {
  // Some models' bones carry a suffix ('mixamorigHips_1').
  const bones = piece.skeleton.bones,
    find = (name) => bones.findIndex((b) => new RegExp(`^mixamorig${name}(_\\d+)?$`).test(b.name));
  const hips = find('Hips'),
    left = find('LeftUpLeg'),
    right = find('RightUpLeg');
  if (hips < 0 || left < 0 || right < 0) return null;
  // Which way the model's left is: the left thigh's side of the body.
  const leftX = bones[left].getWorldPosition(new THREE.Vector3()).x - waist.x,
    // From under the top's hem (so no gap shows) down to the knees.
    top = hipsY + 0.13 + rise,
    bottom = kneeY + hem,
    around = 48,
    down = 10,
    toLocal = piece.matrixWorld.clone().invert();
  const position = [],
    skinIndex = [],
    skinWeight = [],
    index = [];
  for (let r = 0; r <= down; r++) {
    const t = r / down,
      y = top + (bottom - top) * t,
      // Snug at the waist (tucked in at the very top), flaring towards the hem; pleats deepen as
      // the skirt falls.
      grow = (r === 0 ? 0.9 : 1.02) + t * flare,
      legs = Math.min(1, t * 1.15) * 0.85;
    for (let a = 0; a < around; a++) {
      const angle = (a / around) * Math.PI * 2,
        pleat = 1 + Math.sin(angle * pleats) * 0.018 * t,
        x = Math.sin(angle) * (waist.rx * grow + 0.015) * pleat,
        z = Math.cos(angle) * (waist.rz * grow + 0.02) * pleat;
      const local = new THREE.Vector3(waist.x + x, y, waist.z + z).applyMatrix4(toLocal),
        // The left thigh's share grows across the body towards the left.
        side = Math.min(1, Math.max(0, 0.5 + (Math.sign(leftX) * x) / (waist.rx * 1.2)));
      position.push(local.x, local.y, local.z);
      skinIndex.push(hips, left, right, 0);
      skinWeight.push(1 - legs, legs * side, legs * (1 - side), 0);
    }
  }
  // Rows joined round the skirt, the last column back to the first (shared, so it is smooth).
  for (let r = 0; r < down; r++)
    for (let a = 0; a < around; a++) {
      const p = r * around + a,
        q = r * around + ((a + 1) % around),
        s = p + around,
        u = q + around;
      index.push(p, s, q, q, s, u);
    }
  const skirt = new THREE.BufferGeometry();
  skirt.setIndex(index);
  skirt.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  skirt.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndex, 4));
  skirt.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeight, 4));
  skirt.computeVertexNormals();
  return skirt;
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

// Shared with the appearance designer (three-appearance.js).
export { eachVertex, recolour, LUMA, linear };
