import { buildStationVehicle } from './station-driveways.js';
import { furnishClassroom } from './classroom-furniture.js';
import { fromWorld } from './world-math.js';

export function buildCivicSections(model, { b, sim, origin, add }) {
  if (!['school', 'police'].includes(b.type)) return [];
  const sections = [];
  const wall = (x, z, w, d) =>
    add(x, 0.8, z, w, 1.3, d, b.color, { solid: true, civicPartition: b.type });
  if (b.type === 'school') {
    for (const dz of [-2.3, 2.3]) wall(b.x + 4, b.z + dz, 10, 0.16);
    for (const [i, dz] of [-4.6, 0, 4.6].entries()) {
      const z = b.z + dz,
        type = 'schoolClassroom' + (i + 1);
      for (const side of [-1, 1]) wall(b.x - 1, z + side * 1.6, 0.16, 1.2);
      add(b.x + 4, 0.23, z, 9.5, 0.045, 4.35, ['#dfd4b5', '#cddcc9', '#cbd8df'][i], {
        civicSection: type,
        surface: 'tile',
      });
      add(b.x + 8.65, 2, z, 0.1, 1.5, 2.6, '#41665a', { civicSection: type });
      const students = furnishClassroom(add, { type, x: b.x, z, index: i });
      sections.push({
        type,
        students,
        name: 'School classroom ' + (i + 1),
        x: b.x + 3.5,
        z,
        resident: ['Ms Rao', 'Mr Patel', 'Ms Nguyen'][i],
        role: 'Class teacher',
        bounds: { minX: b.x - 0.7, maxX: b.x + 8.65, minZ: z - 2.1, maxZ: z + 2.1 },
        route: [
          [b.x - 2, b.z],
          [b.x - 2, z],
          [b.x + 3.5, z],
        ],
      });
    }
  } else {
    // Office beside reception, a central corridor, then holding cells and a vehicle bay.
    wall(b.x - 1, b.z - 4.5, 0.16, 5);
    for (const side of [-1, 1]) wall(b.x - 4.5 + side * 2.55, b.z - 2, 3.1, 0.16);
    wall(b.x + 5, b.z - 1, 8, 0.16);
    add(b.x - 4.5, 0.23, b.z - 4.5, 7.6, 0.045, 4.6, '#d6d8cb', { surface: 'tile' });
    add(b.x - 7, 0.78, b.z - 5.5, 1.6, 0.12, 1.1, '#ab9273', { solid: true });
    add(b.x - 6.7, 1.1, b.z - 5.5, 0.7, 0.45, 0.08, '#547572');
    add(b.x - 7, 0.43, b.z - 4.3, 0.7, 0.65, 0.7, '#7c9ca0', { solid: true });
    // Bars leave a two metre doorway from the corridor into the holding area.
    for (const dz of [-6.7, -6.1, -5.5, -4.9, -3.1, -2.5, -1.9, -1.3])
      add(b.x + 1, 1.55, b.z + dz, 0.08, 2.6, 0.08, '#6d7c82', { solid: true });
    for (const y of [0.3, 2.85]) add(b.x + 1, y, b.z - 4, 0.1, 0.1, 6, '#6d7c82');
    // Two holding cells, behind an open barred entrance.
    wall(b.x + 7, b.z - 4, 4, 0.12);
    for (const dz of [-6.6, -6, -5.4, -4.8, -3.2, -2.6, -2, -1.4])
      add(b.x + 5.5, 1.55, b.z + dz, 0.08, 2.6, 0.08, '#6d7c82', { solid: true });
    for (const dz of [-5.5, -2.5]) {
      add(b.x + 7.5, 0.55, b.z + dz, 2.4, 0.3, 0.95, '#a6b4b0', { solid: true });
      add(b.x + 7.5, 0.77, b.z + dz, 2.2, 0.14, 0.8, '#d8ded7');
    }
    add(b.x + 5, 0.23, b.z + 3.5, 7.8, 0.05, 6.7, '#7d898c', { civicSection: 'policeParking' });
    for (const dz of [1.5, 5.5]) add(b.x + 5, 0.265, b.z + dz, 7.6, 0.015, 0.08, '#eee7c8');
    buildStationVehicle(b, add);
    sections.push(
      {
        type: 'policeOffice',
        name: 'Police office',
        x: b.x - 4.5,
        z: b.z - 4.5,
        resident: 'Sergeant Kim',
        role: 'Duty sergeant',
        bounds: { minX: b.x - 8.65, maxX: b.x - 1.3, minZ: b.z - 6.65, maxZ: b.z - 2.3 },
        route: [
          [b.x - 4.5, b.z],
          [b.x - 4.5, b.z - 4.5],
        ],
      },
      {
        type: 'policeParking',
        name: 'Police parking',
        x: b.x + 2.5,
        z: b.z + 3.5,
        resident: 'Officer Blake',
        role: 'Fleet officer',
        bounds: { minX: b.x + 1.3, maxX: b.x + 4.6, minZ: b.z + 0.3, maxZ: b.z + 6.65 },
        route: [
          [b.x, b.z],
          [b.x + 2.5, b.z],
          [b.x + 2.5, b.z + 3.5],
        ],
      },
      {
        type: 'policeJail',
        name: 'Police jail',
        x: b.x + 3.5,
        z: b.z - 4,
        resident: 'Officer Quinn',
        role: 'Custody officer',
        bounds: { minX: b.x + 1.3, maxX: b.x + 5.1, minZ: b.z - 6.65, maxZ: b.z - 1.3 },
        route: [
          [b.x, b.z],
          [b.x, b.z - 4],
          [b.x + 3.5, b.z - 4],
        ],
      },
    );
  }
  for (const section of sections) {
    section.parentType = b.type;
    const point = fromWorld(origin.x + section.x, origin.z + section.z);
    const bounds = Object.fromEntries(
      Object.entries(section.bounds).map(([key, value]) => [
        key,
        value + (key.endsWith('X') ? origin.x : origin.z),
      ]),
    );
    model.rooms.push([
      section.name,
      origin.x + section.x,
      origin.z + section.z,
      { community: true, type: section.type, civicSection: true, parentType: b.type, bounds },
    ]);
    section.area = [
      section.name,
      point.x,
      point.y,
      { communityType: section.type, civicSection: true, parentType: b.type },
    ];
    section.lamp = add(section.x, 2.8, section.z - 1, 0.3, 0.15, 0.3, '#eed7a5', {
      civicSection: section.type,
      sectionIndicator: true,
      material: 'glass',
      roughness: 0.12,
      emission: 0,
    });
    section.indicator = add(section.x + 0.8, 2.5, section.z - 1, 0.22, 0.3, 0.1, '#547572', {
      civicSection: section.type,
      sectionIndicator: true,
      material: 'glass',
      roughness: 0.12,
      emission: 0,
    });
    let previous = b.node;
    for (const [i, [x, z]] of section.route.entries()) {
      const from = sim.map.walks.nodes[previous];
      if (from.x === x && from.z === z) continue;
      const node = sim.map.walks.node(section.type + ':door:' + i, x, z);
      sim.map.walks.edge(previous, node);
      sim.map.walks.edge(node, previous);
      previous = node;
    }
    section.node = previous;
    model.addActor(
      'civic-section:' + section.type,
      origin.x + section.x + 0.7,
      origin.z + section.z,
      '#728c96',
      '#bc9276',
    );
    Object.assign(model.actors.at(-1), {
      community: true,
      name: section.resident,
      area: section.name,
      section: section.name,
      role: section.role,
    });
  }
  return sections;
}
