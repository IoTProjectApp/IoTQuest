import test from 'node:test';
import assert from 'node:assert/strict';
import { victorianFarms } from '../public/farms.js';
import { createRegionalModel } from '../public/regions.js';
import { addCommunityWorld } from '../public/community-world.js';
import { updateAnimals } from '../public/animals.js';
import { updateFarm } from '../public/farm-assets.js';
import { overlaps } from '../public/community-sim.js';

test('each Victorian farm has a routed driveway, a controlled crossing and three correctly facing lights', () => {
  for (const f of victorianFarms) {
    const m = createRegionalModel(f.id),
      c = addCommunityWorld(m, f),
      s = c.sim;
    assert.ok(m.farm.driveway);
    assert.ok(s.map.roads.route('0:1>0:2:out', 'farm-parking').length);
    assert.ok(s.map.roads.route('farm-parking', '0:2>0:1:in').length);
    const home = s.map.buildings.find((b) => b.type === 'home');
    assert.ok(s.map.walks.route('farm-arrival', home.node).length);
    assert.ok(
      !m.objects
        .filter((o) => o.farmFence)
        .some(
          (o) =>
            Math.abs(o.pos[0] - 14) < o.size[0] / 2 + 0.2 &&
            Math.abs(o.pos[2] - 31) < o.size[2] / 2 + 0.2,
        ),
      'Wire blocks the parking entrance',
    );
    const heads = c.signals.filter((h) => h.junction === 'farm-access');
    assert.equal(heads.length, 3);
    assert.deepEqual(heads.find((h) => h.axis === 'EW').facing, [-1, 0]);
    assert.ok(s.map.crossings.find((c) => c.id === 'farm-crossing').signal);
    for (const mesh of m.objects.filter((o) => o.farmDriveway))
      for (const animal of m.animals) {
        const [x0, z0, x1, z1] = animal.paddock;
        assert.ok(
          mesh.pos[0] + mesh.size[0] / 2 <= x0 ||
            mesh.pos[0] - mesh.size[0] / 2 >= x1 ||
            mesh.pos[2] + mesh.size[2] / 2 <= z0 ||
            mesh.pos[2] - mesh.size[2] / 2 >= z1,
          f.id + ' driveway surface enters a paddock',
        );
      }
    s.density = s.pedestrianDensity = 0;
    Object.assign(s.signalsAt('farm-access'), { phase: 'NS', remaining: 1000 });
    const leaving = s.addVehicle('farm-departure', 'farm-access>0:2:out', 'van');
    s.advance(20);
    assert.equal(leaving.index, 0);
    assert.ok(leaving.speed < 0.2, 'Farm vehicle must wait on red');
    Object.assign(s.signalsAt('farm-access'), { phase: 'EW', remaining: 1000 });
    s.advance(30);
    assert.ok(leaving.index > 0, 'Farm vehicle must proceed on green');
    s.vehicles = [];
    Object.assign(s.signalsAt('farm-access'), { phase: 'EW', remaining: 1000 });
    const entering = s.addVehicle('0:1>0:2:out', 'farm-parking', 'van');
    s.advance(10);
    assert.equal(entering.index, 0, 'Main-street vehicle waits for its own green');
    Object.assign(s.signalsAt('farm-access'), { phase: 'NS', remaining: 1000 });
    let reachedLoadingBay = false;
    for (let i = 0; i < 1600; i++) {
      s.advance(0.05);
      for (const animal of m.animals) {
        const [x0, z0, x1, z1] = animal.paddock;
        assert.equal(
          overlaps(
            { ...entering, x: entering.x + c.origin.x, z: entering.z + c.origin.z },
            { x: (x0 + x1) / 2, z: (z0 + z1) / 2, length: x1 - x0, width: z1 - z0, angle: 0 },
            0,
          ),
          false,
          'The vehicle route enters a livestock paddock',
        );
      }
      if (entering.dwell > 0) {
        reachedLoadingBay = true;
        break;
      }
    }
    assert.ok(reachedLoadingBay, 'Vehicle failed to stop inside the farm service yard');
    const parking = s.map.roads.nodes['farm-parking'];
    assert.ok(
      Math.hypot(entering.x - parking.x, entering.z - parking.z) < 0.5,
      'Vehicle failed to reach farm parking',
    );
  }
});

