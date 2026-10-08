import { locations } from './locations.js';
import { houseDesign } from './house-design.js';
// Gives every destination its own garden: mirrored layout, greenhouse type, bed edging, water
// tank, fence, path, garden feature, tree layout and foliage. Mission areas stay in place, so
// quests work the same everywhere.
export const VARIANT_OPTIONS = {
  mirror: [false, true],
  outbuilding: ['glasshouse', 'polytunnel', 'leanto'],
  beds: ['timber', 'stone', 'corten'],
  tank: ['poly', 'steel', 'timber'],
  fence: ['rail', 'picket', 'stone', 'hedge'],
  path: ['gravel', 'brick', 'slate', 'sandstone'],
  feature: ['none', 'birdbath', 'swing', 'firepit', 'bench', 'sculpture'],
};
const FOLIAGE = {
  tropical: ['#4f8f4f', '#5f9d55', '#6aa85c'],
  dry: ['#8f9c63', '#9aa66f', '#a8b07a'],
  desert: ['#9aa06a', '#a7ab74', '#b2b383'],
  cold: ['#4f7a55', '#5c8660', '#68906a'],
  highland: ['#5a8358', '#678f62', '#74996c'],
  monsoon: ['#58934f', '#64a05a', '#70aa63'],
  eucalypt: ['#8aa38a', '#97ae93', '#a5b89c'],
};
const keys = Object.keys(VARIANT_OPTIONS),
  combinations = keys.reduce((n, k) => n * VARIANT_OPTIONS[k].length, 1);

// Distinct destinations always get distinct combinations: the list position is scrambled by a
// multiplier coprime with the number of combinations, then read as one digit per option.
export function homeVariant(location) {
  const index = locations.findIndex((l) => l.id === location?.id);
  if (index < 0) return {};
  let code = ((index + 1) * 1777) % combinations;
  const variant = {};
  for (const key of keys) {
    const options = VARIANT_OPTIONS[key];
    variant[key] = options[code % options.length];
    code = Math.floor(code / options.length);
  }
  variant.treeSeed = index + 1;
  variant.treeStyle =
    location.iso === 'AUS'
      ? 'eucalypt'
      : ['cold', 'highland'].includes(location.climate)
        ? 'conifer'
        : ['palm', 'tropical', 'banana'].includes(location.planting)
          ? 'palm'
          : 'broadleaf';
  variant.design = houseDesign(location);
  variant.foliage =
    location.iso === 'AUS' ? FOLIAGE.eucalypt : FOLIAGE[location.climate] || undefined;
  // Farms are fenced with post and wire.
  if (location.farm) variant.fence = 'wire';
  return variant;
}
