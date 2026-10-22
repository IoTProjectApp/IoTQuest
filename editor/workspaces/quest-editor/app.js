// The Quest Editor workspace: your quests and the built-in ones, the quest form (story, devices,
// rules and tests, or a timed quest's sequences and worked program), the live check, and saving to
// public/data/quests.js.
import { components, defaults, missions } from '../../../public/missions.js';
import { isRuleQuest, isTimedQuest } from '../../../public/authored-quests.js';
import { HOME_AREAS } from '../../../public/home-areas.js';
import { PEOPLE_SETTINGS } from '../../../public/people-settings.js';
import { readingRange } from '../../../public/diagnostics.js';
import { coachSteps } from '../../../public/code-coach.js';
import {
  QuestSession,
  checkQuest,
  builtInQuests,
  resultsFromRules,
  canCopy,
  toReading,
  toLevel,
  device,
  outputsOf,
  sensorsOf,
  BOARDS,
  LANGUAGES,
} from './session.js';
import { icon } from '../../ui/icons.js';

const shell = window.editorShell;
const $ = (id) => document.getElementById(id);
const escape = (s) =>
  String(s ?? '').replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c],
  );
const builtIn = builtInQuests();
// Everywhere a quest can happen: the home's rooms and garden, and the town's places.
const AREAS = [
  ...new Set([...HOME_AREAS.map(([name]) => name), ...builtIn.map((m) => m.area)]),
].sort();
// Everyone who asks for quests, and the people added in the Character Editor.
const RESIDENTS = [
  ...new Set([...builtIn.map((m) => m.resident), ...PEOPLE_SETTINGS.people.map((p) => p.name)]),
].sort();
const SENSORS = components.filter((c) => !c.output && c.signal && readingRange(c)),
  OUTPUTS = components.filter((c) => c.output);
const OPS = ['<', '<=', '>', '>=', '==', '!='];

const state = { session: null, pick: null, search: '', language: 'cpp', checks: new Map() };

// ---- Chrome ---------------------------------------------------------------------------------
$('home').innerHTML = icon('back');
$('undo').innerHTML = icon('undo');
$('redo').innerHTML = icon('redo');
$('save').innerHTML = icon('save', 16) + 'Save';
$('playtest').innerHTML = icon('play', 16) + 'Play-test';
$('new').innerHTML = icon('plus', 16) + 'New quest';
$('search-icon').innerHTML = icon('search', 16);

// The check for one of your quests, worked out again whenever it changes.
function checkOf(quest) {
  const key = JSON.stringify(quest) + JSON.stringify(state.session.quests.map((q) => q.title));
  const cached = state.checks.get(quest.id);
  if (cached?.key === key) return cached.result;
  const result = checkQuest(quest, { others: state.session.quests });
  state.checks.set(quest.id, { key, result });
  return result;
}

// The check for a built-in quest as you have changed it.
function checkBuiltInOf(index) {
  const s = state.session,
    key = JSON.stringify(s.builtInSpec(index)) + JSON.stringify(s.titlesBut('builtin-' + index)),
    cached = state.checks.get('builtin-' + index);
  if (cached?.key === key) return cached.result;
  const result = s.checkBuiltIn(index);
  state.checks.set('builtin-' + index, { key, result });
  return result;
}

// ---- The list -------------------------------------------------------------------------------
function renderList() {
  const s = state.session,
    search = state.search.trim().toLowerCase(),
    match = (q) =>
      !search ||
      q.title.toLowerCase().includes(search) ||
      (q.area || '').toLowerCase().includes(search) ||
      (q.resident || '').toLowerCase().includes(search);
  const mine = s.quests.filter(match),
    // Built-in quests as they now stand (with your changes), edited ones marked.
    theirs = builtIn
      .map((_, i) => ({ m: s.builtInSpec(i), i, kind: kindOf(i) }))
      .filter(({ m }) => match(m));
  const active = (kind, id) => state.pick?.kind === kind && state.pick.id === id;
  $('list').innerHTML =
    `<h3>Your quests</h3>` +
    (mine.length
      ? mine
          .map((q) => {
            const ok = !checkOf(q).errors.length;
            return `<button class="entry ${active('mine', q.id) ? 'active' : ''}" data-mine="${escape(q.id)}">
              <span class="state ${ok ? 'ok' : 'bad'}" title="${ok ? 'Ready' : 'Has problems'}"></span>
              <span class="label">${escape(q.title)}</span><span class="meta">${escape(q.area)}</span></button>`;
          })
          .join('')
      : `<p class="empty">${search ? 'None match.' : 'None yet: start one with New quest, or copy a built-in quest.'}</p>`) +
    `<h3>Built-in quests</h3>` +
    theirs
      .map(({ m, i, kind }) => {
        const edited = s.isEdited(i),
          ok = edited && !checkBuiltInOf(i).errors.length;
        return `<button class="entry ${active('builtin', i) ? 'active' : ''}" data-builtin="${i}" title="${escape(m.area)} · ${escape(m.resident)}${edited ? ' · changed' : ''}">
          ${edited ? `<span class="state ${ok ? 'ok' : 'bad'}" title="${ok ? 'Changed, ready' : 'Changed, has problems'}"></span>` : ''}
          <span class="label">${escape(m.title)}</span><span class="meta">${kind === 'rules' ? '' : kind === 'timed' ? 'timed' : 'story only'}</span></button>`;
      })
      .join('');
  for (const b of $('list').querySelectorAll('[data-mine]'))
    b.addEventListener('click', () => pick({ kind: 'mine', id: b.dataset.mine }));
  for (const b of $('list').querySelectorAll('[data-builtin]'))
    b.addEventListener('click', () => pick({ kind: 'builtin', id: Number(b.dataset.builtin) }));
}
$('search').addEventListener('input', (e) => {
  state.search = e.target.value;
  renderList();
});
function pick(target) {
  state.pick = target;
  render();
  $('form').scrollTop = 0;
}

