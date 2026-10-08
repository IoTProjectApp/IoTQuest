import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorldModel } from '../public/world-model.js';
import { World3D } from '../public/world3d.js';
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
import { defaults, baseEnv } from '../public/missions.js';
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
    addEventListener() {},
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
test('the sky shows the sun by day and the moon and stars at night, always behind the property', async () => {
  const { addSky, updateSky } = await import('../public/sky.js');
  const { createWorldModel } = await import('../public/world-model.js');
  const sky = addSky(createWorldModel()),
    starsShown = () => sky.stars.filter((s) => s.mesh.opacity > 0).length;
  updateSky(sky, 1, 0, false);
  assert.ok(sky.sun.mesh.opacity > 0.9 && sky.moon.mesh.opacity === 0 && starsShown() === 0);
  updateSky(sky, 0, 0, false);
  assert.ok(sky.sun.mesh.opacity === 0 && sky.moon.mesh.opacity > 0.9);
  assert.equal(starsShown(), sky.stars.length);
  for (let yaw = 0; yaw < Math.PI * 2; yaw += 0.5) {
    updateSky(sky, 0, 0, false, yaw);
    for (const mesh of [sky.sun.mesh, sky.moon.mesh, ...sky.stars.map((s) => s.mesh)])
      assert.ok(mesh.pos[0] * Math.sin(yaw) + mesh.pos[2] * Math.cos(yaw) < -20);
  }
});
test('weather dims the night sky and storms flash with lightning', async () => {
  const { addSky, updateSky, lightningFlash } = await import('../public/sky.js');
  const { createWorldModel } = await import('../public/world-model.js');
  const sky = addSky(createWorldModel()),
    stars = () => sky.stars.reduce((sum, s) => sum + s.mesh.opacity, 0);
  updateSky(sky, 0, 0, true, 0.32, { cloud: 0 });
  const clearStars = stars(),
    clearMoon = sky.moon.mesh.opacity;
  assert.ok(clearMoon > 0.9 && sky.moon.halo.opacity > 0);
  assert.ok(sky.moon.craters.every((c) => c.mesh.opacity === clearMoon));
  updateSky(sky, 0, 0, true, 0.32, { cloud: 80 });
  assert.ok(stars() < clearStars && sky.moon.mesh.opacity < clearMoon);
  updateSky(sky, 0, 0, true, 0.32, { cloud: 100, rain: 60 });
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
