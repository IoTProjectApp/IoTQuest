// The Map Editor's 3D view: the world drawn by the game's own renderer, an orbit camera, picking,
// selection and hover outlines, the move/rotate/scale gizmo, and the see-through copy that follows
// the cursor while placing from the catalogue.
import * as THREE from '../../../public/vendor/three.module.min.js';
import { TransformControls } from '/editor/three/TransformControls.js';
import { OrbitControls } from '/editor/three/OrbitControls.js';
import { ThreeWorldRenderer } from '../../../public/world-renderer-three.js';
import { worldSunlight } from '../../../public/world-materials.js';
import { updateSky } from '../../../public/sky.js';
import { multiply, perspective, lookAt, screenRay } from '../../../public/world-math.js';
import { snapshotGroup, transformGroup, groupTemplate } from '../../../public/world-layout.js';

const FOV = 0.82;
// A daytime sky with light cloud: what matters here is seeing shapes and colours clearly.
const ENV = { light: 80, cloud: 15, rain: 0, wind: 0 };
const ACCENT = 0x4f9cf9,
  HOVER = 0xbfd9ff,
  DANGER = 0xef6b6b;

// Distance along a ray to a mesh's rotated box, or Infinity.
function rayPart(ray, part) {
  const [rx, ry, rz] = part.rotation || [0, 0, 0],
    cx = Math.cos(rx),
    sx = Math.sin(rx),
    cy = Math.cos(ry),
    sy = Math.sin(ry),
    cz = Math.cos(rz),
    sz = Math.sin(rz),
    // Columns of Rz·Ry·Rx (see modelMatrix): the box's own axes in world space.
    axes = [
      [cy * cz, cy * sz, -sy],
      [sx * sy * cz - cx * sz, sx * sy * sz + cx * cz, sx * cy],
      [cx * sy * cz + sx * sz, cx * sy * sz - sx * cz, cx * cy],
    ],
    d = ray.origin.map((v, i) => v - part.pos[i]);
  let near = -Infinity,
    far = Infinity;
  for (let i = 0; i < 3; i++) {
    const a = axes[i],
      o = a[0] * d[0] + a[1] * d[1] + a[2] * d[2],
      v = a[0] * ray.dir[0] + a[1] * ray.dir[1] + a[2] * ray.dir[2],
      half = Math.max(part.size[i] / 2, 0.02);
    if (Math.abs(v) < 1e-12) {
      if (Math.abs(o) > half) return Infinity;
      continue;
    }
    let t0 = (-half - o) / v,
      t1 = (half - o) / v;
    if (t0 > t1) [t0, t1] = [t1, t0];
    near = Math.max(near, t0);
    far = Math.min(far, t1);
    if (near > far || far < 0) return Infinity;
  }
  return Math.max(near, 0);
}

// A wire box drawn over everything, to outline a group.
function outline(color, opacity) {
  const box = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)),
    new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthTest: false }),
  );
  box.renderOrder = 10;
  const holder = new THREE.Group();
  holder.add(box);
  holder.visible = false;
  holder.box = box;
  return holder;
}

