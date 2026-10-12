import { buildFacingBench } from './outdoor-seating.js';
import { buildChildrenPlayground } from './children-playground.js';
import { buildAreaBBQ } from './area-bbq.js';
import { buildTree } from './vegetation.js';
import { buildJudoDojo } from './judo-dojo.js';
import { buildBusDepot } from './bus-depot.js';
import { buildPoolChangingRooms, buildGymChangingRooms } from './changing-rooms.js';
import { buildWildlifeZoo } from './wildlife-zoo.js';
// Dedicated recreation plots in the next block of the town's shared street grid.
export const recreationLots = [
  {
    type: 'pool',
    name: 'Riverside swimming pool',
    resident: 'Alex Rivera',
    role: 'Lifeguard',
    x: 120,
    z: -24,
    w: 28,
    d: 30,
    height: 3,
    shadow: { dx: -8.5, dz: -12.6, w: 10.6, d: 4.4 },
  },
  {
    type: 'gym',
    name: 'Riverside gym',
    resident: 'Jordan Lee',
    role: 'Fitness instructor',
    x: 120,
    z: 24,
    w: 26,
    d: 28,
    height: 4,
  },
  {
    type: 'dojo',
    name: 'Riverside judo dojo',
    resident: 'Naomi Tanaka',
    role: 'Judo instructor',
    x: 168,
    z: 24,
    w: 28,
    d: 28,
    height: 4,
    stationX: 157,
    stationZ: 24,
  },
  {
    type: 'zoo',
    name: 'Riverside wildlife zoo',
    resident: 'Dr. Elena Rostova',
    role: 'Wildlife zoologist',
    x: 168,
    z: -24,
    w: 30,
    d: 30,
    height: 3.5,
    stationX: 156,
    stationZ: -24,
    district: 'Riverside wildlife district',
  },
  {
    type: 'busdepot',
    name: 'Riverside bus depot',
    resident: 'Morgan Patel',
    role: 'Depot manager',
    x: 168,
    z: -72,
    w: 28,
    d: 28,
    height: 4,
    stationX: 168,
    stationZ: -72,
  },
  {
    type: 'park',
    name: 'Riverside fountain park',
    resident: 'Sam Green',
    role: 'Park gardener',
    x: 120,
    z: 72,
    w: 28,
    d: 30,
    height: 1,
    stationX: 120,
    stationZ: 80,
  },
  {
    type: 'playground',
    playground: true,
    name: 'Riverside children’s playground',
    resident: 'Jamie Taylor',
    role: 'Playground caretaker',
    x: 111,
    z: -72,
    w: 12,
    d: 28,
    height: 3.2,
    stationX: 111,
    stationZ: -60,
  },
  {
    type: 'playground2',
    playground: true,
    name: 'Meadow children’s playground',
    district: 'Meadow play district',
    resident: 'Robin Ellis',
    role: 'Playground caretaker',
    x: 168,
    z: 72,
    w: 28,
    d: 30,
    height: 3.2,
    stationX: 168,
    stationZ: 84,
  },
  {
    type: 'basketball',
    name: 'Riverside basketball court',
    resident: 'Casey Brooks',
    role: 'Court coordinator',
    x: 127,
    z: -72,
    w: 16,
    d: 28,
    height: 1,
    stationX: 121,
    stationZ: -72,
  },
].map((b) => ({
  ...b,
  id: b.type,
  recreation: true,
  district: b.district ?? (b.type === 'park' ? 'Riverside park district' : 'Riverside recreation'),
}));

