import { updateCivicBuildings } from '../public/community-civic.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRegionalModel } from '../public/regions.js';
import { addCommunityWorld } from '../public/community-world.js';
import { locations } from '../public/locations.js';
import { fromWorld, toWorld, collides, modelMatrix } from '../public/world-math.js';
import { overlaps } from '../public/community-sim.js';

test('existing regional homes and gardens are preserved and become the residential destination', () => {
  for (const location of [undefined, ...locations]) {
    const m = createRegionalModel(location?.id || 'legacy');
    const property = m.objects.filter((o) => !o.landscape && !o.regionalStreet),
      positions = property.map((o) => [...o.pos]);
    const c = addCommunityWorld(m, location),
      home = c.sim.map.buildings.find((b) => b.type === 'home');
    assert.equal(home.x + c.origin.x, 0);
    assert.equal(home.z + c.origin.z, 0);
    assert.ok(home.existingProperty);
    assert.equal(c.sim.map.walks.nodes[home.node].x + c.origin.x, 0);
    for (let i = 0; i < property.length; i++) {
      assert.ok(m.objects.includes(property[i]));
      assert.deepEqual(property[i].pos, positions[i]);
    }
    for (const b of c.sim.map.buildings)
      if (b !== home) assert.ok(c.sim.map.walks.route(home.node, b.node).length);
    assert.deepEqual(c.origin, { x: location?.farm ? 96 : 24, z: 24 });
    for (const b of c.sim.map.buildings) {
      if (b === home) continue;
      assert.ok(
        Math.abs(b.x - home.x) >= (b.w + home.w) / 2 ||
          Math.abs(b.z - home.z) >= (b.d + home.d) / 2,
        `${location?.id || 'legacy'} building overlaps the existing home`,
      );
    }
    assert.ok(m.landscape.mountains.every((o) => o.pos[0] < (location?.farm ? 202 : 130)));
    assert.ok(m.landscape.waters.every((w) => w.mesh.pos[0] > (location?.farm ? -76 : -52)));
    const originals = m.colliders.filter((b) => !b.community);
    for (const node of Object.values(c.sim.map.roads.nodes)) {
      if (['homestead-car', 'farm-car-park', 'farm-parked-car'].includes(node.id)) continue; // Private vehicle bays inside the farm.
      const vehicle = {
        x: node.x + c.origin.x,
        z: node.z + c.origin.z,
        angle: 0,
        length: 5,
        width: 1.6,
      };
      for (const b of originals)
        assert.equal(
          overlaps(vehicle, { ...b, angle: 0, length: b.w, width: b.d }, 0),
          false,
          `${location?.id || 'legacy'} road enters original property`,
        );
    }
  }
});
test('new district furniture leaves shared pedestrian and vehicle routes clear', () => {
  for (const id of ['legacy', 'kyoto', 'marrakech', 'brisbane']) {
    const m = createRegionalModel(id),
      c = addCommunityWorld(
        m,
        locations.find((l) => l.id === id),
      );
    const props = m.colliders.filter(
      (b) =>
        b.community &&
        m.objects.some((o) => o.communityDetail && o.solid && o.pos[0] === b.x && o.pos[2] === b.z),
    );
    assert.ok(props.length > 0);
    for (const [graph, clearance] of [
      [c.sim.map.walks, 0.23],
      [c.sim.map.roads, 1],
    ])
      for (const edges of Object.values(graph.edges))
        for (const e of edges)
          for (let i = 1; i < e.points.length; i++) {
            const a = e.points[i - 1],
              b = e.points[i],
              length = Math.hypot(b.x - a.x, b.z - a.z);
            for (let t = 0; t <= length; t += 0.2) {
              const f = length ? t / length : 0;
              assert.equal(
                collides(
                  c.origin.x + a.x + (b.x - a.x) * f,
                  c.origin.z + a.z + (b.z - a.z) * f,
                  props,
                  clearance,
                ),
                false,
                `${id} decorative prop obstructs route`,
              );
            }
          }
  }
});

