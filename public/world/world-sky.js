// Life in the sky over the whole world: a high cloud layer that drifts with the wind and flocks of
// birds. Scenery only: nothing here adds colliders. All positions are in world coordinates.

const GROUND = { minX: -312, maxX: 312, minZ: -232, maxZ: 232 };

function seeded(seed) {
  let s = seed >>> 0 || 1;
  return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
}

function buildCloud(add, rand) {
  const puffs = [];
  const n = 4 + Math.floor(rand() * 3),
    scale = 9 + rand() * 7;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1) - 0.5;
    const size = scale * (0.8 + rand() * 0.5) * (1 - Math.abs(t) * 0.6);
    const local = [t * scale * 2.2, (rand() - 0.3) * scale * 0.25, (rand() - 0.5) * scale * 0.6];
    puffs.push({
      mesh: add('sphere', [0, 0, 0], [size * 1.4, size * 0.75, size], '#f6f8fa', {
        surface: 'plain',
        roughness: 1,
      }),
      local,
      base: false,
    });
  }
  puffs.push({
    mesh: add('sphere', [0, 0, 0], [scale * 2.8, scale * 0.35, scale * 1.1], '#dfe5ea', {
      surface: 'plain',
      roughness: 1,
    }),
    local: [0, -scale * 0.2, 0],
    base: true,
  });
  return puffs;
}

function buildBird(add, color) {
  const parts = [];
  const part = (shape, local, size, c, role = 'body', side = 0) =>
    parts.push({ mesh: add(shape, [0, -20, 0], size, c), local, role, side });
  part('sphere', [0, 0, 0], [0.7, 0.24, 0.26], color);
  part('sphere', [0.3, 0.06, 0], [0.22, 0.18, 0.18], color);
  part('cone', [0.46, 0.04, 0], [0.08, 0.16, 0.08], '#bfa06b', 'beak');
  for (const side of [-1, 1])
    part('sphere', [-0.03, 0, side * 0.45], [0.42, 0.05, 0.85], color, 'wing', side);
  return parts;
}

export function addWorldSky(model, { town, seed = 1 }) {
  const rand = seeded(seed * 7919 + 13);
  const objects = [];
  const add = (shape, pos, size, color, extra = {}) => {
    const m = model.mesh(shape, pos, size, color, { community: true, worldSky: true, ...extra });
    objects.push(m);
    return m;
  };
  // Clouds circle the world on two wide rings, outside the town so they never hide it.
  const clouds = [];
  const cx = (GROUND.minX + GROUND.maxX) / 2,
    cz = (GROUND.minZ + GROUND.maxZ) / 2;
  for (let i = 0; i < 22; i++) {
    const ring = i % 2;
    clouds.push({
      puffs: buildCloud(add, rand),
      angle: (i / 22) * Math.PI * 2 + rand() * 0.2,
      rx: (ring ? 300 : 275) + rand() * 15,
      rz: (ring ? 228 : 205) + rand() * 12,
      cx,
      cz,
      y: 48 + rand() * 18,
      order: rand(),
    });
  }
  // Flocks wheel over the land around the town; one crosses high over the town.
  const birds = [];
  const flocks = [
    [cx - 200, cz + 120, 40, 18],
    [cx + 120, cz - 170, 45, 22],
    [cx - 210, cz - 140, 35, 16],
    [(town.minX + town.maxX) / 2, (town.minZ + town.maxZ) / 2, 110, 34],
  ];
  for (const [fi, [fx, fz, radius, height]] of flocks.entries())
    for (let b = 0; b < 5; b++)
      birds.push({
        parts: buildBird(add, b % 2 ? '#3f4a4f' : '#e6e8e2'),
        fx,
        fz,
        radius: radius + b * 2.5,
        height: height + (b % 3) * 1.2,
        angle: b * 0.22 + fi,
        speed: (0.09 + rand() * 0.03) * (fi % 2 ? -1 : 1),
        wing: rand() * 6,
      });
  const sky = { clouds, birds, objects };
  updateWorldSky(sky, { light: 70, wind: 10, cloud: 40, rain: 0 }, 0, true);
  return sky;
}

export function updateWorldSky(o, env, dt, still = false) {
  if (!o) return;
  const step = still ? 0 : Math.max(0, Math.min(0.1, dt || 0));
  const light = env.light ?? 70,
    night = light < 25;
  // Cloud cover sets how many clouds show; rain and night darken them.
  const cover = Math.max(0, Math.min(100, env.cloud ?? 40)),
    rain = Math.max(0, Math.min(100, env.rain || 0)),
    grey = Math.min(1, rain / 60 + cover / 250);
  const wind = Math.max(0, Math.min(80, env.wind || 0));
  for (const cloud of o.clouds) {
    cloud.angle += step * (0.002 + wind * 0.00012);
    const x = cloud.cx + Math.cos(cloud.angle) * cloud.rx,
      z = cloud.cz + Math.sin(cloud.angle) * cloud.rz,
      heading = -cloud.angle;
    const visible = cloud.order * 100 < Math.max(15, cover);
    const c = Math.cos(heading),
      s = Math.sin(heading);
    for (const { mesh, local, base } of cloud.puffs) {
      mesh.pos = [
        x + c * local[0] - s * local[2],
        cloud.y + local[1],
        z + s * local[0] + c * local[2],
      ];
      mesh.rotation = [0, -heading, 0];
      // Opaque clouds are drawn in one batch; see-through ones would each need their own draw.
      mesh.opacity = visible ? 1 : 0;
      mesh.color = night
        ? base
          ? '#333d50'
          : '#4b566b'
        : shade(base ? '#dfe5ea' : '#f6f8fa', base ? '#7f8890' : '#a2abb3', grey);
    }
  }
  for (const bird of o.birds) {
    bird.angle += step * bird.speed;
    bird.wing += step * 6;
    const x = bird.fx + Math.cos(bird.angle) * bird.radius,
      z = bird.fz + Math.sin(bird.angle) * bird.radius * 0.7,
      y = bird.height + Math.sin(bird.angle * 3) * 0.8,
      heading = Math.atan2(
        Math.cos(bird.angle) * bird.radius * 0.7 * Math.sign(bird.speed),
        -Math.sin(bird.angle) * bird.radius * Math.sign(bird.speed),
      ),
      flap = Math.sin(bird.wing) * 0.6;
    const c = Math.cos(heading),
      s = Math.sin(heading);
    for (const part of bird.parts) {
      const [lx, ly, lz] = part.local,
        wing = part.role === 'wing',
        localY = ly + (wing ? Math.abs(lz) * Math.sin(flap) : 0),
        localZ = wing ? lz * Math.cos(flap) : lz;
      part.mesh.pos = [x + c * lx - s * localZ, y + localY, z + s * lx + c * localZ];
      part.mesh.rotation = [
        wing ? -part.side * flap : 0,
        -heading,
        part.role === 'beak' ? -Math.PI / 2 : 0,
      ];
      part.mesh.opacity = light < 8 ? 0 : 1;
    }
  }
}

function shade(a, b, amount) {
  return (
    '#' +
    [1, 3, 5]
      .map((i) => {
        const from = parseInt(a.slice(i, i + 2), 16),
          to = parseInt(b.slice(i, i + 2), 16);
        return Math.round(from + (to - from) * amount)
          .toString(16)
          .padStart(2, '0');
      })
      .join('')
  );
}
