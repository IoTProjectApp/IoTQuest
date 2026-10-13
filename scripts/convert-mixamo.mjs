// Converts Mixamo FBX downloads (assets-src/mixamo, not committed) into the compressed glTF the
// three.js renderer loads (public/models/people). Run with: node scripts/convert-mixamo.mjs, or
// node scripts/convert-mixamo.mjs James Kate to convert only those characters (and no animations).
//
// Characters (FBX, with skin, T-pose) become one .glb each, without animations: colour maps at
// 1024 px and normal maps at 512 px as JPEG, specular maps dropped (glTF has no use for them),
// and shared vertices merged (the FBX loader writes every triangle corner separately). The
// animations (FBX, without skin, exported on one character) become one animations.glb, plus
// animations.json with each clip's length and how far it moves the hips, which the choreography
// needs to carry a character on from where a clip leaves them.
//
// It runs three.js's own loader and exporter in headless Chromium, from node_modules/three
// (pinned to the version in public/vendor), so nothing else needs installing.
import { chromium } from 'playwright';
import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SOURCE = ROOT + 'assets-src/mixamo/';
const OUT = ROOT + 'public/models/people/';
// Clips that keep their hips travel, because the movement is the point (a throw, a fall, getting
// up); every other clip has it removed so the game moves the character itself.
const KEEP_TRAVEL = ['TakedownAttacker', 'TakedownVictim', 'GettingUp'];

const only = process.argv.slice(2);
const characters = (await readdir(SOURCE)).filter(
  (f) => f.endsWith('.fbx') && (!only.length || only.includes(f.replace(/\.fbx$/, ''))),
);
const animations = (await readdir(SOURCE + 'animations')).filter((f) => f.endsWith('.fbx'));
const IN_PLACE = animations
  .map((f) => f.replace(/\.fbx$/, ''))
  .filter((name) => !KEEP_TRAVEL.includes(name));
await mkdir(OUT, { recursive: true });

// Files reach the page from a small local server: the largest character is 87 MB, more than
// Playwright can hand over in a single routed response.
const server = createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  if (path === '/') {
    res.setHeader('content-type', 'text/html');
    return res.end(
      '<!doctype html><script type="importmap">{"imports":{"three":"/three/build/three.module.js",' +
        '"three/addons/":"/three/examples/jsm/"}}</script>',
    );
  }
  const file = path.startsWith('/three/')
    ? ROOT + 'node_modules/three/' + path.slice(7)
    : path.startsWith('/meshoptimizer/')
      ? ROOT + 'node_modules/meshoptimizer/' + path.slice(15)
      : path.startsWith('/src/')
        ? SOURCE + path.slice(5)
        : null;
  if (!file || file.includes('..')) return res.writeHead(404).end();
  res.setHeader(
    'content-type',
    file.endsWith('.js') ? 'text/javascript' : 'application/octet-stream',
  );
  res.end(await readFile(file));
});
await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
const browser = await chromium.launch();
const page = await browser.newPage();
// The FBX loader warns about every vertex with over four bone weights and every unused map.
page.on('console', (m) => m.text().startsWith('THREE.FBXLoader') || console.log('  ' + m.text()));
await page.goto(`http://127.0.0.1:${server.address().port}/`);
await page.evaluate(setup);

// Each character twice: full detail, and a light version (-low) for software WebGL and people
// far from the camera, at about 15% of the triangles with 512 px textures. Skinning every vertex
// on the CPU is what software WebGL spends its time on, not the materials.
const DETAIL = [
  ['', { keep: 1, colour: 1024, normal: 512 }],
  ['-low', { keep: 0.15, colour: 512, normal: 256 }],
];
for (const file of characters) {
  const name = file.replace(/\.fbx$/, '');
  console.log(name);
  for (const [suffix, options] of DETAIL) {
    const { glb, report } = await page.evaluate(
      ([f, o]) => globalThis.convertCharacter(f, o),
      [file, options],
    );
    await writeFile(OUT + name + suffix + '.glb', Buffer.from(glb, 'base64'));
    console.log('  ' + (suffix || 'full') + ': ' + report);
  }
}
if (only.length) {
  await browser.close();
  server.close();
  process.exit(0);
}
console.log('animations');
const { glb, clips } = await page.evaluate(
  ([files, inPlace]) => globalThis.convertAnimations(files, inPlace),
  [animations.map((f) => 'animations/' + f), IN_PLACE],
);
await writeFile(OUT + 'animations.glb', Buffer.from(glb, 'base64'));
await writeFile(OUT + 'animations.json', JSON.stringify(clips, null, 2) + '\n');
for (const [clip, info] of Object.entries(clips)) console.log('  ' + clip, JSON.stringify(info));
await browser.close();
server.close();

