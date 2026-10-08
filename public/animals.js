import { livestockModels } from './livestock-models.js';
// Articulated farm animals. Each animal is a set of meshes with offsets in its own frame (x is
// forward, y is up); updateAnimals moves it around its paddock, turning towards a target,
// alternating between walking and grazing (head down), and places every part each frame.
// setGoal sends an animal along a route (through gates, into sheds) to graze in new bounds.

// [shape, local position, size, colour key or colour, role]
const BODIES = { ...livestockModels };
BODIES.deer = [
  ['sphere', [0, 0.91, 0], [1.2, 0.63, 0.45], 'coat'],
  ['sphere', [0.61, 1.2, 0], [0.28, 0.54, 0.25], 'coat', 'head'],
  ['sphere', [0.77, 1.43, 0], [0.39, 0.24, 0.23], 'coat', 'head'],
  ['sphere', [0.64, 1.61, 0.13], [0.15, 0.19, 0.06], 'patch', 'head'],
  ['sphere', [0.64, 1.61, -0.13], [0.15, 0.19, 0.06], 'patch', 'head'],
  ['sphere', [0.97, 1.39, 0], [0.07, 0.07, 0.13], '#333b31', 'head'],
  ...[-1, 1].flatMap((side) => [
    ['cylinder', [0.58, 1.77, side * 0.11], [0.035, 0.35, 0.035], '#b5a080', 'head'],
    ['box', [0.63, 1.82, side * 0.11], [0.19, 0.025, 0.025], '#b5a080', 'head'],
  ]),
  ...legs(0.39, 0.14, 0.66, 0.033, '#50483a'),
];
BODIES.antelope = BODIES.deer
  .filter((row) => !['cylinder', 'box'].includes(row[0]) || row[4] === 'leg')
  .concat(
    [-1, 1].map((side) => [
      'cone',
      [0.57, 1.84, side * 0.09],
      [0.06, 0.43, 0.06],
      '#675b46',
      'head',
    ]),
  );
BODIES.rabbit = [
  ['sphere', [0, 0.24, 0], [0.45, 0.34, 0.28], 'coat'],
  ['sphere', [0.22, 0.4, 0], [0.22, 0.22, 0.2], 'coat', 'head'],
  ['sphere', [0.2, 0.62, 0.055], [0.07, 0.34, 0.055], 'patch', 'head'],
  ['sphere', [0.2, 0.62, -0.055], [0.07, 0.34, 0.055], 'patch', 'head'],
  ['sphere', [-0.23, 0.29, 0], [0.13, 0.13, 0.13], '#e5decd'],
  ...legs(0.12, 0.09, 0.15, 0.025, 'coat'),
];
BODIES.kangaroo = [
  ['sphere', [0, 0.92, 0], [0.55, 1.02, 0.4], 'coat'],
  ['sphere', [0.3, 1.48, 0], [0.39, 0.25, 0.22], 'coat', 'head'],
  ['sphere', [0.19, 1.69, 0.075], [0.09, 0.29, 0.06], 'patch', 'head'],
  ['sphere', [0.19, 1.69, -0.075], [0.09, 0.29, 0.06], 'patch', 'head'],
  ['box', [-0.59, 0.2, 0], [1.05, 0.11, 0.14], 'coat'],
  ...[-1, 1].flatMap((side) => [
    ['sphere', [-0.04, 0.41, side * 0.14], [0.33, 0.43, 0.16], 'coat', 'leg'],
    ['box', [0.11, 0.12, side * 0.14], [0.46, 0.09, 0.11], 'patch', 'leg'],
    ['cylinder', [0.24, 0.91, side * 0.13], [0.055, 0.34, 0.055], 'coat'],
  ]),
];
function legs(along, across, height, radius, colour) {
  return [
    [along, across],
    [along, -across],
    [-along, across],
    [-along, -across],
  ].map(([x, z]) => [
    'cylinder',
    [x, height / 2, z],
    [radius * 2, height, radius * 2],
    colour,
    'leg',
  ]);
}
// Coat/patch colour pairs per breed.
const COATS = {
  cow: [
    ['#f4f1ea', '#2b2724'],
    ['#b9763f', '#8a5430'],
    ['#f4f1ea', '#7a3f26'],
  ],
  sheep: [['#efeadc', '#2f2b28']],
  horse: [
    ['#7b4a2c', '#2e231d'],
    ['#3b2a20', '#1b1512'],
    ['#a9764a', '#4a3424'],
    ['#d8cfc0', '#8c8173'],
  ],
  goat: [
    ['#ece6d9', '#bfb39b'],
    ['#8a5a36', '#3a2a1e'],
    ['#2f2b28', '#d9cfb8'],
  ],
  chicken: [
    ['#f3f0e8', '#d8d0bf'],
    ['#a65a2e', '#3f2a1c'],
    ['#2c2a28', '#3f6b4a'],
  ],
  duck: [
    ['#f4f2ea', '#f4f2ea'],
    ['#8a6a46', '#3f6b4a'],
  ],
  dog: [['#3b2b22', '#c48a52']],
  deer: [
    ['#a48766', '#d5c3a1'],
    ['#8c7559', '#bfac8c'],
  ],
  antelope: [['#b69b71', '#ded1b1']],
  rabbit: [
    ['#8e8979', '#c8bca5'],
    ['#9f927e', '#ddcdb5'],
  ],
  kangaroo: [
    ['#9e8b72', '#6e6455'],
    ['#b09b80', '#89745d'],
  ],
};
const SPEED = {
  cow: 0.45,
  sheep: 0.55,
  horse: 0.9,
  goat: 0.6,
  chicken: 0.35,
  duck: 0.3,
  dog: 1.5,
  deer: 0.7,
  antelope: 0.8,
  rabbit: 0.5,
  kangaroo: 0.8,
};