test('six neighbour homes have gardens, residents, safe door routes and accessible workstations', () => {
  for (const id of ['legacy', 'kyoto', 'marrakech', 'brisbane']) {
    const m = createRegionalModel(id),
      c = addCommunityWorld(
        m,
        locations.find((l) => l.id === id),
      );
    assert.equal(c.residences.length, 6);
    const walls = m.colliders.filter((o) => o.community);
    for (const home of c.residences) {
      const b = home.building;
      assert.ok(m.actors.some((a) => a.name === b.resident && a.area === b.name));
      assert.ok(home.plants.length >= 6);
      assert.ok(c.areas.some((a) => a[0] === b.name));
      const route = c.sim.map.walks.route(
        b.node,
        c.sim.map.buildings.find((b) => b.type === 'shop').node,
      );
      assert.ok(route.length);
      for (const edge of route)
        for (let i = 1; i < edge.points.length; i++) {
          const a = edge.points[i - 1],
            q = edge.points[i],
            length = Math.hypot(q.x - a.x, q.z - a.z);
          for (let t = 0; t <= length; t += 0.2) {
            const f = length ? t / length : 0;
            assert.equal(
              collides(
                c.origin.x + a.x + (q.x - a.x) * f,
                c.origin.z + a.z + (q.z - a.z) * f,
                walls,
                0.23,
              ),
              false,
              id + ' route obstructed',
            );
          }
        }
    }
  }
});

test('furnished areas have distinct materials and preserve public routes and installation clearances', async () => {
  const { furnishingMaterials } = await import('../public/community-furnishings.js');
  const m = createRegionalModel('legacy'),
    c = addCommunityWorld(m);
  for (const area of c.areas)
    assert.ok(
      c.furnishings.groups.some((g) => g.area === area[0]),
      area[0],
    );
  for (const material of Object.keys(furnishingMaterials))
    assert.ok(
      c.furnishings.groups.some((g) => g.parts.some((p) => p.material === material)),
      material,
    );
  const added = m.colliders.filter((o) => o.communityFurnishing);
  assert.ok(added.length > 10);
  for (const g of c.furnishings.groups) {
    assert.ok(g.parts.length > 0);
    assert.ok(
      g.parts.every((p) => Number.isFinite(p.roughness) && p.roughness >= 0 && p.roughness <= 1),
    );
    if (!g.reusedFootprint)
      for (const room of m.rooms.filter((r) => r[3]?.community))
        assert.ok(
          Math.abs(g.footprint.x - room[1]) >= g.footprint.w / 2 + (g.roomFurniture ? 0.8 : 2.59) ||
            Math.abs(g.footprint.z - room[2]) >= g.footprint.d / 2 + (g.roomFurniture ? 0.8 : 2.7),
          'Installation space remains clear: ' + g.id,
        );
  }
  for (const graph of [c.sim.map.walks, c.sim.map.roads])
    for (const edges of Object.values(graph.edges))
      for (const e of edges)
        for (let i = 1; i < e.points.length; i++) {
          const a = e.points[i - 1],
            b = e.points[i],
            length = Math.hypot(b.x - a.x, b.z - a.z);
          for (let t = 0; t <= length; t += 0.2) {
            const f = length ? t / length : 0;
            assert.equal(
              collides(
                c.origin.x + a.x + (b.x - a.x) * f,
                c.origin.z + a.z + (b.z - a.z) * f,
                added,
                graph === c.sim.map.roads ? 1 : 0.23,
              ),
              false,
            );
          }
        }
});