// Runs in the page: defines the conversion functions on globalThis.
async function setup() {
  const THREE = await import('three');
  const { FBXLoader } = await import('three/addons/loaders/FBXLoader.js');
  const { GLTFExporter } = await import('three/addons/exporters/GLTFExporter.js');
  const { mergeVertices } = await import('three/addons/utils/BufferGeometryUtils.js');
  const { MeshoptSimplifier } = await import('/meshoptimizer/meshopt_simplifier.js');
  await MeshoptSimplifier.ready;
  // Keeps a share of a mesh's triangles (texture seams are respected), then drops the vertices no
  // longer used, so they are neither stored nor skinned. A mesh with several materials keeps a
  // share of each material's triangles, in its own group (without groups the exporter would
  // write none of them).
  const simplify = (geometry, keep) => {
    const positions = new Float32Array(geometry.attributes.position.array),
      all = geometry.index.array,
      parts = geometry.groups.length
        ? geometry.groups
        : [{ start: 0, count: all.length, materialIndex: 0 }];
    const groups = [],
      kept = [];
    for (const { start, count, materialIndex } of parts) {
      const index = new Uint32Array(all.subarray(start, start + count)),
        target = Math.floor((index.length * keep) / 3) * 3;
      const [part] = MeshoptSimplifier.simplify(index, positions, 3, target, 0.05);
      groups.push({ start: kept.length, count: part.length, materialIndex });
      kept.push(...part);
    }
    const remap = new Map(),
      order = [];
    const indices = kept.map((v) => {
      if (!remap.has(v)) {
        remap.set(v, order.length);
        order.push(v);
      }
      return remap.get(v);
    });
    const out = new THREE.BufferGeometry();
    for (const [name, attribute] of Object.entries(geometry.attributes)) {
      const size = attribute.itemSize,
        array = new attribute.array.constructor(order.length * size);
      order.forEach((v, i) =>
        array.set(attribute.array.subarray(v * size, v * size + size), i * size),
      );
      out.setAttribute(name, new THREE.BufferAttribute(array, size, attribute.normalized));
    }
    out.setIndex(Array.from(indices));
    out.groups = geometry.groups.length ? groups : [];
    return out;
  };
  // Embedded textures are 4096 px PNGs; decoding a character's nine at once runs the page out
  // of memory. The loader is handed a stand-in for each, decoded one at a time afterwards.
  const pending = [];
  const createObjectURL = URL.createObjectURL;
  URL.createObjectURL = (blob) => 'pending:' + (pending.push({ blob }) - 1);
  const load = THREE.TextureLoader.prototype.load;
  THREE.TextureLoader.prototype.load = function (url, ...rest) {
    if (!String(url).startsWith('pending:')) return load.call(this, url, ...rest);
    const texture = new THREE.Texture();
    pending[Number(url.slice(8))].textures ??= [];
    pending[Number(url.slice(8))].textures.push(texture);
    return texture;
  };
  const fetchBuffer = async (file) =>
    (await fetch('/src/' + encodeURIComponent(file).replace(/%2F/g, '/'))).arrayBuffer();
  const toBase64 = (buffer) => {
    const bytes = new Uint8Array(buffer);
    let text = '';
    for (let i = 0; i < bytes.length; i += 0x8000)
      text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(text);
  };
  // Each Mixamo character numbers its skeleton differently (mixamorig7Hips, mixamorig12Hips…);
  // one shared naming lets every animation play on every character.
  const boneName = (name) => name.replace(/^mixamorig\d*/, 'mixamorig');
  const normaliseBones = (object) => object.traverse((o) => (o.name = boneName(o.name)));
  const exportGlb = (object, animations = []) =>
    new GLTFExporter().parseAsync(object, { binary: true, animations, maxTextureSize: 1024 });
  globalThis.convertCharacter = async (file, { keep, colour, normal }) => {
    pending.length = 0;
    const object = new FBXLoader().parse(await fetchBuffer(file), '');
    // Which pending image each kind of map uses, so each is decoded at the size it needs.
    const sizes = new Map();
    let triangles = 0;
    object.traverse((o) => {
      if (!o.isMesh) return;
      o.geometry.deleteAttribute('color');
      o.geometry = mergeVertices(o.geometry);
      if (keep < 1) o.geometry = simplify(o.geometry, keep);
      triangles += o.geometry.index.count / 3;
      o.material = [].concat(o.material).map((m) => {
        const standard = new THREE.MeshStandardMaterial({
          name: m.name,
          color: m.color,
          map: m.map || null,
          normalMap: m.normalMap || null,
          roughness: 0.85,
          metalness: 0,
          transparent: m.transparent,
          alphaTest: m.transparent ? 0.5 : 0,
        });
        if (standard.map) sizes.set(standard.map, colour);
        if (standard.map) standard.map.isColourMap = true;
        if (standard.normalMap) sizes.set(standard.normalMap, normal);
        return standard;
      });
      if (o.material.length === 1) o.material = o.material[0];
    });
    // Decode, shrink and attach each image that a kept map uses, one at a time.
    let images = 0;
    for (const item of pending) {
      const kept = (item.textures || []).filter((t) => sizes.has(t));
      if (!kept.length) continue;
      const size = Math.max(...kept.map((t) => sizes.get(t)));
      const bitmap = await createImageBitmap(item.blob, {
        resizeWidth: size,
        resizeHeight: size,
        resizeQuality: 'high',
      });
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = size;
      canvas.getContext('2d').drawImage(bitmap, 0, 0);
      bitmap.close();
      for (const t of kept) {
        t.image = canvas;
        // Colour maps hold sRGB colours; normal maps hold directions.
        t.colorSpace = t.isColourMap ? THREE.SRGBColorSpace : THREE.NoColorSpace;
        t.userData.mimeType = 'image/jpeg';
        t.needsUpdate = true;
      }
      images++;
    }
    normaliseBones(object);
    // Mixamo works in centimetres; the game in metres.
    object.scale.setScalar(0.01);
    const materials = new Set();
    object.traverse((o) => o.isMesh && [].concat(o.material).forEach((m) => materials.add(m.name)));
    const glb = await exportGlb(object);
    return {
      glb: toBase64(glb),
      report: `${Math.round(triangles)} triangles, ${images} images, materials: ${[...materials].join(', ')}, ${(glb.byteLength / 1e6).toFixed(2)} MB`,
    };
  };
  globalThis.convertAnimations = async (files, inPlace) => {
    let skeleton = null;
    const clips = [],
      info = {};
    for (const file of files) {
      const name = file.replace(/^animations\//, '').replace(/\.fbx$/, '');
      const object = new FBXLoader().parse(await fetchBuffer(file), '');
      skeleton ??= object;
      const clip = object.animations[0];
      clip.name = name;
      for (const track of clip.tracks) {
        const dot = track.name.lastIndexOf('.');
        track.name = boneName(track.name.slice(0, dot)) + track.name.slice(dot);
      }
      const hips = clip.tracks.find((t) => /Hips\.position$/.test(t.name));
      const v = hips.values,
        start = [v[0], v[1], v[2]],
        end = [v[v.length - 3], v[v.length - 2], v[v.length - 1]];
      if (inPlace.includes(name))
        for (let i = 0; i < v.length; i += 3) {
          v[i] = start[0];
          v[i + 2] = start[2];
        }
      // Hips travel in metres in the character's own frame (+z forward).
      info[name] = {
        duration: +clip.duration.toFixed(3),
        inPlace: inPlace.includes(name),
        move: [+((end[0] - start[0]) / 100).toFixed(3), +((end[2] - start[2]) / 100).toFixed(3)],
        // Hips position (x, height, z) in metres at the first and last frame, before any travel is
        // removed, so one clip can be lined up with where the previous one left the character.
        start: start.map((v) => +(v / 100).toFixed(3)),
        end: end.map((v) => +(v / 100).toFixed(3)),
      };
      clips.push(clip);
    }
    normaliseBones(skeleton);
    skeleton.scale.setScalar(0.01);
    const glb = await exportGlb(skeleton, clips);
    return { glb: toBase64(glb), clips: info };
  };
}
