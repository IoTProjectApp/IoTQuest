import { figure, placeFigure, gaitPose, standPose } from './figures.js';
import { JUDO_PAIRS, JUDO_GAP } from './judo-dojo.js';

// The dojo class as jointed figures in white gi, drawn over the hidden judoka actors. Students
// work in pairs on a 9.6 s cycle: they take grips, the thrower (tori) drills three turn-in entries
// (uchikomi), then completes a shoulder throw and the partner (uke) breakfalls onto the mat, gets
// up and walks back in. Partners swap roles each cycle. The instructor walks between the pairs,
// arms folded, and watches each in turn. Coordinates are local to the dojo lot.
const GI = '#f1eee4',
  HAIR = ['#2b2420', '#5a3e2b', '#1e1b19', '#8a6a43', '#3a2a1f'],
  MAT = 0.27,
  CYCLE = 9.6,
  REP = 1.4,
  STEP_IN = 0.45,
  LAND = STEP_IN - 1.1,
  HIP = 1.2,
  LYING = 0.42;

const lerp = (a, b, s) => a + (b - a) * s;
const smooth = (a, b, s) => {
  const k = Math.max(0, Math.min(1, (s - a) / (b - a)));
  return k * k * (3 - 2 * k);
};
const turn = (a, b, s) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * s;
const mix = (p, q, s) => ({
  legs: p.legs.map((l, i) => l.map((v, j) => lerp(v, q.legs[i][j], s))),
  arms: p.arms.map((a, i) => a.map((v, j) => lerp(v, q.arms[i][j], s))),
  lean: lerp(p.lean ?? 0, q.lean ?? 0, s),
  bob: 0,
});
const pose = (legs, arms, lean) => ({ legs, arms, lean, bob: 0 });

const STAND = standPose();
// Knees soft, right foot forward; right hand on the partner's lapel, left on their sleeve.
const GRIP = pose(
  [
    [0.3, 0.45],
    [0.05, 0.3],
  ],
  [
    [0.95, 0.75],
    [0.7, 1.0],
  ],
  0.12,
);
// Turned in with the hips below the partner's: knees deep, pulling them onto the back.
const ENTRY = pose(
  [
    [0.6, 1.15],
    [0.45, 1.0],
  ],
  [
    [1.35, 1.2],
    [0.55, 1.45],
  ],
  0.45,
);
const THROW = pose(
  [
    [0.35, 0.6],
    [0.15, 0.35],
  ],
  [
    [0.9, 0.35],
    [0.45, 0.7],
  ],
  0.85,
);
// Upright after the throw, still holding the partner's sleeve as they land.
const HOLD = pose(
  [
    [0.1, 0.15],
    [-0.05, 0.1],
  ],
  [
    [0.6, 0.2],
    [0.1, 0.2],
  ],
  0.2,
);
const PULLED = pose(
  [
    [-0.1, 0.1],
    [0.12, 0.2],
  ],
  [
    [0.9, 0.55],
    [0.9, 0.55],
  ],
  0.28,
);
const FLIGHT = pose(
  [
    [0.25, 0.4],
    [0.6, 0.9],
  ],
  [
    [1.2, 0.3],
    [0.5, 0.2],
  ],
  0,
);
// On the back, one knee up, arms slapping the mat beside the body.
const BREAKFALL = pose(
  [
    [0.9, 1.4],
    [0.2, 0.1],
  ],
  [
    [0.3, 0],
    [0.3, 0],
  ],
  0,
);
const SQUAT = pose(
  [
    [1.6, 2.3],
    [1.4, 2.2],
  ],
  [
    [1.0, 0.6],
    [1.0, 0.6],
  ],
  0.45,
);
const FOLDED = pose(STAND.legs, [
  [0.7, 1.7],
  [0.7, 1.7],
]);

export function addJudoClass(item, { add, ball, lotOrigin }) {
  const dress = (actor, i) => {
    const p = figure(add, ball, lotOrigin, {
      x: actor.x - lotOrigin.x,
      z: actor.z - lotOrigin.z,
      shirt: GI,
      shorts: GI,
      skin: actor.skin,
    });
    // Long gi sleeves and trousers, bare feet, a belt at the waist and hair.
    for (const leg of p.legs) {
      leg.thigh.color = leg.shin.color = GI;
      leg.shoe.color = actor.skin;
    }
    for (const arm of p.arms) arm.lower.color = GI;
    p.belt = add(0, -20, 0, 0.49, 0.07, 0.33, actor.belt, { bevel: 0.03 });
    p.hair = ball(0, -20, 0, 0.158, HAIR[i % HAIR.length]);
    p.actor = actor;
    item.furniture.push(...p.meshes, p.belt, p.hair);
    return p;
  };
  const students = item.students.map((s, i) => dress(s, i + 1));
  return {
    instructor: dress(item.instructor, 0),
    pairs: JUDO_PAIRS.map((spot, i) => ({
      ...spot,
      people: students.slice(i * 2, i * 2 + 2),
      offset: i * 4.3,
    })),
  };
}

