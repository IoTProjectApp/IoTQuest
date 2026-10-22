// Hand-set wording for each city, written by the City Editor (editor/workspaces/city-editor,
// launched with scripts/world-editor.sh) to data/cities.js:
//   { version: 1, cities: { [locationId]: { names?, opening?, titles?, quotes? } } }
// - names: what the city calls the household, { Maya?, Alex?, Sam? }, laid over the code's names;
// - opening: how a resident opens a request there, with {city} and {request}, for the code's
//   'Here in {city}, {request}' (the request's first letter is lowercased, except "I");
// - titles: home quests' titles there, by the quest's place in the game's list ({ 0: '...' });
// - quotes: home quests' requests there, by place, written without the opening, at both levels.
// Only the first HOME_QUESTS quests (the home's own) are worded per city. With no settings every
// city is as the code makes it.
import CITY_SETTINGS from './data/cities.js';

export { CITY_SETTINGS };

export const HOUSEHOLD = ['Maya', 'Alex', 'Sam'];
export const HOME_QUESTS = 8;
export const DEFAULT_OPENING = 'Here in {city}, {request}';

export const cityFor = (id, settings = CITY_SETTINGS) => settings?.cities?.[id] || {};

// What the code called each city's household, before saved names were laid over them.
export const ORIGINAL_NAMES = new Map();
// Lays saved names over the locations' own, in place.
export function applyCityNames(locations, settings = CITY_SETTINGS) {
  for (const location of locations) {
    if (!ORIGINAL_NAMES.has(location.id)) ORIGINAL_NAMES.set(location.id, { ...location.names });
    location.names = {
      ...ORIGINAL_NAMES.get(location.id),
      ...cityFor(location.id, settings).names,
    };
  }
}

// A request opened with where the resident lives.
export function openRequest(location, text, settings = CITY_SETTINGS) {
  const body = /^I\b|^I’/.test(text) ? text : text.charAt(0).toLowerCase() + text.slice(1);
  const opening = cityFor(location.id, settings).opening ?? DEFAULT_OPENING;
  return '“' + opening.replaceAll('{city}', location.city).replaceAll('{request}', body) + '”';
}
