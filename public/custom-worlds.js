// Worlds built in the World Builder (editor/workspaces/world-builder, launched with
// scripts/world-editor.sh), saved in data/worlds.js, as the game plays them: each opens on its own
// page, world.html?id=<world id> (world-play.js). With none saved the game shows nothing new.
import WORLDS from './data/worlds.js';
import { normaliseWorld, worldDevices } from './world-builder/world.js';

export { WORLDS };

const clone = (v) => JSON.parse(JSON.stringify(v));
// A world id as the editor makes them ('starter-world', 'world-1730000000000').
export const WORLD_ID = /^[A-Za-z0-9_-]{1,80}$/;

// Every saved world that can be played, checked and filled in (copies: the saved data is left
// as it is).
export function savedWorlds(data = WORLDS) {
  const list = [];
  for (const w of Array.isArray(data?.worlds) ? data.worlds : []) {
    if (!w || typeof w !== 'object' || !WORLD_ID.test(String(w.id))) continue;
    try {
      list.push(normaliseWorld(clone(w)));
    } catch (error) {
      console.warn(`World "${w.name || w.id}" left out: ${error.message}`);
    }
  }
  return list;
}
export const worldById = (id, data = WORLDS) => savedWorlds(data).find((w) => w.id === id) || null;

// What the game's list shows for each world.
export const worldSummaries = (data = WORLDS) =>
  savedWorlds(data).map((w) => {
    const devices = worldDevices(w);
    return {
      id: w.id,
      name: w.name,
      objects: w.objects.length,
      sensors: devices.filter((d) => !d.output).length,
      outputs: devices.filter((d) => d.output).length,
    };
  });

// A world's page.
export const worldUrl = (id, { editorPlay = false } = {}) =>
  'world.html?id=' + encodeURIComponent(id) + (editorPlay ? '&editor-play=1' : '');
