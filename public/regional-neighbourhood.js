import { pavement } from './street-network.js';
import { fromWorld } from './world-math.js';

// Convert the older decorative suburb houses into named, selectable private lots.
export function integrateRegionalNeighbours(model, sim, origin) {
  const houses = model.neighbourHouses || [];
  if (!houses.length) return [];
  const kept = model.objects.filter((o) => !o.regionalStreet || o.neighbourHouse);
  model.objects.splice(0, model.objects.length, ...kept);
  const areas = [];
  for (const [i, house] of houses.entries()) {
    const perBlock = house.attached ? 3 : 2,
      perRow = perBlock * 3;
    const slot = i % perRow,
      block = Math.floor(slot / perBlock),
      column = slot % perBlock;
    const x = -48 + block * 48 + (house.attached ? 14 + column * 10 : 16 + column * 16);
    const z = 64 + Math.floor(i / perRow) * 16;
    const lot = { x, z, w: house.attached ? 10 : 12, d: 14 };
    for (const part of house.parts) {
      part.pos[0] += origin.x + x - house.x;
      part.pos[2] += origin.z + z - house.z;
      part.regionalNeighbour = house.type;
    }
    const add = (px, y, pz, w, h, d, color, extra = {}) =>
      model.box(origin.x + px, y, origin.z + pz, w, h, d, color, {
        community: true,
        regionalNeighbour: house.type,
        ...extra,
      });
    add(x, -0.005, z, lot.w, 0.06, lot.d, '#a9bd89', { surface: 'grass', rounded: false });
    for (const side of [-1, 1]) {
      add(x + (side * lot.w) / 2, 0.12, z, 0.08, 0.22, lot.d, '#d3c4a8');
      add(x, 0.12, z + (side * lot.d) / 2, lot.w, 0.22, 0.08, '#d3c4a8');
    }
    model.colliders.push({
      x: origin.x + x,
      z: origin.z + z,
      w: house.w,
      d: house.d,
      community: true,
      regionalNeighbour: house.type,
    });
    const stationZ = z + house.facing * (house.d / 2 + 1);
    const corridorZ = z + house.facing * 8;
    const sideX = -48 + block * 48 + (column === perBlock - 1 ? 40 : 8);
    let previous = pavement(
      sim.map.walks,
      `${block + (column === perBlock - 1 ? 1 : 0)}:2/${column === perBlock - 1 ? -1 : 1}/1`,
    );
    for (const [j, [px, pz]] of [
      [sideX, corridorZ],
      [x, corridorZ],
      [x, stationZ],
    ].entries()) {
      const from = sim.map.walks.nodes[previous];
      if (from.x === px && from.z === pz) continue;
      const node = sim.map.walks.node(house.type + ':entrance:' + j, px, pz);
      sim.map.walks.edge(previous, node);
      sim.map.walks.edge(node, previous);
      const a = sim.map.walks.nodes[previous],
        length = Math.hypot(px - a.x, pz - a.z);
      if (length)
        add((px + a.x) / 2, 0.05, (pz + a.z) / 2, length, 0.05, 1.2, '#d7ceae', {
          regionalEntrance: true,
          rotation: [0, -Math.atan2(pz - a.z, px - a.x), 0],
          rounded: false,
        });
      previous = node;
    }
    const building = {
      ...house,
      parts: undefined,
      x,
      z,
      lot,
      node: previous,
      id: house.type,
      height: 3.5,
      regionalNeighbour: true,
      district: ['Wattle Quarter', 'Banksia Grove', 'Jacaranda Gardens'][block],
    };
    sim.map.buildings.push(building);
    const bounds = {
      minX: origin.x + x - 2.29,
      maxX: origin.x + x + 2.29,
      minZ: origin.z + z + (house.facing > 0 ? house.d / 2 + 0.25 : -6.8),
      maxZ: origin.z + z + (house.facing > 0 ? 6.8 : -house.d / 2 - 0.25),
    };
    model.rooms.push([
      house.name,
      origin.x + x,
      origin.z + stationZ,
      { community: true, type: house.type, regionalNeighbour: true, bounds },
    ]);
    const residentKey = 'neighbour:' + house.type;
    model.addActor(
      residentKey,
      origin.x + x + 0.8,
      (bounds.minZ + bounds.maxZ) / 2,
      ['#829774', '#b38b72', '#78949e'][block],
      ['#c39b7c', '#a57b61', '#dbc0a2'][i % 3],
    );
    Object.assign(model.actors.at(-1), {
      community: true,
      name: house.resident,
      area: house.name,
      role: 'Neighbourhood resident',
      section: house.name,
      neighbourhood: building.district,
    });
    const point = fromWorld(origin.x + x, origin.z + stationZ);
    areas.push([
      house.name,
      point.x,
      point.y,
      { communityType: house.type, regionalNeighbour: true },
    ]);
  }
  return areas;
}
