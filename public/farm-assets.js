import { addAnimal, setGoal } from './animals.js';
// Victorian farm scenes: a homestead on the usual property, surrounded by post-and-wire
// paddocks with farm buildings, water and animals. The playable property stays where it is.

// Paddocks around the property: [x0, z0, x1, z1].
const PADDOCKS = {
  left: [-35, -30, -17.6, 30],
  right: [17.6, -30, 35, 30],
  back: [-17, -31, 17, -14.6],
  front: [-17, 14.6, 17, 31],
};

export function buildFarm(l, m) {
  const { box, cylinder, sphere, mesh, roof, pitchedRoof, beam } = m;
  m.animals = [];
  const farm = (m.farm = { style: l.style });
  const front = -1,
    pasture = { dairy: '#8fb865', sheep: '#b4b877', orchard: '#9cba6d', horse: '#a3b56f' }[l.style];
  // ---- Homestead on the property ----
  for (let y = 0.35; y <= 1.45; y += 0.18) box(-5.85, y, front + 0.06, 14.5, 0.05, 0.06, '#d8cfb8');
  pitchedRoof(l.accent, { pitch: l.style === 'sheep' ? 0.4 : 0.5, ridge: '#5f5a55' });
  const verandaDepth = l.style === 'sheep' ? 2.2 : 1.5;
  roof(
    'box',
    [-5.85, 1.55, front + verandaDepth / 2],
    [15, 0.08, verandaDepth + 0.2],
    l.accent,
    [0.12, 0, 0],
  );
  for (let x = -12.8; x <= 1.3; x += 2.35)
    cylinder(x, 0.78, front + verandaDepth, 0.06, 1.55, '#f1ece0');
  if (l.style === 'horse') box(-5.85, 0.35, front + 0.08, 14.6, 0.5, 0.1, '#a19883'); // stone base
  // ---- Land and paddocks around the property ----
  box(0, -0.53, 0, 72, 1, 64, '#a3b278');
  box(0, -0.045, 0, 71.8, 0.1, 63.8, pasture);
  const wire = (x0, z0, x1, z1) => {
    const alongX = z0 === z1,
      length = alongX ? x1 - x0 : z1 - z0;
    for (let d = 0; d <= length + 1e-9; d += 5)
      box(alongX ? x0 + d : x0, 0.6, alongX ? z0 : z0 + d, 0.12, 1.2, 0.12, '#8c7458');
    for (const y of [0.4, 0.7, 1.0])
      box(
        (x0 + x1) / 2,
        y,
        (z0 + z1) / 2,
        alongX ? length : 0.02,
        0.02,
        alongX ? 0.02 : length,
        '#9aa0a2',
      );
  };
  for (const [x0, z0, x1, z1] of Object.values(PADDOCKS)) {
    wire(x0, z0, x1, z0);
    wire(x0, z1, x1, z1);
    wire(x0, z0, x0, z1);
    wire(x1, z0, x1, z1);
  }
  // ---- Farm features ----
  const shed = (x, z, w, d, h, wallColour, roofColour) => {
    box(x, h / 2, z, w, h, d, wallColour);
    box(x, h + 0.35, z, w + 0.6, 0.12, d + 0.6, roofColour, { rotation: [0.12, 0, 0] });
  };
  const openShed = (x, z, w, d, h, roofColour) => {
    for (const dx of [-w / 2, 0, w / 2])
      for (const dz of [-d / 2, d / 2]) box(x + dx, h / 2, z + dz, 0.15, h, 0.15, '#7d6a52');
    box(x, h + 0.2, z, w + 0.6, 0.1, d + 0.6, roofColour, { rotation: [0.1, 0, 0] });
  };
  const dam = (x, z, r) => {
    cylinder(x, 0.02, z, r + 0.6, 0.05, '#9a8a62');
    cylinder(x, 0.05, z, r, 0.05, '#5f93a8', { opacity: 0.9 });
  };
  const bale = (x, z, colour = '#d7bd6b') =>
    cylinder(x, 0.55, z, 0.55, 1.1, colour, { rotation: [Math.PI / 2, 0, 0] });
  const trough = (x, z) => {
    box(x, 0.3, z, 2.2, 0.5, 0.7, '#8d969a');
    return box(x, 0.52, z, 2.0, 0.05, 0.5, '#6f9fb0');
  };
  // A swinging gate in a paddock fence, hinged at (x, z) and closed along +z.
  const fenceGate = (x, z) => {
    const panel = box(x, 0.6, z + 1.2, 0.08, 1.0, 2.4, '#b9a27e');
    return { panel, hinge: [x, z], angle: 0 };
  };
  const windmill = (x, z) => {
    for (const [dx, dz] of [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ])
      beam([x + dx * 0.9, 0, z + dz * 0.9], [x + dx * 0.15, 6.5, z + dz * 0.15], 0.08, '#9aa3a6');
    box(x, 6.6, z, 0.5, 0.4, 0.5, '#7d8689');
    box(x, 6.7, z - 1.0, 0.06, 0.8, 1.4, '#c9c3b6'); // tail vane
    const hub = [x, 6.7, z + 0.45],
      blades = [];
    for (let i = 0; i < 12; i++)
      blades.push(box(hub[0], hub[1], hub[2], 0.18, 1.3, 0.04, '#d6d9d6'));
    (m.windmills ??= []).push({ hub, blades, angle: 0 });
  };
  const fruitTree = (x, z) => {
    cylinder(x, 0.6, z, 0.12, 1.2, '#7a6249');
    sphere(x, 1.6, z, 0.9, '#5f9150');
    for (let i = 0; i < 5; i++)
      sphere(
        x + Math.cos(i * 1.3) * 0.7,
        1.4 + (i % 2) * 0.4,
        z + Math.sin(i * 1.3) * 0.7,
        0.12,
        '#c93a2f',
      );
  };
  let seed = l.latitude * -1000;
  const herd = (kind, paddock, count) => {
    for (let i = 0; i < count; i++) addAnimal(m, kind, paddock, (seed += 17.3));
  };
  switch (l.style) {
    case 'dairy':
      openShed(0, -23, 10, 6, 2.6, '#a33b2f'); // milking shed
      box(0, 0.08, -23, 9.6, 0.1, 5.6, '#c9c6bd'); // concrete yard
      for (let i = 0; i < 6; i++) bale(-12 + i * 1.3, 26, '#eef0ea'); // wrapped silage
      dam(8, 24, 3.2);
      windmill(27, -22);
      trough(24, -22);
      // Gates from the side paddocks into the dairy yard.
      farm.gates = [fenceGate(-17.3, -23.2), fenceGate(17.3, -23.2)];
      herd('cow', PADDOCKS.left, 5);
      herd('cow', PADDOCKS.right, 4);
      break;
    case 'sheep':
      shed(-3, -23, 11, 6, 2.4, '#b8bfc2', '#9aa3a6'); // shearing shed
      box(4.5, 0.6, -23, 4, 1.2, 4, '#a7a08c'); // holding yard pens
      windmill(26, -20);
      farm.troughWater = trough(23.5, -20);
      dam(-26, 21, 3.5);
      for (let i = 0; i < 5; i++) bale(-6 + i * 1.3, 26);
      herd('sheep', PADDOCKS.left, 8);
      herd('sheep', PADDOCKS.right, 7);
      herd('dog', [17.6, -12, 35, 12], 1);
      break;
    case 'orchard':
      for (let x = -32; x <= -21; x += 3.6) for (let z = -26; z <= 26; z += 4.2) fruitTree(x, z);
      for (let x = 21; x <= 32; x += 3.6) for (let z = -26; z <= 26; z += 4.2) fruitTree(x, z);
      shed(-6, -22, 4, 3, 1.6, '#c2a27a', '#4f6b4a'); // hen house
      box(-6, 0.45, -20.47, 0.8, 0.9, 0.04, '#2b2622'); // pop hole
      farm.henDoor = box(-6, 0.45, -20.43, 0.9, 0.95, 0.05, '#8c6a4a');
      for (const z of [-25, -18]) box(-1, 0.45, z, 10, 0.9, 0.04, '#b9bcb8', { opacity: 0.6 }); // run
      dam(0, 24, 4);
      herd('chicken', [-12, -27, 9, -16], 9);
      herd('duck', [-4, 20, 4, 28], 4);
      break;
    case 'horse':
      shed(0, -23, 13, 4.5, 2.2, '#8c6a4a', '#3f4d45'); // stables
      for (let i = 0; i < 4; i++) box(-4.8 + i * 3.2, 1.0, -20.7, 1.5, 1.8, 0.06, '#5f4632'); // doors
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * Math.PI * 2;
        box(26 + Math.cos(a) * 5, 0.7, 18 + Math.sin(a) * 5, 0.1, 1.4, 0.1, '#f1ece0'); // round yard
      }
      cylinder(26, 0.03, 18, 5, 0.04, '#d6c49c');
      trough(-24, -24);
      for (let i = 0; i < 4; i++) bale(6 + i * 1.3, 26);
      // Paddock shelters with misting sprinklers along the eaves.
      farm.shelters = [-31, 31].map((x) => {
        openShed(x, -25, 5, 4, 2.9, '#5f6b63');
        // Two rows of sprinkler heads, each with a few droplets falling at staggered heights.
        const mist = [];
        for (let i = 0; i < 36; i++)
          mist.push(
            sphere(
              x - 2.1 + (i % 9) * 0.52,
              2.8,
              -25 + (i % 18 < 9 ? -1.4 : 1.4),
              0.09,
              '#f2f8fa',
              {
                opacity: 0,
              },
            ),
          );
        return { x, z: -25, mist };
      });
      herd('horse', [-35, -30, -17.6, 14], 2);
      herd('horse', [17.6, -30, 35, 10], 2);
      herd('goat', PADDOCKS.back, 4);
      break;
  }
  m.architecture = l.style;
  return m;
}

