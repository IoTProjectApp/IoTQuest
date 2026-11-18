// Shared outdoor grill and preparation counter, kept beside the area's seating.
export function buildAreaBBQ(model, { b, origin }) {
  const placements = {
    park: [11.7, 5.5, 0],
    playground: [4.4, 10.2, 0],
    playground2: [11, 10.2, 0],
    basketball: [-7, 0, Math.PI / 2],
  };
  const placement = placements[b.type];
  if (!placement) return null;
  const [dx, dz, yaw] = placement,
    parts = [],
    cos = Math.cos(yaw),
    sin = Math.sin(yaw);
  const center = [origin.x + b.x + dx, origin.z + b.z + dz];
  const part = (x, y, z, w, h, d, color, extra = {}) => {
    const rotation = extra.rotation || [0, 0, 0];
    const mesh = model.box(
      center[0] + cos * x + sin * z,
      y,
      center[1] - sin * x + cos * z,
      w,
      h,
      d,
      color,
      {
        community: true,
        areaBBQ: b.type,
        surface: 'steel',
        roughness: 0.5,
        ...extra,
        rotation: [rotation[0], rotation[1] + yaw, rotation[2]],
      },
    );
    parts.push(mesh);
    return mesh;
  };
  part(0, 0.22, 0, 2.8, 0.04, 1.5, '#c8c1ac', { surface: 'stone' });
  part(-0.55, 0.72, 0, 1.3, 0.88, 0.85, '#617985');
  part(-0.55, 1.17, 0, 1.4, 0.12, 0.95, '#a5b1ae');
  part(-0.55, 1.24, 0, 1.16, 0.025, 0.68, '#34484e');
  for (let x = -1.05; x <= -0.05; x += 0.125) part(x, 1.27, 0, 0.035, 0.035, 0.67, '#abb6b0');
  // Raised lid and handle make the grill recognizable without flames near the play areas.
  part(-0.55, 1.53, -0.31, 1.35, 0.08, 0.72, '#73929a', { rotation: [-1.05, 0, 0] });
  part(-0.55, 1.86, -0.13, 0.65, 0.065, 0.07, '#384f56');
  for (const x of [-0.9, -0.2]) {
    part(x, 1.04, 0.45, 0.1, 0.1, 0.055, '#d09c6f');
    part(x, 0.3, 0.25, 0.14, 0.15, 0.14, '#405862');
  }
  part(0.82, 1.15, 0, 1.12, 0.1, 0.85, '#b5bdb3');
  for (const x of [0.38, 1.26])
    for (const z of [-0.3, 0.3]) part(x, 0.68, z, 0.075, 0.86, 0.075, '#71878b');
  part(0.82, 0.48, 0, 1.05, 0.07, 0.75, '#829698');
  part(0.74, 1.22, 0, 0.6, 0.045, 0.4, '#b59970', { surface: 'timber' });
  part(1.17, 1.31, -0.15, 0.12, 0.2, 0.12, '#b67865', { surface: 'plastic' });
  const footprint = {
    x: center[0],
    z: center[1],
    w: Math.abs(cos) * 2.65 + Math.abs(sin) * 0.95,
    d: Math.abs(cos) * 0.95 + Math.abs(sin) * 2.65,
    community: true,
    areaBBQ: b.type,
  };
  model.colliders.push(footprint);
  return { area: b.name, type: b.type, parts, footprint };
}
