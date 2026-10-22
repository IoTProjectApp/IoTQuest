// The Conversation Editor's model: everyone's lines (saved in public/data/conversations.js, the
// format is in public/conversation-settings.js), what each resident asks for (their quests'
// quotes, saved with the Quest Editor's changes in public/data/quests.js), undo history, the
// check, and the chat as the game would play it. Free of the DOM so it runs under Node in the tests.
import { missions } from '../../../public/missions.js';
import { locations, locationById, adaptMissions } from '../../../public/locations.js';
import { createConversation, chooseRequest } from '../../../public/conversations.js';
import {
  LINES,
  PLACEHOLDERS,
  MAX_LENGTH,
  checkLines,
  linesFor,
} from '../../../public/conversation-settings.js';
import { QuestSession, builtInQuests } from '../quest-editor/session.js';

export { LINES, PLACEHOLDERS, MAX_LENGTH, locations };
// Where the lines for everyone are kept, among the people.
export const EVERYONE = '*';
const clone = (value) => JSON.parse(JSON.stringify(value));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const empty = () => ({ version: 1, defaults: {}, people: {} });
// A city's own lines for someone are kept as 'person@city'.
export const targetKey = (person, city = null) => (city ? person + '@' + city : person);

export class ConversationSession {
  constructor(lines = empty(), quests = undefined) {
    this.lines = { ...empty(), ...clone(lines) };
    this.savedLines = clone(this.lines);
    // Quotes change as the Quest Editor changes them, so the two editors agree.
    this.questSession = new QuestSession(quests);
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
  snapshot() {
    return clone({ lines: this.lines, quests: this.questSession.snapshot() });
  }
  // `merge` names an edit that goes on (typing in one line): one undo step takes it all back.
  commit(label, change, merge = null) {
    const before = this.snapshot();
    change();
    if (same(before, this.snapshot())) return false;
    const top = this.undoStack.at(-1);
    if (merge && top?.merge === merge && !this.redoStack.length) {
      this.emit();
      return true;
    }
    this.undoStack.push({ label, state: before, merge });
    this.redoStack = [];
    this.emit();
    return true;
  }
  step(from, to) {
    const entry = from.pop();
    if (!entry) return null;
    to.push({ label: entry.label, state: this.snapshot() });
    this.lines = entry.state.lines;
    this.questSession.restoreSnapshot(entry.state.quests);
    this.emit();
    return entry.label;
  }
  undo() {
    return this.step(this.undoStack, this.redoStack);
  }
  redo() {
    return this.step(this.redoStack, this.undoStack);
  }

  // ---- People --------------------------------------------------------------------------------
  // Everyone who asks for something: the name their quests give them, with those quests (as they
  // now stand, with your changes) as { kind: 'builtin', index } or { kind: 'mine', id }.
  people() {
    const byName = new Map(),
      add = (name, request) => {
        if (!name) return;
        if (!byName.has(name)) byName.set(name, { name, requests: [] });
        byName.get(name).requests.push(request);
      };
    const qs = this.questSession;
    for (const m of builtInQuests()) {
      const index = missions.indexOf(m);
      add(qs.builtInSpec(index).resident, { kind: 'builtin', index });
    }
    for (const q of qs.quests) add(q.resident, { kind: 'mine', id: q.id });
    return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
  }
  // What a city calls someone (only the household has city names).
  nameIn(person, city = null) {
    return (city && locationById(city)?.names?.[person]) || person;
  }

  // ---- Lines ---------------------------------------------------------------------------------
  // The lines written for one target (EVERYONE, a person, or a person in a city): only those.
  own(person, city = null) {
    if (person === EVERYONE) return this.lines.defaults;
    return this.lines.people[targetKey(person, city)] || {};
  }
  // What a target says for a line when nothing is written for it there.
  inherited(person, city, slot) {
    if (person === EVERYONE) return LINES[slot];
    if (city) return linesFor(person, null, this.lines)[slot];
    return { ...LINES, ...this.lines.defaults }[slot];
  }
  // What a target says for a line, written there or not.
  line(person, city, slot) {
    return this.own(person, city)[slot] ?? this.inherited(person, city, slot);
  }
  // Writes a line; the same words as it would say anyway, or null, takes it out.
  setLine(person, city, slot, text, merge = false) {
    return this.commit(
      `Change ${slot}`,
      () => {
        const store =
          person === EVERYONE
            ? this.lines.defaults
            : (this.lines.people[targetKey(person, city)] ??= {});
        if (text === null || text === this.inherited(person, city, slot)) delete store[slot];
        else store[slot] = text;
        if (person !== EVERYONE && !Object.keys(store).length)
          delete this.lines.people[targetKey(person, city)];
      },
      merge && `line:${targetKey(person, city)}:${slot}`,
    );
  }
  resetPerson(person, city = null) {
    return this.commit('Reset lines', () => {
      if (person === EVERYONE) this.lines.defaults = {};
      else delete this.lines.people[targetKey(person, city)];
    });
  }
  // Whether anything is written for someone, anywhere.
  hasLines(person) {
    if (person === EVERYONE) return Object.keys(this.lines.defaults).length > 0;
    return Object.keys(this.lines.people).some(
      (key) => key === person || key.startsWith(person + '@'),
    );
  }

  // ---- What they ask for ---------------------------------------------------------------------
  request(ref) {
    const qs = this.questSession;
    return ref.kind === 'builtin' ? qs.builtInSpec(ref.index) : qs.quest(ref.id);
  }
  setQuote(ref, quote, merge = false) {
    const qs = this.questSession;
    return this.commit(
      'Change request',
      () => {
        if (ref.kind === 'builtin')
          qs.editBuiltIn(ref.index, 'Change request', (spec) => (spec.quote = quote));
        else qs.edit(ref.id, 'Change request', (q) => (q.quote = quote));
      },
      merge && `quote:${ref.kind}:${ref.index ?? ref.id}`,
    );
  }
  resetQuote(ref) {
    if (ref.kind !== 'builtin') return false;
    return this.setQuote(ref, this.questSession.original(ref.index).quote);
  }
  quoteEdited(ref) {
    if (ref.kind !== 'builtin') return false;
    const qs = this.questSession;
    return qs.builtInSpec(ref.index).quote !== qs.original(ref.index).quote;
  }

  // ---- The check -----------------------------------------------------------------------------
  // Problems, by who has them: { target, person, city, text, error }. Errors stop a save.
  check() {
    const problems = [],
      names = new Set(this.people().map((p) => p.name)),
      cities = new Set(locations.map((l) => l.id));
    for (const text of checkLines(this.lines.defaults))
      problems.push({ person: EVERYONE, city: null, text, error: true });
    for (const [key, lines] of Object.entries(this.lines.people)) {
      const [person, city = null] = key.split('@');
      for (const text of checkLines(lines)) problems.push({ person, city, text, error: true });
      if (city && !cities.has(city))
        problems.push({ person, city, text: `There is no city "${city}".`, error: true });
      if (!names.has(person))
        problems.push({
          person,
          city,
          text: `No quest asks ${person} for anything: their lines are said only if they talk.`,
          error: false,
        });
    }
    // Requests: a quote changed here must leave its quest whole.
    const qs = this.questSession;
    for (const key of Object.keys(qs.edits)) {
      const index = Number(key.split(':')[1]);
      if (!('quote' in qs.edits[key])) continue;
      const spec = qs.builtInSpec(index);
      if (!String(spec.quote ?? '').trim())
        problems.push({
          person: spec.resident,
          request: { kind: 'builtin', index },
          text: `What ${spec.resident} asks for in "${spec.title}" is empty.`,
          error: true,
        });
      else if (/[<>]/.test(spec.quote))
        problems.push({
          person: spec.resident,
          request: { kind: 'builtin', index },
          text: `"${spec.title}" asks with < or >; requests are plain text.`,
          error: true,
        });
    }
    return problems;
  }

  // ---- The chat ------------------------------------------------------------------------------
  // The quests as the game would play them in a city (null: at home), with your changes.
  questsIn(city = null) {
    const qs = this.questSession,
      list = [
        ...builtInQuests().map((m, index) => ({ ...m, ...qs.builtInSpec(index), id: m.id })),
        // Written quests join after the built-in ones, as the game adds them.
        ...qs.quests.map((q) => ({ ids: [], ...q, authored: true })),
      ];
    return adaptMissions(list, locationById(city) || null, 'beginner');
  }
  // A chat with someone, as the game opens it. moment: 'hello' (a first visit), 'thanks' (just after
  // their first request passed) or 'urgent' (when the conditions make it urgent).
  chat(person, { city = null, moment = 'hello', request = null } = {}) {
    const quests = this.questsIn(city),
      resident = this.nameIn(person, city),
      mine = quests.map((m, i) => i).filter((i) => quests[i].resident === resident),
      first = mine[0] ?? 0;
    const chat = createConversation({
      key: person,
      resident,
      quests,
      currentIndex: request ?? first,
      completed: moment === 'thanks' ? { [first]: true } : {},
      urgent: moment === 'urgent' ? { [request ?? first]: 'It is getting dark' } : {},
      person,
      location: locationById(city) || null,
      settings: this.lines,
    });
    if (request !== null && moment === 'hello' && request !== chat.selectedIndex)
      chooseRequest(chat, request);
    return chat;
  }

  // ---- Saving --------------------------------------------------------------------------------
  linesChanged() {
    return !same(this.lines, this.savedLines);
  }
  questsChanged() {
    return this.questSession.isChanged();
  }
  isChanged() {
    return this.linesChanged() || this.questsChanged();
  }
  savedLinesFile() {
    const lines = clone(this.lines);
    return { version: 1, defaults: lines.defaults, people: lines.people };
  }
  markSaved() {
    this.savedLines = clone(this.lines);
    this.questSession.markSaved();
    this.emit();
  }
}
