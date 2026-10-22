import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  createConversation,
  sendConversationMessage,
  conversationQuestions,
  questionsFor,
} from '../public/conversations.js';
import {
  LINES,
  linesFor,
  fill,
  checkLines,
  ABOUT_QUESTION,
  CONVERSATION_SETTINGS,
} from '../public/conversation-settings.js';
import { missions } from '../public/missions.js';
import { locationById, adaptMissions } from '../public/locations.js';
import { ConversationSession, EVERYONE } from '../editor/workspaces/conversation-editor/session.js';

const kyoto = locationById('kyoto');

test('the shipped lines file is empty, so everyone says what the game always said', () => {
  assert.deepEqual(CONVERSATION_SETTINGS, { version: 1, defaults: {}, people: {} });
  const chat = createConversation({ key: 'Maya', resident: 'Maya', quests: missions });
  assert.equal(
    chat.messages[0].text,
    `Hello! ${missions[0].quote.replace(/^[“"]|[”"]$/g, '')} Ask me about ${missions[0].title}, or pick another request below.`,
  );
  assert.equal(chat.about, '');
  assert.equal(questionsFor(chat), conversationQuestions);
});

test("a city's lines come before the person's, theirs before everyone's", () => {
  const settings = {
    version: 1,
    defaults: { greeting: 'Hi!', next: 'Then,' },
    people: { Maya: { greeting: 'Hey!' }, 'Maya@kyoto': { greeting: 'Konnichiwa!' } },
  };
  assert.equal(linesFor('Maya', 'kyoto', settings).greeting, 'Konnichiwa!');
  assert.equal(linesFor('Maya', 'marrakech', settings).greeting, 'Hey!');
  assert.equal(linesFor('Sam', null, settings).greeting, 'Hi!');
  assert.equal(linesFor('Maya', 'kyoto', settings).next, 'Then,');
  assert.equal(linesFor('Maya', 'kyoto', settings).ask, LINES.ask);
  assert.equal(
    fill('I am {name} in {city}, {who}', { name: 'Akari', city: 'Kyoto' }),
    'I am Akari in Kyoto, {who}',
  );
});

test('the game says written lines, fills them in and offers the question about themselves', () => {
  const quests = adaptMissions(missions, kyoto, 'beginner'),
    settings = {
      version: 1,
      defaults: { thanks: 'Wonderful, {title} is done: {effect}!' },
      people: {
        'Maya@kyoto': { greeting: 'Konnichiwa, I am {name} of {city}.' },
        Maya: { about: 'I keep the garden in {city}.', urgent: 'Quick! {reason}.' },
      },
    };
  const chat = createConversation({
    key: 'Maya',
    resident: 'Akari',
    quests,
    person: 'Maya',
    location: kyoto,
    settings,
  });
  assert.match(chat.messages[0].text, /^Konnichiwa, I am Akari of Kyoto\. /);
  assert.deepEqual(questionsFor(chat), [...conversationQuestions, ABOUT_QUESTION]);
  sendConversationMessage(chat, ABOUT_QUESTION);
  assert.equal(chat.messages.at(-1).text, 'I keep the garden in Kyoto.');

  const first = quests.findIndex((m) => m.resident === 'Akari');
  const thanked = createConversation({
    key: 'Maya',
    resident: 'Akari',
    quests,
    completed: { [first]: true },
    urgent: { [quests.findIndex((m, i) => i !== first && m.resident === 'Akari')]: 'It is dark' },
    person: 'Maya',
    location: kyoto,
    settings,
  });
  assert.match(
    thanked.messages[0].text,
    /^Wonderful, .+ is done: the lights glow.+! Next, Quick! It is dark\. /,
  );
  // At home, {city} reads 'town'.
  const home = createConversation({ key: 'Maya', resident: 'Maya', quests: missions, settings });
  sendConversationMessage(home, 'Who are you?');
  assert.equal(home.messages.at(-1).text, 'I keep the garden in town.');
});

test('the lines are checked: names, placeholders, length and plain text', () => {
  assert.deepEqual(checkLines({ greeting: 'Hi {name}!', about: '' }), []);
  const problems = checkLines({
    greeting: 'Hi {title}',
    hello: 'Hi',
    ask: 'x'.repeat(241),
    next: '<b>Next</b>',
    idle: ' ',
  });
  assert.equal(problems.length, 5);
  assert.match(problems.join(' '), /cannot use \{title\}/);
  assert.match(problems.join(' '), /"hello" is not a line/);
});

