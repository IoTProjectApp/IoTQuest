// The Map Editor's 3D view: the world drawn by the game's own renderer, an orbit camera, picking,
// selection and hover outlines, the move and turn gizmo, the handles that resize the selection,
// and the see-through copy that follows the cursor while placing from the catalogue.
import * as THREE from '../../../public/vendor/three.module.min.js';
import { TransformControls } from '/editor/three/TransformControls.js';
import { OrbitControls } from '/editor/three/OrbitControls.js';
import { ThreeWorldRenderer } from '../../../public/world-renderer-three.js';
import { worldSunlight } from '../../../public/world-materials.js';
import { updateSky } from '../../../public/sky.js';
import { multiply, perspective, lookAt, screenRay } from '../../../public/world-math.js';
import {
  snapshotGroup,
  transformGroup,
  groupTemplate,
  scaleOf,
  partBounds,
} from '../../../public/world-layout.js';
import { LOCKED_LINES } from '../../../public/house-shell.js';
import { lockedParts, lockedTarget } from './locked.js';

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

// The resize handles: a square on each side and on top (axis 0 x, 1 y, 2 z; side ±1) and a round
// one on a top corner (axis null) that resizes evenly.
function resizeHandles() {
  const group = new THREE.Group(),
    square = new THREE.BoxGeometry(1, 1, 1),
    round = new THREE.SphereGeometry(0.75, 16, 12);
  for (const [axis, side, colour] of [
    [0, 1, 0xffffff],
    [0, -1, 0xffffff],
    [2, 1, 0xffffff],
    [2, -1, 0xffffff],
    [1, 1, 0xffffff],
    [null, 1, ACCENT],
  ]) {
    const handle = new THREE.Mesh(
      axis === null ? round : square,
      new THREE.MeshBasicMaterial({ color: colour, depthTest: false, transparent: true }),
    );
    handle.userData = { axis, side, colour };
    handle.renderOrder = 12;
    group.add(handle);
  }
  group.visible = false;
  return group;
}
// A group's size in metres: width, height and depth along its own sides.
export function dimensions(group, scale = group.placement.scale) {
  const { min, max } = group.box;
  return scaleOf(scale).map((v, i) => (max[i] - min[i]) * v);
}
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const normalise = (v) => {
  const length = Math.hypot(...v) || 1;
  return v.map((x) => x / length);
};

