// World Builder Workspace Controller: connects the 3D Viewport, Asset Library, Terrain Tools,
// Footprint & Modular Building Tools, Road & Infrastructure Builder, IoT Code Editor,
// Play Mode Simulation, Scene Hierarchy, Layers, and Project Import/Export.
import { icon } from '../../ui/icons.js';
import {
  TERRAIN_TEMPLATES,
  SURFACE_PAINTS,
  BRUSH_MODES,
  SCATTER_TYPES,
  createTerrain,
} from './terrain.js';
import {
  ASSET_CATEGORIES,
  ARCH_STYLES,
  MATERIAL_PRESETS,
  ASSET_LIBRARY,
  getAssetSpec,
} from './assets.js';
import { WorldBuilderSession, COMPLEXITY_WARNING_LIMIT } from './session.js';
import { WorldBuilderViewport } from './viewport.js';

const shell = window.editorShell;
const $ = (id) => document.getElementById(id);
const escape = (s) =>
  String(s ?? '').replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c],
  );
const DEGREES = 180 / Math.PI;
const AUTOSAVE_KEY = 'iotquest:world-builder:autosave';

const state = {
  session: null,
  savedText: '',
  activeTab: 'assets',
  assetCategory: 'all',
  assetSearch: '',
  favoritesOnly: false,
  placingAssetId: null,
  placingPrefabId: null,
  hierarchySearch: '',
  terrain: {
    template: 'island',
    seed: 42,
    previewSummary: null,
    subMode: 'sculpt', // 'sculpt' | 'paint' | 'water' | 'scatter'
    brushMode: 'raise',
    paintType: 'grass',
    radius: 7,
    strength: 0.45,
    falloff: 0.5,
    waterKind: 'pond',
    waterWidth: 16,
    waterDepth: 12,
    scatterKind: 'broadleaf',
    scatterDensity: 12,
    scatterMinScale: 0.85,
    scatterMaxScale: 1.25,
  },
  footprint: {
    width: 10,
    depth: 8,
    stories: 1,
    storyHeight: 2.8,
    style: 'contemporary',
    roofStyle: 'pitched',
    flatten: true,
  },
  roadDraft: {
    name: 'New Street',
    kind: 'road',
    width: 8,
    curvature: 0,
    crossing: true,
  },
};

// ---- Top Toolbar Chrome ----
$('home').innerHTML = icon('back');
$('new-world').innerHTML = icon('plus', 16);
$('dup-world').innerHTML = icon('copy', 16);
$('undo').innerHTML = icon('undo', 16);
$('redo').innerHTML = icon('redo', 16);
$('save').innerHTML = icon('save', 16) + 'Save';
$('playtest').innerHTML = icon('play', 16) + 'Play-test';
$('search-icon').innerHTML = icon('search', 16);
$('fav-filter').innerHTML = icon('star', 16);

function updatePlayButtonChrome() {
  const inPlay = state.session?.mode === 'play';
  const btn = $('mode-play');
  btn.innerHTML =
    (inPlay ? icon('close', 16) : icon('play', 16)) + (inPlay ? 'Exit Play Mode' : 'Play Mode');
  btn.classList.toggle('primary', inPlay);
}

// ---- Viewport Initialization ----
const viewport = new WorldBuilderViewport($('canvas'), {
  onPick(objectId, event) {
    if (!state.session) return;
    if (viewport.tool === 'erase') {
      if (objectId) {
        state.session.select(objectId);
        state.session.removeSelected();
        toast('Removed object. Undo (⌘Z) restores it.');
      }
      return;
    }
    state.session.select(objectId, { additive: event?.shiftKey });
  },
  onPlace(pos, keepPlacing) {
    if (!state.session) return;
    if (state.placingPrefabId) {
      state.session.placePrefab(state.placingPrefabId, pos);
      toast('Placed prefab in world.');
      if (!keepPlacing) stopPlacing();
      return;
    }
    if (!state.placingAssetId) return;
    const flatten = $('flatten-on-place')?.checked ?? true;
    const addedId = state.session.addObject(state.placingAssetId, {
      pos,
      flattenBeforePlace: flatten,
    });
    if (addedId && !keepPlacing) {
      stopPlacing();
    }
  },
  onTransformEnd(objectId, transform) {
    state.session?.updateObject(objectId, transform, 'Transform object');
  },
  onTerrainStroke(x, z, first) {
    if (!state.session) return;
    if (first) {
      state.stroke = (state.stroke || 0) + 1;
      applyStroke(x, z, true);
      return;
    }
    // A drag sends many points: apply the latest once a frame rather than every one.
    state.strokeAt = [x, z];
    if (state.strokeQueued) return;
    state.strokeQueued = true;
    requestAnimationFrame(() => {
      state.strokeQueued = false;
      applyStroke(...state.strokeAt, false);
    });
  },
  onFootprintDraw(rect) {
    if (!state.session) return;
    const fp = state.footprint;
    const id = state.session.constructFootprintBuilding({
      x1: rect.x1,
      z1: rect.z1,
      x2: rect.x2,
      z2: rect.z2,
      stories: fp.stories,
      storyHeight: fp.storyHeight,
      style: fp.style,
      roofStyle: fp.roofStyle,
      flatten: fp.flatten,
    });
    if (id) {
      toast('Constructed footprint building.');
      setTransformMode('select');
    }
  },
  onRoadPointAdd(points) {
    renderRoadsTab();
    setHint(
      `Road point ${points.length} placed. Click more points or press "Finish Road" in the left panel.`,
    );
  },
  onPlayInteract(objectId) {
    if (!state.session) return;
    const obj = state.session.getObject(objectId);
    if (!obj) return;
    // Toggle interactive doors/gates or trigger pushButtons/switches in Play Mode
    if (
      obj.kind === 'modular/door' ||
      obj.kind === 'modular/gate' ||
      obj.kind === 'modular/wall-door' ||
      obj.kind.startsWith('building/')
    ) {
      const nextOpen = !obj.props?.doorOpen;
      state.session.updateObject(objectId, { props: { doorOpen: nextOpen } }, 'Toggle door/gate');
      toast(`${obj.name}: ${nextOpen ? 'Opened' : 'Closed'}`);
    } else if (obj.kind.startsWith('iot/')) {
      const compId = obj.props?.componentId || obj.kind.slice(4);
      if (['pushButton', 'switch2', 'keypad'].includes(compId)) {
        const nextPressed = state.session.simEnvironment?.pressed ? 0 : 1;
        state.session.setEnvironment({ pressed: nextPressed });
        state.session.stepSimulation(0.1);
        toast(`${obj.name}: ${nextPressed ? 'Pressed (HIGH)' : 'Released (LOW)'}`);
      } else if (compId === 'rfid') {
        const nextDocked = state.session.simEnvironment?.docked ? 0 : 1;
        state.session.setEnvironment({ docked: nextDocked });
        state.session.stepSimulation(0.1);
        toast(`${obj.name}: Card ${nextDocked ? 'Scanned' : 'Removed'}`);
      }
    }
  },
  onHover(obj, event) {
    const label = $('hover-label');
    if (!obj || !event) {
      label.hidden = true;
      return;
    }
    label.hidden = false;
    label.textContent =
      state.session?.mode === 'play'
        ? `${obj.name} (Click to interact)`
        : `${obj.name} (${obj.id})`;
    const rect = $('canvas').getBoundingClientRect();
    label.style.left = event.clientX - rect.left + 'px';
    label.style.top = event.clientY - rect.top + 'px';
  },
});

// One point of a terrain brush stroke. The whole stroke is one undo step; water goes in once, where
// the stroke starts.
function applyStroke(x, z, first) {
  const t = state.terrain;
  if (t.subMode === 'paint') {
    state.session.paint({ x, z, paint: t.paintType, radius: t.radius, stroke: state.stroke });
  } else if (t.subMode === 'water') {
    if (!first) return;
    state.session.addWaterBody({
      kind: t.waterKind,
      x,
      z,
      width: t.waterWidth,
      depth: t.waterDepth,
      level: state.session.world.terrain.waterLevel ?? 0.2,
    });
    toast(`Added ${t.waterKind} at (${x.toFixed(1)}, ${z.toFixed(1)})`);
  } else {
    state.session.sculpt({
      x,
      z,
      mode: t.brushMode,
      radius: t.radius,
      strength: t.strength,
      falloff: t.falloff,
      stroke: state.stroke,
    });
  }
}

// ---- State & Dirty Tracking ----
function currentStoreText() {
  return state.session ? JSON.stringify(state.session.toStoreData()) : '';
}

function isDirty() {
  return Boolean(state.session && currentStoreText() !== state.savedText);
}

function updateSaveIndicator() {
  const dirty = isDirty();
  const el = $('save-state');
  el.textContent = dirty ? 'Unsaved changes' : 'All changes saved';
  el.classList.toggle('unsaved', dirty);
  shell?.setUnsaved(dirty);

  $('undo').disabled = !state.session?.undoStack.length;
  $('redo').disabled = !state.session?.redoStack.length;
}

function triggerAutosave() {
  if (!state.session) return;
  try {
    localStorage.setItem(
      AUTOSAVE_KEY,
      JSON.stringify({
        savedAt: new Date().toISOString(),
        data: state.session.toStoreData(),
      }),
    );
    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    $('autosave-msg').textContent = `Autosaved ${timeStr}`;
  } catch {}
}

// ---- Tool & Mode Switching ----
// A slider's label, changed where it is: drawing the panel again would drop the slider mid-drag.
function relabel(input, text) {
  const label = input.closest('.wb-row, label')?.querySelector('label') ?? input.closest('label');
  if (label?.firstChild) label.firstChild.textContent = text;
}

function setHint(text) {
  $('hint').innerHTML = text;
}

function stopPlacing() {
  state.placingAssetId = null;
  state.placingPrefabId = null;
  if (viewport.tool === 'place') {
    viewport.setTool('select');
  }
  renderAssetsGrid();
}

function startPlacingAsset(assetId) {
  state.placingAssetId = assetId;
  state.placingPrefabId = null;
  viewport.setTool('place');
  const spec = getAssetSpec(assetId);
  setHint(
    `<b>Placing ${escape(spec?.name || assetId)}:</b> Click in the 3D world to place (Hold Shift to place multiple, Esc to cancel).`,
  );
  renderAssetsGrid();
}

