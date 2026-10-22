// The Conversation Editor workspace: everyone in the game who asks for something, a chat with them
// as the game plays it, their lines and their requests, and saving to public/data/conversations.js
// (and, for requests, public/data/quests.js).
import {
  questionsFor,
  chooseRequest,
  sendConversationMessage,
} from '../../../public/conversations.js';
import {
  ConversationSession,
  EVERYONE,
  LINES,
  PLACEHOLDERS,
  MAX_LENGTH,
  locations,
} from './session.js';
import { icon } from '../../ui/icons.js';

const shell = window.editorShell;
const $ = (id) => document.getElementById(id);
const escape = (s) =>
  String(s ?? '').replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c],
  );
// Each line: its name, and when it is said.
const ABOUT = {
  greeting: ['Greeting', 'How they open a chat.'],
  looksAfter: ['Looks after', 'After the greeting, when you visit a room they look after.'],
  urgent: ['Urgent', 'First, when the weather or the house makes a request urgent.'],
  ask: ['Invitation', 'After what they ask for: what to ask them about.'],
  noRequests: ['Nothing to ask', 'How they open a chat when they have no requests.'],
  thanks: ['Thanks', 'When a request has passed, with what it now does ({effect}).'],
  thanksPlain: ['Thanks, plain', 'When a request with nothing to watch has passed.'],
  next: ['Next', 'Leads from their thanks to their next request.'],
  idle: ['No requests reply', 'Their answer to any question when they have nothing to ask.'],
  about: [
    'About me',
    'Their answer to “Tell me about yourself”. With none, that question is not offered.',
  ],
};
// Whose chat shows while everyone's lines are being written.
const SAMPLE = 'Maya';

const state = {
  session: null,
  person: EVERYONE,
  city: null,
  // For someone in a city: their lines 'everywhere' or 'city' only.
  scope: 'everywhere',
  moment: 'hello',
  // What has been asked in the chat so far, played again whenever the lines change.
  asked: [],
  search: '',
};

// ---- Chrome ---------------------------------------------------------------------------------
$('home').innerHTML = icon('back');
$('undo').innerHTML = icon('undo');
$('redo').innerHTML = icon('redo');
$('save').innerHTML = icon('save', 16) + 'Save';
$('playtest').innerHTML = icon('play', 16) + 'Play-test';
$('search-icon').innerHTML = icon('search', 16);
$('city').innerHTML =
  '<option value="">Home</option>' +
  [...locations]
    .sort((a, b) => a.city.localeCompare(b.city))
    .map((l) => `<option value="${escape(l.id)}">${escape(l.city)}</option>`)
    .join('');
$('city').addEventListener('change', (e) => {
  state.city = e.target.value || null;
  if (!state.city) state.scope = 'everywhere';
  state.asked = [];
  renderAll();
});
for (const b of $('moments').querySelectorAll('button'))
  b.addEventListener('click', () => {
    state.moment = b.dataset.moment;
    state.asked = [];
    renderChat();
  });

// Where an edit lands: everyone, someone everywhere, or someone in this city only.
const scopeCity = () => (state.person !== EVERYONE && state.scope === 'city' ? state.city : null);

// ---- The people -----------------------------------------------------------------------------
function renderPeople() {
  const s = state.session,
    search = state.search.trim().toLowerCase(),
    shown = s
      .people()
      .filter(
        (p) =>
          !search ||
          p.name.toLowerCase().includes(search) ||
          s.nameIn(p.name, state.city).toLowerCase().includes(search),
      ),
    problems = new Set(
      s
        .check()
        .filter((p) => p.error)
        .map((p) => p.person),
    );
  const entry = (person, label, meta) => {
    const edited = s.hasLines(person) || (person !== EVERYONE && quotesEdited(person));
    return `<button class="entry ${state.person === person ? 'active' : ''}" data-person="${escape(person)}">
      ${problems.has(person) ? '<span class="state bad" title="Has problems"></span>' : edited ? '<span class="state ok" title="Has your lines"></span>' : '<span class="state"></span>'}
      <span class="label">${escape(label)}</span><span class="meta">${escape(meta)}</span></button>`;
  };
  $('people').innerHTML =
    entry(EVERYONE, 'Everyone', 'defaults') +
    '<h3>People</h3>' +
    (shown.length
      ? shown
          .map((p) => {
            const called = s.nameIn(p.name, state.city);
            return entry(
              p.name,
              called === p.name ? p.name : `${called} (${p.name})`,
              p.requests.length + (p.requests.length === 1 ? ' request' : ' requests'),
            );
          })
          .join('')
      : '<p class="empty">Nobody matches.</p>');
  for (const b of $('people').querySelectorAll('[data-person]'))
    b.addEventListener('click', () => pickPerson(b.dataset.person));
}
const quotesEdited = (person) =>
  state.session
    .people()
    .find((p) => p.name === person)
    ?.requests.some((r) => state.session.quoteEdited(r)) ?? false;