const on = (devices, outputs, id) =>
  (devices || []).some((d) => d.id === id && (outputs?.[d.pin] || 0) > 0);
// Routes start with no goal; the first 'home' goal must not walk animals anywhere.
const goal = (a, key, route, bounds, hide) =>
  !a.goalKey && key === 'home' ? (a.goalKey = 'home') : setGoal(a, key, route, bounds, hide);

// Farm responses to the circuit and the conditions: the hen-house door and hens at dusk, the
// dairy gates and the herd, the stock trough and thirsty sheep, and the misting shelters.
export function updateFarm(model, devices, outputs, env, t, reduced) {
  const farm = model.farm;
  if (!farm) return;
  const daylight = Math.min(1, Math.max(0, (env.light ?? 70) / 65)),
    animals = model.animals || [];
  if (farm.henDoor) {
    // Without a door circuit the farmer opens the door by day and shuts it at night.
    const open = devices?.some((d) => d.id === 'gate')
      ? on(devices, outputs, 'gate')
      : daylight > 0.35;
    farm.henDoor.pos[1] = open ? 1.3 : 0.45;
    const door = [-6, -19.2];
    for (const a of animals.filter((a) => a.kind === 'chicken')) {
      if (daylight > 0.35) {
        // Morning: out through an open door; with the door shut the hens stay in.
        if (open || a.goalKey !== 'roost') goal(a, 'home', [door], a.paddock);
      } else if (open) goal(a, 'roost', [door, [-6, -22]], [-7.5, -23.2, -4.5, -21], true);
      else if (a.goalKey !== 'roost') goal(a, 'waiting', [], [-7.6, -20.2, -4.4, -17.4]);
    }
  }
  if (farm.gates) {
    const open = on(devices, outputs, 'gate');
    for (const gate of farm.gates) {
      gate.angle += ((open ? Math.PI / 2 : 0) - gate.angle) * (reduced ? 1 : 0.08);
      const side = gate.hinge[0] < 0 ? -1 : 1,
        a = gate.angle * side;
      gate.panel.pos[0] = gate.hinge[0] + 1.2 * Math.sin(a);
      gate.panel.pos[2] = gate.hinge[1] + 1.2 * Math.cos(a);
      gate.panel.rotation[1] = a;
    }
    for (const a of animals.filter((a) => a.kind === 'cow')) {
      const s = a.paddock[0] < 0 ? -1 : 1;
      if (open)
        goal(
          a,
          'milking',
          [
            [s * 21, -22],
            [s * 14, -22],
            [s * 4, -19],
          ],
          [-6, -26, 6, -17.5],
        );
      else
        goal(
          a,
          'home',
          [
            [s * 14, -22],
            [s * 21, -22],
          ],
          a.paddock,
        );
    }
  }
  if (farm.troughWater) {
    const level = Math.min(1, Math.max(0, (env.pond ?? 60) / 100));
    farm.troughWater.size[1] = 0.03 + level * 0.4;
    farm.troughWater.pos[1] = 0.1 + farm.troughWater.size[1] / 2;
    farm.troughWater.opacity = level < 0.02 ? 0 : undefined;
    // A low trough brings the thirsty sheep in the windmill paddock crowding round.
    for (const a of animals.filter((a) => a.kind === 'sheep' && a.paddock[0] > 0))
      if (level < 0.3) goal(a, 'thirsty', [], [20.5, -23.5, 27, -16.5]);
      else goal(a, 'home', [], a.paddock);
  }
  if (farm.shelters) {
    const misting = on(devices, outputs, 'valve') && (env.tank ?? 0) > 0;
    for (const shelter of farm.shelters)
      shelter.mist.forEach((drop, i) => {
        const fall = reduced ? 0.5 : (t * 0.8 + i * 0.37 + (i >= 18 ? 0.5 : 0)) % 1;
        drop.pos[1] = 2.8 - fall * 2.4;
        drop.opacity = misting ? 0.8 * (1 - fall * 0.7) : 0;
      });
    // Horses seek the shade of their paddock shelter on hot days.
    for (const a of animals.filter((a) => a.kind === 'horse')) {
      const shelter = farm.shelters[a.paddock[0] < 0 ? 0 : 1];
      if ((env.temp ?? 24) > 30)
        goal(a, 'shade', [], [shelter.x - 2.2, shelter.z - 1.6, shelter.x + 2.2, shelter.z + 1.6]);
      else goal(a, 'home', [], a.paddock);
    }
  }
}
