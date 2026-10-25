// The Character Editor's pose editor: make a clip by posing the person on stage at a few moments
// on a timeline. Click a joint (the dots on the body) and turn it with the rings; the moments in
// between are filled in (keyframes.js). Opened over the stage by app.js, which saves the result.
import * as THREE from '../../../public/vendor/three.module.min.js';
import { TransformControls } from '/editor/three/TransformControls.js';
import {
  JOINTS,
  EASES,
  FPS,
  MIN_LENGTH,
  MAX_LENGTH,
  PoseError,
  poseFromClip,
  newClip,
  jointsOf,
  sortKeys,
  keyAt,
  poseAt,
  mirrorPose,
  buildClip,
  tidyMade,
} from './keyframes.js';

// The name the clip being made plays under on stage (no real clip has a space).
export const POSING = ' posing';
const EASE_NAMES = {
  smooth: 'Smooth',
  linear: 'Steady',
  out: 'Quick, then settle',
  hold: 'Hold, then snap',
};
const escape = (s) =>
  String(s).replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c],
  );
const clone = (v) => structuredClone(v);
const snap = (t) => Math.round(t * FPS) / FPS;
const seconds = (t) => (+t.toFixed(2)).toString() + ' s';

export class PoseEditor {
  // api: { CLIPS, forgetClip(name), show(posing), clipNames(), label(name), nameProblem(name),
  //        save(name, clip, made, editing), toast(text, error), icon(name, size) }
  constructor(stage, panel, api) {
    this.stage = stage;
    this.panel = panel;
    this.api = api;
    this.open = false;
    // The dots on the joints, drawn over the body.
    this.dots = new THREE.Group();
    this.dots.visible = false;
    const geometry = new THREE.SphereGeometry(0.028, 16, 12);
    for (const joint of JOINTS) {
      const dot = new THREE.Mesh(
        geometry,
        new THREE.MeshBasicMaterial({ color: '#f2b84b', depthTest: false, transparent: true }),
      );
      dot.renderOrder = 10;
      dot.userData.joint = joint;
      this.dots.add(dot);
    }
    stage.scene.add(this.dots);
    // The rings that turn the chosen joint, on a stand-in that follows its bone.
    this.proxy = new THREE.Object3D();
    stage.scene.add(this.proxy);
    this.gizmo = new TransformControls(stage.camera, stage.canvas);
    this.gizmo.setMode('rotate');
    this.gizmo.setSpace('local');
    this.gizmo.setSize(0.6);
    this.gizmo.enabled = false;
    this.helper = this.gizmo.getHelper ? this.gizmo.getHelper() : this.gizmo;
    this.helper.visible = false;
    stage.scene.add(this.helper);
    this.gizmo.addEventListener('dragging-changed', (e) => {
      stage.orbit.enabled = !e.value;
      if (e.value) this.remember();
    });
    this.gizmo.addEventListener('objectChange', () => this.turned());
    this.raycaster = new THREE.Raycaster();
    // Caught before the rings and the orbit see it: a click on a dot always chooses that joint.
    stage.canvas.addEventListener('pointerdown', (e) => this.pick(e), { capture: true });
    stage.onFrame = () => this.frame();
  }

  // ---- Opening and closing --------------------------------------------------------------------
  // A new clip from a moment of `from` (a clip name), or a made clip to change ({ name, made }).
  start({ name = '', made = null, from = 'Idle', at = 0, editing = false } = {}) {
    const source = this.stage.characters.clips?.get(from);
    if (!made && !source)
      return this.api.toast('Wait for the person to appear, then try again.', true);
    this.made = made ? clone(made) : newClip(poseFromClip(source, at));
    this.name = name;
    this.editing = editing;
    this.time = 0;
    this.playing = false;
    this.joint = JOINTS.find((j) => j.id === 'shoulderR');
    this.history = [];
    this.future = [];
    this.copied = null;
    this.from = { clip: from, at };
    this.open = true;
    this.dots.visible = true;
    this.gizmo.enabled = true;
    this.rebuild();
    this.api.show(true);
    this.render();
  }
  close() {
    this.open = false;
    this.dots.visible = false;
    this.gizmo.detach();
    this.gizmo.enabled = false;
    this.helper.visible = false;
    this.stage.orbit.enabled = true;
    this.stage.playing = true;
    this.api.forgetClip(POSING);
    this.api.show(false);
    this.panel.hidden = true;
    this.panel.innerHTML = '';
    this.stage.canvas.style.height = '';
  }

