import { figure, placeFigure, gaitPose, standPose, sitPose, handOf, SKIN } from './figures.js';

// Visitors for the recreation areas: a 3-on-3 basketball game, lap swimmers, gym-goers and children
// with their parents at both playgrounds. Coordinates are local to each lot's centre.
export function addRecreationPeople(model, { recreation, origin, box, sphere }) {
  const groups = [];
  for (const item of recreation) {
    const b = item.building;
    const add = (x, y, z, w, h, d, color, extra = {}) =>
      box(b.x + x, y, b.z + z, w, h, d, color, { recreation: b.type, roughness: 0.75, ...extra });
    const ball = (x, y, z, r, color, extra = {}) =>
      sphere(b.x + x, y, b.z + z, r, color, { recreation: b.type, roughness: 0.7, ...extra });
    // Figures are placed in community coordinates, so offset their origin by the lot centre.
    const lotOrigin = { x: origin.x + b.x, z: origin.z + b.z };
    const person = (x, z, shirt, shorts, i, scale = 1) => {
      const p = figure(add, ball, lotOrigin, {
        x,
        z,
        shirt,
        shorts,
        skin: SKIN[i % SKIN.length],
        scale,
      });
      item.furniture.push(...p.meshes);
      return p;
    };
    const group = { type: b.type, item, lotOrigin };
    if (b.type === 'basketball') {
      group.players = [
        ['#d0703f', '#2c3134'],
        ['#3f6f9f', '#e9e4d8'],
      ].flatMap(([shirt, shorts], team) =>
        [-2.5, 0, 2.5].map((x, i) => {
          const p = person(x, team ? 2 : -2, shirt, shorts, team * 3 + i);
          Object.assign(p, { team, slot: i, px: x, pz: team ? 2 : -2, stride: i, facing: 0 });
          return p;
        }),
      );
      group.ball = ball(0, 0.5, 0, 0.13, '#d79052');
      item.furniture.push(group.ball);
    } else if (b.type === 'pool') {
      // Swimmers: a capped head, a body, two arms in a front crawl and two kicking legs.
      group.swimmers = [-2.6, -0.9, 5, 7.2].map((x, i) => {
        const skin = SKIN[(i + 1) % SKIN.length],
          cap = ['#d94f45', '#f2d14b', '#3f7fb5', '#f2f0e6'][i];
        const parts = {
          head: ball(x, 0.2, 0, 0.13, cap),
          body: add(x, 0.1, 0, 0.42, 0.16, 0.9, ['#2f4f6b', '#7a3b52', '#2d5d4f', '#333a40'][i], {
            bevel: 0.08,
          }),
          arms: [-1, 1].map(() => add(x, 0.15, 0, 0.11, 0.62, 0.11, skin, { bevel: 0.05 })),
          legs: [-1, 1].map(() => add(x, 0.08, 0, 0.14, 0.13, 0.85, skin, { bevel: 0.06 })),
        };
        item.furniture.push(parts.head, parts.body, ...parts.arms, ...parts.legs);
        return { x, parts, phase: i * 4.3, speed: 0.9 + (i % 3) * 0.18 };
      });
    } else if (b.type === 'gym') {
      // Two runners on treadmills, a lifter pressing dumbbells and someone doing lunges.
      group.runners = [1, 5].map((x, i) =>
        person(x, -7.6, ['#d0703f', '#5a7fb0'][i], '#2c3134', i + 1),
      );
      group.lifter = person(2, -2.2, '#4f8a6b', '#2c3134', 3);
      group.dumbbells = [0, 1].map(() => add(0, 0, 0, 0.34, 0.12, 0.12, '#3b5058'));
      item.furniture.push(...group.dumbbells);
      group.lunger = person(-3, 10, '#b36a8f', '#2c3134', 4);
    } else if (b.playground) {
      // Children on both swings, at each end of the seesaw and on the slide; parents watching.
      const kids = ['#e0703f', '#5aa0d0', '#f2c94c', '#8fbf6a', '#c27ab8'];
      const swingParts = item.furniture.filter(
        (m) =>
          m.playgroundEquipment === 'swings' &&
          ((m.size[0] === 0.9 && m.size[1] === 0.12) || (m.size[0] === 0.035 && m.size[1] === 2.1)),
      );
      group.swings = [-1.35, 1.35].map((x, i) => ({
        x,
        child: person(x, -8, kids[i], '#41606e', i, 0.6),
        parts: swingParts
          .filter((m) => Math.abs(m.pos[0] - (lotOrigin.x + x)) < 0.5)
          .map((m) => ({ mesh: m, rest: m.pos.slice() })),
        phase: i * 1.3,
      }));
      group.seesaw = [-1, 1].map((side, i) =>
        person(side * 1.9, 7.5, kids[i + 2], '#41606e', i + 2, 0.6),
      );
      group.slider = person(2, 1.5, kids[4], '#41606e', 4, 0.6);
      group.parents = [
        [-4.5, 9.8, '#6f7f8f'],
        [4.5, 9.8, '#9a7f63'],
      ].map(([x, z, shirt], i) => person(x, z, shirt, '#3a4146', i + 3));
    } else continue;
    groups.push(group);
  }
  updateRecreationPeople(groups, 0, true);
  return groups;
}

