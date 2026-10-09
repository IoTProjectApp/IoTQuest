import { Runtime } from '../public/runtime.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorldModel } from '../public/world-model.js';
import { World3D, frustumTest } from '../public/world3d.js';
import { locations } from '../public/locations.js';
import {
  multiply,
  modelMatrix,
  lookAt,
  perspective,
  projectPoint,
  toWorld,
  fromWorld,
  collides,
  resolveMove,
  findFree,
  deviceState,
} from '../public/world-math.js';
import { defaults, baseEnv, missions, program } from '../public/missions.js';
const areas = [
  ['Bedroom', 19, 17],
  ['Bathroom', 30, 15],
  ['Kitchen', 35, 31],
  ['Utility room', 48, 12],
  ['Living room', 20, 35],
  ['Garage', 50, 30],
  ['Greenhouse', 80, 20],
  ['Water tank', 91, 43],
  ['Plant beds', 77, 64],
  ['Garden path', 43, 60],
  ['Entrance', 32, 51],
];
function renderer() {
  const listeners = new Map();
  const calls = { draws: 0, uniforms: [], shaders: [] },
    noop = () => {},
    gl = new Proxy(
      {
        getShaderParameter: () => true,
        getProgramParameter: () => true,
        getAttribLocation: () => 0,
        getUniformLocation: (_, name) => name,
        drawArrays: () => calls.draws++,
        shaderSource: (_, source) => calls.shaders.push(source),
        uniformMatrix4fv: (name, _, values) => {
          assert.ok([...values].every(Number.isFinite), name);
          calls.uniforms.push(name);
        },
        uniformMatrix3fv: (name, _, values) => assert.ok([...values].every(Number.isFinite), name),
        uniform4fv: (name, values) => assert.ok(values.every(Number.isFinite), name),
        uniform3fv: (name, values) => assert.ok(values.every(Number.isFinite), name),
      },
      { get: (obj, key) => (key in obj ? obj[key] : noop) },
    );
  const canvas = {
    width: 0,
    height: 0,
    clientWidth: 960,
    clientHeight: 490,
    style: {},
    getContext: () => gl,
    listeners,
    addEventListener(type, handler) {
      listeners.set(type, handler);
    },
    removeEventListener(type, handler) {
      if (listeners.get(type) === handler) listeners.delete(type);
    },
  };
  const state = {
    devices: [],
    env: { ...baseEnv },
    outputs: {},
    player: { x: 48, y: 77 },
    color: '#547b5b',
    appearance: '🧑‍🔧',
    reduced: false,
    speed: 1,
    areas,
  };
  const oldRAF = globalThis.requestAnimationFrame;
  globalThis.requestAnimationFrame = () => 1;
  const world = new World3D(canvas, { getState: () => state });
  globalThis.requestAnimationFrame = oldRAF;
  return { world, state, calls, canvas };
}
test('world uses real 3D furniture, plants and articulated meshes in all six rooms', () => {
  const m = createWorldModel();
  assert.equal(m.rooms.length, 6);
  assert.ok(m.objects.length > 450);
  assert.ok(m.colliders.length > 35);
  assert.ok(m.plants.length >= 18);
  assert.ok(m.actors.find((a) => a.id === 'player').parts.some((p) => p.toolkit));
  for (const o of m.objects) {
    assert.ok(o.pos.every(Number.isFinite));
    assert.ok(o.size.every((v) => Number.isFinite(v) && v > 0));
  }
});
test('frustum culling skips objects outside the view, including the mirrored view', () => {
  const MIRROR = new Float32Array([-1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]),
    view = lookAt([0, 5, 10], [0, 0, 0]),
    projection = perspective(0.78, 1.6, 0.1, 160);
  const straight = multiply(projection, view);
  for (const matrix of [straight, multiply(projection, multiply(view, MIRROR))]) {
    const visible = frustumTest(matrix);
    assert.ok(visible({ pos: [0, 0, 0], size: [1, 1, 1] }), 'At the target');
    assert.ok(!visible({ pos: [100, 0, 0], size: [1, 1, 1] }), 'Far to the side');
    assert.ok(!visible({ pos: [0, 0, 40], size: [1, 1, 1] }), 'Behind the camera');
    assert.ok(!visible({ pos: [0, 0, -400], size: [1, 1, 1] }), 'Past the far plane');
    assert.ok(visible({ pos: [30, 0, 0], size: [60, 1, 1] }), 'Large object reaching in');
    assert.ok(visible({ pos: [0, 0, 0] }), 'Default size');
    const level = lookAt([0, 0, 10], [0, 0, 0]),
      sharp = frustumTest(
        multiply(projection, matrix === straight ? level : multiply(level, MIRROR)),
        900 / 2 / Math.tan(0.39),
      );
    assert.equal(sharp({ pos: [0, 0, -100], size: [0.05, 0.05, 0.05] }), 0, 'Sub-pixel');
    const far = sharp({ pos: [0, 0, -100], size: [1, 1, 1] }),
      near = sharp({ pos: [0, 0, 0], size: [1, 1, 1] });
    assert.ok(far > 0 && far < 16, 'Large at distance: drawn, with the simpler shape');
    assert.ok(near > far, 'Nearer objects are larger on screen');
    assert.ok(sharp({ pos: [0, 0, 0], size: [0.05, 0.05, 0.05] }), 'Small but near');
    for (const flag of ['sky', 'emission'])
      assert.equal(
        sharp({ pos: [0, 0, -100], size: [0.05, 0.05, 0.05], [flag]: 1 }),
        Infinity,
        flag + ' is always drawn',
      );
  }
});
test('perspective projection places camera target at screen centre and clips points behind the camera', () => {
  const m = multiply(perspective(Math.PI / 3, 2), lookAt([10, 10, 10], [0, 0, 0])),
    p = projectPoint(m, [0, 0, 0], 1000, 500);
  assert.ok(Math.abs(p.x - 500) < 0.01);
  assert.ok(Math.abs(p.y - 250) < 0.01);
  assert.equal(p.visible, true);
  assert.equal(projectPoint(m, [20, 20, 20], 1000, 500).visible, false);
});
test('model transform rotates and translates actual vertices', () => {
  const m = modelMatrix([3, 4, 5], [2, 3, 4], [0, Math.PI / 2, 0]);
  assert.deepEqual([...m.slice(12, 15)], [3, 4, 5]);
  assert.ok(Math.abs(m[0]) < 0.0001);
  assert.equal(m[2], -2);
  assert.equal(m[8], 4);
});
test('world coordinates round-trip saved character positions', () => {
  const w = toWorld({ x: 34, y: 70 });
  const p = fromWorld(w[0], w[2]);
  assert.ok(Math.abs(p.x - 34) < 1e-9);
  assert.ok(Math.abs(p.y - 70) < 1e-9);
});
test('solid walls stop walking, openings allow it, and camera rotation changes movement direction', () => {
  const barrier = [{ x: 0, z: 0, w: 4, d: 0.2 }],
    player = { x: 50, y: 53 };
  let p = player;
  for (let i = 0; i < 20; i++) p = resolveMove(p, 'up', 0.55, 0, barrier);
  assert.ok(toWorld(p)[2] > 0.32);
  const rotated = resolveMove({ x: 50, y: 77 }, 'up', 1, Math.PI / 2, []);
  assert.ok(rotated.x < 50);
  assert.ok(Math.abs(rotated.y - 77) < 1e-9);
});
test('every room and garden installation point has a safe reachable landing beside its furniture', () => {
  const model = createWorldModel();
  for (const a of areas) {
    const p = findFree({ x: a[1], y: a[2] + 5 }, model.colliders),
      w = toWorld(p);
    assert.equal(collides(w[0], w[2], model.colliders), false, a[0]);
  }
});
test('walking cannot leave the property', () => {
  let p = { x: 50, y: 77 };
  for (let i = 0; i < 500; i++) p = resolveMove(p, 'right', 1, 0, []);
  assert.ok(p.x <= 94.001);
  for (let i = 0; i < 500; i++) p = resolveMove(p, 'down', 1, 0, []);
  assert.ok(p.y <= 97);
});
test('3D device states come from GPIO outputs, not mission success', () => {
  const d = { id: 'pump', pin: 26 };
  assert.equal(deviceState(d, { 26: 1 }, { ...baseEnv, tank: 80 }).flow, true);
  assert.equal(deviceState(d, { 26: 0 }, { ...baseEnv, tank: 80 }).flow, false);
  assert.equal(deviceState(d, { 26: 1 }, { ...baseEnv, tank: 0 }).flow, false);
  assert.equal(deviceState({ id: 'servo', pin: 25 }, { 25: 90 }, baseEnv).angle, Math.PI / 2);
});
test('renderer uploads finite transforms and draws mesh geometry with perspective lighting', () => {
  const { world, calls, canvas } = renderer();
  world.render(1, 0.016);
  assert.ok(calls.draws > 450);
  assert.ok(calls.uniforms.includes('uViewProjection'));
  assert.match(calls.shaders[0], /uViewProjection\*world/);
  assert.match(calls.shaders[1], /uLights/);
  assert.ok(canvas.width > 0 && canvas.height > 0);
});
test('reset camera retains the selected room and restores its close-up framing', () => {
  const { world } = renderer();
  world.yaw = 2;
  world.pitch = 1;
  world.follow = true;
  world.resetCamera('detail', ['Kitchen', 35, 31], 1.9);
  assert.equal(world.follow, false);
  assert.equal(world.yaw, 0.32);
  assert.equal(world.pitch, 0.62);
  assert.equal(world.distance, 11);
  const expected = toWorld({ x: 35, y: 31 });
  assert.deepEqual(world.target, [expected[0], 0.75, expected[2]]);
  world.resetCamera();
  assert.equal(world.overview, true);
  assert.equal(world.distance, 130);
});
test('Sky view uses an eye-height camera and can centre the actual moon in mirrored homes', () => {
  const { world, state } = renderer();
  Object.assign(state, {
    skyMode: 'simulated',
    skyDate: '2024-09-18',
    skyStartHour: 22,
    simClockMs: 0,
  });
  world.render(1, 0.016);
  for (const mirrored of [false, true]) {
    world.model.mirrored = mirrored;
    assert.equal(world.findMoon(), true);
    world.render(2, 0.016);
    const moon = world.project(world.model.sky.moon.mesh.pos);
    assert.equal(moon.visible, true);
    assert.ok(Math.abs(moon.x - world.width / 2) < 0.01);
    assert.ok(Math.abs(moon.y - world.height / 2) < 0.01);
    assert.equal(world.eye[1], 1.7);
  }
  state.skyStartHour = 12;
  world.render(3, 0.016);
  assert.equal(world.findMoon(), false);
  world.setView('world');
  assert.equal(world.skyView, false);
  assert.ok(world.pitch > 0);
});
test('Landscape view widens the camera and scenery holds still when the game is paused', () => {
  const { world, state } = renderer();
  world.setView('landscape');
  assert.equal(world.landscapeView, true);
  assert.equal(world.distance, 68);
  state.reduced = true;
  world.render(1, 0.016);
  assert.ok(world.currentDistance >= 68);
  const before = JSON.stringify(
    world.model.landscape.birds.map((b) => b.parts.map((p) => p.mesh.pos)),
  );
  state.reduced = false;
  state.paused = true;
  world.render(2, 0.016);
  world.render(3, 0.016);
  assert.equal(
    JSON.stringify(world.model.landscape.birds.map((b) => b.parts.map((p) => p.mesh.pos))),
    before,
  );
  world.setView('house');
  assert.equal(world.landscapeView, false);
  assert.ok(world.distance < 68);
});
test('returning from a distant panorama keeps the house inside the camera clipping range', () => {
  const { world, state } = renderer();
  world.currentDistance = 175;
  world.setView('world');
  world.render(1, 0.001);
  const house = world.project([0, 0.35, 0]);
  assert.equal(house.visible, true);
});
test('raised-house garage doors stay at their own floor height', () => {
  const { world, state } = renderer();
  state.locationId = 'brisbane';
  world.setRegion('brisbane');
  const door = world.model.dynamic.garageDoor,
    closed = 0.38 + 0.68;
  world.render(1, 0.016);
  assert.equal(door.pos[1], closed);
  state.env.door = 1;
  world.render(2, 0.016);
  assert.ok(Math.abs(door.pos[1] - (closed + 1.82)) < 1e-8);
});
test('pausing the horse farm freezes sprinkler droplets and animal poses', () => {
  const { world, state } = renderer();
  state.locationId = 'macedon';
  world.setRegion('macedon');
  state.devices = defaults(['valve'], 'ESP32');
  state.outputs[state.devices[0].pin] = 1;
  world.render(1, 0.016);
  state.paused = true;
  const snapshot = () =>
    JSON.stringify({
      mist: world.model.farm.shelters.flatMap((s) => s.mist.map((m) => [m.pos, m.opacity])),
      animals: world.model.animals.map((a) => a.parts.map((p) => p.mesh.pos)),
    });
  const before = snapshot();
  world.render(4, 0.016);
  assert.equal(snapshot(), before);
});
test('disposing a world removes its controls and cannot delete resources twice', () => {
  const { world, canvas } = renderer();
  assert.ok(canvas.listeners.size > 0);
  const cancel = globalThis.cancelAnimationFrame;
  globalThis.cancelAnimationFrame = () => {};
  try {
    world.dispose();
    assert.equal(canvas.listeners.size, 0);
    assert.equal(world.drag, null);
    world.dispose();
  } finally {
    globalThis.cancelAnimationFrame = cancel;
  }
});
test('every destination renders finite geometry through daylight, storms, Sky and Landscape views', () => {
  const { world, state } = renderer();
  for (const location of [{ id: 'legacy' }, ...locations]) {
    state.locationId = location.id;
    world.setRegion(location.id);
    for (const view of ['world', 'landscape', 'sky']) {
      world.setView(view);
      Object.assign(state.env, {
        light: view === 'sky' ? 3 : 70,
        rain: view === 'landscape' ? 85 : 0,
        cloud: view === 'landscape' ? 95 : 20,
        wind: 40,
      });
      world.render(1, 0.016);
      for (const mesh of world.model.objects) {
        assert.ok(world.geometries[mesh.shape], location.id + ' known geometry ' + mesh.shape);
        assert.ok(mesh.pos.every(Number.isFinite), location.id + ' finite position');
        assert.ok(mesh.rotation.every(Number.isFinite), location.id + ' finite rotation');
        assert.ok(
          mesh.size.every((v) => Number.isFinite(v) && v > 0),
          location.id + ' valid dimensions',
        );
      }
    }
  }
});
test('installed 3D device geometry is rendered, updates from outputs, and is removed cleanly', () => {
  const { world, state } = renderer();
  world.render(0, 0.016);
  const base = world.model.objects.length;
  state.devices = defaults(['ldr', 'led'], 'ESP32').map((d) => ({ ...d, area: 'Garden path' }));
  world.render(1, 0.016);
  assert.ok(world.model.objects.length > base);
  let lamp = world.deviceObjects.find((o) => o.device.id === 'led');
  assert.equal(lamp.light.emission, 0);
  state.outputs[26] = 1;
  world.render(2, 0.016);
  assert.equal(lamp.light.emission, 1);
  assert.ok(lamp.pool.opacity > 0);
  assert.ok(world.model.lamps.every((l) => l.emission === 1));
  state.devices = [];
  world.render(3, 0.016);
  assert.equal(world.model.objects.length, base);
});
test('irrigation particles, tank gauge, plants and gate respond to live simulation', () => {
  const { world, state } = renderer();
  state.devices = defaults(['pump', 'gate'], 'ESP32').map((d) => ({
    ...d,
    area: d.id === 'gate' ? 'Entrance' : 'Plant beds',
  }));
  state.outputs = { 26: 1, 25: 1 };
  world.render(1, 0.016);
  assert.ok(world.deviceObjects[0].parts.some((p) => p.opacity > 0));
  assert.equal(world.model.dynamic.gateCollider.disabled, true);
  state.env.tank = 0;
  state.env.soil = 10;
  world.render(2, 0.016);
  assert.ok(world.deviceObjects[0].parts.every((p) => p.opacity === 0));
  assert.ok(world.model.dynamic.tankGauge.size[1] < 0.03);
  assert.equal(world.model.plants[0].leaves[0].color, '#b6a369');
  state.outputs = {};
  world.render(3, 0.016);
  assert.equal(world.model.dynamic.gateCollider.disabled, false);
});
test('reduced motion stops rotating fan blades and rainfall while retaining output indicators', () => {
  const { world, state } = renderer();
  state.devices = defaults(['fan'], 'ESP32');
  state.outputs[26] = 255;
  state.reduced = true;
  state.env.rain = 60;
  world.render(1, 0.016);
  const blade = world.deviceObjects[0].parts.find((p) => p.blade === 0),
    rotation = blade.rotation[2],
    rainY = world.model.rain[0].pos[1];
  world.render(5, 0.016);
  assert.equal(blade.rotation[2], rotation);
  assert.equal(world.model.rain[0].pos[1], rainY);
  assert.ok(world.deviceObjects[0].face.emission > 0);
});
test('AC louvres sweep while cooling, hold still under reduced motion and close when off', () => {
  const { world, state } = renderer();
  state.devices = defaults(['ac'], 'ESP32');
  const pin = state.devices[0].pin,
    louvre = () => world.deviceObjects[0].parts.find((p) => p.louvre === 0);
  state.outputs[pin] = 1;
  world.render(1, 0.016);
  const first = louvre().rotation[0];
  world.render(2, 0.016);
  assert.ok(first > 0);
  assert.notEqual(louvre().rotation[0], first);
  state.reduced = true;
  world.render(3, 0.016);
  const held = louvre().rotation[0];
  world.render(4, 0.016);
  assert.equal(louvre().rotation[0], held);
  state.outputs[pin] = 0;
  world.render(5, 0.016);
  assert.equal(louvre().rotation[0], 0);
});
test('WebGL unavailability produces an actionable error', () => {
  assert.throws(() => new World3D({ getContext: () => null }), /WebGL is unavailable/);
});
test('3D animations use actual simulated elapsed time without double acceleration', () => {
  const { world, state } = renderer();
  state.devices = defaults(['fan', 'pump'], 'ESP32');
  state.outputs = { 26: 255, 25: 1 };
  state.speed = 360;
  state.simClockMs = 0;
  world.render(1, 0.016);
  const initial = world.fanAngle;
  state.simClockMs = 1000;
  world.render(2, 0.016);
  assert.ok(Math.abs(world.fanAngle - initial - 10) < 1e-9);
  const droplet = world.deviceObjects.find((d) => d.device.id === 'pump').parts[0];
  assert.ok(Math.abs(droplet.pos[1] - (0.55 + Math.sin(0.7 * Math.PI) * 0.7)) < 1e-9);
  state.paused = true;
  const angle = world.fanAngle;
  world.render(3, 0.016);
  assert.equal(world.fanAngle, angle);
});
test('upgraded meshes return when switching to a new scene with the same upgrades', () => {
  const { world, state } = renderer();
  state.upgrades = ['solar'];
  world.render(1, 0.016);
  assert.ok(world.model.objects.some((o) => o.upgrade));
  world.setRegion('kyoto');
  world.render(2, 0.016);
  assert.ok(world.model.objects.some((o) => o.upgrade));
});
function eventCanvas(gl) {
  const listeners = new Map();
  return {
    width: 0,
    height: 0,
    clientWidth: 960,
    clientHeight: 490,
    style: {},
    getContext: () => gl,
    addEventListener: (type, fn) => listeners.set(type, [...(listeners.get(type) || []), fn]),
    removeEventListener: (type, fn) =>
      listeners.set(
        type,
        (listeners.get(type) || []).filter((f) => f !== fn),
      ),
    fire: (type, event = {}) =>
      (listeners.get(type) || []).forEach((fn) => fn({ preventDefault() {}, ...event })),
    listeners,
  };
}
function animationFrames() {
  const queue = new Map(),
    old = [globalThis.requestAnimationFrame, globalThis.cancelAnimationFrame];
  let id = 0;
  globalThis.requestAnimationFrame = (fn) => (queue.set(++id, fn), id);
  globalThis.cancelAnimationFrame = (n) => queue.delete(n);
  return {
    queue,
    step(time) {
      const callbacks = [...queue.values()];
      queue.clear();
      callbacks.forEach((fn) => fn(time));
    },
    restore() {
      [globalThis.requestAnimationFrame, globalThis.cancelAnimationFrame] = old;
    },
  };
}
const fakeGL = (counter = {}) =>
  new Proxy(
    {
      getShaderParameter: () => true,
      getProgramParameter: () => true,
      getAttribLocation: () => 0,
      getUniformLocation: (_, name) => name,
      createProgram: () => (counter.programs = (counter.programs || 0) + 1),
    },
    { get: (obj, key) => (key in obj ? obj[key] : () => {}) },
  );