export function buildRecreationAreas(model, { sim, origin, box }) {
  const outdoor = (item) => {
    item.bbq = buildAreaBBQ(model, { b: item.building, origin });
    if (item.bbq) item.furniture.push(...item.bbq.parts);
    return item;
  };
  return sim.map.buildings
    .filter((b) => b.recreation)
    .map((b) => {
      if (b.type === 'zoo') return buildWildlifeZoo(model, { b, origin, box });
      if (b.type === 'dojo') return buildJudoDojo(model, { b, origin, box });
      if (b.type === 'busdepot') return buildBusDepot(model, { b, origin, box });
      if (b.playground) return outdoor(buildChildrenPlayground(model, { b, origin, box }));
      if (b.type === 'park' || b.type === 'basketball')
        return outdoor(buildOutdoorPlot(model, { b, origin, box }));
      const furniture = [];
      const add = (dx, y, dz, w, h, d, color, extra = {}) => {
        const mesh = box(b.x + dx, y, b.z + dz, w, h, d, color, {
          recreation: b.type,
          architectureMesh: true,
          roughness: 0.7,
          ...extra,
        });
        if (extra.recreationFurniture) furniture.push(mesh);
        return mesh;
      };
      const prop = (dx, y, dz, w, h, d, color, extra = {}) =>
        add(dx, y, dz, w, h, d, color, { recreationFurniture: true, surface: 'steel', ...extra });
      const seat = (x, z) =>
        buildFacingBench(model, {
          x,
          z,
          targetX: b.type === 'pool' ? 2 : 4,
          targetZ: 0,
          worldX: origin.x + b.x + x,
          worldZ: origin.z + b.z + z,
          add: prop,
        });
      if (b.type === 'pool') {
        // Four deck strips leave an actual opening over the basin.
        add(-9, 0.12, 0, 10, 0.15, b.d, '#deded2', { surface: 'tile' });
        add(11, 0.12, 0, 6, 0.15, b.d, '#deded2', { surface: 'tile' });
        for (const side of [-1, 1])
          add(2, 0.12, side * 12.25, 12, 0.15, 5.5, '#deded2', { surface: 'tile' });
      } else {
        add(0, 0.12, 0, b.w, 0.15, b.d, '#deded2', { surface: 'tile' });
        add(3, 0.21, -8, 16, 0.025, 5, '#668d96', { surface: 'fabric' });
        add(4, 0.21, 6, 12, 0.025, 4, '#7f9b8d', { surface: 'fabric' });
      }
      // West entrance opens directly onto the connected pavement; keep its central aisle clear.
      for (const side of [-1, 1]) {
        add(
          -b.w / 2,
          b.type === 'gym' ? 1.8 : 0.75,
          side * (b.d / 4 + 0.6),
          0.18,
          b.type === 'gym' ? 3.6 : 1.5,
          b.d / 2 - 1.2,
          '#809b9e',
          { solid: true },
        );
        add(
          0,
          b.type === 'gym' ? 1.8 : 0.75,
          (side * b.d) / 2,
          b.w,
          b.type === 'gym' ? 3.6 : 1.5,
          0.18,
          '#809b9e',
          { solid: true },
        );
      }
      add(
        b.w / 2,
        b.type === 'gym' ? 1.8 : 0.75,
        0,
        0.18,
        b.type === 'gym' ? 3.6 : 1.5,
        b.d,
        '#809b9e',
        { solid: true },
      );
      add(-b.w / 2 - 0.5, 2.9, 0, 1.5, 0.14, 3, '#526e7a');
      const lamp = add(-b.w / 2 + 0.5, 2.65, -2, 0.3, 0.3, 0.5, '#efdfa9', { emission: 0 });
      const indicator = prop(-9, 1.5, -3, 0.8, 0.6, 0.15, '#547572', { emission: 0 });
      prop(-9, 0.95, -4, 3, 0.15, 1.3, '#ae9671', { solid: true, surface: 'timber' });
      for (const dx of [-1.2, 1.2]) prop(-9 + dx, 0.55, -4, 0.1, 0.75, 1.1, '#677c80');
      if (b.type === 'pool') {
        // The water is recessed below the deck; a collider keeps walking on dry ground.
        add(2, -0.5, 0, 12, 1, 19, '#428aa0', { surface: 'tile' });
        const water = add(2, 0.055, 0, 11.6, 0.035, 18.6, '#55b9cc', {
          surface: 'water',
          roughness: 0.12,
          opacity: 0.88,
          poolWater: true,
          solid: true,
        });
        for (const dx of [-6.1, 6.1]) add(2 + dx, 0.22, 0, 0.35, 0.22, 19.6, '#f0ede2');
        for (const dz of [-9.6, 9.6]) add(2, 0.22, dz, 12.6, 0.22, 0.35, '#f0ede2');
        for (const dx of [-3, 0, 3]) {
          add(2 + dx, -0.01, 0, 0.12, 0.02, 18, '#28758b');
          for (let z = -8.7; z < 9; z += 1.2)
            prop(2 + dx + 1.5, 0.11, z, 0.1, 0.1, 0.65, z % 2 < 1 ? '#e2ede6' : '#db8363');
        }
        // Ladder handrails and steps, rescue equipment, lounge chairs and changing lockers.
        for (const dx of [-0.45, 0.45]) prop(7.4 + dx, 0.72, 8.7, 0.08, 1.2, 0.08, '#c7d0ce');
        for (const y of [-0.3, 0, 0.3]) prop(7.4, y, 8.7, 0.95, 0.07, 0.12, '#c7d0ce');
        for (const z of [-7, -2, 3, 8]) {
          prop(11, 0.5, z, 2.5, 0.12, 1.3, '#e5d9be', { solid: true, surface: 'fabric' });
          prop(12, 0.8, z, 0.12, 0.7, 1.3, '#e5d9be', {
            surface: 'fabric',
            rotation: [0, 0, -0.3],
          });
          for (const dz of [-0.5, 0.5]) prop(11, 0.31, z + dz, 2, 0.4, 0.07, '#677c80');
        }
        for (const x of [-9, -6]) seat(x, 12);
        buildPoolChangingRooms({ add, prop, model });
        prop(-7, 1.2, 7, 0.12, 2, 0.12, '#d17550');
        prop(-7, 2.1, 7, 1.2, 0.18, 1.1, '#e5d9be', { surface: 'fabric' });
        b.water = water;
      } else {
        const roof = add(0, 3.8, 0, b.w + 0.4, 0.2, b.d + 0.4, '#6d858b', {
          opacity: 0,
          cutawayOpacity: 0,
        });
        model.roofs.push(roof);
        add(0, 1.9, -b.d / 2 - 0.11, b.w - 2, 1.6, 0.04, '#88b5bf', {
          opacity: 0.65,
          surface: 'glass',
        });
        for (const x of [-3, 1, 5, 9]) {
          prop(x, 0.35, -8, 1.5, 0.25, 3.2, '#3b5058', { solid: true });
          prop(x, 1.05, -9.3, 1.4, 1.35, 0.1, '#98a7a6');
          prop(x, 1.6, -9.2, 1, 0.45, 0.15, '#5c9eaf');
          prop(x, 0.49, -7.8, 1.15, 0.04, 2.3, '#2f4148');
        }
        for (const x of [0, 4, 8]) {
          prop(x, 0.3, 6, 1.1, 0.16, 2, '#527985', { solid: true });
          prop(x, 0.8, 6, 0.18, 1, 0.18, '#91a5a8');
          prop(x, 1.25, 6.4, 0.65, 0.12, 0.45, '#364f59');
          prop(x, 1.4, 5.2, 0.8, 0.08, 0.1, '#91a5a8');
        }
        // Weight bench and a barbell with paired plates.
        prop(2, 0.65, 0, 2.8, 0.2, 0.8, '#587b8b', { solid: true, surface: 'fabric' });
        for (const dx of [-1, 1]) prop(2 + dx, 0.42, 0, 0.12, 0.45, 0.7, '#9eaca9');
        prop(2, 1.3, -1, 3.2, 0.09, 0.09, '#becac6');
        for (const dx of [-1.25, 1.25]) prop(2 + dx, 1.3, -1, 0.25, 0.65, 0.65, '#3b5058');
        prop(9, 0.85, 0, 1.4, 1.3, 3.5, '#72868b', { solid: true });
        for (const z of [-1, 0, 1]) prop(9, 1.3, z, 1.6, 0.25, 0.3, '#35464e');
        for (const x of [-6, -3, 0])
          prop(x, 0.23, 10, 1.4, 0.05, 2.4, '#8b9dad', { surface: 'fabric' });
        buildGymChangingRooms({ add, prop });
        seat(-6, 5);
        add(12.75, 1.9, 0, 0.035, 2.6, 7, '#a4c1c5', { surface: 'glass', opacity: 0.65 });
      }
      model.addActor(
        'recreation:' + b.type,
        origin.x + b.x - 8,
        origin.z + b.z - 1.5,
        '#5b9caf',
        '#c79878',
      );
      Object.assign(model.actors.at(-1), {
        community: true,
        name: b.resident,
        role: b.role,
        area: b.name,
        section: b.name,
      });
      return { building: b, lamp, indicator, sections: [], furniture };
    });
}

