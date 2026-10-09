import test from 'node:test';
import assert from 'node:assert/strict';
import { createRegionalModel } from '../public/regions.js';
import { addCommunityWorld } from '../public/community-world.js';
import { locations } from '../public/locations.js';
import { fromWorld, toWorld, collides } from '../public/world-math.js';
import { overlaps } from '../public/community-sim.js';

test('existing regional homes and gardens are preserved and become the residential destination', () => {
  for (const location of [undefined, ...locations]) {
    const m = createRegionalModel(location?.id || 'legacy');
    const property = m.objects.filter((o) => !o.landscape),
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
    const originals = m.colliders.filter((b) => !b.community);
    for (const node of Object.values(c.sim.map.roads.nodes)) {
      const vehicle = { x: node.x + c.origin.x, z: node.z, angle: 0, length: 5, width: 1.6 };
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
                  a.z + (b.z - a.z) * f,
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

test('three new homes have gardens, residents, safe door routes and accessible workstations', () => {
  for (const id of ['legacy', 'kyoto', 'marrakech', 'brisbane']) {
    const m = createRegionalModel(id),
      c = addCommunityWorld(
        m,
        locations.find((l) => l.id === id),
      );
    assert.equal(c.residences.length, 3);
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
              collides(c.origin.x + a.x + (q.x - a.x) * f, a.z + (q.z - a.z) * f, walls, 0.23),
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
          Math.abs(g.footprint.x - room[1]) >= g.footprint.w / 2 + 2.59 ||
            Math.abs(g.footprint.z - room[2]) >= g.footprint.d / 2 + 2.7,
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
                a.z + (b.z - a.z) * f,
                added,
                graph === c.sim.map.roads ? 1 : 0.23,
              ),
              false,
            );
          }
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
