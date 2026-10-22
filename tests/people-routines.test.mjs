// People added in the Character Editor and routines (public/people-settings.js), the game playing
// them, and the editor's model of them (editor/workspaces/character-editor/people-session.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import {
  PEOPLE_SETTINGS,
  addOwnPeople,
  ownPeopleIn,
  routineFor,
  routineLegs,
  routinePose,
  routineLocked,
  ROUTINE_WALK,
} from '../public/people-settings.js';
import { World3D, buildWorldModel } from '../public/world3d.js';
import { createRegionalModel } from '../public/regions.js';
import { addCommunityWorld } from '../public/community-world.js';
import { applyWorldLayout } from '../public/world-layout.js';
import { locationById } from '../public/locations.js';
import { CharacterSession } from '../editor/workspaces/character-editor/session.js';
import { PeopleSession } from '../editor/workspaces/character-editor/people-session.js';
import { cityWorld } from '../editor/workspaces/character-editor/city-world.js';
import { groupOf, ownEntry } from '../editor/workspaces/character-editor/people.js';

const modelsMissing =
  !existsSync('public/models/people/animations.json') && 'character models not downloaded';
const ana = { id: 'own:ana', name: 'Ana', city: 'legacy', at: [3, 9], role: 'Baker', bio: '' };
// Runs `check` with these people and routines in force, then puts the saved ones back.
function withPeople({ people = [], routines = {} }, check) {
  const saved = { people: PEOPLE_SETTINGS.people, routines: PEOPLE_SETTINGS.routines };
  Object.assign(PEOPLE_SETTINGS, { people, routines });
  try {
    return check();
  } finally {
    Object.assign(PEOPLE_SETTINGS, saved);
  }
}
const actorsOf = (model) => model.actors.map((a) => [a.id, a.name, a.x, a.z]);

test('the shipped people file is empty, so every world builds as before', () => {
  assert.deepEqual(PEOPLE_SETTINGS, { version: 1, people: [], routines: {} });
  for (const id of ['legacy', 'kyoto', 'fitzroy']) {
    const before = createRegionalModel(id);
    addCommunityWorld(before, locationById(id));
    applyWorldLayout(before, id);
    assert.deepEqual(actorsOf(buildWorldModel(id)), actorsOf(before), id);
  }
});

test('people join the city they live in, and everyone in every city', () => {
  const settings = {
    version: 1,
    people: [ana, { ...ana, id: 'own:kai', name: 'Kai', city: '*', at: [4, 9] }],
    routines: {},
  };
  assert.deepEqual(
    ownPeopleIn('legacy', settings).map((p) => p.id),
    ['own:ana', 'own:kai'],
  );
  assert.deepEqual(
    ownPeopleIn('kyoto', settings).map((p) => p.id),
    ['own:kai'],
  );
  const model = addOwnPeople(createRegionalModel('legacy'), 'legacy', settings),
    added = model.actors.find((a) => a.id === 'own:ana');
  assert.equal(added.name, 'Ana');
  assert.equal(added.section, 'Baker');
  assert.deepEqual([added.x, added.z], [3, 9]);
  // Building the world again adds no one twice.
  addOwnPeople(model, 'legacy', settings);
  assert.equal(model.actors.filter((a) => a.id === 'own:ana').length, 1);
  withPeople(settings, () => {
    assert.ok(buildWorldModel('kyoto').actors.some((a) => a.id === 'own:kai'));
    assert.ok(!buildWorldModel('kyoto').actors.some((a) => a.id === 'own:ana'));
  });
});

