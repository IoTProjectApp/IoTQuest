// Column-major WebGL matrices. Pure functions shared by the renderer and tests.
import { outputLevel } from './signals.js';
export const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
export function multiply(a, b) {
  const r = new Float32Array(16);
  for (let c = 0; c < 4; c++)
    for (let row = 0; row < 4; row++)
      for (let k = 0; k < 4; k++) r[c * 4 + row] += a[k * 4 + row] * b[c * 4 + k];
  return r;
}
export function perspective(fov, aspect, near = 0.1, far = 160) {
  const f = 1 / Math.tan(fov / 2),
    r = new Float32Array(16);
  r[0] = f / aspect;
  r[5] = f;
  r[10] = (far + near) / (near - far);
  r[11] = -1;
  r[14] = (2 * far * near) / (near - far);
  return r;
}
function normalize(a) {
  const l = Math.hypot(...a) || 1;
  return a.map((v) => v / l);
}
function cross(a, b) {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
export function lookAt(eye, target) {
  const z = normalize(eye.map((v, i) => v - target[i])),
    x = normalize(cross([0, 1, 0], z)),
    y = cross(z, x);
  return new Float32Array([
    x[0],
    y[0],
    z[0],
    0,
    x[1],
    y[1],
    z[1],
    0,
    x[2],
    y[2],
    z[2],
    0,
    -x.reduce((s, v, i) => s + v * eye[i], 0),
    -y.reduce((s, v, i) => s + v * eye[i], 0),
    -z.reduce((s, v, i) => s + v * eye[i], 0),
    1,
  ]);
}
// `out` (16 floats) is reused when given, so the renderer does not allocate per object per frame.
export function modelMatrix(
  pos,
  size = [1, 1, 1],
  rotation = [0, 0, 0],
  out = new Float32Array(16),
) {
  const [rx, ry, rz] = rotation,
    cx = Math.cos(rx),
    sx = Math.sin(rx),
    cy = Math.cos(ry),
    sy = Math.sin(ry),
    cz = Math.cos(rz),
    sz = Math.sin(rz),
    [w, h, d] = size;
  out[0] = cy * cz * w;
  out[1] = cy * sz * w;
  out[2] = -sy * w;
  out[3] = 0;
  out[4] = (sx * sy * cz - cx * sz) * h;
  out[5] = (sx * sy * sz + cx * cz) * h;
  out[6] = sx * cy * h;
  out[7] = 0;
  out[8] = (cx * sy * cz + sx * sz) * d;
  out[9] = (cx * sy * sz - sx * cz) * d;
  out[10] = cx * cy * d;
  out[11] = 0;
  out[12] = pos[0];
  out[13] = pos[1];
  out[14] = pos[2];
  out[15] = 1;
  return out;
}
// Inverse of a 4×4 matrix (cofactor expansion), or null when it is singular.
export function invert(m) {
  const [a00, a01, a02, a03, a10, a11, a12, a13, a20, a21, a22, a23, a30, a31, a32, a33] = m,
    b00 = a00 * a11 - a01 * a10,
    b01 = a00 * a12 - a02 * a10,
    b02 = a00 * a13 - a03 * a10,
    b03 = a01 * a12 - a02 * a11,
    b04 = a01 * a13 - a03 * a11,
    b05 = a02 * a13 - a03 * a12,
    b06 = a20 * a31 - a21 * a30,
    b07 = a20 * a32 - a22 * a30,
    b08 = a20 * a33 - a23 * a30,
    b09 = a21 * a32 - a22 * a31,
    b10 = a21 * a33 - a23 * a31,
    b11 = a22 * a33 - a23 * a32,
    det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
  if (!det) return null;
  const k = 1 / det;
  return new Float64Array([
    (a11 * b11 - a12 * b10 + a13 * b09) * k,
    (a02 * b10 - a01 * b11 - a03 * b09) * k,
    (a31 * b05 - a32 * b04 + a33 * b03) * k,
    (a22 * b04 - a21 * b05 - a23 * b03) * k,
    (a12 * b08 - a10 * b11 - a13 * b07) * k,
    (a00 * b11 - a02 * b08 + a03 * b07) * k,
    (a32 * b02 - a30 * b05 - a33 * b01) * k,
    (a20 * b05 - a22 * b02 + a23 * b01) * k,
    (a10 * b10 - a11 * b08 + a13 * b06) * k,
    (a01 * b08 - a00 * b10 - a03 * b06) * k,
    (a30 * b04 - a31 * b02 + a33 * b00) * k,
    (a21 * b02 - a20 * b04 - a23 * b00) * k,
    (a11 * b07 - a10 * b09 - a12 * b06) * k,
    (a00 * b09 - a01 * b07 + a02 * b06) * k,
    (a31 * b01 - a30 * b03 - a32 * b00) * k,
    (a20 * b03 - a21 * b01 + a22 * b00) * k,
  ]);
}
// The world-space ray under a screen point (CSS pixels): from the near plane towards the far plane
// through the inverse view-projection. Returns { origin, dir } or null.
export function screenRay(matrix, x, y, width, height) {
  const inverse = invert(matrix);
  if (!inverse) return null;
  const nx = (x / width) * 2 - 1,
    ny = 1 - (y / height) * 2,
    unproject = (z) => {
      const r = [0, 0, 0, 0];
      for (let i = 0; i < 4; i++)
        r[i] = inverse[i] * nx + inverse[4 + i] * ny + inverse[8 + i] * z + inverse[12 + i];
      return [r[0] / r[3], r[1] / r[3], r[2] / r[3]];
    },
    near = unproject(-1),
    far = unproject(1);
  return { origin: near, dir: far.map((v, i) => v - near[i]) };
}
// Distance along the ray (in units of `dir`) to where it enters an axis-aligned box given by its
// min and max corners, by the slab method; Infinity when it misses or the box is behind the ray.
export function rayBox({ origin, dir }, min, max) {
  let near = -Infinity,
    far = Infinity;
  for (let i = 0; i < 3; i++) {
    if (Math.abs(dir[i]) < 1e-12) {
      if (origin[i] < min[i] || origin[i] > max[i]) return Infinity;
      continue;
    }
    let t0 = (min[i] - origin[i]) / dir[i],
      t1 = (max[i] - origin[i]) / dir[i];
    if (t0 > t1) [t0, t1] = [t1, t0];
    near = Math.max(near, t0);
    far = Math.min(far, t1);
    if (near > far) return Infinity;
  }
  if (far < 0) return Infinity;
  return Math.max(0, near);
}
export function projectPoint(matrix, p, width, height) {
  const v = [...p, 1],
    r = [0, 0, 0, 0];
  for (let i = 0; i < 4; i++) for (let k = 0; k < 4; k++) r[i] += matrix[k * 4 + i] * v[k];
  if (r[3] <= 0) return { x: 0, y: 0, visible: false };
  const x = r[0] / r[3],
    y = r[1] / r[3],
    z = r[2] / r[3];
  return {
    x: (x * 0.5 + 0.5) * width,
    y: (-0.5 * y + 0.5) * height,
    visible: z >= -1 && z <= 1 && Math.abs(x) < 1.15 && Math.abs(y) < 1.15,
  };
}
export function toWorld(p) {
  return [(p.x - 50) * 0.32, 0, (p.y - 50) * 0.26];
}
export function fromWorld(x, z) {
  return { x: x / 0.32 + 50, y: z / 0.26 + 50 };
}
export function collides(x, z, colliders, radius = 0.23) {
  return colliders.some(
    (c) =>
      !c.disabled && Math.abs(x - c.x) < c.w / 2 + radius && Math.abs(z - c.z) < c.d / 2 + radius,
  );
}
// True when nothing in colliders blocks the straight line between two world points.
export function clearPath(a, b, colliders) {
  const steps = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.05);
  for (let i = 1; i < steps; i++)
    if (collides(a.x + ((b.x - a.x) * i) / steps, a.z + ((b.z - a.z) * i) / steps, colliders, 0.02))
      return false;
  return true;
}
export function resolveMove(
  player,
  dir,
  amount,
  yaw,
  colliders,
  bounds = { minX: -13.44, maxX: 14.08, minZ: -10.4, maxZ: 12.1 },
) {
  const [x, , z] = toWorld(player),
    f = (dir === 'up' ? -1 : dir === 'down' ? 1 : 0) * amount * 0.32,
    r = (dir === 'right' ? 1 : dir === 'left' ? -1 : 0) * amount * 0.32;
  const dx = Math.sin(yaw) * f + Math.cos(yaw) * r,
    dz = Math.cos(yaw) * f - Math.sin(yaw) * r;
  let nx = clamp(x + dx, bounds.minX, bounds.maxX),
    nz = clamp(z + dz, bounds.minZ, bounds.maxZ);
  // Someone already inside an obstacle (an upgrade installed where they stand) can walk out.
  if (collides(x, z, colliders)) return fromWorld(nx, nz);
  if (collides(nx, z, colliders)) nx = x;
  if (collides(nx, nz, colliders)) nz = z;
  return fromWorld(nx, nz);
}
export function findFree(
  player,
  colliders,
  bounds = { minX: -13.3, maxX: 14, minZ: -10.3, maxZ: 10.8 },
) {
  const p = toWorld(player);
  if (!collides(p[0], p[2], colliders)) return player;
  for (let radius = 0.4; radius < 4; radius += 0.35)
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 8) {
      let x = p[0] + Math.cos(a) * radius,
        z = p[2] + Math.sin(a) * radius;
      if (
        x > bounds.minX &&
        x < bounds.maxX &&
        z > bounds.minZ &&
        z < bounds.maxZ &&
        !collides(x, z, colliders)
      )
        return fromWorld(x, z);
    }
  return bounds.minX > 14
    ? fromWorld((bounds.minX + bounds.maxX) / 2, (bounds.minZ + bounds.maxZ) / 2)
    : { x: 48, y: 77 };
}
// Each installed device gets its own spot in its room: clear of walls and furniture, inside the
// room's floor (`rooms` are the model's [name, x, z] room centres; a straight line can slip through
// a doorway, so reachability alone is not enough), away from where the resident and the technician
// stand, and at least DEVICE_GAP from every other device. Outdoors, or where an installation point
// is outside every room, spots stay within reach of the point without crossing a wall. Spots are
// given in install order, so adding a device never moves the others.
export const DEVICE_GAP = 1;
const DEVICE_RADIUS = 0.3,
  ROOM_HALF = [4.58 / 2, 4.8 / 2],
  WALL_MARGIN = 0.25;
