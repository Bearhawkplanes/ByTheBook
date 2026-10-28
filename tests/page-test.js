// Browser test of index.html without Electron: window.fsapi is replaced by an in-memory stub.
// Run: node tests/page-test.js   (needs Playwright + Chromium; both are preinstalled in Claude cloud sessions)
const { chromium } = require('playwright'), fs = require('fs'), path = require('path'), assert = require('assert');
const url = 'file://' + path.join(__dirname, '..', 'index.html');
const R = { salt: '00'.repeat(16), hash: '33'.repeat(32) };
const prof = pid => ({ code: null, p: 'ok', m: 'ok', body: { pid, user: 'A', salt: '00'.repeat(16), hash: '11'.repeat(32), rv: R, req: { names: false, sign: false, edit: false }, people: [] }, marker: { pid, rv: R } });
const NONE = { code: null, p: 'none', m: 'none', body: null, marker: null };          // fresh install
const TAMPERED = { code: 'E-4417', p: 'bad', m: 'ok', body: null, marker: { pid: 'a'.repeat(32), rv: R } };
// files: { 'name.bcl': text }, integ: what main.js 'integrity' would return
// PINs 1234 and 24680 are correct for the first entry checked (the main profile), 1357 for employee p1; wrong PINs are counted like main.js does (window.__L), and recovery code GOOD clears them
const stub = (files, integ) => `(() => { const F = ${JSON.stringify(files)}, I = ${JSON.stringify(integ)}, ok = v => Promise.resolve(v), L = window.__L = { fails: 0, until: 0 };
 const pidOf = t => { const m = /"stamp":\\{"pid":"([0-9a-f]{32})"/.exec(t); return m ? m[1] : ''; };
 window.fsapi = { dir: () => ok('/saves'), list: () => ok(Object.keys(F).map(f => ({ name: f.replace(/\\.bcl$/, ''), mtime: Date.now(), pid: pidOf(F[f]) }))),
  read: n => ok(F[n]), write: (n, t) => { F[n] = t; return ok(true); }, writeNew: (n, t) => { F[n + '.bcl'] = t; return ok(n); },
  rename: () => ok(true), remove: n => { delete F[n]; return ok(true); }, importPath: () => ok(null), choose: () => ok(null), resetDir: () => ok('/saves'),
  openDir: () => ok(), reveal: () => ok(), pending: () => ok(null), backup: () => ok(null), restore: () => ok(null),
  newSalt: () => ok('00112233445566778899aabbccddeeff'), newPid: () => ok('ab'.repeat(16)), integrity: () => ok(I), profileSave: () => ok(true),
  recMake: () => ok({ code: 'X', rv: { salt: '00'.repeat(16), hash: '11'.repeat(32) } }), recCheck: (c, list) => { if (c !== 'GOOD') return ok(-1); L.fails = 0; L.until = 0; return ok(0); }, hash: () => ok('22'.repeat(32)), matchPin: () => ok(null),
  pinTry: (pin, list) => { if (L.fails >= 100) return ok({ locked: 'E-4419', fails: L.fails }); if (L.until > Date.now()) return ok({ fails: L.fails, wait: L.until });
   if (pin === '1357' && list.some(x => x.id === 'p1')) { L.fails = 0; L.until = 0; return ok({ id: 'p1', fails: 0 }); }
   if (pin === '1234' || pin === '24680') { L.fails = 0; L.until = 0; return ok({ id: list[0].id, fails: 0 }); } L.fails++; L.until = L.fails < 100 && L.fails % 15 === 0 ? Date.now() + 1200000 : 0;
   return ok(L.fails >= 100 ? { locked: 'E-4419', fails: L.fails } : { fails: L.fails, wait: L.until }); },
  pinState: () => ok({ fails: L.fails, until: L.until }),
  onFlush: () => {}, onOpen: () => {} }; })()`;
const items = o => o.sections.flatMap(s => s.cards.flatMap(c => [c, ...c.steps]));

