// Sun, moon and stars. Like the clouds, they sit in a band beyond the far edge of the property
// as seen from the camera, so they stay in the background as the view rotates. Their visibility
// follows the simulated light level: the sun by day, the moon and twinkling stars by night.

// Camera-relative positions: [across, height, distance (negative = away from the camera)].
const SUN = [21, 1.5, -28],
  MOON = [-20, 1.3, -27];
// Craters on the side of the moon that faces the camera: [across, height, size].
const CRATERS = [
  [-0.45, 0.35, 0.34],
  [0.4, -0.2, 0.26],
  [0.1, 0.55, 0.18],
];
const STAR_COUNT = 70;

function seeded(seed) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}

export function addSky(model) {
  const rand = seeded(4242),
    hidden = { opacity: 0, sky: true };
  const stars = Array.from({ length: STAR_COUNT }, () => {
    const across = (rand() - 0.5) * 80,
      height = 0.6 + rand() * 4.2,
      away = -27 - rand() * 12,
      radius = 0.06 + rand() * 0.1;
    return {
      at: [across, height, away],
      phase: rand() * Math.PI * 2,
      mesh: model.sphere(0, 0, 0, radius, '#f4f1dc', { ...hidden, emission: 1 }),
    };
  });
  return {
    stars,
    sun: { at: SUN, mesh: model.sphere(0, 0, 0, 1.5, '#ffd56b', { ...hidden, emission: 1 }) },
    moon: {
      at: MOON,
      mesh: model.sphere(0, 0, 0, 1.45, '#eef0e6', { ...hidden, emission: 0.95 }),
      // A soft glow around the moon on clear nights.
      halo: model.sphere(0, 0, 0, 2.6, '#c9d6ec', { ...hidden, emission: 1 }),
      craters: CRATERS.map(([across, height, size]) => ({
        at: [MOON[0] + across, MOON[1] + height, MOON[2] + 1.2],
        mesh: model.sphere(0, 0, 0, size, '#c8ccc0', { ...hidden, emission: 0.8 }),
      })),
    },
  };
}

// Storm lightning: a quick double flash every few seconds of real time (none with reduced motion).
export function lightningFlash(env, seconds, reduced) {
  const stormy = (env.rain || 0) >= 55 && ((env.wind || 0) >= 30 || (env.cloud || 0) >= 85);
  if (!stormy || reduced) return 0;
  const phase = (seconds % 6.7) / 6.7;
  return phase < 0.015 ? 1 : phase > 0.03 && phase < 0.045 ? 0.6 : 0;
}

// `daylight` is 0 at night and 1 in full day; `yaw` is the camera's orbit angle. Cloud cover
// and rain hide the stars first, then dim the moon and sun.
export function updateSky(sky, daylight, t, reduced, yaw = 0.32, env = {}) {
  if (!sky) return;
  const cos = Math.cos(yaw),
    sin = Math.sin(yaw),
    place = (mesh, [across, height, away]) => {
      mesh.pos[0] = across * cos + away * sin;
      mesh.pos[1] = height;
      mesh.pos[2] = -across * sin + away * cos;
    },
    night = 1 - daylight,
    cover = Math.min(1, Math.max(0, (env.cloud || 0) / 100)),
    rain = Math.min(1, Math.max(0, (env.rain || 0) / 40)),
    // How much of the sky's light gets through the weather.
    clearSky = (1 - Math.max(0, cover - 0.5) * 1.5) * (1 - rain * 0.85),
    moonLevel = (night > 0.45 ? Math.min(1, (night - 0.45) * 3) : 0) * Math.max(0, clearSky);
  place(sky.sun.mesh, sky.sun.at);
  sky.sun.mesh.opacity =
    (daylight > 0.45 ? Math.min(1, (daylight - 0.45) * 3) : 0) * Math.max(0, clearSky);
  place(sky.moon.mesh, sky.moon.at);
  sky.moon.mesh.opacity = moonLevel;
  place(sky.moon.halo, sky.moon.at);
  sky.moon.halo.opacity = moonLevel * 0.16 * (1 - cover);
  for (const crater of sky.moon.craters) {
    place(crater.mesh, crater.at);
    crater.mesh.opacity = moonLevel;
  }
  const starLevel =
    (night > 0.55 ? Math.min(1, (night - 0.55) * 3) : 0) * (1 - cover) ** 1.5 * (1 - rain);
  for (const star of sky.stars) {
    place(star.mesh, star.at);
    star.mesh.opacity = starLevel * (reduced ? 0.85 : 0.6 + 0.4 * Math.sin(t * 2.3 + star.phase));
  }
}
