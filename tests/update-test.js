// A real self-update: an old build updates itself from a fake GitHub server, restarts as the new version, and keeps Saves/ and Data/.
// Linux (AppImage):  build twice, then run on a virtual screen:
//   npx electron-builder --linux AppImage --publish never -c.extraMetadata.version=0.0.1 && mv dist/ByTheBook.AppImage old.AppImage
//   npx electron-builder --linux AppImage --publish never && mv dist/ByTheBook.AppImage new.AppImage
//   xvfb-run -a node tests/update-test.js old.AppImage new.AppImage
// Windows (portable .exe, or the folder version as .zip): the same with the two files (see .github/workflows/update-test.yml).
// EXPECT=rollback: the new one is broken on purpose (it closes at once); the helper must put the old version back and start it,
// which then finds update-failed.json.
const fs = require('fs'), os = require('os'), path = require('path'), http = require('http'), crypto = require('crypto'), assert = require('assert'), { spawn, execFileSync } = require('child_process');
const [oldApp, newApp] = process.argv.slice(2).map(p => path.resolve(p));
if (!oldApp || !newApp) { console.error('usage: node tests/update-test.js <old app> <new app>'); process.exit(1); }
const ext = path.extname(newApp), folder = ext === '.zip', rollback = process.env.EXPECT === 'rollback';
const name = folder ? 'ByTheBook-Folder.zip' : 'ByTheBook' + ext, newV = process.env.NEW_VERSION || require('../package.json').version;
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'bcl-update-')), marks = path.join(work, 'versions.txt');
const sha = f => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
let dir, app;
if (folder) {   // unzip the old folder version where a shop would put it (the zip holds one folder, "ByTheBook")
  execFileSync('powershell.exe', ['-NoProfile', '-Command', `Expand-Archive -LiteralPath '${oldApp}' -DestinationPath '${work}' -Force`]);
  dir = path.join(work, 'ByTheBook'); app = path.join(dir, 'ByTheBook.exe');
} else { dir = path.join(work, 'ByTheBook (shop)'); app = path.join(dir, name); fs.mkdirSync(dir, { recursive: true }); fs.copyFileSync(oldApp, app); fs.chmodSync(app, 0o755); }
const oldSha = sha(app);
fs.mkdirSync(path.join(dir, 'Saves'), { recursive: true }); fs.writeFileSync(path.join(dir, 'my notes.txt'), 'something of the shop\'s in the app folder');
const checklist = JSON.stringify({ name: 'Engine', sections: [{ title: 'A', cards: [{ text: 'Torque bolts', steps: [] }] }], pdfs: [] });
fs.writeFileSync(path.join(dir, 'Saves', 'Engine.bcl'), checklist);
const bytes = fs.readFileSync(newApp), dig = 'sha256:' + crypto.createHash('sha256').update(bytes).digest('hex');
const srv = http.createServer((q, r) => {
  if (q.url === '/latest') { r.writeHead(200, { 'Content-Type': 'application/json' }); r.end(JSON.stringify({ tag_name: 'v' + newV, html_url: 'https://github.com/Bearhawkplanes/ByTheBook/releases/tag/v' + newV, body: 'test', draft: false, prerelease: false,
    assets: [{ name, size: bytes.length, digest: dig, browser_download_url: 'http://127.0.0.1:' + srv.address().port + '/dl' }] })); }
  else if (q.url === '/dl') { r.writeHead(200, { 'Content-Length': bytes.length }); r.end(bytes); } else { r.writeHead(404); r.end(); }
});
srv.listen(0, '127.0.0.1', async () => {
  const env = Object.assign({}, process.env, { BCL_UPDATE_URL: 'http://127.0.0.1:' + srv.address().port + '/latest', BCL_UPDATE_AUTO: '1', BCL_VERSION_MARK: marks, APPIMAGE_EXTRACT_AND_RUN: '1' });   // the last one: run an AppImage without FUSE (test machines)
  spawn(app, ['--no-sandbox'], { env, detached: true, stdio: 'ignore' }).unref();
  const want = rollback ? ['0.0.1', '0.0.1', 'rolled back'] : ['0.0.1', newV], t0 = Date.now(); let got = '';
  while (Date.now() - t0 < 300000) { await new Promise(r => setTimeout(r, 1000)); got = fs.existsSync(marks) ? fs.readFileSync(marks, 'utf8') : ''; if (got.split('\n').filter(Boolean).length >= want.length || /error/.test(got)) break; }
  await new Promise(r => setTimeout(r, 8000));   // let the new version check (nothing newer) and close, and the helper finish
  srv.close();
  const safe = path.join(dir, 'Saves', 'Backups before updates'), failed = path.join(dir, 'Data', 'update-failed.json');
  try {
    assert.deepStrictEqual(got.trim().split('\n'), want, 'versions started: ' + JSON.stringify(got));
    assert.strictEqual(fs.readFileSync(path.join(dir, 'Saves', 'Engine.bcl'), 'utf8'), checklist, 'checklist untouched');
    assert.strictEqual(fs.readFileSync(path.join(dir, 'my notes.txt'), 'utf8'), 'something of the shop\'s in the app folder', 'other files in the app folder untouched');
    assert(fs.existsSync(path.join(dir, 'Data')), 'Data folder still next to the app');
    const sc = fs.readdirSync(safe); assert(sc.length === 1 && / before /.test(sc[0]) && fs.readFileSync(path.join(safe, sc[0], 'Engine.bcl'), 'utf8') === checklist, 'safety copy made before the update: ' + sc);
    assert(!fs.readdirSync(dir).some(f => f.startsWith('.update-')), 'no leftover download or unpacked update');
    if (rollback) {
      assert.strictEqual(sha(app), oldSha, 'the previous version is back in place');
      const f = JSON.parse(fs.readFileSync(failed, 'utf8').replace(/^﻿/, '')); assert(f.back === true && f.to === newV && /closed before/.test(f.error) && f.safe, 'update-failed.json explains: ' + JSON.stringify(f));
      console.log('Rollback test passed: the broken update was undone, the old version restarted and found the notice, checklists untouched');
    } else {
      assert.notStrictEqual(sha(app), oldSha, 'the program is now the new version, same name');
      assert(fs.existsSync(folder ? path.join(dir, '.previous-version', 'ByTheBook.exe') : path.join(dir, 'ByTheBook (previous)' + ext)), 'the previous version is kept');
      assert(!fs.existsSync(failed), 'no failure noted');
      console.log('Update test passed: 0.0.1 -> ' + newV + (folder ? ' (folder version)' : '') + ', previous version kept, safety copy made, checklists untouched');
    }
    fs.rmSync(work, { recursive: true, force: true });
  } catch (e) { console.error('FAILED:', e.message, '\nfolder:', fs.readdirSync(dir), '\nData:', fs.existsSync(path.join(dir, 'Data')) && fs.readdirSync(path.join(dir, 'Data')));
    for (const f of ['update-trace.txt']) { const p = path.join(dir, 'Data', f); if (fs.existsSync(p)) console.error('--- ' + f + ':\n' + fs.readFileSync(p, 'utf8')); }
    if (process.platform === 'win32') try { console.error('--- running:\n' + execFileSync('tasklist', ['/FO', 'CSV'], { encoding: 'utf8' }).split('\n').filter(l => /powershell|ByTheBook|ByTheBook/i.test(l)).join('\n')); } catch (x) {}
    const hp = path.join(dir, 'Data', 'update-helper.ps1');
    if (fs.existsSync(hp)) { console.error('--- update-helper.ps1:\n' + fs.readFileSync(hp, 'utf8'));
      try { console.error('--- parse check:\n' + execFileSync('powershell.exe', ['-NoProfile', '-Command', `$e=$null;[void][System.Management.Automation.Language.Parser]::ParseFile('${hp}',[ref]$null,[ref]$e);if($e){$e|ForEach-Object{$_.Extent.StartLineNumber.ToString()+': '+$_.Message}}else{'no errors'}`], { encoding: 'utf8' })); } catch (x) { console.error('parse check failed: ' + x.message); } }
        for (const f of ['update-log.txt', 'update-failed.json', 'update-pending.json']) { const p = path.join(dir, 'Data', f); if (fs.existsSync(p)) console.error('--- ' + f + ':\n' + fs.readFileSync(p, 'utf8')); } process.exit(1); }
});