test('3D render errors are reported once and the loop keeps running; restored contexts rebuild GL resources', () => {
  const frames = animationFrames(),
    counter = {},
    canvas = eventCanvas(fakeGL(counter)),
    errors = [];
  try {
    const state = {
      devices: [],
      env: { ...baseEnv },
      outputs: {},
      player: { x: 48, y: 77 },
      color: '#547b5b',
      reduced: false,
      speed: 1,
      areas,
    };
    const world = new World3D(canvas, { getState: () => state, onError: (m) => errors.push(m) });
    const render = world.render.bind(world);
    world.render = () => {
      throw Error('boom');
    };
    frames.step(16);
    frames.step(32);
    assert.equal(errors.length, 1);
    assert.match(errors[0], /boom/);
    assert.equal(frames.queue.size, 1);
    world.render = render;
    frames.step(48);
    assert.equal(frames.queue.size, 1);
    canvas.fire('webglcontextlost');
    assert.equal(frames.queue.size, 0);
    assert.match(errors.at(-1), /lost/);
    canvas.fire('webglcontextrestored');
    assert.equal(counter.programs, 2);
    assert.equal(frames.queue.size, 1);
    frames.step(64);
    assert.equal(frames.queue.size, 1);
  } finally {
    frames.restore();
  }
});
test('a 0×0 canvas (hidden Code layout) skips drawing and label projection until it is shown', () => {
  const frames = animationFrames(),
    canvas = eventCanvas(fakeGL()),
    projected = [];
  try {
    const state = {
      devices: [],
      env: { ...baseEnv },
      outputs: {},
      player: { x: 48, y: 77 },
      color: '#547b5b',
      reduced: false,
      speed: 1,
      areas,
    };
    canvas.clientWidth = canvas.clientHeight = 0;
    new World3D(canvas, { getState: () => state, onFrame: (w) => projected.push(w.width) });
    frames.step(16);
    frames.step(32);
    assert.deepEqual(projected, []);
    assert.equal(frames.queue.size, 1, 'The loop keeps polling while hidden');
    canvas.clientWidth = 800;
    canvas.clientHeight = 450;
    frames.step(48);
    assert.deepEqual(projected, [800]);
    assert.equal(frames.queue.size, 1);
  } finally {
    frames.restore();
  }
});
test('travel globe pauses while inactive, falls back on context loss, rebuilds on restore and disposes listeners', async () => {
  const { TravelGlobe } = await import('../public/globe.js');
  const frames = animationFrames(),
    ctx2d = new Proxy({}, { get: () => () => {} }),
    oldDocument = globalThis.document,
    counter = {},
    canvas = eventCanvas(fakeGL(counter)),
    map = eventCanvas(ctx2d),
    errors = [],
    feature = {
      type: 'Feature',
      properties: { iso: 'AAA', name: 'Square', continent: 'Asia' },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [0, 0],
            [10, 0],
            [10, 10],
            [0, 10],
            [0, 0],
          ],
        ],
      },
    };
  globalThis.document = { createElement: () => ({ getContext: () => ctx2d }) };
  let active = true,
    restored = 0;
  try {
    const globe = new TravelGlobe(
      canvas,
      map,
      [feature],
      [{ id: 'a', latitude: 5, longitude: 5 }],
      {
        isActive: () => active,
        onError: (m) => errors.push(m),
        onRestore: () => restored++,
      },
    );
    assert.equal(frames.queue.size, 1);
    frames.step(16);
    assert.equal(frames.queue.size, 1);
    active = false;
    frames.step(32);
    assert.equal(frames.queue.size, 0);
    active = true;
    globe.wake();
    assert.equal(frames.queue.size, 1);
    canvas.fire('webglcontextlost');
    assert.equal(errors.length, 1);
    assert.match(errors[0], /2D atlas/);
    frames.step(48);
    assert.equal(frames.queue.size, 0);
    canvas.fire('webglcontextrestored');
    assert.equal(counter.programs, 2);
    assert.equal(restored, 1);
    assert.equal(frames.queue.size, 1);
    globe.dispose();
    assert.equal(frames.queue.size, 0);
    assert.ok([...canvas.listeners.values(), ...map.listeners.values()].every((l) => !l.length));
  } finally {
    globalThis.document = oldDocument;
    frames.restore();
  }
});
test('a deliberately released globe context comes back as the globe without a fallback notice', async () => {
  const { TravelGlobe } = await import('../public/globe.js');
  const frames = animationFrames(),
    ctx2d = new Proxy({}, { get: () => () => {} }),
    oldDocument = globalThis.document,
    gl = fakeGL(),
    canvas = eventCanvas(
      new Proxy(gl, {
        get: (obj, key) =>
          key === 'getExtension'
            ? () => ({
                loseContext: () => canvas.fire('webglcontextlost'),
                restoreContext: () => canvas.fire('webglcontextrestored'),
              })
            : obj[key],
      }),
    ),
    map = eventCanvas(ctx2d),
    errors = [];
  globalThis.document = { createElement: () => ({ getContext: () => ctx2d }) };
  let restored = 0;
  try {
    const globe = new TravelGlobe(canvas, map, [], [{ id: 'a', latitude: 5, longitude: 5 }], {
      onError: (m) => errors.push(m),
      onRestore: () => restored++,
    });
    assert.equal(globe.releaseGraphics(), true);
    assert.equal(globe.contextLost, true);
    assert.equal(globe.restoreGraphics(), true);
    assert.equal(globe.contextLost, false);
    assert.equal(globe.mode, 'globe');
    assert.deepEqual(errors, []);
    assert.equal(restored, 0);
    // A genuine loss afterwards still falls back and announces the recovery.
    canvas.fire('webglcontextlost');
    canvas.fire('webglcontextrestored');
    assert.equal(errors.length, 1);
    assert.equal(restored, 1);
    globe.dispose();
  } finally {
    globalThis.document = oldDocument;
    frames.restore();
  }
});
test('the travel globe follows only the first finger of a two-finger touch', async () => {
  const { TravelGlobe } = await import('../public/globe.js');
  const frames = animationFrames(),
    ctx2d = new Proxy({}, { get: () => () => {} }),
    oldDocument = globalThis.document,
    canvas = eventCanvas(fakeGL()),
    map = eventCanvas(ctx2d);
  canvas.setPointerCapture = () => {};
  globalThis.document = { createElement: () => ({ getContext: () => ctx2d }) };
  try {
    const globe = new TravelGlobe(canvas, map, [], [{ id: 'a', latitude: 5, longitude: 5 }]);
    canvas.fire('pointerdown', { pointerId: 1, clientX: 100, clientY: 100 });
    canvas.fire('pointerdown', { pointerId: 2, clientX: 500, clientY: 400 });
    const yaw = globe.yaw,
      pitch = globe.pitch;
    canvas.fire('pointermove', { pointerId: 2, clientX: 520, clientY: 420 });
    assert.equal(globe.yaw, yaw);
    assert.equal(globe.pitch, pitch);
    canvas.fire('pointerup', { pointerId: 2, clientX: 520, clientY: 420 });
    assert.equal(globe.drag.id, 1);
    canvas.fire('pointermove', { pointerId: 1, clientX: 110, clientY: 100 });
    assert.ok(Math.abs(globe.yaw - (yaw - 0.07)) < 1e-9);
    canvas.fire('pointercancel', { pointerId: 1 });
    assert.equal(globe.drag, null);
    globe.dispose();
  } finally {
    globalThis.document = oldDocument;
    frames.restore();
  }
});
test('clouds appear with cloud cover, turn grey in storms and never cross the property', async () => {
  const { addClouds, updateClouds } = await import('../public/clouds.js');
  const { createWorldModel } = await import('../public/world-model.js');
  const model = createWorldModel(),
    clouds = addClouds(model),
    visible = () => clouds.filter((c) => c.puffs[0].mesh.opacity > 0).length;
  updateClouds(clouds, { cloud: 0 }, 0, false);
  assert.equal(visible(), 0);
  updateClouds(clouds, { cloud: 40 }, 0, false);
  const few = visible();
  updateClouds(clouds, { cloud: 100 }, 0, false);
  assert.ok(few > 0 && few < visible() && visible() === clouds.length);
  assert.ok(clouds.every((c) => c.puffs.length >= 5));
  const clear = clouds[0].puffs[1].mesh.color;
  updateClouds(clouds, { cloud: 100, rain: 90 }, 0, false);
  assert.notEqual(clouds[0].puffs[1].mesh.color, clear);
  // From every camera angle and over a long, windy simulated time, every puff stays beyond the
  // property's corners on the far side from the camera, so it can never hide the house.
  for (let yaw = 0; yaw < Math.PI * 2; yaw += 0.4)
    for (let t = 0; t < 600; t += 13) {
      updateClouds(clouds, { cloud: 100, wind: 60 }, t, false, yaw);
      for (const { mesh } of clouds.flatMap((c) => c.puffs)) {
        const [x, , z] = mesh.pos;
        assert.ok(Math.hypot(x, z) > 20, 'cloud too close to the property');
        assert.ok(x * Math.sin(yaw) + z * Math.cos(yaw) < -15, 'cloud on the camera side');
      }
    }
  // Reduced motion keeps clouds still.
  updateClouds(clouds, { cloud: 100 }, 0, true);
  const still = clouds.map((c) => c.puffs[0].mesh.pos[0]);
  updateClouds(clouds, { cloud: 100 }, 99, true);
  assert.deepEqual(
    clouds.map((c) => c.puffs[0].mesh.pos[0]),
    still,
  );
});
test('the sky uses astronomical horizons and does not turn with the camera', async () => {
  const { addSky, updateSky } = await import('../public/sky.js');
  const sky = addSky(createWorldModel()),
    context = { date: new Date('2024-09-18T12:00Z') };
  updateSky(sky, 0, 0, true, 0.32, {}, 0, context);
  assert.equal(sky.sun.mesh.opacity, 0);
  assert.ok(sky.moon.mesh.opacity > 0.9);
  assert.ok(sky.visibleStars > 0 && sky.visibleStars < sky.stars.length);
  const positions = sky.stars.map((s) => [...s.mesh.pos]);
  updateSky(sky, 0, 0, true, 2, {}, 0, context);
  assert.deepEqual(
    sky.stars.map((s) => s.mesh.pos),
    positions,
  );
  for (let i = 0; i < sky.stars.length; i++)
    if (sky.ephemeris.stars[i].altitude <= 0) assert.equal(sky.stars[i].mesh.opacity, 0);
  updateSky(sky, 1, 0, true, 0.32, {}, 0, { date: new Date('2024-09-18T02:00Z') });
  assert.ok(sky.sun.mesh.opacity > 0.9);
  assert.equal(sky.moon.mesh.opacity, 0);
  assert.equal(sky.visibleStars, 0);
});
test('weather dims the night sky and storms flash with lightning', async () => {
  const { addSky, updateSky, lightningFlash } = await import('../public/sky.js');
  const { createWorldModel } = await import('../public/world-model.js');
  const sky = addSky(createWorldModel()),
    stars = () => sky.stars.reduce((sum, s) => sum + s.mesh.opacity, 0);
  const context = { date: new Date('2024-09-18T12:00Z') };
  updateSky(sky, 0, 0, true, 0.32, { cloud: 0 }, 0, context);
  const clearStars = stars(),
    clearMoon = sky.moon.mesh.opacity;
  assert.ok(clearMoon > 0.9 && sky.moon.halo.opacity > 0);
  assert.ok(sky.moon.craters.every((c) => c.mesh.opacity === clearMoon));
  updateSky(sky, 0, 0, true, 0.32, { cloud: 80 }, 0, context);
  assert.ok(stars() < clearStars && sky.moon.mesh.opacity < clearMoon);
  updateSky(sky, 0, 0, true, 0.32, { cloud: 100, rain: 60 }, 0, context);
  assert.equal(stars(), 0);
  assert.ok(sky.moon.mesh.opacity < 0.1);
  // Lightning only in storms, never with reduced motion, and only briefly.
  const storm = { rain: 80, wind: 50, cloud: 95 };
  assert.equal(lightningFlash({ rain: 20, wind: 50 }, 0.05, false), 0);
  assert.equal(lightningFlash(storm, 0.05, true), 0);
  assert.equal(lightningFlash(storm, 0.05, false), 1);
  const lit = Array.from({ length: 670 }, (_, i) => lightningFlash(storm, i / 100, false)).filter(
    Boolean,
  ).length;
  assert.ok(lit > 0 && lit < 30);
});
test('live weather types drive rain, snow, fog and lightning in the 3D world', async () => {
  const { weatherEffects } = await import('../public/weather.js');
  assert.deepEqual(weatherEffects({ weatherCode: 95 }), { thunder: true, fog: false, snow: false });
  assert.deepEqual(weatherEffects({ weatherCode: 45 }), { thunder: false, fog: true, snow: false });
  assert.equal(weatherEffects({ weatherCode: 73 }).snow, true);
  assert.equal(weatherEffects({ rain: 20, outdoorTemp: -1 }).snow, true);
  assert.equal(weatherEffects({ rain: 20, outdoorTemp: 8 }).snow, false);
  const { world, state } = renderer(),
    shown = () => world.model.rain.filter((d) => d.opacity > 0).length;
  state.env = { ...state.env, rain: 5, wind: 0, outdoorTemp: 15, weatherCode: null };
  world.render(1, 0.016);
  const drizzle = shown();
  state.env.rain = 90;
  world.render(2, 0.016);
  assert.ok(drizzle > 0 && shown() > drizzle, 'heavier rain shows more drops');
  assert.equal(Math.abs(world.model.rain[0].rotation[2]), 0, 'no wind, no slant');
  state.env.wind = 60;
  world.render(3, 0.016);
  assert.ok(world.model.rain[0].rotation[2] < 0, 'wind slants the rain');
  state.env.outdoorTemp = -3;
  world.render(4, 0.016);
  const flake = world.model.rain.find((d) => d.opacity > 0);
  assert.equal(flake.color, '#f4f7fb');
  assert.equal(flake.size[1], flake.size[0]);
  assert.equal(world.model.wetSurface.color, '#f1f5f8');
  state.env = { ...state.env, rain: 0, outdoorTemp: 10, weatherCode: 45 };
  world.render(5, 0.016);
  assert.equal(world.haze, 1);
  state.env = { ...state.env, rain: 30, wind: 5, cloud: 60, weatherCode: 95 };
  world.render(0.05, 0.016);
  assert.equal(world.flash, 1, 'a thunderstorm code brings lightning');
});

