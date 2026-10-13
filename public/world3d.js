import { prepareWorldMaterials, worldSunlight } from './world-materials.js';
import { WebGLWorldRenderer, color } from './world-renderer-webgl.js';
import { addCommunityWorld, updateCommunityWorld, STREET_LIGHT_LEVEL } from './community-world.js';
import { updateLandscape } from './landscape.js';
import { addDeviceDetails } from './device-objects.js';
import { locationById } from './locations.js';
import { skyTime, DEFAULT_OBSERVER } from './astronomy.js';
import {
  multiply,
  perspective,
  lookAt,
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
// Re-exported for the tests and tools that import them from here.
export { frustumTest, isSoftwareRenderer } from './world-renderer-webgl.js';
// Most simulated seconds one frame advances the community; 360× at 60 fps is about 6 s.
const MAX_SIM_STEP = 10;
export class World3D {
  // createRenderer(canvas) picks another renderer (see world-renderer-three.js); it takes the
  // same frame description as WebGLWorldRenderer.
  constructor(
    canvas,
    { getState, onFrame, onError, onRecover, onBuildingSelect, createRenderer } = {},
  ) {
    this.canvas = canvas;
    this.getState = getState;
    this.onFrame = onFrame;
    this.onBuildingSelect = onBuildingSelect;
    this.onError = onError;
    this.onRecover = onRecover;
    this.renderer = createRenderer?.(canvas) ?? new WebGLWorldRenderer(canvas);
    this.gl = this.renderer.gl;
    this.model = createRegionalModel(getState?.().locationId || 'legacy');
    addCommunityWorld(this.model, locationById(getState?.().locationId));
    prepareWorldMaterials(this.model);
    this.yaw = 0.32;
    this.pitch = 0.85;
    this.distance = this.model.farm ? 320 : 280;
    this.target = [
      this.model.community.origin.x + (this.model.farm ? 36 : 72),
      0.5,
      this.model.community.origin.z,
    ];
    this.currentTarget = [...this.target];
    this.currentDistance = this.distance;
    this.communityView = true;
    this.follow = false;
    this.overview = true;
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
    this.bindControls();
    this.frame = this.frame.bind(this);
    this.frameId = requestAnimationFrame(this.frame);
  }
  get geometries() {
    return this.renderer.geometries;
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
            this.communityView ? 330 : this.landscapeView ? 90 : 55,
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
            this.communityView ? 330 : this.landscapeView ? 90 : 55,
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
        this.renderer.restore();
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
  // While the travel globe is shown the world stops drawing but keeps its context. Losing it
  // needed an answer from the GPU, which waited for every frame still queued (seconds on
  // software WebGL) while the page ignored clicks, and coming back rebuilt every shader.
  releaseGraphics() {
    if (!this.gl || this.disposed || this.graphicsSuspended) return false;
    this.graphicsSuspended = true;
    cancelAnimationFrame(this.frameId);
    return true;
  }
  restoreGraphics() {
    if (!this.graphicsSuspended || this.disposed) return false;
    this.graphicsSuspended = false;
    cancelAnimationFrame(this.frameId);
    if (!this.contextLost) this.frameId = requestAnimationFrame(this.frame);
    return true;
  }
  setView(view, focus, zoom = 1) {
    if (view === 'world' || view === 'community') {
      this.communityView = true;
      this.skyView = false;
      this.landscapeView = false;
      this.follow = false;
      this.overview = true;
      this.target = [
        this.model.community.origin.x + (this.model.farm ? 36 : 72),
        0.5,
        this.model.community.origin.z,
      ];
      this.distance = (this.model.farm ? 320 : 280) / Math.max(0.7, zoom);
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
    if (view === 'detail' && focus?.[3]?.recreation) {
      const b = this.model.community.sim.map.buildings.find(
        (b) => b.type === focus[3].communityType,
      );
      if (b)
        this.target = [
          this.model.community.origin.x + b.x,
          0.75,
          this.model.community.origin.z + b.z,
        ];
    }
    if (view === 'landscape' && this.model.farm && !focus) this.target = [8, 0.35, 20];
    this.target[1] = view === 'detail' ? 0.75 : 0.35;
    this.distance = clamp(
      (view === 'landscape'
        ? this.model.farm
          ? 105
          : 68
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
                residence4: 18,
                residence5: 18,
                residence6: 18,
                pool: 40,
                gym: 40,
                park: 35,
                playground: 35,
                playground2: 40,
                basketball: 36,
                hospital: 24,
                school: 28,
                police: 24,
                fire: 24,
              }[focus?.[3]?.communityType] || 11
            : 25) /
        (view === 'landscape'
          ? Math.max(0.6, zoom)
          : Math.max(
              1,
              zoom / (view === 'detail' ? 1.9 : view === 'world' || view === 'landscape' ? 1 : 1.5),
            )),
      5,
      view === 'landscape' ? (this.model.farm ? 110 : 90) : 55,
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
    this.streetLightPools = null;
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
        structure = rayBox(
          ray,
          [cx - b.w / 2, 0, origin.z + b.z - b.d / 2],
          [cx + b.w / 2, height, origin.z + b.z + b.d / 2],
        ),
        parcel = b.lot
          ? rayBox(
              ray,
              [origin.x + b.lot.x - b.lot.w / 2, -0.035, origin.z + b.lot.z - b.lot.d / 2],
              [origin.x + b.lot.x + b.lot.w / 2, 0.025, origin.z + b.lot.z + b.lot.d / 2],
            )
          : Infinity,
        t = Math.min(structure, parcel);
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
    if (this.disposed || this.contextLost || this.graphicsSuspended) return;
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
        const sprayZ = home
          ? this.model.community.origin.z + home.building.z + home.building.d / 2 + 1.3
          : z;
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
    // Rebuilt every frame by whatever animates people (judo-characters.js), when the renderer
    // draws rigged characters; otherwise only the stand-in figures are animated.
    this.model.characters = this.renderer.drawsCharacters ? [] : null;
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
        angle = actor.heading ?? 0,
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
        Math.abs(person.x + this.model.community.origin.x) < 2 &&
        person.z + this.model.community.origin.z > 7.5 &&
        person.z + this.model.community.origin.z < 16,
    );
    const vehiclePassage = this.model.community.sim.vehicles.some(
      (vehicle) =>
        Math.abs(vehicle.x + this.model.community.origin.x) < 2 &&
        vehicle.z + this.model.community.origin.z > 7 &&
        vehicle.z + this.model.community.origin.z < 17,
    );
    if (passage || vehiclePassage) gate = Math.max(gate, Math.PI / 2); // Walking residents can open the existing entrance gate.
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
    for (const roof of this.model.roofs || [])
      roof.opacity = roofsShown ? 1 : (roof.cutawayOpacity ?? (roof.community ? 0 : 0.17));
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
    // The same light level as the town's street lamps (community-world.js).
    this.streetLights ??= this.model.objects.filter((o) => o.streetLight);
    this.streetLightPools ??= this.model.objects.filter((o) => o.streetLightPool && !o.community);
    const streetLampsOn = (env.light ?? 70) < STREET_LIGHT_LEVEL;
    for (const light of this.streetLights) light.emission = streetLampsOn ? 1 : 0;
    for (const pool of this.streetLightPools) pool.opacity = streetLampsOn ? pool.poolOpacity : 0;
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
      door.baseHeight ?? 0.68,
      door.anchor[2] + Math.sin(gate) * 0.75,
    ];
    door.rotation[1] = -gate;
    const mate = this.model.dynamic.gateRight;
    mate.pos = [
      mate.anchor[0] - Math.cos(gate) * 0.75,
      mate.baseHeight ?? 0.68,
      mate.anchor[2] + Math.sin(gate) * 0.75,
    ];
    mate.rotation[1] = gate;
    this.model.dynamic.gateCollider.disabled = gate > 0.3;
    // Turning the servo lowers the blind, which is what shades and cools the room.
    this.model.dynamic.blinds.size[1] = Math.max(0.1, 0.83 * (blinds / Math.PI));
    const garageDoor = this.model.dynamic.garageDoor;
    const garageFloor =
      this.model.floorHeight?.(garageDoor.pos[0], garageDoor.pos[2] - 0.05) ?? 0.23;
    const garageVehicle = this.model.community.sim.vehicles.some(
      (vehicle) =>
        Math.abs(vehicle.x + this.model.community.origin.x - garageDoor.pos[0]) < 2 &&
        vehicle.z + this.model.community.origin.z > garageDoor.pos[2] - 5 &&
        vehicle.z + this.model.community.origin.z < garageDoor.pos[2] + 5,
    );
    garageDoor.pos[1] = (env.door || garageVehicle ? 2.2 : 0.38) + garageFloor - 0.23;
  }
  // Works out what this frame shows (camera, sun, fog, the nearest lamps and shadow casters) and
  // has the renderer draw it.
  render(t, dt, s = this.getState()) {
    this.animate(s, t, dt);
    const width = Math.max(1, this.canvas.clientWidth),
      height = Math.max(1, this.canvas.clientHeight),
      dpr = Math.min(this.renderer.maxPixelRatio || 2, globalThis.devicePixelRatio || 1);
    if (
      this.canvas.width !== Math.round(width * dpr) ||
      this.canvas.height !== Math.round(height * dpr)
    ) {
      this.canvas.width = Math.round(width * dpr);
      this.canvas.height = Math.round(height * dpr);
    }
    this.width = width;
    this.height = height;
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
    // Keep depth precision at town scale; a fixed ten-centimetre near plane makes
    // river banks and terrain edges flicker when viewed from hundreds of metres away.
    const near = this.skyView ? 0.1 : Math.max(0.1, this.currentDistance * 0.01),
      far = this.communityView ? 650 : this.landscapeView || this.currentDistance > 95 ? 320 : 160;
    this.matrix = multiply(
      perspective(fov, width / height, near, far),
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
    const sunlight = worldSunlight(s, this.model.sky?.ephemeris);
    if (mirrored) sunlight.direction[0] *= -1;
    if (!s.paused && !s.reduced)
      this.surfaceTime = s.simClockMs !== undefined ? s.simClockMs / 1000 : this.visualClock;
    // The twelve shadow casters nearest the camera target; squared distance measured once each.
    const [tx, , tz] = this.currentTarget;
    const shadows = this.model.visualShadows
      .map((caster) => ({ caster, d: (caster.x - tx) ** 2 + (caster.z - tz) ** 2 }))
      .sort((a, b) => a.d - b.d)
      .slice(0, 12)
      .map(({ caster }) => caster);
    const candidates = [];
    // Street lamps sit high and light a wider circle than lamps at head height.
    for (const lamp of [...this.model.lamps, ...this.model.community.lights])
      if (lamp.emission)
        candidates.push({
          pos: lamp.pos,
          color: [1, 0.79, 0.47],
          range: lamp.streetLamp ? 10 : 5.5,
        });
    for (const lamp of this.streetLights || [])
      if (lamp.emission) candidates.push({ pos: lamp.pos, color: [1, 0.82, 0.55], range: 8 });
    for (const home of this.model.community.residences)
      if (home.lamp.emission) candidates.push({ pos: home.lamp.pos, color: [1, 0.77, 0.43] });
    for (const civic of [...this.model.community.civic, ...(this.model.community.recreation || [])])
      if (civic.lamp?.emission) candidates.push({ pos: civic.lamp.pos, color: [1, 0.77, 0.43] });
    for (const section of this.model.community.sections || [])
      if (section.lamp.emission) candidates.push({ pos: section.lamp.pos, color: [1, 0.77, 0.43] });
    for (const d of this.deviceObjects)
      if (d.light?.emission)
        candidates.push({ pos: d.light.pos, color: color(d.light.color).slice(0, 3) });
    candidates.sort(
      (a, b) =>
        Math.hypot(a.pos[0] - this.target[0], a.pos[2] - this.target[2]) -
        Math.hypot(b.pos[0] - this.target[0], b.pos[2] - this.target[2]),
    );
    this.renderer.render({
      pixelWidth: this.canvas.width,
      pixelHeight: this.canvas.height,
      // The same view as matrix, for renderers that build their own camera; positions are in
      // drawn space (after the mirror flip), which is model space with x negated when mirrored.
      camera: { eye: viewEye, target, fov, near, far, aspect: width / height, mirrored },
      matrix: this.matrix,
      pixelScale: this.pixelScale,
      eye,
      fog,
      day,
      sun: sunlight,
      time: this.surfaceTime || 0,
      shadows,
      wet: s.env.wetness || 0,
      haze: this.haze || 0,
      // The observer camera sits high above the community; haze should describe the
      // district's visibility rather than wash out everything because of that height.
      fogOffset: this.communityView ? Math.max(0, this.currentDistance - 35) : 0,
      lights: candidates.slice(0, 8).map((lamp) => ({ ...lamp, range: lamp.range ?? 5.5 })),
      objects: this.model.objects,
      // Rigged people for renderers that draw them (see three-characters.js); the others draw
      // each one's stand-in figure, which is already among the objects.
      characters: this.model.characters || [],
    });
    this.onFrame?.(this, s);
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
    this.renderer.dispose();
  }
}
