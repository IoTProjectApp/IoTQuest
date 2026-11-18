// A bench's open front points at its activity; the backrest sits on the opposite side.
export function buildFacingBench(
  model,
  { x, z, targetX, targetZ, worldX, worldZ, add, length = 1.8 },
) {
  const yaw = Math.atan2(targetX - x, targetZ - z),
    cos = Math.cos(yaw),
    sin = Math.sin(yaw);
  const target = [worldX + targetX - x, worldZ + targetZ - z];
  const part = (dx, y, dz, w, h, d, color, extra = {}) =>
    add(x + cos * dx + sin * dz, y, z - sin * dx + cos * dz, w, h, d, color, {
      surface: 'timber',
      rotation: [0, yaw, 0],
      outdoorBench: true,
      ...extra,
    });
  part(0, 0.65, 0, length, 0.15, 0.7, '#ae9673', { outdoorSeatPart: 'seat', seatTarget: target });
  part(0, 1, -0.3, length, 0.6, 0.09, '#ae9673', { outdoorSeatPart: 'back' });
  for (const dx of [-length * 0.38, length * 0.38])
    part(dx, 0.37, 0, 0.09, 0.55, 0.6, '#677c80', { surface: 'steel' });
  model.colliders.push({
    x: worldX,
    z: worldZ,
    w: Math.abs(cos) * length + Math.abs(sin) * 0.7,
    d: Math.abs(sin) * length + Math.abs(cos) * 0.7,
    community: true,
    outdoorBench: true,
  });
}