test('a talking resident stays in place, faces the technician and resumes routines after chat', () => {
  const { world, state } = renderer();
  state.env.motion = true;
  world.render(1, 0.1);
  const actor = world.model.actors.find((a) => a.id === 'Maya');
  const body = actor.parts.find((p) => p.local[1] === 0.8);
  const position = [body.pos[0], body.pos[2]];
  state.talkingNpc = 'Maya';
  state.routine = { actors: { Maya: [8, 4] } };
  world.render(2, 0.1);
  world.render(3, 0.1);
  assert.deepEqual([body.pos[0], body.pos[2]], position);
  const p = toWorld(state.player);
  assert.equal(body.rotation[1], Math.atan2(p[0] - position[0], p[2] - position[1]));
  const arm = actor.parts.find((p) => p.limb === 'arm' && p.side === -1);
  assert.notEqual(arm.rotation[0], 0);
  state.paused = true;
  world.render(4, 0.1);
  const held = [...arm.pos];
  world.render(5, 0.1);
  assert.deepEqual(arm.pos, held);
  state.reduced = true;
  world.render(6, 0.1);
  assert.equal(arm.rotation[0], 0);
  assert.deepEqual([body.pos[0], body.pos[2]], position);
  state.talkingNpc = null;
  world.render(7, 0.1);
  assert.equal(actor.talkPosition, undefined);
  assert.deepEqual([body.pos[0], body.pos[2]], [8, 4]);
});
test('chat started before a destination renders uses actor world positions', () => {
  const { world, state } = renderer();
  world.render(1, 0.016);
  world.setRegion('kyoto');
  state.locationId = 'kyoto';
  state.talkingNpc = 'Alex';
  const actor = world.model.actors.find((a) => a.id === 'Alex');
  const expected = [actor.x, actor.z];
  world.render(2, 0.016);
  assert.deepEqual(actor.talkPosition, expected);
});