function startPlacingPrefab(prefabId) {
  state.placingPrefabId = prefabId;
  state.placingAssetId = null;
  viewport.setTool('place');
  const prefab = state.session?.prefabs.find((p) => p.id === prefabId);
  setHint(
    `<b>Placing Prefab ${escape(prefab?.name || prefabId)}:</b> Click in the 3D world to place.`,
  );
  renderAssetsGrid();
}

function setTransformMode(mode) {
  stopPlacing();
  for (const btn of $('transform-tools').children) {
    btn.classList.toggle('active', btn.dataset.mode === mode);
  }
  if (mode === 'select') {
    viewport.setTool('select');
    viewport.setGizmoMode('translate');
    setHint('<b>Select Mode:</b> Click an object to inspect or drag its transform handles.');
  } else {
    viewport.setTool('select');
    viewport.setGizmoMode(mode);
    setHint(`<b>${mode.toUpperCase()} Mode:</b> Drag the 3D axis handles on the selected object.`);
  }
}

function switchLeftTab(tabId) {
  state.activeTab = tabId;
  for (const btn of $('left-tabs').children) {
    btn.classList.toggle('active', btn.dataset.tab === tabId);
  }
  const tabs = ['assets', 'terrain', 'footprint', 'roads', 'iot', 'project'];
  for (const id of tabs) {
    $(`tab-${id}`).hidden = id !== tabId;
  }

  if (tabId === 'terrain') {
    stopPlacing();
    viewport.brushRadius = state.terrain.radius;
    viewport.setTool('terrain');
    setHint('<b>Terrain Tool:</b> Click and drag across the land to sculpt or paint.');
    renderTerrainTab();
  } else if (tabId === 'footprint') {
    stopPlacing();
    viewport.setTool('footprint');
    setHint(
      '<b>Footprint Tool:</b> Click and drag a rectangle on the ground to generate a custom building.',
    );
    renderFootprintTab();
  } else if (tabId === 'roads') {
    stopPlacing();
    viewport.setTool('road');
    setHint('<b>Road Builder:</b> Click control points on the terrain to draw a connected road.');
    renderRoadsTab();
  } else {
    if (['terrain', 'footprint', 'road'].includes(viewport.tool)) {
      viewport.setTool('select');
    }
    if (tabId === 'assets') renderAssetsTab();
    if (tabId === 'iot') renderIoTTab();
    if (tabId === 'project') renderProjectTab();
  }
}

// ---- Left Panel Renderers ----
function renderAssetsTab() {
  const catsEl = $('asset-categories');
  const allCats = [
    { id: 'all', name: 'All' },
    ...ASSET_CATEGORIES,
    { id: 'prefabs', name: `Prefabs (${state.session?.prefabs.length || 0})` },
    { id: 'imported', name: `Imported (${state.session?.world.importedAssets?.length || 0})` },
  ];
  catsEl.innerHTML = allCats
    .map(
      (c) =>
        `<button data-cat="${c.id}" class="${state.assetCategory === c.id ? 'active' : ''}">${escape(c.name)}</button>`,
    )
    .join('');

  for (const btn of catsEl.querySelectorAll('button')) {
    btn.addEventListener('click', () => {
      state.assetCategory = btn.dataset.cat;
      renderAssetsTab();
    });
  }
  renderAssetsGrid();
}

function renderAssetsGrid() {
  const grid = $('asset-grid');
  if (!state.session) return;
  const q = state.assetSearch.trim().toLowerCase();

  if (state.assetCategory === 'prefabs') {
    const prefabs = state.session.prefabs.filter((p) => !q || p.name.toLowerCase().includes(q));
    if (!prefabs.length) {
      grid.innerHTML = `<div class="muted" style="grid-column: 1 / -1; padding: 8px;">No saved prefabs yet. Select objects in the scene and click "Save as Prefab" in the right inspector.</div>`;
      return;
    }
    grid.innerHTML = prefabs
      .map(
        (p) => `
        <div class="wb-asset-card ${state.placingPrefabId === p.id ? 'active' : ''}" data-prefab="${escape(p.id)}">
          <div class="name">${escape(p.name)}</div>
          <div class="meta">${p.items.length} parts · Reusable Prefab</div>
        </div>`,
      )
      .join('');
    for (const card of grid.querySelectorAll('[data-prefab]')) {
      card.addEventListener('click', () => startPlacingPrefab(card.dataset.prefab));
    }
    return;
  }

  if (state.assetCategory === 'imported') {
    const imported = (state.session.world.importedAssets || []).filter(
      (a) => !q || a.name.toLowerCase().includes(q),
    );
    if (!imported.length) {
      grid.innerHTML = `<div class="muted" style="grid-column: 1 / -1; padding: 8px;">No imported GLB/GLTF models yet. Open the Project tab to import a 3D model.</div>`;
      return;
    }
    grid.innerHTML = imported
      .map(
        (a) => `
        <div class="wb-asset-card ${state.placingAssetId === 'imported/' + a.id ? 'active' : ''}" data-asset="imported/${escape(a.id)}">
          <div class="name">${escape(a.name)}</div>
          <div class="meta">${escape(a.fileName)} · Scale ${a.scale}x</div>
        </div>`,
      )
      .join('');
    for (const card of grid.querySelectorAll('[data-asset]')) {
      card.addEventListener('click', () => startPlacingAsset(card.dataset.asset));
    }
    return;
  }

  const favs = new Set(state.session.favorites || []);
  const items = ASSET_LIBRARY.filter((item) => {
    if (state.assetCategory !== 'all' && item.category !== state.assetCategory) return false;
    if (state.favoritesOnly && !favs.has(item.id)) return false;
    if (q && !`${item.name} ${item.id} ${item.category}`.toLowerCase().includes(q)) return false;
    return true;
  });

  grid.innerHTML = items
    .map((item) => {
      const isFav = favs.has(item.id);
      const isActive = state.placingAssetId === item.id;
      const dims = item.size ? `${item.size[0]}×${item.size[2]}m` : '';
      return `
        <div class="wb-asset-card ${isActive ? 'active' : ''}" data-asset="${escape(item.id)}">
          <button class="fav-btn ${isFav ? 'active' : ''}" data-fav="${escape(item.id)}" title="Toggle favourite">★</button>
          <div class="name">${escape(item.name)}</div>
          <div class="meta">${escape(item.category)} ${dims ? '· ' + dims : ''}</div>
        </div>`;
    })
    .join('');

  for (const favBtn of grid.querySelectorAll('[data-fav]')) {
    favBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      state.session.toggleFavorite(favBtn.dataset.fav);
      renderAssetsGrid();
    });
  }
  for (const card of grid.querySelectorAll('[data-asset]')) {
    card.addEventListener('click', () => startPlacingAsset(card.dataset.asset));
  }
}