function buildOutdoorPlot(model, { b, origin, box }) {
  const furniture = [];
  let fountain = null;
  const add = (dx, y, dz, w, h, d, color, extra = {}) => {
    const mesh = box(b.x + dx, y, b.z + dz, w, h, d, color, {
      recreation: b.type,
      roughness: 0.8,
      ...extra,
    });
    furniture.push(mesh);
    return mesh;
  };
  const cylinder = (dx, y, dz, radius, h, color, extra = {}) => {
    const mesh = model.cylinder(origin.x + b.x + dx, y, origin.z + b.z + dz, radius, h, color, {
      community: true,
      recreation: b.type,
      roughness: 0.65,
      ...extra,
    });
    furniture.push(mesh);
    return mesh;
  };
  const bench = (x, z) =>
    buildFacingBench(model, {
      x,
      z,
      targetX: 0,
      targetZ: b.type === 'park' ? -2 : z,
      worldX: origin.x + b.x + x,
      worldZ: origin.z + b.z + z,
      add,
    });
  if (b.type === 'park') {
    add(0, 0.12, 0, b.w, 0.15, b.d, '#90ad78', { surface: 'grass' });
    add(0, 0.22, 8, 2, 0.06, 14, '#d5ceb8', { surface: 'stone' });
    for (const side of [-1, 1])
      add(side * 3.6, 0.22, -2, 1.25, 0.06, 19, '#d5ceb8', { surface: 'stone' });
    for (const z of [-11, 6]) add(0, 0.22, z, 8.5, 0.06, 1.25, '#d5ceb8', { surface: 'stone' });
    // Circular basin, raised rim, two bowls and a visible central water jet.
    cylinder(0, 0.35, -2, 2.5, 0.5, '#b6beb1', { surface: 'stone' });
    cylinder(0, 0.65, -2, 2.35, 0.18, '#d1d4c8', { surface: 'stone' });
    cylinder(0, 0.75, -2, 2.1, 0.04, '#5bbbc6', {
      surface: 'water',
      roughness: 0.12,
      fountainWater: true,
    });
    cylinder(0, 1.3, -2, 0.25, 1.1, '#adb9af', { surface: 'stone' });
    cylinder(0, 1.9, -2, 1, 0.15, '#c5ccc0', { surface: 'stone' });
    cylinder(0, 2.02, -2, 0.9, 0.04, '#68c7cf', { surface: 'water' });
    const jet = cylinder(0, 2.6, -2, 0.09, 1.2, '#90e1df', { opacity: 0.85, surface: 'water' });
    // Droplets: an inner ring arcs from the jet into the upper bowl, an outer ring spills from
    // the bowl's rim into the basin. Ripples spread across the basin.
    const droplet = () =>
      add(0, -20, -2, 0.1, 0.22, 0.1, '#d4f1f2', { surface: 'water', rounded: false });
    fountain = {
      centre: [origin.x + b.x, origin.z + b.z - 2],
      jet,
      inner: Array.from({ length: 14 }, droplet),
      outer: Array.from({ length: 22 }, droplet),
      ripples: Array.from({ length: 3 }, () =>
        cylinder(0, 0.775, -2, 0.3, 0.01, '#e8f8f8', { opacity: 0, surface: 'water' }),
      ),
    };
    model.colliders.push({ x: origin.x + b.x, z: origin.z + b.z - 2, w: 5, d: 5, community: true });
    for (const dz of [-10, 10]) for (const dx of [-6, 6]) bench(dx, dz);
    // Patio chairs and tables sit on the outer lawns, clear of the fountain loop.
    for (const side of [-1, 1]) {
      const x = side * 11.8,
        z = -1;
      add(x, 0.22, z, 4, 0.04, 4, '#d2c9b2', { surface: 'stone' });
      cylinder(x, 0.98, z, 0.68, 0.12, '#a88d65', { surface: 'timber' });
      cylinder(x, 0.62, z, 0.07, 0.7, '#677c80');
      cylinder(x, 0.29, z, 0.4, 0.09, '#677c80');
      model.colliders.push({
        x: origin.x + b.x + x,
        z: origin.z + b.z + z,
        w: 1.36,
        d: 1.36,
        community: true,
      });
      for (let i = 0; i < 4; i++) {
        const angle = (i * Math.PI) / 2,
          rotation = -angle - Math.PI / 2;
        const cx = x + Math.cos(angle) * 1.2,
          cz = z + Math.sin(angle) * 1.2;
        const chair = (dx, y, dz, w, h, d, color, extra = {}) =>
          add(
            cx + Math.cos(rotation) * dx + Math.sin(rotation) * dz,
            y,
            cz - Math.sin(rotation) * dx + Math.cos(rotation) * dz,
            w,
            h,
            d,
            color,
            { surface: 'timber', rotation: [0, rotation, 0], gardenChair: true, ...extra },
          );
        chair(0, 0.67, 0, 0.72, 0.12, 0.72, '#b39b78', {
          solid: true,
          outdoorSeatPart: 'seat',
          seatTarget: [origin.x + b.x + x, origin.z + b.z + z],
        });
        for (const dx of [-0.28, 0.28])
          for (const dz of [-0.28, 0.28])
            chair(dx, 0.44, dz, 0.06, 0.44, 0.06, '#677c80', { surface: 'steel' });
        for (const dy of [0.85, 1.05, 1.25]) chair(0, dy, -0.32, 0.72, 0.12, 0.07, '#b39b78');
        for (const dx of [-0.39, 0.39]) {
          chair(dx, 0.88, 0, 0.07, 0.07, 0.68, '#b39b78');
          chair(dx, 0.76, 0.22, 0.055, 0.24, 0.055, '#677c80', { surface: 'steel' });
        }
      }
      // Picnic tables have grounded legs and a bench on each side.
      const px = side * 7,
        pz = 6.3;
      for (let i = 0; i < 5; i++)
        add(px, 0.99, pz - 0.4 + i * 0.2, 2.5, 0.1, 0.17, '#ad926c', {
          surface: 'timber',
          solid: i === 2,
        });
      for (const dx of [-0.85, 0.85])
        add(px + dx, 0.62, pz, 0.12, 0.7, 1.9, '#738581', { surface: 'steel' });
      for (const dz of [-0.85, 0.85]) {
        add(px, 0.64, pz + dz, 2.7, 0.12, 0.38, '#ad926c', { solid: true, surface: 'timber' });
        for (const dx of [-0.85, 0.85])
          add(px + dx, 0.43, pz + dz, 0.09, 0.4, 0.32, '#738581', { surface: 'steel' });
      }
      if (side > 0) {
        cylinder(x, 1.55, z, 0.045, 2.6, '#677c80');
        const umbrella = model.mesh(
          'cone',
          [origin.x + b.x + x, 2.85, origin.z + b.z + z],
          [2.9, 0.45, 2.9],
          '#d6b787',
          { community: true, recreation: 'park', surface: 'fabric', roughness: 0.85 },
        );
        furniture.push(umbrella);
      }
    }
    for (const side of [-1, 1]) {
      const tree = buildTree(model, origin.x + b.x + side * 1.7, origin.z + b.z - 8, 0.65, {
        style: 'broadleaf',
        detailed: false,
        extra: { community: true, recreation: b.type },
      });
      furniture.push(...tree.parts);
      add(side * 1.7, 0.38, -8, 1.2, 0.4, 1.2, '#a2ae94', { solid: true, surface: 'stone' });
      // Tree-lined lawns belong entirely to the park's dedicated block.
      for (const z of [-10, -4, 2, 8]) {
        const tree = buildTree(model, origin.x + b.x + side * 10, origin.z + b.z + z, 0.9, {
          style: 'broadleaf',
          detailed: false,
          extra: { community: true, recreation: b.type },
        });
        furniture.push(...tree.parts);
        add(side * 10, 0.3, z, 1.5, 0.25, 1.5, '#a2ae94', { solid: true, surface: 'stone' });
      }
      bench(side * 9, 12);
      for (const z of [-5, 2]) {
        add(side * 7, 0.32, z, 2.2, 0.25, 3.8, '#b4b9a6', {
          solid: true,
          surface: 'stone',
          parkFlowerBed: true,
        });
        add(side * 7, 0.46, z, 1.95, 0.035, 3.55, '#796e53', { surface: 'soil' });
        const color = side < 0 ? (z < 0 ? '#dd93b0' : '#ac9bd1') : z < 0 ? '#e6be68' : '#df8d75';
        for (const dx of [-0.65, 0, 0.65])
          for (const dz of [-1.2, -0.4, 0.4, 1.2]) {
            const x = side * 7 + dx,
              flowerZ = z + dz;
            add(x, 0.69, flowerZ, 0.035, 0.45, 0.035, '#63865b');
            add(x + 0.08, 0.65, flowerZ, 0.22, 0.06, 0.08, '#719564', { rotation: [0, 0, 0.3] });
            for (let petal = 0; petal < 5; petal++) {
              const angle = (petal * Math.PI * 2) / 5;
              const mesh = model.sphere(
                origin.x + b.x + x + Math.cos(angle) * 0.1,
                0.95,
                origin.z + b.z + flowerZ + Math.sin(angle) * 0.1,
                0.09,
                color,
                { community: true, recreation: 'park', parkFlower: true, roughness: 0.85 },
              );
              furniture.push(mesh);
            }
            cylinder(x, 0.99, flowerZ, 0.055, 0.04, '#e9d694');
          }
      }
    }
    for (const x of [-7, 0, 7]) {
      const tree = buildTree(model, origin.x + b.x + x, origin.z + b.z - 13, 0.8, {
        style: 'broadleaf',
        detailed: false,
        extra: { community: true, recreation: 'park' },
      });
      furniture.push(...tree.parts);
      add(x, 0.3, -13, 1.3, 0.25, 1.3, '#a2ae94', { solid: true, surface: 'stone' });
    }
  } else {
    add(0, 0.12, 0, b.w, 0.15, b.d, '#628f92', { surface: 'asphalt' });
    add(0, 0.22, 0, 12, 0.025, 24, '#be886c', { surface: 'asphalt' });
    const line = (dx, dz, w, d) => add(dx, 0.245, dz, w, 0.016, d, '#f4eedc');
    for (const side of [-1, 1]) {
      line(side * 6, 0, 0.09, 24);
      line(0, side * 12, 12, 0.09);
    }
    line(0, 0, 12, 0.09);
    const arc = (x, z, radius, start, end) => {
      for (let i = 0; i < 32; i++) {
        const angle = start + ((end - start) * (i + 0.5)) / 32;
        add(
          x + Math.cos(angle) * radius,
          0.25,
          z + Math.sin(angle) * radius,
          (radius * (end - start)) / 32 + 0.025,
          0.016,
          0.07,
          '#f4eedc',
          { rotation: [0, -angle - Math.PI / 2, 0] },
        );
      }
    };
    arc(0, 0, 1.8, 0, Math.PI * 2);
    for (const side of [-1, 1]) {
      line(-2.3, side * 9.2, 0.09, 5.6);
      line(2.3, side * 9.2, 0.09, 5.6);
      line(0, side * 6.4, 4.6, 0.09);
      arc(0, side * 6.4, 1.8, side > 0 ? Math.PI : 0, side > 0 ? Math.PI * 2 : Math.PI);
      arc(0, side * 10.5, 5.5, side > 0 ? Math.PI : 0, side > 0 ? Math.PI * 2 : Math.PI);
      add(0, 1.75, side * 13, 0.18, 3.3, 0.18, '#657a83', { solid: true });
      add(0, 3, side * 11.6, 1.8, 1.1, 0.12, '#e3e9dc');
      add(0, 3, side * 11.51, 0.7, 0.5, 0.03, '#bc7356');
      const rim = model.mesh(
        'torus',
        [origin.x + b.x, 2.75, origin.z + b.z + side * 11.1],
        [0.55, 0.55, 0.55],
        '#d9834f',
        { community: true, recreation: b.type, roughness: 0.65 },
      );
      furniture.push(rim);
      for (let i = 0; i < 8; i++) {
        const angle = (Math.PI * i) / 4;
        add(
          Math.cos(angle) * 0.24,
          2.5,
          side * 11.1 + Math.sin(angle) * 0.24,
          0.025,
          0.5,
          0.025,
          '#e7e5d5',
        );
      }
    }
    for (const z of [-5, 5]) bench(7, z);
  }
  const lamp = add(-b.w / 2 + 0.5, 2.8, 11.5, 0.3, 0.3, 0.3, '#efdfa9', { emission: 0 });
  add(-b.w / 2 + 0.5, 1.5, 11.5, 0.1, 2.8, 0.1, '#657a83', { solid: true });
  const indicator = add(-b.w / 2 + 0.5, 1.2, 8, 0.3, 0.7, 0.5, '#547572', {
    solid: true,
    emission: 0,
  });
  model.addActor(
    'recreation:' + b.type,
    origin.x + b.stationX + 1,
    origin.z + b.stationZ + 1,
    '#86a482',
    '#c79878',
  );
  Object.assign(model.actors.at(-1), {
    community: true,
    name: b.resident,
    role: b.role,
    area: b.name,
    section: b.name,
  });
  return { building: b, lamp, indicator, sections: [], furniture, fountain };
}