test('community buildings and road users render in 3D on the world simulation clock', () => {
  const { world, state } = renderer();
  state.simClockMs = 0;
  state.skyStartHour = 8;
  world.showCommunity();
  for (let i = 0; i < 60; i++) world.render(i * 0.016, 0.016);
  const c = world.model.community;
  assert.ok(c.objects.length > 300);
  assert.ok(world.model.colliders.some((b) => b.community));
  assert.equal(world.target[0], (c.origin.x + 44) / 2);
  const factory = c.sim.map.buildings.find((b) => b.type === 'factory');
  assert.ok(world.project([c.origin.x + factory.x, 4, factory.z]).visible);
  for (let i = 1; i <= 100; i++) {
    state.simClockMs = i * 200;
    world.render(i * 0.2, 0.016);
  }
  assert.ok(c.sim.vehicles.length > 0);
  assert.ok(c.vehicles.some((v) => v.body.opacity === 1));
  assert.ok(c.people.some((p) => p.body.opacity === 1));
  assert.ok(Math.abs(c.sim.time - 20) < 1e-6);
  const held = c.vehicles.map((v) => [...v.body.pos]);
  state.paused = true;
  state.simClockMs += 1000;
  world.render(21, 0.016);
  assert.deepEqual(
    c.vehicles.map((v) => v.body.pos),
    held,
  );
  assert.ok(Math.abs(c.sim.time - 20) < 1e-6);
});
test('a lab clock that jumped hours ahead advances the community by a capped step, not the whole gap', () => {
  const { world, state } = renderer();
  state.simClockMs = 0;
  world.render(0, 0.016);
  const sim = world.model.community.sim,
    before = sim.time;
  state.simClockMs = 6 * 3600 * 1000;
  const started = performance.now();
  world.render(1, 0.016);
  assert.ok(sim.time - before <= 10 + 1e-6, 'At most ten simulated seconds in one frame');
  assert.ok(performance.now() - started < 2000);
  state.simClockMs += 1000;
  world.render(2, 0.016);
  assert.ok(Math.abs(sim.time - before - 11) < 1e-6, 'Normal steps resume afterwards');
});
test('factory controller keeps driving 3D machinery', () => {
  const { world, state } = renderer();
  state.simClockMs = 0;
  world.showCommunity();
  world.render(0, 0.016);
  const c = world.model.community;
  c.sim.density = c.sim.pedestrianDensity = 0;
  c.sim.startController(
    'void setup(){ pinMode(7,OUTPUT); pinMode(3,OUTPUT); } void loop(){ digitalWrite(7,1); digitalWrite(3,1); delay(200); }',
    'cpp',
  );
  const before = c.machinery.map((m) => m.mesh.pos[0]);
  for (let i = 1; i <= 400; i++) {
    state.simClockMs = i * 200;
    world.render(i * 0.2, 0.016);
  }
  assert.equal(c.sim.outputs[7], 1);
  assert.notDeepEqual(
    c.machinery.map((m) => m.mesh.pos[0]),
    before,
  );
  assert.ok(c.lights.every((l) => l.emission === 1));
  world.setRegion('marrakech');
  assert.equal(world.model.community.sim.map.handedness, 1);
  assert.equal(world.model.community.sim.controller, undefined);
});

