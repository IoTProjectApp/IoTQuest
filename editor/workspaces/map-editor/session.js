// One destination open in the editor: the world as the game builds it, the changes made to it
// (in the saved layout's format, see public/world-layout.js) and their undo history. Free of the
// DOM so it runs under Node in the tests.
import { createRegionalModel } from '../../../public/regions.js';
import { addCommunityWorld } from '../../../public/community-world.js';
import { locationById } from '../../../public/locations.js';
import { prepareWorldMaterials } from '../../../public/world-materials.js';
import {
  editGroups,
  snapshotGroup,
  transformGroup,
  groupTemplate,
  partBounds,
  scaleOf,
} from '../../../public/world-layout.js';
import { kindOf, nameOf, categoryOf, cautionFor } from './names.js';

const round = (v, places) => Math.round(v * 10 ** places) / 10 ** places || 0;
// Placements are stored to the millimetre and a hundredth of a degree, so saved files stay tidy. A
// size the same every way is stored as one factor, a stretch as [across, up, along].
export const tidy = ({ pos, turn = 0, scale = 1 }) => {
  const size = scaleOf(scale).map((v) => round(v, 3));
  return {
    pos: pos.map((v) => round(v, 3)),
    turn: round(turn, 4),
    scale: size.every((v) => v === size[0]) ? size[0] : size,
  };
};
// Within what tidy() rounds away: half a millimetre, half a ten-thousandth of a radian or factor.
const same = (a, b) =>
  a.pos.every((v, i) => Math.abs(v - b.pos[i]) <= 5e-4 + 1e-9) &&
  Math.abs((a.turn || 0) - (b.turn || 0)) <= 5e-5 + 1e-9 &&
  scaleOf(a.scale).every((v, i) => Math.abs(v - scaleOf(b.scale)[i]) <= 5e-4 + 1e-9);
const clone = (value) => JSON.parse(JSON.stringify(value));
const emptyChanges = () => ({ edits: {}, added: [] });

