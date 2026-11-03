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
// what this copy can replace itself with: the portable .exe, the folder version (a zip; Windows, no uninstaller next to the program),
// the Windows installer, or the Linux AppImage (a Mac only gets the download page)
const kind = () => { if (!app.isPackaged) return null; if (process.env.PORTABLE_EXECUTABLE_FILE) return { k: 'portable', file: process.env.PORTABLE_EXECUTABLE_FILE, asset: /^BuildChecklist\.exe$/i };
  if (process.platform === 'win32') { const exe = app.getPath('exe'); let inst = false; try { inst = fs.readdirSync(path.dirname(exe)).some(f => /^Uninstall .*\.exe$/i.test(f)); } catch (e) {}
    return inst ? { k: 'setup', asset: /^BuildChecklist-Setup\.exe$/i } : { k: 'folder', file: exe, asset: /^BuildChecklist-Folder\.zip$/i }; }
  return process.env.APPIMAGE ? { k: 'appimage', file: process.env.APPIMAGE, asset: /\.AppImage$/i } : null; };
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
// Before every update: a full copy of every checklist and the settings in Saves/Backups before updates/<date> before <version>
// (the newest two are kept). The update itself never touches Saves/ or Data/; this copy is for "just in case".
const SAFE = () => path.join(savesDir(), 'Backups before updates');
const mbs = n => (n / 1048576).toFixed(n < 1048576 * 10 ? 1 : 0) + ' MB';
async function safetyCopy(v) {
  const sd = savesDir(), tell = f => { if (win) win.webContents.send('upd-progress', f); };
  const files = fs.readdirSync(sd).filter(f => /\.bcl$/i.test(f) || f === '.profile-marker.json').map(f => path.join(sd, f)), data = fs.readdirSync(dataDir).filter(f => /\.json$/i.test(f)).map(f => path.join(dataDir, f));
  let need = 0; for (const f of [...files, ...data]) need += fs.statSync(f).size;
  let free = Infinity; try { const s = fs.statfsSync(sd); free = s.bavail * s.bsize; } catch (e) {}
  if (free < need * 1.05 + 50 * 1048576) throw new Error(`There is not enough free space for the safety copy of your checklists (needs ${mbs(need)}, ${mbs(free)} free). Nothing was changed: free up some space on that drive and try again.`);
  const name = new Date().toISOString().slice(0, 16).replace('T', ' ').replace(':', '-') + ' before ' + v, tmp = path.join(SAFE(), name + ' (incomplete)'), out = path.join(SAFE(), name);
  fs.rmSync(tmp, { recursive: true, force: true }); fs.mkdirSync(path.join(tmp, 'Data'), { recursive: true }); let done = 0; tell(0);
  for (const f of files) { const o = path.join(tmp, path.basename(f)); await fsp.copyFile(f, o); const n = fs.statSync(f).size;
    if (fs.statSync(o).size !== n) throw new Error('The safety copy of "' + path.basename(f) + '" came out incomplete. Nothing was changed.'); done += n; tell(need ? done / need : 1); }
  for (const f of data) await fsp.copyFile(f, path.join(tmp, 'Data', path.basename(f)));
  fs.writeFileSync(path.join(tmp, 'READ ME.txt'), `Made by Build Checklist ${app.getVersion()} just before updating to ${v}, on ${new Date().toString()}.\r\nIt holds every checklist from the Saves folder and the settings from the Data folder, exactly as they were.\r\nTo use one, copy it back into the Saves folder (or Data folder) while the app is closed.\r\n`);
  fs.renameSync(tmp, out);
  for (const n of fs.readdirSync(SAFE()).filter(n => / before /.test(n) && n !== name).sort().reverse().filter((n, i) => / \(incomplete\)$/.test(n) || i >= 1)) fs.rmSync(path.join(SAFE(), n), { recursive: true, force: true });
  return out;
}
// the helper (below) restarts into the new version and waits for it to say it started (UOK, written when its menu is ready); if it
// does not, the helper puts the previous version back, starts it, and leaves UFAIL for it to explain
const PEND = path.join(dataDir, 'update-pending.json'), UOK = path.join(dataDir, 'update-ok.txt'), UFAIL = path.join(dataDir, 'update-failed.json');
function updStarted() { try { const p = JSON.parse(fs.readFileSync(PEND, 'utf8')); if (p.to === app.getVersion()) { fs.writeFileSync(UOK, app.getVersion()); fs.rmSync(PEND, { force: true }); } } catch (e) {} }
const updFailed = () => { try { return JSON.parse(fs.readFileSync(UFAIL, 'utf8').replace(/^\ufeff/, '')); } catch (e) { return null; } };
// the swap happens after this copy has closed (a helper waits for it), so the new version starts cleanly with the same Saves/ and Data/
async function installUpdate() {
  const K = kind(); if (!dl || !K) throw new Error('Download the update first');
  const safe = await safetyCopy(dl.version);
  fs.rmSync(UFAIL, { force: true }); fs.rmSync(UOK, { force: true });
  if (K.k === 'setup') spawn(dl.file, [], { detached: true, stdio: 'ignore' }).unref();
  else {
    const flags = process.argv.slice(1).filter(a => /^--[\w-]+(=.*)?$/.test(a));   // start the new version with the same options (not files)
    const cur = K.file, ext = path.extname(cur), prev = K.k === 'folder' ? path.join(path.dirname(cur), '.previous-version') : path.join(path.dirname(cur), path.basename(cur, ext) + ' (previous)' + ext);
    if (K.k === 'appimage') {   // Linux lets a running AppImage be replaced
      fs.copyFileSync(cur, prev); fs.chmodSync(dl.file, 0o755); fs.renameSync(dl.file, cur);
      spawn('/bin/sh', ['-c', 'p=$1; a=$2; shift 2; while kill -0 "$p" 2>/dev/null; do sleep 0.3; done; exec "$a" "$@"', 'sh', String(process.pid), cur, ...flags], { detached: true, stdio: 'ignore' }).unref();
    } else {
      fs.writeFileSync(PEND, JSON.stringify({ from: app.getVersion(), to: dl.version, safe, at: new Date().toISOString() }));
      const ps = path.join(os.tmpdir(), 'build-checklist-update-' + process.pid + '.ps1');
      fs.writeFileSync(ps, '\ufeff' + updScript(K, cur, prev, flags, safe).join('\r\n'));
      spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', ps], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
    }
  }
  setTimeout(() => app.quit(), 300); return true;
}
// The Windows helper (PowerShell). Portable: the .exe is swapped, the old one kept as "<name> (previous).exe". Folder: the new zip is
// unpacked beside the program first (.update-new), then only the names in it are swapped; the old ones go to .previous-version, so
// Data, Saves and anything else in the folder are never moved. Either way, if anything fails or the new version does not start,
// the previous version is put back and started, and update-failed.json says what happened.
function updScript(K, cur, prev, flags, safe) {
  const q = v => "'" + String(v).replace(/'/g, "''") + "'", folder = K.k === 'folder', dir = path.dirname(cur);
  const start = flags.length ? `Start-Process -FilePath $cur -ArgumentList @(${flags.map(q).join(',')})` : 'Start-Process -FilePath $cur';
  return [`$ErrorActionPreference='Stop';$cur=${q(cur)};$new=${q(dl.file)};$prev=${q(prev)};$dir=${q(dir)};$ok=${q(UOK)};$fail=${q(UFAIL)};$pend=${q(PEND)}`,
    `$from=${q(app.getVersion())};$to=${q(dl.version)};$safe=${q(safe)};$moved=@();$placed=@()`,
    // retried: antivirus or a closing process can hold a file for a moment
    'function Mv($a,$b){for($i=0;$i -lt 120;$i++){try{Move-Item -LiteralPath $a -Destination $b -Force -ErrorAction Stop;return}catch{Start-Sleep -Milliseconds 500}};Move-Item -LiteralPath $a -Destination $b -Force}',
    'function Rm($a){for($i=0;$i -lt 120 -and (Test-Path -LiteralPath $a);$i++){try{Remove-Item -LiteralPath $a -Recurse -Force -ErrorAction Stop}catch{Start-Sleep -Milliseconds 500}};if(Test-Path -LiteralPath $a){throw "Could not remove $a"}}',
    `Wait-Process -Id ${process.pid} -Timeout 300 -ErrorAction SilentlyContinue`,
    'try{',
    ...(folder ? [
      "$nd=Join-Path $dir '.update-new';if(Test-Path -LiteralPath $nd){Rm $nd};Expand-Archive -LiteralPath $new -DestinationPath $nd -Force",
      '$exe=Split-Path $cur -Leaf;$root=$nd;if(-not(Test-Path -LiteralPath (Join-Path $root $exe))){$s=@(Get-ChildItem -LiteralPath $nd -Directory);if($s.Count -eq 1 -and (Test-Path -LiteralPath (Join-Path $s[0].FullName $exe))){$root=$s[0].FullName}}',
      "if(-not(Test-Path -LiteralPath (Join-Path $root $exe))){throw 'The downloaded update does not contain the program ('+$exe+')'}",
      '$names=@(Get-ChildItem -LiteralPath $root -Force | ForEach-Object {$_.Name})',
      'if(Test-Path -LiteralPath $prev){Rm $prev};New-Item -ItemType Directory -Path $prev | Out-Null',
      'foreach($n in $names){$p=Join-Path $dir $n;if(Test-Path -LiteralPath $p){Mv $p (Join-Path $prev $n);$moved+=$n}}',
      'foreach($n in $names){Mv (Join-Path $root $n) (Join-Path $dir $n);$placed+=$n}',
      'Rm $nd;Rm $new'] : [
      'if(Test-Path -LiteralPath $prev){Rm $prev};Mv $cur $prev;$moved+=1;Mv $new $cur;$placed+=1']),
    `if(Test-Path -LiteralPath $ok){Rm $ok};${start.replace('Start-Process', '$p=Start-Process -PassThru')}`,
    // wait for the new version to say it started; if it closes first, it failed. Still starting after 3 minutes (a slow PC): leave it.
    "$t=0;while(-not(Test-Path -LiteralPath $ok) -and $t -lt 360){if($p.HasExited){throw 'The new version closed before it finished starting'};Start-Sleep -Milliseconds 500;$t++}",
    'if(Test-Path -LiteralPath $ok){Remove-Item -LiteralPath $ok -Force -ErrorAction SilentlyContinue}',
    '}catch{$err=$_.Exception.Message;$back=$true',
    ' try{' + (folder
      ? "foreach($n in $placed){Rm (Join-Path $dir $n)};foreach($n in $moved){Mv (Join-Path $prev $n) (Join-Path $dir $n)};$nd=Join-Path $dir '.update-new';if(Test-Path -LiteralPath $nd){Remove-Item -LiteralPath $nd -Recurse -Force -ErrorAction SilentlyContinue}"
      : 'if($placed.Count){Rm $cur};if($moved.Count){Mv $prev $cur}') + "}catch{$back=$false;$err=$err+' (putting the previous version back: '+$_.Exception.Message+')'}",
    " Remove-Item -LiteralPath $new -Force -ErrorAction SilentlyContinue;Remove-Item -LiteralPath $pend -Force -ErrorAction SilentlyContinue",
    ' @{from=$from;to=$to;error=$err;safe=$safe;back=$back;prev=$prev;at=(Get-Date -Format o)} | ConvertTo-Json | Set-Content -LiteralPath $fail -Encoding UTF8',
    ' if($back){' + start + '}}',
    'Remove-Item -LiteralPath $MyInvocation.MyCommand.Path -Force -ErrorAction SilentlyContinue'];
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
    return { auto: c.auto, skip: c.skip, snooze: c.snooze, last: c.last, found: f, version: app.getVersion(), failed: updFailed(), kind: K && K.k, canInstall: !!(K && f && f.asset && (K.k === 'setup' || writable(path.dirname(K.file)))) }; },
  updSet: p => { const c = updCfg(); p = p || {}; if ('auto' in p) c.auto = !!p.auto; if ('skip' in p) c.skip = String(p.skip || ''); if ('snooze' in p) c.snooze = +p.snooze || 0; cfg.upd = c; saveCfg(); return true; },
  updCheck: force => { const c = updCfg(); return force || (c.auto && Date.now() - c.last > 20 * 3600000) ? checkUpdate() : null; },   // automatic checks at most about once a day
  updDownload: () => downloadUpdate(),
  updInstall: () => installUpdate(),
  updFailedSeen: () => { fs.rmSync(UFAIL, { force: true }); return true; },
  updSafeOpen: p => { p = String(p || ''); if (p && path.resolve(p).startsWith(SAFE()) && fs.existsSync(p)) shell.openPath(p); else shell.openPath(SAFE()); return true; },
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
  if (shown || !win) return; shown = true; win.show(); updStarted();
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
  if (process.env.BCL_UPDATE_AUTO) app.whenReady().then(async () => { for (let i = 0; i < 60 && !shown; i++) await new Promise(r => setTimeout(r, 500)); await new Promise(r => setTimeout(r, 1000));
    if (updFailed()) { try { fs.appendFileSync(process.env.BCL_VERSION_MARK, 'rolled back\n'); } catch (e) {} return app.quit(); }
    const f = await checkUpdate().catch(() => null);
    if (f && f.asset) { try { await downloadUpdate(); await installUpdate(); return; } catch (e) { try { fs.appendFileSync(process.env.BCL_VERSION_MARK || path.join(TMP, 'update-error.txt'), 'error: ' + e.message + '\n'); } catch (x) {} } }
    app.quit(); });
  app.on('window-all-closed', () => app.quit());
  app.on('quit', () => { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {} });
}
