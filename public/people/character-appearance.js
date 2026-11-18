// How a rigged person looks beyond their clothes, set in the Character Editor (the `appearance`
// setting, see character-settings.js) and drawn by three-appearance.js:
//   { height   a factor on their size (0.85-1.15), feet kept on the ground;
//     build    slim (-1) to broad (1): wider and deeper in the body, the head kept as it is;
//     skin     a colour for the skin, keeping the shading of the model's own;
//     hair     { style: one of HAIR_STYLES ('own' keeps the model's), color };
//     beard    { kind: one of BEARDS ('own' keeps any the model has, 'none' shaves it), color
//                (the hair's colour unless given) };
//     brows    'own' or 'bold' (thicker brows over the painted ones, in the hair's colour) }
// Every field is optional; with none set, the person is drawn exactly as the model is. Free of
// three.js, so the editor and the tests read it under Node.

export const HAIR_STYLES = [
  'own',
  'bald',
  'buzz',
  'short',
  'curly',
  'bob',
  'long',
  'ponytail',
  'bun',
];
export const BEARDS = ['own', 'none', 'stubble', 'short', 'full', 'goatee', 'moustache'];
export const BROWS = ['own', 'bold'];
export const HEIGHT = [0.85, 1.15];
export const BUILD = [-1, 1];
// Skin tones from fair to deep, and natural and dyed hair colours.
export const SKIN_TONES = [
  '#f6dccb',
  '#ecc7ab',
  '#dcab84',
  '#c78e63',
  '#a86d45',
  '#86522f',
  '#633b22',
  '#432818',
];
export const HAIR_COLOURS = [
  '#17120f',
  '#3a2416',
  '#5e3b21',
  '#8a5a32',
  '#c79a58',
  '#e6d3a6',
  '#7c2e16',
  '#9a9590',
  '#e9e6e0',
  '#2f5aa8',
  '#c9609a',
];
// Ready-made looks to start from; each sets only what it is about.
export const PRESETS = {
  'Tall and broad': { height: 1.1, build: 0.7 },
  'Short and slight': { height: 0.9, build: -0.6 },
  'Silver fox': { hair: { style: 'short', color: '#b8b4ae' }, beard: { kind: 'short' } },
  'Curly crop': { hair: { style: 'curly', color: '#17120f' } },
  Ponytail: { hair: { style: 'ponytail', color: '#5e3b21' } },
  'Neat bun': { hair: { style: 'bun', color: '#3a2416' } },
  'Long and fair': { hair: { style: 'long', color: '#c79a58' } },
  'Bald with a beard': { hair: { style: 'bald' }, beard: { kind: 'full', color: '#3a2416' } },
};

const clamp = (v, [lo, hi]) => Math.min(hi, Math.max(lo, v));
const BUILD_WIDTH = 0.13,
  BUILD_DEPTH = 0.09;

// The person's size on each axis (x across, y up, z front to back), or null for as modelled.
export function appearanceScale(appearance) {
  if (!appearance || (appearance.height == null && !appearance.build)) return null;
  const h = clamp(appearance.height ?? 1, HEIGHT),
    b = clamp(appearance.build ?? 0, BUILD);
  return [h * (1 + BUILD_WIDTH * b), h, h * (1 + BUILD_DEPTH * b)];
}
// What the neck undoes of the build, so the head keeps its own shape (x, y, z), or null.
export function headCorrection(appearance) {
  const b = clamp(appearance?.build ?? 0, BUILD);
  return b ? [1 / (1 + BUILD_WIDTH * b), 1, 1 / (1 + BUILD_DEPTH * b)] : null;
}
// Taller people take longer strides: the distance walked divided by this keeps feet on the ground.
export const strideScale = (appearance) => clamp(appearance?.height ?? 1, HEIGHT);

const COLOUR = /^#[0-9a-f]{6}$/i;
// Every problem with an appearance, as sentences.
export function checkAppearance(a = {}) {
  const problems = [];
  if (a.height != null && !(a.height >= HEIGHT[0] && a.height <= HEIGHT[1]))
    problems.push(`Height must be between ${HEIGHT[0]} and ${HEIGHT[1]}.`);
  if (a.build != null && !(a.build >= BUILD[0] && a.build <= BUILD[1]))
    problems.push('Build must be between -1 (slim) and 1 (broad).');
  if (a.skin != null && !COLOUR.test(a.skin)) problems.push('The skin colour is not a colour.');
  if (a.hair != null) {
    if (a.hair.style != null && !HAIR_STYLES.includes(a.hair.style))
      problems.push(`There is no hair style "${a.hair.style}".`);
    if (a.hair.color != null && !COLOUR.test(a.hair.color))
      problems.push('The hair colour is not a colour.');
  }
  if (a.beard != null) {
    if (a.beard.kind != null && !BEARDS.includes(a.beard.kind))
      problems.push(`There is no beard "${a.beard.kind}".`);
    if (a.beard.color != null && !COLOUR.test(a.beard.color))
      problems.push('The beard colour is not a colour.');
  }
  if (a.brows != null && !BROWS.includes(a.brows))
    problems.push(`There are no brows "${a.brows}".`);
  return problems;
}

// A random look: `random()` gives numbers in [0, 1) (Math.random, or a seeded one in tests).
export function randomAppearance(random = Math.random, { woman = random() < 0.5 } = {}) {
  const pick = (list) => list[Math.floor(random() * list.length)],
    round = (v) => Math.round(v * 100) / 100,
    styles = woman
      ? ['long', 'bob', 'ponytail', 'bun', 'curly', 'short']
      : ['short', 'buzz', 'curly', 'bald', 'short', 'ponytail'],
    grey = random() < 0.15;
  const look = {
    height: round(0.92 + random() * 0.16),
    build: round(-0.7 + random() * 1.4),
    skin: pick(SKIN_TONES),
    hair: {
      style: pick(styles),
      color: grey ? pick(['#9a9590', '#e9e6e0']) : pick(HAIR_COLOURS.slice(0, 7)),
    },
  };
  if (!woman && random() < 0.45)
    look.beard = { kind: pick(['stubble', 'short', 'full', 'goatee', 'moustache']) };
  else look.beard = { kind: 'none' };
  if (random() < 0.3) look.brows = 'bold';
  return look;
}
