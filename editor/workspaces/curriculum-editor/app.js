// Curriculum & Code Coach Editor workspace controller: author C++ & MicroPython programming
// patterns, Check Your Understanding multiple-choice questions, and test Code Coach diagnostics
// and custom rules in a live sandbox. Saves to public/data/curriculum.js.
import { CurriculumSession, missions } from './session.js';
import { icon } from '../../ui/icons.js';

const shell = window.editorShell;
const $ = (id) => document.getElementById(id);
const escape = (s) =>
  String(s ?? '').replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c],
  );

const state = {
  session: null,
  savedText: '',
  mode: 'techniques', // 'techniques' | 'sandbox'
  selectedTechnique: 'hold',
  selectedTipId: null,
  search: '',
  pickedChoiceIndex: null,
  sandboxQuest: 0,
  sandboxLang: 'cpp',
  sandboxBoard: 'ESP32',
  sandboxCode:
    'const int lightPin = 34;\nconst int ledPin = 26;\n\nvoid setup() {\n  pinMode(ledPin, OUTPUT);\n}\n\nvoid loop() {\n  int light = analogRead(lightPin);\n  if (light < 1800) {\n    digitalWrite(ledPin, HIGH);\n  } else {\n    digitalWrite(ledPin, LOW);\n  }\n  delay(6000);\n}\n',
};

// ---- Chrome ----
$('home').innerHTML = icon('back');
$('undo').innerHTML = icon('undo');
$('redo').innerHTML = icon('redo');
$('save').innerHTML = icon('save', 16) + 'Save';
$('playtest').innerHTML = icon('play', 16) + 'Play-test';
$('search-icon').innerHTML = icon('search', 16);

for (const btn of $('mode-tabs').querySelectorAll('button')) {
  btn.addEventListener('click', () => {
    state.mode = btn.dataset.mode;
    for (const b of $('mode-tabs').querySelectorAll('button')) {
      b.classList.toggle('active', b.dataset.mode === state.mode);
    }
    $('add-btn').textContent = state.mode === 'techniques' ? '+ New Pattern' : '+ New Coach Rule';
    renderAll();
  });
}

$('add-btn').addEventListener('click', () => {
  if (!state.session) return;
  if (state.mode === 'techniques') {
    const key = state.session.addCustomTechnique();
    state.selectedTechnique = key;
    state.pickedChoiceIndex = null;
    toast(`Added pattern "${key}".`);
  } else {
    const id = state.session.addCoachTip();
    state.selectedTipId = id;
    toast('Added custom Code Coach diagnostic rule.');
  }
  renderAll();
});

$('search').addEventListener('input', (e) => {
  state.search = e.target.value;
  renderList();
});

// ---- Left List ----
function renderList() {
  const s = state.session;
  if (!s) return;
  const q = state.search.trim().toLowerCase();

  if (state.mode === 'techniques') {
    const list = s
      .allTechniques()
      .filter((t) => !q || `${t.key} ${t.title} ${t.body}`.toLowerCase().includes(q));
    $('item-list').innerHTML = list
      .map(
        (t) => `
        <button class="curr-entry ${t.key === state.selectedTechnique ? 'active' : ''}" data-tech="${escape(t.key)}">
          <div class="title-col">
            <strong>${escape(t.title)}</strong>
            <small>${escape(t.key)}</small>
          </div>
          ${t.edited ? '<span class="chip changed">Edited</span>' : !t.builtin ? '<span class="chip">Custom</span>' : ''}
        </button>`,
      )
      .join('');
    for (const btn of $('item-list').querySelectorAll('[data-tech]')) {
      btn.addEventListener('click', () => {
        state.selectedTechnique = btn.dataset.tech;
        state.pickedChoiceIndex = null;
        renderAll();
      });
    }
  } else {
    const tips = s.coachTips.filter(
      (t) => !q || `${t.title} ${t.pattern} ${t.message}`.toLowerCase().includes(q),
    );
    $('item-list').innerHTML = tips.length
      ? tips
          .map(
            (t) => `
          <button class="curr-entry ${t.id === state.selectedTipId ? 'active' : ''}" data-tip="${escape(t.id)}">
            <div class="title-col">
              <strong>${escape(t.title)}</strong>
              <small>${escape(t.language)} · ${escape(t.severity)}</small>
            </div>
          </button>`,
          )
          .join('')
      : `<p class="muted" style="padding:12px">No custom Coach rules yet. Click "+ New Coach Rule" above to add one.</p>`;
    for (const btn of $('item-list').querySelectorAll('[data-tip]')) {
      btn.addEventListener('click', () => {
        state.selectedTipId = btn.dataset.tip;
        renderAll();
      });
    }
  }
}

