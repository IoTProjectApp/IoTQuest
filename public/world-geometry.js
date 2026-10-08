export function geometry(shape) {
  const p = [],
    n = [];
  const triangle = (a, b, c, normal = null) => {
    for (const v of [a, b, c]) {
      p.push(...v);
      n.push(...(normal || v));
    }
  };
  const smoothTriangle = (vertices, normals) => {
    for (let i = 0; i < 3; i++) {
      p.push(...vertices[i]);
      n.push(...normals[i]);
    }
  };
  if (shape === 'leaf') {
    const along = 12,
      around = 12;
    const vertex = (i, j) => {
      const t = i / along,
        a = (j / around) * Math.PI * 2,
        s = Math.sin(t * Math.PI),
        profile = Math.pow(Math.max(0, s), 0.8),
        derivative = 0.8 * Math.PI * Math.cos(t * Math.PI) * Math.pow(Math.max(0.0001, s), -0.2),
        yPrime = 0.1 * Math.PI * Math.cos(t * Math.PI) + 0.035 * derivative * Math.sin(a),
        zPrime = 0.5 * derivative * Math.cos(a),
        ya = 0.035 * profile * Math.cos(a),
        za = -0.5 * profile * Math.sin(a),
        normal =
          i === 0 ? [-1, 0, 0] : i === along ? [1, 0, 0] : [yPrime * za - zPrime * ya, -za, ya],
        length = Math.hypot(...normal);
      return {
        point: [t - 0.5, 0.1 * s + 0.035 * profile * Math.sin(a), 0.5 * profile * Math.cos(a)],
        normal: normal.map((n) => n / length),
      };
    };
    for (let i = 0; i < along; i++)
      for (let j = 0; j < around; j++) {
        const q = [vertex(i, j), vertex(i + 1, j), vertex(i + 1, j + 1), vertex(i, j + 1)];
        const triangles = [];
        if (i < along - 1) triangles.push([0, 1, 2]);
        if (i > 0) triangles.push([0, 2, 3]);
        // At each pole retain the one non-degenerate triangle.
        if (i === 0) {
          triangles.length = 0;
          triangles.push([0, 1, 2]);
        }
        if (i === along - 1) {
          triangles.length = 0;
          triangles.push([0, 2, 3]);
        }
        for (const indices of triangles) {
          const vertices = indices.map((k) => q[k].point),
            normals = indices.map((k) => q[k].normal);
          if (i === 0 || i === along - 1) {
            const u = vertices[1].map((v, k) => v - vertices[0][k]),
              v = vertices[2].map((v, k) => v - vertices[0][k]),
              face = [
                u[1] * v[2] - u[2] * v[1],
                u[2] * v[0] - u[0] * v[2],
                u[0] * v[1] - u[1] * v[0],
              ],
              length = Math.hypot(...face);
            for (let k = 0; k < 3; k++)
              if (Math.abs(vertices[k][0]) === 0.5) normals[k] = face.map((n) => n / length);
          }
          smoothTriangle(vertices, normals);
        }
      }
  } else if (shape === 'mountain') {
    // A smooth, asymmetric height field with multiple ridges and a low perimeter.
    // Shared vertices have analytic-gradient normals for continuous shading.
    const steps = 20;
    const height = (x, z) => {
      const edge = Math.max(0, 1 - 4 * x * x) * Math.max(0, 1 - 4 * z * z);
      const ridges =
        0.72 * Math.exp(-((x + 0.07) ** 2 * 10 + (z - 0.04) ** 2 * 12)) +
        0.28 * Math.exp(-((x - 0.18) ** 2 * 28 + (z + 0.12) ** 2 * 22));
      return Math.min(1, edge * ridges * (1 + 0.08 * Math.sin(x * 21 + z * 13)));
    };
    const vertex = (i, j) => {
      const x = i / steps - 0.5,
        z = j / steps - 0.5,
        epsilon = 0.001,
        dx = (height(x + epsilon, z) - height(x - epsilon, z)) / (epsilon * 2),
        dz = (height(x, z + epsilon) - height(x, z - epsilon)) / (epsilon * 2),
        length = Math.hypot(dx, 1, dz);
      return {
        point: [x, height(x, z) - 0.5, z],
        normal: [-dx / length, 1 / length, -dz / length],
      };
    };
    for (let i = 0; i < steps; i++)
      for (let j = 0; j < steps; j++) {
        const q = [vertex(i, j), vertex(i, j + 1), vertex(i + 1, j + 1), vertex(i + 1, j)];
        for (const indices of [
          [0, 1, 2],
          [0, 2, 3],
        ])
          smoothTriangle(
            indices.map((k) => q[k].point),
            indices.map((k) => q[k].normal),
          );
      }
  } else if (shape === 'roundedBox') {
    // A shared bevelled cube: flat face centres, three curved bands at each edge.
    // Project a subdivided cube onto its inset core plus a spherical bevel.
    const core = 0.445,
      radius = 0.5 - core,
      steps = [-0.5, -0.484, -core, core, 0.484, 0.5];
    const vertex = (axis, side, u, v) => {
      const q = [0, 0, 0];
      q[axis] = side * 0.5;
      q[(axis + 1) % 3] = u;
      q[(axis + 2) % 3] = v;
      const base = q.map((x) => Math.max(-core, Math.min(core, x))),
        delta = q.map((x, i) => x - base[i]),
        length = Math.hypot(...delta),
        normal = delta.map((x) => x / length);
      return { point: base.map((x, i) => x + normal[i] * radius), normal };
    };
    for (let axis = 0; axis < 3; axis++)
      for (const side of [-1, 1])
        for (let i = 0; i < steps.length - 1; i++)
          for (let j = 0; j < steps.length - 1; j++) {
            const quad = [
              vertex(axis, side, steps[i], steps[j]),
              vertex(axis, side, steps[i + 1], steps[j]),
              vertex(axis, side, steps[i + 1], steps[j + 1]),
              vertex(axis, side, steps[i], steps[j + 1]),
            ];
            for (const indices of side > 0
              ? [
                  [0, 1, 2],
                  [0, 2, 3],
                ]
              : [
                  [0, 2, 1],
                  [0, 3, 2],
                ])
              smoothTriangle(
                indices.map((k) => quad[k].point),
                indices.map((k) => quad[k].normal),
              );
          }
  } else if (shape === 'torus') {
    const segments = 32,
      rings = 12;
    const vertex = (i, j) => {
      const a = (i / segments) * Math.PI * 2,
        b = (j / rings) * Math.PI * 2,
        radius = 0.38 + Math.cos(b) * 0.12;
      return {
        point: [Math.cos(a) * radius, Math.sin(b) * 0.12, Math.sin(a) * radius],
        normal: [Math.cos(a) * Math.cos(b), Math.sin(b), Math.sin(a) * Math.cos(b)],
      };
    };
    for (let i = 0; i < segments; i++)
      for (let j = 0; j < rings; j++) {
        const q = [vertex(i, j), vertex(i + 1, j), vertex(i + 1, j + 1), vertex(i, j + 1)];
        for (const indices of [
          [0, 2, 1],
          [0, 3, 2],
        ])
          smoothTriangle(
            indices.map((k) => q[k].point),
            indices.map((k) => q[k].normal),
          );
      }
  } else if (['bowl', 'vase', 'shade'].includes(shape)) {
    // Revolved cross sections include the inside surface and rim: these objects
    // are hollow, rather than solid cylinders with a coloured disc on top.
    const profiles = {
      bowl: [
        [0, -0.5],
        [0.22, -0.5],
        [0.35, -0.3],
        [0.46, 0.05],
        [0.5, 0.5],
        [0.44, 0.5],
        [0.4, 0.1],
        [0.29, -0.25],
        [0, -0.32],
      ],
      vase: [
        [0, -0.5],
        [0.26, -0.5],
        [0.43, -0.3],
        [0.5, 0],
        [0.38, 0.25],
        [0.22, 0.4],
        [0.22, 0.5],
        [0.17, 0.5],
        [0.17, 0.38],
        [0.31, 0.2],
        [0.42, 0],
        [0.35, -0.25],
        [0, -0.4],
      ],
      shade: [
        [0.5, -0.5],
        [0.3, 0.5],
        [0.27, 0.5],
        [0.47, -0.5],
        [0.5, -0.5],
      ],
    };
    const profile = profiles[shape],
      sides = 32;
    for (let k = 0; k < profile.length - 1; k++) {
      const [r0, y0] = profile[k],
        [r1, y1] = profile[k + 1],
        dr = r1 - r0,
        dy = y1 - y0,
        length = Math.hypot(dr, dy);
      const vertex = (r, y, a) => [r * Math.cos(a), y, r * Math.sin(a)];
      const normal = (a) => [
        (dy / length) * Math.cos(a),
        -dr / length,
        (dy / length) * Math.sin(a),
      ];
      for (let i = 0; i < sides; i++) {
        const a = (i / sides) * Math.PI * 2,
          b = ((i + 1) / sides) * Math.PI * 2,
          lo = vertex(r0, y0, a),
          hi = vertex(r1, y1, a),
          lo2 = vertex(r0, y0, b),
          hi2 = vertex(r1, y1, b);
        if (r0 > 0) smoothTriangle([lo, hi, lo2], [normal(a), normal(a), normal(b)]);
        if (r1 > 0) smoothTriangle([lo2, hi, hi2], [normal(b), normal(a), normal(b)]);
      }
    }
  } else if (shape === 'box') {
    const faces = [
      [
        [1, 0, 0],
        [
          [0.5, -0.5, -0.5],
          [0.5, 0.5, -0.5],
          [0.5, 0.5, 0.5],
          [0.5, -0.5, 0.5],
        ],
      ],
      [
        [-1, 0, 0],
        [
          [-0.5, -0.5, 0.5],
          [-0.5, 0.5, 0.5],
          [-0.5, 0.5, -0.5],
          [-0.5, -0.5, -0.5],
        ],
      ],
      [
        [0, 1, 0],
        [
          [-0.5, 0.5, -0.5],
          [-0.5, 0.5, 0.5],
          [0.5, 0.5, 0.5],
          [0.5, 0.5, -0.5],
        ],
      ],
      [
        [0, -1, 0],
        [
          [-0.5, -0.5, 0.5],
          [-0.5, -0.5, -0.5],
          [0.5, -0.5, -0.5],
          [0.5, -0.5, 0.5],
        ],
      ],
      [
        [0, 0, 1],
        [
          [0.5, -0.5, 0.5],
          [0.5, 0.5, 0.5],
          [-0.5, 0.5, 0.5],
          [-0.5, -0.5, 0.5],
        ],
      ],
      [
        [0, 0, -1],
        [
          [-0.5, -0.5, -0.5],
          [-0.5, 0.5, -0.5],
          [0.5, 0.5, -0.5],
          [0.5, -0.5, -0.5],
        ],
      ],
    ];
    for (const [normal, v] of faces) {
      triangle(v[0], v[1], v[2], normal);
      triangle(v[0], v[2], v[3], normal);
    }
  } else if (['sphere', 'foliage', 'wool'].includes(shape)) {
    const lat = 16,
      lon = 24,
      point = (i, j) => {
        const a = (i / lat) * Math.PI,
          b = (j / lon) * Math.PI * 2;
        const radius =
          shape === 'foliage'
            ? 0.5 *
              (0.89 +
                Math.sin(a) ** 2 *
                  (0.055 * Math.sin(b * 5 + a * 3) + 0.035 * Math.cos(b * 3 - a * 2)))
            : shape === 'wool'
              ? 0.5 * (0.93 + 0.04 * Math.sin(a * 8) * Math.cos(b * 12) * Math.sin(a))
              : 0.5;
        return [
          Math.sin(a) * Math.cos(b) * radius,
          Math.cos(a) * radius,
          Math.sin(a) * Math.sin(b) * radius,
        ];
      };
    for (let i = 0; i < lat; i++)
      for (let j = 0; j < lon; j++) {
        // Skip degenerate triangles at the poles; keep outward winding.
        if (i > 0) triangle(point(i, j), point(i, j + 1), point(i + 1, j + 1));
        if (i < lat - 1) triangle(point(i, j), point(i + 1, j + 1), point(i + 1, j));
      }
  } else {
    const sides = 32;
    for (let i = 0; i < sides; i++) {
      const a = (i / sides) * Math.PI * 2,
        b = ((i + 1) / sides) * Math.PI * 2,
        lo = [Math.cos(a) * 0.5, -0.5, Math.sin(a) * 0.5],
        lo2 = [Math.cos(b) * 0.5, -0.5, Math.sin(b) * 0.5],
        hi = shape === 'cone' ? [0, 0.5, 0] : [lo[0], 0.5, lo[2]],
        hi2 = shape === 'cone' ? [0, 0.5, 0] : [lo2[0], 0.5, lo2[2]],
        normalA = [Math.cos(a), shape === 'cone' ? 0.5 : 0, Math.sin(a)],
        normalB = [Math.cos(b), shape === 'cone' ? 0.5 : 0, Math.sin(b)],
        tipNormal = [Math.cos((a + b) / 2), 0.5, Math.sin((a + b) / 2)];
      smoothTriangle([lo, hi, lo2], [normalA, shape === 'cone' ? tipNormal : normalA, normalB]);
      if (shape !== 'cone') {
        smoothTriangle([lo2, hi, hi2], [normalB, normalA, normalB]);
        triangle([0, 0.5, 0], hi2, hi, [0, 1, 0]);
      }
      triangle([0, -0.5, 0], lo, lo2, [0, -1, 0]);
    }
  }
  return { positions: new Float32Array(p), normals: new Float32Array(n), count: p.length / 3 };
}

export function roundedObject(m) {
  if (m.shape !== 'box' || m.rounded === false) return false;
  if (m.rounded === true) return true;
  // Keep long walls, roof panels, fences and thin panes crisp. Compact furniture,
  // machinery and character parts use the same cached rounded geometry.
  return !m.architectureMesh && Math.max(...m.size) / Math.min(...m.size) <= 6;
}
