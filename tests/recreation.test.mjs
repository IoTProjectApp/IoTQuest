import test from 'node:test';
import assert from 'node:assert/strict';
import { createRegionalModel } from '../public/regions.js';
import { locations } from '../public/locations.js';
import { addCommunityWorld, updateCommunityWorld } from '../public/community-world.js';
import { collides } from '../public/world-math.js';

test('pool and gym occupy separate connected plots with safe entrances at every destination', () => {
  for (const location of [undefined, ...locations]) {
    const model = createRegionalModel(location?.id || 'legacy');
    const c = addCommunityWorld(model, location);
    const home = c.sim.map.buildings.find((b) => b.type === 'home');
    for (const { building: b, furniture } of c.recreation) {
      const area = c.areas.find((a) => a[3].communityType === b.type);
      assert.ok(area[3].recreation);
      assert.ok(c.sim.map.walks.route(home.node, b.node).length, `${location?.id}: ${b.type}`);
      for (const [a, end] of c.sim.map.segments) {
        const horizontal = a.z === end.z;
        assert.ok(
          horizontal ? Math.abs(b.z - a.z) >= b.d / 2 + 8.5 : Math.abs(b.x - a.x) >= b.w / 2 + 8.5,
        );
      }
      const entry = c.sim.map.walks.nodes[b.node];
      assert.equal(collides(entry.x + c.origin.x, entry.z + c.origin.z, model.colliders), false);
      const room = model.rooms.find((r) => r[0] === b.name);
      assert.equal(collides(room[1], room[2], model.colliders), false);
      assert.ok(room[3].bounds.maxX - room[3].bounds.minX > 10);
      assert.ok(furniture.length > 25);
      const staff = model.actors.find(
        (a) => a.id === 'recreation:' + b.type || a.id === 'openblock:' + b.type,
      );
      assert.equal(staff.name, b.resident);
      assert.equal(collides(staff.x, staff.z, model.colliders), false);
      if (b.type === 'park') {
        assert.equal(b.district, 'Riverside park district');
        assert.equal(area[3].district, b.district);
        assert.ok(b.w >= 28 && b.d >= 30, 'Park occupies a full landscaped block');
        for (const other of c.sim.map.buildings.filter((other) => other !== b))
          assert.ok(
            Math.floor(other.x / 48) !== Math.floor(b.x / 48) ||
              Math.floor(other.z / 48) !== Math.floor(b.z / 48),
            'Park has its own block',
          );
        assert.equal(c.signals.filter((s) => s.junction === '3:3').length, 3);
      }
      if (b.type === 'playground2') {
        const park = c.sim.map.buildings.find((b) => b.type === 'park');
        assert.equal(b.district, 'Meadow play district');
        assert.equal(area[3].district, b.district);
        assert.equal(
          b.x - park.x,
          48,
          'Second playground occupies the block immediately beside the park',
        );
        assert.equal(b.z, park.z);
        assert.notEqual(b.district, park.district);
        assert.equal(c.recreation.filter((r) => r.building.playground).length, 2);
        const route = c.sim.map.walks.route(park.node, b.node);
        assert.equal(
          route.reduce((total, edge) => total + edge.length, 0),
          48,
        );
        assert.ok(route.some((edge) => edge.crossing?.junction === '4:3'));
        assert.equal(c.signals.filter((s) => s.junction === '4:3').length, 3);
      }
    }
    // The recreation district's junction has lights on all four incoming approaches.
    assert.equal(c.signals.filter((s) => s.junction === '3:1').length, 4);
  }
});

test('pool water stays visible below the surrounding deck and blocks walking into the basin', () => {
  const model = createRegionalModel('legacy'),
    c = addCommunityWorld(model);
  const { building: b } = c.recreation.find((r) => r.building.type === 'pool');
  assert.equal(b.water.surface, 'water');
  assert.equal(collides(b.water.pos[0], b.water.pos[2], model.colliders), true);
  const floors = c.objects.filter(
    (m) => m.recreation === 'pool' && m.surface === 'tile' && m.pos[1] > 0,
  );
  assert.equal(floors.filter((m) => !m.changingRoom).length, 4, 'Four deck strips');
  for (const floor of floors)
    assert.ok(
      Math.abs(floor.pos[0] - b.water.pos[0]) >= (floor.size[0] + b.water.size[0]) / 2 ||
        Math.abs(floor.pos[2] - b.water.pos[2]) >= (floor.size[2] + b.water.size[2]) / 2,
    );
});

test('installed recreation lighting responds only to its own area outputs', () => {
  const model = createRegionalModel('legacy'),
    c = addCommunityWorld(model);
  updateCommunityWorld(
    model,
    {
      running: true,
      devices: [{ id: 'led', area: 'Riverside gym', pin: 2 }],
      outputs: { 2: 1 },
      env: { light: 70 },
      areas: c.areas,
    },
    0,
  );
  assert.equal(c.recreation.find((r) => r.building.type === 'gym').lamp.emission, 1);
  assert.equal(c.recreation.find((r) => r.building.type === 'pool').lamp.emission, 0);
});

