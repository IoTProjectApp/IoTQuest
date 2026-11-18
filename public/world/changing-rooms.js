// Enclosed changing rooms and shower rooms for the pool and gym. `add` builds fixed structure,
// `prop` furniture; both take building-local coordinates.
const WALL = '#c3d2cf',
  TILE = '#b4c2be',
  LOCKER = '#6f9aa6';

function kit(add, prop, height) {
  const wall = (ax, az, bx, bz) =>
    add(
      (ax + bx) / 2,
      0.2 + height / 2,
      (az + bz) / 2,
      Math.max(0.15, Math.abs(bx - ax)),
      height,
      Math.max(0.15, Math.abs(bz - az)),
      WALL,
      { solid: true },
    );
  // A wall along one axis with a 1.2 m doorway centred on `door`.
  const wallWithDoor = (axis, fixed, from, to, door) => {
    for (const [a, b] of [
      [from, door - 0.6],
      [door + 0.6, to],
    ])
      if (axis === 'x') wall(a, fixed, b, fixed);
      else wall(fixed, a, fixed, b);
    const lintel = 0.2 + height - 0.25;
    if (axis === 'x') add(door, lintel, fixed, 1.2, 0.5, 0.15, WALL);
    else add(fixed, lintel, door, 0.15, 0.5, 1.2, WALL);
  };
  // Pictogram above a doorway: a person for changing, a water drop for showers.
  const sign = (x, z, nx, nz, kind) => {
    const y = 0.2 + height - 0.55,
      along = nz !== 0;
    const w = along ? 0.6 : 0.04,
      d = along ? 0.04 : 0.6;
    prop(x + nx * 0.1, y, z + nz * 0.1, w, 0.6, d, kind === 'shower' ? '#3f7fa8' : '#3f8a7a', {
      surface: 'plain',
    });
    const fx = x + nx * 0.13,
      fz = z + nz * 0.13;
    if (kind === 'shower') {
      prop(fx, y - 0.06, fz, along ? 0.2 : 0.02, 0.2, along ? 0.02 : 0.2, '#f2f4ef', {
        surface: 'plain',
        bevel: 0.1,
      });
      prop(fx, y + 0.08, fz, along ? 0.08 : 0.02, 0.12, along ? 0.02 : 0.08, '#f2f4ef', {
        surface: 'plain',
        rotation: along ? [0, 0, Math.PI / 4] : [Math.PI / 4, 0, 0],
      });
    } else {
      prop(fx, y + 0.15, fz, along ? 0.11 : 0.02, 0.11, along ? 0.02 : 0.11, '#f2f4ef', {
        surface: 'plain',
        bevel: 0.055,
      });
      prop(fx, y - 0.07, fz, along ? 0.18 : 0.02, 0.28, along ? 0.02 : 0.18, '#f2f4ef', {
        surface: 'plain',
        bevel: 0.05,
      });
    }
  };
  // A bank of full-height lockers with its back on a wall, facing (nx, nz).
  const lockers = (axis, fixed, from, to, nx, nz) => {
    const length = to - from,
      mid = (from + to) / 2;
    const at = (t, offset) => (axis === 'x' ? [t, fixed + nz * offset] : [fixed + nx * offset, t]);
    const size = (along, depth, h) => (axis === 'x' ? [along, h, depth] : [depth, h, along]);
    const [cx, cz] = at(mid, 0.25);
    const [w, h, d] = size(length, 0.5, 1.9);
    prop(cx, 1.15, cz, w, h, d, LOCKER, { solid: true });
    for (let t = from + 0.45; t < to - 0.1; t += 0.45) {
      const [sx, sz] = at(t, 0.505);
      const [sw, sh, sd] = size(0.03, 0.01, 1.8);
      prop(sx, 1.15, sz, sw, sh, sd, '#4d707b');
    }
    for (let t = from + 0.35; t < to; t += 0.45)
      for (const y of [0.75, 1.65]) {
        const [hx, hz] = at(t, 0.52);
        const [hw, hh, hd] = size(0.05, 0.03, 0.12);
        prop(hx, y, hz, hw, hh, hd, '#d4dad6');
      }
  };
  const bench = (x, z, length, axis) => {
    const [w, d] = axis === 'x' ? [length, 0.42] : [0.42, length];
    prop(x, 0.5, z, w, 0.07, d, '#b8a074', { solid: true, surface: 'timber', bevel: 0.03 });
    for (const t of [-length / 2 + 0.3, length / 2 - 0.3])
      prop(x + (axis === 'x' ? t : 0), 0.33, z + (axis === 'x' ? 0 : t), 0.06, 0.3, 0.3, '#677c80');
  };
  // One stall: back on a wall at (x, z) facing (nx, nz); partitions and a curtain front.
  const showerStall = (x, z, nx, nz, width) => {
    const along = nz !== 0,
      depth = 1.35;
    const cx = x + nx * (depth / 2),
      cz = z + nz * (depth / 2);
    for (const side of [-1, 1]) {
      const px = along ? x + side * (width / 2) : cx,
        pz = along ? cz : z + side * (width / 2);
      add(px, 1.2, pz, along ? 0.06 : depth, 2, along ? depth : 0.06, '#dfe7e5', { solid: true });
    }
    prop(
      x + nx * depth,
      1.25,
      z + nz * depth,
      along ? width * 0.55 : 0.03,
      1.75,
      along ? 0.03 : width * 0.55,
      '#7fb3c2',
      { surface: 'fabric', opacity: 0.8 },
    );
    prop(x + nx * 0.06, 1.5, z + nz * 0.06, 0.06, 1.6, 0.06, '#d5dedc', { surface: 'steel' });
    prop(x + nx * 0.25, 2.2, z + nz * 0.25, 0.3, 0.07, 0.3, '#e0e8e6', {
      surface: 'steel',
      shape: 'cylinder',
    });
    prop(x + nx * 0.1, 1.1, z + nz * 0.1, 0.16, 0.12, 0.16, '#c5cfcd', { surface: 'steel' });
    prop(x + nx * 0.25, 1.45, z + nz * 0.25, 0.16, 1.45, 0.16, '#85d6e2', {
      surface: 'water',
      opacity: 0.4,
    });
    prop(cx, 0.22, cz, 0.35, 0.02, 0.35, '#424d4e', { surface: 'steel', shape: 'cylinder' });
  };
  const floor = (x0, z0, x1, z1, color = TILE) =>
    add((x0 + x1) / 2, 0.205, (z0 + z1) / 2, x1 - x0, 0.03, z1 - z0, color, {
      surface: 'tile',
      changingRoom: true,
    });
  const mirror = (x, z, axis) =>
    prop(x, 1.55, z, axis === 'x' ? 1.4 : 0.03, 0.8, axis === 'x' ? 0.03 : 1.4, '#a4c2c7', {
      surface: 'glass',
    });
  return { wall, wallWithDoor, sign, lockers, bench, showerStall, floor, mirror };
}

