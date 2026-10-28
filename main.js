const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path'), fs = require('fs'), crypto = require('crypto');

// Everything lives next to the app by default: <app folder>/Saves and <app folder>/Data
const baseDir = app.isPackaged
  ? (process.env.PORTABLE_EXECUTABLE_DIR || (process.env.APPIMAGE && path.dirname(process.env.APPIMAGE)) || path.dirname(app.getPath('exe')))
  : __dirname;
let dataDir = path.join(baseDir, 'Data');
try { fs.mkdirSync(dataDir, { recursive: true }); fs.accessSync(dataDir, fs.constants.W_OK); }
catch (e) { dataDir = path.join(app.getPath('documents'), 'Build Checklist', 'Data'); fs.mkdirSync(dataDir, { recursive: true }); } // read-only location fallback
app.setPath('userData', path.join(dataDir, 'profile'));
const cfgPath = path.join(dataDir, 'config.json');
let cfg = {}; try { cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8')); } catch (e) {}
const saveCfg = () => { try { fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 1)); } catch (e) {} };
const defSaves = path.join(path.dirname(dataDir), 'Saves');
const savesDir = () => { let d = cfg.savesDir || defSaves; try { fs.mkdirSync(d, { recursive: true }); fs.accessSync(d, fs.constants.W_OK); } catch (e) { d = defSaves; fs.mkdirSync(d, { recursive: true }); } return d; };
const st = require('./storage')(savesDir, f => shell.trashItem(f));

// PINs are only ever stored as salted PBKDF2 hashes; hashing happens here, not in the page. Main PIN 5-8 digits, others 4 (the page enforces which).
const pbk = (pin, salt) => new Promise((res, rej) => crypto.pbkdf2(String(pin), Buffer.from(salt, 'hex'), 150000, 32, 'sha256', (e, k) => e ? rej(e) : res(k)));
const okPin = p => /^\d{4,8}$/.test(String(p)), okHex = s => typeof s === 'string' && s.length >= 16 && s.length % 2 === 0 && /^[0-9a-f]+$/i.test(s);

// ---- tamper detection -------------------------------------------------------------------------------
// The profile (Data/profile.json) and a marker in the save folder are signed with a key built into this program,
// so hand-edited or copied files fail the check. This deters casual tampering; it is not strong security.
const BUILD_KEY = 'd41154edaa4e53df9663fe5b5d2fed7aa9e46fc603d55ce49c92381b75c1f152';
const canon = v => Array.isArray(v) ? '[' + v.map(canon).join(',') + ']' : v && typeof v === 'object' ? '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}' : JSON.stringify(v === undefined ? null : v);
const sign = b => crypto.createHmac('sha256', BUILD_KEY).update(canon(b)).digest('hex');
const profFile = () => path.join(dataDir, 'profile.json'), markFile = () => path.join(savesDir(), '.profile-marker.json');
const readSigned = f => {
  let t; try { t = fs.readFileSync(f, 'utf8'); } catch (e) { return { s: 'none' }; }
  try { const o = JSON.parse(t), g = o.sig; delete o.sig; if (typeof g === 'string' && g.length === 64 && crypto.timingSafeEqual(Buffer.from(g, 'hex'), Buffer.from(sign(o), 'hex'))) return { s: 'ok', body: o }; } catch (e) {}
  return { s: 'bad' };
};
const writeSigned = (f, body) => { const tmp = f + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(Object.assign({}, body, { sig: sign(body) }))); fs.renameSync(tmp, f); };
const hasBcl = () => { try { return fs.readdirSync(savesDir()).some(f => /\.bcl$/i.test(f)); } catch (e) { return false; } };
const okRv = r => r && okHex(r.salt) && /^[0-9a-f]{64}$/i.test(r.hash || '');
const ALPHA = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';   // no I, L, O, 0, 1
const normCode = c => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
function cleanProfile(b) {   // only known fields are ever written
  if (!b || !/^[0-9a-f]{32}$/.test(b.pid) || !okRv(b.rv)) throw new Error('Bad profile');
  const req = b.req || {};
  return { pid: b.pid, user: String(b.user || ''), salt: String(b.salt || ''), hash: String(b.hash || ''), rv: { salt: b.rv.salt, hash: b.rv.hash },
    req: { names: !!req.names, sign: !!req.sign, edit: !!req.edit, log: !!req.log },
    people: (Array.isArray(b.people) ? b.people : []).map(p => ({ id: String(p.id || ''), name: String(p.name || ''), salt: String(p.salt || ''), hash: String(p.hash || ''), boss: !!p.boss })) };
}
// ---- wrong-PIN limits ---------------------------------------------------------------------------------
// Counted here and kept in the signed profile, so restarting the app does not reset them. Any correct PIN resets them.
// 5 in a row: the page suggests "Forgot PIN"; every 15th: 20-minute wait; 100: error E-4419 until the recovery code is entered.
const PIN_WAIT = 20 * 60000, PIN_WAIT_EVERY = 15, PIN_MAX = 100;
const pinLimits = () => { const P = readSigned(profFile()); return P.s === 'ok' ? { fails: P.body.fails || 0, until: P.body.until || 0 } : { fails: 0, until: 0 }; };
const setLimits = (fails, until) => { const P = readSigned(profFile()); if (P.s !== 'ok') return; const b = P.body; delete b.fails; delete b.until; if (fails) b.fails = fails; if (until) b.until = until; writeSigned(profFile(), b); };
function writeMarker() { const P = readSigned(profFile()); if (P.s === 'ok') { try { writeSigned(markFile(), { pid: P.body.pid, rv: P.body.rv }); } catch (e) {} } }

