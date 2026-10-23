// World Builder Session & Project Management.
// Handles creating, naming, saving, reopening, duplicating, exporting/importing worlds,
// undo/redo for terrain and object edits, multi-select, grouping, locking, hiding, layers,
// reusable prefabs, favourites, GLB/GLTF import metadata, and Play Mode IoT simulation.
// Free of the DOM so it can be tested directly under Node.
import { Runtime } from '../../../public/runtime.js';
import { defaults, validate, program } from '../../../public/missions.js';
import { baseEnv, ADC_SIGNALS, ADC_SCALE, programReading } from '../../../public/signals.js';
import { prepareWorldMaterials } from '../../../public/world-materials.js';
import { addSky } from '../../../public/sky.js';
import {
  createTerrain,
  terrainHeightAt,
  sculptTerrain,
  paintTerrain,
  flattenFootprint,
  generateScatterItems,
  buildTerrainMeshes,
} from './terrain.js';
import {
  ASSET_LIBRARY,
  getAssetSpec,
  getComponentSpec,
  buildAssetInstance,
  buildRoadMeshes,
  sampleRoadPoints,
} from './assets.js';

export const WORLD_PROJECT_FORMAT = 'iotquest-world-project';
export const WORLD_PROJECT_VERSION = 1;
export const COMPLEXITY_WARNING_LIMIT = 200;

export const DEFAULT_LAYERS = [
  { id: 'terrain', name: 'Terrain & Water', visible: true, locked: false },
  { id: 'buildings', name: 'Buildings & Structure', visible: true, locked: false },
  { id: 'furniture', name: 'Furniture & Decor', visible: true, locked: false },
  { id: 'infrastructure', name: 'Roads & Infrastructure', visible: true, locked: false },
  { id: 'nature', name: 'Nature & Vegetation', visible: true, locked: false },
  { id: 'iot', name: 'IoT Components', visible: true, locked: false },
];

const clone = (v) => JSON.parse(JSON.stringify(v));
const round = (v, p = 3) => Math.round((Number(v) || 0) * 10 ** p) / 10 ** p;
const slug = (s) =>
  String(s || 'world')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'world';

