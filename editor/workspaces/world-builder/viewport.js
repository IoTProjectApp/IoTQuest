// World Builder 3D Viewport: wraps ThreeWorldRenderer with Orbit & First-Person cameras,
// Grid & Axis helpers, TransformControls gizmo (move, rotate, scale), multi-selection outlines,
// terrain brush cursor, building footprint drag box, road control-point preview,
// Play Mode walkable surface & collider checks, and GLB/GLTF model loading.
import * as THREE from '../../../public/vendor/three.module.min.js';
import { TransformControls } from '/editor/three/TransformControls.js';
import { OrbitControls } from '/editor/three/OrbitControls.js';
import { GLTFLoader } from '/editor/three/loaders/GLTFLoader.js';
import { ThreeWorldRenderer } from '../../../public/world-renderer-three.js';
import { worldSunlight } from '../../../public/world-materials.js';
import { updateSky } from '../../../public/sky.js';
import { multiply, perspective, lookAt, screenRay } from '../../../public/world-math.js';
import { partBounds } from '../../../public/world-layout.js';
import { terrainHeightAt, terrainSurface } from '../../../public/world-builder/terrain.js';

const FOV = 0.82;
const ACCENT = 0x4f9cf9;
const HOVER = 0xbfd9ff;
const DANGER = 0xef6b6b;
const TERRAIN_BRUSH_COLOR = 0x5fd38a;

// Ray-OBB intersection distance for picking 3D parts
function rayPart(ray, part) {
  const [rx, ry, rz] = part.rotation || [0, 0, 0],
    cx = Math.cos(rx),
    sx = Math.sin(rx),
    cy = Math.cos(ry),
    sy = Math.sin(ry),
    cz = Math.cos(rz),
    sz = Math.sin(rz),
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
      half = Math.max(part.size[i] / 2, 0.04);
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

function makeWireBox(color, opacity = 1) {
  const box = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)),
    new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthTest: false }),
  );
  box.renderOrder = 12;
  const holder = new THREE.Group();
  holder.add(box);
  holder.visible = false;
  holder.box = box;
  return holder;
}

function makeBrushRing() {
  const segments = 48;
  const pts = [];
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    pts.push(new THREE.Vector3(Math.cos(a), 0, Math.sin(a)));
  }
  const geom = new THREE.BufferGeometry().setFromPoints(pts);
  const loop = new THREE.LineLoop(
    geom,
    new THREE.LineBasicMaterial({
      color: TERRAIN_BRUSH_COLOR,
      transparent: true,
      opacity: 0.9,
      depthTest: false,
    }),
  );
  loop.renderOrder = 14;
  loop.visible = false;
  return loop;
}

