// A city as the Character Editor's routine map and checks need it: what is in the way (colliders),
// who the game moves as an actor and where they stand, and the names already used there (actors'
// and quest residents'). Built as the game builds it, without the people added here.
import { buildWorldModel } from '../../../public/world3d.js';
import { PEOPLE_SETTINGS, isOwn } from '../../../public/people-settings.js';
import { missions } from '../../../public/missions.js';
import { locationById, adaptMissions } from '../../../public/locations.js';

const cache = new Map();
export function cityWorld(city = 'legacy') {
  if (cache.has(city)) return cache.get(city);
  const saved = PEOPLE_SETTINGS.people;
  PEOPLE_SETTINGS.people = [];
  let model;
  try {
    model = buildWorldModel(city);
  } finally {
    PEOPLE_SETTINGS.people = saved;
  }
  const location = city === 'legacy' ? null : locationById(city),
    names = locationById(city)?.names || {},
    actors = model.actors
      .filter((a) => !isOwn(a.id))
      .map((a) => ({ id: a.id, name: a.name || names[a.id] || a.id, x: a.x, z: a.z }));
  const colliders = model.colliders.filter((c) => !c.disabled);
  let minX = Infinity,
    maxX = -Infinity,
    minZ = Infinity,
    maxZ = -Infinity;
  for (const c of colliders) {
    minX = Math.min(minX, c.x - c.w / 2);
    maxX = Math.max(maxX, c.x + c.w / 2);
    minZ = Math.min(minZ, c.z - c.d / 2);
    maxZ = Math.max(maxZ, c.z + c.d / 2);
  }
  const world = {
    city,
    colliders,
    actors,
    actorIds: new Set(actors.map((a) => a.id)),
    names: new Set(
      [
        ...actors.filter((a) => a.id !== 'player').map((a) => a.name),
        ...adaptMissions(missions, location, 'beginner').map((m) => m.resident),
      ]
        .filter(Boolean)
        .map((n) => String(n).toLowerCase()),
    ),
    bounds: { minX, maxX, minZ, maxZ },
  };
  cache.set(city, world);
  return world;
}
