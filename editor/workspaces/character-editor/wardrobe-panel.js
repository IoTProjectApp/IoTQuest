// The Character Editor's "Their own clothes" section: take a person's own top or bottom off, or
// dress them in another model's, swap their shoes, and choose the plain base layer that goes on
// where clothes come off (the `wardrobe` in their outfit, see public/character-wardrobe.js).
import {
  BASE,
  SLEEVES,
  LEGS,
  baseOf,
  canChange,
  changes,
  describe,
  donorsFor,
  MODEL_PIECES,
} from '../../../public/character-wardrobe.js';
import { icon } from '../../ui/icons.js';

const escape = (s) =>
  String(s ?? '').replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c],
  );
const options = (list, selected) =>
  list
    .map(
      ([value, text]) =>
        `<option value="${escape(value)}" ${String(value) === String(selected) ? 'selected' : ''}>${escape(text)}</option>`,
    )
    .join('');
const SLEEVE_NAMES = { tee: 'Short sleeves', vest: 'Sleeveless', long: 'Long sleeves' };
const LEG_NAMES = { shorts: 'Shorts', knee: 'To the knee', long: 'Full length' };
const REGION_NAMES = { top: 'Top', bottom: 'Bottom', shoes: 'Shoes' };
// Base layer colours: plain whites, greys and a few soft colours.
const BASE_COLOURS = [
  '#e7e2d8',
  '#f4f4f0',
  '#9aa1a8',
  '#2b2f36',
  '#2f4f6f',
  '#6b7b3a',
  '#9a3b3b',
  '#c9a35e',
];

// The section's markup. own: the target's own settings; look: how they look now; locked: why
// their clothes cannot change (the judo class), if they cannot.
export function wardrobeSection(own, look, { locked = null } = {}) {
  const model = look.model,
    mine = own.outfit?.wardrobe || {},
    w = look.outfit?.wardrobe || {},
    head = `<div class="section-head"><h3>Their own clothes</h3><button class="link" data-wardrobe-reset ${'wardrobe' in (own.outfit || {}) ? '' : 'disabled'}>Put them back</button></div>`;
  if (locked)
    return `<section class="wardrobe">${head}<p class="note">${icon('lock', 14)} ${escape(locked)}</p></section>`;
  if (MODEL_PIECES[model] && !canChange(model))
    return `<section class="wardrobe">${head}<p class="note">${escape(model)} is made in one piece, with clothes painted on, so they cannot come off. Choose another model under “Played by” to change them.</p></section>`;
  if (!MODEL_PIECES[model])
    return `<section class="wardrobe">${head}<p class="note">Clothes can be changed on the game's own models only.</p></section>`;
  const row = (region) => {
    const own = describe(model, region),
      choices = [
        ['', own ? `Their own (${own.toLowerCase()})` : 'Their own'],
        ...(region === 'shoes' || !own ? [] : [['off', 'Taken off']]),
        ...donorsFor(model, region).map((m) => [m, `${m}’s ${describe(m, region).toLowerCase()}`]),
      ];
    return `<div class="row ${region in mine ? 'set' : ''}"><span>${REGION_NAMES[region]}</span><div class="controls">
      <select class="select" data-wardrobe="${region}">${options(choices, w[region] ?? '')}</select></div></div>`;
  };
  const base = baseOf(w),
    showBase = changes(w);
  return `<section class="wardrobe">${head}
    <p class="note">Take their own clothes off, or dress them in another person's. Whatever comes off leaves the base layer below on, never bare skin where clothes were.</p>
    ${row('top')}${row('bottom')}${row('shoes')}
    <div class="actions"><button class="button" data-wardrobe-dress>${icon('person', 16)}Change into a dress</button></div>
    ${
      showBase
        ? `<div class="base-layer">
      <h4>Base layer</h4>
      <div class="row"><span>Colour</span><div class="controls swatches">${BASE_COLOURS.map(
        (c) =>
          `<button class="swatch ${c === base.color ? 'on' : ''}" data-base-colour="${c}" style="background:${c}" title="${c}"></button>`,
      ).join('')}<input type="color" data-base-pick value="${base.color}" /></div></div>
      <div class="row"><span>Sleeves</span><div class="controls"><select class="select" data-base="sleeves">${options(
        SLEEVES.map((s) => [s, SLEEVE_NAMES[s]]),
        base.sleeves,
      )}</select></div></div>
      <div class="row"><span>Legs</span><div class="controls"><select class="select" data-base="legs">${options(
        LEGS.map((s) => [s, LEG_NAMES[s]]),
        base.legs,
      )}</select></div></div>
      ${w.shoes ? `<div class="row"><span>Socks</span><div class="controls"><input type="color" data-base-socks value="${base.socks}" /></div></div>` : ''}
    </div>`
        : ''
    }
  </section>`;
}

