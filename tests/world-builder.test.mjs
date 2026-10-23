import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { WORKSPACES } from '../editor/ui/workspaces.js';
import worldsStoreDefault from '../public/data/worlds.js';
import {
  TERRAIN_TEMPLATES,
  SURFACE_PAINTS,
  BRUSH_MODES,
  createTerrain,
  terrainHeightAt,
} from '../public/world-builder/terrain.js';
import {
  ASSET_LIBRARY,
  ARCH_STYLES,
  MATERIAL_PRESETS,
  getAssetSpec,
  registerAssetPack,
} from '../public/world-builder/assets.js';
import {
  WorldBuilderSession,
  WORLD_PROJECT_FORMAT,
  WORLD_PROJECT_VERSION,
} from '../editor/workspaces/world-builder/session.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('World Builder workspace is registered in WORKSPACES, main.mjs, and has required UI files', () => {
  const ws = WORKSPACES.find((w) => w.id === 'world-builder');
  assert.ok(ws, 'world-builder entry should exist in WORKSPACES');
  assert.equal(ws.name, 'World Builder');
  assert.equal(ws.writes, 'public/data/worlds.js');

  assert.equal(worldsStoreDefault.version, 1);
  assert.ok(Array.isArray(worldsStoreDefault.worlds));

  const htmlPath = path.join(ROOT, 'editor/workspaces/world-builder/index.html');
  const appPath = path.join(ROOT, 'editor/workspaces/world-builder/app.js');
  const viewportPath = path.join(ROOT, 'editor/workspaces/world-builder/viewport.js');
  assert.ok(fs.existsSync(htmlPath), 'index.html exists');
  assert.ok(fs.existsSync(appPath), 'app.js exists');
  assert.ok(fs.existsSync(viewportPath), 'viewport.js exists');

  const html = fs.readFileSync(htmlPath, 'utf8');
  assert.match(html, /id="canvas"/);
  assert.match(html, /id="left-tabs"/);
  assert.match(html, /id="inspector"/);
  assert.match(html, /id="hierarchy-list"/);
  assert.match(html, /id="transform-tools"/);
});

test('Terrain templates, sculpting brushes, surface painting, water bodies, and vegetation scatter work', () => {
  for (const tpl of ['empty', 'flat', 'island', 'mountains', 'desert', 'forest', 'town']) {
    assert.ok(
      TERRAIN_TEMPLATES.some((item) => item.id === tpl),
      `Template ${tpl} exists`,
    );
    const t = createTerrain(tpl, 123);
    assert.equal(t.template, tpl);
    assert.equal(t.seed, 123);
    assert.equal(t.heights.length, t.size * t.size);
    assert.equal(t.paints.length, t.size * t.size);
  }

  for (const paint of ['grass', 'soil', 'sand', 'rock', 'snow', 'paved']) {
    assert.ok(SURFACE_PAINTS[paint], `Surface paint ${paint} exists`);
  }

  const brushIds = BRUSH_MODES.map((b) => b.id);
  for (const mode of ['raise', 'lower', 'smooth', 'flatten', 'plateau', 'hill', 'valley']) {
    assert.ok(brushIds.includes(mode), `Brush mode ${mode} exists`);
  }

  const session = new WorldBuilderSession();
  const baseH = terrainHeightAt(session.world.terrain, 0, 0);
  session.sculpt({ x: 0, z: 0, mode: 'hill', radius: 10, strength: 1.0, falloff: 0.5 });
  const raisedH = terrainHeightAt(session.world.terrain, 0, 0);
  assert.ok(raisedH > baseH, 'Sculpting a hill raises terrain elevation');

  session.paint({ x: 0, z: 0, paint: 'sand', radius: 8 });
  assert.ok(session.world.terrain.paints.includes('sand'), 'Painting applies surface material');

  const waterId = session.addWaterBody({
    kind: 'lake',
    x: 10,
    z: 10,
    width: 16,
    depth: 12,
    level: 0.5,
  });
  assert.ok(waterId);
  assert.equal(session.world.terrain.waters.length, 1);

  const scattered = session.scatterVegetation({
    kind: 'nature/tree-oak',
    density: 8,
    minScale: 0.8,
    maxScale: 1.2,
    seed: 99,
  });
  assert.equal(scattered.length, 8);
});

