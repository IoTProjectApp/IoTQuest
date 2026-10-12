// All furniture and seated pupils use the same metre-scale geometry as the school.
export function furnishClassroom(add, { type, x, z, index }) {
  const students = [];
  const detail = (px, y, pz, w, h, d, color, extra = {}) =>
    add(px, y, pz, w, h, d, color, {
      civicSection: type,
      classroomDetail: true,
      architectureMesh: false,
      surface: 'timber',
      ...extra,
    });
  // Blackboard frame, chalk tray and a simple arithmetic lesson face the pupils.
  for (const dz of [-1.34, 1.34]) detail(x + 8.56, 2, z + dz, 0.12, 1.6, 0.08, '#a48c65');
  for (const y of [1.23, 2.77]) detail(x + 8.56, y, z, 0.12, 0.08, 2.75, '#a48c65');
  detail(x + 8.4, 1.18, z, 0.35, 0.06, 2.75, '#83948c', { surface: 'steel' });
  const chalk = (y, dz, h, d) =>
    detail(x + 8.585, y, z + dz, 0.012, h, d, '#dfebd8', { surface: 'plain' });
  chalk(2.2, -0.9, 0.4, 0.035);
  chalk(2.2, -0.5, 0.035, 0.24);
  chalk(2.2, -0.5, 0.24, 0.035);
  chalk(2.2, -0.12, 0.4, 0.035);
  for (const y of [2.12, 2.28]) chalk(y, 0.25, 0.035, 0.24);
  // "2" is built from five chalk strokes rather than a downloaded texture.
  for (const y of [2.4, 2.2, 2]) chalk(y, 0.78, 0.035, 0.28);
  chalk(2.3, 0.91, 0.2, 0.035);
  chalk(2.1, 0.65, 0.2, 0.035);
  detail(x + 3.5, 0.68, z - 1.94, 1.8, 0.85, 0.27, '#a89270', { solid: true });
  for (const y of [0.3, 0.65, 1.08]) detail(x + 3.5, y, z - 1.91, 1.9, 0.045, 0.32, '#806d54');
  for (let i = 0; i < 7; i++)
    detail(
      x + 2.85 + i * 0.2,
      0.84,
      z - 1.76,
      0.12,
      0.33,
      0.12,
      ['#6e929a', '#b88665', '#88986d'][i % 3],
      { surface: 'fabric' },
    );
  const table = (px, pz, seat) => {
    const extra = { civicSection: type, schoolTable: type + ':' + seat };
    add(px, 0.96, pz, 0.85, 0.09, 1.3, '#bd9f74', { ...extra, solid: true });
    for (const dx of [-0.32, 0.32])
      for (const dz of [-0.5, 0.5])
        add(px + dx, 0.58, pz + dz, 0.055, 0.67, 0.055, '#728087', extra);
    add(px + 0.12, 1.025, pz, 0.4, 0.04, 0.3, '#e8e2ce', { ...extra, schoolNotebook: true });
    add(px + 0.1, 1.05, pz + 0.22, 0.26, 0.025, 0.025, '#caaf63', extra);
  };
  const chair = (px, pz, seat) => {
    const extra = { civicSection: type, schoolChair: type + ':' + seat };
    const color = ['#7696a5', '#859f78', '#9487a6'][index];
    add(px, 0.63, pz, 0.65, 0.1, 0.65, color, { ...extra, solid: true });
    add(px - 0.27, 0.91, pz, 0.08, 0.5, 0.65, color, extra);
    for (const dx of [-0.25, 0.25])
      for (const dz of [-0.25, 0.25])
        add(px + dx, 0.42, pz + dz, 0.045, 0.33, 0.045, '#697982', extra);
  };
  const student = (px, pz, seat) => {
    const id = type + ':student:' + seat,
      parts = [];
    const skin = ['#d3ac89', '#a97e60', '#e2c3a0', '#8f6652'][(seat + index) % 4];
    const shirt = ['#7995b4', '#a48aba', '#7c9d8c', '#bc927a'][seat];
    const part = (dx, y, dz, w, h, d, color, extra = {}) => {
      const mesh = add(px + dx, y + 0.0375, pz + dz, w, h, d, color, {
        civicSection: type,
        classroomStudent: id,
        ...extra,
      });
      parts.push(mesh);
      return mesh;
    };
    part(0, 0.92, 0, 0.25, 0.43, 0.36, shirt);
    part(0.02, 1.31, 0, 0.31, 0.34, 0.31, skin, { rounded: true });
    part(-0.015, 1.48, 0, 0.34, 0.12, 0.33, seat % 2 ? '#695744' : '#473f3a', { rounded: true });
    for (const side of [-1, 1]) {
      part(0.182, 1.345, side * 0.065, 0.018, 0.04, 0.05, '#ecebe1');
      part(0.195, 1.345, side * 0.065, 0.012, 0.026, 0.02, '#35413d');
      // Elbows bend forward; hands rest at the edge of the table.
      part(0.1, 1.035, side * 0.22, 0.12, 0.23, 0.11, shirt);
      part(0.35, 0.97, side * 0.22, 0.4, 0.1, 0.11, shirt);
      part(0.57, 0.99, side * 0.22, 0.12, 0.09, 0.12, skin, { rounded: true });
      // Thighs are horizontal, knees bent, and shoes rest on the classroom floor.
      part(0.16, 0.695, side * 0.1, 0.43, 0.14, 0.14, '#566879');
      part(0.365, 0.44, side * 0.1, 0.14, 0.43, 0.14, '#566879');
      part(0.46, 0.255, side * 0.1, 0.26, 0.08, 0.16, '#37464d');
    }
    part(0.195, 1.285, 0, 0.05, 0.06, 0.06, skin, { rounded: true });
    part(0.182, 1.23, 0, 0.015, 0.02, 0.06, '#9b6d5c');
    students.push({ id, x: px, z: pz, seated: true, parts });
  };
  for (const [column, dx] of [1.6, 5.3].entries())
    for (const [row, dz] of [-1.1, 1.1].entries()) {
      const seat = column * 2 + row;
      chair(x + dx, z + dz, seat);
      table(x + dx + 0.9, z + dz, seat);
      student(x + dx, z + dz, seat);
    }
  return students;
}
