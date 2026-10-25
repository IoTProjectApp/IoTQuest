import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from '../public/vendor/three.module.min.js';
import {
  MODEL_PIECES,
  REGIONS,
  regionsOf,
  isTrim,
  pieceName,
  describe,
  donorsFor,
  canChange,
  checkWardrobe,
  plan,
  baseOf,
  changes,
} from '../public/character-wardrobe.js';
import { Wardrobe, fillGeometry, measureJoints } from '../public/three-wardrobe.js';
import { settingsFor } from '../public/character-settings.js';
import { ThreeCharacters } from '../public/three-characters.js';
import { CharacterSession } from '../editor/workspaces/character-editor/session.js';
import { wardrobeSection } from '../editor/workspaces/character-editor/wardrobe-panel.js';

test('pieces are sorted into regions by their names; the body, hair and face are not clothes', () => {
  assert.deepEqual(regionsOf('Ch21_Shirt'), ['top']);
  assert.deepEqual(regionsOf('Ch23_Suit'), ['top']);
  assert.deepEqual(regionsOf('Ch42_Shorts'), ['bottom']);
  assert.deepEqual(regionsOf('Ch02_Cloth'), ['top', 'bottom']);
  assert.deepEqual(regionsOf('Ch26_Heels'), ['shoes']);
  assert.deepEqual(regionsOf('Ch38_Socks'), ['shoes']);
  for (const name of [
    'Ch21_Body',
    'Ch21_Hair',
    'Ch47_Face',
    'Ch08_Beard',
    'Ch21_Eyelasshes',
    'Ch16_Mask',
    'Ch16_Cap',
  ])
    assert.deepEqual(regionsOf(name), [], name);
  assert.equal(pieceName('Ch42__Eyelashes'), 'Eyelashes');
  assert.ok(isTrim('Ch23_Belt') && isTrim('Ch37_Zipper') && !isTrim('Ch23_Pants'));
  assert.equal(describe('Josh', 'top'), 'Suit and Shirt');
  assert.equal(canChange('Alex'), false);
  assert.equal(canChange('Kate'), true);
  // Heels go only to someone already in heels.
  assert.deepEqual(donorsFor('Elizabeth', 'shoes').sort(), ['Louise', 'Martha']);
  assert.ok(!donorsFor('Kate', 'shoes').includes('Louise'));
  assert.ok(!donorsFor('Kate', 'top').includes('Alex'));
});

test('a wardrobe is checked: regions, models that lend, shoes swapped not taken off, the base layer', () => {
  assert.deepEqual(checkWardrobe(undefined, 'Kate'), []);
  assert.deepEqual(
    checkWardrobe(
      {
        top: 'off',
        bottom: 'Shannon',
        shoes: 'Megan',
        base: { color: '#112233', sleeves: 'vest', legs: 'knee' },
      },
      'Kate',
    ),
    [],
  );
  const problems = checkWardrobe(
    {
      top: 'Nobody',
      bottom: 'Jennifer',
      shoes: 'off',
      hat: 'off',
      base: { color: 'red', sleeves: 'cap', legs: 'ankle' },
    },
    'Kate',
  );
  assert.equal(problems.length, 7, problems.join('\n'));
  assert.match(checkWardrobe({ top: 'off' }, 'James').join(' '), /one piece/);
  assert.deepEqual(baseOf({ base: { legs: 'long' } }).legs, 'long');
  assert.equal(baseOf({}).sleeves, 'tee');
});

test('no wardrobe can leave anyone undressed: every top or bottom taken off leaves the base layer', () => {
  const values = (model, region) => [
    undefined,
    ...(region === 'shoes' ? [] : ['off']),
    ...donorsFor(model, region),
  ];
  let combinations = 0;
  for (const [model, pieces] of Object.entries(MODEL_PIECES))
    for (const top of values(model, 'top'))
      for (const bottom of values(model, 'bottom'))
        for (const shoes of values(model, 'shoes')) {
          const wardrobe = { top, bottom, shoes },
            { hide, fill } = plan(pieces, wardrobe);
          combinations++;
          for (const name of hide) {
            // Only what the wardrobe changes is hidden.
            assert.ok(
              regionsOf(name).some((r) => wardrobe[r] != null),
              `${model}: ${name}`,
            );
            // Every hidden top or bottom (not a belt or zip on another piece) has its base layer.
            if (!isTrim(name))
              assert.ok(fill[name], `${model} ${JSON.stringify(wardrobe)}: ${name}`);
          }
          // Nothing is hidden unless asked; shoes only when others replace them.
          if (!changes(wardrobe)) assert.deepEqual(hide, []);
          if (!shoes) assert.ok(!hide.some((n) => regionsOf(n).includes('shoes')));
        }
  assert.ok(combinations > 1000, combinations);
  // A one-piece outfit's base layer covers both its top and its bottom.
  assert.deepEqual(plan(MODEL_PIECES.Sophie, { top: 'off' }).fill, { Cloth: 'full' });
  // Shoes are never just taken off.
  assert.deepEqual(plan(MODEL_PIECES.Kate, { shoes: 'off' }).hide, []);
});

