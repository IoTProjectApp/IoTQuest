// An automatic feed and water station in each farm's livestock paddock. An ultrasonic sensor over
// the feed trough measures how far down the feed is (env.distance, cm) and a servo opens the
// hopper chute to top it up; a level probe in the drinking trough (env.pond) and a pump keep the
// water up. The herd gathers at the station when either runs low.

// Where each farm's stock lives, and candidate station spots inside that paddock.
const SITES = {
  dairy: {
    kind: 'cow',
    paddock: (a) => a.paddock[0] < 0,
    spots: [
      [-26, 2],
      [-26, 10],
      [-28, -6],
    ],
  },
  sheep: {
    kind: 'sheep',
    paddock: (a) => a.paddock[0] < 0,
    spots: [
      [-26, 2],
      [-26, 10],
      [-28, -6],
    ],
  },
  horse: {
    kind: 'horse',
    paddock: (a) => a.paddock[0] < 0,
    spots: [
      [-26, 2],
      [-24, 8],
      [-28, -6],
    ],
  },
  orchard: {
    kind: 'chicken',
    paddock: () => true,
    spots: [
      [6.5, -21.5],
      [7, -26],
      [-10, -26],
    ],
  },
};
// Readings at which the feed is "low" (the sensor sees further down) and the trough is empty.
export const FEED_LOW_CM = 60,
  FEED_EMPTY_CM = 150,
  FEED_FULL_CM = 20;

const clear = (obstacles, x, z, w, d) =>
  !obstacles.some((o) => Math.abs(o.x - x) < (o.w + w) / 2 && Math.abs(o.z - z) < (o.d + d) / 2);

export function buildFeedStation(m, farm, style) {
  const site = SITES[style];
  if (!site) return null;
  const { box, cylinder } = m;
  const [x, z] =
    site.spots.find(([sx, sz]) => clear(farm.obstacles, sx + 1.4, sz, 6.4, 3)) || site.spots[0];
  const steel = { surface: 'steel', farmFeedStation: true };
  // Concrete pad under both troughs.
  box(x + 1.4, 0.05, z, 6.2, 0.06, 2.6, '#bdbab0', { farmFeedStation: true, rounded: false });
  // Feed hopper on legs, with its chute over the feed trough.
  for (const dx of [-0.55, 0.55])
    for (const dz of [-0.55, 0.55])
      box(x + dx, 1.0, z - 0.6 + dz, 0.08, 1.9, 0.08, '#7c8a8c', steel);
  box(x, 2.45, z - 0.6, 1.3, 1.1, 1.3, '#9fa9a6', { ...steel, bevel: 0.06 });
  cylinder(x, 1.85, z - 0.6, 0.45, 0.25, '#8f9a98', steel);
  box(x, 3.03, z - 0.6, 1.36, 0.06, 1.36, '#6f7b7d', steel);
  box(x, 1.55, z - 0.15, 0.32, 0.5, 0.32, '#8f9a98', steel);
  // The servo-driven chute flap (rotates open) and its servo housing.
  const flap = box(x, 1.3, z + 0.02, 0.34, 0.04, 0.3, '#56636a', steel);
  box(x + 0.25, 1.5, z - 0.15, 0.14, 0.12, 0.1, '#2f5f8a', { farmFeedStation: true });
  // Feed trough with its feed, and the ultrasonic sensor on a bracket above it.
  box(x, 0.32, z + 0.55, 2.4, 0.06, 0.6, '#8d969a', steel);
  for (const side of [-1, 1]) {
    box(x + side * 1.17, 0.45, z + 0.55, 0.06, 0.3, 0.6, '#8d969a', steel);
    box(x, 0.45, z + 0.55 + side * 0.28, 2.4, 0.3, 0.06, '#8d969a', steel);
  }
  const feed = box(x, 0.4, z + 0.55, 2.28, 0.1, 0.5, '#c9a457', {
    farmFeedStation: true,
    surface: 'fabric',
    rounded: false,
  });
  box(x - 0.9, 1.1, z + 0.85, 0.06, 1.4, 0.06, '#7c8a8c', steel);
  box(x - 0.9, 1.8, z + 0.6, 0.06, 0.06, 0.5, '#7c8a8c', steel);
  box(x - 0.9, 1.74, z + 0.4, 0.22, 0.1, 0.12, '#2a6d8f', { farmFeedStation: true });
  for (const dx of [-0.05, 0.05])
    cylinder(x - 0.9 + dx, 1.68, z + 0.4, 0.035, 0.03, '#d9dedb', steel);
  // Drinking trough with a level probe, and the pump and pipe that fill it.
  const tx = x + 3;
  box(tx, 0.06, z, 2.2, 0.08, 0.7, '#8d969a', steel);
  for (const side of [-1, 1]) {
    box(tx + side * 1.05, 0.3, z, 0.1, 0.5, 0.7, '#8d969a', steel);
    box(tx, 0.3, z + side * 0.3, 2.1, 0.5, 0.1, '#8d969a', steel);
  }
  const water = box(tx, 0.52, z, 2.0, 0.05, 0.5, '#6f9fb0', {
    surface: 'water',
    farmFeedStation: true,
  });
  box(tx + 0.7, 0.6, z - 0.2, 0.05, 0.6, 0.05, '#d9dedb', steel); // level probe
  box(tx + 1.9, 0.35, z - 0.6, 0.5, 0.5, 0.45, '#2f5f8a', { ...steel, bevel: 0.08 }); // pump
  box(tx + 1.5, 0.75, z - 0.6, 0.8, 0.07, 0.07, '#4b7fa0', steel);
  box(tx + 1.1, 0.68, z - 0.42, 0.07, 0.07, 0.4, '#4b7fa0', steel);
  farm.obstacles.push({ x: x + 1.4, z, w: 6.2, d: 2.6 });
  return (farm.feedStation = { x, z, tx, flap, feed, water, site });
}

export function updateFeedStation(model, devices, outputs, env) {
  const s = model.farm?.feedStation;
  if (!s) return;
  const servoOpen = (devices || []).some((d) => d.id === 'servo' && (outputs?.[d.pin] || 0) > 0);
  s.flap.rotation = [servoOpen ? -1.1 : 0, 0, 0];
  // Feed fills the trough as the sensor reading falls from 150 cm (empty) to 20 cm (full).
  const distance = env.distance ?? 100,
    fill = Math.max(0, Math.min(1, (FEED_EMPTY_CM - distance) / (FEED_EMPTY_CM - FEED_FULL_CM)));
  s.feed.size[1] = 0.02 + fill * 0.24;
  s.feed.pos[1] = 0.35 + s.feed.size[1] / 2;
  s.feed.opacity = fill < 0.03 ? 0 : undefined;
  const level = Math.max(0, Math.min(1, (env.pond ?? 60) / 100));
  s.water.size[1] = 0.03 + level * 0.4;
  s.water.pos[1] = 0.1 + s.water.size[1] / 2;
  s.water.opacity = level < 0.02 ? 0 : undefined;
  // Hungry or thirsty stock gather round the station; farm-assets.js routes them.
  const needy = distance >= FEED_LOW_CM || level < 0.3;
  return {
    claims: (a) => needy && a.kind === s.site.kind && s.site.paddock(a),
    around: [s.x - 2, s.z + 0.8, s.tx + 1.4, s.z + 3.2],
  };
}
