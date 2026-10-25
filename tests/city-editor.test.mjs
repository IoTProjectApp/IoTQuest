import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { missions } from '../public/missions.js';
import { locations, locationById, adaptMissions } from '../public/locations.js';
import {
  CITY_SETTINGS,
  ORIGINAL_NAMES,
  applyCityNames,
  openRequest,
} from '../public/city-settings.js';
import { createConversation } from '../public/conversations.js';
import { CitySession } from '../editor/workspaces/city-editor/session.js';
import { ConversationSession } from '../editor/workspaces/conversation-editor/session.js';

const EMPTY = { version: 1, cities: {} };

test('the shipped cities file is empty, so every city is worded as the code words it', () => {
  assert.deepEqual(CITY_SETTINGS, EMPTY);
  for (const location of locations) {
    assert.deepEqual(location.names, ORIGINAL_NAMES.get(location.id));
    for (const level of ['beginner', 'advanced'])
      assert.equal(
        JSON.stringify(adaptMissions(missions, location, level)),
        JSON.stringify(adaptMissions(missions, location, level, EMPTY)),
      );
  }
  const kyoto = adaptMissions(missions, locationById('kyoto'), 'beginner');
  assert.equal(kyoto[0].title, 'Courtyard Lanterns');
  assert.equal(kyoto[0].resident, 'Akari');
  assert.match(kyoto[0].quote, /^“Here in Kyoto, our courtyard path gets dark/);
});

test("a city's titles, requests and opening apply there only, at both levels", () => {
  const settings = {
    version: 1,
    cities: {
      kyoto: {
        opening: 'In {city} we say: {request}',
        titles: { 0: 'Lantern Path' },
        quotes: { 2: 'The moss needs water when the soil dries.' },
      },
    },
  };
  for (const level of ['beginner', 'advanced']) {
    const kyoto = adaptMissions(missions, locationById('kyoto'), level, settings);
    assert.equal(kyoto[0].title, 'Lantern Path');
    assert.equal(kyoto[2].quote, '“In Kyoto we say: the moss needs water when the soil dries.”');
    assert.match(kyoto[1].quote, /^“In Kyoto we say: I’d like/);
    // Rules stay the code's.
    assert.deepEqual(
      kyoto[2].conditions,
      adaptMissions(missions, locationById('kyoto'), level)[2].conditions,
    );
  }
  assert.equal(
    JSON.stringify(adaptMissions(missions, locationById('marrakech'), 'beginner', settings)),
    JSON.stringify(adaptMissions(missions, locationById('marrakech'), 'beginner')),
  );
  assert.equal(
    openRequest(locationById('kyoto'), 'Our pond is low.', EMPTY),
    '“Here in Kyoto, our pond is low.”',
  );
});

test('saved names reach the game and the Conversation Editor', () => {
  try {
    applyCityNames(locations, { version: 1, cities: { kyoto: { names: { Maya: 'Yuki' } } } });
    const kyoto = locationById('kyoto');
    assert.deepEqual(kyoto.names, { Maya: 'Yuki', Alex: 'Ren', Sam: 'Haru' });
    const quests = adaptMissions(missions, kyoto, 'beginner');
    assert.equal(quests[0].resident, 'Yuki');
    const chat = createConversation({ key: 'Maya', resident: 'Yuki', quests });
    assert.ok(chat.requests.length > 0);
    const conversations = new ConversationSession();
    assert.equal(conversations.nameIn('Maya', 'kyoto'), 'Yuki');
    assert.equal(conversations.chat('Maya', { city: 'kyoto' }).resident, 'Yuki');
  } finally {
    applyCityNames(locations);
  }
  assert.equal(locationById('kyoto').names.Maya, 'Akari');
});

