// A play-test opened by the IoT Quest Editor (editor/, launched with scripts/world-editor.sh) at
// what is being edited: game.html?editor-play=<JSON target>, where the target is any of
//   city    a location id, or 'legacy' for the original home (where a target without one
//           starts; with no target at all the game opens on its globe, as it does for a player)
//   quest   a quest's place in the game's list, started on arrival
//   person  someone to walk up to: an actor id ('Maya', 'worker:shop-floor:0') or the name a quest
//           gives them ('Ms Chen'); name is what this city calls them ('Akari')
//   chat    true to open a chat with that person
//   at      [x, z] in world metres to stand at (a Map Editor object)
//   place   'town' to stand in the town's streets
//   world   a World Builder world's id: the game opens that world's page (world.html) instead
// With the parameter present at all, the game starts fresh and saves nothing: a play-test never
// reads or writes the player's progress, whichever browser it is opened in.
export const PLAY_PARAM = 'editor-play';

const text = (v) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 80) : null);

// The target in a page's query string, checked; null when the page was not opened for a play-test.
export function readPlayTarget(search, { locationIds = [], questCount = 0, worldIds = null } = {}) {
  let raw;
  try {
    raw = new URLSearchParams(search || '').get(PLAY_PARAM);
  } catch {
    return null;
  }
  if (raw === null) return null;
  let value = {};
  try {
    value = JSON.parse(raw || '{}');
  } catch {}
  if (!value || typeof value !== 'object' || Array.isArray(value)) value = {};
  const quest = Number.isInteger(value.quest) && value.quest >= 0 && value.quest < questCount;
  const at =
    Array.isArray(value.at) &&
    value.at.length === 2 &&
    value.at.every((n) => typeof n === 'number' && Number.isFinite(n));
  const person = text(value.person);
  return {
    city: value.city === 'legacy' || locationIds.includes(value.city) ? value.city : null,
    quest: quest ? value.quest : null,
    person,
    name: person ? text(value.name) : null,
    chat: !!person && value.chat === true,
    at: at ? [...value.at] : null,
    place: value.place === 'town' ? 'town' : null,
    // A world's id; checked against the saved worlds when the game knows them.
    world:
      typeof value.world === 'string' &&
      /^[A-Za-z0-9_-]{1,80}$/.test(value.world) &&
      (!worldIds || worldIds.includes(value.world))
        ? value.world
        : null,
  };
}
// The game's address for a target (null or {} starts from the beginning, still saving nothing).
export function playTargetUrl(base, target = null) {
  const kept = Object.fromEntries(
    Object.entries(target || {}).filter(([, v]) => v !== null && v !== undefined && v !== false),
  );
  return `${base}?${PLAY_PARAM}=${encodeURIComponent(JSON.stringify(kept))}`;
}
// The person a target names among the characters around ({ key, name, x, z }): by id first, then
// by the name this city calls them, then by the name their quests give them.
export function findPerson(characters, { person, name } = {}) {
  if (!person) return null;
  return (
    characters.find((c) => c.key === person) ||
    (name && characters.find((c) => c.name === name)) ||
    characters.find((c) => c.name === person) ||
    null
  );
}
// Where to stand to talk to someone: a step in front of them, towards where the player is.
export function besidePerson(person, from = null, distance = 1.4) {
  let dx = from ? from[0] - person.x : 0,
    dz = from ? from[1] - person.z : 1;
  const length = Math.hypot(dx, dz);
  if (length < 1e-6) [dx, dz] = [0, 1];
  else [dx, dz] = [dx / length, dz / length];
  return [person.x + dx * distance, person.z + dz * distance];
}