export function updateJudoClass(judo, t, reduced) {
  for (const pair of judo.pairs) updatePair(pair, t, reduced);
  updateInstructor(judo, t, reduced);
}

// The direction a judoka in conversation faces, as world3d turns their hidden actor to the player.
function talkAngle(p) {
  if (!p.actor.talkPosition) return null;
  const body = p.actor.parts.find((m) => m.local[1] === 0.8),
    heading = body.rotation?.[1] ?? p.actor.heading;
  return Math.atan2(Math.cos(heading), Math.sin(heading));
}

// Places a figure and keeps its belt, hair and actor with it. `roll` turns the whole body head
// over heels about the hips (forward, radians) and `hip` then moves the hips to [x, height, z].
function put(p, x, z, angle, pose, roll = 0, hip = null) {
  placeFigure(p, x, z, angle, pose, MAT);
  if (roll) {
    const fx = Math.cos(angle),
      fz = Math.sin(angle),
      c = Math.cos(roll),
      s = Math.sin(roll),
      [ox, oy, oz] = p.shorts.pos;
    for (const m of p.meshes) {
      const dx = m.pos[0] - ox,
        dy = m.pos[1] - oy,
        dz = m.pos[2] - oz,
        f = dx * fx + dz * fz,
        l = -dx * fz + dz * fx,
        rf = f * c + dy * s;
      m.pos = [
        p.origin.x + hip[0] + rf * fx - l * fz,
        hip[1] - f * s + dy * c,
        p.origin.z + hip[2] + rf * fz + l * fx,
      ];
      m.rotation = [m.rotation[0] + roll, m.rotation[1], 0];
    }
    p.x = hip[0];
    p.z = hip[2];
  }
  const { shorts, torso, head } = p,
    up = [0, 1, 2].map((i) => head.pos[i] - shorts.pos[i]),
    n = Math.hypot(...up) || 1;
  p.belt.pos = [0, 1, 2].map((i) => lerp(shorts.pos[i], torso.pos[i], 0.4));
  p.belt.rotation = [...torso.rotation];
  p.hair.pos = [0, 1, 2].map((i) => head.pos[i] + (up[i] / n) * 0.035);
  p.actor.x = p.origin.x + p.x;
  p.actor.z = p.origin.z + p.z;
}

