// Component & Circuit Lab workspace controller: component catalogue, interactive breadboard &
// GPIO pinout diagram, live oscilloscope waveform tester, C++ / MicroPython / Serial Link code
// preview, and saving to public/data/components.js.
import { ComponentSession, AREAS, RESISTOR_OPTIONS } from './session.js';
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
  selectedId: 'ldr',
  board: 'ESP32',
  filter: 'all',
  search: '',
  stimulus: 65,
  codeTab: 'cpp', // 'cpp' | 'python' | 'serial'
};

// ---- Chrome ----
$('home').innerHTML = icon('back');
$('undo').innerHTML = icon('undo');
$('redo').innerHTML = icon('redo');
$('save').innerHTML = icon('save', 16) + 'Save';
$('playtest').innerHTML = icon('play', 16) + 'Play-test';
$('search-icon').innerHTML = icon('search', 16);

for (const btn of $('board-select').querySelectorAll('button')) {
  btn.addEventListener('click', () => {
    state.board = btn.dataset.board;
    for (const b of $('board-select').querySelectorAll('button')) {
      b.classList.toggle('active', b.dataset.board === state.board);
    }
    renderStage();
  });
}

for (const btn of $('role-filter').querySelectorAll('button')) {
  btn.addEventListener('click', () => {
    state.filter = btn.dataset.filter;
    for (const b of $('role-filter').querySelectorAll('button')) {
      b.classList.toggle('active', b.dataset.filter === state.filter);
    }
    renderList();
  });
}

$('search').addEventListener('input', (e) => {
  state.search = e.target.value;
  renderList();
});

$('add-comp').addEventListener('click', () => {
  if (!state.session) return;
  const newId = state.session.addCustomComponent({
    name: 'CO2 Air Sensor',
    icon: '◎',
    output: false,
    analog: true,
    signal: 'co2',
    area: 'Greenhouse',
    range: [400, 2000, 'ppm'],
    desc: 'Calibrated NDIR carbon-dioxide sensor measuring indoor air quality from 400 to 2000 ppm.',
  });
  state.selectedId = newId;
  renderAll();
  toast(`Created custom component "${newId}".`);
});

// ---- Left List ----
function renderList() {
  const s = state.session;
  if (!s) return;
  const q = state.search.trim().toLowerCase();
  const badIds = new Set(s.check().map((p) => p.id));

  const items = s.allComponents().filter((c) => {
    if (state.filter === 'sensors' && c.output) return false;
    if (state.filter === 'actuators' && !c.output) return false;
    if (state.filter === 'custom' && !c.custom) return false;
    if (q && !`${c.name} ${c.id} ${c.signal || ''} ${c.area || ''}`.toLowerCase().includes(q)) {
      return false;
    }
    return true;
  });

  $('comp-list').innerHTML = items.length
    ? items
        .map((c) => {
          const dotClass = badIds.has(c.id)
            ? 'bad'
            : c.custom
              ? 'custom'
              : c.edited
                ? 'edited'
                : '';
          const role = c.output
            ? 'Output'
            : c.analog
              ? `Analog · ${c.signal}`
              : `Digital · ${c.signal}`;
          return `
            <button class="comp-entry ${c.id === state.selectedId ? 'active' : ''}" data-comp="${escape(c.id)}">
              <span class="icon-glyph">${escape(c.icon || '◈')}</span>
              <span class="info">
                <span class="name">${escape(c.name)}</span>
                <span class="meta">${escape(c.id)} · ${escape(role)}</span>
              </span>
              ${dotClass ? `<span class="dot ${dotClass}"></span>` : ''}
            </button>`;
        })
        .join('')
    : `<p class="muted" style="padding:12px">No components match filter.</p>`;

  for (const btn of $('comp-list').querySelectorAll('[data-comp]')) {
    btn.addEventListener('click', () => {
      state.selectedId = btn.dataset.comp;
      renderAll();
    });
  }
}

