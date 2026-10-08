import { buildTree } from './vegetation.js';
import { houseDesign } from './house-design.js';
import { addAnimal, updateAnimals } from './animals.js';

export function addLandscape(model, location = { id: 'legacy', climate: 'temperate', iso: 'AUS' }) {
  if (model.landscape) return model.landscape;
  const seed = houseDesign(location).seed;
  let value = seed;
  const rand = () => (value = (Math.imul(value, 1664525) + 1013904223) >>> 0) / 4294967296;
  const dry = ['dry', 'desert'].includes(location.climate),
    alpine = ['cold', 'highland'].includes(location.climate),
    tropical = ['tropical', 'monsoon'].includes(location.climate),
    biome = alpine ? 'alpine' : dry ? 'arid' : tropical ? 'tropical' : 'woodland';
  const colours = dry
    ? { ground: '#c4b68b', hill: '#b9a280', rock: '#a2907c', tree: '#85915d' }
    : alpine
      ? { ground: '#8f9e8b', hill: '#889c8c', rock: '#8b9599', tree: '#587d70' }
      : tropical
        ? { ground: '#8ba982', hill: '#78967b', rock: '#8a9d90', tree: '#527d65' }
        : { ground: '#a1af8a', hill: '#839b83', rock: '#919c8f', tree: '#62856d' };
  const landscape = (model.landscape = {
    biome,
    seed,
    clock: 0,
    mountains: [],
    waters: [],
    birds: [],
    wildlife: [],
    snowcaps: [],
    features: ['mountains', 'valley', 'river', 'lake', 'wildlife', 'flying birds'],
  });
  const mesh = (shape, pos, size, color, extra = {}) =>
    model.mesh(shape, pos, size, color, { landscape: true, ...extra });
  const box = (x, y, z, w, h, d, c, extra = {}) =>
    mesh('box', [x, y, z], [w, h, d], c, { rounded: false, ...extra });
  const sphere = (x, y, z, w, h, d, c, extra = {}) =>
    mesh('sphere', [x, y, z], [w, h, d], c, extra);
  // Foundation stays below the property, street and paddock floors. All new
  // landscape features are outside those areas; scenery adds no colliders.
  box(0, -0.65, 0, 180, 1, 170, colours.ground, { landscapeGround: true });
  for (let i = 0; i < 8; i++) {
    const x = -73 + i * 20 + rand() * 6,
      z = -57 - rand() * 9,
      width = 22 + rand() * 14,
      height = (alpine ? 20 : dry ? 13 : 12) + rand() * 12,
      depth = 24 + rand() * 9;
    const mountain = mesh(
      'mountain',
      [x, height / 2 - 0.12, z],
      [width, height, depth],
      i % 2 ? colours.hill : colours.rock,
      { terrainFeature: 'mountain' },
    );
    landscape.mountains.push(mountain);
    if (alpine && i % 2 === 0)
      landscape.snowcaps.push(
        mesh(
          'cone',
          [x - 1, height * 0.77, z],
          [width * 0.19, height * 0.18, depth * 0.16],
          '#e4ebe8',
          { terrainFeature: 'snowcap' },
        ),
      );
  }
  // Low foothills define an open valley leading to the river, away from buildings.
  for (const side of [-1, 1])
    for (let i = 0; i < 3; i++) {
      const x = side * (45 + rand() * 12),
        z = -34 + i * 27;
      sphere(x, 0.3, z, 22 + rand() * 8, 4 + rand() * 5, 18 + rand() * 6, colours.hill, {
        terrainFeature: 'foothill',
      });
    }
  const riverX = -51 + (seed % 5) * 0.45;
  const points = [
    [-5, -70],
    [4, -58],
    [2, -47],
    [-1, -36],
    [3, -26],
    [1, -14],
    [-3, -3],
    [0, 12],
    [3, 27],
    [8, 43],
  ].map(([dx, z]) => [riverX + dx, z]);
  const channel = (from, to, width, tributary = false) => {
    const dx = to[0] - from[0],
      dz = to[1] - from[1],
      length = Math.hypot(dx, dz),
      angle = Math.atan2(dx, dz),
      x = (from[0] + to[0]) / 2,
      z = (from[1] + to[1]) / 2;
    box(x, -0.075, z, width + 1.6, 0.13, length + 1, colours.rock, {
      rotation: [0, angle, 0],
      terrainFeature: 'river-bank',
    });
    const water = box(x, 0.015, z, width, 0.06, length + 0.7, dry ? '#76969a' : '#668f9b', {
      rotation: [0, angle, 0],
      roughness: 0.2,
      opacity: 0.88,
      terrainFeature: tributary ? 'tributary' : 'river',
    });
    const flow = box(x, 0.055, z, width * 0.5, 0.012, 0.18, '#b7d4d0', {
      rotation: [0, angle, 0],
      opacity: 0.22,
      terrainFeature: 'water-flow',
    });
    landscape.waters.push({ mesh: water, flow, x, z, angle, length, phase: rand(), kind: 'river' });
  };
  for (let i = 0; i < points.length - 1; i++) channel(points[i], points[i + 1], 4.4 + rand());
  channel([-20, -57], [-33, -44], 2.2, true);
  channel([-33, -44], [riverX - 1, -36], 2.7, true);
  // Lake and softly irregular shoreline beside the river. No water sits in a quest area.
  const lakeX = riverX - 2,
    lakeZ = 16;
  mesh('cylinder', [lakeX, -0.02, lakeZ], [22, 0.2, 17], colours.rock, {
    terrainFeature: 'lake-bank',
  });
  const lake = mesh('cylinder', [lakeX, 0.06, lakeZ], [19, 0.06, 14], '#618896', {
    roughness: 0.18,
    opacity: 0.9,
    terrainFeature: 'lake',
  });
  const ripples = Array.from({ length: 3 }, (_, i) =>
    mesh('torus', [lakeX, 0.106, lakeZ], [3 + i * 3, 0.05, 2 + i * 2], '#b4cecb', {
      opacity: 0.14,
      terrainFeature: 'lake-ripple',
    }),
  );
  landscape.waters.push({ mesh: lake, ripples, x: lakeX, z: lakeZ, kind: 'lake' });
  for (let i = 0; i < 14; i++) {
    const angle = (i / 14) * Math.PI * 2;
    sphere(
      lakeX + Math.cos(angle) * 10.7,
      0.2,
      lakeZ + Math.sin(angle) * 8.3,
      1 + rand() * 1.4,
      0.5 + rand() * 0.4,
      0.8 + rand(),
      colours.rock,
      { terrainFeature: 'shore-rock' },
    );
  }
  // Forest edges remain beyond even the widest farm paddocks and Melbourne lots.
  for (let i = 0; i < 18; i++) {
    const x = (i % 2 ? 1 : -1) * (42 + rand() * 12),
      z = -29 + rand() * 58,
      h = 2.5 + rand() * 2;
    buildTree(model, x, z, h / 3.3, {
      style: alpine ? 'conifer' : location.iso === 'AUS' ? 'eucalypt' : 'broadleaf',
      detailed: false,
      foliage: [colours.tree, colours.hill],
      extra: { landscape: true, terrainFeature: 'tree' },
    });
  }
  box(54, -0.08, 40, 28, 0.14, 13, colours.ground, { terrainFeature: 'wildlife-clearing' });
  const animalModel = { ...model, animals: landscape.wildlife };
  const species =
    location.iso === 'AUS'
      ? 'kangaroo'
      : dry
        ? 'rabbit'
        : location.continent === 'Africa'
          ? 'antelope'
          : 'deer';
  for (let i = 0; i < 4; i++) {
    const bounds = i % 2 ? [42, 35, 53, 45] : [56, 35, 67, 45];
    const animal = addAnimal(animalModel, species, bounds, (seed % 10000) + i * 19);
    for (const part of animal.parts) {
      part.mesh.landscape = true;
      part.mesh.wildlife = true;
    }
  }
  for (let i = 0; i < 7; i++) {
    const bird = {
      phase: rand() * Math.PI * 2,
      speed: 0.15 + rand() * 0.07,
      rx: 19 + rand() * 9,
      rz: 16 + rand() * 9,
      height: 6.5 + rand() * 3,
      parts: [],
    };
    bird.flightAngle = bird.phase;
    bird.wingPhase = bird.phase;
    const part = (shape, local, size, color, role = 'body', side = 0) => {
      const m = mesh(shape, [0, 0, 0], size, color, { flyingBird: true });
      bird.parts.push({ mesh: m, local, role, side });
    };
    part('sphere', [0, 0, 0], [0.64, 0.22, 0.23], i % 2 ? '#a9b5b5' : '#e2e5de');
    part('sphere', [0.28, 0.06, 0], [0.2, 0.17, 0.17], '#d5dcd7');
    part('cone', [0.42, 0.04, 0], [0.07, 0.15, 0.07], '#bfa06b', 'beak');
    part('box', [-0.36, 0, 0], [0.22, 0.035, 0.22], '#647576', 'tail');
    for (const side of [-1, 1]) {
      part('sphere', [-0.03, 0, side * 0.39], [0.43, 0.05, 0.75], '#c4cfca', 'wing', side);
      part('sphere', [-0.1, 0, side * 0.78], [0.28, 0.035, 0.33], '#637575', 'tip', side);
    }
    landscape.birds.push(bird);
  }
  updateLandscape(model, { light: 70, wind: 0, cloud: 20 }, 0, true);
  return landscape;
}

