import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  Reactions,
  reactionsFor,
  checkReaction,
  conditionsFrom,
  lengthOf,
  TRIGGERS,
  FADE,
} from '../public/character-reactions.js';
import { CHARACTER_SETTINGS } from '../public/character-settings.js';
import { CLIPS } from '../public/character-clips.js';
import { CharacterSession } from '../editor/workspaces/character-editor/session.js';
import { reactionClips } from '../editor/workspaces/character-editor/reactions-panel.js';

const person = (key = 'Maya', extra = {}) => ({
  key,
  x: 0,
  z: 0,
  angle: 0,
  clips: [{ name: 'Idle', time: 1, weight: 1 }],
  ...extra,
});
const settings = (people, defaults = {}) => ({ version: 1, defaults, people });

test('with no reactions saved, nobody reacts and characters are left exactly as they were', () => {
  assert.deepEqual(CHARACTER_SETTINGS.defaults.reactions, undefined);
  const reactions = new Reactions();
  for (const trigger of Object.keys(TRIGGERS))
    assert.equal(reactions.fire('Maya', trigger, 0), null);
  const before = person('Maya', { x: 1 });
  const after = reactions.apply(structuredClone(before), 5, {
    player: { x: 1.2, z: 0 },
    conditions: { cold: true, hot: true, rain: true, night: true },
  });
  assert.deepEqual(after, before);
});

test("a person's reactions replace the defaults' for the same trigger, and clip false stops one", () => {
  const s = settings(
    {
      Maya: {
        reactions: [
          { trigger: 'near', clip: 'Bow' },
          { trigger: 'rain', clip: false },
        ],
      },
      'dojo:0': { reactions: [{ trigger: 'near', clip: 'Bow' }] },
    },
    {
      reactions: [
        { trigger: 'near', clip: 'TalkingAsk' },
        { trigger: 'rain', clip: 'SittingIdle' },
        { trigger: 'night', clip: 'NoSuchClip' },
      ],
    },
  );
  assert.deepEqual(
    [...reactionsFor('Maya', s).entries()],
    [['near', { trigger: 'near', clip: 'Bow' }]],
  );
  assert.deepEqual([...reactionsFor('Sam', s).keys()], ['near', 'rain']);
  // The judo class keeps to its lesson.
  assert.equal(reactionsFor('dojo:0', s).size, 0);
});

test('reactions are checked: trigger, clip, length, cooldown, facing', () => {
  assert.deepEqual(
    checkReaction({ trigger: 'chat', clip: 'Bow', seconds: 3, cooldown: 0, face: true }),
    [],
  );
  assert.deepEqual(checkReaction({ trigger: 'cold', clip: false }), []);
  const problems = checkReaction({
    trigger: 'sneeze',
    clip: 'Nope',
    seconds: 0,
    cooldown: -1,
    face: 'yes',
  });
  assert.equal(problems.length, 5);
  assert.equal(lengthOf({ clip: 'Bow' }), CLIPS.Bow.duration);
  assert.equal(lengthOf({ clip: 'Bow', seconds: 5 }), 5);
});

test('a reaction blends in and out over their own clips, then they go back to them', () => {
  const r = new Reactions(
    settings({ Maya: { reactions: [{ trigger: 'chat', clip: 'Bow', seconds: 2 }] } }),
  );
  assert.ok(r.fire('Maya', 'chat', 10));
  const at = (t) => r.apply(person(), t);
  const start = at(10);
  assert.deepEqual(
    start.clips.map((c) => c.weight),
    [1, 0],
  );
  const half = at(10 + FADE / 2);
  assert.ok(Math.abs(half.clips[1].weight - 0.5) < 1e-9);
  assert.ok(Math.abs(half.clips[0].weight - 0.5) < 1e-9);
  const middle = at(11);
  assert.deepEqual(
    middle.clips.map((c) => c.name),
    ['Idle', 'Bow'],
  );
  assert.deepEqual(
    middle.clips.map((c) => c.weight),
    [0, 1],
  );
  assert.equal(middle.clips[1].time, 1);
  assert.ok(at(12 - FADE / 2).clips[1].weight < 0.51);
  // Over: back to their own clips, untouched.
  assert.deepEqual(at(12.01), person());
  assert.equal(r.playing.size, 0);
});

