import { calculateSky, DEFAULT_OBSERVER } from './astronomy.js';
import { brightStars } from './data/bright-stars.js';

export function addSky(model) {
  const hidden = { opacity: 0, sky: true };
  return {
    stars: brightStars.map((star, i) => ({
      id: star.id,
      phase: i * 1.7,
      mesh: model.sphere(0, 0, 0, 0.06 + Math.max(0, 3 - star.mag) * 0.022, star.color, {
        ...hidden,
        emission: 1,
      }),
    })),
    sun: { mesh: model.sphere(0, 0, 0, 0.55, '#fff0c4', { ...hidden, emission: 1 }) },
    moon: {
      mesh: model.sphere(0, 0, 0, 0.55, '#e6e8e5', { ...hidden, moonSurface: true }),
      halo: model.sphere(0, 0, 0, 1.4, '#c9d6ec', { ...hidden, emission: 1 }),
      craters: [],
    },
  };
}

export function lightningFlash(env, seconds, reduced) {
  const stormy =
    env.thunder || ((env.rain || 0) >= 55 && ((env.wind || 0) >= 30 || (env.cloud || 0) >= 85));
  if (!stormy || reduced) return 0;
  const phase = (seconds % 6.7) / 6.7;
  return phase < 0.015 ? 1 : phase > 0.03 && phase < 0.045 ? 0.6 : 0;
}

// Horizontal coordinates stay fixed to geographic north/east as the camera moves.
// Cache ephemerides to the nearest simulated minute; weather/twinkle still update per frame.
export function updateSky(
  sky,
  daylight,
  t,
  reduced,
  yaw = 0.32,
  env = {},
  extra = 0,
  context = {},
) {
  if (!sky) return;
  const date = context.date || new Date(),
    location = context.location || DEFAULT_OBSERVER;
  const bucket = Math.floor(date.getTime() / 60000),
    key = location.latitude + ':' + location.longitude + ':' + bucket;
  if (sky.key !== key) {
    sky.ephemeris = calculateSky(new Date(bucket * 60000), location);
    sky.key = key;
  }
  const ephemeris = sky.ephemeris,
    radius = 120,
    origin = context.eye || [0, 0, 0],
    mirrored = context.mirrored ? -1 : 1,
    place = (mesh, direction) => {
      // Updated in place: this runs for every catalogue star on every frame.
      mesh.pos[0] = origin[0] + direction[0] * radius * mirrored;
      mesh.pos[1] = origin[1] + direction[1] * radius;
      mesh.pos[2] = origin[2] + direction[2] * radius;
    },
    cover = Math.min(1, Math.max(0, (env.cloud || 0) / 100)),
    rain = Math.min(1, Math.max(0, (env.rain || 0) / 40)),
    clearSky = Math.max(0, (1 - Math.max(0, cover - 0.5) * 1.5) * (1 - rain * 0.85)),
    // Astronomical twilight determines star visibility, rather than a light sensor slider.
    night = Math.max(0, Math.min(1, (-ephemeris.sun.altitude - 6) / 12));
  place(sky.sun.mesh, ephemeris.sun.direction);
  sky.sun.mesh.size.fill(Math.tan(ephemeris.sun.angularRadius) * radius * 2);
  sky.sun.mesh.opacity = ephemeris.sun.altitude > 0 ? clearSky : 0;
  place(sky.moon.mesh, ephemeris.moon.direction);
  const moonDiameter = Math.tan(ephemeris.moon.angularRadius) * radius * 2;
  sky.moon.mesh.size.fill(moonDiameter);
  sky.moon.mesh.opacity = ephemeris.moon.altitude > 0 ? clearSky : 0;
  sky.moon.mesh.skySun = ephemeris.sun.direction.map((v, i) => (i === 0 ? v * mirrored : v));
  place(sky.moon.halo, ephemeris.moon.direction);
  sky.moon.halo.size.fill(moonDiameter * 2.6);
  sky.moon.halo.opacity =
    sky.moon.mesh.opacity * night * ephemeris.moon.illumination * 0.08 * (1 - cover);
  const starLevel =
    night *
    (1 - cover) ** 1.5 *
    (1 - rain) *
    (1 - ephemeris.moon.illumination * sky.moon.mesh.opacity * 0.25);
  for (let i = 0; i < sky.stars.length; i++) {
    const star = sky.stars[i],
      point = ephemeris.stars[i];
    place(star.mesh, point.direction);
    const horizonFade = Math.max(0, Math.min(1, point.altitude / 8)),
      brightness = Math.min(1, Math.pow(10, -0.16 * point.mag));
    star.mesh.opacity =
      starLevel *
      horizonFade *
      brightness *
      (reduced ? 0.9 : 0.85 + 0.15 * Math.sin(t * 2.3 + star.phase));
  }
  sky.visibleStars = sky.stars.filter((s) => s.mesh.opacity > 0.01).length;
}
