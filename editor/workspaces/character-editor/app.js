// The Character Editor workspace: everyone in the game, their looks and movement, a live preview,
// undo and saving to public/data/characters.js.
import { CLIPS } from '../../../public/character-clips.js';
import { WOMEN, MEN } from '../../../public/people-cast.js';
import { dressed } from '../../../public/character-settings.js';
import { findPeople, GROUPS, walksAlone, movesLocked } from './people.js';
import { CharacterSession, DEFAULTS } from './session.js';
import { Stage } from './stage.js';
import { icon } from '../../ui/icons.js';

const shell = window.editorShell;
const $ = (id) => document.getElementById(id);
const escape = (s) =>
  String(s).replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c],
  );
const label = (clip) => clip.replace(/([a-z])([A-Z])/g, '$1 $2');
const WALKS = Object.keys(CLIPS).filter((name) => CLIPS[name].stride),
  OTHERS = Object.keys(CLIPS).filter((name) => !CLIPS[name].stride);

const state = { people: [], session: null, target: null, search: '', lastPerson: null };
const stage = new Stage($('stage'));

// ---- Static chrome --------------------------------------------------------------------------
$('home').innerHTML = icon('back');
$('undo').innerHTML = icon('undo');
$('redo').innerHTML = icon('redo');
$('save').innerHTML = icon('save', 16) + 'Save';
$('playtest').innerHTML = icon('play', 16) + 'Play-test';
$('search-icon').innerHTML = icon('search', 16);
$('modes').children[0].innerHTML = icon('person', 16) + 'Standing';
$('modes').children[1].innerHTML = icon('move', 16) + 'Walking';
function setMode(mode) {
  stage.setMode(mode);
  for (const b of $('modes').children) b.classList.toggle('active', b.dataset.mode === mode);
  hint();
}
for (const b of $('modes').children) b.addEventListener('click', () => setMode(b.dataset.mode));
function setPlaying(on) {
  stage.playing = on;
  $('play').innerHTML = icon(on ? 'pause' : 'play', 18);
  $('play').title = on ? 'Pause (Space)' : 'Play (Space)';
}
$('play').addEventListener('click', () => setPlaying(!stage.playing));

// ---- Who is shown ---------------------------------------------------------------------------
const person = (id) => state.people.find((p) => p.id === id);
// A target's look and movement with the defaults and its own settings laid over how it is built.
// The defaults are shown on whoever was last picked.
function lookOf(target) {
  const base = person(target === DEFAULTS ? state.lastPerson : target) || state.people[0],
    { defaults, people } = state.session.settings,
    own = target === DEFAULTS ? {} : people[target] || {},
    pick = (key, built) => own[key] ?? defaults[key] ?? built;
  return {
    model: pick('model', base.model),
    outfit: dressed(dressed(base.outfit, defaults.outfit), own.outfit),
    scale: base.scale,
    carry: base.carry,
    belt: base.belt,
    walk: pick('walk', base.walk),
    idle: pick('idle', 'Idle'),
    activity: pick('activity', base.activity) || null,
    speed: pick('speed', 1),
    rate: pick('rate', 1),
  };
}
function select(target) {
  state.target = target;
  if (target !== DEFAULTS) state.lastPerson = target;
  renderPeople();
  renderInspector();
  stage.show(lookOf(target));
  hint();
}

// ---- The people list ------------------------------------------------------------------------
function renderPeople() {
  const changed = state.session.changedPeople(),
    search = state.search.trim().toLowerCase(),
    shown = state.people.filter(
      (p) =>
        !search || p.name.toLowerCase().includes(search) || p.id.toLowerCase().includes(search),
    );
  const row = (id, name, extra = '', cls = '') =>
    `<button class="person ${cls} ${state.target === id ? 'active' : ''}" data-id="${escape(id)}" title="${escape(id)}">
      <span class="label">${escape(name)}</span>${extra}
    </button>`;
  $('people').innerHTML =
    row(
      DEFAULTS,
      'Everyone (defaults)',
      Object.keys(state.session.settings.defaults).length ? '<span class="dot"></span>' : '',
      'defaults',
    ) +
    GROUPS.map((g) => {
      const members = shown.filter((p) => p.group === g.id);
      return members.length
        ? `<h3>${g.label}</h3>` +
            members
              .map((p) =>
                row(
                  p.id,
                  p.name,
                  `<span class="model">${escape(lookOf(p.id).model)}</span>${changed.has(p.id) ? '<span class="dot"></span>' : ''}`,
                ),
              )
              .join('')
        : '';
    }).join('');
  for (const b of $('people').querySelectorAll('[data-id]'))
    b.addEventListener('click', () => select(b.dataset.id));
}
$('search').addEventListener('input', (e) => {
  state.search = e.target.value;
  renderPeople();
});