export function updateLandscape(model, env, dt, still = false) {
  const landscape = model.landscape;
  if (!landscape) return;
  const step = Math.max(0, Math.min(0.1, Number.isFinite(dt) ? dt : 0));
  if (!still) landscape.clock += step;
  const time = landscape.clock,
    wind = Math.max(0, Math.min(80, env.wind || 0)),
    storm = (env.rain || 0) > 55;
  for (const bird of landscape.birds) {
    if (!still) {
      bird.flightAngle += step * bird.speed * (storm ? 0.75 : 1);
      bird.wingPhase += step * (5 + wind * 0.02);
    }
    const angle = bird.flightAngle,
      x = Math.cos(angle) * bird.rx,
      z = -2 + Math.sin(angle) * bird.rz,
      y = bird.height + Math.sin(angle * 2) * 0.4,
      heading = Math.atan2(-Math.cos(angle) * bird.rz, -Math.sin(angle) * bird.rx),
      cos = Math.cos(heading),
      sin = Math.sin(heading),
      flap = Math.sin(bird.wingPhase) * 0.55;
    for (const part of bird.parts) {
      const [lx, ly, lz] = part.local,
        wing = part.role === 'wing' || part.role === 'tip',
        localY = ly + (wing ? Math.abs(lz) * Math.sin(flap) : 0),
        localZ = wing ? lz * Math.cos(flap) : lz;
      part.mesh.pos = [x + lx * cos + localZ * sin, y + localY, z - lx * sin + localZ * cos];
      part.mesh.rotation = [
        wing ? -part.side * flap : 0,
        heading,
        part.role === 'beak' ? -Math.PI / 2 : 0,
      ];
      part.mesh.opacity = (env.light ?? 70) < 8 ? 0 : storm ? 0.7 : 1;
    }
  }
  updateAnimals(landscape.wildlife, time, step, still);
  for (const water of landscape.waters) {
    water.mesh.roughness = 0.18 + wind * 0.004;
    if (water.flow) {
      const travel = ((time * 0.65 + water.phase * water.length) % water.length) - water.length / 2;
      water.flow.pos = [
        water.x + Math.sin(water.angle) * travel,
        0.055,
        water.z + Math.cos(water.angle) * travel,
      ];
    }
    for (let i = 0; i < (water.ripples?.length || 0); i++) {
      const radius = 2 + ((time * 0.3 + i * 2.8) % 8);
      water.ripples[i].size = [radius, 0.045, radius * 0.74];
      water.ripples[i].opacity = (1 - (radius - 2) / 8) * 0.15;
    }
  }
}
