// The only bridge between the editor page and the desktop shell (main.mjs).
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('editorShell', {
  // Saved files by name: 'world-layout' (Map Editor), 'street-layout' (Street Editor),
  // 'characters', 'clips' and 'models' (Character Editor), 'quests' (Quest Editor), 'conversations'
  // (Conversation Editor).
  read: (store) => ipcRenderer.invoke('store:read', store),
  write: (store, value) => ipcRenderer.invoke('store:write', store, value),
  // The game in a play-test window, at a target (see public/editor-play.js) or the beginning.
  openGame: (target = null) => ipcRenderer.invoke('game:open', target),
  // Animation clips: pick a file to import ({ name, ext, bytes } or null), save a converted clip
  // (binary glTF) as public/models/people/clip-<name>.glb, or remove one.
  openClip: () => ipcRenderer.invoke('clip:open'),
  saveClip: (name, bytes) => ipcRenderer.invoke('clip:save', name, bytes),
  removeClip: (name) => ipcRenderer.invoke('clip:remove', name),
  // Character models, the same way: pick a rigged body, save the converted one as
  // public/models/people/model-<name>.glb, or remove one.
  openModel: () => ipcRenderer.invoke('model:open'),
  saveModel: (name, bytes) => ipcRenderer.invoke('model:save', name, bytes),
  removeModel: (name) => ipcRenderer.invoke('model:remove', name),
  setUnsaved: (value) => ipcRenderer.send('editor:unsaved', value),
  // Menu commands (save, undo, redo, playtest from here, playstart from the beginning) arrive as
  // named events.
  onMenu: (handler) => {
    for (const name of ['save', 'undo', 'redo', 'playtest', 'playstart'])
      ipcRenderer.on('menu:' + name, () => handler(name));
  },
});