// The park fountain: a pulsing central jet, droplets cascading into the bowl and the basin, and
// ripples spreading out. Reduced motion keeps a still jet with no moving droplets.
export function updateFountain(f, time, reduced) {
  if (!f) return;
  const t = reduced ? 0 : time,
    [cx, cz] = f.centre;
  const pulse = 0.88 + 0.12 * Math.sin(t * 2.3) + 0.05 * Math.sin(t * 5.1);
  f.jet.size[1] = 1.2 * pulse;
  f.jet.pos[1] = 2.05 + (1.2 * pulse) / 2;
  const top = 2.05 + 1.2 * pulse;
  const place = (d, r, y, angle) => {
    d.pos = [cx + Math.cos(angle) * r, y, cz + Math.sin(angle) * r];
    d.opacity = reduced ? 0 : 1;
  };
  f.inner.forEach((d, i) => {
    const s = (t * 1.4 + i / f.inner.length) % 1;
    place(d, 0.85 * s, top + 0.5 * s - (top + 0.5 - 2.08) * s * s, i * 2.39996);
  });
  f.outer.forEach((d, i) => {
    const s = (t * 1.1 + i / f.outer.length) % 1;
    place(d, 0.95 + 1.05 * s, 2.0 + 0.18 * s - 1.4 * s * s, i * 2.39996);
  });
  f.ripples.forEach((ring, i) => {
    const s = (t * 0.35 + i / f.ripples.length) % 1,
      r = 0.4 + 1.6 * s;
    ring.size = [r * 2, 0.01, r * 2];
    ring.opacity = reduced ? 0 : 0.45 * (1 - s);
  });
}
