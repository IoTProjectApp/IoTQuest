// Terrain creation, seeded generation, height sculpting, surface painting, water bodies, and
// scatter generation for the World Builder workspace. Free of the DOM so it runs under Node.

export const TERRAIN_SIZE = 32; // 32x32 grid cells (33x33 vertices)
export const TERRAIN_EXTENT = 128; // 128m x 128m world (-64m to +64m)
export const CELL_SIZE = TERRAIN_EXTENT / TERRAIN_SIZE; // 4m per cell

export const SURFACE_PAINTS = {
  grass: { id: 'grass', name: 'Grass', color: '#8ead72', roughness: 0.92 },
  soil: { id: 'soil', name: 'Soil', color: '#9c7e5e', roughness: 0.95 },
  sand: { id: 'sand', name: 'Sand', color: '#d7c496', roughness: 0.88 },
  rock: { id: 'rock', name: 'Rock', color: '#8d9491', roughness: 0.85 },
  snow: { id: 'snow', name: 'Snow', color: '#e6ecea', roughness: 0.75 },
  paved: { id: 'paved', name: 'Paved', color: '#9fa39d', roughness: 0.8 },
};

export const TERRAIN_TEMPLATES = [
  { id: 'empty', name: 'Empty World', summary: 'Clean flat ground ready for construction.' },
  { id: 'flat', name: 'Flat Landscape', summary: 'Lush green meadow with gentle borders.' },
  {
    id: 'island',
    name: 'Island',
    summary: 'Sandy beaches surrounded by water and a central hill.',
  },
  {
    id: 'mountains',
    name: 'Mountainous Region',
    summary: 'High alpine ridges, snow peaks and a valley.',
  },
  { id: 'desert', name: 'Desert', summary: 'Sweeping sand dunes, rocky mesas and an oasis.' },
  { id: 'forest', name: 'Forest', summary: 'Rolling woodland hills with a clearing and pond.' },
  {
    id: 'town',
    name: 'Town Template',
    summary: 'Levelled central plaza with paved streets and park.',
  },
];

export const SCATTER_TYPES = [
  { id: 'broadleaf', name: 'Broadleaf Tree', category: 'tree' },
  { id: 'conifer', name: 'Pine / Conifer', category: 'tree' },
  { id: 'palm', name: 'Palm Tree', category: 'tree' },
  { id: 'eucalypt', name: 'Eucalyptus Tree', category: 'tree' },
  { id: 'bush', name: 'Garden Bush', category: 'bush' },
  { id: 'rock', name: 'Boulder / Rock', category: 'rock' },
  { id: 'flower', name: 'Wildflowers', category: 'flower' },
  { id: 'grass-tuft', name: 'Tall Grass', category: 'grass' },
];

export const BRUSH_MODES = [
  { id: 'raise', name: 'Raise', summary: 'Push terrain height up' },
  { id: 'lower', name: 'Lower', summary: 'Carve valleys and depressions' },
  { id: 'smooth', name: 'Smooth', summary: 'Average neighbouring heights' },
  { id: 'flatten', name: 'Flatten', summary: 'Level terrain to target height' },
  { id: 'plateau', name: 'Plateau / Cliff', summary: 'Create flat-topped mesas with steep cliffs' },
  { id: 'hill', name: 'Mountain / Hill', summary: 'Sculpt a peaked mound or ridge' },
  { id: 'valley', name: 'Valley / Trench', summary: 'Carve a sloped depression' },
];

// Deterministic PRNG from a numeric seed.
export function seededRandom(seed = 101) {
  let value = (Number(seed) || 101) >>> 0;
  return () => (value = (Math.imul(value, 1664525) + 1013904223) >>> 0) / 4294967296;
}

// Smooth 2D value noise for procedural terrain generation.
function noise2D(x, z, seed = 1) {
  const hash = (ix, iz) => {
    let n =
      (Math.imul(ix, 374761393) + Math.imul(iz, 668265263) + Math.imul(seed, 1442695041)) >>> 0;
    n = Math.imul(n ^ (n >>> 13), 1274126177) >>> 0;
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
  };
  const ix = Math.floor(x),
    iz = Math.floor(z),
    fx = x - ix,
    fz = z - iz,
    ux = fx * fx * (3 - 2 * fx),
    uz = fz * fz * (3 - 2 * fz);
  const a = hash(ix, iz),
    b = hash(ix + 1, iz),
    c = hash(ix, iz + 1),
    d = hash(ix + 1, iz + 1);
  return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
}

