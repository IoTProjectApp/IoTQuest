import test from 'node:test';
import assert from 'node:assert/strict';
import { residentsForSections, createGreetingTracker } from '../public/section-residents.js';
import { createRegionalModel } from '../public/regions.js';
import { locations, adaptMissions } from '../public/locations.js';
import { missions, defaults, validate, program, baseEnv } from '../public/missions.js';
import { collides } from '../public/world-math.js';
import { createConversation } from '../public/conversations.js';
import { HOME_AREAS } from '../public/home-areas.js';
import { Runtime } from '../public/runtime.js';

for (const location of [null, ...locations]) {
  test(`${location?.id || 'legacy'}: a household of five gives every room's requests`, () => {
    const model = createRegionalModel(location?.id);
    // Nina and Jordan greet the technician in their own rooms; Maya, Alex and Sam (renamed at some
    // destinations) look after the other rooms.
    const greeters = model.actors.filter((a) => a.area);
    assert.deepEqual(
      greeters.map((a) => [a.area, a.name]),
      [
        ['Bedroom', 'Nina'],
        ['Living room', 'Jordan'],
      ],
    );
    for (const resident of greeters) {
      assert.equal(collides(resident.x, resident.z, model.colliders), false, resident.area);
      assert.ok(
        resident.x >= -13.44 && resident.x <= 14.08 && resident.z >= -10.4 && resident.z <= 12.1,
      );
    }
    const family = ['Maya', 'Alex', 'Sam'].map((key) => location?.names?.[key] || key);
    const household = [...family, 'Nina', 'Jordan'];
    for (const level of ['beginner', 'advanced']) {
      const quests = adaptMissions(missions, location, level);
      for (const [area] of HOME_AREAS) {
        const requests = quests.filter((m) => m.area === area);
        assert.ok(requests.length, area + ' has quests');
        for (const m of requests)
          assert.ok(household.includes(m.resident), `${m.title}: ${m.resident}`);
      }
      // Each greeter's chat offers their room's requests; each family member's offers theirs.
      for (const resident of greeters) {
        const chat = createConversation({
          key: resident.id,
          resident: resident.name,
          area: resident.area,
          quests,
        });
        assert.ok(
          chat.requests.length && chat.requests.every((r) => r.mission.area === resident.area),
        );
      }
      for (const name of family) {
        const chat = createConversation({ key: name, resident: name, quests });
        assert.ok(
          chat.requests.length && chat.requests.every((r) => r.mission.resident === name),
          name,
        );
      }
    }
  });
}
test('new section quests have working boundary and OFF checks on both boards and languages', () => {
  for (const quest of missions.filter((m) => m.sectionQuest))
    for (const board of ['ESP32', 'Raspberry Pi Pico'])
      for (const language of ['cpp', 'python']) {
        const devices = defaults(quest.ids, board);
        assert.deepEqual(validate(devices, board), []);
        const runtime = new Runtime(
          program(quest, language, devices, true),
          language,
          devices,
          board,
        );
        for (const [name, readings, expected] of quest.scenarios) {
          const result = runtime.step({ ...baseEnv, ...readings });
          assert.deepEqual(
            devices.filter((d) => d.output).map((d) => +(result.outputs[d.pin] > 0)),
            expected,
            quest.title + ' ' + name,
          );
        }
      }
});
test('automatic greetings happen once per approach and suppress nearby clusters', () => {
  const tracker = createGreetingTracker();
  const characters = [
    { key: 'bedroom', x: 0, z: 0 },
    { key: 'bathroom', x: 1, z: 0 },
  ];
  const player = { x: 0, z: 1 };
  assert.equal(tracker.approach(player, characters, false), null);
  assert.equal(tracker.approach(player, characters).key, 'bedroom');
  assert.equal(tracker.approach(player, characters), null);
  tracker.approach({ x: 10, z: 10 }, characters);
  assert.ok(tracker.approach(player, characters));
  tracker.reset();
  assert.ok(tracker.approach(player, characters));
  tracker.reset();
  tracker.acknowledge(player, characters);
  assert.equal(tracker.approach(player, characters), null);
});
test('automatic greetings do not pass through walls', () => {
  const tracker = createGreetingTracker();
  const characters = [{ key: 'bedroom', x: 0, z: 0 }];
  const wall = [{ x: 0, z: 0.5, w: 3, d: 0.1 }];
  assert.equal(tracker.approach({ x: 0, z: 1 }, characters, true, wall), null);
  assert.ok(tracker.approach({ x: 0, z: 0.2 }, characters, true, wall));
});
