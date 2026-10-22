// The world editor's desktop shell (development only: never built or deployed). It serves the
// game's own modules (/public/...) and the editor's page (/editor/ui/...) on a private local port,
// at the same paths as in the repository so the editor's relative imports also work under Node,
// and reads and writes the hand-placed layout, public/data/world-layout.js.
import { app, BrowserWindow, Menu, dialog, ipcMain, shell } from 'electron';
import http from 'node:http';
import { readFile, writeFile, rename } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { playTargetUrl } from '../public/editor-play.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PUBLIC = join(ROOT, 'public');
// The editor's home page and shared styles, and its workspaces (see editor/README.md).
const UI = join(ROOT, 'editor', 'ui');
const WORKSPACES = join(ROOT, 'editor', 'workspaces');
// The files workspaces save (each a JS module exporting one object), with what each must contain.
const STORES = {
  'world-layout': {
    file: join(PUBLIC, 'data', 'world-layout.js'),
    about: 'Hand-placed changes to the generated world, written by the world editor',
    valid: (v) => v?.version === 1 && typeof v.locations === 'object',
  },
  quests: {
    file: join(PUBLIC, 'data', 'quests.js'),
    about: 'Quests written in the Quest Editor',
    valid: (v) => v?.version === 1 && Array.isArray(v.quests),
  },
  characters: {
    file: join(PUBLIC, 'data', 'characters.js'),
    about: "Hand-set looks and movement for the game's people, written by the Character Editor",
    valid: (v) =>
      v?.version === 1 && typeof v.people === 'object' && typeof v.defaults === 'object',
  },
  conversations: {
    file: join(PUBLIC, 'data', 'conversations.js'),
    about: "What the game's people say, written by the Conversation Editor",
    valid: (v) =>
      v?.version === 1 && typeof v.people === 'object' && typeof v.defaults === 'object',
  },
  'street-layout': {
    file: join(PUBLIC, 'data', 'street-layout.js'),
    about: "The town's street layout, written by the Street Editor",
    valid: (v) =>
      v?.version === 1 &&
      typeof v.locations === 'object' &&
      (v.town === null || Array.isArray(v.town?.roads)),
  },
};
// three.js add-ons the editor uses (from the game's pinned three in node_modules), pointed at the
// game's vendored three so both share one copy.
const ADDONS = {
  'TransformControls.js': 'controls/TransformControls.js',
  'OrbitControls.js': 'controls/OrbitControls.js',
};
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.glb': 'model/gltf-binary',
  '.webmanifest': 'application/manifest+json',
  '.txt': 'text/plain; charset=utf-8',
};

const EDITOR_CSP =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' blob: data:";
// Resolves a request path inside a folder, or null if it would leave it.
// A path ending in / is that folder's index.html.
function inside(folder, path) {
  if (path === '' || path.endsWith('/')) path += 'index.html';
  const file = normalize(join(folder, decodeURIComponent(path)));
  return file === folder || file.startsWith(folder + sep) ? file : null;
}
async function serve(req, res) {
  const { pathname } = new URL(req.url, 'http://localhost');
  let body, file;
  try {
    const addon = ADDONS[pathname.slice('/editor/three/'.length)];
    if (pathname.startsWith('/editor/three/') && addon) {
      file = pathname;
      body = (await readFile(join(ROOT, 'node_modules/three/examples/jsm', addon), 'utf8')).replace(
        /from 'three';/g,
        "from '/public/vendor/three.module.min.js';",
      );
    } else {
      file = pathname.startsWith('/editor/ui/')
        ? inside(UI, pathname.slice('/editor/ui/'.length))
        : pathname.startsWith('/editor/workspaces/')
          ? inside(WORKSPACES, pathname.slice('/editor/workspaces/'.length))
          : pathname.startsWith('/public/')
            ? inside(PUBLIC, pathname.slice('/public/'.length))
            : null;
      if (!file) throw Object.assign(Error('Outside the served folders'), { code: 'ENOENT' });
      body = await readFile(file);
    }
  } catch (error) {
    res.writeHead(error.code === 'ENOENT' || error.code === 'EISDIR' ? 404 : 500);
    res.end(String(error.message));
    return;
  }
  // Never cached: the editor and play-test always see the files as they are on disk. The editor's
  // own pages run only their own scripts (the game's pages keep the game's rules).
  res.writeHead(200, {
    'Content-Type': TYPES[extname(file)] || 'application/octet-stream',
    'Cache-Control': 'no-store',
    ...(pathname.startsWith('/editor/') ? { 'Content-Security-Policy': EDITOR_CSP } : {}),
  });
  res.end(body);
}

