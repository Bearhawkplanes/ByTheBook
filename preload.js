const { contextBridge, ipcRenderer, webUtils } = require('electron');
const call = (op, ...a) => ipcRenderer.invoke('fs', op, ...a);
contextBridge.exposeInMainWorld('fsapi', {
  dir: () => call('dir'), list: () => call('list'), read: n => call('read', n), write: (n, t) => call('write', n, t),
  writeNew: (n, t) => call('writeNew', n, t), rename: (a, b) => call('rename', a, b), remove: n => call('remove', n),
  importPath: p => call('importPath', p), choose: () => call('choose'), resetDir: () => call('resetDir'),
  openDir: () => call('openDir'), reveal: n => call('reveal', n), pending: () => call('pending'),
  backup: n => call('backup', n), restore: n => call('restore', n),
  newSalt: () => call('newSalt'), newPid: () => call('newPid'), integrity: () => call('integrity'), profileSave: b => call('profileSave', b), recMake: () => call('recMake'), recCheck: (c, l) => call('recCheck', c, l), hash: (pin, salt) => call('hash', pin, salt), matchPin: (pin, list) => call('matchPin', pin, list), pinTry: (pin, list) => call('pinTry', pin, list), pinState: () => call('pinState'),
  videoPick: () => call('videoPick'), videoInfo: v => call('videoInfo', v), videoRead: v => call('videoRead', v), videoTemp: (k, b) => call('videoTemp', k, b), videoThumb: (v, t) => call('videoThumb', v, t), videoStat: p => call('videoStat', p),
  pathOf: f => { try { return webUtils.getPathForFile(f) || ''; } catch (e) { return ''; } },   // where a file chosen in the page lives, so it can be linked
  clipMake: (v, a, b) => call('clipMake', v, a, b), clipRead: (id, q, au) => call('clipRead', id, q, au), clipDone: id => call('clipDone', id), clipCancel: () => call('clipCancel'),
  onClipProgress: cb => ipcRenderer.on('clip-progress', (e, f) => cb(f)),
  pdfMake: (d, o) => call('pdfMake', d, o), saveFile: (o, d) => call('saveFile', o, d),
  appVersion: () => call('appVersion'), updGet: () => call('updGet'), updSet: p => call('updSet', p), updCheck: f => call('updCheck', f), updDownload: () => call('updDownload'), updInstall: () => call('updInstall'),
  onUpdProgress: cb => ipcRenderer.on('upd-progress', (e, f) => cb(f)),
  // the main process waits for this to report back before closing; false means the save failed
  onFlush: cb => ipcRenderer.on('flush', async () => { let ok = true; try { ok = (await cb()) !== false; } catch (e) { ok = false; } ipcRenderer.send('flushed', ok); }),
  onOpen: cb => ipcRenderer.on('open-file', (e, p) => cb(p))
});