test('with no wardrobe set, settings and the drawn person are exactly as before', () => {
  assert.deepEqual(settingsFor('Maya', { version: 1, defaults: {}, people: {} }).outfit, {});
  const { root, shirt } = rig();
  const before = JSON.stringify(root.toJSON());
  const wardrobe = new Wardrobe();
  for (const w of [undefined, null, {}, { base: { color: '#000000' } }])
    wardrobe.apply(root, 'Test', w);
  assert.equal(JSON.stringify(root.toJSON()), before);
  assert.equal(shirt.children.length, 0);
});

test('a shirt taken off becomes the base layer: cloth to the hem, then skin, cut cleanly, skinned like it', () => {
  const { root, shirt, joints } = rig();
  for (const sleeves of ['tee', 'long', 'vest']) {
    const { fabric, bare } = fillGeometry(shirt, 'top', baseOf({ base: { sleeves } }), joints);
    assert.ok(fabric, sleeves);
    const elbow = joints.Left.elbow.x,
      shoulder = joints.Left.arm.x,
      hem =
        sleeves === 'long'
          ? joints.Left.wrist.x - shoulder - 0.015
          : sleeves === 'vest'
            ? 0
            : (elbow - shoulder) * 0.42;
    const xs = (g) =>
      g
        ? [...Array(g.attributes.position.count).keys()].map((i) => g.attributes.position.getX(i))
        : [];
    // No cloth past the hem on the left arm (allowing for the cut face's own size).
    assert.ok(Math.max(...xs(fabric)) <= shoulder + hem + 0.002, `${sleeves}: cloth past the hem`);
    if (sleeves !== 'long') assert.ok(bare, `${sleeves}: skin past the hem`);
    for (const g of [fabric, bare].filter(Boolean)) {
      const w = g.attributes.skinWeight;
      for (let i = 0; i < w.count; i++) {
        const sum = w.getX(i) + w.getY(i) + w.getZ(i) + w.getW(i);
        assert.ok(Math.abs(sum - 1) < 1e-4, `weights sum to ${sum}`);
      }
    }
  }
  void root;
});

test('the base layer goes on, and the piece is hidden, only when the wardrobe takes it off', () => {
  const { root, shirt } = rig();
  new Wardrobe().apply(root, 'Rig', { top: 'off' });
  assert.equal(shirt.material.visible, false);
  assert.ok(
    shirt.children.some((c) => c.isSkinnedMesh),
    'the base layer rides on the hidden piece',
  );
});

test('people wait for the models they borrow from, and one that fails lends nothing', () => {
  const characters = new ThreeCharacters(new THREE.Group());
  characters.load = (name) => {
    if (!characters.models.has(name))
      characters.models.set(name, { promise: new Promise(() => {}) });
  };
  assert.deepEqual(characters.donors(undefined, false), {});
  assert.deepEqual(characters.donors({ top: 'off' }, false), {});
  assert.equal(characters.donors({ top: 'Josh' }, false), null);
  const scene = new THREE.Group();
  characters.models.get('Josh').gltf = { scene };
  assert.deepEqual(characters.donors({ top: 'Josh' }, false), { Josh: scene });
  characters.models.set('Kate', { failed: true });
  assert.deepEqual(characters.donors({ top: 'Josh', bottom: 'Kate' }, false), { Josh: scene });
});