function renderTerrainTab() {
  const el = $('tab-terrain');
  if (!state.session) return;
  const t = state.terrain;
  const wTerrain = state.session.world.terrain;

  el.innerHTML = `
    <div class="wb-card">
      <h3>1. World Template & Seed Generator</h3>
      <div class="wb-row">
        <label>Template</label>
        <select class="select" id="ter-template">
          ${TERRAIN_TEMPLATES.map(
            (info) =>
              `<option value="${info.id}" ${t.template === info.id ? 'selected' : ''}>${escape(info.name)}</option>`,
          ).join('')}
        </select>
      </div>
      <div class="wb-row">
        <label>Seed</label>
        <input class="input" id="ter-seed" type="number" value="${t.seed}" style="width: 110px" />
      </div>
      <div class="wb-pill-grid">
        <button class="button" id="ter-preview-btn">Preview Seed</button>
        <button class="button primary" id="ter-apply-btn">Apply Terrain</button>
      </div>
      ${
        t.previewSummary
          ? `<div class="muted" style="font-size:11px">${escape(t.previewSummary)}</div>`
          : ''
      }
    </div>

    <div class="wb-card">
      <h3>2. Terrain Brush Mode</h3>
      <div class="segmented" id="ter-submodes" style="width:100%">
        <button data-sub="sculpt" class="${t.subMode === 'sculpt' ? 'active' : ''}" style="flex:1">Sculpt</button>
        <button data-sub="paint" class="${t.subMode === 'paint' ? 'active' : ''}" style="flex:1">Paint</button>
        <button data-sub="water" class="${t.subMode === 'water' ? 'active' : ''}" style="flex:1">Water</button>
      </div>

      ${
        t.subMode === 'sculpt'
          ? `
        <div class="wb-pill-grid">
          ${BRUSH_MODES.map(
            (b) =>
              `<button class="button ${t.brushMode === b.id ? 'primary' : ''}" data-brush="${b.id}">${escape(b.name)}</button>`,
          ).join('')}
        </div>`
          : ''
      }

      ${
        t.subMode === 'paint'
          ? `
        <div class="wb-pill-grid cols3">
          ${Object.entries(SURFACE_PAINTS)
            .map(
              ([id, p]) =>
                `<button class="button ${t.paintType === id ? 'primary' : ''}" data-paint="${id}">
                  <span style="width:10px;height:10px;border-radius:50%;background:${p.color};display:inline-block"></span>
                  ${escape(p.name)}
                </button>`,
            )
            .join('')}
        </div>`
          : ''
      }

      ${
        t.subMode === 'water'
          ? `
        <div class="wb-row">
          <label>Water Feature</label>
          <select class="select" id="ter-water-kind">
            <option value="pond" ${t.waterKind === 'pond' ? 'selected' : ''}>Pond</option>
            <option value="lake" ${t.waterKind === 'lake' ? 'selected' : ''}>Lake</option>
            <option value="river" ${t.waterKind === 'river' ? 'selected' : ''}>River Channel</option>
          </select>
        </div>
        <div class="wb-row">
          <label>Size (W × D m)</label>
          <div style="display:flex;gap:4px">
            <input class="input" id="ter-water-w" type="number" value="${t.waterWidth}" style="width:65px" />
            <input class="input" id="ter-water-d" type="number" value="${t.waterDepth}" style="width:65px" />
          </div>
        </div>`
          : ''
      }

      <div class="wb-row">
        <label>Brush Size (${t.radius}m)</label>
        <input type="range" id="ter-radius" min="2" max="24" step="1" value="${t.radius}" />
      </div>
      <div class="wb-row">
        <label>Strength (${Math.round(t.strength * 100)}%)</label>
        <input type="range" id="ter-strength" min="0.1" max="1.5" step="0.05" value="${t.strength}" />
      </div>
      <div class="wb-row">
        <label>Falloff (${Math.round(t.falloff * 100)}%)</label>
        <input type="range" id="ter-falloff" min="0.1" max="1" step="0.05" value="${t.falloff}" />
      </div>
    </div>

    <div class="wb-card">
      <h3>3. Global Water Level</h3>
      <div class="wb-row">
        <label>Sea / Water Level (m)</label>
        <input class="input" id="ter-water-level" type="number" step="0.1" value="${wTerrain.waterLevel ?? -2}" style="width:90px" />
      </div>
    </div>

    <div class="wb-card">
      <h3>4. Vegetation & Rock Scatter</h3>
      <div class="wb-row">
        <label>Type</label>
        <select class="select" id="ter-scatter-kind">
          ${SCATTER_TYPES.map(
            (s) =>
              `<option value="${s.id}" ${t.scatterKind === s.id ? 'selected' : ''}>${escape(s.name)}</option>`,
          ).join('')}
        </select>
      </div>
      <div class="wb-row">
        <label>Count (${t.scatterDensity})</label>
        <input type="range" id="ter-scatter-density" min="3" max="40" step="1" value="${t.scatterDensity}" />
      </div>
      <div class="wb-row">
        <label>Scale Range</label>
        <div style="display:flex;gap:4px">
          <input class="input" id="ter-scatter-min" type="number" step="0.1" value="${t.scatterMinScale}" style="width:65px" />
          <input class="input" id="ter-scatter-max" type="number" step="0.1" value="${t.scatterMaxScale}" style="width:65px" />
        </div>
      </div>
      <button class="button primary" id="ter-scatter-btn">Scatter Across Terrain</button>
    </div>
  `;

  $('ter-template').addEventListener('change', (e) => {
    t.template = e.target.value;
  });
  $('ter-seed').addEventListener('change', (e) => {
    t.seed = Number(e.target.value) || 42;
  });
  $('ter-preview-btn').addEventListener('click', () => {
    const preview = createTerrain(t.template, t.seed);
    const tplName = TERRAIN_TEMPLATES.find((item) => item.id === t.template)?.name || t.template;
    const minH = Math.min(...preview.heights).toFixed(1);
    const maxH = Math.max(...preview.heights).toFixed(1);
    t.previewSummary = `Preview (${tplName}, seed ${t.seed}): elevation ${minH}m to ${maxH}m, water at ${preview.waterLevel}m.`;
    renderTerrainTab();
  });
  $('ter-apply-btn').addEventListener('click', () => {
    const tplName = TERRAIN_TEMPLATES.find((item) => item.id === t.template)?.name || t.template;
    state.session.applyTerrainTemplate(t.template, t.seed);
    toast(`Generated ${tplName} terrain (seed ${t.seed}).`);
  });

  for (const btn of el.querySelectorAll('#ter-submodes button')) {
    btn.addEventListener('click', () => {
      t.subMode = btn.dataset.sub;
      renderTerrainTab();
    });
  }
  for (const btn of el.querySelectorAll('[data-brush]')) {
    btn.addEventListener('click', () => {
      t.brushMode = btn.dataset.brush;
      renderTerrainTab();
    });
  }
  for (const btn of el.querySelectorAll('[data-paint]')) {
    btn.addEventListener('click', () => {
      t.paintType = btn.dataset.paint;
      renderTerrainTab();
    });
  }
  $('ter-water-kind')?.addEventListener('change', (e) => {
    t.waterKind = e.target.value;
  });
  $('ter-water-w')?.addEventListener('change', (e) => {
    t.waterWidth = Math.max(4, Number(e.target.value) || 14);
  });
  $('ter-water-d')?.addEventListener('change', (e) => {
    t.waterDepth = Math.max(4, Number(e.target.value) || 12);
  });
  $('ter-radius').addEventListener('input', (e) => {
    t.radius = Number(e.target.value) || 6;
    viewport.brushRadius = t.radius;
    relabel(e.target, `Brush Size (${t.radius}m)`);
  });
  $('ter-strength').addEventListener('input', (e) => {
    t.strength = Number(e.target.value) || 0.45;
    relabel(e.target, `Strength (${Math.round(t.strength * 100)}%)`);
  });
  $('ter-falloff').addEventListener('input', (e) => {
    t.falloff = Number(e.target.value) || 0.5;
    relabel(e.target, `Falloff (${Math.round(t.falloff * 100)}%)`);
  });
  $('ter-water-level').addEventListener('change', (e) => {
    state.session.setWaterLevel(Number(e.target.value));
  });
  $('ter-scatter-kind').addEventListener('change', (e) => {
    t.scatterKind = e.target.value;
  });
  $('ter-scatter-density').addEventListener('input', (e) => {
    t.scatterDensity = Number(e.target.value) || 12;
    relabel(e.target, `Count (${t.scatterDensity})`);
  });
  $('ter-scatter-min').addEventListener('change', (e) => {
    t.scatterMinScale = Number(e.target.value) || 0.8;
  });
  $('ter-scatter-max').addEventListener('change', (e) => {
    t.scatterMaxScale = Number(e.target.value) || 1.25;
  });
  $('ter-scatter-btn').addEventListener('click', () => {
    const ids = state.session.scatterVegetation({
      kind: t.scatterKind,
      density: t.scatterDensity,
      minScale: t.scatterMinScale,
      maxScale: t.scatterMaxScale,
      seed: t.seed + state.session.world.objects.length,
    });
    toast(`Scattered ${ids.length} items across the terrain.`);
  });
}

function renderFootprintTab() {
  const el = $('tab-footprint');
  const fp = state.footprint;
  el.innerHTML = `
    <div class="wb-card">
      <h3>Draw or Generate Building Footprint</h3>
      <p class="muted" style="font-size:12px">
        Drag a rectangle directly on the 3D ground, or enter exact dimensions below to construct a multi-storey building with floors, walls, doors, windows, and roof.
      </p>
      <div class="wb-row">
        <label>Width (${state.session?.world.units || 'm'})</label>
        <input class="input" id="fp-width" type="number" step="0.5" min="3" max="40" value="${fp.width}" style="width:90px" />
      </div>
      <div class="wb-row">
        <label>Depth (${state.session?.world.units || 'm'})</label>
        <input class="input" id="fp-depth" type="number" step="0.5" min="3" max="40" value="${fp.depth}" style="width:90px" />
      </div>
      <div class="wb-row">
        <label>Storeys</label>
        <input class="input" id="fp-stories" type="number" min="1" max="6" value="${fp.stories}" style="width:90px" />
      </div>
      <div class="wb-row">
        <label>Floor Height (m)</label>
        <input class="input" id="fp-story-h" type="number" step="0.2" min="2.2" max="5" value="${fp.storyHeight}" style="width:90px" />
      </div>
      <div class="wb-row">
        <label>Architectural Style</label>
        <select class="select" id="fp-style">
          ${Object.entries(ARCH_STYLES)
            .map(
              ([id, st]) =>
                `<option value="${id}" ${fp.style === id ? 'selected' : ''}>${escape(st.name)}</option>`,
            )
            .join('')}
        </select>
      </div>
      <div class="wb-row">
        <label>Roof Style</label>
        <select class="select" id="fp-roof">
          <option value="pitched" ${fp.roofStyle === 'pitched' ? 'selected' : ''}>Pitched Roof</option>
          <option value="flat" ${fp.roofStyle === 'flat' ? 'selected' : ''}>Flat Roof</option>
          <option value="none" ${fp.roofStyle === 'none' ? 'selected' : ''}>Open / No Roof</option>
        </select>
      </div>
      <label class="wb-check">
        <input type="checkbox" id="fp-flatten" ${fp.flatten ? 'checked' : ''} />
        <span>Flatten terrain under footprint</span>
      </label>
      <button class="button primary" id="fp-create-btn">Construct Building at Centre</button>
    </div>
  `;

  $('fp-width').addEventListener('change', (e) => (fp.width = Number(e.target.value) || 10));
  $('fp-depth').addEventListener('change', (e) => (fp.depth = Number(e.target.value) || 8));
  $('fp-stories').addEventListener('change', (e) => (fp.stories = Number(e.target.value) || 1));
  $('fp-story-h').addEventListener(
    'change',
    (e) => (fp.storyHeight = Number(e.target.value) || 2.8),
  );
  $('fp-style').addEventListener('change', (e) => (fp.style = e.target.value));
  $('fp-roof').addEventListener('change', (e) => (fp.roofStyle = e.target.value));
  $('fp-flatten').addEventListener('change', (e) => (fp.flatten = e.target.checked));
  $('fp-create-btn').addEventListener('click', () => {
    const hw = fp.width / 2;
    const hd = fp.depth / 2;
    state.session.constructFootprintBuilding({
      x1: -hw,
      z1: -hd,
      x2: hw,
      z2: hd,
      stories: fp.stories,
      storyHeight: fp.storyHeight,
      style: fp.style,
      roofStyle: fp.roofStyle,
      flatten: fp.flatten,
    });
    toast('Constructed custom footprint building.');
  });
}