$('search').addEventListener('input', (e) => {
  state.search = e.target.value;
  renderPeople();
});
function pickPerson(person) {
  state.person = person;
  state.asked = [];
  renderAll();
}

// ---- The chat -------------------------------------------------------------------------------
function currentChat() {
  const person = state.person === EVERYONE ? SAMPLE : state.person,
    chat = state.session.chat(person, { city: state.city, moment: state.moment });
  for (const step of state.asked)
    if ('choose' in step) chooseRequest(chat, step.choose);
    else sendConversationMessage(chat, step.ask);
  return chat;
}
function renderChat() {
  for (const b of $('moments').querySelectorAll('button'))
    b.classList.toggle('active', b.dataset.moment === state.moment);
  const chat = currentChat(),
    city = locations.find((l) => l.id === state.city)?.city;
  $('chat-title').textContent = `A chat with ${chat.resident}${city ? ' in ' + city : ''}`;
  $('chat-note').textContent =
    state.person === EVERYONE
      ? `Everyone's lines, shown in a chat with ${chat.resident}. Pick someone to write theirs.`
      : 'As the game plays it. Ask a question or pick a request below to hear more.';
  $('chat-log').innerHTML = chat.messages
    .map((m) => {
      const name = m.speaker === 'resident' ? chat.resident : 'You';
      return `<div class="bubble from-${m.speaker}"><span class="avatar">${escape(name.charAt(0).toUpperCase())}</span>
        <div><strong>${escape(name)}</strong><p>${escape(m.text)}</p></div></div>`;
    })
    .join('');
  $('chat-log').scrollTop = $('chat-log').scrollHeight;
  $('chat-ask').innerHTML =
    `<div class="questions">${questionsFor(chat)
      .map((q) => `<button class="button" data-ask="${escape(q)}">${escape(q)}</button>`)
      .join('')}</div>
    <form class="ask-form" id="ask-form"><input class="input" id="ask-input" maxlength="240"
      autocomplete="off" placeholder="Ask anything, as a player would…" />
      <button class="button primary" type="submit">Ask</button>
      <button class="button" type="button" id="restart" title="Start the chat again">${icon('reset', 16)}Start over</button></form>` +
    (chat.requests.length > 1
      ? `<details class="their-requests"><summary>Their requests (${chat.requests.length})</summary><div>${chat.requests
          .map(
            (r) =>
              `<button class="chip ${r.index === chat.selectedIndex ? 'changed' : ''}" data-choose="${r.index}">${escape(r.mission.title)}</button>`,
          )
          .join('')}</div></details>`
      : '');
  const ask = (step) => {
    state.asked.push(step);
    renderChat();
  };
  for (const b of $('chat-ask').querySelectorAll('[data-ask]'))
    b.addEventListener('click', () => ask({ ask: b.dataset.ask }));
  for (const b of $('chat-ask').querySelectorAll('[data-choose]'))
    b.addEventListener('click', () => ask({ choose: Number(b.dataset.choose) }));
  $('ask-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const text = $('ask-input').value.trim();
    if (text) ask({ ask: text });
    $('ask-input').focus();
  });
  $('restart').addEventListener('click', () => {
    state.asked = [];
    renderChat();
  });
}

// ---- Lines and requests ---------------------------------------------------------------------
// Typing changes the session after a pause; undo then takes back the whole edit.
const pending = new Map();
function later(key, run) {
  clearTimeout(pending.get(key));
  pending.set(
    key,
    setTimeout(() => {
      pending.delete(key);
      run();
    }, 350),
  );
}
function flush() {
  for (const [key, timer] of pending) {
    clearTimeout(timer);
    pending.delete(key);
    flushers.get(key)?.();
  }
}
const flushers = new Map();

