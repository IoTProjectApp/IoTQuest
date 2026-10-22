// The Character Editor's model: the character settings being edited (the format is described in
// public/character-settings.js), changes to one person or to the defaults, and their undo
// history. Free of the DOM so it runs under Node in the tests.

const clone = (value) => JSON.parse(JSON.stringify(value));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
export const DEFAULTS = 'defaults';
// The settings a target can have, and which of them are movement (locked for the judo class).
export const MOVEMENT = ['walk', 'idle', 'activity', 'speed', 'rate'];

export class CharacterSession {
  constructor(saved = { version: 1, defaults: {}, people: {} }) {
    this.saved = clone(saved);
    this.settings = clone(saved);
    this.settings.defaults ||= {};
    this.settings.people ||= {};
    this.undoStack = [];
    this.redoStack = [];
    this.listeners = new Set();
  }
  on(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  emit() {
    for (const listener of this.listeners) listener(this);
  }
  // A target's own settings: a person's, or the defaults ('defaults').
  own(target) {
    return (target === DEFAULTS ? this.settings.defaults : this.settings.people[target]) || {};
  }
  commit(label, change) {
    const before = clone(this.settings);
    change(this.settings);
    tidy(this.settings);
    if (same(before, this.settings)) return false;
    this.undoStack.push({ label, settings: before });
    this.redoStack = [];
    this.emit();
    return true;
  }
  undo() {
    return this.step(this.undoStack, this.redoStack);
  }
  redo() {
    return this.step(this.redoStack, this.undoStack);
  }
  step(from, to) {
    const entry = from.pop();
    if (!entry) return null;
    to.push({ label: entry.label, settings: clone(this.settings) });
    this.settings = entry.settings;
    this.emit();
    return entry.label;
  }
  // Sets one setting ('model', 'walk', 'speed'...) for a target; undefined puts it back as built.
  set(target, key, value, label = 'Change ' + key) {
    return this.commit(label, (settings) => {
      const own = ownFor(settings, target);
      if (value === undefined) delete own[key];
      else own[key] = value;
    });
  }
  // Sets one piece of clothing ('top', 'hat'...): a value, null to take it off, or undefined for
  // as built.
  wear(target, piece, value, label = 'Change ' + piece) {
    return this.commit(label, (settings) => {
      const own = ownFor(settings, target);
      own.outfit ||= {};
      if (value === undefined) delete own.outfit[piece];
      else own.outfit[piece] = value;
    });
  }
  // Puts a whole section back as built: 'model', 'outfit' or 'movement'; or everything.
  reset(target, section = null) {
    return this.commit('Reset ' + (section || 'all'), (settings) => {
      const own = ownFor(settings, target);
      const keys = section === 'movement' ? MOVEMENT : section ? [section] : Object.keys(own);
      for (const key of keys) delete own[key];
    });
  }
  isChanged(target) {
    return target === undefined
      ? !same(this.settings, normalised(this.saved))
      : Object.keys(this.own(target)).length > 0;
  }
  // Everyone with settings of their own, for the list's markers.
  changedPeople() {
    return new Set(Object.keys(this.settings.people));
  }
  markSaved() {
    this.saved = clone(this.settings);
    this.emit();
  }
}
function ownFor(settings, target) {
  if (target === DEFAULTS) return (settings.defaults ||= {});
  return (settings.people[target] ||= {});
}
// Drops empty outfits and people with nothing set, so the saved file stays as small as it can.
function tidy(settings) {
  for (const own of [settings.defaults, ...Object.values(settings.people)])
    if (own.outfit && !Object.keys(own.outfit).length) delete own.outfit;
  for (const [id, own] of Object.entries(settings.people))
    if (!Object.keys(own).length) delete settings.people[id];
}
function normalised(saved) {
  const copy = clone(saved);
  copy.defaults ||= {};
  copy.people ||= {};
  tidy(copy);
  return copy;
}