// Half the floor size of a home room: the standard bay, or a regional layout's own [w, d] size
// (rooms are [name, x, z, colour, size?]).
export const roomHalf = (room) => (room[4] ? [room[4][0] / 2, room[4][1] / 2] : ROOM_HALF);
// The floor a student can stand on at a community workstation (rooms are [name, x, z, ...]).
export function communityRoomBounds(room) {
  return { minX: room[1] - 2.29, maxX: room[1] + 2.29, minZ: room[2] - 2.4, maxZ: room[2] + 2.4 };
}
export function deviceSpots(devices, areas, colliders = [], rooms = []) {
  const spots = new Map(),
    taken = [],
    floors = new Map();
  // Every valid floor point for an area, nearest the resident's spot first (computed once per area).
  const floorOf = (a) => {
    if (floors.has(a)) return floors.get(a);
    // Installation points often sit on furniture: search from the nearest free spot (where the
    // room's resident stands), and keep clear of the technician's landing spot too.
    const namedRoom = rooms.find((r) => r[0] === a[0]);
    const native = namedRoom?.[3]?.community;
    const roomBounds = native ? communityRoomBounds(namedRoom) : undefined;
    const [cx, , cz] = toWorld(findFree({ x: a[1], y: a[2] }, colliders, roomBounds)),
      [lx, , lz] = toWorld(findFree({ x: a[1], y: a[2] + 5 }, colliders, roomBounds)),
      room = rooms.find(
        (r) => Math.abs(cx - r[1]) <= roomHalf(r)[0] && Math.abs(cz - r[2]) <= roomHalf(r)[1],
      ),
      [hw, hd] = room ? roomHalf(room) : [0, 0],
      [x0, x1, z0, z1] = room
        ? [
            room[1] - hw + WALL_MARGIN,
            room[1] + hw - WALL_MARGIN,
            room[2] - hd + WALL_MARGIN,
            room[2] + hd - WALL_MARGIN,
          ]
        : [cx - 2.5, cx + 2.5, cz - 2.5, cz + 2.5],
      points = [];
    for (let x = x0; x <= x1 + 1e-9; x += 0.2)
      for (let z = z0; z <= z1 + 1e-9; z += 0.2) {
        const distance = Math.hypot(x - cx, z - cz);
        if (
          (room || distance <= 2.5) &&
          distance >= 0.8 &&
          (native || (x > -13.3 && x < 14 && z > -10.3 && z < 10.8)) &&
          Math.hypot(x - lx, z - lz) >= 0.6 &&
          !collides(x, z, colliders, DEVICE_RADIUS) &&
          clearPath({ x: cx, z: cz }, { x, z }, colliders)
        )
          points.push({ x, z, distance });
      }
    points.sort((p, q) => p.distance - q.distance || p.x - q.x || p.z - q.z);
    const floor = { cx, cz, points };
    floors.set(a, floor);
    return floor;
  };
  for (const d of devices) {
    const floor = floorOf(areas.find((a) => a[0] === d.area) || areas[9]);
    let spot = null;
    // Prefer a full metre apart. A crowded room packs devices closer (a device body is 0.28 m
    // wide); only a room with no space left at all lets a device share a spot, still in the room.
    for (const gap of [DEVICE_GAP, 0.75, 0.55, 0.35, 0]) {
      spot = floor.points.find((p) => taken.every((t) => Math.hypot(t.x - p.x, t.z - p.z) >= gap));
      if (spot) break;
    }
    // Only if the room has no free floor at all: a row beside the point.
    spot = spot
      ? { x: spot.x, z: spot.z }
      : {
          x: floor.cx + 0.7 + (taken.length % 3) * 0.48,
          z: floor.cz + 0.8 + Math.floor(taken.length / 3) * 0.4,
        };
    taken.push(spot);
    spots.set(d, spot);
  }
  return spots;
}
// `scales` is the full scale of each output's last write (Runtime#outputScales), so a lamp driven
// by duty(512) glows at half brightness exactly as the 2D view shows it.
export function deviceState(device, outputs, env, scales = {}) {
  const raw = Number(outputs[device.pin] || 0),
    on = raw > 0;
  return {
    raw,
    on,
    brightness: outputLevel(raw, scales?.[device.pin]),
    // Servos: 0–180° from servoWrite, or digital HIGH as fully turned (weather.js servoLevel).
    angle:
      device.id === 'gate'
        ? on
          ? Math.PI / 2
          : 0
        : outputLevel(raw, scales?.[device.pin] ?? (raw === 1 ? 1 : 180)) * Math.PI,
    flow: ['pump', 'valve'].includes(device.id) && on && env.tank > 0,
    water: clamp(env.tank / 100, 0, 1),
    plant: env.soil < 30 ? 'dry' : env.soil > 85 ? 'wet' : 'healthy',
  };
}