// ---- Centre Stage: Breadboard SVG + Live Signal Oscilloscope + Code Preview ----
function buildBreadboardSvg(preview) {
  const { board, component, pin, vccLabel, resistor } = preview;
  const boardColor = board === 'ESP32' ? '#1e293b' : '#14532d';
  const boardTitle = board === 'ESP32' ? 'ESP32 DevKit V1' : 'Raspberry Pi Pico';
  const hasResistor = resistor && resistor !== 'None required';

  return `
    <svg class="comp-svg-box" viewBox="0 0 520 210" xmlns="http://www.w3.org/2000/svg">
      <!-- Breadboard grid background -->
      <rect x="10" y="12" width="500" height="186" rx="8" fill="#181d25" stroke="#2e3540" />
      <!-- Microcontroller Board -->
      <rect x="28" y="34" width="155" height="142" rx="6" fill="${boardColor}" stroke="#4f9cf9" stroke-width="1.5" />
      <text x="105" y="56" fill="#e8ebef" font-size="12" font-weight="600" text-anchor="middle">${escape(boardTitle)}</text>
      <text x="42" y="88" fill="#ef6b6b" font-size="11" font-family="monospace">● ${escape(vccLabel)}</text>
      <text x="42" y="118" fill="#4f9cf9" font-size="11" font-family="monospace">● GPIO ${pin}</text>
      <text x="42" y="148" fill="#9aa3b0" font-size="11" font-family="monospace">● GND</text>

      <!-- Wires -->
      <path d="M 183 84 L 330 84" stroke="#ef6b6b" stroke-width="2.5" fill="none" />
      <path d="M 183 114 L 330 114" stroke="#4f9cf9" stroke-width="2.5" fill="none" />
      <path d="M 183 144 L 330 144" stroke="#6e7785" stroke-width="2.5" fill="none" />

      ${
        hasResistor
          ? `
        <!-- Series / Pull-down Resistor on Signal/Output Line -->
        <rect x="228" y="105" width="56" height="18" rx="4" fill="#d6b47c" stroke="#8c6d3f" />
        <line x1="238" y1="105" x2="238" y2="123" stroke="#b91c1c" stroke-width="2" />
        <line x1="250" y1="105" x2="250" y2="123" stroke="#b91c1c" stroke-width="2" />
        <line x1="264" y1="105" x2="264" y2="123" stroke="#78350f" stroke-width="2" />
        <text x="256" y="99" fill="#f2b84b" font-size="10" text-anchor="middle">${escape(resistor)}</text>
      `
          : ''
      }

      <!-- Component Module -->
      <rect x="330" y="42" width="156" height="126" rx="8" fill="#222730" stroke="#5fd38a" stroke-width="1.5" />
      <text x="408" y="76" fill="#5fd38a" font-size="22" text-anchor="middle">${escape(component.icon || '◈')}</text>
      <text x="408" y="102" fill="#e8ebef" font-size="12" font-weight="600" text-anchor="middle">${escape(component.name)}</text>
      <text x="408" y="122" fill="#9aa3b0" font-size="10" font-family="monospace" text-anchor="middle">${
        component.output ? 'ACTUATOR OUTPUT' : `SIGNAL: ${escape(component.signal)}`
      }</text>
      <text x="408" y="144" fill="#6e7785" font-size="10" text-anchor="middle">${escape(component.area || 'Workshop')}</text>
    </svg>
  `;
}