  // ---- Undo inside the pose editor ------------------------------------------------------------
  remember() {
    this.history.push(clone(this.made));
    if (this.history.length > 100) this.history.shift();
    this.future = [];
  }
  undo(redo = false) {
    const from = redo ? this.future : this.history,
      to = redo ? this.history : this.future;
    if (!from.length) return;
    to.push(clone(this.made));
    this.made = from.pop();
    this.time = Math.min(this.time, this.made.length);
    this.rebuild();
    this.render();
  }
  change(run) {
    this.remember();
    run();
    sortKeys(this.made);
    this.rebuild();
    this.render();
  }

  // ---- The clip on stage ----------------------------------------------------------------------
  // Builds the clip again and shows it at the playhead.
  rebuild() {
    const { CLIPS } = this.api;
    this.api.forgetClip(POSING);
    try {
      this.clip = buildClip(this.made, POSING);
      this.error = null;
    } catch (error) {
      if (!(error instanceof PoseError)) throw error;
      this.error = error.message;
      return;
    }
    CLIPS[POSING] = { duration: this.made.length };
    this.stage.characters.clips.set(POSING, this.clip);
    this.seek(this.time);
  }
  seek(t) {
    this.time = Math.min(Math.max(0, t), this.made.length);
    this.stage.clock = this.time;
    this.stage.playing = this.playing;
  }
  bone(name) {
    return this.stage.characters.people.get('preview')?.root.getObjectByName(name) ?? null;
  }
  // Each frame: the playhead follows playback, the dots follow the joints and the rings their joint.
  frame() {
    if (!this.open) return;
    if (this.playing) {
      const len = this.made.length;
      if (!this.made.loop && this.stage.clock >= len) {
        this.playing = false;
        this.seek(len);
        this.render();
      } else this.time = this.stage.clock % len;
      this.movePlayhead();
    }
    const at = new THREE.Vector3();
    for (const dot of this.dots.children) {
      const bone = this.bone(dot.userData.joint.bone);
      dot.visible = !!bone;
      if (!bone) continue;
      bone.getWorldPosition(at);
      dot.position.copy(at);
      const chosen = dot.userData.joint === this.joint;
      dot.material.color.set(chosen ? '#4f9cf9' : '#f2b84b');
      dot.scale.setScalar(chosen ? 1.4 : 1);
    }
    const bone = this.bone(this.joint.bone);
    if (bone && !this.gizmo.dragging) {
      bone.getWorldPosition(this.proxy.position);
      bone.getWorldQuaternion(this.proxy.quaternion);
      this.proxy.updateMatrixWorld(true);
    }
    if (bone && !this.playing) {
      if (this.gizmo.object !== this.proxy) this.gizmo.attach(this.proxy);
      this.helper.visible = true;
    } else {
      this.gizmo.detach();
      this.helper.visible = false;
    }
  }
  // A click on a dot chooses that joint.
  pick(event) {
    if (!this.open || this.gizmo.dragging) return;
    const rect = this.stage.canvas.getBoundingClientRect(),
      pointer = new THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1,
      );
    this.raycaster.setFromCamera(pointer, this.stage.camera);
    const hit = this.raycaster.intersectObjects(this.dots.children.filter((d) => d.visible))[0];
    if (!hit) return;
    event.stopImmediatePropagation();
    this.choose(hit.object.userData.joint.id);
  }
  choose(id) {
    this.joint = JOINTS.find((j) => j.id === id) || this.joint;
    this.render();
  }
  // The rings moved: the joint's turn at the playhead, as a pose (made here if there is none).
  turned() {
    const bone = this.bone(this.joint.bone);
    if (!bone?.parent) return;
    const parent = bone.parent.getWorldQuaternion(new THREE.Quaternion()),
      local = parent.invert().multiply(this.proxy.quaternion).normalize();
    let key = keyAt(this.made, this.time);
    if (!key) {
      key = { t: snap(this.time), pose: jointsOf(poseAt(this.made, this.time)) };
      this.made.keys.push(key);
      sortKeys(this.made);
    }
    key.pose[this.joint.bone] = local.toArray();
    bone.quaternion.copy(local);
    this.rebuild();
    this.renderTimeline();
  }

  // ---- Commands -------------------------------------------------------------------------------
  addKey() {
    if (keyAt(this.made, this.time)) return this.api.toast('There is a pose here already.');
    this.change(() =>
      this.made.keys.push({ t: snap(this.time), pose: jointsOf(poseAt(this.made, this.time)) }),
    );
  }
  removeKey() {
    const key = keyAt(this.made, this.time);
    if (!key) return;
    if (this.made.keys.length === 1) return this.api.toast('A clip needs at least one pose.', true);
    this.change(() => this.made.keys.splice(this.made.keys.indexOf(key), 1));
  }
  // The pose at the playhead, made a key if it is not one.
  keyHere() {
    let key = keyAt(this.made, this.time);
    if (!key) {
      key = { t: snap(this.time), pose: jointsOf(poseAt(this.made, this.time)) };
      this.made.keys.push(key);
    }
    return key;
  }
  copy() {
    this.copied = jointsOf(poseAt(this.made, this.time));
    this.api.toast('Pose copied.');
    this.render();
  }
  paste() {
    if (!this.copied) return;
    this.change(() => (this.keyHere().pose = clone(this.copied)));
  }
  mirror() {
    this.change(() => {
      const key = this.keyHere();
      key.pose = mirrorPose(jointsOf(poseAt(this.made, key.t)));
    });
  }
  // The chosen joint back to how the starting pose has it.
  resetJoint() {
    const base = this.made.base.bones[this.joint.bone];
    if (!base) return;
    this.change(() => (this.keyHere().pose[this.joint.bone] = [...base]));
  }
  // The whole pose at the playhead from a moment of another clip.
  take(clipName, at) {
    const source = this.stage.characters.clips?.get(clipName);
    if (!source) return this.api.toast(`${clipName} is not loaded.`, true);
    this.from = { clip: clipName, at };
    this.change(() => (this.keyHere().pose = jointsOf(poseFromClip(source, at).bones)));
  }
  setLength(length) {
    if (!(length >= MIN_LENGTH && length <= MAX_LENGTH))
      return this.api.toast(`A clip lasts ${MIN_LENGTH}–${MAX_LENGTH} seconds.`, true);
    this.change(() => {
      // Poses keep their place in the clip: stretched or squeezed with it.
      const scale = length / this.made.length;
      for (const k of this.made.keys) k.t = snap(Math.min(length, k.t * scale));
      // Squeezing can land two poses on one frame: keep the later.
      this.made.keys = this.made.keys.filter(
        (k, i, all) => !all.slice(i + 1).some((o) => Math.abs(o.t - k.t) < 0.5 / FPS),
      );
      this.made.length = length;
      this.time = Math.min(this.time * scale, length);
    });
  }
  togglePlay() {
    this.playing = !this.playing;
    if (this.playing && this.time >= this.made.length - 1e-6) this.time = 0;
    this.seek(this.time);
    this.render();
  }
  async save() {
    const name = this.name.trim(),
      problem = this.editing ? null : this.api.nameProblem(name);
    if (problem) return this.api.toast(problem, true);
    if (this.error) return this.api.toast(this.error, true);
    try {
      const made = tidyMade(this.made);
      await this.api.save(name, buildClip(made, name), made, this.editing);
      this.close();
    } catch (error) {
      this.api.toast('Could not save the clip: ' + error.message, true);
    }
  }

  // ---- The panel ------------------------------------------------------------------------------
  render() {
    const { icon, label, clipNames } = this.api,
      key = keyAt(this.made, this.time),
      problem = this.editing ? null : this.api.nameProblem(this.name.trim());
    this.panel.hidden = false;
    this.panel.innerHTML = `
      <div class="pose-row">
        <label class="field name"><span>Name</span><input class="input" id="pose-name" value="${escape(this.name)}"
          maxlength="40" spellcheck="false" placeholder="Waving" ${this.editing ? 'readonly' : ''} />
          <small class="${problem && this.name ? 'bad' : ''}">${escape(this.editing ? 'Saving replaces it in the game.' : (this.name && problem) || 'Letters and digits, starting with a capital.')}</small></label>
        <label class="field short"><span>Length</span><input class="input" id="pose-length" type="number" min="${MIN_LENGTH}" max="${MAX_LENGTH}" step="0.1" value="${this.made.length}" /></label>
        <label class="check"><input type="checkbox" id="pose-loop" ${this.made.loop ? 'checked' : ''} /> Loops</label>
        <label class="field"><span>Joint</span><select class="select" id="pose-joint">${JOINTS.map(
          (j) =>
            `<option value="${j.id}" ${j === this.joint ? 'selected' : ''}>${escape(j.name)}</option>`,
        ).join('')}</select></label>
        <label class="field"><span>To the next pose</span><select class="select" id="pose-ease" ${key ? '' : 'disabled'}>${Object.entries(
          EASE_NAMES,
        )
          .map(
            ([id, text]) =>
              `<option value="${id}" ${(key?.ease || 'smooth') === id ? 'selected' : ''}>${text}</option>`,
          )
          .join('')}</select></label>
      </div>
      <div class="pose-row pose-tools">
        <button class="button" id="pose-add" title="Add a pose at the playhead (K)">${icon('plus', 16)}Add pose</button>
        <button class="button" id="pose-remove" ${key && this.made.keys.length > 1 ? '' : 'disabled'} title="Remove the pose at the playhead (Delete)">${icon('erase', 16)}Remove</button>
        <button class="button" id="pose-copy" title="Copy the pose at the playhead">${icon('copy', 16)}Copy</button>
        <button class="button" id="pose-paste" ${this.copied ? '' : 'disabled'} title="Paste the copied pose at the playhead">Paste</button>
        <button class="button" id="pose-mirror" title="Swap left and right, as in a mirror (M)">Mirror</button>
        <button class="button" id="pose-reset-joint" title="Put the chosen joint back as the starting pose has it">${icon('reset', 16)}Reset joint</button>
        <span class="divider"></span>
        <span class="note">Take the pose from</span>
        <select class="select" id="pose-from">${clipNames()
          .map(
            (c) =>
              `<option value="${escape(c)}" ${c === this.from.clip ? 'selected' : ''}>${escape(label(c))}</option>`,
          )
          .join('')}</select>
        <span class="note">at</span>
        <input class="input tiny" id="pose-from-at" type="number" min="0" step="0.1" value="${this.from.at}" />
        <button class="button" id="pose-take">Take</button>
      </div>
      <div class="timeline">
        <button class="button icon-only" id="pose-play" title="Play or pause (Space)">${icon(this.playing ? 'pause' : 'play', 16)}</button>
        <div class="track" id="pose-track"><div class="ruler" id="pose-ruler"></div><div class="playhead" id="pose-playhead"></div></div>
        <span class="time" id="pose-time"></span>
      </div>
      <div class="pose-row end">
        <span class="note">${this.error ? `<span class="bad">${escape(this.error)}</span>` : 'Click a dot on the body to choose a joint, then drag the rings to turn it. Turning a joint between poses adds a pose there.'}</span>
        <button class="button icon-only" id="pose-undo" ${this.history.length ? '' : 'disabled'} title="Undo (Z)">${icon('undo', 16)}</button>
        <button class="button icon-only" id="pose-redo" ${this.future.length ? '' : 'disabled'} title="Redo (⇧Z)">${icon('redo', 16)}</button>
        <button class="button" id="pose-cancel">Cancel</button>
        <button class="button primary" id="pose-save" ${problem || this.error ? 'disabled' : ''}>${icon('save', 16)}${this.editing ? 'Save changes' : 'Add to the game'}</button>
      </div>`;
    this.bind();
    this.renderTimeline();
    // The stage shrinks to the space above the panel, so the whole body stays in view.
    this.stage.canvas.style.height = `calc(100% - ${this.panel.offsetHeight + 24}px)`;
  }
  renderTimeline() {
    const track = this.panel.querySelector('#pose-ruler');
    if (!track) return;
    const len = this.made.length,
      step = len > 20 ? 5 : len > 6 ? 1 : len > 2 ? 0.5 : 0.25,
      ticks = [];
    for (let t = 0; t <= len + 1e-6; t += step)
      ticks.push(`<span class="tick" style="left:${(t / len) * 100}%">${+t.toFixed(2)}</span>`);
    track.innerHTML =
      ticks.join('') +
      this.made.keys
        .map(
          (k, i) =>
            `<button class="key ${keyAt(this.made, this.time) === k ? 'active' : ''}" data-key="${i}" style="left:${(k.t / len) * 100}%" title="Pose at ${seconds(k.t)}: drag to move it"></button>`,
        )
        .join('');
    for (const b of track.querySelectorAll('[data-key]'))
      b.addEventListener('pointerdown', (e) =>
        this.dragKey(e, this.made.keys[Number(b.dataset.key)]),
      );
    this.movePlayhead();
  }
  movePlayhead() {
    const head = this.panel.querySelector('#pose-playhead'),
      time = this.panel.querySelector('#pose-time');
    if (!head) return;
    // Lined up with the ruler, which is inset from the track's ends.
    head.style.left = `calc(10px + (100% - 20px) * ${this.time / this.made.length})`;
    time.textContent = seconds(this.time) + ' / ' + seconds(this.made.length);
  }
  timeAt(event) {
    const rect = this.panel.querySelector('#pose-ruler').getBoundingClientRect();
    return snap(
      Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)) * this.made.length,
    );
  }
  // Dragging on the track moves the playhead; dragging a key moves that pose in time.
  scrub(event) {
    if (event.target.closest('[data-key]')) return;
    this.playing = false;
    const move = (e) => {
      this.seek(this.timeAt(e));
      this.renderTimeline();
    };
    move(event);
    const up = () => {
      removeEventListener('pointermove', move);
      removeEventListener('pointerup', up);
      this.render();
    };
    addEventListener('pointermove', move);
    addEventListener('pointerup', up);
  }
  dragKey(event, key) {
    event.preventDefault();
    this.playing = false;
    this.remember();
    const start = key.t;
    const move = (e) => {
      const t = this.timeAt(e);
      if (this.made.keys.some((k) => k !== key && Math.abs(k.t - t) < 0.5 / FPS)) return;
      key.t = t;
      sortKeys(this.made);
      this.seek(t);
      this.rebuild();
      this.renderTimeline();
    };
    const up = () => {
      removeEventListener('pointermove', move);
      removeEventListener('pointerup', up);
      if (key.t === start) this.history.pop();
      this.seek(key.t);
      this.render();
    };
    addEventListener('pointermove', move);
    addEventListener('pointerup', up);
  }
  bind() {
    const $ = (id) => this.panel.querySelector('#' + id),
      on = (id, run, event = 'click') => $(id)?.addEventListener(event, run);
    on(
      'pose-name',
      (e) => {
        this.name = e.target.value;
        const problem = this.editing ? null : this.api.nameProblem(this.name.trim()),
          small = $('pose-name').nextElementSibling;
        small.textContent =
          (this.name && problem) || 'Letters and digits, starting with a capital.';
        small.classList.toggle('bad', !!(problem && this.name));
        $('pose-save').disabled = !!problem || !!this.error;
      },
      'input',
    );
    on('pose-length', (e) => this.setLength(Number(e.target.value)), 'change');
    on('pose-loop', (e) => this.change(() => (this.made.loop = e.target.checked)), 'change');
    on('pose-joint', (e) => this.choose(e.target.value), 'change');
    on(
      'pose-ease',
      (e) =>
        this.change(() => {
          const key = keyAt(this.made, this.time);
          if (e.target.value === 'smooth') delete key.ease;
          else key.ease = e.target.value;
        }),
      'change',
    );
    on('pose-add', () => this.addKey());
    on('pose-remove', () => this.removeKey());
    on('pose-copy', () => this.copy());
    on('pose-paste', () => this.paste());
    on('pose-mirror', () => this.mirror());
    on('pose-reset-joint', () => this.resetJoint());
    on('pose-take', () => this.take($('pose-from').value, Number($('pose-from-at').value) || 0));
    on('pose-play', () => this.togglePlay());
    on('pose-undo', () => this.undo());
    on('pose-redo', () => this.undo(true));
    on('pose-cancel', () => this.close());
    on('pose-save', () => this.save());
    on('pose-track', (e) => this.scrub(e), 'pointerdown');
  }
  // Keys while the pose editor is open (app.js passes them on); true if used.
  key(event) {
    if (!this.open || /^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement?.tagName))
      return false;
    const k = event.key.toLowerCase();
    if (event.key === ' ') this.togglePlay();
    else if (k === 'k') this.addKey();
    else if (k === 'm') this.mirror();
    else if (k === 'z' && !event.metaKey && !event.ctrlKey) this.undo(event.shiftKey);
    else if (event.key === 'Delete' || event.key === 'Backspace') this.removeKey();
    else if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      this.playing = false;
      this.seek(snap(this.time + (event.key === 'ArrowRight' ? 1 : -1) / FPS));
      this.render();
    } else if (event.key === 'Escape') this.close();
    else return false;
    event.preventDefault();
    return true;
  }
}
