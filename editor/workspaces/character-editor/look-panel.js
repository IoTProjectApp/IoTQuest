// The Character Editor's Look section: height, build, skin, hair, beard and brows (the
// `appearance` setting, see public/character-appearance.js), with ready-made looks and a random one.
import {
  HAIR_STYLES,
  BEARDS,
  HEIGHT,
  BUILD,
  SKIN_TONES,
  HAIR_COLOURS,
  PRESETS,
  randomAppearance,
} from '../../../public/character-appearance.js';
import { WOMEN } from '../../../public/people-cast.js';
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
const HAIR_NAMES = {
  own: 'The model’s own',
  bald: 'Bald',
  buzz: 'Buzz cut',
  short: 'Short',
  curly: 'Curly crop',
  bob: 'Bob',
  long: 'Long',
  ponytail: 'Ponytail',
  bun: 'Bun',
};
const BEARD_NAMES = {
  own: 'The model’s own',
  none: 'Clean-shaven',
  stubble: 'Stubble',
  short: 'Short beard',
  full: 'Full beard',
  goatee: 'Goatee',
  moustache: 'Moustache',
};

// A build in words: slim, average or broad.
const buildWord = (b) =>
  b < -0.6 ? 'Slim' : b < -0.2 ? 'Slight' : b <= 0.2 ? 'Average' : b <= 0.6 ? 'Sturdy' : 'Broad';

// The section's markup: `own` is the target's own settings, `look` what they look like now.
export function appearanceSection(own, look) {
  const mine = own.appearance || {},
    a = look.appearance || {},
    reset = (part) =>
      `<button class="reset-one" data-appearance-reset="${part}" title="Back to as modelled" ${part in mine ? '' : 'hidden'}>${icon('reset', 14)}</button>`,
    row = (part, text, controls) =>
      `<div class="row ${part in mine ? 'set' : ''}"><span>${text}</span><div class="controls">${controls}</div>${reset(part)}</div>`,
    swatches = (part, list, current) =>
      `<div class="swatches">${list
        .map(
          (c) =>
            `<button class="swatch ${c === current ? 'on' : ''}" data-swatch="${part}" data-value="${c}" style="background:${c}" title="${c}"></button>`,
        )
        .join('')}</div>`,
    height = a.height ?? 1,
    build = a.build ?? 0,
    hair = a.hair || {},
    beard = a.beard || {};
  return `<section class="look">
    <div class="section-head"><h3>Look</h3><button class="link" data-section="appearance" ${own.appearance ? '' : 'disabled'}>Reset look</button></div>
    <div class="look-actions">
      <select class="select" id="look-preset"><option value="">Start from a look…</option>${Object.keys(
        PRESETS,
      )
        .map((name) => `<option>${escape(name)}</option>`)
        .join('')}</select>
      <button class="button" id="look-random" title="A random height, build, skin, hair and face">${icon('reset', 16)}Randomise</button>
    </div>
    ${row(
      'height',
      'Height',
      `<input type="range" data-look-range="height" min="${HEIGHT[0]}" max="${HEIGHT[1]}" step="0.01" value="${height}" />
      <span class="value">${Math.round(height * 100)}%</span>`,
    )}
    ${row(
      'build',
      'Build',
      `<input type="range" data-look-range="build" min="${BUILD[0]}" max="${BUILD[1]}" step="0.05" value="${build}" title="Slim to broad" />
      <span class="value">${buildWord(build)}</span>`,
    )}
    ${row(
      'skin',
      'Skin',
      `${swatches('skin', SKIN_TONES, a.skin)}<input type="color" data-look-colour="skin" value="${a.skin || '#c78e63'}" title="Any colour" />`,
    )}
    ${row(
      'hair',
      'Hair',
      `<select class="select" data-look-choice="hair">${options(
        HAIR_STYLES.map((s) => [s, HAIR_NAMES[s]]),
        hair.style || 'own',
      )}</select>`,
    )}
    ${
      hair.style === 'bald'
        ? ''
        : `<div class="row sub"><span>Hair colour</span><div class="controls">${swatches('hair', HAIR_COLOURS, hair.color)}<input type="color" data-look-colour="hair" value="${hair.color || '#3a2416'}" title="Any colour" />${
            hair.color
              ? '<button class="link" data-look-clear="hair">Model’s own</button>'
              : '<span class="note">the model’s own</span>'
          }</div></div>`
    }
    ${row(
      'beard',
      'Beard',
      `<select class="select" data-look-choice="beard">${options(
        BEARDS.map((b) => [b, BEARD_NAMES[b]]),
        beard.kind || 'own',
      )}</select>${
        ['own', 'none'].includes(beard.kind || 'own')
          ? ''
          : `<input type="color" data-look-colour="beard" value="${beard.color || hair.color || '#3a2416'}" title="Its colour (the hair’s unless set)" />`
      }`,
    )}
    ${row(
      'brows',
      'Brows',
      `<select class="select" data-look-choice="brows">${options(
        [
          ['own', 'The model’s own'],
          ['bold', 'Bold'],
        ],
        a.brows || 'own',
      )}</select>`,
    )}
    <p class="note">Height and build leave the head as it is; the judo class keeps its own sizes for its throws.</p>
  </section>`;
}