export class Viewport {
  constructor(canvas, { onPick, onPlace, onTransformEnd, onHover, onCamera } = {}) {
    this.canvas = canvas;
    Object.assign(this, { onPick, onPlace, onTransformEnd, onHover, onCamera });
    this.renderer = new ThreeWorldRenderer(canvas);
    this.camera = new THREE.PerspectiveCamera((FOV * 180) / Math.PI, 1, 0.1, 900);
    this.camera.position.set(14, 22, 30);
    this.tool = 'select';
    this.snap = true;
    this.selected = null;
    this.hovered = null;
    this.ghost = null;
    // The gizmo moves this stand-in; its position, turn and scale become the group's placement.
    // YXZ keeps the turn readable in rotation.y whatever the angle.
    this.proxy = new THREE.Object3D();
    this.proxy.rotation.order = 'YXZ';
    this.renderer.scene.add(this.proxy);
    // The gizmo is made first so its pointer handling runs before the camera's.
    this.gizmo = new TransformControls(this.camera, canvas);
    this.gizmo.setSpace('world');
    this.gizmo.setSize(0.9);
    this.renderer.scene.add(this.gizmo.getHelper());
    this.orbit = new OrbitControls(this.camera, canvas);
    Object.assign(this.orbit, {
      enableDamping: true,
      dampingFactor: 0.12,
      screenSpacePanning: false,
      maxPolarAngle: Math.PI / 2 - 0.03,
      minDistance: 1.5,
      maxDistance: 520,
    });
    this.orbit.mouseButtons = {
      LEFT: THREE.MOUSE.ROTATE,
      MIDDLE: THREE.MOUSE.PAN,
      RIGHT: THREE.MOUSE.PAN,
    };
    this.orbit.target.set(-4, 0, -2);
    this.orbit.addEventListener('change', () => this.onCamera?.());
    this.gizmo.addEventListener('dragging-changed', (e) => {
      this.orbit.enabled = !e.value;
      if (!e.value && this.selected) this.onTransformEnd?.(this.selected.id, this.proxyPlacement());
    });
    this.gizmo.addEventListener('objectChange', () => {
      if (!this.selected) return;
      if (this.gizmo.mode === 'scale') {
        // One size factor for the whole object: whichever handle moved sets all three.
        const s = this.proxy.scale,
          last = this.lastScale ?? 1,
          moved = [s.x, s.y, s.z].reduce((a, b) =>
            Math.abs(b - last) > Math.abs(a - last) ? b : a,
          );
        s.setScalar(Math.max(0.1, moved));
        this.lastScale = s.x;
      }
      this.session.preview(this.selected.id, this.proxyPlacement());
      this.updateOutlines();
    });
    this.selectionBox = outline(ACCENT, 1);
    this.hoverBox = outline(HOVER, 0.7);
    this.renderer.scene.add(this.selectionBox, this.hoverBox);
    this.bindPointer();
    this.frame = this.frame.bind(this);
    requestAnimationFrame(this.frame);
  }

