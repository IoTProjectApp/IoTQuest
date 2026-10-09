import test from 'node:test';
import assert from 'node:assert/strict';
import { declutterLabels } from '../public/world-labels.js';

const tag = (text, offsetWidth, offsetHeight = 20) => ({
  textContent: text,
  offsetWidth,
  offsetHeight,
  style: {},
  classList: { contains: () => false },
});
// Two resident tags 50 px apart only clash once the first one is measured at its real width.
const place = (a, b) =>
  declutterLabels([
    { el: a, x: 100, y: 100, visible: true, priority: 2 },
    { el: b, x: 150, y: 100, visible: true, priority: 2 },
  ]);
const moved = (el) => el.style.top !== undefined || el.style.visibility === 'hidden';

test('a tag first measured while hidden is measured again once it has a size', () => {
  const a = tag('Amara', 0, 0),
    b = tag('Ben', 80);
  place(a, b);
  assert.equal(moved(b), false, 'No clash while the first tag measured 0×0');
  a.offsetWidth = 120;
  a.offsetHeight = 20;
  place(a, b);
  assert.equal(moved(b), true, 'The clash is resolved');
});

test('a tag is measured again when its text changes', () => {
  const a = tag('Al', 20),
    b = tag('Ben', 20);
  place(a, b);
  assert.equal(moved(b), false);
  a.textContent = 'Alexandra Okafor';
  a.offsetWidth = 140;
  place(a, b);
  assert.equal(moved(b), true);
});
