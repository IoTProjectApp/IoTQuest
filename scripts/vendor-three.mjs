// Copies three.js (node_modules/three, pinned in package.json) into public/vendor for the game,
// which loads modules straight from public/ without a bundler or import map: the add-ons' bare
// 'three' imports are pointed at the copied build. Run with: node scripts/vendor-three.mjs
import { readFile, writeFile, copyFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const THREE = ROOT + 'node_modules/three/';
const VENDOR = ROOT + 'public/vendor/';
// The add-ons the three.js renderer uses, and where each lives in three's examples.
const ADDONS = {
  'GLTFLoader.js': 'loaders/GLTFLoader.js',
  'BufferGeometryUtils.js': 'utils/BufferGeometryUtils.js',
  'SkeletonUtils.js': 'utils/SkeletonUtils.js',
};

await mkdir(VENDOR + 'three-addons', { recursive: true });
await copyFile(THREE + 'build/three.module.min.js', VENDOR + 'three.module.min.js');
await copyFile(THREE + 'LICENSE', VENDOR + 'THREE-LICENSE.txt');
for (const [name, path] of Object.entries(ADDONS)) {
  const source = (await readFile(THREE + 'examples/jsm/' + path, 'utf8'))
    .replace(/from 'three';/g, "from '../three.module.min.js';")
    .replace(/from '\.\.\/utils\/([A-Za-z]+\.js)';/g, "from './$1';");
  if (/from '(three'|\.\.\/(?!three\.module))/.test(source))
    throw Error(name + ' still has an unresolved import');
  await writeFile(VENDOR + 'three-addons/' + name, source);
}
const { version } = JSON.parse(await readFile(THREE + 'package.json', 'utf8'));
console.log(`Vendored three.js ${version} with ${Object.keys(ADDONS).join(', ')}`);
