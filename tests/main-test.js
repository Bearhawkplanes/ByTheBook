// Runs the real main.js and storage.js against a fake Electron, in a temporary folder, to test the PIN limits and checklist stamps.
// Run: node tests/main-test.js
const fs = require('fs'), os = require('os'), path = require('path'), assert = require('assert'), Module = require('module'), crypto = require('crypto');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bcl-main-'));
for (const f of ['main.js', 'storage.js', 'bcl.js']) fs.copyFileSync(path.join(__dirname, '..', f), path.join(dir, f));   // main.js keeps Data/ and Saves/ next to itself
fs.symlinkSync(path.join(__dirname, '..', 'node_modules'), path.join(dir, 'node_modules'), 'junction');   // for ffmpeg-static
let handle, win, quits = 0;
process.env.APPIMAGE = path.join(dir, 'BuildChecklist.AppImage'); fs.writeFileSync(process.env.APPIMAGE, '#!/bin/sh\necho old\n');
const http = require('http'); let REL = null, ASSET = Buffer.from('#!/bin/sh\necho new-version > "$BCL_MARK"\n');
const srv = http.createServer((q, r) => { if (q.url === '/latest') { r.writeHead(REL ? 200 : 404, { 'Content-Type': 'application/json' }); r.end(JSON.stringify(REL || {})); } else if (q.url === '/dl') { r.writeHead(200); r.end(ASSET); } else { r.writeHead(404); r.end(); } });
const srvReady = new Promise(r => srv.listen(0, '127.0.0.1', () => { process.env.BCL_UPDATE_URL = 'http://127.0.0.1:' + srv.address().port + '/latest'; r(); }));
const electron = {
  app: { isPackaged: true, getVersion: () => '0.5.0', getPath: k => k === 'exe' ? path.join(dir, 'app') : dir, setPath() {}, requestSingleInstanceLock: () => true, on() {}, quit() { quits++; }, whenReady: () => Promise.resolve() },   // 'installed' in dir, as an AppImage (below)
  BrowserWindow: class { constructor() { win = this; this.webContents = { setWindowOpenHandler() {}, on() {}, send() {} }; } loadFile() {} on() {} },
  ipcMain: { handle: (ch, fn) => { handle = fn; }, on() {}, once() {}, removeListener() {} },
  dialog: {}, shell: { trashItem: async f => fs.unlinkSync(f) }
};
const load = Module._load; Module._load = function (req, ...a) { return req === 'electron' ? electron : load.call(this, req, ...a); };

const call = (op, ...a) => handle({ sender: win.webContents }, op, ...a);