// Wires the section: every change is one undo step, and colours preview as they are dragged.
export function bindWardrobe(el, { session, target, look, stage, own }) {
  const section = el.querySelector('.wardrobe');
  if (!section) return;
  const mine = own.outfit?.wardrobe || {},
    shown = look.outfit?.wardrobe || {};
  // The wardrobe with some fields changed (undefined clears one); empty means as built.
  const next = (changesTo) => {
    const result = { ...mine, ...changesTo };
    for (const [key, value] of Object.entries(result)) if (value === undefined) delete result[key];
    if (result.base && !Object.keys(result.base).length) delete result.base;
    return Object.keys(result).length ? result : undefined;
  };
  const save = (changesTo, label) => session.wear(target, 'wardrobe', next(changesTo), label);
  const withBase = (part) => ({ base: { ...mine.base, ...part } });
  const preview = (part) =>
    stage.show({
      ...look,
      outfit: { ...look.outfit, wardrobe: { ...shown, base: { ...shown.base, ...part } } },
    });
  for (const select of section.querySelectorAll('[data-wardrobe]'))
    select.addEventListener('change', () => {
      const region = select.dataset.wardrobe;
      save(
        { [region]: select.value || undefined },
        select.value === 'off'
          ? `Take off their ${region}`
          : select.value
            ? `Wear ${select.value}'s ${region}`
            : `Their own ${region}`,
      );
    });
  for (const select of section.querySelectorAll('[data-base]'))
    select.addEventListener('change', () =>
      save(withBase({ [select.dataset.base]: select.value }), 'Change base layer'),
    );
  for (const b of section.querySelectorAll('[data-base-colour]'))
    b.addEventListener('click', () =>
      save(withBase({ color: b.dataset.baseColour }), 'Change base layer colour'),
    );
  const pick = section.querySelector('[data-base-pick]');
  pick?.addEventListener('input', () => preview({ color: pick.value }));
  pick?.addEventListener('change', () =>
    save(withBase({ color: pick.value }), 'Change base layer colour'),
  );
  const socks = section.querySelector('[data-base-socks]');
  socks?.addEventListener('input', () => preview({ socks: socks.value }));
  socks?.addEventListener('change', () => save(withBase({ socks: socks.value }), 'Change socks'));
  section
    .querySelector('[data-wardrobe-reset]')
    ?.addEventListener('click', () =>
      session.wear(target, 'wardrobe', undefined, 'Put their own clothes back'),
    );
  // Their own top and bottom off, sleeveless underneath in the dress's colour (so nothing else
  // shows at its armholes), and a dress over it: one undo step.
  section.querySelector('[data-wardrobe-dress]')?.addEventListener('click', () => {
    const dress = look.outfit?.dress || '#b5566e';
    session.set(
      target,
      'outfit',
      {
        ...own.outfit,
        dress,
        wardrobe: {
          ...mine,
          top: 'off',
          bottom: 'off',
          base: { ...mine.base, color: dress, sleeves: 'vest', legs: 'shorts' },
        },
      },
      'Change into a dress',
    );
  });
}
export { BASE };
