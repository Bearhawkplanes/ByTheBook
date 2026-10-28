const { contextBridge, ipcRenderer } = require('electron');
const call = (op, ...a) => ipcRenderer.invoke('fs', op, ...a);
contextBridge.exposeInMainWorld('fsapi', {
  dir: () => call('dir'), list: () => call('list'), read: n => call('read', n), write: (n, t) => call('write', n, t),
  writeNew: (n, t) => call('writeNew', n, t), rename: (a, b) => call('rename', a, b), remove: n => call('remove', n),
  importPath: p => call('importPath', p), choose: () => call('choose'), resetDir: () => call('resetDir'),
  openDir: () => call('openDir'), reveal: n => call('reveal', n), pending: () => call('pending'),
  backup: n => call('backup', n), restore: n => call('restore', n),
  newSalt: () => call('newSalt'), newPid: () => call('newPid'), integrity: () => call('integrity'), profileSave: b => call('profileSave', b), recMake: () => call('recMake'), recCheck: (c, l) => call('recCheck', c, l), hash: (pin, salt) => call('hash', pin, salt), matchPin: (pin, list) => call('matchPin', pin, list),
  // the main process waits for this to report back before closing; false means the save failed
  onFlush: cb => ipcRenderer.on('flush', async () => { let ok = true; try { ok = (await cb()) !== false; } catch (e) { ok = false; } ipcRenderer.send('flushed', ok); }),
  onOpen: cb => ipcRenderer.on('open-file', (e, p) => cb(p))
});