async function readStore(name) {
  const store = STORES[name];
  if (!store) throw Error('No store ' + name);
  // A fresh import each time (the query string defeats the module cache).
  const module = await import(pathToFileURL(store.file).href + '?t=' + Date.now());
  return module.default;
}
// JSON laid out for reading and diffs: one line per part, collider, placement, junction or road,
// numbers to a tenth of a millimetre.
function format(value, indent = '') {
  const flat = (v) =>
    v === null ||
    typeof v !== 'object' ||
    Object.values(v).every(
      (x) =>
        x === null ||
        typeof x !== 'object' ||
        (Array.isArray(x) && x.every((y) => typeof y !== 'object')),
    );
  const tidy = (v) =>
    JSON.stringify(v, (_, x) => (typeof x === 'number' ? Math.round(x * 1e4) / 1e4 : x));
  if (flat(value))
    return tidy(value)
      .replace(/,"/g, ', "')
      .replace(/":/g, '": ')
      .replace(/,(?=[-\d])/g, ', ');
  const inner = indent + '  ',
    lines = Array.isArray(value)
      ? value.map((v) => inner + format(v, inner))
      : Object.entries(value).map(([k, v]) => inner + JSON.stringify(k) + ': ' + format(v, inner));
  return (
    (Array.isArray(value) ? '[' : '{') +
    '\n' +
    lines.join(',\n') +
    '\n' +
    indent +
    (Array.isArray(value) ? ']' : '}')
  );
}
async function writeStore(name, value) {
  const store = STORES[name];
  if (!store) throw Error('No store ' + name);
  if (!store.valid(value)) throw Error('Not a valid ' + name);
  const text =
    `// ${store.about}\n// (scripts/world-editor.sh). See editor/README.md for the format.\n` +
    'export default ' +
    format(value) +
    ';\n';
  // Written beside it and renamed over it, so a failed write never leaves half a file.
  await writeFile(store.file + '.tmp', text);
  await rename(store.file + '.tmp', store.file);
}

let base,
  editor,
  unsaved = false;
function createEditor() {
  editor = new BrowserWindow({
    width: 1600,
    height: 980,
    minWidth: 1100,
    minHeight: 700,
    title: 'IoT Quest World Editor',
    backgroundColor: '#14181d',
    show: false,
    webPreferences: {
      preload: fileURLToPath(new URL('preload.cjs', import.meta.url)),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  editor.once('ready-to-show', () => editor.show());
  editor.loadURL(base + '/editor/ui/');
  // Links never open inside the editor.
  editor.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
  editor.on('close', (event) => {
    if (!unsaved) return;
    const choice = dialog.showMessageBoxSync(editor, {
      type: 'warning',
      buttons: ['Cancel', 'Quit without saving'],
      defaultId: 0,
      cancelId: 0,
      message: 'You have unsaved changes.',
      detail: 'Quitting now loses the changes made since you last saved.',
    });
    if (choice === 0) event.preventDefault();
  });
}
// Opens the game at a play-test target (see public/editor-play.js): what the workspace is editing,
// or the beginning with none. Either way it saves nothing.
function openGame(target = null) {
  const game = new BrowserWindow({
    width: 1440,
    height: 900,
    title: 'IoT Quest (play-test)',
    // A fresh, in-memory session each time: no offline copy or saved progress from earlier runs.
    webPreferences: { partition: 'playtest-' + Date.now(), contextIsolation: true },
  });
  game.loadURL(playTargetUrl(base + '/public/game.html', target));
}
const send = (channel) => () => editor?.webContents.send(channel);
function buildMenu() {
  const mac = process.platform === 'darwin';
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      ...(mac ? [{ role: 'appMenu' }] : []),
      {
        label: 'File',
        submenu: [
          { label: 'Save', accelerator: 'CmdOrCtrl+S', click: send('menu:save') },
          {
            label: 'Play-test from here',
            accelerator: 'CmdOrCtrl+P',
            click: send('menu:playtest'),
          },
          {
            label: 'Play-test from the beginning',
            accelerator: 'Shift+CmdOrCtrl+P',
            click: send('menu:playstart'),
          },
          { type: 'separator' },
          mac ? { role: 'close' } : { role: 'quit' },
        ],
      },
      {
        label: 'Edit',
        submenu: [
          // Undo and redo go to the page: it undoes typing in a field, or else the last edit.
          { label: 'Undo', accelerator: 'CmdOrCtrl+Z', click: send('menu:undo') },
          { label: 'Redo', accelerator: 'Shift+CmdOrCtrl+Z', click: send('menu:redo') },
          { type: 'separator' },
          { role: 'cut' },
          { role: 'copy' },
          { role: 'paste' },
          { role: 'selectAll' },
        ],
      },
      {
        label: 'View',
        submenu: [
          { role: 'reload' },
          { role: 'toggleDevTools' },
          { type: 'separator' },
          { role: 'resetZoom' },
          { role: 'zoomIn' },
          { role: 'zoomOut' },
          { type: 'separator' },
          { role: 'togglefullscreen' },
        ],
      },
    ]),
  );
}

ipcMain.handle('store:read', (_, name) => readStore(name));
ipcMain.handle('store:write', (_, name, value) => writeStore(name, value));
ipcMain.handle('game:open', (_, target) => openGame(target));
ipcMain.on('editor:unsaved', (_, value) => {
  unsaved = !!value;
  editor?.setDocumentEdited(unsaved);
});

app.whenReady().then(async () => {
  const server = http.createServer(serve);
  // Port 0: any free port, on this machine only.
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = 'http://127.0.0.1:' + server.address().port;
  buildMenu();
  createEditor();
  app.on('activate', () => BrowserWindow.getAllWindows().length || createEditor());
});
app.on('window-all-closed', () => app.quit());
