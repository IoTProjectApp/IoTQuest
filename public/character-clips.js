// The motion-captured clips characters play (public/models/people/animations.glb): each one's
// length, and for walks the distance one cycle covers, so feet keep pace with the ground. Values
// come from animations.json (a test checks they match). Travel is in metres in the character's
// frame: [sideways, forward].
export const CLIPS = {
  Bow: { duration: 2.733 },
  FightingIdle: { duration: 3.3 },
  Idle: { duration: 8.333 },
  Walking: { duration: 1.233, stride: 1.274 },
  FemaleWalk: { duration: 1.167, stride: 1.41 },
  TakedownAttacker: { duration: 3.5, end: [-0.164, 0.798] },
  TakedownVictim: { duration: 3.5, end: [-0.142, -1.143] },
  GettingUp: { duration: 8.333, start: [0.045, -0.214], end: [0.085, 0.469] },
  Jogging: { duration: 2.567, stride: 4.817 },
  Talking: { duration: 10.267 },
  TalkingAsk: { duration: 3.767 },
  SittingIdle: { duration: 2.967 },
  Dribble: { duration: 2.1 },
  Breaststroke: { duration: 5 },
  TreadingWater: { duration: 3 },
  KettlebellSwing: { duration: 1.967 },
  OverheadSquat: { duration: 1.867 },
  AirSquat: { duration: 1.867 },
  SoccerPass: { duration: 1.6 },
  GoalkeeperIdle: { duration: 4.633 },
};
// The time a walk clip has reached after `distance` metres (negative walks backwards).
export function walkTime(clip, distance) {
  const { duration, stride } = CLIPS[clip];
  return ((((distance / stride) * duration) % duration) + duration) % duration;
}
