import { JUDO_PAIRS } from './judo-dojo.js';
import { instructorAt } from './judo-class.js';
import { CLIPS, walkTime } from './character-clips.js';
import { JUDO_GI } from './character-outfits.js';
import { settingsFor, dressed } from './character-settings.js';

export { CLIPS };

// The judo class as rigged characters playing motion-captured clips (see three-characters.js),
// for renderers that draw them; the jointed figures in judo-class.js stand in until then. Each
// pair runs an 18.5 s round: a standing bow, fighting stance, a double-leg takedown with the
// partner thrown onto their back, the partner getting up from where they landed, and both
// walking back to their spots. Partners always face each other, so the next round simply swaps
// who throws. The instructor walks the same round as the jointed figure.

// Who plays whom, matched to each judoka's name, and the gap between partners at the start.
export const CAST = {
  'recreation:dojo': 'Kate',
  'dojo:student:0': 'Shannon',
  'dojo:student:1': 'Adam',
  'dojo:student:2': 'Jody',
  'dojo:student:3': 'Bryce',
};
const GAP = 0.9,
  MAT = 0.27,
  FADE = 0.3,
  BOW = 0,
  READY = CLIPS.Bow.duration,
  THROW = READY + 1.2,
  RISE = THROW + CLIPS.TakedownVictim.duration,
  RESET = RISE + CLIPS.GettingUp.duration,
  ROUND = RESET + 2.6;
const smooth = (a, b, s) => {
  const k = Math.max(0, Math.min(1, (s - a) / (b - a)));
  return k * k * (3 - 2 * k);
};

// A clip at time `time`, faded in from the previous one over FADE seconds after `since`.
const play = (name, time, since, previous) => {
  const w = previous ? smooth(0, FADE, since) : 1;
  return w < 1
    ? [
        { name, time, weight: w },
        { ...previous, weight: 1 - w },
      ]
    : [{ name, time, weight: 1 }];
};
// One partner's place and clips at time c into the round. facing: +1 faces +z, -1 faces -z.
function partner(spot, facing, attacking, c) {
  // A character's own frame turned into the dojo's: [sideways, forward] to [x, z]. Models face
  // +z with their left towards +x, so turned to face -z their left is towards -x.
  const local = ([side, forward]) => [spot.x + side * facing, spot.z + forward * facing];
  const angle = (facing * Math.PI) / 2;
  if (c < READY) return { at: local([0, 0]), angle, clips: play('Bow', c - BOW, c) };
  if (c < THROW)
    return {
      at: local([0, 0]),
      angle,
      clips: play('FightingIdle', c - READY, c - READY, {
        name: 'Bow',
        time: CLIPS.Bow.duration,
      }),
    };
  if (c < RISE)
    return {
      at: local([0, 0]),
      angle,
      clips: play(attacking ? 'TakedownAttacker' : 'TakedownVictim', c - THROW, c - THROW, {
        name: 'FightingIdle',
        time: THROW - READY,
      }),
    };
  // Where each ends the throw: the attacker standing a step forward, the partner on the mat.
  if (attacking) {
    const end = CLIPS.TakedownAttacker.end;
    if (c < RESET)
      return { at: local(end), angle, clips: play('FightingIdle', (c - RISE) % 3.3, c - RISE) };
    // Steps back to the spot, walking backwards.
    const k = smooth(RESET, RESET + 1.6, c),
      back = Math.hypot(...end) * (1 - k);
    return {
      at: local([end[0] * (1 - k), end[1] * (1 - k)]),
      angle,
      clips:
        k > 0 && k < 1
          ? [{ name: 'Walking', time: walkTime('Walking', -back), weight: 1 }]
          : play('Idle', c - RESET, 1),
    };
  }
  const lying = CLIPS.TakedownVictim.end,
    up = CLIPS.GettingUp,
    rise = [lying[0] - up.start[0], lying[1] - up.start[1]];
  if (c < RESET)
    return { at: local(rise), angle, clips: [{ name: 'GettingUp', time: c - RISE, weight: 1 }] };
  // Standing where getting up left them, then walking forward back to the spot.
  const stood = [rise[0] + up.end[0], rise[1] + up.end[1]],
    k = smooth(RESET + 0.4, RESET + 1.6, c),
    walked = Math.hypot(...stood) * k;
  return {
    at: local([stood[0] * (1 - k), stood[1] * (1 - k)]),
    angle,
    clips:
      k > 0 && k < 1
        ? [{ name: 'Walking', time: walkTime('Walking', walked), weight: 1 }]
        : play('Idle', c - RESET, c - RESET),
  };
}

