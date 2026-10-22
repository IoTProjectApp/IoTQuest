// The only bridge between the editor page and the desktop shell (main.mjs).
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('editorShell', {
  // Saved files by name: 'world-layout' (Map Editor), 'street-layout' (Street Editor),
  // 'characters' (Character Editor), 'quests' (Quest Editor).
  read: (store) => ipcRenderer.invoke('store:read', store),
  write: (store, value) => ipcRenderer.invoke('store:write', store, value),
  // The game in a play-test window, at a target (see public/editor-play.js) or the beginning.
  openGame: (target = null) => ipcRenderer.invoke('game:open', target),
  setUnsaved: (value) => ipcRenderer.send('editor:unsaved', value),
  // Menu commands (save, undo, redo, playtest from here, playstart from the beginning) arrive as
  // named events.
  onMenu: (handler) => {
    for (const name of ['save', 'undo', 'redo', 'playtest', 'playstart'])
      ipcRenderer.on('menu:' + name, () => handler(name));
  },
});
