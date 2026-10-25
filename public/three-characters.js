import * as THREE from './vendor/three.module.min.js';
import { GLTFLoader } from './vendor/three-addons/GLTFLoader.js';
import { clone } from './vendor/three-addons/SkeletonUtils.js';
import { Outfits } from './three-outfits.js';
import { Appearance } from './three-appearance.js';
import { Wardrobe } from './three-wardrobe.js';
import { MODEL_PIECES } from './character-wardrobe.js';
import { appearanceScale } from './character-appearance.js';
import { IMPORTED_CLIPS } from './character-clips.js';
import { modelFile, modelHeight } from './character-models.js';

// Rigged, animated people for the three.js renderer. The game describes each person every frame
// and this draws them, loading each character model (public/models/people, converted from Mixamo
// by scripts/convert-mixamo.mjs) the first time it is needed. Until a model has loaded, or if it
// cannot load, the person's stand-in (the game's own jointed figure) is drawn instead.
//
// A character: { key, model ('Adam'…), x, y, z (feet, model space), angle (the direction faced,
// radians, 0 = +x, as figures.js), clips: [{ name, time, weight }] (blended by weight), standIn
// (the meshes drawn while it loads), belt (optional colour), carry (optional colour: a toolbox in
// the right hand), scale (optional; the technician is drawn a little larger to stand out), outfit
// (optional: recoloured clothes, work wear and badges, and their own clothes changed with
// `wardrobe`, see character-outfits.js and character-wardrobe.js), appearance
// (optional: height, build, skin, hair, beard and brows, see character-appearance.js) }.
//
// Each model comes in full detail and a light version (-low, about 15% of the triangles): people
// far from the camera use the light one, and on software WebGL everyone does, because skinning
// every vertex on the CPU is what costs there.

const BASE = new URL('./models/people/', import.meta.url);
// Distances (metres) at which a person changes to and from the light version; the gap keeps
// someone near the boundary from flickering between the two.
const FAR = 16,
  NEAR = 13;