test('Buildings, modular parts, furniture, expandable asset packs, and roads work', () => {
  const requiredBuildings = [
    'building/house',
    'building/apartment',
    'building/shop',
    'building/office',
    'building/school',
    'building/warehouse',
    'building/factory',
    'building/garage',
    'building/shed',
    'building/greenhouse',
    'building/barn',
  ];
  for (const id of requiredBuildings) {
    assert.ok(getAssetSpec(id), `Ready-made building ${id} exists`);
  }

  const requiredModular = [
    'modular/foundation',
    'modular/floor',
    'modular/ceiling',
    'modular/wall-straight',
    'modular/wall-corner',
    'modular/wall-curved',
    'modular/partition',
    'modular/wall-door',
    'modular/wall-window',
    'modular/door',
    'modular/window',
    'modular/gate',
    'modular/fence',
    'modular/railing',
    'modular/stairs',
    'modular/ramp',
    'modular/balcony',
    'modular/pillar',
    'modular/beam',
    'modular/roof-pitched',
    'modular/roof-flat',
  ];
  for (const id of requiredModular) {
    assert.ok(getAssetSpec(id), `Modular part ${id} exists`);
  }

  assert.ok(
    Object.keys(ARCH_STYLES).length >= 4,
    'Supports multiple regional/architectural styles',
  );
  assert.ok(Object.keys(MATERIAL_PRESETS).length >= 6, 'Supports material presets');

  // Expandable content pack registration
  const addedCount = registerAssetPack('test-pack', [
    {
      id: 'furniture/solar-bench',
      name: 'Solar Charging Bench',
      category: 'furniture',
      subcategory: 'outdoor',
      size: [2, 0.9, 0.8],
    },
  ]);
  assert.equal(addedCount, 1);
  assert.ok(getAssetSpec('furniture/solar-bench'));
  assert.ok(ASSET_LIBRARY.length > 60);
});

