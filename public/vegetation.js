// Shared, lightweight botanical forms. Near plants use actual curved leaf blades;
// distant crowns use irregular meshes so orchards do not need thousands of leaves.
export function branch(model, from, to, radius, color, extra = {}) {
  const dx = to[0] - from[0],
    dy = to[1] - from[1],
    dz = to[2] - from[2],
    length = Math.hypot(dx, dy, dz);
  return model.mesh(
    'cylinder',
    from.map((v, i) => (v + to[i]) / 2),
    [radius * 2, length, radius * 2],
    color,
    {
      ...extra,
      roughness: 0.95,
      rotation: [Math.atan2(Math.hypot(dx, dz), dy), Math.atan2(dx, dz), 0],
    },
  );
}

export function buildCrop(model, x, z, scale = 1, rootHeight = 0.47) {
  const parts = [],
    leaves = [],
    fruits = [];
  const add = (shape, pos, size, color, extra = {}) => {
    const m = model.mesh(shape, pos, size, color, {
      vegetation: 'crop',
      roughness: 0.95,
      ...extra,
    });
    parts.push(m);
    return m;
  };
  const stem = add(
    'cylinder',
    [x, rootHeight + 0.57 * scale, z],
    [0.048 * scale, 1.14 * scale, 0.048 * scale],
    '#6d8952',
  );
  const offset = (x * 1.37 + z * 0.73) % 6.28;
  for (let i = 0; i < 6; i++) {
    const angle = offset + i * 2.4,
      height = rootHeight + (0.24 + i * 0.13) * scale,
      end = [
        x + Math.cos(angle) * 0.21 * scale,
        height + 0.06 * scale,
        z + Math.sin(angle) * 0.21 * scale,
      ];
    parts.push(
      branch(model, [x, height, z], end, 0.012 * scale, '#728e50', { vegetation: 'crop' }),
    );
    const leaf = add(
      'leaf',
      [end[0] + Math.cos(angle) * 0.17 * scale, end[1], end[2] + Math.sin(angle) * 0.17 * scale],
      [(0.47 + (i % 2) * 0.06) * scale, 0.35 * scale, 0.23 * scale],
      i % 2 ? '#769954' : '#658b4e',
      { rotation: [0, -angle, 0.12 + (i % 2) * 0.08] },
    );
    leaf.restTilt = leaf.rotation[2];
    leaves.push(leaf);
  }
  for (let i = 0; i < 3; i++) {
    const angle = offset + i * 2.1,
      height = rootHeight + (0.79 + i * 0.08) * scale,
      end = [x + Math.cos(angle) * 0.16 * scale, height, z + Math.sin(angle) * 0.16 * scale];
    parts.push(
      branch(model, [x, height + 0.06 * scale, z], end, 0.008 * scale, '#72854d', {
        vegetation: 'crop',
      }),
    );
    const fruit = add(
      'sphere',
      [end[0], end[1] - 0.08 * scale, end[2]],
      [0.18 * scale, 0.19 * scale, 0.18 * scale],
      '#c47856',
      { fruit: true },
    );
    fruits.push(fruit);
    add(
      'leaf',
      [end[0], end[1] + 0.014 * scale, end[2]],
      [0.1 * scale, 0.12 * scale, 0.04 * scale],
      '#667d42',
      { rotation: [0, angle, 0] },
    );
  }
  return { stem, leaves, fruit: fruits[0], fruits, parts, base: scale };
}

export function buildTree(
  model,
  x,
  z,
  scale = 1,
  {
    style = 'broadleaf',
    foliage = ['#66875e', '#76976a', '#839e72'],
    detailed = true,
    fruit = false,
    extra = {},
  } = {},
) {
  const parts = [];
  const add = (shape, position, size, color, props = {}) => {
    const m = model.mesh(shape, position, size, color, {
      vegetation: 'tree',
      roughness: 1,
      ...extra,
      ...props,
    });
    parts.push(m);
    return m;
  };
  const base = [x, 0, z],
    height = (style === 'fruit' ? 2.2 : 3.3) * scale,
    crownBase = height * 0.63,
    bark = style === 'eucalypt' ? '#a79b82' : '#8e785c';
  add('cone', [x, height * 0.37, z], [0.3 * scale, height * 0.74, 0.3 * scale], bark);
  if (detailed)
    for (let i = 0; i < 3; i++) {
      const a = (i * Math.PI * 2) / 3;
      parts.push(
        branch(
          model,
          [x, 0.19 * scale, z],
          [x + Math.cos(a) * 0.34 * scale, 0.025, z + Math.sin(a) * 0.34 * scale],
          0.045 * scale,
          bark,
          { vegetation: 'tree', ...extra },
        ),
      );
    }
  if (style === 'palm') {
    add('cylinder', [x, height * 0.55, z], [0.18 * scale, height * 1.1, 0.18 * scale], bark);
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      add(
        'leaf',
        [x + Math.cos(a) * 0.8 * scale, height + 0.1 * scale, z + Math.sin(a) * 0.8 * scale],
        [2.1 * scale, 0.65 * scale, 0.46 * scale],
        foliage[i % foliage.length],
        { rotation: [0, -a, -0.12] },
      );
    }
  } else if (style === 'conifer') {
    for (let i = 0; i < 4; i++) {
      const w = (2.2 - i * 0.4) * scale,
        y = (1.35 + i * 0.6) * scale;
      add('cone', [x, y, z], [w, 1.65 * scale, w], foliage[i % foliage.length], {
        rotation: [0, i * 0.7, 0],
      });
    }
  } else {
    const clusters = detailed ? 4 : 3;
    for (let i = 0; i < clusters; i++) {
      const angle = i * 2.4 + (x + z) * 0.11,
        reach = (style === 'eucalypt' ? 0.8 : 0.58) * scale,
        end = [
          x + Math.cos(angle) * reach,
          crownBase + (i % 2) * 0.49 * scale,
          z + Math.sin(angle) * reach,
        ];
      parts.push(
        branch(model, [x, height * 0.43, z], end, 0.045 * scale, bark, {
          vegetation: 'tree',
          ...extra,
        }),
      );
      const size =
        style === 'eucalypt'
          ? [1.6, 1.15, 1.55]
          : style === 'fruit'
            ? [1.48, 1.1, 1.45]
            : [1.95, 1.65, 1.9];
      add(
        'foliage',
        [end[0], end[1] + 0.4 * scale, end[2]],
        size.map((v) => v * scale),
        foliage[i % foliage.length],
        { rotation: [0, angle, 0] },
      );
      if (detailed)
        for (let j = 0; j < 2; j++)
          add(
            'leaf',
            [
              end[0] + Math.cos(angle + j) * 0.73 * scale,
              end[1] + (j ? 0.31 : 0.7) * scale,
              end[2] + Math.sin(angle + j) * 0.73 * scale,
            ],
            [0.48 * scale, 0.3 * scale, style === 'eucalypt' ? 0.12 * scale : 0.23 * scale],
            foliage[(i + j) % foliage.length],
            { rotation: [0, -angle - j, 0.15] },
          );
    }
  }
  if (fruit)
    for (let i = 0; i < 5; i++) {
      const a = i * 1.25;
      add(
        'sphere',
        [
          x + Math.cos(a) * 0.7 * scale,
          1.53 * scale + (i % 2) * 0.3 * scale,
          z + Math.sin(a) * 0.7 * scale,
        ],
        [0.19 * scale, 0.21 * scale, 0.19 * scale],
        '#bf7354',
        { treeFruit: true },
      );
    }
  return { parts, base, style };
}