test('new rooms and neighbour lots are furnished inside their parcels at every destination', () => {
  for (const location of [undefined, ...locations]) {
    const model = createRegionalModel(location?.id || 'legacy');
    const c = addCommunityWorld(model, location);
    const groups = c.furnishings.groups.filter((g) => g.roomFurniture);
    for (const b of c.sim.map.buildings.filter(
      (b) => b.civic || b.residential || b.regionalNeighbour,
    )) {
      const furniture = groups.filter((g) => g.id.startsWith(b.type + ':'));
      assert.ok(furniture.length > 0, `${location?.id || 'legacy'}: ${b.name} lacks furniture`);
      const bounds = b.lot || b;
      for (const g of furniture) {
        const p = g.footprint;
        assert.ok(
          Math.abs(p.x - c.origin.x - bounds.x) + p.w / 2 < bounds.w / 2,
          g.id + ' extends outside its parcel',
        );
        assert.ok(
          Math.abs(p.z - c.origin.z - bounds.z) + p.d / 2 < bounds.d / 2,
          g.id + ' extends outside its parcel',
        );
        assert.ok(g.parts.every((p) => p.pos.every(Number.isFinite) && p.size.every((v) => v > 0)));
      }
    }
    for (const s of c.sections)
      assert.ok(
        groups.some((g) => g.area === s.name),
        s.name + ' lacks room furniture',
      );
    assert.ok(groups.filter((g) => g.area === 'Community hospital').length >= 8);
    assert.equal(groups.filter((g) => g.id.includes('cell-washbasin')).length, 2);
  }
});

test('furnished equipment indicators respond to actual outputs and reset when execution stops', async () => {
  const { updateCommunityEquipment } = await import('../public/community-furnishings.js');
  const c = addCommunityWorld(createRegionalModel('legacy'));
  const state = {
    running: true,
    devices: [
      { id: 'conveyor', area: 'Factory floor', pin: 7 },
      { id: 'warningLight', area: 'Factory floor', pin: 4 },
    ],
    outputs: { 7: 1, 4: 0 },
  };
  updateCommunityEquipment(c.furnishings, state);
  const screen = c.furnishings.indicators.find((i) => i.area === 'Factory floor').screen;
  assert.equal(screen.emission, 0.45);
  assert.equal(screen.color, '#8fb5a0');
  state.outputs = { 7: 0, 4: 1 };
  updateCommunityEquipment(c.furnishings, state);
  assert.equal(screen.color, '#d69664');
  state.running = false;
  updateCommunityEquipment(c.furnishings, state);
  assert.equal(screen.emission, 0.05);
});

test('civic buildings have reachable entrances, staff, and independent live indicators', () => {
  const m = createRegionalModel('legacy'),
    c = addCommunityWorld(m);
  assert.equal(c.civic.length, 4);
  assert.ok(
    c.sim.map.roads.route('0:1>1:1:out', '2:1>3:1:in').length,
    'The civic blocks share through streets with the original town',
  );
  assert.ok(c.sim.map.segments.some(([a, b]) => a.x === 96 || b.x === 96));
  for (const { building: b } of c.civic) {
    assert.ok(b.x - b.w / 2 > 56 && b.x + b.w / 2 < 88);
    assert.ok(Math.abs(b.z) - b.d / 2 > 8);
    assert.ok(Math.abs(b.z) + b.d / 2 < 40);
  }
  const home = c.sim.map.buildings.find((b) => b.type === 'home');
  m.dynamic.gateCollider.disabled = true;
  for (const { building: b, lamp, indicator } of c.civic) {
    assert.ok(c.areas.some((a) => a[0] === b.name));
    assert.ok(m.actors.some((a) => a.id === 'civic:' + b.type && a.area === b.name));
    const route = c.sim.map.walks.route(home.node, b.node);
    assert.ok(route.length);
    for (const e of route)
      for (let i = 1; i < e.points.length; i++) {
        const a = e.points[i - 1],
          q = e.points[i],
          length = Math.hypot(q.x - a.x, q.z - a.z);
        for (let t = 0; t <= length; t += 0.2) {
          const f = t / length;
          assert.equal(
            collides(
              c.origin.x + a.x + (q.x - a.x) * f,
              c.origin.z + a.z + (q.z - a.z) * f,
              m.colliders,
              0.23,
            ),
            false,
            b.name + ' entrance blocked',
          );
        }
      }
    updateCivicBuildings(c.civic, {
      running: true,
      devices: [
        { id: 'led', area: b.name, pin: 2 },
        { id: 'buzzer', area: b.name, pin: 3 },
      ],
      outputs: { 2: 1, 3: 1 },
    });
    assert.equal(lamp.emission, 1);
    assert.equal(indicator.emission, 0.6);
    assert.ok(
      c.civic.filter((other) => other.building !== b).every((other) => other.lamp.emission === 0),
    );
    updateCivicBuildings(c.civic, { running: false, devices: [], outputs: {} });
    assert.equal(lamp.emission, 0);
    assert.equal(indicator.emission, 0);
  }
});

