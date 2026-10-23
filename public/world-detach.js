// The last pass of the world's edit groups (see world-layout.js): everything the builders left
// without a group is given one, or is marked as locked with the reason, so the world editor can
// select every part of the world and say why the few that cannot move stay put. Metadata only:
// the world is drawn exactly as built.
//   - town details, walls and paving that stand on a lot join that lot ('town/<lot>');
//   - trees join a group each ('town/tree#', 'landscape/tree#'), loose garden pieces too;
//   - roads, traffic lights, the driveway, the town's hills, the ground, the house's walls and
//     floors and the roof are locked: `editLock` names why (LOCKS).
// People, animals, vehicles, the sky and anything hidden until the game shows it are left alone:
// the game moves them itself.

export const LOCKS = {
  street: {
    name: 'Street',
    reason:
      'Roads, junctions, crossings and footpaths are laid out in the Street Editor, so the traffic and walkers can follow them.',
  },
  traffic: {
    name: 'Traffic lights',
    reason:
      "Traffic lights and stop lines follow each junction's control, which is set in the Street Editor.",
  },
  driveway: {
    name: 'Driveway',
    reason: 'The driveway runs from the garage to the street, so the car can still drive in.',
  },
  terrain: {
    name: 'Hills',
    reason:
      'Hills and mountains are part of the land: shape the ground with the Terrain tool instead of moving them.',
  },
  ground: {
    name: 'Ground',
    reason: 'The ground under the whole world stays where it is; everything stands on it.',
  },
  house: {
    name: 'House walls and floors',
    reason:
      'The walls and floors make the rooms: use the House tool to move walls, resize rooms and add walls.',
  },
  style: {
    name: 'House trim',
    reason:
      "Part of this city's house style, built onto the walls (beams, boards, posts and the raised floor), so it stays with the house.",
  },
  wall: {
    name: 'Added wall',
    reason: 'A wall you added: change, move or delete it with the House tool, under Walls.',
  },
  roof: {
    name: 'Roof',
    reason:
      'The roof covers the house as built; hide it with the Roofs toggle to see and edit inside.',
  },
};

// Parts the game moves or shows by itself, which are not the editor's to place.
const MOVED_BY_THE_GAME = [
  'actor',
  'animal',
  'wildlife',
  'flyingBird',
  'cloud',
  'sky',
  'worldSky',
  'moonSurface',
  'busStop',
];
export const movedByTheGame = (m) =>
  m.pos[1] < -5 || m.opacity === 0 || MOVED_BY_THE_GAME.some((flag) => m[flag]);
const TOWN = ['community', 'communityDetail', 'residence', 'civic', 'recreation', 'regionalStreet'];
// Flat paint on the ground: kerb lines, parking bays, crossings.
const flat = (m) => m.size[1] <= 0.05 && m.pos[1] <= 0.35;
// Low enough to be paving or a kerb rather than something standing.
const low = (m) => flat(m) || m.pos[1] + m.size[1] / 2 <= 0.4;
// The house footprint every destination shares (world-model.js).
const inHouse = (m, margin = 0) =>
  m.pos[0] > -13.2 - margin &&
  m.pos[0] < 1.5 + margin &&
  m.pos[2] > -11.1 - margin &&
  m.pos[2] < -0.9 + margin;

