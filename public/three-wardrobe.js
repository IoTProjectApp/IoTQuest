import * as THREE from './vendor/three.module.min.js';
import { recolour, LUMA, linear, eachVertex } from './three-outfits.js';
import { baseOf, changes, isTrim, pieceName, plan, regionsOf } from './character-wardrobe.js';

// Changes a rigged character's own clothes (character-wardrobe.js), in its rest pose, before it
// is animated:
// - a top or bottom taken off is hidden, and in its place goes the base layer, made from the
//   piece's own shape so it fits where the body is cut away underneath: plain fitted cloth over the
//   torso and hips, cut cleanly at the sleeves' and legs' hems, and skin beyond them, drawn in to
//   the limb's own size;
// - a piece worn from another model is carried over bone by bone (each point kept where it sits
//   on its bone, then on the same bone of this skeleton) and fitted to this body's girth, measured
//   from the clothes it replaces, a little outside the base layer, which stays underneath;
// - shoes from another model go over socks made from this model's own shoes.
// Hidden pieces keep their place in the model, so the garments three-outfits.js made over them
// (a dress, a jacket, a vest) still bend with the body, now over the base layer.

// Bones are named by Mixamo; each piece may carry its own copy of a bone, named with a suffix and
// fixed to the first ('mixamorigSpine2_3' under 'mixamorigSpine2').
const primary = (name) => name.replace(/_\d+$/, '');
const HIDDEN = new THREE.MeshBasicMaterial({ visible: false });
// Worn over a shirt: a jacket, a jumper, a hoodie.
const OUTER = /Suit|Hoodie|Sweater|Jacket|Coat/i;
// Pieces painted with skin (the body, the face), for the skin's colour.
const SKIN = /Body|Face/i;

export class Wardrobe {
  constructor({ shadows = false } = {}) {
    this.shadows = shadows;
    this.cache = new Map();
  }
  once(key, make) {
    if (!this.cache.has(key)) this.cache.set(key, make());
    return this.cache.get(key);
  }
  // Changes root (a fresh copy of the model `file`) as the wardrobe says. donors: { [model]: the
  // loaded scene of that model at the same detail } for each model a piece is borrowed from;
  // skin: the skin's colour if the person's appearance sets one; outfit: their outfit (its top
  // and bottom colours recolour borrowed pieces as they would their own).
  apply(root, file, wardrobe, { donors = {}, skin = null, outfit = {} } = {}) {
    if (!changes(wardrobe)) return;
    const meshes = [];
    root.traverse((o) => o.isSkinnedMesh && meshes.push(o));
    if (!meshes.length) return;
    root.updateMatrixWorld(true);
    const named = new Map(meshes.map((m) => [pieceName(m.name), m])),
      { hide, fill } = plan([...named.keys()], wardrobe),
      base = baseOf(wardrobe),
      joints = this.once('joints|' + file, () => measureJoints(root)),
      skinColour = skin || this.once('skin|' + file, () => skinOf(meshes) || '#c99a78');
    const skins = meshes.filter((m) => SKIN.test(m.name));
    // Pieces in one region lie one over another (a jacket over its shirt): the larger, outer
    // one's base layer goes outermost, so layers never fight to be seen.
    const depth = new Map(),
      ranked = hide
        .map((name) => named.get(name))
        .sort(
          (a, b) => b.geometry.attributes.position.count - a.geometry.attributes.position.count,
        );
    for (const region of ['top', 'bottom', 'full', 'shoes']) {
      let rank = 0;
      for (const piece of ranked)
        if (fill[pieceName(piece.name)] === region) depth.set(piece, rank++);
    }
    const covered = [],
      coveredKey = [],
      // What is under each region now: its base layer, for borrowed clothes to clear.
      beneath = { top: [], bottom: [], shoes: [] };
    // How far down the arms and legs borrowed clothes reach (as a share of the limb): under them the
    // base layer is cloth that far, so no skin is made where it would only be covered.
    const reachOf = {};
    for (const region of ['top', 'bottom']) {
      const model = wardrobe[region],
        donor = model && model !== 'off' ? donors[model] : null;
      if (donor)
        reachOf[region] = this.once(`reach|${donor.uuid}|${region}`, () =>
          limbReach(donor, region),
        );
    }
    for (const name of hide) {
      const piece = named.get(name);
      const region = fill[name];
      if (region) {
        const kind = region === 'shoes' ? 'socks' : region,
          cover = {
            arm: kind === 'top' || kind === 'full' ? (reachOf.top?.arm ?? 0) : 0,
            leg: kind === 'bottom' ? (reachOf.bottom?.leg ?? 0) : 0,
          },
          {
            fabric,
            bare,
            skinFrom,
            covered: under,
            junctions,
          } = this.once(
            `fill|${file}|${piece.name}|${kind}|${base.sleeves}|${base.legs}|${depth.get(piece)}|${cover.arm}|${cover.leg}`,
            () =>
              fillGeometry(piece, kind, base, joints, { skins, depth: depth.get(piece), cover }),
          );
        // Cloth keeps the piece's own folds (its normal map) in the base layer's plain colour; under
        // clothes borrowed from another model it is drawn a little behind them, so where the two
        // nearly meet the borrowed ones show.
        const borrowedOver = (
          kind === 'full' ? ['top', 'bottom'] : [kind === 'socks' ? 'shoes' : kind]
        ).some((r) => wardrobe[r] && wardrobe[r] !== 'off');
        this.skinned(
          piece,
          fabric,
          this.cloth(kind === 'socks' ? base.socks : base.color, piece, borrowedOver),
        );
        for (const region of kind === 'full'
          ? ['top', 'bottom']
          : [kind === 'socks' ? 'shoes' : kind])
          for (const geometry of [fabric, bare])
            if (geometry) beneath[region].push({ geometry, world: piece.matrixWorld });
        // Skin painted as the body's own skin on that limb, lit as the body is: the body's material,
        // read at one point of clear skin (or the appearance's tone, or the body's colour).
        // From the skin showing past the clothes on these limbs, else the neck's.
        const neck = this.once('neck|' + file, () => neckSkin(skins)),
          from = skinFrom?.uvs.length >= 30 ? skinFrom : neck,
          source = from && meshes.find((m) => m.name === from.piece),
          texel =
            !skin &&
            source &&
            this.once(`texel|${file}|${piece.name}|${kind}`, () => clearSkin(source, from.uvs));
        if (bare && texel) {
          if (bare.userData.texel !== texel) {
            // Arm skin made afresh: each slice round the arm painted as the real arm's skin on that
            // side, where it shows past the sleeve (lighter outside, darker inside, as it is).
            const sides =
              junctions?.piece === source.name
                ? junctions.chains.map((sectors) =>
                    sectors.map((list) =>
                      list.length ? clearSkin(source, list, { loose: true }) : null,
                    ),
                  )
                : [];
            paintSkin(bare.attributes.uv, texel, sides);
            bare.userData.texel = texel;
          }
          this.skinned(
            piece,
            bare,
            this.once(`painted|${source.material.uuid}`, () => {
              const material = source.material.clone();
              material.normalMap = null;
              material.side = THREE.DoubleSide;
              return material;
            }),
          );
        } else this.skinned(piece, bare, this.skin(skin || skinColour));
        if (bare && under?.length) {
          covered.push(...under);
          coveredKey.push(`${piece.name}|${kind}`);
        }
      }
      piece.material = HIDDEN;
    }
    if (covered.length)
      for (const body of skins)
        body.geometry = this.once(
          `trim|${file}|${body.name}|${coveredKey.join(',')}|${base.sleeves}|${base.legs}`,
          () => trimGeometry(body, covered),
        );
    // Pieces worn from other models, bound to this one's own bones (no one piece of it is skinned
    // to every bone: the body is cut away under the clothes, and with it its bones there).
    let skeleton = null;
    for (const region of ['top', 'bottom', 'shoes']) {
      const model = wardrobe[region],
        donor = model && model !== 'off' ? donors[model] : null;
      if (!donor) continue;
      donor.updateMatrixWorld(true);
      // A jacket or jumper comes without the shirt front or collar under it: the base layer is the
      // shirt under it instead (a narrow front from another body never sits right over this one's).
      const lent = [];
      donor.traverse((o) => o.isSkinnedMesh && regionsOf(o.name).includes(region) && lent.push(o));
      if (lent.some((o) => OUTER.test(pieceName(o.name))))
        lent.splice(
          0,
          lent.length,
          ...lent.filter((o) => !/Shirt|Collar/i.test(pieceName(o.name))),
        );
      // What this model wore there (hidden now): the girth the borrowed pieces are fitted to.
      const own = meshes.filter((m) => regionsOf(m.name).includes(region) && !isTrim(m.name)),
        bodies = meshes.filter((m) => SKIN.test(m.name));
      const color =
        region === 'top' ? outfit.top : region === 'bottom' ? outfit.bottom : outfit.shoes;
      for (const piece of lent) {
        const geometry = this.once(
          `borrow|${file}|${donor.uuid}|${piece.name}|${base.sleeves}|${base.legs}|${hide.join(',')}`,
          () => {
            const fitted = borrowGeometry(piece, { donor, lent, root, own, bodies });
            // Clear of the base layer and the body under it everywhere, wherever the fit is tight.
            if (fitted)
              clear(fitted, [
                ...beneath[region],
                ...bodies.map((m) => ({ geometry: m.geometry, world: m.matrixWorld })),
              ]);
            return fitted;
          },
        );
        if (!geometry) continue;
        skeleton ??= new THREE.Skeleton(mainBones(root));
        for (const m of [].concat(piece.material))
          if (!m.userData.keepColour) m.color.set(0xffffff);
        const material = color
          ? this.once(
              `recolour|${donor.uuid}|${piece.name}|${color}|${(region === 'top' && outfit.stripes) || ''}`,
              () => recolour(piece, color, region === 'top' && outfit.stripes),
            )
          : piece.material;
        const mesh = new THREE.SkinnedMesh(geometry, material);
        mesh.frustumCulled = false;
        mesh.castShadow = this.shadows;
        root.add(mesh);
        mesh.bind(skeleton, root.matrixWorld);
      }
    }
  }
  skinned(piece, geometry, material) {
    if (!geometry) return null;
    const mesh = new THREE.SkinnedMesh(geometry, material);
    mesh.frustumCulled = false;
    mesh.castShadow = this.shadows;
    piece.add(mesh);
    mesh.bind(piece.skeleton, piece.bindMatrix);
    return mesh;
  }

