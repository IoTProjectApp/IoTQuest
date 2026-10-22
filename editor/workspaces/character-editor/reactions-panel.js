// The Character Editor's Reactions section: for each thing that can happen (the technician comes
// near, a chat, a quest passing or failing, the weather, night), the clip a person plays, for how
// long, how soon it can play again and whether they turn to the technician; with "Try it" to play
// it on the stage. The format is in public/character-reactions.js.
import { CLIPS } from '../../../public/character-clips.js';
import { TRIGGERS } from '../../../public/character-reactions.js';
import { icon } from '../../ui/icons.js';

const escape = (s) =>
  String(s ?? '').replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c],
  );
// Clips that suit a reaction: played on the spot, so not walks or clips that travel (a throw).
export const reactionClips = () =>
  Object.keys(CLIPS)
    .filter((name) => !CLIPS[name].stride && !CLIPS[name].end)
    .sort();

// A target's reactions by trigger, as saved: theirs, and (for a person) the defaults'.
const byTrigger = (list) => new Map((Array.isArray(list) ? list : []).map((r) => [r.trigger, r]));

export function reactionsSection({ own, defaults, isDefaults, locked }) {
  const mine = byTrigger(own.reactions),
    everyone = isDefaults ? new Map() : byTrigger(defaults.reactions),
    clips = reactionClips();
  const rows = Object.entries(TRIGGERS)
    .map(([trigger, { label, cooldown }]) => {
      const set = mine.get(trigger),
        inherited = everyone.get(trigger),
        shown = set ?? inherited,
        value = set ? (set.clip === false ? 'false' : set.clip) : '';
      const choices = [
        [
          '',
          isDefaults
            ? 'Nothing'
            : inherited && inherited.clip !== false
              ? `As everyone (${inherited.clip})`
              : 'Nothing',
        ],
        ...(isDefaults || !inherited || inherited.clip === false ? [] : [['false', 'Nothing']]),
        ...clips.map((c) => [c, c]),
      ];
      const playing = shown && shown.clip !== false;
      return `<div class="reaction ${set ? 'set' : ''}" data-trigger="${trigger}">
        <div class="row"><span>${escape(label)}</span><div class="controls">
          <select class="select" data-reaction-clip ${locked ? 'disabled' : ''}>${choices
            .map(
              ([v, t]) =>
                `<option value="${escape(v)}" ${v === value ? 'selected' : ''}>${escape(t)}</option>`,
            )
            .join('')}</select>
          <button class="button icon-only" data-try title="Try it on the stage" ${playing ? '' : 'disabled'}>${icon('play', 14)}</button>
        </div></div>
        ${
          set && set.clip !== false
            ? `<div class="reaction-details">
          <label title="Once through the clip, or looped for this many seconds">For
            <select class="select" data-reaction-length>
              <option value="" ${set.seconds === undefined ? 'selected' : ''}>once (${CLIPS[set.clip]?.duration.toFixed(1) ?? '?'} s)</option>
              ${[2, 3, 5, 8, 12, 20]
                .map(
                  (n) =>
                    `<option value="${n}" ${set.seconds === n ? 'selected' : ''}>${n} s</option>`,
                )
                .join('')}
            </select></label>
          <label title="Seconds before it can play again">Again after
            <input class="input" type="number" min="0" max="600" step="1" data-reaction-cooldown value="${set.cooldown ?? cooldown}" /> s</label>
          <label class="check"><input type="checkbox" data-reaction-face ${set.face ? 'checked' : ''} /> Turn to the technician</label>
        </div>`
            : ''
        }
      </div>`;
    })
    .join('');
  return `<section>
    <div class="section-head"><h3>Reactions</h3><button class="link" data-reactions-reset ${mine.size && !locked ? '' : 'disabled'}>Reset reactions</button></div>
    <p class="note">${
      locked
        ? 'The judo class moves as the lesson needs.'
        : 'A clip they play when something happens, then back to what they were doing.'
    }</p>
    ${rows}
  </section>`;
}

// Wires the section: changes go through set(list or undefined, label); tryIt(reaction) plays one.
export function bindReactions(el, { own, defaults, isDefaults, set, tryIt }) {
  const mine = byTrigger(own.reactions),
    everyone = isDefaults ? new Map() : byTrigger(defaults.reactions);
  // Saved without the fields left as the game has them.
  const save = (label) =>
    set(
      mine.size
        ? [...mine.values()].map((r) =>
            Object.fromEntries(Object.entries(r).filter(([, v]) => v !== undefined)),
          )
        : undefined,
      label,
    );
  for (const row of el.querySelectorAll('[data-trigger]')) {
    const trigger = row.dataset.trigger,
      change = (fields, label) => {
        mine.set(trigger, { ...mine.get(trigger), ...fields });
        save(label);
      };
    row.querySelector('[data-reaction-clip]').addEventListener('change', (e) => {
      const v = e.target.value;
      if (v === '') mine.delete(trigger);
      else if (v === 'false') mine.set(trigger, { trigger, clip: false });
      else mine.set(trigger, { ...mine.get(trigger), trigger, clip: v });
      save('Change reaction');
      const r = mine.get(trigger) ?? everyone.get(trigger);
      if (r && r.clip !== false) tryIt(r);
    });
    row.querySelector('[data-try]').addEventListener('click', () => {
      const r = mine.get(trigger) ?? everyone.get(trigger);
      if (r && r.clip !== false) tryIt(r);
    });
    row
      .querySelector('[data-reaction-length]')
      ?.addEventListener('change', (e) =>
        change({ seconds: e.target.value ? Number(e.target.value) : undefined }, 'Change reaction'),
      );
    row.querySelector('[data-reaction-cooldown]')?.addEventListener('change', (e) => {
      const n = Math.max(0, Math.min(600, Math.round(Number(e.target.value) || 0)));
      change({ cooldown: n === TRIGGERS[trigger].cooldown ? undefined : n }, 'Change reaction');
    });
    row
      .querySelector('[data-reaction-face]')
      ?.addEventListener('change', (e) =>
        change({ face: e.target.checked || undefined }, 'Change reaction'),
      );
  }
  el.querySelector('[data-reactions-reset]')?.addEventListener('click', () =>
    set(undefined, 'Reset reactions'),
  );
}