function seeded(seed) {
  let s = Math.max(1, Math.floor(seed * 7919) % 2147483646);
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}

// Adds an animal of `kind` inside the paddock [x0, z0, x1, z1].
export function addAnimal(model, kind, paddock, seed) {
  const rand = seeded(seed),
    [coat, patch] = COATS[kind][Math.floor(rand() * COATS[kind].length)],
    [x0, z0, x1, z1] = paddock,
    animal = {
      kind,
      paddock,
      rand,
      x: x0 + 1 + rand() * (x1 - x0 - 2),
      z: z0 + 1 + rand() * (z1 - z0 - 2),
      heading: rand() * Math.PI * 2,
      target: null,
      grazeFor: rand() * 4,
      phase: rand() * 10,
      parts: [],
    };
  const scale = livestockModels[kind] ? 1 + Math.sin(seed * 1.7) * 0.035 : 1;
  for (const [shape, local, size, colour, role, options = {}] of BODIES[kind]) {
    const fill = colour === 'coat' ? coat : colour === 'patch' ? patch : colour,
      mesh = model.mesh(
        shape,
        [0, 0, 0],
        size.map((v) => v * scale),
        fill,
        { animal: kind, roughness: shape === 'wool' ? 1 : 0.88, ...options },
      );
    animal.parts.push({
      mesh,
      local: local.map((v) => v * scale),
      role,
      restRotation: [...(options.rotation || [0, 0, 0])],
      opacity: options.opacity,
    });
  }
  model.animals.push(animal);
  pose(animal, 0);
  return animal;
}