test('normal World view includes the original home and factory', () => {
  const { world, state } = renderer();
  const c = world.model.community;
  state.simClockMs = 0;
  c.sim.density = c.sim.pedestrianDensity = 0;
  world.setView('world', null);
  for (let i = 0; i < 60; i++) world.render(i * 0.016, 0.016);
  const home = c.sim.map.buildings.find((b) => b.type === 'home'),
    factory = c.sim.map.buildings.find((b) => b.type === 'factory');
  assert.ok(world.project([home.x + c.origin.x, 2, home.z]).visible);
  assert.ok(world.project([factory.x + c.origin.x, 4, factory.z]).visible);
  assert.notDeepEqual(world.move(state.player, 'up', 1), state.player, 'Property walking works');
});

test('native factory components use normal GPIO wiring and the main controller drives real machinery', () => {
  const { world, state } = renderer(),
    c = world.model.community;
  const q = missions.find((m) => m.communityQuest && m.communityType === 'factory');
  const a = c.areas.find((a) => a[0] === q.area);
  state.devices = defaults(q.ids, 'ESP32').map((d) => ({ ...d, area: q.area }));
  state.areas = [...areas, ...c.areas];
  state.communityMission = true;
  state.running = true;
  state.simClockMs = 0;
  state.env = { ...state.env, temp: 25, vibration: 20 };
  world.focusCommunityArea(q.area);
  state.player = world.findFree({ x: a[1], y: a[2] + 5 });
  const runtime = new Runtime(program(q, 'cpp', state.devices, true), 'cpp', state.devices);
  state.outputs = runtime.step(state.env).outputs;
  world.render(0, 0.016);
  assert.equal(c.sim.outputs[7], 1);
  assert.equal(world.deviceObjects.length, 4);
  for (const device of world.deviceObjects) {
    assert.ok(device.x > 40);
    assert.equal(collides(device.x, device.z, world.model.colliders, 0.3), false);
  }
  const moved = world.move(state.player, 'left', 1);
  assert.ok(toWorld(moved)[0] > 40);
  state.env.temp = 45;
  state.outputs = runtime.step(state.env).outputs;
  state.simClockMs = 200;
  world.render(0.2, 0.016);
  assert.equal(c.sim.outputs[7], 0);
  assert.equal(c.warning.emission, 1);
});
test('native road controller rejects conflicting GPIO phase proposals in the world', () => {
  const { world, state } = renderer(),
    q = missions.find((m) => m.communityQuest && m.ids.includes('trafficEW'));
  state.devices = defaults(q.ids, 'ESP32').map((d) => ({ ...d, area: q.area }));
  state.areas = [...areas, ...world.model.community.areas];
  state.communityMission = true;
  state.running = true;
  state.outputs = Object.fromEntries(state.devices.filter((d) => d.output).map((d) => [d.pin, 1]));
  world.render(0, 0.016);
  assert.match(world.model.community.sim.signals.messages.at(-1), /Conflicting/);
});