  // Opens a destination (a WorldSession) and frames the house.
  setSession(session, location) {
    this.session = session;
    this.location = location;
    this.select(null);
    this.setHover(null);
    this.cancelPlacing();
    this.view('house', true);
  }
  setTool(tool) {
    this.tool = tool;
    this.cancelPlacing();
    this.setHover(null);
    this.attachGizmo();
  }
  setGizmoMode(mode) {
    this.gizmo.setMode(mode);
    // Objects only turn about the vertical axis.
    this.gizmo.showX = this.gizmo.showZ = mode !== 'rotate';
    this.applySnap();
  }
  setSnap(on) {
    this.snap = on;
    this.applySnap();
  }
  applySnap() {
    this.gizmo.setTranslationSnap(this.snap ? 0.1 : null);
    this.gizmo.setRotationSnap(this.snap ? Math.PI / 12 : null);
    this.gizmo.setScaleSnap(this.snap ? 0.05 : null);
  }
  select(group) {
    this.selected = group;
    this.attachGizmo();
    this.updateOutlines();
  }
  attachGizmo() {
    if (this.selected && this.tool === 'select' && !this.selected.hidden) {
      this.syncProxy();
      this.gizmo.attach(this.proxy);
    } else this.gizmo.detach();
  }
  // Puts the gizmo's stand-in where the selected group is (after an undo, or a typed value).
  syncProxy() {
    const p = this.selected?.placement;
    if (!p) return;
    this.proxy.position.set(...p.pos);
    this.proxy.rotation.set(0, p.turn || 0, 0);
    this.proxy.scale.setScalar(p.scale ?? 1);
    this.lastScale = p.scale ?? 1;
  }
  refresh() {
    if (this.selected && !this.session.groups.has(this.selected.id)) this.selected = null;
    if (this.selected && !this.gizmo.dragging) this.attachGizmo();
    this.updateOutlines();
  }
  proxyPlacement() {
    return {
      pos: this.proxy.position.toArray(),
      turn: this.proxy.rotation.y,
      scale: this.proxy.scale.x,
    };
  }
  setHover(group) {
    if (this.hovered === group) return;
    this.hovered = group;
    this.updateOutlines();
    this.onHover?.(group);
  }
  // Fits a wire box to a group: its own box, turned and scaled with it.
  fit(holder, group, color) {
    holder.visible = !!group && !group.hidden;
    if (!holder.visible) return;
    const { min, max } = group.box,
      { pos, turn = 0, scale = 1 } = group.placement,
      pad = 0.04;
    holder.position.set(...pos);
    holder.rotation.set(0, turn, 0);
    holder.scale.setScalar(scale);
    holder.box.position.set((min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2);
    holder.box.scale.set(max[0] - min[0] + pad, max[1] - min[1] + pad, max[2] - min[2] + pad);
    if (color !== undefined) holder.box.material.color.setHex(color);
  }
  updateOutlines() {
    this.fit(this.selectionBox, this.selected, ACCENT);
    const hover = this.hovered !== this.selected ? this.hovered : null;
    this.fit(this.hoverBox, hover, this.tool === 'erase' ? DANGER : HOVER);
  }

  // Where the cursor's ray meets the floor or ground under it.
  groundAt(ray) {
    let y = 0;
    for (let i = 0; i < 2; i++) {
      if (ray.dir[1] >= -1e-6) return null;
      const t = (y - ray.origin[1]) / ray.dir[1],
        x = ray.origin[0] + ray.dir[0] * t,
        z = ray.origin[2] + ray.dir[2] * t;
      const floor = this.session.model.floorHeight?.(x, z) || 0;
      if (i === 1 || Math.abs(floor - y) < 1e-3) return [x, y, z];
      y = floor;
    }
    return null;
  }
  ray(event) {
    const r = this.canvas.getBoundingClientRect();
    return (
      this.matrix &&
      screenRay(this.matrix, event.clientX - r.left, event.clientY - r.top, r.width, r.height)
    );
  }
  // The nearest edit group under the cursor. See-through parts (roofs over interiors, glass) are
  // skipped so what is under them can be picked.
  pick(event) {
    const ray = this.ray(event);
    if (!ray || !this.session) return null;
    let best = null,
      nearest = Infinity;
    for (const group of this.session.groups.values()) {
      if (group.hidden) continue;
      for (const part of group.parts) {
        if ((part.opacity ?? 1) < 0.5) continue;
        const t = rayPart(ray, part);
        if (t < nearest) {
          nearest = t;
          best = group;
        }
      }
    }
    return best;
  }
  bindPointer() {
    const c = this.canvas;
    let down = null;
    c.addEventListener('pointerdown', (e) => {
      down = { x: e.clientX, y: e.clientY, button: e.button };
    });
    c.addEventListener('pointermove', (e) => {
      this.pointer = e;
      if (this.ghost) this.moveGhost(e);
      else if (!this.gizmo.dragging && !down && ['select', 'erase'].includes(this.tool))
        this.setHover(this.pick(e));
    });
    c.addEventListener('pointerleave', () => this.setHover(null));
    c.addEventListener('pointerup', (e) => {
      const click =
        down && down.button === 0 && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 5;
      down = null;
      // A press on the gizmo is a drag of the object, never a click.
      if (!click || this.gizmo.axis) return;
      if (this.ghost) this.onPlace?.(this.ghost.source, this.ghost.placement, e.shiftKey);
      else if (this.tool === 'select' || this.tool === 'erase') this.onPick?.(this.pick(e), e);
    });
  }

  // Placing from the catalogue: a see-through copy of `source` follows the cursor.
  startPlacing(source) {
    this.cancelPlacing();
    const { parts } = groupTemplate(source, source.snapshot),
      meshes = parts.map(({ shape, pos, size, color, rotation, ...looks }) =>
        this.session.model.mesh(shape, pos, size, color, {
          ...looks,
          rotation,
          opacity: (looks.opacity ?? 1) * 0.6,
        }),
      ),
      group = { parts: meshes, colliders: [], pivot: [0, 0, 0] };
    this.ghost = {
      source,
      group,
      snapshot: snapshotGroup(group),
      placement: { pos: [0, -50, 0], turn: this.ghostTurn || 0, scale: 1 },
    };
    if (this.pointer) this.moveGhost(this.pointer);
  }
  moveGhost(event) {
    const ray = this.ray(event),
      at = ray && this.groundAt(ray);
    if (!at) return;
    const step = this.snap ? 0.25 : 0;
    if (step) for (const i of [0, 2]) at[i] = Math.round(at[i] / step) * step;
    this.ghost.placement.pos = at;
    transformGroup(this.ghost.group, this.ghost.snapshot, this.ghost.placement);
  }
  turnGhost(by) {
    if (!this.ghost) return;
    this.ghostTurn = this.ghost.placement.turn = (this.ghost.placement.turn || 0) + by;
    transformGroup(this.ghost.group, this.ghost.snapshot, this.ghost.placement);
  }
  cancelPlacing() {
    if (!this.ghost) return;
    const gone = new Set(this.ghost.group.parts),
      objects = this.session.model.objects;
    objects.splice(0, objects.length, ...objects.filter((m) => !gone.has(m)));
    this.ghost = null;
  }

  // Camera presets: the house, the whole garden, or the town.
  view(where, instant = false) {
    const town = this.session?.model.community?.origin,
      presets = {
        house: { target: [-5.85, 0.4, -6], distance: 24 },
        garden: { target: [0, 0, 0], distance: 46 },
        town: { target: town ? [town.x + 30, 0, town.z] : [40, 0, 24], distance: 190 },
      };
    this.flyTo(presets[where].target, presets[where].distance, instant);
  }
  focus(group) {
    if (!group) return;
    const { min, max } = group.box,
      size =
        Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2]) * (group.placement.scale ?? 1);
    this.flyTo(group.placement.pos, Math.min(260, Math.max(4, size * 2.4)));
  }
  flyTo(target, distance, instant = false) {
    const direction = this.camera.position.clone().sub(this.orbit.target).normalize();
    if (direction.y < 0.35) direction.set(0.45, 0.75, 0.6).normalize();
    this.flight = {
      fromTarget: this.orbit.target.clone(),
      fromEye: this.camera.position.clone(),
      target: new THREE.Vector3(...target),
      eye: new THREE.Vector3(...target).addScaledVector(direction, distance),
      start: performance.now(),
      duration: instant ? 0 : 450,
    };
  }

  frame(time) {
    requestAnimationFrame(this.frame);
    if (!this.session) return;
    if (this.flight) {
      const f = this.flight,
        k = f.duration ? Math.min(1, (time - f.start) / f.duration) : 1,
        ease = 1 - (1 - k) ** 3;
      this.orbit.target.lerpVectors(f.fromTarget, f.target, ease);
      this.camera.position.lerpVectors(f.fromEye, f.eye, ease);
      if (k >= 1) this.flight = null;
      this.onCamera?.();
    }
    this.orbit.update();
    this.render(time);
  }
  render(time) {
    const c = this.canvas,
      width = Math.max(1, c.clientWidth),
      height = Math.max(1, c.clientHeight),
      dpr = Math.min(this.renderer.maxPixelRatio || 2, globalThis.devicePixelRatio || 1);
    if (c.width !== Math.round(width * dpr) || c.height !== Math.round(height * dpr)) {
      c.width = Math.round(width * dpr);
      c.height = Math.round(height * dpr);
    }
    const eye = this.camera.position.toArray(),
      target = this.orbit.target.toArray(),
      distance = this.camera.position.distanceTo(this.orbit.target),
      near = Math.max(0.05, distance * 0.004),
      far = 900;
    this.camera.aspect = width / height;
    this.camera.near = near;
    this.camera.far = far;
    this.camera.updateProjectionMatrix();
    this.matrix = multiply(perspective(FOV, width / height, near, far), lookAt(eye, target));
    const model = this.session.model,
      location = this.location,
      // Late morning where the destination is, so the sun is high in its own sky.
      date = new Date(
        Date.UTC(2026, 2, 20, 0) + (11 - (location?.longitude || 145) / 15) * 3600000,
      );
    updateSky(model.sky, 1, time / 1000, true, 0, ENV, 0, {
      eye,
      mirrored: false,
      date,
      location: location
        ? { latitude: location.latitude, longitude: location.longitude }
        : undefined,
    });
    const shadows = (model.visualShadows || [])
      .map((caster) => ({ caster, d: (caster.x - target[0]) ** 2 + (caster.z - target[2]) ** 2 }))
      .sort((a, b) => a.d - b.d)
      .slice(0, 12)
      .map(({ caster }) => caster);
    this.renderer.render({
      pixelWidth: c.width,
      pixelHeight: c.height,
      camera: { eye, target, fov: FOV, near, far, aspect: width / height, mirrored: false },
      matrix: this.matrix,
      pixelScale: height / 2 / Math.tan(FOV / 2),
      eye,
      fog: [0.69, 0.81, 0.92],
      day: 1,
      sun: worldSunlight({ env: ENV, skyMode: 'simulated' }, model.sky?.ephemeris),
      time: time / 1000,
      shadows,
      wet: 0,
      haze: 0,
      fogOffset: Math.max(0, distance - 35),
      lights: [],
      objects: model.objects,
      characters: [],
    });
  }
}
