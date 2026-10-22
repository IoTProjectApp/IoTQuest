// Readable names, catalogue categories and cautions for the world's edit groups. Group ids come
// from the world's builders (see public/world-layout.js): 'furniture/sofa#1', 'house/window#2',
// 'garden/tree#4',
// 'town/shop', 'town/furniture/office:desk0', 'town/street-light#12', 'added/3'.

export const CATEGORIES = [
  { id: 'furniture', label: 'Furniture' },
  { id: 'house', label: 'House' },
  { id: 'garden', label: 'Garden' },
  { id: 'buildings', label: 'Buildings' },
  { id: 'street', label: 'Street' },
];

const sentence = (text) => {
  const words = text
    .replace(/[-_]/g, ' ')
    .replace(/([a-z])([A-Z0-9])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
};

// The kind of thing a group is, shared by every numbered copy: 'furniture/dining-chair#2' →
// 'furniture/dining-chair'.
export const kindOf = (id) => id.replace(/#\d+$/, '');

export function categoryOf(id) {
  // Fittings: windows, doors, blinds, verandas and the like, apart from the walls.
  if (id.startsWith('house/') || id.startsWith('furniture/blinds')) return 'house';
  if (id.startsWith('furniture/') || id.startsWith('town/furniture/')) return 'furniture';
  if (id.startsWith('garden/')) return 'garden';
  if (id.startsWith('town/street-light') || id.startsWith('town/bus-stop')) return 'street';
  if (id.startsWith('town/')) return 'buildings';
  return 'garden';
}

// 'Dining chair 2'; the number is left off when a city has only one of the kind (`count`).
export function nameOf(id, count = 2) {
  const number = id.match(/#(\d+)$/)?.[1],
    kind = kindOf(id),
    last = kind.split('/').pop(),
    // Town furnishings are 'area:item' ('office:desk0'): 'Office · desk 0'.
    [area, item] = last.includes(':') ? last.split(':') : [null, last],
    name = area ? `${sentence(area)} · ${sentence(item).toLowerCase()}` : sentence(item);
  return number && count > 1 ? `${name} ${number}` : name;
}

// What moving or removing a group may affect in the game, shown beside it in the inspector.
export function cautionFor(id) {
  if (/^garden\/(greenhouse|raised-bed|greenhouse-bed|tank|pump|irrigation)/.test(id))
    return 'Part of a quest area. Devices for its quests are placed by the original layout, so keep it near where it was.';
  if (id === 'garden/gate') return 'The gate opens and closes in quests; its hinges move with it.';
  if (id === 'house/garage-door')
    return 'Opens for cars and in quests: it rises and falls by itself, so only its place across the floor stays where you put it.';
  if (id.startsWith('furniture/blinds') || id === 'house/shutter')
    return 'A servo in quests lowers and raises it, so its height changes by itself.';
  if (/^town\/(?!furniture\/|street-light|bus-stop)/.test(id))
    return "The town's people, cars and paths still use this lot's original place.";
  if (id.startsWith('town/bus-stop'))
    return 'Buses still stop at the original place, and waiting passengers stay there.';
  return null;
}
