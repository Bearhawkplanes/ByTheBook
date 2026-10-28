// A real self-update: an old build updates itself from a fake GitHub server, restarts as the new version, and keeps Saves/ and Data/.
// Linux (AppImage):  build twice, then run on a virtual screen:
//   npx electron-builder --linux AppImage --publish never -c.extraMetadata.version=0.0.1 && mv dist/BuildChecklist.AppImage old.AppImage
//   npx electron-builder --linux AppImage --publish never && mv dist/BuildChecklist.AppImage new.AppImage
//   xvfb-run -a node tests/update-test.js old.AppImage new.AppImage
// Windows (portable .exe): the same with the two .exe files (see .github/workflows/update-test.yml).
const fs = require('fs'), os = require('os'), path = require('path'), http = require('http'), crypto = require('crypto'), assert = require('assert'), { spawn } = require('child_process');
const [oldApp, newApp] = process.argv.slice(2).map(p => path.resolve(p));
if (!oldApp || !newApp) { console.error('usage: node tests/update-test.js <old app> <new app>'); process.exit(1); }
const ext = path.extname(newApp), name = 'BuildChecklist' + ext, newV = process.env.NEW_VERSION || require('../package.json').version;
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'bcl-update-')), dir = path.join(work, 'Build Checklist (shop)'), app = path.join(dir, name), marks = path.join(work, 'versions.txt');
fs.mkdirSync(path.join(dir, 'Saves'), { recursive: true }); fs.copyFileSync(oldApp, app); fs.chmodSync(app, 0o755);
const checklist = JSON.stringify({ name: 'Engine', sections: [{ title: 'A', cards: [{ text: 'Torque bolts', steps: [] }] }], pdfs: [] });
fs.writeFileSync(path.join(dir, 'Saves', 'Engine.bcl'), checklist);
const bytes = fs.readFileSync(newApp), sha = 'sha256:' + crypto.createHash('sha256').update(bytes).digest('hex');
const srv = http.createServer((q, r) => {
  if (q.url === '/latest') { r.writeHead(200, { 'Content-Type': 'application/json' }); r.end(JSON.stringify({ tag_name: 'v' + newV, html_url: 'https://github.com/Bearhawkplanes/Build-Checklist/releases/tag/v' + newV, body: 'test', draft: false, prerelease: false,
    assets: [{ name, size: bytes.length, digest: sha, browser_download_url: 'http://127.0.0.1:' + srv.address().port + '/dl' }] })); }
  else if (q.url === '/dl') { r.writeHead(200, { 'Content-Length': bytes.length }); r.end(bytes); } else { r.writeHead(404); r.end(); }
});
srv.listen(0, '127.0.0.1', async () => {
  const env = Object.assign({}, process.env, { BCL_UPDATE_URL: 'http://127.0.0.1:' + srv.address().port + '/latest', BCL_UPDATE_AUTO: '1', BCL_VERSION_MARK: marks, APPIMAGE_EXTRACT_AND_RUN: '1' });   // the last one: run an AppImage without FUSE (test machines)
  spawn(app, ['--no-sandbox'], { env, detached: true, stdio: 'ignore' }).unref();
  const t0 = Date.now(); let got = '';
  while (Date.now() - t0 < 240000) { await new Promise(r => setTimeout(r, 1000)); got = fs.existsSync(marks) ? fs.readFileSync(marks, 'utf8') : ''; if (got.split('\n').filter(Boolean).length >= 2 || /error/.test(got)) break; }
  await new Promise(r => setTimeout(r, 5000));   // let the new version check (nothing newer) and close
  srv.close();
  try {
    assert.deepStrictEqual(got.trim().split('\n'), ['0.0.1', newV], 'old version started, then the new one: ' + JSON.stringify(got));
    assert.strictEqual(crypto.createHash('sha256').update(fs.readFileSync(app)).digest('hex'), sha.slice(7), 'the program file is now the new version, same name');
    assert(fs.existsSync(path.join(dir, 'BuildChecklist (previous)' + ext)), 'the previous version is kept');
    assert.strictEqual(fs.readFileSync(path.join(dir, 'Saves', 'Engine.bcl'), 'utf8'), checklist, 'checklist untouched');
    assert(fs.existsSync(path.join(dir, 'Data')), 'Data folder still next to the app');
    assert(!fs.readdirSync(dir).some(f => f.startsWith('.update-')), 'no leftover download');
    console.log('Update test passed: 0.0.1 -> ' + newV + ', previous version kept, checklists untouched');
    fs.rmSync(work, { recursive: true, force: true });
  } catch (e) { console.error('FAILED:', e.message, '\nfolder:', fs.readdirSync(dir)); process.exit(1); }
});