// ---- Centre Stage ----
function renderStage() {
  const s = state.session;
  if (!s) return;

  if (state.mode === 'techniques') {
    const tech = s.getTechnique(state.selectedTechnique);
    if (!tech) return;
    const q = tech.question;
    $('curr-stage').innerHTML = `
      <div class="curr-card">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <h3>Student Guide Card Preview</h3>
          <span class="chip">${escape(tech.key)}</span>
        </div>
        <h2 style="margin:0">${escape(tech.title)}</h2>
        <p style="margin:0;color:var(--text)">${escape(tech.body)}</p>
        <div class="curr-pattern-grid">
          <div>
            <h3>Arduino C++ Pattern</h3>
            <pre class="curr-pre">${escape(tech.cpp)}</pre>
          </div>
          <div>
            <h3>MicroPython Pattern</h3>
            <pre class="curr-pre">${escape(tech.python)}</pre>
          </div>
        </div>
      </div>

      <div class="curr-card">
        <h3>Interactive "Check Your Understanding" Preview (Click an answer to test feedback)</h3>
        <strong style="font-size:14px">${escape(q.prompt)}</strong>
        <div style="display:flex;flex-direction:column;gap:8px">
          ${q.choices
            .map((c, idx) => {
              const picked = state.pickedChoiceIndex === idx;
              const cls = picked ? (c.right ? 'right' : 'wrong') : '';
              return `
                <button class="curr-choice-btn ${cls}" data-choice="${idx}">
                  <div><b>${c.right ? '✓ ' : ''}${escape(c.text)}</b></div>
                  ${
                    picked
                      ? `<div style="font-size:12px;color:var(--muted)">${escape(c.why)}</div>`
                      : ''
                  }
                </button>`;
            })
            .join('')}
        </div>
      </div>
    `;
    for (const btn of $('curr-stage').querySelectorAll('[data-choice]')) {
      btn.addEventListener('click', () => {
        state.pickedChoiceIndex = Number(btn.dataset.choice);
        renderStage();
      });
    }
    return;
  }

  // Sandbox Mode
  const result = s.evaluateSandbox({
    questIndex: state.sandboxQuest,
    language: state.sandboxLang,
    board: state.sandboxBoard,
    code: state.sandboxCode,
  });

  $('curr-stage').innerHTML = `
    <div class="curr-card">
      <div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between">
        <h3>Live Code Coach &amp; Diagnostics Sandbox</h3>
        <div style="display:flex;gap:8px;align-items:center">
          <select class="select" id="sb-quest">
            ${missions
              .slice(0, 24)
              .map(
                (m, i) =>
                  `<option value="${i}" ${state.sandboxQuest === i ? 'selected' : ''}>${i + 1}. ${escape(m.title)}</option>`,
              )
              .join('')}
          </select>
          <select class="select" id="sb-board">
            <option value="ESP32" ${state.sandboxBoard === 'ESP32' ? 'selected' : ''}>ESP32</option>
            <option value="Raspberry Pi Pico" ${state.sandboxBoard === 'Raspberry Pi Pico' ? 'selected' : ''}>Raspberry Pi Pico</option>
          </select>
          <div class="segmented" id="sb-lang">
            <button data-lang="cpp" class="${state.sandboxLang === 'cpp' ? 'active' : ''}">C++</button>
            <button data-lang="python" class="${state.sandboxLang === 'python' ? 'active' : ''}">Python</button>
          </div>
        </div>
      </div>
      <p class="muted" style="margin:0;font-size:12px">Goal: ${escape(result.mission.goal)}</p>
      <textarea class="input" id="sb-code" rows="10" style="width:100%;height:auto;font:12px/1.45 var(--mono);padding:10px">${escape(state.sandboxCode)}</textarea>
    </div>

    <div class="curr-pattern-grid">
      <div class="curr-card">
        <h3>Code Coach Step Verdicts (${result.steps.length})</h3>
        ${result.steps
          .map(
            (st) => `
          <div class="curr-step-row">
            <span class="curr-step-badge ${escape(st.status)}">${escape(st.status)}</span>
            <div>
              <strong>${escape(st.title)}</strong>
              <div class="muted" style="font-size:11px">${escape(st.detail || st.task)}</div>
            </div>
          </div>`,
          )
          .join('')}
      </div>

      <div class="curr-card">
        <h3>Diagnostics &amp; Custom Coach Rule Matches</h3>
        ${
          result.diagnostics.length === 0 && result.customMatches.length === 0
            ? `<p class="muted">No diagnostic warnings or custom rule triggers on this code.</p>`
            : ''
        }
        ${result.diagnostics
          .map(
            (d) => `
          <div class="curr-step-row">
            <span class="curr-step-badge waiting">${escape(d.severity)}</span>
            <div>
              <strong>Line ${d.line || 1} · ${escape(d.rule)}</strong>
              <div style="font-size:12px">${escape(d.message)}</div>
            </div>
          </div>`,
          )
          .join('')}
        ${result.customMatches
          .map(
            (m) => `
          <div class="curr-step-row" style="border-color:var(--accent)">
            <span class="curr-step-badge manual">Custom ${escape(m.severity)}</span>
            <div>
              <strong>${escape(m.title)}</strong>
              <div style="font-size:12px">${escape(m.message)}</div>
            </div>
          </div>`,
          )
          .join('')}
      </div>
    </div>
  `;

  $('sb-quest').addEventListener('change', (e) => {
    state.sandboxQuest = Number(e.target.value) || 0;
    renderStage();
  });
  $('sb-board').addEventListener('change', (e) => {
    state.sandboxBoard = e.target.value;
    renderStage();
  });
  for (const btn of $('sb-lang').querySelectorAll('button')) {
    btn.addEventListener('click', () => {
      state.sandboxLang = btn.dataset.lang;
      renderStage();
    });
  }
  $('sb-code').addEventListener('input', (e) => {
    state.sandboxCode = e.target.value;
    renderStage();
  });
}

