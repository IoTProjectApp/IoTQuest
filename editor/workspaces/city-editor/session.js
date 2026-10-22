// The City Editor's model: each city's wording (saved in public/data/cities.js, the format is in
// public/city-settings.js), undo history, the check, and the city's quests as the game would
// word them. Free of the DOM so it runs under Node in the tests.
import { missions } from '../../../public/missions.js';
import { locations, locationById, adaptMissions } from '../../../public/locations.js';
import {
  HOUSEHOLD,
  HOME_QUESTS,
  DEFAULT_OPENING,
  ORIGINAL_NAMES,
} from '../../../public/city-settings.js';

export { HOUSEHOLD, HOME_QUESTS, DEFAULT_OPENING, locations };
export const LEVELS = ['beginner', 'advanced'];
const clone = (value) => JSON.parse(JSON.stringify(value));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const unquote = (text = '') => text.replace(/^“|”$/g, '');

export class CitySession {
  constructor(saved = { version: 1, cities: {} }) {
    this.cities = clone(saved.cities || {});
    this.saved = clone(this.cities);
    this.undoStack = [];
    this.redoStack = [];
    this.listeners = new Set();
    this.cache = new Map();
  }
  on(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  emit() {
    for (const listener of this.listeners) listener(this);
  }
  // `merge` names an edit that goes on (typing in one field): one undo step takes it all back.
  commit(label, change, merge = null) {
    const before = clone(this.cities);
    change();
    if (same(before, this.cities)) return false;
    const top = this.undoStack.at(-1);
    if (!(merge && top?.merge === merge && !this.redoStack.length))
      this.undoStack.push({ label, state: before, merge });
    this.redoStack = [];
    this.emit();
    return true;
  }
  step(from, to) {
    const entry = from.pop();
    if (!entry) return null;
    to.push({ label: entry.label, state: clone(this.cities) });
    this.cities = entry.state;
    this.emit();
    return entry.label;
  }
  undo() {
    return this.step(this.undoStack, this.redoStack);
  }
  redo() {
    return this.step(this.redoStack, this.undoStack);
  }
  // Changes one city's entry, dropping empty parts so only what differs is kept.
  change(id, label, edit, merge = null) {
    return this.commit(
      label,
      () => {
        const city = (this.cities[id] ??= {});
        edit(city);
        for (const key of ['names', 'titles', 'quotes'])
          if (city[key] && !Object.keys(city[key]).length) delete city[key];
        if (!Object.keys(city).length) delete this.cities[id];
      },
      merge,
    );
  }

  // ---- What a city says ----------------------------------------------------------------------
  own(id) {
    return this.cities[id] || {};
  }
  isEdited(id) {
    return id in this.cities;
  }
  originalNames(id) {
    return { ...(ORIGINAL_NAMES.get(id) || locationById(id)?.names) };
  }
  names(id) {
    return { ...this.originalNames(id), ...this.own(id).names };
  }
  setName(id, person, name, merge = false) {
    return this.change(
      id,
      `Rename ${person}`,
      (city) => {
        const text = String(name ?? '').trim();
        city.names ??= {};
        if (!text || text === this.originalNames(id)[person]) delete city.names[person];
        else city.names[person] = text;
      },
      merge && `name:${id}:${person}`,
    );
  }
  opening(id) {
    return this.own(id).opening ?? DEFAULT_OPENING;
  }
  setOpening(id, text, merge = false) {
    return this.change(
      id,
      'Change opening',
      (city) => {
        if (!text || text === DEFAULT_OPENING) delete city.opening;
        else city.opening = text;
      },
      merge && `opening:${id}`,
    );
  }
  setWording(id, kind, index, text, merge = false) {
    return this.change(
      id,
      kind === 'titles' ? 'Change title' : 'Change request',
      (city) => {
        city[kind] ??= {};
        if (!String(text ?? '').trim()) delete city[kind][index];
        else city[kind][index] = text;
      },
      merge && `${kind}:${id}:${index}`,
    );
  }
  reset(id) {
    return this.commit('Reset city', () => {
      delete this.cities[id];
    });
  }

  // ---- The city's quests, as the game words them ---------------------------------------------
  // The location with the household as this session names them.
  location(id) {
    const location = locationById(id);
    return location && { ...location, names: this.names(id) };
  }
  quests(id, level = 'beginner', settings = this.savedFile()) {
    const key = JSON.stringify([id, level, settings.cities[id] || null]);
    if (!this.cache.has(key)) {
      if (this.cache.size > 200) this.cache.clear();
      const location = this.location(id);
      this.cache.set(key, location ? adaptMissions(missions, location, level, settings) : []);
    }
    return this.cache.get(key);
  }
  // A home quest's title and request (without the opening) as the code words them here.
  codeWording(id, index, level = 'beginner') {
    const { titles, quotes, ...rest } = this.own(id),
      plain = { version: 1, cities: { [id]: { ...rest, opening: '{request}' } } },
      m = this.quests(id, level, plain)[index];
    return { title: m.title, quote: unquote(m.quote) };
  }

  // ---- The check -----------------------------------------------------------------------------
  // Problems in the cities given (those you changed unless given): { city, field, text, error }.
  // Errors stop a save.
  check(ids = Object.keys(this.cities)) {
    const problems = [];
    for (const id of ids) {
      const city = this.own(id);
      const add = (field, text, error = true) => problems.push({ city: id, field, text, error });
      const location = locationById(id);
      if (!location) {
        add(null, `There is no city "${id}".`);
        continue;
      }
      for (const person of Object.keys(city.names || {}))
        if (!HOUSEHOLD.includes(person)) add('names', `${person} is not in the household.`);
      // Chats find a resident's requests by name, so two people with one name would share them.
      const names = this.names(id),
        others = new Set(
          this.quests(id)
            .filter((m, i) => !HOUSEHOLD.includes(missions[i]?.resident))
            .map((m) => m.resident),
        );
      for (const person of HOUSEHOLD) {
        const name = names[person],
          mine = person in (city.names || {}),
          clash =
            others.has(name) ||
            HOUSEHOLD.some((other) => other !== person && names[other] === name);
        if (clash)
          add(
            'names:' + person,
            `${name} is also someone else's name in ${location.city}: their chats would mix.`,
            mine,
          );
        if (mine && /[<>{}]/.test(name)) add('names:' + person, `${name} has < > or { }.`);
      }
      if ('opening' in city) {
        if (!city.opening.includes('{request}'))
          add('opening', 'The opening must say {request}, where the request goes.');
        for (const [, word] of city.opening.matchAll(/\{(\w*)\}/g))
          if (!['city', 'request'].includes(word))
            add('opening', `The opening cannot use {${word}}.`);
        if (/[<>“”]/.test(city.opening))
          add('opening', 'The opening has < > or curly quotes; the game adds the quotes.');
      }
      const titles = this.quests(id).map((m) => String(m.title).toLowerCase());
      for (const kind of ['titles', 'quotes'])
        for (const [index, text] of Object.entries(city[kind] || {})) {
          const field = `${kind}:${index}`;
          if (!(Number(index) >= 0 && Number(index) < HOME_QUESTS && Number.isInteger(+index)))
            add(field, `Quest ${index} is not one of the home's quests.`);
          else if (/[<>]/.test(text)) add(field, 'Plain text only: no < or >.');
          else if (
            kind === 'titles' &&
            titles.filter((t) => t === text.trim().toLowerCase()).length > 1
          )
            add(field, `Another quest in ${location.city} is called "${text}".`, false);
          else if (kind === 'quotes' && text.length > 300)
            add(field, 'This request is long for a chat bubble.', false);
        }
    }
    return problems;
  }

  // ---- Saving --------------------------------------------------------------------------------
  isChanged() {
    return !same(this.cities, this.saved);
  }
  savedFile() {
    return { version: 1, cities: clone(this.cities) };
  }
  markSaved() {
    this.saved = clone(this.cities);
    this.emit();
  }
}
