// Runs the real main.js and storage.js against a fake Electron, in a temporary folder, to test the PIN limits and checklist stamps.
// Run: node tests/main-test.js
const fs = require('fs'), os = require('os'), path = require('path'), assert = require('assert'), Module = require('module');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bcl-main-'));
for (const f of ['main.js', 'storage.js']) fs.copyFileSync(path.join(__dirname, '..', f), path.join(dir, f));   // main.js keeps Data/ and Saves/ next to itself
let handle, win;
const electron = {
  app: { isPackaged: false, getPath: () => dir, setPath() {}, requestSingleInstanceLock: () => true, on() {}, quit() {}, whenReady: () => Promise.resolve() },
  BrowserWindow: class { constructor() { win = this; this.webContents = { setWindowOpenHandler() {}, on() {}, send() {} }; } loadFile() {} on() {} },
  ipcMain: { handle: (ch, fn) => { handle = fn; }, on() {}, once() {}, removeListener() {} },
  dialog: {}, shell: { trashItem: async f => fs.unlinkSync(f) }
};
const load = Module._load; Module._load = function (req, ...a) { return req === 'electron' ? electron : load.call(this, req, ...a); };
require(path.join(dir, 'main.js'));
const call = (op, ...a) => handle({ sender: win.webContents }, op, ...a);

(async () => {
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

  console.log('All main tests passed');
  fs.rmSync(dir, { recursive: true, force: true });
  async function forceNoWait() {   // stands in for the 20 minutes passing: moves the clock past the wait
    const t = (await call('pinState')).until + 1000; Date.now = () => t;
  }
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