// The class as characters for this frame. origin: the dojo lot's centre in model space.
// An appearance without its height and build.
const lookOnly = ({ height, build, ...look } = {}) => look;
export function judoCharacters(judo, t, reduced) {
  const out = [];
  const add = (person, at, angle, clips) =>
    out.push({
      key: person.actor.id,
      // The Character Editor may change who plays them and what they wear, never their moves,
      // which the class's routine is timed to.
      model: settingsFor(person.actor.id).model || CAST[person.actor.id],
      x: person.origin.x + at[0],
      y: MAT,
      z: person.origin.z + at[1],
      angle,
      clips,
      standIn: [...person.meshes, person.belt, person.hair],
      belt: person.actor.belt,
      outfit: dressed(JUDO_GI, settingsFor(person.actor.id).outfit),
      // Their skin, hair and face; not their height or build, which the throws are fitted to.
      appearance: lookOnly(settingsFor(person.actor.id).appearance),
    });
  // Someone in conversation stands and faces the technician (as world3d turns their actor).
  const talking = (person) => {
    if (!person.actor.talkPosition) return null;
    const body = person.actor.parts.find((m) => m.local[1] === 0.8),
      heading = body.rotation?.[1] ?? person.actor.heading;
    return Math.atan2(Math.cos(heading), Math.sin(heading));
  };
  judo.pairs.forEach((pair, i) => {
    const spot = JUDO_PAIRS[i],
      time = reduced ? READY : t + i * (ROUND / 2),
      round = Math.floor(time / ROUND),
      c = reduced ? READY + 0.5 : time - round * ROUND,
      // Partner 0 throws in even rounds, partner 1 in odd ones.
      thrower = round % 2;
    const chatting = pair.people.some((p) => p.actor.talkPosition);
    pair.people.forEach((person, j) => {
      const facing = j ? -1 : 1,
        place = { x: spot.x, z: spot.z + (j ? GAP : 0) };
      if (chatting) {
        const angle = talking(person) ?? (facing * Math.PI) / 2;
        return add(person, [place.x, place.z], angle, [{ name: 'Idle', time: t % 8, weight: 1 }]);
      }
      const { at, angle, clips } = partner(place, facing, j === thrower, c);
      add(person, at, angle, reduced ? [{ name: 'FightingIdle', time: 0, weight: 1 }] : clips);
    });
  });
  const teacher = judo.instructor,
    facingPlayer = talking(teacher);
  if (facingPlayer !== null)
    add(teacher, [teacher.x, teacher.z], facingPlayer, [{ name: 'Idle', time: t % 8, weight: 1 }]);
  else {
    const { x, z, angle, stride, walked } = instructorAt(t, reduced),
      idle = { name: 'Idle', time: reduced ? 0 : t % CLIPS.Idle.duration };
    add(
      teacher,
      [x, z],
      angle,
      stride > 0
        ? [
            { name: 'FemaleWalk', time: walkTime('FemaleWalk', walked), weight: stride },
            { ...idle, weight: 1 - stride },
          ].filter((c) => c.weight > 0)
        : [{ ...idle, weight: 1 }],
    );
  }
  return out;
}