  cloth(color, piece, behind = false) {
    const normalMap = piece.material?.normalMap || null;
    return this.once(
      `cloth|${color}|${normalMap?.uuid || ''}|${behind}`,
      () =>
        new THREE.MeshStandardMaterial({
          color,
          roughness: 0.88,
          normalMap,
          normalScale: new THREE.Vector2(0.7, 0.7),
          side: THREE.DoubleSide,
          polygonOffset: behind,
          polygonOffsetFactor: behind ? 2 : 0,
          polygonOffsetUnits: behind ? 6 : 0,
        }),
    );
  }
  skin(color) {
    return this.once(
      `skin|${color}`,
      () => new THREE.MeshStandardMaterial({ color, roughness: 0.62, side: THREE.DoubleSide }),
    );
  }
  dispose() {
    for (const value of this.cache.values()) {
      if (value?.dispose) value.dispose();
      else if (value?.fabric) {
        value.fabric?.dispose();
        value.bare?.dispose();
      }
    }
    this.cache.clear();
  }
}

// The joints the base layer is cut and fitted by, in the model's space at rest: each side's
// shoulder, elbow and wrist, hip, knee and ankle, and the body's middle.
export function measureJoints(root) {
  const at = (name) =>
    root.getObjectByName('mixamorig' + name)?.getWorldPosition(new THREE.Vector3());
  const side = (s) => ({
    arm: at(s + 'Arm'),
    elbow: at(s + 'ForeArm'),
    wrist: at(s + 'Hand'),
    hip: at(s + 'UpLeg'),
    knee: at(s + 'Leg'),
    ankle: at(s + 'Foot'),
    toe: at(s + 'ToeBase'),
  });
  const neck = at('Neck'),
    hips = at('Hips');
  return { Left: side('Left'), Right: side('Right'), centreX: neck?.x ?? hips?.x ?? 0, hips };
}