test('Complete 7-step core workflow: create world, sculpt & paint, build house, furnish & road, install IoT, simulate in Play Mode, save & reopen', () => {
  const session = new WorldBuilderSession();

  // 1. Create a world
  const created = session.createNewWorld({
    name: 'Smart Homestead Mission',
    template: 'flat',
    seed: 101,
  });
  assert.equal(session.world.name, 'Smart Homestead Mission');
  assert.equal(session.activeWorldId, created.id);

  // 2. Sculpt a hill and paint terrain
  const h0 = terrainHeightAt(session.world.terrain, -18, -18);
  session.sculpt({ x: -18, z: -18, mode: 'hill', radius: 12, strength: 0.9, falloff: 0.5 });
  const h1 = terrainHeightAt(session.world.terrain, -18, -18);
  assert.ok(h1 > h0, 'Hill was sculpted');
  session.paint({ x: -18, z: -18, paint: 'rock', radius: 6 });
  session.paint({ x: 0, z: 6, paint: 'paved', radius: 4 });
  assert.ok(session.world.terrain.paints.includes('rock'));
  assert.ok(session.world.terrain.paints.includes('paved'));

  // 3. Construct a small house with a floor, walls, roof, door, and windows
  const houseId = session.constructFootprintBuilding({
    x1: -5,
    z1: -4,
    x2: 5,
    z2: 4,
    stories: 2,
    storyHeight: 2.8,
    style: 'contemporary',
    roofStyle: 'pitched',
    flatten: true,
  });
  assert.ok(houseId, 'Constructed footprint building');
  const doorId = session.addObject('modular/door', {
    pos: [0, 0, 4],
    props: { doorOpen: false, hinge: 'left', behavior: 'servo' },
  });
  const winId = session.addObject('modular/window', { pos: [-2.5, 1.0, 4] });
  assert.ok(doorId && winId);

  // Test hiding roofs and upper storeys for interior editing
  const partsWithRoof = session.objectParts.get(houseId).length;
  session.hideRoofs = true;
  session.maxVisibleStory = 1;
  session.rebuildSceneModel();
  const partsCutaway = session.objectParts.get(houseId).length;
  assert.ok(partsCutaway < partsWithRoof, 'Hiding roofs and upper storeys exposes interior');
  session.hideRoofs = false;
  session.maxVisibleStory = 10;
  session.rebuildSceneModel();

  // 4. Add furniture, a road, and vegetation
  const sofaId = session.addObject('furniture/sofa', { pos: [-1.5, 0.2, 0] });
  const tableId = session.addObject('furniture/table', { pos: [1.5, 0.2, 0] });
  const streetlightId = session.addObject('furniture/streetlight', { pos: [6, 0, 8] });
  const treeId = session.addObject('nature/tree-oak', { pos: [-10, 0, 6] });
  const carId = session.addObject('infra/vehicle-car', { pos: [-12, 0, 10] });
  const road1 = session.addRoad({
    name: 'Front Road',
    kind: 'road',
    width: 8,
    crossing: true,
    points: [
      { x: -20, z: 10 },
      { x: 20, z: 10 },
    ],
  });
  // Second road snapping to first road's endpoint
  const road2 = session.addRoad({
    name: 'Side Drive',
    kind: 'driveway',
    width: 4,
    points: [
      { x: 19.2, z: 10.4 }, // within 3m of (20, 10) -> snaps!
      { x: 20, z: 24 },
    ],
  });
  assert.ok(sofaId && tableId && streetlightId && treeId && carId && road1 && road2);
  const sideRoadObj = session.world.roads.find((r) => r.id === road2);
  assert.deepEqual(
    sideRoadObj.points[0],
    { x: 20, z: 10 },
    'Road endpoint snapped to intersection',
  );

  // 5. Install a sensor (LDR light sensor) and an actuator (LED / streetlight controller)
  const ldrId = session.addObject('iot/ldr', { name: 'Outdoor Light Sensor', pos: [4, 1, 4] });
  const ledId = session.addObject('iot/led', { name: 'Porch & Street LED', pos: [5, 2, 4] });
  assert.ok(ldrId && ledId);

  const devices = session.iotDevices();
  assert.equal(devices.length, 2);
  const ldrDev = devices.find((d) => d.id === 'ldr');
  const ledDev = devices.find((d) => d.id === 'led');
  assert.ok(Number.isInteger(ldrDev.pin), 'Sensor assigned valid GPIO pin');
  assert.ok(Number.isInteger(ledDev.pin), 'Actuator assigned valid GPIO pin');

  // Generate starter Arduino C++ code for the placed LDR + LED
  const code = session.generateStarterCode('cpp');
  session.setCode(code, 'cpp');
  assert.match(code, /analogRead/);
  assert.match(code, /digitalWrite/);

  // 6. Run a simple IoT interaction in Play Mode
  session.enterPlayMode();
  assert.equal(session.mode, 'play');

  // Simulate darkness (sunlight = 10 -> ADC reading < 1800) so the LED turns ON
  session.setEnvironment({ sunlight: 10 });
  session.stepSimulation(0.25);
  const readings = session.formattedSimulatedReadings();
  assert.equal(readings.length, 1);
  assert.equal(readings[0].simulated, true);
  assert.equal(session.simOutputs[ledDev.pin], 1, 'Program turned LED output HIGH in darkness');
  assert.ok(session.model.lamps.length > 0, 'Active LED & streetlight emit dynamic light in scene');

  // Simulate bright daylight (sunlight = 90 -> ADC reading > 1800) so the LED turns OFF
  session.setEnvironment({ sunlight: 90 });
  session.stepSimulation(0.25);
  assert.equal(session.simOutputs[ledDev.pin], 0, 'Program turned LED output LOW in daylight');

  // Pause, resume, and exit Play Mode without losing saved world state
  session.pausePlayMode();
  assert.equal(session.simPaused, true);
  session.pausePlayMode();
  assert.equal(session.simPaused, false);
  session.stopPlayMode();
  assert.equal(session.mode, 'edit');

  // Test grouping, prefab creation, and undo/redo
  session.select(sofaId);
  session.select(tableId, { additive: true });
  const groupId = session.groupSelected('Living Room Set');
  assert.ok(groupId);
  const prefab = session.saveSelectedAsPrefab('Living Room Prefab');
  assert.ok(prefab);

  const countBeforeUndo = session.world.objects.length;
  session.removeSelected();
  assert.ok(session.world.objects.length < countBeforeUndo);
  session.undo();
  assert.equal(session.world.objects.length, countBeforeUndo, 'Undo restored deleted group');

  // 7. Save, close, and reopen the world with its configuration preserved
  const savedStore = session.toStoreData();
  const exportedJson = session.exportWorldProject();
  const parsedExport = JSON.parse(exportedJson);
  assert.equal(parsedExport.format, WORLD_PROJECT_FORMAT);
  assert.equal(parsedExport.version, WORLD_PROJECT_VERSION);

  const reopenedSession = new WorldBuilderSession(savedStore);
  reopenedSession.selectWorld(created.id);
  assert.equal(reopenedSession.world.name, 'Smart Homestead Mission');
  assert.equal(reopenedSession.world.objects.length, countBeforeUndo);
  assert.equal(reopenedSession.world.roads.length, 2);
  assert.equal(reopenedSession.iotDevices().length, 2);
  assert.equal(reopenedSession.prefabs.length, 1);
});

test('Missing-asset detection and recovery options work', () => {
  const session = new WorldBuilderSession();
  const badId = session.addObject('imported/missing-glb-99', { name: 'Broken Imported Statue' });
  const warnings = session.missingAssetsReport();
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0].objectId, badId);

  session.recoverMissingAsset(badId, 'replace', 'furniture/shipping-container');
  assert.equal(session.missingAssetsReport().length, 0);
  assert.equal(session.getObject(badId).kind, 'furniture/shipping-container');
});
