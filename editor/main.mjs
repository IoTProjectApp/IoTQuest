// The world editor's desktop shell (development only: never built or deployed). It serves the
// game's own modules (/public/...) and the editor's page (/editor/ui/...) on a private local port,
// at the same paths as in the repository so the editor's relative imports also work under Node,
// and reads and writes the hand-placed layout, public/data/world-layout.js.
import { app, BrowserWindow, Menu, dialog, ipcMain, shell } from 'electron';
import http from 'node:http';
import { readFile, writeFile, rename, stat, mkdir, unlink } from 'node:fs/promises';
import { basename, extname, join, normalize, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { playTargetUrl } from '../public/editor-play.js';
import { storeText } from './store-format.mjs';

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
  cities: {
    file: join(PUBLIC, 'data', 'cities.js'),
    about: "Each city's wording, written by the City Editor",
    valid: (v) => v?.version === 1 && typeof v.cities === 'object' && !Array.isArray(v.cities),
  },
  conversations: {
    file: join(PUBLIC, 'data', 'conversations.js'),
    about: "What the game's people say, written by the Conversation Editor",
    valid: (v) =>
      v?.version === 1 && typeof v.people === 'object' && typeof v.defaults === 'object',
  },
  people: {
    file: join(PUBLIC, 'data', 'people.js'),
    about: 'People added, and routines drawn, in the Character Editor',
    valid: (v) =>
      v?.version === 1 &&
      Array.isArray(v.people) &&
      v.routines !== null &&
      typeof v.routines === 'object',
  },
  clips: {
    file: join(PUBLIC, 'data', 'clips.js'),
    about: 'Animation clips imported in the Character Editor',
    valid: (v) =>
      v?.version === 1 &&
      v.clips !== null &&
      typeof v.clips === 'object' &&
      !Array.isArray(v.clips),
  },
  models: {
    file: join(PUBLIC, 'data', 'models.js'),
    about: 'Character models imported in the Character Editor',
    valid: (v) =>
      v?.version === 1 &&
      v.models !== null &&
      typeof v.models === 'object' &&
      !Array.isArray(v.models),
  },
  'street-layout': {
    file: join(PUBLIC, 'data', 'street-layout.js'),
    about: "The town's street layout, written by the Street Editor",
    valid: (v) =>
      v?.version === 1 &&
      typeof v.locations === 'object' &&
      (v.town === null || Array.isArray(v.town?.roads)),
  },
  worlds: {
    file: join(PUBLIC, 'data', 'worlds.js'),
    about: 'Custom 3D worlds created in the World Builder',
    valid: (v) =>
      v?.version === 1 &&
      Array.isArray(v.worlds) &&
      Array.isArray(v.prefabs) &&
      Array.isArray(v.favorites),
  },
  components: {
    file: join(PUBLIC, 'data', 'components.js'),
    about: 'Custom IoT components and circuit definitions, written by the Component & Circuit Lab',
    valid: (v) =>
      v?.version === 1 &&
      v.edits !== null &&
      typeof v.edits === 'object' &&
      !Array.isArray(v.edits) &&
      Array.isArray(v.custom),
  },
  curriculum: {
    file: join(PUBLIC, 'data', 'curriculum.js'),
    about:
      'Programming techniques, comprehension questions and Code Coach hints, written by the Curriculum & Code Coach Editor',
    valid: (v) =>
      v?.version === 1 &&
      v.techniques !== null &&
      typeof v.techniques === 'object' &&
      v.questions !== null &&
      typeof v.questions === 'object' &&
      Array.isArray(v.coachTips),
  },
  climate: {
    file: join(PUBLIC, 'data', 'climate.js'),
    about:
      'City climate profiles, weather presets and soundscape settings, written by the Climate & Soundscape Studio',
    valid: (v) =>
      v?.version === 1 &&
      v.cities !== null &&
      typeof v.cities === 'object' &&
      Array.isArray(v.presets) &&
      v.soundscape !== null &&
      typeof v.soundscape === 'object',
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
    if (pathname.startsWith('/editor/three/')) {
      // An add-on by its short name, or any file by its path in three's examples (the loaders
      // import their neighbours by relative paths).
      const path = pathname.slice('/editor/three/'.length);
      file = inside(join(ROOT, 'node_modules/three/examples/jsm'), ADDONS[path] || path);
      if (!file || extname(file) !== '.js')
        throw Object.assign(Error('Not a three.js add-on'), { code: 'ENOENT' });
      body = (await readFile(file, 'utf8')).replace(
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
async function writeStore(name, value) {
  const store = STORES[name];
  if (!store) throw Error('No store ' + name);
  if (!store.valid(value)) throw Error('Not a valid ' + name);
  const text = storeText(store.about, value);
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

// Animation clips (Character Editor): a file picked to import, and the converted clip saved beside
// the character models as public/models/people/clip-<Name>.glb.
const CLIP_FOLDER = join(PUBLIC, 'models', 'people');
const CLIP_NAME = /^[A-Z][A-Za-z0-9]{0,39}$/;
const MB = 1024 * 1024;
ipcMain.handle('clip:open', async () => {
  const picked = await dialog.showOpenDialog(editor, {
    title: 'Import an animation clip',
    properties: ['openFile'],
    filters: [{ name: 'Animation (glTF or FBX)', extensions: ['glb', 'gltf', 'fbx'] }],
  });
  if (picked.canceled || !picked.filePaths.length) return null;
  const path = picked.filePaths[0],
    ext = extname(path).slice(1).toLowerCase();
  if (!['glb', 'gltf', 'fbx'].includes(ext)) throw Error('Pick a .glb, .gltf or .fbx file');
  if ((await stat(path)).size > 64 * MB) throw Error('That file is over 64 MB');
  return { name: basename(path), ext, bytes: new Uint8Array(await readFile(path)) };
});
const clipFile = (name) => {
  if (typeof name !== 'string' || !CLIP_NAME.test(name)) throw Error('Not a clip name: ' + name);
  return join(CLIP_FOLDER, 'clip-' + name + '.glb');
};
ipcMain.handle('clip:save', async (_, name, bytes) => {
  const file = clipFile(name),
    data = Buffer.from(bytes);
  if (data.length > 32 * MB) throw Error('The converted clip is over 32 MB');
  if (data.subarray(0, 4).toString('latin1') !== 'glTF') throw Error('Not a binary glTF clip');
  await mkdir(CLIP_FOLDER, { recursive: true });
  await writeFile(file + '.tmp', data);
  await rename(file + '.tmp', file);
  return basename(file);
});
ipcMain.handle('clip:remove', async (_, name) => {
  await unlink(clipFile(name)).catch((error) => {
    if (error.code !== 'ENOENT') throw error;
  });
});
// Character models (Character Editor): a rigged body picked to import, and the converted model
// saved beside the others as public/models/people/model-<Name>.glb.
ipcMain.handle('model:open', async () => {
  const picked = await dialog.showOpenDialog(editor, {
    title: 'Import a character model',
    properties: ['openFile'],
    filters: [{ name: 'Rigged character (glTF or FBX)', extensions: ['glb', 'gltf', 'fbx'] }],
  });
  if (picked.canceled || !picked.filePaths.length) return null;
  const path = picked.filePaths[0],
    ext = extname(path).slice(1).toLowerCase();
  if (!['glb', 'gltf', 'fbx'].includes(ext)) throw Error('Pick a .glb, .gltf or .fbx file');
  if ((await stat(path)).size > 128 * MB) throw Error('That file is over 128 MB');
  return { name: basename(path), ext, bytes: new Uint8Array(await readFile(path)) };
});
const modelFile = (name) => {
  if (typeof name !== 'string' || !CLIP_NAME.test(name)) throw Error('Not a model name: ' + name);
  return join(CLIP_FOLDER, 'model-' + name + '.glb');
};
ipcMain.handle('model:save', async (_, name, bytes) => {
  const file = modelFile(name),
    data = Buffer.from(bytes);
  if (data.length > 64 * MB) throw Error('The converted model is over 64 MB');
  if (data.subarray(0, 4).toString('latin1') !== 'glTF') throw Error('Not a binary glTF model');
  await mkdir(CLIP_FOLDER, { recursive: true });
  await writeFile(file + '.tmp', data);
  await rename(file + '.tmp', file);
  return basename(file);
});
ipcMain.handle('model:remove', async (_, name) => {
  await unlink(modelFile(name)).catch((error) => {
    if (error.code !== 'ENOENT') throw error;
  });
});
// World Builder models: one imported into a world, saved by its id (which the World Builder makes
// a safe name) as public/models/worlds/<id>.glb. Worlds keep only where it is.
const WORLD_MODEL_FOLDER = join(PUBLIC, 'models', 'worlds');
const WORLD_MODEL_ID = /^custom-model-[a-z0-9-]{1,60}$/;
ipcMain.handle('world-model:save', async (_, id, bytes) => {
  if (typeof id !== 'string' || !WORLD_MODEL_ID.test(id)) throw Error('Not a model id: ' + id);
  const file = join(WORLD_MODEL_FOLDER, id + '.glb'),
    data = Buffer.from(bytes);
  if (data.length > 64 * MB) throw Error('The model is over 64 MB');
  if (data.subarray(0, 4).toString('latin1') !== 'glTF') throw Error('Not a binary glTF model');
  await mkdir(WORLD_MODEL_FOLDER, { recursive: true });
  await writeFile(file + '.tmp', data);
  await rename(file + '.tmp', file);
  return basename(file);
});
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