export function tagLooseParts(model) {
  const roofs = new Set(model.roofs || []);
  // The house's walls and floors belong to the House tool (house-shell.js).
  const shell = new Set(
    [...(model.shell?.walls || []), ...(model.shell?.rooms || [])].flatMap((w) => w.parts),
  );
  // Town lots with the parcel each stands on (a residence's lawn reaches past its house).
  const { sim, origin } = model.community || {};
  const lots = (sim?.map.buildings || [])
    .filter((b) => !b.existingProperty)
    .map((b) => {
      const area = b.lot || b;
      return {
        id: 'town/' + b.id,
        x: origin.x + area.x,
        z: origin.z + area.z,
        w: Math.max(area.w, b.w),
        d: Math.max(area.d, b.d),
      };
    });
  const edge = (m, l) =>
    Math.max(Math.abs(m.pos[0] - l.x) - l.w / 2, Math.abs(m.pos[2] - l.z) - l.d / 2, 0);
  const lotNear = (m, margin) => {
    let best = null,
      nearest = Infinity;
    for (const l of lots) {
      const d = edge(m, l);
      if (d <= margin && d < nearest) [best, nearest] = [l, d];
    }
    return best?.id;
  };
  // What this pass did, for the editor and the tests: parts joined to a lot, parts given a group
  // of their own, and parts locked, by reason.
  const done = { joined: 0, grouped: 0, locked: {} };
  const counts = {};
  const numbered = (kind) => kind + '#' + (counts[kind] = (counts[kind] || 0) + 1);
  // Loose pieces wait here by kind; touching pieces of a kind then become one object.
  const loose = new Map();
  const keep = (kind, m) => {
    if (!loose.has(kind)) loose.set(kind, []);
    loose.get(kind).push(m);
  };
  // A tree is the parts built one after another around its trunk.
  let tree = null;
  for (const m of model.objects) {
    if (m.editGroup || m.editLock || movedByTheGame(m)) {
      if (!m.vegetation) tree = null;
      continue;
    }
    if (m.vegetation) {
      const kind = m.landscape
        ? 'landscape/tree'
        : TOWN.some((f) => m[f])
          ? 'town/tree'
          : 'garden/plant';
      if (!tree || tree.kind !== kind || Math.hypot(m.pos[0] - tree.x, m.pos[2] - tree.z) > 3)
        tree = { kind, id: numbered(kind), x: m.pos[0], z: m.pos[2] };
      m.editGroup = tree.id;
      done.grouped++;
      continue;
    }
    tree = null;
    const farm = FARM.find(([flag]) => m[flag])?.[1];
    if (shell.has(m)) m.editLock = 'house';
    else if (roofs.has(m)) m.editLock = 'roof';
    else if (m.trafficSignal || m.trafficStopLine || m.incomingLane) m.editLock = 'traffic';
    else if (m.homeDriveway || m.drivewaySection || m.farmHomeDriveway) m.editLock = 'driveway';
    else if (m.landscapeGround || Math.max(m.size[0], m.size[2]) > 60) m.editLock = 'ground';
    else if (m.terrainFeature) m.editLock = 'terrain';
    else if (farm) keep(farm, m);
    else if (TOWN.some((f) => m[f])) {
      // On a lot (or, standing, close by): part of it. Paving and kerbs off the lots are street.
      const lot = lotNear(m, flat(m) ? 0 : 3) || (!low(m) && lotNear(m, 12));
      if (lot) {
        m.editGroup = lot;
        done.joined++;
      } else if (low(m)) m.editLock = 'street';
      else keep('town/detail', m);
    } else if (inHouse(m) && m.pos[1] < 0.3) m.editLock = 'house';
    else if (Math.max(m.size[0], m.size[2]) > 20) m.editLock = 'ground';
    else if (inHouse(m, 1.6)) m.editLock = 'style';
    else keep('garden/feature', m);
  }
  for (const [kind, parts] of loose)
    for (const piece of touching(parts)) {
      const id = numbered(kind);
      for (const m of piece) m.editGroup = id;
      done.grouped += piece.length;
    }
  for (const m of model.objects)
    if (m.editLock) done.locked[m.editLock] = (done.locked[m.editLock] || 0) + 1;
  model.detached = done;
  // A collider follows the group of the smallest piece standing over it (the lot's bollard, the
  // depot's parked bus, a fence made here). The house's walls keep theirs for the House tool.
  const over = model.objects.filter((m) => m.editGroup && !movedByTheGame(m));
  for (const c of model.colliders) {
    if (c.editGroup || inHouse({ pos: [c.x, 0, c.z] }, 0.3)) continue;
    let best = null,
      smallest = Infinity;
    for (const m of over) {
      const { min, max } = bounds([m]),
        area = (max[0] - min[0]) * (max[2] - min[2]);
      if (
        area < smallest &&
        // Only a collider within the piece: a long fence's runs stay where they are.
        c.w <= max[0] - min[0] + 1 &&
        c.d <= max[2] - min[2] + 1 &&
        c.x >= min[0] - 0.05 &&
        c.x <= max[0] + 0.05 &&
        c.z >= min[2] - 0.05 &&
        c.z <= max[2] + 0.05
      )
        [best, smallest] = [m, area];
    }
    if (best) c.editGroup = best.editGroup;
  }
}

// Farm pieces by the flag the farm builders give them, and the kind of group they make.
const FARM = [
  ['parkedFarmCar', 'farm/parked-car'],
  ['farmFence', 'farm/fence'],
  ['farmFeedStation', 'farm/feed-station'],
  ['farmTrough', 'farm/trough'],
  ['farmTroughWater', 'farm/trough'],
  ['farmPondGarden', 'farm/pond-garden'],
  ['farmFeature', 'farm/feature'],
];
// A part's box on the ground plan and in height, as it is turned.
function bounds(parts) {
  const min = [Infinity, Infinity, Infinity],
    max = [-Infinity, -Infinity, -Infinity];
  for (const p of parts) {
    const turn = p.rotation?.[1] || 0,
      c = Math.abs(Math.cos(turn)),
      s = Math.abs(Math.sin(turn)),
      half = [
        (p.size[0] * c + p.size[2] * s) / 2,
        p.size[1] / 2,
        (p.size[0] * s + p.size[2] * c) / 2,
      ];
    for (let i = 0; i < 3; i++) {
      min[i] = Math.min(min[i], p.pos[i] - half[i]);
      max[i] = Math.max(max[i], p.pos[i] + half[i]);
    }
  }
  return { min, max };
}
// Parts split into sets that touch (boxes within 5 cm), in the order they were built.
function touching(parts) {
  const boxes = parts.map((p) => bounds([p])),
    parent = parts.map((_, i) => i);
  const root = (i) => (parent[i] === i ? i : (parent[i] = root(parent[i])));
  const near = (a, b) =>
    [0, 1, 2].every((i) => a.min[i] <= b.max[i] + 0.05 && b.min[i] <= a.max[i] + 0.05);
  for (let i = 0; i < parts.length; i++)
    for (let j = i + 1; j < parts.length; j++)
      if (near(boxes[i], boxes[j])) parent[root(j)] = root(i);
  const sets = new Map();
  parts.forEach((p, i) => {
    const r = root(i);
    if (!sets.has(r)) sets.set(r, []);
    sets.get(r).push(p);
  });
  return [...sets.values()].sort((a, b) => parts.indexOf(a[0]) - parts.indexOf(b[0]));
}
