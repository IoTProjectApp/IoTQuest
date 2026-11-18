// What each rigged character wears on top of their model (see three-characters.js): clothes
// recoloured so neighbours who share a model do not look like twins, work wear (hi-vis vests,
// hard hats), caps and backpacks, and badges painted onto the clothes' own texture.
//
// An outfit: { top, bottom (colours for the shirt and the trousers or shorts), stripes (a second
// colour for a striped top), vest ({ color, text }: a hi-vis vest, with lettering on the back),
// hat ({ kind: 'hardhat' | 'cap' | 'beanie' | 'sunhat' | 'bucket' | 'beret' | 'helmet' |
// 'headband' | 'headscarf' | 'turban', color }), glasses ({ kind: 'glasses' | 'sunglasses',
// color: the frame's }), tie ({ kind: 'tie' | 'bowtie', color }), jacket, coat, dress, skirt,
// apron, gloves, shoes, mask, scarf, lanyard, watch and backpack (colours), badge ('medical' |
// 'lifeguard' | 'name': painted on the chest), wardrobe (their own clothes taken off or swapped for
// another model's, see character-wardrobe.js) }. Every field is optional; a fixed pick per person
// keeps someone dressed the same from one visit to the next. The code here dresses no one in the
// newer pieces (jackets to watches): the Character Editor can.

const TOPS = [
  '#2f5d8a',
  '#a23b3b',
  '#3f7d4e',
  '#e3d9c6',
  '#5b4a7a',
  '#d08a2e',
  '#2b2f36',
  '#7fa7c9',
  '#b5566e',
  '#6b7b3a',
];
const BOTTOMS = ['#2a3446', '#3b3b3b', '#5a4632', '#6e7681', '#22385c', '#8a7a5c'];
const STRIPES = ['#f2efe6', '#1f2430', '#e8c547'];
const CAPS = ['#1f3b73', '#b23a3a', '#2d2d2d', '#3f7d4e'];
const PACKS = ['#2d3e50', '#7a2e2e', '#3c5a3c', '#5b4a7a', '#222222'];

// Work wear by role: the technician's hi-vis vest and hard hat (their toolbox keeps the colour
// chosen in the settings), factory hard hats and loading-bay vests.
export const TECHNICIAN_OUTFIT = Object.freeze({
  vest: { color: '#d8f03a', text: 'IoT TECH' },
  hat: { kind: 'hardhat', color: '#f4f4f0' },
});
// A judo gi: white top and trousers (the belt is drawn by the class).
export const JUDO_GI = Object.freeze({ top: '#f3f1ea', bottom: '#f3f1ea' });

const BY_ID = {
  'civic:hospital': { badge: 'medical' },
  'recreation:pool': { badge: 'lifeguard' },
  'worker:business-office:1': { badge: 'name' },
};
// A string hash with its bits well mixed (MurmurHash3's finish), so ids that differ only in
// their last character ('football:1', 'football:2') still get unrelated picks.
const hash = (text) => {
  let h = [...text].reduce((h, c) => Math.imul(h, 31) + c.charCodeAt(0), 7);
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
};
const pick = (list, h) => list[h % list.length];

// The outfit for a resident or background person with this id.
export function outfitFor(id) {
  if (BY_ID[id]) return BY_ID[id];
  const h = hash(id);
  const outfit = { top: pick(TOPS, h), bottom: pick(BOTTOMS, h >>> 4) };
  if (id.startsWith('worker:factory-floor'))
    return { ...outfit, vest: { color: '#ff7a1a' }, hat: { kind: 'hardhat', color: '#f2c318' } };
  if (id.startsWith('worker:loading-bay')) return { ...outfit, vest: { color: '#ff7a1a' } };
  if ((h >>> 8) % 4 === 0) outfit.stripes = pick(STRIPES, h >>> 12);
  // Outdoors: some sports players wear caps; some passengers carry backpacks.
  if (/^(football|basketball|outdoorgym):/.test(id) && (h >>> 16) % 3 === 0)
    outfit.hat = { kind: 'cap', color: pick(CAPS, h >>> 18) };
  if (/^(bus|parent):/.test(id) && (h >>> 16) % 2 === 0) outfit.backpack = pick(PACKS, h >>> 18);
  return outfit;
}