// The side of the body a point is on: Mixamo's characters face +z, so their left is +x.
const sideOf = (p, joints) => (p.x >= joints.centreX ? joints.Left : joints.Right);
const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
// The base layer made from a piece taken off: { fabric, bare } geometries in the piece's own
// space, skinned like it. kind: 'top' | 'bottom' | 'full' (both) | 'socks' (under borrowed shoes).
// Each point gets a value along its limb: past the hem (sleeves' or legs' length from the base
// layer) is skin. Faces across the hem are cut along it, so the hem is a clean line.
export function fillGeometry(
  piece,
  kind,
  base,
  joints,
  { skins = [], depth = 0, cover = {} } = {},
) {
  const g = piece.geometry,
    { position, normal, skinIndex, skinWeight } = g.attributes,
    uv = g.attributes.uv,
    index = g.index,
    world = piece.matrixWorld,
    toLocal = world.clone().invert(),
    n = position.count;
  // Sleeveless: cloth where the chest, back and neck move the piece (as a dress's top is made, see
  // three-outfits.js), skin from the shoulders out.
  const vest = (kind === 'top' || kind === 'full') && base.sleeves === 'vest',
    torso = new Uint8Array(n);
  if (vest) eachVertex(piece, (i, bone) => (torso[i] = /Spine|Hips|Neck/.test(bone) ? 1 : 0));
  const P = [],
    s = new Float32Array(n),
    limb = [],
    // Where each limb's hem is, along it from its first joint.
    hems = new Map();
  for (let i = 0; i < n; i++) {
    const p = new THREE.Vector3().fromBufferAttribute(position, i).applyMatrix4(world);
    P.push(p);
    s[i] = -1;
    limb.push(null);
    if (kind === 'socks') continue;
    const side = sideOf(p, joints);
    // Arms: along the upper arm from the shoulder joint.
    if ((kind === 'top' || kind === 'full') && side.arm && side.elbow && side.wrist) {
      const u = side.elbow.clone().sub(side.arm).normalize(),
        along = p.clone().sub(side.arm).dot(u),
        upper = side.elbow.distanceTo(side.arm),
        toWrist = side.wrist.clone().sub(side.arm).dot(u),
        // Cloth as far as the sleeves chosen, or under borrowed sleeves to just inside their end.
        hem = Math.max(
          vest ? 0 : base.sleeves === 'long' ? toWrist - 0.015 : upper * 0.42,
          cover.arm ? Math.min(toWrist - 0.015, cover.arm * toWrist - 0.03) : -Infinity,
        );
      if (vest && !cover.arm) s[i] = torso[i] ? -1 : 1;
      // Only points out along the arm (not the chest below the armpit) are on it.
      if (along > -0.04 || (vest && !torso[i])) {
        if (!(vest && !cover.arm)) s[i] = along - hem;
        side.armChain ??= [
          side.arm,
          side.elbow,
          side.wrist,
          side.wrist.clone().addScaledVector(u, 0.1),
        ];
        limb[i] = { chain: side.armChain, along };
        hems.set(side.armChain, hem);
      }
    }
    // Legs: down the thigh from the hip joint (a one-piece outfit keeps its own skirt).
    if (kind === 'bottom' && side.hip && side.knee && side.ankle) {
      const u = side.knee.clone().sub(side.hip).normalize(),
        along = p.clone().sub(side.hip).dot(u),
        thigh = side.knee.distanceTo(side.hip),
        toAnkle = side.ankle.clone().sub(side.hip).dot(u),
        hem = Math.max(
          base.legs === 'long'
            ? toAnkle - 0.03
            : base.legs === 'knee'
              ? thigh + 0.05
              : thigh * 0.45,
          cover.leg ? Math.min(toAnkle - 0.03, cover.leg * toAnkle - 0.04) : -Infinity,
        );
      if (along > 0) {
        s[i] = along - hem;
        side.legChain ??= [side.hip, side.knee, side.ankle];
        limb[i] = { chain: side.legChain, along };
        hems.set(side.legChain, hem);
      }
    }
  }
  // The body's own skin on each limb: how far out it is round the limb at each point along it, and
  // where on its texture, so skin made here meets the body's where the clothes ended.
  const profiles = new Map(),
    profileOf = (chain) => {
      if (!profiles.has(chain)) profiles.set(chain, limbProfile(chain, skins));
      return profiles.get(chain);
    };
  // Where each point goes: cloth a little in (fitted, under whatever is worn over it); on a limb,
  // cloth drawn in slightly and skin to the limb's own size, from the body where it has skin
  // there, else from the clothes' shape.
  // The outermost layer keeps the piece's own surface (the body's unfinished bits sit just under
  // it); each layer under it a little further in.
  const inward = 0.003 * depth;
  const place = (p, normalLocal, i, bare) => {
    const out = p.clone(),
      on = limb[i];
    if (kind === 'socks') return { at: out.addScaledVector(normalLocal, -0.006) };
    // A sleeveless top's shoulders: skin in the shape the shirt had there, a touch in.
    if (bare && vest && on && on.along < 0.03)
      return { at: out.addScaledVector(normalLocal, -0.003) };
    if (on) {
      const { point: c, length: a, frame } = onChain(p, on.chain),
        d = out.clone().sub(c),
        r = d.length();
      if (bare) {
        const profile = profileOf(on.chain),
          hit = profile && profile.at(a, d, frame);
        if (hit) return { at: c.addScaledVector(d, hit.radius / Math.max(r, 1e-6)) };
        const f = 0.92 - 0.2 * smooth(0, 0.05, Math.max(0, s[i]));
        return { at: c.addScaledVector(d, Math.max(f, 0.018 / Math.max(r, 1e-6))) };
      }
      return { at: c.addScaledVector(d, 1 - inward / Math.max(r, 0.02)) };
    }
    return { at: out.addScaledVector(normalLocal, -inward) };
  };
  const turn = new THREE.Matrix3().getNormalMatrix(world);
  const fabric = new Builder(),
    bare = new Builder();
  // How far along each limb the piece reaches: past that, the body's skin shows as it is.
  const reach = new Map();
  for (let i = 0; i < n; i++)
    if (limb[i]) {
      const { length } = onChain(P[i], limb[i].chain);
      reach.set(limb[i].chain, Math.max(reach.get(limb[i].chain) ?? 0, length));
    }
  // Each arm's skin from the new hem to where the real arm shows: made afresh as a smooth limb
  // (see armSkin) rather than from the sleeve, whose folds and cuffs would show.
  const arms = new Map();
  for (const [chain, hem] of hems) {
    if (kind !== 'top' && kind !== 'full') continue;
    const end = reach.get(chain) ?? hem,
      profile = profileOf(chain),
      wristAt = chain[0].distanceTo(chain[1]) + chain[1].distanceTo(chain[2]),
      // The real arm's outline where the sleeve ended (not the hand, past a long sleeve).
      outline = end < wristAt - 0.03 ? profile?.ring(end) : null;
    if (!profile || end - hem < 0.01) continue;
    // The sleeve's size at the hem, round each sector: the skin starts there, under the hem.
    const at = new Array(SECTORS).fill(0).map(() => []);
    for (let i = 0; i < n; i++)
      if (limb[i]?.chain === chain && Math.abs(s[i]) < 0.012) {
        const { point, frame } = onChain(P[i], chain),
          d = P[i].clone().sub(point);
        // The sleeve round the arm, not the chest or back beside the shoulder.
        if (d.length() < 0.1) at[sectorOf(d, frame)].push(d.length());
      }
    const sleeve = at.map((list) =>
      list.length ? list.sort((x, y) => x - y)[Math.floor(list.length / 2)] : null,
    );
    const bones = armBones(piece, chain === joints.Left.armChain ? 'Left' : 'Right');
    if (bones) arms.set(chain, { from: hem, to: end, outline, sleeve, bones, profile });
  }
  // A vertex for one side of the hem: an original point, or a point on an edge cut by the hem.
  const vertex = (a, b, t, out) => {
    const p = P[a].clone().lerp(P[b], t),
      nrm = new THREE.Vector3()
        .fromBufferAttribute(normal, a)
        .lerp(new THREE.Vector3().fromBufferAttribute(normal, b), t)
        .applyMatrix3(turn)
        .normalize(),
      sAt = s[a] + (s[b] - s[a]) * t,
      i = t < 0.5 ? a : b;
    const saved = s[i];
    s[i] = sAt;
    const placed = place(p, nrm, i, out === bare);
    s[i] = saved;
    out.push(
      placed.at.applyMatrix4(toLocal),
      new THREE.Vector3()
        .fromBufferAttribute(normal, a)
        .lerp(new THREE.Vector3().fromBufferAttribute(normal, b), t)
        .normalize(),
      uv
        ? [uv.getX(a) + (uv.getX(b) - uv.getX(a)) * t, uv.getY(a) + (uv.getY(b) - uv.getY(a)) * t]
        : [0, 0],
      blendWeights(skinIndex, skinWeight, a, b, t),
    );
  };
  const count = index ? index.count : n;
  for (let f = 0; f < count; f += 3) {
    const v = [0, 1, 2].map((k) => (index ? index.getX(f + k) : f + k)),
      out = v.map((i) => s[i] > 0);
    // An arm with skin made afresh takes none from the sleeve (but a sleeveless top keeps its
    // shoulders, as skin).
    const skinTo = (i) =>
      arms.has(limb[i]?.chain) && !(vest && limb[i].along < 0.03) ? null : bare;
    if (out.every((x) => !x) || out.every(Boolean)) {
      // Skin only where the piece faced out: a turned-in cuff or hem would show inside the limb.
      if (
        out[0] &&
        (v.some((i) => !skinTo(i)) ||
          (!vest &&
            facesIn(
              v.map((i) => P[i]),
              limb[v[0]].chain,
            )))
      )
        continue;
      const target = out[0] ? bare : fabric;
      for (const i of v) vertex(i, i, 0, target);
      continue;
    }
    // Cut the face along the hem: the lone corner on one side makes a triangle, the other two a
    // quad (two triangles).
    const lone = out.filter(Boolean).length === 1 ? out.indexOf(true) : out.indexOf(false),
      a = v[lone],
      b = v[(lone + 1) % 3],
      c = v[(lone + 2) % 3],
      tab = s[a] / (s[a] - s[b]),
      tac = s[a] / (s[a] - s[c]),
      skin = skinTo(a),
      loneSide = out[lone] ? skin : fabric,
      otherSide = out[lone] ? fabric : skin;
    if (loneSide) {
      vertex(a, a, 0, loneSide);
      vertex(a, b, tab, loneSide);
      vertex(a, c, tac, loneSide);
    }
    if (otherSide) {
      vertex(a, b, tab, otherSide);
      vertex(b, b, 0, otherSide);
      vertex(c, c, 0, otherSide);
      vertex(a, b, tab, otherSide);
      vertex(c, c, 0, otherSide);
      vertex(a, c, tac, otherSide);
    }
  }
  [...arms].forEach(([chain, arm], index) => armSkin(bare, chain, { ...arm, index }, toLocal));
  // The skin's colour comes from the body's skin that shows past the clothes on these limbs.
  const shown = [...profiles].filter(([, p]) => p),
    uvs = shown.flatMap(([chain, p]) =>
      p.showing(
        reach.get(chain) ?? 0,
        chain[0].distanceTo(chain[1]) + chain[1].distanceTo(chain[2]) - 0.02,
      ),
    );
  // On each limb, the stretch between the new hem and the piece's end is now skin made here: the
  // body's own unfinished skin under it can go (see trimGeometry).
  // An arm made afresh reaches a little past where the sleeve ended, so the body's skin can go
  // there too.
  const covered = [...hems].map(([chain, hem]) => ({
    chain,
    from: hem,
    to: (reach.get(chain) ?? hem) + (arms.has(chain) ? 0.016 : -0.008),
  }));
  // Where on the texture each arm's skin shows just past its sleeve, slice by slice round it.
  const armList = [...arms.values()],
    junctions = armList.length
      ? {
          piece: armList[0].profile.piece,
          chains: armList.map((arm) => arm.profile.junction(arm.to)),
        }
      : null;
  return {
    fabric: fabric.build(),
    bare: bare.build(),
    skinFrom: shown.length && uvs.length ? { piece: shown[0][1].piece, uvs } : null,
    covered,
    junctions,
  };
}

