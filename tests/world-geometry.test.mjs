import test from 'node:test';
import assert from 'node:assert/strict';
import { geometry, roundedObject, LOW_DETAIL_SHAPES } from '../public/world-geometry.js';

test('smooth meshes stay within their unit bounds and have valid outward triangles', () => {
  for (const shape of [
    'roundedBox',
    'sphere',
    'cylinder',
    'cone',
    'torus',
    'bowl',
    'vase',
    'shade',
    'mountain',
    'leaf',
    'foliage',
    'wool',
  ]) {
    const g = geometry(shape);
    assert.equal(g.positions.length, g.normals.length);
    assert.equal(g.count, g.positions.length / 3);
    assert.ok([...g.positions].every((x) => Number.isFinite(x) && Math.abs(x) <= 0.500001));
    for (let i = 0; i < g.positions.length; i += 9) {
      const a = g.positions.slice(i, i + 3),
        b = g.positions.slice(i + 3, i + 6),
        c = g.positions.slice(i + 6, i + 9),
        u = b.map((x, k) => x - a[k]),
        v = c.map((x, k) => x - a[k]),
        cross = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]],
        normal = g.normals.slice(i, i + 3);
      assert.ok(Math.hypot(...cross) > 1e-8, `${shape}: degenerate triangle`);
      assert.ok(cross.reduce((sum, x, k) => sum + x * normal[k], 0) > 0, `${shape}: reversed face`);
    }
    for (let i = 0; i < g.normals.length; i += 3)
      assert.ok(Math.hypot(...g.normals.slice(i, i + 3)) > 0, `${shape}: invalid normal`);
  }
});

test('cylinders share radial normals across seams while their caps stay flat', () => {
  const g = geometry('cylinder');
  assert.deepEqual([...g.normals.slice(0, 3)], [1, 0, 0]);
  assert.deepEqual([...g.normals.slice(6, 9)], [...g.normals.slice(9, 12)]);
  assert.deepEqual([...g.normals.slice(18, 21)], [0, 1, 0]);
  assert.deepEqual([...g.normals.slice(27, 30)], [0, -1, 0]);
});

test('rounded objects preserve architecture, thin surfaces and explicit overrides', () => {
  const furniture = { shape: 'box', size: [1.5, 0.6, 0.8] };
  assert.equal(roundedObject(furniture), true);
  assert.equal(roundedObject({ ...furniture, architectureMesh: true }), false);
  assert.equal(roundedObject({ ...furniture, size: [12, 0.1, 8] }), false);
  assert.equal(roundedObject({ ...furniture, rounded: false }), false);
  assert.equal(roundedObject({ ...furniture, size: [1, 0.1, 1], rounded: true }), true);
  assert.equal(roundedObject({ ...furniture, shape: 'sphere' }), false);
});

test('far-away shapes, rings included, have a much simpler low-detail version', () => {
  assert.ok(LOW_DETAIL_SHAPES.includes('torus'));
  for (const shape of LOW_DETAIL_SHAPES) {
    const full = geometry(shape).count,
      low = geometry(shape, { low: true });
    assert.ok(low.count * 3 <= full, `${shape}: ${low.count} of ${full} vertices`);
    assert.ok([...low.positions].every((x) => Number.isFinite(x) && Math.abs(x) <= 0.500001));
  }
});