// Wires the section: sliders and colour pickers preview as they move and are kept when let go.
export function bindAppearance(el, { session, target, look, stage }) {
  const a = look.appearance || {},
    preview = (part, value) => stage.show({ ...look, appearance: { ...a, [part]: value } }),
    set = (part, value, label) => session.appear(target, part, value, label);
  // Hair and beard keep their other half when one half changes.
  const valueOf = (part, value) =>
    part === 'hair'
      ? { ...a.hair, color: value }
      : part === 'beard'
        ? { kind: a.beard?.kind || 'short', ...a.beard, color: value }
        : value;
  for (const range of el.querySelectorAll('[data-look-range]')) {
    const part = range.dataset.lookRange,
      shown = range.parentElement.querySelector('.value');
    range.addEventListener('input', () => {
      if (shown)
        shown.textContent =
          part === 'build' ? buildWord(range.value) : Math.round(range.value * 100) + '%';
      preview(part, Number(range.value));
    });
    range.addEventListener('change', () => set(part, Number(range.value), 'Change ' + part));
  }
  for (const input of el.querySelectorAll('[data-look-colour]')) {
    const part = input.dataset.lookColour;
    input.addEventListener('input', () => preview(part, valueOf(part, input.value)));
    input.addEventListener('change', () =>
      set(part, valueOf(part, input.value), `Change ${part} colour`),
    );
  }
  for (const b of el.querySelectorAll('[data-swatch]'))
    b.addEventListener('click', () =>
      set(
        b.dataset.swatch,
        valueOf(b.dataset.swatch, b.dataset.value),
        `Change ${b.dataset.swatch} colour`,
      ),
    );
  for (const b of el.querySelectorAll('[data-look-clear]'))
    b.addEventListener('click', () => {
      const { color, ...rest } = a[b.dataset.lookClear] || {};
      set(
        b.dataset.lookClear,
        Object.keys(rest).length ? rest : undefined,
        'Hair colour as modelled',
      );
    });
  for (const select of el.querySelectorAll('[data-look-choice]'))
    select.addEventListener('change', () => {
      const part = select.dataset.lookChoice,
        v = select.value;
      if (part === 'brows') return set('brows', v === 'own' ? undefined : v, 'Change brows');
      const field = part === 'hair' ? 'style' : 'kind',
        next = { ...a[part], [field]: v };
      if (v === 'own') delete next[field];
      set(part, Object.keys(next).length ? next : undefined, 'Change ' + part);
    });
  for (const b of el.querySelectorAll('[data-appearance-reset]'))
    b.addEventListener('click', () =>
      set(b.dataset.appearanceReset, undefined, 'Reset ' + b.dataset.appearanceReset),
    );
  el.querySelector('#look-preset')?.addEventListener('change', (e) => {
    const preset = PRESETS[e.target.value];
    if (!preset) return;
    session.set(target, 'appearance', { ...a, ...preset }, 'Look: ' + e.target.value);
  });
  el.querySelector('#look-random')?.addEventListener('click', () =>
    session.set(
      target,
      'appearance',
      randomAppearance(Math.random, { woman: WOMEN.includes(look.model) }),
      'Randomise look',
    ),
  );
}