// The bones of one arm in the piece's skeleton: { upper, fore, hand } indices, or null.
function armBones(piece, side) {
  const find = (name) =>
    piece.skeleton.bones.findIndex((b) => primary(b.name) === 'mixamorig' + side + name);
  const bones = { upper: find('Arm'), fore: find('ForeArm'), hand: find('Hand') };
  return bones.upper >= 0 && bones.fore >= 0 ? bones : null;
}
// Skin round an arm from `from` to `to` along its chain (and a little past each end, under the hem
// and under the real arm's skin): rings 1 cm apart, each the shape of the real arm where the sleeve
// ended, fuller towards the shoulder, flaring at the start to meet the hem. Bound to the upper arm,
// the forearm and the hand, blended across the elbow and the wrist.
function armSkin(builder, chain, { from, to, outline, sleeve, bones, profile, index }, toLocal) {
  const start = from - 0.012,
    end = to + 0.028,
    rings = Math.max(2, Math.ceil((end - start) / 0.01)),
    AROUND = 24,
    elbow = chain[0].distanceTo(chain[1]),
    wrist = elbow + chain[1].distanceTo(chain[2]);
  // The point and frame on the chain at a length along it (before the first joint, straight on
  // back from it: a sleeveless cut starts inside the shoulder).
  const pointAt = (length) => {
    if (length < 0) {
      const back = chain[0]
          .clone()
          .addScaledVector(chain[1].clone().sub(chain[0]).normalize(), length),
        { frame } = onChain(chain[0].clone().lerp(chain[1], 0.05), chain);
      return { point: back, length, frame };
    }
    let left = length;
    for (let i = 0; i + 1 < chain.length; i++) {
      const span = chain[i].distanceTo(chain[i + 1]);
      if (left <= span || i + 2 === chain.length)
        return onChain(
          chain[i].clone().lerp(chain[i + 1], Math.min(1, Math.max(0, left / span))),
          chain,
        );
      left -= span;
    }
    return onChain(chain[0], chain);
  };
  const around = (radii, k) => {
    // Smoothly between the sectors' radii.
    const x = (k / AROUND) * SECTORS - 0.5,
      i = Math.floor(x),
      f = x - i,
      a = radii[(i + SECTORS) % SECTORS],
      b = radii[(i + 1 + SECTORS) % SECTORS];
    return a + (b - a) * f;
  };
  const meanSleeve = (() => {
    const known = sleeve.filter((r) => r != null);
    return known.length ? known.reduce((t, r) => t + r, 0) / known.length : null;
  })();
  const weights = (length) => {
    const blend = (x, a, b) => Math.min(1, Math.max(0, (x - a) / (b - a)));
    if (length < elbow + 0.04) {
      const t = blend(length, elbow - 0.04, elbow + 0.04);
      return [
        [bones.upper, 1 - t],
        [bones.fore, t],
        [0, 0],
        [0, 0],
      ];
    }
    const t = bones.hand >= 0 ? blend(length, wrist - 0.03, wrist + 0.02) : 0;
    return [
      [bones.fore, 1 - t],
      [Math.max(0, bones.hand), t],
      [0, 0],
      [0, 0],
    ];
  };
  // Each ring's outline: the body's arm there, else the nearest ring that has one; towards the end,
  // the real arm's outline where the sleeve ended, so the two meet.
  const lengths = [];
  for (let j = 0; j <= rings; j++) lengths.push(start + ((end - start) * j) / rings);
  let shapes = lengths.map((length) => profile.ringAt(length));
  for (let j = 0; j <= rings; j++)
    if (!shapes[j]) {
      let nearest = null;
      for (let k = 1; k <= rings && !nearest; k++) nearest = shapes[j - k] || shapes[j + k] || null;
      shapes[j] = nearest || outline;
    }
  if (shapes.some((x) => !x)) return;
  // Smoothed along the arm too.
  shapes = shapes.map((shape, j) =>
    shape.map((r, k) => {
      let sum = 0,
        weight = 0;
      for (let dj = -2; dj <= 2; dj++) {
        const other = shapes[j + dj];
        if (!other) continue;
        sum += other[k] * (3 - Math.abs(dj));
        weight += 3 - Math.abs(dj);
      }
      return sum / weight;
    }),
  );
  const grid = [];
  for (let j = 0; j <= rings; j++) {
    const length = lengths[j],
      { point, frame } = pointAt(length),
      // Past the end a touch smaller, under the real arm's skin, which it meets.
      meet = outline ? smooth(to - 0.04, to, length) : 0,
      shape = shapes[j].map(
        (r, k) => (r + ((outline?.[k] ?? r) - r) * meet) * (length > to ? 0.97 : 1),
      ),
      flare = smooth(0.03, 0, length - from),
      row = [];
    for (let k = 0; k < AROUND; k++) {
      const angle = -Math.PI + ((k + 0.5) / AROUND) * 2 * Math.PI,
        sector = Math.floor((k / AROUND) * SECTORS),
        base = around(shape, k),
        hem = Math.min((sleeve[sector] ?? meanSleeve ?? base) * 0.97, base * 1.5),
        radius = base + Math.max(0, hem - base) * flare,
        d = frame.across
          .clone()
          .multiplyScalar(Math.cos(angle))
          .addScaledVector(frame.third, Math.sin(angle));
      // Which slice round the arm (and which arm), for its paint (see paintSkin).
      row.push({
        p: point.clone().addScaledVector(d, radius),
        n: d,
        slice: index * SECTORS + sector,
      });
    }
    grid.push({ row, w: weights(length) });
  }
  const local = (v) => v.clone().applyMatrix4(toLocal),
    turn = new THREE.Matrix3().getNormalMatrix(toLocal);
  const face = (corners) => {
    // Facing out from the arm.
    const [x, y, z] = corners.map(([c]) => c.p),
      facing = new THREE.Vector3().crossVectors(y.clone().sub(x), z.clone().sub(x));
    if (facing.dot(corners[0][0].n) < 0) corners.reverse();
    for (const [corner, ring] of corners)
      builder.push(
        local(corner.p),
        corner.n.clone().applyMatrix3(turn).normalize(),
        [-1 - corner.slice, 0],
        grid[ring].w,
      );
  };
  for (let j = 0; j < rings; j++)
    for (let k = 0; k < AROUND; k++) {
      const k1 = (k + 1) % AROUND,
        a = grid[j].row[k],
        b = grid[j].row[k1],
        c = grid[j + 1].row[k1],
        d = grid[j + 1].row[k];
      face([
        [a, j],
        [c, j + 1],
        [b, j],
      ]);
      face([
        [a, j],
        [d, j + 1],
        [c, j + 1],
      ]);
    }
}

