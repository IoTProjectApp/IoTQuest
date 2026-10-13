import * as THREE from './vendor/three.module.min.js';
import { geometry } from './world-geometry.js';
import { ThreeCharacters } from './three-characters.js';
import {
  VERTEX,
  FRAGMENT,
  INSTANCE_FLOATS,
  DEFAULT_SKY_SUN,
  writeInstance,
  geometryKey,
  frustumTest,
  isSoftwareRenderer,
  color,
} from './world-renderer-webgl.js';

// The world drawn through three.js (the default; ?renderer=webgl uses world-renderer-webgl.js). The game's own objects are
// drawn with the game's own shader in instanced batches, exactly as the WebGL renderer draws them,
// so the two look the same; three.js objects such as rigged characters can then share the scene
// and its depth buffer. Takes the same frame description as WebGLWorldRenderer.render.

// The game's shader with three.js's attribute names for the shape's vertices.
const rename = (src) => src.replace(/\baPosition\b/g, 'position').replace(/\baNormal\b/g, 'normal');
const ATTRIBUTES = [
  ['iModel0', 0, 4],
  ['iModel1', 4, 4],
  ['iModel2', 8, 4],
  ['iModel3', 12, 4],
  ['iColor', 16, 4],
  ['iMaterial', 20, 3],
];