export function fbm2D(x, z, seed = 1, octaves = 4) {
  let total = 0,
    amp = 0.5,
    freq = 1,
    norm = 0;
  for (let i = 0; i < octaves; i++) {
    total += (noise2D(x * freq, z * freq, seed + i * 31) * 2 - 1) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2.02;
  }
  return total / (norm || 1);
}

// Creates a fresh terrain state from a template and seed.
export function createTerrain(template = 'flat', seed = 42) {
  const size = TERRAIN_SIZE;
  const heights = new Array(size * size).fill(0);
  const paints = new Array(size * size).fill('grass');
  let waterLevel = -2;
  const waters = [];

  const idx = (gx, gz) => gz * size + gx;
  const worldCoord = (gx, gz) => [
    (gx + 0.5 - size / 2) * CELL_SIZE,
    (gz + 0.5 - size / 2) * CELL_SIZE,
  ];

  for (let gz = 0; gz < size; gz++) {
    for (let gx = 0; gx < size; gx++) {
      const [wx, wz] = worldCoord(gx, gz);
      const dist = Math.hypot(wx, wz) / (TERRAIN_EXTENT * 0.5);
      const n = fbm2D(wx * 0.025, wz * 0.025, seed, 4);
      let h = 0;
      let p = 'grass';

      if (template === 'empty') {
        h = 0;
        p = 'grass';
      } else if (template === 'flat') {
        h = Math.max(0, (dist - 0.75) * 4) + n * 0.25;
        if (Math.abs(wx) < 20 && Math.abs(wz) < 20) h = 0;
        p = 'grass';
      } else if (template === 'island') {
        waterLevel = 0.2;
        const mask = Math.max(-1, 1 - dist * dist * 1.35);
        h = mask * 7 + n * 2.2;
        if (dist < 0.25) h = Math.max(1.2, h * 0.5 + 1);
        p = h < waterLevel + 0.6 ? 'sand' : h > 5.5 ? 'rock' : 'grass';
      } else if (template === 'mountains') {
        waterLevel = -0.3;
        const valley = Math.min(1, Math.abs(wx) / 28);
        h = Math.pow(valley, 1.4) * (10 + n * 6) + Math.max(0, (dist - 0.5) * 8);
        if (Math.abs(wx) < 12 && Math.abs(wz) < 12) h = 0;
        p = h > 9.5 ? 'snow' : h > 5 ? 'rock' : h < 0.2 ? 'soil' : 'grass';
      } else if (template === 'desert') {
        waterLevel = -1.5;
        const dune = Math.sin(wx * 0.06 + n * 2) * 1.8 + n * 2.5;
        const mesa = dist > 0.65 && n > 0.15 ? 6 : 0;
        h = Math.max(0, dune + mesa);
        if (Math.abs(wx) < 14 && Math.abs(wz) < 14) h = 0;
        p = mesa > 0 ? 'rock' : 'sand';
      } else if (template === 'forest') {
        waterLevel = -0.2;
        h = Math.max(0, (dist - 0.35) * 5 + n * 2.4);
        if (Math.abs(wx) < 16 && Math.abs(wz) < 16) h = 0;
        p = h > 4.5 ? 'soil' : 'grass';
      } else if (template === 'town') {
        h = 0;
        p = Math.abs(wx) < 8 || Math.abs(wz) < 8 ? 'paved' : 'grass';
      }

      heights[idx(gx, gz)] = Math.round(h * 100) / 100;
      paints[idx(gx, gz)] = p;
    }
  }

  if (template === 'forest') {
    waters.push({ id: 'water-1', kind: 'pond', x: 24, z: 20, width: 16, depth: 14, level: 0.15 });
  } else if (template === 'desert') {
    waters.push({ id: 'water-1', kind: 'pond', x: -22, z: 18, width: 12, depth: 10, level: 0.1 });
  } else if (template === 'mountains') {
    waters.push({ id: 'water-1', kind: 'river', x: 0, z: 28, width: 10, depth: 42, level: 0.05 });
  }

  return {
    size,
    extent: TERRAIN_EXTENT,
    template,
    seed: Number(seed) || 42,
    waterLevel,
    heights,
    paints,
    waters,
  };
}

