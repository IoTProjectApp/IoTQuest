// The only bridge between the editor page and the desktop shell (main.mjs).
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('editorShell', {
  readLayout: () => ipcRenderer.invoke('layout:read'),
  writeLayout: (layout) => ipcRenderer.invoke('layout:write', layout),
  openGame: () => ipcRenderer.invoke('game:open'),
  setUnsaved: (value) => ipcRenderer.send('editor:unsaved', value),
  // Menu commands (save, undo, redo, play-test) arrive as named events.
  onMenu: (handler) => {
    for (const name of ['save', 'undo', 'redo', 'playtest'])
      ipcRenderer.on('menu:' + name, () => handler(name));
  },
});
