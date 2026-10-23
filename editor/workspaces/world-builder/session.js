// World Builder Session & Project Management.
// Handles creating, naming, saving, reopening, duplicating, exporting/importing worlds,
// undo/redo for terrain and object edits, multi-select, grouping, locking, hiding, layers,
// reusable prefabs, favourites, GLB/GLTF import metadata, and Play Mode IoT simulation.
// Free of the DOM so it can be tested directly under Node.
import { Runtime } from '../../../public/runtime.js';
import { defaults, validate } from '../../../public/missions.js';
import { ADC_SCALE, programReading } from '../../../public/signals.js';
import {
  createTerrain,
  terrainHeightAt,
  sculptTerrain,
  paintTerrain,
  flattenFootprint,
  generateScatterItems,
} from '../../../public/world-builder/terrain.js';
import { ASSET_LIBRARY, getAssetSpec } from '../../../public/world-builder/assets.js';
import {
  DEFAULT_LAYERS,
  defaultEnvironment,
  layerForKind,
  normaliseWorld,
  worldDevices,
  assignPins,
  starterCode,
  runtimeEnv,
  worldAgents,
  stepWorldSim,
  buildWorldScene,
  prepareWorldScene,
} from '../../../public/world-builder/world.js';

// The world format, devices, simulation and scene are shared with the game (world.html).
export { DEFAULT_LAYERS, defaultEnvironment };

export const WORLD_PROJECT_FORMAT = 'iotquest-world-project';
export const WORLD_PROJECT_VERSION = 1;
export const COMPLEXITY_WARNING_LIMIT = 200;
// Imported models are saved as files beside the game's other models (public/models is kept out
// of the public repository, like the people's): worlds.js holds only where each one is.
export const MODEL_FOLDER = 'models/worlds';
export const MODEL_ID = /^custom-model-[a-z0-9-]{1,60}$/;
export const MODEL_MAX_BYTES = 64 * 1024 * 1024;
export const modelFile = (id) => `${MODEL_FOLDER}/${id}.glb`;
// A binary glTF file starts with the bytes "glTF".
export const isGlb = (bytes) =>
  bytes?.length >= 12 && String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]) === 'glTF';
// The bytes inside a base64 data URL (as older worlds and exported projects hold models).
function bytesOfDataUrl(url) {
  const base64 = String(url).split(',')[1] || '';
  const text = atob(base64),
    bytes = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i);
  return bytes;
}
export function dataUrlOf(bytes) {
  let text = '';
  for (let i = 0; i < bytes.length; i += 0x8000)
    text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return 'data:model/gltf-binary;base64,' + btoa(text);
}

const clone = (v) => JSON.parse(JSON.stringify(v));
const round = (v, p = 3) => Math.round((Number(v) || 0) * 10 ** p) / 10 ** p;
const slug = (s) =>
  String(s || 'world')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'world';

export function createStarterWorld({
  id = 'world-' + Date.now(),
  name = 'New IoT World',
  template = 'flat',
  seed = 42,
} = {}) {
  const terrain = createTerrain(template, seed);
  const objects = [];
  const roads = [];

  if (template === 'town') {
    roads.push(
      {
        id: 'road-1',
        name: 'Main Street',
        kind: 'road',
        width: 8,
        curvature: 0,
        crossing: true,
        points: [
          { x: -44, z: 0 },
          { x: 44, z: 0 },
        ],
      },
      {
        id: 'road-2',
        name: 'Cross Avenue',
        kind: 'road',
        width: 8,
        curvature: 0,
        crossing: true,
        points: [
          { x: 0, z: -44 },
          { x: 0, z: 44 },
        ],
      },
    );
  }

  return {
    id,
    name,
    version: 1,
    units: 'm',
    spawn: [0, terrainHeightAt(terrain, 0, 12), 12],
    environment: defaultEnvironment(),
    layers: clone(DEFAULT_LAYERS),
    terrain,
    objects,
    roads,
    groups: [],
    importedAssets: [],
    iot: {
      board: 'ESP32',
      language: 'cpp',
      code: {
        cpp: '',
        python: '',
      },
    },
  };
}

export class WorldBuilderSession {
  constructor(storeData = null) {
    const data = storeData && typeof storeData === 'object' ? clone(storeData) : {};
    this.worlds =
      Array.isArray(data.worlds) && data.worlds.length
        ? data.worlds
        : [
            createStarterWorld({
              id: 'starter-world',
              name: 'Connected Homestead',
              template: 'flat',
              seed: 42,
            }),
          ];
    this.prefabs = Array.isArray(data.prefabs) ? data.prefabs : [];
    this.favorites = Array.isArray(data.favorites)
      ? data.favorites
      : ['building/house', 'iot/ldr', 'iot/led'];
    this.activeWorldId = this.worlds[0].id;

    this.undoStack = [];
    this.redoStack = [];
    this.listeners = new Set();
    // Imported models not yet written to their files, by id: their bytes stay out of the world (and
    // so out of undo steps and the autosave).
    this.modelBytes = new Map();
    // Whether loading moved models out of the saved file, which then needs saving again.
    this.movedModels = false;
    // Each loaded model's size, [width, height, depth, centre height], measured by the viewport.
    this.modelSizes = new Map();

    // Editor view & selection state
    this.selectedIds = new Set();
    this.selectedRoadId = null;
    this.hideRoofs = false;
    this.maxVisibleStory = 10;
    this.graphicsQuality = 'high'; // 'low' | 'medium' | 'high'

    // Play Mode state
    this.mode = 'edit'; // 'edit' | 'play'
    this.simRunning = false;
    this.simPaused = false;
    this.simTime = 0;
    this.simOutputs = {};
    this.simLogs = [];
    this.simError = null;
    this.simEnvironment = null;
    this.simAgents = [];
    this.playerPos = [0, 0, 12];

    for (const w of this.worlds) this.ensureWorldDefaults(w);
    this.rebuildSceneModel();
  }