// What can change on a built-in quest: rules (devices, rules, tests), timed (sequences and worked
// program) or story only (repair and expedition quests, which play as coded).
const kindOf = (index) =>
  isRuleQuest(missions[index]) ? 'rules' : isTimedQuest(missions[index]) ? 'timed' : 'story';

// ---- The form -------------------------------------------------------------------------------
function render() {
  renderList();
  const s = state.session,
    pickNow = state.pick;
  if (pickNow?.kind === 'mine' && s.quest(pickNow.id)) renderMine(s.quest(pickNow.id));
  else if (pickNow?.kind === 'builtin')
    renderMine(s.builtInSpec(pickNow.id), {
      kind: 'builtin',
      index: pickNow.id,
      storyOnly: kindOf(pickNow.id) === 'story',
    });
  else {
    $('form').innerHTML = `<div class="blank"><h2>Write a quest</h2>
      <p>Start a new quest, or pick a built-in one to read and copy. Every quest is checked against a
      worked solution on both boards before it can be saved.</p>
      <button class="button primary" id="blank-new">${icon('plus', 16)}New quest</button></div>`;
    $('blank-new').addEventListener('click', newQuest);
    $('check').innerHTML = '';
  }
}
const field = (label, input, wide = false, note = '') =>
  `<label class="field ${wide ? 'wide' : ''}"><span>${label}</span>${input}${note ? `<small>${note}</small>` : ''}</label>`;
const options = (list, selected) =>
  list
    .map(
      ([value, text]) =>
        `<option value="${escape(value)}" ${String(value) === String(selected) ? 'selected' : ''}>${escape(text)}</option>`,
    )
    .join('');

// One quest's form: one of yours, or a built-in one (target.kind 'builtin', with its index; one
// that is neither a rule quest nor a timed one shows its story only).
function renderMine(q, target = { kind: 'mine' }) {
  const s = state.session,
    builtInQuest = target.kind === 'builtin',
    timed = Array.isArray(q.sequences),
    outputs = outputsOf(q),
    sensors = sensorsOf(q),
    fromRules = timed ? [] : resultsFromRules(q),
    pins = (id) =>
      BOARDS.map((board) => {
        const d = defaults(q.ids, board).find((x) => x.id === id);
        return `${board === 'ESP32' ? 'ESP32' : 'Pico'} ${d?.pin ?? '–'}`;
      }).join(' · ');
  $('form').innerHTML = `
    <div class="heading">
      <h1>${escape(q.title)}</h1>
      ${
        builtInQuest
          ? `<button class="button" id="reset-quest" ${s.isEdited(target.index) ? '' : 'disabled'}>${icon('reset', 16)}Reset to original</button>
             <button class="button" id="copy" ${canCopy(missions[target.index]) ? '' : 'disabled title="Its checks of what the program prints or publishes are code, which a copy cannot keep."'}>${icon('copy', 16)}Copy as a new quest</button>`
          : `<button class="button" id="duplicate">${icon('copy', 16)}Duplicate</button>
             <button class="button danger" id="delete">${icon('erase', 16)}Delete</button>`
      }
    </div>
    ${builtInQuest ? builtInNotes(target) : ''}
    <section class="card">
      <h2>Story</h2>
      <p class="sub">Who asks, where, and what they want. Students read this in the game.</p>
      <div class="fields">
        ${field('Title', `<input class="input" data-text="title" value="${escape(q.title)}" maxlength="60" />`, true)}
        ${field('Who asks', `<input class="input" data-text="resident" list="residents" value="${escape(q.resident)}" />`)}
        ${field('Their role', `<input class="input" data-text="role" value="${escape(q.role)}" placeholder="Resident" />`)}
        ${field(
          'Where',
          `<select class="select" data-text="area">${options(
            AREAS.map((a) => [a, a]),
            q.area,
          )}</select>`,
        )}
        ${field('XP', `<input class="input" data-number="xp" type="number" min="10" max="500" step="10" value="${q.xp}" />`)}
        ${field('What they say', `<textarea data-text="quote" placeholder="“The path is so dark at night…”">${escape(q.quote)}</textarea>`, true)}
        ${field('Goal', `<textarea data-text="goal">${escape(q.goal)}</textarea>`, true, 'What the program must do, in one or two sentences.')}
        ${field('Badge', `<input class="input" data-text="badge" value="${escape(q.badge)}" placeholder="${escape(q.title)}" />`)}
        ${field('Students learn', `<input class="input" data-list="learn" value="${escape((q.learn || []).join(', '))}" placeholder="thresholds, if/else" />`, false, 'Separate with commas.')}
        ${field('Hint', `<textarea data-text="hint" placeholder="A nudge for students who are stuck">${escape(q.hint)}</textarea>`, true)}
      </div>
      <datalist id="residents">${RESIDENTS.map((r) => `<option value="${escape(r)}"></option>`).join('')}</datalist>
    </section>
    ${
      target.storyOnly
        ? `<section class="card"><h2>Devices and checks</h2><p class="sub">A repair or expedition quest checks the student's work with code of its own, so only its story can change here. It plays as the game makes it.</p>
            <div class="devices">${q.ids.map((id) => `<span class="device ${device(id)?.output ? 'output' : ''}"><span class="kind">${device(id)?.output ? 'Output' : 'Sensor'}</span>${escape(device(id)?.name || id)}</span>`).join('')}</div></section>`
        : timed && builtInQuest
          ? `<section class="card"><h2>Devices</h2><p class="sub">A timed quest's devices stay as built: its worked program and steps are written for them.</p>
            <div class="devices">${q.ids.map((id) => `<span class="device ${device(id)?.output ? 'output' : ''}"><span class="kind">${device(id)?.output ? 'Output' : 'Sensor'}</span>${escape(device(id)?.name || id)}<span class="pins">${pins(id)}</span></span>`).join('')}</div></section>
            ${timedCards(q)}`
          : `
    <section class="card">
      <h2>Devices</h2>
      <p class="sub">What students install and wire. Pins are assigned the way the game assigns them.</p>
      <div class="devices">${q.ids
        .map((id) => {
          const d = device(id);
          return `<span class="device ${d.output ? 'output' : ''}" title="${escape(d.desc || '')}">
            <span class="kind">${d.output ? 'Output' : 'Sensor'}</span>${escape(d.name)}<span class="pins">${pins(id)}</span>
            <button class="remove" data-remove="${escape(id)}" title="Remove">${icon('close', 12)}</button></span>`;
        })
        .join('')}</div>
      <div class="adder">
        <select class="select" id="add-device"><option value="">Add a device…</option>
          <optgroup label="Sensors">${SENSORS.filter((c) => !q.ids.includes(c.id))
            .map((c) => `<option value="${c.id}">${escape(c.name)}</option>`)
            .join('')}</optgroup>
          <optgroup label="Outputs">${OUTPUTS.filter((c) => !q.ids.includes(c.id))
            .map((c) => `<option value="${c.id}">${escape(c.name)}</option>`)
            .join('')}</optgroup>
        </select>
      </div>
    </section>
    ${
      timed
        ? timedCards(q)
        : `<section class="card">
      <h2>Rules</h2>
      <p class="sub">When each output turns on. The worked solution and the automatic limit tests are made from these.</p>
      ${outputs.map((id, i) => ruleEditor(q, id, i, sensors)).join('') || '<p class="sub">Add an output first.</p>'}
    </section>
    <section class="card">
      <h2>Tests</h2>
      <p class="sub">Readings to try and what each output should do. Rows the rules disagree with are marked.</p>
      <div class="tests"><table>
        <thead><tr><th>Test</th>${sensors.map((id) => `<th>${escape(device(id).name)}<div class="range">${rangeText(device(id))}</div></th>`).join('')}
          ${outputs.map((id) => `<th class="output">${escape(device(id).name)}</th>`).join('')}<th></th></tr></thead>
        <tbody>${q.scenarios
          .map(([name, env, expected], r) => {
            const wrong = fromRules[r] && fromRules[r].some((v, i) => v !== expected[i]);
            return `<tr class="${wrong ? 'wrong' : ''}" title="${wrong ? 'The rules say: ' + fromRules[r].map((v) => (v ? 'on' : 'off')).join(', ') : ''}">
              <td><input class="input" data-test-name="${r}" value="${escape(name)}" /></td>
              ${sensors
                .map((id) => {
                  const signal = device(id).signal,
                    value = signal in env ? toReading(signal, env[signal]) : '';
                  return `<td><input class="input" type="number" data-test="${r}" data-signal="${signal}" value="${value === '' ? '' : Math.round(value * 100) / 100}" placeholder="as usual" /></td>`;
                })
                .join('')}
              ${outputs.map((id, i) => `<td><button class="onoff ${expected[i] ? 'on' : ''}" data-flip="${r}" data-output="${i}">${expected[i] ? 'ON' : 'OFF'}</button></td>`).join('')}
              <td><button class="remove" data-drop="${r}" title="Remove this test">${icon('close', 12)}</button></td></tr>`;
          })
          .join('')}</tbody></table></div>
      <div class="row-actions">
        <button class="button" id="add-test">${icon('plus', 16)}Add test</button>
        <button class="button" id="from-rules" title="Set every test's results to what the rules say">${icon('check', 16)}Results from the rules</button>
        <button class="button" id="suggest" title="Add a test either side of each threshold">${icon('reset', 16)}Suggest tests</button>
        ${builtInQuest ? '' : `<button class="button" id="make-timed" title="For behaviour that depends on what happened before (timers, latches, counters): the tests become timed steps and the rules a worked program">${icon('play', 16)}Make it timed</button>`}
      </div>
    </section>`
    }`
    }`;
  bindMine(q, target);
  renderCheck(q, builtInQuest ? checkBuiltInOf(target.index) : checkOf(q));
}
// ---- Timed quests: sequences of steps, and the worked program ---------------------------------
// What a step expects of one output: either (null), on (1), off (0) or a brightness ({ level }).
const EXPECT_NEXT = (v) =>
  v === null || v === undefined ? 1 : v === 1 ? 0 : v === 0 ? { level: 255 } : null;