function pose(animal, t, walking = false, grazing = false) {
  const cos = Math.cos(animal.heading),
    sin = Math.sin(animal.heading),
    bob = walking ? Math.abs(Math.sin(t * 6 + animal.phase)) * 0.04 : 0,
    graze = grazing ? 0.18 + Math.sin(t * 1.5 + animal.phase) * 0.05 : 0;
  for (const { mesh, local, role, restRotation = [0, 0, 0], opacity } of animal.parts) {
    const [lx, ly, lz] = local,
      // Heads dip forward and down while grazing.
      dy =
        role === 'head'
          ? -graze * (ly > 0.6 ? 1.6 : 0.8)
          : ['leg', 'hoof', 'shadow'].includes(role)
            ? 0
            : bob,
      dx = role === 'head' ? graze * 0.4 : 0;
    // Rotation about y: local x (forward) maps to (cos, -sin) in the ground plane.
    const limb = role === 'leg' || role === 'hoof',
      stride =
        walking && limb
          ? Math.sin(t * 6 + animal.phase + (lx < 0 ? Math.PI : 0) + (lz < 0 ? Math.PI : 0))
          : 0,
      step = stride * 0.1,
      lift = Math.max(0, stride) * 0.045;
    mesh.pos[0] = animal.x + (lx + dx + step) * cos + lz * sin;
    mesh.pos[1] = ly + dy + lift;
    mesh.pos[2] = animal.z - (lx + dx + step) * sin + lz * cos;
    mesh.rotation = [
      restRotation[0],
      animal.heading + restRotation[1],
      restRotation[2] +
        (role === 'leg'
          ? -stride * 0.1
          : role === 'tail'
            ? Math.sin(t * 2 + animal.phase) * 0.08
            : 0),
    ];
    if (animal.hidden) mesh.opacity = 0;
    else if (opacity !== undefined) mesh.opacity = opacity;
    else delete mesh.opacity;
  }
}

// Sends the animal along `route` ([[x, z], ...]) and then lets it graze inside `bounds`. Repeated
// calls with the same key are ignored, so this can be called every frame. `hide` makes the animal
// disappear once it arrives (for example, hens gone in to roost).
export function setGoal(animal, key, route = [], bounds = animal.paddock, hide = false) {
  if (animal.goalKey === key) return;
  animal.goalKey = key;
  animal.route = route.map((p) => [...p]);
  animal.bounds = bounds;
  animal.hideAtEnd = hide;
  animal.hidden = false;
  animal.target = null;
  animal.grazeFor = 0;
}

// `dt` is real seconds since the last frame; animals hold still when paused or reduced motion.
export function updateAnimals(animals, t, dt, still = false) {
  for (const a of animals || []) {
    if (still) {
      pose(a, 0, false, true);
      continue;
    }
    const [x0, z0, x1, z1] = a.bounds || a.paddock,
      routing = a.route?.length > 0;
    if (routing) {
      a.target = a.route[0];
      a.grazeFor = 0;
    }
    if (a.grazeFor > 0) {
      a.grazeFor -= dt;
      if (a.grazeFor <= 0)
        a.target = [x0 + 1 + a.rand() * (x1 - x0 - 2), z0 + 1 + a.rand() * (z1 - z0 - 2)];
      pose(a, t, false, true);
      continue;
    }
    if (!a.target) a.grazeFor = 2 + a.rand() * 6;
    else {
      const dx = a.target[0] - a.x,
        dz = a.target[1] - a.z,
        distance = Math.hypot(dx, dz);
      if (distance < 0.3) {
        a.target = null;
        if (routing) {
          a.route.shift();
          if (!a.route.length) a.hidden = !!a.hideAtEnd;
        }
        a.grazeFor = routing ? 0.5 + a.rand() * 2 : 3 + a.rand() * 8;
      } else {
        // Turn towards the target (heading measured so that forward is (cos, -sin)).
        // On a route animals walk briskly. Outside their bounds (after a new goal) they walk
        // back in rather than jumping to the edge.
        const free = routing || a.x < x0 || a.x > x1 || a.z < z0 || a.z > z1,
          want = Math.atan2(-dz, dx),
          turn = Math.atan2(Math.sin(want - a.heading), Math.cos(want - a.heading));
        a.heading += Math.max(-dt * 3, Math.min(dt * 3, turn));
        if (Math.abs(turn) < 0.6) {
          const step = Math.min(distance, SPEED[a.kind] * (free ? 2.5 : 1) * dt),
            x = a.x + Math.cos(a.heading) * step,
            z = a.z - Math.sin(a.heading) * step;
          a.x = free ? x : Math.min(x1 - 0.5, Math.max(x0 + 0.5, x));
          a.z = free ? z : Math.min(z1 - 0.5, Math.max(z0 + 0.5, z));
        }
      }
    }
    pose(a, t, !!a.target, false);
  }
}