// How far a model's clothes in a region reach down its limbs: { arm, leg }, each a share of the
// way from the shoulder to the wrist or the hip to the ankle.
function limbReach(scene, region) {
  scene.updateMatrixWorld(true);
  const joints = measureJoints(scene),
    reach = { arm: 0, leg: 0 };
  scene.traverse((o) => {
    if (!o.isSkinnedMesh || !regionsOf(o.name).includes(region) || isTrim(o.name)) return;
    const position = o.geometry.attributes.position;
    for (let i = 0; i < position.count; i++) {
      const p = new THREE.Vector3().fromBufferAttribute(position, i).applyMatrix4(o.matrixWorld),
        side = sideOf(p, joints);
      if (region === 'top' && side.arm && side.wrist) {
        const u = side.wrist.clone().sub(side.arm),
          length = u.length();
        reach.arm = Math.max(reach.arm, p.clone().sub(side.arm).dot(u.normalize()) / length);
      }
      if (region === 'bottom' && side.hip && side.ankle) {
        const u = side.ankle.clone().sub(side.hip),
          length = u.length();
        reach.leg = Math.max(reach.leg, p.clone().sub(side.hip).dot(u.normalize()) / length);
      }
    }
  });
  reach.arm = Math.min(1, reach.arm);
  reach.leg = Math.min(1, reach.leg);
  return reach;
}

// The skin of the neck, which every model shows: { piece, uvs } or null.
function neckSkin(skins) {
  let best = null;
  for (const mesh of skins) {
    const { uv, skinIndex, skinWeight } = mesh.geometry.attributes;
    if (!uv) continue;
    const uvs = [];
    for (let i = 0; i < uv.count; i++) {
      let top = 0;
      for (let k = 1; k < 4; k++)
        if (skinWeight.getComponent(i, k) > skinWeight.getComponent(i, top)) top = k;
      if (/Neck/.test(mesh.skeleton.bones[skinIndex.getComponent(i, top)]?.name || ''))
        uvs.push([uv.getX(i), uv.getY(i)]);
    }
    if (uvs.length > (best?.uvs.length || 0)) best = { piece: mesh.name, uvs };
  }
  return best && best.uvs.length >= 10 ? best : null;
}

// Whether a face turns in towards the limb it is on.
function facesIn([a, b, c], chain) {
  const middle = a.clone().add(b).add(c).divideScalar(3),
    facing = new THREE.Vector3().crossVectors(b.clone().sub(a), c.clone().sub(a)),
    { point } = onChain(middle, chain);
  return facing.dot(middle.sub(point)) < 0;
}

// The skin piece without its faces in the stretches now covered by skin made from clothes taken
// off: under clothes the body is left unfinished, and those bits would show through.
export function trimGeometry(mesh, covered) {
  const g = mesh.geometry,
    { position } = g.attributes,
    n = position.count,
    hidden = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const p = new THREE.Vector3().fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld);
    for (const { chain, from, to } of covered) {
      if (to - from < 0.01) continue;
      const { point, length } = onChain(p, chain);
      if (length > from + 0.004 && length < to && point.distanceTo(p) < 0.085) {
        hidden[i] = 1;
        break;
      }
    }
  }
  const index = g.index ? g.index.array : [...Array(n).keys()],
    kept = [];
  for (let f = 0; f < index.length; f += 3)
    if (!(hidden[index[f]] && hidden[index[f + 1]] && hidden[index[f + 2]]))
      kept.push(index[f], index[f + 1], index[f + 2]);
  if (kept.length === index.length) return g;
  const trimmed = new THREE.BufferGeometry();
  for (const [name, attribute] of Object.entries(g.attributes))
    trimmed.setAttribute(name, attribute);
  trimmed.setIndex(kept);
  trimmed.boundingSphere = g.boundingSphere;
  return trimmed;
}

