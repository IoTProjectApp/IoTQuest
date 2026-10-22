// The Street Editor's plan: the town from above on a 2D canvas, in the town's own metres (x east,
// z south, so north is up). Draws the lots, roads, junctions, crossings and bus stops, the running
// traffic, the selection and the problems, and turns pointer positions into town positions.

const COLOURS = {
  ground: '#1d2228',
  grid: '#232930',
  lot: '#2b313a',
  lotLine: '#3a424d',
  lotText: '#8b95a3',
  verge: '#4a5158',
  asphalt: '#606a73',
  dash: '#d9d3b5',
  junction: '#6b757e',
  zebra: '#e9e4d2',
  accent: '#4f9cf9',
  hover: '#bfd9ff',
  error: '#ef6b6b',
  warning: '#f2b84b',
  green: '#5fd38a',
  red: '#e8604c',
  amber: '#f0a73a',
  car: '#f1f3f5',
  bus: '#f2c94c',
  person: '#9fd3ff',
  lock: '#c9ced6',
  stop: '#e8604c',
};

export class PlanView {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    // Town position at the canvas centre, and pixels per metre.
    this.centre = { x: 120, z: 20 };
    this.scale = 2.4;
    this.hover = null;
    this.selected = null;
    this.ghost = null;
    this.guides = [];
    this.bindNavigation();
  }
  // From canvas pixels (CSS) to town metres, and back.
  toTown(px, py) {
    const { width, height } = this.size();
    return {
      x: this.centre.x + (px - width / 2) / this.scale,
      z: this.centre.z + (py - height / 2) / this.scale,
    };
  }
  toScreen(x, z) {
    const { width, height } = this.size();
    return [
      (x - this.centre.x) * this.scale + width / 2,
      (z - this.centre.z) * this.scale + height / 2,
    ];
  }
  size() {
    return { width: this.canvas.clientWidth || 1, height: this.canvas.clientHeight || 1 };
  }
  // Fits the whole road network in view.
  fit(layout) {
    if (!layout.junctions.length) return;
    const xs = layout.junctions.map((j) => j.x),
      zs = layout.junctions.map((j) => j.z),
      { width, height } = this.size();
    this.centre = {
      x: (Math.min(...xs) + Math.max(...xs)) / 2,
      z: (Math.min(...zs) + Math.max(...zs)) / 2,
    };
    this.scale = Math.min(
      (width - 80) / (Math.max(...xs) - Math.min(...xs) + 60),
      (height - 80) / (Math.max(...zs) - Math.min(...zs) + 60),
    );
  }
  focus(at) {
    this.centre = { x: at.x, z: at.z };
    this.scale = Math.max(this.scale, 4);
  }
  // Scroll zooms about the cursor; right or middle drag (or the Pan tool, or Space) pans.
  bindNavigation() {
    const c = this.canvas;
    c.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        const before = this.toTown(e.offsetX, e.offsetY);
        this.scale = Math.min(30, Math.max(0.6, this.scale * Math.exp(-e.deltaY * 0.0015)));
        const after = this.toTown(e.offsetX, e.offsetY);
        this.centre.x += before.x - after.x;
        this.centre.z += before.z - after.z;
      },
      { passive: false },
    );
    let pan = null;
    c.addEventListener('pointerdown', (e) => {
      if (e.button === 1 || e.button === 2 || this.panning) {
        pan = { x: e.clientX, y: e.clientY };
        c.setPointerCapture(e.pointerId);
        e.stopImmediatePropagation();
      }
    });
    c.addEventListener('pointermove', (e) => {
      if (!pan) return;
      this.centre.x -= (e.clientX - pan.x) / this.scale;
      this.centre.z -= (e.clientY - pan.y) / this.scale;
      pan = { x: e.clientX, y: e.clientY };
      e.stopImmediatePropagation();
    });
    c.addEventListener('pointerup', (e) => {
      if (pan) e.stopImmediatePropagation();
      pan = null;
    });
    c.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  // What is under a town position: a junction (within its disc), else a road (within its width).
  hit(layout, at) {
    const byId = Object.fromEntries(layout.junctions.map((j) => [j.id, j])),
      reach = Math.max(7, 10 / this.scale);
    let best = null,
      nearest = reach;
    for (const j of layout.junctions) {
      const d = Math.hypot(j.x - at.x, j.z - at.z);
      if (d < nearest) [best, nearest] = [{ junction: j.id }, d];
    }
    if (best) return best;
    nearest = Math.max(6, 8 / this.scale);
    for (const r of layout.roads) {
      const d = distanceToSegment(at, byId[r.a], byId[r.b]);
      if (d.distance < nearest) [best, nearest] = [{ road: [r.a, r.b], at: d.point }, d.distance];
    }
    return best;
  }
  // The crossing nearest a town position: the junction and the arm (neighbour) it spans.
  hitCrossing(layout, at) {
    const byId = Object.fromEntries(layout.junctions.map((j) => [j.id, j]));
    let best = null,
      nearest = 16;
    for (const r of layout.roads)
      for (const [id, towards] of [
        [r.a, r.b],
        [r.b, r.a],
      ]) {
        const j = byId[id],
          k = byId[towards],
          length = Math.hypot(k.x - j.x, k.z - j.z),
          // A crossing sits about 8 m out along each arm.
          spot = { x: j.x + ((k.x - j.x) / length) * 8, z: j.z + ((k.z - j.z) / length) * 8 },
          d = Math.hypot(spot.x - at.x, spot.z - at.z);
        if (d < nearest) [best, nearest] = [{ junction: id, towards, spot }, d];
      }
    return best;
  }

  draw({ layout, map, problems = [], traffic = null, lockedJunctions = {}, tool }) {
    const c = this.canvas,
      ctx = this.ctx,
      dpr = globalThis.devicePixelRatio || 1,
      { width, height } = this.size();
    if (c.width !== Math.round(width * dpr) || c.height !== Math.round(height * dpr)) {
      c.width = Math.round(width * dpr);
      c.height = Math.round(height * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = COLOURS.ground;
    ctx.fillRect(0, 0, width, height);
    this.drawGrid(ctx, width, height);
    const s = this.scale,
      byId = Object.fromEntries(layout.junctions.map((j) => [j.id, j])),
      P = (x, z) => this.toScreen(x, z);
    // Lots and their names.
    ctx.font = `${Math.max(10, Math.min(13, s * 4))}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const b of map?.buildings || []) {
      const [x, y] = P(b.x - b.w / 2, b.z - b.d / 2);
      ctx.fillStyle = COLOURS.lot;
      ctx.strokeStyle = COLOURS.lotLine;
      ctx.lineWidth = 1;
      ctx.fillRect(x, y, b.w * s, b.d * s);
      ctx.strokeRect(x + 0.5, y + 0.5, b.w * s - 1, b.d * s - 1);
      if (s > 1.6 && b.w * s > 50) {
        ctx.fillStyle = COLOURS.lotText;
        const [cx, cy] = P(b.x, b.z);
        ctx.fillText(clip(ctx, b.name, b.w * s - 8), cx, cy);
      }
    }
    // Roads: verge, asphalt, then the dashed centre line.
    const road = (width, colour, dash = []) => {
      ctx.strokeStyle = colour;
      ctx.lineWidth = width;
      ctx.lineCap = dash.length ? 'butt' : 'round';
      ctx.setLineDash(dash);
      ctx.beginPath();
      for (const r of layout.roads) {
        const a = byId[r.a],
          b = byId[r.b];
        if (!a || !b) continue;
        ctx.moveTo(...P(a.x, a.z));
        ctx.lineTo(...P(b.x, b.z));
      }
      ctx.stroke();
      ctx.setLineDash([]);
    };
    road(17 * s, COLOURS.verge);
    road(12 * s, COLOURS.asphalt);
    if (s > 1.4) road(Math.max(1, 0.15 * s), COLOURS.dash, [2 * s, 3 * s]);
    // Selected or hovered road.
    for (const [pick, colour] of [
      [this.hover, COLOURS.hover],
      [this.selected, COLOURS.accent],
    ])
      if (pick?.road) {
        const a = byId[pick.road[0]],
          b = byId[pick.road[1]];
        if (!a || !b) continue;
        ctx.strokeStyle = colour;
        ctx.lineWidth = 2;
        ctx.globalAlpha = 0.95;
        for (const side of [-1, 1]) {
          const n = normal(a, b, 9 * side);
          ctx.beginPath();
          ctx.moveTo(...P(a.x + n.x, a.z + n.z));
          ctx.lineTo(...P(b.x + n.x, b.z + n.z));
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }
    // Crossings: zebra stripes between their two corners.
    if (map && s > 1.2)
      for (const crossing of map.crossings) {
        const a = map.walks.nodes[crossing.a],
          b = map.walks.nodes[crossing.b];
        if (!a || !b || crossing.junction === 'yard') continue;
        ctx.strokeStyle = COLOURS.zebra;
        ctx.lineWidth = 2 * s;
        ctx.setLineDash([0.7 * s, 0.8 * s]);
        ctx.beginPath();
        ctx.moveTo(...P(a.x, a.z));
        ctx.lineTo(...P(b.x, b.z));
        ctx.stroke();
        ctx.setLineDash([]);
      }
    // Junctions, with their control and a lock where they must stay.
    const signalled = new Set((map?.junctions || []).filter((j) => j.signal).map((j) => j.id));
    for (const j of layout.junctions) {
      const [x, y] = P(j.x, j.z),
        r = Math.max(5, 6 * s);
      ctx.fillStyle = COLOURS.junction;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      const picked = this.selected?.junction === j.id,
        hovered = this.hover?.junction === j.id;
      if (picked || hovered) {
        ctx.strokeStyle = picked ? COLOURS.accent : COLOURS.hover;
        ctx.lineWidth = picked ? 3 : 2;
        ctx.beginPath();
        ctx.arc(x, y, r + 3, 0, Math.PI * 2);
        ctx.stroke();
      }
      const control = j.control || (signalled.has(j.id) ? 'signals' : 'none');
      if (s > 0.9)
        drawControl(
          ctx,
          control,
          x,
          y,
          Math.max(4, Math.min(9, 2.6 * s)),
          traffic?.phaseAt?.(j.id),
        );
      if (lockedJunctions[j.id] && s > 1.2)
        drawLock(ctx, x + r * 0.75, y - r * 0.75, Math.max(5, Math.min(8, s * 2.4)));
    }
    // Bus stops: a small sign on the kerb.
    if (map && s > 1.2)
      for (const stop of map.busStops) {
        const [x, y] = P(stop.x + stop.kx * 4.5, stop.z + stop.kz * 4.5);
        ctx.fillStyle = COLOURS.bus;
        ctx.fillRect(x - 3, y - 3, 6, 6);
      }
    // Traffic from the running simulation.
    if (traffic) {
      for (const v of traffic.vehicles) {
        const [x, y] = P(v.x, v.z);
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(v.angle);
        ctx.fillStyle = v.kind === 'bus' ? COLOURS.bus : COLOURS.car;
        ctx.fillRect((-v.length / 2) * s, (-v.width / 2) * s, v.length * s, v.width * s);
        ctx.restore();
      }
      ctx.fillStyle = COLOURS.person;
      for (const p of traffic.people) {
        const [x, y] = P(p.x, p.z);
        ctx.beginPath();
        ctx.arc(x, y, Math.max(1.5, 0.4 * s), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // A road being drawn, and the alignment guides that snapped it.
    if (this.ghost) {
      const [a, b] = [P(this.ghost.from.x, this.ghost.from.z), P(this.ghost.to.x, this.ghost.to.z)];
      ctx.strokeStyle = COLOURS.accent;
      ctx.globalAlpha = 0.55;
      ctx.lineWidth = 12 * s;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(...a);
      ctx.lineTo(...b);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#ffffff';
      ctx.font = '12px system-ui, sans-serif';
      ctx.fillText(
        `${Math.round(Math.hypot(this.ghost.to.x - this.ghost.from.x, this.ghost.to.z - this.ghost.from.z))} m`,
        (a[0] + b[0]) / 2,
        (a[1] + b[1]) / 2 - 14,
      );
    }
    ctx.strokeStyle = COLOURS.accent;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    for (const g of this.guides) {
      ctx.beginPath();
      if (g.axis === 'x') {
        const [x] = P(g.value, 0);
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
      } else {
        const [, y] = P(0, g.value);
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
      }
      ctx.stroke();
    }
    ctx.setLineDash([]);
    // Where the crossing tool would act.
    if (tool === 'crossing' && this.hover?.crossing) {
      const [x, y] = P(this.hover.crossing.spot.x, this.hover.crossing.spot.z);
      ctx.strokeStyle = COLOURS.hover;
      ctx.lineWidth = 2;
      ctx.strokeRect(x - 10, y - 10, 20, 20);
    }
    // Problems: a ring at each, red for errors and amber for warnings.
    for (const p of problems)
      if (p.at) {
        const [x, y] = P(p.at.x, p.at.z);
        ctx.strokeStyle = p.level === 'error' ? COLOURS.error : COLOURS.warning;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(x, y, Math.max(12, 9 * s), 0, Math.PI * 2);
        ctx.stroke();
      }
    this.drawScale(ctx, width, height);
  }
  drawGrid(ctx, width, height) {
    // A faint 48 m grid (the original block size) for orientation.
    const step = 48 * this.scale;
    if (step < 12) return;
    const [ox, oy] = this.toScreen(0, 0);
    ctx.strokeStyle = COLOURS.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = ((ox % step) + step) % step; x < width; x += step) {
      ctx.moveTo(Math.round(x) + 0.5, 0);
      ctx.lineTo(Math.round(x) + 0.5, height);
    }
    for (let y = ((oy % step) + step) % step; y < height; y += step) {
      ctx.moveTo(0, Math.round(y) + 0.5);
      ctx.lineTo(width, Math.round(y) + 0.5);
    }
    ctx.stroke();
  }
  drawScale(ctx, width, height) {
    const metres = [5, 10, 20, 50, 100].find((m) => m * this.scale > 60) || 100,
      length = metres * this.scale,
      x = width - length - 20,
      y = height - 20;
    ctx.strokeStyle = '#9aa3b0';
    ctx.fillStyle = '#9aa3b0';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x, y - 4);
    ctx.lineTo(x, y);
    ctx.lineTo(x + length, y);
    ctx.lineTo(x + length, y - 4);
    ctx.stroke();
    ctx.font = '11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`${metres} m`, x + length / 2, y - 9);
  }
}

// The control a junction shows: signals (three lamps, lit by the running phase), a stop sign, a
// give-way triangle, or nothing.
function drawControl(ctx, control, x, y, r, phase) {
  ctx.save();
  if (control === 'signals') {
    ctx.fillStyle = '#20262d';
    ctx.fillRect(x - r * 0.55, y - r * 1.2, r * 1.1, r * 2.4);
    [
      [COLOURS.red, -0.75],
      [COLOURS.amber, 0],
      [COLOURS.green, 0.75],
    ].forEach(([colour, dy], i) => {
      ctx.fillStyle = colour;
      ctx.globalAlpha = phase == null || phase === i ? 1 : 0.3;
      ctx.beginPath();
      ctx.arc(x, y + dy * r, r * 0.3, 0, Math.PI * 2);
      ctx.fill();
    });
  } else if (control === 'stop') {
    ctx.fillStyle = COLOURS.stop;
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = Math.PI / 8 + (i * Math.PI) / 4;
      ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    }
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.fillRect(x - r * 0.55, y - r * 0.12, r * 1.1, r * 0.24);
  } else if (control === 'giveway') {
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = COLOURS.stop;
    ctx.lineWidth = Math.max(1.5, r * 0.25);
    ctx.beginPath();
    ctx.moveTo(x - r, y - r * 0.6);
    ctx.lineTo(x + r, y - r * 0.6);
    ctx.lineTo(x, y + r);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}
function drawLock(ctx, x, y, r) {
  ctx.save();
  ctx.fillStyle = COLOURS.lock;
  ctx.strokeStyle = COLOURS.lock;
  ctx.lineWidth = Math.max(1.2, r * 0.22);
  ctx.beginPath();
  ctx.arc(x, y - r * 0.2, r * 0.42, Math.PI, 0);
  ctx.stroke();
  ctx.fillRect(x - r * 0.6, y - r * 0.2, r * 1.2, r * 0.9);
  ctx.restore();
}
const normal = (a, b, d) => {
  const length = Math.hypot(b.x - a.x, b.z - a.z) || 1;
  return { x: (-(b.z - a.z) / length) * d, z: ((b.x - a.x) / length) * d };
};
export function distanceToSegment(p, a, b) {
  const dx = b.x - a.x,
    dz = b.z - a.z,
    t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz || 1))),
    point = { x: a.x + dx * t, z: a.z + dz * t };
  return { distance: Math.hypot(p.x - point.x, p.z - point.z), point, t };
}
function clip(ctx, text, width) {
  if (ctx.measureText(text).width <= width) return text;
  let s = text;
  while (s.length > 1 && ctx.measureText(s + '…').width > width) s = s.slice(0, -1);
  return s + '…';
}
