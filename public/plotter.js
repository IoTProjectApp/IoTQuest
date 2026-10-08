import { esc } from './html.js';
import { analyzeCode } from './code-analysis.js';
// Serial plotter: analogue inputs and printed values as lines on a shared simulated-time axis
// (one lane and y-scale per measurement, never a dual axis), digital inputs and outputs as
// on/off strips, and dashed threshold lines taken from comparisons in the student's code.
export const PLOT_LIMIT = 2400;
const SERIES_SLOTS = 8,
  SERIAL_SERIES_LIMIT = 6;

// Arduino Serial Plotter format: numbers separated by spaces, commas or tabs, each optionally
// written as label:value. Lines containing anything else are text and are not plotted.
export function parsePlotLine(line) {
  const parts = String(line)
      .trim()
      .split(/[\s,]+/)
      .filter(Boolean),
    values = [];
  for (const [index, part] of parts.entries()) {
    const m = part.match(/^(?:([A-Za-z_][\w.-]*):)?(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)$/);
    if (!m) return [];
    values.push([m[1] || 'value ' + (index + 1), Number(m[2])]);
  }
  return values;
}

// Thresholds are `reading <op> number` comparisons on connected input pins.
export function findThresholds(code, language, devices) {
  const inputPins = new Set(devices.filter((d) => !d.output).map((d) => Number(d.pin))),
    found = new Map();
  for (const c of analyzeCode(code, language).comparisons) {
    const key = c.pin + ':' + c.value;
    if (inputPins.has(c.pin) && !found.has(key))
      found.set(key, { pin: c.pin, value: c.value, op: c.op, line: c.line });
  }
  return [...found.values()];
}

const outputLevel = (device, v) =>
  !v
    ? 0
    : ['servo', 'gate'].includes(device.id)
      ? Math.min(1, v / 180)
      : v > 1
        ? Math.min(1, v / 255)
        : 1;

// Turn samples into drawable lanes. Pure, so it is shared by the canvas, CSV and tests.
export function buildLanes(samples, devices, thresholds = []) {
  const lanes = [],
    strips = [];
  let slot = 0;
  const sampled = (pin) => samples.some((s) => s.inputs?.[pin] !== undefined);
  for (const d of devices.filter((d) => !d.output && sampled(d.pin))) {
    const points = samples
      .filter((s) => s.inputs?.[d.pin] !== undefined)
      .map((s) => [s.t, Number(s.inputs[d.pin])]);
    if (d.analog)
      lanes.push({
        id: 'pin-' + d.pin,
        label: d.name + ' · GPIO ' + d.pin,
        series: [{ id: 'pin-' + d.pin, label: d.name, slot: slot++ % SERIES_SLOTS, points }],
        thresholds: thresholds.filter((t) => t.pin === Number(d.pin)),
      });
    else strips.push({ id: 'pin-' + d.pin, label: d.name, kind: 'input', points });
  }
  const serial = new Map();
  for (const s of samples)
    for (const line of s.lines || [])
      for (const [label, v] of parsePlotLine(line)) {
        if (!serial.has(label) && serial.size >= SERIAL_SERIES_LIMIT) continue;
        if (!serial.has(label)) serial.set(label, []);
        serial.get(label).push([s.t, v]);
      }
  if (serial.size)
    lanes.push({
      id: 'serial',
      label: 'Serial values',
      series: [...serial].map(([label, points]) => ({
        id: 'serial-' + label,
        label,
        slot: slot++ % SERIES_SLOTS,
        points,
      })),
      thresholds: [],
    });
  for (const d of devices.filter((d) => d.output))
    strips.push({
      id: 'out-' + d.pin,
      label: d.name,
      kind: 'output',
      points: samples.map((s) => [s.t, outputLevel(d, s.outputs?.[d.pin])]),
    });
  return { lanes, strips };
}

