import { addCommunityWorld } from '../public/community-world.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRegionalModel } from '../public/regions.js';
import { locations } from '../public/locations.js';
import { missions, components } from '../public/missions.js';
import { sectionResidents } from '../public/section-residents.js';
import {
  deviceSpots,
  toWorld,
  collides,
  clearPath,
  findFree,
  roomHalf,
  DEVICE_GAP,
} from '../public/world-math.js';

const base = sectionResidents.map(([area, , x, y]) => [area, x, y]);
const homes = ['legacy', ...locations.map((l) => l.id)].map((id) => {
  const model = createRegionalModel(id),
    location = locations.find((l) => l.id === id);
  addCommunityWorld(model, location);
  return {
    id,
    model,
    areas: [
      ...model.community.areas,
      ...base.map(([a, x, y]) => [
        a,
        ...(model.areaOverrides?.[a] || location?.areaOverrides?.[a] || [x, y]),
      ]),
    ],
  };
});
// Where the game installs a quest's devices (see installDialog).
const questDevices = (m) =>
  m.ids.map((id) => ({
    id,
    area:
      m.sectionQuest || m.communityQuest || m.area === 'Greenhouse'
        ? m.area
        : components.find((c) => c.id === id).area,
  }));
function check(home, devices, minGap) {
  const spots = deviceSpots(devices, home.areas, home.model.colliders, home.model.rooms);
  devices.forEach((d, i) => {
    const p = spots.get(d),
      a = home.areas.find((a) => a[0] === d.area),
      [cx, , cz] = toWorld(findFree({ x: a[1], y: a[2] }, home.model.colliders)),
      where = `${home.id} · ${d.area} · ${d.id}`;
    assert.equal(
      collides(p.x, p.z, home.model.colliders, 0.3),
      false,
      where + ': in furniture or a wall',
    );
    assert.ok(clearPath({ x: cx, z: cz }, p, home.model.colliders), where + ': behind a wall');
    // Indoors the device stays on its own room's floor, never through a doorway into the next.
    const inside = (r, x, z) =>
        Math.abs(x - r[1]) <= roomHalf(r)[0] && Math.abs(z - r[2]) <= roomHalf(r)[1],
      room = home.model.rooms.find((r) => inside(r, cx, cz));
    if (room) assert.ok(inside(room, p.x, p.z), where + ': left its room');
    else assert.ok(Math.hypot(p.x - cx, p.z - cz) <= 2.5, where + ': too far from its point');
    assert.ok(Math.hypot(p.x - cx, p.z - cz) >= 0.8 - 1e-9, where + ': where the resident stands');
    devices.forEach((other, j) => {
      if (j > i) {
        const q = spots.get(other);
        assert.ok(
          Math.hypot(p.x - q.x, p.z - q.z) >= minGap,
          where + ' and ' + other.id + ': too close',
        );
      }
    });
  });
}

test('every quest gives each of its devices its own spot at every destination', () => {
  // A metre apart wherever the room allows; a few small regional bedrooms only have room for
  // devices about 0.6–0.85 m apart, still clearly separate (a device body is 0.28 m wide).
  for (const home of homes) for (const m of missions) check(home, questDevices(m), 0.6);
});

test('in the original home, every quest keeps its devices at least a metre apart', () => {
  for (const m of missions) check(homes[0], questDevices(m), DEVICE_GAP);
});

test('a crowded free build still keeps every device in its room and out of the furniture', () => {
  for (const home of homes)
    for (const [area] of home.areas)
      check(
        home,
        ['ldr', 'led', 'temp', 'fan', 'soil'].map((id) => ({ id, area })),
        0.35,
      );
});

test('adding a device never moves the devices already installed', () => {
  const home = homes[0],
    first = [
      { id: 'ldr', area: 'Water tank' },
      { id: 'led', area: 'Water tank' },
    ],
    before = deviceSpots(first, home.areas, home.model.colliders, home.model.rooms),
    after = deviceSpots(
      [...first, { id: 'pump', area: 'Water tank' }],
      home.areas,
      home.model.colliders,
      home.model.rooms,
    );
  for (const d of first) assert.deepEqual(after.get(d), before.get(d));
});

test('the bedroom devices stay in the bedroom, not through the doorway in the bathroom', () => {
  const home = homes[0],
    devices = ['pot', 'ldr', 'rgb'].map((id) => ({ id, area: 'Bedroom' })),
    spots = deviceSpots(devices, home.areas, home.model.colliders, home.model.rooms),
    [, bx, bz] = home.model.rooms.find(([name]) => name === 'Bedroom');
  for (const d of devices) {
    const p = spots.get(d);
    assert.ok(Math.abs(p.x - bx) <= 2.29 && Math.abs(p.z - bz) <= 2.4, d.id);
  }
});

test('regional layouts give each room its own floor: the court annex and the round house zones', () => {
  const annex = homes.find((h) => h.id === 'lamu'),
    round = homes.find((h) => h.id === 'hawassa'),
    roomOf = (home, name) => home.model.rooms.find((r) => r[0] === name),
    inside = (r, p) =>
      Math.abs(p.x - r[1]) <= roomHalf(r)[0] && Math.abs(p.z - r[2]) <= roomHalf(r)[1];
  // Lamu's bathroom and kitchen moved to the side annex; their old bays are the open court.
  for (const name of ['Bathroom', 'Kitchen']) {
    const devices = ['ldr', 'led', 'temp', 'fan', 'soil'].map((id) => ({ id, area: name })),
      spots = deviceSpots(devices, annex.areas, annex.model.colliders, annex.model.rooms);
    for (const d of devices) {
      const p = spots.get(d);
      assert.ok(inside(roomOf(annex, name), p), name + ' ' + d.id);
      assert.ok(p.x > 2.2 && p.x < 5.4 && p.z > -10.9 && p.z < -3.45, name + ' in the annex');
    }
  }
  // Hawassa's round house: each area's devices stay in its own zone, inside the round wall.
  for (const name of ['Bedroom', 'Bathroom', 'Kitchen', 'Utility room', 'Living room', 'Garage']) {
    const devices = ['ldr', 'led', 'temp'].map((id) => ({ id, area: name })),
      spots = deviceSpots(devices, round.areas, round.model.colliders, round.model.rooms);
    for (const d of devices) {
      const p = spots.get(d);
      assert.ok(inside(roomOf(round, name), p), name + ' ' + d.id);
      assert.ok(Math.hypot(p.x + 6, p.z + 6) < 4.8, name + ' inside the wall');
    }
  }
});
