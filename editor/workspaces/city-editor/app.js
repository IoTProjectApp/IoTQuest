// The City Editor workspace: the cities, a city's home quests as the game words them there, the
// fields that word them (household names, the request opening, titles and requests), and saving
// to public/data/cities.js.
import { CitySession, HOUSEHOLD, HOME_QUESTS, DEFAULT_OPENING, locations } from './session.js';
import { icon } from '../../ui/icons.js';

const shell = window.editorShell;
const $ = (id) => document.getElementById(id);
const escape = (s) =>
  String(s ?? '').replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c],
  );
const byId = new Map(locations.map((l) => [l.id, l]));
// What each of the household looks after at home, to say who is who.
const ROLES = { Maya: 'the garden', Alex: 'the home', Sam: 'the workshop' };

const state = {
  session: null,
  city: locations[0].id,
  quest: 0,
  level: 'beginner',
  search: '',
};

// ---- Chrome ---------------------------------------------------------------------------------
$('home').innerHTML = icon('back');
$('undo').innerHTML = icon('undo');
$('redo').innerHTML = icon('redo');
$('save').innerHTML = icon('save', 16) + 'Save';
$('playtest').innerHTML = icon('play', 16) + 'Play-test';
$('search-icon').innerHTML = icon('search', 16);
for (const b of $('levels').querySelectorAll('button'))
  b.addEventListener('click', () => {
    state.level = b.dataset.level;
    renderAll();
  });

// ---- The cities -----------------------------------------------------------------------------
function renderCities() {
  const s = state.session,
    search = state.search.trim().toLowerCase(),
    bad = new Set(
      s
        .check()
        .filter((p) => p.error)
        .map((p) => p.city),
    ),
    shown = [...locations]
      .filter(
        (l) =>
          !search ||
          l.city.toLowerCase().includes(search) ||
          String(l.country || '')
            .toLowerCase()
            .includes(search),
      )
      .sort((a, b) => a.city.localeCompare(b.city));
  $('cities').innerHTML = shown.length
    ? shown
        .map(
          (
            l,
          ) => `<button class="entry ${l.id === state.city ? 'active' : ''}" data-city="${escape(l.id)}">
          <span class="state ${bad.has(l.id) ? 'bad' : s.isEdited(l.id) ? 'ok' : ''}" title="${bad.has(l.id) ? 'Has problems' : s.isEdited(l.id) ? 'Has your wording' : ''}"></span>
          <span class="label">${escape(l.city)}</span><span class="meta">${escape(l.country || '')}</span></button>`,
        )
        .join('')
    : '<p class="empty">No city matches.</p>';
  for (const b of $('cities').querySelectorAll('[data-city]'))
    b.addEventListener('click', () => {
      flush();
      state.city = b.dataset.city;
      renderAll();
    });
}
$('search').addEventListener('input', (e) => {
  state.search = e.target.value;
  renderCities();
});

// ---- The city's home quests -----------------------------------------------------------------
function renderQuests() {
  for (const b of $('levels').querySelectorAll('button'))
    b.classList.toggle('active', b.dataset.level === state.level);
  const s = state.session,
    location = byId.get(state.city),
    names = s.names(state.city),
    own = s.own(state.city),
    quests = s.quests(state.city, state.level).slice(0, HOME_QUESTS);
  $('quests').innerHTML = `<div class="city-head">
      <div><h1>${escape(location.city)}</h1><p>${escape([location.country, location.architecture].filter(Boolean).join(' · '))}</p></div>
      <div class="household">${HOUSEHOLD.map(
        (p) =>
          `<span class="chip ${own.names?.[p] ? 'changed' : ''}" title="${escape(p)} at home, who looks after ${ROLES[p]}">${escape(names[p])}</span>`,
      ).join('')}</div></div>
    <p class="note">The home's quests as ${escape(location.city)} words them at ${state.level} level. Click one to change its title or request.</p>
    <div class="quest-cards">${quests
      .map((m, i) => {
        const changed = own.titles?.[i] || own.quotes?.[i];
        return `<button class="quest-card ${i === state.quest ? 'active' : ''}" data-quest="${i}">
          <div class="quest-top"><span class="number">${i + 1}</span><strong>${escape(m.title)}</strong>
            ${changed ? '<span class="chip changed">changed</span>' : ''}</div>
          <p class="who">${escape(m.resident)} · ${escape(m.area)}</p>
          <p class="quote">${escape(m.quote)}</p></button>`;
      })
      .join('')}</div>`;
  for (const b of $('quests').querySelectorAll('[data-quest]'))
    b.addEventListener('click', () => {
      flush();
      state.quest = Number(b.dataset.quest);
      renderQuests();
      renderFields();
    });
}

