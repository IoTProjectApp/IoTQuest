// Climate & Soundscape Studio workspace controller: 24-hour diurnal solar & temperature curve,
// extreme weather presets, interactive WebAudio procedural soundscape synthesizer, and saving
// to public/data/climate.js.
import { ClimateSession, locations, locationById } from './session.js';
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
  cityId: locations[0].id,
  search: '',
  audioCtx: null,
};

// ---- Chrome ----
$('home').innerHTML = icon('back');
$('undo').innerHTML = icon('undo');
$('redo').innerHTML = icon('redo');
$('save').innerHTML = icon('save', 16) + 'Save';
$('playtest').innerHTML = icon('play', 16) + 'Play-test';
$('search-icon').innerHTML = icon('search', 16);

$('search').addEventListener('input', (e) => {
  state.search = e.target.value;
  renderCityList();
});

$('save-preset-btn').addEventListener('click', () => {
  if (!state.session) return;
  const loc = locationById(state.cityId);
  const name = prompt('Name for this weather preset:', `${loc?.city || 'City'} Custom Climate`);
  if (!name) return;
  state.session.saveCityAsPreset(state.cityId, name);
  toast(`Saved preset "${name}".`);
});

// ---- Procedural WebAudio Synth Preview ----
function playSynthSound(kind) {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    state.audioCtx ||= new AudioCtx();
    const ctx = state.audioCtx;
    if (ctx.state === 'suspended') ctx.resume();
    const snd = state.session.soundscape;
    const now = ctx.currentTime;

    if (kind === 'rain' || kind === 'wind') {
      const bufferSize = ctx.sampleRate * 0.8;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

      const noise = ctx.createBufferSource();
      noise.buffer = buffer;

      const filter = ctx.createBiquadFilter();
      filter.type = kind === 'rain' ? 'bandpass' : 'lowpass';
      filter.frequency.value = kind === 'rain' ? 1200 : 280;

      const gain = ctx.createGain();
      const level = kind === 'rain' ? snd.rainGain : snd.windGain;
      gain.gain.setValueAtTime(0.01, now);
      gain.gain.linearRampToValueAtTime(Math.max(0.05, level * 0.4), now + 0.1);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.78);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      noise.start(now);
      noise.stop(now + 0.8);
      return;
    }

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    if (kind === 'buzzer') {
      osc.type = 'square';
      osc.frequency.setValueAtTime(snd.buzzerFreqHz || 880, now);
    } else if (kind === 'pump') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(snd.pumpHumHz || 110, now);
    } else {
      osc.type = snd.chimeWaveform || 'triangle';
      osc.frequency.setValueAtTime(snd.ambientPitchHz || 220, now);
      osc.frequency.exponentialRampToValueAtTime((snd.ambientPitchHz || 220) * 1.5, now + 0.35);
    }

    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.46);
  } catch {}
}

// ---- Left City List ----
function renderCityList() {
  const s = state.session;
  if (!s) return;
  const q = state.search.trim().toLowerCase();
  const shown = [...locations]
    .filter(
      (l) =>
        !q ||
        l.city.toLowerCase().includes(q) ||
        String(l.country || '')
          .toLowerCase()
          .includes(q),
    )
    .sort((a, b) => a.city.localeCompare(b.city));

  $('city-list').innerHTML = shown
    .map((l) => {
      const edited = s.isEdited(l.id);
      return `
        <button class="clim-entry ${l.id === state.cityId ? 'active' : ''}" data-city="${escape(l.id)}">
          <div>
            <strong>${escape(l.city)}</strong>
            <div class="muted" style="font-size:11px">${escape(l.country)}</div>
          </div>
          ${edited ? '<span class="chip changed">Edited</span>' : ''}
        </button>`;
    })
    .join('');

  for (const btn of $('city-list').querySelectorAll('[data-city]')) {
    btn.addEventListener('click', () => {
      state.cityId = btn.dataset.city;
      renderAll();
    });
  }
}