// Converts world (x, z) to grid indices [gx, gz].
export function worldToGrid(terrain, x, z) {
  const size = terrain.size || TERRAIN_SIZE;
  const extent = terrain.extent || TERRAIN_EXTENT;
  const cell = extent / size;
  const gx = Math.max(0, Math.min(size - 1, Math.floor(x / cell + size / 2)));
  const gz = Math.max(0, Math.min(size - 1, Math.floor(z / cell + size / 2)));
  return [gx, gz];
}

// Bilinearly interpolated terrain height at world (x, z).
export function terrainHeightAt(terrain, x, z) {
  if (!terrain?.heights) return 0;
  const size = terrain.size || TERRAIN_SIZE;
  const extent = terrain.extent || TERRAIN_EXTENT;
  const cell = extent / size;
  const fx = x / cell + size / 2 - 0.5;
  const fz = z / cell + size / 2 - 0.5;
  const x0 = Math.max(0, Math.min(size - 1, Math.floor(fx)));
  const z0 = Math.max(0, Math.min(size - 1, Math.floor(fz)));
  const x1 = Math.max(0, Math.min(size - 1, x0 + 1));
  const z1 = Math.max(0, Math.min(size - 1, z0 + 1));
  const tx = Math.max(0, Math.min(1, fx - x0));
  const tz = Math.max(0, Math.min(1, fz - z0));
  const h00 = terrain.heights[z0 * size + x0] || 0;
  const h10 = terrain.heights[z0 * size + x1] || 0;
  const h01 = terrain.heights[z1 * size + x0] || 0;
  const h11 = terrain.heights[z1 * size + x1] || 0;
  const h0 = h00 + (h10 - h00) * tx;
  const h1 = h01 + (h11 - h01) * tx;
  return Math.round((h0 + (h1 - h0) * tz) * 1000) / 1000;
}

export function terrainPaintAt(terrain, x, z) {
  const [gx, gz] = worldToGrid(terrain, x, z);
  return terrain.paints[gz * (terrain.size || TERRAIN_SIZE) + gx] || 'grass';
}

// Falloff curve (0..1 distance ratio -> 0..1 weight).
function falloffWeight(t, falloff = 0.5) {
  if (t >= 1) return 0;
  if (falloff <= 0.05) return 1;
  const edge = Math.max(0.05, 1 - falloff);
  if (t <= edge) return 1;
  const u = (t - edge) / (1 - edge);
  return 1 - u * u * (3 - 2 * u);
}