// ---- The fields -----------------------------------------------------------------------------
// Typing changes the session after a pause; undo then takes back the whole edit.
const pending = new Map(),
  flushers = new Map();
function later(key, run) {
  clearTimeout(pending.get(key));
  pending.set(
    key,
    setTimeout(() => {
      pending.delete(key);
      run();
    }, 300),
  );
}
function flush() {
  for (const [key, timer] of pending) {
    clearTimeout(timer);
    pending.delete(key);
    flushers.get(key)?.();
  }
}
const problemsFor = (field) =>
  state.session
    .check([state.city])
    .filter((p) => p.field === field)
    .map(
      (p) =>
        `<p class="problem ${p.error ? 'error' : 'warning'}">${icon('warning', 14)}<span>${escape(p.text)}</span></p>`,
    )
    .join('');

function renderFields() {
  const s = state.session,
    id = state.city,
    location = byId.get(id),
    original = s.originalNames(id),
    own = s.own(id),
    i = state.quest,
    code = s.codeWording(id, i, state.level);
  $('fields').innerHTML = `
    <section><h2>${escape(location.city)}</h2>
      <p class="muted">Blank fields keep what the game says. Saved names are used everywhere the game names the household: chats, quests and the Conversation Editor.</p></section>
    <section><h3>The household</h3>
      ${HOUSEHOLD.map(
        (
          p,
        ) => `<label class="field"><span>${escape(p)} <small>looks after ${ROLES[p]}</small></span>
          <input class="input" data-name="${p}" value="${escape(own.names?.[p] ?? '')}" placeholder="${escape(original[p])}" maxlength="40" />
          <span data-problems="names:${p}">${problemsFor('names:' + p)}</span></label>`,
      ).join('')}
    </section>
    <section><h3>How requests open</h3>
      <label class="field"><input class="input" id="opening" value="${escape(own.opening ?? '')}" placeholder="${escape(DEFAULT_OPENING)}" maxlength="120" />
        <small>{city} is the city's name and {request} the resident's request, its first letter lowercased.</small>
        <span data-problems="opening">${problemsFor('opening')}</span></label>
    </section>
    <section><h3>Quest ${i + 1}</h3>
      <label class="field"><span>Title</span>
        <input class="input" id="title" value="${escape(own.titles?.[i] ?? '')}" placeholder="${escape(code.title)}" maxlength="80" />
        <span data-problems="titles:${i}">${problemsFor('titles:' + i)}</span></label>
      <label class="field"><span>Request</span>
        <textarea id="quote" rows="4" placeholder="${escape(code.quote)}">${escape(own.quotes?.[i] ?? '')}</textarea>
        <small>Written without the opening, which is added. Used at both levels.</small>
        <span data-problems="quotes:${i}">${problemsFor('quotes:' + i)}</span></label>
    </section>
    ${s.isEdited(id) ? `<section><button class="button" id="reset">${icon('reset', 16)}Reset ${escape(location.city)} to the game's wording</button></section>` : ''}`;
  const bind = (el, key, apply) => {
    flushers.set(key, apply);
    el.addEventListener('input', () => later(key, apply));
    // After the click that moved the focus, so redrawing the cards does not swallow it.
    el.addEventListener('blur', () => setTimeout(flush));
  };
  for (const input of $('fields').querySelectorAll('[data-name]'))
    bind(input, 'name:' + input.dataset.name, () =>
      s.setName(id, input.dataset.name, input.value, true),
    );
  bind($('opening'), 'opening', () => s.setOpening(id, $('opening').value, true));
  bind($('title'), 'title', () => s.setWording(id, 'titles', i, $('title').value, true));
  bind($('quote'), 'quote', () => s.setWording(id, 'quotes', i, $('quote').value, true));
  $('reset')?.addEventListener('click', () => {
    flush();
    s.reset(id);
    renderFields();
  });
}
// The problems under each field, without drawing the fields again (that would lose the cursor).
function renderProblems() {
  for (const el of $('fields').querySelectorAll('[data-problems]'))
    el.innerHTML = problemsFor(el.dataset.problems);
}

