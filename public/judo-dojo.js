import { buildFacingBench } from './outdoor-seating.js';

export function buildJudoDojo(model, { b, origin, box }) {
  const furniture = [];
  const add = (x, y, z, w, h, d, color, extra = {}) => {
    const mesh = box(b.x + x, y, b.z + z, w, h, d, color, {
      recreation: 'dojo',
      architectureMesh: true,
      roughness: 0.8,
      ...extra,
    });
    furniture.push(mesh);
    return mesh;
  };
  const prop = (x, y, z, w, h, d, color, extra = {}) =>
    add(x, y, z, w, h, d, color, { recreationFurniture: true, ...extra });
  add(0, 0.12, 0, b.w, 0.15, b.d, '#d3c7ae', { surface: 'timber' });
  // An open west doorway joins the pavement; the reception aisle stays clear.
  for (const side of [-1, 1]) {
    add(-14, 1.9, side * 7.8, 0.18, 3.4, 12.4, '#d5d4be', { solid: true });
    add(0, 1.9, side * 14, 28, 3.4, 0.18, '#d5d4be', { solid: true });
  }
  add(14, 1.9, 0, 0.18, 3.4, 28, '#d5d4be', { solid: true });
  const roof = add(0, 3.75, 0, 28.4, 0.25, 28.4, '#536d79', { opacity: 0, cutawayOpacity: 0 });
  model.roofs.push(roof);
  add(-14.5, 2.95, 0, 1.4, 0.15, 3.8, '#536d79');
  add(-14.12, 2.5, -4, 0.1, 0.9, 3, '#476d77');
  // A 14-metre tatami area has a red safety border around green practice mats.
  const mat = { x: origin.x + b.x + 1, z: origin.z + b.z - 2, w: 14, d: 14 };
  for (let ix = 0; ix < 7; ix++)
    for (let iz = 0; iz < 7; iz++) {
      const border = ix === 0 || ix === 6 || iz === 0 || iz === 6;
      prop(
        -5 + ix * 2,
        0.23,
        -8 + iz * 2,
        1.97,
        0.08,
        1.97,
        border ? '#b97770' : (ix + iz) % 2 ? '#8ca98b' : '#9eb697',
        { surface: 'fabric', dojoMat: true, dojoMatBorder: border },
      );
    }
  // Wall padding, equipment shelving and a traditional display at the front.
  for (const z of [-8, -5, -2, 1, 4])
    prop(13.7, 1.15, z, 0.22, 1.8, 2.8, '#8ca98b', { surface: 'fabric' });
  prop(1, 1.9, -13.75, 7, 1.7, 0.12, '#a88f65', { surface: 'timber' });
  prop(1, 1.9, -13.66, 5.7, 1.35, 0.08, '#e6dcc6', { surface: 'fabric' });
  prop(1, 2.05, -13.6, 0.18, 0.7, 0.05, '#516367');
  prop(1, 1.8, -13.6, 0.8, 0.1, 0.05, '#516367');
  prop(11, 1.1, -11.5, 3, 1.8, 1.2, '#ad9570', { solid: true, surface: 'timber' });
  for (const x of [10.1, 11, 11.9])
    prop(x, 1.85, -11.5, 0.6, 0.25, 0.8, '#e0d8c5', { surface: 'fabric' });
  // Changing bay: privacy screen with a central doorway, lockers and benches.
  for (const [x, w] of [
    [-5.5, 17],
    [11.5, 5],
  ])
    add(x, 1.35, 8.5, w, 2.3, 0.15, '#b6beb0', { solid: true });
  for (const x of [-10, -7, -4, 2, 5, 8, 11]) {
    prop(x, 1.25, 12.8, 2.2, 2.1, 1.1, '#829a9c', { solid: true, dojoLocker: true });
    prop(x, 1.25, 12.21, 0.04, 2, 0.035, '#cdd5c8');
    prop(x + 0.4, 1.4, 12.18, 0.08, 0.22, 0.05, '#536d79');
  }
  for (const x of [-7, 5])
    buildFacingBench(model, {
      x,
      z: 10.3,
      targetX: x,
      targetZ: 12.8,
      worldX: origin.x + b.x + x,
      worldZ: origin.z + b.z + 10.3,
      add: prop,
      length: 3,
    });
  prop(-11.3, 0.8, -5.5, 2.5, 1.2, 1.5, '#ae9671', { solid: true, surface: 'timber' });
  prop(-11.3, 1.47, -5.5, 0.9, 0.2, 0.5, '#526c76');
  prop(-11.5, 0.65, 4.5, 2, 1, 1, '#ae9671', {
    solid: true,
    surface: 'timber',
    dojoShoeRack: true,
  });
  for (const x of [-12, -11.3]) prop(x, 1.23, 4.5, 0.4, 0.15, 0.7, '#637680');
  const lamp = add(-11, 3.25, 0, 1.8, 0.1, 0.5, '#eadeb6', { emission: 0 });
  const indicator = prop(-11.3, 1.9, -6.3, 0.6, 0.4, 0.12, '#547572', { emission: 0 });
  const judoka = (id, name, role, x, z, heading, belt, skin) => {
    model.addActor(id, origin.x + b.x + x, origin.z + b.z + z, '#e7e4d9', skin);
    const actor = model.actors.at(-1);
    Object.assign(actor, {
      community: true,
      name,
      role,
      area: b.name,
      section: b.name,
      heading,
      judoka: true,
    });
    for (const part of actor.parts) {
      if (part.limb === 'leg') part.color = '#e7e4d9';
      if (part.shape === 'box' && part.local[1] === 0.11) part.color = skin;
    }
    const detail = (pos, size, color) => {
      const mesh = model.mesh('box', [...pos], size, color, {
        actor: id,
        local: [...pos],
        surface: 'fabric',
        dojoUniform: true,
      });
      actor.parts.push(mesh);
    };
    detail([0, 0.64, 0], [0.46, 0.065, 0.31], belt);
    detail([0.04, 0.53, 0.17], [0.07, 0.2, 0.035], belt);
    detail([0, 0.91, 0.15], [0.04, 0.28, 0.025], '#c9c6b7');
    return actor;
  };
  const instructor = judoka('recreation:dojo', b.resident, b.role, 1, -7, 0, '#343d42', '#c79878');
  const students = [
    [-2, -3, 'Ava Chen'],
    [4, -3, 'Leo Martin'],
    [-2, 1, 'Mia Patel'],
    [4, 1, 'Noah Brooks'],
  ].map(([x, z, name], i) =>
    judoka(
      'dojo:student:' + i,
      name,
      'Judo student',
      x,
      z,
      Math.atan2(1 - x, -7 - z),
      i < 2 ? '#eee5d1' : '#d9b95c',
      i % 2 ? '#a77d5e' : '#d2aa87',
    ),
  );
  return { building: b, lamp, indicator, sections: [], furniture, mat, instructor, students };
}
