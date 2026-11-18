export function addDeviceDetails(model, record, floor) {
  const { device: d, x, z } = record,
    y = floor;
  const extra = { device: d.id, devicePin: d.pin };
  const part = (shape, pos, size, color, props = {}) =>
    model.mesh(shape, pos, size, color, { ...extra, ...props });
  const box = (dx, dy, dz, w, h, depth, color, props = {}) =>
    part('box', [x + dx, y + dy, z + dz], [w, h, depth], color, { rounded: true, ...props });
  const circle = (dx, dy, dz, r, depth, color) =>
    part('cylinder', [x + dx, y + dy, z + dz], [r * 2, depth, r * 2], color, {
      rotation: [Math.PI / 2, 0, 0],
      roughness: 0.3,
    });
  // A small status indicator remains readable independently of the device body.
  record.face.size = [0.055, 0.018, 0.035];
  record.face.pos = [x + 0.075, y + 0.656, z + 0.06];
  record.holder.color = d.output ? '#cad4cf' : '#38675d';
  record.holder.roughness = 0.6;
  for (const dx of [-0.1, 0.1]) circle(dx, 0.47, 0.117, 0.014, 0.012, '#bcc9c4');
  if (d.id === 'wind') {
    part('cylinder', [x, y + 0.83, z], [0.045, 0.72, 0.045], '#a6bab5');
    for (let i = 0; i < 3; i++) {
      const angle = (i * Math.PI * 2) / 3;
      box(Math.cos(angle) * 0.08, 1.16, Math.sin(angle) * 0.08, 0.18, 0.02, 0.025, '#a6bab5', {
        rotation: [0, -angle, 0],
      });
      part(
        'bowl',
        [x + Math.cos(angle) * 0.16, y + 1.16, z + Math.sin(angle) * 0.16],
        [0.1, 0.07, 0.1],
        '#748f8b',
      );
    }
  } else if (d.id === 'cloud') {
    box(0, 0.53, 0.14, 0.19, 0.22, 0.03, '#b4cfd3');
    for (let i = 0; i < 3; i++) circle(-0.05 + i * 0.05, 0.55, 0.17, 0.04, 0.025, '#e2ede7');
  } else if (['led', 'porch', 'rgb'].includes(d.id)) {
    part('cylinder', [x, y + 0.78, z], [0.085, 0.38, 0.085], '#5e706e');
    part('cylinder', [x, y + 0.91, z], [0.32, 0.1, 0.32], '#495e5e');
    part('shade', [x, y + 1.17, z], [0.48, 0.23, 0.48], '#526968');
  } else if (d.id === 'fan') {
    box(0, 0.69, 0, 0.09, 0.42, 0.1, '#879c98');
    part('torus', [x, y + 1.1, z + 0.04], [0.64, 0.64, 0.64], '#899c99', {
      rotation: [Math.PI / 2, 0, 0],
      roughness: 0.35,
    });
    for (let i = 0; i < 3; i++) {
      const blade = box(0, 1.1, 0.075, 0.29, 0.12, 0.035, '#8aaba4', {
        blade: i,
        bladeRadius: 0.115,
      });
      record.parts.push(blade);
    }
    for (let i = 0; i < 8; i++)
      box(0, 1.1, 0.13, 0.58, 0.01, 0.01, '#b3bfbb', {
        rotation: [0, 0, (i * Math.PI) / 8],
        rounded: false,
      });
    circle(0, 1.1, 0.145, 0.066, 0.04, '#d8ded7');
  } else if (d.id === 'ac') {
    box(0, 1.03, 0, 0.63, 0.34, 0.22, '#e0e5df');
    // Louvres tilt open and sweep while the unit is on (animated in World3D).
    for (let i = 0; i < 5; i++)
      record.parts.push(
        box(0, 0.92 + i * 0.031, 0.12, 0.52, 0.014, 0.025, '#879b98', { louvre: i }),
      );
  } else if (d.id === 'pir' || d.id === 'occupancy') {
    box(0, 0.54, 0.125, 0.24, 0.29, 0.06, '#e0e5dc');
    part('sphere', [x, y + 0.56, z + 0.175], [0.17, 0.17, 0.11], '#f3f1e3', { roughness: 0.45 });
  } else if (d.id === 'ultra') {
    record.holder.size = [0.37, 0.24, 0.045];
    for (const dx of [-0.095, 0.095]) {
      circle(dx, 0.49, 0.08, 0.075, 0.085, '#b2bfbb');
      circle(dx, 0.49, 0.13, 0.055, 0.015, '#344a4a');
      for (let i = -1; i <= 1; i++)
        box(dx, 0.49 + i * 0.025, 0.144, 0.085, 0.007, 0.01, '#819592', { rounded: false });
    }
  } else if (['temp', 'humidity', 'outside'].includes(d.id)) {
    box(0, 0.51, 0.14, 0.18, 0.27, 0.06, '#b9d5d3');
    for (let i = 0; i < 5; i++)
      box(0, 0.42 + i * 0.035, 0.177, 0.12, 0.01, 0.008, '#4b7378', { rounded: false });
  } else if (['soil', 'level', 'pond'].includes(d.id)) {
    for (const dx of [-0.065, 0.065])
      box(dx, 0.2, 0.02, 0.028, 0.26, 0.024, '#bcc4af', { roughness: 0.3 });
    box(0, 0.4, 0.14, 0.14, 0.055, 0.035, '#2b4b48');
  } else if (d.id === 'ldr') {
    circle(0, 0.55, 0.15, 0.075, 0.025, '#c8a171');
    for (let i = 0; i < 4; i++)
      box(0, 0.51 + i * 0.023, 0.17, 0.095, 0.007, 0.01, '#836247', { rounded: false });
  } else if (['pump', 'valve'].includes(d.id)) {
    part('cylinder', [x, y + 0.58, z + 0.17], [0.2, 0.27, 0.2], '#607e82', {
      rotation: [Math.PI / 2, 0, 0],
      roughness: 0.4,
    });
    part('cylinder', [x + 0.17, y + 0.45, z + 0.12], [0.065, 0.3, 0.065], '#a7b9b8', {
      rotation: [0, 0, Math.PI / 2],
      roughness: 0.3,
    });
    for (let i = 0; i < 4; i++) box(0, 0.57, -0.005 + i * 0.046, 0.24, 0.025, 0.013, '#92a5a1');
  } else if (['button', 'pot', 'buzzer'].includes(d.id)) {
    circle(0, 0.52, 0.15, 0.09, 0.075, d.id === 'button' ? '#bc6c5b' : '#445453');
    if (d.id === 'pot') box(0, 0.55, 0.199, 0.016, 0.045, 0.012, '#d8e1d6');
    if (d.id === 'buzzer') circle(0, 0.52, 0.195, 0.03, 0.008, '#1b302f');
  } else if (['servo', 'gate'].includes(d.id)) {
    box(0, 0.53, 0.15, 0.17, 0.22, 0.14, '#507897');
    circle(0, 0.57, 0.23, 0.04, 0.03, '#e2e5d7');
    box(0, 0.59, 0.255, 0.2, 0.035, 0.02, '#e2e5d7');
  } else if (d.id === 'rain') {
    box(0, 0.54, 0.14, 0.22, 0.27, 0.025, '#69877f');
    for (let i = 0; i < 5; i++)
      box(-0.08 + i * 0.04, 0.54, 0.158, 0.014, 0.22, 0.008, '#c3c8aa', { rounded: false });
  } else if (d.id === 'door') {
    box(-0.05, 0.53, 0.15, 0.07, 0.22, 0.045, '#e4e7dc');
    box(0.05, 0.53, 0.15, 0.04, 0.22, 0.045, '#e4e7dc');
  }
}