// ---- Changes and saving ---------------------------------------------------------------------
function renderStatus() {
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
}
function changed() {
  renderStatus();
  renderCities();
  renderQuests();
  renderProblems();
}
function renderAll() {
  renderStatus();
  renderCities();
  renderQuests();
  renderFields();
}
async function save() {
  flush();
  const problem = state.session.check().find((p) => p.error);
  if (problem) {
    state.city = problem.city;
    const index = /^(titles|quotes):(\d+)$/.exec(problem.field || '')?.[2];
    if (index !== undefined) state.quest = Number(index);
    renderAll();
    toast(problem.text, true);
    return false;
  }
  try {
    await shell.write('cities', state.session.savedFile());
  } catch (error) {
    toast('Could not save: ' + error.message, true);
    return false;
  }
  state.session.markSaved();
  toast('Saved to public/data/cities.js');
  return true;
}
function undo(redo = false) {
  flush();
  const text = redo ? state.session.redo() : state.session.undo();
  if (text) {
    renderFields();
    toast(`${redo ? 'Redid' : 'Undid'}: ${text}`);
  }
}
async function playtest(fromStart = false) {
  flush();
  if (state.session.isChanged()) {
    if (!confirm('The game plays saved wording only. Save now and open the game?')) return;
    if (!(await save())) return;
  }
  // In the selected city.
  shell.openGame(fromStart ? null : { city: state.city });
}
$('undo').addEventListener('click', () => undo());
$('redo').addEventListener('click', () => undo(true));
$('save').addEventListener('click', save);
$('playtest').addEventListener('click', (e) => playtest(e.shiftKey));
$('home').addEventListener('click', (e) => {
  flush();
  if (
    state.session?.isChanged() &&
    !confirm('Leave the City Editor? Unsaved changes will be lost.')
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
const typing = () => /^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement?.tagName);
document.addEventListener('keydown', (e) => {
  const mod = e.metaKey || e.ctrlKey,
    key = e.key.toLowerCase();
  if (mod && !shell) {
    if (key === 'z') return (e.preventDefault(), typing() || undo(e.shiftKey));
    if (key === 's') return (e.preventDefault(), save());
  }
});
shell?.onMenu((command) => {
  if (command === 'save') save();
  else if (command === 'playtest' || command === 'playstart') playtest(command === 'playstart');
  else if (typing()) document.execCommand(command);
  else undo(command === 'redo');
});

// For test scripts and the developer console.
window.cityEditor = { state };

async function start() {
  const saved = shell
    ? await shell.read('cities')
    : (await import('../../../public/data/cities.js')).default;
  state.session = new CitySession(saved);
  state.session.on(changed);
  renderAll();
}
start().catch((error) => {
  $('quests').innerHTML = `<div class="blank"><h2>The City Editor could not start</h2><p>${
    /No handler registered/.test(error.message)
      ? 'The editor was updated while it was open. Quit it (⌘Q) and run scripts/world-editor.sh again.'
      : escape(error.message)
  }</p></div>`;
  console.error(error);
});