  get world() {
    return this.worlds.find((w) => w.id === this.activeWorldId) || this.worlds[0];
  }

  ensureWorldDefaults(w) {
    normaliseWorld(w);
    // Models packed into older saves and projects become files (see adoptModels).
    this.adoptModels(w);
  }

  on(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit() {
    for (const listener of this.listeners) listener(this);
  }

  // ---- Project & World Management ----
  selectWorld(id) {
    const found = this.worlds.find((w) => w.id === id);
    if (!found) return false;
    this.stopPlayMode();
    this.activeWorldId = found.id;
    this.ensureWorldDefaults(found);
    this.selectedIds.clear();
    this.selectedRoadId = null;
    this.undoStack = [];
    this.redoStack = [];
    this.rebuildSceneModel();
    this.emit();
    return true;
  }

  createNewWorld({ name = 'New IoT World', template = 'flat', seed = 42 } = {}) {
    this.stopPlayMode();
    const baseId = slug(name);
    let id = baseId;
    let n = 2;
    while (this.worlds.some((w) => w.id === id)) id = `${baseId}-${n++}`;
    const w = createStarterWorld({ id, name: name.trim() || 'New IoT World', template, seed });
    this.ensureWorldDefaults(w);
    this.worlds.push(w);
    this.activeWorldId = w.id;
    this.selectedIds.clear();
    this.selectedRoadId = null;
    this.undoStack = [];
    this.redoStack = [];
    this.rebuildSceneModel();
    this.emit();
    return w;
  }

  renameWorld(name) {
    const trimmed = String(name || '').trim();
    if (!trimmed) return false;
    this.commit('Rename world', (w) => {
      w.name = trimmed;
    });
    return true;
  }

  duplicateWorld(id = this.activeWorldId) {
    const source = this.worlds.find((w) => w.id === id) || this.world;
    const copy = clone(source);
    copy.name = source.name + ' (Copy)';
    const baseId = slug(copy.name);
    let newId = baseId;
    let n = 2;
    while (this.worlds.some((w) => w.id === newId)) newId = `${baseId}-${n++}`;
    copy.id = newId;
    this.worlds.push(copy);
    this.selectWorld(copy.id);
    return copy;
  }

  deleteWorld(id = this.activeWorldId) {
    if (this.worlds.length <= 1) return false;
    const idx = this.worlds.findIndex((w) => w.id === id);
    if (idx < 0) return false;
    this.worlds.splice(idx, 1);
    if (this.activeWorldId === id) {
      this.activeWorldId = this.worlds[Math.max(0, idx - 1)].id;
      this.selectedIds.clear();
      this.undoStack = [];
      this.redoStack = [];
    }
    this.rebuildSceneModel();
    this.emit();
    return true;
  }

  // ---- Undo / Redo ----
  // What an undo step puts back: the world, and the prefabs and favourites shared by every world.
  snapshot(world = this.world) {
    return clone({ world, prefabs: this.prefabs, favorites: this.favorites });
  }
  restore(snapshot) {
    const idx = this.worlds.findIndex((w) => w.id === this.activeWorldId);
    if (idx >= 0) this.worlds[idx] = snapshot.world;
    this.prefabs = snapshot.prefabs;
    this.favorites = snapshot.favorites;
  }
  // `merge` names an edit that goes on (one brush stroke, typing in the code, one slider drag):
  // its later commits join the first's undo step, until one with `close` ends it. `quiet` keeps
  // the scene and panels as they are (a slider or the code is still being changed). A gizmo drag's
  // live preview has already changed the world, so its commit undoes to the world as it was when
  // the drag began.
  commit(label, mutator, { merge = null, close = false, quiet = false } = {}) {
    const before = this.snapshot(this.dragBefore || this.world);
    this.dragBefore = null;
    mutator(this.world);
    const top = this.undoStack.at(-1);
    if (JSON.stringify(before) === JSON.stringify(this.snapshot())) {
      if (close && merge && top?.merge === merge) top.merge = null;
      return false;
    }
    if (!(merge && top?.merge === merge && !this.redoStack.length)) {
      this.undoStack.push({ label, snapshot: before, merge });
      if (this.undoStack.length > 50) this.undoStack.shift();
      this.redoStack = [];
    }
    if (close) this.undoStack.at(-1).merge = null;
    if (quiet) return true;
    this.assignDefaultPins();
    this.rebuildSceneModel();
    this.emit();
    return true;
  }

  undo() {
    const step = this.undoStack.pop();
    if (!step) return null;
    this.redoStack.push({ label: step.label, snapshot: this.snapshot() });
    this.restore(step.snapshot);
    this.rebuildSceneModel();
    this.emit();
    return step.label;
  }

  redo() {
    const step = this.redoStack.pop();
    if (!step) return null;
    this.undoStack.push({ label: step.label, snapshot: this.snapshot() });
    this.restore(step.snapshot);
    this.rebuildSceneModel();
    this.emit();
    return step.label;
  }

  // ---- Terrain Tools ----
  applyTerrainTemplate(template = 'flat', seed = 42) {
    this.commit(`Generate ${template} terrain`, (w) => {
      w.terrain = createTerrain(template, seed);
      // Re-align ground-aligned objects to the new terrain surface
      for (const obj of w.objects) {
        if (obj.alignTerrain !== false) {
          obj.pos[1] = terrainHeightAt(w.terrain, obj.pos[0], obj.pos[2]);
        }
      }
    });
  }

  // `params.stroke` names the brush stroke, so a whole drag is one undo step.
  sculpt(params) {
    return this.commit(
      `Sculpt terrain (${params.mode || 'raise'})`,
      (w) => {
        sculptTerrain(w.terrain, params);
        for (const obj of w.objects) {
          if (obj.alignTerrain !== false) {
            obj.pos[1] = terrainHeightAt(w.terrain, obj.pos[0], obj.pos[2]);
          }
        }
      },
      { merge: params.stroke ? 'stroke:' + params.stroke : null },
    );
  }

  paint(params) {
    return this.commit(
      `Paint ${params.paint || 'surface'}`,
      (w) => {
        paintTerrain(w.terrain, params);
      },
      { merge: params.stroke ? 'stroke:' + params.stroke : null },
    );
  }

  flattenArea(params) {
    return this.commit('Flatten building area', (w) => {
      flattenFootprint(w.terrain, params);
      for (const obj of w.objects) {
        if (obj.alignTerrain !== false) {
          obj.pos[1] = terrainHeightAt(w.terrain, obj.pos[0], obj.pos[2]);
        }
      }
    });
  }

  setWaterLevel(level) {
    const val = round(level, 2);
    return this.commit('Set water level', (w) => {
      w.terrain.waterLevel = val;
    });
  }

  addWaterBody({ kind = 'pond', x = 0, z = 0, width = 14, depth = 12, level = 0.15 } = {}) {
    const id = 'water-' + (this.world.terrain.waters.length + 1) + '-' + (Date.now() % 10000);
    this.commit(`Add ${kind}`, (w) => {
      w.terrain.waters.push({
        id,
        kind,
        x: round(x, 2),
        z: round(z, 2),
        width: round(width, 2),
        depth: round(depth, 2),
        level: round(level, 2),
      });
    });
    return id;
  }

  removeWaterBody(id) {
    return this.commit('Remove water body', (w) => {
      w.terrain.waters = (w.terrain.waters || []).filter((wb) => wb.id !== id);
    });
  }

  scatterVegetation(params) {
    const items = generateScatterItems(this.world.terrain, {
      ...params,
      existing: this.world.objects,
    });
    if (!items.length) return [];
    const addedIds = [];
    this.commit(`Scatter ${items.length} ${params.kind || 'items'}`, (w) => {
      for (const item of items) {
        const spec = getAssetSpec(item.kind);
        const id = this.nextObjectId(w, item.kind);
        addedIds.push(id);
        w.objects.push({
          id,
          name: spec ? spec.name : item.kind,
          kind: item.kind,
          layer: 'nature',
          pos: item.pos,
          turn: item.turn,
          scale: item.scale,
          alignTerrain: true,
          locked: false,
          hidden: false,
          props: {},
        });
      }
    });
    return addedIds;
  }

  // ---- Object & Building Construction ----
  nextObjectId(w = this.world, kind = 'obj') {
    const prefix = kind.split('/').pop() || 'obj';
    let n = 1;
    while (w.objects.some((o) => o.id === `${prefix}-${n}`)) n++;
    return `${prefix}-${n}`;
  }

  layerForKind(kind = '') {
    return layerForKind(kind);
  }

  addObject(
    kind,
    {
      name = null,
      pos = [0, 0, 0],
      turn = 0,
      scale = 1,
      props = {},
      flattenBeforePlace = false,
      alignTerrain = true,
    } = {},
  ) {
    const spec = getAssetSpec(kind);
    let addedId = null;
    this.commit('Add ' + (name || spec?.name || kind), (w) => {
      const [px, , pz] = pos;
      if (flattenBeforePlace && (kind.startsWith('building/') || kind === 'building/footprint')) {
        const bw = props.width || spec?.size?.[0] || 10;
        const bd = props.depth || spec?.size?.[2] || 8;
        flattenFootprint(w.terrain, { x: px, z: pz, width: bw, depth: bd });
      }
      const py = alignTerrain ? terrainHeightAt(w.terrain, px, pz) + (pos[1] || 0) : pos[1];
      addedId = this.nextObjectId(w, kind);
      const defaultProps = clone(spec?.defaultProps || {});
      w.objects.push({
        id: addedId,
        name: name || (spec ? spec.name : kind),
        kind,
        layer: this.layerForKind(kind),
        pos: [round(px), round(py), round(pz)],
        turn: round(turn, 4),
        scale: Array.isArray(scale) ? scale.map((s) => round(s)) : round(scale || 1),
        alignTerrain,
        locked: false,
        hidden: false,
        groupId: null,
        props: { ...defaultProps, ...clone(props) },
      });
    });
    if (addedId) {
      this.selectedIds = new Set([addedId]);
      this.selectedRoadId = null;
      this.emit();
    }
    return addedId;
  }

  // Construct a custom building from a drawn rectangular footprint (x1, z1) to (x2, z2).
  constructFootprintBuilding({
    x1 = -4,
    z1 = -3,
    x2 = 4,
    z2 = 3,
    stories = 1,
    storyHeight = 2.8,
    style = 'contemporary',
    roofStyle = 'pitched',
    flatten = true,
  } = {}) {
    const cx = (x1 + x2) / 2;
    const cz = (z1 + z2) / 2;
    const width = Math.max(3, round(Math.abs(x2 - x1), 2));
    const depth = Math.max(3, round(Math.abs(z2 - z1), 2));
    return this.addObject('building/footprint', {
      name: `Custom Building (${width}×${depth} m)`,
      pos: [cx, 0, cz],
      flattenBeforePlace: flatten,
      props: {
        width,
        depth,
        stories: Math.max(1, Number(stories) || 1),
        storyHeight: Number(storyHeight) || 2.8,
        style,
        roofStyle,
        doorOpen: false,
        hinge: 'left',
      },
    });
  }

  getObject(id) {
    return this.world.objects.find((o) => o.id === id) || null;
  }

  // Hiding is about the view, not the object: a locked object can be hidden and shown too.
  setObjectHidden(id, hidden) {
    return this.commit(hidden ? 'Hide object' : 'Show object', (w) => {
      const obj = w.objects.find((o) => o.id === id);
      if (obj) obj.hidden = !!hidden;
    });
  }

  updateObject(id, patch = {}, label = 'Update object') {
    const target = this.getObject(id);
    if (!target || target.locked) return false;
    return this.commit(label, (w) => {
      const obj = w.objects.find((o) => o.id === id);
      if (!obj) return;
      if (patch.name !== undefined) obj.name = String(patch.name).trim() || obj.name;
      if (patch.pos !== undefined) obj.pos = patch.pos.map((v) => round(v));
      if (patch.turn !== undefined) obj.turn = round(patch.turn, 4);
      if (patch.scale !== undefined) {
        obj.scale = Array.isArray(patch.scale)
          ? patch.scale.map((v) => Math.max(0.05, round(v)))
          : Math.max(0.05, round(patch.scale));
      }
      if (patch.layer !== undefined) obj.layer = patch.layer;
      if (patch.locked !== undefined) obj.locked = !!patch.locked;
      if (patch.hidden !== undefined) obj.hidden = !!patch.hidden;
      if (patch.alignTerrain !== undefined) obj.alignTerrain = !!patch.alignTerrain;
      if (patch.props !== undefined) {
        obj.props = { ...(obj.props || {}), ...clone(patch.props) };
      }
    });
  }

  // Live preview during gizmo drag without pushing an undo step
  previewObjectTransform(id, { pos, turn, scale }) {
    const obj = this.getObject(id);
    if (!obj || obj.locked) return;
    this.dragBefore ??= clone(this.world);
    if (pos) obj.pos = pos.map((v) => round(v));
    if (turn !== undefined) obj.turn = round(turn, 4);
    if (scale !== undefined) {
      obj.scale = Array.isArray(scale) ? scale.map((v) => round(v)) : round(scale);
    }
    this.rebuildSceneModel();
  }

  duplicateSelected() {
    const ids = [...this.selectedIds];
    if (!ids.length) return [];
    const newIds = [];
    this.commit(`Duplicate ${ids.length} object(s)`, (w) => {
      for (const id of ids) {
        const orig = w.objects.find((o) => o.id === id);
        if (!orig) continue;
        const copy = clone(orig);
        copy.id = this.nextObjectId(w, orig.kind);
        copy.name = orig.name + ' Copy';
        copy.pos = [round(orig.pos[0] + 1.5), orig.pos[1], round(orig.pos[2] + 1.5)];
        copy.locked = false;
        w.objects.push(copy);
        newIds.push(copy.id);
      }
    });
    if (newIds.length) {
      this.selectedIds = new Set(newIds);
      this.emit();
    }
    return newIds;
  }

  removeSelected() {
    if (this.selectedRoadId) {
      const rid = this.selectedRoadId;
      this.selectedRoadId = null;
      return this.removeRoad(rid);
    }
    const ids = [...this.selectedIds].filter((id) => !this.getObject(id)?.locked);
    if (!ids.length) return false;
    this.selectedIds.clear();
    return this.commit(`Delete ${ids.length} object(s)`, (w) => {
      w.objects = w.objects.filter((o) => !ids.includes(o.id));
      for (const g of w.groups) {
        g.memberIds = g.memberIds.filter((m) => !ids.includes(m));
      }
      w.groups = w.groups.filter((g) => g.memberIds.length > 0);
    });
  }

  // ---- Multi-select, Grouping, Locking, Hiding, Layers & Prefabs ----
  select(id, { additive = false } = {}) {
    this.selectedRoadId = null;
    if (!id) {
      if (!additive) this.selectedIds.clear();
      this.emit();
      return;
    }
    const obj = this.getObject(id);
    // If part of a group and not already isolated, select whole group on normal click
    const memberIds =
      obj?.groupId && !additive
        ? this.world.objects.filter((o) => o.groupId === obj.groupId).map((o) => o.id)
        : [id];
    if (additive) {
      for (const mid of memberIds) {
        if (this.selectedIds.has(mid)) this.selectedIds.delete(mid);
        else this.selectedIds.add(mid);
      }
    } else {
      this.selectedIds = new Set(memberIds);
    }
    this.emit();
  }

  groupSelected(name = 'Structure Group') {
    const ids = [...this.selectedIds];
    if (ids.length < 2) return null;
    const groupId = 'group-' + (this.world.groups.length + 1) + '-' + (Date.now() % 1000);
    this.commit(`Group ${ids.length} objects`, (w) => {
      w.groups.push({ id: groupId, name, memberIds: ids });
      for (const o of w.objects) {
        if (ids.includes(o.id)) o.groupId = groupId;
      }
    });
    return groupId;
  }

  ungroupSelected() {
    const ids = [...this.selectedIds];
    if (!ids.length) return false;
    return this.commit('Ungroup selection', (w) => {
      const groupIds = new Set(
        w.objects.filter((o) => ids.includes(o.id) && o.groupId).map((o) => o.groupId),
      );
      for (const o of w.objects) {
        if (groupIds.has(o.groupId)) o.groupId = null;
      }
      w.groups = w.groups.filter((g) => !groupIds.has(g.id));
    });
  }

  saveSelectedAsPrefab(name = 'Custom Prefab') {
    const ids = [...this.selectedIds];
    if (!ids.length) return null;
    const members = this.world.objects.filter((o) => ids.includes(o.id));
    if (!members.length) return null;
    const cx = members.reduce((s, o) => s + o.pos[0], 0) / members.length;
    const cy = Math.min(...members.map((o) => o.pos[1]));
    const cz = members.reduce((s, o) => s + o.pos[2], 0) / members.length;
    const prefab = {
      id: 'prefab-' + slug(name) + '-' + (Date.now() % 10000),
      name: String(name).trim() || 'Custom Prefab',
      items: members.map((o) => ({
        kind: o.kind,
        name: o.name,
        offset: [round(o.pos[0] - cx), round(o.pos[1] - cy), round(o.pos[2] - cz)],
        turn: o.turn,
        scale: clone(o.scale),
        props: clone(o.props || {}),
      })),
    };
    this.commit(`Save prefab ${prefab.name}`, () => this.prefabs.push(prefab));
    return prefab;
  }

  placePrefab(prefabId, pos = [0, 0, 0]) {
    const prefab = this.prefabs.find((p) => p.id === prefabId);
    if (!prefab) return [];
    const newIds = [];
    const baseY = terrainHeightAt(this.world.terrain, pos[0], pos[2]);
    this.commit(`Place prefab ${prefab.name}`, (w) => {
      const groupId = 'group-' + (w.groups.length + 1) + '-' + (Date.now() % 1000);
      for (const item of prefab.items) {
        const id = this.nextObjectId(w, item.kind);
        newIds.push(id);
        w.objects.push({
          id,
          name: item.name,
          kind: item.kind,
          layer: this.layerForKind(item.kind),
          pos: [
            round(pos[0] + item.offset[0]),
            round(baseY + item.offset[1]),
            round(pos[2] + item.offset[2]),
          ],
          turn: item.turn || 0,
          scale: clone(item.scale ?? 1),
          alignTerrain: false,
          locked: false,
          hidden: false,
          groupId: prefab.items.length > 1 ? groupId : null,
          props: clone(item.props || {}),
        });
      }
      if (prefab.items.length > 1) {
        w.groups.push({ id: groupId, name: prefab.name, memberIds: [...newIds] });
      }
    });
    this.selectedIds = new Set(newIds);
    this.emit();
    return newIds;
  }

  toggleFavorite(assetId) {
    const on = !this.favorites.includes(assetId);
    this.commit(on ? 'Add favourite' : 'Remove favourite', () => {
      if (on) this.favorites.push(assetId);
      else this.favorites.splice(this.favorites.indexOf(assetId), 1);
    });
    return on;
  }

  setLayerState(layerId, { visible, locked } = {}) {
    return this.commit(`Update layer ${layerId}`, (w) => {
      const layer = w.layers.find((l) => l.id === layerId);
      if (!layer) return;
      if (visible !== undefined) layer.visible = !!visible;
      if (locked !== undefined) layer.locked = !!locked;
    });
  }

  // ---- Roads & Infrastructure ----
  addRoad({
    name = 'Road Segment',
    kind = 'road', // 'road' | 'footpath' | 'driveway' | 'bridge'
    points = [
      { x: -12, z: 8 },
      { x: 12, z: 8 },
    ],
    width = 8,
    curvature = 0,
    crossing = false,
  } = {}) {
    let roadId = null;
    this.commit(`Add ${kind}`, (w) => {
      let n = 1;
      while (w.roads.some((r) => r.id === `road-${n}`)) n++;
      roadId = `road-${n}`;
      // Snap road endpoints to existing nearby road endpoints within 3m
      const snappedPoints = points.map((pt) => {
        for (const r of w.roads) {
          for (const ep of r.points || []) {
            if (Math.hypot(ep.x - pt.x, ep.z - pt.z) <= 3.0) {
              return { x: ep.x, z: ep.z };
            }
          }
        }
        return { x: round(pt.x, 2), z: round(pt.z, 2) };
      });
      w.roads.push({
        id: roadId,
        name,
        kind,
        width: Number(width) || (kind === 'footpath' ? 2.2 : kind === 'driveway' ? 4.2 : 8),
        curvature: round(curvature, 2),
        crossing: !!crossing,
        points: snappedPoints,
      });
    });
    this.selectedIds.clear();
    this.selectedRoadId = roadId;
    this.emit();
    return roadId;
  }

  updateRoad(id, patch = {}) {
    return this.commit('Update road', (w) => {
      const r = w.roads.find((rd) => rd.id === id);
      if (!r) return;
      if (patch.name !== undefined) r.name = String(patch.name).trim() || r.name;
      if (patch.kind !== undefined) r.kind = patch.kind;
      if (patch.width !== undefined)
        r.width = Math.max(1.5, Math.min(20, Number(patch.width) || 8));
      if (patch.curvature !== undefined)
        r.curvature = Math.max(-2, Math.min(2, Number(patch.curvature) || 0));
      if (patch.crossing !== undefined) r.crossing = !!patch.crossing;
      if (patch.points !== undefined) {
        r.points = patch.points.map((p) => ({ x: round(p.x, 2), z: round(p.z, 2) }));
      }
    });
  }

  removeRoad(id) {
    return this.commit('Delete road', (w) => {
      w.roads = w.roads.filter((r) => r.id !== id);
    });
  }

  // ---- Imported GLB/GLTF Assets & Packaging ----
  // An id no world's model uses yet, from the model's name.
  uniqueModelId(name = 'model', taken = new Set()) {
    for (const w of this.worlds) for (const a of w.importedAssets || []) taken.add(a.id);
    for (const id of this.modelBytes.keys()) taken.add(id);
    const base = 'custom-model-' + slug(name).slice(0, 40);
    let id = base,
      n = 2;
    while (taken.has(id)) id = `${base}-${n++}`;
    return id;
  }
  // Makes a world's models references to files: a model still packed into the world (older saves,
  // exported projects) is unpacked to bytes for its file. Copies of a world share their models'
  // files; a different model arriving under an id already in use, or an id that is not a safe file
  // name, gets a new id everywhere the world uses it.
  adoptModels(w) {
    const taken = new Set();
    for (const other of this.worlds || [])
      if (other !== w) for (const a of other.importedAssets || []) taken.add(a.id);
    const renamed = new Map();
    w.importedAssets = (w.importedAssets || []).filter((a) => a && typeof a === 'object');
    for (const asset of w.importedAssets) {
      const id = String(asset.id ?? ''),
        packed = typeof asset.dataUrl === 'string' && asset.dataUrl.startsWith('data:'),
        bytes = packed ? bytesOfDataUrl(asset.dataUrl) : null,
        known = this.modelBytes.get(id),
        same =
          known && bytes && known.length === bytes.length && known.every((b, i) => b === bytes[i]);
      if (!MODEL_ID.test(id) || (bytes && taken.has(id) && !same) || renamed.has(id)) {
        const fresh = this.uniqueModelId(asset.name || 'model', new Set(renamed.values()));
        renamed.set(id, fresh);
        asset.id = fresh;
      }
      asset.name = String(asset.name ?? 'Imported Model');
      asset.fileName = String(asset.fileName ?? 'model.glb');
      if (packed) {
        if (isGlb(bytes) && bytes.length <= MODEL_MAX_BYTES) this.modelBytes.set(asset.id, bytes);
        this.movedModels = true;
      }
      delete asset.dataUrl;
      asset.file = modelFile(asset.id);
    }
    if (renamed.size)
      for (const obj of w.objects || []) {
        const old = String(obj.kind).startsWith('imported/') && obj.kind.slice('imported/'.length);
        if (old !== false && renamed.has(old)) obj.kind = 'imported/' + renamed.get(old);
      }
  }
  // Adds a model from its bytes (binary glTF), kept until the next save writes its file.
  registerImportedAsset({
    name = 'Imported Model',
    fileName = 'model.glb',
    bytes = null,
    scale = 1,
    rotation = [0, 0, 0],
    size = [2, 2, 2],
  } = {}) {
    if (!isGlb(bytes)) throw new Error('That is not a binary glTF (.glb) model.');
    if (bytes.length > MODEL_MAX_BYTES) throw new Error('That model is over 64 MB.');
    const id = this.uniqueModelId(name);
    this.modelBytes.set(id, bytes);
    this.commit(`Import model ${name}`, (w) => {
      w.importedAssets.push({
        id,
        name: String(name),
        fileName: String(fileName),
        file: modelFile(id),
        scale: round(scale, 3),
        rotation: rotation.map((r) => round(r, 4)),
        size,
      });
    });
    return id;
  }
  // Models some world uses whose files the next save must write: [[id, bytes]].
  unsavedModels() {
    const used = new Set(this.worlds.flatMap((w) => (w.importedAssets || []).map((a) => a.id)));
    return [...this.modelBytes].filter(([id]) => used.has(id));
  }
  // After a save has written them: their files now hold them.
  modelsSaved(ids) {
    for (const id of ids) this.modelBytes.delete(id);
    this.movedModels = false;
  }

  // Checks for missing imported assets or unknown object kinds and offers recovery options.
  missingAssetsReport(w = this.world) {
    const warnings = [];
    const importedIds = new Set((w.importedAssets || []).map((a) => a.id));
    for (const obj of w.objects || []) {
      if (obj.kind.startsWith('imported/')) {
        const assetId = obj.kind.slice('imported/'.length);
        const asset = (w.importedAssets || []).find((a) => a.id === assetId);
        if (!importedIds.has(assetId) || !asset?.file) {
          warnings.push({
            objectId: obj.id,
            name: obj.name,
            missingKind: obj.kind,
            message: `${obj.name} (${obj.id}) references missing imported model "${assetId}".`,
          });
        }
      } else if (obj.kind !== 'building/footprint' && !getAssetSpec(obj.kind)) {
        warnings.push({
          objectId: obj.id,
          name: obj.name,
          missingKind: obj.kind,
          message: `${obj.name} (${obj.id}) uses unrecognised asset "${obj.kind}".`,
        });
      }
    }
    return warnings;
  }

  recoverMissingAsset(
    objectId,
    action = 'replace',
    replacementKind = 'furniture/shipping-container',
  ) {
    if (action === 'remove') {
      return this.commit('Remove missing asset object', (w) => {
        w.objects = w.objects.filter((o) => o.id !== objectId);
      });
    }
    return this.commit('Replace missing asset with placeholder', (w) => {
      const obj = w.objects.find((o) => o.id === objectId);
      if (obj) obj.kind = replacementKind;
    });
  }

  // ---- IoT Integration & Programming ----
  iotDevices(w = this.world) {
    return worldDevices(w);
  }

  assignDefaultPins(w = this.world) {
    assignPins(w);
  }

  setControllerBoard(board) {
    if (!['ESP32', 'Raspberry Pi Pico'].includes(board)) return false;
    return this.commit(`Switch controller to ${board}`, (w) => {
      w.iot.board = board;
      for (const obj of w.objects) {
        if (obj.kind.startsWith('iot/') && !obj.kind.startsWith('iot/board-')) {
          obj.props.pin = null;
        }
      }
      this.assignDefaultPins(w);
    });
  }

  setProgrammingLanguage(language) {
    if (!['cpp', 'python'].includes(language)) return false;
    this.commit(`Program in ${language === 'cpp' ? 'C++' : 'MicroPython'}`, (w) => {
      w.iot.language = language;
      if (!w.iot.code[language]?.trim())
        w.iot.code[language] = this.generateStarterCode(language, w);
    });
    return true;
  }

  // `quiet`: the caller is typing in the code and keeps its own panel (no redraw); the typing is
  // one undo step until something else changes.
  setCode(source, language = this.world.iot.language, { quiet = false } = {}) {
    const changed = this.commit(
      'Edit program',
      (w) => {
        w.iot.code[language] = String(source ?? '');
      },
      quiet ? { merge: 'code:' + language, quiet: true } : {},
    );
    if (!changed && !quiet) this.emit();
  }

  generateStarterCode(language = this.world.iot.language, w = this.world) {
    return starterCode(w, language);
  }

  // ---- Environment & Play Mode Simulation ----
  // `quiet`: a slider is being dragged; the viewport follows, the panels redraw when it is let go.
  // In Play Mode the change is to the running simulation only; otherwise it is the world's, and a
  // slider's whole drag is one undo step.
  setEnvironment(patch = {}, { quiet = false } = {}) {
    const apply = (target) => {
      Object.assign(target, patch);
      if (patch.timeOfDay !== undefined && patch.sunlight === undefined) {
        // Derive sunlight 0..100 from time of day (6:00..18:00 daylight curve)
        const h = Number(patch.timeOfDay) || 12;
        target.sunlight = Math.max(
          5,
          Math.round(Math.max(0, Math.sin(((h - 6) / 12) * Math.PI)) * 95),
        );
      }
    };
    if (this.mode === 'play' && this.simEnvironment) {
      apply(this.simEnvironment);
      if (!quiet) this.emit();
      return;
    }
    const keys = Object.keys(patch).sort().join(',');
    const changed = this.commit('Change ' + keys, (w) => apply(w.environment), {
      merge: 'environment:' + keys,
      close: !quiet,
      quiet,
    });
    // A slider let go where the drag already took it: the panels still catch up.
    if (!changed && !quiet) this.emit();
  }

  // Builds the runtime environment readings object expected by Runtime.step(env).
  currentRuntimeEnv() {
    return runtimeEnv(
      (this.mode === 'play' && this.simEnvironment) ||
        this.world.environment ||
        defaultEnvironment(),
    );
  }

  // Formatted human-readable simulated readings for the UI, clearly marked as simulated.
  formattedSimulatedReadings() {
    const rEnv = this.currentRuntimeEnv();
    const devices = this.iotDevices();
    return devices
      .filter((d) => !d.output && d.signal)
      .map((d) => {
        const raw = rEnv[d.signal] ?? 0;
        const val = programReading(d.signal, raw);
        return {
          objectId: d.objectId,
          name: d.name,
          pin: d.pin,
          signal: d.signal,
          reading: val,
          simulated: true,
        };
      });
  }

  enterPlayMode() {
    this.mode = 'play';
    this.playOpened = new Set();
    this.simEnvironment = clone(this.world.environment);
    this.playerPos = [...(this.world.spawn || [0, 0, 12])];
    this.simTime = 0;
    this.simOutputs = {};
    this.simLogs = [];
    this.simError = null;
    this.simPaused = false;
    this.simRunning = true;

    // Initialize vehicle & pedestrian simulation agents from placed objects
    this.simAgents = worldAgents(this.world);

    this.compileRuntime();
    this.stepSimulation(0.2);
    this.emit();
  }

  compileRuntime() {
    const devices = this.iotDevices();
    const board = this.world.iot?.board || 'ESP32';
    const lang = this.world.iot?.language || 'cpp';
    const src = this.world.iot?.code?.[lang] || '';
    this.runtime = null;
    this.simError = null;
    if (!src.trim()) return;
    try {
      const wiringErrors = validate(devices, board);
      if (wiringErrors.length) {
        this.simError = wiringErrors[0];
      }
      this.runtime = new Runtime(src, lang, devices, board);
    } catch (err) {
      this.simError = err.message || String(err);
    }
  }

  stepSimulation(dtSeconds = 0.2) {
    if (this.mode !== 'play' || !this.simRunning || this.simPaused) return;
    stepWorldSim(this, this.world, dtSeconds);
    this.rebuildSceneModel();
  }

  pausePlayMode() {
    if (this.mode !== 'play') return;
    this.simPaused = !this.simPaused;
    this.emit();
  }

  resetPlayMode() {
    if (this.mode !== 'play') return;
    this.enterPlayMode();
  }

  stopPlayMode() {
    if (this.mode !== 'play') return;
    this.mode = 'edit';
    this.simRunning = false;
    this.simPaused = false;
    this.simOutputs = {};
    this.simEnvironment = null;
    this.playOpened = null;
    this.rebuildSceneModel();
    this.emit();
  }
  // Opens or closes a door or gate for this run of Play Mode only (the saved world keeps it as
  // built, as the game does). Returns whether it is now open.
  togglePlayDoor(id) {
    if (this.mode !== 'play') return false;
    this.playOpened ??= new Set();
    const open = !this.playOpened.has(id);
    if (open) this.playOpened.add(id);
    else this.playOpened.delete(id);
    this.rebuildSceneModel();
    this.emit();
    return open;
  }

  // ---- 3D Scene Model Construction (Compatible with ThreeWorldRenderer) ----
  rebuildSceneModel() {
    const w = this.world;
    const playing = this.mode === 'play';
    const model = buildWorldScene(w, {
      playing,
      outputs: this.simOutputs,
      agents: this.simAgents,
      hideRoofs: this.hideRoofs,
      maxVisibleStory: this.maxVisibleStory,
      modelSizes: this.modelSizes,
      opened: playing ? this.playOpened : null,
    });
    this.objectParts = model.objectParts;

    // Spawn Marker (visible in Edit Mode)
    if (!playing && w.spawn) {
      const [sx, , sz] = w.spawn;
      const sy = terrainHeightAt(w.terrain, sx, sz);
      w.spawn[1] = sy;
      model.mesh('cylinder', [sx, sy + 0.04, sz], [1.3, 0.08, 1.3], '#4f9cf9', {
        opacity: 0.75,
        spawnMarker: true,
      });
    }

    this.model = prepareWorldScene(model);
    return this.model;
  }

  // ---- Serialization & Export / Import ----
  toStoreData() {
    return {
      version: 1,
      worlds: clone(this.worlds),
      prefabs: clone(this.prefabs),
      favorites: clone(this.favorites),
    };
  }

  // An exported project carries its models inside it (as base64), so it opens anywhere: `models`
  // gives each model's bytes by id (from its file, or not yet saved).
  exportWorldProject(worldId = this.activeWorldId, models = {}) {
    const target = this.worlds.find((w) => w.id === worldId) || this.world;
    const world = clone(target);
    for (const asset of world.importedAssets || []) {
      const bytes = models[asset.id] || this.modelBytes.get(asset.id);
      if (bytes) asset.dataUrl = dataUrlOf(bytes);
      delete asset.file;
    }
    return JSON.stringify(
      {
        format: WORLD_PROJECT_FORMAT,
        version: WORLD_PROJECT_VERSION,
        exportedAt: new Date().toISOString(),
        world,
        prefabs: clone(this.prefabs),
      },
      null,
      2,
    );
  }

  importWorldProject(jsonText) {
    let parsed;
    try {
      parsed = typeof jsonText === 'string' ? JSON.parse(jsonText) : jsonText;
    } catch {
      throw new Error('The file is not valid JSON.');
    }
    if (
      !parsed ||
      parsed.format !== WORLD_PROJECT_FORMAT ||
      parsed.version !== WORLD_PROJECT_VERSION ||
      !parsed.world ||
      typeof parsed.world !== 'object'
    ) {
      throw new Error('This file is not a valid IoT Quest World Project.');
    }
    const w = clone(parsed.world);
    const baseId = slug(w.name || w.id || 'imported-world');
    let newId = baseId;
    let n = 2;
    while (this.worlds.some((existing) => existing.id === newId)) newId = `${baseId}-${n++}`;
    w.id = newId;
    this.ensureWorldDefaults(w);
    this.worlds.push(w);
    if (Array.isArray(parsed.prefabs)) {
      for (const p of parsed.prefabs) {
        if (p?.id && !this.prefabs.some((ep) => ep.id === p.id)) {
          this.prefabs.push(clone(p));
        }
      }
    }
    this.selectWorld(w.id);
    return w;
  }
}