// ---- Centre Stage ----
function buildDiurnalSvg(points) {
  const toX = (h) => 40 + (h / 24) * 520;
  const tempToY = (t) => 190 - ((t + 10) / 55) * 150;
  const pctToY = (p) => 190 - (p / 100) * 150;

  const outdoorPts = points
    .map((pt) => `${toX(pt.hour).toFixed(1)},${tempToY(pt.outdoorTemp).toFixed(1)}`)
    .join(' ');
  const indoorPts = points
    .map((pt) => `${toX(pt.hour).toFixed(1)},${tempToY(pt.indoorTemp).toFixed(1)}`)
    .join(' ');
  const lightPts = points
    .map((pt) => `${toX(pt.hour).toFixed(1)},${pctToY(pt.light).toFixed(1)}`)
    .join(' ');

  return `
    <svg class="clim-chart-svg" viewBox="0 0 600 225" xmlns="http://www.w3.org/2000/svg">
      <rect x="30" y="20" width="540" height="175" rx="6" fill="#131820" stroke="#2e3540" />
      <line x1="40" y1="65" x2="560" y2="65" stroke="#222834" stroke-dasharray="4 4" />
      <line x1="40" y1="115" x2="560" y2="115" stroke="#222834" stroke-dasharray="4 4" />
      <line x1="40" y1="165" x2="560" y2="165" stroke="#222834" stroke-dasharray="4 4" />

      <polyline fill="none" stroke="#f2b84b" stroke-width="2.5" points="${lightPts}" />
      <polyline fill="none" stroke="#ef6b6b" stroke-width="2.5" points="${outdoorPts}" />
      <polyline fill="none" stroke="#4f9cf9" stroke-width="2" stroke-dasharray="5 3" points="${indoorPts}" />

      <text x="45" y="36" fill="#f2b84b" font-size="11">● Daylight %</text>
      <text x="145" y="36" fill="#ef6b6b" font-size="11">● Outdoor Temp (°C)</text>
      <text x="285" y="36" fill="#4f9cf9" font-size="11">● Indoor Temp (Insulated)</text>

      <text x="40" y="212" fill="#9aa3b0" font-size="10">00:00</text>
      <text x="170" y="212" fill="#9aa3b0" font-size="10">06:00</text>
      <text x="300" y="212" fill="#9aa3b0" font-size="10">12:00</text>
      <text x="430" y="212" fill="#9aa3b0" font-size="10">18:00</text>
      <text x="545" y="212" fill="#9aa3b0" font-size="10">24:00</text>
    </svg>
  `;
}

function renderStage() {
  const s = state.session;
  if (!s) return;
  const loc = locationById(state.cityId) || locations[0];
  const curve = s.diurnalCurve(state.cityId);
  const presets = s.allPresets();

  $('clim-stage').innerHTML = `
    <div class="clim-card">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <div>
          <h2 style="margin:0">${escape(loc.city)}, ${escape(loc.country)}</h2>
          <span class="muted" style="font-size:12px">Lat ${loc.latitude.toFixed(2)}°, Lon ${loc.longitude.toFixed(2)}° · ${escape(loc.architecture || '')}</span>
        </div>
        <span class="chip">${escape(loc.timezone || 'UTC')}</span>
      </div>
      <h3>24-Hour Diurnal Solar, Daylight &amp; Thermal Curve</h3>
      ${buildDiurnalSvg(curve)}
    </div>

    <div class="clim-card">
      <h3>Extreme &amp; Regional Weather Presets (Click to apply to ${escape(loc.city)})</h3>
      <div class="clim-preset-grid">
        ${presets
          .map(
            (p) => `
          <div class="clim-preset-card" data-apply-preset="${escape(p.id)}">
            <strong>${escape(p.name)}</strong>
            <span class="muted" style="font-size:11px">
              ${p.practice.outdoorTemp}°C · Rain ${p.practice.rain}% · Wind ${p.practice.wind} km/h
            </span>
          </div>`,
          )
          .join('')}
      </div>
    </div>

    <div class="clim-card">
      <h3>Procedural WebAudio Soundscape Synthesizer</h3>
      <p class="muted" style="margin:0;font-size:12px">
        Preview the procedural audio generators using the soundscape settings on the right.
      </p>
      <div class="clim-synth-row">
        <button class="button" data-synth="rain">▶ Test Rain Ambience</button>
        <button class="button" data-synth="wind">▶ Test Wind Gust</button>
        <button class="button" data-synth="buzzer">▶ Test Alarm Buzzer</button>
        <button class="button" data-synth="pump">▶ Test Irrigation Pump</button>
        <button class="button primary" data-synth="chime">▶ Test Quest Chime</button>
      </div>
    </div>
  `;

  for (const card of $('clim-stage').querySelectorAll('[data-apply-preset]')) {
    card.addEventListener('click', () => {
      s.applyPresetToCity(state.cityId, card.dataset.applyPreset);
      toast(`Applied preset to ${loc.city}.`);
    });
  }
  for (const btn of $('clim-stage').querySelectorAll('[data-synth]')) {
    btn.addEventListener('click', () => playSynthSound(btn.dataset.synth));
  }
}