function renderLines() {
  const s = state.session,
    person = state.person,
    city = scopeCity(),
    cityName = locations.find((l) => l.id === state.city)?.city,
    own = s.own(person, city);
  const heading =
    person === EVERYONE
      ? `<h2>Everyone</h2><p class="muted">What everyone says unless their own lines say otherwise.</p>`
      : `<h2>${escape(s.nameIn(person, state.city))}</h2>
         <p class="muted">${s.nameIn(person, state.city) === person ? '' : `Called ${escape(person)} at home. `}Blank lines say what everyone says.</p>` +
        (state.city
          ? `<div class="segmented scope" role="group" aria-label="Where these lines apply">
              <button data-scope="everywhere" class="${state.scope === 'everywhere' ? 'active' : ''}">Everywhere</button>
              <button data-scope="city" class="${state.scope === 'city' ? 'active' : ''}">Only in ${escape(cityName)}</button></div>`
          : '');
  const slots = Object.keys(LINES)
    .map((slot) => {
      const [name, when] = ABOUT[slot],
        inherited = s.inherited(person, city, slot),
        written = own[slot];
      return `<div class="line ${written !== undefined ? 'own' : ''}">
        <div class="line-head"><strong>${name}</strong>
          ${written !== undefined ? `<button class="link" data-clear="${slot}" title="Say what ${person === EVERYONE ? 'the game' : 'everyone'} says">${icon('reset', 14)}Clear</button>` : ''}</div>
        <small>${escape(when)}</small>
        <textarea data-slot="${slot}" rows="2" maxlength="${MAX_LENGTH}" placeholder="${escape(inherited || 'Nothing')}">${escape(written ?? '')}</textarea>
        <div class="words">${PLACEHOLDERS[slot].map((w) => `<button class="word" data-word="${w}" data-for="${slot}" title="Insert {${w}}">{${w}}</button>`).join('')}</div>
      </div>`;
    })
    .join('');
  const person_ = s.people().find((p) => p.name === person);
  const requests = person_
    ? `<section><h3>What they ask for</h3>
        <p class="muted">Each request's opening words, saved with the quests (public/data/quests.js) so the Quest Editor shows them too.${state.city ? ' Cities open them with “Here in …”, and some reword the first home quests.' : ''}</p>
        ${person_.requests
          .map((ref) => {
            const q = s.request(ref),
              key = ref.kind === 'builtin' ? 'b' + ref.index : 'm' + ref.id,
              edited = s.quoteEdited(ref);
            return `<details class="request" ${edited ? 'open' : ''}><summary><span class="label">${escape(q.title)}</span>
              ${edited ? '<span class="chip changed">changed</span>' : ''}<span class="meta">${escape(q.area)}</span></summary>
              <textarea data-quote="${escape(key)}" rows="3">${escape(q.quote ?? '')}</textarea>
              ${edited ? `<button class="link" data-reset-quote="${escape(key)}">${icon('reset', 14)}Reset to the original</button>` : ''}
            </details>`;
          })
          .join('')}</section>`
    : '';
  $('lines').innerHTML =
    `<section>${heading}</section><section class="problems" id="problems"></section>
     <section><h3>Lines</h3>${slots}
       ${Object.keys(own).length ? `<button class="button" id="reset-person">${icon('reset', 16)}Clear all these lines</button>` : ''}</section>` +
    requests;
  bindLines(person_);
  renderProblems();
}
function bindLines(person_) {
  const s = state.session,
    person = state.person,
    city = scopeCity();
  for (const b of $('lines').querySelectorAll('[data-scope]'))
    b.addEventListener('click', () => {
      flush();
      state.scope = b.dataset.scope;
      renderLines();
    });
  for (const area of $('lines').querySelectorAll('[data-slot]')) {
    const slot = area.dataset.slot,
      key = 'line:' + slot,
      apply = () => {
        area.closest('.line').classList.toggle('own', area.value !== '');
        s.setLine(person, city, slot, area.value === '' ? null : area.value, true);
      };
    flushers.set(key, apply);
    area.addEventListener('input', () => later(key, apply));
    area.addEventListener('blur', flush);
  }
  for (const b of $('lines').querySelectorAll('[data-clear]'))
    b.addEventListener('click', () => {
      flush();
      s.setLine(person, city, b.dataset.clear, null);
      renderLines();
    });
  // A placeholder goes in where the cursor is.
  for (const b of $('lines').querySelectorAll('[data-word]')) {
    b.addEventListener('mousedown', (e) => e.preventDefault());
    b.addEventListener('click', () => {
      const area = $('lines').querySelector(`[data-slot="${b.dataset.for}"]`),
        word = `{${b.dataset.word}}`;
      if (area.value === '' && document.activeElement !== area) area.value = area.placeholder;
      const at = document.activeElement === area ? area.selectionStart : area.value.length;
      area.value = area.value.slice(0, at) + word + area.value.slice(area.selectionEnd ?? at);
      area.focus();
      area.selectionStart = area.selectionEnd = at + word.length;
      area.dispatchEvent(new Event('input'));
    });
  }
  $('reset-person')?.addEventListener('click', () => {
    flush();
    s.resetPerson(person, city);
    renderLines();
  });
  if (!person_) return;
  const refOf = (key) =>
    key.startsWith('b')
      ? { kind: 'builtin', index: Number(key.slice(1)) }
      : { kind: 'mine', id: key.slice(1) };
  for (const area of $('lines').querySelectorAll('[data-quote]')) {
    const key = 'quote:' + area.dataset.quote,
      apply = () => s.setQuote(refOf(area.dataset.quote), area.value, true);
    flushers.set(key, apply);
    area.addEventListener('input', () => later(key, apply));
    area.addEventListener('blur', flush);
  }
  for (const b of $('lines').querySelectorAll('[data-reset-quote]'))
    b.addEventListener('click', () => {
      flush();
      s.resetQuote(refOf(b.dataset.resetQuote));
      renderLines();
    });
}
function renderProblems() {
  const s = state.session,
    mine = s
      .check()
      .filter((p) => p.person === state.person && (p.request || (p.city ?? null) === scopeCity()));
  const el = $('problems');
  if (!el) return;
  el.hidden = !mine.length;
  el.innerHTML = mine.length
    ? `<ul class="issues">${mine
        .map(
          (p) =>
            `<li class="${p.error ? 'error' : 'warning'}">${icon('warning', 14)}<span>${escape(p.text)}</span></li>`,
        )
        .join('')}</ul>`
    : '';
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
// After any change: everything but the fields being typed in.
function changed() {
  renderStatus();
  renderPeople();
  renderChat();
  renderProblems();
}
function renderAll() {
  $('city').value = state.city ?? '';
  renderStatus();
  renderPeople();
  renderChat();
  renderLines();
}
async function save() {
  flush();
  const s = state.session,
    problem = s.check().find((p) => p.error);
  if (problem) {
    state.person = problem.person;
    state.scope = problem.city ? 'city' : 'everywhere';
    if (problem.city) state.city = problem.city;
    renderAll();
    toast(problem.text, true);
    return false;
  }
  const wrote = [];
  try {
    if (s.linesChanged()) {
      await shell.write('conversations', s.savedLinesFile());
      wrote.push('public/data/conversations.js');
    }
    if (s.questsChanged()) {
      await shell.write('quests', s.questSession.savedFile());
      wrote.push('public/data/quests.js');
    }
  } catch (error) {
    toast('Could not save: ' + error.message, true);
    return false;
  }
  s.markSaved();
  toast('Saved to ' + wrote.join(' and '));
  return true;
}
function undo(redo = false) {
  flush();
  const text = redo ? state.session.redo() : state.session.undo();
  if (text) {
    renderLines();
    toast(`${redo ? 'Redid' : 'Undid'}: ${text}`);
  }
}
async function playtest() {
  flush();
  if (state.session.isChanged()) {
    if (!confirm('The game plays saved lines only. Save now and open the game?')) return;
    if (!(await save())) return;
  }
  shell.openGame();
}
$('undo').addEventListener('click', () => undo());
$('redo').addEventListener('click', () => undo(true));
$('save').addEventListener('click', save);
$('playtest').addEventListener('click', playtest);
$('home').addEventListener('click', (e) => {
  flush();
  if (
    state.session?.isChanged() &&
    !confirm('Leave the Conversation Editor? Unsaved changes will be lost.')
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
  else if (command === 'playtest') playtest();
  else if (typing()) document.execCommand(command);
  else undo(command === 'redo');
});

// For test scripts and the developer console.
window.conversationEditor = { state };

async function start() {
  const [lines, quests] = shell
    ? await Promise.all([shell.read('conversations'), shell.read('quests')])
    : await Promise.all([
        import('../../../public/data/conversations.js').then((m) => m.default),
        import('../../../public/data/quests.js').then((m) => m.default),
      ]);
  state.session = new ConversationSession(lines, quests);
  state.session.on(changed);
  renderAll();
}
start().catch((error) => {
  $('lines').innerHTML =
    `<section><h2>The Conversation Editor could not start</h2><p class="muted">${
      /No handler registered/.test(error.message)
        ? 'The editor was updated while it was open. Quit it (⌘Q) and run scripts/world-editor.sh again.'
        : escape(error.message)
    }</p></section>`;
  console.error(error);
});