export function defaultEnvironment() {
  return {
    timeOfDay: 11.5, // 0..24 hours
    sunlight: 85, // 0..100
    rain: 0, // 0..100
    fog: 10, // 0..100
    wind: 12, // km/h
    temperature: 24, // °C
    humidity: 50, // %
    soilMoisture: 35, // 0..100 (ADC scaled in program)
    waterLevel: 80, // 0..100
    motion: 0, // 0 or 1
    distance: 120, // cm
    dust: 10, // 0..100 (smoke/gas/dust)
    pressed: 0, // button/keypad
    docked: 0, // rfid/dock
  };
}

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
    if (!w) return;
    w.version ??= 1;
    w.units ||= 'm';
    w.terrain ||= createTerrain('flat', 42);
    w.terrain.waters ||= [];
    w.objects ||= [];
    w.roads ||= [];
    w.groups ||= [];
    w.importedAssets ||= [];
    w.layers ||= clone(DEFAULT_LAYERS);
    // A world can come from a file (Import Project): its numbers and names are made what the panels
    // expect, so a hand-edited project can neither break them nor put markup in them.
    const num = (v, fallback = 0) => (Number.isFinite(Number(v)) ? Number(v) : fallback);
    const environment = defaultEnvironment();
    for (const [k, v] of Object.entries(w.environment || {}))
      if (k in environment) environment[k] = num(v, environment[k]);
    w.environment = environment;
    if (!['m', 'cm', 'ft'].includes(w.units)) w.units = 'm';
    w.name = String(w.name ?? 'Imported World');
    w.terrain.waterLevel = num(w.terrain.waterLevel, -2);
    w.spawn = Array.isArray(w.spawn)
      ? [0, 1, 2].map((i) => num(w.spawn[i]))
      : [0, terrainHeightAt(w.terrain, 0, 12), 12];
    for (const o of w.objects) {
      o.id = String(o.id);
      o.name = String(o.name ?? o.kind);
      o.kind = String(o.kind ?? '');
      o.pos = [0, 1, 2].map((i) => num(o.pos?.[i]));
      o.turn = num(o.turn);
      o.scale = Array.isArray(o.scale) ? [0, 1, 2].map((i) => num(o.scale[i], 1)) : num(o.scale, 1);
      o.props ||= {};
      if (o.props.color !== undefined && !/^#[0-9a-f]{6}$/i.test(o.props.color))
        delete o.props.color;
    }
    for (const r of w.roads) r.width = num(r.width, 8);
    w.iot ||= { board: 'ESP32', language: 'cpp', code: { cpp: '', python: '' } };
    w.iot.board ||= 'ESP32';
    w.iot.language ||= 'cpp';
    w.iot.code ||= { cpp: '', python: '' };
    this.assignDefaultPins(w);
    if (!w.iot.code.cpp && !w.iot.code.python) {
      w.iot.code.cpp = this.generateStarterCode('cpp', w);
      w.iot.code.python = this.generateStarterCode('python', w);
    }
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
  // `merge` names an edit that goes on (one brush stroke): its later commits join the first's
  // undo step. A gizmo drag's live preview has already changed the world, so its commit undoes to
  // the world as it was when the drag began.
  commit(label, mutator, { merge = null } = {}) {
    const before = this.dragBefore || clone(this.world);
    this.dragBefore = null;
    mutator(this.world);
    if (JSON.stringify(before) === JSON.stringify(this.world)) return false;
    const top = this.undoStack.at(-1);
    if (merge && top?.merge === merge && !this.redoStack.length) {
      this.assignDefaultPins();
      this.rebuildSceneModel();
      this.emit();
      return true;
    }
    this.undoStack.push({ label, snapshot: before, merge });
    if (this.undoStack.length > 50) this.undoStack.shift();
    this.redoStack = [];
    this.assignDefaultPins();
    this.rebuildSceneModel();
    this.emit();
    return true;
  }

  undo() {
    const step = this.undoStack.pop();
    if (!step) return null;
    this.redoStack.push({ label: step.label, snapshot: clone(this.world) });
    const idx = this.worlds.findIndex((w) => w.id === this.activeWorldId);
    if (idx >= 0) this.worlds[idx] = step.snapshot;
    this.rebuildSceneModel();
    this.emit();
    return step.label;
  }

  redo() {
    const step = this.redoStack.pop();
    if (!step) return null;
    this.undoStack.push({ label: step.label, snapshot: clone(this.world) });
    const idx = this.worlds.findIndex((w) => w.id === this.activeWorldId);
    if (idx >= 0) this.worlds[idx] = step.snapshot;
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
    if (kind.startsWith('building/') || kind.startsWith('modular/')) return 'buildings';
    if (kind.startsWith('furniture/')) return 'furniture';
    if (kind.startsWith('infra/')) return 'infrastructure';
    if (kind.startsWith('nature/')) return 'nature';
    if (kind.startsWith('iot/')) return 'iot';
    return 'furniture';
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
    this.prefabs.push(prefab);
    this.emit();
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
    const idx = this.favorites.indexOf(assetId);
    if (idx >= 0) this.favorites.splice(idx, 1);
    else this.favorites.push(assetId);
    this.emit();
    return this.favorites.includes(assetId);
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
  registerImportedAsset({
    id = 'custom-model-' + (Date.now() % 10000),
    name = 'Imported Model',
    fileName = 'model.glb',
    dataUrl = null,
    scale = 1,
    rotation = [0, 0, 0],
    size = [2, 2, 2],
  } = {}) {
    this.commit(`Import model ${name}`, (w) => {
      w.importedAssets = (w.importedAssets || []).filter((a) => a.id !== id);
      w.importedAssets.push({
        id,
        name,
        fileName,
        dataUrl, // Packaged inline as base64 data URL so exported project files reopen self-contained
        scale: round(scale, 3),
        rotation: rotation.map((r) => round(r, 4)),
        size,
      });
    });
    return id;
  }

  // Checks for missing imported assets or unknown object kinds and offers recovery options.
  missingAssetsReport(w = this.world) {
    const warnings = [];
    const importedIds = new Set((w.importedAssets || []).map((a) => a.id));
    for (const obj of w.objects || []) {
      if (obj.kind.startsWith('imported/')) {
        const assetId = obj.kind.slice('imported/'.length);
        const asset = (w.importedAssets || []).find((a) => a.id === assetId);
        if (!importedIds.has(assetId) || !asset?.dataUrl) {
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
    const list = [];
    for (const obj of w.objects || []) {
      if (!obj.kind.startsWith('iot/') || obj.kind.startsWith('iot/board-')) continue;
      const compId = obj.props?.componentId || obj.kind.slice(4);
      const spec = getComponentSpec(compId);
      if (!spec) continue;
      list.push({
        objectId: obj.id,
        id: spec.id,
        name: obj.name || spec.name,
        signal: spec.signal,
        output: !!spec.output,
        analog: !!spec.analog,
        resistor: spec.resistor,
        pin: obj.props?.pin,
        power: obj.props?.power !== false,
        ground: obj.props?.ground !== false,
        resistorConnected: obj.props?.resistorConnected !== false,
        area: 'World Builder',
      });
    }
    return list;
  }

  assignDefaultPins(w = this.world) {
    const board = w.iot?.board || 'ESP32';
    const analogPins = board === 'ESP32' ? [34, 35, 32, 33, 36, 39] : [26, 27, 28];
    const digitalPins = board === 'ESP32' ? [27, 14, 13, 4, 16, 17] : [16, 17, 18, 19, 20, 21];
    const outputPins =
      board === 'ESP32'
        ? [26, 25, 18, 19, 21, 22, 23, 5, 2, 15]
        : [15, 14, 13, 12, 11, 10, 9, 8, 7, 6];
    const allowed = new Set([...analogPins, ...digitalPins, ...outputPins]);
    const used = new Set();
    let a = 0,
      d = 0,
      o = 0;

    for (const obj of w.objects || []) {
      if (!obj.kind.startsWith('iot/') || obj.kind.startsWith('iot/board-')) continue;
      const compId = obj.props?.componentId || obj.kind.slice(4);
      const spec = getComponentSpec(compId);
      if (!spec) continue;
      obj.props ||= {};
      const currentPin = Number(obj.props.pin);
      if (
        Number.isInteger(currentPin) &&
        allowed.has(currentPin) &&
        !used.has(currentPin) &&
        (!spec.analog || analogPins.includes(currentPin))
      ) {
        used.add(currentPin);
        continue;
      }
      const pool = spec.output ? outputPins : spec.analog ? analogPins : digitalPins;
      let picked = pool.find((p) => !used.has(p));
      if (picked === undefined)
        picked = pool[(spec.output ? o++ : spec.analog ? a++ : d++) % pool.length];
      obj.props.pin = picked;
      used.add(picked);
    }
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
    this.world.iot.language = language;
    if (!this.world.iot.code[language]?.trim()) {
      this.world.iot.code[language] = this.generateStarterCode(language);
    }
    this.emit();
    return true;
  }

  // `quiet`: the caller is typing in the code and keeps its own panel (no redraw).
  setCode(source, language = this.world.iot.language, { quiet = false } = {}) {
    this.world.iot.code[language] = String(source ?? '');
    if (!quiet) this.emit();
  }

  generateStarterCode(language = this.world.iot.language, w = this.world) {
    const devices = this.iotDevices(w);
    const board = w.iot?.board || 'ESP32';
    if (!devices.length) {
      return language === 'cpp'
        ? '// Place IoT sensors and actuators in the world, then program them here.\nvoid setup() {\n  Serial.begin(115200);\n}\n\nvoid loop() {\n  delay(200);\n}\n'
        : '# Place IoT sensors and actuators in the world, then program them here.\nfrom machine import Pin, ADC\nimport time\n\nwhile True:\n    time.sleep_ms(200)\n';
    }
    const sensors = devices.filter((d) => !d.output && d.signal);
    const outputs = devices.filter((d) => d.output);
    const conditions = outputs.map((out) => {
      if (sensors.some((s) => s.signal === 'light') && ['led', 'porch', 'rgb'].includes(out.id)) {
        return 'light < 1800';
      }
      if (sensors.some((s) => s.signal === 'soil') && ['pump', 'valve'].includes(out.id)) {
        return 'soil < 2400';
      }
      if (
        sensors.some((s) => s.signal === 'motion') &&
        ['led', 'porch', 'buzzer'].includes(out.id)
      ) {
        return 'motion == 1';
      }
      if (sensors.some((s) => s.signal === 'temp') && ['fan', 'ac'].includes(out.id)) {
        return 'temp > 27';
      }
      if (sensors.some((s) => s.signal === 'distance') && ['servo', 'gate'].includes(out.id)) {
        return 'distance < 50';
      }
      const s0 = sensors[0];
      if (!s0) return 'true';
      return ADC_SIGNALS.includes(s0.signal) ? `${s0.signal} < 2000` : `${s0.signal} == 1`;
    });

    const syntheticMission = {
      title: w.name || 'World Builder Mission',
      conditions,
    };
    // Deduplicate by signal for starter code generation while preserving device pins
    const uniqueDevices = [];
    const seenSignals = new Set();
    for (const d of devices) {
      if (!d.output && seenSignals.has(d.signal)) continue;
      if (!d.output && d.signal) seenSignals.add(d.signal);
      uniqueDevices.push(d);
    }
    return program(syntheticMission, language, uniqueDevices, true, board);
  }

  // ---- Environment & Play Mode Simulation ----
  // `quiet`: a slider is being dragged; the viewport follows, the panels redraw when it is let go.
  setEnvironment(patch = {}, { quiet = false } = {}) {
    const target =
      this.mode === 'play' && this.simEnvironment ? this.simEnvironment : this.world.environment;
    Object.assign(target, patch);
    if (patch.timeOfDay !== undefined && patch.sunlight === undefined) {
      // Derive sunlight 0..100 from time of day (6:00..18:00 daylight curve)
      const h = Number(patch.timeOfDay) || 12;
      const sun = Math.max(5, Math.round(Math.max(0, Math.sin(((h - 6) / 12) * Math.PI)) * 95));
      target.sunlight = sun;
    }
    if (!quiet) this.emit();
  }

  // Builds the runtime environment readings object expected by Runtime.step(env).
  currentRuntimeEnv() {
    const envCfg =
      (this.mode === 'play' && this.simEnvironment) ||
      this.world.environment ||
      defaultEnvironment();
    return {
      ...baseEnv,
      light: envCfg.sunlight ?? 80,
      temp: envCfg.temperature ?? 24,
      outdoorTemp: envCfg.temperature ?? 24,
      humidity: envCfg.humidity ?? 50,
      rain: envCfg.rain ?? 0,
      wind: envCfg.wind ?? 12,
      cloud: envCfg.fog ?? 10,
      soil: envCfg.soilMoisture ?? 35,
      tank: envCfg.waterLevel ?? 80,
      pond: envCfg.waterLevel ?? 80,
      motion: envCfg.motion ? 1 : 0,
      occupied: envCfg.motion ? 1 : 0,
      distance: envCfg.distance ?? 120,
      dust: envCfg.dust ?? 10,
      pressed: envCfg.pressed ? 1 : 0,
      docked: envCfg.docked ? 1 : 0,
    };
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
    this.simEnvironment = clone(this.world.environment);
    this.playerPos = [...(this.world.spawn || [0, 0, 12])];
    this.simTime = 0;
    this.simOutputs = {};
    this.simLogs = [];
    this.simError = null;
    this.simPaused = false;
    this.simRunning = true;

    // Initialize vehicle & pedestrian simulation agents from placed objects
    this.simAgents = this.world.objects
      .filter((o) => o.kind === 'infra/vehicle-car' || o.kind === 'infra/pedestrian')
      .map((o) => ({
        objectId: o.id,
        kind: o.kind,
        pos: [...o.pos],
        startPos: [...o.pos],
        turn: o.turn || 0,
        speed: Number(o.props?.speed) || (o.kind === 'infra/vehicle-car' ? 6 : 1.4),
        progress: 0,
      }));

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
    this.simTime = round(this.simTime + dtSeconds, 2);

    // Step microcontroller program
    if (this.runtime) {
      try {
        const res = this.runtime.step(this.currentRuntimeEnv());
        this.simOutputs = res.outputs || {};
        if (res.logs?.length) {
          this.simLogs.push(...res.logs);
          if (this.simLogs.length > 40) this.simLogs.splice(0, this.simLogs.length - 40);
        }
      } catch (err) {
        this.simError = err.message || String(err);
      }
    }

    // Apply actuator outputs to world objects (e.g. servo/gate opens doors & gates, pump waters soil)
    const devices = this.iotDevices();
    const gateActive = devices.some(
      (d) => ['servo', 'gate', 'motor'].includes(d.id) && (this.simOutputs[d.pin] || 0) > 0,
    );
    const pumpActive = devices.some(
      (d) => ['pump', 'valve', 'valve2'].includes(d.id) && (this.simOutputs[d.pin] || 0) > 0,
    );
    const coolingActive = devices.some(
      (d) => ['fan', 'ac'].includes(d.id) && (this.simOutputs[d.pin] || 0) > 0,
    );

    if (pumpActive && this.simEnvironment) {
      this.simEnvironment.soilMoisture = Math.min(
        100,
        round(this.simEnvironment.soilMoisture + dtSeconds * 2, 1),
      );
    }
    if (coolingActive && this.simEnvironment) {
      this.simEnvironment.temperature = Math.max(
        16,
        round(this.simEnvironment.temperature - dtSeconds * 0.4, 1),
      );
    }

    // Step road/path agents while obeying red traffic signals and avoiding collisions
    const redSignalActive = devices.some(
      (d) => ['red', 'red2', 'waitLight'].includes(d.id) && (this.simOutputs[d.pin] || 0) > 0,
    );
    const roads = this.world.roads || [];
    for (const agent of this.simAgents) {
      if (redSignalActive) continue;
      if (roads.length) {
        const road =
          roads.find((r) =>
            agent.kind === 'infra/pedestrian' ? r.kind === 'footpath' : r.kind !== 'footpath',
          ) || roads[0];
        const pts = sampleRoadPoints(road.points, road.curvature);
        if (pts.length >= 2) {
          agent.progress = (agent.progress + dtSeconds * agent.speed * 0.05) % 1;
          const idx = Math.min(pts.length - 2, Math.floor(agent.progress * (pts.length - 1)));
          const localT = agent.progress * (pts.length - 1) - idx;
          const a = pts[idx],
            b = pts[idx + 1];
          const nx = a.x + (b.x - a.x) * localT;
          const nz = a.z + (b.z - a.z) * localT;
          const ny = terrainHeightAt(this.world.terrain, nx, nz);
          agent.pos = [round(nx, 2), round(ny, 2), round(nz, 2)];
          agent.turn = round(Math.atan2(b.x - a.x, b.z - a.z), 3);
        }
      }
    }

    this.rebuildSceneModel({ gateActive });
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
    this.rebuildSceneModel();
    this.emit();
  }

  // ---- 3D Scene Model Construction (Compatible with ThreeWorldRenderer) ----
  rebuildSceneModel({ gateActive = false } = {}) {
    const w = this.world;
    const objects = [];
    const colliders = [];
    const roofs = [];
    const lamps = [];

    const model = {
      objects,
      colliders,
      roofs,
      rooms: [],
      lamps,
      mesh(shape, pos, size, color, extra = {}) {
        const m = {
          shape,
          pos: [...pos],
          size: [...size],
          color,
          rotation: [0, 0, 0],
          ...extra,
        };
        objects.push(m);
        return m;
      },
      cylinder(x, y, z, r, h, color, extra = {}) {
        return this.mesh('cylinder', [x, y, z], [r * 2, h, r * 2], color, extra);
      },
      sphere(x, y, z, r, color, extra = {}) {
        return this.mesh('sphere', [x, y, z], [r * 2, r * 2, r * 2], color, extra);
      },
      floorHeight: (x, z) => terrainHeightAt(w.terrain, x, z),
    };

    const layerMap = new Map((w.layers || DEFAULT_LAYERS).map((l) => [l.id, l]));
    const isLayerVisible = (layerId) => layerMap.get(layerId)?.visible !== false;

    // 1. Sky
    model.sky = addSky(model);

    // 2. Terrain & Water
    if (isLayerVisible('terrain')) {
      buildTerrainMeshes(model, w.terrain);
    }

    // 2. Roads & Footpaths
    if (isLayerVisible('infrastructure')) {
      buildRoadMeshes(model, w.roads, w.terrain, terrainHeightAt);
    }

    // 3. Placed Objects (Buildings, Modular Parts, Furniture, Nature, IoT)
    this.objectParts = new Map();
    const activeOutputs = this.mode === 'play' ? this.simOutputs : {};
    const anyLampOn = this.iotDevices(w).some(
      (d) => ['led', 'porch', 'rgb', 'lightB'].includes(d.id) && (activeOutputs[d.pin] || 0) > 0,
    );

    for (const obj of w.objects || []) {
      if (obj.hidden) continue;
      if (!isLayerVisible(obj.layer || this.layerForKind(obj.kind))) continue;

      // In Play Mode, sync dynamic agent positions and servo/gate door states
      let instanceObj = obj;
      if (this.mode === 'play') {
        const agent = this.simAgents.find((a) => a.objectId === obj.id);
        if (agent) {
          instanceObj = { ...obj, pos: agent.pos, turn: agent.turn };
        } else if (
          gateActive &&
          (obj.kind === 'modular/gate' ||
            obj.kind === 'modular/door' ||
            obj.kind === 'building/garage' ||
            obj.props?.behavior === 'servo')
        ) {
          instanceObj = { ...obj, props: { ...(obj.props || {}), doorOpen: true } };
        }
      }

      const built = buildAssetInstance(model, instanceObj, {
        hideRoofs: this.hideRoofs,
        maxVisibleStory: this.maxVisibleStory,
        deviceOutputs: activeOutputs,
      });
      this.objectParts.set(obj.id, built.parts);

      // Dynamic point lights for active lamps & streetlights in Play Mode
      if (
        (anyLampOn && obj.kind === 'furniture/streetlight') ||
        (obj.kind.startsWith('iot/') &&
          ['led', 'porch', 'rgb'].includes(obj.props?.componentId || obj.kind.slice(4)) &&
          (activeOutputs[obj.props?.pin] || 0) > 0)
      ) {
        lamps.push({
          pos: [instanceObj.pos[0], instanceObj.pos[1] + 2.2, instanceObj.pos[2]],
          color: [1.0, 0.92, 0.72],
          range: 9.5,
        });
      }
    }

    // 4. Spawn Marker (visible in Edit Mode)
    if (this.mode === 'edit' && w.spawn) {
      const [sx, , sz] = w.spawn;
      const sy = terrainHeightAt(w.terrain, sx, sz);
      w.spawn[1] = sy;
      model.mesh('cylinder', [sx, sy + 0.04, sz], [1.3, 0.08, 1.3], '#4f9cf9', {
        opacity: 0.75,
        spawnMarker: true,
      });
    }

    prepareWorldMaterials(model);
    this.model = model;
    return model;
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

  exportWorldProject(worldId = this.activeWorldId) {
    const target = this.worlds.find((w) => w.id === worldId) || this.world;
    return JSON.stringify(
      {
        format: WORLD_PROJECT_FORMAT,
        version: WORLD_PROJECT_VERSION,
        exportedAt: new Date().toISOString(),
        world: clone(target),
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