export function plotCSV(samples, devices) {
  const { lanes, strips } = buildLanes(samples, devices),
    columns = [...lanes.flatMap((l) => l.series), ...strips],
    times = [...new Set(samples.map((s) => s.t))],
    lookup = columns.map((c) => new Map(c.points)),
    quote = (s) => '"' + String(s).replace(/"/g, '""') + '"';
  return [
    ['seconds', ...columns.map((c) => c.label)].map(quote).join(','),
    ...times.map((t) =>
      [(t / 1000).toFixed(1), ...lookup.map((m) => (m.has(t) ? m.get(t) : ''))].join(','),
    ),
  ].join('\n');
}

const WINDOWS = { auto: null, 30: 30e3, 120: 120e3, 600: 600e3, 3600: 3600e3, all: Infinity };
const LANE_HEIGHT = 64,
  LANE_TITLE = 18,
  STRIP_HEIGHT = 16,
  GUTTER = 104,
  RIGHT = 54,
  AXIS = 20,
  GAP = 10;
const formatTime = (ms) => {
  const s = ms / 1000;
  return s >= 3600
    ? (s / 3600).toFixed(1) + ' h'
    : s >= 120
      ? (s / 60).toFixed(s >= 600 ? 0 : 1) + ' min'
      : s.toFixed(s >= 10 ? 0 : 1) + ' s';
};
const formatValue = (v) =>
  Math.abs(v) >= 1000 || Number.isInteger(v)
    ? String(Math.round(v))
    : v.toFixed(Math.abs(v) < 10 ? 2 : 1);

export class SerialPlotter {
  constructor({ onDownload } = {}) {
    this.onDownload = onDownload;
    this.window = 'auto';
    this.paused = false;
    this.frozen = null;
    this.hidden = new Set();
    this.hoverX = null;
    this.data = { samples: [], devices: [], thresholds: [], speed: 1 };
  }
  static markup() {
    return (
      '<section class="plotter" aria-labelledby="plotTitle"><div class="plotter-head"><strong id="plotTitle">Serial plotter</strong>' +
      '<span class="plotter-note" id="plotNote">Simulated time</span><div class="plotter-actions">' +
      '<label>Window <select id="plotWindow" aria-label="Plot time window"><option value="auto">Auto</option><option value="30">30 s</option><option value="120">2 min</option><option value="600">10 min</option><option value="3600">1 h</option><option value="all">All</option></select></label>' +
      '<button class="text-btn" id="plotPause" aria-pressed="false">Pause</button><button class="text-btn" id="plotClear">Clear</button><button class="text-btn" id="plotCsv">CSV</button></div></div>' +
      '<div class="plotter-body" id="plotBody"><canvas id="plotCanvas" role="img" aria-label="Serial plot"></canvas><div class="plot-tooltip" id="plotTooltip" hidden></div>' +
      '<p class="plot-empty" id="plotEmpty">Run your program to plot sensor readings, outputs and <code>Serial.println</code> values. Dashed lines mark thresholds from your code.</p></div>' +
      '<div class="plot-legend" id="plotLegend"></div></section>'
    );
  }
  // Wire up controls after markup() is inserted into the page.
  attach({ onClear }) {
    const $ = (id) => document.getElementById(id);
    this.canvas = $('plotCanvas');
    $('plotWindow').value = this.window;
    $('plotWindow').onchange = () => {
      this.window = $('plotWindow').value;
      this.render();
    };
    $('plotPause').onclick = () => {
      this.paused = !this.paused;
      this.frozen = this.paused ? { ...this.data, samples: [...this.data.samples] } : null;
      $('plotPause').textContent = this.paused ? 'Resume' : 'Pause';
      $('plotPause').setAttribute('aria-pressed', String(this.paused));
      this.render();
    };
    $('plotClear').onclick = () => {
      onClear?.();
      this.frozen = null;
      this.render();
    };
    $('plotCsv').onclick = () =>
      this.onDownload?.(plotCSV(this.view().samples, this.view().devices));
    $('plotLegend').onclick = (e) => {
      const id = e.target.closest?.('[data-series]')?.dataset.series;
      if (!id) return;
      if (this.hidden.has(id)) this.hidden.delete(id);
      else this.hidden.add(id);
      this.render();
    };
    if (this.canvas) {
      this.canvas.onpointermove = (e) => {
        const r = this.canvas.getBoundingClientRect();
        this.hoverX = e.clientX - r.left;
        this.render();
      };
      this.canvas.onpointerleave = () => {
        this.hoverX = null;
        this.render();
      };
    }
    this.render();
  }
  update(data) {
    this.data = data;
    if (this.pending) return;
    this.pending = true;
    const draw = () => {
      this.pending = false;
      this.render();
    };
    if (typeof requestAnimationFrame === 'function' && typeof document.hidden === 'boolean')
      requestAnimationFrame(draw);
    else draw();
  }
  view() {
    return this.frozen || this.data;
  }
  windowMs(samples, speed) {
    const span = WINDOWS[this.window];
    if (span !== null) return span;
    return 60e3 * Math.max(1, speed || 1);
  }
  render() {
    const $ = (id) => document.getElementById(id);
    if (!$('plotLegend')) return;
    const { samples, devices, thresholds, speed } = this.view(),
      last = samples.at(-1)?.t ?? 0,
      span = this.windowMs(samples, speed),
      from = Number.isFinite(span) ? last - span : (samples[0]?.t ?? 0),
      visible = samples.filter((s) => s.t >= from),
      { lanes, strips } = buildLanes(visible, devices, thresholds);
    $('plotEmpty').hidden = visible.length > 0;
    $('plotNote').textContent = visible.length
      ? 'Simulated time · ' + formatTime(Math.max(0, last - (visible[0]?.t ?? last))) + ' shown'
      : 'Simulated time';
    this.renderLegend(lanes, strips);
    this.draw(lanes, strips, visible, from, last);
  }
  renderLegend(lanes, strips) {
    const html = lanes
      .flatMap((lane) => lane.series)
      .map(
        (s) =>
          '<button class="plot-key' +
          (this.hidden.has(s.id) ? ' off' : '') +
          '" data-series="' +
          esc(s.id) +
          '" aria-pressed="' +
          !this.hidden.has(s.id) +
          '"><i style="background:var(--plot-' +
          (s.slot + 1) +
          ')"></i>' +
          esc(s.label) +
          '</button>',
      )
      .concat(
        strips.length
          ? ['<span class="plot-key-note">Bars show inputs/outputs that are on</span>']
          : [],
      )
      .join('');
    const legend = document.getElementById('plotLegend');
    if (legend.innerHTML !== html) legend.innerHTML = html;
  }
  draw(lanes, strips, visible, from, to) {
    const canvas = this.canvas,
      ctx = canvas?.getContext?.('2d');
    if (!ctx) return;
    const style = getComputedStyle(canvas),
      color = (name) => style.getPropertyValue('--plot-' + name).trim() || '#888',
      dpr = window.devicePixelRatio || 1,
      width = canvas.parentElement.clientWidth || 600,
      height =
        lanes.length * (LANE_TITLE + LANE_HEIGHT + GAP) +
        strips.length * STRIP_HEIGHT +
        AXIS +
        (strips.length ? GAP : 0) +
        6;
    canvas.style.height = height + 'px';
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    if (!visible.length) return;
    const font = '11px ' + (style.getPropertyValue('--mono').trim() || 'monospace'),
      plotW = Math.max(40, width - GUTTER - RIGHT),
      range = Math.max(1, to - from),
      xOf = (t) => GUTTER + ((t - from) / range) * plotW;
    ctx.font = font;
    ctx.textBaseline = 'middle';
    const hits = [];
    let y = 4;
    for (const lane of lanes) {
      // Lane title sits above its plot so long device names are never truncated.
      ctx.fillStyle = color('text');
      ctx.textAlign = 'left';
      ctx.fillText(lane.label, 0, y + 7);
      y += LANE_TITLE;
      const series = lane.series.filter((s) => !this.hidden.has(s.id)),
        values = [
          ...series.flatMap((s) => s.points.map((p) => p[1])),
          ...lane.thresholds.map((t) => t.value),
        ];
      let lo = Math.min(...values),
        hi = Math.max(...values);
      if (!Number.isFinite(lo)) [lo, hi] = [0, 1];
      if (hi - lo < 1e-9) [lo, hi] = [lo - 1, hi + 1];
      const pad = (hi - lo) * 0.08;
      lo -= pad;
      hi += pad;
      const yOf = (v) => y + LANE_HEIGHT - ((v - lo) / (hi - lo)) * LANE_HEIGHT;
      // Recessive hairline frame and min/max labels in muted ink.
      ctx.strokeStyle = color('grid');
      ctx.lineWidth = 1;
      for (const gy of [y + 0.5, y + LANE_HEIGHT - 0.5]) {
        ctx.beginPath();
        ctx.moveTo(GUTTER, gy);
        ctx.lineTo(GUTTER + plotW, gy);
        ctx.stroke();
      }
      ctx.fillStyle = color('muted');
      ctx.textAlign = 'right';
      ctx.fillText(formatValue(hi - pad), GUTTER - 8, yOf(hi - pad));
      ctx.fillText(formatValue(lo + pad), GUTTER - 8, yOf(lo + pad));
      for (const t of lane.thresholds) {
        const ty = Math.round(yOf(t.value)) + 0.5;
        ctx.setLineDash([5, 4]);
        ctx.strokeStyle = color('threshold');
        ctx.beginPath();
        ctx.moveTo(GUTTER, ty);
        ctx.lineTo(GUTTER + plotW, ty);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = color('muted');
        ctx.textAlign = 'left';
        ctx.fillText(t.op + ' ' + formatValue(t.value), GUTTER + plotW + 6, ty);
      }
      ctx.lineWidth = 2;
      ctx.lineJoin = ctx.lineCap = 'round';
      for (const s of series) {
        ctx.strokeStyle = color(s.slot + 1);
        ctx.beginPath();
        s.points.forEach(([t, v], i) =>
          i ? ctx.lineTo(xOf(t), yOf(v)) : ctx.moveTo(xOf(t), yOf(v)),
        );
        if (s.points.length === 1) ctx.lineTo(xOf(s.points[0][0]) + 1, yOf(s.points[0][1]));
        ctx.stroke();
        hits.push({ series: s, yOf });
      }
      ctx.lineWidth = 1;
      y += LANE_HEIGHT + GAP;
    }
    if (strips.length) {
      for (const strip of strips) {
        ctx.fillStyle = color('text');
        ctx.textAlign = 'left';
        ctx.fillText(truncate(ctx, strip.label, GUTTER - 10), 0, y + STRIP_HEIGHT / 2);
        ctx.fillStyle = color('track');
        ctx.fillRect(GUTTER, y + 3, plotW, STRIP_HEIGHT - 6);
        ctx.fillStyle = color(strip.kind === 'output' ? 'on' : 'input');
        // Merge consecutive samples at the same (quantised) level into whole-pixel runs so
        // semi-transparent slices never overlap into stripes.
        const runs = [];
        strip.points.forEach(([t, level], i) => {
          const q = Math.round(level * 10) / 10,
            end = strip.points[i + 1]?.[0] ?? to;
          if (runs.at(-1)?.level === q) runs.at(-1).end = end;
          else runs.push({ level: q, start: t, end });
        });
        for (const run of runs) {
          if (!run.level) continue;
          const x0 = Math.round(xOf(run.start)),
            x1 = Math.max(x0 + 2, Math.round(xOf(run.end)));
          ctx.globalAlpha = 0.35 + 0.65 * run.level;
          ctx.fillRect(x0, y + 3, x1 - x0, STRIP_HEIGHT - 6);
        }
        ctx.globalAlpha = 1;
        y += STRIP_HEIGHT;
      }
      y += GAP;
    }
    // Time axis: start and end labels in muted ink.
    ctx.fillStyle = color('muted');
    ctx.textAlign = 'left';
    ctx.fillText(formatTime(from), GUTTER, y + 6);
    ctx.textAlign = 'right';
    ctx.fillText(formatTime(to), GUTTER + plotW, y + 6);
    this.drawHover(ctx, hits, strips, visible, xOf, from, to, plotW, y, color);
  }
  drawHover(ctx, hits, strips, visible, xOf, from, to, plotW, bottom, color) {
    const tooltip = document.getElementById('plotTooltip');
    if (this.hoverX === null || this.hoverX < GUTTER || this.hoverX > GUTTER + plotW) {
      tooltip.hidden = true;
      return;
    }
    const target = from + ((this.hoverX - GUTTER) / plotW) * (to - from),
      sample = visible.reduce((best, s) =>
        Math.abs(s.t - target) < Math.abs(best.t - target) ? s : best,
      ),
      x = Math.round(xOf(sample.t)) + 0.5;
    ctx.strokeStyle = color('crosshair');
    ctx.beginPath();
    ctx.moveTo(x, 2);
    ctx.lineTo(x, bottom);
    ctx.stroke();
    const rows = [];
    for (const { series, yOf } of hits) {
      const point = series.points.reduce((best, p) =>
        Math.abs(p[0] - sample.t) < Math.abs(best[0] - sample.t) ? p : best,
      );
      // Marker: 8px dot with a 2px surface ring.
      ctx.fillStyle = color('surface');
      ctx.beginPath();
      ctx.arc(xOf(point[0]), yOf(point[1]), 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = color(series.slot + 1);
      ctx.beginPath();
      ctx.arc(xOf(point[0]), yOf(point[1]), 4, 0, Math.PI * 2);
      ctx.fill();
      rows.push(
        '<div><i style="background:var(--plot-' +
          (series.slot + 1) +
          ')"></i>' +
          esc(series.label) +
          '<b>' +
          formatValue(point[1]) +
          '</b></div>',
      );
    }
    for (const strip of strips) {
      const point = strip.points.find((p) => p[0] === sample.t) || [0, 0];
      rows.push(
        '<div><i class="strip"></i>' +
          esc(strip.label) +
          '<b>' +
          (point[1] ? (point[1] < 1 ? Math.round(point[1] * 100) + '%' : 'ON') : 'OFF') +
          '</b></div>',
      );
    }
    tooltip.innerHTML = '<strong>' + formatTime(sample.t) + '</strong>' + rows.join('');
    tooltip.hidden = false;
    const left = Math.min(x + 12, GUTTER + plotW - 170);
    tooltip.style.left = Math.max(GUTTER, left) + 'px';
  }
}
function truncate(ctx, text, max) {
  if (ctx.measureText(text).width <= max) return text;
  while (text.length > 1 && ctx.measureText(text + '…').width > max) text = text.slice(0, -1);
  return text + '…';
}
