import { locations } from '../public/locations.js';
import { mkdir, cp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
process.chdir(fileURLToPath(new URL('..', import.meta.url)));
for (const file of (await readdir('public')).filter((f) => f.endsWith('.js')))
  execFileSync(process.execPath, ['--check', 'public/' + file]);
await rm('dist', { recursive: true, force: true });
await mkdir('dist/client', { recursive: true });
await mkdir('dist/server', { recursive: true });
await mkdir('dist/.openai', { recursive: true });
await cp('public', 'dist/client', { recursive: true });
await cp('public/game.html', 'dist/client/index.html');
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
