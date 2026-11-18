import { SURFACE, MATERIAL_GLSL, surfaceForMesh } from './world-materials.js';
import {
  geometry,
  roundedObject,
  bevelKey,
  LOW_DETAIL_SHAPES,
  retiredGeometry,
} from './world-geometry.js';
import { modelMatrix } from './world-math.js';
// The world's WebGL 1 renderer: draws the model's objects (boxes, spheres and the other unit
// shapes from world-geometry.js) with the game's own lighting and material shader. World3D
// decides what the frame shows (camera, sun, fog, lamps, shadows) and hands it over as a frame
// description; see render() below.
// Each object's transform, colour and material arrive as vertex attributes: per instance when
// many objects of one shape are drawn in a single call, or as constant values for one object.
// The model matrix columns carry the object's size in their w components (always 0 otherwise).
export const VERTEX = `attribute vec3 aPosition; attribute vec3 aNormal;
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
export const FRAGMENT = `
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
uniform float uLightRange[8];
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
  if(water>0.5 && n.y>0.5) {
    vec2 wp1 = vWorld.xz * 2.2;
    vec2 wp2 = vWorld.xz * 4.6;
    vec2 wp3 = vWorld.xz * 8.4;
    float wX = sin(wp1.x + wp1.y*0.8 + uTime*1.1)*0.045 +
               sin(wp2.x*1.3 - wp2.y*0.9 + uTime*1.8)*0.025 +
               cos(wp3.x*0.9 + wp3.y*1.4 - uTime*2.4)*0.015;
    float wZ = cos(wp1.y*1.1 - wp1.x*0.7 - uTime*0.9)*0.045 +
               cos(wp2.y*1.2 + wp2.x*1.1 - uTime*1.6)*0.025 +
               sin(wp3.y*1.2 - wp3.x*1.3 + uTime*2.1)*0.015;
    n = normalize(n + vec3(wX, 0.0, wZ));
  }
  vec3 base = pow(max(materialColor(uColor.rgb,n),vec3(0.0)),vec3(2.2));
  if(water > 0.5) {
    base = mix(base * vec3(0.55, 0.85, 0.95), vec3(0.05, 0.18, 0.24), 0.52);
  }
  float sun = max(0.0, dot(n, lightDir))*uSunStrength;
  float shade = groundShadow(n);
  // Near the ground things are a little darker; ground itself (emission -1: hand-made hills,
  // world-nature.js) keeps the ground's shade however high it rises.
  float groundContact = uEmission < -0.5 ? 0.0 : smoothstep(0.0, 0.38, vWorld.y);
  float ao = mix(0.76, 1.0, groundContact);
  float hemisphere = n.y * 0.5 + 0.5;
  vec3 skyDome = mix(vec3(0.18, 0.20, 0.25), vec3(0.38, 0.46, 0.56), hemisphere);
  vec3 groundBounce = mix(vec3(0.12, 0.14, 0.10), vec3(0.32, 0.28, 0.20), 0.5) * max(0.0, -n.y) * uSunStrength * 0.35;
  vec3 fill = skyDome + groundBounce;
  vec3 ambient = mix(vec3(0.025, 0.035, 0.06), fill, uDay) * ao;
  float isMetal = (uSurface > 4.5 && uSurface < 5.5) ? 1.0 : 0.0;
  vec3 diffuseAlbedo = base * (1.0 - isMetal * 0.75);
  vec3 lit = diffuseAlbedo * (ambient * (1.0 - shade * 0.35) + uSunColor * sun * uDay * (1.0 - shade) * 0.8);
  float sss = 0.0;
  if(uSurface > 12.5 && uSurface < 13.5) {
    sss = (max(0.0, dot(-viewDir, lightDir)) * 0.30 + max(0.0, dot(-n, lightDir)) * 0.22) * (1.0 - shade * 0.65);
  } else if(uSurface > 0.5 && uSurface < 1.5) {
    sss = max(0.0, dot(-n, lightDir)) * 0.14 * (1.0 - shade * 0.75);
  }
  lit += base * uSunColor * sss * uSunStrength * uDay;
  float wet = uWet * max(0.0, n.y);
  float roughness = clamp(uRoughness - wet * 0.3, 0.06, 1.0);
  vec3 halfDir = normalize(lightDir + viewDir);
  float specPower = mix(220.0, 8.0, roughness);
  float specNorm = (specPower + 2.0) / 8.0;
  float specular = pow(max(0.0, dot(n, halfDir)), specPower) * specNorm * 0.14;
  vec3 specColor = mix(uSunColor, uSunColor * base, isMetal);
  lit += specColor * specular * sun * uDay * (1.0 - roughness * 0.55);
  if(water > 0.5) {
    lit += uSunColor * pow(max(0.0, dot(n, halfDir)), 180.0) * sun * uDay * 1.35;
  }
  float fresnel = pow(1.0 - max(0.0, dot(n, viewDir)), 5.0);
  vec3 reflection = pow(uFog, vec3(2.2));
  float reflStrength = clamp((water * 0.65 + glass * 0.45 + wet * 0.22 + isMetal * 0.18 + (1.0 - roughness) * 0.08) * fresnel, 0.0, 0.75);
  lit = mix(lit, reflection, reflStrength);
  for (int i=0;i<8;i++) {
    float d=distance(vWorld,uLights[i]);
    float fall=max(0.0,1.0-d/uLightRange[i]);
    lit+=base*uLightColor[i]*fall*fall*2.3;
    vec3 h=normalize(normalize(uLights[i]-vWorld)+viewDir);
    lit+=uLightColor[i]*pow(max(0.0,dot(n,h)),48.0)*fall*fall*(wet+water*0.5+glass*0.4)*0.28;
  }
  lit = mix(lit, lit * 0.8 + vec3(0.01, 0.018, 0.024), wet * 0.28);
  lit = mix(lit, pow(uColor.rgb, vec3(2.2)) * 1.45, clamp(uEmission, 0.0, 1.0));
  lit = pow(filmic(lit), vec3(1.0 / 2.2));
  float sunMie = pow(max(0.0, dot(-viewDir, lightDir)), 8.0) * uSunStrength * uDay;
  vec3 fogColor = mix(uFog, min(vec3(1.0), uSunColor * 1.15 + vec3(0.08, 0.05, 0.0)), sunMie * 0.38 * (0.25 + 0.75 * uHaze));
  float fog = smoothstep(mix(38.0, 12.0, uHaze), mix(90.0, 52.0, uHaze), max(0.0, distance(vWorld, uEye) - uFogOffset));
  gl_FragColor = vec4(mix(lit, fogColor, fog * mix(0.18, 0.88, uHaze)), uColor.a);
}`;
// Parsed colours are cached (read-only) because objects are recoloured every frame.
const colorCache = new Map();
export function color(hex) {
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
export const DEFAULT_SKY_SUN = [0, 1, 0];
// Per instance: model matrix (16, with the size in three w components), colour (4), material (3).
export const INSTANCE_FLOATS = 23;
const MIN_PIXEL_RADIUS = 1;
const MIN_RAISED_PIXEL_RADIUS = 3;
const roughnessFor = (surface) => {
  switch (surface) {
    case SURFACE.water:
      return 0.08;
    case SURFACE.glass:
      return 0.12;
    case SURFACE.tile:
      return 0.22;
    case SURFACE.steel:
      return 0.28;
    case SURFACE.timber:
      return 0.58;
    case SURFACE.roof:
      return 0.65;
    case SURFACE.foliage:
      return 0.68;
    case SURFACE.stone:
      return 0.74;
    case SURFACE.brick:
      return 0.82;
    case SURFACE.asphalt:
      return 0.84;
    case SURFACE.terrain:
      return 0.86;
    case SURFACE.plaster:
      return 0.88;
    case SURFACE.fabric:
      return 0.92;
    case SURFACE.soil:
      return 0.94;
    case SURFACE.grass:
      return 0.96;
    default:
      return 0.76;
  }
};
// Objects smaller than this radius on screen use the simpler shapes; their curves are a few pixels.
const LOW_DETAIL_PIXELS = 16;
export const geometryKey = (m, pixels = Infinity) => {
  const low = pixels < LOW_DETAIL_PIXELS;
  if (m.bevel && m.shape === 'box') return low ? 'box' : bevelKey(m);
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
    // Flat ground markings (pavements, lane lines, crossings) read as a pattern even when each
    // piece is tiny, so only raised objects use the larger cut-off. Landmarks (bus shelter roofs
    // and signs) keep the smaller one so students can find them from the overview.
    const small = (h < 0.12 && y < 0.45) || o.landmark;
    return pixels >= (small ? MIN_PIXEL_RADIUS : MIN_RAISED_PIXEL_RADIUS) ? pixels : 0;
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
// Writes one object's transform, colour and material in the instance layout.
const matrixScratch = new Float32Array(16);
export function writeInstance(m, out, offset) {
  const mat = modelMatrix(m.pos, m.size, m.rotation, matrixScratch),
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
export class WebGLWorldRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.gl = canvas.getContext('webgl', {
      alpha: false,
      antialias: true,
      powerPreference: 'high-performance',
    });
    if (!this.gl)
      throw Error('WebGL is unavailable. Enable hardware acceleration to explore the 3D world.');
    this.contextRecovery = this.gl.getExtension('WEBGL_lose_context');
    this.maxPixelRatio = isSoftwareRenderer(this.gl) ? 1 : 2;
    this.geometries = {};
    this.initGL();
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
      'uLightRange[0]',
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
      'ridge',
      'gable',
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
  // Rebuilds every GL resource after a lost context is restored.
  restore() {
    this.geometries = {};
    this.initGL();
  }
  // Draws one frame. frame: { pixelWidth, pixelHeight, camera: { eye, target, fov, near, far,
  // aspect, mirrored }, matrix (view-projection, including any mirror flip), pixelScale, eye, fog, day, sun: { direction, color, strength }, time, shadows:
  // [{ x, z, w, d, h, opacity }] (at most 12), wet, haze, fogOffset, lights: [{ pos, color, range }]
  // (at most 8), objects }.
  render(frame) {
    const gl = this.gl;
    // Run-time shapes that have been replaced (see registerGeometry) let their buffers go.
    const retired = retiredGeometry();
    for (this.retiredSeen ??= 0; this.retiredSeen < retired.length; this.retiredSeen++) {
      const g = this.geometries[retired[this.retiredSeen]];
      if (!g) continue;
      gl.deleteBuffer(g.positions);
      gl.deleteBuffer(g.normals);
      delete this.geometries[retired[this.retiredSeen]];
      if (this.drawState?.geometry === retired[this.retiredSeen]) this.drawState.geometry = null;
    }
    gl.viewport(0, 0, frame.pixelWidth, frame.pixelHeight);
    gl.clearColor(...frame.fog, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(this.program);
    gl.uniformMatrix4fv(this.uniforms.uViewProjection, false, frame.matrix);
    gl.uniform1f(this.uniforms.uDay, frame.day);
    gl.uniform3fv(this.uniforms.uSun, frame.sun.direction);
    gl.uniform3fv(this.uniforms.uSunColor, frame.sun.color);
    gl.uniform1f(this.uniforms.uSunStrength, frame.sun.strength);
    gl.uniform1f(this.uniforms.uTime, frame.time);
    const boxes = [],
      info = [];
    for (const caster of frame.shadows) {
      boxes.push(caster.x, caster.z, caster.w / 2, caster.d / 2);
      info.push(caster.h, caster.opacity, 0, 0);
    }
    while (boxes.length < 48) {
      boxes.push(0, 0, 0, 0);
      info.push(0, 0, 0, 0);
    }
    gl.uniform4fv(this.uniforms['uShadowBoxes[0]'], boxes);
    gl.uniform4fv(this.uniforms['uShadowInfo[0]'], info);
    gl.uniform1f(this.uniforms.uWet, frame.wet);
    gl.uniform3fv(this.uniforms.uEye, frame.eye);
    gl.uniform3fv(this.uniforms.uFog, frame.fog);
    gl.uniform1f(this.uniforms.uHaze, frame.haze);
    gl.uniform1f(this.uniforms.uFogOffset, frame.fogOffset);
    const lights = frame.lights.map((l) => l.pos),
      lightColors = frame.lights.map((l) => l.color),
      ranges = frame.lights.map((l) => l.range);
    while (lights.length < 8) {
      lights.push([0, -1000, 0]);
      lightColors.push([0, 0, 0]);
      ranges.push(5.5);
    }
    gl.uniform1fv(this.uniforms['uLightRange[0]'], ranges);
    gl.uniform3fv(this.uniforms['uLights[0]'], lights.flat());
    gl.uniform3fv(this.uniforms['uLightColor[0]'], lightColors.flat());
    const opaque = [],
      transparent = [],
      visible = frustumTest(frame.matrix, frame.pixelScale);
    // Reused every frame rather than reallocated.
    this.drawKeys ??= new Map();
    this.drawKeys.clear();
    for (const m of frame.objects) {
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
    const eye = frame.eye,
      depth = (this.sortDepth ??= new Map());
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
  // Bevelled boxes ('roundedBox:fx:fy:fz') are built the first time one is drawn.
  createGeometry(key) {
    const gl = this.gl,
      g = geometry(key),
      buffer = (data) => {
        const b = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, b);
        gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
        return b;
      };
    return (this.geometries[key] = {
      positions: buffer(g.positions),
      normals: buffer(g.normals),
      count: g.count,
    });
  }
  bindGeometry(key) {
    if (this.drawState.geometry === key) return this.geometries[key];
    this.drawState.geometry = key;
    const gl = this.gl,
      g = this.geometries[key] || this.createGeometry(key);
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
      for (const m of list) writeInstance(m, data, index++ * INSTANCE_FLOATS);
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
    writeInstance(m, values, 0);
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
    for (const g of Object.values(this.geometries)) {
      this.gl.deleteBuffer(g.positions);
      this.gl.deleteBuffer(g.normals);
    }
    this.gl.deleteBuffer(this.instanceBuffer);
    this.instanceData = null;
    this.gl.deleteProgram(this.program);
  }
}
