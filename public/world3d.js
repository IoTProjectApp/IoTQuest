import {
  SURFACE,
  MATERIAL_GLSL,
  surfaceForMesh,
  prepareWorldMaterials,
  worldSunlight,
} from './world-materials.js';
import { addCommunityWorld, updateCommunityWorld } from './community-world.js';
import { updateLandscape } from './landscape.js';
import { addDeviceDetails } from './device-objects.js';
import { locationById } from './locations.js';
import { skyTime, DEFAULT_OBSERVER } from './astronomy.js';
import { geometry, roundedObject, LOW_DETAIL_SHAPES } from './world-geometry.js';
import {
  multiply,
  perspective,
  lookAt,
  modelMatrix,
  projectPoint,
  toWorld,
  fromWorld,
  clamp,
  resolveMove,
  findFree,
  deviceState,
  deviceSpots,
  communityRoomBounds,
  screenRay,
  rayBox,
} from './world-math.js';
import { createWorldModel } from './world-model.js';
import { createRegionalModel } from './regions.js';
import { updateClouds } from './clouds.js';
// Left-right flip used to draw mirrored homes.
const MIRROR = new Float32Array([-1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
import { weatherEffects } from './weather.js';
import { updateSky, lightningFlash } from './sky.js';
import { updateAnimals } from './animals.js';
import { updateFarm } from './farm-assets.js';
// Each object's transform, colour and material arrive as vertex attributes: per instance when
// many objects of one shape are drawn in a single call, or as constant values for one object.
// The model matrix columns carry the object's size in their w components (always 0 otherwise).
const VERTEX = `attribute vec3 aPosition; attribute vec3 aNormal;
attribute vec4 iModel0; attribute vec4 iModel1; attribute vec4 iModel2; attribute vec4 iModel3;
attribute vec4 iColor; attribute vec3 iMaterial;
uniform mat4 uViewProjection;
varying vec3 vNormal; varying vec3 vWorld; varying vec3 vLocal; varying vec3 vLocalNormal;
varying vec4 vColor; varying vec3 vMaterial;
void main(){
  vec3 size=vec3(iModel0.w,iModel1.w,iModel2.w);
  mat4 model=mat4(vec4(iModel0.xyz,0.0),vec4(iModel1.xyz,0.0),vec4(iModel2.xyz,0.0),iModel3);
  vec4 world=model*vec4(aPosition,1.0);
  vec3 squared=size*size;
  squared=mix(squared,vec3(1.0),step(squared,vec3(0.0)));
  vWorld=world.xyz;vLocal=aPosition*size;vLocalNormal=aNormal;
  vNormal=(model*vec4(aNormal/squared,0.0)).xyz;
  vColor=iColor;vMaterial=iMaterial;
  gl_Position=uViewProjection*world;
}`;
const FRAGMENT = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
varying vec3 vNormal;
varying vec3 vWorld;
varying vec3 vLocal;
varying vec3 vLocalNormal;
varying vec4 vColor;
varying vec3 vMaterial;
#define uColor vColor
#define uSurface vMaterial.x
#define uRoughness vMaterial.y
#define uEmission vMaterial.z
uniform vec3 uSun;
uniform vec3 uSunColor;
uniform float uSunStrength;
uniform float uTime;
uniform vec4 uShadowBoxes[12];
uniform vec4 uShadowInfo[12];
uniform float uDay;
uniform float uWet;
uniform vec3 uEye;
uniform vec3 uFog;
uniform float uHaze;
uniform float uFogOffset;
uniform vec3 uLights[8];
uniform vec3 uLightColor[8];
uniform float uCelestial;
uniform vec3 uSkySun;
${MATERIAL_GLSL}
void main() {
  vec3 n = normalize(vNormal);
  if (uCelestial > 0.5) {
    vec3 surface = uColor.rgb;
    if (uCelestial < 1.5) surface *= 0.025 + 0.975 * max(0.0, dot(n, uSkySun));
    gl_FragColor = vec4(surface, uColor.a);
    return;
  }
  vec3 lightDir = normalize(uSun);
  vec3 viewDir = normalize(uEye - vWorld);
  float water = uSurface>6.5 && uSurface<7.5 ? 1.0 : 0.0;
  float glass = uSurface>7.5 && uSurface<8.5 ? 1.0 : 0.0;
  if(water>0.5 && n.y>0.6) {
    n=normalize(n+vec3(sin(vWorld.x*2.3+vWorld.z*1.2+uTime*0.65)*0.085,0.0,
      cos(vWorld.z*2.6-vWorld.x*0.7-uTime*0.5)*0.085));
  }
  vec3 base=pow(max(materialColor(uColor.rgb,n),vec3(0.0)),vec3(2.2));
  float sun = max(0.0, dot(n, lightDir))*uSunStrength;
  float shade = groundShadow(n);
  float hemisphere = n.y * 0.5 + 0.5;
  vec3 fill = mix(vec3(0.22,0.20,0.18),vec3(0.42,0.48,0.56),hemisphere);
  vec3 ambient=mix(vec3(0.025,0.035,0.06),fill,uDay);
  vec3 lit=base*(ambient*(1.0-shade*0.35)+uSunColor*sun*uDay*(1.0-shade)*0.8);
  float wet = uWet * max(0.0,n.y);
  float roughness=clamp(uRoughness-wet*0.3,0.08,1.0);
  vec3 halfDir=normalize(lightDir+viewDir);
  float specular=pow(max(0.0,dot(n,halfDir)),mix(128.0,12.0,roughness));
  lit+=uSunColor*specular*sun*uDay*(1.0-roughness)*0.45;
  float fresnel=pow(1.0-max(0.0,dot(n,viewDir)),4.0);
  vec3 reflection=pow(uFog,vec3(2.2));
  lit=mix(lit,reflection,clamp((water*0.35+glass*0.35+wet*0.16+(1.0-roughness)*0.06)*fresnel,0.0,0.55));
  if(uSurface>12.5 && uSurface<13.5) lit+=base*uSunColor*max(0.0,dot(-n,lightDir))*sun*uDay*0.16;
  for (int i=0;i<8;i++) {
    float d=distance(vWorld,uLights[i]);
    float fall=max(0.0,1.0-d/5.5);
    lit+=base*uLightColor[i]*fall*fall*2.3;
    vec3 h=normalize(normalize(uLights[i]-vWorld)+viewDir);
    lit+=uLightColor[i]*pow(max(0.0,dot(n,h)),48.0)*fall*fall*(wet+water*0.5+glass*0.4)*0.28;
  }
  lit=mix(lit,lit*0.8+vec3(0.01,0.018,0.024),wet*0.28);
  lit=mix(lit,pow(uColor.rgb,vec3(2.2))*1.45,clamp(uEmission,0.0,1.0));
  lit=pow(filmic(lit),vec3(1.0/2.2));
  float fog = smoothstep(mix(38.0, 12.0, uHaze), mix(90.0, 52.0, uHaze), max(0.0, distance(vWorld, uEye) - uFogOffset));
  gl_FragColor = vec4(mix(lit, uFog, fog * mix(0.18, 0.88, uHaze)), uColor.a);
}`;
// Parsed colours are cached (read-only) because objects are recoloured every frame.
const colorCache = new Map();
function color(hex) {
  if (Array.isArray(hex)) return hex;
  let parsed = colorCache.get(hex);
  if (!parsed) {
    if (colorCache.size > 512) colorCache.clear();
    colorCache.set(hex, (parsed = parseColor(hex)));
  }
  return parsed;
}
function parseColor(hex) {
  let h = hex.replace('#', '');
  if (h.length === 3)
    h = h
      .split('')
      .map((c) => c + c)
      .join('');
  return [
    parseInt(h.slice(0, 2), 16) / 255,
    parseInt(h.slice(2, 4), 16) / 255,
    parseInt(h.slice(4, 6), 16) / 255,
    h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1,
  ];
}
const DEFAULT_SKY_SUN = [0, 1, 0];
// Per instance: model matrix (16, with the size in three w components), colour (4), material (3).
const INSTANCE_FLOATS = 23;
const MIN_PIXEL_RADIUS = 1;
// Most simulated seconds one frame advances the community; 360× at 60 fps is about 6 s.
const MAX_SIM_STEP = 10;
const roughnessFor = (surface) =>
  surface === SURFACE.water
    ? 0.12
    : surface === SURFACE.glass
      ? 0.16
      : surface === SURFACE.steel
        ? 0.3
        : surface === SURFACE.grass
          ? 0.96
          : 0.76;
// Objects smaller than this radius on screen use the simpler shapes; their curves are a few pixels.
const LOW_DETAIL_PIXELS = 16;
const geometryKey = (m, pixels = Infinity) => {
  const low = pixels < LOW_DETAIL_PIXELS;
  if (roundedObject(m)) return low ? 'box' : 'roundedBox';
  return low && LOW_DETAIL_SHAPES.includes(m.shape) ? m.shape + ':low' : m.shape;
};
// Objects the student cannot see are skipped: the community districts double the scene, and on
// software renderers (low-end Chromebooks) each draw costs about the same however small it is.
// Each object is tested by a sphere around its unit geometry (centred, about ±0.5) against the six
// clip planes of the view-projection matrix (which includes the mirror flip). With pixelScale
// (pixels per unit at distance 1), objects under about a pixel across are skipped too, except
// sky objects such as stars and anything that glows. Returns the object's radius on screen in
// pixels (Infinity when not measured), or 0 when it is skipped.
export function frustumTest(m, pixelScale = 0) {
  const planes = [0, 1, 2].flatMap((axis) =>
    [1, -1].map((sign) => {
      const p = [0, 1, 2, 3].map((col) => m[col * 4 + 3] + sign * m[col * 4 + axis]),
        length = Math.hypot(p[0], p[1], p[2]) || 1;
      return p.map((v) => v / length);
    }),
  );
  return (o) => {
    const [x, y, z] = o.pos,
      [w, h, d] = o.size || [1, 1, 1],
      r = 0.6 * Math.hypot(w, h, d) + 0.25;
    for (const p of planes) if (p[0] * x + p[1] * y + p[2] * z + p[3] < -r) return 0;
    if (!pixelScale || o.sky || o.moonSurface || o.emission) return Infinity;
    const distance = m[3] * x + m[7] * y + m[11] * z + m[15];
    if (distance <= 0) return Infinity;
    const pixels = ((r - 0.25) * pixelScale) / distance;
    return pixels >= MIN_PIXEL_RADIUS ? pixels : 0;
  };
}
// Software WebGL (SwiftShader, llvmpipe, Microsoft's Basic Render Driver) shades every pixel on
// the CPU, so a high-density screen there costs up to four times as much for a little sharpness.
export function isSoftwareRenderer(gl) {
  try {
    const info = gl.getExtension?.('WEBGL_debug_renderer_info'),
      names = [
        info && gl.getParameter?.(info.UNMASKED_RENDERER_WEBGL),
        gl.getParameter?.(gl.RENDERER),
      ];
    return names.some(
      (name) =>
        typeof name === 'string' &&
        /swiftshader|llvmpipe|softpipe|software|basic render driver/i.test(name),
    );
  } catch {
    return false;
  }
}
export class World3D {
  constructor(canvas, { getState, onFrame, onError, onRecover, onBuildingSelect } = {}) {
    this.canvas = canvas;
    this.getState = getState;
    this.onFrame = onFrame;
    this.onBuildingSelect = onBuildingSelect;
    this.onError = onError;
    this.onRecover = onRecover;
    this.gl = canvas.getContext('webgl', {
      alpha: false,
      antialias: true,
      powerPreference: 'high-performance',
    });
    if (!this.gl)
      throw Error('WebGL is unavailable. Enable hardware acceleration to explore the 3D world.');
    this.contextRecovery = this.gl.getExtension('WEBGL_lose_context');
    this.maxPixelRatio = isSoftwareRenderer(this.gl) ? 1 : 2;
    this.model = createRegionalModel(getState?.().locationId || 'legacy');
    addCommunityWorld(this.model, locationById(getState?.().locationId));
    prepareWorldMaterials(this.model);
    this.yaw = 0.32;
    this.pitch = 0.85;
    this.distance = 130;
    this.target = [(this.model.community.origin.x + 44) / 2, 0.5, 0];
    this.currentTarget = [...this.target];
    this.currentDistance = 130;
    this.communityView = true;
    this.follow = false;
    this.overview = true;
    this.geometries = {};
    this.deviceObjects = [];
    this.deviceSignature = '';
    this.fanAngle = 0;
    this.walkPhase = 0;
    this.lastPlayer = null;
    this.heading = 0;
    this.lastTime = 0;
    this.disposed = false;
    this.controlListeners = [];
    this.visualClock = 0;
    this.drag = null;
    this.matrix = null;
    this.day = 1;
    this.contextLost = false;
    this.renderFailed = false;
    this.initGL();
    this.bindControls();
    this.frame = this.frame.bind(this);
    this.frameId = requestAnimationFrame(this.frame);
  }
  // Create the program and shared buffers; called again after a lost context is restored.
  initGL() {
    const gl = this.gl,
      compile = (type, src) => {
        const shader = gl.createShader(type);
        gl.shaderSource(shader, src);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
          throw Error(gl.getShaderInfoLog(shader));
        return shader;
      };
    this.program = gl.createProgram();
    gl.attachShader(this.program, compile(gl.VERTEX_SHADER, VERTEX));
    gl.attachShader(this.program, compile(gl.FRAGMENT_SHADER, FRAGMENT));
    // Attribute 0 is always an array (some drivers require it); instance values may be constants.
    gl.bindAttribLocation(this.program, 0, 'aPosition');
    gl.linkProgram(this.program);
    if (!gl.getProgramParameter(this.program, gl.LINK_STATUS))
      throw Error(gl.getProgramInfoLog(this.program));
    gl.useProgram(this.program);
    this.uniforms = {};
    for (const name of [
      'uTime',
      'uSun',
      'uSunColor',
      'uSunStrength',
      'uShadowBoxes[0]',
      'uShadowInfo[0]',
      'uViewProjection',
      'uDay',
      'uWet',
      'uEye',
      'uFog',
      'uHaze',
      'uFogOffset',
      'uLights[0]',
      'uLightColor[0]',
      'uCelestial',
      'uSkySun',
    ])
      this.uniforms[name] = gl.getUniformLocation(this.program, name);
    this.position = gl.getAttribLocation(this.program, 'aPosition');
    this.normal = gl.getAttribLocation(this.program, 'aNormal');
    gl.enableVertexAttribArray(this.position);
    gl.enableVertexAttribArray(this.normal);
    this.instanceAttributes = [
      ['iModel0', 4],
      ['iModel1', 4],
      ['iModel2', 4],
      ['iModel3', 4],
      ['iColor', 4],
      ['iMaterial', 3],
    ].map(([name, size]) => ({ location: gl.getAttribLocation(this.program, name), size }));
    // Instanced drawing (WebGL 1 extension, supported almost everywhere) draws every opaque object
    // of one shape in one call; without it each object is drawn on its own.
    this.instancing = gl.getExtension?.('ANGLE_instanced_arrays') || null;
    this.instanceBuffer = gl.createBuffer();
    this.instanceData = new Float32Array(INSTANCE_FLOATS * 1024);
    this.instancesEnabled = false;
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    for (const shape of [
      'box',
      'roundedBox',
      'sphere',
      'cylinder',
      'cone',
      'torus',
      'bowl',
      'vase',
      'shade',
      'mountain',
      'leaf',
      'foliage',
      'wool',
    ]) {
      const buffer = (data) => {
        const b = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, b);
        gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
        return b;
      };
      for (const low of LOW_DETAIL_SHAPES.includes(shape) ? [false, true] : [false]) {
        const g = geometry(shape, { low });
        this.geometries[low ? shape + ':low' : shape] = {
          positions: buffer(g.positions),
          normals: buffer(g.normals),
          count: g.count,
        };
      }
    }
  }
  bindControls() {
    const c = this.canvas;
    const on = (type, handler, options) => {
      c.addEventListener(type, handler, options);
      this.controlListeners.push([type, handler, options]);
    };
    // Only the pointer that started a drag steers it; a second finger would otherwise take over
    // the drag state and make the camera jump between the two touch points. A second finger
    // instead pinches: the spread between the two fingers zooms, and the first finger's position
    // keeps being tracked (without orbiting) so lifting either finger does not jump the camera.
    const other = (e) => this.drag && e.pointerId !== this.drag.id;
    const pinching = (e) => this.pinch && e.pointerId === this.pinch.id;
    const spread = () => Math.hypot(this.pinch.x - this.drag.x, this.pinch.y - this.drag.y) || 1;
    const endPinch = () => {
      this.pinch = null;
    };
    on('pointerdown', (e) => {
      if (e.button !== 0 && e.button !== 2) return;
      if (this.drag) {
        if (this.pinch || e.pointerType === 'mouse') return;
        this.pinch = { id: e.pointerId, x: e.clientX, y: e.clientY };
        this.pinch.start = spread();
        this.pinch.distance = this.distance;
        this.pinch.zoom = this.skyZoom || 1;
        // A pinch is never a click on a building.
        this.drag.travel = Infinity;
        c.setPointerCapture(e.pointerId);
        return;
      }
      this.drag = { x: e.clientX, y: e.clientY, travel: 0, button: e.button, id: e.pointerId };
      c.setPointerCapture(e.pointerId);
      c.style.cursor = 'grabbing';
      c.focus();
    });
    on('pointermove', (e) => {
      if (!this.drag) return;
      if (this.pinch && (pinching(e) || !other(e))) {
        const finger = pinching(e) ? this.pinch : this.drag;
        finger.x = e.clientX;
        finger.y = e.clientY;
        const ratio = this.pinch.start / spread();
        if (this.skyView) this.skyZoom = clamp(this.pinch.zoom / ratio, 1, 3);
        else
          this.distance = clamp(
            this.pinch.distance * ratio,
            5,
            this.communityView ? 220 : this.landscapeView ? 90 : 55,
          );
        return;
      }
      if (other(e)) return;
      const dx = e.clientX - this.drag.x,
        dy = e.clientY - this.drag.y;
      this.yaw -= dx * 0.007;
      this.pitch = clamp(
        this.pitch + dy * 0.006,
        this.skyView ? -1.55 : 0.25,
        this.skyView ? 0.15 : 1.2,
      );
      this.drag = {
        ...this.drag,
        x: e.clientX,
        y: e.clientY,
        travel: this.drag.travel + Math.hypot(dx, dy),
      };
    });
    const end = () => {
      this.drag = null;
      this.pinch = null;
      c.style.cursor = 'grab';
    };
    // Lifting the first finger of a pinch hands the drag to the second, from where it is now.
    const handOver = () => {
      const { id, x, y } = this.pinch;
      this.drag = { ...this.drag, id, x, y };
      endPinch();
    };
    on('pointerup', (e) => {
      if (pinching(e)) return endPinch();
      if (other(e)) return;
      if (this.pinch) return handOver();
      const click = this.drag?.button === 0 && this.drag.travel < 5;
      end();
      if (click && this.communityView && this.onBuildingSelect) {
        const rect = c.getBoundingClientRect();
        const type = this.pickCommunityBuilding(e.clientX - rect.left, e.clientY - rect.top);
        if (type) this.onBuildingSelect(type);
      }
    });
    const cancel = (e) => {
      if (pinching(e)) endPinch();
      else if (this.drag && !other(e)) this.pinch ? handOver() : end();
    };
    on('pointercancel', cancel);
    on('lostpointercapture', cancel);
    on('contextmenu', (e) => e.preventDefault());
    on(
      'wheel',
      (e) => {
        e.preventDefault();
        if (this.skyView) this.skyZoom = clamp((this.skyZoom || 1) - e.deltaY * 0.001, 1, 3);
        else
          this.distance = clamp(
            this.distance + e.deltaY * 0.018,
            5,
            this.communityView ? 220 : this.landscapeView ? 90 : 55,
          );
      },
      { passive: false },
    );
    on('webglcontextlost', (e) => {
      // preventDefault lets the browser restore the context; rendering resumes on restore.
      e.preventDefault();
      this.contextLost = true;
      cancelAnimationFrame(this.frameId);
      if (this.graphicsSuspended) return;
      this.onError?.(
        '3D graphics connection was lost. Waiting for it to recover; reload the page if the view does not return.',
      );
    });
    on('webglcontextrestored', () => {
      if (this.disposed) return;
      try {
        this.geometries = {};
        this.initGL();
      } catch (e) {
        this.onError?.('3D graphics could not be restored: ' + e.message + ' Reload the page.');
        return;
      }
      this.contextLost = false;
      this.renderFailed = false;
      this.onRecover?.();
      cancelAnimationFrame(this.frameId);
      this.frameId = requestAnimationFrame(this.frame);
    });
  }
  releaseGraphics() {
    if (!this.gl || this.contextLost || typeof this.contextRecovery?.loseContext !== 'function')
      return false;
    this.graphicsSuspended = true;
    this.contextLost = true;
    cancelAnimationFrame(this.frameId);
    this.contextRecovery.loseContext();
    return true;
  }
  restoreGraphics() {
    if (!this.graphicsSuspended || typeof this.contextRecovery?.restoreContext !== 'function')
      return false;
    this.graphicsSuspended = false;
    this.contextRecovery.restoreContext();
    return true;
  }
  setView(view, focus, zoom = 1) {
    if (view === 'world' || view === 'community') {
      this.communityView = true;
      this.skyView = false;
      this.landscapeView = false;
      this.follow = false;
      this.overview = true;
      this.target = [(this.model.community.origin.x + 44) / 2, 0.5, 0];
      this.distance = 130 / Math.max(0.7, zoom);
      this.pitch = 0.85;
      return;
    }
    if (view === 'sky' && !this.skyView) this.pitch = -0.35;
    else if (view === 'landscape' && !this.landscapeView) this.pitch = 0.58;
    else if (view !== 'sky' && view !== 'landscape' && (this.skyView || this.landscapeView))
      this.pitch = 0.73;
    this.communityView = view === 'community';
    this.landscapeView = view === 'landscape';
    this.skyView = view === 'sky';
    this.skyZoom = zoom;
    this.follow = false;
    this.overview = view === 'world' || view === 'landscape';
    this.target = focus ? toWorld({ x: focus[1], y: focus[2] }) : [0, 0, 0];
    this.target[1] = view === 'detail' ? 0.75 : 0.35;
    this.distance = clamp(
      (view === 'landscape'
        ? 68
        : view === 'world'
          ? 35
          : view === 'detail'
            ? {
                factory: 28,
                warehouse: 25,
                shop: 23,
                office: 24,
                roads: 14,
                parking: 22,
                residence1: 18,
                residence2: 18,
                residence3: 18,
              }[focus?.[3]?.communityType] || 11
            : 25) /
        (view === 'landscape'
          ? Math.max(0.6, zoom)
          : Math.max(
              1,
              zoom / (view === 'detail' ? 1.9 : view === 'world' || view === 'landscape' ? 1 : 1.5),
            )),
      5,
      view === 'landscape' ? 90 : 55,
    );
  }
  snapCamera() {
    this.currentTarget = [...this.target];
    this.currentDistance = this.distance;
  }
  resetCamera(view = 'world', focus = null, zoom = 1) {
    if (view === 'community') {
      this.yaw = 0.32;
      this.showCommunity();
      return;
    }
    this.yaw = 0.32;
    this.pitch =
      view === 'sky' ? -0.35 : view === 'landscape' ? 0.58 : view === 'detail' ? 0.62 : 0.73;
    this.setView(view, focus, zoom);
  }
  setFollow(value) {
    // Following the technician returns from the observer's sky camera.
    if (this.skyView) this.pitch = 0.73;
    this.skyView = false;
    this.landscapeView = false;
    this.follow = value;
    this.overview = false;
    if (value) this.distance = 11;
  }
  findMoon() {
    const moon = this.model.sky?.ephemeris?.moon;
    if (!moon || moon.altitude <= 0) return false;
    this.setView('sky', null, 3);
    this.yaw = (-moon.azimuth * Math.PI) / 180;
    this.pitch = -clamp((moon.altitude * Math.PI) / 180, 0.01, 1.5);
    return true;
  }
  setRegion(id) {
    this.indoorArea = null;
    this.drag = null;
    this.matrix = null;
    this.skyLocation = null;
    this.upgradeSignature = null;
    this.lastSimClockMs = undefined;
    this.surfaceTime = 0;
    this.model = createRegionalModel(id);
    addCommunityWorld(this.model, locationById(id));
    prepareWorldMaterials(this.model);
    this.communityView = false;
    this.streetLights = null;
    this.deviceSignature = '';
    this.deviceObjects = [];
    this.lastPlayer = null;
  }
  showCommunity() {
    this.setView('world', null);
  }
  returnToProperty() {
    this.indoorArea = null;
  }
  focusCommunityArea(name) {
    this.indoorArea = name;
  }
  nativeAreaBounds() {
    const room = this.model.rooms.find((r) => r[0] === this.indoorArea && r[3]?.community);
    return room ? communityRoomBounds(room) : null;
  }
  move(player, dir, amount) {
    const roomBounds = this.nativeAreaBounds?.(),
      // Community buildings are drawn unflipped, both in the overview and close up.
      mirrored = !!this.model.mirrored && !this.communityView && !this.indoorArea,
      screenDir = mirrored ? (dir === 'left' ? 'right' : dir === 'right' ? 'left' : dir) : dir,
      screenYaw = mirrored ? -this.yaw : this.yaw;
    if (roomBounds)
      return resolveMove(player, screenDir, amount, screenYaw, this.model.colliders, roomBounds);
    if (!mirrored) return resolveMove(player, dir, amount, this.yaw, this.model.colliders);
    return resolveMove(player, screenDir, amount, screenYaw, this.model.colliders);
  }
  findFree(player) {
    return findFree(player, this.model.colliders, this.nativeAreaBounds() || undefined);
  }
  // The building under a click: a ray from the camera through the clicked pixel is tested against
  // each building's solid box and the nearest hit wins. Works at any zoom and at the screen edges,
  // where parts of a building are off screen, and leaves road and footpath space unclickable.
  pickCommunityBuilding(x, y) {
    if (!this.communityView || !this.matrix) return null;
    const ray = screenRay(this.matrix, x, y, this.width, this.height);
    if (!ray) return null;
    const { origin, sim } = this.model.community;
    let best = null,
      nearest = Infinity;
    for (const b of sim.map.buildings) {
      const height =
          b.height ||
          (b.type === 'parking' ? 0.18 : b.type === 'office' ? 6 : b.type === 'factory' ? 5 : 4),
        cx = origin.x + b.x,
        t = rayBox(ray, [cx - b.w / 2, 0, b.z - b.d / 2], [cx + b.w / 2, height, b.z + b.d / 2]);
      if (t < nearest) {
        nearest = t;
        best = b.type;
      }
    }
    return best;
  }
  project(p) {
    return this.matrix
      ? projectPoint(this.matrix, p, this.width, this.height)
      : { x: 0, y: 0, visible: false };
  }
  frame(time) {
    if (this.disposed || this.contextLost) return;
    // Hidden (another screen, or the Code layout leaves the canvas 0×0): skip drawing and label
    // projection, but keep the loop so the view resumes as soon as it is shown again.
    // The state is read once per frame and shared with render.
    const state = this.getState();
    if (state?.visible === false || !this.canvas.clientWidth || !this.canvas.clientHeight) {
      this.lastTime = time;
      this.frameId = requestAnimationFrame(this.frame);
      return;
    }
    const dt = Math.min(0.05, Math.max(0.001, (time - this.lastTime) / 1000));
    this.lastTime = time;
    try {
      this.render(time / 1000, dt, state);
      if (this.renderFailed) {
        this.renderFailed = false;
        this.onRecover?.();
      }
    } catch (e) {
      // Report once per failure streak and keep the loop alive so a transient fault can recover.
      if (!this.renderFailed)
        this.onError?.(
          '3D rendering error: ' +
            e.message +
            '. Retrying automatically; reload the page if the view stays blank.',
        );
      this.renderFailed = true;
    }
    this.frameId = requestAnimationFrame(this.frame);
  }
  syncDevices(state) {
    // Upgrades add colliders, so devices find their spots again when the upgrades change.
    const signature = JSON.stringify([
      this.upgradeSignature,
      state.devices.map((d) => [d.id, d.area, d.pin]),
    ]);
    if (signature === this.deviceSignature) return;
    this.deviceSignature = signature;
    const kept = this.model.objects.filter((o) => !o.device);
    this.model.objects.splice(0, this.model.objects.length, ...kept);
    this.deviceObjects = [];
    const spots = deviceSpots(state.devices, state.areas, this.model.colliders, this.model.rooms);
    for (const d of state.devices) {
      const { x, z } = spots.get(d),
        h = this.model.floorHeight?.(x, z) || 0;
      const extra = { device: d.id, devicePin: d.pin };
      const holder = this.model.box(
        x,
        0.45 + h,
        z,
        0.28,
        0.38,
        0.22,
        d.output ? '#829e86' : '#d1bb88',
        extra,
      );
      const face = this.model.box(x, 0.64 + h, z, 0.26, 0.05, 0.22, '#e3c67d', extra);
      this.deviceObjects.push({ device: d, x, z, holder, face, parts: [] });
      const record = this.deviceObjects.at(-1);
      if (['led', 'porch', 'rgb', 'streetLight', 'warningLight'].includes(d.id)) {
        record.light = this.model.sphere(x, 1 + h, z, 0.19, '#e8cf89', { ...extra, emission: 0 });
        record.pool = this.model.mesh('sphere', [x, 0.04 + h, z], [3, 0.025, 3], '#ecc768', {
          ...extra,
          opacity: 0,
        });
      }
      addDeviceDetails(this.model, record, h);
      if (['pump', 'valve'].includes(d.id)) {
        const home = this.model.community.residences.find((h) => h.building.name === d.area);
        const native = this.model.rooms.some((r) => r[0] === d.area && r[3]?.community);
        const sprayX = home ? this.model.community.origin.x + home.building.x - 3.8 : x;
        const sprayZ = home ? home.building.z + home.building.d / 2 + 1.3 : z;
        for (let i = 0; i < 18; i++)
          record.parts.push(
            this.model.sphere(
              native ? sprayX + (i % 3) * 0.55 : 6 + (i % 3) * 3.25,
              0.85,
              native ? sprayZ + Math.floor(i / 3) * 0.12 : 2.2 + Math.floor(i / 3) * 0.8,
              0.07,
              '#8ed2dd',
              { ...extra, droplet: i, opacity: 0, emission: 0.15 },
            ),
          );
      }
      if (d.id === 'buzzer')
        record.alert = this.model.mesh('sphere', [x, 1.35 + h, z], [0.65, 0.05, 0.65], '#db8467', {
          ...extra,
          opacity: 0,
          emission: 0.7,
        });
    }
  }
  syncUpgrades(state) {
    const ids = state.upgrades || [],
      signature = ids.join(',');
    if (signature === this.upgradeSignature) return;
    this.upgradeSignature = signature;
    const kept = this.model.objects.filter((o) => !o.upgrade);
    this.model.objects.splice(0, this.model.objects.length, ...kept);
    // Installed upgrades are solid; their colliders go with them when they are removed.
    const colliders = this.model.colliders.filter((c) => !c.upgrade);
    this.model.colliders.splice(0, this.model.colliders.length, ...colliders);
    const solid = (x, z, w, d) => this.model.colliders.push({ x, z, w, d, upgrade: true });
    if (ids.includes('solar')) {
      solid(-4, 8.5, 2.2, 1.2);
      this.model.box(-4, 0.4, 8.5, 0.12, 0.8, 0.12, '#7e8c81', { upgrade: true });
      this.model.box(-4, 0.88, 8.5, 2.2, 0.12, 1.25, '#497c9a', {
        rotation: [-0.3, 0, 0],
        upgrade: true,
      });
      for (let i = 0; i < 5; i++)
        this.model.box(-4.8 + i * 0.4, 0.96, 8.5, 0.02, 0.025, 1.22, '#99c9d1', {
          rotation: [-0.3, 0, 0],
          upgrade: true,
        });
    }
    if (ids.includes('battery')) {
      this.model.box(-2.4, 0.35, 8.5, 0.6, 0.65, 0.45, '#94a989', { upgrade: true });
      solid(-2.4, 8.5, 0.6, 0.45);
    }
    if (ids.includes('rainTank')) {
      this.model.cylinder(11.9, 1.08, -3.6, 0.75, 2, '#83acb7', { upgrade: true });
      solid(11.9, -3.6, 1.5, 1.5);
    }
  }
  animate(state, t, dt) {
    // The community sim steps 20 times per simulated second, so a large jump (returning to a
    // quest whose lab clock ran on for hours) is capped rather than replayed and freezing the page.
    const simDelta = Math.min(
      MAX_SIM_STEP,
      state.simClockMs !== undefined
        ? this.lastSimClockMs === undefined
          ? 0
          : Math.max(0, (state.simClockMs - this.lastSimClockMs) / 1000)
        : dt * state.speed,
    );
    this.lastSimClockMs = state.simClockMs;
    updateCommunityWorld(this.model, state, simDelta);
    if (state.paused) dt = 0;
    const realDt = Math.min(0.1, Math.max(0, dt || 0));
    if (!state.paused && !state.reduced) this.visualClock += realDt;
    t =
      state.simClockMs !== undefined
        ? state.simClockMs / 1000
        : this.visualClock * (state.speed || 1);
    this.syncUpgrades(state);
    this.syncDevices(state);
    const { env, outputs, player, reduced, color: toolColor, appearance } = state;
    const p = toWorld(player),
      moved = this.lastPlayer
        ? Math.hypot(p[0] - this.lastPlayer[0], p[2] - this.lastPlayer[2])
        : 0;
    if (moved > 0.001) {
      this.heading = Math.atan2(p[0] - this.lastPlayer[0], p[2] - this.lastPlayer[2]);
      if (!reduced) this.walkPhase += dt * 14;
    }
    this.lastPlayer = [...p];
    const motion = env.motion && !reduced;
    for (const actor of this.model.actors) {
      let ax = actor.x,
        az = actor.z,
        angle = 0,
        phase = 0;
      if (actor.id === 'player') {
        ax = p[0];
        az = p[2];
        angle = this.heading;
        phase = moved > 0.001 && !reduced ? this.walkPhase : 0;
      } else if (state.talkingNpc === actor.id) {
        // A resident stops walking and turns towards the technician during chat.
        if (!actor.talkPosition) {
          const body = actor.parts.find((p) => p.local[1] === 0.8) || actor.parts[0];
          actor.talkPosition = this.matrix ? [body.pos[0], body.pos[2]] : [actor.x, actor.z];
        }
        [ax, az] = actor.talkPosition;
        angle = Math.atan2(p[0] - ax, p[2] - az);
      } else if (state.routine?.actors?.[actor.id]) {
        const target = state.routine.actors[actor.id];
        actor.x +=
          (target[0] - actor.x) * (reduced ? 1 : Math.min(1, dt * Math.max(1, state.speed) * 0.8));
        actor.z +=
          (target[1] - actor.z) * (reduced ? 1 : Math.min(1, dt * Math.max(1, state.speed) * 0.8));
        ax = actor.x;
        az = actor.z;
        phase = reduced ? 0 : t * 8;
      } else if (actor.id === 'Maya' && motion) {
        ax = -4.3 + Math.sin(t * 0.8) * 1.1;
        az = 0.5 + Math.cos(t * 0.8) * 0.6;
        angle = Math.atan2(Math.cos(t * 0.8), -Math.sin(t * 0.8));
        phase = t * 9;
      }
      if (state.talkingNpc !== actor.id) delete actor.talkPosition;
      if (
        actor.id === 'Maya' &&
        !motion &&
        env.motion &&
        state.talkingNpc !== actor.id &&
        !state.routine?.actors?.[actor.id]
      ) {
        ax = -4.3;
        az = 0.5;
      }
      const floor =
        this.model.floorHeight?.(ax, az) ??
        (ax > -13.1 && ax < 1.4 && az > -11 && az < -1
          ? 0.23
          : ax > 7.65 && ax < 12.15 && az > -9.5 && az < -4.7
            ? 0.21
            : 0);
      const skin = appearance === '👩🏽‍🔧' ? '#b78968' : appearance === '👨🏻‍🔧' ? '#e0b992' : '#cba885';
      for (const part of actor.parts) {
        let [lx, ly, lz] = part.local,
          limb = phase ? Math.sin(phase) * 0.32 * (part.side || 1) : 0;
        if (state.talkingNpc === actor.id && part.limb === 'arm' && part.side === -1 && !reduced)
          limb = 0.18 + Math.sin(this.visualClock * 2.8) * 0.16;
        if (part.limb) {
          lz += limb * (part.limb === 'arm' ? -1 : 1);
          ly += Math.abs(limb) * 0.15;
        }
        part.pos = [
          ax + Math.cos(angle) * lx + Math.sin(angle) * lz,
          ly + floor,
          -Math.sin(angle) * lx + Math.cos(angle) * lz + az,
        ];
        part.rotation = [part.limb ? limb * 0.3 : 0, angle, 0];
        if (actor.id === 'player') {
          if (part.local[1] === 0.8 || part.limb === 'arm') part.color = toolColor;
          if (part.shape === 'sphere' && part.local[1] === 1.27) part.color = skin;
        }
      }
    }
    if (!reduced) this.fanAngle += (state.paused ? 0 : simDelta) * 10;
    let gate = 0,
      blinds = 0;
    for (const record of this.deviceObjects) {
      const d = record.device,
        s = deviceState(d, outputs, env, state.outputScales);
      record.face.color = s.on ? '#f4d584' : '#a9b3a1';
      record.face.emission = s.on ? 0.4 : 0;
      if (record.light) {
        record.light.color = d.id === 'rgb' ? toolColor : '#ffe4a0';
        record.light.emission = s.on ? s.brightness : 0;
        record.pool.opacity = s.on ? 0.16 * s.brightness : 0;
        record.pool.color = d.id === 'rgb' ? toolColor : '#ecd092';
      }
      for (const part of record.parts) {
        if (part.blade !== undefined) {
          const angle =
            (part.blade * Math.PI * 2) / 3 + (s.on && !reduced ? this.fanAngle * s.brightness : 0);
          part.rotation = [0, 0, angle];
          if (part.bladeRadius) {
            part.pos[0] = record.x + Math.cos(angle) * part.bladeRadius;
            part.pos[1] =
              (this.model.floorHeight?.(record.x, record.z) || 0) +
              1.1 +
              Math.sin(angle) * part.bladeRadius;
          }
        }
        if (part.louvre !== undefined) {
          const tilt = !s.on
            ? 0
            : reduced
              ? 0.5
              : 0.5 + 0.3 * Math.sin(t * 1.4 + part.louvre * 0.25);
          part.rotation = [tilt, 0, 0];
        }
        if (part.droplet !== undefined) {
          const cycle = reduced ? 0.5 : (t * 1.7 + part.droplet * 0.13) % 1;
          part.pos[1] = 0.55 + Math.sin(cycle * Math.PI) * 0.7;
          part.opacity = s.flow ? 0.75 : 0;
        }
      }
      if (record.alert) {
        record.alert.opacity = s.on ? (reduced ? 0.5 : 0.35 + 0.2 * Math.sin(t * 8)) : 0;
        record.alert.size[0] = record.alert.size[2] = s.on
          ? reduced
            ? 0.65
            : 0.6 + (Math.sin(t * 8) + 1) * 0.15
          : 0.01;
      }
      if (d.id === 'gate') gate = s.angle;
      if (d.id === 'servo') blinds = s.angle;
    }
    const passage = this.model.community.sim.people.some(
      (person) =>
        Math.abs(person.x + this.model.community.origin.x) < 2 && person.z > 7.5 && person.z < 16,
    );
    if (passage) gate = Math.max(gate, Math.PI / 2); // Walking residents can open the existing entrance gate.
    const target = state.devices.some((d) => d.id === 'led' && (outputs[d.pin] || 0) > 0);
    for (const lamp of this.model.lamps) {
      lamp.color = target ? '#ffe4a0' : '#c9bf9c';
      lamp.emission = target ? 1 : 0;
    }
    const tank = this.model.dynamic.tankGauge,
      level = Math.max(0.025, (env.tank / 100) * 1.56);
    tank.size[1] = level;
    tank.pos[1] = 0.26 + level / 2;
    const water = this.model.dynamic.tankWater;
    water.size[1] = level;
    water.pos[1] = 0.3 + level / 2;
    for (const plant of this.model.plants) {
      const dry = env.soil < 30,
        wet = env.soil > 85;
      for (const leaf of plant.leaves) {
        leaf.color = dry ? '#b6a369' : wet ? '#809584' : '#719d59';
        leaf.rotation[2] = (leaf.restTilt ?? 0.25) + (dry ? 0.4 : wet ? -0.1 : 0);
      }
      for (const fruit of plant.fruits || [plant.fruit]) fruit.color = dry ? '#b59a66' : '#cf7756';
    }
    for (const appliance of this.model.objects.filter((o) => o.appliance)) {
      appliance.emission = env.appliance ? 0.6 : 0;
      appliance.color = env.appliance ? '#d49e68' : '#4d6056';
    }
    // The sky view's eye-level camera sits under the roof, so it always looks through the cutaway.
    const roofsShown = state.roofsVisible && !this.skyView;
    for (const roof of this.model.roofs || []) roof.opacity = roofsShown ? 1 : 0.17;
    if (this.model.pondWater) this.model.pondWater.pos[1] = 0.17 + ((env.pond ?? 60) / 100) * 0.2;
    for (const item of this.model.windObjects || []) {
      item.mesh.pos[0] =
        item.base[0] +
        (reduced ? 0 : Math.sin(t * 1.2 + item.base[2]) * 0.12 * Math.min(2, (env.wind || 0) / 20));
    }
    // Day and night: sun, moon and stars, clouds that darken, and windows that glow at night.
    const daylight = clamp((env.light ?? 70) / 65, 0, 1),
      effects = weatherEffects(env),
      rainLevel = clamp(env.rain || 0, 0, 100);
    this.haze = effects.fog ? 1 : 0;
    this.flash = lightningFlash({ ...env, thunder: effects.thunder }, this.visualClock, reduced);
    const skyDistance = this.model.skyDistance || 0;
    const skyYaw = this.model.mirrored ? -this.yaw : this.yaw;
    updateClouds(this.model.clouds || [], env, t, reduced, skyYaw, daylight, skyDistance);
    // Clouds are a low band around the home's horizon; seen from high above the community they
    // would sit on the ground among the buildings, so the overview leaves them out.
    const cloudsHidden = this.communityView;
    // Clouds light up from inside during a lightning flash.
    for (const cloud of this.model.clouds || [])
      for (const { mesh } of cloud.puffs) {
        mesh.emission = this.flash * 0.7;
        if (cloudsHidden) mesh.opacity = 0;
      }
    // Accurate celestial positions depend on the observer and an explicit clock.
    this.skyLocation ??= locationById(state.locationId) || DEFAULT_OBSERVER;
    const date = skyTime(
      {
        mode: state.skyMode || 'live',
        date: state.skyDate,
        startHour: state.skyStartHour ?? 8,
        elapsedMs: state.simClockMs || 0,
      },
      this.skyLocation,
    );
    // Placement is refreshed in render once the current camera position is known.
    this.skyContext = { date, location: this.skyLocation };
    // Farm animals roam and graze in real time; windmills turn with the wind.
    updateLandscape(this.model, env, realDt, reduced || state.paused);
    updateFarm(this.model, state.devices, outputs, env, this.visualClock, reduced);
    if (!state.paused) updateAnimals(this.model.animals, this.visualClock, realDt, reduced);
    for (const mill of this.model.windmills || []) {
      if (!reduced) mill.angle += realDt * (0.6 + Math.min(4, (env.wind || 0) / 12));
      mill.blades.forEach((blade, i) => {
        const a = mill.angle + (i / mill.blades.length) * Math.PI * 2;
        blade.pos[0] = mill.hub[0] + Math.cos(a) * 0.65;
        blade.pos[1] = mill.hub[1] + Math.sin(a) * 0.65;
        blade.pos[2] = mill.hub[2];
        blade.rotation[2] = a - Math.PI / 2;
      });
    }
    // Street lights come on after dusk.
    this.streetLights ??= this.model.objects.filter((o) => o.streetLight);
    for (const light of this.streetLights) light.emission = daylight < 0.4 ? 1 : 0;
    for (const pane of this.model.windows || []) {
      const lit = daylight < 0.35;
      pane.color = lit ? '#ffd98a' : '#8abec5';
      pane.emission = lit ? 0.75 : 0;
      pane.opacity = lit ? 0.95 : 0.68;
    }
    if (this.model.wetSurface) {
      // Snow lies as a light covering; otherwise wet ground darkens slightly.
      this.model.wetSurface.color = effects.snow ? '#f1f5f8' : '#6c9296';
      this.model.wetSurface.opacity = effects.snow
        ? 0.3 + Math.min(0.2, rainLevel / 200)
        : (env.wetness || 0) * 0.13;
    }
    // Rain and snow: heavier precipitation shows more drops, wind slants them, and at freezing
    // temperatures (or a snow weather code) drops become slowly drifting flakes.
    const shown =
        rainLevel > 0 ? Math.ceil(this.model.rain.length * Math.min(1, 0.2 + rainLevel / 50)) : 0,
      shear = Math.min(1.2, (env.wind || 0) / 40),
      night = 1 - daylight;
    for (let i = 0; i < this.model.rain.length; i++) {
      const drop = this.model.rain[i];
      drop.base ??= [...drop.pos];
      const falling = i < shown;
      if (effects.snow) {
        const fall = reduced ? 0.5 : ((((i * 0.47 - t * 0.9) % 5) + 5) % 5) / 5;
        drop.size[0] = drop.size[1] = drop.size[2] = 0.15;
        drop.color = '#f4f7fb';
        drop.rotation[2] = 0;
        drop.pos[1] = 1 + fall * 5;
        drop.pos[0] =
          drop.base[0] + (reduced ? 0 : Math.sin(t * 1.3 + i) * 0.25) + (1 - fall) * shear * 1.5;
        drop.opacity = falling ? 0.9 : 0;
        drop.emission = night * 0.5 + (this.flash || 0) * 0.5;
      } else {
        const fall = reduced ? 0.3 : ((((i * 0.47 - t * 6) % 5) + 5) % 5) / 5;
        drop.size[0] = drop.size[2] = 0.04;
        drop.size[1] = 0.55;
        // Blue-grey streaks by day; at night rain catches the light against the dark sky.
        drop.color = daylight < 0.5 ? '#c9dcf2' : '#6f93ad';
        drop.rotation[2] = -shear * 0.5;
        drop.pos[1] = 1 + fall * 5;
        drop.pos[0] = drop.base[0] + (1 - fall) * shear * 1.2;
        drop.opacity = falling ? 0.45 + rainLevel / 250 + night * 0.15 : 0;
        drop.emission = night * 0.45 + (this.flash || 0) * 0.5;
      }
    }
    const door = this.model.dynamic.gate;
    door.pos = [
      door.anchor[0] + Math.cos(gate) * 0.75,
      0.68,
      door.anchor[2] + Math.sin(gate) * 0.75,
    ];
    door.rotation[1] = -gate;
    const mate = this.model.dynamic.gateRight;
    mate.pos = [
      mate.anchor[0] - Math.cos(gate) * 0.75,
      0.68,
      mate.anchor[2] + Math.sin(gate) * 0.75,
    ];
    mate.rotation[1] = gate;
    this.model.dynamic.gateCollider.disabled = gate > 0.3;
    // Turning the servo lowers the blind, which is what shades and cools the room.
    this.model.dynamic.blinds.size[1] = Math.max(0.1, 0.83 * (blinds / Math.PI));
    const garageDoor = this.model.dynamic.garageDoor;
    const garageFloor =
      this.model.floorHeight?.(garageDoor.pos[0], garageDoor.pos[2] - 0.05) ?? 0.23;
    garageDoor.pos[1] = (env.door ? 2.2 : 0.38) + garageFloor - 0.23;
  }
  render(t, dt, s = this.getState()) {
    const gl = this.gl;
    this.animate(s, t, dt);
    const width = Math.max(1, this.canvas.clientWidth),
      height = Math.max(1, this.canvas.clientHeight),
      dpr = Math.min(this.maxPixelRatio || 2, globalThis.devicePixelRatio || 1);
    if (
      this.canvas.width !== Math.round(width * dpr) ||
      this.canvas.height !== Math.round(height * dpr)
    ) {
      this.canvas.width = Math.round(width * dpr);
      this.canvas.height = Math.round(height * dpr);
    }
    this.width = width;
    this.height = height;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    if (this.follow) {
      const p = toWorld(s.player);
      this.target = [p[0], 0.65, p[2]];
    }
    const smooth = s.reduced ? 1 : 1 - Math.exp(-dt * 7);
    // Exponential easing never quite arrives: snap once within a millimetre, so the camera (and
    // every label projected through it) comes to rest instead of creeping every frame.
    const ease = (from, to) => (Math.abs(to - from) < 1e-3 ? to : from + (to - from) * smooth);
    for (let i = 0; i < 3; i++) this.currentTarget[i] = ease(this.currentTarget[i], this.target[i]);
    const fittedDistance = Math.min(
      this.communityView ? 380 : this.landscapeView ? 180 : 95,
      this.distance * (this.overview ? Math.max(1, 1.6 / (width / height)) : 1),
    );
    this.currentDistance = ease(this.currentDistance, fittedDistance);
    // Mirrored homes are drawn through a left-right flip after the view transform: the camera
    // orbits the flipped scene as usual while the model, animations and game logic stay as built.
    const r = this.currentDistance,
      mirrored = !!this.model.mirrored && !this.communityView && !this.indoorArea,
      flip = (p) => (mirrored ? [-p[0], p[1], p[2]] : p),
      ground = toWorld(s.player),
      target = this.skyView
        ? [
            flip(ground)[0] - Math.sin(this.yaw) * Math.cos(this.pitch) * 20,
            (this.model.floorHeight?.(ground[0], ground[2]) || 0) + 1.7 - Math.sin(this.pitch) * 20,
            ground[2] - Math.cos(this.yaw) * Math.cos(this.pitch) * 20,
          ]
        : flip(this.currentTarget),
      viewEye = this.skyView
        ? [flip(ground)[0], (this.model.floorHeight?.(ground[0], ground[2]) || 0) + 1.7, ground[2]]
        : [
            target[0] + Math.sin(this.yaw) * Math.cos(this.pitch) * r,
            target[1] + Math.sin(this.pitch) * r,
            target[2] + Math.cos(this.yaw) * Math.cos(this.pitch) * r,
          ],
      // The camera position in model space, for fog and transparency sorting.
      eye = flip(viewEye);
    this.eye = eye;
    updateSky(this.model.sky, this.day, t, s.reduced, this.yaw, s.env, 0, {
      ...this.skyContext,
      eye,
      mirrored,
    });
    const view = lookAt(viewEye, target);
    const fov = this.skyView ? 0.78 / (this.skyZoom || 1) : 0.78;
    this.pixelScale = height / 2 / Math.tan(fov / 2);
    this.matrix = multiply(
      perspective(
        fov,
        width / height,
        0.1,
        this.communityView ? 650 : this.landscapeView || this.currentDistance > 95 ? 320 : 160,
      ),
      mirrored ? multiply(view, MIRROR) : view,
    );
    // Lightning briefly lights the whole scene, most visibly at night.
    const flash = this.flash || 0,
      day = Math.max(
        this.skyView
          ? clamp(((this.model.sky?.ephemeris.sun.altitude ?? 12) + 12) / 24, 0.04, 1)
          : clamp(s.env.light / 65, 0.04, 1),
        flash * 0.85,
      ),
      // Sky colour: deep navy at night to a soft sky blue by day (also used as distance fog);
      // a flash washes it towards pale violet-white.
      fog = [0.09 + day * 0.6, 0.13 + day * 0.68, 0.22 + day * 0.7].map(
        (c, i) => c + ([0.85, 0.86, 0.95][i] - c) * flash * 0.7,
      );
    gl.clearColor(...fog, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(this.program);
    gl.uniformMatrix4fv(this.uniforms.uViewProjection, false, this.matrix);
    gl.uniform1f(this.uniforms.uDay, day);
    const sunlight = worldSunlight(s, this.model.sky?.ephemeris);
    if (mirrored) sunlight.direction[0] *= -1;
    gl.uniform3fv(this.uniforms.uSun, sunlight.direction);
    gl.uniform3fv(this.uniforms.uSunColor, sunlight.color);
    gl.uniform1f(this.uniforms.uSunStrength, sunlight.strength);
    if (!s.paused && !s.reduced)
      this.surfaceTime = s.simClockMs !== undefined ? s.simClockMs / 1000 : this.visualClock;
    gl.uniform1f(this.uniforms.uTime, this.surfaceTime || 0);
    const boxes = [],
      info = [];
    for (const caster of this.model.visualShadows.slice(0, 12)) {
      boxes.push(caster.x, caster.z, caster.w / 2, caster.d / 2);
      info.push(caster.h, caster.opacity, 0, 0);
    }
    while (boxes.length < 48) {
      boxes.push(0, 0, 0, 0);
      info.push(0, 0, 0, 0);
    }
    gl.uniform4fv(this.uniforms['uShadowBoxes[0]'], boxes);
    gl.uniform4fv(this.uniforms['uShadowInfo[0]'], info);
    gl.uniform1f(this.uniforms.uWet, s.env.wetness || 0);
    gl.uniform3fv(this.uniforms.uEye, eye);
    gl.uniform3fv(this.uniforms.uFog, fog);
    gl.uniform1f(this.uniforms.uHaze, this.haze || 0);
    // The observer camera sits high above the community; haze should describe the
    // district's visibility rather than wash out everything because of that height.
    gl.uniform1f(
      this.uniforms.uFogOffset,
      this.communityView ? Math.max(0, this.currentDistance - 35) : 0,
    );
    const lights = [],
      lightColors = [],
      candidates = [];
    for (const lamp of [...this.model.lamps, ...this.model.community.lights])
      if (lamp.emission) candidates.push({ pos: lamp.pos, color: [1, 0.79, 0.47] });
    for (const home of this.model.community.residences)
      if (home.lamp.emission) candidates.push({ pos: home.lamp.pos, color: [1, 0.77, 0.43] });
    for (const d of this.deviceObjects)
      if (d.light?.emission)
        candidates.push({ pos: d.light.pos, color: color(d.light.color).slice(0, 3) });
    candidates.sort(
      (a, b) =>
        Math.hypot(a.pos[0] - this.target[0], a.pos[2] - this.target[2]) -
        Math.hypot(b.pos[0] - this.target[0], b.pos[2] - this.target[2]),
    );
    for (const lamp of candidates.slice(0, 8)) {
      lights.push(lamp.pos);
      lightColors.push(lamp.color);
    }
    while (lights.length < 8) {
      lights.push([0, -1000, 0]);
      lightColors.push([0, 0, 0]);
    }
    gl.uniform3fv(this.uniforms['uLights[0]'], lights.flat());
    gl.uniform3fv(this.uniforms['uLightColor[0]'], lightColors.flat());
    const opaque = [],
      transparent = [],
      visible = frustumTest(this.matrix, this.pixelScale);
    // Reused every frame rather than reallocated.
    this.drawKeys ??= new Map();
    this.drawKeys.clear();
    for (const m of this.model.objects) {
      const c = color(m.color),
        alpha = (m.opacity ?? 1) * c[3];
      if (alpha < 0.001) continue;
      const pixels = visible(m);
      if (!pixels) continue;
      this.drawKeys.set(m, geometryKey(m, pixels));
      (alpha < 0.99 ? transparent : opaque).push(m);
    }
    gl.depthMask(true);
    gl.uniform1f(this.uniforms.uCelestial, 0);
    gl.uniform3fv(this.uniforms.uSkySun, DEFAULT_SKY_SUN);
    this.drawState = {};
    // Sky objects keep their own celestial shading, so they are drawn one by one.
    const instanced = [],
      single = [];
    for (const m of opaque)
      (this.instancing && !m.sky && !m.moonSurface ? instanced : single).push(m);
    if (instanced.length) this.drawInstanced(instanced);
    for (const m of single) this.draw(m);
    // Back to front by squared distance from the eye, measured once per object.
    const depth = (this.sortDepth ??= new Map());
    depth.clear();
    for (const m of transparent) {
      const dx = m.pos[0] - eye[0],
        dy = m.pos[1] - eye[1],
        dz = m.pos[2] - eye[2];
      depth.set(m, dx * dx + dy * dy + dz * dz);
    }
    transparent.sort((a, b) => depth.get(b) - depth.get(a));
    gl.depthMask(false);
    for (const m of transparent) this.draw(m);
    gl.depthMask(true);
    this.onFrame?.(this, s);
  }
  // Writes one object's transform, colour and material in the instance layout.
  writeInstance(m, out, offset) {
    const mat = modelMatrix(
        m.pos,
        m.size,
        m.rotation,
        (this.matrixScratch ??= new Float32Array(16)),
      ),
      c = color(m.color),
      surface = surfaceForMesh(m);
    out.set(mat, offset);
    out[offset + 3] = m.size[0];
    out[offset + 7] = m.size[1];
    out[offset + 11] = m.size[2];
    out[offset + 16] = c[0];
    out[offset + 17] = c[1];
    out[offset + 18] = c[2];
    out[offset + 19] = c[3] * (m.opacity ?? 1);
    out[offset + 20] = surface;
    out[offset + 21] = m.roughness ?? roughnessFor(surface);
    out[offset + 22] = m.emission || 0;
  }
  setInstancing(on) {
    if (this.instancesEnabled === on) return;
    this.instancesEnabled = on;
    const gl = this.gl;
    for (const a of this.instanceAttributes) {
      if (on) gl.enableVertexAttribArray(a.location);
      else gl.disableVertexAttribArray(a.location);
      this.instancing?.vertexAttribDivisorANGLE(a.location, on ? 1 : 0);
    }
  }
  bindGeometry(key) {
    if (this.drawState.geometry === key) return this.geometries[key];
    this.drawState.geometry = key;
    const gl = this.gl,
      g = this.geometries[key];
    gl.bindBuffer(gl.ARRAY_BUFFER, g.positions);
    gl.vertexAttribPointer(this.position, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, g.normals);
    gl.vertexAttribPointer(this.normal, 3, gl.FLOAT, false, 0, 0);
    return g;
  }
  // All opaque objects of one shape in one draw call: about a dozen calls instead of thousands,
  // which is what software renderers (and low-end Chromebooks) are slowest at.
  drawInstanced(objects) {
    const gl = this.gl,
      groups = new Map();
    for (const m of objects) {
      const key = this.drawKeys.get(m) ?? geometryKey(m);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(m);
    }
    if (this.instanceData.length < objects.length * INSTANCE_FLOATS)
      this.instanceData = new Float32Array(objects.length * INSTANCE_FLOATS * 1.5);
    const data = this.instanceData,
      ranges = [];
    let index = 0;
    for (const [key, list] of groups) {
      ranges.push([key, index, list.length]);
      for (const m of list) this.writeInstance(m, data, index++ * INSTANCE_FLOATS);
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, data.subarray(0, index * INSTANCE_FLOATS), gl.STREAM_DRAW);
    this.setInstancing(true);
    const stride = INSTANCE_FLOATS * 4;
    for (const [key, first, count] of ranges) {
      gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuffer);
      let offset = first * stride;
      for (const a of this.instanceAttributes) {
        gl.vertexAttribPointer(a.location, a.size, gl.FLOAT, false, stride, offset);
        offset += a.size * 4;
      }
      const g = this.bindGeometry(key);
      this.instancing.drawArraysInstancedANGLE(gl.TRIANGLES, 0, g.count, count);
    }
    this.setInstancing(false);
  }
  // One object on its own (transparent objects, which must be drawn back to front, and the sky):
  // its values are set as constant attributes.
  draw(m) {
    const gl = this.gl,
      values = this.drawScratch || (this.drawScratch = new Float32Array(INSTANCE_FLOATS));
    this.setInstancing(false);
    this.writeInstance(m, values, 0);
    let offset = 0;
    for (const a of this.instanceAttributes) {
      if (a.size === 4) gl.vertexAttrib4fv(a.location, values.subarray(offset, offset + 4));
      else gl.vertexAttrib3fv(a.location, values.subarray(offset, offset + 3));
      offset += a.size;
    }
    const celestial = m.moonSurface ? 1 : m.sky ? 2 : 0,
      skySun = m.skySun || DEFAULT_SKY_SUN;
    if (this.drawState.celestial !== celestial) {
      this.drawState.celestial = celestial;
      gl.uniform1f(this.uniforms.uCelestial, celestial);
    }
    if (this.drawState.skySun !== skySun) {
      this.drawState.skySun = skySun;
      gl.uniform3fv(this.uniforms.uSkySun, skySun);
    }
    const g = this.bindGeometry(this.drawKeys?.get(m) ?? geometryKey(m));
    gl.drawArrays(gl.TRIANGLES, 0, g.count);
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    for (const [type, handler, options] of this.controlListeners)
      this.canvas.removeEventListener?.(type, handler, options);
    this.controlListeners = [];
    this.drag = null;
    this.canvas.style.cursor = 'grab';
    for (const g of Object.values(this.geometries)) {
      this.gl.deleteBuffer(g.positions);
      this.gl.deleteBuffer(g.normals);
    }
    this.gl.deleteBuffer(this.instanceBuffer);
    this.instanceData = null;
    this.gl.deleteProgram(this.program);
  }
}
