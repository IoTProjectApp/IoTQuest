// Destination identity is based on its ID, so adding/reordering destinations does
// not change an existing interior. Layout changes keep the six quest rooms intact.
export function houseDesign(location) {
  let seed = 2166136261;
  for (const c of location.id) seed = Math.imul(seed ^ c.charCodeAt(0), 16777619) >>> 0;
  const palettes = [
    ['#78978c', '#d1b48e', '#b39776'],
    ['#8a9eac', '#d5d8cd', '#95816a'],
    ['#bc9276', '#e0ccb2', '#a97f60'],
    ['#8b8e75', '#cfbd95', '#937358'],
    ['#9a899e', '#d8d0c3', '#ac9073'],
    ['#648d91', '#ccd6d1', '#a98a67'],
  ];
  const [textile, cabinet, timber] = palettes[seed % palettes.length];
  return {
    id: location.id,
    seed,
    textile,
    cabinet,
    timber,
    bedroom: (seed >>> 3) % 3,
    living: (seed >>> 6) % 3,
    dining: (seed >>> 9) % 3,
    // Small fitting offsets give each plan a distinct composition as well as a
    // furniture palette. They are bounded to keep furniture inside its room.
    fitting: (((seed >>> 12) % 9) - 4) * 0.025,
    floor: location.farm ? 'timber' : ['timber', 'stone', 'tile'][seed % 3],
  };
}

export function furnishingTransform(prop, design) {
  if (!design) return null;
  const offset = design.fitting;
  if (prop === 'bed')
    return {
      origin: [-11, -8.55],
      x: design.bedroom === 2 ? -10.75 : -11 + offset,
      z: design.bedroom === 2 ? -8.65 : -8.55,
      angle: [0, Math.PI, Math.PI / 2][design.bedroom],
    };
  if (['nightstand', 'table-lamp'].includes(prop))
    return {
      origin: [-8.95, -9.3],
      x: design.bedroom === 2 ? -11.3 : -8.95,
      z: design.bedroom === 2 ? -6.8 : design.bedroom === 1 ? -7.65 : -9.3,
      angle: 0,
    };
  if (['sofa', 'coffee-table', 'television'].includes(prop))
    return {
      origin: [0, 0],
      x: offset,
      z: [-0.22, 0, 0.22][design.living],
      angle: 0,
    };
  if (['dining-table', 'dining-chair'].includes(prop))
    return {
      origin: [-6.1, -2.5],
      x: -6.1,
      z: -2.5 + [-0.18, 0, 0.18][design.dining],
      angle: 0,
    };
  return null;
}

export function placeFurnishing(position, transform) {
  if (!transform) return [...position];
  const dx = position[0] - transform.origin[0],
    dz = position[2] - transform.origin[1],
    cos = Math.cos(transform.angle),
    sin = Math.sin(transform.angle);
  return [transform.x + dx * cos + dz * sin, position[1], transform.z - dx * sin + dz * cos];
}
