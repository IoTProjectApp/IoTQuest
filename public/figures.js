// Jointed people for the community areas. Each figure has thighs, shins and shoes, upper arms
// and forearms, shorts, a torso and a head; limbs rotate about their hip, knee, shoulder and elbow,
// so gaits and poses read naturally. `scale` makes children (about 0.6) or adults (1).
export const SKIN = ['#c79878', '#8d5a3c', '#e0b993', '#a8714f', '#f0cfb0'];
const LEG = 0.42,
  ARM = 0.3;

// add/sphere take community-local coordinates; the figure is posed in world space by placeFigure.
export function figure(add, sphere, origin, { x, z, shirt, shorts, skin, scale = 1 }) {
  const k = scale;
  // Sizes are [lateral, height, forward]: placeFigure turns local z to face the walking direction.
  const box = (w, h, d, color, bevel) =>
    add(0, -20, 0, w * k, h * k, d * k, color, { bevel: bevel * k });
  const person = {
    origin,
    scale,
    x,
    z,
    legs: [-1, 1].map((side) => ({
      side,
      thigh: box(0.17, LEG, 0.19, skin, 0.07),
      shin: box(0.15, LEG, 0.16, skin, 0.06),
      shoe: box(0.15, 0.1, 0.28, '#2c3134', 0.04),
    })),
    arms: [-1, 1].map((side) => ({
      side,
      upper: box(0.13, ARM, 0.13, shirt, 0.055),
      lower: box(0.11, ARM, 0.11, skin, 0.05),
    })),
    shorts: box(0.44, 0.26, 0.3, shorts, 0.08),
    torso: box(0.46, 0.52, 0.3, shirt, 0.12),
    head: sphere(0, -20, 0, 0.15 * k, skin),
  };
  person.meshes = [
    ...person.legs.flatMap((l) => [l.thigh, l.shin, l.shoe]),
    ...person.arms.flatMap((a) => [a.upper, a.lower]),
    person.shorts,
    person.torso,
    person.head,
  ];
  placeFigure(person, x, z, 0, standPose());
  return person;
}

// Walking (run 0) to sprinting (run 1). The knee bends as the leg swings through, arms swing
// against the legs, the body leans into the run and bobs twice per stride.
export function gaitPose(phase, run = 0) {
  const swing = 0.32 + 0.3 * run,
    flex = 0.45 + 0.85 * run;
  const legs = [0, Math.PI].map((offset) => {
    const p = phase + offset;
    return [swing * Math.sin(p), 0.08 + flex * Math.max(0, Math.cos(p))];
  });
  return {
    legs,
    arms: legs.map(([thigh]) => [-thigh * (0.9 + 0.4 * run), 0.25 + 1.1 * run]),
    lean: 0.04 + 0.16 * run,
    bob: (0.015 + 0.05 * run) * Math.abs(Math.sin(phase)),
  };
}
export function standPose({ lift = 0, sway = 0 } = {}) {
  return {
    legs: [
      [0.03 + sway, 0.06],
      [-0.03 - sway, 0.06],
    ],
    arms: [0, 1].map(() => [0.08 + lift * 2.9, 0.18 * (1 - lift)]),
    lean: sway * 0.3,
    bob: 0,
  };
}
// Seated with thighs forward and shins hanging; hipY is the seat height.
export function sitPose(hipY, { kick = 0, arms = [1.1, 0.5] } = {}) {
  return {
    legs: [
      [1.45, 1.45 - kick],
      [1.45, 1.45 - kick],
    ],
    arms: [arms, arms],
    lean: -0.05,
    bob: 0,
    hipY,
  };
}

// angle: the direction faced (radians, 0 = +x). pose: legs [[thigh, knee] x2] (thigh forward
// positive, knee flex positive), arms [[shoulder, elbow] x2] (forward positive), lean (forward),
// bob (metres), and optionally hipY. base is the floor height under the feet.
export function placeFigure(person, x, z, angle, pose = standPose(), base = 0.2) {
  person.x = x;
  person.z = z;
  const k = person.scale,
    { legs, arms, lean = 0, bob = 0 } = pose;
  const fx = Math.cos(angle),
    fz = Math.sin(angle),
    yaw = -angle + Math.PI / 2;
  const ox = person.origin.x + x,
    oz = person.origin.z + z;
  // Local (forward, up, lateral) to world.
  const put = (mesh, f, y, l, pitch) => {
    mesh.pos[0] = ox + f * fx - l * fz;
    mesh.pos[1] = y;
    mesh.pos[2] = oz + f * fz + l * fx;
    mesh.rotation = [pitch, yaw, 0];
  };
  // A limb segment from a joint at (f, y), pointing `theta` forward of straight down.
  const segment = (mesh, f, y, l, theta, length) => {
    const df = Math.sin(theta) * length,
      dy = -Math.cos(theta) * length;
    put(mesh, f + df / 2, y + dy / 2, l, -theta);
    return [f + df, y + dy];
  };
  // Standing poses keep the lower foot on the floor; seated poses give the hip height.
  const reach = Math.max(
    ...legs.map(([thigh, knee]) => LEG * (Math.cos(thigh) + Math.cos(thigh - knee))),
  );
  const hipY = pose.hipY ?? base + bob + k * (0.1 + reach);
  for (const [i, leg] of person.legs.entries()) {
    const [thigh, knee] = legs[i],
      l = leg.side * 0.1 * k;
    const [kf, ky] = segment(leg.thigh, 0, hipY, l, thigh, LEG * k);
    const [af, ay] = segment(leg.shin, kf, ky, l, thigh - knee, LEG * k);
    put(leg.shoe, af + 0.06 * k, ay - 0.04 * k, l, 0);
  }
  const up = (d) => [Math.sin(lean) * d * k, hipY + Math.cos(lean) * d * k];
  put(person.shorts, ...up(0.04), 0, lean);
  put(person.torso, ...up(0.36), 0, lean);
  const [hf, hy] = up(0.8);
  put(person.head, hf, hy, 0, 0);
  const [sf, sy] = up(0.56);
  for (const [i, arm] of person.arms.entries()) {
    const [shoulder, elbow] = arms[i],
      l = arm.side * 0.3 * k;
    const [ef, ey] = segment(arm.upper, sf, sy, l, shoulder, ARM * k);
    segment(arm.lower, ef, ey, l, shoulder + elbow, ARM * k);
  }
}

// Where a hand is: the end of the forearm, in world coordinates.
export function handOf(person, i) {
  const { lower } = person.arms[i],
    [pitch, yaw] = lower.rotation;
  const len = (ARM * person.scale) / 2,
    theta = -pitch,
    angle = -yaw + Math.PI / 2;
  const df = Math.sin(theta) * len;
  return [
    lower.pos[0] + df * Math.cos(angle),
    lower.pos[1] - Math.cos(theta) * len,
    lower.pos[2] + df * Math.sin(angle),
  ];
}