test('a routine walks stop to stop, waits, and starts again', () => {
  const routine = {
    stops: [
      { at: [0, 0], stay: 4, clip: 'TalkingAsk' },
      { at: [12, 0], stay: 2 },
    ],
  };
  const walk = 12 / ROUTINE_WALK,
    { round } = routineLegs(routine);
  assert.equal(round, 4 + walk + 2 + walk);
  assert.deepEqual(routinePose(routine, 1), {
    x: 0,
    z: 0,
    angle: -Math.PI / 2,
    walking: false,
    clip: 'TalkingAsk',
    stop: 0,
  });
  const half = routinePose(routine, 4 + walk / 2);
  assert.equal(half.walking, true);
  assert.ok(Math.abs(half.x - 6) < 1e-9);
  assert.ok(Math.abs(half.angle - Math.PI / 2) < 1e-9, 'facing +x as they walk there');
  assert.equal(routinePose(routine, 4 + walk + 1).clip, null, 'no clip: their standing one');
  assert.deepEqual(routinePose(routine, round + 1), routinePose(routine, 1), 'round and round');
  // Twice as fast, the walk takes half the time.
  assert.equal(routinePose(routine, 4 + walk / 4, 2).x, 6);
  // One stop: they stay there.
  assert.equal(routinePose({ stops: [{ at: [1, 2], stay: 0 }] }, 99).x, 1);
});

test('the household, technician and judo class keep their own ways; city routines stay home', () => {
  for (const id of ['player', 'Maya', 'section:Bedroom', 'dojo:0', 'recreation:dojo'])
    assert.ok(routineLocked(id), id);
  const settings = {
    routines: {
      Maya: { stops: [{ at: [0, 0], stay: 1 }] },
      'civic:hospital': { city: 'legacy', stops: [{ at: [0, 0], stay: 1 }] },
      'own:ana': { stops: [{ at: [0, 0], stay: 1 }] },
    },
  };
  assert.equal(routineFor('Maya', 'legacy', settings), null);
  assert.ok(routineFor('civic:hospital', 'legacy', settings));
  assert.equal(routineFor('civic:hospital', 'kyoto', settings), null);
  assert.ok(routineFor('own:ana', 'kyoto', settings));
});

// Frames of the world at these game-clock times, as the renderer is handed them.
function frames(times, state = {}) {
  let clock = 0;
  const out = [],
    canvas = {
      width: 0,
      height: 0,
      clientWidth: 800,
      clientHeight: 500,
      style: {},
      addEventListener() {},
      removeEventListener() {},
    };
  const raf = globalThis.requestAnimationFrame;
  globalThis.requestAnimationFrame = () => 1;
  try {
    const world = new World3D(canvas, {
      getState: () => ({
        locationId: 'legacy',
        devices: [],
        env: { light: 70, temperature: 22, humidity: 50, motion: true },
        outputs: {},
        player: { x: 48, y: 77 },
        speed: 1,
        areas: [],
        simClockMs: clock * 1000,
        ...state,
      }),
      createRenderer: () => ({
        gl: {},
        maxPixelRatio: 1,
        geometries: {},
        drawsCharacters: true,
        render: (f) => out.push(f.characters.map((c) => ({ ...c, standIn: undefined }))),
        restore() {},
        dispose() {},
      }),
    });
    for (const t of times) {
      clock = t;
      world.render(t, 0.1);
    }
    return out;
  } finally {
    globalThis.requestAnimationFrame = raf;
  }
}

test(
  'in the game, they are drawn, walk their routine and play each stop’s clip',
  { skip: modelsMissing },
  () => {
    const routine = {
      stops: [
        { at: [3, 9], stay: 5, clip: 'TalkingAsk' },
        { at: [9, 9], stay: 5 },
      ],
    };
    withPeople({ people: [ana], routines: { 'own:ana': routine } }, () => {
      const walk = 6 / ROUTINE_WALK,
        seen = frames([1, 1.1, 5 + walk / 2, 5 + walk / 2 + 0.1, 5 + walk + 1]).map((f) =>
          f.find((c) => c.key === 'own:ana'),
        );
      assert.ok(seen.every(Boolean), 'drawn in every frame');
      assert.deepEqual([seen[0].x, seen[0].z], [3, 9]);
      assert.equal(seen[1].clips[0].name, 'TalkingAsk');
      assert.ok(Math.abs(seen[3].x - 6) < 0.2, 'halfway along');
      assert.ok(
        seen[3].clips.some((c) => c.name === 'Walking' || c.name === 'FemaleWalk'),
        'walking between stops',
      );
      assert.ok(Math.abs(seen[4].x - 9) < 1e-9);
    });
  },
);