const expectText = (v) =>
  v === null || v === undefined ? 'either' : v === 1 ? 'ON' : v === 0 ? 'OFF' : 'level';
// The readings a sequence can set: the quest's sensors, and any other reading its steps use.
function sequenceSignals(q, sequence) {
  const signals = sensorsOf(q).map((id) => device(id).signal);
  for (const env of [sequence.env, ...sequence.steps.map((step) => step.env)])
    for (const k of Object.keys(env || {})) if (!signals.includes(k)) signals.push(k);
  return signals;
}
const signalName = (signal) => components.find((c) => c.signal === signal)?.name || signal;
const readingInput = (attrs, env, signal) => {
  const value = env && signal in env ? toReading(signal, env[signal]) : '';
  return `<input class="input" type="number" ${attrs} data-signal="${signal}" value="${value === '' ? '' : Math.round(value * 100) / 100}" placeholder="–" />`;
};
const eventOf = (step) =>
  step.restart ? 'restart' : step.network === false ? 'down' : step.network === true ? 'up' : '';
function timedCards(q) {
  const outputs = outputsOf(q),
    solution = q.solution || {};
  return `
    <section class="card">
      <h2>Sequences</h2>
      <p class="sub">Each sequence plays its steps in order on one running program, which keeps its
        variables from step to step. A reading set in a step carries on until another step changes it
        (– leaves it as it was). At the end of each step, each output must be as expected: ON, OFF,
        either, or a brightness (0–255).</p>
      ${q.sequences
        .map((sequence, si) => {
          const signals = sequenceSignals(q, sequence);
          return `<div class="rule sequence">
            <div class="rule-head">
              <input class="input seq-name" data-seq-name="${si}" value="${escape(sequence.name)}" />
              <label class="tick" title="How far the program's clock moves on each pass">Tick
                <input class="input" type="number" min="10" step="10" data-seq-tick="${si}" value="${sequence.tick ?? 200}" /> ms</label>
              <button class="remove" data-seq-drop="${si}" title="Remove this sequence" ${q.sequences.length > 1 ? '' : 'disabled'}>${icon('close', 12)}</button>
            </div>
            <div class="tests"><table>
              <thead><tr><th>Step</th>${signals.map((sig) => `<th>${escape(signalName(sig))}</th>`).join('')}
                <th>Lasts (s)</th>${outputs.map((id) => `<th class="output">${escape(device(id).name)}</th>`).join('')}
                <th>Event</th><th>Message sent</th><th></th></tr></thead>
              <tbody>
                <tr class="start"><td><span class="rule-text">At the start</span></td>
                  ${signals.map((sig) => `<td>${readingInput(`data-seq-env="${si}"`, sequence.env, sig)}</td>`).join('')}
                  <td colspan="${outputs.length + 4}"><span class="range">Readings before the first step (– as usual).</span></td></tr>
                ${sequence.steps
                  .map((step, i) => {
                    const at = `${si}:${i}`;
                    return `<tr>
                    <td><input class="input" data-step-label="${at}" value="${escape(step.label)}" /></td>
                    ${signals.map((sig) => `<td>${readingInput(`data-step-env="${at}"`, step.env, sig)}</td>`).join('')}
                    <td><input class="input" type="number" min="0.01" step="0.1" data-step-ms="${at}" value="${step.ms / 1000}" /></td>
                    ${outputs
                      .map((id, o) => {
                        const v = step.expect?.[o];
                        return `<td class="expect">${
                          v && typeof v === 'object'
                            ? `<input class="input level" type="number" min="0" max="255" data-level="${at}:${o}" value="${v.level}" title="Brightness 0–255" />`
                            : ''
                        }<button class="onoff ${v === 1 ? 'on' : v === null || v === undefined ? 'either' : ''}" data-expect="${at}:${o}" title="Click to change: either, ON, OFF, brightness">${expectText(v)}</button></td>`;
                      })
                      .join('')}
                    <td><select class="select" data-step-event="${at}">${options(
                      [
                        ['', '—'],
                        ['restart', 'Restart'],
                        ['down', 'Network drops'],
                        ['up', 'Network back'],
                      ],
                      eventOf(step),
                    )}</select></td>
                    <td><input class="input" data-step-send="${at}" value="${escape(step.send ? step.send[0] + ' = ' + step.send[1] : '')}" placeholder="topic = payload" title="An MQTT message published at the start of the step" /></td>
                    <td class="step-actions">${
                      step.check
                        ? `<span class="coded" title="This step also checks what the program printed or published, with code written into the quest. It stays as coded; removing the step removes it.">${icon('lock', 12)}coded check</span>`
                        : ''
                    }<button class="remove" data-step-copy="${at}" title="Add a step after this one">${icon('plus', 12)}</button><button class="remove" data-step-drop="${at}" title="Remove this step" ${sequence.steps.length > 1 ? '' : 'disabled'}>${icon('close', 12)}</button></td></tr>`;
                  })
                  .join('')}
              </tbody></table></div>
          </div>`;
        })
        .join('')}
      <div class="row-actions">
        <button class="button" id="add-sequence">${icon('plus', 16)}Add sequence</button>
      </div>
    </section>
    <section class="card">
      <h2>Worked program</h2>
      <p class="sub">Proves the quest can be passed: it must pass every sequence on both boards in both
        languages. Written once in a small C-like form and turned into Arduino C++ and MicroPython.
        Each sensor is read into a variable named after its reading (temp, motion, light…); use
        write(id, 1), pwm(id, level), print(value) and millis(), one statement per line, with braces
        for blocks. Students still write their own.</p>
      <div class="fields">
        ${field(
          'Variables',
          `<textarea class="mono" data-solution="state" placeholder="fanOn = 0">${escape(
            Object.entries(solution.state || {})
              .map(([k, v]) => `${k} = ${v}`)
              .join('\n'),
          )}</textarea>`,
          false,
          'One per line: name = starting value (a number, or "text").',
        )}
        ${field('Wait each pass (ms)', `<input class="input" type="number" min="0" max="10000" data-solution="delay" value="${solution.delay ?? ''}" placeholder="200" />`)}
        ${field('At start', `<textarea class="mono" data-solution="setup" placeholder="Runs once, e.g. mqttConnect(&quot;lamp&quot;);">${escape(solution.setup || '')}</textarea>`, true)}
        ${field('On every pass', `<textarea class="mono code-input" data-solution="loop">${escape(solution.loop || '')}</textarea>`, true)}
      </div>
    </section>`;
}
// The variables as written: name = value per line.
function parseState(text) {
  const state = {};
  for (const line of text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)) {
    const at = line.indexOf('=');
    const name = (at < 0 ? line : line.slice(0, at)).trim(),
      raw =
        at < 0
          ? '0'
          : line
              .slice(at + 1)
              .trim()
              .replace(/;$/, '');
    state[name] = /^-?\d+$/.test(raw) ? Number(raw) : raw;
  }
  return state;
}
function bindTimed(q, edit) {
  const form = $('form'),
    step = (at, x) => {
      const [si, i] = at.split(':').map(Number);
      return x.sequences[si].steps[i];
    };
  for (const el of form.querySelectorAll('[data-seq-name]'))
    el.addEventListener('change', () =>
      edit('Rename sequence', (x) => (x.sequences[Number(el.dataset.seqName)].name = el.value)),
    );
  for (const el of form.querySelectorAll('[data-seq-tick]'))
    el.addEventListener('change', () =>
      edit('Change tick', (x) => {
        const sequence = x.sequences[Number(el.dataset.seqTick)];
        if (el.value === '' || Number(el.value) === 200) delete sequence.tick;
        else sequence.tick = Number(el.value);
      }),
    );
  for (const el of form.querySelectorAll('[data-seq-drop]'))
    el.addEventListener('click', () =>
      edit('Remove sequence', (x) => x.sequences.splice(Number(el.dataset.seqDrop), 1)),
    );
  const setReading = (env, signal, value) => {
    if (value === '') delete env[signal];
    else env[signal] = toLevel(signal, Number(value));
  };
  for (const el of form.querySelectorAll('[data-seq-env]'))
    el.addEventListener('change', () =>
      edit('Change starting reading', (x) => {
        const sequence = x.sequences[Number(el.dataset.seqEnv)];
        setReading((sequence.env ??= {}), el.dataset.signal, el.value);
        if (!Object.keys(sequence.env).length) delete sequence.env;
      }),
    );
  for (const el of form.querySelectorAll('[data-step-env]'))
    el.addEventListener('change', () =>
      edit('Change reading', (x) => {
        const st = step(el.dataset.stepEnv, x);
        setReading((st.env ??= {}), el.dataset.signal, el.value);
        if (!Object.keys(st.env).length) delete st.env;
      }),
    );
  for (const el of form.querySelectorAll('[data-step-label]'))
    el.addEventListener('change', () =>
      edit('Rename step', (x) => (step(el.dataset.stepLabel, x).label = el.value)),
    );
  for (const el of form.querySelectorAll('[data-step-ms]'))
    el.addEventListener('change', () =>
      edit(
        'Change step length',
        (x) => (step(el.dataset.stepMs, x).ms = Math.round(Number(el.value) * 1000)),
      ),
    );
  const outputs = outputsOf(q).length;
  for (const el of form.querySelectorAll('[data-expect]'))
    el.addEventListener('click', () =>
      edit('Change expected output', (x) => {
        const [si, i, o] = el.dataset.expect.split(':').map(Number),
          st = x.sequences[si].steps[i];
        const expect = st.expect ?? Array(outputs).fill(null);
        expect[o] = EXPECT_NEXT(expect[o]);
        if (expect.every((v) => v === null)) delete st.expect;
        else st.expect = expect;
      }),
    );
  for (const el of form.querySelectorAll('[data-level]'))
    el.addEventListener('change', () =>
      edit('Change brightness', (x) => {
        const [si, i, o] = el.dataset.level.split(':').map(Number);
        x.sequences[si].steps[i].expect[o] = {
          level: Math.max(0, Math.min(255, Math.round(Number(el.value)))),
        };
      }),
    );
  for (const el of form.querySelectorAll('[data-step-event]'))
    el.addEventListener('change', () =>
      edit('Change event', (x) => {
        const st = step(el.dataset.stepEvent, x);
        delete st.restart;
        delete st.network;
        if (el.value === 'restart') st.restart = true;
        else if (el.value) st.network = el.value === 'up';
      }),
    );
  for (const el of form.querySelectorAll('[data-step-send]'))
    el.addEventListener('change', () =>
      edit('Change message', (x) => {
        const st = step(el.dataset.stepSend, x),
          text = el.value.trim();
        if (!text) return void delete st.send;
        const at = text.indexOf('='),
          topic = (at < 0 ? text : text.slice(0, at)).trim(),
          payload = at < 0 ? '' : text.slice(at + 1).trim();
        st.send = st.send?.[2] ? [topic, payload, st.send[2]] : [topic, payload];
      }),
    );
  for (const el of form.querySelectorAll('[data-step-copy]'))
    el.addEventListener('click', () =>
      edit('Add step', (x) => {
        const [si, i] = el.dataset.stepCopy.split(':').map(Number),
          { check, send, restart, network, ...rest } = x.sequences[si].steps[i];
        x.sequences[si].steps.splice(i + 1, 0, {
          ...JSON.parse(JSON.stringify(rest)),
          label: rest.label + ' (next)',
        });
      }),
    );
  for (const el of form.querySelectorAll('[data-step-drop]'))
    el.addEventListener('click', () =>
      edit('Remove step', (x) => {
        const [si, i] = el.dataset.stepDrop.split(':').map(Number);
        x.sequences[si].steps.splice(i, 1);
      }),
    );
  $('add-sequence')?.addEventListener('click', () =>
    edit('Add sequence', (x) =>
      x.sequences.push({
        name: `Sequence ${x.sequences.length + 1}`,
        steps: [{ label: 'Start', ms: 1000, expect: Array(outputs).fill(0) }],
      }),
    ),
  );
  for (const el of form.querySelectorAll('[data-solution]'))
    el.addEventListener('change', () =>
      edit('Change worked program', (x) => {
        const key = el.dataset.solution,
          solution = (x.solution ??= { loop: '' });
        if (key === 'state') {
          const state = parseState(el.value);
          if (Object.keys(state).length) solution.state = state;
          else delete solution.state;
        } else if (key === 'delay') {
          if (el.value === '') delete solution.delay;
          else solution.delay = Number(el.value);
        } else if (key === 'setup' && !el.value.trim()) delete solution.setup;
        else solution[key] = el.value;
      }),
    );
}

