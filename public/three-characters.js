import * as THREE from './vendor/three.module.min.js';
import { GLTFLoader } from './vendor/three-addons/GLTFLoader.js';
import { clone } from './vendor/three-addons/SkeletonUtils.js';

// Rigged, animated people for the three.js renderer. The game describes each person every frame
// and this draws them, loading each character model (public/models/people, converted from Mixamo
// by scripts/convert-mixamo.mjs) the first time it is needed. Until a model has loaded, or if it
// cannot load, the person's stand-in (the game's own jointed figure) is drawn instead.
//
// A character: { key, model ('Adam'…), x, y, z (feet, model space), angle (the direction faced,
// radians, 0 = +x, as figures.js), clips: [{ name, time, weight }] (blended by weight), standIn
// (the meshes drawn while it loads), belt (optional colour) }.
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
  constructor(parent, { lowDetail = false } = {}) {
    this.parent = parent;
    this.lowDetail = lowDetail;
    this.loader = new GLTFLoader();
    this.models = new Map();
    this.people = new Map();
    this.shadowGeometry = new THREE.CircleGeometry(0.34, 24).rotateX(-Math.PI / 2);
    this.shadowMaterial = new THREE.MeshBasicMaterial({
      color: 0x1d2a20,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
    });
    this.clips = null;
  }
  // The animations, shared by everyone, load with the first person seen.
  loadClips() {
    if (this.clipsRequested) return;
    this.clipsRequested = true;
    this.load('animations').then(
      (gltf) => (this.clips = new Map(gltf.animations.map((c) => [c.name, c]))),
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
  // One person drawn from a loaded model: its own copy of the skeleton, an animation mixer, a
  // belt round the waist if asked for, and a soft shadow on the ground.
  create(state, gltf) {
    const root = clone(gltf.scene);
    root.traverse((o) => {
      if (o.isSkinnedMesh) o.frustumCulled = false;
    });
    const hips = root.getObjectByName('mixamorigHips');
    const person = {
      model: state.model,
      root,
      hips,
      mixer: new THREE.AnimationMixer(root),
      actions: new Map(),
      shadow: new THREE.Mesh(this.shadowGeometry, this.shadowMaterial),
    };
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
        wasLow = person?.file === state.model + '-low',
        low = this.lowDetail || distance > (wasLow ? NEAR : FAR),
        file = state.model + (low ? '-low' : '');
      this.load(file);
      const entry = this.models.get(file);
      // Until the wanted version has loaded, keep the one already shown, if any.
      if (!entry.gltf || !this.clips) {
        if (!person || person.model !== state.model) continue;
      } else if (person?.file !== file) {
        if (person) this.remove(state.key);
        person = this.create(state, entry.gltf);
        person.file = file;
        this.people.set(state.key, person);
      }
      seen.add(state.key);
      person.root.visible = person.shadow.visible = true;
      person.root.position.set(state.x, state.y, state.z);
      // Models face +z; angle 0 faces +x.
      person.root.rotation.y = Math.PI / 2 - state.angle;
      for (const action of person.actions.values()) action.setEffectiveWeight(0);
      for (const { name, time, weight } of state.clips) {
        const clip = this.clips.get(name);
        if (!clip) continue;
        let action = person.actions.get(name);
        if (!action) {
          action = person.mixer.clipAction(clip);
          action.play();
          person.actions.set(name, action);
        }
        action.setEffectiveWeight(weight);
        action.time = Math.min(time, clip.duration);
      }
      person.mixer.update(0);
      // The shadow follows the hips, which move away from the feet in a throw or a fall.
      person.root.updateMatrixWorld(true);
      const at = person.hips ? person.hips.getWorldPosition(new THREE.Vector3()) : null;
      if (at) this.parent.worldToLocal(at);
      person.shadow.position.set(at ? at.x : state.x, state.y + 0.012, at ? at.z : state.z);
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
    person.belt?.geometry.dispose();
    person.belt?.material.dispose();
    this.people.delete(key);
  }
  dispose() {
    for (const key of [...this.people.keys()]) this.remove(key);
    this.shadowGeometry.dispose();
    this.shadowMaterial.dispose();
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