function updatePair(pair, t, reduced) {
  const time = t + pair.offset,
    n = reduced ? 0 : Math.floor(time / CYCLE),
    c = reduced ? 0.8 : time - n * CYCLE,
    [tori, uke] = n % 2 ? [...pair.people].reverse() : pair.people,
    ahead = Math.PI / 2,
    back = -Math.PI / 2,
    at = (u) => pair.z + u;
  // Partners stop to chat in place, facing each other; the one talking faces the technician.
  if (pair.people.some((p) => p.actor.talkPosition)) {
    for (const p of pair.people) {
      const other = pair.people.find((q) => q !== p);
      put(p, p.x, p.z, talkAngle(p) ?? Math.atan2(other.z - p.z, other.x - p.x), STAND);
    }
    return;
  }
  // The thrower: grips, three entries, the throw, then steps back to become the partner.
  if (c < 0.8) put(tori, pair.x, at(0), ahead, mix(STAND, GRIP, smooth(0, 0.8, c)));
  else if (c < 6.2) {
    const e =
        c < 5
          ? smooth(0, 0.35, ((c - 0.8) % REP) / REP) *
            (1 - smooth(0.6, 0.95, ((c - 0.8) % REP) / REP))
          : smooth(5, 5.4, c),
      stance = c < 5.4 ? mix(GRIP, ENTRY, e) : mix(ENTRY, THROW, smooth(5.4, 6, c));
    put(tori, pair.x, at(STEP_IN * e), ahead + Math.PI * e, stance);
  } else if (c < 8.4) put(tori, pair.x, at(STEP_IN), back, mix(THROW, HOLD, smooth(6.2, 7, c)));
  else {
    const s = smooth(8.4, 9.2, c);
    put(
      tori,
      pair.x,
      at(lerp(STEP_IN, JUDO_GAP, s)),
      back,
      s < 1 ? mix(gaitPose(-(c - 8.4) * 7), STAND, s) : STAND,
    );
  }
  // The partner: pulled forward on each entry, thrown over the back, breakfalls and gets up.
  if (c < 5.4) {
    const e =
      c < 0.8
        ? 0
        : c < 5
          ? smooth(0, 0.35, ((c - 0.8) % REP) / REP) *
            (1 - smooth(0.6, 0.95, ((c - 0.8) % REP) / REP))
          : smooth(5, 5.4, c);
    put(
      uke,
      pair.x,
      at(JUDO_GAP - 0.1 * e),
      back,
      c < 0.8 ? mix(STAND, GRIP, smooth(0, 0.8, c)) : mix(GRIP, PULLED, e),
    );
  } else if (c < 6.2) {
    const s = smooth(5.4, 6.2, c);
    put(uke, pair.x, at(JUDO_GAP), back, FLIGHT, 1.5 * Math.PI * s, [
      pair.x,
      lerp(HIP, LYING, s) + Math.sin(Math.PI * s) * 0.55,
      at(lerp(JUDO_GAP - 0.1, LAND, s)),
    ]);
  } else if (c < 7.4) {
    const slap = 1 - smooth(6.2, 6.4, c);
    put(
      uke,
      pair.x,
      at(LAND),
      back,
      mix(BREAKFALL, { ...BREAKFALL, arms: BREAKFALL.arms.map(() => [1.1, 0]) }, slap),
      1.5 * Math.PI,
      [pair.x, LYING, at(LAND)],
    );
  } else if (c < 8.4) {
    const g = smooth(7.4, 8.4, c);
    put(
      uke,
      pair.x,
      at(LAND),
      back,
      g < 0.5 ? mix(BREAKFALL, SQUAT, g * 2) : mix(SQUAT, STAND, g * 2 - 1),
      (1.5 + 0.5 * g) * Math.PI,
      [pair.x, lerp(LYING, HIP, g ** 1.5), at(LAND - 0.35 * g)],
    );
  } else {
    // Turns round and walks back in to take the thrower's place.
    const s = smooth(8.8, 9.6, c);
    put(
      uke,
      pair.x,
      at(lerp(LAND - 0.35, 0, s)),
      turn(back, ahead, smooth(8.4, 8.8, c)),
      c > 8.8 && s < 1 ? gaitPose((c - 8.8) * 8) : STAND,
    );
  }
}

// The instructor's round: watch the first pair, the second, then both from behind the mat.
const ROUND = [
  { x: -1.5, z: -4.2, watch: 0 },
  { x: 3.5, z: -4.2, watch: 1 },
  { x: 1, z: 2.6, watch: null },
];
function updateInstructor(judo, t, reduced) {
  const p = judo.instructor,
    talking = talkAngle(p);
  if (talking !== null) return put(p, p.x, p.z, talking, STAND);
  const facing = (stop) => {
    const pair = stop.watch === null ? { x: 1, z: -1 } : judo.pairs[stop.watch];
    return Math.atan2(pair.z + JUDO_GAP / 2 - stop.z, pair.x - stop.x);
  };
  const legs = ROUND.map((stop, i) => {
    const next = ROUND[(i + 1) % ROUND.length];
    return { stop, next, walk: Math.hypot(next.x - stop.x, next.z - stop.z) / 1.3 };
  });
  const period = legs.reduce((sum, l) => sum + 4 + l.walk, 0);
  let s = reduced ? 0 : t % period;
  for (const { stop, next, walk } of legs) {
    if (s < 4) {
      return put(p, stop.x, stop.z, facing(stop), { ...FOLDED, lean: Math.sin(t * 0.7) * 0.02 });
    }
    s -= 4;
    if (s < walk) {
      const k = s / walk,
        dir = Math.atan2(next.z - stop.z, next.x - stop.x),
        angle = turn(turn(facing(stop), dir, smooth(0, 0.12, k)), facing(next), smooth(0.88, 1, k));
      return put(
        p,
        lerp(stop.x, next.x, k),
        lerp(stop.z, next.z, k),
        angle,
        gaitPose(s * 5.5, 0.05),
      );
    }
    s -= walk;
  }
}
