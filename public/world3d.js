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
} from './world-math.js';
import { createWorldModel } from './world-model.js';
import { createRegionalModel } from './regions.js';
import { updateClouds } from './clouds.js';
import { updateSky, lightningFlash } from './sky.js';
const VERTEX = `attribute vec3 aPosition; attribute vec3 aNormal; uniform mat4 uModel; uniform mat4 uViewProjection; uniform mat3 uNormal; varying vec3 vNormal; varying vec3 vWorld; void main(){vec4 world=uModel*vec4(aPosition,1.0);vWorld=world.xyz;vNormal=normalize(uNormal*aNormal);gl_Position=uViewProjection*world;}`;
const FRAGMENT = `precision mediump float; varying vec3 vNormal; varying vec3 vWorld; uniform vec4 uColor; uniform float uDay; uniform float uEmission; uniform float uWet; uniform vec3 uEye; uniform vec3 uFog; uniform vec3 uLights[8]; uniform vec3 uLightColor[8]; void main(){vec3 n=normalize(vNormal);float sun=max(0.0,dot(n,normalize(vec3(-0.5,1.0,0.65))));float ambient=mix(0.19,0.68,uDay);vec3 lit=uColor.rgb*(ambient+sun*mix(0.12,0.37,uDay));for(int i=0;i<8;i++){float d=distance(vWorld,uLights[i]);float fall=max(0.0,1.0-d/4.0);lit+=uColor.rgb*uLightColor[i]*fall*fall*1.7;}lit=mix(lit,lit*0.83+vec3(0.03,0.07,0.09),uWet*max(0.0,n.y)*0.3);lit=mix(lit,uColor.rgb*1.15,clamp(uEmission,0.0,1.0));float fog=smoothstep(38.0,90.0,distance(vWorld,uEye));gl_FragColor=vec4(mix(lit,uFog,fog*.48),uColor.a);}`;
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
function geometry(shape) {
  const p = [],
    n = [];
  const triangle = (a, b, c, normal = null) => {
    for (const v of [a, b, c]) {
      p.push(...v);
      n.push(...(normal || v));
    }
  };
  if (shape === 'box') {
    const faces = [
      [
        [1, 0, 0],
        [
          [0.5, -0.5, -0.5],
          [0.5, 0.5, -0.5],
          [0.5, 0.5, 0.5],
          [0.5, -0.5, 0.5],
        ],
      ],
      [
        [-1, 0, 0],
        [
          [-0.5, -0.5, 0.5],
          [-0.5, 0.5, 0.5],
          [-0.5, 0.5, -0.5],
          [-0.5, -0.5, -0.5],
        ],
      ],
      [
        [0, 1, 0],
        [
          [-0.5, 0.5, -0.5],
          [-0.5, 0.5, 0.5],
          [0.5, 0.5, 0.5],
          [0.5, 0.5, -0.5],
        ],
      ],
      [
        [0, -1, 0],
        [
          [-0.5, -0.5, 0.5],
          [-0.5, -0.5, -0.5],
          [0.5, -0.5, -0.5],
          [0.5, -0.5, 0.5],
        ],
      ],
      [
        [0, 0, 1],
        [
          [0.5, -0.5, 0.5],
          [0.5, 0.5, 0.5],
          [-0.5, 0.5, 0.5],
          [-0.5, -0.5, 0.5],
        ],
      ],
      [
        [0, 0, -1],
        [
          [-0.5, -0.5, -0.5],
          [-0.5, 0.5, -0.5],
          [0.5, 0.5, -0.5],
          [0.5, -0.5, -0.5],
        ],
      ],
    ];
    for (const [normal, v] of faces) {
      triangle(v[0], v[1], v[2], normal);
      triangle(v[0], v[2], v[3], normal);
    }
  } else if (shape === 'sphere') {
    const lat = 7,
      lon = 10,
      point = (i, j) => {
        const a = (i / lat) * Math.PI,
          b = (j / lon) * Math.PI * 2;
        return [
          Math.sin(a) * Math.cos(b) * 0.5,
          Math.cos(a) * 0.5,
          Math.sin(a) * Math.sin(b) * 0.5,
        ];
      };
    for (let i = 0; i < lat; i++)
      for (let j = 0; j < lon; j++) {
        triangle(point(i, j), point(i + 1, j), point(i + 1, j + 1));
        triangle(point(i, j), point(i + 1, j + 1), point(i, j + 1));
      }
  } else {
    const sides = 12;
    for (let i = 0; i < sides; i++) {
      const a = (i / sides) * Math.PI * 2,
        b = ((i + 1) / sides) * Math.PI * 2,
        lo = [Math.cos(a) * 0.5, -0.5, Math.sin(a) * 0.5],
        lo2 = [Math.cos(b) * 0.5, -0.5, Math.sin(b) * 0.5],
        hi = shape === 'cone' ? [0, 0.5, 0] : [lo[0], 0.5, lo[2]],
        hi2 = shape === 'cone' ? [0, 0.5, 0] : [lo2[0], 0.5, lo2[2]],
        normal = [Math.cos((a + b) / 2), shape === 'cone' ? 0.5 : 0, Math.sin((a + b) / 2)];
      triangle(lo, hi, lo2, normal);
      if (shape !== 'cone') {
        triangle(lo2, hi, hi2, normal);
        triangle([0, 0.5, 0], hi2, hi, [0, 1, 0]);
      }
      triangle([0, -0.5, 0], lo, lo2, [0, -1, 0]);
    }
  }
  return { positions: new Float32Array(p), normals: new Float32Array(n), count: p.length / 3 };
}
export class World3D {
  constructor(canvas, { getState, onFrame, onError, onRecover } = {}) {
    this.canvas = canvas;
    this.getState = getState;
    this.onFrame = onFrame;
    this.onError = onError;
    this.onRecover = onRecover;
    this.gl = canvas.getContext('webgl', {
      alpha: false,
      antialias: true,
      powerPreference: 'high-performance',
    });
    if (!this.gl)
      throw Error('WebGL is unavailable. Enable hardware acceleration to explore the 3D world.');
    this.model = createRegionalModel(getState?.().locationId || 'legacy');
    this.yaw = 0.32;
    this.pitch = 0.73;
    this.distance = 35;
    this.target = [0, 0, 0];
    this.currentTarget = [0, 0, 0];
    this.currentDistance = 35;
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
    this.drag = null;
    this.matrix = null;
    this.day = 1;
    this.contextLost = false;
    this.renderFailed = false;
    this.normalScratch = new Float32Array(9);
    this.colorScratch = new Float32Array(4);
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
    gl.linkProgram(this.program);
    if (!gl.getProgramParameter(this.program, gl.LINK_STATUS))
      throw Error(gl.getProgramInfoLog(this.program));
    gl.useProgram(this.program);
    this.uniforms = {};
    for (const name of [
      'uModel',
      'uViewProjection',
      'uNormal',
      'uColor',
      'uDay',
      'uEmission',
      'uWet',
      'uEye',
      'uFog',
      'uLights[0]',
      'uLightColor[0]',
    ])
      this.uniforms[name] = gl.getUniformLocation(this.program, name);
    this.position = gl.getAttribLocation(this.program, 'aPosition');
    this.normal = gl.getAttribLocation(this.program, 'aNormal');
    gl.enableVertexAttribArray(this.position);
    gl.enableVertexAttribArray(this.normal);
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    for (const shape of ['box', 'sphere', 'cylinder', 'cone']) {
      const g = geometry(shape),
        buffer = (data) => {
          const b = gl.createBuffer();
          gl.bindBuffer(gl.ARRAY_BUFFER, b);
          gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
          return b;
        };
      this.geometries[shape] = {
        positions: buffer(g.positions),
        normals: buffer(g.normals),
        count: g.count,
      };
    }
  }
  bindControls() {
    const c = this.canvas;
    c.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 && e.button !== 2) return;
      this.drag = { x: e.clientX, y: e.clientY };
      c.setPointerCapture(e.pointerId);
      c.style.cursor = 'grabbing';
      c.focus();
    });
    c.addEventListener('pointermove', (e) => {
      if (!this.drag) return;
      const dx = e.clientX - this.drag.x,
        dy = e.clientY - this.drag.y;
      this.yaw -= dx * 0.007;
      this.pitch = clamp(this.pitch + dy * 0.006, 0.25, 1.2);
      this.drag = { x: e.clientX, y: e.clientY };
    });
    const end = () => {
      this.drag = null;
      c.style.cursor = 'grab';
    };
    c.addEventListener('pointerup', end);
    c.addEventListener('pointercancel', end);
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    c.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        this.distance = clamp(this.distance + e.deltaY * 0.018, 5, 55);
      },
      { passive: false },
    );
    c.addEventListener('webglcontextlost', (e) => {
      // preventDefault lets the browser restore the context; rendering resumes on restore.
      e.preventDefault();
      this.contextLost = true;
      cancelAnimationFrame(this.frameId);
      this.onError?.(
        '3D graphics connection was lost. Waiting for it to recover; reload the page if the view does not return.',
      );
    });
    c.addEventListener('webglcontextrestored', () => {
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
  setView(view, focus, zoom = 1) {
    this.follow = false;
    this.overview = view === 'world';
    this.target = focus ? toWorld({ x: focus[1], y: focus[2] }) : [0, 0, 0];
    this.target[1] = 0.35;
    this.distance = clamp(
      (view === 'world' ? 35 : view === 'detail' ? 15 : 25) /
        Math.max(1, zoom / (view === 'detail' ? 1.9 : view === 'world' ? 1 : 1.5)),
      5,
      55,
    );
  }
  setFollow(value) {
    this.follow = value;
    this.overview = false;
    if (value) this.distance = 11;
  }
  setRegion(id) {
    this.upgradeSignature = null;
    this.lastSimClockMs = undefined;
    this.model = createRegionalModel(id);
    this.deviceSignature = '';
    this.deviceObjects = [];
    this.lastPlayer = null;
  }
  move(player, dir, amount) {
    return resolveMove(player, dir, amount, this.yaw, this.model.colliders);
  }
  findFree(player) {
    return findFree(player, this.model.colliders);
  }
  project(p) {
    return this.matrix
      ? projectPoint(this.matrix, p, this.width, this.height)
      : { x: 0, y: 0, visible: false };
  }
  frame(time) {
    if (this.disposed || this.contextLost) return;
    if (this.getState()?.visible === false) {
      this.lastTime = time;
      this.frameId = requestAnimationFrame(this.frame);
      return;
    }
    const dt = Math.min(0.05, Math.max(0.001, (time - this.lastTime) / 1000));
    this.lastTime = time;
    try {
      this.render(time / 1000, dt);
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
    const signature = JSON.stringify(state.devices.map((d) => [d.id, d.area, d.pin]));
    if (signature === this.deviceSignature) return;
    this.deviceSignature = signature;
    const kept = this.model.objects.filter((o) => !o.device);
    this.model.objects.splice(0, this.model.objects.length, ...kept);
    this.deviceObjects = [];
    for (const d of state.devices) {
      const a = state.areas.find((a) => a[0] === d.area) || state.areas[9],
        p = toWorld({ x: a[1], y: a[2] }),
        peers = state.devices.filter((v) => v.area === d.area),
        index = peers.indexOf(d),
        x = p[0] + 0.7 + (index % 3) * 0.48,
        z = p[2] + 0.8 + Math.floor(index / 3) * 0.4,
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
      if (['led', 'porch', 'rgb'].includes(d.id)) {
        record.light = this.model.sphere(x, 1 + h, z, 0.19, '#e8cf89', { ...extra, emission: 0 });
        record.pool = this.model.mesh('sphere', [x, 0.04 + h, z], [3, 0.025, 3], '#ecc768', {
          ...extra,
          opacity: 0,
        });
      }
      if (['fan', 'ac'].includes(d.id)) {
        record.parts.push(this.model.box(x, 1.1 + h, z, 0.55, 0.48, 0.17, '#d2dfd0', extra));
        for (let i = 0; i < 3; i++)
          record.parts.push(
            this.model.box(x, 1.1 + h, z + 0.12, 0.47, 0.11, 0.07, '#7e9c96', {
              ...extra,
              blade: i,
            }),
          );
      }
      if (['pump', 'valve'].includes(d.id)) {
        for (let i = 0; i < 18; i++)
          record.parts.push(
            this.model.sphere(
              6 + (i % 3) * 3.25,
              0.85,
              2.2 + Math.floor(i / 3) * 0.8,
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
    if (ids.includes('solar')) {
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
    if (ids.includes('battery'))
      this.model.box(-2.4, 0.35, 8.5, 0.6, 0.65, 0.45, '#94a989', { upgrade: true });
    if (ids.includes('rainTank'))
      this.model.cylinder(11.9, 1.08, -3.6, 0.75, 2, '#83acb7', { upgrade: true });
  }
  animate(state, t, dt) {
    const simDelta =
      state.simClockMs !== undefined
        ? this.lastSimClockMs === undefined
          ? 0
          : Math.max(0, (state.simClockMs - this.lastSimClockMs) / 1000)
        : dt * state.speed;
    this.lastSimClockMs = state.simClockMs;
    if (state.simClockMs !== undefined) t = state.simClockMs / 1000;
    if (state.paused) dt = 0;
    this.syncDevices(state);
    this.syncUpgrades(state);
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
      if (actor.id === 'Maya' && !motion && env.motion) {
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
        s = deviceState(d, outputs, env);
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
          part.rotation = [
            0,
            0,
            (part.blade * Math.PI * 2) / 3 + (s.on && !reduced ? this.fanAngle * s.brightness : 0),
          ];
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
        leaf.rotation[2] = dry ? 0.65 : wet ? -0.15 : 0.25;
      }
      plant.fruit.color = dry ? '#b59a66' : '#cf7756';
    }
    for (const appliance of this.model.objects.filter((o) => o.appliance)) {
      appliance.emission = env.appliance ? 0.6 : 0;
      appliance.color = env.appliance ? '#d49e68' : '#4d6056';
    }
    for (const roof of this.model.roofs || []) roof.opacity = state.roofsVisible ? 1 : 0.17;
    if (this.model.pondWater) this.model.pondWater.pos[1] = 0.17 + ((env.pond ?? 60) / 100) * 0.2;
    for (const item of this.model.windObjects || []) {
      item.mesh.pos[0] =
        item.base[0] +
        (reduced ? 0 : Math.sin(t * 1.2 + item.base[2]) * 0.12 * Math.min(2, (env.wind || 0) / 20));
    }
    // Day and night: sun, moon and stars, clouds that darken, and windows that glow at night.
    const daylight = clamp((env.light ?? 70) / 65, 0, 1);
    this.flash = lightningFlash(env, this.realTime ?? t, reduced);
    updateClouds(this.model.clouds || [], env, t, reduced, this.yaw, daylight);
    // Clouds light up from inside during a lightning flash.
    for (const cloud of this.model.clouds || [])
      for (const { mesh } of cloud.puffs) mesh.emission = this.flash * 0.7;
    updateSky(this.model.sky, daylight, t, reduced, this.yaw, env);
    for (const pane of this.model.windows || []) {
      const lit = daylight < 0.35;
      pane.color = lit ? '#ffd98a' : '#8abec5';
      pane.emission = lit ? 0.75 : 0;
      pane.opacity = lit ? 0.95 : 0.68;
    }
    if (this.model.wetSurface) this.model.wetSurface.opacity = (env.wetness || 0) * 0.13;
    for (let i = 0; i < this.model.rain.length; i++) {
      const drop = this.model.rain[i];
      // At night, rain catches the light so it stays visible against the dark sky.
      drop.opacity = env.rain > 0 ? 0.25 + env.rain / 200 + (1 - daylight) * 0.2 : 0;
      drop.color = daylight < 0.5 ? '#c9dcf2' : '#b9dbe5';
      drop.emission = (1 - daylight) * 0.45 + (this.flash || 0) * 0.5;
      drop.pos[1] = reduced ? 2.5 : 1 + ((((i * 0.47 - t * 6) % 5) + 5) % 5);
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
    this.model.dynamic.blinds.size[1] = Math.max(0.1, 0.83 * (1 - blinds / Math.PI));
    this.model.dynamic.garageDoor.pos[1] = env.door ? 2.2 : 0.38;
  }
  render(t, dt) {
    const gl = this.gl,
      s = this.getState();
    this.realTime = t;
    this.animate(s, t, dt);
    const width = Math.max(1, this.canvas.clientWidth),
      height = Math.max(1, this.canvas.clientHeight),
      dpr = Math.min(2, globalThis.devicePixelRatio || 1);
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
    for (let i = 0; i < 3; i++)
      this.currentTarget[i] += (this.target[i] - this.currentTarget[i]) * smooth;
    const fittedDistance =
      this.distance * (this.overview ? Math.max(1, 1.6 / (width / height)) : 1);
    this.currentDistance += (fittedDistance - this.currentDistance) * smooth;
    const r = this.currentDistance,
      eye = [
        this.currentTarget[0] + Math.sin(this.yaw) * Math.cos(this.pitch) * r,
        this.currentTarget[1] + Math.sin(this.pitch) * r,
        this.currentTarget[2] + Math.cos(this.yaw) * Math.cos(this.pitch) * r,
      ];
    this.eye = eye;
    this.matrix = multiply(perspective(0.78, width / height), lookAt(eye, this.currentTarget));
    // Lightning briefly lights the whole scene, most visibly at night.
    const flash = this.flash || 0,
      day = Math.max(clamp(s.env.light / 65, 0.04, 1), flash * 0.85),
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
    gl.uniform1f(this.uniforms.uWet, s.env.wetness || 0);
    gl.uniform3fv(this.uniforms.uEye, eye);
    gl.uniform3fv(this.uniforms.uFog, fog);
    const lights = [],
      lightColors = [];
    if (this.model.lamps.some((l) => l.emission))
      for (const lamp of this.model.lamps) {
        lights.push(lamp.pos);
        lightColors.push([1, 0.73, 0.32]);
      }
    for (const d of this.deviceObjects)
      if (d.light?.emission && lights.length < 8) {
        lights.push(d.light.pos);
        lightColors.push(color(d.light.color).slice(0, 3));
      }
    while (lights.length < 8) {
      lights.push([0, -1000, 0]);
      lightColors.push([0, 0, 0]);
    }
    gl.uniform3fv(this.uniforms['uLights[0]'], lights.flat());
    gl.uniform3fv(this.uniforms['uLightColor[0]'], lightColors.flat());
    const opaque = [],
      transparent = [];
    for (const m of this.model.objects) {
      const c = color(m.color),
        alpha = (m.opacity ?? 1) * c[3];
      if (alpha < 0.001) continue;
      (alpha < 0.99 ? transparent : opaque).push(m);
    }
    gl.depthMask(true);
    for (const m of opaque) this.draw(m);
    transparent.sort(
      (a, b) =>
        Math.hypot(...b.pos.map((v, i) => v - eye[i])) -
        Math.hypot(...a.pos.map((v, i) => v - eye[i])),
    );
    gl.depthMask(false);
    for (const m of transparent) this.draw(m);
    gl.depthMask(true);
    this.onFrame?.(this, s);
  }
  draw(m) {
    const gl = this.gl,
      g = this.geometries[m.shape],
      mat = modelMatrix(m.pos, m.size, m.rotation),
      normal = this.normalScratch,
      c = this.colorScratch;
    for (let k = 0; k < 3; k++)
      for (let r = 0; r < 3; r++) normal[k * 3 + r] = mat[k * 4 + r] / (m.size[k] * m.size[k] || 1);
    c.set(color(m.color));
    c[3] *= m.opacity ?? 1;
    gl.uniformMatrix4fv(this.uniforms.uModel, false, mat);
    gl.uniformMatrix3fv(this.uniforms.uNormal, false, normal);
    gl.uniform4fv(this.uniforms.uColor, c);
    gl.uniform1f(this.uniforms.uEmission, m.emission || 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, g.positions);
    gl.vertexAttribPointer(this.position, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, g.normals);
    gl.vertexAttribPointer(this.normal, 3, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, g.count);
  }
  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    for (const g of Object.values(this.geometries)) {
      this.gl.deleteBuffer(g.positions);
      this.gl.deleteBuffer(g.normals);
    }
    this.gl.deleteProgram(this.program);
  }
}