export class WorldBuilderViewport {
  constructor(
    canvas,
    {
      onPick,
      onPlace,
      onTransformEnd,
      onTerrainStroke,
      onFootprintDraw,
      onRoadPointAdd,
      onPlayInteract,
      onHover,
      onCameraChange,
    } = {},
  ) {
    this.canvas = canvas;
    Object.assign(this, {
      onPick,
      onPlace,
      onTransformEnd,
      onTerrainStroke,
      onFootprintDraw,
      onRoadPointAdd,
      onPlayInteract,
      onHover,
      onCameraChange,
    });

    this.renderer = new ThreeWorldRenderer(canvas);
    this.camera = new THREE.PerspectiveCamera((FOV * 180) / Math.PI, 1, 0.1, 1000);
    this.camera.position.set(18, 20, 28);

    this.tool = 'select'; // 'select' | 'place' | 'erase' | 'terrain' | 'footprint' | 'road' | 'spawn'
    this.gizmoMode = 'translate'; // 'translate' | 'rotate' | 'scale'
    this.snap = true;
    this.cameraMode = 'orbit'; // 'orbit' | 'first-person'
    this.moveSpeed = 12; // m/s
    this.brushRadius = 6;
    this.placingKind = null;
    this.hoveredId = null;

    // 3D Grid and Axis indicators
    this.gridHelper = new THREE.GridHelper(112, 56, 0x4f9cf9, 0x2e3540);
    this.gridHelper.position.y = 0.02;
    this.gridHelper.material.transparent = true;
    this.gridHelper.material.opacity = 0.45;
    this.renderer.scene.add(this.gridHelper);

    this.axesHelper = new THREE.AxesHelper(6);
    this.axesHelper.position.set(0, 0.05, 0);
    this.axesHelper.renderOrder = 11;
    this.renderer.scene.add(this.axesHelper);

    // Selection, Hover, Brush, Footprint, and Road preview helpers
    this.selectionBox = makeWireBox(ACCENT, 1);
    this.hoverBox = makeWireBox(HOVER, 0.75);
    this.footprintBox = makeWireBox(ACCENT, 0.9);
    this.brushRing = makeBrushRing();
    this.roadPreviewGroup = new THREE.Group();
    this.gltfGroup = new THREE.Group();
    this.renderer.world.add(this.gltfGroup);
    // The ground: one smooth mesh (terrainSurface), made again when the terrain changes.
    this.terrainMesh = new THREE.Mesh(
      new THREE.BufferGeometry(),
      new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0 }),
    );
    this.terrainMesh.receiveShadow = true;
    this.terrainMesh.castShadow = true;
    this.terrainKey = null;
    this.renderer.world.add(this.terrainMesh);
    this.renderer.scene.add(
      this.selectionBox,
      this.hoverBox,
      this.footprintBox,
      this.brushRing,
      this.roadPreviewGroup,
    );

    // TransformControls Gizmo
    this.proxy = new THREE.Object3D();
    this.proxy.rotation.order = 'YXZ';
    this.renderer.scene.add(this.proxy);

    this.gizmo = new TransformControls(this.camera, canvas);
    this.gizmo.setSpace('world');
    this.gizmo.setSize(0.9);
    this.renderer.scene.add(this.gizmo.getHelper());

    this.orbit = new OrbitControls(this.camera, canvas);
    Object.assign(this.orbit, {
      enableDamping: true,
      dampingFactor: 0.12,
      screenSpacePanning: false,
      maxPolarAngle: Math.PI / 2 - 0.02,
      minDistance: 1.5,
      maxDistance: 450,
    });
    this.orbit.target.set(0, 0, 0);

    this.gizmo.addEventListener('dragging-changed', (e) => {
      this.orbit.enabled = !e.value && this.cameraMode === 'orbit';
      if (!e.value && this.primarySelectedObject()) {
        const obj = this.primarySelectedObject();
        this.onTransformEnd?.(obj.id, this.proxyTransform(obj));
      }
    });

    this.gizmo.addEventListener('objectChange', () => {
      const obj = this.primarySelectedObject();
      if (!obj || !this.session) return;
      this.session.previewObjectTransform(obj.id, this.proxyTransform(obj));
      this.syncGLTFInstances();
      this.updateOutlines();
    });

    // First-person camera state & keyboard navigation
    this.fpYaw = 0;
    this.fpPitch = -0.15;
    this.keysDown = new Set();
    this.gltfCache = new Map();
    this.gltfLoader = new GLTFLoader();
    this.lastFrameTime = performance.now();

    this.applySnap();
    this.bindEvents();
    this.frame = this.frame.bind(this);
    requestAnimationFrame(this.frame);
  }

  setSession(session) {
    this.session = session;
    this.hoveredId = null;
    this.footprintDrag = null;
    this.roadDraftPoints = [];
    this.refresh();
  }

  primarySelectedObject() {
    if (!this.session || !this.session.selectedIds.size) return null;
    const firstId = [...this.session.selectedIds][0];
    return this.session.getObject(firstId);
  }

  setTool(tool) {
    this.tool = tool;
    this.footprintBox.visible = false;
    this.brushRing.visible = tool === 'terrain';
    if (tool !== 'road') {
      this.roadDraftPoints = [];
      this.updateRoadPreview();
    }
    this.attachGizmo();
    this.updateOutlines();
  }

  setGizmoMode(mode) {
    this.gizmoMode = mode;
    this.gizmo.setMode(mode);
    this.gizmo.showX = mode !== 'rotate' ? true : false;
    this.gizmo.showZ = mode !== 'rotate' ? true : false;
    this.gizmo.showY = true;
    this.applySnap();
    this.attachGizmo();
  }

  setSnap(enabled) {
    this.snap = !!enabled;
    this.applySnap();
  }

  applySnap() {
    this.gizmo.setTranslationSnap(this.snap ? 0.25 : null);
    this.gizmo.setRotationSnap(this.snap ? Math.PI / 12 : null);
    this.gizmo.setScaleSnap(this.snap ? 0.1 : null);
  }

  setGridVisible(visible) {
    this.gridHelper.visible = !!visible;
  }

  setAxisVisible(visible) {
    this.axesHelper.visible = !!visible;
  }

  setCameraMode(mode) {
    this.cameraMode = mode === 'first-person' ? 'first-person' : 'orbit';
    this.orbit.enabled = this.cameraMode === 'orbit' && !this.gizmo.dragging;
    if (this.cameraMode === 'first-person') {
      const dir = new THREE.Vector3();
      this.camera.getWorldDirection(dir);
      this.fpYaw = Math.atan2(dir.x, dir.z);
      this.fpPitch = Math.asin(Math.max(-0.9, Math.min(0.9, dir.y)));
      if (this.session?.mode === 'play') {
        const sp = this.session.world.spawn || [0, 0, 12];
        const y = terrainHeightAt(this.session.world.terrain, sp[0], sp[2]) + 1.68;
        this.camera.position.set(sp[0], y, sp[2]);
      }
    } else {
      const dir = new THREE.Vector3(
        Math.sin(this.fpYaw) * Math.cos(this.fpPitch),
        Math.sin(this.fpPitch),
        Math.cos(this.fpYaw) * Math.cos(this.fpPitch),
      );
      this.orbit.target.copy(this.camera.position).addScaledVector(dir, 14);
    }
    this.onCameraChange?.(this.cameraMode);
  }

  setMoveSpeed(speed) {
    this.moveSpeed = Math.max(2, Math.min(45, Number(speed) || 12));
  }

  zoom(delta) {
    if (this.cameraMode === 'orbit') {
      const offset = this.camera.position.clone().sub(this.orbit.target);
      const dist = Math.max(2, Math.min(400, offset.length() * (delta > 0 ? 0.82 : 1.22)));
      offset.normalize().multiplyScalar(dist);
      this.camera.position.copy(this.orbit.target).add(offset);
    } else {
      const forward = new THREE.Vector3(Math.sin(this.fpYaw), 0, Math.cos(this.fpYaw));
      this.camera.position.addScaledVector(forward, delta > 0 ? 3 : -3);
    }
  }

  focusSelected() {
    const obj = this.primarySelectedObject();
    if (!obj) {
      this.flyTo([0, 0, 0], 34);
      return;
    }
    const parts = this.session?.objectParts?.get(obj.id) || [];
    let span = 6;
    if (parts.length) {
      const { min, max } = partBounds(parts);
      span = Math.max(4, Math.hypot(max[0] - min[0], max[1] - min[1], max[2] - min[2]) * 1.6);
    }
    this.flyTo(obj.pos, Math.min(180, span));
  }

  flyTo(target, distance = 24) {
    if (this.cameraMode === 'first-person') {
      this.camera.position.set(target[0], target[1] + 2.2, target[2] + Math.max(4, distance * 0.4));
      this.fpYaw = Math.PI;
      this.fpPitch = -0.15;
      return;
    }
    const dir = this.camera.position.clone().sub(this.orbit.target).normalize();
    if (dir.y < 0.25) dir.set(0.45, 0.65, 0.6).normalize();
    this.flight = {
      fromTarget: this.orbit.target.clone(),
      fromEye: this.camera.position.clone(),
      target: new THREE.Vector3(...target),
      eye: new THREE.Vector3(...target).addScaledVector(dir, distance),
      start: performance.now(),
      duration: 380,
    };
  }

  proxyTransform(obj) {
    const scaleArr = this.proxy.scale.toArray().map((v) => Math.max(0.1, v));
    const uniform =
      Math.abs(scaleArr[0] - scaleArr[1]) < 0.01 && Math.abs(scaleArr[1] - scaleArr[2]) < 0.01;
    return {
      pos: this.proxy.position.toArray(),
      turn: this.proxy.rotation.y,
      scale: this.gizmoMode === 'scale' ? (uniform ? scaleArr[0] : scaleArr) : obj.scale,
    };
  }

  attachGizmo() {
    const obj = this.primarySelectedObject();
    const canTransform =
      this.session?.mode === 'edit' && this.tool === 'select' && obj && !obj.locked && !obj.hidden;
    if (canTransform) {
      this.proxy.position.set(...obj.pos);
      this.proxy.rotation.set(0, obj.turn || 0, 0);
      const s = Array.isArray(obj.scale)
        ? obj.scale
        : [obj.scale || 1, obj.scale || 1, obj.scale || 1];
      this.proxy.scale.set(s[0], s[1], s[2]);
      this.gizmo.setMode(this.gizmoMode);
      this.gizmo.showX = this.gizmoMode !== 'rotate';
      this.gizmo.showZ = this.gizmoMode !== 'rotate';
      this.gizmo.showY = true;
      this.gizmo.attach(this.proxy);
    } else {
      this.gizmo.detach();
    }
  }

  refresh() {
    if (!this.session) return;
    if (!this.gizmo.dragging) this.attachGizmo();
    this.syncTerrain();
    this.syncGLTFInstances();
    this.updateOutlines();
  }

  // The ground mesh, made again only when the heights, surfaces or the terrain layer change.
  syncTerrain() {
    const w = this.session.world,
      t = w.terrain,
      visible = w.layers?.find((l) => l.id === 'terrain')?.visible !== false;
    this.terrainMesh.visible = visible;
    const key = t ? `${t.size}|${t.extent}|${t.heights.join()}|${t.paints.join()}` : '';
    if (!t || key === this.terrainKey) return;
    this.terrainKey = key;
    const surface = terrainSurface(t),
      g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(surface.positions, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(surface.normals, 3));
    // three.js lights in linear colour: the surfaces' colours are sRGB.
    const linear = surface.colors.map((c) =>
      c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4,
    );
    g.setAttribute('color', new THREE.BufferAttribute(linear, 3));
    g.setIndex(new THREE.BufferAttribute(surface.indices, 1));
    g.computeBoundingSphere();
    this.terrainMesh.geometry.dispose();
    this.terrainMesh.geometry = g;
  }

  // Loads and syncs any imported GLB/GLTF 3D models in the scene
  syncGLTFInstances() {
    if (!this.session) return;
    const w = this.session.world;
    const assetsById = new Map((w.importedAssets || []).map((a) => [a.id, a]));

    // Load each model not yet loaded: from its bytes while they wait for a save, else its file.
    for (const asset of w.importedAssets || []) {
      if (this.gltfCache.has(asset.id)) continue;
      this.gltfCache.set(asset.id, 'loading');
      const loaded = (gltf) => {
          this.gltfCache.set(asset.id, gltf.scene);
          // Its size, so the session can give it a click target that fits.
          const box = new THREE.Box3().setFromObject(gltf.scene),
            scale = Number(asset.scale) || 1,
            size = box.getSize(new THREE.Vector3()).multiplyScalar(scale);
          this.session.modelSizes.set(asset.id, [
            Math.max(0.1, size.x),
            Math.max(0.1, size.y),
            Math.max(0.1, size.z),
            ((box.min.y + box.max.y) / 2) * scale,
          ]);
          this.session.rebuildSceneModel();
          this.syncGLTFInstances();
          this.updateOutlines();
        },
        failed = () => {
          this.gltfCache.set(asset.id, null);
          this.onModelMissing?.(asset);
        },
        bytes = this.session.modelBytes?.get(asset.id);
      if (bytes) this.gltfLoader.parse(bytes.slice().buffer, '', loaded, failed);
      else if (asset.file)
        this.gltfLoader.load('../../../public/' + asset.file, loaded, undefined, failed);
      else failed();
    }

    // Clear and repopulate rendered GLTF clones for placed imported objects
    while (this.gltfGroup.children.length) {
      this.gltfGroup.remove(this.gltfGroup.children[0]);
    }
    for (const obj of w.objects || []) {
      if (obj.hidden || !obj.kind.startsWith('imported/')) continue;
      const assetId = obj.kind.slice('imported/'.length);
      const loadedScene = this.gltfCache.get(assetId);
      const meta = assetsById.get(assetId);
      if (loadedScene && typeof loadedScene === 'object' && meta) {
        const clone = loadedScene.clone(true);
        const baseScale = Number(meta.scale) || 1;
        const objScale = Array.isArray(obj.scale)
          ? obj.scale
          : [obj.scale || 1, obj.scale || 1, obj.scale || 1];
        clone.position.set(...obj.pos);
        const [rx, ry, rz] = meta.rotation || [0, 0, 0];
        clone.rotation.set(rx, ry + (obj.turn || 0), rz);
        clone.scale.set(baseScale * objScale[0], baseScale * objScale[1], baseScale * objScale[2]);
        this.gltfGroup.add(clone);
      }
    }
  }

  updateOutlines() {
    if (!this.session || this.session.mode === 'play') {
      this.selectionBox.visible = false;
      this.hoverBox.visible = false;
      return;
    }
    // Combine parts of all selected objects
    const selectedParts = [];
    for (const id of this.session.selectedIds) {
      const parts = this.session.objectParts?.get(id);
      if (parts?.length) selectedParts.push(...parts);
    }
    this.fitPartsToBox(this.selectionBox, selectedParts, ACCENT);

    if (this.hoveredId && !this.session.selectedIds.has(this.hoveredId)) {
      const hoverParts = this.session.objectParts?.get(this.hoveredId) || [];
      this.fitPartsToBox(this.hoverBox, hoverParts, this.tool === 'erase' ? DANGER : HOVER);
    } else {
      this.hoverBox.visible = false;
    }
  }

  fitPartsToBox(holder, parts, color) {
    holder.visible = parts && parts.length > 0;
    if (!holder.visible) return;
    const { min, max } = partBounds(parts);
    const pad = 0.08;
    holder.position.set(0, 0, 0);
    holder.rotation.set(0, 0, 0);
    holder.scale.set(1, 1, 1);
    holder.box.position.set((min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2);
    holder.box.scale.set(
      Math.max(0.2, max[0] - min[0] + pad),
      Math.max(0.2, max[1] - min[1] + pad),
      Math.max(0.2, max[2] - min[2] + pad),
    );
    holder.box.material.color.setHex(color);
  }

  updateRoadPreview(cursorPoint = null) {
    while (this.roadPreviewGroup.children.length) {
      this.roadPreviewGroup.remove(this.roadPreviewGroup.children[0]);
    }
    const pts = [...(this.roadDraftPoints || [])];
    if (cursorPoint) pts.push(cursorPoint);
    if (!pts.length || !this.session) return;
    const vecs = pts.map(
      (p) =>
        new THREE.Vector3(p.x, terrainHeightAt(this.session.world.terrain, p.x, p.z) + 0.18, p.z),
    );
    for (const v of vecs) {
      const marker = new THREE.Mesh(
        new THREE.SphereGeometry(0.35, 12, 10),
        new THREE.MeshBasicMaterial({ color: ACCENT, depthTest: false }),
      );
      marker.position.copy(v);
      marker.renderOrder = 15;
      this.roadPreviewGroup.add(marker);
    }
    if (vecs.length >= 2) {
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(vecs),
        new THREE.LineBasicMaterial({ color: ACCENT, depthTest: false }),
      );
      line.renderOrder = 15;
      this.roadPreviewGroup.add(line);
    }
  }

  ray(event) {
    const r = this.canvas.getBoundingClientRect();
    if (!this.matrix || !r.width || !r.height) return null;
    return screenRay(this.matrix, event.clientX - r.left, event.clientY - r.top, r.width, r.height);
  }

  groundAt(event) {
    const ray = this.ray(event);
    if (!ray || !this.session) return null;
    let y = 0;
    for (let i = 0; i < 3; i++) {
      if (ray.dir[1] >= -1e-5) return null;
      const t = (y - ray.origin[1]) / ray.dir[1];
      if (t < 0) return null;
      const x = ray.origin[0] + ray.dir[0] * t;
      const z = ray.origin[2] + ray.dir[2] * t;
      const ground = terrainHeightAt(this.session.world.terrain, x, z);
      if (Math.abs(ground - y) < 0.02) return [x, ground, z];
      y = ground;
    }
    const t = (y - ray.origin[1]) / ray.dir[1];
    return [ray.origin[0] + ray.dir[0] * t, y, ray.origin[2] + ray.dir[2] * t];
  }

  pickObject(event) {
    const ray = this.ray(event);
    if (!ray || !this.session?.objectParts) return null;
    let bestId = null;
    let nearest = Infinity;
    for (const [id, parts] of this.session.objectParts.entries()) {
      const obj = this.session.getObject(id);
      if (!obj || obj.hidden) continue;
      for (const part of parts) {
        if ((part.opacity ?? 1) < 0.25) continue;
        const t = rayPart(ray, part);
        if (t < nearest) {
          nearest = t;
          bestId = id;
        }
      }
    }
    return bestId;
  }

  bindEvents() {
    const c = this.canvas;
    let pointerDown = null;
    let terrainPainting = false;
    let fpLooking = false;

    c.addEventListener('pointerdown', (e) => {
      c.focus();
      pointerDown = { x: e.clientX, y: e.clientY, button: e.button };

      if (this.cameraMode === 'first-person' && (e.button === 2 || e.button === 0)) {
        fpLooking = true;
      }

      if (this.session?.mode === 'edit' && e.button === 0 && !this.gizmo.axis) {
        if (this.tool === 'terrain') {
          const hit = this.groundAt(e);
          if (hit) {
            terrainPainting = true;
            this.orbit.enabled = false;
            this.onTerrainStroke?.(hit[0], hit[2], true);
          }
        } else if (this.tool === 'footprint') {
          const hit = this.groundAt(e);
          if (hit) {
            this.orbit.enabled = false;
            const step = this.snap ? 0.5 : 0.1;
            const sx = Math.round(hit[0] / step) * step;
            const sz = Math.round(hit[2] / step) * step;
            this.footprintDrag = { x1: sx, z1: sz, x2: sx + 4, z2: sz + 4, y: hit[1] };
          }
        }
      }
    });

    c.addEventListener('pointermove', (e) => {
      if (this.cameraMode === 'first-person' && fpLooking && pointerDown) {
        const dx = e.movementX || 0;
        const dy = e.movementY || 0;
        this.fpYaw -= dx * 0.004;
        this.fpPitch = Math.max(-1.2, Math.min(1.2, this.fpPitch - dy * 0.004));
      }

      const hit = this.groundAt(e);
      if (this.tool === 'terrain' && hit) {
        this.brushRing.visible = true;
        this.brushRing.position.set(hit[0], hit[1] + 0.12, hit[2]);
        this.brushRing.scale.setScalar(this.brushRadius);
        if (terrainPainting) {
          this.onTerrainStroke?.(hit[0], hit[2], false);
        }
      } else {
        this.brushRing.visible = false;
      }

      if (this.tool === 'footprint' && this.footprintDrag && hit) {
        const step = this.snap ? 0.5 : 0.1;
        this.footprintDrag.x2 = Math.round(hit[0] / step) * step;
        this.footprintDrag.z2 = Math.round(hit[2] / step) * step;
        const { x1, z1, x2, z2, y } = this.footprintDrag;
        const w = Math.max(3, Math.abs(x2 - x1));
        const d = Math.max(3, Math.abs(z2 - z1));
        this.footprintBox.visible = true;
        this.footprintBox.position.set(0, 0, 0);
        this.footprintBox.box.position.set((x1 + x2) / 2, y + 1.5, (z1 + z2) / 2);
        this.footprintBox.box.scale.set(w, 3, d);
      }

      if (this.tool === 'road' && hit) {
        const step = this.snap ? 0.5 : 0.1;
        this.updateRoadPreview({
          x: Math.round(hit[0] / step) * step,
          z: Math.round(hit[2] / step) * step,
        });
      }

      if (!pointerDown && !this.gizmo.dragging && ['select', 'erase'].includes(this.tool)) {
        const picked = this.pickObject(e);
        if (picked !== this.hoveredId) {
          this.hoveredId = picked;
          this.updateOutlines();
          this.onHover?.(picked ? this.session?.getObject(picked) : null, e);
        }
      }
    });

    c.addEventListener('pointerup', (e) => {
      fpLooking = false;
      if (terrainPainting) {
        terrainPainting = false;
        this.orbit.enabled = this.cameraMode === 'orbit';
        pointerDown = null;
        return;
      }
      if (this.footprintDrag) {
        const drag = this.footprintDrag;
        this.footprintDrag = null;
        this.footprintBox.visible = false;
        this.orbit.enabled = this.cameraMode === 'orbit';
        this.onFootprintDraw?.(drag);
        pointerDown = null;
        return;
      }

      const isClick =
        pointerDown &&
        pointerDown.button === 0 &&
        Math.hypot(e.clientX - pointerDown.x, e.clientY - pointerDown.y) < 6;
      pointerDown = null;
      if (!isClick || this.gizmo.axis) return;

      if (this.session?.mode === 'play') {
        const pickedId = this.pickObject(e);
        if (pickedId) this.onPlayInteract?.(pickedId);
        return;
      }

      if (this.tool === 'place') {
        const hit = this.groundAt(e);
        if (hit) {
          const step = this.snap ? 0.5 : 0.05;
          const pos = [Math.round(hit[0] / step) * step, 0, Math.round(hit[2] / step) * step];
          this.onPlace?.(pos, e.shiftKey);
        }
      } else if (this.tool === 'spawn') {
        const hit = this.groundAt(e);
        if (hit && this.session) {
          this.session.commit('Move player spawn point', (w) => {
            w.spawn = [Math.round(hit[0] * 2) / 2, hit[1], Math.round(hit[2] * 2) / 2];
          });
        }
      } else if (this.tool === 'road') {
        const hit = this.groundAt(e);
        if (hit) {
          const step = this.snap ? 0.5 : 0.1;
          const pt = {
            x: Math.round(hit[0] / step) * step,
            z: Math.round(hit[2] / step) * step,
          };
          this.roadDraftPoints = [...(this.roadDraftPoints || []), pt];
          this.updateRoadPreview();
          this.onRoadPointAdd?.(this.roadDraftPoints);
        }
      } else if (this.tool === 'select' || this.tool === 'erase') {
        const pickedId = this.pickObject(e);
        this.onPick?.(pickedId, e);
      }
    });

    c.addEventListener('keydown', (e) => {
      this.keysDown.add(e.code);
    });
    window.addEventListener('keyup', (e) => {
      this.keysDown.delete(e.code);
    });
  }

  stepKeyboardNavigation(dt) {
    if (!this.keysDown.size) return;
    let moveForward = 0;
    let moveRight = 0;
    let moveUp = 0;
    if (this.keysDown.has('KeyW') || this.keysDown.has('ArrowUp')) moveForward += 1;
    if (this.keysDown.has('KeyS') || this.keysDown.has('ArrowDown')) moveForward -= 1;
    if (this.keysDown.has('KeyD') || this.keysDown.has('ArrowRight')) moveRight += 1;
    if (this.keysDown.has('KeyA') || this.keysDown.has('ArrowLeft')) moveRight -= 1;
    if (this.keysDown.has('KeyE') || this.keysDown.has('Space')) moveUp += 1;
    if (this.keysDown.has('KeyQ')) moveUp -= 1;

    if (!moveForward && !moveRight && !moveUp) return;

    const stepDist = this.moveSpeed * dt;
    if (this.cameraMode === 'orbit') {
      const forward = new THREE.Vector3();
      this.camera.getWorldDirection(forward);
      forward.y = 0;
      forward.normalize();
      const right = new THREE.Vector3(-forward.z, 0, forward.x);
      const delta = new THREE.Vector3()
        .addScaledVector(forward, moveForward * stepDist)
        .addScaledVector(right, moveRight * stepDist)
        .add(new THREE.Vector3(0, moveUp * stepDist, 0));
      this.camera.position.add(delta);
      this.orbit.target.add(delta);
    } else {
      const forward = new THREE.Vector3(Math.sin(this.fpYaw), 0, Math.cos(this.fpYaw));
      const right = new THREE.Vector3(-forward.z, 0, forward.x);
      const nextPos = this.camera.position
        .clone()
        .addScaledVector(forward, moveForward * stepDist)
        .addScaledVector(right, moveRight * stepDist);

      // In Play Mode, enforce walkable terrain height and collider obstacle avoidance
      if (this.session?.mode === 'play') {
        const colliders = this.session.model?.colliders || [];
        const blocked = colliders.some(
          (col) =>
            Math.abs(nextPos.x - col.x) < col.w / 2 + 0.45 &&
            Math.abs(nextPos.z - col.z) < col.d / 2 + 0.45,
        );
        if (!blocked) {
          this.camera.position.x = nextPos.x;
          this.camera.position.z = nextPos.z;
        }
        const groundY = terrainHeightAt(
          this.session.world.terrain,
          this.camera.position.x,
          this.camera.position.z,
        );
        this.camera.position.y = groundY + 1.68;
        this.session.playerPos = this.camera.position.toArray();
      } else {
        nextPos.y += moveUp * stepDist;
        this.camera.position.copy(nextPos);
      }
    }
  }

  frame(time) {
    requestAnimationFrame(this.frame);
    const dt = Math.min(0.1, Math.max(0.001, (time - this.lastFrameTime) / 1000));
    this.lastFrameTime = time;
    if (!this.session) return;

    if (this.flight) {
      const f = this.flight;
      const k = f.duration ? Math.min(1, (time - f.start) / f.duration) : 1;
      const ease = 1 - (1 - k) ** 3;
      this.orbit.target.lerpVectors(f.fromTarget, f.target, ease);
      this.camera.position.lerpVectors(f.fromEye, f.eye, ease);
      if (k >= 1) this.flight = null;
    }

    this.stepKeyboardNavigation(dt);
    if (this.cameraMode === 'orbit') {
      this.orbit.update();
    }

    this.render(time);
  }

  render(time) {
    const c = this.canvas;
    const width = Math.max(1, c.clientWidth);
    const height = Math.max(1, c.clientHeight);
    const quality = this.session.graphicsQuality || 'high';
    const maxDpr = quality === 'low' ? 1 : quality === 'medium' ? 1.25 : 2;
    const dpr = Math.min(
      maxDpr,
      this.renderer.maxPixelRatio || 2,
      globalThis.devicePixelRatio || 1,
    );

    if (c.width !== Math.round(width * dpr) || c.height !== Math.round(height * dpr)) {
      c.width = Math.round(width * dpr);
      c.height = Math.round(height * dpr);
    }

    const eye = this.camera.position.toArray();
    let target;
    if (this.cameraMode === 'first-person') {
      target = [
        eye[0] + Math.sin(this.fpYaw) * Math.cos(this.fpPitch) * 10,
        eye[1] + Math.sin(this.fpPitch) * 10,
        eye[2] + Math.cos(this.fpYaw) * Math.cos(this.fpPitch) * 10,
      ];
    } else {
      target = this.orbit.target.toArray();
    }

    const distance = Math.hypot(eye[0] - target[0], eye[1] - target[1], eye[2] - target[2]) || 10;
    const near = 0.1;
    const far = quality === 'low' ? 400 : 900;
    this.camera.aspect = width / height;
    this.camera.near = near;
    this.camera.far = far;
    this.camera.updateProjectionMatrix();
    this.matrix = multiply(perspective(FOV, width / height, near, far), lookAt(eye, target));

    const envCfg =
      (this.session.mode === 'play' && this.session.simEnvironment) ||
      this.session.world.environment ||
      {};
    const tod = Number(envCfg.timeOfDay ?? 11.5);
    const daylight = Math.max(0.08, Math.min(1, Number(envCfg.sunlight ?? 85) / 100));
    const env = {
      light: envCfg.sunlight ?? 85,
      cloud: envCfg.fog ?? 10,
      rain: envCfg.rain ?? 0,
      wind: envCfg.wind ?? 12,
    };

    const date = new Date(Date.UTC(2026, 2, 20, 0) + (tod - 145 / 15) * 3600000);
    const model = this.session.model;
    updateSky(model.sky, daylight, time / 1000, quality === 'low', 0, env, 0, {
      eye,
      mirrored: false,
      date,
    });

    const fogFactor = (envCfg.fog || 0) / 100;
    const fogColor = [
      (0.68 * daylight + 0.05) * (1 - fogFactor * 0.2),
      (0.8 * daylight + 0.06) * (1 - fogFactor * 0.15),
      (0.92 * daylight + 0.1) * (1 - fogFactor * 0.1),
    ];

    const shadows =
      quality === 'low'
        ? []
        : (model.visualShadows || [])
            .map((caster) => ({
              caster,
              d: (caster.x - target[0]) ** 2 + (caster.z - target[2]) ** 2,
            }))
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
      fog: fogColor,
      day: daylight,
      sun: worldSunlight({ env, skyMode: 'simulated' }, model.sky?.ephemeris),
      time: time / 1000,
      shadows,
      wet: Math.min(1, (envCfg.rain || 0) / 100),
      haze: fogFactor * 0.85,
      fogOffset: Math.max(0, (1 - fogFactor) * 45),
      lights: (model.lamps || []).slice(0, 8),
      objects: model.objects,
      characters: [],
    });
  }
}
