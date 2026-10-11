// Keeps 3D world labels readable: room buttons stay clickable and name tags do not pile up.
// Label sizes only change with their text, so each element is measured once per text. A label
// measured while hidden (0×0, e.g. the game started in the Code layout) is measured again.
const labelSizes = new WeakMap();
function labelBox({ el, x, y }, dx = 0, dy = 0) {
  let size = labelSizes.get(el);
  const text = el.textContent;
  if (!size || !size[0] || !size[1] || size[2] !== text)
    labelSizes.set(el, (size = [el.offsetWidth, el.offsetHeight, text]));
  const [w, h] = size,
    // Matches the CSS anchors: area markers translate(-50%, -50%), device labels (-50%, -100%),
    // characters (-50%, -70%).
    anchor = el.classList.contains('area-marker')
      ? 0.5
      : el.classList.contains('world-device-target')
        ? 1
        : 0.7,
    left = x + dx - w / 2,
    top = y + dy - h * anchor;
  return { left: left - 2, right: left + w + 2, top: top - 2, bottom: top + h + 2, w, h };
}
const overlaps = (a, b) =>
  a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
// Where a crowded label may move, nearest first: up, then down, then out to either side.
function* offsets(w, h) {
  yield [0, 0];
  for (let k = 1; k <= 12; k++) {
    yield [0, (-k * h) / 2];
    yield [0, (k * h) / 2];
  }
  for (let k = 1; k <= 2; k++)
    for (const side of [-1, 1]) {
      const dx = side * k * (w + 6);
      yield [dx, 0];
      // At a screen edge, moving up alone still leaves a label clipped. Search
      // diagonal positions too, so the parking label can clear the camera toolbar.
      for (let row = 1; row <= 12; row++) {
        yield [dx, (-row * h) / 2];
        yield [dx, (row * h) / 2];
      }
    }
}
// Room markers and "You" are placed first and never move. Resident tags, then device labels, that
// would cover a label already placed move to the nearest clear spot, or hide if there is none.
// Essential labels (buttons with no other keyboard route, such as the community buildings) are
// never hidden: with no clear spot, or off screen, they stay in the tab order but turn transparent
// and click-through, and a focused one is shown, kept inside the bounds, above the other labels.
export function declutterLabels(labels, { bounds, blocked = [] } = {}) {
  const shown = [...blocked];
  for (const label of labels.sort((a, b) => a.priority - b.priority)) {
    let box = null,
      dx = 0,
      dy = 0;
    if (label.visible) {
      const { w, h } = labelBox(label);
      for ([dx, dy] of label.priority > 1 || label.movable ? offsets(w, h) : [[0, 0]]) {
        const candidate = labelBox(label, dx, dy);
        const fits =
          !bounds ||
          (candidate.left >= bounds.left &&
            candidate.right <= bounds.right &&
            candidate.top >= bounds.top &&
            candidate.bottom <= bounds.bottom);
        if (
          fits &&
          !blocked.some((o) => overlaps(candidate, o)) &&
          (label.priority <= 1 || !shown.some((o) => overlaps(candidate, o)))
        ) {
          box = candidate;
          break;
        }
      }
    }
    let standby = false;
    if (!box && label.essential) {
      const focused = isFocused(label.el);
      standby = !focused;
      [dx, dy] = focused ? focusOffset(label, bounds) : [0, 0];
      if (focused) box = labelBox(label, dx, dy);
    }
    if (box) shown.push(box);
    const style = label.el.style,
      visibility = box || standby ? 'visible' : 'hidden';
    if (style.visibility !== visibility) style.visibility = visibility;
    if (label.essential) {
      const opacity = standby ? '0' : '',
        pointerEvents = standby ? 'none' : '',
        zIndex = box && !standby && isFocused(label.el) ? '6' : '';
      if ((style.opacity || '') !== opacity) style.opacity = opacity;
      if ((style.pointerEvents || '') !== pointerEvents) style.pointerEvents = pointerEvents;
      if ((style.zIndex || '') !== zIndex) style.zIndex = zIndex;
    }
    if (box && (dx || dy)) {
      style.left = label.x + dx + 'px';
      style.top = label.y + dy + 'px';
    }
  }
}
const isFocused = (el) => !!el.ownerDocument && el.ownerDocument.activeElement === el;
// The shift that brings a focused essential label fully inside the bounds (it may be off screen).
function focusOffset(label, bounds) {
  if (!bounds) return [0, 0];
  const b = labelBox(label),
    shift = (low, high, min, max) => (low < min ? min - low : high > max ? max - high : 0);
  return [
    shift(b.left, b.right, bounds.left, bounds.right),
    shift(b.top, b.bottom, bounds.top, bounds.bottom),
  ];
}