// The nearest point to p on a chain of joints, how far along the chain it is, and a frame round
// the chain there (for the angle round the limb).
function onChain(p, chain) {
  let best = null;
  let length = 0;
  for (let i = 0; i + 1 < chain.length; i++) {
    const a = chain[i],
      ab = chain[i + 1].clone().sub(a),
      span = ab.length(),
      t = Math.min(1, Math.max(0, p.clone().sub(a).dot(ab) / ab.lengthSq())),
      c = a.clone().addScaledVector(ab, t),
      d = c.distanceTo(p);
    if (!best || d < best.distance)
      best = { point: c, length: length + t * span, distance: d, axis: ab.clone().normalize() };
    length += span;
  }
  // Round the limb: one direction across it, and another at right angles to both.
  const axis = best.axis,
    across = Math.abs(axis.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(0, 0, 1);
  across.addScaledVector(axis, -across.dot(axis)).normalize();
  const third = new THREE.Vector3().crossVectors(axis, across);
  return { point: best.point, length: best.length, frame: { across, third } };
}
const SECTORS = 12,
  BIN = 0.015;
const sectorOf = (d, frame) =>
  Math.floor(
    ((Math.atan2(d.dot(frame.third), d.dot(frame.across)) + Math.PI) / (2 * Math.PI)) * SECTORS,
  ) % SECTORS;
// The body's skin round one limb: for each step along it (1.5 cm) and each twelfth of the way
// round it, how far out the skin is and where on its texture, from the skin piece with the most
// skin on this limb. at(length, direction, frame) gives the nearest measured skin, or null.
function limbProfile(chain, skins) {
  let best = null;
  for (const mesh of skins) {
    const { position, uv } = mesh.geometry.attributes;
    if (!uv) continue;
    const cells = new Map();
    let found = 0;
    for (let i = 0; i < position.count; i++) {
      const p = new THREE.Vector3().fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld),
        { point, length, frame } = onChain(p, chain),
        d = p.clone().sub(point),
        r = d.length();
      // Skin of this limb: close round it and past its first joint (not the chest or the hips).
      if (r > 0.08 || length < 0.03) continue;
      const key = Math.floor(length / BIN) * SECTORS + sectorOf(d, frame);
      if (!cells.has(key)) cells.set(key, []);
      cells.get(key).push({ r, u: uv.getX(i), v: uv.getY(i) });
      found++;
    }
    if (found > (best?.found || 0)) best = { found, cells, piece: mesh.name };
  }
  if (!best || best.found < 40) return null;
  // Each cell's skin, by its middle point (the body's own bits under the clothes are trimmed away
  // where skin is made here, see trimGeometry).
  const table = new Map();
  for (const [key, list] of best.cells) {
    list.sort((a, b) => a.r - b.r);
    const cell = list[Math.floor(list.length / 2)];
    table.set(key, { ...cell, r: cell.r + 0.0015 });
  }
  const bins = [...new Set([...table.keys()].map((k) => Math.floor(k / SECTORS)))];
  return {
    piece: best.piece,
    // The limb's outline just past `from` (where the clothes ended): the radius in each sector, or
    // null where nothing was measured.
    ring(from) {
      const radii = [];
      for (let sector = 0; sector < SECTORS; sector++) {
        const found = [];
        for (const [key, list] of best.cells) {
          const at = Math.floor(key / SECTORS) * BIN;
          if (key % SECTORS === sector && at > from + 0.005 && at < from + 0.05)
            for (const c of list) found.push(c.r);
        }
        found.sort((a, b) => a - b);
        radii.push(found.length ? found[Math.floor(found.length / 2)] : null);
      }
      const known = radii.filter((r) => r != null);
      if (known.length < SECTORS / 2) return null;
      const mean = known.reduce((t, r) => t + r, 0) / known.length;
      return radii.map((r) => r ?? mean);
    },
    // The limb's outline at a length along it, from the body's skin there (shown or under the
    // clothes), smoothed round the limb: the radius in each sector, or null.
    ringAt(length) {
      const radii = [];
      for (let sector = 0; sector < SECTORS; sector++) {
        const found = [];
        for (const db of [-1, 0, 1]) {
          const cell = table.get((Math.floor(length / BIN) + db) * SECTORS + sector);
          if (cell) found.push(cell.r);
        }
        radii.push(found.length ? found.reduce((t, r) => t + r, 0) / found.length : null);
      }
      const known = radii.filter((r) => r != null);
      if (known.length < SECTORS / 2) return null;
      const mean = known.reduce((t, r) => t + r, 0) / known.length,
        filled = radii.map((r) => r ?? mean);
      // Round the limb, each sector with its neighbours, and never far from the mean.
      return filled.map((r, k) => {
        const near = (filled[(k + SECTORS - 1) % SECTORS] + 2 * r + filled[(k + 1) % SECTORS]) / 4;
        return Math.min(mean * 1.2, Math.max(mean * 0.82, near));
      });
    },
    // Where on the texture the skin is just past `from`, for each sector round the limb.
    junction(from) {
      const sectors = Array.from({ length: SECTORS }, () => []);
      for (const [key, list] of best.cells) {
        const at = Math.floor(key / SECTORS) * BIN;
        if (at > from + 0.005 && at < from + 0.06)
          for (const c of list) sectors[key % SECTORS].push([c.u, c.v]);
      }
      return sectors;
    },
    // Where on the texture the skin is that clothes ending `from` along the limb leave showing,
    // up to `until` (the wrist or the ankle: hands and feet are painted differently).
    showing(from, until = Infinity) {
      const uvs = [];
      for (const [key, list] of best.cells) {
        const at = Math.floor(key / SECTORS) * BIN;
        if (at > from + 0.01 && at < until) for (const c of list) uvs.push([c.u, c.v]);
      }
      return uvs;
    },
    at(length, d, frame) {
      const sector = sectorOf(d, frame),
        want = Math.floor(length / BIN),
        order = [...bins].sort((a, b) => Math.abs(a - want) - Math.abs(b - want));
      // The nearest step along the limb with skin in this sector, else the nearest sector of the
      // nearest steps.
      for (const bin of order.slice(0, 8)) {
        const cell = table.get(bin * SECTORS + sector);
        if (cell) return { radius: cell.r, uv: [cell.u, cell.v] };
      }
      for (const bin of order.slice(0, 3))
        for (let k = 1; k <= SECTORS / 2; k++)
          for (const s of [sector + k, sector - k]) {
            const cell = table.get(bin * SECTORS + ((s + SECTORS) % SECTORS));
            if (cell) return { radius: cell.r, uv: [cell.u, cell.v] };
          }
      return null;
    },
  };
}

// Skin weights part way along an edge: both ends' bones, weighted by where, the strongest four.
function blendWeights(skinIndex, skinWeight, a, b, t) {
  const sum = new Map();
  for (const [i, w] of [
    [a, 1 - t],
    [b, t],
  ]) {
    if (w <= 0) continue;
    for (let k = 0; k < 4; k++) {
      const bone = skinIndex.getComponent(i, k),
        weight = skinWeight.getComponent(i, k) * w;
      if (weight > 0) sum.set(bone, (sum.get(bone) || 0) + weight);
    }
  }
  const top = [...sum].sort((x, y) => y[1] - x[1]).slice(0, 4),
    total = top.reduce((t, [, w]) => t + w, 0) || 1;
  while (top.length < 4) top.push([0, 0]);
  return top.map(([bone, w]) => [bone, w / total]);
}

// Gathers triangles' corners into a skinned geometry.
class Builder {
  constructor() {
    this.position = [];
    this.normal = [];
    this.uv = [];
    this.skinIndex = [];
    this.skinWeight = [];
  }
  push(p, n, uv, weights) {
    this.position.push(p.x, p.y, p.z);
    this.normal.push(n.x, n.y, n.z);
    this.uv.push(...uv);
    for (const [bone, w] of weights) {
      this.skinIndex.push(bone);
      this.skinWeight.push(w);
    }
  }
  build() {
    if (this.position.length < 9) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.position, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.normal, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(this.skinIndex, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(this.skinWeight, 4));
    return g;
  }
}

// Pushes `geometry` (a garment, in the model's space at rest) out along its own facing to at least
// `room` outside every surface in `under` ({ geometry, world }) right beneath it, so nothing under
// it shows through, ridges and seams included. The push is worked out once per point of the
// surface (corners shared by several faces move together), then spread a little and smoothed over
// the surface, so the garment moves out as cloth would rather than tearing.
export function clear(geometry, under, room = 0.007) {
  const CELL = 0.03,
    cells = new Map(),
    key = (x, y, z) => `${x},${y},${z}`,
    cellOf = (v) => [Math.floor(v.x / CELL), Math.floor(v.y / CELL), Math.floor(v.z / CELL)];
  for (const { geometry: g, world } of under) {
    const { position, normal } = g.attributes,
      turn = new THREE.Matrix3().getNormalMatrix(world);
    if (!normal) continue;
    for (let i = 0; i < position.count; i++) {
      const p = new THREE.Vector3().fromBufferAttribute(position, i).applyMatrix4(world),
        n = new THREE.Vector3().fromBufferAttribute(normal, i).applyMatrix3(turn).normalize(),
        k = key(...cellOf(p));
      if (!cells.has(k)) cells.set(k, []);
      cells.get(k).push(p, n);
    }
  }
  const { position, normal } = geometry.attributes,
    count = position.count;
  // The surface's points: corners at the same place are one point, facing their average way.
  const ids = new Int32Array(count),
    byPlace = new Map(),
    points = [],
    facing = [];
  for (let i = 0; i < count; i++) {
    const p = new THREE.Vector3().fromBufferAttribute(position, i),
      k = `${Math.round(p.x * 1e5)},${Math.round(p.y * 1e5)},${Math.round(p.z * 1e5)}`;
    if (!byPlace.has(k)) {
      byPlace.set(k, points.length);
      points.push(p);
      facing.push(new THREE.Vector3());
    }
    ids[i] = byPlace.get(k);
    facing[ids[i]].add(new THREE.Vector3().fromBufferAttribute(normal, i));
  }
  for (const n of facing) n.normalize();
  const n = points.length,
    need = new Float32Array(n),
    d = new THREE.Vector3();
  for (let v = 0; v < n; v++) {
    const p = points[v],
      [cx, cy, cz] = cellOf(p);
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++)
        for (let dz = -1; dz <= 1; dz++) {
          const list = cells.get(key(cx + dx, cy + dy, cz + dz));
          if (!list) continue;
          for (let j = 0; j < list.length; j += 2) {
            const q = list[j],
              m = list[j + 1];
            d.subVectors(p, q);
            const out = d.dot(m);
            // Beneath: just under or just over it, and close across it. (Anything deeper is another
            // part of the body, and the base layer is drawn behind borrowed clothes anyway.)
            if (out > 0.02 || out < -0.012) continue;
            if (d.addScaledVector(m, -out).lengthSq() > 0.012 * 0.012) continue;
            // How far out along the garment's own facing to be `room` outside it.
            const push = (room - out) / Math.max(0.35, facing[v].dot(m));
            if (push > need[v]) need[v] = push;
          }
        }
  }
  // Neighbours across the faces.
  const near = Array.from({ length: n }, () => new Set());
  for (let i = 0; i + 2 < count; i += 3)
    for (const [a, b] of [
      [ids[i], ids[i + 1]],
      [ids[i + 1], ids[i + 2]],
      [ids[i + 2], ids[i]],
    ])
      if (a !== b) {
        near[a].add(b);
        near[b].add(a);
      }
  // Spread (so the cloth round a ridge lifts with it), then smooth, never below what is needed.
  let push = Float32Array.from(need);
  for (let pass = 0; pass < 1; pass++) {
    const next = Float32Array.from(push);
    for (let v = 0; v < n; v++) for (const w of near[v]) next[v] = Math.max(next[v], push[w] * 0.7);
    push = next;
  }
  for (let pass = 0; pass < 3; pass++) {
    const next = new Float32Array(n);
    for (let v = 0; v < n; v++) {
      let sum = push[v],
        k = 1;
      for (const w of near[v]) {
        sum += push[w];
        k++;
      }
      next[v] = Math.max(need[v], sum / k);
    }
    push = next;
  }
  for (let i = 0; i < count; i++) {
    const v = ids[i];
    if (push[v] <= 0) continue;
    const p = points[v].clone().addScaledVector(facing[v], Math.min(push[v], 0.012));
    position.setXYZ(i, p.x, p.y, p.z);
  }
  position.needsUpdate = true;
}

