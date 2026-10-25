import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../public/vendor/three.module.min.js';
import {
  HAIR_STYLES,
  BEARDS,
  PRESETS,
  appearanceScale,
  headCorrection,
  strideScale,
  checkAppearance,
  randomAppearance,
} from '../public/character-appearance.js';
import { settingsFor } from '../public/character-settings.js';
import { Appearance } from '../public/three-appearance.js';
import { CharacterSession } from '../editor/workspaces/character-editor/session.js';

test('with no appearance set, people are drawn exactly as modelled', () => {
  assert.deepEqual(settingsFor('Maya', { version: 1, defaults: {}, people: {} }).appearance, {});
  assert.equal(appearanceScale({}), null);
  assert.equal(appearanceScale(undefined), null);
  assert.equal(headCorrection({}), null);
  assert.equal(strideScale({}), 1);
  // Nothing on the model changes: not its pieces, materials or bones.
  const root = new THREE.Group(),
    bone = new THREE.Bone();
  bone.name = 'mixamorigNeck';
  const hair = new THREE.SkinnedMesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
  hair.name = 'Ch01_Hair';
  root.add(bone, hair);
  const before = JSON.stringify(root.toJSON());
  new Appearance().apply(root, 'Test', {});
  assert.equal(JSON.stringify(root.toJSON()), before);
});

test("a person's appearance is laid over the defaults one part at a time", () => {
  const settings = {
    version: 1,
    defaults: { appearance: { height: 0.95, skin: '#c78e63' } },
    people: { Maya: { appearance: { height: 1.1, hair: { style: 'bun' } } } },
  };
  assert.deepEqual(settingsFor('Maya', settings).appearance, {
    height: 1.1,
    skin: '#c78e63',
    hair: { style: 'bun' },
  });
  assert.deepEqual(settingsFor('Sam', settings).appearance, { height: 0.95, skin: '#c78e63' });
});

test('height and build scale the body; the head keeps its shape and strides lengthen', () => {
  const [x, y, z] = appearanceScale({ height: 1.1, build: 1 });
  assert.equal(y, 1.1);
  assert.ok(x > y && z > y && x > z, 'broader across than front to back');
  const [hx, hy, hz] = headCorrection({ build: 1 });
  assert.ok(Math.abs((x / y) * hx - 1) < 1e-9 && hy === 1 && Math.abs((z / y) * hz - 1) < 1e-9);
  // Out of range values are held to the range.
  assert.deepEqual(appearanceScale({ height: 3 }), [1.15, 1.15, 1.15]);
  assert.equal(strideScale({ height: 1.1 }), 1.1);
});

test('appearances are checked, and every preset and random look passes', () => {
  assert.deepEqual(checkAppearance({}), []);
  for (const [name, preset] of Object.entries(PRESETS))
    assert.deepEqual(checkAppearance(preset), [], name);
  let seed = 3;
  const random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  for (let k = 0; k < 200; k++) {
    const look = randomAppearance(random);
    assert.deepEqual(checkAppearance(look), []);
    assert.ok(HAIR_STYLES.includes(look.hair.style) && BEARDS.includes(look.beard.kind));
  }
  assert.equal(
    checkAppearance({
      height: 2,
      build: -3,
      skin: 'brown',
      hair: { style: 'mohawk', color: '#12' },
      beard: { kind: 'braids' },
      brows: 'thin',
    }).length,
    7,
  );
});

test('taking the hair off hides only the hair; the build corrects the neck', () => {
  const root = new THREE.Group(),
    neck = new THREE.Bone(),
    piece = (name) => {
      const mesh = new THREE.SkinnedMesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
      mesh.name = name;
      root.add(mesh);
      return mesh;
    };
  neck.name = 'mixamorigNeck';
  root.add(neck);
  const hair = piece('Ch01_Hair'),
    lashes = piece('Ch01_Eyelashes'),
    body = piece('Ch01_Body');
  new Appearance().apply(root, 'Test', {
    hair: { style: 'bald' },
    beard: { kind: 'none' },
    build: 0.5,
  });
  assert.equal(hair.visible, false);
  assert.equal(lashes.visible, true);
  assert.equal(body.visible, true);
  assert.ok(neck.scale.x < 1 && neck.scale.y === 1 && neck.scale.z < 1);
});

test('the Character Editor sets and clears appearance parts, with undo', () => {
  const s = new CharacterSession();
  s.appear('Maya', 'height', 1.08);
  s.appear('Maya', 'hair', { style: 'long', color: '#c79a58' });
  assert.deepEqual(s.own('Maya').appearance, {
    height: 1.08,
    hair: { style: 'long', color: '#c79a58' },
  });
  s.appear('Maya', 'height', undefined);
  s.appear('Maya', 'hair', undefined);
  // Nothing left: the person drops out of the saved file.
  assert.deepEqual(s.settings.people, {});
  s.undo();
  assert.deepEqual(s.own('Maya').appearance, { hair: { style: 'long', color: '#c79a58' } });
  s.reset('Maya', 'appearance');
  assert.deepEqual(s.settings.people, {});
});