test('every location gives each home a separate parcel clear of roads and other parcels', () => {
  for (const location of [undefined, ...locations]) {
    const m = createRegionalModel(location?.id || 'legacy'),
      c = addCommunityWorld(m, location);
    for (const { building: b } of c.residences) {
      const lot = b.lot;
      assert.ok(b.z > -96 && b.z < -48, b.name + ' inside the residential block');
      assert.ok(m.objects.some((o) => o.residentialParcel === b.type));
      assert.ok(m.objects.some((o) => o.residentialBoundary === b.type));
      for (const { building: other } of c.residences) {
        if (other === b) continue;
        assert.ok(
          Math.abs(lot.x - other.lot.x) >= (lot.w + other.lot.w) / 2 ||
            Math.abs(lot.z - other.lot.z) >= (lot.d + other.lot.d) / 2,
          'Separate private areas',
        );
      }
      for (const mesh of m.objects.filter((o) => o.residence === b.type)) {
        const transform = modelMatrix(mesh.pos, mesh.size, mesh.rotation);
        const halfX =
          (Math.abs(transform[0]) + Math.abs(transform[4]) + Math.abs(transform[8])) / 2;
        const halfZ =
          (Math.abs(transform[2]) + Math.abs(transform[6]) + Math.abs(transform[10])) / 2;
        const x = mesh.pos[0] - c.origin.x,
          z = mesh.pos[2] - c.origin.z;
        assert.ok(Math.abs(x - lot.x) + halfX <= lot.w / 2 + 0.1, b.name + ' within its parcel');
        assert.ok(Math.abs(z - lot.z) + halfZ <= lot.d / 2 + 0.1, b.name + ' within its parcel');
        for (const [a, q] of c.sim.map.segments) {
          const horizontal = a.z === q.z;
          const road = {
            x: (a.x + q.x) / 2,
            z: (a.z + q.z) / 2,
            w: horizontal ? 48 : 17,
            d: horizontal ? 17 : 48,
          };
          assert.ok(
            Math.abs(x - road.x) >= halfX + road.w / 2 ||
              Math.abs(z - road.z) >= halfZ + road.d / 2,
            (location?.id || 'legacy') + ': ' + b.name + ' overlaps street or pavement',
          );
        }
      }
    }
  }
});

test('older Melbourne decorative neighbours become labeled private sections off the roads', () => {
  for (const location of locations.filter((l) => l.metro === 'Melbourne')) {
    const m = createRegionalModel(location.id),
      original = m.objects.filter((o) => o.neighbour);
    const c = addCommunityWorld(m, location),
      sections = c.sim.map.buildings.filter((b) => b.regionalNeighbour);
    assert.equal(sections.length, original.length, location.id);
    assert.equal(
      m.objects.some((o) => o.regionalStreet && !o.neighbourHouse),
      false,
    );
    for (const b of sections) {
      assert.ok(c.areas.some((a) => a[0] === b.name));
      assert.ok(m.rooms.some((r) => r[0] === b.name));
      assert.ok(b.z > 48 && b.z < 96);
      for (const mesh of m.objects.filter((o) => o.neighbourHouse === b.type)) {
        const matrix = modelMatrix(mesh.pos, mesh.size, mesh.rotation);
        const hx = (Math.abs(matrix[0]) + Math.abs(matrix[4]) + Math.abs(matrix[8])) / 2;
        const hz = (Math.abs(matrix[2]) + Math.abs(matrix[6]) + Math.abs(matrix[10])) / 2;
        const x = mesh.pos[0] - c.origin.x,
          z = mesh.pos[2] - c.origin.z;
        assert.ok(Math.abs(x - b.x) + hx < b.lot.w / 2 + 0.1, b.name + ' private lot');
        assert.ok(Math.abs(z - b.z) + hz < b.lot.d / 2 + 0.1, b.name + ' private lot');
        for (const [a, q] of c.sim.map.segments) {
          const horizontal = a.z === q.z;
          assert.ok(
            Math.abs(x - (a.x + q.x) / 2) >= hx + (horizontal ? 48 : 17) / 2 ||
              Math.abs(z - (a.z + q.z) / 2) >= hz + (horizontal ? 17 : 48) / 2,
            location.id + ': ' + b.name + ' on a street',
          );
        }
      }
    }
  }
});