let win = null, pending = null, closing = false;
const argFile = argv => argv.slice(1).find(a => /\.bcl$/i.test(a) && fs.existsSync(a));
pending = argFile(process.argv);
const web = u => { try { return /^https?:$/.test(new URL(u).protocol); } catch (e) { return false; } };

const handlers = {
  dir: () => savesDir(), list: () => st.list(), read: n => st.read(n), write: (n, t) => st.write(n, t),
  writeNew: (n, t) => st.writeNew(n, t), rename: (a, b) => st.rename(a, b), remove: n => st.remove(n),
  importPath: p => st.importPath(p), backup: n => st.backup(n), restore: n => st.restore(n),
  choose: async () => { const r = await dialog.showOpenDialog(win, { title: 'Choose the save folder', properties: ['openDirectory', 'createDirectory'], defaultPath: savesDir() }); if (r.canceled || !r.filePaths[0]) return null; cfg.savesDir = r.filePaths[0]; saveCfg(); writeMarker(); return savesDir(); },
  resetDir: () => { delete cfg.savesDir; saveCfg(); writeMarker(); return savesDir(); },
  openDir: () => shell.openPath(savesDir()),
  reveal: n => { const f = n && path.join(savesDir(), path.basename(n)); if (f && fs.existsSync(f)) shell.showItemInFolder(f); else shell.openPath(savesDir()); },
  pending: () => { const p = pending; pending = null; return p; },
  newSalt: () => crypto.randomBytes(16).toString('hex'),
  newPid: () => crypto.randomBytes(16).toString('hex'),
  integrity: () => {
    const P = readSigned(profFile()), M = readSigned(markFile());
    let code = null;
    if (P.s === 'ok') {
      if (M.s === 'ok') { if (M.body.pid !== P.body.pid) code = 'E-4418'; }
      else if (M.s === 'bad') code = 'E-4418';
      else if (hasBcl()) code = 'E-4418';          // marker gone although checklists exist
      else writeMarker();                           // brand-new or empty save folder: just record it
    } else if (P.s === 'bad') code = 'E-4417';
    else if (M.s !== 'none') code = 'E-4417';       // marker without a profile
    if (!code && P.s === 'ok' && (P.body.fails || 0) >= PIN_MAX) code = 'E-4419';
    return { code, p: P.s, m: M.s, body: P.s === 'ok' ? P.body : null, marker: M.s === 'ok' ? M.body : null };
  },
  profileSave: b => { const c = cleanProfile(b), L = pinLimits(); if (L.fails) c.fails = L.fails; if (L.until) c.until = L.until;   // the page cannot reset the PIN counter
    writeSigned(profFile(), c); writeSigned(markFile(), { pid: c.pid, rv: c.rv }); return true; },
  recMake: async () => {
    let c = ''; for (let i = 0; i < 20; i++) c += ALPHA[crypto.randomInt(ALPHA.length)];
    const salt = crypto.randomBytes(16).toString('hex');
    return { code: c.match(/.{4}/g).join('-'), rv: { salt, hash: (await pbk(c, salt)).toString('hex') } };
  },
  // list: [{pid, rv}] -> index of the entry the recovery code belongs to, or -1
  recCheck: async (code, list) => {
    const c = normCode(code); if (c.length !== 20 || !Array.isArray(list)) return -1;
    const rs = await Promise.all(list.map(async x => { if (!x || !okRv(x.rv)) return false; return crypto.timingSafeEqual(await pbk(c, x.rv.salt), Buffer.from(x.rv.hash, 'hex')); }));
    const i = rs.indexOf(true);
    if (i >= 0) { const P = readSigned(profFile()); if (P.s === 'ok' && P.body.pid === list[i].pid) setLimits(0, 0); }   // the right recovery code clears the wrong-PIN limits
    return i;
  },
  hash: async (pin, salt) => { if (!okPin(pin) || !okHex(salt)) throw new Error('Bad PIN input'); return (await pbk(pin, salt)).toString('hex'); },
  // list: [{id, salt, hash}] -> id of the entry the PIN belongs to, or null. Every entry is always checked.
  matchPin: async (pin, list) => {
    if (!okPin(pin) || !Array.isArray(list)) return null;
    const rs = await Promise.all(list.map(async c => { if (!c || !okHex(c.salt) || !/^[0-9a-f]{64}$/i.test(c.hash || '')) return false; return crypto.timingSafeEqual(await pbk(pin, c.salt), Buffer.from(c.hash, 'hex')); }));
    const i = rs.indexOf(true); return i < 0 ? null : list[i].id;
  },
  // a PIN typed by a person (unlike matchPin, which only checks whether a new PIN is already taken): counted against the limits
  // -> {id} on success, {fails, wait: time the wait ends} on a miss, {locked: 'E-4419'} once the limit is reached
  pinTry: async (pin, list) => {
    const L = pinLimits();
    if (L.fails >= PIN_MAX) return { locked: 'E-4419', fails: L.fails };
    if (L.until > Date.now()) return { fails: L.fails, wait: L.until };
    const id = await handlers.matchPin(pin, list);
    if (id) { if (L.fails || L.until) setLimits(0, 0); return { id, fails: 0 }; }
    const f = L.fails + 1, until = f < PIN_MAX && f % PIN_WAIT_EVERY === 0 ? Date.now() + PIN_WAIT : 0;
    setLimits(f, until);
    return f >= PIN_MAX ? { locked: 'E-4419', fails: f } : { fails: f, wait: until };
  },
  pinState: () => pinLimits()
};
ipcMain.handle('fs', (e, op, ...a) => {
  if (!win || e.sender !== win.webContents || !Object.prototype.hasOwnProperty.call(handlers, op)) throw new Error('Not allowed');
  return handlers[op](...a);
});