(async () => {
  const b = await chromium.launch(), errors = [];
  const page = async (files, integ) => { const ctx = await b.newContext({ acceptDownloads: true }), pg = await ctx.newPage();
    pg.on('pageerror', e => errors.push(e.message)); await pg.addInitScript(stub(files, integ)); await pg.goto(url); await pg.waitForTimeout(800); return pg; };
  const open = (pg, n) => pg.evaluate(async n => { await openProject(n); await new Promise(r => setTimeout(r, 300)); return { tamper: TAMPER, clt: CLT }; }, n);
  const exportFile = async (pg, keepLog) => { const [dl] = await Promise.all([pg.waitForEvent('download'), pg.evaluate(k => {
    document.querySelector('[data-m="export"]').click(); document.querySelector('#exlog').checked = k; document.querySelector('[data-d="ok"]').click(); }, keepLog)]);
    return { name: dl.suggestedFilename(), text: fs.readFileSync(await dl.path(), 'utf8') }; };

  // computer A: demo checklist with an attached image, everything checked and signed, some log entries
  let pg = await page({}, prof('a'.repeat(32)));
  await pg.evaluate(() => document.querySelector('[data-m="demo"]').click()); await pg.waitForTimeout(1500);
  const used = await pg.evaluate(() => {
    const st = S.sections[1].cards[0].steps[0]; MEDIA.img1 = { name: 'photo.png', type: 'image/png', data: 'data:image/png;base64,' + 'A'.repeat(50000) }; st.media.push({ id: 'img1', kind: 'file', name: 'photo.png' });
    S.sections.forEach(s => s.cards.forEach(c => [c, ...c.steps].forEach(x => { x.done = true; x.init = 'AB'; x.doneAt = now(); x.sig = { by: 'A', at: now() }; x.hist.push({ ev: 'x' }); })));
    logEv('checked', st, 'Foreman', 'u1'); return pack(); });
  const U = JSON.parse(used);
  assert(U.stamp && U.stamp.pid === 'a'.repeat(32), 'normal save carries the profile stamp');

  // export without log
  let ex = JSON.parse((await exportFile(pg, false)).text);
  assert(!ex.stamp && ex.log.length === 0 && !ex.segs && !ex.ids, 'export drops stamp, log, segments, ids');
  assert(!items(ex).some(x => x.done || x.init || x.sig || x.doneAt || x.hist.length), 'export has nothing checked');
  assert.deepStrictEqual(ex.files, U.files, 'images identical'); assert(ex.files.img1.data.length > 50000);
  assert(ex.pdfs.length === U.pdfs.length && ex.pdfs.every((p, i) => p.data === U.pdfs[i].data && p.data.length > 1000), 'PDFs identical');
  assert(await pg.evaluate(() => S.sections[0].cards[0].done), 'the open checklist itself is unchanged');
  const shared = JSON.stringify(ex);

  // plain copy: per-checklist E-4420 on another profile and on a fresh install; export opens clean on both
  for (const integ of [prof('b'.repeat(32)), NONE]) {
    pg = await page({ 'plain.bcl': used, 'shared.bcl': shared }, integ);
    assert.deepStrictEqual(await open(pg, 'plain'), { tamper: null, clt: 'E-4420' }, 'plain copy flags only that checklist');
    assert.deepStrictEqual(await open(pg, 'shared'), { tamper: null, clt: null }, 'export opens without error');
  }

  // damaged profile: app locked, but the checklist opens and exports with its log
  pg = await page({ 'shop.bcl': used }, TAMPERED);
  assert.strictEqual((await open(pg, 'shop')).tamper, 'E-4417');
  ex = JSON.parse((await exportFile(pg, true)).text);
  assert(!ex.stamp && !ex.ids && !items(ex).some(x => x.done), 'recovery export is clean');
  assert(ex.log.some(e => e.by === 'Foreman') && ex.log.at(-1).ev === 'Exported as a fresh copy', 'old log kept under an export marker');
  pg = await page({ 'shop.bcl': JSON.stringify(ex) }, NONE);
  assert.deepStrictEqual(await open(pg, 'shop'), { tamper: null, clt: null }, 'recovery export works in a new install');
  assert(!(await pg.evaluate(() => isLocked())), 'and is editable');

  // wrong PINs: hint at 5, 20-minute wait at 15, E-4419 at 100
  pg = await page({ 'shop.bcl': used }, prof('a'.repeat(32)));
  await open(pg, 'shop');
  const tryPin = async pin => pg.evaluate(async pin => { const ov = [...document.querySelectorAll('.overlay')].pop(); ov.querySelector('input').value = pin; ov.querySelector('[data-k=ok]').click();
    await new Promise(r => setTimeout(r, 60)); const o = [...document.querySelectorAll('.overlay')].pop(); return o && o.querySelector('.warn') ? o.querySelector('.warn').textContent : ''; }, pin);
  await pg.evaluate(() => { window.__res = 'pending'; askPin({ title: 'Test' }).then(w => window.__res = w ? w.name : null); });
  let msg; for (let i = 1; i <= 4; i++) msg = await tryPin('0000');
  assert.strictEqual(msg, 'Wrong PIN.');
  msg = await tryPin('0000'); assert(/5 in a row.*Forgot PIN/.test(msg), 'hint after 5: ' + msg);
  for (let i = 6; i <= 15; i++) msg = await tryPin('0000');
  assert(/Try again in 20:00/.test(msg), '20-minute wait at 15: ' + msg);
  msg = await tryPin('1234'); assert(/Try again in/.test(msg), 'even the right PIN waits');
  await pg.evaluate(() => { window.__L.until = 0; });
  await pg.evaluate(async () => { [...document.querySelectorAll('.overlay')].pop().querySelector('[data-k=x]').click(); });
  await pg.evaluate(() => { askPin({ title: 'Test' }).then(w => window.__res = w ? w.name : null); });
  await tryPin('1234'); assert.strictEqual(await pg.evaluate(() => window.__res), 'A', 'right PIN accepted after the wait');
  assert.strictEqual(await pg.evaluate(() => window.__L.fails), 0, 'right PIN resets the count');
  await pg.evaluate(() => { window.__L.fails = 99; askPin({ title: 'Test' }).then(w => window.__res = w); });
  await tryPin('0000');
  assert.strictEqual(await pg.evaluate(() => TAMPER), 'E-4419', '100th wrong PIN locks the app');
  assert(await pg.evaluate(() => !!document.querySelector('.errov')), 'error pop-up shown');
  // E-4419 is view-only like a tampered profile: no checking, no editing, but export still works
  await pg.evaluate(() => document.querySelectorAll('.errov').forEach(x => x.remove()));
  assert(await pg.evaluate(() => isLocked() && !!errNow()), 'view-only');
  const before = await pg.evaluate(() => S.sections[0].cards[0].steps[0].done);
  await pg.evaluate(() => { const c = document.querySelector('#left input[type=checkbox][data-a]') || document.querySelector('input[type=checkbox][data-a]'); if (c) c.click(); });
  assert.strictEqual(await pg.evaluate(() => S.sections[0].cards[0].steps[0].done), before, 'checkbox does nothing');
  await pg.evaluate(() => document.querySelectorAll('.errov').forEach(x => x.remove()));
  ex = JSON.parse((await exportFile(pg, true)).text);
  assert(!ex.stamp && !items(ex).some(x => x.done) && ex.pdfs[0].data.length > 1000, 'export works under E-4419');

  // foreman during a 20-minute wait: recovery code opens the Profile page without changing the main PIN, then Set PIN for an employee
  pg = await page({}, prof('a'.repeat(32)));
  await pg.evaluate(() => { window.__L.fails = 15; window.__L.until = Date.now() + 1200000; PR.people = [{ id: 'p1', name: 'Joe', salt: '00'.repeat(16), hash: '55'.repeat(32), boss: false }]; showProfile(true); });
  await pg.evaluate(async () => { $('#pe').value = '1234'; document.querySelector('[data-p=unlock]').click(); await new Promise(r => setTimeout(r, 100)); });
  assert(/Try again in .*recovery code/.test(await pg.evaluate(() => $('#perr').textContent)), 'main PIN waits too, with a pointer to the recovery code');
  await pg.evaluate(async () => { document.querySelector('[data-p=forgot]').click(); await new Promise(r => setTimeout(r, 50)); $('#rc').value = 'GOOD'; document.querySelector('[data-p=recover]').click(); await new Promise(r => setTimeout(r, 200)); });
  assert.deepStrictEqual(await pg.evaluate(() => ({ PU, hash: PR.hash, fails: window.__L.fails, until: window.__L.until })), { PU: true, hash: '11'.repeat(32), fails: 0, until: 0 }, 'unlocked, main PIN kept, wait cleared');
  await pg.evaluate(async () => { document.querySelector('[data-pf=names]') && !PR.req.names && document.querySelector('[data-pf=names]').click(); await new Promise(r => setTimeout(r, 100));
    document.querySelector('[data-rp="0"]').value = '7777'; document.querySelector('[data-p=repin][data-i="0"]').click(); await new Promise(r => setTimeout(r, 200)); });
  assert.notStrictEqual(await pg.evaluate(() => PR.people[0].hash), '55'.repeat(32), 'employee PIN changed');
  assert.strictEqual(await pg.evaluate(() => PR.people[0].id), 'p1', 'same employee ID');

  // Forgot PIN without an error: recovery code -> new PIN, same profile and roster
  pg = await page({}, prof('a'.repeat(32)));
  await pg.evaluate(async () => { PR.people = [{ id: 'p1', name: 'Joe', salt: '00'.repeat(16), hash: '55'.repeat(32), boss: false }]; showProfile(true); });
  assert(await pg.evaluate(() => !!document.querySelector('[data-p=forgot]')), 'Forgot PIN button on the PIN page');
  await pg.evaluate(() => document.querySelector('[data-p=forgot]').click()); await pg.waitForTimeout(100);
  await pg.evaluate(async () => { $('#rc').value = 'WRONG'; $('#pp').value = $('#pp2').value = '43210'; document.querySelector('[data-p=recover]').click(); await new Promise(r => setTimeout(r, 100)); });
  assert(/does not match/.test(await pg.evaluate(() => $('#perr').textContent)), 'wrong recovery code refused');
  await pg.evaluate(async () => { $('#rc').value = 'GOOD'; $('#pp').value = $('#pp2').value = '43210'; document.querySelector('[data-p=recover]').click(); await new Promise(r => setTimeout(r, 200)); });
  assert.deepStrictEqual(await pg.evaluate(() => ({ pid: PR.pid, people: PR.people.length, unlocked: PU })), { pid: 'a'.repeat(32), people: 1, unlocked: true }, 'same profile, roster kept');

  // main PIN 5-8 digits, employees exactly 4; entry boxes do not show the length
  pg = await page({}, prof('a'.repeat(32)));
  await pg.evaluate(() => { askPin({ title: 'Test' }).then(w => window.__res = w ? w.name : null); });
  assert(await pg.evaluate(() => { const o = [...document.querySelectorAll('.overlay')].pop(); return !/4-digit/.test(o.textContent) && o.querySelector('input').maxLength === 8; }), 'PIN pop-up hides the length');
  await tryPin('24680'); assert.strictEqual(await pg.evaluate(() => window.__res), 'A', '5-digit PIN accepted in the pop-up');
  await pg.evaluate(async () => { showProfile(true); $('#pe').value = '1234'; document.querySelector('[data-p=unlock]').click(); await new Promise(r => setTimeout(r, 100)); });
  assert(await pg.evaluate(() => !!document.querySelector('[data-p=setmain]')), 'old 4-digit main PIN must be replaced first');
  const setMain = pin => pg.evaluate(async pin => { $('#pp').value = $('#pp2').value = pin; document.querySelector('[data-p=setmain]').click(); await new Promise(r => setTimeout(r, 150)); return ($('#perr') || {}).textContent || ''; }, pin);
  assert(/5 to 8 digits/.test(await setMain('1111')), '4 digits refused for the main PIN');
  await setMain('24680'); assert(await pg.evaluate(() => !document.querySelector('[data-p=setmain]') && PU), 'new main PIN saved, page open');
  await pg.evaluate(async () => { if (!PR.req.names) document.querySelector('[data-pf=names]').click(); await new Promise(r => setTimeout(r, 100)); $('#nn').value = 'Sam'; $('#np').value = '12345'; document.querySelector('[data-p=add]').click(); await new Promise(r => setTimeout(r, 100)); });
  assert(await pg.evaluate(() => $('#np').maxLength === 4 && !PR.people.some(p => p.name === 'Sam')), 'employee PIN box takes 4 digits only');
  pg = await page({}, NONE);
  await pg.evaluate(async () => { showProfile(true); $('#pu').value = 'Boss'; $('#pp').value = $('#pp2').value = '1234'; document.querySelector('[data-p=create]').click(); await new Promise(r => setTimeout(r, 100)); });
  assert(/5 to 8 digits/.test(await pg.evaluate(() => $('#perr').textContent)) && !(await pg.evaluate(() => PR.pid)), 'new profile needs a 5-digit main PIN');

  // every PIN prompt takes the 5-digit main PIN and a 4-digit employee PIN
  const strict = { ...prof('a'.repeat(32)) }; strict.body = { ...strict.body, req: { names: true, sign: true, edit: true }, people: [{ id: 'p1', name: 'Joe', salt: '00'.repeat(16), hash: '55'.repeat(32), boss: false }] };
  pg = await page({ 'shop.bcl': used.replace(/"done":true/g, '"done":false') }, strict);
  await open(pg, 'shop');
  const prompt = async (trigger, pin) => { await pg.evaluate(trigger); await pg.waitForTimeout(80); const t = await pg.evaluate(() => { const o = [...document.querySelectorAll('.overlay')].pop(); return o ? o.querySelector('b').textContent : ''; }); await tryPin(pin); await pg.waitForTimeout(80); return t; };
  const box = (s, c, j) => `document.querySelector('.row[data-s="${s}"][data-c="${c}"]${j == null ? ':not([data-j])' : `[data-j="${j}"]`} input[data-a=done]')`;
  assert.strictEqual(await prompt(() => document.querySelector('#lockBtn').click(), '24680'), 'Unlock editing');
  assert(await pg.evaluate(() => EDITOK && EDITOK.name === 'A'), 'unlock editing with the 5-digit main PIN');
  await pg.evaluate(() => { const t = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === S.sections[1].title); t && t.click(); });
  const steps = await pg.evaluate(() => S.sections[1].cards[0].steps.length);
  for (let j = 0; j < steps; j++) assert.strictEqual(await prompt(new Function(`const c=${box(1, 0, j)};c.click()`), '1357'), 'Sign this step');
  assert(await pg.evaluate(() => S.sections[1].cards[0].steps.every(x => x.done && x.init === 'Joe')), 'steps signed with the 4-digit employee PIN');
  assert.strictEqual(await prompt(new Function(`${box(1, 0)}.click()`), '24680'), 'Sign off this item');
  assert(await pg.evaluate(() => S.sections[1].cards[0].done && S.sections[1].cards[0].sig.by === 'A'), 'item signed off with the 5-digit main PIN');
  assert.strictEqual(await prompt(() => { document.querySelector('[data-m="uncheck"]').click(); document.querySelector('#modal [data-d=ok]').click(); }, '24680'), 'Uncheck everything');
  assert(await pg.evaluate(() => !S.sections[1].cards[0].done), 'uncheck everything with the 5-digit main PIN');
  await pg.evaluate(() => { S.locked = true; openSettings(); });
  assert.strictEqual(await prompt(() => { const c = $('#lockc'); c.checked = false; c.dispatchEvent(new Event('change', { bubbles: true })); }, '24680'), 'Turn off the master file lock');
  assert(await pg.evaluate(() => !S.locked), 'master lock off with the 5-digit main PIN');

  // activity log behind a main/Boss PIN when the switch is on; a plain employee PIN is refused
  await pg.evaluate(async () => { EDITOK = null; PR.req.log = true; PR.people[0].boss = false; document.querySelector('[data-m="log"]').click(); await new Promise(r => setTimeout(r, 80)); });
  assert(!(await pg.evaluate(() => !!document.querySelector('.logov'))), 'log hidden until a PIN is entered');
  assert(/Only the main profile or a Boss/.test(await tryPin('1357')), 'employee PIN refused');
  await tryPin('24680'); await pg.waitForTimeout(100);
  assert(await pg.evaluate(() => !!document.querySelector('.logov')), 'log shown after a Boss/main PIN');
  await pg.evaluate(async () => { document.querySelectorAll('.logov').forEach(x => x.remove()); PR.people[0].boss = true; document.querySelector('[data-m="log"]').click(); await new Promise(r => setTimeout(r, 80)); });
  await tryPin('1357'); await pg.waitForTimeout(100);
  assert(await pg.evaluate(() => !!document.querySelector('.logov')), 'a Boss employee can view the log');
  await pg.evaluate(async () => { document.querySelectorAll('.logov').forEach(x => x.remove()); await openHome(); HS = 'shop'; renderHome(); document.querySelector('button[data-a=logv]').click(); await new Promise(r => setTimeout(r, 80)); });
  assert(await pg.evaluate(() => !document.querySelector('.logov') && !!document.querySelector('.overlay input.pin')), 'main menu LOG button asks too');

  // adopt from the saved list: flagged row, explanation, Boss PIN, stamp + log written, images and PDFs kept
  pg = await page({ 'mine.bcl': used, 'theirs.bcl': used.replace(/"stamp":\{"pid":"a{32}"/, '"stamp":{"pid":"' + 'b'.repeat(32) + '"'), 'shared.bcl': shared }, prof('a'.repeat(32)));
  await pg.evaluate(() => openHome()); await pg.waitForTimeout(200);
  assert.deepStrictEqual(await pg.evaluate(() => [...document.querySelectorAll('#flist .frow.adopt')].map(r => r.dataset.id)), ['theirs'], 'only the other profile\'s checklist is flagged');
  await pg.evaluate(() => document.querySelector('#flist .frow.adopt .adq').click());
  assert(/different profile/.test(await pg.evaluate(() => $('#modal').textContent)), 'explanation shown');
  await pg.evaluate(() => document.querySelector('#modal [data-d=ok]').click()); await pg.waitForTimeout(50);
  await tryPin('24680'); await pg.waitForTimeout(200);
  const ad = await pg.evaluate(async () => ({ list: [...document.querySelectorAll('#flist .frow.adopt')].length, file: await window.fsapi.read('theirs.bcl') }));
  const ao = JSON.parse(ad.file);
  assert.strictEqual(ad.list, 0, 'flag gone after adopting');
  assert.strictEqual(ao.stamp.pid, 'a'.repeat(32)); assert(/adopted by "A"/.test(ao.log.at(-1).ev) && ao.log.at(-1).by === 'A', 'log records who adopted it');
  assert.deepStrictEqual(ao.files, U.files); assert.strictEqual(ao.pdfs[0].data, U.pdfs[0].data);
  assert.deepStrictEqual(await open(pg, 'theirs'), { tamper: null, clt: null }, 'opens without E-4420 afterwards');

  await b.close();
  assert.deepStrictEqual(errors, [], 'no page errors');
  console.log('All page tests passed');
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