test('school classrooms and police sections have clear door routes and independent indicators', () => {
  const m = createRegionalModel('legacy'),
    c = addCommunityWorld(m);
  assert.deepEqual(
    c.sections.map((s) => s.name),
    [
      'School classroom 1',
      'School classroom 2',
      'School classroom 3',
      'Police office',
      'Police parking',
      'Police jail',
    ],
  );
  for (const section of c.sections) {
    assert.ok(c.areas.some((a) => a[0] === section.name));
    assert.ok(m.rooms.some((r) => r[0] === section.name && r[3].bounds));
    const parent = c.sim.map.buildings.find((b) => b.type === section.parentType);
    for (const edge of c.sim.map.walks.route(parent.node, section.node)) {
      for (let i = 1; i < edge.points.length; i++) {
        const a = edge.points[i - 1],
          b = edge.points[i];
        const length = Math.hypot(b.x - a.x, b.z - a.z);
        for (let t = 0; t <= length; t += 0.1) {
          const f = t / length;
          assert.equal(
            collides(
              c.origin.x + a.x + (b.x - a.x) * f,
              c.origin.z + a.z + (b.z - a.z) * f,
              m.colliders,
              0.23,
            ),
            false,
            section.name + ' doorway blocked',
          );
        }
      }
    }
    updateCivicBuildings(c.civic, {
      running: true,
      devices: [
        { id: 'led', area: section.name, pin: 2 },
        { id: 'buzzer', area: section.name, pin: 3 },
      ],
      outputs: { 2: 1, 3: 1 },
    });
    assert.equal(section.lamp.emission, 1);
    assert.equal(section.indicator.emission, 0.6);
    assert.ok(c.sections.filter((s) => s !== section).every((s) => s.lamp.emission === 0));
    updateCivicBuildings(c.civic, { running: false, devices: [], outputs: {} });
    assert.equal(section.lamp.emission, 0);
    assert.equal(section.indicator.emission, 0);
  }
});

test('each classroom has exactly one teacher and four students; school staff stay in reception', () => {
  for (const location of [undefined, ...locations]) {
    const m = createRegionalModel(location?.id || 'legacy'),
      c = addCommunityWorld(m, location);
    for (const section of c.sections.filter((s) => s.parentType === 'school')) {
      const bounds = m.rooms.find((r) => r[0] === section.name)[3].bounds;
      const occupants = m.actors.filter(
        (a) =>
          a.id !== 'player' &&
          a.x >= bounds.minX &&
          a.x <= bounds.maxX &&
          a.z >= bounds.minZ &&
          a.z <= bounds.maxZ,
      );
      assert.equal(occupants.length, 1, (location?.id || 'legacy') + ': ' + section.name);
      assert.equal(occupants[0].role, 'Class teacher');
      assert.equal(occupants[0].area, section.name);
      assert.equal(section.students.length, 4);
    }
    const caretaker = m.actors.find((a) => a.id === 'civic:school');
    assert.equal(caretaker.role, 'School caretaker');
    assert.ok(
      caretaker.x < c.origin.x + 71,
      'Caretaker stays on the reception side of the corridor',
    );
  }
});
