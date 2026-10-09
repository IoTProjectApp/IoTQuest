import { multiply, perspective, lookAt, projectPoint, clamp } from './world-math.js';
import { latLonPoint, radians, globePick, countryAt, countryCentre } from './geography.js';
export function drawAtlas(ctx, features, width, height, selected = null) {
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#102a3b';
  ctx.fillRect(0, 0, width, height);
  const colors = {
    Asia: '#538b86',
    Africa: '#678e7e',
    Europe: '#639893',
    'North America': '#5b858b',
    'South America': '#537b74',
    Oceania: '#66948a',
    Antarctica: '#bed2d1',
  };
  for (const f of features) {
    const polygons =
      f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
    ctx.beginPath();
    for (const rings of polygons)
      for (const ring of rings) {
        ring.forEach(([lon, lat], i) => {
          const x = ((lon + 180) / 360) * width,
            y = ((90 - lat) / 180) * height;
          i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
        });
        ctx.closePath();
      }
    ctx.fillStyle =
      f.properties.iso === selected ? '#b7dba9' : colors[f.properties.continent] || '#527e7d';
    ctx.fill('evenodd');
    ctx.strokeStyle = '#8bb9b080';
    ctx.lineWidth = width / 2000;
    ctx.stroke();
  }
  ctx.strokeStyle = '#8bd0cf1a';
  ctx.lineWidth = width / 2200;
  for (let lon = 0; lon <= 360; lon += 15) {
    ctx.beginPath();
    ctx.moveTo((lon / 360) * width, 0);
    ctx.lineTo((lon / 360) * width, height);
    ctx.stroke();
  }
  for (let lat = 0; lat < 180; lat += 15) {
    ctx.beginPath();
    ctx.moveTo(0, (lat / 180) * height);
    ctx.lineTo(width, (lat / 180) * height);
    ctx.stroke();
  }
  // Subtle geographic circuit strokes, distinct from the real country boundaries.
  ctx.strokeStyle = '#95d9d820';
  for (let i = 0; i < 28; i++) {
    const x = (i * 173) % width,
      y = (i * 79) % height;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 18, y);
    ctx.lineTo(x + 18, y + 10);
    ctx.lineTo(x + 36, y + 10);
    ctx.stroke();
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `${Math.round(width / 145)}px sans-serif`;
  for (const f of features) {
    const p = countryCentre(f);
    if (f.geometry.type === 'MultiPolygon' && f.geometry.coordinates.length > 20) continue;
    const rings =
      f.geometry.type === 'Polygon'
        ? f.geometry.coordinates[0]
        : f.geometry.coordinates.reduce((a, b) => (b[0].length > a.length ? b[0] : a), []);
    const xs = rings.map((p) => p[0]),
      ys = rings.map((p) => p[1]);
    if (Math.max(...xs) - Math.min(...xs) < 6 || Math.max(...ys) - Math.min(...ys) < 4) continue;
    ctx.fillStyle = '#e6f2debb';
    ctx.fillText(
      f.properties.name,
      ((p.longitude + 180) / 360) * width,
      ((90 - p.latitude) / 180) * height,
      Math.max(40, ((Math.max(...xs) - Math.min(...xs)) / 360) * width),
    );
  }
}
export class TravelGlobe {
  constructor(
    canvas,
    mapCanvas,
    features,
    locations,
    { onSelect, onProject, isActive = () => true, reduced = () => false, onError, onRestore } = {},
  ) {
    this.canvas = canvas;
    this.mapCanvas = mapCanvas;
    this.features = features;
    this.locations = locations;
    this.onSelect = onSelect;
    this.onProject = onProject;
    this.isActive = isActive;
    this.reduced = reduced;
    this.onError = onError;
    this.onRestore = onRestore;
    this.listeners = [];
    this.frameId = null;
    this.idleTimer = null;
    this.contextLost = false;
    this.disposed = false;
    this.yaw = radians(95);
    this.pitch = 0.25;
    this.distance = 6.2;
    this.auto = true;
    this.userInteracted = false;
    this.mode = 'globe';
    this.selected = null;
    this.drag = null;
    this.last = 0;
    this.gl = canvas.getContext('webgl', { alpha: true, antialias: true });
    this.contextRecovery = this.gl?.getExtension('WEBGL_lose_context');
    this.drawMap();
    this.bind();
    if (!this.gl) {
      this.mode = 'map';
      onError?.('3D graphics unavailable. The accessible 2D atlas is ready.');
      return;
    }
    this.frame = this.frame.bind(this);
    this.init();
    this.wake();
  }
  // Start the animation loop if it is idle; harmless when it is already running.
  wake() {
    if (this.disposed || this.frameId !== null) return;
    clearTimeout(this.idleTimer);
    this.idleTimer = null;
    this.last = 0;
    this.frameId = requestAnimationFrame(this.frame);
  }
  running() {
    return !this.disposed && !this.contextLost && this.mode === 'globe' && !!this.isActive();
  }
  dispose() {
    this.disposed = true;
    if (this.frameId !== null) cancelAnimationFrame(this.frameId);
    clearTimeout(this.idleTimer);
    this.frameId = this.idleTimer = null;
    for (const [target, type, fn, options] of this.listeners)
      target.removeEventListener(type, fn, options);
    this.listeners = [];
  }
  drawMap() {
    const ctx = this.mapCanvas.getContext('2d');
    if (ctx) {
      this.mapCanvas.width = 1440;
      this.mapCanvas.height = 720;
      drawAtlas(ctx, this.features, 1440, 720, this.selected);
    }
  }
  init() {
    const gl = this.gl,
      locations = this.locations;
    const vs = `attribute vec3 aPosition;attribute vec2 aUV;uniform mat4 uVP;varying vec2 vUV;varying vec3 vNormal;void main(){vUV=aUV;vNormal=normalize(aPosition);gl_Position=uVP*vec4(aPosition,1.0);gl_PointSize=8.0;}`;
    const fs = `precision mediump float;varying vec2 vUV;varying vec3 vNormal;uniform sampler2D uMap;uniform vec3 uEye;uniform float uLine;uniform vec4 uColor;void main(){if(uLine>0.5){gl_FragColor=uColor;return;}vec3 n=normalize(vNormal);vec3 tex=texture2D(uMap,vUV).rgb;float diffuse=max(0.0,dot(n,normalize(vec3(-0.4,0.7,0.8))));float rim=pow(1.0-max(0.0,dot(n,normalize(uEye))),3.0);gl_FragColor=vec4(tex*(0.64+0.42*diffuse)+vec3(0.13,0.38,0.4)*rim,1.0);}`;
    const shader = (type, src) => {
      let s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw Error(gl.getShaderInfoLog(s));
      return s;
    };
    this.program = gl.createProgram();
    gl.attachShader(this.program, shader(gl.VERTEX_SHADER, vs));
    gl.attachShader(this.program, shader(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(this.program);
    if (!gl.getProgramParameter(this.program, gl.LINK_STATUS))
      throw Error(gl.getProgramInfoLog(this.program));
    gl.useProgram(this.program);
    this.p = gl.getAttribLocation(this.program, 'aPosition');
    this.uv = gl.getAttribLocation(this.program, 'aUV');
    this.u = {};
    for (const name of ['uVP', 'uEye', 'uLine', 'uColor', 'uMap'])
      this.u[name] = gl.getUniformLocation(this.program, name);
    gl.enableVertexAttribArray(this.p);
    gl.enableVertexAttribArray(this.uv);
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    const positions = [],
      uvs = [],
      lat = 48,
      lon = 96;
    const vertex = (i, j) => {
      const latitude = 90 - (i / lat) * 180,
        longitude = -180 + (j / lon) * 360;
      positions.push(...latLonPoint(latitude, longitude));
      uvs.push(j / lon, i / lat);
    };
    for (let i = 0; i < lat; i++)
      for (let j = 0; j < lon; j++) {
        vertex(i, j);
        vertex(i + 1, j);
        vertex(i + 1, j + 1);
        vertex(i, j);
        vertex(i + 1, j + 1);
        vertex(i, j + 1);
      }
    this.count = positions.length / 3;
    const buffer = (data) => {
      let b = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, b);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW);
      return b;
    };
    this.posBuffer = buffer(positions);
    this.uvBuffer = buffer(uvs);
    this.textureCanvas = document.createElement('canvas');
    this.textureCanvas.width = 2048;
    this.textureCanvas.height = 1024;
    this.texture = gl.createTexture();
    this.uploadTexture();
    this.arcBuffers = [];
    for (let i = 0; i < locations.length; i++) {
      const a = latLonPoint(locations[i].latitude, locations[i].longitude, 1),
        b = latLonPoint(
          locations[(i + 1) % locations.length].latitude,
          locations[(i + 1) % locations.length].longitude,
          1,
        ),
        angle = Math.acos(
          clamp(
            a.reduce((s, v, k) => s + v * b[k], 0),
            -1,
            1,
          ),
        ),
        data = [];
      for (let t = 0; t <= 40; t++) {
        let v = a.map(
          (x, k) =>
            (x * Math.sin((1 - t / 40) * angle) + b[k] * Math.sin((t / 40) * angle)) /
            Math.sin(angle),
        );
        const r = 1.84 + 0.27 * Math.sin((t / 40) * Math.PI);
        data.push(...v.map((x) => x * r));
      }
      this.arcBuffers.push({
        pos: buffer(data),
        uv: buffer(new Array((data.length / 3) * 2).fill(0)),
        count: data.length / 3,
      });
    }
    this.nodeBuffer = buffer(locations.flatMap((l) => latLonPoint(l.latitude, l.longitude, 1.86)));
    this.nodeUV = buffer(new Array(locations.length * 2).fill(0));
  }
  uploadTexture() {
    const gl = this.gl;
    drawAtlas(this.textureCanvas.getContext('2d'), this.features, 2048, 1024, this.selected);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.textureCanvas);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }
  bind() {
    const c = this.canvas,
      on = (target, type, fn, options) => {
        target.addEventListener(type, fn, options);
        this.listeners.push([target, type, fn, options]);
      };
    on(c, 'webglcontextlost', (e) => {
      // Allow restoration, stop drawing and fall back to the 2D atlas meanwhile.
      e.preventDefault();
      if (this.contextLost) return;
      this.contextLost = true;
      if (this.graphicsSuspended) return;
      this.onError?.(
        '3D globe graphics were interrupted. The 2D atlas is ready; the globe returns when graphics recover.',
      );
    });
    on(c, 'webglcontextrestored', () => {
      try {
        this.init();
        this.contextLost = false;
        this.onRestore?.();
        this.wake();
      } catch {
        this.onError?.('3D graphics unavailable. The accessible 2D atlas is ready.');
      }
    });
    on(c, 'pointerdown', (e) => {
      this.userInteracted = true;
      this.drag = { x: e.clientX, y: e.clientY, startX: e.clientX, startY: e.clientY };
      this.auto = false;
      c.setPointerCapture(e.pointerId);
    });
    on(c, 'pointermove', (e) => {
      if (!this.drag) return;
      this.yaw -= (e.clientX - this.drag.x) * 0.007;
      this.pitch = clamp(this.pitch + (e.clientY - this.drag.y) * 0.005, -1.1, 1.1);
      this.drag.x = e.clientX;
      this.drag.y = e.clientY;
    });
    on(c, 'pointerup', (e) => {
      if (this.drag && Math.hypot(e.clientX - this.drag.startX, e.clientY - this.drag.startY) < 7) {
        const rect = c.getBoundingClientRect(),
          p = globePick(
            e.clientX - rect.left,
            e.clientY - rect.top,
            c.clientWidth,
            c.clientHeight,
            this.yaw,
            this.pitch,
            this.distance,
          );
        if (p) {
          const country = countryAt(this.features, p.latitude, p.longitude);
          if (country) this.onSelect?.(country);
        }
      }
      this.drag = null;
    });
    on(c, 'pointercancel', () => (this.drag = null));
    on(
      c,
      'wheel',
      (e) => {
        e.preventDefault();
        this.distance = clamp(this.distance + e.deltaY * 0.004, 3.6, 9);
      },
      { passive: false },
    );
    on(this.mapCanvas, 'click', (e) => {
      const r = this.mapCanvas.getBoundingClientRect(),
        country = countryAt(
          this.features,
          90 - ((e.clientY - r.top) / r.height) * 180,
          ((e.clientX - r.left) / r.width) * 360 - 180,
        );
      if (country) this.onSelect?.(country);
    });
    on(c, 'keydown', (e) => {
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', '+', '-'].includes(e.key)) {
        e.preventDefault();
        this.rotate(
          e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0,
          e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : 0,
        );
        if (e.key === '+') this.zoom(-1);
        if (e.key === '-') this.zoom(1);
      }
    });
  }
  releaseGraphics() {
    if (!this.gl || this.contextLost || typeof this.contextRecovery?.loseContext !== 'function')
      return false;
    this.graphicsSuspended = true;
    this.contextLost = true;
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
  rotate(x, y = 0) {
    this.userInteracted = true;
    this.auto = false;
    this.yaw += x * 0.2;
    this.pitch = clamp(this.pitch + y * 0.15, -1.1, 1.1);
    this.wake();
  }
  zoom(d) {
    this.distance = clamp(this.distance + d * 0.45, 3.6, 9);
    this.wake();
  }
  focus(location) {
    this.auto = false;
    this.yaw = radians(location.longitude);
    this.pitch = clamp(radians(location.latitude) * 0.7, -1, 1);
    this.wake();
  }
  select(feature) {
    this.selected = feature.properties.iso;
    this.auto = false;
    const place = this.locations.find((l) => l.iso === this.selected) || countryCentre(feature);
    this.yaw = radians(place.longitude);
    this.pitch = clamp(radians(place.latitude) * 0.7, -1, 1);
    if (this.gl && !this.contextLost) this.uploadTexture();
    this.drawMap();
    this.wake();
  }
  frame(time) {
    this.frameId = null;
    if (!this.running()) {
      // Stop the animation loop while hidden, in map mode or without a context; poll cheaply to resume.
      if (!this.disposed && !this.contextLost && this.idleTimer === null)
        this.idleTimer = setTimeout(() => {
          this.idleTimer = null;
          if (this.running()) this.wake();
          else this.frame(0);
        }, 500);
      return;
    }
    const dt = this.last ? Math.min(0.05, (time - this.last) / 1000) : 0;
    this.last = time;
    if (this.auto && !this.reduced()) this.yaw += dt * 0.075;
    this.render();
    this.frameId = requestAnimationFrame(this.frame);
  }
  render() {
    const gl = this.gl,
      w = Math.max(1, this.canvas.clientWidth),
      h = Math.max(1, this.canvas.clientHeight),
      dpr = Math.min(2, globalThis.devicePixelRatio || 1);
    if (this.canvas.width !== Math.round(w * dpr) || this.canvas.height !== Math.round(h * dpr)) {
      this.canvas.width = Math.round(w * dpr);
      this.canvas.height = Math.round(h * dpr);
    }
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(this.program);
    const eye = [
      Math.sin(this.yaw) * Math.cos(this.pitch) * this.distance,
      Math.sin(this.pitch) * this.distance,
      Math.cos(this.yaw) * Math.cos(this.pitch) * this.distance,
    ];
    this.matrix = multiply(perspective(0.65, w / h, 0.1, 25), lookAt(eye, [0, 0, 0]));
    gl.uniformMatrix4fv(this.u.uVP, false, this.matrix);
    gl.uniform3fv(this.u.uEye, eye);
    gl.uniform1i(this.u.uMap, 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    const draw = (p, uv, count, mode) => {
      gl.bindBuffer(gl.ARRAY_BUFFER, p);
      gl.vertexAttribPointer(this.p, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, uv);
      gl.vertexAttribPointer(this.uv, 2, gl.FLOAT, false, 0, 0);
      gl.drawArrays(mode, 0, count);
    };
    gl.uniform1f(this.u.uLine, 0);
    draw(this.posBuffer, this.uvBuffer, this.count, gl.TRIANGLES);
    gl.uniform1f(this.u.uLine, 1);
    gl.uniform4fv(this.u.uColor, [0.43, 0.96, 0.89, 0.6]);
    for (const a of this.arcBuffers) draw(a.pos, a.uv, a.count, gl.LINE_STRIP);
    gl.uniform4fv(this.u.uColor, [0.75, 1, 0.85, 1]);
    draw(this.nodeBuffer, this.nodeUV, this.locations.length, gl.POINTS);
    this.onProject?.(
      this.locations.map((l) => {
        const p = latLonPoint(l.latitude, l.longitude, 1.91),
          screen = projectPoint(this.matrix, p, w, h);
        screen.visible = screen.visible && p.reduce((s, v, i) => s + v * eye[i], 0) > 1.8 * 1.8;
        return { id: l.id, ...screen };
      }),
    );
  }
}
