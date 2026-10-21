// Hand-placed changes to the generated world. The world is built by code (world-model.js,
// regions.js, community-world.js...), which tags each movable thing with an edit group: a sofa,
// a tree, a lantern. The world editor (editor/, launched with scripts/world-editor.sh) saves what a
// person moved, removed or added to data/world-layout.js, per destination:
//   { version: 1, locations: { [locationId]: {
//       edits: { [groupId]: { pos: [x, y, z], turn, scale } | { removed: true } },
//       added: [{ id, name, pos: [x, y, z], turn, scale, parts: [...], colliders: [...] }] } } }
// `pos` is where the group's base centre goes (the middle of its footprint, at its lowest point),
// `turn` a rotation about the vertical axis in radians and `scale` a uniform size factor. Added
// objects carry their own parts, measured from a base centre at the origin. An empty layout leaves
// the world exactly as built.
import WORLD_LAYOUT from './data/world-layout.js';

export { WORLD_LAYOUT };

// Rotation matrix (row-major 3×3) of a mesh's [rx, ry, rz], matching modelMatrix: Rz·Ry·Rx.
function rotationMatrix([rx, ry, rz]) {
  const cx = Math.cos(rx),
    sx = Math.sin(rx),
    cy = Math.cos(ry),
    sy = Math.sin(ry),
    cz = Math.cos(rz),
    sz = Math.sin(rz);
  return [
    [cy * cz, sx * sy * cz - cx * sz, cx * sy * cz + sx * sz],
    [cy * sz, sx * sy * sz + cx * cz, cx * sy * sz - sx * cz],
    [-sy, sx * cy, cx * cy],
  ];
}
// The same rotation turned by `turn` about the vertical axis, as [rx, ry, rz] again.
export function turnRotation(rotation, turn) {
  if (!turn) return [...rotation];
  if (!rotation[0] && !rotation[2]) return [0, rotation[1] + turn, 0];
  const r = rotationMatrix(rotation),
    c = Math.cos(turn),
    s = Math.sin(turn),
    // Ry(turn) · R
    m = [r[0].map((v, i) => c * v + s * r[2][i]), r[1], r[2].map((v, i) => -s * r[0][i] + c * v)],
    ry = Math.asin(Math.max(-1, Math.min(1, -m[2][0])));
  if (Math.abs(Math.cos(ry)) < 1e-6) return [Math.atan2(-m[1][2], m[1][1]), ry, 0];
  return [Math.atan2(m[2][1], m[2][2]), ry, Math.atan2(m[1][0], m[0][0])];
}
// Where a point lands when its group's base centre moves from `from` to `to`, turning and scaling
// about that centre.
function place([x, y, z], from, { pos: to, turn = 0, scale = 1 }) {
  const dx = (x - from[0]) * scale,
    dz = (z - from[2]) * scale,
    c = Math.cos(turn),
    s = Math.sin(turn);
  return [to[0] + dx * c + dz * s, to[1] + (y - from[1]) * scale, to[2] - dx * s + dz * c];
}
// World-space bounds of a set of meshes (each as its rotated box).
export function partBounds(parts) {
  const min = [Infinity, Infinity, Infinity],
    max = [-Infinity, -Infinity, -Infinity];
  for (const p of parts) {
    const r = rotationMatrix(p.rotation || [0, 0, 0]);
    for (let i = 0; i < 3; i++) {
      const half =
        (Math.abs(r[i][0]) * p.size[0] +
          Math.abs(r[i][1]) * p.size[1] +
          Math.abs(r[i][2]) * p.size[2]) /
        2;
      min[i] = Math.min(min[i], p.pos[i] - half);
      max[i] = Math.max(max[i], p.pos[i] + half);
    }
  }
  return { min, max };
}
// Every edit group in a model: id → { id, parts, colliders, pivot }. The pivot is the base centre.
export function editGroups(model) {
  const groups = new Map();
  const get = (id) => {
    let g = groups.get(id);
    if (!g) groups.set(id, (g = { id, parts: [], colliders: [] }));
    return g;
  };
  for (const m of model.objects) if (m.editGroup) get(m.editGroup).parts.push(m);
  for (const c of model.colliders)
    if (c.editGroup && groups.has(c.editGroup)) get(c.editGroup).colliders.push(c);
  for (const g of groups.values()) {
    const { min, max } = partBounds(g.parts);
    g.pivot = [(min[0] + max[0]) / 2, min[1], (min[2] + max[2]) / 2];
  }
  return groups;
}
// A copy of a group's placement, to transform from (so repeated edits never accumulate error).
export function snapshotGroup(group) {
  return {
    pivot: [...group.pivot],
    parts: group.parts.map((p) => ({
      pos: [...p.pos],
      size: [...p.size],
      rotation: [...(p.rotation || [0, 0, 0])],
      anchor: p.anchor && [...p.anchor],
    })),
    colliders: group.colliders.map((c) => ({ x: c.x, z: c.z, w: c.w, d: c.d })),
  };
}
// Places a group (from its snapshot) at `placement`: { pos, turn, scale }.
export function transformGroup(group, snapshot, placement) {
  const { turn = 0, scale = 1 } = placement,
    from = snapshot.pivot,
    c = Math.abs(Math.cos(turn)),
    s = Math.abs(Math.sin(turn));
  group.parts.forEach((part, i) => {
    const o = snapshot.parts[i];
    part.pos = place(o.pos, from, placement);
    part.size = o.size.map((v) => v * scale);
    part.rotation = turnRotation(o.rotation, turn);
    if (o.anchor) part.anchor = place(o.anchor, from, placement);
  });
  group.colliders.forEach((collider, i) => {
    const o = snapshot.colliders[i],
      [x, , z] = place([o.x, 0, o.z], from, placement);
    Object.assign(collider, {
      x,
      z,
      w: (o.w * c + o.d * s) * scale,
      d: (o.d * c + o.w * s) * scale,
    });
  });
  group.pivot = [...placement.pos];
}
// What an added copy keeps of each part: how it looks, not what the game does with the original
// (a prop's label, a lamp's switch, a traffic signal's lane).
const LOOKS = [
  'shape',
  'color',
  'opacity',
  'roughness',
  'rounded',
  'bevel',
  'surface',
  'material',
  'map',
  'vegetation',
  'architectureMesh',
  'cutawayFacade',
];
// A group's parts and colliders measured from its base centre, for the editor's catalogue: an
// added object is built from these. `snapshot` (from snapshotGroup) gives the placement to measure.
export function groupTemplate(group, snapshot = snapshotGroup(group)) {
  const [px, py, pz] = snapshot.pivot;
  return {
    parts: group.parts.map((part, i) => {
      const { pos, size, rotation } = snapshot.parts[i],
        looks = Object.fromEntries(
          LOOKS.filter((k) => part[k] !== undefined).map((k) => [k, part[k]]),
        );
      return { ...looks, pos: [pos[0] - px, pos[1] - py, pos[2] - pz], size, rotation };
    }),
    colliders: snapshot.colliders.map(({ x, z, w, d }) => ({ x: x - px, z: z - pz, w, d })),
  };
}
// Takes meshes out of the model and out of every list that refers to them (lamps, roofs...).
export function removeParts(model, parts, colliders = []) {
  const gone = new Set(parts),
    goneColliders = new Set(colliders);
  // In place: other code keeps references to these lists.
  const keep = (list, kept) => list.splice(0, list.length, ...list.filter(kept));
  keep(model.colliders, (c) => !goneColliders.has(c));
  for (const owner of [model, model.community])
    for (const value of Object.values(owner || {}))
      if (Array.isArray(value) && value.some((v) => gone.has(v) || gone.has(v?.mesh)))
        keep(value, (v) => !gone.has(v) && !gone.has(v?.mesh));
}
// Builds an added object's parts and colliders into the model, as group `entry.id`.
export function addPlaced(model, entry) {
  const parts = entry.parts.map(({ shape, pos, size, color, rotation, ...extra }) =>
      model.mesh(shape, pos, size, color, {
        ...extra,
        rotation: [...rotation],
        editGroup: entry.id,
        added: true,
      }),
    ),
    colliders = (entry.colliders || []).map((c) => ({ ...c, editGroup: entry.id }));
  model.colliders.push(...colliders);
  const group = { id: entry.id, parts, colliders, pivot: [0, 0, 0] };
  transformGroup(group, snapshotGroup(group), entry);
  return group;
}
// Applies a destination's saved changes to a freshly built model. Changes to groups the code no
// longer builds are listed in model.layoutWarnings rather than failing.
export function applyWorldLayout(model, locationId, layout = WORLD_LAYOUT) {
  const changes = layout?.locations?.[locationId || 'legacy'];
  model.layoutWarnings = [];
  if (!changes) return model;
  const groups = editGroups(model);
  for (const [id, edit] of Object.entries(changes.edits || {})) {
    const group = groups.get(id);
    if (!group) {
      model.layoutWarnings.push(`${locationId}: no "${id}" to ${edit.removed ? 'remove' : 'move'}`);
      continue;
    }
    if (edit.removed) removeParts(model, group.parts, group.colliders);
    else transformGroup(group, snapshotGroup(group), edit);
  }
  for (const entry of changes.added || []) addPlaced(model, entry);
  // Swaying foliage sways about where it now stands.
  for (const item of model.windObjects || [])
    if (item.mesh.editGroup) item.base = [...item.mesh.pos];
  return model;
}
