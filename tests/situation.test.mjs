import test from 'node:test';
import assert from 'node:assert/strict';
import { missions } from '../public/missions.js';
import { evaluateCondition, situationReason, neededNow, CALM_DAY } from '../public/situation.js';
import { createConversation } from '../public/conversations.js';
import { buildCustomQuest } from '../public/custom-quests.js';

const titles = (env, done = () => false) =>
  neededNow(missions, { ...CALM_DAY, ...env }, done).map((n) => n.quest.title);
const byTitle = (title) => missions.find((m) => m.title === title);

test('conditions are evaluated like the program would: ADC scale, && before ||', () => {
  assert.equal(evaluateCondition('light < 1800', { light: 1799 / 40.95 }), true);
  assert.equal(evaluateCondition('light < 1800', { light: 1800 / 40.95 }), false);
  assert.equal(evaluateCondition('temp > 26 && occupied == 1', { temp: 30, occupied: 0 }), false);
  assert.equal(evaluateCondition('motion == 1 || door == 1', { motion: 0, door: 1 }), true);
  assert.equal(
    evaluateCondition('wind < 40 || rain >= 2000 && temp > 50', { wind: 60, rain: 90, temp: 20 }),
    false,
  );
  assert.equal(evaluateCondition('nonsense', {}), false);
});

test('an ordinary calm day needs nothing', () => {
  assert.deepEqual(titles({}), []);
});

test('at sunset the residents need their lights', () => {
  const needed = titles({ light: 4, isDay: false });
  assert.ok(needed.includes('Light the Path'));
  assert.ok(needed.includes('Bedroom Night Light'));
  assert.ok(!needed.includes('Storm Watch'));
  assert.deepEqual(situationReason(byTitle('Light the Path'), { ...CALM_DAY, light: 4 }), {
    icon: '🌇',
    text: 'It is getting dark',
  });
});

test('a storm brings up the weather quests, a heatwave the cooling ones, a frost the frost ones', () => {
  const storm = titles({ wind: 70, rain: 90, cloud: 95 });
  for (const t of ['Storm Watch', 'Storm Lockdown', 'Frost or Flood'])
    assert.ok(storm.includes(t), t);
  const heat = titles({ temp: 34, outdoorTemp: 36 });
  for (const t of ['Keep the Room Comfortable', 'Kitchen Fume Fan']) assert.ok(heat.includes(t), t);
  assert.ok(titles({ outdoorTemp: -2 }).includes('Garden Frost Alert'));
});

test('the reason names the reading that changed the decision', () => {
  const heat = { ...CALM_DAY, temp: 34, humidity: 30 };
  assert.equal(
    situationReason(byTitle('Kitchen Fume Fan'), heat).text,
    'It is getting hot indoors',
  );
});

test('finished quests are not asked for again', () => {
  const index = missions.indexOf(byTitle('Light the Path'));
  assert.ok(!titles({ light: 4 }, (i) => i === index).includes('Light the Path'));
});

test('teacher quests react to the situation too', () => {
  const quest = buildCustomQuest({
    title: 'Frost',
    sensor: 'outside',
    output: 'buzzer',
    operator: '<=',
    threshold: 2,
  });
  assert.equal(neededNow([quest], CALM_DAY).length, 0);
  assert.equal(
    neededNow([quest], { ...CALM_DAY, outdoorTemp: -1 })[0].reason.text,
    'It is cold outside',
  );
});

test('a resident opens with the request the situation makes urgent, and says why', () => {
  const area = 'Bedroom',
    night = missions.indexOf(byTitle('Bedroom Night Light')),
    blinds = missions.indexOf(byTitle('Bedroom Sun Blinds'));
  const chat = createConversation({
    key: 'k',
    resident: 'Nina',
    quests: missions,
    currentIndex: blinds,
    area,
    urgent: { [night]: 'It is getting dark' },
  });
  assert.equal(chat.selectedIndex, night);
  assert.match(chat.messages[0].text, /^Hello! It is getting dark, so I need this now\./);
});

test('a reading hovering at a limit is not called a change', () => {
  assert.deepEqual(titles({ temp: 24.3 }), [], 'just past Comfort Zone’s 24 °C limit');
  assert.ok(titles({ temp: 26 }).includes('Comfort Zone'));
});

test('brackets group like C and Python, and malformed conditions count as false', () => {
  const env = { motion: 0, door: 1, armed: 0 };
  assert.equal(evaluateCondition('(motion == 1 || door == 1) && armed == 1', env), false);
  assert.equal(evaluateCondition('(motion == 1 || door == 1) && armed == 0', env), true);
  assert.equal(evaluateCondition('door == 1 && armed == 0 || motion == 1', env), true);
  assert.equal(evaluateCondition('((door == 1))', env), true);
  for (const broken of ['door == 1 &&', 'door == 1 ) (', '(door == 1', 'bogus'])
    assert.equal(evaluateCondition(broken, env), false, broken);
});
