import {
  stationVehicleAccess,
  buildStationDriveway,
  buildStationVehicle,
} from './station-driveways.js';
import { buildCivicSections } from './civic-sections.js';
import { detailCivicBuilding } from './civic-details.js';
// Civic buildings occupy the eastern blocks of the same town street grid.
export const civicLots = [
  {
    type: 'hospital',
    name: 'Community hospital',
    resident: 'Dr Taylor',
    role: 'Hospital technician',
    x: 72,
    z: -32,
    w: 18,
    d: 14,
    color: '#c8d7d3',
  },
  {
    type: 'school',
    name: 'Neighbourhood school',
    resident: 'Ms Chen',
    role: 'School caretaker',
    x: 72,
    z: -16,
    w: 18,
    d: 14,
    color: '#d6c59e',
  },
  {
    type: 'police',
    name: 'Police station',
    resident: 'Officer Riley',
    role: 'Police technician',
    x: 72,
    z: 16,
    w: 18,
    d: 14,
    color: '#9baebe',
  },
  {
    type: 'fire',
    name: 'Fire station',
    resident: 'Captain Morgan',
    role: 'Fire station technician',
    x: 72,
    z: 32,
    w: 18,
    d: 14,
    color: '#c28d7b',
  },
].map((b) => ({ ...b, id: b.type, civic: true, height: 4.5, district: 'Community services' }));

export function buildCivicBuildings(model, { sim, origin, box, objects }) {
  const buildings = [];
  for (const b of sim.map.buildings.filter((b) => b.civic)) {
    const add = (x, y, z, w, h, d, color, extra = {}) =>
      box(x, y, z, w, h, d, color, { civic: b.type, architectureMesh: true, ...extra });
    const front = b.x - b.w / 2;
    add(b.x, 0.12, b.z, b.w, 0.15, b.d, '#dfded1', { surface: 'tile' });
    const access = stationVehicleAccess(b);
    if (access) {
      const min = b.z - b.d / 2,
        max = b.z + b.d / 2;
      for (const [start, end] of [
        [min, access.z - access.width / 2],
        [access.z + access.width / 2, max],
      ])
        if (end > start)
          add(access.gateX, 1.8, (start + end) / 2, 0.25, 3.6, end - start, b.color, {
            solid: true,
          });
    } else add(b.x + b.w / 2, 1.8, b.z, 0.25, 3.6, b.d, b.color, { solid: true });
    for (const side of [-1, 1]) {
      add(b.x, 1.8, b.z + (side * b.d) / 2, b.w, 3.6, 0.25, b.color, { solid: true });
      // Recessed glazing occupies a real opening, with a sill and lintel.
      const z = b.z + side * 4.1;
      add(front, 0.5, z, 0.25, 1, 5.8, b.color, { solid: true });
      add(front, 3.1, z, 0.25, 1, 5.8, b.color, { solid: true });
      for (const dz of [-2.3, 2.3])
        add(front, 1.8, z + dz, 0.25, 1.6, 1.2, b.color, { solid: true });
      add(front, 1.8, z, 0.08, 1.6, 3.4, '#89adb6', {
        opacity: 0.72,
        surface: 'glass',
        solid: true,
      });
    }
    add(front, 3.3, b.z, 0.25, 0.6, 2.4, b.color);
    add(front - 1, 3.4, b.z, 2.5, 0.15, 3.2, '#677c82');
    const roof = add(b.x, 3.75, b.z, b.w + 0.5, 0.18, b.d + 0.5, '#87938c', {
      opacity: 0,
      cutawayOpacity: 0,
    });
    model.roofs.push(roof);
    const lamp = add(front - 0.2, 2.7, b.z - 2, 0.15, 0.35, 0.45, '#eed7a5', { emission: 0 });
    const indicator = add(b.x + 5, 2, b.z - 6.6, 1.2, 0.7, 0.1, '#547572', { emission: 0 });
    if (b.type === 'hospital') {
      // A reception counter and two treatment beds.
      for (const dz of [-5, 5]) {
        add(b.x + 5, 0.65, b.z + dz, 2.4, 0.3, 3.5, '#c4d4d2', { solid: true });
        add(b.x + 5, 0.87, b.z + dz, 2.2, 0.16, 3.2, '#f0eee5');
        add(b.x + 5, 1, b.z + dz - 1.1, 1.8, 0.16, 0.65, '#d8e2df');
      }
      add(front - 0.2, 2.2, b.z + 5, 0.1, 1.6, 0.45, '#c25852');
      add(front - 0.22, 2.2, b.z + 5, 0.1, 0.45, 1.6, '#c25852');
    } else if (['school', 'police'].includes(b.type)) {
      // Individual rooms are built below with their own doors and installation bounds.
    } else {
      add(b.x - 4, 0.96, b.z - 6, 3, 0.12, 1.4, '#b29a76', {
        solid: true,
        architectureMesh: false,
        surface: 'timber',
      });
      for (const dx of [-1.3, 1.3])
        for (const dz of [-0.5, 0.5])
          add(b.x - 4 + dx, 0.55, b.z - 6 + dz, 0.08, 0.7, 0.08, '#788b89', { surface: 'steel' });
      add(b.x - 4, 1.3, b.z - 6.25, 0.7, 0.45, 0.08, '#405d63', { surface: 'steel' });
      add(b.x - 4, 1.07, b.z - 5.7, 0.55, 0.04, 0.2, '#697d7c', { surface: 'steel' });
      buildStationVehicle(b, add);
    }
    const driveway = buildStationDriveway({ b, add });
    if (driveway) (sim.map.stationDriveways ??= []).push(driveway);
    const sections = buildCivicSections(model, { b, sim, origin, add });
    detailCivicBuilding(model, { b, add });
    const staffX = b.type === 'school' ? b.x - 4 : b.x + 1.8;
    model.addActor(
      'civic:' + b.type,
      origin.x + staffX,
      origin.z + b.z + 0.5,
      b.type === 'fire' ? '#b87555' : '#6f929c',
      '#bc9276',
    );
    Object.assign(model.actors.at(-1), {
      community: true,
      name: b.resident,
      role: b.role,
      area: b.name,
      section: b.name,
    });
    buildings.push({ building: b, lamp, indicator, sections, driveway });
  }
  return buildings;
}

export function updateCivicBuildings(buildings, state) {
  for (const { building, lamp, indicator, sections } of buildings) {
    const active = (id) =>
      state.running &&
      state.devices.some(
        (d) => d.area === building.name && d.id === id && state.outputs[d.pin] > 0,
      );
    lamp.emission = active('led') ? 1 : 0;
    indicator.emission = active('fan') || active('buzzer') ? 0.6 : 0;
    indicator.color = active('buzzer') ? '#d99560' : active('fan') ? '#7ab8a3' : '#547572';
    for (const section of sections || []) {
      const on = (id) =>
        state.running &&
        state.devices.some(
          (d) => d.area === section.name && d.id === id && state.outputs[d.pin] > 0,
        );
      section.lamp.emission = on('led') ? 1 : 0;
      section.indicator.emission = on('fan') || on('buzzer') ? 0.6 : 0;
    }
  }
}