// Sculpt terrain around world (x, z) with configurable brush mode, radius, strength, falloff.
export function sculptTerrain(
  terrain,
  {
    x = 0,
    z = 0,
    mode = 'raise',
    radius = 12,
    strength = 1.5,
    falloff = 0.5,
    targetHeight = null,
  } = {},
) {
  const size = terrain.size || TERRAIN_SIZE;
  const extent = terrain.extent || TERRAIN_EXTENT;
  const cell = extent / size;
  const before = [...terrain.heights];
  const centerHeight = targetHeight ?? terrainHeightAt(terrain, x, z);
  let changed = false;

  for (let gz = 0; gz < size; gz++) {
    for (let gx = 0; gx < size; gx++) {
      const wx = (gx + 0.5 - size / 2) * cell;
      const wz = (gz + 0.5 - size / 2) * cell;
      const d = Math.hypot(wx - x, wz - z);
      if (d > radius) continue;
      const w = falloffWeight(d / Math.max(0.1, radius), falloff);
      if (w <= 0) continue;
      const i = gz * size + gx;
      let h = before[i];

      if (mode === 'raise') {
        h += strength * w;
      } else if (mode === 'lower') {
        h -= strength * w;
      } else if (mode === 'flatten') {
        h = h + (centerHeight - h) * Math.min(1, w * Math.min(1, strength * 0.5));
      } else if (mode === 'plateau') {
        const flatTop = centerHeight + strength;
        const step =
          d / Math.max(0.1, radius) < 0.65 ? 1 : falloffWeight((d / radius - 0.65) / 0.35, 0.8);
        h = h + (flatTop - h) * step;
      } else if (mode === 'hill') {
        const bell = Math.cos((Math.min(1, d / Math.max(0.1, radius)) * Math.PI) / 2) ** 2;
        h += strength * 1.5 * bell;
      } else if (mode === 'valley') {
        const bell = Math.cos((Math.min(1, d / Math.max(0.1, radius)) * Math.PI) / 2) ** 2;
        h -= strength * 1.5 * bell;
      } else if (mode === 'smooth') {
        let sum = 0,
          count = 0;
        for (let dz = -1; dz <= 1; dz++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = gx + dx,
              nz = gz + dz;
            if (nx >= 0 && nx < size && nz >= 0 && nz < size) {
              sum += before[nz * size + nx];
              count++;
            }
          }
        }
        const avg = sum / (count || 1);
        h = h + (avg - h) * Math.min(1, w * Math.min(1, strength * 0.5));
      }

      h = Math.max(-8, Math.min(28, Math.round(h * 100) / 100));
      if (h !== terrain.heights[i]) {
        terrain.heights[i] = h;
        changed = true;
      }
    }
  }
  return changed;
}

// Flatten a rectangular footprint (e.g. before placing a building).
export function flattenFootprint(
  terrain,
  { x = 0, z = 0, width = 12, depth = 12, height = null, paint = null } = {},
) {
  const size = terrain.size || TERRAIN_SIZE;
  const extent = terrain.extent || TERRAIN_EXTENT;
  const cell = extent / size;
  const target = height ?? terrainHeightAt(terrain, x, z);
  let changed = false;
  for (let gz = 0; gz < size; gz++) {
    for (let gx = 0; gx < size; gx++) {
      const wx = (gx + 0.5 - size / 2) * cell;
      const wz = (gz + 0.5 - size / 2) * cell;
      if (
        Math.abs(wx - x) <= width / 2 + cell * 0.6 &&
        Math.abs(wz - z) <= depth / 2 + cell * 0.6
      ) {
        const i = gz * size + gx;
        const rounded = Math.round(target * 100) / 100;
        if (terrain.heights[i] !== rounded) {
          terrain.heights[i] = rounded;
          changed = true;
        }
        if (paint && SURFACE_PAINTS[paint] && terrain.paints[i] !== paint) {
          terrain.paints[i] = paint;
          changed = true;
        }
      }
    }
  }
  return changed;
}

// Paint terrain surface within brush radius.
export function paintTerrain(terrain, { x = 0, z = 0, radius = 8, paint = 'grass' } = {}) {
  if (!SURFACE_PAINTS[paint]) return false;
  const size = terrain.size || TERRAIN_SIZE;
  const extent = terrain.extent || TERRAIN_EXTENT;
  const cell = extent / size;
  let changed = false;
  for (let gz = 0; gz < size; gz++) {
    for (let gx = 0; gx < size; gx++) {
      const wx = (gx + 0.5 - size / 2) * cell;
      const wz = (gz + 0.5 - size / 2) * cell;
      if (Math.hypot(wx - x, wz - z) <= radius) {
        const i = gz * size + gx;
        if (terrain.paints[i] !== paint) {
          terrain.paints[i] = paint;
          changed = true;
        }
      }
    }
  }
  return changed;
}