// ---- Right Inspector ----
function renderInspector() {
  const s = state.session;
  if (!s) return;
  const loc = locationById(state.cityId) || locations[0];
  const climate = s.cityClimate(state.cityId);
  const p = climate.practice;
  const snd = s.soundscape;

  const sliderRow = (field, label, val, min, max, unit) => `
    <label class="field" style="margin-top:8px;display:block">
      <div style="display:flex;justify-content:space-between;font-size:12px">
        <span>${label}</span>
        <b>${val}${unit}</b>
      </div>
      <input type="range" data-prac="${field}" min="${min}" max="${max}" step="1" value="${val}" style="width:100%" />
    </label>
  `;

  $('inspector').innerHTML = `
    <section>
      <div style="display:flex;justify-content:space-between;align-items:center">
        <h2>${escape(loc.city)} Climate</h2>
        <button class="button" id="c-reset" ${!s.isEdited(state.cityId) ? 'disabled' : ''}>Reset</button>
      </div>
    </section>

    <section>
      <h3>Practice Weather Readings</h3>
      ${sliderRow('outdoorTemp', 'Outdoor Temperature', p.outdoorTemp, -20, 50, ' °C')}
      ${sliderRow('humidity', 'Relative Humidity', p.humidity, 0, 100, '%')}
      ${sliderRow('light', 'Daylight Brightness', p.light, 0, 100, '%')}
      ${sliderRow('cloud', 'Cloud Cover', p.cloud, 0, 100, '%')}
      ${sliderRow('rain', 'Rainfall Intensity', p.rain, 0, 100, '%')}
      ${sliderRow('wind', 'Wind Speed', p.wind, 0, 140, ' km/h')}
      ${sliderRow('soil', 'Baseline Soil Moisture', p.soil, 0, 100, '%')}
      ${sliderRow('tank', 'Rainwater Tank Level', p.tank, 0, 100, '%')}
    </section>

    <section>
      <h3>Building Thermal Envelope</h3>
      <div class="grid2">
        <label class="field">
          <span>Insulation (${climate.insulation})</span>
          <input class="input" id="c-insul" type="number" step="0.05" min="0.2" max="3" value="${climate.insulation}" />
        </label>
        <label class="field">
          <span>Solar Shade (${climate.shade})</span>
          <input class="input" id="c-shade" type="number" step="0.05" min="0" max="1" value="${climate.shade}" />
        </label>
      </div>
    </section>

    <section>
      <h3>Global Soundscape Synth</h3>
      <div class="grid2">
        <label class="field">
          <span>Rain Gain</span>
          <input class="input" id="s-rain" type="number" step="0.05" min="0" max="1" value="${snd.rainGain}" />
        </label>
        <label class="field">
          <span>Wind Gain</span>
          <input class="input" id="s-wind" type="number" step="0.05" min="0" max="1" value="${snd.windGain}" />
        </label>
      </div>
      <div class="grid2">
        <label class="field">
          <span>Buzzer (Hz)</span>
          <input class="input" id="s-buz" type="number" step="20" min="200" max="2400" value="${snd.buzzerFreqHz}" />
        </label>
        <label class="field">
          <span>Chime Wave</span>
          <select class="select" id="s-wave" style="width:100%">
            ${['sine', 'triangle', 'square', 'sawtooth']
              .map(
                (w) =>
                  `<option value="${w}" ${snd.chimeWaveform === w ? 'selected' : ''}>${w}</option>`,
              )
              .join('')}
          </select>
        </label>
      </div>
    </section>
  `;

  for (const input of $('inspector').querySelectorAll('[data-prac]')) {
    input.addEventListener('input', (e) => {
      const f = input.dataset.prac;
      s.setCityPractice(state.cityId, f, Number(e.target.value), `prac:${state.cityId}:${f}`);
    });
  }
  $('c-insul').addEventListener('change', (e) =>
    s.setCityThermal(state.cityId, 'insulation', Number(e.target.value)),
  );
  $('c-shade').addEventListener('change', (e) =>
    s.setCityThermal(state.cityId, 'shade', Number(e.target.value)),
  );
  $('c-reset').addEventListener('click', () => {
    s.resetCity(state.cityId);
    toast(`Reset ${loc.city} climate to default.`);
  });

  $('s-rain').addEventListener('change', (e) =>
    s.updateSoundscape({ rainGain: Number(e.target.value) }),
  );
  $('s-wind').addEventListener('change', (e) =>
    s.updateSoundscape({ windGain: Number(e.target.value) }),
  );
  $('s-buz').addEventListener('change', (e) =>
    s.updateSoundscape({ buzzerFreqHz: Number(e.target.value) }),
  );
  $('s-wave').addEventListener('change', (e) =>
    s.updateSoundscape({ chimeWaveform: e.target.value }),
  );
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
  renderCityList();
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
    if (shell) await shell.write('climate', file);
    state.savedText = JSON.stringify(file);
    updateChrome();
    toast('Saved to public/data/climate.js');
    return true;
  } catch (err) {
    toast('Could not save: ' + err.message, true);
    return false;
  }
}

async function playtest(fromStart = false) {
  if (isDirty()) {
    if (!confirm('Save climate changes before opening the game?')) return;
    if (!(await save())) return;
  }
  shell?.openGame(fromStart ? null : { city: state.cityId });
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
    ? await shell.read('climate')
    : (await import('../../../public/data/climate.js')).default;
  state.session = new ClimateSession(data);
  state.savedText = JSON.stringify(state.session.savedFile());
  state.session.on(() => renderAll());
  renderAll();
}

start();
window.climateEditor = { state };