test('the Conversation Editor keeps only what differs, and undoes typing in one step', () => {
  const s = new ConversationSession();
  assert.equal(s.setLine('Maya', null, 'greeting', LINES.greeting), false);
  s.setLine('Maya', null, 'greeting', 'Hi', true);
  s.setLine('Maya', null, 'greeting', 'Hi there', true);
  s.setLine('Maya', 'kyoto', 'greeting', 'Konnichiwa!');
  assert.deepEqual(s.savedLinesFile().people, {
    Maya: { greeting: 'Hi there' },
    'Maya@kyoto': { greeting: 'Konnichiwa!' },
  });
  assert.equal(s.inherited('Maya', 'kyoto', 'greeting'), 'Hi there');
  assert.equal(s.undoStack.length, 2);
  s.undo();
  s.undo();
  assert.deepEqual(s.savedLinesFile().people, {});
  assert.equal(s.isChanged(), false);
  s.redo();
  s.setLine(EVERYONE, null, 'next', 'Then,');
  s.setLine('Maya', null, 'greeting', null);
  assert.deepEqual(s.savedLinesFile(), { version: 1, defaults: { next: 'Then,' }, people: {} });
  assert.ok(s.hasLines(EVERYONE));
});

test('requests change as quest edits, so the Quest Editor sees them', () => {
  const s = new ConversationSession();
  const maya = s.people().find((p) => p.name === 'Maya');
  assert.ok(maya.requests.length > 1);
  const ref = maya.requests[0];
  s.setQuote(ref, 'Please light my path!');
  assert.deepEqual(s.questSession.savedFile().edits['builtin:' + ref.index], {
    of: missions[ref.index].title,
    quote: 'Please light my path!',
  });
  assert.ok(s.quoteEdited(ref));
  assert.match(s.chat('Maya').messages[0].text, /^Hello! Please light my path! Ask me about/);
  s.setQuote(ref, '');
  assert.ok(s.check().some((p) => p.error && /is empty/.test(p.text)));
  s.resetQuote(ref);
  assert.deepEqual(s.questSession.savedFile().edits, {});
  assert.equal(s.isChanged(), false);
});

test('the chat preview plays as the game does, in each city and moment', () => {
  const s = new ConversationSession();
  s.setLine('Maya', 'kyoto', 'greeting', 'Konnichiwa, I am {name}.');
  s.setLine('Ms Chen', null, 'about', 'I teach science.');
  s.setLine('Nobody', null, 'about', 'Who?');
  const kyotoChat = s.chat('Maya', { city: 'kyoto' });
  assert.equal(kyotoChat.resident, 'Akari');
  assert.match(kyotoChat.messages[0].text, /^Konnichiwa, I am Akari\. Here in Kyoto/);
  assert.match(s.chat('Maya').messages[0].text, /^Hello! /);
  assert.match(s.chat('Maya', { moment: 'thanks' }).messages[0].text, /^Thank you! /);
  assert.match(
    s.chat('Maya', { moment: 'urgent' }).messages[0].text,
    /^Hello! It is getting dark, so I need this now\./,
  );
  assert.equal(s.chat('Ms Chen').about, 'I teach science.');
  const problems = s.check();
  assert.ok(problems.some((p) => !p.error && p.person === 'Nobody'));
  assert.ok(!problems.some((p) => p.error));
});

test('the game and the editor shell know the lines', async () => {
  const game = await readFile(new URL('../public/game.js', import.meta.url), 'utf8');
  assert.match(game, /person: currentLocation\(\)\?\.names\?\.\[key\] \? key : resident/);
  const shell = await readFile(new URL('../editor/main.mjs', import.meta.url), 'utf8');
  assert.match(shell, /conversations: \{\s+file: join\(PUBLIC, 'data', 'conversations.js'\)/);
  const { WORKSPACES } = await import('../editor/ui/workspaces.js');
  assert.ok(WORKSPACES.some((w) => w.id === 'conversation-editor'));
});