// ---- Right Inspector ----
function renderInspector() {
  const s = state.session;
  if (!s) return;

  if (state.mode === 'techniques') {
    const tech = s.getTechnique(state.selectedTechnique);
    if (!tech) return;
    const q = tech.question;
    $('inspector').innerHTML = `
      <section>
        <h2>${escape(tech.title)}</h2>
        <span class="id">${escape(tech.key)}</span>
      </section>
      <section>
        <h3>Pattern Explanation &amp; Templates</h3>
        <label class="field">
          <span>Title</span>
          <input class="input" id="t-title" value="${escape(tech.title)}" />
        </label>
        <label class="field" style="margin-top:8px;display:block">
          <span>Plain-English Explanation</span>
          <textarea class="input" id="t-body" rows="4" style="height:auto;padding:6px">${escape(tech.body)}</textarea>
        </label>
        <label class="field" style="margin-top:8px;display:block">
          <span>Arduino C++ Template</span>
          <textarea class="input" id="t-cpp" rows="4" style="height:auto;padding:6px;font-family:var(--mono)">${escape(tech.cpp)}</textarea>
        </label>
        <label class="field" style="margin-top:8px;display:block">
          <span>MicroPython Template</span>
          <textarea class="input" id="t-py" rows="4" style="height:auto;padding:6px;font-family:var(--mono)">${escape(tech.python)}</textarea>
        </label>
      </section>
      <section>
        <h3>Check Your Understanding Question</h3>
        <label class="field">
          <span>Question Prompt</span>
          <input class="input" id="q-prompt" value="${escape(q.prompt)}" />
        </label>
        ${q.choices
          .map(
            (c, idx) => `
          <div style="margin-top:10px;padding:8px;border:1px solid var(--line);border-radius:6px">
            <label style="font-size:11px;color:${c.right ? 'var(--ok)' : 'var(--muted)'}">
              ${c.right ? '✓ Correct Answer' : `Distractor ${idx}`}
            </label>
            <input class="input" data-c-text="${idx}" value="${escape(c.text)}" style="margin-top:4px" placeholder="Answer text" />
            <input class="input" data-c-why="${idx}" value="${escape(c.why)}" style="margin-top:4px" placeholder="Why this is right or wrong" />
          </div>`,
          )
          .join('')}
      </section>
      <section>
        <div class="actions">
          ${
            tech.builtin
              ? `<button class="button" id="t-reset" ${!tech.edited ? 'disabled' : ''}>Reset to Built-in</button>`
              : `<button class="button danger" id="t-del">Delete Pattern</button>`
          }
        </div>
      </section>
    `;

    $('t-title').addEventListener('change', (e) =>
      s.updateTechnique(tech.key, { title: e.target.value }),
    );
    $('t-body').addEventListener('change', (e) =>
      s.updateTechnique(tech.key, { body: e.target.value }),
    );
    $('t-cpp').addEventListener('change', (e) =>
      s.updateTechnique(tech.key, { cpp: e.target.value }),
    );
    $('t-py').addEventListener('change', (e) =>
      s.updateTechnique(tech.key, { python: e.target.value }),
    );
    $('q-prompt').addEventListener('change', (e) =>
      s.updateQuestion(tech.key, { prompt: e.target.value }),
    );

    const saveChoices = () => {
      const nextChoices = q.choices.map((orig, idx) => ({
        right: orig.right,
        text: document.querySelector(`[data-c-text="${idx}"]`)?.value || orig.text,
        why: document.querySelector(`[data-c-why="${idx}"]`)?.value || orig.why,
      }));
      s.updateQuestion(tech.key, { choices: nextChoices });
    };
    for (const input of $('inspector').querySelectorAll('[data-c-text], [data-c-why]')) {
      input.addEventListener('change', saveChoices);
    }
    $('t-reset')?.addEventListener('click', () => {
      s.resetTechnique(tech.key);
      toast('Reset pattern to built-in.');
    });
    $('t-del')?.addEventListener('click', () => {
      s.removeCustomTechnique(tech.key);
      state.selectedTechnique = 'hold';
      toast('Deleted custom pattern.');
    });
    return;
  }

  // Sandbox / Coach Rule Inspector
  const tip = s.coachTips.find((t) => t.id === state.selectedTipId) || s.coachTips[0];
  if (!tip) {
    $('inspector').innerHTML = `
      <section>
        <h2>Custom Code Coach Rules</h2>
        <p class="muted">Click "+ New Coach Rule" in the top bar to add a custom diagnostic hint that triggers when student code matches a regular expression.</p>
      </section>`;
    return;
  }
  state.selectedTipId = tip.id;
  $('inspector').innerHTML = `
    <section>
      <h2>${escape(tip.title)}</h2>
      <span class="id">${escape(tip.id)}</span>
    </section>
    <section>
      <h3>Rule Configuration</h3>
      <label class="field">
        <span>Rule Title</span>
        <input class="input" id="r-title" value="${escape(tip.title)}" />
      </label>
      <label class="field" style="margin-top:8px;display:block">
        <span>Regex Match Pattern</span>
        <input class="input" id="r-pattern" value="${escape(tip.pattern)}" style="font-family:var(--mono)" />
      </label>
      <div class="grid2">
        <label class="field">
          <span>Language</span>
          <select class="select" id="r-lang" style="width:100%">
            <option value="both" ${tip.language === 'both' ? 'selected' : ''}>Both</option>
            <option value="cpp" ${tip.language === 'cpp' ? 'selected' : ''}>Arduino C++</option>
            <option value="python" ${tip.language === 'python' ? 'selected' : ''}>MicroPython</option>
          </select>
        </label>
        <label class="field">
          <span>Severity</span>
          <select class="select" id="r-sev" style="width:100%">
            <option value="tip" ${tip.severity === 'tip' ? 'selected' : ''}>Tip</option>
            <option value="warning" ${tip.severity === 'warning' ? 'selected' : ''}>Warning</option>
          </select>
        </label>
      </div>
      <label class="field" style="margin-top:8px;display:block">
        <span>Student Feedback Message</span>
        <textarea class="input" id="r-msg" rows="4" style="height:auto;padding:6px">${escape(tip.message)}</textarea>
      </label>
    </section>
    <section>
      <button class="button danger" id="r-del">Delete Coach Rule</button>
    </section>
  `;

  $('r-title').addEventListener('change', (e) =>
    s.updateCoachTip(tip.id, { title: e.target.value }),
  );
  $('r-pattern').addEventListener('change', (e) =>
    s.updateCoachTip(tip.id, { pattern: e.target.value }),
  );
  $('r-lang').addEventListener('change', (e) =>
    s.updateCoachTip(tip.id, { language: e.target.value }),
  );
  $('r-sev').addEventListener('change', (e) =>
    s.updateCoachTip(tip.id, { severity: e.target.value }),
  );
  $('r-msg').addEventListener('change', (e) =>
    s.updateCoachTip(tip.id, { message: e.target.value }),
  );
  $('r-del').addEventListener('click', () => {
    s.removeCoachTip(tip.id);
    state.selectedTipId = s.coachTips[0]?.id || null;
    toast('Removed Coach rule.');
  });
}

