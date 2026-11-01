const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path'), fs = require('fs'), fsp = fs.promises, crypto = require('crypto');

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

// ---- video --------------------------------------------------------------------------------------------
// A video is either linked (stays where it is; the path is kept relative to the save folder when it is inside it, so a
// USB stick works under any drive letter) or copied into the checklist. "Install selection" cuts a clip with ffmpeg
// (ffmpeg-static, unpacked from the asar) in three qualities, so the exact sizes can be shown before choosing.
const os = require('os'), { spawn } = require('child_process'), { pathToFileURL } = require('url');
const FFMPEG = (() => { try { return require('ffmpeg-static').replace('app.asar', 'app.asar.unpacked'); } catch (e) { return null; } })();
const MAX_COPY = 300 * 1024 * 1024;   // a whole video copied into a checklist; a .bcl is read whole when opened
const QUALITY = { native: { crf: 20, h: 0 }, medium: { crf: 26, h: 720 }, low: { crf: 30, h: 480 } };
const TMP = path.join(os.tmpdir(), 'build-checklist-video');
try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {}   // leftovers from a crash
const relToSaves = p => { const r = path.relative(savesDir(), p); return r && !r.startsWith('..') && !path.isAbsolute(r) ? r : ''; };
const vidPath = v => !v ? '' : v.rel ? path.join(savesDir(), v.rel) : String(v.path || '');
// ---- updates ------------------------------------------------------------------------------------------
// Optional (Settings, off by default): asks GitHub's "latest release" address at most about once a day. Installing downloads the new
// program next to the running one, checks its size and SHA-256, and swaps it in after this copy closes; the previous version is kept
// as "<name> (previous)". Checklists and Data/ are never touched. BCL_UPDATE_URL points it at a test server.
const UPDATE_URL = process.env.BCL_UPDATE_URL || 'https://api.github.com/repos/Bearhawkplanes/Build-Checklist/releases/latest';
const verNum = v => String(v || '').replace(/^v/i, '').split(/[-+]/)[0].split('.').map(n => parseInt(n, 10) || 0);
const newer = (a, b) => { const x = verNum(a), y = verNum(b); for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); return false; };
// what this copy can replace itself with: the portable .exe, the Windows installer, or the Linux AppImage (a Mac only gets the download page)
const kind = () => !app.isPackaged ? null : process.env.PORTABLE_EXECUTABLE_FILE ? { k: 'portable', file: process.env.PORTABLE_EXECUTABLE_FILE, asset: /^BuildChecklist\.exe$/i }
  : process.platform === 'win32' ? { k: 'setup', asset: /^BuildChecklist-Setup\.exe$/i } : process.env.APPIMAGE ? { k: 'appimage', file: process.env.APPIMAGE, asset: /\.AppImage$/i } : null;