export class Viewport {
  constructor(
    canvas,
    {
      onPick,
      onPlace,
      onTransformEnd,
      onHover,
      onCamera,
      onResize,
      onHousePick,
      onHouseDrag,
      onHouseEnd,
      onWallMoved,
    } = {},
  ) {
    this.canvas = canvas;
    Object.assign(this, {
      onPick,
      onPlace,
      onTransformEnd,
      onHover,
      onCamera,
      onResize,
      onHousePick,
      onHouseDrag,
      onHouseEnd,
      onWallMoved,
    });
    // The House tool's selection and hover: { kind: 'wall' | 'room', id }.
    this.house = null;
    this.houseHover = null;
    this.mode = 'translate';
    this.renderer = new ThreeWorldRenderer(canvas);
    this.camera = new THREE.PerspectiveCamera((FOV * 180) / Math.PI, 1, 0.1, 900);
    this.camera.position.set(14, 22, 30);
    this.tool = 'select';
    this.snap = true;
    this.selected = null;
    this.hovered = null;
    this.ghost = null;
    // The gizmo moves this stand-in; its position and turn become the group's placement (its size
    // is the resize handles' job). YXZ keeps the turn readable in rotation.y whatever the angle.
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
      if (this.tool === 'house') {
        if (!e.value && this.dragLine) this.onHouseEnd?.(...this.dragLine);
        if (!e.value && this.dragWall) this.onWallMoved?.(...this.dragWall);
        this.dragLine = this.dragWall = null;
        return;
      }
      if (!e.value && this.selected) this.onTransformEnd?.(this.selected.id, this.proxyPlacement());
    });
    this.gizmo.addEventListener('objectChange', () => {
      if (this.tool === 'house') {
        // An added wall slides as a whole, both ends together.
        const added = this.house?.kind === 'added' && this.session.addedWall(this.house.id);
        if (added) {
          const [mx, mz] = [0, 1].map((i) => (added.from[i] + added.to[i]) / 2),
            dx = this.proxy.position.x - mx,
            dz = this.proxy.position.z - mz,
            moved = {
              ...added,
              from: [added.from[0] + dx, added.from[1] + dz],
              to: [added.to[0] + dx, added.to[1] + dz],
            };
          this.dragWall = [added.id, moved.from, moved.to];
          this.session.previewWalls(
            this.session.addedWalls().map((w) => (w.id === added.id ? moved : w)),
          );
          this.updateOutlines();
          return;
        }
        const wall = this.selectedWall();
        if (!wall) return;
        this.dragLine = [wall.line, this.proxy.position[wall.axis === 'x' ? 'z' : 'x']];
        this.onHouseDrag?.(...this.dragLine);
        this.updateOutlines();
        return;
      }
      if (!this.selected) return;
      this.session.preview(this.selected.id, this.proxyPlacement());
      this.updateOutlines();
    });
    this.selectionBox = outline(ACCENT, 1);
    this.hoverBox = outline(HOVER, 0.7);
    this.renderer.scene.add(this.selectionBox, this.hoverBox);
    this.handles = resizeHandles();
    this.renderer.scene.add(this.handles);
    this.raycaster = new THREE.Raycaster();
    // Handles are listened to before the gizmo and the camera, so grabbing one never orbits.
    this.bindHandles();
    this.bindPointer();
    this.frame = this.frame.bind(this);
    requestAnimationFrame(this.frame);
  }

  // Opens a destination (a WorldSession) and frames the house.
  setSession(session, location) {
    this.session = session;
    this.location = location;
    this.house = null;
    this.select(null);
    this.setHover(null);
    this.cancelPlacing();
    this.view('house', true);
  }
  setTool(tool) {
    this.tool = tool;
    this.cancelPlacing();
    this.setHover(null);
    this.houseHover = null;
    if (tool !== 'house') this.house = null;
    this.attachGizmo();
  }
  // 'translate' and 'rotate' use the gizmo; 'scale' shows the resize handles instead.
  setGizmoMode(mode) {
    this.mode = mode;
    if (mode !== 'scale') this.gizmo.setMode(mode);
    // Objects only turn about the vertical axis.
    this.gizmo.showX = this.gizmo.showZ = mode !== 'rotate';
    this.applySnap();
    this.attachGizmo();
  }
  setSnap(on) {
    this.snap = on;
    this.applySnap();
  }
  applySnap() {
    this.gizmo.setTranslationSnap(this.snap ? 0.1 : null);
    this.gizmo.setRotationSnap(this.snap ? Math.PI / 12 : null);
  }
  select(group) {
    this.selected = group;
    this.attachGizmo();
    this.updateOutlines();
  }
  attachGizmo() {
    if (this.tool === 'house') return this.attachWallGizmo();
    this.gizmo.showY = true;
    this.gizmo.showX = this.gizmo.showZ = this.mode !== 'rotate';
    const editing =
      this.selected && this.tool === 'select' && !this.selected.hidden && !this.selected.locked;
    if (editing && this.mode !== 'scale') {
      this.syncProxy();
      this.gizmo.attach(this.proxy);
    } else this.gizmo.detach();
    this.handles.visible = !!editing && this.mode === 'scale';
  }
  // Puts the gizmo's stand-in where the selected group is (after an undo, or a typed value).
  syncProxy() {
    const p = this.selected?.placement;
    if (!p) return;
    this.proxy.position.set(...p.pos);
    this.proxy.rotation.set(0, p.turn || 0, 0);
  }
  refresh() {
    if (
      this.selected &&
      !this.session.groups.has(this.selected.id) &&
      !(this.selected.locked && this.session.model.objects.includes(this.selected.parts[0]))
    )
      this.selected = null;
    if (this.tool === 'house' && !this.gizmo.dragging) this.attachGizmo();
    if (this.selected && !this.gizmo.dragging && !this.resizing) this.attachGizmo();
    this.updateOutlines();
  }
  proxyPlacement() {
    return {
      pos: this.proxy.position.toArray(),
      turn: this.proxy.rotation.y,
      scale: this.selected?.placement.scale ?? 1,
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
    holder.scale.set(...scaleOf(scale));
    holder.box.position.set((min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2);
    holder.box.scale.set(max[0] - min[0] + pad, max[1] - min[1] + pad, max[2] - min[2] + pad);
    if (color !== undefined) holder.box.material.color.setHex(color);
  }
  // ---- The House tool: walls and rooms ----
  // The parts that show a wall or room: a wall's, or a room's floor.
  houseParts(target) {
    const shell = this.session?.model.shell;
    if (target?.kind === 'added')
      return this.session.model.addedWalls?.find((w) => w.id === target.id)?.parts || [];
    if (!target || !shell) return [];
    if (target.kind === 'wall') return shell.walls.find((w) => w.id === target.id)?.parts || [];
    return shell.rooms.find((r) => r.id === target.id)?.parts.slice(0, 1) || [];
  }
  selectedWall() {
    return this.house?.kind === 'wall'
      ? this.session.walls().find((w) => w.id === this.house.id)
      : null;
  }
  selectHouse(target) {
    this.house = target;
    this.attachGizmo();
    this.updateOutlines();
  }
  setHouseHover(target) {
    if (JSON.stringify(target) === JSON.stringify(this.houseHover)) return;
    this.houseHover = target;
    this.updateOutlines();
    this.onHover?.(target);
  }
  // A wall on a line that can move gets a handle that slides it across the house.
  attachWallGizmo() {
    this.handles.visible = false;
    const added = this.house?.kind === 'added' && this.session.addedWall(this.house.id);
    if (added) {
      if (!this.gizmo.dragging) {
        const height = added.height ?? 1.1;
        this.proxy.position.set(
          (added.from[0] + added.to[0]) / 2,
          height + 0.3,
          (added.from[1] + added.to[1]) / 2,
        );
        this.proxy.rotation.set(0, 0, 0);
      }
      this.gizmo.setMode('translate');
      this.gizmo.showY = false;
      this.gizmo.showX = this.gizmo.showZ = true;
      this.gizmo.attach(this.proxy);
      return;
    }
    const wall = this.selectedWall();
    if (!wall || !this.session.houseInfo().whole || LOCKED_LINES[wall.line]) {
      this.gizmo.detach();
      return;
    }
    if (!this.gizmo.dragging) {
      const middle = (wall.from + wall.to) / 2,
        top = wall.height + 0.3;
      this.proxy.position.set(
        ...(wall.axis === 'x' ? [middle, top, wall.at] : [wall.at, top, middle]),
      );
      this.proxy.rotation.set(0, 0, 0);
    }
    this.gizmo.setMode('translate');
    this.gizmo.showY = false;
    this.gizmo.showX = wall.axis === 'z';
    this.gizmo.showZ = wall.axis === 'x';
    this.gizmo.attach(this.proxy);
  }
  // The wall or room floor under the cursor.
  pickHouse(event) {
    const ray = this.ray(event),
      shell = this.session?.model.shell || { walls: [], rooms: [] };
    if (!ray) return null;
    const info = this.session.houseInfo();
    let best = null,
      nearest = Infinity;
    const consider = (target, parts) => {
      for (const part of parts) {
        const t = rayPart(ray, part);
        if (t < nearest) {
          nearest = t;
          best = target;
        }
      }
    };
    for (const wall of shell.walls)
      if (info.walls.includes(wall.id)) consider({ kind: 'wall', id: wall.id }, wall.parts);
    for (const room of shell.rooms)
      if (info.rooms.includes(room.id))
        consider({ kind: 'room', id: room.id }, room.parts.slice(0, 1));
    for (const wall of this.session.model.addedWalls || [])
      consider({ kind: 'added', id: wall.id }, wall.parts);
    return best;
  }
  // Fits a wire box around parts (a wall's or a floor's).
  fitParts(holder, parts, color) {
    holder.visible = parts.length > 0;
    if (!holder.visible) return;
    const { min, max } = partBounds(parts),
      pad = 0.06;
    holder.position.set(0, 0, 0);
    holder.rotation.set(0, 0, 0);
    holder.scale.set(1, 1, 1);
    holder.box.position.set((min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2);
    holder.box.scale.set(max[0] - min[0] + pad, max[1] - min[1] + pad, max[2] - min[2] + pad);
    holder.box.material.color.setHex(color);
  }
  updateOutlines() {
    if (this.tool === 'house') {
      this.fitParts(this.selectionBox, this.houseParts(this.house), ACCENT);
      const same = JSON.stringify(this.houseHover) === JSON.stringify(this.house);
      this.fitParts(this.hoverBox, same ? [] : this.houseParts(this.houseHover), HOVER);
      return;
    }
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
    // Parts that stay put can be clicked too, where nothing movable is under the cursor (a tree on
    // a hillside is the tree): the inspector says why they do not move.
    if (best) return best;
    let locked = null;
    for (const part of lockedParts(this.session)) {
      if ((part.opacity ?? 1) < 0.5) continue;
      const t = rayPart(ray, part);
      if (t < nearest) {
        nearest = t;
        locked = part;
      }
    }
    if (!locked) return best;
    if (this.hovered?.locked && this.hovered.parts[0] === locked) return this.hovered;
    if (this.selected?.locked && this.selected.parts[0] === locked) return this.selected;
    return lockedTarget(locked);
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
      else if (!this.gizmo.dragging && !down && this.tool === 'house')
        this.setHouseHover(this.pickHouse(e));
    });
    c.addEventListener('pointerleave', () => {
      this.setHover(null);
      this.setHouseHover(null);
    });
    c.addEventListener('pointerup', (e) => {
      const click =
        down && down.button === 0 && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 5;
      down = null;
      // A press on the gizmo is a drag of the object, never a click.
      if (!click || this.gizmo.axis) return;
      if (this.ghost) this.onPlace?.(this.ghost.source, this.ghost.placement, e.shiftKey);
      else if (this.tool === 'house') this.onHousePick?.(this.pickHouse(e));
      else if (this.tool === 'select' || this.tool === 'erase') this.onPick?.(this.pick(e), e);
    });
  }

  // Resize handles: a square on each side and the top of the selection's box stretches it that way
  // (the opposite side stays put); the round one on a top corner, or Shift on any, resizes it
  // evenly. Each keeps the same size on screen.
  placeHandles() {
    if (!this.handles.visible || !this.selected) return;
    const group = this.selected,
      { min, max } = group.box,
      { pos, turn = 0 } = group.placement,
      scale = scaleOf(group.placement.scale),
      c = Math.cos(turn),
      s = Math.sin(turn);
    for (const handle of this.handles.children) {
      const { axis, side } = handle.userData,
        local = [0, 1, 2].map(
          (i) =>
            (axis === null
              ? max[i]
              : i === axis
                ? side > 0
                  ? max[i]
                  : min[i]
                : (min[i] + max[i]) / 2) * scale[i],
        ),
        at = [
          pos[0] + local[0] * c + local[2] * s,
          pos[1] + local[1],
          pos[2] - local[0] * s + local[2] * c,
        ];
      handle.position.set(...at);
      handle.rotation.set(0, turn, 0);
      handle.scale.setScalar(this.camera.position.distanceTo(handle.position) * 0.02);
      // A side whose box is flat (a rug's height) has nothing to stretch.
      handle.visible = axis === null || max[axis] - min[axis] > 1e-3;
      handle.material.color.setHex(handle === this.hotHandle ? HOVER : handle.userData.colour);
    }
  }
  handleAt(event) {
    if (!this.handles.visible) return null;
    const r = this.canvas.getBoundingClientRect();
    this.camera.updateMatrixWorld();
    this.raycaster.setFromCamera(
      new THREE.Vector2(
        ((event.clientX - r.left) / r.width) * 2 - 1,
        -((event.clientY - r.top) / r.height) * 2 + 1,
      ),
      this.camera,
    );
    return (
      this.raycaster.intersectObjects(this.handles.children.filter((h) => h.visible))[0]?.object ||
      null
    );
  }
  bindHandles() {
    const c = this.canvas,
      capture = { capture: true };
    c.addEventListener(
      'pointerdown',
      (e) => {
        if (e.button !== 0 || !this.selected) return;
        const handle = this.handleAt(e);
        if (!handle) return;
        e.stopImmediatePropagation();
        c.setPointerCapture(e.pointerId);
        this.startResize(handle, e);
      },
      capture,
    );
    c.addEventListener(
      'pointermove',
      (e) => {
        if (this.resizing) {
          e.stopImmediatePropagation();
          this.resize(e);
          return;
        }
        const hot = this.handleAt(e);
        if (hot !== this.hotHandle) {
          this.hotHandle = hot;
          c.style.cursor = hot ? (hot.userData.axis === null ? 'nwse-resize' : 'grab') : '';
        }
      },
      capture,
    );
    c.addEventListener(
      'pointerup',
      (e) => {
        if (!this.resizing) return;
        e.stopImmediatePropagation();
        const { group, placement } = this.resizing;
        this.resizing = null;
        if (placement) this.onTransformEnd?.(group.id, placement);
      },
      capture,
    );
  }
  // The line a handle is dragged along, in the world: its side's direction (or, for the corner,
  // out from the base centre through it), from where the handle was grabbed.
  startResize(handle, event) {
    const group = this.selected,
      start = {
        ...group.placement,
        pos: [...group.placement.pos],
        scale: scaleOf(group.placement.scale),
      },
      { axis, side } = handle.userData,
      turn = start.turn || 0,
      c = Math.cos(turn),
      s = Math.sin(turn),
      local = axis === 0 ? [side, 0, 0] : axis === 2 ? [0, 0, side] : axis === 1 ? [0, 1, 0] : null,
      origin = handle.position.toArray(),
      direction = local
        ? [local[0] * c + local[2] * s, local[1], -local[0] * s + local[2] * c]
        : normalise(origin.map((v, i) => v - start.pos[i]));
    this.resizing = { group, handle, start, origin, direction, placement: null };
    this.resizing.from = this.alongLine(event);
  }
  // How far along the drag line the cursor's ray passes closest to it.
  alongLine(event) {
    const ray = this.ray(event),
      { origin, direction } = this.resizing;
    if (!ray) return 0;
    const dir = normalise(ray.dir),
      w = origin.map((v, i) => v - ray.origin[i]),
      b = dot(direction, dir),
      denominator = 1 - b * b;
    if (Math.abs(denominator) < 1e-6) return this.resizing.from ?? 0;
    return (b * dot(dir, w) - dot(direction, w)) / denominator;
  }
  resize(event) {
    const r = this.resizing,
      { group, start } = r,
      { axis, side } = r.handle.userData,
      { min, max } = group.box,
      moved = this.alongLine(event) - r.from,
      even = axis === null || event.shiftKey,
      // The measured side: the dragged one, or (resizing evenly from the corner) the widest.
      i = axis ?? [0, 1, 2].reduce((a, k) => (max[k] - min[k] > max[a] - min[a] ? k : a), 0),
      extent = max[i] - min[i],
      before = extent * start.scale[i],
      // From the corner the drag runs diagonally: count its share along the measured side.
      grow =
        axis === null ? (moved * before) / Math.hypot(...dimensions(group, start.scale)) : moved;
    let after = Math.max(0.05, before + grow);
    if (this.snap) after = Math.max(0.05, Math.round(after / 0.05) * 0.05);
    const factor = after / before,
      scale = even
        ? start.scale.map((v) => v * factor)
        : start.scale.map((v, k) => (k === i ? v * factor : v)),
      pos = [...start.pos];
    if (!even) {
      // Keep the opposite side where it was: move the base centre by how far that side would shift.
      const fixed = side > 0 ? min[i] : max[i],
        shift = fixed * (start.scale[i] - scale[i]),
        turn = start.turn || 0,
        local = [0, 0, 0];
      local[i] = shift;
      pos[0] += local[0] * Math.cos(turn) + local[2] * Math.sin(turn);
      pos[1] += local[1];
      pos[2] += -local[0] * Math.sin(turn) + local[2] * Math.cos(turn);
    }
    r.placement = { pos, turn: start.turn, scale };
    this.session.preview(group.id, r.placement);
    this.updateOutlines();
    this.onResize?.(group, r.placement);
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
    const size = Math.max(...dimensions(group));
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
    this.placeHandles();
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