const rangeText = (d) => {
  const [lo, hi, unit] = readingRange(d) || [];
  return lo === 0 && hi === 1 ? '0 or 1' : `${lo}–${hi}${unit ? ' ' + unit : ''}`;
};
// A rule as clauses joined by && and ||: [{ join, signal, op, value }], or null if it is written
// another way (brackets), when it is edited as text.
function clausesOf(condition) {
  if (condition === 'false') return [];
  const parts = condition.split(/(&&|\|\|)/).map((p) => p.trim());
  const clauses = [];
  for (let i = 0; i < parts.length; i += 2) {
    const m = parts[i].match(/^([a-zA-Z_]\w*)\s*(<=|>=|==|!=|<|>)\s*(-?\d+(?:\.\d+)?)$/);
    if (!m) return null;
    clauses.push({ join: i ? parts[i - 1] : null, signal: m[1], op: m[2], value: Number(m[3]) });
  }
  return clauses;
}
const conditionOf = (clauses) =>
  clauses.length
    ? clauses.map((c, i) => (i ? ` ${c.join} ` : '') + `${c.signal} ${c.op} ${c.value}`).join('')
    : 'false';
function ruleEditor(q, id, i, sensors) {
  const condition = q.conditions[i] ?? 'false',
    clauses = clausesOf(condition),
    signals = sensors.map((s) => [device(s).signal, device(s).name]);
  const head = `<div class="rule-head"><strong>${escape(device(id).name)}</strong>
    <span class="rule-text">${escape(condition)}</span></div>`;
  if (!clauses)
    return `<div class="rule">${head}${field('Rule', `<input class="input" data-rule-text="${i}" value="${escape(condition)}" />`, true, 'Written with brackets: edit it as text.')}</div>`;
  return `<div class="rule">${head}
    ${clauses.length ? '' : '<p class="sub">Always off. Add a condition to turn it on.</p>'}
    ${clauses
      .map(
        (c, k) => `<div class="clause">
        ${
          k
            ? `<select class="select join-select" data-join="${i}:${k}">${options(
                [
                  ['&&', 'and'],
                  ['||', 'or'],
                ],
                c.join,
              )}</select>`
            : '<span class="join">on when</span>'
        }
        <select class="select" data-clause="${i}:${k}:signal">${options(signals.some(([s]) => s === c.signal) ? signals : [[c.signal, c.signal], ...signals], c.signal)}</select>
        <select class="select" data-clause="${i}:${k}:op">${options(
          OPS.map((o) => [o, o]),
          c.op,
        )}</select>
        <input class="input" type="number" data-clause="${i}:${k}:value" value="${c.value}" />
        <button class="remove" data-unclause="${i}:${k}" title="Remove this condition">${icon('close', 12)}</button></div>`,
      )
      .join('')}
    <button class="link" data-addclause="${i}" ${signals.length ? '' : 'disabled'}>${icon('plus', 12)} Add a condition</button></div>`;
}
function bindMine(q, target = { kind: 'mine' }) {
  const s = state.session,
    form = $('form'),
    edit = (label, change) =>
      target.kind === 'builtin'
        ? s.editBuiltIn(target.index, label, change)
        : s.edit(q.id, label, change);
  for (const input of form.querySelectorAll('[data-text]'))
    input.addEventListener('change', () =>
      edit('Change ' + input.dataset.text, (x) => (x[input.dataset.text] = input.value)),
    );
  for (const input of form.querySelectorAll('[data-number]'))
    input.addEventListener('change', () =>
      edit(
        'Change ' + input.dataset.number,
        (x) => (x[input.dataset.number] = Number(input.value)),
      ),
    );
  for (const input of form.querySelectorAll('[data-list]'))
    input.addEventListener('change', () =>
      edit(
        'Change ' + input.dataset.list,
        (x) =>
          (x[input.dataset.list] = input.value
            .split(',')
            .map((v) => v.trim())
            .filter(Boolean)),
      ),
    );
  if (Array.isArray(q.sequences)) bindTimed(q, edit);
  // A timed quest's steps expect one entry per output, and set readings rather than test them.
  const steps = (x) => (x.sequences || []).flatMap((sequence) => sequence.steps);
  $('add-device')?.addEventListener('change', (e) => {
    const id = e.target.value;
    if (!id) return;
    edit('Add ' + device(id).name, (x) => {
      // Sensors before outputs, so the rules and the tests keep their order.
      const at = device(id).output ? x.ids.length : x.ids.findIndex((d) => device(d).output);
      x.ids.splice(at < 0 ? x.ids.length : at, 0, id);
      if (device(id).output) {
        const k = outputsOf(x).indexOf(id);
        if (x.sequences) for (const st of steps(x)) st.expect?.splice(k, 0, null);
        else {
          x.conditions.splice(k, 0, 'false');
          for (const t of x.scenarios) t[2].splice(k, 0, 0);
        }
      }
    });
  });
  for (const b of form.querySelectorAll('[data-remove]'))
    b.addEventListener('click', () => {
      const id = b.dataset.remove;
      edit('Remove ' + device(id).name, (x) => {
        if (device(id).output) {
          const k = outputsOf(x).indexOf(id);
          if (x.sequences)
            for (const st of steps(x)) {
              st.expect?.splice(k, 1);
              if (st.expect?.every((v) => v === null)) delete st.expect;
            }
          else {
            x.conditions.splice(k, 1);
            for (const t of x.scenarios) t[2].splice(k, 1);
          }
        } else if (!x.sequences) for (const t of x.scenarios) delete t[1][device(id).signal];
        x.ids = x.ids.filter((d) => d !== id);
      });
    });
  // Rules
  const rewrite = (i, change) =>
    edit('Change rule', (x) => {
      const clauses = clausesOf(x.conditions[i]) || [];
      change(clauses);
      x.conditions[i] = conditionOf(clauses);
    });
  for (const el of form.querySelectorAll('[data-clause]'))
    el.addEventListener('change', () => {
      const [i, k, key] = el.dataset.clause.split(':');
      rewrite(
        Number(i),
        (clauses) => (clauses[k][key] = key === 'value' ? Number(el.value) : el.value),
      );
    });
  for (const el of form.querySelectorAll('[data-join]'))
    el.addEventListener('change', () => {
      const [i, k] = el.dataset.join.split(':').map(Number);
      rewrite(i, (clauses) => (clauses[k].join = el.value));
    });
  for (const el of form.querySelectorAll('[data-unclause]'))
    el.addEventListener('click', () => {
      const [i, k] = el.dataset.unclause.split(':').map(Number);
      rewrite(i, (clauses) => {
        clauses.splice(k, 1);
        if (clauses[0]) clauses[0].join = null;
      });
    });
  for (const el of form.querySelectorAll('[data-addclause]'))
    el.addEventListener('click', () => {
      const i = Number(el.dataset.addclause),
        sensor = device(sensorsOf(q)[0]),
        [lo, hi] = readingRange(sensor);
      rewrite(i, (clauses) =>
        clauses.push({
          join: clauses.length ? '&&' : null,
          signal: sensor.signal,
          op: hi === 1 ? '==' : '<',
          value: hi === 1 ? 1 : Math.round((lo + hi) / 2),
        }),
      );
    });
  for (const el of form.querySelectorAll('[data-rule-text]'))
    el.addEventListener('change', () =>
      edit('Change rule', (x) => (x.conditions[Number(el.dataset.ruleText)] = el.value)),
    );
  // Tests
  for (const el of form.querySelectorAll('[data-test-name]'))
    el.addEventListener('change', () =>
      edit('Rename test', (x) => (x.scenarios[Number(el.dataset.testName)][0] = el.value)),
    );
  for (const el of form.querySelectorAll('[data-test]'))
    el.addEventListener('change', () =>
      edit('Change reading', (x) => {
        const env = x.scenarios[Number(el.dataset.test)][1],
          signal = el.dataset.signal;
        if (el.value === '') delete env[signal];
        else env[signal] = toLevel(signal, Number(el.value));
      }),
    );
  for (const el of form.querySelectorAll('[data-flip]'))
    el.addEventListener('click', () =>
      edit('Change result', (x) => {
        const expected = x.scenarios[Number(el.dataset.flip)][2],
          i = Number(el.dataset.output);
        expected[i] = expected[i] ? 0 : 1;
      }),
    );
  for (const el of form.querySelectorAll('[data-drop]'))
    el.addEventListener('click', () =>
      edit('Remove test', (x) => x.scenarios.splice(Number(el.dataset.drop), 1)),
    );
  $('add-test')?.addEventListener('click', () =>
    edit('Add test', (x) => {
      const last = x.scenarios.at(-1);
      x.scenarios.push([
        `Test ${x.scenarios.length + 1}`,
        last ? { ...last[1] } : {},
        last ? [...last[2]] : outputsOf(x).map(() => 0),
      ]);
    }),
  );
  $('from-rules')?.addEventListener('click', () =>
    edit('Results from the rules', (x) => {
      const results = resultsFromRules(x);
      x.scenarios.forEach((t, r) => (t[2] = results[r]));
    }),
  );
  $('suggest')?.addEventListener('click', () =>
    edit('Suggest tests', (x) => {
      // Either side of each threshold, every other reading as usual, results from the rules.
      const seen = new Set(x.scenarios.map(([name]) => name));
      for (const condition of x.conditions)
        for (const c of clausesOf(condition) || []) {
          const d = components.find((k) => k.signal === c.signal),
            [lo, hi] = (d && readingRange(d)) || [0, 4095],
            step = hi === 1 ? 1 : Math.max(1, Math.round((hi - lo) / 20));
          for (const [label, reading] of [
            ['below', Math.max(lo, c.value - step)],
            ['above', Math.min(hi, c.value + step)],
          ]) {
            const name = `${d?.name || c.signal} ${label} ${c.value}`;
            if (seen.has(name)) continue;
            seen.add(name);
            x.scenarios.push([name, { [c.signal]: toLevel(c.signal, reading) }, []]);
          }
        }
      const results = resultsFromRules(x);
      x.scenarios.forEach((t, r) => t[2].length || (t[2] = results[r]));
    }),
  );
  $('duplicate')?.addEventListener('click', () => {
    const id = state.session.create({
      ...JSON.parse(JSON.stringify(q)),
      title: q.title + ' (copy)',
    });
    pick({ kind: 'mine', id });
  });
  $('delete')?.addEventListener('click', () => {
    const later = state.session.quests.length - 1 - state.session.quests.indexOf(q);
    if (
      !confirm(
        `Delete "${q.title}"?` +
          (later > 0
            ? `\n\nYour quests after it move up one place. If this quest was saved before, players' progress for those ${later} quest${later > 1 ? 's' : ''} may no longer line up.`
            : ''),
      )
    )
      return;
    state.session.remove(q.id);
    state.pick = null;
  });
  $('reset-quest')?.addEventListener('click', () => s.resetBuiltIn(target.index));
  $('make-timed')?.addEventListener('click', () => s.makeTimed(q.id));
  $('copy')?.addEventListener('click', () => {
    const id = s.create({ ...JSON.parse(JSON.stringify(q)), title: q.title + ' (copy)' });
    pick({ kind: 'mine', id });
  });
}
// What a built-in quest's changes mean in the game.
function builtInNotes(target) {
  const s = state.session,
    m = missions[target.index],
    notes = [
      `Built-in quest ${target.index + 1} of ${builtIn.length}. Your changes apply wherever it is played; Reset to original puts it back.`,
    ];
  if (target.index < 8)
    notes.push(
      'Each city gives this quest a local title of its own, so a new title shows only where none is set.',
    );
  if (m.advanced && isRuleQuest(m))
    notes.push(
      'It has an Advanced version: if you change its devices, rules or tests, yours apply at both levels.',
    );
  if (m.advanced && isTimedQuest(m))
    notes.push(
      'It has an Advanced version with sequences of its own: if you change the sequences or the worked program, yours apply at both levels.',
    );
  if (isTimedQuest(m) && s.hasCodedChecks(target.index))
    notes.push(
      'Steps marked “coded check” also check what the program printed or published, with code written into the quest: those checks stay as coded, and go if you remove their step.',
    );
  return `<div class="heading"><span class="notice">${notes.map(escape).join('<br />')}</span></div>`;
}