// ---- Save, Undo/Redo & Play-test ----
function isDirty() {
  return Boolean(state.session && JSON.stringify(state.session.savedFile()) !== state.savedText);
}

function updateChrome() {
  const dirty = isDirty();
  const el = $('save-state');
  el.textContent = dirty ? 'Unsaved changes' : 'Saved';
  el.classList.toggle('unsaved', dirty);
  $('undo').disabled = !state.session?.undoStack.length;
  $('redo').disabled = !state.session?.redoStack.length;
}

function renderAll() {
  updateChrome();
  renderList();
  renderStage();
  renderInspector();
}

async function save() {
  const errors = state.session.check().filter((p) => p.error);
  if (errors.length) {
    toast(errors[0].text, true);
    return false;
  }
  try {
    const file = state.session.savedFile();
    if (shell) await shell.write('curriculum', file);
    state.savedText = JSON.stringify(file);
    updateChrome();
    toast('Saved to public/data/curriculum.js');
    return true;
  } catch (err) {
    toast('Could not save: ' + err.message, true);
    return false;
  }
}

async function playtest(fromStart = false) {
  if (isDirty()) {
    if (!confirm('Save curriculum changes before opening the game?')) return;
    if (!(await save())) return;
  }
  shell?.openGame(fromStart ? null : { quest: state.sandboxQuest || 0 });
}

$('undo').addEventListener('click', () => {
  const label = state.session?.undo();
  if (label) toast(`Undid: ${label}`);
});
$('redo').addEventListener('click', () => {
  const label = state.session?.redo();
  if (label) toast(`Redid: ${label}`);
});
$('save').addEventListener('click', save);
$('playtest').addEventListener('click', (e) => playtest(e.shiftKey));

shell?.onMenu((cmd) => {
  if (cmd === 'save') save();
  else if (cmd === 'playtest' || cmd === 'playstart') playtest(cmd === 'playstart');
  else if (cmd === 'undo') state.session?.undo();
  else if (cmd === 'redo') state.session?.redo();
});

let toastTimer;
function toast(msg, error = false) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.toggle('error', error);
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), error ? 5000 : 2500);
}

async function start() {
  const data = shell
    ? await shell.read('curriculum')
    : (await import('../../../public/data/curriculum.js')).default;
  state.session = new CurriculumSession(data);
  state.savedText = JSON.stringify(state.session.savedFile());
  state.session.on(() => renderAll());
  renderAll();
}

start();
window.curriculumEditor = { state };
