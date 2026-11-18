import { addAnimal } from './animals.js';
import { buildFacingBench } from './outdoor-seating.js';

// An articulated wildlife zoo with three themed outdoor habitats: Savannah Safari,
// Outback Paddock, and Petting Farmyard with a duck pond.
export function buildWildlifeZoo(model, { b, origin, box }) {
  const furniture = [],
    x0 = origin.x + b.x,
    z0 = origin.z + b.z;
  const add = (x, y, z, w, h, d, color, extra = {}) => {
    const mesh = box(b.x + x, y, b.z + z, w, h, d, color, {
      roughness: 0.72,
      ...extra,
      recreation: 'zoo',
      architectureMesh: !extra.recreationFurniture,
    });
    furniture.push(mesh);
    return mesh;
  };
  const prop = (x, y, z, w, h, d, color, extra = {}) =>
    add(x, y, z, w, h, d, color, { recreationFurniture: true, roughness: 0.76, ...extra });

  // 30x30m landscaped zoo parcel.
  add(0, 0.015, 0, b.w, 0.035, b.d, '#8ba679', { surface: 'grass' });

  // Paved visitor promenade and branching walkways connecting to animal habitats.
  prop(-9, 0.06, 0, 10, 0.05, 8, '#d5cfbe', { surface: 'stone' });
  prop(-4, 0.06, 0, 4, 0.05, 24, '#d5cfbe', { surface: 'stone' });
  prop(2, 0.06, 0, 8, 0.05, 4, '#d5cfbe', { surface: 'stone' });

  // Grand timber & stone entrance archway with overhead zoo signage.
  for (const side of [-1, 1]) {
    prop(-13.5, 0.5, side * 3.5, 0.6, 1.0, 0.6, '#939a94', { solid: true, surface: 'stone' });
    prop(-13.5, 2.0, side * 3.5, 0.35, 2.0, 0.35, '#6a513b', { surface: 'timber' });
  }
  prop(-13.5, 3.1, 0, 0.4, 0.3, 7.6, '#6a513b', { surface: 'timber' });
  prop(-13.4, 3.42, 0, 0.1, 0.48, 5.2, '#3b5234', { surface: 'plain' });
  prop(-13.3, 3.42, 0, 0.04, 0.28, 4.2, '#f2e8d2', { surface: 'plain' });

  // Ticket & Welcome Pavilion with cashier window and information desk.
  prop(-11, 0.95, -7, 2.4, 0.9, 3.0, '#7d6148', { solid: true, surface: 'timber' });
  prop(-12.1, 1.8, -7, 0.05, 0.8, 2.6, '#8bb6be', { surface: 'glass', opacity: 0.7 });
  const kioskRoof = add(-11, 2.7, -7, 3.2, 0.18, 3.8, '#4f6853', { opacity: 0, cutawayOpacity: 0 });
  model.roofs.push(kioskRoof);
  const lamp = prop(-11.5, 2.5, -5.2, 0.3, 0.3, 0.3, '#f2dfad', { emission: 0 });
  const indicator = prop(-11.5, 1.6, -5.2, 0.5, 0.4, 0.15, '#567a68', { emission: 0 });

  // Directional map board and seating.
  prop(-9, 1.2, -4.5, 0.1, 1.4, 1.8, '#594432', { surface: 'timber' });
  prop(-8.9, 1.3, -4.5, 0.04, 0.9, 1.5, '#eae2cb', { surface: 'plain' });
  buildFacingBench(model, {
    x: -6,
    z: -3.5,
    targetX: 0,
    targetZ: 0,
    worldX: x0 - 6,
    worldZ: z0 - 3.5,
    add: prop,
  });
  buildFacingBench(model, {
    x: -6,
    z: 3.5,
    targetX: 0,
    targetZ: 0,
    worldX: x0 - 6,
    worldZ: z0 + 3.5,
    add: prop,
  });

  // --- HABITAT 1: Savannah Safari (North-East, Antelopes & Deer) ---
  prop(7.5, 0.03, -7.5, 10.5, 0.02, 10.5, '#a3a675', { surface: 'grass' });
  prop(9.2, 0.04, -9.2, 3.4, 0.025, 3.4, '#48a8b8', { surface: 'water' });
  prop(11, 0.32, -7.5, 1.1, 0.45, 0.85, '#808278', { surface: 'stone' });
  prop(7.4, 0.26, -10.8, 0.85, 0.38, 1.0, '#808278', { surface: 'stone' });
  prop(7.5, 0.65, -13, 11, 1.1, 0.16, '#6b543e', { solid: true, surface: 'timber' });
  prop(7.5, 0.65, -2, 11, 1.1, 0.16, '#6b543e', { solid: true, surface: 'timber' });
  prop(13, 0.65, -7.5, 0.16, 1.1, 11, '#6b543e', { solid: true, surface: 'timber' });
  prop(2, 0.65, -7.5, 0.16, 1.1, 11, '#6b543e', { solid: true, surface: 'timber' });
  prop(4.5, 0.4, -4.5, 1.8, 0.35, 0.8, '#634b35', { solid: true, surface: 'timber' });
  prop(1.5, 1.0, -5, 0.12, 0.8, 0.8, '#5c4533', { surface: 'timber' });

  // Actual roaming animals in Savannah paddock.
  addAnimal(model, 'antelope', [x0 + 3, z0 - 12, x0 + 12, z0 - 3], 101.5);
  addAnimal(model, 'deer', [x0 + 3, z0 - 12, x0 + 12, z0 - 3], 202.7);
  addAnimal(model, 'deer', [x0 + 3, z0 - 12, x0 + 12, z0 - 3], 303.9);

  // --- HABITAT 2: Outback Wildlife (South-East, Kangaroos & Rabbits) ---
  prop(7.5, 0.03, 7.5, 10.5, 0.02, 10.5, '#ba8b62', { surface: 'soil' });
  prop(8.5, 0.35, 7.5, 0.5, 0.5, 3.2, '#5e432c', { surface: 'timber', solid: true });
  prop(7.5, 0.65, 2, 11, 1.1, 0.16, '#6b543e', { solid: true, surface: 'timber' });
  prop(7.5, 0.65, 13, 11, 1.1, 0.16, '#6b543e', { solid: true, surface: 'timber' });
  prop(13, 0.65, 7.5, 0.16, 1.1, 11, '#6b543e', { solid: true, surface: 'timber' });
  prop(2, 0.65, 7.5, 0.16, 1.1, 11, '#6b543e', { solid: true, surface: 'timber' });
  prop(11, 1.8, 11, 3.0, 0.15, 3.0, '#755c42', { surface: 'timber' });
  prop(1.5, 1.0, 5, 0.12, 0.8, 0.8, '#5c4533', { surface: 'timber' });

  // Actual roaming animals in Outback paddock.
  addAnimal(model, 'kangaroo', [x0 + 3, z0 + 3, x0 + 12, z0 + 12], 404.1);
  addAnimal(model, 'kangaroo', [x0 + 3, z0 + 3, x0 + 12, z0 + 12], 505.3);
  addAnimal(model, 'rabbit', [x0 + 3, z0 + 3, x0 + 12, z0 + 12], 606.8);
  addAnimal(model, 'rabbit', [x0 + 3, z0 + 3, x0 + 12, z0 + 12], 707.2);

  // --- HABITAT 3: Petting Farmyard (South-West, Goats, Sheep & Duck Pond) ---
  prop(-7.5, 0.03, 9, 10.5, 0.02, 8, '#7ea46a', { surface: 'grass' });
  prop(-5.5, 0.04, 9, 3.4, 0.025, 3.4, '#55b8cb', { surface: 'water' });
  prop(-7.5, 0.55, 5, 11, 0.9, 0.14, '#85705a', { solid: true, surface: 'timber' });
  prop(-7.5, 0.55, 13, 11, 0.9, 0.14, '#85705a', { solid: true, surface: 'timber' });
  prop(-13, 0.55, 9, 0.14, 0.9, 8, '#85705a', { solid: true, surface: 'timber' });
  prop(-2, 0.55, 9, 0.14, 0.9, 8, '#85705a', { solid: true, surface: 'timber' });
  prop(-10, 0.45, 7.5, 1.8, 0.4, 0.8, '#614833', { solid: true, surface: 'timber' });
  prop(-3.5, 0.9, 4.5, 0.12, 0.75, 0.75, '#5c4533', { surface: 'timber' });

  // Actual roaming animals in Petting Farmyard.
  addAnimal(model, 'goat', [x0 - 12, z0 + 6, x0 - 3, z0 + 12], 808.5);
  addAnimal(model, 'sheep', [x0 - 12, z0 + 6, x0 - 3, z0 + 12], 909.1);
  addAnimal(model, 'duck', [x0 - 12, z0 + 6, x0 - 3, z0 + 12], 1010.4);

  // Zoologist / Resident Staff.
  model.addActor(
    'recreation:zoo',
    origin.x + b.stationX,
    origin.z + b.stationZ,
    '#486850',
    '#c79878',
  );
  const keeper = model.actors.at(-1);
  Object.assign(keeper, {
    community: true,
    name: b.resident,
    role: b.role,
    area: b.name,
    section: b.name,
  });

  return { building: b, lamp, indicator, sections: [], furniture };
}
