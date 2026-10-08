// Keeps 3D world labels readable: room buttons stay clickable and name tags do not pile up.
// Label sizes only change when the markup is re-rendered, so measure each element once.
const labelSizes = new WeakMap();
function labelBox({ el, x, y }, lift = 0) {
  if (!labelSizes.has(el)) labelSizes.set(el, [el.offsetWidth, el.offsetHeight]);
  const [w, h] = labelSizes.get(el),
    // Matches the CSS anchors: area markers translate(-50%, -50%), characters (-50%, -70%).
    top = y - lift - h * (el.classList.contains('area-marker') ? 0.5 : 0.7);
  return { left: x - w / 2 - 2, right: x + w / 2 + 2, top: top - 2, bottom: top + h + 2, h };
}
const overlaps = (a, b) =>
  a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
// Room markers and "You" are placed first and never move. A resident's tag that would cover one
// of them is lifted until it clears (so every room stays clickable), or hidden if it cannot.
export function declutterLabels(labels) {
  const shown = [];
  for (const label of labels.sort((a, b) => a.priority - b.priority)) {
    let box = label.visible ? labelBox(label) : null,
      lift = 0;
    if (box && label.priority > 1)
      while (box && shown.some((o) => overlaps(box, o)))
        box = (lift += box.h / 2) <= box.h * 3 ? labelBox(label, lift) : null;
    if (box) shown.push(box);
    const visibility = box ? 'visible' : 'hidden',
      top = label.y - lift + 'px';
    if (label.el.style.visibility !== visibility) label.el.style.visibility = visibility;
    if (lift) label.el.style.top = top;
  }
}