const writable = d => { try { fs.accessSync(d, fs.constants.W_OK); return true; } catch (e) { return false; } };
const updCfg = () => Object.assign({ auto: false, last: 0, skip: '', snooze: 0, found: null }, cfg.upd || {});
const UA = () => ({ 'User-Agent': 'Build-Checklist/' + app.getVersion(), Accept: 'application/vnd.github+json' });
let dl = null;   // the checked download, ready to install: {version, file}
async function checkUpdate() {
  let r; try { const res = await fetch(UPDATE_URL, { headers: UA(), signal: AbortSignal.timeout(15000) }); if (!res.ok) throw new Error('GitHub answered ' + res.status); r = await res.json(); }
  catch (e) { return { error: (e && e.message) || String(e) }; }
  const c = updCfg(), v = String(r.tag_name || '').replace(/^v/i, ''); c.last = Date.now(); c.found = null;
  if (v && !r.draft && !r.prerelease && newer(v, app.getVersion())) {
    const K = kind(), a = K && (r.assets || []).find(x => K.asset.test(x.name));
    c.found = { version: v, url: /^https:\/\//.test(r.html_url) ? r.html_url : '', notes: String(r.body || '').slice(0, 4000), asset: a ? { name: a.name, size: a.size, url: a.browser_download_url, digest: a.digest || '' } : null };
  }
  cfg.upd = c; saveCfg(); return c.found || { none: true, latest: v };
}
async function downloadUpdate() {
  const f = updCfg().found, K = kind(); if (!f || !f.asset) throw new Error('There is no update to download');
  const dir = K && K.file ? path.dirname(K.file) : K ? os.tmpdir() : TMP; await fsp.mkdir(dir, { recursive: true });   // not TMP for the installer: TMP is cleared when the app closes
  const out = path.join(dir, K && K.k === 'setup' ? f.asset.name : '.update-' + f.asset.name);   // not runnable by its name until it is checked and swapped in
  const res = await fetch(f.asset.url, { headers: { 'User-Agent': UA()['User-Agent'] } }); if (!res.ok || !res.body) throw new Error('Download failed (' + res.status + ')');
  const fh = await fsp.open(out, 'w'), h = crypto.createHash('sha256'); let n = 0;
  try { for await (const ch of res.body) { await fh.write(ch); h.update(ch); n += ch.length; if (win) win.webContents.send('upd-progress', f.asset.size ? Math.min(1, n / f.asset.size) : 0); } } finally { await fh.close(); }
  if (n !== f.asset.size || (f.asset.digest && f.asset.digest.toLowerCase() !== 'sha256:' + h.digest('hex'))) { fs.rmSync(out, { force: true }); throw new Error('The download was incomplete or damaged; nothing was changed'); }
  dl = { version: f.version, file: out }; return { ok: true, size: n };
}
// the swap happens after this copy has closed (a helper waits for it), so the new version starts cleanly with the same Saves/ and Data/
function installUpdate() {
  const K = kind(); if (!dl || !K) throw new Error('Download the update first');
  if (K.k === 'setup') spawn(dl.file, [], { detached: true, stdio: 'ignore' }).unref();
  else {
    const flags = process.argv.slice(1).filter(a => /^--[\w-]+(=.*)?$/.test(a));   // start the new version with the same options (not files)
    const cur = K.file, ext = path.extname(cur), prev = path.join(path.dirname(cur), path.basename(cur, ext) + ' (previous)' + ext);
    if (K.k === 'appimage') {   // Linux lets a running AppImage be replaced
      fs.copyFileSync(cur, prev); fs.chmodSync(dl.file, 0o755); fs.renameSync(dl.file, cur);
      spawn('/bin/sh', ['-c', 'p=$1; a=$2; shift 2; while kill -0 "$p" 2>/dev/null; do sleep 0.3; done; exec "$a" "$@"', 'sh', String(process.pid), cur, ...flags], { detached: true, stdio: 'ignore' }).unref();
    } else {
      const q = v => "'" + String(v).replace(/'/g, "''") + "'", ps = path.join(os.tmpdir(), 'build-checklist-update-' + process.pid + '.ps1');
      fs.writeFileSync(ps, '\ufeff' + [`$cur=${q(cur)};$new=${q(dl.file)};$prev=${q(prev)}`,
        `Wait-Process -Id ${process.pid} -Timeout 300 -ErrorAction SilentlyContinue`,
        '$ok=$false;for($i=0;$i -lt 120 -and -not $ok;$i++){try{if(Test-Path -LiteralPath $prev){Remove-Item -LiteralPath $prev -Force -ErrorAction Stop};Move-Item -LiteralPath $cur -Destination $prev -Force -ErrorAction Stop;$ok=$true}catch{Start-Sleep -Milliseconds 500}}',
        'if($ok){try{Move-Item -LiteralPath $new -Destination $cur -Force -ErrorAction Stop}catch{Move-Item -LiteralPath $prev -Destination $cur -Force}}',
        flags.length ? `Start-Process -FilePath $cur -ArgumentList @(${flags.map(q).join(',')})` : 'Start-Process -FilePath $cur', 'Remove-Item -LiteralPath $MyInvocation.MyCommand.Path -Force'].join('\r\n'));
      spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', ps], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
    }
  }
  setTimeout(() => app.quit(), 300); return true;
}
// ---- printable checklist ------------------------------------------------------------------------------
// print.html lays the blank checklist out in a hidden window; Chromium's own printing turns it into the PDF
let pdfWin = null, pdfQ = Promise.resolve();
const makePdf = (data, opts) => pdfQ = pdfQ.catch(() => {}).then(async () => {
  if (!pdfWin || pdfWin.isDestroyed()) { pdfWin = new BrowserWindow({ show: false, width: 1000, height: 1300, webPreferences: { contextIsolation: true, nodeIntegration: false, devTools: !app.isPackaged } }); await pdfWin.loadFile(path.join(__dirname, 'print.html')); }
  const pages = await pdfWin.webContents.executeJavaScript('render(' + JSON.stringify(data) + ',' + JSON.stringify(opts) + ')');
  const pdf = await pdfWin.webContents.printToPDF({ printBackground: true, preferCSSPageSize: true, margins: { marginType: 'none' } });
  return { pages, pdf };
});
let clip = null;   // the clip being made: {id, dir, proc, cancelled}
const ff = (args, dur, onProgress) => new Promise((res, rej) => {   // runs ffmpeg at low priority so the app stays responsive on slow computers
  if (!FFMPEG) return rej(new Error('The video tool (ffmpeg) is missing from this copy of the app'));
  const p = spawn(FFMPEG, ['-hide_banner', '-nostdin', '-y', ...args], { windowsHide: true }); let err = '';
  try { os.setPriority(p.pid, os.constants.priority.PRIORITY_BELOW_NORMAL); } catch (e) {}
  if (clip) clip.proc = p;
  p.stderr.on('data', d => { err = (err + d).slice(-4000); const m = /time=(\d+):(\d+):([\d.]+)/.exec(String(d)); if (m && onProgress && dur) onProgress(Math.min(1, (+m[1] * 3600 + +m[2] * 60 + +m[3]) / dur)); });
  p.on('error', rej); p.on('close', c => c === 0 ? res() : rej(new Error(clip && clip.cancelled ? 'cancelled' : 'ffmpeg failed: ' + err.split('\n').filter(Boolean).slice(-1)[0])));
});
async function makeClip(src, start, end) {
  if (clip) { clip.cancelled = true; try { clip.proc && clip.proc.kill(); } catch (e) {} }
  const id = crypto.randomBytes(8).toString('hex'), dir = path.join(TMP, id), dur = end - start; fs.mkdirSync(dir, { recursive: true });
  const me = clip = { id, dir, proc: null, cancelled: false }, steps = 4; let done = 0;
  const tell = f => { if (win && clip === me) win.webContents.send('clip-progress', (done + f) / steps); };
  const cut = ['-ss', String(start), '-i', src, '-t', String(dur)];
  try {
    const sizes = {};
    for (const [q, o] of Object.entries(QUALITY)) {
      const scale = o.h ? `scale=-2:'min(${o.h},ih)'` : 'scale=trunc(iw/2)*2:trunc(ih/2)*2';
      await ff([...cut, '-map', '0:v:0', '-an', '-vf', scale, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', String(o.crf), '-pix_fmt', 'yuv420p', '-movflags', '+faststart', path.join(dir, q + '.mp4')], dur, tell);
      done++; sizes[q] = { without: fs.statSync(path.join(dir, q + '.mp4')).size };
    }
    let audio = true;
    try { await ff([...cut, '-map', '0:a:0', '-vn', '-c:a', 'aac', '-b:a', '128k', path.join(dir, 'a.m4a')], dur, tell); } catch (e) { if (me.cancelled) throw e; audio = false; }   // no sound track
    done++;
    if (audio) for (const q of Object.keys(QUALITY)) {
      await ff(['-i', path.join(dir, q + '.mp4'), '-i', path.join(dir, 'a.m4a'), '-map', '0:v', '-map', '1:a', '-c', 'copy', '-movflags', '+faststart', path.join(dir, q + '+a.mp4')]);
      sizes[q].with = fs.statSync(path.join(dir, q + '+a.mp4')).size;
    }
    tell(0);
    return { id, audio, sizes };
  } catch (e) { fs.rmSync(dir, { recursive: true, force: true }); throw e; }
  finally { if (clip === me) clip.proc = null; }
}

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
    people: (Array.isArray(b.people) ? b.people : []).map(p => ({ id: String(p.id || ''), name: String(p.name || ''), salt: String(p.salt || ''), hash: String(p.hash || ''), boss: !!p.boss })), app: app.getVersion() };
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
  dir: () => savesDir(), list: () => st.list(), read: n => st.read(n), write: (n, t, from) => st.write(n, t, from), media: (n, k) => st.media(n, k), info: n => st.info(n), tidy: n => st.tidy(n),
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
  profileSave: b => { const O = readSigned(profFile()); if (O.s === 'ok' && newer(O.body.app, app.getVersion())) throw new Error('This profile was saved by version ' + O.body.app + '. Update this app to change it.');
    const c = cleanProfile(b), L = pinLimits(); if (L.fails) c.fails = L.fails; if (L.until) c.until = L.until;   // the page cannot reset the PIN counter
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
  pinState: () => pinLimits(),
  // export: the PDF of a blank checklist, and a Save dialog for any exported file
  pdfMake: (data, opts) => makePdf(data, opts || {}),
  saveFile: async (o, data) => { o = o || {};
    const r = await dialog.showSaveDialog(win, { title: String(o.title || 'Export'), defaultPath: path.join(typeof o.dir === 'string' && o.dir && fs.existsSync(o.dir) ? o.dir : app.getPath('documents'), String(o.name || 'export').replace(/[\\/:*?"<>|]+/g, '_')), filters: Array.isArray(o.filters) ? o.filters : undefined });
    if (r.canceled || !r.filePath) return null;
    if (o.from) return st.exportTo(r.filePath, data, o.from);   // a checklist: a complete file with the photos, PDFs and videos of checklist o.from
    await fsp.writeFile(r.filePath, typeof data === 'string' ? data : Buffer.from(data)); return r.filePath; },
  // updates
  appVersion: () => app.getVersion(),
  updGet: () => { const c = updCfg(), K = kind(), f = c.found && newer(c.found.version, app.getVersion()) ? c.found : null;
    return { auto: c.auto, skip: c.skip, snooze: c.snooze, last: c.last, found: f, version: app.getVersion(), canInstall: !!(K && f && f.asset && (K.k === 'setup' || writable(path.dirname(K.file)))) }; },
  updSet: p => { const c = updCfg(); p = p || {}; if ('auto' in p) c.auto = !!p.auto; if ('skip' in p) c.skip = String(p.skip || ''); if ('snooze' in p) c.snooze = +p.snooze || 0; cfg.upd = c; saveCfg(); return true; },
  updCheck: force => { const c = updCfg(); return force || (c.auto && Date.now() - c.last > 20 * 3600000) ? checkUpdate() : null; },   // automatic checks at most about once a day
  updDownload: () => downloadUpdate(),
  updInstall: () => installUpdate(),
  // video
  videoPick: async () => {
    const r = await dialog.showOpenDialog(win, { title: 'Choose a video', properties: ['openFile'], filters: [{ name: 'Videos', extensions: ['mp4', 'm4v', 'mov', 'webm', 'mkv', 'avi', 'wmv', 'mpg', 'mpeg', '3gp'] }, { name: 'All files', extensions: ['*'] }] });
    return r.canceled || !r.filePaths[0] ? null : handlers.videoStat(r.filePaths[0]);
  },
  videoStat: p => { try { const s = fs.statSync(String(p)); return s.isFile() ? { path: String(p), rel: relToSaves(String(p)), name: path.basename(String(p)).replace(/\.[^.]+$/, ''), size: s.size, mtime: s.mtimeMs, maxCopy: MAX_COPY } : null; } catch (e) { return null; } },
  // where a linked video is now; size and mtime let the page warn when the file was changed
  videoInfo: v => { const p = vidPath(v); try { const s = fs.statSync(p); return { exists: s.isFile(), url: pathToFileURL(p).href, size: s.size, mtime: s.mtimeMs }; } catch (e) { return { exists: false }; } },
  videoRead: async v => { const p = vidPath(v); if (fs.statSync(p).size > MAX_COPY) throw new Error('Too big to copy into a checklist'); return fsp.readFile(p); },
  // a video copied into the checklist is written out once so ffmpeg can cut it
  videoTemp: async (key, bytes) => { const f = path.join(TMP, 'src-' + String(key).replace(/[^\w-]/g, '') + '.bin'); if (!fs.existsSync(f)) { await fsp.mkdir(TMP, { recursive: true }); await fsp.writeFile(f, Buffer.from(bytes)); } return { path: f }; },
  // a small JPEG of one frame of a linked video (the page cannot read pixels from a file outside the app)
  videoThumb: (v, t) => new Promise(res => {
    if (!FFMPEG) return res('');
    const p = spawn(FFMPEG, ['-hide_banner', '-nostdin', '-ss', String(Math.max(0, +t || 0)), '-i', vidPath(v), '-frames:v', '1', '-vf', 'scale=320:-2', '-q:v', '5', '-f', 'image2', '-c:v', 'mjpeg', 'pipe:1'], { windowsHide: true }), out = [];
    p.stdout.on('data', d => out.push(d)); p.on('error', () => res('')); p.on('close', c => res(c === 0 && out.length ? 'data:image/jpeg;base64,' + Buffer.concat(out).toString('base64') : ''));
  }),
  clipMake: (v, start, end) => { start = Math.max(0, +start || 0); end = +end || 0; if (!(end > start)) throw new Error('The end must be after the start'); return makeClip(vidPath(v), start, end); },
  clipRead: (id, q, withAudio) => { if (!/^[0-9a-f]{16}$/.test(id) || !QUALITY[q]) throw new Error('Bad clip'); return fsp.readFile(path.join(TMP, id, q + (withAudio ? '+a' : '') + '.mp4')); },
  clipDone: id => { if (/^[0-9a-f]{16}$/.test(id)) fs.rmSync(path.join(TMP, id), { recursive: true, force: true }); if (clip && clip.id === id) clip = null; return true; },
  clipCancel: () => { if (clip) { clip.cancelled = true; try { clip.proc && clip.proc.kill(); } catch (e) {} fs.rmSync(clip.dir, { recursive: true, force: true }); clip = null; } return true; }
};
ipcMain.handle('fs', (e, op, ...a) => {
  if (!win || e.sender !== win.webContents || !Object.prototype.hasOwnProperty.call(handlers, op)) throw new Error('Not allowed');
  return handlers[op](...a);
});

// the loading window (splash.html) shows at once; the main window stays hidden until its menu is ready (the page sends 'ready').
// A loading.gif / .webm / ... in the Data folder replaces the wrench.
let splash = null, shown = false;
const SPLASH_EXT = { gif: 0, png: 0, apng: 0, webp: 0, svg: 0, webm: 1, mp4: 1 };
function customSplash() {
  for (const [x, v] of Object.entries(SPLASH_EXT)) { const f = path.join(dataDir, 'loading.' + x);
    try { if (fs.statSync(f).size < 30 * 1048576) return { c: pathToFileURL(f).href, ...(v ? { v: '1' } : {}) }; } catch (e) {} }
  return {};
}
function showMain() {
  if (shown || !win) return; shown = true; win.show();
  if (splash && !splash.isDestroyed()) { const s = splash; splash = null; s.webContents.executeJavaScript("step('Ready',1)").catch(() => {}); setTimeout(() => { if (!s.isDestroyed()) s.destroy(); }, 150); }
}
ipcMain.on('loading', (e, t, p) => { if (win && e.sender === win.webContents && splash && !splash.isDestroyed()) splash.webContents.executeJavaScript('step(' + JSON.stringify(String(t || '')) + ',' + (+p || 0) + ')').catch(() => {}); });
ipcMain.on('ready', e => { if (win && e.sender === win.webContents) showMain(); });
function createWindow() {
  try {
    splash = new BrowserWindow({ width: 460, height: 400, frame: false, resizable: false, maximizable: false, fullscreenable: false, center: true, show: true, backgroundColor: '#14171a', title: 'Build Checklist',
      webPreferences: { contextIsolation: true, nodeIntegration: false, devTools: false } });
    splash.loadFile(path.join(__dirname, 'splash.html'), { query: customSplash() });
    splash.on('closed', () => { splash = null; });
  } catch (e) { splash = null; }
  win = new BrowserWindow({ width: 1500, height: 900, autoHideMenuBar: true, title: 'Build Checklist', show: false, backgroundColor: '#14171a',
    webPreferences: { contextIsolation: true, nodeIntegration: false, devTools: !app.isPackaged, preload: path.join(__dirname, 'preload.js') } });
  win.loadFile(path.join(__dirname, 'index.html'));
  // never leave the app invisible: show the window anyway if the page fails or takes very long
  const late = setTimeout(showMain, 30000); if (late.unref) late.unref(); win.webContents.on('did-fail-load', showMain); win.webContents.on('render-process-gone', showMain);
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
  win.on('closed', () => { win = null; if (splash && !splash.isDestroyed()) splash.destroy(); if (pdfWin && !pdfWin.isDestroyed()) pdfWin.destroy(); });   // the hidden print window must not keep the app open
}
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', (e, argv) => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); const f = argFile(argv); if (f) win.webContents.send('open-file', f); } });
  app.whenReady().then(createWindow);
  // test hooks (tests/update-test.js, .github/workflows/update-test.yml): note which version started; update without the page
  if (process.env.BCL_VERSION_MARK) try { fs.appendFileSync(process.env.BCL_VERSION_MARK, app.getVersion() + '\n'); } catch (e) {}
  if (process.env.BCL_UPDATE_AUTO) app.whenReady().then(async () => { await new Promise(r => setTimeout(r, 3000)); const f = await checkUpdate().catch(() => null);
    if (f && f.asset) { try { await downloadUpdate(); installUpdate(); return; } catch (e) { try { fs.appendFileSync(process.env.BCL_VERSION_MARK || path.join(TMP, 'update-error.txt'), 'error: ' + e.message + '\n'); } catch (x) {} } }
    app.quit(); });
  app.on('window-all-closed', () => app.quit());
  app.on('quit', () => { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {} });
}
