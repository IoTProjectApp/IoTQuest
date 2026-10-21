// The Object tool's catalogue: one item per kind of thing in the open destination (a sofa, a tree,
// a shop), with a picture of it drawn by the game's own renderer.
import { ThreeWorldRenderer } from '../../../public/world-renderer-three.js';
import { multiply, perspective, lookAt } from '../../../public/world-math.js';
import { groupTemplate } from '../../../public/world-layout.js';
import { kindOf, nameOf } from './names.js';

// The first group of each kind is the one copied when placing that kind.
export function catalogueItems(session) {
  const items = new Map();
  for (const group of session.groups.values())
    if (!group.id.startsWith('added/') && !items.has(kindOf(group.id)))
      items.set(kindOf(group.id), {
        kind: kindOf(group.id),
        name: nameOf(kindOf(group.id), 1),
        category: group.category,
        source: group,
      });
  return [...items.values()].sort((a, b) => a.name.localeCompare(b.name));
}

const SIZE = { width: 192, height: 144 },
  FOV = 0.6,
  SUN = { direction: [0.45, 0.8, 0.4], strength: 1, color: [1, 0.97, 0.9] };
// Pictures are drawn one at a time on a hidden canvas and kept as image URLs.
export class Thumbnails {
  constructor() {
    this.canvas = Object.assign(document.createElement('canvas'), SIZE);
    this.renderer = null;
    this.cache = new Map();
    this.queue = [];
  }
  // Calls `done(url)` once the item's picture is ready.
  request(key, source, done) {
    if (this.cache.has(key)) return done(this.cache.get(key));
    this.queue.push({ key, source, done });
    if (this.queue.length === 1) requestAnimationFrame(() => this.drain());
  }
  cancel() {
    this.queue = [];
  }
  drain() {
    // A few per frame keeps the editor responsive while the catalogue fills in.
    for (let i = 0; i < 4 && this.queue.length; i++) {
      const job = this.queue.shift();
      if (!this.cache.has(job.key)) this.cache.set(job.key, this.draw(job.source));
      job.done(this.cache.get(job.key));
    }
    if (this.queue.length) requestAnimationFrame(() => this.drain());
  }
  draw(source) {
    this.renderer ??= new ThreeWorldRenderer(this.canvas);
    const { parts } = groupTemplate(source, source.snapshot),
      { min, max } = source.box,
      centre = [0, 1, 2].map((i) => (min[i] + max[i]) / 2),
      radius = Math.max(0.3, Math.hypot(max[0] - min[0], max[1] - min[1], max[2] - min[2]) / 2),
      distance = radius / Math.sin(FOV / 2),
      eye = [centre[0] + distance * 0.55, centre[1] + distance * 0.5, centre[2] + distance * 0.67],
      near = distance / 50,
      far = distance * 4;
    this.renderer.render({
      pixelWidth: SIZE.width,
      pixelHeight: SIZE.height,
      camera: {
        eye,
        target: centre,
        fov: FOV,
        near,
        far,
        aspect: SIZE.width / SIZE.height,
        mirrored: false,
      },
      matrix: multiply(perspective(FOV, SIZE.width / SIZE.height, near, far), lookAt(eye, centre)),
      pixelScale: SIZE.height / 2 / Math.tan(FOV / 2),
      eye,
      fog: [0.15, 0.17, 0.2],
      day: 1,
      sun: SUN,
      time: 0,
      shadows: [],
      wet: 0,
      haze: 0,
      fogOffset: 10000,
      lights: [],
      objects: parts.map((p) => ({ ...p, rotation: p.rotation || [0, 0, 0] })),
      characters: [],
    });
    return this.canvas.toDataURL('image/png');
  }
}