const toward = (p, x, z) => Math.atan2(z - p.z, x - p.x);
const lerp = (a, b, s) => a + (b - a) * s;
const clamp01 = (s) => Math.max(0, Math.min(1, s));

export function updateRecreationPeople(groups, time, reduced) {
  const t = reduced ? 0 : time;
  for (const g of groups) {
    if (g.players) updateBasketball(g, t, reduced);
    if (g.swimmers) for (const s of g.swimmers) updateSwimmer(g, s, t);
    if (g.runners)
      for (const [i, r] of g.runners.entries())
        placeFigure(r, r.x, r.z, -Math.PI / 2, gaitPose(t * 8.5 + i * 2, 0.55), 0.51);
    if (g.lifter) {
      // Dumbbell shoulder press: from hands at the shoulders to arms straight overhead.
      const s = reduced ? 0 : (1 - Math.cos(t * 1.6)) / 2;
      const arm = [lerp(2.1, 3.05, s), lerp(-1.5, 0, s)];
      placeFigure(g.lifter, g.lifter.x, g.lifter.z, Math.PI / 2, {
        ...standPose(),
        arms: [arm, arm],
      });
      g.dumbbells.forEach((d, i) => {
        d.pos = handOf(g.lifter, i);
        d.rotation = [0, g.lifter.legs[0].thigh.rotation[1], 0];
      });
    }
    if (g.lunger) {
      // Alternating forward lunges.
      const s = reduced ? 0 : Math.max(0, Math.sin(t * 1.4)),
        front = Math.floor((t * 1.4) / Math.PI) % 2;
      const legs = [
        [1.25 * s, 1.5 * s],
        [-0.45 * s, 1.4 * s],
      ];
      placeFigure(g.lunger, g.lunger.x, g.lunger.z, -Math.PI / 2, {
        legs: front ? legs.reverse() : legs,
        arms: [
          [0.2, 1.2],
          [0.2, 1.2],
        ],
        lean: 0.05,
        bob: 0,
      });
    }
    if (g.swings) for (const s of g.swings) updateSwing(s, t, reduced);
    if (g.seesaw)
      g.seesaw.forEach((kid, i) => {
        // Seated on each end of the (fixed, slightly tilted) plank, holding the handles.
        const side = i ? 1 : -1;
        placeFigure(
          kid,
          side * 1.9,
          7.5,
          side > 0 ? Math.PI : 0,
          sitPose(0.96 + side * 0.17 + 0.05, { arms: [1.25, 0.7] }),
        );
      });
    if (g.slider) updateSlide(g.slider, t, reduced);
    if (g.parents)
      g.parents.forEach((p, i) => {
        const pose = standPose({ sway: Math.sin(t * 0.7 + i) * 0.04 });
        if (i === 0)
          // Arms folded while watching.
          pose.arms = [
            [0.7, 1.7],
            [0.7, 1.7],
          ];
        else if (!reduced && t % 9 < 2.2)
          // A wave to the children now and then.
          pose.arms = [pose.arms[0], [2.75, 0.45 + Math.sin(t * 9) * 0.35]];
        placeFigure(p, p.x, p.z, toward(p, 0, 0), pose, 0.22);
      });
  }
}

