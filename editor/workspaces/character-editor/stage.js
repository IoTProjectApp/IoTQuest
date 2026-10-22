// The Character Editor's preview: one person on a small stage, drawn by the game's own character
// renderer (public/three-characters.js) so they look exactly as in the game. They stand, playing
// their idle or activity, or walk a circle at their speed; drag orbits, scroll zooms.
import * as THREE from '../../../public/vendor/three.module.min.js';
import { OrbitControls } from '/editor/three/OrbitControls.js';
import { ThreeCharacters } from '../../../public/three-characters.js';
import { CLIPS, walkTime } from '../../../public/character-clips.js';
import { Reactions } from '../../../public/character-reactions.js';

const KEY = 'preview';
// A resident's ordinary walking pace, in metres a second; their speed setting scales it.
const WALK = 1.25;
const RADIUS = 1.8;

export class Stage {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#1b2027');
    this.camera = new THREE.PerspectiveCamera(32, 1, 0.05, 100);
    this.camera.position.set(2.6, 1.7, 3.6);
    this.orbit = new OrbitControls(this.camera, canvas);
    Object.assign(this.orbit, {
      enableDamping: true,
      dampingFactor: 0.12,
      minDistance: 1.2,
      maxDistance: 12,
      maxPolarAngle: Math.PI / 2 - 0.02,
    });
    this.orbit.target.set(0, 0.95, 0);
    // Daylight much as the game lights its people: a warm sun and a sky fill.
    const sun = new THREE.DirectionalLight('#fff4e0', 2.6);
    sun.position.set(3, 6, 4);
    this.scene.add(sun, new THREE.HemisphereLight('#cfe3ff', '#4a4537', 1.6));
    // A round stage with a ring marking the walking circle.
    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(3.2, 64).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: '#3a4250', roughness: 0.95 }),
    );
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(RADIUS - 0.02, RADIUS + 0.02, 96).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: '#566173' }),
    );
    ring.position.y = 0.002;
    this.scene.add(floor, ring);
    this.people = new THREE.Group();
    this.scene.add(this.people);
    this.characters = new ThreeCharacters(this.people, { shadows: false });
    this.mode = 'stand';
    this.playing = true;
    this.clock = 0;
    this.walked = 0;
    this.look = null;
    this.frame = this.frame.bind(this);
    this.last = performance.now();
    requestAnimationFrame(this.frame);
  }
  // Who to show: { model, outfit, scale, carry, belt, walk, idle, activity, speed, rate }.
  show(look) {
    // A different model or outfit means dressing them again.
    const dress = JSON.stringify([look.model, look.outfit, look.carry, look.belt]);
    if (dress !== this.dress && this.characters.people.has(KEY)) this.characters.remove(KEY);
    this.dress = dress;
    this.look = look;
  }
  // Plays a reaction once on the person ("Try it"), turning them to the camera if it says so.
  tryReaction(reaction) {
    this.trial = new Reactions({
      people: { [KEY]: { reactions: [{ ...reaction, cooldown: 0 }] } },
    });
    this.trialClock = 0;
    this.trial.fire(KEY, reaction.trigger, 0);
  }
  // Walking pulls the camera back to show the whole circle; standing brings it in close.
  setMode(mode) {
    this.mode = mode;
    this.walked = 0;
    this.distance = mode === 'walk' ? 8.5 : 4.4;
  }
  // Whether the person is on stage yet (models load the first time each is shown).
  get ready() {
    return this.characters.people.has(KEY) && !!this.characters.clips;
  }
  frame(now) {
    requestAnimationFrame(this.frame);
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    const c = this.canvas,
      width = Math.max(1, c.clientWidth),
      height = Math.max(1, c.clientHeight);
    if (
      c.width !== Math.round(width * devicePixelRatio) ||
      c.height !== Math.round(height * devicePixelRatio)
    ) {
      this.renderer.setPixelRatio(devicePixelRatio);
      this.renderer.setSize(width, height, false);
      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
    }
    // Ease towards the mode's distance, keeping whatever angle the camera is at.
    if (this.distance) {
      const offset = this.camera.position.clone().sub(this.orbit.target),
        length = offset.length(),
        next = length + (this.distance - length) * Math.min(1, dt * 6);
      this.camera.position.copy(this.orbit.target).add(offset.setLength(next));
      if (Math.abs(next - this.distance) < 0.01) this.distance = null;
    }
    this.orbit.update();
    if (this.look) {
      if (this.playing) this.clock += dt * (this.look.rate || 1);
      const person = this.state(dt);
      if (this.trial) {
        this.trialClock += dt;
        const { x, z } = this.camera.position;
        this.trial.apply(person, this.trialClock, { player: { x, z }, sense: false });
        if (!this.trial.playing.has(KEY)) this.trial = null;
      }
      this.characters.update([person], this.camera.position.toArray());
    }
    // The pose editor's dots and rings follow the body (pose-editor.js).
    this.onFrame?.(dt);
    this.renderer.render(this.scene, this.camera);
  }
  // The person this frame, as the game describes a character.
  state(dt) {
    const look = this.look,
      loop = (name) => ({ name, time: this.clock % CLIPS[name].duration, weight: 1 });
    let at = { x: 0, z: 0, angle: Math.PI / 2 },
      clips;
    if (this.mode === 'walk' && !look.activity) {
      if (this.playing) this.walked += dt * WALK * (look.speed || 1);
      const a = this.walked / RADIUS;
      // Round the circle anticlockwise, facing along it.
      at = { x: Math.cos(a) * RADIUS, z: -Math.sin(a) * RADIUS, angle: -a - Math.PI / 2 };
      clips = [
        CLIPS[look.walk]?.stride
          ? { name: look.walk, time: walkTime(look.walk, this.walked), weight: 1 }
          : loop(look.walk),
      ];
    } else clips = [loop(look.activity || look.idle)];
    return {
      key: KEY,
      model: look.model,
      outfit: look.outfit,
      scale: look.scale || 1,
      carry: look.carry,
      belt: look.belt,
      x: at.x,
      y: 0,
      z: at.z,
      angle: at.angle,
      clips,
      standIn: [],
    };
  }
}