export class WorldSession {
  // `changes`: this destination's entry from the saved layout (or none).
  constructor(locationId, changes) {
    this.locationId = locationId || 'legacy';
    this.model = createRegionalModel(this.locationId);
    addCommunityWorld(this.model, locationById(this.locationId));
    prepareWorldMaterials(this.model);
    this.groups = new Map();
    const built = editGroups(this.model),
      counts = {};
    for (const id of built.keys()) counts[kindOf(id)] = (counts[kindOf(id)] || 0) + 1;
    for (const [id, group] of built) this.register(group, nameOf(id, counts[kindOf(id)]), id);
    this.changes = emptyChanges();
    this.undoStack = [];
    this.redoStack = [];
    this.listeners = new Set();
    this.restore(changes ? clone(changes) : emptyChanges());
  }
  // Keeps a group with its original placement, from which every edit is applied.
  register(group, name, kind, snapshot = snapshotGroup(group)) {
    const { min, max } = partBounds(group.parts),
      [px, py, pz] = snapshot.pivot;
    Object.assign(group, {
      name,
      kind: kindOf(kind),
      category: categoryOf(kind),
      caution: cautionFor(kind),
      snapshot,
      // The group's box measured from its base centre, before any turn or scale.
      box: {
        min: [min[0] - px, min[1] - py, min[2] - pz],
        max: [max[0] - px, max[1] - py, max[2] - pz],
      },
      original: { pos: [...snapshot.pivot], turn: 0, scale: 1 },
      placement: { pos: [...snapshot.pivot], turn: 0, scale: 1 },
      hidden: false,
    });
    this.groups.set(group.id, group);
    return group;
  }
  on(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  emit() {
    for (const listener of this.listeners) listener(this);
  }

  // Shows a placement while it is being dragged, without recording it.
  preview(id, placement) {
    const group = this.groups.get(id);
    transformGroup(group, group.snapshot, placement);
    group.placement = { ...placement, pos: [...placement.pos] };
  }
  move(id, placement, label = 'Move') {
    const group = this.groups.get(id),
      tidied = tidy(placement);
    this.commit(label + ' ' + group.name, (changes) => {
      const added = changes.added.find((a) => a.id === id);
      if (added) Object.assign(added, tidied);
      else if (same(tidied, group.original)) delete changes.edits[id];
      else changes.edits[id] = tidied;
    });
  }
  remove(id) {
    const group = this.groups.get(id);
    this.commit('Remove ' + group.name, (changes) => {
      if (id.startsWith('added/')) changes.added = changes.added.filter((a) => a.id !== id);
      else changes.edits[id] = { removed: true };
    });
  }
  // Back to how the code builds it.
  reset(id) {
    const group = this.groups.get(id);
    this.commit('Reset ' + group.name, (changes) => delete changes.edits[id]);
  }
  // Adds a copy of `source` (a group) at `placement`; returns the new group's id.
  add(source, placement) {
    const id = 'added/' + this.nextAddedId(),
      { parts, colliders } = groupTemplate(source, source.snapshot);
    this.commit('Add ' + nameOf(source.kind, 1), (changes) =>
      changes.added.push({
        id,
        name: nameOf(source.kind, 1),
        kind: source.kind,
        ...tidy(placement),
        parts,
        colliders,
      }),
    );
    return id;
  }
  nextAddedId() {
    let n = 1;
    for (const a of this.changes.added) n = Math.max(n, Number(a.id.split('/')[1]) + 1 || n);
    for (const id of this.groups.keys())
      if (id.startsWith('added/')) n = Math.max(n, Number(id.split('/')[1]) + 1 || n);
    return n;
  }

  commit(label, change) {
    const before = clone(this.changes);
    change(this.changes);
    if (JSON.stringify(before) === JSON.stringify(this.changes)) return;
    this.undoStack.push({ label, changes: before });
    this.redoStack = [];
    this.sync();
    this.emit();
  }
  undo() {
    const step = this.undoStack.pop();
    if (!step) return null;
    this.redoStack.push({ label: step.label, changes: clone(this.changes) });
    this.changes = step.changes;
    this.sync();
    this.emit();
    return step.label;
  }
  redo() {
    const step = this.redoStack.pop();
    if (!step) return null;
    this.undoStack.push({ label: step.label, changes: clone(this.changes) });
    this.changes = step.changes;
    this.sync();
    this.emit();
    return step.label;
  }
  // Replaces all changes (opening a destination, or discarding edits) without undo history.
  restore(changes) {
    this.changes = { edits: { ...changes.edits }, added: [...(changes.added || [])] };
    this.undoStack = [];
    this.redoStack = [];
    this.sync();
    this.emit();
  }

  // Brings the model in line with this.changes: placements, removals and added copies.
  sync() {
    const { edits, added } = this.changes;
    this.missing = Object.keys(edits).filter((id) => !this.groups.has(id));
    const wanted = new Map(added.map((a) => [a.id, a]));
    for (const [id, group] of [...this.groups]) {
      if (!id.startsWith('added/')) continue;
      const entry = wanted.get(id);
      // A copy whose parts changed (re-added after undo) is rebuilt.
      if (!entry || group.entry !== entry.parts) {
        this.setHidden(group, true);
        this.groups.delete(id);
      }
    }
    for (const entry of added)
      if (!this.groups.has(entry.id)) {
        const parts = entry.parts.map(({ shape, pos, size, color, rotation, ...looks }) =>
            this.model.mesh(shape, pos, size, color, {
              ...looks,
              rotation: [...rotation],
              editGroup: entry.id,
              added: true,
            }),
          ),
          group = { id: entry.id, parts, colliders: [], pivot: [0, 0, 0] };
        this.register(group, entry.name, entry.kind || entry.id).entry = entry.parts;
      }
    for (const group of this.groups.values()) {
      const entry = wanted.get(group.id),
        edit = entry || edits[group.id],
        placement = edit && !edit.removed ? edit : group.original;
      this.setHidden(group, !!edit?.removed);
      if (!same(placement, group.placement) || entry) this.preview(group.id, placement);
    }
  }
  setHidden(group, hidden) {
    if (group.hidden === hidden) return;
    group.hidden = hidden;
    const objects = this.model.objects;
    if (hidden) {
      const gone = new Set(group.parts);
      objects.splice(0, objects.length, ...objects.filter((m) => !gone.has(m)));
    } else objects.push(...group.parts);
  }

  isChanged(id) {
    return id.startsWith('added/') || id in this.changes.edits;
  }
  // Every change in this destination, for the inspector's list.
  changeList() {
    const list = [];
    for (const [id, edit] of Object.entries(this.changes.edits))
      list.push({
        id,
        name: this.groups.get(id)?.name || id,
        what: edit.removed ? 'Removed' : 'Changed',
        missing: !this.groups.has(id),
      });
    for (const a of this.changes.added) list.push({ id: a.id, name: a.name, what: 'Added' });
    return list;
  }
  // The changes as saved: null when there are none, so the layout file stays clean.
  saved() {
    const { edits, added } = this.changes;
    return Object.keys(edits).length || added.length ? clone({ edits, added }) : null;
  }
}
