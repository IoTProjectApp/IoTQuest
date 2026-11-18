// Changing a rigged person's own clothes, set in the Character Editor as `wardrobe` in their outfit
// (see character-outfits.js) and drawn by three-wardrobe.js:
//   { top     'off' takes their own top off; a model's name ('Josh') dresses them in that model's
//             top instead; unset keeps their own;
//     bottom  the same for their trousers, shorts or skirt;
//     shoes   a model's name to wear that model's shoes (shoes are swapped, never taken off);
//     base    { color, sleeves ('tee' | 'vest' | 'long'), legs ('shorts' | 'knee' | 'long'),
//             socks } the plain layer under whatever came off }
// Each model is made of separate pieces (a shirt, trousers, shoes, hair, the body) and its body is
// cut away under its clothes, so a top or bottom that comes off is always replaced by the base
// layer: fitted cloth over the torso and hips, and skin past its sleeves and hems. Nobody is ever
// drawn undressed. Free of three.js, so the editor and the tests read it under Node.

// What each region holds, from the piece's own name (Mixamo's: 'Ch21_Shirt', 'Ch23_Suit').
// A one-piece outfit (Sophie's tunic) is both top and bottom.
export const REGIONS = ['top', 'bottom', 'shoes'];
const TOP = /Shirt|Suit|Hoodie|Sweater|Collar|Zipper|Jacket|Blouse|Tshirt|Top$/i,
  FULL = /Cloth|Dress|Jumpsuit|Overall|Outfit/i,
  BOTTOM = /Pants|Shorts|Trousers|Jeans|Skirt|Belt/i,
  SHOES = /Shoe|Sneaker|Heel|Boot|Footwear|Sock|Sandal/i;
// A piece's name without the model's prefix: 'Ch21_Shirt' → 'Shirt'.
export const pieceName = (name) => String(name).replace(/^Ch\d+_+/i, '');
// The regions a piece covers ([] for the body, hair, eyes and the rest).
export function regionsOf(name) {
  const n = pieceName(name);
  if (FULL.test(n)) return ['top', 'bottom'];
  if (TOP.test(n)) return ['top'];
  if (BOTTOM.test(n)) return ['bottom'];
  if (SHOES.test(n)) return ['shoes'];
  return [];
}
// Decorations on other pieces: they go with their region but leave no gap of their own.
export const isTrim = (name) => /Belt|Zipper/i.test(pieceName(name));

// The clothing pieces of each of the game's models (people-cast.js), as their files name them.
// Alex, James and Jennifer are made in one piece (their clothes are painted on), so theirs cannot
// change. Imported models (character-models.js) are read from their own pieces when loaded.
export const MODEL_PIECES = {
  Adam: ['Hoodie', 'Pants', 'Sneakers'],
  Alex: [],
  Brian: ['Shirt', 'Pants', 'Sneakers'],
  Bryce: ['Shirt', 'Shorts', 'Sneakers'],
  Chad: ['Shirt', 'Pants', 'Shoes'],
  Elizabeth: ['Shirt', 'Pants', 'Heels'],
  James: [],
  Jennifer: [],
  Jody: ['Shirt', 'Zipper', 'Pants', 'Sneakers'],
  Josh: ['Suit', 'Shirt', 'Belt', 'Pants', 'Shoes'],
  Kate: ['Shirt', 'Pants', 'Shoes'],
  Leonard: ['Sweater', 'Collar', 'Pants', 'Shoes'],
  Louise: ['Suit', 'Shirt', 'Pants', 'Heels'],
  Martha: ['Suit', 'Shirt', 'Pants', 'Heels'],
  Megan: ['Shirt', 'Pants', 'Sneakers'],
  Shannon: ['Shirt', 'Shorts', 'Socks', 'Shoes'],
  Sophie: ['Cloth', 'Sneakers', 'Socks'],
};
// What a model wears in a region, in words ('Suit and Shirt'), or '' if it has nothing there.
export function describe(model, region) {
  const names = (MODEL_PIECES[model] || []).filter(
    (n) => regionsOf(n).includes(region) && !isTrim(n),
  );
  return names.length > 1 ? names.slice(0, -1).join(', ') + ' and ' + names.at(-1) : names[0] || '';
}
// Whether a model's clothes can change at all.
export const canChange = (model) => !!MODEL_PIECES[model]?.length;
// Models whose pieces can be worn by others in a region: the game's own models with something
// there. Heels are shaped for a raised heel, so they go only to someone already in heels.
export function donorsFor(model, region) {
  return Object.keys(MODEL_PIECES).filter(
    (m) =>
      m !== model &&
      describe(m, region) &&
      !(
        region === 'shoes' &&
        /Heels/.test(describe(m, region)) !== /Heels/.test(describe(model, region))
      ),
  );
}