(async () => {
  await srvReady; require(path.join(dir, 'main.js'));
  await new Promise(r => setTimeout(r, 50));   // createWindow runs after whenReady
  const salt = await call('newSalt'), rec = await call('recMake'), pid = await call('newPid');
  const owner = { id: 'owner', salt, hash: await call('hash', '1234', salt) };
  await call('profileSave', { pid, user: 'Foreman', salt: owner.salt, hash: owner.hash, rv: rec.rv, req: {}, people: [] });
  assert.strictEqual((await call('integrity')).code, null);

  assert.deepStrictEqual(await call('pinTry', '1234', [owner]), { id: 'owner', fails: 0 });
  let r; for (let i = 1; i <= 14; i++) r = await call('pinTry', '0000', [owner]);
  assert.deepStrictEqual(r, { fails: 14, wait: 0 });
  r = await call('pinTry', '0000', [owner]);
  assert(r.fails === 15 && r.wait - Date.now() > 19 * 60000, '20-minute wait at 15');
  assert.strictEqual((await call('pinTry', '1234', [owner])).id, undefined, 'blocked during the wait, even with the right PIN');
  assert.strictEqual((await call('pinState')).fails, 15, 'kept in the profile');

  // the page saving the profile cannot reset the counter
  await call('profileSave', { pid, user: 'Foreman', salt: owner.salt, hash: owner.hash, rv: rec.rv, req: {}, people: [], fails: 0, until: 0 });
  assert.strictEqual((await call('pinState')).fails, 15, 'profileSave keeps the counter');
  assert.strictEqual((await call('integrity')).code, null, 'profile still valid');

  // skip the waits and run up to 100
  for (let i = 16; i <= 100; i++) {
    const s = await call('pinState'); if (s.until > Date.now()) await forceNoWait();
    r = await call('pinTry', '0000', [owner]);
  }
  assert.deepStrictEqual(r, { locked: 'E-4419', fails: 100 });
  assert.strictEqual((await call('integrity')).code, 'E-4419', 'restart still locked');
  assert.deepStrictEqual(await call('pinTry', '1234', [owner]), { locked: 'E-4419', fails: 100 }, 'right PIN does not unlock');

  // wrong recovery code changes nothing; the right one clears the limits
  assert.strictEqual(await call('recCheck', 'AAAA-AAAA-AAAA-AAAA-AAAA', [{ pid, rv: rec.rv }]), -1);
  assert.strictEqual((await call('integrity')).code, 'E-4419');
  assert.strictEqual(await call('recCheck', rec.code.toLowerCase(), [{ pid, rv: rec.rv }]), 0);
  assert.strictEqual((await call('integrity')).code, null, 'recovery code clears E-4419');
  assert.strictEqual((await call('pinTry', '1234', [owner])).id, 'owner');

  // the saved list reports each checklist's profile stamp
  await call('write', 'a.bcl', JSON.stringify({ name: 'a', sections: [], stamp: { pid, rv: rec.rv } }));
  await call('write', 'b.bcl', JSON.stringify({ name: 'b', sections: [] }));
  const l = (await call('list')).sort((x, y) => x.name.localeCompare(y.name));
  assert.deepStrictEqual(l.map(x => [x.name, x.pid]), [['a', pid], ['b', '']]);
  // master lock and worker mode are read from the start of the file (pack() puts them first)
  await call('write', 'c.bcl', JSON.stringify({ app: '0.5.0', stamp: { pid, rv: rec.rv }, locked: true, worker: false, name: 'c', sections: [{ title: 'x', locked: false }] }));
  await call('write', 'd.bcl', JSON.stringify({ app: '0.5.0', locked: false, worker: true, name: 'd', sections: [] }));
  const l2 = await call('list'), fl = n => { const x = l2.find(y => y.name === n); return [x.locked, x.worker]; };
  assert.deepStrictEqual([fl('a'), fl('c'), fl('d')], [[false, false], [true, false], [false, true]], 'list reports master lock and worker mode');
  fs.writeFileSync(path.join(await call('dir'), 'big-old.bcl'), '{"name":"x","files":{"f":"' + 'A'.repeat((1 << 22) - 30) + '"},"stamp":{"pid":"' + pid + '","rv":{}}}');   // older layout: stamp after 4 MB of data, across a read boundary
  assert.strictEqual((await call('list')).find(x => x.name === 'big-old').pid, pid, 'stamp found in an older, big file without reading it whole');

  // video: linked paths, clips in three qualities with exact sizes, with and without a sound track
  const { execFileSync } = require('child_process'), ffbin = require('ffmpeg-static');
  const saves = await call('dir'), vid = path.join(saves, 'videos', 'walkaround.mp4'), mute = path.join(dir, 'mute.mp4'); fs.mkdirSync(path.dirname(vid), { recursive: true });
  execFileSync(ffbin, ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=1280x720:rate=30:duration=10', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=10', '-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'aac', '-shortest', vid]);
  execFileSync(ffbin, ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=640x360:rate=25:duration=4', '-c:v', 'libx264', '-preset', 'ultrafast', mute]);
  const info = await call('videoInfo', { rel: 'videos/walkaround.mp4' });
  assert(info.exists && info.url.startsWith('file://') && info.size > 0, 'linked video inside the save folder found by its relative path');
  assert.strictEqual((await call('videoInfo', { path: path.join(dir, 'gone.mp4') })).exists, false);
  const progress = []; win.webContents.send = (ch, f) => ch === 'clip-progress' && progress.push(f);
  const c = await call('clipMake', { rel: 'videos/walkaround.mp4' }, 2, 5);
  assert(c.audio && /^[0-9a-f]{16}$/.test(c.id), 'clip made with sound');
  for (const q of ['native', 'medium', 'low']) assert(c.sizes[q].with > c.sizes[q].without && c.sizes[q].without > 1000, q + ' sizes');
  assert(c.sizes.low.without < c.sizes.medium.without && c.sizes.medium.without < c.sizes.native.without, 'lower quality is smaller');
  assert(progress.length > 3 && Math.max(...progress) <= 1, 'progress reported');
  const bytes = await call('clipRead', c.id, 'medium', true), outF = path.join(dir, 'out.mp4'); fs.writeFileSync(outF, bytes);
  assert.strictEqual(bytes.length, c.sizes.medium.with, 'the size shown is the size you get');
  const meta = (() => { try { execFileSync(ffbin, ['-i', outF], { stdio: 'pipe' }); } catch (e) { return String(e.stderr); } })();
  assert(/Video: h264.*1280x720/.test(meta) && /Audio: aac/.test(meta), 'medium keeps 720p and sound');
  assert(/Duration: 00:00:0(2\.9|3\.0)/.test(meta), 'clip is 3 seconds: ' + (/Duration: [^,]*/.exec(meta) || [])[0]);
  const lowMeta = (() => { fs.writeFileSync(outF, Buffer.from(fs.readFileSync(path.join(os.tmpdir(), 'build-checklist-video', c.id, 'low.mp4')))); try { execFileSync(ffbin, ['-i', outF], { stdio: 'pipe' }); } catch (e) { return String(e.stderr); } })();
  assert(/x480/.test(lowMeta) && !/Audio:/.test(lowMeta), 'low is 480p, and without sound when asked');
  const th = await call('videoThumb', { rel: 'videos/walkaround.mp4' }, 3);
  assert(th.startsWith('data:image/jpeg;base64,/9j/') && th.length > 2000, 'thumbnail of a linked video');
  assert.strictEqual(await call('videoThumb', { path: path.join(dir, 'gone.mp4') }, 1), '', 'no thumbnail for a missing file');
  await call('clipDone', c.id); assert(!fs.existsSync(path.join(os.tmpdir(), 'build-checklist-video', c.id)), 'temp files removed');
  const m = await call('clipMake', { path: mute }, 0, 1.5);
  assert(!m.audio && !m.sizes.native.with, 'video without sound: no sound option'); await call('clipDone', m.id);
  await assert.rejects(async () => call('clipMake', { path: mute }, 3, 2), /after the start/);

  // checklist files: media stored once, ticks only append, media copied between files, old files converted
  const SV = await call('dir'), fsz = n => fs.statSync(path.join(SV, n)).size, B = require(path.join(dir, 'bcl.js'));
  const photo = Buffer.alloc(2 * 1048576, 3), pdfB = Buffer.from('%PDF-1.4 sample');
  const ck = { app: '0.5.0', name: 'job', sections: [{ title: 'A', cards: [{ text: 'Item', steps: [{ text: 'Step', done: false }] }] }], log: [],
    files: { im1: { name: 'p.jpg', type: 'image/jpeg', data: 'data:image/jpeg;base64,' + photo.toString('base64') } }, pdfs: [{ id: 'pd1', name: 'Manual', data: 'data:application/pdf;base64,' + pdfB.toString('base64') }], videos: [] };
  assert.deepStrictEqual(await call('write', 'job.bcl', JSON.stringify(ck)), { container: true });
  let sk = JSON.parse(await call('read', 'job.bcl'));
  assert(sk.files.im1.data === 'bcl-media:m:im1' && sk.pdfs[0].data === 'bcl-media:p:pd1', 'the checklist holds references, not the media');
  assert(Buffer.from(await call('media', 'job.bcl', 'm:im1')).equals(photo) && Buffer.from(await call('media', 'job.bcl', 'p:pd1')).equals(pdfB), 'media come back byte for byte');
  assert(fsz('job.bcl') < photo.length + 4096, 'stored as raw bytes (smaller than text)');
  const s0 = fsz('job.bcl'); sk.sections[0].cards[0].steps[0].done = true; await call('write', 'job.bcl', JSON.stringify(sk));
  assert(fsz('job.bcl') - s0 < 2048, 'a tick adds only the checklist, not the photo: +' + (fsz('job.bcl') - s0) + ' bytes');
  assert.strictEqual(JSON.parse(await call('read', 'job.bcl')).sections[0].cards[0].steps[0].done, true);
  await new Promise(r => setTimeout(r, 300));   // the backup is copied beside the save, up to the last complete save
  assert(Buffer.from(await B.readMedia(path.join(SV, 'Backups', 'job.bcl.bak'), 'm:im1')).equals(photo), 'backup made in the background is a complete, readable checklist');
  // a power cut in the middle of a save: the previous save is used
  fs.appendFileSync(path.join(SV, 'job.bcl'), Buffer.concat([Buffer.alloc(5000, 1), Buffer.from('BCLT'), Buffer.alloc(20)]));
  assert.strictEqual(JSON.parse(await call('read', 'job.bcl')).sections[0].cards[0].steps[0].done, true, 'last complete save recovered');
  await call('write', 'job.bcl', await call('read', 'job.bcl')); assert(fsz('job.bcl') < s0 + 4096, 'the cut-off part is dropped on the next save');
  // a new job / Save as: references into another checklist, plus a new photo
  sk = JSON.parse(await call('read', 'job.bcl')); sk.files.im2 = { name: 'n.png', type: 'image/png', data: 'data:image/png;base64,' + Buffer.from('new').toString('base64') };
  await call('write', 'job 2.bcl', JSON.stringify(sk), 'job.bcl');
  assert(Buffer.from(await call('media', 'job 2.bcl', 'm:im1')).equals(photo) && Buffer.from(await call('media', 'job 2.bcl', 'm:im2')).toString() === 'new', 'media copied into the new checklist');
  await assert.rejects(async () => call('write', 'job 3.bcl', JSON.stringify(sk)), /missing/i, 'a reference without its media is refused, nothing half-written');
  assert(!fs.existsSync(path.join(SV, 'job 3.bcl')));
  // an export through the Save dialog: a complete file elsewhere
  const exp = path.join(dir, 'exported.bcl'); electron.dialog.showSaveDialog = async () => ({ canceled: false, filePath: exp });
  assert.strictEqual(await call('saveFile', { name: 'x.bcl', from: 'job.bcl' }, await call('read', 'job.bcl')), exp);
  assert(Buffer.from(await B.readMedia(exp, 'm:im1')).equals(photo), 'exported file carries its media');
  assert(/^\d/.test(await call('importPath', exp)) || await call('importPath', exp), 'an exported file can be imported again');
  // dead space from many saves is cleared
  for (let i = 0; i < 5; i++) { sk.sections[0].title = 'save ' + i; delete sk.files.im2; await call('write', 'job.bcl', JSON.stringify(sk)); }
  let inf = await call('info', 'job.bcl'); assert(inf.file > inf.used, 'older saves are dead space');
  await call('tidy', 'job.bcl'); inf = await call('info', 'job.bcl'); assert(inf.file - inf.used < 8 * 1048576 && inf.media === photo.length + pdfB.length, 'tidy keeps only what is in use: ' + JSON.stringify(inf));
  // a file from before this format: converted when first read, original kept as the backup, media intact
  fs.writeFileSync(path.join(SV, 'old.bcl'), JSON.stringify(ck));
  const oldText = fs.readFileSync(path.join(SV, 'old.bcl'), 'utf8');
  assert.strictEqual(JSON.parse(await call('read', 'old.bcl')).files.im1.data, 'bcl-media:m:im1', 'converted on first read');
  assert.strictEqual(fs.readFileSync(path.join(SV, 'Backups', 'old.bcl.bak'), 'utf8'), oldText, 'the original kept as its backup');
  assert(Buffer.from(await call('media', 'old.bcl', 'm:im1')).equals(photo));
  const restored = await call('restore', 'old.bcl'); assert(/restored/.test(restored) && JSON.parse(await call('read', restored + '.bcl')).name === 'job', 'restore from that backup works');

  // updates: off by default; a newer release is found, downloaded, checked and swapped in; the previous version is kept
  const base = 'http://127.0.0.1:' + srv.address().port, sha = 'sha256:' + crypto.createHash('sha256').update(ASSET).digest('hex');
  const rel = (tag, extra) => Object.assign({ tag_name: tag, html_url: 'https://github.com/Bearhawkplanes/Build-Checklist/releases/tag/' + tag, body: 'New: things', draft: false, prerelease: false,
    assets: [{ name: 'BuildChecklist.exe', size: 1, browser_download_url: base + '/nope' }, { name: 'BuildChecklist.AppImage', size: ASSET.length, browser_download_url: base + '/dl', digest: sha }] }, extra || {});
  let u = await call('updGet');
  assert(u.auto === false && u.version === '0.5.0' && !u.found, 'automatic checks off by default');
  REL = rel('v0.9.0');
  assert.strictEqual(await call('updCheck', false), null, 'no automatic check while switched off');
  await call('updSet', { auto: true });
  let f = await call('updCheck', false);
  assert(f.version === '0.9.0' && /releases\/tag\/v0.9.0$/.test(f.url) && f.notes === 'New: things' && f.asset.name === 'BuildChecklist.AppImage', 'newer release found with its page and the right file');
  assert.strictEqual(await call('updCheck', false), null, 'not asked again the same day');
  assert((await call('updGet')).canInstall, 'can install in place');
  REL = rel('v0.5.0'); assert((await call('updCheck', true)).none && !(await call('updGet')).found, 'same version: nothing');
  REL = rel('v0.10.0', { prerelease: true }); assert((await call('updCheck', true)).none, 'pre-releases ignored');
  REL = null; assert(/404/.test((await call('updCheck', true)).error), 'no answer: an error, nothing else');
  REL = rel('v0.10.0'); REL.assets[1].digest = 'sha256:' + 'ab'.repeat(32); await call('updCheck', true);
  await assert.rejects(call('updDownload'), /damaged/, 'a download with the wrong fingerprint is refused');
  assert(!fs.existsSync(path.join(dir, '.update-BuildChecklist.AppImage')), 'and deleted');
  REL = rel('v0.10.0'); await call('updCheck', true);
  const prog = []; win.webContents.send = (ch, v) => ch === 'upd-progress' && prog.push(v);
  assert.deepStrictEqual(await call('updDownload'), { ok: true, size: ASSET.length }); assert.strictEqual(prog.at(-1), 1, 'progress reaches 100%');
  await call('updSet', { skip: '0.10.0', snooze: 123 }); u = await call('updGet');
  assert(u.skip === '0.10.0' && u.snooze === 123, 'skip and snooze remembered');
  call('updInstall'); await new Promise(r => setTimeout(r, 400));
  assert.strictEqual(fs.readFileSync(process.env.APPIMAGE, 'utf8'), ASSET.toString(), 'new version in place under the same name');
  assert.strictEqual(fs.readFileSync(path.join(dir, 'BuildChecklist (previous).AppImage'), 'utf8'), '#!/bin/sh\necho old\n', 'previous version kept');
  assert(quits >= 1, 'the app closes so the new version can start');
  assert(fs.existsSync(path.join(saves, 'a.bcl')), 'checklists untouched');
  // an older copy never overwrites a profile saved by a newer version
  const P = JSON.parse(fs.readFileSync(path.join(dir, 'Data', 'profile.json'), 'utf8'));
  assert.strictEqual(P.app, '0.5.0', 'profile carries the version that saved it');
  electron.app.getVersion = () => '0.4.0';
  await assert.rejects(async () => call('profileSave', { pid, user: 'Old copy', salt: owner.salt, hash: owner.hash, rv: rec.rv, req: {}, people: [] }), /saved by version 0.5.0/);
  electron.app.getVersion = () => '0.5.0';
  srv.close();

  console.log('All main tests passed');
  fs.rmSync(dir, { recursive: true, force: true });
  async function forceNoWait() {   // stands in for the 20 minutes passing: moves the clock past the wait
    const t = (await call('pinState')).until + 1000; Date.now = () => t;
  }
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