// ---- The check ------------------------------------------------------------------------------
function renderCheck(q, result) {
  const { errors, warnings, runs, mission } = result,
    ok = !errors.length,
    run = runs.find((r) => r.board === 'ESP32' && r.language === state.language);
  if (result.storyOnly) {
    $('check').innerHTML =
      `<section><div class="verdict ${ok ? 'ok' : 'bad'}">${icon(ok ? 'check' : 'warning', 18)}<div>${ok ? 'Story changes only' : 'Fix before saving'}
      <span>${ok ? 'This quest plays as the game makes it; its story is yours to change.' : errors.map(escape).join(' ')}</span></div></div></section>`;
    return;
  }
  let steps = [];
  try {
    if (mission)
      steps = coachSteps(mission, state.language, defaults(mission.ids, 'ESP32'), 'ESP32') || [];
  } catch {}
  $('check').innerHTML = `
    <section>
      <div class="verdict ${ok ? 'ok' : 'bad'}">${icon(ok ? 'check' : 'warning', 18)}<div>${ok ? 'Ready to play' : `${errors.length} problem${errors.length > 1 ? 's' : ''} to fix`}
        <span>${ok ? 'The worked solution passes every test on both boards in both languages, and a program that does nothing fails.' : 'Fix these before saving.'}</span></div></div>
      ${
        errors.length || warnings.length
          ? `<ul class="issues" style="margin-top:10px">${[
              ...errors.map((e) => ['error', e]),
              ...warnings.map((w) => ['warning', w]),
            ]
              .map(
                ([level, text]) =>
                  `<li class="${level}">${icon('warning', 14)}<span>${escape(text)}</span></li>`,
              )
              .join('')}</ul>`
          : ''
      }
    </section>
    ${
      runs.length
        ? `<section><h3>Worked solution</h3><div class="runs">${runs
            .map((r) => {
              const passed = r.results.filter((x) => x.pass).length;
              return `<span>${r.board === 'ESP32' ? 'ESP32' : 'Pico'} · ${r.name}</span><span class="${passed === r.results.length ? 'pass' : 'fail'}">${passed}/${r.results.length} tests</span>`;
            })
            .join('')}</div></section>`
        : ''
    }
    ${
      run?.results.some((r) => !r.pass)
        ? `<section><h3>What fails (ESP32 · ${escape(run.name)})</h3><ul class="issues">${run.results
            .filter((r) => !r.pass)
            .slice(0, 6)
            .map(
              (r) =>
                `<li class="error">${icon('warning', 14)}<span><b>${escape(r.name)}</b>: ${escape(
                  r.detail ??
                    `expected ${(r.expected || []).map((v) => (v ? 'ON' : 'OFF')).join(', ')}, the program gave ${(r.actual || []).map((v) => (v ? 'ON' : 'OFF')).join(', ')}`,
                )}</span></li>`,
            )
            .join('')}</ul></section>`
        : ''
    }
    ${
      run
        ? `<section><div class="segmented lang-tabs">${LANGUAGES.map(([id, name]) => `<button data-language="${id}" class="${state.language === id ? 'active' : ''}">${name}</button>`).join('')}</div>
          <pre class="code">${escape(run.code)}</pre><p class="note" style="margin-top:6px;color:var(--faint);font-size:12px">What a correct program looks like (ESP32). Students write their own, guided step by step.</p></section>`
        : ''
    }
    ${
      steps.length
        ? `<section><h3>The Guide's steps</h3><ol style="margin:0;padding-left:18px;font-size:12px;color:var(--muted)">${steps
            .map((step) => `<li>${escape(step.title || step.name || '')}</li>`)
            .join('')}</ol></section>`
        : ''
    }`;
  for (const b of $('check').querySelectorAll('[data-language]'))
    b.addEventListener('click', () => {
      state.language = b.dataset.language;
      renderCheck(q, result);
    });
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
  if (state.pick?.kind === 'mine' && !s.quest(state.pick.id)) state.pick = null;
  // Keep the scroll position: the form is drawn again after every change.
  const top = $('form').scrollTop;
  render();
  $('form').scrollTop = top;
}
async function save() {
  const broken = state.session.quests.find((q) => checkOf(q).errors.length);
  if (broken) {
    pick({ kind: 'mine', id: broken.id });
    toast(`"${broken.title}" has problems to fix before saving.`, true);
    return false;
  }
  const brokenBuiltIn = Object.keys(state.session.edits)
    .map((key) => Number(key.split(':')[1]))
    .find((i) => checkBuiltInOf(i).errors.length);
  if (brokenBuiltIn !== undefined) {
    pick({ kind: 'builtin', id: brokenBuiltIn });
    toast(
      `Your changes to "${state.session.builtInSpec(brokenBuiltIn).title}" need fixing before saving.`,
      true,
    );
    return false;
  }
  try {
    await shell.write('quests', state.session.savedFile());
  } catch (error) {
    toast('Could not save: ' + error.message, true);
    return false;
  }
  state.session.markSaved();
  toast('Saved to public/data/quests.js');
  return true;
}
function newQuest() {
  pick({ kind: 'mine', id: state.session.create() });
}
function undo(redo = false) {
  const text = redo ? state.session.redo() : state.session.undo();
  if (text) toast(`${redo ? 'Redid' : 'Undid'}: ${text}`);
}
// fromStart: the game from the beginning, rather than at what is being edited.
async function playtest(fromStart = false) {
  if (state.session.isChanged()) {
    if (!confirm('The game plays saved quests only. Save now and open the game?')) return;
    if (!(await save())) return;
  }
  // Started on the selected quest: yours join the game's list after the built-in ones.
  const pick = state.pick,
    quest =
      pick?.kind === 'builtin'
        ? pick.id
        : pick?.kind === 'mine'
          ? builtIn.length + state.session.quests.findIndex((q) => q.id === pick.id)
          : null;
  shell.openGame(fromStart ? null : { quest: quest >= 0 ? quest : null });
}
$('new').addEventListener('click', newQuest);
$('undo').addEventListener('click', () => undo());
$('redo').addEventListener('click', () => undo(true));
$('save').addEventListener('click', save);
$('playtest').addEventListener('click', (e) => playtest(e.shiftKey));
$('home').addEventListener('click', (e) => {
  if (
    state.session?.isChanged() &&
    !confirm('Leave the Quest Editor? Unsaved changes will be lost.')
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
  if (typing() || mod) return;
  if (key === 'n') newQuest();
});
shell?.onMenu((command) => {
  if (command === 'save') save();
  else if (command === 'playtest' || command === 'playstart') playtest(command === 'playstart');
  else if (typing()) document.execCommand(command);
  else undo(command === 'redo');
});

// For test scripts and the developer console.
window.questEditor = { state };

async function start() {
  const saved = shell
    ? await shell.read('quests')
    : (await import('../../../public/data/quests.js')).default;
  state.session = new QuestSession(saved);
  state.session.on(changed);
  changed();
}
start().catch((error) => {
  $('form').innerHTML = `<div class="blank"><h2>The Quest Editor could not start</h2><p>${
    /No handler registered/.test(error.message)
      ? 'The editor was updated while it was open. Quit it (⌘Q) and run scripts/world-editor.sh again.'
      : escape(error.message)
  }</p></div>`;
  console.error(error);
});
