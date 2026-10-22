// Hand-written lines for the game's people, written by the Conversation Editor
// (editor/workspaces/conversation-editor, launched with scripts/world-editor.sh) to
// data/conversations.js:
//   { version: 1, defaults: { ...lines }, people: { [person]: { ...lines } } }
// A person is the name their quests give them ('Maya', 'Ms Chen'); 'Maya@kyoto' holds lines for
// one city only. Each line is one of LINES below, with {placeholders} from PLACEHOLDERS; a city's
// lines come before the person's, theirs before the defaults, and the defaults before the game's
// own. What residents ask for (each quest's quote) is a quest's to say (data/quests.js).
import CONVERSATION_SETTINGS from './data/conversations.js';

export { CONVERSATION_SETTINGS };

// The game's own lines: what everyone says with nothing written.
export const LINES = {
  greeting: 'Hello!',
  looksAfter: 'I look after the {area}.',
  urgent: '{reason}, so I need this now.',
  ask: 'Ask me about {title}, or pick another request below.',
  noRequests: 'I have no requests here right now. You can explore the house and garden.',
  thanks: 'Thank you! {title} works: {effect}.',
  thanksPlain: 'Thank you! {title} works.',
  next: 'Next,',
  idle: 'I have no requests here yet. Try talking to another resident.',
  // Asked "Tell me about yourself": with none, the question is not offered.
  about: '',
};
// The words each line can use: {name} (what this city calls them) and {city} ('town' at home)
// anywhere, and what the moment adds.
const ANYWHERE = ['name', 'city'];
export const PLACEHOLDERS = {
  greeting: ANYWHERE,
  looksAfter: [...ANYWHERE, 'area'],
  urgent: [...ANYWHERE, 'reason'],
  ask: [...ANYWHERE, 'title'],
  noRequests: ANYWHERE,
  thanks: [...ANYWHERE, 'title', 'effect'],
  thanksPlain: [...ANYWHERE, 'title'],
  next: ANYWHERE,
  idle: ANYWHERE,
  about: ANYWHERE,
};
export const ABOUT_QUESTION = 'Tell me about yourself';
export const MAX_LENGTH = 240;

// A person's lines in a city (an id such as 'kyoto', or null at home).
export function linesFor(person, city = null, settings = CONVERSATION_SETTINGS) {
  const people = settings?.people || {};
  return {
    ...LINES,
    ...settings?.defaults,
    ...people[person],
    ...(city ? people[person + '@' + city] : null),
  };
}
// A line with its placeholders filled; one with no value is left as written.
export const fill = (line, values = {}) =>
  String(line ?? '').replace(/\{(\w+)\}/g, (all, key) =>
    values[key] === undefined || values[key] === null ? all : String(values[key]),
  );
// Every problem with a set of lines: unknown lines or placeholders, and lines too long to say.
export function checkLines(lines = {}) {
  const problems = [];
  for (const [slot, line] of Object.entries(lines)) {
    if (!(slot in LINES)) {
      problems.push(`"${slot}" is not a line anyone says.`);
      continue;
    }
    if (typeof line !== 'string') {
      problems.push(`The ${slot} line is not text.`);
      continue;
    }
    for (const [, key] of line.matchAll(/\{(\w*)\}/g))
      if (!PLACEHOLDERS[slot].includes(key)) problems.push(`The ${slot} line cannot use {${key}}.`);
    if (line.length > MAX_LENGTH)
      problems.push(`The ${slot} line is longer than ${MAX_LENGTH} characters.`);
    if (/[<>]/.test(line)) problems.push(`The ${slot} line has < or >; lines are plain text.`);
    if (slot !== 'about' && !line.trim()) problems.push(`The ${slot} line is empty.`);
  }
  return problems;
}