// ---- Inspector ------------------------------------------------------------------------------
const options = (list, selected) =>
  list
    .map(
      ([value, text]) =>
        `<option value="${escape(value)}" ${value === selected ? 'selected' : ''}>${escape(text)}</option>`,
    )
    .join('');
function renderInspector() {
  const s = state.session,
    target = state.target,
    el = $('inspector');
  if (!target) return (el.innerHTML = '');
  const defaults = target === DEFAULTS,
    who = defaults ? null : person(target),
    own = s.own(target),
    outfitOwn = own.outfit || {},
    look = lookOf(target),
    built = defaults ? { outfit: {}, model: null } : who,
    locked = !defaults && movesLocked(target),
    walking = defaults || walksAlone(target),
    reset = (key, has) =>
      `<button class="reset-one" data-reset="${key}" title="Back to as built" ${has ? '' : 'hidden'}>${icon('reset', 14)}</button>`;
  const colour = (name, value, fallback = '#888888') =>
    `<input type="color" data-colour="${name}" value="${value || fallback}" />`;
  // Top and bottom colours.
  const plain = (name, text) => {
    const has = name in outfitOwn,
      value = look.outfit[name];
    return `<div class="row ${has ? 'set' : ''}"><span>${text}</span><div class="controls">${colour(name, value)}<span class="note">${value ? escape(value) : 'the model’s own'}</span></div>${reset('outfit.' + name, has)}</div>`;
  };
  // Pieces that can be worn or not: a choice, then their colour (and a vest's lettering).
  const optional = (name, text, choices, extra = () => '') => {
    const has = name in outfitOwn,
      value = look.outfit[name],
      kind =
        value == null
          ? 'none'
          : typeof value === 'object'
            ? value.kind || 'on'
            : choices.some(([v]) => v === value)
              ? value
              : 'on';
    return `<div class="row ${has ? 'set' : ''}"><span>${text}</span><div class="controls">
      <select class="select" data-piece="${name}">${options(choices, kind)}</select>${value != null ? extra(value) : ''}
    </div>${reset('outfit.' + name, has)}</div>`;
  };
  // A garment worn or not, in a colour of its own.
  const worn = (name, text, on, fallback) =>
    optional(
      name,
      text,
      [
        ['none', 'None'],
        ['on', on],
      ],
      (v) => colour(name, v, fallback),
    );
  const clipRow = (key, text, list) => {
    const has = key in own;
    return `<div class="row ${has ? 'set' : ''}"><span>${text}</span><div class="controls">
      <select class="select" data-clip="${key}" ${locked ? 'disabled' : ''}>${options(list, has ? String(own[key]) : '')}</select>
    </div>${reset(key, has && !locked)}</div>`;
  };
  const slider = (key, text, min, max, value, enabled, why) => {
    const has = key in own;
    return `<div class="row ${has ? 'set' : ''}"><span>${text}</span><div class="controls">
      <input type="range" data-slider="${key}" min="${min}" max="${max}" step="0.05" value="${value}" ${enabled ? '' : 'disabled'} title="${escape(why || '')}" />
      <span class="value">${Number(value).toFixed(2)}×</span>
    </div>${reset(key, has && enabled)}</div>`;
  };
  const modelChoices = [
    ['', defaults ? 'As each is built' : `As built (${who.model})`],
    ...WOMEN.map((m) => [m, `${m} · woman`]),
    ...MEN.map((m) => [m, `${m} · man`]),
  ];
  el.innerHTML = `
    <section>
      <h2>${defaults ? 'Everyone (defaults)' : escape(who.name)}</h2>
      ${defaults ? '' : `<div class="id">${escape(who.id)}</div>`}
      <div class="chips">
        <span class="chip">${defaults ? 'All people' : GROUPS.find((g) => g.id === who.group).label}</span>
        <span class="chip ${s.isChanged(target) ? 'changed' : ''}">${s.isChanged(target) ? 'Changed' : 'As built'}</span>
      </div>
      ${defaults ? '<p class="note" style="margin-top:10px">Applies to everyone without a setting of their own. Shown on the last person you picked.</p>' : ''}
    </section>
    ${
      defaults
        ? ''
        : `<section>
      <div class="section-head"><h3>Model</h3></div>
      <div class="row ${'model' in own ? 'set' : ''}"><span>Played by</span><div class="controls">
        <select class="select" id="model">${options(modelChoices, own.model || '')}</select></div>${reset('model', 'model' in own)}</div>
    </section>`
    }
    <section>
      <div class="section-head"><h3>Clothes</h3><button class="link" data-section="outfit" ${own.outfit ? '' : 'disabled'}>Reset clothes</button></div>
      ${plain('top', 'Top')}
      ${plain('bottom', 'Bottom')}
      ${plain('shoes', 'Shoes')}
      ${optional(
        'stripes',
        'Stripes',
        [
          ['none', 'None'],
          ['on', 'Striped'],
        ],
        (v) => colour('stripes', v),
      )}
      ${worn('jacket', 'Jacket', 'Jacket', '#3b4a5c')}
      ${worn('coat', 'Coat', 'Long coat', '#6b5a48')}
      ${worn('dress', 'Dress', 'Dress', '#b5566e')}
      ${worn('skirt', 'Skirt', 'Skirt', '#5b4a7a')}
      ${worn('apron', 'Apron', 'Apron', '#e9e4d8')}
      ${worn('gloves', 'Gloves', 'Gloves', '#2b2f36')}
      ${optional(
        'vest',
        'Hi-vis vest',
        [
          ['none', 'None'],
          ['on', 'Vest'],
        ],
        (v) =>
          colour('vest', v.color, '#d8f03a') +
          `<input class="input" data-vest-text placeholder="Lettering" value="${escape(v.text || '')}" />`,
      )}
      ${optional(
        'hat',
        'Hat',
        [
          ['none', 'None'],
          ['cap', 'Cap'],
          ['hardhat', 'Hard hat'],
          ['beanie', 'Beanie'],
          ['sunhat', 'Sun hat'],
          ['bucket', 'Bucket hat'],
          ['beret', 'Beret'],
          ['helmet', 'Bike helmet'],
          ['headband', 'Headband'],
          ['headscarf', 'Headscarf'],
          ['turban', 'Turban'],
        ],
        (v) => colour('hat', v.color, '#1f3b73'),
      )}
      ${optional(
        'glasses',
        'Glasses',
        [
          ['none', 'None'],
          ['glasses', 'Glasses'],
          ['sunglasses', 'Sunglasses'],
        ],
        (v) => colour('glasses', v.color, '#222222'),
      )}
      ${worn('mask', 'Face mask', 'Mask', '#9fc4d8')}
      ${worn('scarf', 'Scarf', 'Scarf', '#a23b3b')}
      ${optional(
        'tie',
        'Tie',
        [
          ['none', 'None'],
          ['tie', 'Necktie'],
          ['bowtie', 'Bow tie'],
        ],
        (v) => colour('tie', v.color, '#7a2e2e'),
      )}
      ${worn('lanyard', 'Lanyard', 'Lanyard & ID', '#1f3b73')}
      ${worn('watch', 'Watch', 'Watch', '#2b2f36')}
      ${optional(
        'backpack',
        'Backpack',
        [
          ['none', 'None'],
          ['on', 'Backpack'],
        ],
        (v) => colour('backpack', v),
      )}
      ${optional(
        'badge',
        'Badge',
        [
          ['none', 'None'],
          ['medical', 'Medical'],
          ['lifeguard', 'Lifeguard'],
          ['name', 'Name'],
        ].map(([v, t]) => [v, t]),
      )}
    </section>
    <section>
      <div class="section-head"><h3>Movement</h3><button class="link" data-section="movement" ${locked || !['walk', 'idle', 'activity', 'speed', 'rate'].some((k) => k in own) ? 'disabled' : ''}>Reset movement</button></div>
      ${clipRow('walk', 'Walk', [['', `As built${defaults ? '' : ` (${label(who.walk)})`}`], ...WALKS.map((c) => [c, label(c)]), ...OTHERS.map((c) => [c, label(c) + ' (on the spot)'])])}
      ${clipRow('idle', 'Standing', [['', 'As built (Idle)'], ...Object.keys(CLIPS).map((c) => [c, label(c)])])}
      ${clipRow('activity', 'Activity', [['', `As built${!defaults && who.activity ? ` (${label(who.activity)})` : ' (none)'}`], ['false', 'None: walks and stands'], ...OTHERS.map((c) => [c, label(c)])])}
      ${slider('speed', 'Walking speed', 0.5, 2, look.speed, !locked && walking, walking ? '' : 'They are moved by what they are doing')}
      ${slider('rate', 'Clip speed', 0.25, 2, look.rate, !locked)}
      ${
        locked
          ? `<p class="note">${icon('lock', 14)} The judo class's moves are timed to its clips, so they stay as built.</p>`
          : walking
            ? ''
            : target === 'player'
              ? '<p class="note">The technician walks as fast as you steer them in the game; clip speed still applies.</p>'
              : '<p class="note">Walking speed is set by what they are doing (a game, a swim, a queue); clip speed still applies.</p>'
      }
    </section>
    <section>
      <div class="actions">
        <button class="button" id="reset-all" ${s.isChanged(target) ? '' : 'disabled'}>${icon('reset', 16)}Reset everything</button>
      </div>
    </section>`;
  bindInspector(el, target);
}
function bindInspector(el, target) {
  const s = state.session,
    look = lookOf(target);
  el.querySelector('#model')?.addEventListener('change', (e) =>
    s.set(target, 'model', e.target.value || undefined, 'Change model'),
  );
  // Colours: a colour picked in the dialog commits once it closes.
  for (const input of el.querySelectorAll('[data-colour]')) {
    const name = input.dataset.colour;
    input.addEventListener('input', () =>
      stage.show({
        ...look,
        outfit: { ...look.outfit, [name]: withColour(look.outfit[name], input.value) },
      }),
    );
    input.addEventListener('change', () =>
      s.wear(target, name, withColour(look.outfit[name], input.value), 'Change ' + name),
    );
  }
  for (const select of el.querySelectorAll('[data-piece]'))
    select.addEventListener('change', () => {
      const name = select.dataset.piece,
        kind = select.value,
        current = look.outfit[name];
      const fresh = {
        stripes: '#f2efe6',
        vest: { color: '#d8f03a', ...(typeof current === 'object' ? current : {}) },
        hat: {
          kind,
          color:
            current?.color ||
            {
              hardhat: '#f4f4f0',
              cap: '#1f3b73',
              beanie: '#7a2e2e',
              sunhat: '#e3d9c6',
              bucket: '#6b7b3a',
              beret: '#2b2f36',
              helmet: '#d08a2e',
              headband: '#a23b3b',
              headscarf: '#5b4a7a',
              turban: '#d08a2e',
            }[kind] ||
            '#1f3b73',
        },
        glasses: { kind, color: current?.color || '#222222' },
        tie: { kind, color: current?.color || '#7a2e2e' },
        coat: '#6b5a48',
        dress: '#b5566e',
        gloves: '#2b2f36',
        mask: '#9fc4d8',
        lanyard: '#1f3b73',
        watch: '#2b2f36',
        backpack: '#2d3e50',
        jacket: '#3b4a5c',
        skirt: '#5b4a7a',
        apron: '#e9e4d8',
        scarf: '#a23b3b',
        badge: kind,
      }[name];
      s.wear(target, name, kind === 'none' ? null : fresh, 'Change ' + name);
    });
  el.querySelector('[data-vest-text]')?.addEventListener('change', (e) =>
    s.wear(
      target,
      'vest',
      { ...look.outfit.vest, text: e.target.value || undefined },
      'Change vest lettering',
    ),
  );
  for (const select of el.querySelectorAll('[data-clip]'))
    select.addEventListener('change', () => {
      const key = select.dataset.clip,
        value = select.value === '' ? undefined : select.value === 'false' ? false : select.value;
      s.set(target, key, value, 'Change ' + key);
      if (key === 'walk') setMode('walk');
      else setMode('stand');
    });
  for (const range of el.querySelectorAll('[data-slider]')) {
    const key = range.dataset.slider;
    range.addEventListener('input', () => {
      range.nextElementSibling.textContent = Number(range.value).toFixed(2) + '×';
      stage.show({ ...look, [key]: Number(range.value) });
    });
    range.addEventListener('change', () =>
      s.set(target, key, Number(range.value), 'Change ' + key),
    );
  }
  for (const b of el.querySelectorAll('[data-reset]'))
    b.addEventListener('click', () => {
      const [key, piece] = b.dataset.reset.split('.');
      if (piece) s.wear(target, piece, undefined, 'Reset ' + piece);
      else s.set(target, key, undefined, 'Reset ' + key);
    });
  for (const b of el.querySelectorAll('[data-section]'))
    b.addEventListener('click', () => s.reset(target, b.dataset.section));
  $('reset-all').addEventListener('click', () => s.reset(target));
}
// A piece of clothing with a new colour: a plain colour, or an object's `color`.
const withColour = (current, colour) =>
  current && typeof current === 'object' ? { ...current, color: colour } : colour;

function hint() {
  $('hint').innerHTML = [
    ['Drag', 'to turn round them'],
    ['Scroll', 'to zoom'],
    ['1 2', 'standing, walking'],
    ['Space', 'pauses'],
  ]
    .map(([k, what]) => `<b>${k}</b> ${what}`)
    .join(' · ');
}

// ---- Saving and undo ------------------------------------------------------------------------
function changed() {
  const s = state.session,
    dirty = s.isChanged();
  $('save-state').textContent = dirty ? 'Unsaved changes' : 'All changes saved';
  $('save-state').classList.toggle('unsaved', dirty);
  $('save').disabled = !dirty;
  shell?.setUnsaved(dirty);
  $('undo').disabled = !s.undoStack.length;
  $('redo').disabled = !s.redoStack.length;
  $('undo').title = s.undoStack.length
    ? `Undo ${s.undoStack.at(-1).label} (⌘Z)`
    : 'Nothing to undo';
  $('redo').title = s.redoStack.length
    ? `Redo ${s.redoStack.at(-1).label} (⇧⌘Z)`
    : 'Nothing to redo';
  renderPeople();
  renderInspector();
  if (state.target) stage.show(lookOf(state.target));
}
async function save() {
  try {
    await shell.write('characters', state.session.settings);
  } catch (error) {
    toast('Could not save: ' + error.message, true);
    return false;
  }
  state.session.markSaved();
  toast('Saved to public/data/characters.js');
  return true;
}
function undo(redo = false) {
  const text = redo ? state.session.redo() : state.session.undo();
  if (text) toast(`${redo ? 'Redid' : 'Undid'}: ${text}`);
}
// fromStart: the game from the beginning, rather than at what is being edited.
async function playtest(fromStart = false) {
  if (state.session.isChanged()) {
    if (!confirm('The game uses saved settings only. Save now and open the game?')) return;
    if (!(await save())) return;
  }
  // Walking up to the selected person, at the original home where this editor shows them.
  const person = state.target && ![DEFAULTS, 'player'].includes(state.target) ? state.target : null;
  shell.openGame(fromStart ? null : { city: 'legacy', person });
}
$('undo').addEventListener('click', () => undo());
$('redo').addEventListener('click', () => undo(true));
$('save').addEventListener('click', save);
$('playtest').addEventListener('click', (e) => playtest(e.shiftKey));
$('home').addEventListener('click', (e) => {
  if (
    state.session?.isChanged() &&
    !confirm('Leave the Character Editor? Unsaved changes will be lost.')
  )
    e.preventDefault();
});
let toastTimer;
function toast(message, error = false) {
  const el = $('toast');
  el.textContent = message;
  el.classList.toggle('error', error);
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), error ? 6000 : 2400);
}

// ---- Keyboard -------------------------------------------------------------------------------
const typing = () => /^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement?.tagName);
document.addEventListener('keydown', (e) => {
  const mod = e.metaKey || e.ctrlKey,
    key = e.key.toLowerCase();
  if (mod && !shell) {
    if (key === 'z') return (e.preventDefault(), typing() || undo(e.shiftKey));
    if (key === 's') return (e.preventDefault(), save());
  }
  if (typing() || mod) return;
  if (e.key === ' ') return (e.preventDefault(), setPlaying(!stage.playing));
  if (key === '1') return setMode('stand');
  if (key === '2') return setMode('walk');
  // Up and down step through the list.
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    const ids = [...$('people').querySelectorAll('[data-id]')].map((b) => b.dataset.id),
      at = ids.indexOf(state.target),
      next = ids[Math.max(0, Math.min(ids.length - 1, at + (e.key === 'ArrowDown' ? 1 : -1)))];
    e.preventDefault();
    if (next) select(next);
  }
});
shell?.onMenu((command) => {
  if (command === 'save') save();
  else if (command === 'playtest' || command === 'playstart') playtest(command === 'playstart');
  else if (typing()) document.execCommand(command);
  else undo(command === 'redo');
});

// For test scripts and the developer console.
window.characterEditor = { state, stage };

async function start() {
  const saved = shell
    ? await shell.read('characters')
    : (await import('../../../public/data/characters.js')).default;
  state.session = new CharacterSession(saved);
  state.session.on(changed);
  // Building the town to find everyone takes a moment: let the message show first.
  await new Promise((resolve) => setTimeout(resolve, 30));
  state.people = findPeople();
  setPlaying(true);
  setMode('stand');
  hint();
  select('player');
  changed();
  $('loading').hidden = true;
  if (!state.people.length) {
    $('loading').hidden = false;
    $('loading').textContent =
      'No one to show: the character models are not downloaded (node scripts/fetch-models.mjs).';
  }
}
start().catch((error) => {
  $('loading').hidden = false;
  $('loading').textContent = /No handler registered/.test(error.message)
    ? 'The editor was updated while it was open. Quit it (⌘Q) and run scripts/world-editor.sh again.'
    : 'The Character Editor could not start: ' + error.message;
  console.error(error);
});