export class ThreeWorldRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.three = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    // World3D sizes the canvas itself (one pixel per CSS pixel on software WebGL).
    this.three.setPixelRatio(1);
    this.gl = this.three.getContext();
    this.software = isSoftwareRenderer(this.gl);
    this.maxPixelRatio = this.software ? 1 : 2;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera();
    // three.js objects live in model space under this group, flipped for mirrored homes.
    this.world = new THREE.Group();
    this.scene.add(this.world);
    this.batches = new THREE.Group();
    this.scene.add(this.batches);
    // Rigged people (frame.characters), lit by the game's sun and sky.
    this.drawsCharacters = true;
    // Real shadows for people where the GPU can afford them; software WebGL keeps soft shades.
    this.three.shadowMap.enabled = !this.software;
    this.three.shadowMap.type = THREE.PCFSoftShadowMap;
    this.characters = new ThreeCharacters(this.world, {
      lowDetail: this.software,
      shadows: !this.software,
    });
    this.sunLight = new THREE.DirectionalLight();
    // The shadow covers the people near the camera's target.
    Object.assign(this.sunLight.shadow.camera, {
      left: -20,
      right: 20,
      top: 20,
      bottom: -20,
      near: 1,
      far: 120,
    });
    this.sunLight.shadow.mapSize.set(2048, 2048);
    this.sunLight.shadow.bias = -0.0005;
    this.sunLight.shadow.normalBias = 0.02;
    this.skyLight = new THREE.HemisphereLight();
    this.scene.add(this.sunLight, this.sunLight.target, this.skyLight);
    this.clear = new THREE.Color();
    this.uniforms = {
      uViewProjection: { value: new THREE.Matrix4() },
      uSun: { value: new THREE.Vector3() },
      uSunColor: { value: new THREE.Vector3() },
      uSunStrength: { value: 0 },
      uTime: { value: 0 },
      uShadowBoxes: { value: new Float32Array(48) },
      uShadowInfo: { value: new Float32Array(48) },
      uDay: { value: 1 },
      uWet: { value: 0 },
      uEye: { value: new THREE.Vector3() },
      uFog: { value: new THREE.Vector3() },
      uHaze: { value: 0 },
      uFogOffset: { value: 0 },
      uLights: { value: new Float32Array(24) },
      uLightColor: { value: new Float32Array(24) },
      uLightRange: { value: new Float32Array(8) },
    };
    this.materials = new Map();
    this.skySuns = new WeakMap();
    this.skySunCount = 0;
    this.geometries = {};
    this.slots = new Map();
  }
  // three.js rebuilds its own resources when a lost context is restored.
  restore() {}
  // One material per kind of draw: opaque or blended, and the shader's celestial mode (0 world,
  // 1 moon lit by its own sun direction, 2 other sky objects).
  material(transparent, celestial, skySun) {
    const key =
      transparent + ':' + celestial + ':' + (celestial === 1 ? this.skySunId(skySun) : '');
    let m = this.materials.get(key);
    if (!m) {
      m = new THREE.RawShaderMaterial({
        vertexShader: rename(VERTEX),
        fragmentShader: rename(FRAGMENT),
        uniforms: {
          ...this.uniforms,
          uCelestial: { value: celestial },
          uSkySun: { value: new THREE.Vector3(...(skySun || DEFAULT_SKY_SUN)) },
        },
        side: THREE.DoubleSide,
        transparent,
        depthWrite: !transparent,
      });
      this.materials.set(key, m);
    }
    if (celestial === 1) m.uniforms.uSkySun.value.set(...skySun);
    return m;
  }
  // The moon's own sun direction is one array per sky; each gets a material of its own.
  skySunId(skySun) {
    if (!this.skySuns.has(skySun)) this.skySuns.set(skySun, ++this.skySunCount);
    return this.skySuns.get(skySun);
  }
  shape(key) {
    let g = this.geometries[key];
    if (!g) {
      const { positions, normals } = geometry(key);
      g = this.geometries[key] = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      g.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    }
    return g;
  }
  // An instanced mesh for one batch, kept from frame to frame: opaque batches by their group so
  // each keeps its shape and material, blended ones by position in the back-to-front order.
  batch(slot, key, material, count) {
    let mesh = this.slots.get(slot);
    if (!mesh) {
      mesh = new THREE.Mesh(undefined, material);
      mesh.frustumCulled = false;
      this.slots.set(slot, mesh);
      this.batches.add(mesh);
    }
    // A batch that outgrows its instance buffer gets a new geometry: three.js fixes the most
    // instances a geometry can draw the first time it is drawn, so a larger buffer swapped into
    // the old geometry would still only draw that many.
    if (!mesh.geometry.instances || mesh.geometry.instances.count < count) {
      mesh.geometry.dispose();
      mesh.geometry = new THREE.InstancedBufferGeometry();
      const capacity = Math.max(16, Math.ceil(count * 1.5)),
        instances = new THREE.InstancedInterleavedBuffer(
          new Float32Array(capacity * INSTANCE_FLOATS),
          INSTANCE_FLOATS,
        ).setUsage(THREE.StreamDrawUsage);
      for (const [name, offset, size] of ATTRIBUTES)
        mesh.geometry.setAttribute(
          name,
          new THREE.InterleavedBufferAttribute(instances, size, offset),
        );
      mesh.geometry.instances = instances;
      mesh.shapeKey = null;
    }
    const g = mesh.geometry;
    if (mesh.shapeKey !== key) {
      const base = this.shape(key);
      g.setAttribute('position', base.attributes.position);
      g.setAttribute('normal', base.attributes.normal);
      mesh.shapeKey = key;
    }
    mesh.material = material;
    mesh.visible = true;
    g.instanceCount = count;
    return mesh;
  }
  render(frame) {
    const u = this.uniforms,
      { camera } = frame;
    this.three.setSize(frame.pixelWidth, frame.pixelHeight, false);
    this.clear.setRGB(...frame.fog, THREE.SRGBColorSpace);
    this.three.setClearColor(this.clear, 1);
    u.uViewProjection.value.fromArray(frame.matrix);
    u.uDay.value = frame.day;
    u.uSun.value.set(...frame.sun.direction);
    u.uSunColor.value.set(...frame.sun.color);
    u.uSunStrength.value = frame.sun.strength;
    u.uTime.value = frame.time;
    u.uShadowBoxes.value.fill(0);
    u.uShadowInfo.value.fill(0);
    frame.shadows.forEach((c, i) => {
      u.uShadowBoxes.value.set([c.x, c.z, c.w / 2, c.d / 2], i * 4);
      u.uShadowInfo.value.set([c.h, c.opacity, 0, 0], i * 4);
    });
    u.uWet.value = frame.wet;
    u.uEye.value.set(...frame.eye);
    u.uFog.value.set(...frame.fog);
    u.uHaze.value = frame.haze;
    u.uFogOffset.value = frame.fogOffset;
    u.uLights.value.fill(0);
    u.uLightColor.value.fill(0);
    u.uLightRange.value.fill(5.5);
    for (let i = 0; i < 8; i++) {
      const lamp = frame.lights[i];
      u.uLights.value.set(lamp ? lamp.pos : [0, -1000, 0], i * 3);
      if (lamp) {
        u.uLightColor.value.set(lamp.color, i * 3);
        u.uLightRange.value[i] = lamp.range;
      }
    }
    // The same camera as the frame's matrix, for three.js objects.
    this.camera.position.set(...camera.eye);
    this.camera.lookAt(...camera.target);
    this.camera.fov = (camera.fov * 180) / Math.PI;
    this.camera.aspect = camera.aspect;
    this.camera.near = camera.near;
    this.camera.far = camera.far;
    this.camera.updateProjectionMatrix();
    this.world.scale.x = camera.mirrored ? -1 : 1;
    // The same sun as the game's shader: its direction, colour and strength, dimmed at night.
    const sun = frame.sun;
    this.sunLight.position
      .set(...camera.target)
      .addScaledVector(new THREE.Vector3(...sun.direction), 50);
    this.sunLight.target.position.set(...camera.target);
    this.sunLight.color.setRGB(...sun.color, THREE.SRGBColorSpace);
    this.sunLight.intensity = 3.4 * sun.strength * frame.day;
    // No shadows from a sun that has set (or under thick cloud).
    this.sunLight.castShadow = this.three.shadowMap.enabled && sun.strength * frame.day > 0.08;
    this.skyLight.color.setRGB(...frame.fog, THREE.SRGBColorSpace);
    this.skyLight.groundColor.setRGB(0.32, 0.3, 0.24, THREE.SRGBColorSpace);
    // Generous fill, as the game's own shader lights its scenes: people should read clearly.
    this.skyLight.intensity = 0.7 + 1.9 * frame.day;
    // Visible objects, opaque and blended, with the shape each is drawn with at its size on screen.
    const visible = frustumTest(frame.matrix, frame.pixelScale),
      opaque = new Map(),
      transparent = [],
      keys = new Map();
    // People on screen and large enough to see: only they are loaded and drawn (skinning is the
    // costly part on software WebGL); the rest keep their stand-in figures, culled like any object.
    // People under about 14 pixels across (the town overview) stay as their simple figures.
    const shown = (frame.characters || []).filter(
      (c) => visible({ pos: [c.x, c.y + 0.9, c.z], size: [1.2, 1.9, 1.2] }) >= 14,
    );
    const hidden = this.characters.update(shown, frame.eye);
    for (const m of frame.objects) {
      if (hidden.has(m)) continue;
      const alpha = (m.opacity ?? 1) * color(m.color)[3];
      if (alpha < 0.001) continue;
      const pixels = visible(m);
      if (!pixels) continue;
      const key = geometryKey(m, pixels);
      keys.set(m, key);
      if (alpha < 0.99) transparent.push(m);
      else {
        const celestial = m.moonSurface ? 1 : m.sky ? 2 : 0,
          group = key + '|' + celestial + '|' + (celestial === 1 ? this.skySunId(m.skySun) : '');
        if (!opaque.has(group)) opaque.set(group, []);
        opaque.get(group).push(m);
      }
    }
    for (const mesh of this.slots.values()) mesh.visible = false;
    const draw = (slot, list, transparentPass, order) => {
      const m0 = list[0],
        celestial = m0.moonSurface ? 1 : m0.sky ? 2 : 0,
        mesh = this.batch(
          slot,
          keys.get(m0),
          this.material(transparentPass, celestial, m0.skySun),
          list.length,
        );
      const instances = mesh.geometry.instances;
      list.forEach((m, i) => writeInstance(m, instances.array, i * INSTANCE_FLOATS));
      // Upload only the instances drawn this frame.
      instances.clearUpdateRanges();
      instances.addUpdateRange(0, list.length * INSTANCE_FLOATS);
      instances.needsUpdate = true;
      mesh.renderOrder = order;
    };
    // Opaque: one batch per shape (sky objects after the world, as before).
    for (const [group, list] of opaque) draw(group, list, false, group.includes('|0|') ? 0 : 1);
    // Blended: back to front, consecutive objects of one kind sharing a batch so order holds.
    const eye = frame.eye,
      depth = new Map();
    for (const m of transparent)
      depth.set(m, (m.pos[0] - eye[0]) ** 2 + (m.pos[1] - eye[1]) ** 2 + (m.pos[2] - eye[2]) ** 2);
    transparent.sort((a, b) => depth.get(b) - depth.get(a));
    let run = [],
      order = 2;
    const flush = () => {
      draw('blend:' + order, run, true, order);
      order++;
      run = [];
    };
    const kind = (m) =>
      keys.get(m) +
      (m.moonSurface ? '|1' : m.sky ? '|2' : '|0') +
      (m.skySun ? '|' + this.skySunId(m.skySun) : '');
    for (const m of transparent) {
      if (run.length && kind(run[0]) !== kind(m)) flush();
      run.push(m);
    }
    if (run.length) flush();
    this.three.render(this.scene, this.camera);
  }
  dispose() {
    for (const mesh of this.slots.values()) mesh.geometry.dispose();
    for (const g of Object.values(this.geometries)) g.dispose();
    for (const m of this.materials.values()) m.dispose();
    this.characters.dispose();
    this.three.dispose();
  }
}
