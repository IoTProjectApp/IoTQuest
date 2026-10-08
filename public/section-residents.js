import { toWorld, fromWorld, findFree, clearPath } from './world-math.js';

export const sectionResidents = [
  ['Bedroom', 'Nina', 19, 17],
  ['Bathroom', 'Omar', 30, 15],
  ['Kitchen', 'Priya', 35, 31],
  ['Utility room', 'Theo', 48, 12],
  ['Living room', 'Jordan', 20, 35],
  ['Garage', 'Casey', 50, 30],
  ['Greenhouse', 'Ivy', 80, 20],
  ['Water tank', 'Morgan', 91, 43],
  ['Plant beds', 'Robin', 77, 64],
  ['Garden path', 'Eden', 43, 60],
  ['Entrance', 'Jamie', 32, 51],
];
const farmNames = {
  Greenhouse: 'Livestock shelter',
  'Water tank': 'Farm water supply',
  'Plant beds': 'Crop garden',
  'Garden path': 'Farm lane',
  Garage: 'Farm workshop',
  Entrance: 'Stock entrance',
};
export function residentsForSections(location, overrides = {}) {
  return sectionResidents.map(([area, name, x, y], index) => {
    [x, y] = overrides[area] || location?.areaOverrides?.[area] || [x, y];
    const pos = toWorld({ x, y });
    return {
      key: 'section:' + area,
      area,
      name,
      section: location?.farm ? farmNames[area] || area : area,
      x: pos[0],
      z: pos[2],
      color: ['#737fb0', '#a47665', '#668c79', '#ae9563'][index % 4],
    };
  });
}
export function addSectionResidents(model, location) {
  for (const resident of residentsForSections(location, model.areaOverrides)) {
    // Resolve furniture and walls using the same clearance as the technician.
    const point = toWorld(findFree(fromWorld(resident.x, resident.z), model.colliders));
    model.addActor(
      resident.key,
      point[0],
      point[2],
      resident.color,
      '#bc9276',
      resident.area === 'Plant beds',
    );
    Object.assign(model.actors.at(-1), resident, { x: point[0], z: point[2] });
  }
}
// Entry/exit hysteresis prevents a dismissed greeting reopening while standing nearby.
export function createGreetingTracker() {
  const greeted = new Set();
  return {
    reset() {
      greeted.clear();
    },
    approach(player, characters, enabled = true, colliders = []) {
      for (const c of characters)
        if (Math.hypot(c.x - player.x, c.z - player.z) > 3.4) greeted.delete(c.key);
      if (!enabled) return null;
      const nearby = characters
        .filter((c) => {
          if (Math.hypot(c.x - player.x, c.z - player.z) > 1.8) return false;
          return clearPath(player, c, colliders);
        })
        .sort(
          (a, b) =>
            Math.hypot(a.x - player.x, a.z - player.z) - Math.hypot(b.x - player.x, b.z - player.z),
        );
      // Suppress the entire cluster until the technician leaves, rather than opening each dialog in turn.
      const fresh = nearby.find((c) => !greeted.has(c.key));
      nearby.forEach((c) => greeted.add(c.key));
      return fresh || null;
    },
    acknowledge(player, characters) {
      characters.forEach((c) => {
        if (Math.hypot(c.x - player.x, c.z - player.z) <= 3.4) greeted.add(c.key);
      });
    },
  };
}