// A model's own bones, each once (not the copies its pieces carry), in a fixed order: what borrowed
// pieces are bound to.
export function mainBones(root) {
  const bones = [];
  root.traverse((o) => o.isBone && primary(o.name) === o.name && bones.push(o));
  return bones;
}

// A piece of another model (`donor`, its loaded scene at rest), refitted to `root`'s skeleton, in
// root's space, skinned to mainBones(root). own: root's pieces it replaces (their girth is what it
// is fitted to); bodies: root's skin pieces, for girth where root wore nothing. Null if it uses a
// bone root has nowhere near.
export function borrowGeometry(piece, { donor, lent, root, own, bodies }) {
  const g = piece.geometry,
    { position, normal, skinIndex, skinWeight } = g.attributes,
    uv = g.attributes.uv,
    index = g.index;
  const bonesOf = (scene) => {
    const map = new Map();
    scene.traverse((o) => o.isBone && !map.has(primary(o.name)) && map.set(primary(o.name), o));
    return map;
  };
  const donorBones = bonesOf(donor),
    targetBones = bonesOf(root),
    hostIndex = new Map(mainBones(root).map((b, i) => [b.name, i]));
  // A bone root has, or the nearest ancestor that it has.
  const usable = (name) => {
    let bone = donorBones.get(name);
    while (bone && !hostIndex.has(primary(bone.name)))
      bone = bone.parent?.isBone ? bone.parent : null;
    return bone ? primary(bone.name) : null;
  };
  const inverse = new Map(),
    world = (bones, name) => bones.get(name).matrixWorld,
    inv = (name) => {
      if (!inverse.has(name)) inverse.set(name, world(donorBones, name).clone().invert());
      return inverse.get(name);
    };
  // Girth: how far out from each bone the clothes reach on each side of it (either way across, x,
  // and either way front to back, z, in the bone's own frame), on root (what it wore there, else
  // its skin plus room for cloth) and in the borrowed pieces. Each borrowed point is moved out or
  // in from its bone by the ratio on its side, so a jacket cut for a flat chest is let out at the
  // front for a fuller one.
  const spread = (meshes, bones, name, pad = 0) => {
    const m = bones.get(name)?.matrixWorld;
    if (!m) return null;
    const back = m.clone().invert(),
      boneScale = m.getMaxScaleOnAxis(),
      sides = { px: [], nx: [], pz: [], nz: [] };
    let k = 0;
    for (const mesh of meshes) {
      const pos = mesh.geometry.attributes.position,
        si = mesh.geometry.attributes.skinIndex,
        sw = mesh.geometry.attributes.skinWeight;
      for (let i = 0; i < pos.count; i++) {
        let best = 0;
        for (let j = 1; j < 4; j++) if (sw.getComponent(i, j) > sw.getComponent(i, best)) best = j;
        if (primary(mesh.skeleton.bones[si.getComponent(i, best)]?.name || '') !== name) continue;
        const p = new THREE.Vector3()
          .fromBufferAttribute(pos, i)
          .applyMatrix4(mesh.matrixWorld)
          .applyMatrix4(back);
        (p.x >= 0 ? sides.px : sides.nx).push(Math.abs(p.x));
        (p.z >= 0 ? sides.pz : sides.nz).push(Math.abs(p.z));
        k++;
      }
    }
    if (k < 30) return null;
    const room = pad / boneScale,
      // How far out most of the points on a side are (the furthest few are folds and seams).
      far = (list) => {
        if (list.length < 8) return null;
        list.sort((a, b) => a - b);
        return list[Math.floor(list.length * 0.85)] + room;
      };
    return { px: far(sides.px), nx: far(sides.nx), pz: far(sides.pz), nz: far(sides.nz) };
  };
  const ratios = new Map(),
    ratio = (name) => {
      if (ratios.has(name)) return ratios.get(name);
      const from = spread(lent, donorBones, name),
        to = spread(own, targetBones, name) || spread(bodies, targetBones, name, 0.012);
      let r = null;
      if (from && to) {
        const side = (k) =>
            from[k] && to[k] ? Math.min(1.35, Math.max(0.85, to[k] / from[k])) : null,
          raw = { px: side('px'), nx: side('nx'), pz: side('pz'), nz: side('nz') },
          known = Object.values(raw).filter((v) => v != null);
        if (known.length) {
          const mean = known.reduce((t, v) => t + v, 0) / known.length;
          r = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, v ?? mean]));
          // Limbs stay round: the same all round.
          if (/Arm|Leg|Foot|Hand/.test(name)) r = { px: mean, nx: mean, pz: mean, nz: mean };
        }
      }
      // A bone with too few points to measure takes its parent's.
      if (!r) {
        const parent = donorBones.get(name)?.parent;
        r = parent?.isBone ? ratio(primary(parent.name)) : { px: 1, nx: 1, pz: 1, nz: 1 };
      }
      ratios.set(name, r);
      return r;
    };
  const toHost = root.matrixWorld.clone().invert(),
    turnHost = new THREE.Matrix3().getNormalMatrix(toHost),
    pieceWorld = piece.matrixWorld,
    pieceTurn = new THREE.Matrix3().getNormalMatrix(pieceWorld);
  const out = new Builder(),
    n = position.count,
    placed = [],
    normals = [],
    weights = [];
  for (let i = 0; i < n; i++) {
    const p = new THREE.Vector3().fromBufferAttribute(position, i).applyMatrix4(pieceWorld),
      nrm = new THREE.Vector3().fromBufferAttribute(normal, i).applyMatrix3(pieceTurn),
      sum = new THREE.Vector3(),
      nsum = new THREE.Vector3(),
      bones = new Map();
    let total = 0;
    for (let k = 0; k < 4; k++) {
      const w = skinWeight.getComponent(i, k);
      if (w <= 0) continue;
      const name = usable(primary(piece.skeleton.bones[skinIndex.getComponent(i, k)]?.name || ''));
      if (!name) continue;
      const local = p.clone().applyMatrix4(inv(name)),
        r = ratio(name);
      local.x *= local.x >= 0 ? r.px : r.nx;
      local.z *= local.z >= 0 ? r.pz : r.nz;
      sum.addScaledVector(local.applyMatrix4(world(targetBones, name)), w);
      // The normal turned as the bone is turned from one skeleton to the other.
      const turn = new THREE.Matrix4()
        .extractRotation(world(targetBones, name))
        .multiply(new THREE.Matrix4().extractRotation(inv(name)));
      nsum.addScaledVector(nrm.clone().applyMatrix4(turn), w);
      bones.set(hostIndex.get(name), (bones.get(hostIndex.get(name)) || 0) + w);
      total += w;
    }
    if (!total) return null;
    sum.divideScalar(total);
    nsum.normalize();
    // A little outside the base layer underneath.
    sum.addScaledVector(nsum, 0.005);
    placed.push(sum.applyMatrix4(toHost));
    normals.push(nsum.applyMatrix3(turnHost).normalize());
    const top = [...bones].sort((a, b) => b[1] - a[1]).slice(0, 4),
      t = top.reduce((s, [, w]) => s + w, 0);
    while (top.length < 4) top.push([0, 0]);
    weights.push(top.map(([bone, w]) => [bone, w / t]));
  }
  const count = index ? index.count : n;
  for (let f = 0; f < count; f++) {
    const i = index ? index.getX(f) : f;
    out.push(placed[i], normals[i], uv ? [uv.getX(i), uv.getY(i)] : [0, 0], weights[i]);
  }
  return out.build();
}

