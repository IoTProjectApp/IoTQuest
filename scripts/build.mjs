import { locations } from '../public/locations.js';
import { mkdir, cp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
async function listFiles(dir, prefix = '') {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true }))
    if (entry.isDirectory())
      out.push(...(await listFiles(dir + '/' + entry.name, prefix + entry.name + '/')));
    else if (entry.name !== '.DS_Store') out.push(prefix + entry.name);
  return out.sort();
}
// --channel=dev builds the test copy published at /dev/: it saves progress and offline files under
// its own names and labels itself "Test version" (see public/channel.js).
const channel = (process.argv.find((a) => a.startsWith('--channel=')) || '').slice(10);
if (!/^[a-z0-9]*$/.test(channel)) throw Error('Channel names use a-z and 0-9 only: ' + channel);
process.chdir(fileURLToPath(new URL('..', import.meta.url)));
for (const file of (await readdir('public')).filter((f) => f.endsWith('.js')))
  execFileSync(process.execPath, ['--check', 'public/' + file]);
await rm('dist', { recursive: true, force: true });
await mkdir('dist/client', { recursive: true });
await mkdir('dist/server', { recursive: true });
await mkdir('dist/.openai', { recursive: true });
await cp('public', 'dist/client', { recursive: true });
await cp('public/game.html', 'dist/client/index.html');
if (channel) {
  const source = await readFile('dist/client/channel.js', 'utf8'),
    stamped = source.replace(
      "globalThis.IOTQUEST_CHANNEL = '';",
      'globalThis.IOTQUEST_CHANNEL = ' + JSON.stringify(channel) + ';',
    );
  if (stamped === source) throw Error('public/channel.js has no channel line to stamp');
  await writeFile('dist/client/channel.js', stamped);
  const manifest = JSON.parse(await readFile('dist/client/manifest.webmanifest', 'utf8'));
  // An installed test copy is its own app (its own id) and looks different: the amber of the
  // "Test version" label instead of the main site's blue.
  const testColor = '#b45309';
  manifest.id = './?channel=' + channel;
  manifest.name = 'IoT Quest (test version)';
  manifest.short_name = 'IoT Quest test';
  manifest.theme_color = testColor;
  await writeFile('dist/client/manifest.webmanifest', JSON.stringify(manifest, null, 2) + '\n');
  for (const page of ['index.html', 'game.html', 'teacher.html']) {
    const html = await readFile('dist/client/' + page, 'utf8'),
      recoloured = html.replace(
        /<meta name="theme-color" content="[^"]*"/,
        '<meta name="theme-color" content="' + testColor + '"',
      );
    if (recoloured === html) throw Error(page + ' has no theme-color to recolour');
    await writeFile('dist/client/' + page, recoloured);
  }
}
// Offline support: stamp the service worker with every built file and a content version, so
// installed copies update on the next visit after a deploy.
const files = await listFiles('dist/client');
const version = createHash('sha256');
for (const f of files) version.update(f).update(await readFile('dist/client/' + f));
await writeFile(
  'dist/client/sw.js',
  (await readFile('dist/client/sw.js', 'utf8'))
    .replace(
      "const VERSION = 'dev';",
      'const VERSION = ' + JSON.stringify(version.digest('hex').slice(0, 12)) + ';',
    )
    .replace(
      'const PRECACHE = [];',
      'const PRECACHE = ' +
        JSON.stringify(['./', ...files.filter((f) => f !== 'sw.js').map((f) => './' + f)]) +
        ';',
    ),
);
await cp('.openai/hosting.json', 'dist/.openai/hosting.json');
const proxySource = (await readFile('scripts/weather-proxy.mjs', 'utf8')).replace(
  'export function createWeatherProxy',
  'function createWeatherProxy',
);
const workerSource = await readFile('scripts/asset-worker.mjs', 'utf8');
await writeFile(
  'dist/server/index.js',
  proxySource +
    '\nconst weatherProxy=createWeatherProxy(' +
    JSON.stringify(
      Object.fromEntries(
        locations.map((l) => [l.id, { latitude: l.latitude, longitude: l.longitude }]),
      ),
    ) +
    ');\n' +
    workerSource,
);
console.log(
  'Built IoT Quest: static assets and Cloudflare-compatible Worker. No external dependencies.',
);
