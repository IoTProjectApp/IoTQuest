import { esc, setHTML } from './html.js';
import { circuitSnapshot, faultCases, scenarios, RESOURCE_ASSUMPTIONS } from './lab.js';
const $ = (id) => document.getElementById(id);
export function renderLabPanel(tab, ctx) {
  const { lab, devices, outputs, inputs, kinds, env } = ctx;
  if (tab === 'circuit') {
    $('benchContent').innerHTML =
      '<div class="lab-panel"><div class="bench-heading"><div><h3>Live circuit · ' +
      esc(ctx.board) +
      '</h3><p>Indicators use executed GPIO reads and writes. Select a world device to trace its connection.</p></div><button class="outline" id="circuitWire">Edit wiring</button></div><div id="circuitRows"></div><div id="circuitSelection" class="circuit-selection"></div></div>';
    $('circuitWire').onclick = () => ctx.switchTab('wiring');
    updateCircuit(ctx);
  } else if (tab === 'faults') {
    $('benchContent').innerHTML =
      '<div class="lab-panel"><div class="bench-heading"><div><h3>Fault-finding workshop</h3><p>Four isolated repair projects. Your normal installation and code are preserved.</p></div>' +
      (ctx.fault ? '<button class="outline" id="exitFault">Return to quest</button>' : '') +
      '</div><div class="fault-grid">' +
      faultCases
        .map(
          (f) =>
            '<button class="fault-card" data-fault="' +
            f.id +
            '"><span>' +
            f.type +
            '</span><strong>' +
            f.title +
            '</strong><small>Inspect → repair → test</small></button>',
        )
        .join('') +
      (ctx.huntTitle
        ? '<button class="fault-card hunt-card" id="startHunt"><span>Spot the bugs</span><strong>' +
          esc(ctx.huntTitle) +
          '</strong><small>Find 3 planted bugs → fix → test</small></button>'
        : '') +
      '</div>' +
      (ctx.fault
        ? '<div class="debug-card"><strong>' +
          esc(ctx.fault.title) +
          '</strong><p>Inspect Components, Wiring, Code and Live circuit. Repairs must pass bright, dark, and boundary tests.</p><button class="outline" id="progressiveHint">Reveal next hint</button><p id="faultHint"></p><button class="primary" id="testFault">Test the repair</button></div>'
        : '') +
      '</div>';
    document
      .querySelectorAll('[data-fault]')
      .forEach((b) => (b.onclick = () => ctx.startFault(b.dataset.fault)));
    if ($('exitFault')) $('exitFault').onclick = ctx.exitFault;
    if ($('startHunt')) $('startHunt').onclick = ctx.startBugHunt;
    if ($('testFault')) $('testFault').onclick = ctx.test;
    $('progressiveHint')?.addEventListener('click', () => {
      const current = ctx.labState?.() ?? lab,
        index = Math.min(current.hintIndex || 0, ctx.fault.hints.length - 1);
      $('faultHint').textContent = ctx.fault.hints[index];
      current.hintIndex = index + 1;
      ctx.save();
    });
  } else if (tab === 'resources') {
    $('benchContent').innerHTML =
      '<div class="lab-panel"><div class="bench-heading"><div><h3>Energy & water ledger</h3><p>Estimated simulation consumption, integrated from actual output states and elapsed seconds.</p></div><button class="outline" id="resourceAssumptions">Assumptions</button></div><div class="resource-totals" id="resourceTotals"></div><div id="resourceDevices"></div><div id="resourceHistory"></div><p class="weather-readings-note">Mission budgets are assessed over the fixed test window, separately from free-running lifetime totals.</p></div>';
    $('resourceAssumptions').onclick = () =>
      ctx.modal(
        'Documented simulation assumptions',
        '<div class="guide"><p>All totals are estimates for learning. Controller: 1 W; resident kitchen appliance: 120 W while routines use it. Pump: 25 W and 1.1 L/s; valve: 3 W and 0.4 L/s. Base tank: 100 L. Rain-tank upgrade: 200 L and twice the collection area. Soil wetting is scaled for the game.</p><p>Fan: 15 W; AC: 800 W; path LED: 3 W; porch lamp: 5 W. PWM scales estimated consumption. Solar peak: 50 W × sunlight fraction; battery capacity: 100 Wh. Solar covers load, then charges the battery. Battery covers deficits before simulated grid supply.</p><pre>' +
          esc(JSON.stringify(RESOURCE_ASSUMPTIONS, null, 2)) +
          '</pre></div>',
      );
    updateResourcesPanel(ctx);
  } else if (tab === 'export') {
    $('benchContent').innerHTML =
      '<div class="lab-panel"><div class="bench-heading"><div><h3>Take your project with you</h3><p>A ZIP package of the selected controller’s actual code, installed wiring, component list and test evidence.</p></div><div class="bench-actions"><button class="outline" id="importPackage">Import project…</button><button class="primary" id="downloadPackage">Download project ZIP</button></div></div><div class="export-contents">' +
      [
        'Student source (.ino / .py)',
        'Wiring diagram (SVG)',
        'Pin-assignment table (CSV)',
        'Component list & required modules',
        'Mission results & debugging evidence',
        'Setup & hardware adaptation notes',
        'Resource assumptions & totals',
      ]
        .map((s) => '<div>✓ ' + s + '</div>')
        .join('') +
      '</div><p class="weather-readings-note">Virtual calibrated sensors, weather APIs, networking helpers and motor drivers need physical replacements. The package explains 3.3 V logic, resistors and external actuator power.</p></div>';
    $('downloadPackage').onclick = ctx.exportProject;
    $('importPackage').onclick = ctx.importProject;
  }
}
export function updateCircuit(ctx) {
  if (!$('circuitRows')) return;
  const rows = circuitSnapshot(ctx.devices, ctx.outputs, ctx.inputs, ctx.kinds, ctx.env);
  setHTML(
    $('circuitRows'),
    rows
      .map(
        (r) =>
          '<button class="circuit-row ' +
          (ctx.selected === r.id ? 'selected' : '') +
          '" id="circuit-' +
          esc(r.id) +
          '" data-circuit="' +
          esc(r.id) +
          '"><span class="circuit-node ' +
          (r.value > 0 ? 'on' : '') +
          '"></span><strong>' +
          esc(r.name) +
          '</strong><span>GPIO ' +
          r.pin +
          '</span><span>' +
          r.type +
          '</span><code>' +
          (r.type === 'Output'
            ? r.kind === 'pwm'
              ? 'PWM ' + r.value
              : r.kind === 'servo'
                ? r.value + '°'
                : r.value
                  ? 'HIGH'
                  : 'LOW'
            : r.value) +
          '</code><small>' +
          (!r.connected
            ? 'Missing power/GND'
            : r.conflict
              ? 'Pin conflict'
              : r.fault
                ? 'Faulty simulated reading'
                : r.sampled
                  ? 'Executed sample'
                  : 'Not sampled by code yet') +
          '</small></button>',
      )
      .join('') || '<p class="empty-bench">Install a component to begin tracing the circuit.</p>',
  );
  document
    .querySelectorAll('[data-circuit]')
    .forEach((b) => (b.onclick = () => ctx.selectDevice(b.dataset.circuit)));
  if (ctx.selected) {
    const d = ctx.devices.find((d) => d.id === ctx.selected);
    if (d) {
      const pin = String(d.pin),
        related = relatedLines(ctx.code, pin, d.signal || d.id);
      setHTML(
        $('circuitSelection'),
        '<strong>' +
          esc(d.name) +
          ' · GPIO ' +
          d.pin +
          '</strong><pre>' +
          esc(
            related.map((v) => v.line + ': ' + v.text).join('\n') ||
              'No matching pin references. Check the assigned pin in your code.',
          ) +
          '</pre>' +
          (d.faultValue !== undefined
            ? '<button class="outline" id="replaceSensor">Replace / recalibrate simulated probe</button>'
            : ''),
      );
      if ($('replaceSensor')) $('replaceSensor').onclick = () => ctx.repairSensor(d.id);
    }
  }
}
let relatedCache = { key: null, lines: [] };
// Source lines that mention a pin, its signal or a variable bound to it; cached per source.
function relatedLines(code, pin, signal) {
  const key = pin + '\0' + signal + '\0' + code;
  if (relatedCache.key === key) return relatedCache.lines;
  const pinPattern = new RegExp('\\b' + pin + '\\b'),
    bindings = code
      .split('\n')
      .map(
        (text) =>
          text.match(
            new RegExp(
              '\\b([A-Za-z_]\\w*)\\s*=\\s*(?:(?:ADC|PWM)\\(\\s*)?(?:Pin\\(\\s*)?' + pin + '\\b',
            ),
          )?.[1],
      )
      .filter(Boolean),
    lines = code
      .split('\n')
      .map((text, index) => ({ text, line: index + 1 }))
      .filter(
        (v) =>
          pinPattern.test(v.text) ||
          v.text.includes(signal) ||
          bindings.some((name) => new RegExp('\\b' + name + '\\b').test(v.text)),
      );
  relatedCache = { key, lines };
  return lines;
}
export function updateResourcesPanel(ctx) {
  if (!$('resourceTotals')) return;
  const r = ctx.lab.resources;
  setHTML(
    $('resourceTotals'),
    [
      ['Electricity', r.wh.toFixed(3) + ' Wh'],
      ['Water', r.litres.toFixed(2) + ' L'],
      ['Grid supply', r.gridWh.toFixed(3) + ' Wh'],
      ['Solar generated', r.solarWh.toFixed(3) + ' Wh'],
      [
        'Battery',
        ctx.lab.upgrades.includes('battery')
          ? r.batteryWh.toFixed(1) + ' / 100 Wh'
          : 'Not installed',
      ],
    ]
      .map(
        ([name, value]) => '<div><small>' + name + '</small><strong>' + value + '</strong></div>',
      )
      .join(''),
  );
  setHTML(
    $('resourceDevices'),
    Object.entries(r.byDevice)
      .sort((a, b) => b[1].wh - a[1].wh)
      .map(
        ([id, v]) =>
          '<div class="test-row"><strong>' +
          esc(ctx.devices.find((d) => d.id === id)?.name || id) +
          '</strong><span>' +
          v.wh.toFixed(3) +
          ' Wh · ' +
          v.litres.toFixed(2) +
          ' L</span></div>',
      )
      .join(''),
  );
  const history = $('resourceHistory'),
    open = !!history.querySelector?.('details')?.open;
  setHTML(
    history,
    '<details' +
      (open ? ' open' : '') +
      '><summary>Consumption over simulated time (' +
      r.history.length +
      ' samples)</summary><table><thead><tr><th>Simulated minute</th><th>Wh</th><th>Litres</th></tr></thead><tbody>' +
      r.history
        .slice(-24)
        .map(
          (p) =>
            '<tr><td>' +
            (p.seconds / 60).toFixed(1) +
            '</td><td>' +
            p.wh.toFixed(3) +
            '</td><td>' +
            p.litres.toFixed(2) +
            '</td></tr>',
        )
        .join('') +
      '</tbody></table></details>',
  );
}
export function scenarioOptions() {
  return Object.entries(scenarios)
    .map(([id, s]) => '<option value="' + id + '">' + s.name + '</option>')
    .join('');
}