function renderRoadsTab() {
  const el = $('tab-roads');
  if (!state.session) return;
  const rd = state.roadDraft;
  const draftPts = viewport.roadDraftPoints || [];
  const roads = state.session.world.roads || [];

  el.innerHTML = `
    <div class="wb-card">
      <h3>Draw Road / Path Network</h3>
      <p class="muted" style="font-size:12px">
        Click control points in the 3D viewport to lay out roads, footpaths, driveways, or bridges. Endpoints within 3m automatically snap to form intersections.
      </p>
      <div class="wb-row">
        <label>Type</label>
        <select class="select" id="rd-kind">
          <option value="road" ${rd.kind === 'road' ? 'selected' : ''}>Two-Lane Road</option>
          <option value="footpath" ${rd.kind === 'footpath' ? 'selected' : ''}>Pedestrian Footpath</option>
          <option value="driveway" ${rd.kind === 'driveway' ? 'selected' : ''}>Driveway</option>
          <option value="bridge" ${rd.kind === 'bridge' ? 'selected' : ''}>Bridge Deck</option>
        </select>
      </div>
      <div class="wb-row">
        <label>Width (m)</label>
        <input class="input" id="rd-width" type="number" min="1.5" max="18" step="0.5" value="${rd.width}" style="width:90px" />
      </div>
      <div class="wb-row">
        <label>Curvature</label>
        <input class="input" id="rd-curve" type="number" min="-1.5" max="1.5" step="0.1" value="${rd.curvature}" style="width:90px" />
      </div>
      <label class="wb-check">
        <input type="checkbox" id="rd-crossing" ${rd.crossing ? 'checked' : ''} />
        <span>Include zebra pedestrian crossing</span>
      </label>
      <div class="wb-pill-grid">
        <button class="button primary" id="rd-finish-btn" ${draftPts.length < 2 ? 'disabled' : ''}>
          Finish Road (${draftPts.length} pts)
        </button>
        <button class="button" id="rd-quick-btn">Add Straight Road</button>
      </div>
    </div>

    <div class="wb-card">
      <h3>Existing Roads (${roads.length})</h3>
      ${
        roads.length
          ? roads
              .map(
                (r) => `
          <div class="wb-row" style="padding:4px 0;border-bottom:1px solid var(--line)">
            <span><b>${escape(r.name)}</b> (${escape(r.kind)}, ${r.width}m)</span>
            <button class="button danger" data-del-road="${escape(r.id)}" style="height:24px;padding:0 8px">Delete</button>
          </div>`,
              )
              .join('')
          : `<div class="muted">No roads placed yet.</div>`
      }
    </div>
  `;

  $('rd-kind').addEventListener('change', (e) => {
    rd.kind = e.target.value;
    rd.width = rd.kind === 'footpath' ? 2.2 : rd.kind === 'driveway' ? 4.2 : 8;
    renderRoadsTab();
  });
  $('rd-width').addEventListener('change', (e) => (rd.width = Number(e.target.value) || 8));
  $('rd-curve').addEventListener('change', (e) => (rd.curvature = Number(e.target.value) || 0));
  $('rd-crossing').addEventListener('change', (e) => (rd.crossing = e.target.checked));
  $('rd-finish-btn').addEventListener('click', () => {
    if (draftPts.length < 2) return;
    state.session.addRoad({
      name: `${rd.kind[0].toUpperCase() + rd.kind.slice(1)} ${roads.length + 1}`,
      kind: rd.kind,
      width: rd.width,
      curvature: rd.curvature,
      crossing: rd.crossing,
      points: draftPts,
    });
    viewport.roadDraftPoints = [];
    viewport.updateRoadPreview();
    renderRoadsTab();
    toast('Created connected road segment.');
  });
  $('rd-quick-btn').addEventListener('click', () => {
    state.session.addRoad({
      name: `${rd.kind[0].toUpperCase() + rd.kind.slice(1)} ${roads.length + 1}`,
      kind: rd.kind,
      width: rd.width,
      curvature: rd.curvature,
      crossing: rd.crossing,
      points: [
        { x: -16, z: 10 },
        { x: 16, z: 10 },
      ],
    });
    renderRoadsTab();
    toast('Added road segment.');
  });

  for (const btn of el.querySelectorAll('[data-del-road]')) {
    btn.addEventListener('click', () => {
      state.session.removeRoad(btn.dataset.delRoad);
      renderRoadsTab();
    });
  }
}

function renderIoTTab() {
  const el = $('tab-iot');
  if (!state.session) return;
  const iot = state.session.world.iot;
  const devices = state.session.iotDevices();
  const lang = iot.language || 'cpp';

  el.innerHTML = `
    <div class="wb-card">
      <h3>Controller & Programming Workflow</h3>
      <div class="wb-row">
        <label>Board</label>
        <select class="select" id="iot-board">
          <option value="ESP32" ${iot.board === 'ESP32' ? 'selected' : ''}>ESP32 DevKit</option>
          <option value="Raspberry Pi Pico" ${iot.board === 'Raspberry Pi Pico' ? 'selected' : ''}>Raspberry Pi Pico</option>
        </select>
      </div>
      <div class="wb-row">
        <label>Language</label>
        <div class="segmented" id="iot-lang">
          <button data-lang="cpp" class="${lang === 'cpp' ? 'active' : ''}">Arduino C++</button>
          <button data-lang="python" class="${lang === 'python' ? 'active' : ''}">MicroPython</button>
        </div>
      </div>
      <button class="button" id="iot-gen-code">Generate Starter Code from Placed Devices</button>
    </div>

    <div class="wb-card">
      <h3>Connected World Devices (${devices.length})</h3>
      ${
        devices.length
          ? devices
              .map(
                (d) => `
          <div class="wb-row" style="font-size:11px;border-bottom:1px solid var(--line);padding:3px 0">
            <span><b>${escape(d.name)}</b> <span class="muted">(${escape(d.objectId)})</span></span>
            <span class="wb-sim-badge">GPIO ${d.pin} · ${d.output ? 'OUT' : d.signal || 'IN'}</span>
          </div>`,
              )
              .join('')
          : `<div class="muted" style="font-size:11px">No IoT devices placed yet. Open the Assets tab → IoT Devices to place sensors & actuators.</div>`
      }
    </div>

    <div class="wb-card">
      <h3>Mission Program (${lang === 'cpp' ? 'sketch.ino' : 'main.py'})</h3>
      <textarea class="wb-code-editor" id="iot-code-textarea" spellcheck="false">${escape(iot.code[lang] || '')}</textarea>
      <button class="button primary" id="iot-run-play">Run Code in Play Mode</button>
    </div>
  `;

  $('iot-board').addEventListener('change', (e) => {
    state.session.setControllerBoard(e.target.value);
    renderIoTTab();
  });
  for (const btn of el.querySelectorAll('#iot-lang button')) {
    btn.addEventListener('click', () => {
      state.session.setProgrammingLanguage(btn.dataset.lang);
      renderIoTTab();
    });
  }
  $('iot-gen-code').addEventListener('click', () => {
    const generated = state.session.generateStarterCode(lang);
    state.session.setCode(generated, lang);
    renderIoTTab();
    toast('Generated working starter program for placed devices.');
  });
  $('iot-code-textarea').addEventListener('input', (e) => {
    state.session.setCode(e.target.value, lang, { quiet: true });
    updateSaveIndicator();
    clearTimeout(state.codeAutosave);
    state.codeAutosave = setTimeout(triggerAutosave, 1000);
  });
  $('iot-run-play').addEventListener('click', () => {
    togglePlayMode(true);
  });
}

function renderProjectTab() {
  const el = $('tab-project');
  if (!state.session) return;
  const w = state.session.world;
  const warnings = state.session.missingAssetsReport();

  el.innerHTML = `
    <div class="wb-card">
      <h3>World Project Settings</h3>
      <div class="wb-row">
        <label>World Name</label>
        <input class="input" id="proj-name" type="text" value="${escape(w.name)}" />
      </div>
      <div class="wb-row">
        <label>Measurement Units</label>
        <select class="select" id="proj-units">
          <option value="m" ${w.units === 'm' ? 'selected' : ''}>Metres (m)</option>
          <option value="cm" ${w.units === 'cm' ? 'selected' : ''}>Centimetres (cm)</option>
          <option value="ft" ${w.units === 'ft' ? 'selected' : ''}>Feet (ft)</option>
        </select>
      </div>
      <div class="wb-row">
        <label>Graphics Quality</label>
        <select class="select" id="proj-quality">
          <option value="high" ${state.session.graphicsQuality === 'high' ? 'selected' : ''}>High (Shadows + Full DPR)</option>
          <option value="medium" ${state.session.graphicsQuality === 'medium' ? 'selected' : ''}>Medium</option>
          <option value="low" ${state.session.graphicsQuality === 'low' ? 'selected' : ''}>Low (Classroom Laptops)</option>
        </select>
      </div>
      <div class="wb-row">
        <label>Spawn (${w.spawn.map((v) => v.toFixed(1)).join(', ')})</label>
        <button class="button" id="proj-spawn-tool">Pick Spawn in 3D</button>
      </div>
      <div class="wb-pill-grid">
        <button class="button" id="proj-dup-btn">Duplicate World</button>
        <button class="button danger" id="proj-del-btn" ${state.session.worlds.length <= 1 ? 'disabled' : ''}>Delete World</button>
      </div>
    </div>

    <div class="wb-card">
      <h3>Import GLB / GLTF 3D Model</h3>
      <p class="muted" style="font-size:11px">
        Imported models are packaged inline as base64 data URLs inside exported project files so projects reopen cleanly on any machine.
      </p>
      <div class="wb-row">
        <label>Default Scale</label>
        <input class="input" id="glb-scale" type="number" step="0.1" value="1" style="width:80px" />
      </div>
      <div class="wb-row">
        <label>Orientation Y (°)</label>
        <input class="input" id="glb-rot-y" type="number" step="15" value="0" style="width:80px" />
      </div>
      <button class="button" id="glb-import-btn">Choose .glb / .gltf File…</button>
    </div>

    <div class="wb-card">
      <h3>Versioned Project Export & Import</h3>
      <div class="wb-pill-grid">
        <button class="button primary" id="proj-export-btn">Export .iotworld.json</button>
        <button class="button" id="proj-import-btn">Import Project JSON</button>
      </div>
      ${
        state.recoveredAutosave
          ? `<button class="button" id="proj-recover-btn" style="margin-top:6px">Recover Autosave (${escape(state.recoveredAutosave.savedAt)})</button>`
          : ''
      }
    </div>

    ${
      warnings.length
        ? `
      <div class="wb-card" style="border-color: var(--warn)">
        <h3 style="color: var(--warn)">Missing Asset Warnings (${warnings.length})</h3>
        ${warnings
          .map(
            (warn) => `
          <div style="font-size:11px;margin-bottom:6px">
            <div>${escape(warn.message)}</div>
            <div class="wb-pill-grid" style="margin-top:4px">
              <button class="button" data-recover-replace="${escape(warn.objectId)}">Replace Placeholder</button>
              <button class="button danger" data-recover-remove="${escape(warn.objectId)}">Remove Object</button>
            </div>
          </div>`,
          )
          .join('')}
      </div>`
        : ''
    }
  `;

  $('proj-name').addEventListener('change', (e) => {
    state.session.renameWorld(e.target.value);
  });
  $('proj-units').addEventListener('change', (e) => {
    state.session.commit('Change measurement units', (world) => {
      world.units = e.target.value;
    });
  });
  $('proj-quality').addEventListener('change', (e) => {
    state.session.graphicsQuality = e.target.value;
    toast(`Graphics quality set to ${e.target.value}.`);
  });
  $('proj-spawn-tool').addEventListener('click', () => {
    viewport.setTool('spawn');
    setHint(
      '<b>Player Spawn Tool:</b> Click anywhere on the terrain to set the player spawn point.',
    );
  });
  $('proj-dup-btn').addEventListener('click', () => {
    const copy = state.session.duplicateWorld();
    toast(`Duplicated world "${copy.name}".`);
  });
  $('proj-del-btn').addEventListener('click', () => {
    if (confirm(`Delete world "${w.name}"?`)) {
      state.session.deleteWorld(w.id);
      toast('Deleted world.');
    }
  });

  $('glb-import-btn').addEventListener('click', () => $('glb-file-input').click());
  $('proj-export-btn').addEventListener('click', exportProjectFile);
  $('proj-import-btn').addEventListener('click', () => $('project-file-input').click());
  $('proj-recover-btn')?.addEventListener('click', () => {
    if (!state.recoveredAutosave?.data) return;
    state.session = new WorldBuilderSession(state.recoveredAutosave.data);
    state.recoveredAutosave = null;
    state.session.on(() => {
      viewport.refresh();
      triggerAutosave();
      renderAll();
    });
    viewport.setSession(state.session);
    renderAll();
    toast('Recovered autosaved World Builder session.');
  });

  for (const btn of el.querySelectorAll('[data-recover-replace]')) {
    btn.addEventListener('click', () => {
      state.session.recoverMissingAsset(btn.dataset.recoverReplace, 'replace');
      renderProjectTab();
      toast('Replaced missing asset with placeholder container.');
    });
  }
  for (const btn of el.querySelectorAll('[data-recover-remove]')) {
    btn.addEventListener('click', () => {
      state.session.recoverMissingAsset(btn.dataset.recoverRemove, 'remove');
      renderProjectTab();
      toast('Removed missing asset object.');
    });
  }
}