test('cars and larger farm trucks enter the vehicle gate, turn inside the yard and leave without clipping fences', () => {
  for (const farm of victorianFarms)
    for (const kind of ['car', 'truck']) {
      const m = createRegionalModel(farm.id),
        c = addCommunityWorld(m, farm),
        s = c.sim;
      s.density = s.pedestrianDensity = 0;
      Object.assign(s.signalsAt('farm-access'), { phase: 'NS', remaining: 1000 });
      const vehicle = s.addVehicle('0:1>0:2:out', 'farm-parking', kind);
      // Check more clearance than the renderer's standard five-metre truck requires.
      if (kind === 'truck') {
        vehicle.length = 8;
        vehicle.width = 2.4;
      }
      const fences = m.objects.filter((o) => o.farmYardFence || o.farmVehicleGate || o.farmFence);
      let arrived = false;
      const check = () => {
        const world = { ...vehicle, x: vehicle.x + c.origin.x, z: vehicle.z + c.origin.z };
        for (const fence of fences)
          assert.equal(
            overlaps(
              world,
              {
                x: fence.pos[0],
                z: fence.pos[2],
                length: fence.size[0],
                width: fence.size[2],
                angle: 0,
              },
              0,
            ),
            false,
            `${farm.id}: ${kind} clips a gate or fence`,
          );
      };
      for (let i = 0; i < 2000; i++) {
        s.advance(0.05);
        check();
        if (vehicle.dwell > 0) {
          arrived = true;
          break;
        }
      }
      assert.ok(arrived, kind + ' failed to reach farm loading area');
      assert.equal(s.map.farmDriveway.visits[kind], 1);
      Object.assign(s.signalsAt('farm-access'), { phase: 'EW', remaining: 1000 });
      let departed = false;
      for (let i = 0; i < 2000; i++) {
        s.advance(0.05);
        check();
        if (vehicle.x + c.origin.x > 40) {
          departed = true;
          break;
        }
      }
      assert.ok(departed, kind + ' failed to leave the farm');
    }
});

test('Victorian livestock and wildlife paddocks are clear of all integrated town roads', () => {
  for (const f of victorianFarms) {
    const m = createRegionalModel(f.id),
      c = addCommunityWorld(m, f);
    for (const animal of [...m.animals, ...m.landscape.wildlife]) {
      const [x0, z0, x1, z1] = animal.paddock;
      for (const [a, b] of c.sim.map.segments) {
        const minX = c.origin.x + Math.min(a.x, b.x) - 6,
          maxX = c.origin.x + Math.max(a.x, b.x) + 6;
        const minZ = c.origin.z + Math.min(a.z, b.z) - 6,
          maxZ = c.origin.z + Math.max(a.z, b.z) + 6;
        assert.ok(
          x1 <= minX || x0 >= maxX || z1 <= minZ || z0 >= maxZ,
          f.id + ' road crosses ' + animal.kind + ' paddock',
        );
      }
    }
    const home = c.sim.map.buildings.find((b) => b.type === 'home');
    for (const b of c.sim.map.buildings)
      assert.ok(c.sim.map.walks.route(home.node, b.node).length || b === home);
  }
});

test('farm grazing avoids closed sheds, trough shells and dams, while ducks can use the water', () => {
  for (const f of victorianFarms) {
    const m = createRegionalModel(f.id);
    for (let i = 0; i < 6000; i++) {
      updateAnimals(m.animals, i * 0.1, 0.1);
      for (const a of m.animals)
        for (const b of a.obstacles)
          assert.ok(
            Math.abs(a.x - b.x) >= b.w / 2 || Math.abs(a.z - b.z) >= b.d / 2,
            f.id + ': ' + a.kind + ' entered a solid feature',
          );
    }
    if (f.style === 'orchard')
      assert.ok(
        m.animals.filter((a) => a.kind === 'duck').every((a) => !a.obstacles.some((b) => b.water)),
      );
  }
});

test('dairy gates and the town footpath have real openings in the farm wire', () => {
  for (const f of victorianFarms) {
    const m = createRegionalModel(f.id),
      c = addCommunityWorld(m, f);
    const fences = m.objects.filter((o) => o.farmFence);
    const obstructed = (x, z) =>
      fences.some(
        (o) =>
          Math.abs(x - o.pos[0]) < o.size[0] / 2 + 0.2 &&
          Math.abs(z - o.pos[2]) < o.size[2] / 2 + 0.2,
      );
    for (let x = 0; x < 56; x += 0.25)
      assert.equal(obstructed(x, 16), false, f.id + ' wire blocks farm track');
    for (const gate of m.farm.gates || []) {
      assert.equal(
        obstructed(gate.hinge[0], gate.hinge[1] + 1.2),
        false,
        'Wire spans the dairy gate',
      );
    }
    assert.equal(c.origin.x, 96);
  }
});

test('the sheep trough water surface remains visible at low and high levels', () => {
  const m = createRegionalModel('westerndistrict');
  for (const pond of [5, 90]) {
    updateFarm(m, [], {}, { pond, light: 70 }, 0, true);
    const water = m.farm.troughWater,
      top = water.pos[1] + water.size[1] / 2;
    assert.equal(water.surface, 'water');
    assert.ok(
      !m.objects
        .filter((o) => o.farmTrough)
        .some(
          (o) =>
            Math.abs(water.pos[0] - o.pos[0]) < o.size[0] / 2 &&
            Math.abs(water.pos[2] - o.pos[2]) < o.size[2] / 2 &&
            o.pos[1] + o.size[1] / 2 > top,
        ),
      'An opaque shell hides the water level',
    );
  }
});