test('clicking a rendered building selects it while orbit drags and cancellation do not', () => {
  const { world, canvas } = renderer(),
    selected = [];
  world.onBuildingSelect = (type) => selected.push(type);
  canvas.setPointerCapture = () => {};
  canvas.focus = () => {};
  canvas.getBoundingClientRect = () => ({ left: 20, top: 40 });
  world.render(0, 0.016);
  const b = world.model.community.sim.map.buildings.find((b) => b.type === 'factory');
  const p = world.project([world.model.community.origin.x + b.x, 3, b.z]);
  assert.equal(world.pickCommunityBuilding(p.x, p.y), 'factory');
  const e = { button: 0, pointerId: 1, clientX: p.x + 20, clientY: p.y + 40 };
  canvas.listeners.get('pointerdown')(e);
  canvas.listeners.get('pointerup')(e);
  assert.deepEqual(selected, ['factory']);
  canvas.listeners.get('pointerdown')(e);
  canvas.listeners.get('pointermove')({ ...e, clientX: e.clientX + 25 });
  canvas.listeners.get('pointerup')(e);
  canvas.listeners.get('pointerdown')(e);
  canvas.listeners.get('pointercancel')(e);
  canvas.listeners.get('pointerup')(e);
  assert.deepEqual(selected, ['factory']);
  assert.equal(world.pickCommunityBuilding(0, 0), null);
});