// ---- Right Panel: Object & Environment Inspector ----
function unitFactor() {
  const u = state.session?.world.units || 'm';
  return u === 'cm' ? 100 : u === 'ft' ? 3.28084 : 1;
}

function renderInspector() {
  const el = $('inspector');
  if (!state.session) return;
  const selectedIds = [...state.session.selectedIds];

  // If no object is selected, show Environment & World Inspector
  if (!selectedIds.length) {
    const env =
      (state.session.mode === 'play' && state.session.simEnvironment) ||
      state.session.world.environment;
    el.innerHTML = `
      <section>
        <h2>${escape(state.session.world.name)}</h2>
        <p class="muted">World Environment & Atmosphere</p>
      </section>
      <section class="wb-card" style="margin:12px">
        <h3>Weather & Time of Day</h3>
        <div class="wb-row">
          <label>Time of Day (${Number(env.timeOfDay).toFixed(1)}h)</label>
          <input type="range" id="env-tod" min="0" max="24" step="0.5" value="${env.timeOfDay}" />
        </div>
        <div class="wb-row">
          <label>Sunlight (${env.sunlight}%)</label>
          <input type="range" id="env-sun" min="0" max="100" step="1" value="${env.sunlight}" />
        </div>
        <div class="wb-row">
          <label>Temperature (${env.temperature}°C)</label>
          <input type="range" id="env-temp" min="-5" max="45" step="1" value="${env.temperature}" />
        </div>
        <div class="wb-row">
          <label>Soil Moisture (${env.soilMoisture}%)</label>
          <input type="range" id="env-soil" min="0" max="100" step="1" value="${env.soilMoisture}" />
        </div>
        <div class="wb-row">
          <label>Rain (${env.rain}%)</label>
          <input type="range" id="env-rain" min="0" max="100" step="5" value="${env.rain}" />
        </div>
        <div class="wb-row">
          <label>Fog (${env.fog}%)</label>
          <input type="range" id="env-fog" min="0" max="100" step="5" value="${env.fog}" />
        </div>
        <div class="wb-row">
          <label>Wind (${env.wind} km/h)</label>
          <input type="range" id="env-wind" min="0" max="80" step="2" value="${env.wind}" />
        </div>
      </section>
      <section>
        <h3>Keyboard Shortcuts</h3>
        <dl class="shortcuts">
          <dt><kbd>V</kbd></dt><dd>Select tool</dd>
          <dt><kbd>G</kbd> <kbd>R</kbd> <kbd>S</kbd></dt><dd>Move, Rotate, Scale</dd>
          <dt><kbd>F</kbd></dt><dd>Focus camera on selection</dd>
          <dt><kbd>WASD</kbd></dt><dd>Move camera</dd>
          <dt><kbd>⌘D</kbd></dt><dd>Duplicate selected</dd>
          <dt><kbd>⌘G</kbd></dt><dd>Group selected</dd>
          <dt><kbd>⌫</kbd></dt><dd>Delete selected</dd>
          <dt><kbd>⌘Z</kbd> / <kbd>⇧⌘Z</kbd></dt><dd>Undo / Redo</dd>
        </dl>
      </section>
    `;
    const bindEnv = (id, key) => {
      $(id)?.addEventListener('input', (e) => {
        state.session.setEnvironment({ [key]: Number(e.target.value) }, { quiet: true });
        const label = e.target.closest('.wb-row').querySelector('label');
        label.textContent = label.textContent.replace(/\([-\d.]+/, `(${e.target.value}`);
      });
      $(id)?.addEventListener('change', (e) => {
        state.session.setEnvironment({ [key]: Number(e.target.value) });
      });
    };
    bindEnv('env-tod', 'timeOfDay');
    bindEnv('env-sun', 'sunlight');
    bindEnv('env-temp', 'temperature');
    bindEnv('env-soil', 'soilMoisture');
    bindEnv('env-rain', 'rain');
    bindEnv('env-fog', 'fog');
    bindEnv('env-wind', 'wind');
    return;
  }

  const obj = state.session.getObject(selectedIds[0]);
  if (!obj) return;
  const spec = getAssetSpec(obj.kind);
  const uFactor = unitFactor();
  const uLabel = state.session.world.units || 'm';
  const baseSize = spec?.size || [obj.props?.width || 2, 2, obj.props?.depth || 2];
  const scaleArr = Array.isArray(obj.scale)
    ? obj.scale
    : [obj.scale || 1, obj.scale || 1, obj.scale || 1];
  const dims = baseSize.map((b, i) => (b * scaleArr[i] * uFactor).toFixed(2));

  const isBuilding =
    obj.kind.startsWith('building/') ||
    obj.kind.startsWith('modular/') ||
    obj.kind === 'building/footprint';
  const hasDoor =
    obj.kind === 'modular/door' ||
    obj.kind === 'modular/gate' ||
    obj.kind === 'modular/wall-door' ||
    obj.kind.startsWith('building/');
  const isIoT = obj.kind.startsWith('iot/') && !obj.kind.startsWith('iot/board-');

  el.innerHTML = `
    <section>
      <div class="wb-row">
        <h2>${selectedIds.length > 1 ? `${selectedIds.length} Objects Selected` : escape(obj.name)}</h2>
        <span class="id">${escape(obj.id)}</span>
      </div>
      <div class="wb-row" style="margin-top:8px">
        <label>Name</label>
        <input class="input" id="ins-name" type="text" value="${escape(obj.name)}" />
      </div>
      <div class="wb-row" style="margin-top:6px">
        <label>Layer</label>
        <select class="select" id="ins-layer">
          ${state.session.world.layers
            .map(
              (l) =>
                `<option value="${escape(l.id)}" ${obj.layer === l.id ? 'selected' : ''}>${escape(l.name)}</option>`,
            )
            .join('')}
        </select>
      </div>
      <div class="wb-pill-grid" style="margin-top:8px">
        <button class="button" id="ins-lock">${obj.locked ? 'Unlock' : 'Lock'}</button>
        <button class="button" id="ins-hide">${obj.hidden ? 'Show' : 'Hide'}</button>
      </div>
    </section>

    <section>
      <h3>Transform & Exact Dimensions (${uLabel})</h3>
      <label class="muted" style="font-size:11px">Position (X, Y, Z)</label>
      <div class="grid3">
        <div class="axis x"><b>X</b><input class="input" id="ins-px" type="number" step="0.25" value="${obj.pos[0]}" /></div>
        <div class="axis y"><b>Y</b><input class="input" id="ins-py" type="number" step="0.25" value="${obj.pos[1]}" /></div>
        <div class="axis z"><b>Z</b><input class="input" id="ins-pz" type="number" step="0.25" value="${obj.pos[2]}" /></div>
      </div>

      <div class="wb-row" style="margin-top:8px">
        <label>Rotation Y (°)</label>
        <input class="input" id="ins-turn" type="number" step="15" value="${Math.round((obj.turn || 0) * DEGREES)}" style="width:90px" />
      </div>

      <label class="muted" style="font-size:11px;margin-top:8px;display:block">Dimensions (W × H × D in ${uLabel})</label>
      <div class="grid3">
        <div class="axis size"><b>W</b><input class="input" id="ins-dw" type="number" step="0.25" min="0.1" value="${dims[0]}" /></div>
        <div class="axis size"><b>H</b><input class="input" id="ins-dh" type="number" step="0.25" min="0.1" value="${dims[1]}" /></div>
        <div class="axis size"><b>D</b><input class="input" id="ins-dd" type="number" step="0.25" min="0.1" value="${dims[2]}" /></div>
      </div>
    </section>

    ${
      isBuilding
        ? `
      <section>
        <h3>Architecture, Storeys & Materials</h3>
        <div class="wb-row">
          <label>Style</label>
          <select class="select" id="ins-style">
            ${Object.entries(ARCH_STYLES)
              .map(
                ([id, st]) =>
                  `<option value="${id}" ${(obj.props?.style || 'contemporary') === id ? 'selected' : ''}>${escape(st.name)}</option>`,
              )
              .join('')}
          </select>
        </div>
        <div class="wb-row" style="margin-top:6px">
          <label>Material</label>
          <select class="select" id="ins-material">
            <option value="">Style Default</option>
            ${Object.entries(MATERIAL_PRESETS)
              .map(
                ([id, m]) =>
                  `<option value="${id}" ${obj.props?.material === id ? 'selected' : ''}>${escape(m.name)}</option>`,
              )
              .join('')}
          </select>
        </div>
        <div class="wb-row" style="margin-top:6px">
          <label>Wall / Part Colour</label>
          <input type="color" id="ins-color" value="${escape(obj.props?.color || '#e8dfd1')}" />
        </div>
        <div class="wb-row" style="margin-top:6px">
          <label>Storeys</label>
          <input class="input" id="ins-stories" type="number" min="1" max="8" value="${obj.props?.stories || 1}" style="width:80px" />
        </div>
        <div class="wb-row" style="margin-top:6px">
          <label>Floor Height (m)</label>
          <input class="input" id="ins-story-h" type="number" step="0.2" min="2.2" max="5" value="${obj.props?.storyHeight || 2.8}" style="width:80px" />
        </div>
        <div class="wb-row" style="margin-top:6px">
          <label>Roof Style</label>
          <select class="select" id="ins-roof">
            <option value="pitched" ${obj.props?.roofStyle === 'pitched' ? 'selected' : ''}>Pitched</option>
            <option value="flat" ${obj.props?.roofStyle === 'flat' ? 'selected' : ''}>Flat</option>
            <option value="none" ${obj.props?.roofStyle === 'none' ? 'selected' : ''}>None</option>
          </select>
        </div>
      </section>`
        : ''
    }

    ${
      hasDoor
        ? `
      <section>
        <h3>Door / Gate State & Interaction</h3>
        <div class="wb-row">
          <label>State</label>
          <button class="button ${obj.props?.doorOpen ? 'primary' : ''}" id="ins-door-open">
            ${obj.props?.doorOpen ? 'Open (Click to Close)' : 'Closed (Click to Open)'}
          </button>
        </div>
        <div class="wb-row" style="margin-top:6px">
          <label>Hinge Side</label>
          <select class="select" id="ins-hinge">
            <option value="left" ${(obj.props?.hinge || 'left') === 'left' ? 'selected' : ''}>Left Hinge</option>
            <option value="right" ${obj.props?.hinge === 'right' ? 'selected' : ''}>Right Hinge</option>
          </select>
        </div>
        <div class="wb-row" style="margin-top:6px">
          <label>Behaviour</label>
          <select class="select" id="ins-behavior">
            <option value="manual" ${(obj.props?.behavior || 'manual') === 'manual' ? 'selected' : ''}>Manual Click</option>
            <option value="servo" ${obj.props?.behavior === 'servo' ? 'selected' : ''}>Connected to Servo / Gate Output</option>
          </select>
        </div>
      </section>`
        : ''
    }

    ${
      isIoT
        ? `
      <section>
        <h3>IoT Device Connection</h3>
        <div class="wb-row">
          <label>Controller</label>
          <span class="wb-sim-badge">${escape(state.session.world.iot.board)}</span>
        </div>
        <div class="wb-row" style="margin-top:6px">
          <label>GPIO Pin</label>
          <input class="input" id="ins-pin" type="number" value="${obj.props?.pin ?? 26}" style="width:85px" />
        </div>
        <label class="wb-check" style="margin-top:6px">
          <input type="checkbox" id="ins-power" ${obj.props?.power !== false ? 'checked' : ''} />
          <span>3V3 / 5V Power Connected</span>
        </label>
        <label class="wb-check" style="margin-top:4px">
          <input type="checkbox" id="ins-ground" ${obj.props?.ground !== false ? 'checked' : ''} />
          <span>GND Connected</span>
        </label>
      </section>`
        : ''
    }

    <section>
      <h3>Object & Prefab Actions</h3>
      <div class="wb-pill-grid">
        <button class="button" id="ins-prefab">Save as Prefab</button>
        <button class="button" id="ins-flatten">Flatten Ground</button>
        <button class="button" id="ins-dup">Duplicate</button>
        <button class="button danger" id="ins-del">Delete</button>
      </div>
    </section>
  `;

  $('ins-name').addEventListener('change', (e) => {
    state.session.updateObject(obj.id, { name: e.target.value }, 'Rename object');
  });
  $('ins-layer').addEventListener('change', (e) => {
    state.session.updateObject(obj.id, { layer: e.target.value }, 'Change layer');
  });
  $('ins-lock').addEventListener('click', () => {
    state.session.commit('Toggle lock', (w) => {
      const target = w.objects.find((o) => o.id === obj.id);
      if (target) target.locked = !target.locked;
    });
  });
  $('ins-hide').addEventListener('click', () => {
    state.session.updateObject(obj.id, { hidden: !obj.hidden }, 'Toggle visibility');
  });

  const updatePos = () => {
    state.session.updateObject(
      obj.id,
      {
        pos: [
          Number($('ins-px').value) || 0,
          Number($('ins-py').value) || 0,
          Number($('ins-pz').value) || 0,
        ],
      },
      'Move object',
    );
  };
  $('ins-px').addEventListener('change', updatePos);
  $('ins-py').addEventListener('change', updatePos);
  $('ins-pz').addEventListener('change', updatePos);

  $('ins-turn').addEventListener('change', (e) => {
    state.session.updateObject(
      obj.id,
      { turn: (Number(e.target.value) || 0) / DEGREES },
      'Rotate object',
    );
  });

  const updateDims = () => {
    const nw = Math.max(0.1, (Number($('ins-dw').value) || 1) / uFactor);
    const nh = Math.max(0.1, (Number($('ins-dh').value) || 1) / uFactor);
    const nd = Math.max(0.1, (Number($('ins-dd').value) || 1) / uFactor);
    state.session.updateObject(
      obj.id,
      {
        scale: [nw / baseSize[0], nh / baseSize[1], nd / baseSize[2]],
      },
      'Resize object',
    );
  };
  $('ins-dw').addEventListener('change', updateDims);
  $('ins-dh').addEventListener('change', updateDims);
  $('ins-dd').addEventListener('change', updateDims);

  $('ins-style')?.addEventListener('change', (e) => {
    state.session.updateObject(
      obj.id,
      { props: { style: e.target.value } },
      'Change building style',
    );
  });
  $('ins-material')?.addEventListener('change', (e) => {
    const mat = MATERIAL_PRESETS[e.target.value];
    state.session.updateObject(
      obj.id,
      { props: { material: e.target.value, color: mat ? mat.color : obj.props?.color } },
      'Change material',
    );
  });
  $('ins-color')?.addEventListener('change', (e) => {
    state.session.updateObject(obj.id, { props: { color: e.target.value } }, 'Change colour');
  });
  $('ins-stories')?.addEventListener('change', (e) => {
    state.session.updateObject(
      obj.id,
      { props: { stories: Math.max(1, Number(e.target.value) || 1) } },
      'Change storeys',
    );
  });
  $('ins-story-h')?.addEventListener('change', (e) => {
    state.session.updateObject(
      obj.id,
      { props: { storyHeight: Math.max(2, Number(e.target.value) || 2.8) } },
      'Change floor height',
    );
  });
  $('ins-roof')?.addEventListener('change', (e) => {
    state.session.updateObject(
      obj.id,
      { props: { roofStyle: e.target.value } },
      'Change roof style',
    );
  });

  $('ins-door-open')?.addEventListener('click', () => {
    state.session.updateObject(
      obj.id,
      { props: { doorOpen: !obj.props?.doorOpen } },
      'Toggle door',
    );
  });
  $('ins-hinge')?.addEventListener('change', (e) => {
    state.session.updateObject(obj.id, { props: { hinge: e.target.value } }, 'Change door hinge');
  });
  $('ins-behavior')?.addEventListener('change', (e) => {
    state.session.updateObject(
      obj.id,
      { props: { behavior: e.target.value } },
      'Change door behaviour',
    );
  });

  $('ins-pin')?.addEventListener('change', (e) => {
    state.session.updateObject(
      obj.id,
      { props: { pin: Number(e.target.value) } },
      'Change GPIO pin',
    );
  });
  $('ins-power')?.addEventListener('change', (e) => {
    state.session.updateObject(obj.id, { props: { power: e.target.checked } }, 'Toggle power wire');
  });
  $('ins-ground')?.addEventListener('change', (e) => {
    state.session.updateObject(
      obj.id,
      { props: { ground: e.target.checked } },
      'Toggle ground wire',
    );
  });

  $('ins-prefab').addEventListener('click', () => {
    const prefab = state.session.saveSelectedAsPrefab(`${obj.name} Prefab`);
    if (prefab) toast(`Saved "${prefab.name}" to Reusable Prefabs.`);
  });
  $('ins-flatten').addEventListener('click', () => {
    state.session.flattenArea({
      x: obj.pos[0],
      z: obj.pos[2],
      width: (baseSize[0] || 8) + 2,
      depth: (baseSize[2] || 8) + 2,
    });
    toast('Flattened terrain under object.');
  });
  $('ins-dup').addEventListener('click', () => state.session.duplicateSelected());
  $('ins-del').addEventListener('click', () => state.session.removeSelected());
}

// ---- Bottom Panel: Scene Hierarchy, Layers & Status Bar ----
function renderHierarchyAndLayers() {
  if (!state.session) return;
  const w = state.session.world;
  const q = state.hierarchySearch.trim().toLowerCase();
  const listEl = $('hierarchy-list');

  const filtered = (w.objects || []).filter(
    (o) => !q || `${o.name} ${o.id} ${o.kind}`.toLowerCase().includes(q),
  );

  if (!filtered.length) {
    listEl.innerHTML = `<div class="muted" style="padding:8px">No objects in scene${q ? ' matching filter' : ''}.</div>`;
  } else {
    listEl.innerHTML = filtered
      .map((o) => {
        const isSel = state.session.selectedIds.has(o.id);
        return `
          <div class="wb-tree-row ${isSel ? 'selected' : ''}" data-row-id="${escape(o.id)}">
            <span class="name">${escape(o.name)} ${o.groupId ? '🔗' : ''}</span>
            <span class="kind">${escape(o.id)}</span>
            <button class="mini-btn" data-toggle-hide="${escape(o.id)}" title="${o.hidden ? 'Show' : 'Hide'}">${o.hidden ? '👁‍🗨' : '👁'}</button>
            <button class="mini-btn" data-toggle-lock="${escape(o.id)}" title="${o.locked ? 'Unlock' : 'Lock'}">${o.locked ? '🔒' : '🔓'}</button>
          </div>`;
      })
      .join('');

    for (const row of listEl.querySelectorAll('[data-row-id]')) {
      row.addEventListener('click', (e) => {
        if (e.target.closest('button')) return;
        state.session.select(row.dataset.rowId, { additive: e.shiftKey || e.metaKey });
      });
      row.addEventListener('dblclick', () => {
        state.session.select(row.dataset.rowId);
        viewport.focusSelected();
      });
    }
    for (const btn of listEl.querySelectorAll('[data-toggle-hide]')) {
      btn.addEventListener('click', () => {
        const target = state.session.getObject(btn.dataset.toggleHide);
        if (target) state.session.updateObject(target.id, { hidden: !target.hidden });
      });
    }
    for (const btn of listEl.querySelectorAll('[data-toggle-lock]')) {
      btn.addEventListener('click', () => {
        state.session.commit('Toggle lock', (world) => {
          const target = world.objects.find((o) => o.id === btn.dataset.toggleLock);
          if (target) target.locked = !target.locked;
        });
      });
    }
  }

  // Layers list
  const layersEl = $('layers-list');
  layersEl.innerHTML = (w.layers || [])
    .map(
      (l) => `
      <div class="wb-layer-item">
        <span>${escape(l.name)}</span>
        <button class="mini-btn" data-layer-vis="${escape(l.id)}" title="Toggle layer visibility">
          ${l.visible ? 'Visible' : 'Hidden'}
        </button>
      </div>`,
    )
    .join('');

  for (const btn of layersEl.querySelectorAll('[data-layer-vis]')) {
    btn.addEventListener('click', () => {
      const layer = w.layers.find((l) => l.id === btn.dataset.layerVis);
      if (layer) state.session.setLayerState(layer.id, { visible: !layer.visible });
    });
  }

  // Status counts & complexity warnings
  const objCount = w.objects.length;
  const roadCount = w.roads.length;
  const iotCount = state.session.iotDevices().length;
  $('status-counts').textContent =
    `${objCount} objects · ${roadCount} roads · ${iotCount} IoT devices`;

  const warnEl = $('complexity-warn');
  if (objCount > COMPLEXITY_WARNING_LIMIT) {
    warnEl.hidden = false;
    warnEl.textContent = `⚠ High scene complexity (${objCount}/${COMPLEXITY_WARNING_LIMIT}). Consider lowering graphics quality or grouping static assets.`;
  } else {
    warnEl.hidden = true;
  }
}

// ---- Play Mode HUD & Simulation Loop ----
function togglePlayMode(forcePlay) {
  if (!state.session) return;
  const shouldPlay = forcePlay !== undefined ? forcePlay : state.session.mode !== 'play';
  if (shouldPlay) {
    stopPlacing();
    state.session.enterPlayMode();
    $('play-hud').hidden = false;
    setHint(
      '<b>Play Mode Active:</b> Adjust simulated environment sliders, click doors/buttons in 3D, or switch to First-Person camera (WASD) to explore.',
    );
  } else {
    state.session.stopPlayMode();
    $('play-hud').hidden = true;
    setHint('<b>Edit Mode:</b> Returned to saved world state.');
  }
  updatePlayButtonChrome();
  viewport.refresh();
  renderAll();
}

function renderPlayHud() {
  const hud = $('play-hud');
  if (!state.session || state.session.mode !== 'play') {
    hud.hidden = true;
    return;
  }
  hud.hidden = false;
  $('sim-pause').textContent = state.session.simPaused ? 'Resume' : 'Pause';

  const env = state.session.simEnvironment || state.session.world.environment;
  const readings = state.session.formattedSimulatedReadings();
  const devices = state.session.iotDevices();
  const outputs = devices.filter((d) => d.output);

  const controls = `
    <div class="wb-pill-grid">
      <label style="font-size:11px">Sunlight (${env.sunlight}%)
        <input type="range" id="play-sun" min="0" max="100" value="${env.sunlight}" style="width:100%" />
      </label>
      <label style="font-size:11px">Temperature (${env.temperature}°C)
        <input type="range" id="play-temp" min="0" max="45" value="${env.temperature}" style="width:100%" />
      </label>
      <label style="font-size:11px">Soil Moisture (${env.soilMoisture}%)
        <input type="range" id="play-soil" min="0" max="100" value="${env.soilMoisture}" style="width:100%" />
      </label>
      <label style="font-size:11px">Distance (${env.distance}cm)
        <input type="range" id="play-dist" min="5" max="200" value="${env.distance}" style="width:100%" />
      </label>
    </div>
    <div class="wb-pill-grid">
      <button class="button ${env.motion ? 'primary' : ''}" id="play-motion">
        Motion Sensor: ${env.motion ? 'DETECTED (1)' : 'Clear (0)'}
      </button>
      <button class="button ${env.pressed ? 'primary' : ''}" id="play-button">
        Button Input: ${env.pressed ? 'PRESSED (1)' : 'Released (0)'}
      </button>
    </div>

  `;
  const readouts = `
    <div class="wb-row">
      <span class="wb-sim-badge">Simulated Environment</span>
      <span class="muted" style="font-size:11px">t = ${state.session.simTime.toFixed(1)}s</span>
    </div>
    <div>
      <strong style="font-size:11px;color:var(--muted)">SIMULATED SENSOR READINGS</strong>
      <div class="wb-readings-grid" style="margin-top:4px">
        ${
          readings.length
            ? readings
                .map(
                  (r) => `
            <div class="wb-reading-item">
              <strong>${escape(r.name)} (GPIO ${r.pin})</strong>
              <span>Simulated ${escape(r.signal)}: <b>${r.reading}</b></span>
            </div>`,
                )
                .join('')
            : `<div class="muted" style="font-size:11px;grid-column:1/-1">No sensors placed.</div>`
        }
      </div>
    </div>

    <div>
      <strong style="font-size:11px;color:var(--muted)">ACTUATOR OUTPUTS</strong>
      <div class="wb-readings-grid" style="margin-top:4px">
        ${
          outputs.length
            ? outputs
                .map((d) => {
                  const val = state.session.simOutputs[d.pin] || 0;
                  return `
              <div class="wb-reading-item" style="border-color:${val > 0 ? 'var(--ok)' : 'var(--line)'}">
                <strong>${escape(d.name)} (GPIO ${d.pin})</strong>
                <span>State: <b style="color:${val > 0 ? 'var(--ok)' : 'var(--muted)'}">${val > 0 ? 'ON / ACTIVE (' + val + ')' : 'OFF (0)'}</b></span>
              </div>`;
                })
                .join('')
            : `<div class="muted" style="font-size:11px;grid-column:1/-1">No actuators placed.</div>`
        }
      </div>
    </div>

    ${state.session.simError ? `<div class="caution">${escape(state.session.simError)}</div>` : ''}
  `;
  // While a slider is held, only the readouts change: drawing the controls again would drop it.
  const held =
    $('play-controls')?.contains(document.activeElement) && document.activeElement.type === 'range';
  if (held) {
    $('play-readouts').innerHTML = readouts;
    return;
  }
  $('play-hud-body').innerHTML =
    `<div id="play-controls">${controls}</div><div id="play-readouts">${readouts}</div>`;

  const bindPlayEnv = (id, key) => {
    $(id)?.addEventListener('input', (e) => {
      state.session.setEnvironment({ [key]: Number(e.target.value) }, { quiet: true });
      state.session.stepSimulation(0.05);
      relabel(
        e.target,
        e.target.parentElement.firstChild.textContent.replace(/\([-\d.]+/, `(${e.target.value}`),
      );
      viewport.refresh();
      renderPlayHud();
    });
  };
  bindPlayEnv('play-sun', 'sunlight');
  bindPlayEnv('play-temp', 'temperature');
  bindPlayEnv('play-soil', 'soilMoisture');
  bindPlayEnv('play-dist', 'distance');

  $('play-motion')?.addEventListener('click', () => {
    state.session.setEnvironment({ motion: env.motion ? 0 : 1 });
    state.session.stepSimulation(0.05);
    renderPlayHud();
  });
  $('play-button')?.addEventListener('click', () => {
    state.session.setEnvironment({ pressed: env.pressed ? 0 : 1 });
    state.session.stepSimulation(0.05);
    renderPlayHud();
  });
}

setInterval(() => {
  if (state.session?.mode === 'play' && !state.session.simPaused) {
    state.session.stepSimulation(0.25);
    viewport.refresh();
    renderPlayHud();
  }
}, 250);

// ---- World Selector & Persistence ----
function renderWorldSelector() {
  if (!state.session) return;
  const sel = $('world-select');
  sel.innerHTML = state.session.worlds
    .map(
      (w) =>
        `<option value="${escape(w.id)}" ${w.id === state.session.activeWorldId ? 'selected' : ''}>${escape(w.name)}</option>`,
    )
    .join('');
}

function renderAll() {
  renderWorldSelector();
  updatePlayButtonChrome();
  updateSaveIndicator();
  if (state.activeTab === 'assets') renderAssetsTab();
  else if (state.activeTab === 'terrain') renderTerrainTab();
  else if (state.activeTab === 'footprint') renderFootprintTab();
  else if (state.activeTab === 'roads') renderRoadsTab();
  else if (state.activeTab === 'iot') renderIoTTab();
  else if (state.activeTab === 'project') renderProjectTab();
  renderInspector();
  renderHierarchyAndLayers();
  renderPlayHud();
}

async function saveWorlds() {
  if (!state.session) return false;
  const data = state.session.toStoreData();
  try {
    if (shell) {
      await shell.write('worlds', data);
    }
    state.savedText = JSON.stringify(data);
    triggerAutosave();
    updateSaveIndicator();
    toast('Saved worlds to public/data/worlds.js');
    return true;
  } catch (err) {
    toast('Could not save: ' + err.message, true);
    return false;
  }
}

async function playtestInGame(fromStart = false) {
  if (isDirty()) {
    if (!confirm('Save changes before opening IoT Quest?')) return;
    if (!(await saveWorlds())) return;
  }
  // Saved worlds are not played by the game yet: Play-test opens the game at home.
  shell?.openGame(fromStart ? null : { city: 'legacy' });
}

function exportProjectFile() {
  if (!state.session) return;
  const json = state.session.exportWorldProject();
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${state.session.world.id || 'world'}.iotworld.json`;
  a.click();
  URL.revokeObjectURL(url);
  toast('Exported versioned .iotworld.json project.');
}

// ---- Event Listeners ----
$('world-select').addEventListener('change', (e) => {
  state.session.selectWorld(e.target.value);
});
$('new-world').addEventListener('click', () => {
  const name = prompt('Name for the new world:', 'Smart Eco Village');
  if (!name) return;
  state.session.createNewWorld({
    name,
    template: state.terrain.template || 'flat',
    seed: Math.floor(Math.random() * 900) + 10,
  });
  toast(`Created world "${name}".`);
});
$('dup-world').addEventListener('click', () => {
  const copy = state.session.duplicateWorld();
  toast(`Duplicated "${copy.name}".`);
});

for (const btn of $('transform-tools').children) {
  btn.addEventListener('click', () => setTransformMode(btn.dataset.mode));
}
$('duplicate').addEventListener('click', () => {
  const ids = state.session.duplicateSelected();
  if (ids.length) toast(`Duplicated ${ids.length} object(s).`);
});
$('undo').addEventListener('click', () => {
  const label = state.session.undo();
  if (label) toast(`Undid: ${label}`);
});
$('redo').addEventListener('click', () => {
  const label = state.session.redo();
  if (label) toast(`Redid: ${label}`);
});
$('mode-play').addEventListener('click', () => togglePlayMode());
$('playtest').addEventListener('click', (e) => playtestInGame(e.shiftKey));
$('save').addEventListener('click', saveWorlds);

for (const btn of $('left-tabs').children) {
  btn.addEventListener('click', () => switchLeftTab(btn.dataset.tab));
}

$('asset-search').addEventListener('input', (e) => {
  state.assetSearch = e.target.value;
  renderAssetsGrid();
});
$('fav-filter').addEventListener('click', () => {
  state.favoritesOnly = !state.favoritesOnly;
  $('fav-filter').setAttribute('aria-pressed', String(state.favoritesOnly));
  renderAssetsGrid();
});

for (const btn of $('camera-modes').children) {
  btn.addEventListener('click', () => {
    for (const b of $('camera-modes').children) {
      b.classList.toggle('active', b === btn);
    }
    viewport.setCameraMode(btn.dataset.cam);
  });
}
$('focus-btn').addEventListener('click', () => viewport.focusSelected());
$('zoom-in').addEventListener('click', () => viewport.zoom(1));
$('zoom-out').addEventListener('click', () => viewport.zoom(-1));
$('cam-speed').addEventListener('input', (e) => viewport.setMoveSpeed(Number(e.target.value)));

$('toggle-snap').addEventListener('click', () => {
  const next = !viewport.snap;
  viewport.setSnap(next);
  $('toggle-snap').setAttribute('aria-pressed', String(next));
});
$('toggle-grid').addEventListener('click', () => {
  const next = !viewport.gridHelper.visible;
  viewport.setGridVisible(next);
  $('toggle-grid').setAttribute('aria-pressed', String(next));
});
$('toggle-axis').addEventListener('click', () => {
  const next = !viewport.axesHelper.visible;
  viewport.setAxisVisible(next);
  $('toggle-axis').setAttribute('aria-pressed', String(next));
});
$('toggle-roofs').addEventListener('click', () => {
  state.session.hideRoofs = !state.session.hideRoofs;
  $('toggle-roofs').setAttribute('aria-pressed', String(state.session.hideRoofs));
  state.session.rebuildSceneModel();
  viewport.refresh();
});
$('story-filter').addEventListener('change', (e) => {
  state.session.maxVisibleStory = Number(e.target.value) || 10;
  state.session.rebuildSceneModel();
  viewport.refresh();
});

$('sim-pause').addEventListener('click', () => {
  state.session.pausePlayMode();
  renderPlayHud();
});
$('sim-reset').addEventListener('click', () => {
  state.session.resetPlayMode();
  renderPlayHud();
  toast('Simulation reset to initial state.');
});
$('sim-stop').addEventListener('click', () => togglePlayMode(false));

$('hierarchy-search').addEventListener('input', (e) => {
  state.hierarchySearch = e.target.value;
  renderHierarchyAndLayers();
});
$('group-btn').addEventListener('click', () => {
  const gid = state.session.groupSelected();
  if (gid) toast('Grouped selected objects.');
  else toast('Select 2 or more objects (Shift+Click) to group them.', true);
});
$('ungroup-btn').addEventListener('click', () => {
  if (state.session.ungroupSelected()) toast('Ungrouped selection.');
});
$('unhide-all-btn').addEventListener('click', () => {
  state.session.commit('Unhide all objects', (w) => {
    for (const o of w.objects) o.hidden = false;
  });
  toast('All hidden objects restored.');
});

// GLB/GLTF File Input Handler
$('glb-file-input').addEventListener('change', (e) => {
  const file = e.target.files?.[0];
  if (!file || !state.session) return;
  const scale = Number($('glb-scale')?.value) || 1;
  const rotY = ((Number($('glb-rot-y')?.value) || 0) * Math.PI) / 180;
  const reader = new FileReader();
  reader.onload = () => {
    const id = state.session.registerImportedAsset({
      name: file.name.replace(/\.(glb|gltf)$/i, ''),
      fileName: file.name,
      dataUrl: reader.result,
      scale,
      rotation: [0, rotY, 0],
    });
    state.session.addObject(`imported/${id}`, {
      name: file.name.replace(/\.(glb|gltf)$/i, ''),
      pos: [0, 0, 0],
    });
    viewport.syncGLTFInstances();
    renderProjectTab();
    toast(`Imported and placed 3D model "${file.name}".`);
  };
  reader.readAsDataURL(file);
  e.target.value = '';
});

// Project JSON Import Handler
$('project-file-input').addEventListener('change', (e) => {
  const file = e.target.files?.[0];
  if (!file || !state.session) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const imported = state.session.importWorldProject(reader.result);
      toast(`Imported world project "${imported.name}".`);
    } catch (err) {
      toast(err.message, true);
    }
  };
  reader.readAsText(file);
  e.target.value = '';
});

// Keyboard Shortcuts
const isTyping = () => /^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement?.tagName);
document.addEventListener('keydown', (e) => {
  const mod = e.metaKey || e.ctrlKey;
  const key = e.key.toLowerCase();

  if (mod && key === 's') {
    e.preventDefault();
    saveWorlds();
    return;
  }
  if (isTyping()) {
    if (e.key === 'Escape') document.activeElement.blur();
    return;
  }
  if (mod && key === 'z') {
    e.preventDefault();
    const label = e.shiftKey ? state.session?.redo() : state.session?.undo();
    if (label) toast(`${e.shiftKey ? 'Redid' : 'Undid'}: ${label}`);
    return;
  }
  if (mod && key === 'd') {
    e.preventDefault();
    state.session?.duplicateSelected();
    return;
  }
  if (mod && key === 'g') {
    e.preventDefault();
    state.session?.groupSelected();
    return;
  }
  if (e.key === 'Escape') {
    if (state.placingAssetId || state.placingPrefabId) stopPlacing();
    else state.session?.select(null);
    return;
  }
  if (e.key === 'Delete' || e.key === 'Backspace') {
    state.session?.removeSelected();
    return;
  }
  if (key === 'v') setTransformMode('select');
  else if (key === 'g') setTransformMode('translate');
  else if (key === 'r') setTransformMode('rotate');
  else if (key === 's' && !viewport.keysDown.size) setTransformMode('scale');
  else if (key === 'f') viewport.focusSelected();
});

shell?.onMenu((command) => {
  if (command === 'save') saveWorlds();
  else if (command === 'playtest' || command === 'playstart')
    playtestInGame(command === 'playstart');
  else if (isTyping()) document.execCommand(command);
  else if (command === 'undo') state.session?.undo();
  else if (command === 'redo') state.session?.redo();
});
$('home').addEventListener('click', (e) => {
  if (isDirty() && !confirm('Leave the World Builder? Unsaved changes will be lost.'))
    e.preventDefault();
});

let toastTimer;
function toast(message, isError = false) {
  const el = $('toast');
  el.textContent = message;
  el.classList.toggle('error', isError);
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(
    () => {
      el.hidden = true;
    },
    isError ? 5000 : 2600,
  );
}

// ---- Startup & Autosave Recovery ----
async function start() {
  let storeData;
  if (shell) {
    storeData = await shell.read('worlds');
  } else {
    storeData = (await import('../../../public/data/worlds.js')).default;
  }

  // Check if a newer autosave snapshot exists in localStorage
  try {
    const rawAuto = localStorage.getItem(AUTOSAVE_KEY);
    if (rawAuto) {
      const parsed = JSON.parse(rawAuto);
      if (
        parsed?.data?.worlds?.length &&
        JSON.stringify(parsed.data) !== JSON.stringify(storeData)
      ) {
        state.recoveredAutosave = parsed;
      }
    }
  } catch {}

  state.session = new WorldBuilderSession(storeData);
  // What was loaded, with any defaults the session fills in: opening the workspace is not an edit.
  state.savedText = currentStoreText();

  state.session.on(() => {
    viewport.refresh();
    triggerAutosave();
    renderAll();
  });

  viewport.setSession(state.session);
  renderAll();
}

start().catch((err) => {
  $('loading').hidden = false;
  $('loading').textContent = /No handler registered/.test(err.message)
    ? 'The editor was updated while it was open. Quit it (⌘Q) and run scripts/world-editor.sh again.'
    : 'World Builder could not start: ' + err.message;
  console.error(err);
});

window.worldBuilder = { state, viewport };