// Scatter vegetation / rocks within a brush radius or across the world.
export function generateScatterItems(
  terrain,
  {
    x = 0,
    z = 0,
    radius = 16,
    kind = 'broadleaf',
    density = 6,
    minScale = 0.8,
    maxScale = 1.25,
    seed = Date.now(),
    existing = [],
  } = {},
) {
  const rand = seededRandom(seed);
  const count = Math.max(1, Math.min(40, Math.round(density)));
  const items = [];
  const minSpacing = kind === 'grass-tuft' || kind === 'flower' ? 1.2 : 2.6;
  const extent = (terrain.extent || TERRAIN_EXTENT) / 2 - 4;

  for (let attempt = 0; attempt < count * 5 && items.length < count; attempt++) {
    const angle = rand() * Math.PI * 2;
    const r = Math.sqrt(rand()) * radius;
    const px = Math.round((x + Math.cos(angle) * r) * 100) / 100;
    const pz = Math.round((z + Math.sin(angle) * r) * 100) / 100;
    if (Math.abs(px) > extent || Math.abs(pz) > extent) continue;
    const py = terrainHeightAt(terrain, px, pz);
    if (py < (terrain.waterLevel ?? -2) + 0.05) continue;
    const tooClose = [...existing, ...items].some(
      (other) => Math.hypot((other.pos?.[0] ?? 0) - px, (other.pos?.[2] ?? 0) - pz) < minSpacing,
    );
    if (tooClose) continue;
    const scale = Math.round((minScale + rand() * Math.max(0, maxScale - minScale)) * 100) / 100;
    const turn = Math.round((rand() * Math.PI * 2 - Math.PI) * 1000) / 1000;
    items.push({
      kind: 'nature/' + kind,
      pos: [px, py, pz],
      turn,
      scale,
    });
  }
  return items;
}

// Builds the 3D meshes representing the terrain cells, water plane, and custom water bodies.
export function buildTerrainMeshes(model, terrain) {
  const size = terrain.size || TERRAIN_SIZE;
  const extent = terrain.extent || TERRAIN_EXTENT;
  const cell = extent / size;
  const baseFloor = -3;

  // Base foundation beneath the terrain grid
  model.mesh('box', [0, baseFloor - 0.5, 0], [extent + 4, 1, extent + 4], '#5b6659', {
    terrainBase: true,
    rounded: false,
  });

  // Terrain cells rendered as instanced boxes from baseFloor up to cell height
  for (let gz = 0; gz < size; gz++) {
    for (let gx = 0; gx < size; gx++) {
      const i = gz * size + gx;
      const h = terrain.heights[i] || 0;
      const paintKey = terrain.paints[i] || 'grass';
      const surface = SURFACE_PAINTS[paintKey] || SURFACE_PAINTS.grass;
      const wx = (gx + 0.5 - size / 2) * cell;
      const wz = (gz + 0.5 - size / 2) * cell;
      const totalH = Math.max(0.2, h - baseFloor);
      const cy = baseFloor + totalH / 2;

      // Subtle checker shade variation so grid cells read clearly
      model.mesh('box', [wx, cy, wz], [cell + 0.04, totalH, cell + 0.04], surface.color, {
        roughness: surface.roughness,
        surface: paintKey,
        terrainCell: i,
        rounded: false,
      });
    }
  }

  // Global water level (if above -1.5m, e.g. island or coastal scenes)
  if (typeof terrain.waterLevel === 'number' && terrain.waterLevel > -1.5) {
    model.mesh('box', [0, terrain.waterLevel - 0.15, 0], [extent + 2, 0.3, extent + 2], '#4f8699', {
      opacity: 0.78,
      roughness: 0.18,
      terrainWater: true,
      rounded: false,
    });
  }

  // Placed water bodies (lakes, ponds, rivers, coastlines)
  for (const w of terrain.waters || []) {
    const wy = (w.level ?? 0.15) + terrainHeightAt(terrain, w.x || 0, w.z || 0);
    const shape = w.kind === 'pond' || w.kind === 'lake' ? 'cylinder' : 'box';
    const turn = w.turn || 0;
    // Bank / shoreline rim
    model.mesh(
      shape,
      [w.x || 0, wy - 0.06, w.z || 0],
      [(w.width || 12) + 1.4, 0.14, (w.depth || 12) + 1.4],
      '#b8a886',
      {
        rotation: [0, turn, 0],
        roughness: 0.9,
        waterId: w.id,
        rounded: false,
      },
    );
    // Water surface
    model.mesh(shape, [w.x || 0, wy, w.z || 0], [w.width || 12, 0.12, w.depth || 12], '#4d879c', {
      rotation: [0, turn, 0],
      opacity: 0.82,
      roughness: 0.15,
      waterId: w.id,
      rounded: false,
    });
  }
}
