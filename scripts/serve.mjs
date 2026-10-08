import { createWeatherProxy } from './weather-proxy.mjs';
import { locations } from '../public/locations.js';
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
// Serve public/ beside this script, wherever the server is started from.
const root = fileURLToPath(new URL('../public', import.meta.url)),
  port = Number(process.env.PORT || process.argv[2] || 5173);
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
};
const weatherProxy = createWeatherProxy(Object.fromEntries(locations.map((l) => [l.id, l])));
const server = http.createServer(async (req, res) => {
  try {
    const proxy = await weatherProxy(
      new Request('http://localhost' + req.url, { method: req.method }),
    );
    if (proxy) {
      res.writeHead(proxy.status, Object.fromEntries(proxy.headers));
      res.end(await proxy.text());
      return;
    }
    let path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (path === '/') path = '/game.html';
    const file = resolve(root, '.' + path);
    if (!file.startsWith(root + sep)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }
    if (!(await stat(file)).isFile()) throw Error();
    let content = await readFile(file);
    res.writeHead(200, {
      'Content-Type': mime[extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(content);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
  }
});
// Port 0 picks a free port; print the real one (the browser tests read it from this line).
server.listen(port, '127.0.0.1', () =>
  console.log('IoT Quest · Local: http://127.0.0.1:' + server.address().port),
);