test('judo dojo has safe street access, a walkable tatami and a furnished changing bay', () => {
  const model = createRegionalModel('legacy'),
    c = addCommunityWorld(model);
  const dojo = c.recreation.find((r) => r.building.type === 'dojo');
  const b = dojo.building,
    x = c.origin.x + b.x,
    z = c.origin.z + b.z;
  const gym = c.sim.map.buildings.find((b) => b.type === 'gym');
  assert.equal(b.x - gym.x, 48);
  assert.equal(b.z, gym.z);
  for (const edge of c.sim.map.walks.route(gym.node, b.node))
    for (let i = 0; i <= 40; i++) {
      const [a, end] = edge.points,
        t = i / 40;
      assert.equal(
        collides(
          c.origin.x + a.x + (end.x - a.x) * t,
          c.origin.z + a.z + (end.z - a.z) * t,
          model.colliders,
        ),
        false,
      );
    }
  for (let dx = -15; dx < -5; dx += 0.2)
    assert.equal(collides(x + dx, z, model.colliders), false, 'Clear entrance aisle');
  for (let dz = 5.5; dz < 12; dz += 0.2)
    assert.equal(collides(x + 7, z + dz, model.colliders), false, 'Changing-room doorway');
  for (let dx = -5; dx <= 7; dx += 1)
    for (let dz = -8; dz <= 4; dz += 1)
      assert.equal(collides(x + dx, z + dz, model.colliders), false, 'Tatami is walkable');
  assert.equal(dojo.furniture.filter((m) => m.dojoMat).length, 49);
  assert.equal(dojo.furniture.filter((m) => m.dojoLocker).length, 7);
  assert.equal(dojo.students.length, 4);
  assert.equal(
    model.actors.filter((a) => a.area === b.name && a.role === 'Judo instructor').length,
    1,
  );
  for (const student of dojo.students) {
    assert.ok(Math.abs(student.x - dojo.mat.x) < dojo.mat.w / 2 - 2);
    assert.ok(Math.abs(student.z - dojo.mat.z) < dojo.mat.d / 2 - 2);
    const dx = dojo.instructor.x - student.x,
      dz = dojo.instructor.z - student.z;
    assert.ok(
      (Math.sin(student.heading) * dx + Math.cos(student.heading) * dz) / Math.hypot(dx, dz) >
        0.999,
    );
    assert.equal(
      student.parts.filter((p) => p.limb === 'leg').every((p) => p.color === '#e7e4d9'),
      true,
    );
  }
  updateCommunityWorld(
    model,
    {
      running: true,
      devices: [{ id: 'led', area: b.name, pin: 2 }],
      outputs: { 2: 1 },
      env: { light: 70 },
      areas: c.areas,
    },
    0,
  );
  assert.equal(dojo.lamp.emission, 1);
  assert.equal(c.recreation.find((r) => r.building.type === 'gym').lamp.emission, 0);
});

test('park paths remain clear around the fountain and the court has two horizontal hoops', () => {
  const model = createRegionalModel('legacy'),
    c = addCommunityWorld(model);
  const park = c.recreation.find((r) => r.building.type === 'park').building;
  assert.equal(collides(c.origin.x + park.x, c.origin.z + park.z - 2, model.colliders), true);
  for (const side of [-1, 1])
    for (let z = -11; z <= 6; z += 0.25)
      assert.equal(
        collides(c.origin.x + park.x + side * 3.6, c.origin.z + park.z + z, model.colliders),
        false,
      );
  for (const z of [-11, 6])
    for (let x = -3.6; x <= 3.6; x += 0.25)
      assert.equal(
        collides(c.origin.x + park.x + x, c.origin.z + park.z + z, model.colliders),
        false,
      );
  const hoops = model.objects.filter((m) => m.recreation === 'basketball' && m.shape === 'torus');
  assert.equal(hoops.length, 2);
  for (const hoop of hoops) assert.ok(!hoop.rotation || hoop.rotation.every((v) => v === 0));
});

test('children’s playground has separate play zones inside its plot and a clear entrance', () => {
  const model = createRegionalModel('legacy'),
    c = addCommunityWorld(model);
  for (const playground of c.recreation.filter((r) => r.building.playground)) {
    assert.deepEqual(
      playground.features.map((f) => f.type),
      ['swings', 'climbing-frame', 'slide', 'sandpit', 'seesaw'],
    );
    const { building: b } = playground;
    for (const f of playground.features) {
      assert.ok(Math.abs(f.x - c.origin.x - b.x) + f.w / 2 < b.w / 2);
      assert.ok(Math.abs(f.z - c.origin.z - b.z) + f.d / 2 < b.d / 2);
    }
    for (let z = 9; z < b.d / 2; z += 0.25)
      assert.equal(collides(c.origin.x + b.x, c.origin.z + b.z + z, model.colliders), false);
    assert.ok(c.areas.find((a) => a[3].communityType === b.type)[3].recreation);
  }
});