test('a second finger cannot take over a camera drag', () => {
  const { world, canvas } = renderer();
  canvas.setPointerCapture = () => {};
  canvas.focus = () => {};
  const fire = (type, e) => canvas.listeners.get(type)({ button: 0, ...e });
  fire('pointerdown', { pointerId: 1, clientX: 100, clientY: 100 });
  fire('pointerdown', { pointerId: 2, clientX: 600, clientY: 300 });
  const yaw = world.yaw;
  fire('pointermove', { pointerId: 2, clientX: 620, clientY: 300 });
  assert.equal(world.yaw, yaw);
  fire('pointerup', { pointerId: 2, clientX: 620, clientY: 300 });
  assert.equal(world.drag.id, 1);
  fire('pointermove', { pointerId: 1, clientX: 110, clientY: 100 });
  assert.ok(Math.abs(world.yaw - (yaw - 0.07)) < 1e-9);
  fire('pointerup', { pointerId: 1, clientX: 110, clientY: 100 });
  assert.equal(world.drag, null);
  // A pointer whose capture was lost cannot leave the camera stuck mid-drag.
  fire('pointerdown', { pointerId: 3, clientX: 0, clientY: 0 });
  fire('lostpointercapture', { pointerId: 3 });
  assert.equal(world.drag, null);
});

test('edge-on projected building faces cannot select an unrelated point on their extended line', () => {
  const { world } = renderer();
  world.render(0, 0.016);
  world.project = (p) => ({ x: p[0], y: 100, visible: true });
  assert.equal(world.pickCommunityBuilding(-1000, 100), null);
});

test('procedural water and reflections share the simulation clock and freeze on pause or reduced motion', () => {
  const { world, state } = renderer();
  state.simClockMs = 1000;
  world.render(1, 0.016);
  assert.equal(world.surfaceTime, 1);
  state.paused = true;
  state.simClockMs = 9000;
  world.render(9, 0.016);
  assert.equal(world.surfaceTime, 1);
  state.paused = false;
  state.reduced = true;
  world.render(9, 0.016);
  assert.equal(world.surfaceTime, 1);
  state.reduced = false;
  world.render(9, 0.016);
  assert.equal(world.surfaceTime, 9);
});