// Pool: a pavilion on the south-west deck, doors facing the pool.
// Footprint x -13.8..-3.2, z -14.8..-10.4 (matches the pool lot's `shadow`).
export function buildPoolChangingRooms({ add, prop, model }) {
  const k = kit(add, prop, 2.4);
  k.floor(-13.8, -14.8, -9.2, -10.4, '#a8b5b2');
  k.floor(-9.2, -14.8, -3.2, -10.4, '#c9d3cf');
  k.wall(-13.8, -14.75, -3.2, -14.75);
  k.wall(-13.8, -14.8, -13.8, -10.4);
  k.wall(-3.2, -14.8, -3.2, -10.4);
  k.wall(-9.2, -14.8, -9.2, -10.4);
  k.wallWithDoor('x', -10.4, -13.8, -9.2, -11.5);
  k.wallWithDoor('x', -10.4, -9.2, -3.2, -6.2);
  k.sign(-11.5, -10.4, 0, 1, 'shower');
  k.sign(-6.2, -10.4, 0, 1, 'changing');
  for (const x of [-12.8, -11.3]) k.showerStall(x, -14.7, 0, 1, 1.5);
  k.lockers('x', -14.7, -8.9, -5.4, 0, 1);
  k.bench(-6.6, -12.4, 2.6, 'x');
  k.mirror(-9.1 + 0.02, -12.2, 'z');
  // A curtained changing cubicle in the east corner.
  add(-4.4, 1.2, -13.6, 0.06, 2, 2.2, '#dfe7e5', { solid: true });
  prop(-3.8, 1.25, -12.45, 1.1, 1.75, 0.03, '#5f8f9a', { surface: 'fabric' });
  prop(-3.8, 0.5, -14.2, 1, 0.06, 0.4, '#b8a074', { surface: 'timber' });
  const roof = add(-8.5, 2.7, -12.6, 10.8, 0.18, 4.6, '#526e7a', {
    opacity: 0,
    cutawayOpacity: 0,
  });
  model.roofs.push(roof);
}

// Gym: two rooms in the north-west corner, changing room first, showers through it.
export function buildGymChangingRooms({ add, prop }) {
  const k = kit(add, prop, 2.8);
  k.floor(-12.9, 5.4, -7.2, 9.8, '#c9d3cf');
  k.floor(-12.9, 9.8, -7.2, 13.9);
  k.wall(-12.9, 5.4, -7.2, 5.4);
  k.wallWithDoor('z', -7.2, 5.4, 13.9, 7.6);
  k.wallWithDoor('x', 9.8, -12.9, -7.2, -8.2);
  k.sign(-7.2, 7.6, 1, 0, 'changing');
  k.sign(-8.2, 9.8, 0, -1, 'shower');
  k.lockers('z', -12.85, 5.8, 9.4, 1, 0);
  k.bench(-10.4, 7.6, 2.6, 'z');
  k.mirror(-10.1, 5.47, 'x');
  for (const x of [-12.15, -10.65, -9.15]) k.showerStall(x, 13.85, 0, -1, 1.5);
}
