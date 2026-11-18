// Low-poly cumulus clouds. Each cloud is a cluster of overlapping, slightly flattened puffs on
// a flat, greyer base. Clouds sit in a band beyond the far edge of the property *as seen from
// the camera*, so they follow the view as it rotates and never come between the camera and the
// house. Cloud cover decides how many clouds are in the sky; rain and heavy cover turn them grey.

// Camera-relative layout: [across, height, distance (negative = away from the camera), scale,
// cover % at which the cloud appears]. Every cloud is farther away than the property's corners.
const LAYOUT = [
  [-14, 2.6, -24, 1.55, 5],
  [3, 3.4, -27, 1.8, 15],
  [17, 2.4, -24.5, 1.4, 25],
  [-4, 2.1, -25, 1.3, 35],
  [27, 3.1, -28, 1.6, 45],
  [-27, 3.2, -27, 1.5, 55],
  [11, 4, -31, 1.9, 65],
  [-14, 4.3, -32, 1.7, 75],
  [24, 4.2, -33, 1.45, 85],
];
export const CLOUD_MIN_DISTANCE = 22;
const NIGHT = { top: '#4b566b', base: '#333d50' };
const COLORS = {
  top: ['#f8fafc', '#a2abb3'],
  base: ['#dfe5ea', '#7f8890'],
};

function seeded(seed) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}

// Blend two #rrggbb colours (amount 0 gives a, 1 gives b).
function mix(a, b, amount) {
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

export function addClouds(model) {
  return LAYOUT.map(([x, y, z, scale, threshold], index) => {
    const rand = seeded(index * 7919 + 17),
      puffs = [];
    const puff = (offset, size, tone) =>
      puffs.push({
        offset,
        size,
        tone,
        mesh: model.mesh('sphere', [x, y, z], size, COLORS[tone][0], { opacity: 0, cloud: true }),
      });
    // A wide, flat base gives the cloud its level underside.
    puff([0, 0, 0], [3.8 * scale, 0.75 * scale, 2.1 * scale], 'base');
    // Rounded puffs on top, largest towards the middle.
    const count = 4 + (index % 3);
    for (let k = 0; k < count; k++) {
      const u = k / (count - 1) - 0.5,
        r = (0.95 - Math.abs(u) * 0.9 + rand() * 0.25) * scale;
      puff(
        [u * 3.2 * scale, 0.3 * scale + r * 0.5, (rand() - 0.5) * 0.9 * scale],
        [r * 2.1, r * 1.75, r * 1.9],
        'top',
      );
    }
    return { x, y, z, scale, threshold, drift: 0.12 + rand() * 0.1, puffs };
  });
}

// `yaw` is the camera's orbit angle; the layout is rotated so "away" points away from it.
export function updateClouds(clouds, env, t, reduced, yaw = 0.32, daylight = 1, extra = 0) {
  const cos = Math.cos(yaw),
    sin = Math.sin(yaw),
    place = (across, away) => [across * cos + away * sin, -across * sin + away * cos];
  const cover = env.cloud || 0,
    // Quantised so the renderer's colour cache only ever sees a handful of shades.
    storm = Math.round(Math.min(1, Math.max(0, (env.rain || 0) / 80, (cover - 75) / 50)) * 10) / 10,
    wind = 0.3 + Math.min(4, (env.wind || 0) / 15),
    // Clouds take on the night sky's colour after dusk (quantised like the storm shade).
    dusk = Math.round((1 - daylight) * 5) / 5;
  for (const cloud of clouds) {
    const appear = Math.min(1, Math.max(0, (cover - cloud.threshold) / 12)),
      grow = 0.55 + 0.45 * appear,
      // Drift across the view with the wind, wrapping around well outside it.
      across = reduced
        ? cloud.x
        : ((((cloud.x + t * cloud.drift * wind + 34) % 68) + 68) % 68) - 34;
    for (const { mesh, offset, size, tone } of cloud.puffs) {
      const [x, z] = place(across + offset[0] * grow, cloud.z - extra + offset[2] * grow);
      mesh.pos[0] = x;
      mesh.pos[1] = cloud.y + offset[1] * grow;
      mesh.pos[2] = z;
      // Puffs keep their long side across the view.
      mesh.rotation[1] = yaw;
      mesh.size[0] = size[0] * grow;
      mesh.size[1] = size[1] * grow;
      mesh.size[2] = size[2] * grow;
      // Fully formed clouds are opaque so overlapping puffs do not look blotchy.
      mesh.opacity = appear;
      mesh.color = mix(mix(COLORS[tone][0], COLORS[tone][1], storm), NIGHT[tone], dusk);
    }
  }
}