test('all four outdoor BBQ stations fit their own plots and leave play equipment clear', () => {
  const model = createRegionalModel('legacy'),
    c = addCommunityWorld(model);
  const areas = c.recreation.filter((r) => r.bbq);
  assert.deepEqual(areas.map((r) => r.building.type).sort(), [
    'basketball',
    'park',
    'playground',
    'playground2',
  ]);
  for (const area of areas) {
    const b = area.building,
      p = area.bbq.footprint;
    assert.ok(Math.abs(p.x - c.origin.x - b.x) + p.w / 2 < b.w / 2);
    assert.ok(Math.abs(p.z - c.origin.z - b.z) + p.d / 2 < b.d / 2);
    for (const f of area.features || [])
      assert.ok(Math.abs(f.x - p.x) >= (f.w + p.w) / 2 || Math.abs(f.z - p.z) >= (f.d + p.d) / 2);
    if (b.type === 'basketball')
      assert.ok(p.x + p.w / 2 < c.origin.x + b.x - 6, 'BBQ stays outside court sidelines');
  }
});

test('garden chairs and outdoor benches face their tables or activities', () => {
  const model = createRegionalModel('legacy');
  addCommunityWorld(model);
  const seats = model.objects.filter((m) => m.outdoorSeatPart === 'seat');
  assert.ok(seats.length > 20);
  for (const seat of seats) {
    const [tx, tz] = seat.seatTarget,
      dx = tx - seat.pos[0],
      dz = tz - seat.pos[2],
      length = Math.hypot(dx, dz);
    const yaw = seat.rotation[1];
    assert.ok(
      (Math.sin(yaw) * dx + Math.cos(yaw) * dz) / length > 0.999,
      'Seat faces its intended activity',
    );
  }
});

test('pool and gym have enclosed changing rooms and shower rooms with doorways', () => {
  const model = createRegionalModel('legacy'),
    c = addCommunityWorld(model);
  for (const type of ['pool', 'gym']) {
    const parts = c.objects.filter((m) => m.recreation === type);
    assert.equal(
      parts.filter((m) => m.changingRoom).length,
      2,
      type + ': changing and shower floors',
    );
    const showers = parts.filter((m) => m.surface === 'water' && m.size[1] > 1);
    assert.ok(showers.length >= 2, type + ': shower stalls');
    const { building: b } = c.recreation.find((r) => r.building.type === type);
    // Each room can be walked into: the doorway centres are free of colliders.
    for (const [x, z] of type === 'pool'
      ? [
          [-11.5, -10.4],
          [-6.2, -10.4],
        ]
      : [
          [-7.2, 7.6],
          [-8.2, 9.8],
        ])
      assert.equal(
        collides(c.origin.x + b.x + x, c.origin.z + b.z + z, model.colliders),
        false,
        `${type} doorway at ${x}, ${z}`,
      );
  }
});

test('football field, outdoor gym and post office fill the free northern blocks only', () => {
  for (const [id, expected] of [
    ['legacy', 3],
    ['fitzroy', 0],
    ['brunswick', 0],
  ]) {
    const model = createRegionalModel(id),
      c = addCommunityWorld(
        model,
        locations.find((l) => l.id === id),
      );
    const types = c.openBlocks.map((item) => item.building.type);
    assert.equal(types.length, expected, id);
    for (const type of types) {
      assert.ok(c.sim.map.buildings.some((b) => b.type === type));
      assert.ok(c.areas.some((a) => a[3].communityType === type));
    }
  }
  const model = createRegionalModel('legacy'),
    c = addCommunityWorld(model);
  const football = c.openBlocks.find((item) => item.building.type === 'football');
  assert.equal(football.players.length, 10);
  const before = football.players.map((p) => [p.x, p.z]);
  for (let i = 0; i < 4; i++)
    updateCommunityWorld(
      model,
      { env: { light: 70, rain: 0 }, devices: [], outputs: {}, running: false, paused: false },
      0.5,
    );
  assert.notDeepEqual(
    football.players.map((p) => [p.x, p.z]),
    before,
    'Players move',
  );
});

test('the park fountain jet pulses and droplets cascade into the basin', () => {
  const model = createRegionalModel('legacy'),
    c = addCommunityWorld(model);
  const f = c.recreation.find((r) => r.fountain).fountain;
  const st = { env: { light: 70 }, devices: [], outputs: {}, running: false, paused: false };
  const heights = new Set(),
    drops = [];
  for (let i = 0; i < 12; i++) {
    updateCommunityWorld(model, st, 0.15);
    heights.add(f.jet.size[1].toFixed(3));
    drops.push(f.outer[0].pos.slice());
  }
  assert.ok(heights.size > 3, 'Jet height varies');
  assert.ok(new Set(drops.map((p) => p.join())).size > 3, 'Droplets move');
  for (const d of [...f.inner, ...f.outer]) assert.ok(d.pos[1] > 0.7 && d.pos[1] < 3.8);
});