// One 6 s play per possession: dribble in, pass, the receiver dribbles and takes a jump shot that
// drops through the hoop; then the other team attacks the other end. Defenders shadow their man.
function updateBasketball(g, t, reduced) {
  const dt = Math.max(0, Math.min(0.2, t - (g.lastT ?? t)));
  g.lastT = t;
  const play = Math.floor(t / 6),
    into = t - play * 6,
    attack = play % 2,
    hoopZ = attack ? -11.1 : 11.1,
    dir = Math.sign(hoopZ);
  const offense = g.players.filter((p) => p.team === attack),
    defense = g.players.filter((p) => p.team !== attack);
  const passer = offense[play % 3],
    shooter = offense[(play + 1) % 3];
  const spots = [
    [-3.2, dir * 6.5],
    [0, dir * 5.2],
    [3.2, dir * 6.5],
  ];
  const targets = new Map();
  offense.forEach((p, i) => targets.set(p, spots[(i + play) % 3]));
  targets.set(passer, [lerp(passer.px, spots[1][0], 0.5), lerp(0, dir * 4.5, clamp01(into / 2))]);
  if (into > 2.6) targets.set(shooter, [shooter.px * 0.9, dir * Math.min(7.5, 5 + (into - 2.6))]);
  defense.forEach((d, i) => {
    const man = offense[i];
    targets.set(d, [man.px * 0.85, man.pz + dir * 1.3]);
  });
  // Possession: who holds the ball, and what the ball is doing.
  const holder = into < 2 ? passer : into < 2.6 ? null : into < 4.4 ? shooter : null;
  for (const p of g.players) {
    const [tx, tz] = targets.get(p);
    const dx = tx - p.px,
      dz = tz - p.pz,
      dist = Math.hypot(dx, dz),
      step = Math.min(dist, 5 * dt);
    if (dist > 0.01) {
      p.px += (dx / dist) * step;
      p.pz += (dz / dist) * step;
    }
    const speed = dt > 0 ? step / dt : 0;
    p.stride += step * 2.6;
    const defending = p.team !== attack;
    const want = defending
      ? Math.atan2(offense[defense.indexOf(p)].pz - p.pz, offense[defense.indexOf(p)].px - p.px)
      : p === passer && into >= 2 && into < 2.6
        ? Math.atan2(shooter.pz - p.pz, shooter.px - p.px)
        : Math.atan2(hoopZ - p.pz, -p.px);
    const turn = Math.atan2(Math.sin(want - p.facing), Math.cos(want - p.facing));
    p.facing += turn * Math.min(1, dt * 7);
    let pose = speed > 0.3 ? gaitPose(p.stride, Math.min(1, speed / 5)) : standPose();
    let base = 0.23;
    if (defending) {
      // Defensive stance: knees bent, arms out.
      pose = {
        ...pose,
        legs: pose.legs.map(([th, kn]) => [th + 0.3, kn + 0.6]),
        arms: [
          [1.1, 0.3],
          [1.1, 0.3],
        ],
        lean: 0.3,
      };
    }
    if (p === holder) pose.arms = [pose.arms[0], [0.55, 0.75 + Math.sin(t * 7) * 0.25]];
    if (p === shooter && into >= 4 && into < 4.9) {
      // Jump shot: crouch, rise, release at the top.
      const s = clamp01((into - 4) / 0.4);
      const crouch = Math.sin(clamp01((into - 4) / 0.25) * Math.PI) * (into < 4.25 ? 1 : 0);
      pose = {
        legs: [0, 1].map(() => [0.5 * crouch, 1.0 * crouch]),
        arms: [0, 1].map(() => [lerp(1.6, 2.9, s), lerp(1.4, 0.1, s)]),
        lean: 0,
        bob: 0,
      };
      base += Math.max(0, Math.sin(clamp01((into - 4.25) / 0.6) * Math.PI)) * 0.45;
    }
    if (p === passer && into >= 2 && into < 2.6) {
      // Chest pass: both arms push out.
      const s = clamp01((into - 2) / 0.3);
      pose.arms = [0, 1].map(() => [lerp(1.0, 1.5, s), lerp(1.6, 0.1, s)]);
    }
    placeFigure(p, p.px, p.pz, p.facing, pose, base);
  }
  // The ball.
  let pos;
  if (holder) {
    // Dribbled: from the right hand down to the floor and back up.
    const hand = handOf(holder, 1),
      bounce = Math.abs(Math.cos(t * 3.5));
    pos = [hand[0], lerp(0.36, hand[1] - 0.12, bounce), hand[2]];
  } else if (into < 2.6) {
    const a = handOf(passer, 0),
      b = handOf(shooter, 1),
      s = clamp01((into - 2.1) / 0.5);
    pos = [
      lerp(a[0], b[0], s),
      lerp(a[1], b[1], s) + Math.sin(s * Math.PI) * 0.15,
      lerp(a[2], b[2], s),
    ];
  } else {
    // Released at 4.4 s: an arc to the rim, then through the net to the floor.
    const rim = [g.lotOrigin.x, 2.75, g.lotOrigin.z + hoopZ];
    const from = g.release && g.release.play === play ? g.release.at : handOf(shooter, 1);
    if (!g.release || g.release.play !== play) g.release = { play, at: from };
    if (into < 5.4) {
      const s = clamp01((into - 4.4) / 1);
      pos = [
        lerp(from[0], rim[0], s),
        lerp(from[1], rim[1], s) + Math.sin(s * Math.PI) * 1.8,
        lerp(from[2], rim[2], s),
      ];
    } else {
      const s = clamp01((into - 5.4) / 0.6);
      pos = [rim[0], Math.max(0.36, 2.75 - s * s * 2.6), rim[2] - dir * s * 0.6];
    }
  }
  if (into < 4.4) g.release = null;
  g.ball.pos = pos;
  if (reduced) g.ball.pos = [g.lotOrigin.x + 0.4, 0.36, g.lotOrigin.z];
}

