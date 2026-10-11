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

test('a crowded building button stays in the tab order and shows, inside the view, when focused', () => {
  const doc = { activeElement: null },
    button = (text) => ({ ...tag(text, 120), ownerDocument: doc }),
    bounds = { left: 4, top: 4, right: 240, bottom: 300 };
  // The camera toolbar covers the whole view apart from the first button's spot.
  const blocked = [{ left: 0, top: 60, right: 240, bottom: 300 }];
  const first = button('Factory'),
    crowded = button('Warehouse · loading yard'),
    offscreen = button('Parking & bus stop'),
    resident = tag('Leo · Neighbourhood home', 200);
  // Like the game, each frame first places every label at its projected point.
  const run = () => {
    crowded.style.left = '110px';
    offscreen.style.left = '900px';
    declutterLabels(
      [
        { el: first, x: 100, y: 30, visible: true, priority: 1.5, essential: true },
        { el: crowded, x: 110, y: 30, visible: true, priority: 1.5, essential: true },
        { el: offscreen, x: 900, y: 30, visible: false, priority: 1.5, essential: true },
        { el: resident, x: 105, y: 30, visible: true, priority: 2 },
      ],
      { bounds, blocked },
    );
  };
  run();
  assert.equal(first.style.visibility, 'visible');
  assert.equal(first.style.opacity || '', '');
  // No room: still focusable (never visibility: hidden), but transparent and click-through.
  for (const el of [crowded, offscreen]) {
    assert.equal(el.style.visibility, 'visible');
    assert.equal(el.style.opacity || '', '0');
    assert.equal(el.style.pointerEvents || '', 'none');
  }
  // An ordinary resident tag with no room still hides.
  assert.equal(resident.style.visibility, 'hidden');
  // Tabbing to a crowded or off-screen button shows it on top, moved inside the view.
  for (const el of [crowded, offscreen]) {
    doc.activeElement = el;
    run();
    assert.equal(el.style.opacity || '', '');
    assert.equal(el.style.pointerEvents || '', '');
    assert.equal(el.style.zIndex || '', '6');
    const left = parseFloat(el.style.left);
    assert.ok(left - 60 >= bounds.left - 2 && left + 60 <= bounds.right + 2, el.textContent);
  }
  doc.activeElement = null;
  run();
  assert.equal(offscreen.style.opacity || '', '0');
  assert.equal(offscreen.style.zIndex || '', '');
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
