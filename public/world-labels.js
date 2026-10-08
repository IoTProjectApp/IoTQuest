// Keeps 3D world labels readable: room buttons stay clickable and name tags do not pile up.
// Label sizes only change when the markup is re-rendered, so measure each element once.
const labelSizes = new WeakMap();
function labelBox({ el, x, y }, dx = 0, dy = 0) {
  if (!labelSizes.has(el)) labelSizes.set(el, [el.offsetWidth, el.offsetHeight]);
  const [w, h] = labelSizes.get(el),
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
  for (let k = 1; k <= 6; k++) {
    yield [0, (-k * h) / 2];
    yield [0, (k * h) / 2];
  }
  for (let k = 1; k <= 2; k++)
    for (const side of [-1, 1]) for (const dy of [0, -h, h]) yield [side * k * (w + 6), dy];
}
// Room markers and "You" are placed first and never move. Resident tags, then device labels, that
// would cover a label already placed move to the nearest clear spot, or hide if there is none.
export function declutterLabels(labels) {
  const shown = [];
  for (const label of labels.sort((a, b) => a.priority - b.priority)) {
    let box = null,
      dx = 0,
      dy = 0;
    if (label.visible) {
      const { w, h } = labelBox(label);
      for ([dx, dy] of label.priority > 1 ? offsets(w, h) : [[0, 0]]) {
        const candidate = labelBox(label, dx, dy);
        if (label.priority <= 1 || !shown.some((o) => overlaps(candidate, o))) {
          box = candidate;
          break;
        }
      }
    }
    if (box) shown.push(box);
    const visibility = box ? 'visible' : 'hidden';
    if (label.el.style.visibility !== visibility) label.el.style.visibility = visibility;
    if (box && (dx || dy)) {
      label.el.style.left = label.x + dx + 'px';
      label.el.style.top = label.y + dy + 'px';
    }
  }
}
