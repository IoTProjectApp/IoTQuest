// Column-major WebGL matrices. Pure functions shared by the renderer and tests.
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
export function modelMatrix(pos, size = [1, 1, 1], rotation = [0, 0, 0]) {
  const [rx, ry, rz] = rotation,
    cx = Math.cos(rx),
    sx = Math.sin(rx),
    cy = Math.cos(ry),
    sy = Math.sin(ry),
    cz = Math.cos(rz),
    sz = Math.sin(rz);
  const r = new Float32Array([
    cy * cz,
    cy * sz,
    -sy,
    0,
    sx * sy * cz - cx * sz,
    sx * sy * sz + cx * cz,
    sx * cy,
    0,
    cx * sy * cz + sx * sz,
    cx * sy * sz - sx * cz,
    cx * cy,
    0,
    ...pos,
    1,
  ]);
  for (let c = 0; c < 3; c++) for (let row = 0; row < 3; row++) r[c * 4 + row] *= size[c];
  return r;
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
export function resolveMove(player, dir, amount, yaw, colliders) {
  const [x, , z] = toWorld(player),
    f = (dir === 'up' ? -1 : dir === 'down' ? 1 : 0) * amount * 0.32,
    r = (dir === 'right' ? 1 : dir === 'left' ? -1 : 0) * amount * 0.32;
  const dx = Math.sin(yaw) * f + Math.cos(yaw) * r,
    dz = Math.cos(yaw) * f - Math.sin(yaw) * r;
  let nx = clamp(x + dx, -13.44, 14.08),
    nz = clamp(z + dz, -10.4, 12.1);
  if (collides(nx, z, colliders)) nx = x;
  if (collides(nx, nz, colliders)) nz = z;
  return fromWorld(nx, nz);
}
export function findFree(player, colliders) {
  const p = toWorld(player);
  if (!collides(p[0], p[2], colliders)) return player;
  for (let radius = 0.4; radius < 4; radius += 0.35)
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 8) {
      let x = p[0] + Math.cos(a) * radius,
        z = p[2] + Math.sin(a) * radius;
      if (x > -13.3 && x < 14 && z > -10.3 && z < 10.8 && !collides(x, z, colliders))
        return fromWorld(x, z);
    }
  return { x: 48, y: 77 };
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
export function deviceSpots(devices, areas, colliders = [], rooms = []) {
  const spots = new Map(),
    taken = [],
    floors = new Map();
  // Every valid floor point for an area, nearest the resident's spot first (computed once per area).
  const floorOf = (a) => {
    if (floors.has(a)) return floors.get(a);
    // Installation points often sit on furniture: search from the nearest free spot (where the
    // room's resident stands), and keep clear of the technician's landing spot too.
    const [cx, , cz] = toWorld(findFree({ x: a[1], y: a[2] }, colliders)),
      [lx, , lz] = toWorld(findFree({ x: a[1], y: a[2] + 5 }, colliders)),
      room = rooms.find(
        ([, rx, rz]) => Math.abs(cx - rx) <= ROOM_HALF[0] && Math.abs(cz - rz) <= ROOM_HALF[1],
      ),
      [x0, x1, z0, z1] = room
        ? [
            room[1] - ROOM_HALF[0] + WALL_MARGIN,
            room[1] + ROOM_HALF[0] - WALL_MARGIN,
            room[2] - ROOM_HALF[1] + WALL_MARGIN,
            room[2] + ROOM_HALF[1] - WALL_MARGIN,
          ]
        : [cx - 2.5, cx + 2.5, cz - 2.5, cz + 2.5],
      points = [];
    for (let x = x0; x <= x1 + 1e-9; x += 0.2)
      for (let z = z0; z <= z1 + 1e-9; z += 0.2) {
        const distance = Math.hypot(x - cx, z - cz);
        if (
          (room || distance <= 2.5) &&
          distance >= 0.8 &&
          x > -13.3 &&
          x < 14 &&
          z > -10.3 &&
          z < 10.8 &&
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
export function deviceState(device, outputs, env) {
  const raw = Number(outputs[device.pin] || 0),
    on = raw > 0;
  return {
    raw,
    on,
    brightness: raw === 1 ? 1 : clamp(raw / (raw > 255 ? 65535 : 255), 0, 1),
    angle: device.id === 'gate' ? (on ? Math.PI / 2 : 0) : (clamp(raw, 0, 180) * Math.PI) / 180,
    flow: ['pump', 'valve'].includes(device.id) && on && env.tank > 0,
    water: clamp(env.tank / 100, 0, 1),
    plant: env.soil < 30 ? 'dry' : env.soil > 85 ? 'wet' : 'healthy',
  };
}