function buildOscilloscopeSvg(wave) {
  const pts = wave.samples;
  const lo = wave.kind === 'output' ? 0 : wave.min;
  const hi = wave.kind === 'output' ? 1 : wave.max;
  const span = Math.max(1e-3, hi - lo);

  const coords = pts.map((v, i) => {
    const x = 30 + (i / (pts.length - 1)) * 460;
    const norm = (v - lo) / span;
    const y = 165 - Math.max(0, Math.min(1, norm)) * 125;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  return `
    <svg class="comp-svg-box" viewBox="0 0 520 210" xmlns="http://www.w3.org/2000/svg">
      <rect x="10" y="12" width="500" height="186" rx="8" fill="#10141b" stroke="#2e3540" />
      <line x1="30" y1="40" x2="490" y2="40" stroke="#222834" stroke-dasharray="4 4" />
      <line x1="30" y1="102" x2="490" y2="102" stroke="#222834" stroke-dasharray="4 4" />
      <line x1="30" y1="165" x2="490" y2="165" stroke="#222834" stroke-dasharray="4 4" />
      <polyline fill="none" stroke="#5fd38a" stroke-width="2.5" points="${coords.join(' ')}" />
      <text x="36" y="32" fill="#9aa3b0" font-size="11" font-family="monospace">
        ${
          wave.kind === 'output'
            ? `Pin Output: ${wave.digitalValue ? 'HIGH' : 'LOW'} (PWM ${wave.pwmValue}/255 · ${wave.voltage} V)`
            : `Program Reading: ${wave.reading} ${escape(wave.unit)} (${wave.voltage} V)`
        }
      </text>
      <text x="485" y="185" fill="#6e7785" font-size="10" text-anchor="end">24-sample live plotter preview</text>
    </svg>
  `;
}

function renderStage() {
  const s = state.session;
  if (!s) return;
  const preview = s.circuitPreview(state.selectedId, state.board);
  const wave = s.sampleWaveform(state.selectedId, state.stimulus);
  if (!preview || !wave) {
    $('comp-stage').innerHTML = `<p class="muted">Select a component to inspect its circuit.</p>`;
    return;
  }

  const codeText =
    state.codeTab === 'cpp'
      ? preview.cppCode
      : state.codeTab === 'python'
        ? preview.pyCode
        : preview.serialFirmware;

  $('comp-stage').innerHTML = `
    <div class="comp-bench-grid">
      <div class="comp-card">
        <div class="wb-row" style="display:flex;justify-content:space-between;align-items:center">
          <h3>Breadboard &amp; GPIO Pinout (${escape(state.board)})</h3>
          <span class="chip">GPIO ${preview.pin}</span>
        </div>
        ${buildBreadboardSvg(preview)}
        <p class="muted" style="font-size:12px;margin:0">${escape(preview.component.desc)}</p>
      </div>

      <div class="comp-card">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <h3>Signal Oscilloscope &amp; ADC Simulator</h3>
          <span class="chip">${state.stimulus}% Stimulus</span>
        </div>
        ${buildOscilloscopeSvg(wave)}
        <label style="display:flex;align-items:center;gap:10px;font-size:12px;color:var(--muted)">
          <span>Test Stimulus Level (${state.stimulus}%)</span>
          <input type="range" id="stimulus-slider" min="0" max="100" value="${state.stimulus}" style="flex:1" />
        </label>
      </div>
    </div>

    <div class="comp-card">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <h3>Generated Reference Code &amp; Web Serial Board Link</h3>
        <div class="segmented" id="code-tabs">
          <button data-code="cpp" class="${state.codeTab === 'cpp' ? 'active' : ''}">Arduino C++</button>
          <button data-code="python" class="${state.codeTab === 'python' ? 'active' : ''}">MicroPython</button>
          <button data-code="serial" class="${state.codeTab === 'serial' ? 'active' : ''}">Hardware Link Sketch</button>
        </div>
      </div>
      <pre class="comp-code-pre">${escape(codeText)}</pre>
    </div>
  `;

  $('stimulus-slider').addEventListener('input', (e) => {
    state.stimulus = Number(e.target.value) || 0;
    renderStage();
  });
  for (const btn of $('code-tabs').querySelectorAll('button')) {
    btn.addEventListener('click', () => {
      state.codeTab = btn.dataset.code;
      renderStage();
    });
  }
}

// ---- Right Inspector ----
function renderInspector() {
  const s = state.session;
  if (!s) return;
  const comp = s.getComponent(state.selectedId);
  if (!comp) {
    $('inspector').innerHTML = `<section><p class="muted">No component selected.</p></section>`;
    return;
  }
  const problems = s.check().filter((p) => p.id === comp.id);
  const range = comp.range || [0, 100, ''];

  $('inspector').innerHTML = `
    <section>
      <div style="display:flex;justify-content:space-between;align-items:center">
        <h2>${escape(comp.name)}</h2>
        <span class="id">${escape(comp.id)}</span>
      </div>
      <div class="chips">
        <span class="chip">${comp.builtin ? 'Built-in' : 'Custom'}</span>
        ${comp.edited ? '<span class="chip changed">Edited</span>' : ''}
      </div>
      ${problems
        .map(
          (p) =>
            `<p class="problem ${p.error ? 'error' : 'warning'}">${icon('warning', 14)}<span>${escape(p.text)}</span></p>`,
        )
        .join('')}
    </section>

    <section>
      <h3>Identity &amp; Placement</h3>
      <label class="field">
        <span>Name</span>
        <input class="input" id="f-name" value="${escape(comp.name)}" maxlength="50" />
      </label>
      <div class="grid2">
        <label class="field">
          <span>Icon Symbol</span>
          <input class="input" id="f-icon" value="${escape(comp.icon || '◈')}" maxlength="4" />
        </label>
        <label class="field">
          <span>Default Area</span>
          <select class="select" id="f-area" style="width:100%">
            ${AREAS.map(
              (a) =>
                `<option value="${escape(a)}" ${comp.area === a ? 'selected' : ''}>${escape(a)}</option>`,
            ).join('')}
          </select>
        </label>
      </div>
      <label class="field" style="margin-top:8px;display:block">
        <span>Description</span>
        <textarea class="input" id="f-desc" rows="3" style="height:auto;padding:6px">${escape(comp.desc || '')}</textarea>
      </label>
    </section>

    <section>
      <h3>Electrical &amp; Signal Specification</h3>
      <label class="field">
        <span>Role</span>
        <select class="select" id="f-role" style="width:100%" ${comp.builtin ? 'disabled' : ''}>
          <option value="sensor" ${!comp.output ? 'selected' : ''}>Sensor / Input</option>
          <option value="output" ${comp.output ? 'selected' : ''}>Actuator / Output</option>
        </select>
      </label>

      ${
        !comp.output
          ? `
        <div class="grid2">
          <label class="field">
            <span>Signal Channel</span>
            <input class="input" id="f-signal" value="${escape(comp.signal || '')}" ${comp.builtin ? 'disabled' : ''} />
          </label>
          <label class="field">
            <span>Read Mode</span>
            <select class="select" id="f-analog" style="width:100%">
              <option value="true" ${comp.analog ? 'selected' : ''}>Analog / Calibrated</option>
              <option value="false" ${!comp.analog ? 'selected' : ''}>Digital (0 or 1)</option>
            </select>
          </label>
        </div>
        <label class="field" style="margin-top:8px;display:block">
          <span>Calibrated Range (Min, Max, Unit)</span>
          <div class="grid3">
            <input class="input" id="f-min" type="number" value="${range[0]}" />
            <input class="input" id="f-max" type="number" value="${range[1]}" />
            <input class="input" id="f-unit" placeholder="Unit (°C, %)" value="${escape(range[2] || '')}" />
          </div>
        </label>
      `
          : ''
      }

      <label class="field" style="margin-top:8px;display:block">
        <span>Required Resistor</span>
        <select class="select" id="f-resistor" style="width:100%">
          ${RESISTOR_OPTIONS.map(
            (r) =>
              `<option value="${escape(r.value)}" ${(comp.resistor || '') === r.value ? 'selected' : ''}>${escape(r.label)}</option>`,
          ).join('')}
        </select>
      </label>
    </section>

    <section>
      <h3>Actions</h3>
      <div class="actions">
        ${
          comp.builtin
            ? `<button class="button" id="f-reset" ${!comp.edited ? 'disabled' : ''}>Reset to Built-in</button>`
            : `<button class="button danger" id="f-delete">Delete Component</button>`
        }
      </div>
    </section>
  `;

  $('f-name').addEventListener('change', (e) => {
    s.updateComponent(comp.id, { name: e.target.value }, `name:${comp.id}`);
  });
  $('f-icon').addEventListener('change', (e) => {
    s.updateComponent(comp.id, { icon: e.target.value });
  });
  $('f-area').addEventListener('change', (e) => {
    s.updateComponent(comp.id, { area: e.target.value });
  });
  $('f-desc').addEventListener('change', (e) => {
    s.updateComponent(comp.id, { desc: e.target.value }, `desc:${comp.id}`);
  });
  $('f-role')?.addEventListener('change', (e) => {
    const isOut = e.target.value === 'output';
    s.updateComponent(comp.id, {
      output: isOut,
      analog: isOut ? false : true,
      signal: isOut ? undefined : comp.signal || comp.id,
    });
  });
  $('f-signal')?.addEventListener('change', (e) => {
    s.updateComponent(comp.id, { signal: e.target.value.trim() });
  });
  $('f-analog')?.addEventListener('change', (e) => {
    s.updateComponent(comp.id, { analog: e.target.value === 'true' });
  });
  const updateRange = () => {
    if (!$('f-min')) return;
    s.updateComponent(comp.id, {
      range: [
        Number($('f-min').value) || 0,
        Number($('f-max').value) || 100,
        $('f-unit').value.trim(),
      ],
    });
  };
  $('f-min')?.addEventListener('change', updateRange);
  $('f-max')?.addEventListener('change', updateRange);
  $('f-unit')?.addEventListener('change', updateRange);
  $('f-resistor').addEventListener('change', (e) => {
    s.updateComponent(comp.id, { resistor: e.target.value || undefined });
  });
  $('f-reset')?.addEventListener('click', () => {
    s.resetComponent(comp.id);
    toast(`Reset ${comp.name} to default.`);
  });
  $('f-delete')?.addEventListener('click', () => {
    const id = comp.id;
    s.removeCustomComponent(id);
    state.selectedId = 'ldr';
    toast(`Deleted custom component "${id}".`);
  });
}

// ---- Save, Undo/Redo & Play-test ----
function isDirty() {
  return Boolean(state.session && JSON.stringify(state.session.savedFile()) !== state.savedText);
}

function updateChrome() {
  const dirty = isDirty();
  const saveState = $('save-state');
  saveState.textContent = dirty ? 'Unsaved changes' : 'Saved';
  saveState.classList.toggle('unsaved', dirty);
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
    toast(`Fix ${errors[0].text} before saving.`, true);
    return false;
  }
  try {
    const file = state.session.savedFile();
    if (shell) await shell.write('components', file);
    state.savedText = JSON.stringify(file);
    updateChrome();
    toast('Saved to public/data/components.js');
    return true;
  } catch (err) {
    toast('Could not save: ' + err.message, true);
    return false;
  }
}

async function playtest(fromStart = false) {
  if (isDirty()) {
    if (!confirm('Save component changes before opening the game?')) return;
    if (!(await save())) return;
  }
  shell?.openGame(fromStart ? null : { quest: 0 });
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
    ? await shell.read('components')
    : (await import('../../../public/data/components.js')).default;
  state.session = new ComponentSession(data);
  state.savedText = JSON.stringify(state.session.savedFile());
  state.session.on(() => renderAll());
  renderAll();
}

start();
window.componentEditor = { state };