// Front crawl lengths of the 18 m basin with a flip at each wall.
function updateSwimmer(g, s, t) {
  const lap = (t * s.speed + s.phase) % 34,
    forward = lap < 17,
    z = forward ? -8.5 + lap : 8.5 - (lap - 17),
    dir = forward ? 1 : -1,
    yaw = forward ? 0 : Math.PI,
    stroke = t * 2.6 + s.phase;
  const at = (f, y, l = 0) => [g.lotOrigin.x + s.x + l * dir, y, g.lotOrigin.z + z + f * dir];
  const p = s.parts;
  p.head.pos = at(0.62, 0.17 + Math.max(0, Math.sin(stroke)) * 0.03, Math.sin(stroke) * 0.05);
  p.body.pos = at(0, 0.1);
  p.body.rotation = [0, yaw, 0];
  p.arms.forEach((arm, i) => {
    // Each arm circles from the shoulder: reach, pull under water, recover through the air.
    const a = -(stroke + i * Math.PI),
      df = Math.cos(a) * 0.31,
      dy = Math.sin(a) * 0.31;
    arm.pos = at(0.38 + df, 0.12 + dy, (i ? 0.25 : -0.25) * 1);
    // The arm's long axis (local y) points along the circle: pitch = 90° - a.
    arm.rotation = [Math.PI / 2 - a, yaw, 0];
  });
  p.legs.forEach((leg, i) => {
    const kick = Math.sin(stroke * 3 + i * Math.PI) * 0.12;
    leg.pos = at(-0.85, 0.08 + kick * 0.3, i ? 0.1 : -0.1);
    leg.rotation = [kick, yaw, 0];
  });
}

// Pendulum from the top bar (y 3.0): the seat, chains and seated child all rotate together about
// the bar, so the chains always hang from it. The child pumps their legs forward on the up-swing.
const PIVOT_Y = 3.0;
function swingAbout(mesh, pivotZ, angle, rest = mesh.pos) {
  const dz = rest[2] - pivotZ,
    dy = rest[1] - PIVOT_Y,
    c = Math.cos(angle),
    s = Math.sin(angle);
  mesh.pos = [rest[0], PIVOT_Y + dz * s + dy * c, pivotZ + dz * c - dy * s];
  // Swinging the bottom towards +z tilts each part's top towards -z.
  mesh.rotation = [(mesh.rotation?.[0] ?? 0) - angle, mesh.rotation?.[1] ?? 0, 0];
}
function updateSwing(s, t, reduced) {
  const angle = reduced ? 0 : Math.sin(t * 1.6 + s.phase) * 0.5,
    rate = reduced ? 0 : Math.cos(t * 1.6 + s.phase);
  const pivotZ = s.parts[0] ? s.parts[0].rest[2] : 0;
  for (const { mesh, rest } of s.parts) {
    mesh.rotation = [0, 0, 0];
    swingAbout(mesh, pivotZ, angle, rest);
  }
  // Pose the child on the seat at rest, then swing every part with it.
  const pose = sitPose(0.86 + 0.05, { kick: 1.2 * clamp01(rate), arms: [2.75, -0.15] });
  pose.lean = -0.25 * rate;
  placeFigure(s.child, s.x, -8, Math.PI / 2, pose);
  for (const mesh of s.child.meshes) swingAbout(mesh, pivotZ, angle);
}

// Climb the steps, sit at the top, slide down, then run round to the steps again.
function updateSlide(kid, t, reduced) {
  const c = reduced ? 0.45 : (t * 0.2) % 1;
  if (c < 0.35) {
    const s = c / 0.35;
    placeFigure(kid, 2, -3.8 + s * 2.6, Math.PI / 2, gaitPose(t * 6, 0.15), 0.22 + s * 1.5);
  } else if (c < 0.45) {
    placeFigure(kid, 2, -0.9, Math.PI / 2, sitPose(1.85, { arms: [0.4, 0.2] }));
  } else if (c < 0.7) {
    const s = (c - 0.45) / 0.25,
      ease = s * s;
    const pose = sitPose(1.85 - ease * 1.45, { kick: 1.4, arms: [0.9, 0] });
    pose.lean = -0.35;
    placeFigure(kid, 2, -0.9 + ease * 4.6, Math.PI / 2, pose);
  } else {
    // Run back round the side of the slide to the steps.
    const s = (c - 0.7) / 0.3,
      x = 2 + Math.sin(s * Math.PI) * 1.8,
      z = 3.7 - s * 7.5;
    const ahead = Math.atan2(-7.5, Math.cos(s * Math.PI) * 1.8 * Math.PI);
    placeFigure(kid, x, z, ahead, gaitPose(t * 9, 0.7), 0.22);
  }
}