test('the judo class keep their gi; the editor offers the wardrobe and undoes it', async () => {
  const judo = await readFile(new URL('../public/judo-characters.js', import.meta.url), 'utf8');
  assert.match(judo, /dressed\(JUDO_GI, withoutWardrobe\(/);
  const look = { model: 'Kate', outfit: {} };
  assert.match(wardrobeSection({}, look), /Their own \(shirt\)/);
  assert.match(wardrobeSection({}, look), /Josh’s suit and shirt/);
  assert.match(wardrobeSection({}, { model: 'James', outfit: {} }), /made in one piece/);
  assert.match(
    wardrobeSection({}, look, { locked: 'The judo class keep their gi on.' }),
    /judo class/,
  );
  assert.doesNotMatch(wardrobeSection({}, look), /Base layer/);
  assert.match(
    wardrobeSection({}, { model: 'Kate', outfit: { wardrobe: { top: 'off' } } }),
    /Base layer/,
  );

  const s = new CharacterSession();
  s.wear('Maya', 'wardrobe', { top: 'off', base: { sleeves: 'vest' } }, 'Take off their top');
  assert.deepEqual(s.settings.people.Maya.outfit.wardrobe, {
    top: 'off',
    base: { sleeves: 'vest' },
  });
  s.undo();
  assert.equal(s.settings.people.Maya, undefined);
});

// A small rig in Mixamo's naming, in a T-pose facing +z, and a shirt skinned to it: a torso and a
// sleeve down the left arm.
function rig() {
  const bone = (name, x, y, z, parent) => {
    const b = new THREE.Bone();
    b.name = 'mixamorig' + name;
    b.position.set(x, y, z);
    parent?.add(b);
    return b;
  };
  const hips = bone('Hips', 0, 1, 0),
    spine = bone('Spine', 0, 0.1, 0, hips),
    spine2 = bone('Spine2', 0, 0.25, 0, spine),
    neck = bone('Neck', 0, 0.15, 0, spine2),
    shoulder = bone('LeftShoulder', 0.05, 0.1, 0, spine2),
    arm = bone('LeftArm', 0.12, 0, 0, shoulder),
    fore = bone('LeftForeArm', 0.28, 0, 0, arm),
    hand = bone('LeftHand', 0.25, 0, 0, fore),
    rshoulder = bone('RightShoulder', -0.05, 0.1, 0, spine2),
    rarm = bone('RightArm', -0.12, 0, 0, rshoulder),
    rfore = bone('RightForeArm', -0.28, 0, 0, rarm),
    rhand = bone('RightHand', -0.25, 0, 0, rfore);
  const bones = [
    hips,
    spine,
    spine2,
    neck,
    shoulder,
    arm,
    fore,
    hand,
    rshoulder,
    rarm,
    rfore,
    rhand,
  ];
  const root = new THREE.Group();
  root.add(hips);
  root.updateMatrixWorld(true);
  // A sleeve: a tube along the left arm from the shoulder joint to the wrist, and a torso tube.
  const positions = [],
    indices = [],
    skinIndex = [],
    skinWeight = [];
  const tube = (from, to, radius, axis, boneAt) => {
    const start = positions.length / 3,
      rings = 24,
      around = 12;
    for (let j = 0; j <= rings; j++) {
      const t = j / rings,
        c = from.clone().lerp(to, t);
      for (let k = 0; k < around; k++) {
        const a = (k / around) * Math.PI * 2,
          d =
            axis === 'x'
              ? new THREE.Vector3(0, Math.cos(a), Math.sin(a))
              : new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
        const p = c.clone().addScaledVector(d, radius);
        positions.push(p.x, p.y, p.z);
        skinIndex.push(boneAt(c), 0, 0, 0);
        skinWeight.push(1, 0, 0, 0);
      }
    }
    for (let j = 0; j < rings; j++)
      for (let k = 0; k < around; k++) {
        const a = start + j * around + k,
          b = start + j * around + ((k + 1) % around),
          c = a + around,
          d = b + around;
        indices.push(a, c, b, b, c, d);
      }
  };
  const at = (b) => b.getWorldPosition(new THREE.Vector3());
  tube(at(arm), at(hand), 0.05, 'x', (c) => (c.x < at(fore).x ? 5 : c.x < at(hand).x ? 6 : 7));
  tube(at(hips), at(neck), 0.14, 'y', (c) => (c.y < at(spine2).y ? 1 : 2));
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setIndex(indices);
  g.computeVertexNormals();
  g.setAttribute(
    'uv',
    new THREE.Float32BufferAttribute(new Array((positions.length / 3) * 2).fill(0), 2),
  );
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndex, 4));
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeight, 4));
  const shirt = new THREE.SkinnedMesh(g, new THREE.MeshStandardMaterial());
  shirt.name = 'Ch99_Shirt';
  root.add(shirt);
  root.updateMatrixWorld(true);
  shirt.bind(new THREE.Skeleton(bones));
  root.updateMatrixWorld(true);
  return { root, shirt, joints: measureJoints(root) };
}
