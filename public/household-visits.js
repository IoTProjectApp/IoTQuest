import { collides, clearPath } from './world-math.js';

// The parts of household visits (see game.js) that need nothing but their arguments: which request
// a visitor comes about, where they walk in from, and stepping them along.

// The request a visitor comes about in `area`: an urgent one, then the one in progress, then the
// next unfinished. quests: the active quests; done(i), urgent (a set of indices), current (index).
export function visitRequest({ quests, done, urgent, current, area }) {
  const open = quests.map((m, i) => i).filter((i) => quests[i].area === area && !done(i));
  const index = open.find((i) => urgent.has(i)) ?? (open.includes(current) ? current : open[0]);
  return index === undefined ? null : { index, mission: quests[index] };
}

// Where a visitor walks in from to stand at spot [x, z]: about `distance` metres beyond it, seen
// from the technician at [x, z], or the nearest direction to that with open floor and a clear
// line to the spot; the spot itself when every direction is blocked.
export function visitEntry({ spot, from, colliders, distance = 3.5 }) {
  const [sx, sz] = spot,
    away = Math.atan2(sx - from[0], sz - from[1]);
  for (const turn of [0, 0.6, -0.6, 1.2, -1.2, 1.8, -1.8, 2.5, -2.5, Math.PI]) {
    const a = away + turn,
      x = sx + Math.sin(a) * distance,
      z = sz + Math.cos(a) * distance;
    if (!collides(x, z, colliders) && clearPath({ x: sx, z: sz }, { x, z }, colliders))
      return [x, z];
  }
  return [sx, sz];
}

// Moves walker ({ x, z }) towards target [x, z] at `speed` metres a second for dt seconds;
// returns true once it has arrived.
export function stepToward(walker, target, speed, dt) {
  const dx = target[0] - walker.x,
    dz = target[1] - walker.z,
    d = Math.hypot(dx, dz),
    step = speed * dt;
  if (d > step) {
    walker.x += (dx / d) * step;
    walker.z += (dz / d) * step;
    return false;
  }
  [walker.x, walker.z] = target;
  return true;
}