test('cooldowns, one reaction at a time, and events cutting in', () => {
  const r = new Reactions(
    settings({
      Maya: {
        reactions: [
          { trigger: 'near', clip: 'TalkingAsk', cooldown: 30 },
          { trigger: 'fail', clip: 'Bow' },
          { trigger: 'cold', clip: 'SittingIdle', seconds: 2 },
        ],
      },
    }),
  );
  assert.ok(r.fire('Maya', 'near', 0));
  // Already reacting: the weather waits; a failed test cuts in.
  assert.equal(r.fire('Maya', 'cold', 1), null);
  assert.equal(r.fire('Maya', 'fail', 1).clip, 'Bow');
  r.playing.clear();
  // Near again too soon, then after its cooldown.
  assert.equal(r.fire('Maya', 'near', 20), null);
  assert.ok(r.fire('Maya', 'near', 31));
});

test('the technician coming near sets it off once per approach; the weather while it lasts', () => {
  const r = new Reactions(
    settings({
      Maya: {
        reactions: [
          { trigger: 'near', clip: 'Bow', cooldown: 0, face: true },
          { trigger: 'rain', clip: 'SittingIdle', seconds: 1, cooldown: 5 },
        ],
      },
    }),
  );
  const far = { x: 10, z: 0 },
    close = { x: 0, z: 2 };
  r.apply(person(), 0, { player: far });
  assert.equal(r.playing.size, 0);
  const turned = r.apply(person(), 0, { player: close });
  assert.equal(r.playing.get('Maya').reaction.clip, 'Bow');
  // Turning to the technician: blended in from where they faced.
  assert.equal(turned.angle, 0);
  const facing = r.apply(person(), 1, { player: close });
  assert.ok(Math.abs(facing.angle - Math.PI / 2) < 1e-9);
  r.playing.clear();
  // Still close: no second greeting until they have walked away and back.
  r.apply(person(), 5, { player: close });
  assert.equal(r.playing.size, 0);
  r.apply(person(), 6, { player: far });
  r.apply(person(), 7, { player: close });
  assert.equal(r.playing.get('Maya').reaction.trigger, 'near');
  r.playing.clear();
  // Rain: plays, then again once its cooldown is over.
  r.apply(person(), 10, { conditions: { rain: true } });
  assert.equal(r.playing.get('Maya').reaction.trigger, 'rain');
  r.apply(person(), 12, { conditions: { rain: true } });
  assert.equal(r.playing.size, 0);
  r.apply(person(), 15.5, { conditions: { rain: true } });
  assert.equal(r.playing.get('Maya').reaction.trigger, 'rain');
  // The technician themselves never reacts.
  assert.deepEqual(r.apply(person('player'), 15.6, { player: close }), person('player'));
});

test('the weather that sets reactions off comes from the readings', () => {
  assert.deepEqual(conditionsFrom({}), { cold: false, hot: false, rain: false, night: false });
  assert.deepEqual(conditionsFrom({ outdoorTemp: 4, rain: 60, light: 5 }), {
    cold: true,
    hot: false,
    rain: true,
    night: true,
  });
  assert.equal(conditionsFrom({ outdoorTemp: 35 }).hot, true);
});

test('the Character Editor saves reactions with the other settings and offers on-the-spot clips', () => {
  const s = new CharacterSession();
  s.set('Maya', 'reactions', [{ trigger: 'near', clip: 'Bow', face: true }], 'Change reaction');
  assert.deepEqual(s.own('Maya').reactions, [{ trigger: 'near', clip: 'Bow', face: true }]);
  s.set('Maya', 'reactions', undefined, 'Reset reactions');
  assert.equal(s.isChanged(), false);
  const clips = reactionClips();
  assert.ok(clips.includes('Bow') && clips.includes('Talking'));
  assert.ok(!clips.includes('Walking') && !clips.includes('TakedownAttacker'));
});

test('the game plays reactions and sets them off', async () => {
  const world = await readFile(new URL('../public/world3d.js', import.meta.url), 'utf8');
  assert.match(world, /this\.animate\(s, t, dt\);\n\s+this\.react\(s\);/);
  const game = await readFile(new URL('../public/game.js', import.meta.url), 'utf8');
  assert.match(game, /residentReacts\(m\.resident, 'thanks'\)/);
  assert.match(game, /residentReacts\(m\.resident, 'fail'\)/);
  assert.match(
    game,
    /world3d\?\.reactTo\(key, activeConversation\.thanked\.length \? 'thanks' : 'chat'\)/,
  );
});