test('the editor adds, changes and removes people in the Character Editor’s history', () => {
  const characters = new CharacterSession(),
    people = new PeopleSession(characters);
  const id = people.add({ name: 'Ana Baker', at: [3.004, 9] });
  assert.equal(id, 'own:ana-baker');
  assert.equal(people.add({ name: 'Ana Baker' }), 'own:ana-baker-2');
  assert.deepEqual(people.person(id).at, [3, 9]);
  characters.set(id, 'model', 'Kate');
  people.update(id, { role: 'Baker' });
  people.addStop(id, [3, 9]);
  people.addStop(id, [9, 9], { clip: 'TalkingAsk' });
  people.setStop(id, 0, { stay: 9999 });
  assert.equal(people.routine(id).stops[0].stay, 600, 'a stay is at most ten minutes');
  people.reorderStop(id, 1, -1);
  assert.equal(people.routine(id).stops[0].clip, 'TalkingAsk');
  assert.ok(characters.isChanged());
  // Removing them takes their routine and looks too, as one step.
  people.remove(id);
  assert.equal(people.routine(id), null);
  assert.equal(characters.settings.people[id], undefined);
  characters.undo();
  assert.equal(people.person(id).role, 'Baker');
  assert.equal(characters.settings.people[id].model, 'Kate');
  assert.equal(people.routine(id).stops.length, 2);
  // Undo goes all the way back to nothing changed.
  while (characters.undo());
  assert.deepEqual(people.savedFile(), { version: 1, people: [], routines: {} });
  assert.equal(characters.isChanged(), false);
  // Someone the game has gets a routine that plays at home only.
  people.addStop('civic:hospital', [0, 20]);
  assert.equal(people.routine('civic:hospital').city, 'legacy');
  assert.equal(groupOf(id), 'own');
  assert.equal(ownEntry({ id, name: 'Ana' }).group, 'own');
});

test('the editor checks names, walls in the way and who can have a routine', () => {
  const people = new PeopleSession(new CharacterSession()),
    home = cityWorld('legacy');
  const free = [3, 9],
    wall = home.colliders.find((c) => c.w > 2 && c.d < 1),
    across = [
      [wall.x, wall.z - 2],
      [wall.x, wall.z + 2],
    ];
  const maya = people.add({ name: 'Maya', at: free });
  const blocked = people.add({ name: 'Ana', at: free });
  people.addStop(blocked, across[0]);
  people.addStop(blocked, across[1]);
  people.addStop(blocked, [wall.x, wall.z]);
  people.addStop('Maya', free);
  people.addStop('bus:0:1', free);
  const problems = people.check(cityWorld),
    of = (id) =>
      problems
        .filter((p) => p.id === id)
        .map((p) => p.text)
        .join(' | ');
  assert.match(of(maya), /already called Maya/);
  assert.match(of(blocked), /goes through a wall/);
  assert.match(of(blocked), /Stop 3 is inside a wall/);
  assert.match(of('Maya'), /household/);
  assert.match(of('bus:0:1'), /moved by what they are doing/);
  assert.ok(problems.every((p) => p.error));
});

test('people added can be asked for quests and talk in the Conversation Editor', async () => {
  const { ConversationSession } =
    await import('../editor/workspaces/conversation-editor/session.js');
  withPeople({ people: [ana] }, () => {
    const s = new ConversationSession();
    assert.ok(s.people().some((p) => p.name === 'Ana' && p.requests.length === 0));
    assert.match(s.chat('Ana').messages[0].text, /no requests here right now/);
  });
});
