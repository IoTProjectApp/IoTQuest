// Low-poly farm animals. Each animal is a set of meshes with offsets in its own frame (x is
// forward, y is up); updateAnimals moves it around its paddock, turning towards a target,
// alternating between walking and grazing (head down), and places every part each frame.
// setGoal sends an animal along a route (through gates, into sheds) to graze in new bounds.

// [shape, local position, size, colour key or colour, role]
const BODIES = {
  cow: [
    ['box', [0, 1.0, 0], [1.7, 0.75, 0.75], 'coat'],
    ['box', [0.25, 1.06, 0], [0.5, 0.5, 0.78], 'patch'],
    ['box', [-0.5, 1.0, 0], [0.45, 0.55, 0.78], 'patch'],
    ['box', [1.05, 1.15, 0], [0.5, 0.45, 0.42], 'coat', 'head'],
    ['box', [1.33, 1.05, 0], [0.18, 0.22, 0.34], '#e4a6a0', 'head'],
    ['box', [1.0, 1.42, 0.24], [0.08, 0.08, 0.16], '#efe7d2', 'head'],
    ['box', [1.0, 1.42, -0.24], [0.08, 0.08, 0.16], '#efe7d2', 'head'],
    ['sphere', [-0.35, 0.58, 0], [0.32, 0.22, 0.3], '#e4a6a0'],
    ['box', [-0.9, 0.85, 0], [0.06, 0.6, 0.06], 'patch'],
    ...legs(0.6, 0.25, 0.65, 0.09, '#3a3430'),
  ],
  sheep: [
    ['sphere', [0, 0.75, 0], [1.1, 0.72, 0.78], 'coat'],
    ['sphere', [-0.25, 0.92, 0], [0.7, 0.5, 0.6], 'coat'],
    ['box', [0.6, 0.84, 0], [0.3, 0.3, 0.26], 'patch', 'head'],
    ['box', [0.55, 0.92, 0.18], [0.08, 0.06, 0.14], 'patch', 'head'],
    ['box', [0.55, 0.92, -0.18], [0.08, 0.06, 0.14], 'patch', 'head'],
    ...legs(0.3, 0.18, 0.45, 0.05, '#2f2b28'),
  ],
  horse: [
    ['box', [0, 1.35, 0], [1.6, 0.65, 0.55], 'coat'],
    ['box', [0.75, 1.62, 0], [0.42, 0.45, 0.32], 'coat', 'head'],
    ['box', [0.95, 1.95, 0], [0.36, 0.45, 0.28], 'coat', 'head'],
    ['box', [1.22, 2.02, 0], [0.55, 0.26, 0.24], 'coat', 'head'],
    ['box', [0.85, 1.95, 0], [0.12, 0.5, 0.06], 'patch', 'head'],
    ['box', [-0.85, 1.2, 0], [0.12, 0.65, 0.12], 'patch'],
    ...legs(0.6, 0.18, 1.0, 0.07, 'patch'),
  ],
  goat: [
    ['box', [0, 0.72, 0], [0.85, 0.42, 0.36], 'coat'],
    ['box', [0.5, 0.95, 0], [0.3, 0.3, 0.24], 'coat', 'head'],
    ['box', [0.62, 0.78, 0], [0.06, 0.14, 0.06], 'patch', 'head'],
    ['cone', [0.45, 1.16, 0.07], [0.06, 0.2, 0.06], '#d9cfb8', 'head'],
    ['cone', [0.45, 1.16, -0.07], [0.06, 0.2, 0.06], '#d9cfb8', 'head'],
    ...legs(0.3, 0.13, 0.5, 0.04, 'patch'),
  ],
  chicken: [
    ['sphere', [0, 0.3, 0], [0.34, 0.28, 0.24], 'coat'],
    ['sphere', [0.16, 0.45, 0], [0.16, 0.16, 0.14], 'coat', 'head'],
    ['box', [0.17, 0.54, 0], [0.09, 0.07, 0.03], '#c9372c', 'head'],
    ['box', [0.25, 0.44, 0], [0.07, 0.03, 0.04], '#e3a53a', 'head'],
    ['box', [-0.17, 0.4, 0], [0.08, 0.16, 0.1], 'patch'],
    ['box', [0.02, 0.1, 0.05], [0.02, 0.2, 0.02], '#e3a53a'],
    ['box', [0.02, 0.1, -0.05], [0.02, 0.2, 0.02], '#e3a53a'],
  ],
  duck: [
    ['sphere', [0, 0.22, 0], [0.44, 0.24, 0.26], 'coat'],
    ['sphere', [0.22, 0.38, 0], [0.15, 0.15, 0.13], 'patch', 'head'],
    ['box', [0.33, 0.36, 0], [0.13, 0.04, 0.08], '#e8902f', 'head'],
  ],
  dog: [
    ['box', [0, 0.5, 0], [0.72, 0.28, 0.24], 'coat'],
    ['box', [0.45, 0.66, 0], [0.3, 0.24, 0.22], 'coat', 'head'],
    ['box', [0.62, 0.6, 0], [0.12, 0.1, 0.12], 'patch', 'head'],
    ['cone', [0.42, 0.84, 0.07], [0.07, 0.14, 0.04], 'coat', 'head'],
    ['cone', [0.42, 0.84, -0.07], [0.07, 0.14, 0.04], 'coat', 'head'],
    ['box', [-0.42, 0.58, 0], [0.24, 0.06, 0.06], 'coat'],
    ...legs(0.25, 0.08, 0.38, 0.035, 'patch'),
  ],
};
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
};
const SPEED = { cow: 0.45, sheep: 0.55, horse: 0.9, goat: 0.6, chicken: 0.35, duck: 0.3, dog: 1.5 };

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
  for (const [shape, local, size, colour, role] of BODIES[kind]) {
    const fill = colour === 'coat' ? coat : colour === 'patch' ? patch : colour,
      mesh = model.mesh(shape, [0, 0, 0], size, fill, { animal: kind });
    animal.parts.push({ mesh, local, role });
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
  for (const { mesh, local, role } of animal.parts) {
    const [lx, ly, lz] = local,
      // Heads dip forward and down while grazing.
      dy = role === 'head' ? -graze * (ly > 0.6 ? 1.6 : 0.8) : role === 'leg' ? 0 : bob,
      dx = role === 'head' ? graze * 0.4 : 0;
    // Rotation about y: local x (forward) maps to (cos, -sin) in the ground plane.
    mesh.pos[0] = animal.x + (lx + dx) * cos + lz * sin;
    mesh.pos[1] = ly + dy;
    mesh.pos[2] = animal.z - (lx + dx) * sin + lz * cos;
    mesh.rotation[1] = animal.heading;
    if (animal.hidden) mesh.opacity = 0;
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