// A point of clear skin on `piece`'s texture among these places: skin-like there and all round it
// (so the texture's coarser levels, seen from afar, are skin too), of middling brightness. [u, v]
// or null.
const pixels = new WeakMap();
function clearSkin(piece, uvs, { loose = false } = {}) {
  const image = piece.material?.map?.image;
  if (typeof document === 'undefined' || !image || uvs.length < (loose ? 1 : 10)) return null;
  const size = 256;
  if (!pixels.has(image)) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(image, 0, 0, size, size);
    pixels.set(image, context.getImageData(0, 0, size, size).data);
  }
  const data = pixels.get(image),
    wrap = (x) => Math.min(size - 1, Math.max(0, Math.floor((x - Math.floor(x)) * size)));
  const texel = (x, y) => {
    const at = (Math.min(size - 1, Math.max(0, y)) * size + Math.min(size - 1, Math.max(0, x))) * 4,
      [r, g, b] = [0, 1, 2].map((k) => linear(data[at + k] / 255)),
      high = Math.max(r, g, b),
      saturation = (high - Math.min(r, g, b)) / Math.max(high, 0.001);
    return {
      r,
      g,
      b,
      skin: r > g && g >= b && saturation > 0.05 && saturation < 0.8,
      lum: LUMA[0] * r + LUMA[1] * g + LUMA[2] * b,
    };
  };
  const clear = [];
  for (const [u, v] of uvs) {
    const x = wrap(u),
      y = wrap(v),
      centre = texel(x, y);
    if (!centre.skin) continue;
    let ok = true,
      spread = 0;
    for (let dy = -4; dy <= 4 && ok; dy += 2)
      for (let dx = -4; dx <= 4 && ok; dx += 2) {
        const other = texel(x + dx, y + dy);
        if (!other.skin) ok = false;
        spread += Math.abs(other.lum - centre.lum);
      }
    if (ok) clear.push({ u, v, lum: centre.lum, spread });
  }
  if (loose && clear.length < 3) {
    // A few points only (one slice round an arm): the skin-like one of middling brightness.
    const skin = uvs
      .map(([u, v]) => ({ u, v, ...texel(wrap(u), wrap(v)) }))
      .filter((t) => t.skin)
      .sort((a, b) => a.lum - b.lum);
    const middle = skin[Math.floor(skin.length / 2)];
    return middle ? [middle.u, middle.v] : null;
  }
  if (clear.length < 3) return null;
  clear.sort((a, b) => a.lum - b.lum);
  if (loose) {
    const middle = clear[Math.floor(clear.length / 2)];
    return [middle.u, middle.v];
  }
  // Of the lighter ones (the texture's own shading darkens creases), the evenest.
  const middling = clear.slice(Math.floor(clear.length * 0.82), Math.ceil(clear.length * 0.97));
  middling.sort((a, b) => a.spread - b.spread);
  const best = middling[0] || clear[Math.floor(clear.length / 2)];
  return [best.u, best.v];
}

// Points the base layer's skin at the body's skin on its texture: an arm's slices (marked by their
// u, -1 - slice) at their own side's skin (`sides[arm][sector]`), everything else at `texel`. A
// face whose corners land far apart on the texture (across a seam) takes its first corner's.
function paintSkin(uv, texel, sides) {
  for (let i = 0; i < uv.count; i++) {
    const x = uv.getX(i);
    let at = texel;
    if (x < 0 && x > -1000) {
      const slice = Math.round(-1 - x);
      at = sides[Math.floor(slice / SECTORS)]?.[slice % SECTORS] || texel;
    }
    uv.setXY(i, at[0], at[1]);
  }
  for (let i = 0; i + 2 < uv.count; i += 3) {
    const u = uv.getX(i),
      v = uv.getY(i);
    for (const k of [1, 2])
      if (Math.abs(uv.getX(i + k) - u) > 0.06 || Math.abs(uv.getY(i + k) - v) > 0.06) {
        uv.setXY(i + 1, u, v);
        uv.setXY(i + 2, u, v);
        break;
      }
  }
  uv.needsUpdate = true;
}

// The colour of the model's skin: the average of the warm, skin-like texels its body and face are
// painted with, where the arms, legs and neck are. Null without a page to read textures in.
function skinOf(meshes) {
  if (typeof document === 'undefined') return null;
  const pieces = meshes.filter((m) => SKIN.test(m.name) && m.material?.map?.image);
  const sum = [0, 0, 0];
  let count = 0;
  for (const piece of pieces) {
    const size = 128,
      canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(piece.material.map.image, 0, 0, size, size);
    const data = context.getImageData(0, 0, size, size).data,
      uv = piece.geometry.attributes.uv,
      { skinIndex, skinWeight } = piece.geometry.attributes,
      wrap = (x) => Math.min(size - 1, Math.floor((x - Math.floor(x)) * size));
    for (let i = 0; i < uv.count; i++) {
      let best = 0;
      for (let k = 1; k < 4; k++)
        if (skinWeight.getComponent(i, k) > skinWeight.getComponent(i, best)) best = k;
      const bone = piece.skeleton.bones[skinIndex.getComponent(i, best)]?.name || '';
      if (!/ForeArm|Hand$|Hand_\d|Neck/.test(bone)) continue;
      const at = (wrap(uv.getY(i)) * size + wrap(uv.getX(i))) * 4,
        [r, g, b] = [0, 1, 2].map((k) => linear(data[at + k] / 255)),
        high = Math.max(r, g, b),
        saturation = (high - Math.min(r, g, b)) / Math.max(high, 0.001);
      if (!(r > g && g > b && saturation > 0.15 && saturation < 0.85)) continue;
      sum[0] += r;
      sum[1] += g;
      sum[2] += b;
      count++;
    }
  }
  if (count < 20) return null;
  return (
    '#' +
    new THREE.Color()
      .setRGB(sum[0] / count, sum[1] / count, sum[2] / count, THREE.LinearSRGBColorSpace)
      .getHexString()
  );
}
