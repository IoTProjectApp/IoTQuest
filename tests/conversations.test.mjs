import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createConversation,
  chooseRequest,
  selectedRequest,
  sendConversationMessage,
  nearestCharacter,
  conversationQuestions,
} from '../public/conversations.js';
import { missions } from '../public/missions.js';
import { locations, adaptMissions } from '../public/locations.js';

for (const location of locations) {
  for (const level of ['beginner', 'advanced']) {
    const quests = adaptMissions(missions, location, level);
    for (const [key, resident] of Object.entries(location.names)) {
      test(`${location.id} ${level}: ${resident} discusses only their own requests`, () => {
        const chat = createConversation({ key, resident, quests });
        assert.ok(chat.requests.length);
        assert.ok(chat.requests.every((r) => r.mission.resident === resident));
        for (const request of chat.requests) {
          assert.equal(chooseRequest(chat, request.index), true);
          for (const question of conversationQuestions) {
            assert.equal(sendConversationMessage(chat, question), true);
            const reply = chat.messages.at(-1).text;
            assert.ok(reply.length > 20);
            assert.doesNotMatch(reply, /undefined|NaN/);
          }
          sendConversationMessage(chat, 'What will I see animated?');
          assert.match(chat.messages.at(-1).text, /running code/);
          assert.ok(chat.messages.at(-1).text.includes(request.mission.goal));
        }
      });
    }
  }
}
test('request ownership, saved progress and selected quest are respected', () => {
  const chat = createConversation({
    key: 'Maya',
    resident: 'Maya',
    quests: missions,
    currentIndex: 1,
    completed: { 0: true },
  });
  assert.equal(chat.selectedIndex, 2);
  assert.equal(chooseRequest(chat, 1), false);
  assert.equal(chooseRequest(chat, 0), true);
  sendConversationMessage(chat, 'Have I completed this?');
  assert.match(chat.messages.at(-1).text, /You have passed/);
  chooseRequest(chat, 2);
  sendConversationMessage(chat, 'Have I completed this?');
  assert.match(chat.messages.at(-1).text, /run the mission tests/);
  assert.equal(selectedRequest(chat).complete, false);
});
test('weather and relevant failure explanations reflect context', () => {
  const index = missions.findIndex((m) => m.weatherQuest);
  const m = missions[index];
  const chat = createConversation({
    key: m.resident,
    resident: m.resident,
    quests: missions,
    currentIndex: index,
  });
  sendConversationMessage(chat, 'How does weather affect it?', { weatherMode: 'live' });
  assert.match(chat.messages.at(-1).text, /local weather.*labelled fallback/);
  sendConversationMessage(chat, 'How does weather affect it?');
  assert.match(chat.messages.at(-1).text, /Practice Weather/);
  sendConversationMessage(chat, 'Help!', {
    failedTests: [
      { name: 'Boundary', pass: false, detail: 'must switch off' },
      { name: 'Normal', pass: true, detail: 'okay' },
    ],
  });
  assert.match(chat.messages.at(-1).text, /Boundary: must switch off/);
  assert.doesNotMatch(chat.messages.at(-1).text, /Normal: okay/);
});
test('empty messages, long chats and residents without requests are handled', () => {
  const chat = createConversation({ key: 'Maya', resident: 'Maya', quests: missions });
  assert.equal(sendConversationMessage(chat, '   '), false);
  assert.equal(chat.messages.length, 1);
  sendConversationMessage(chat, 'x'.repeat(500));
  assert.equal(chat.messages.at(-2).text.length, 240);
  for (let i = 0; i < 30; i++) sendConversationMessage(chat, 'hello');
  assert.equal(chat.messages.length, 24);
  const empty = createConversation({ key: 'visitor', resident: 'Visitor', quests: missions });
  sendConversationMessage(empty, 'hello');
  assert.match(empty.messages.at(-1).text, /another resident/);
});
test('proximity chooses the closest character and rejects distant characters', () => {
  const residents = [
    { key: 'A', x: 2, z: 0 },
    { key: 'B', x: 1, z: 0 },
  ];
  assert.equal(nearestCharacter({ x: 0, z: 0 }, residents).key, 'B');
  assert.equal(nearestCharacter({ x: 20, z: 0 }, residents), null);
});
test('residents behind a wall are out of reach', () => {
  const resident = [{ key: 'A', x: 2, z: 0 }];
  const wall = [{ x: 1, z: 0, w: 0.2, d: 4 }];
  assert.equal(nearestCharacter({ x: 0, z: 0 }, resident, 2.2, wall), null);
  assert.equal(nearestCharacter({ x: 0, z: 0 }, resident, 2.2, []).key, 'A');
});

test('a resident thanks the technician once for each request passed since the last chat', () => {
  const quests = adaptMissions(missions, locations[0], 'beginner'),
    area = quests[0].area,
    own = quests.map((m, i) => i).filter((i) => quests[i].area === area);
  const first = createConversation({
    key: 'k',
    resident: 'R',
    quests,
    area,
    completed: { [own[0]]: true },
  });
  assert.deepEqual(first.thanked, [own[0]]);
  assert.match(first.messages[0].text, new RegExp('^Thank you! ' + quests[own[0]].title));
  assert.notEqual(first.selectedIndex, own.length > 1 ? own[0] : null);
  const later = createConversation({
    key: 'k',
    resident: 'R',
    quests,
    area,
    completed: { [own[0]]: true },
    thanked: { [own[0]]: true },
  });
  assert.deepEqual(later.thanked, []);
  assert.match(later.messages[0].text, /^Hello!/);
});

test('chat markup escapes names and uses its own bubble classes, not the map sprite ones', async () => {
  const { conversationHTML } = await import('../public/conversation-view.js');
  const quests = adaptMissions(missions, locations[0], 'beginner');
  const chat = createConversation({ key: 'k', resident: '<Nina>', quests, area: quests[0].area });
  sendConversationMessage(chat, 'What do you want?');
  const html = conversationHTML(chat, 'Ana & Co');
  assert.match(html, /&lt;Nina&gt;/);
  assert.match(html, /Ana &amp; Co/);
  assert.match(html, /class="chat-message from-resident"/);
  assert.match(html, /class="chat-message from-technician"/);
  assert.doesNotMatch(html, /class="chat-message (resident|technician)"/);
});