export class ThreeCharacters {
  // shadows: cast real shadows from the sun (a renderer with shadow maps on); otherwise each
  // person has a soft round shade under them.
  constructor(parent, { lowDetail = false, shadows = false } = {}) {
    this.parent = parent;
    this.lowDetail = lowDetail;
    this.shadows = shadows;
    this.loader = new GLTFLoader();
    this.models = new Map();
    this.people = new Map();
    // The world is drawn by the game's own shader, which cannot receive three.js shadows, so
    // each person's shadow falls on a patch of ground under them that shows only the shadow.
    // A soft round shade under everyone keeps them on the ground at night and under cloud too.
    this.shadowGeometry = new THREE.CircleGeometry(0.34, 24).rotateX(-Math.PI / 2);
    this.shadowMaterial = new THREE.MeshBasicMaterial({
      color: 0x1d2a20,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
    });
    if (shadows) {
      this.sunShadowGeometry = new THREE.PlaneGeometry(4, 4).rotateX(-Math.PI / 2);
      this.sunShadowMaterial = new THREE.ShadowMaterial({ opacity: 0.45, depthWrite: false });
    }
    this.outfits = new Outfits({ shadows });
    this.appearance = new Appearance({ shadows });
    this.wardrobe = new Wardrobe({ shadows });
    this.clips = null;
  }
  // The animations, shared by everyone, load with the first person seen.
  loadClips() {
    if (this.clipsRequested) return;
    this.clipsRequested = true;
    this.load('animations').then(
      (gltf) => {
        this.clips = new Map(gltf.animations.map((c) => [c.name, c]));
        // Clips imported in the Character Editor, each in its own file, join as they arrive.
        for (const [name, { file }] of Object.entries(IMPORTED_CLIPS))
          this.loader.loadAsync(new URL(file, BASE).href).then(
            (clipFile) => {
              const clip = clipFile.animations[0];
              if (!clip) return;
              clip.name = name;
              this.clips.set(name, clip);
            },
            (e) => console.warn('Clip ' + name + ' did not load:', e.message),
          );
      },
      () => (this.clips = new Map()),
    );
  }
  load(name) {
    if (!this.models.has(name)) {
      const entry = { promise: this.loader.loadAsync(new URL(name + '.glb', BASE).href) };
      entry.promise.then(
        (gltf) => (entry.gltf = gltf),
        (e) => {
          entry.failed = true;
          console.warn('Character model ' + name + ' did not load:', e.message);
        },
      );
      this.models.set(name, entry);
    }
    return this.models.get(name).promise;
  }
  // The loaded scenes of the models a wardrobe borrows from ({ [model]: scene }), at the same
  // detail, or null while any is still loading. One that fails to load lends nothing.
  donors(wardrobe, low) {
    const names = ['top', 'bottom', 'shoes']
      .map((region) => wardrobe?.[region])
      .filter((name) => name && name !== 'off' && MODEL_PIECES[name]);
    const donors = {};
    for (const name of names) {
      const file = modelFile(name, low);
      this.load(file);
      const entry = this.models.get(file);
      if (entry.gltf) donors[name] = entry.gltf.scene;
      else if (!entry.failed) return null;
    }
    return donors;
  }
  // One person drawn from a loaded model: its own copy of the skeleton, an animation mixer, a
  // belt round the waist if asked for, and a soft shadow on the ground.
  create(state, gltf) {
    const root = clone(gltf.scene);
    root.traverse((o) => {
      if (!o.isSkinnedMesh) return;
      o.frustumCulled = false;
      o.castShadow = this.shadows;
      // The textures carry the colour; Mixamo's grey base colour would only darken them. (An
      // imported model's untextured pieces keep their colour: character-models.js.)
      for (const m of [].concat(o.material)) if (!m.userData.keepColour) m.color.set(0xffffff);
    });
    this.outfits.dress(root, state.file, state.outfit);
    // Before the appearance, which may change the neck's scale: borrowed clothes are fitted at rest.
    this.wardrobe.apply(root, state.file, state.outfit?.wardrobe, {
      donors: state.donors,
      skin: state.appearance?.skin,
      outfit: state.outfit,
    });
    this.appearance.apply(root, state.file, state.appearance);
    const hips = root.getObjectByName('mixamorigHips');
    const person = {
      model: state.model,
      // Height and build: their size on each axis, or null for as modelled.
      size: appearanceScale(state.appearance),
      root,
      hips,
      mixer: new THREE.AnimationMixer(root),
      actions: new Map(),
      shadow: new THREE.Mesh(this.shadowGeometry, this.shadowMaterial),
    };
    if (this.shadows) {
      // Shows only the shadow the person casts in the sun.
      const sunShadow = new THREE.Mesh(this.sunShadowGeometry, this.sunShadowMaterial);
      sunShadow.receiveShadow = true;
      person.shadow.add(sunShadow);
    }
    if (state.belt && hips) {
      // Sized in metres although the skeleton is in centimetres (the model is scaled by 0.01).
      root.updateMatrixWorld(true);
      const scale = hips.getWorldScale(new THREE.Vector3()).x;
      const belt = new THREE.Mesh(
        new THREE.CylinderGeometry(0.165, 0.165, 0.05, 24, 1, true),
        new THREE.MeshStandardMaterial({
          color: state.belt,
          roughness: 0.8,
          side: THREE.DoubleSide,
        }),
      );
      belt.scale.set(1.12 / scale, 1 / scale, 0.85 / scale);
      belt.position.set(0, 0.07 / scale, 0.01 / scale);
      hips.add(belt);
      person.belt = belt;
    }
    const hand = root.getObjectByName('mixamorigRightHand');
    if (state.carry && hand) {
      root.updateMatrixWorld(true);
      const scale = hand.getWorldScale(new THREE.Vector3()).x;
      const box = new THREE.Mesh(
        new THREE.BoxGeometry(0.34, 0.2, 0.14),
        new THREE.MeshStandardMaterial({ color: state.carry, roughness: 0.55 }),
      );
      // Held by its handle below the hand.
      box.scale.setScalar(1 / scale);
      box.position.set(0, 0.16 / scale, 0);
      hand.add(box);
      person.carry = box;
    }
    this.parent.add(root, person.shadow);
    return person;
  }
  // Draws this frame's people seen from eye (model space); returns the stand-in meshes the
  // renderer should leave out.
  update(states, eye) {
    const hidden = new Set(),
      seen = new Set();
    if (states.length) this.loadClips();
    for (const state of states) {
      let person = this.people.get(state.key);
      const distance = Math.hypot(state.x - eye[0], state.y - eye[1], state.z - eye[2]),
        wasLow = person?.file === modelFile(state.model, true),
        low = this.lowDetail || distance > (wasLow ? NEAR : FAR),
        // An imported model (character-models.js) has one file, near and far.
        file = modelFile(state.model, low);
      this.load(file);
      const entry = this.models.get(file),
        donors = this.donors(state.outfit?.wardrobe, low);
      // Until the wanted version (and any model it borrows clothes from) has loaded, keep the one
      // already shown, if any.
      if (!entry.gltf || !this.clips || !donors) {
        if (!person || person.model !== state.model) continue;
      } else if (person?.file !== file) {
        if (person) this.remove(state.key);
        person = this.create({ ...state, file, donors }, entry.gltf);
        person.file = file;
        this.people.set(state.key, person);
      }
      seen.add(state.key);
      person.root.visible = person.shadow.visible = true;
      person.root.position.set(state.x, state.y, state.z);
      // An imported model's height, then their own height and build (character-appearance.js).
      const scale = (state.scale || 1) * modelHeight(state.model);
      person.root.scale.setScalar(scale);
      if (person.size) person.root.scale.multiply(new THREE.Vector3(...person.size));
      person.shadow.scale.setScalar(scale * (person.size?.[1] || 1));
      if (person.carry && state.carry) person.carry.material.color.set(state.carry);
      // Models face +z; angle 0 faces +x.
      person.root.rotation.y = Math.PI / 2 - state.angle;
      for (const action of person.actions.values()) action.setEffectiveWeight(0);
      for (const { name, time, weight } of state.clips) {
        // An imported clip not here yet (or not downloaded) is stood out in the idle.
        const clip = this.clips.get(name) || (name in IMPORTED_CLIPS && this.clips.get('Idle'));
        if (!clip) continue;
        let action = person.actions.get(clip.name);
        if (!action) {
          action = person.mixer.clipAction(clip);
          action.play();
          person.actions.set(clip.name, action);
        }
        action.setEffectiveWeight(weight);
        action.time = Math.min(time, clip.duration);
      }
      person.mixer.update(0);
      // The shadow follows the hips, which move away from the feet in a throw or a fall.
      person.root.updateMatrixWorld(true);
      const at = person.hips ? person.hips.getWorldPosition(new THREE.Vector3()) : null;
      if (at) this.parent.worldToLocal(at);
      // A little above the floor height: paths and rugs are drawn slightly raised, and a shadow
      // at floor level would be hidden under them.
      person.shadow.position.set(at ? at.x : state.x, state.y + 0.07, at ? at.z : state.z);
      for (const mesh of state.standIn || []) hidden.add(mesh);
    }
    for (const [key, person] of this.people)
      if (!seen.has(key)) person.root.visible = person.shadow.visible = false;
    return hidden;
  }
  remove(key) {
    const person = this.people.get(key);
    person.root.removeFromParent();
    person.shadow.removeFromParent();
    for (const part of [person.belt, person.carry]) {
      part?.geometry.dispose();
      part?.material.dispose();
    }
    this.people.delete(key);
  }
  dispose() {
    for (const key of [...this.people.keys()]) this.remove(key);
    this.shadowGeometry.dispose();
    this.shadowMaterial.dispose();
    this.sunShadowGeometry?.dispose();
    this.sunShadowMaterial?.dispose();
    this.outfits.dispose();
    this.wardrobe.dispose();
    this.appearance.dispose();
    for (const { gltf } of this.models.values())
      gltf?.scene.traverse((o) => {
        if (!o.isMesh) return;
        o.geometry.dispose();
        for (const m of [].concat(o.material)) {
          for (const t of [m.map, m.normalMap]) t?.dispose();
          m.dispose();
        }
      });
  }
}