function createWindow() {
  win = new BrowserWindow({ width: 1500, height: 900, autoHideMenuBar: true, title: 'Build Checklist',
    webPreferences: { contextIsolation: true, nodeIntegration: false, devTools: !app.isPackaged, preload: path.join(__dirname, 'preload.js') } });
  win.loadFile(path.join(__dirname, 'index.html'));
  win.webContents.setWindowOpenHandler(({ url }) => { if (web(url)) shell.openExternal(url); return { action: 'deny' }; });   // http(s) only
  win.webContents.on('will-navigate', (e, url) => { if (!/^(file|blob):/i.test(url)) { e.preventDefault(); if (web(url)) shell.openExternal(url); } });
  // make sure the open checklist is written to disk before the window closes; if that fails, say so
  win.on('close', e => {
    if (closing) return; e.preventDefault(); closing = true;
    if (win.webContents.isLoading()) { win.destroy(); return; }
    let timer;
    const finish = ok => {
      clearTimeout(timer); ipcMain.removeListener('flushed', onFlushed);
      if (!ok && win) {
        const r = dialog.showMessageBoxSync(win, { type: 'warning', buttons: ['Keep the app open', 'Close anyway'], defaultId: 0, cancelId: 0, title: 'Build Checklist',
          message: 'Your latest changes could not be saved.', detail: 'Keep the app open and try Menu > Save (Ctrl+S), or close anyway and lose the last edits.' });
        if (r === 0) { closing = false; return; }
      }
      if (win) win.destroy();
    };
    const onFlushed = (ev, ok) => finish(ok !== false);
    ipcMain.once('flushed', onFlushed);
    win.webContents.send('flush');
    timer = setTimeout(() => finish(false), 60000);
  });
  win.on('closed', () => { win = null; });
}
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', (e, argv) => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); const f = argFile(argv); if (f) win.webContents.send('open-file', f); } });
  app.whenReady().then(createWindow);
  app.on('window-all-closed', () => app.quit());
}
