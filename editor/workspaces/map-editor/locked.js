// The parts of the world that stay put (roads, traffic lights, the house's walls and floors, hills
// and water...; see public/world-detach.js): they can be clicked like anything else, and the
// inspector says why they do not move and where they are changed instead.
import { LOCKS, movedByTheGame } from '../../../public/world-detach.js';
import { partBounds } from '../../../public/world-layout.js';

// What a click on a locked part selects: that part alone, outlined, with its reason.
export function lockedTarget(part) {
  const lock = LOCKS[part.editLock] || { name: 'Fixed in place', reason: '' };
  return {
    id: 'locked:' + part.editLock,
    locked: true,
    lock: part.editLock,
    name: lock.name,
    reason: lock.reason,
    parts: [part],
    box: partBounds([part]),
    placement: { pos: [0, 0, 0], turn: 0, scale: 1 },
  };
}
// The locked parts a click can land on, worked out again when the world's parts change (a house
// change rebuilds its walls). The ground and the room floors are left out: a click on empty ground
// or floor still clears the selection.
export function lockedParts(session) {
  const objects = session.model.objects;
  if (session.lockedCache?.objects !== objects || session.lockedCache.length !== objects.length) {
    const floors = new Set((session.model.shell?.rooms || []).flatMap((r) => r.parts));
    session.lockedCache = {
      objects,
      length: objects.length,
      parts: objects.filter(
        (m) =>
          m.editLock &&
          m.editLock !== 'ground' &&
          !m.editGroup &&
          !floors.has(m) &&
          !movedByTheGame(m),
      ),
    };
  }
  return session.lockedCache.parts;
}
// Where each kind of locked part is changed, if anywhere: [button label, action].
const ACTIONS = {
  house: ['Open the House tool', 'house'],
  style: ['Open the House tool', 'house'],
  wall: ['Edit it in the House tool', 'house'],
  street: ['Open the Street Editor', 'street'],
  traffic: ['Open the Street Editor', 'street'],
  terrain: ['Open the Terrain tool', 'terrain'],
};
// The inspector for a locked part.
export function lockedInspector(target, { escape, icon }) {
  const action = ACTIONS[target.lock];
  return `
    <section>
      <h2>${escape(target.name)}</h2>
      <div class="chips"><span class="chip">${icon('lock', 12)} Stays in place</span></div>
      <div class="caution">${icon('lock', 16)}<span>${escape(target.reason)}</span></div>
      ${action ? `<div class="actions" style="margin-top:12px"><button class="button" data-locked-action="${action[1]}">${escape(action[0])}</button></div>` : ''}
    </section>`;
}