test('the City Editor keeps only what differs and undoes typing in one step', () => {
  const s = new CitySession();
  assert.equal(s.setName('kyoto', 'Maya', 'Akari'), false);
  s.setName('kyoto', 'Maya', 'Yu', true);
  s.setName('kyoto', 'Maya', 'Yuki', true);
  s.setOpening('kyoto', 'In {city}: {request}');
  s.setWording('kyoto', 'titles', 0, 'Lantern Path');
  s.setWording('kyoto', 'quotes', 0, 'The lanterns should glow at dusk.');
  assert.deepEqual(s.savedFile(), {
    version: 1,
    cities: {
      kyoto: {
        names: { Maya: 'Yuki' },
        opening: 'In {city}: {request}',
        titles: { 0: 'Lantern Path' },
        quotes: { 0: 'The lanterns should glow at dusk.' },
      },
    },
  });
  const [first] = s.quests('kyoto');
  assert.equal(first.title, 'Lantern Path');
  assert.equal(first.resident, 'Yuki');
  assert.equal(first.quote, '“In Kyoto: the lanterns should glow at dusk.”');
  // The code's own wording, for the fields' placeholders.
  assert.equal(s.codeWording('kyoto', 0).title, 'Courtyard Lanterns');
  assert.match(s.codeWording('kyoto', 0).quote, /^our courtyard path/);
  assert.equal(s.undoStack.length, 4);
  for (let i = 0; i < 4; i++) s.undo();
  assert.equal(s.isChanged(), false);
  s.redo();
  s.setWording('kyoto', 'titles', 0, '');
  s.setName('kyoto', 'Maya', '');
  assert.deepEqual(s.savedFile(), EMPTY);
});

test('the check finds clashing names, broken openings and stray quests', () => {
  const s = new CitySession({
    version: 1,
    cities: {
      kyoto: { names: { Maya: 'Ren' }, opening: 'In {town}' },
      marrakech: { titles: { 9: 'Too far', 1: 'Light <b>' } },
      atlantis: { names: { Maya: 'X' } },
    },
  });
  const texts = s.check().map((p) => `${p.city} ${p.error ? 'error' : 'warning'}: ${p.text}`);
  assert.ok(texts.some((t) => /^kyoto error: Ren is also/.test(t)));
  // Alex is still Ren as the code names him: a warning on his side.
  assert.ok(texts.some((t) => /^kyoto warning: Ren is also/.test(t)));
  assert.ok(texts.some((t) => /must say \{request\}/.test(t)));
  assert.ok(texts.some((t) => /cannot use \{town\}/.test(t)));
  assert.ok(texts.some((t) => /Quest 9 is not one of the home's/.test(t)));
  assert.ok(texts.some((t) => /Plain text only/.test(t)));
  assert.ok(texts.some((t) => /There is no city "atlantis"/.test(t)));
  assert.deepEqual(new CitySession().check(), []);
  // A clash the code already has is a warning, shown when the city is checked.
  assert.ok(
    new CitySession().check(['brisbane']).some((p) => !p.error && /Jordan is also/.test(p.text)),
  );
});

test('the editor shell, the card and the game know the cities file', async () => {
  const shell = await readFile(new URL('../editor/main.mjs', import.meta.url), 'utf8');
  assert.match(shell, /cities: \{\s+file: join\(PUBLIC, 'data', 'cities.js'\)/);
  const { WORKSPACES } = await import('../editor/ui/workspaces.js');
  assert.ok(WORKSPACES.some((w) => w.id === 'city-editor' && w.writes === 'public/data/cities.js'));
});

test('quests written in the Quest Editor keep their own words in every city', () => {
  const mine = {
    authored: 'mine',
    title: 'Mine',
    area: 'Bedroom',
    resident: 'Maya',
    quote: 'Hi there.',
    goal: 'Light it.',
    ids: ['ldr', 'led'],
    learn: [],
    conditions: ['light < 1800'],
    scenarios: [],
  };
  for (const id of ['kyoto', 'fitzroy'])
    for (const level of ['beginner', 'advanced']) {
      const m = adaptMissions([...missions, mine], locationById(id), level).at(-1);
      assert.equal(m.title, 'Mine');
      assert.equal(m.quote, 'Hi there.');
      assert.equal(m.resident, locationById(id).names.Maya);
    }
});