export const SLEEVES = ['tee', 'vest', 'long'];
export const LEGS = ['shorts', 'knee', 'long'];
export const BASE = Object.freeze({
  color: '#e7e2d8',
  sleeves: 'tee',
  legs: 'shorts',
  socks: '#ecebe6',
});
// The base layer with its unset fields filled in.
export const baseOf = (wardrobe) => ({ ...BASE, ...wardrobe?.base });
// Whether anything about their own clothes changes.
export const changes = (wardrobe) =>
  !!wardrobe && REGIONS.some((region) => wardrobe[region] != null);

const COLOUR = /^#[0-9a-f]{6}$/i;
// Every problem with a wardrobe for someone played by `model` (an empty list if it is fine).
export function checkWardrobe(wardrobe, model) {
  const problems = [];
  if (wardrobe == null) return problems;
  if (typeof wardrobe !== 'object') return ['The wardrobe is not a set of choices.'];
  for (const key of Object.keys(wardrobe))
    if (![...REGIONS, 'base'].includes(key)) problems.push(`"${key}" is not part of a wardrobe.`);
  for (const region of REGIONS) {
    const value = wardrobe[region];
    if (value == null) continue;
    if (value === 'off') {
      if (region === 'shoes') problems.push('Shoes can be swapped but not taken off.');
      continue;
    }
    if (!MODEL_PIECES[value])
      problems.push(`There is no model "${value}" to borrow a ${region} from.`);
    else if (!describe(value, region)) problems.push(`${value} has no ${region} to lend.`);
  }
  if (model && MODEL_PIECES[model] && !canChange(model) && changes(wardrobe))
    problems.push(`${model} is made in one piece: their clothes cannot change.`);
  const base = wardrobe.base;
  if (base != null) {
    if (typeof base !== 'object') problems.push('The base layer is not a set of choices.');
    else {
      for (const key of ['color', 'socks'])
        if (base[key] != null && !COLOUR.test(base[key]))
          problems.push(`The base layer's ${key} is not a colour.`);
      if (base.sleeves != null && !SLEEVES.includes(base.sleeves))
        problems.push(`"${base.sleeves}" is not a kind of sleeve.`);
      if (base.legs != null && !LEGS.includes(base.legs))
        problems.push(`"${base.legs}" is not a length for the legs.`);
    }
  }
  return problems;
}
// The pieces of a model to hide, and the regions their base layer must cover, for a wardrobe:
// { hide: [piece names], fill: { [piece name]: region } }. Every top or bottom piece that is
// hidden gets a base layer (only trims, which sit over other pieces, go without), and shoes are
// hidden only when others replace them, with socks under those.
export function plan(pieces, wardrobe) {
  const hide = new Set(),
    fill = {};
  if (!changes(wardrobe)) return { hide: [], fill };
  for (const region of REGIONS) {
    const value = wardrobe[region];
    if (value == null || (region === 'shoes' && value === 'off')) continue;
    for (const name of pieces)
      if (regionsOf(name).includes(region)) {
        hide.add(name);
        if (!isTrim(name)) fill[name] = regionsOf(name).length > 1 ? 'full' : region;
      }
  }
  return { hide: [...hide], fill };
}
