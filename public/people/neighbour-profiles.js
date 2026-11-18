// Stable identities keep house labels, residents and saved installations consistent.
export const neighbourProfiles = [
  ['Wattle Terrace', 'Amelia'],
  ['Banksia House', 'Noah'],
  ['Jacaranda Cottage', 'Zara'],
  ['Acacia Lodge', 'Ethan'],
  ['Magnolia House', 'Isla'],
  ['Fern Cottage', 'Lucas'],
  ['Bluebell Terrace', 'Grace'],
  ['Rosewood House', 'Oscar'],
  ['Olive Cottage', 'Freya'],
  ['Laurel Lodge', 'Hugo'],
  ['Hawthorn House', 'Aria'],
  ['Camellia Cottage', 'Felix'],
  ['Elm Terrace', 'Lily'],
  ['Chestnut House', 'Jasper'],
  ['Juniper Cottage', 'Mila'],
  ['Sycamore Lodge', 'Elliot'],
  ['Daisy House', 'Sofia'],
  ['Lavender Cottage', 'Finn'],
].map(([name, resident], i) => ({
  type: 'neighbour' + (i + 1),
  name,
  resident,
  previousName: 'Neighbour home ' + (i + 1),
}));

const areaNames = new Map(neighbourProfiles.map((p) => [p.previousName, p.name]));
export function migrateNeighbourAreas(state) {
  for (const profile of [state, ...Object.values(state.locationProgress || {})])
    for (const project of Object.values(profile?.projects || {}))
      for (const device of project?.devices || [])
        device.area = areaNames.get(device.area) || device.area;
}
