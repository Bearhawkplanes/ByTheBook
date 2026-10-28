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
  const page = async (files, integ, extra) => { const ctx = await b.newContext({ acceptDownloads: true }), pg = await ctx.newPage();
    pg.on('pageerror', e => errors.push(e.message)); await pg.addInitScript(stub(files, integ)); if (extra) await extra(pg); await pg.goto(url); await pg.waitForTimeout(800); return pg; };
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

  // ---- video ----
  // the test browser has no H.264, so a WebM stands in for the user's video and for ffmpeg's clips
  const os = require('os'), { execFileSync } = require('child_process'), vdir = fs.mkdtempSync(path.join(os.tmpdir(), 'bcl-vid-')), VIDF = path.join(vdir, 'walk.webm'), CLIPF = path.join(vdir, 'clip.webm');
  execFileSync(require('ffmpeg-static'), ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=320x180:rate=25:duration=30', '-f', 'lavfi', '-i', 'sine=duration=30', '-c:v', 'libvpx', '-b:v', '200k', '-deadline', 'realtime', '-c:a', 'libopus', '-shortest', VIDF]);
  execFileSync(require('ffmpeg-static'), ['-y', '-v', 'error', '-ss', '12', '-i', VIDF, '-t', '3', '-c', 'copy', CLIPF]);
  const vidBytes = [...fs.readFileSync(VIDF)], clipBytes = [...fs.readFileSync(CLIPF)];
  const vstub = async pg => { await pg.clock.install(); await pg.addInitScript(([V, vb, cb]) => { const f = window.fsapi; window.__calls = [];
    f.videoPick = async () => ({ path: V, rel: '', name: 'Engine walkaround', size: vb.length, mtime: 1, maxCopy: 300 * 1048576 });
    f.videoInfo = async v => ({ exists: v.path === V, url: 'file://' + V, size: vb.length, mtime: 1 });
    f.videoRead = async () => new Uint8Array(vb);
    f.videoTemp = async () => ({ path: '/tmp/copy.bin' });
    f.videoThumb = async () => 'data:image/jpeg;base64,/9j/thumb';
    f.clipMake = async (src, a, b) => { window.__calls.push(['clipMake', src, a, b]); return { id: 'abcdef0123456789', audio: true, sizes: { native: { with: 2400000, without: 2200000 }, medium: { with: 900000, without: 800000 }, low: { with: 310000, without: 240000 } } }; };
    f.clipRead = async (id, q, snd) => { window.__calls.push(['clipRead', q, snd]); return new Uint8Array(cb); };
    f.clipDone = async id => { window.__calls.push(['clipDone', id]); return true; }; f.clipCancel = async () => true; }, [VIDF, vidBytes, clipBytes]); };
  pg = await page({ 'shop.bcl': shared }, prof('a'.repeat(32)), vstub);
  await open(pg, 'shop');
  await pg.evaluate(() => { select(S.sections[1].cards[0].steps[0]); $('#vidBtn').click(); $('#vpadd').click(); });
  await pg.waitForTimeout(100); await pg.evaluate(() => $('#vaLink').click()); await pg.waitForTimeout(800);
  assert.deepStrictEqual(await pg.evaluate(() => ({ n: S.videos.length, link: !!S.videos[0].link, dur: Math.round(vpDur()) })), { n: 1, link: true, dur: 30 }, 'linked video added and playing in the player');
  // Select Timestamps: handles at the ends; clicking the bar seeks but never moves them; typed times move them
  assert(await pg.evaluate(() => $('#vpselrow').hidden && getComputedStyle($('#hA')).display === 'none'), 'selection hidden until toggled');
  await pg.evaluate(() => $('#vpsel').click());
  assert.deepStrictEqual(await pg.evaluate(() => [VP.a, Math.round(VP.b), getComputedStyle($('#hA')).display !== 'none']), [0, 30, true], 'handles appear at the ends');
  const tlBox = await pg.evaluate(() => { const r = $('#tl').getBoundingClientRect(); return { x: r.left, y: r.top + r.height / 2, w: r.width }; });
  await pg.mouse.click(tlBox.x + tlBox.w * 0.5, tlBox.y); await pg.waitForTimeout(100);
  assert.deepStrictEqual(await pg.evaluate(() => [Math.round(vv().currentTime), VP.a, Math.round(VP.b)]), [15, 0, 30], 'click on the bar skips there, handles stay');
  await pg.evaluate(() => { $('#ta').value = '0:12'; $('#ta').dispatchEvent(new Event('change')); $('#tb').value = '15.5'; $('#tb').dispatchEvent(new Event('change')); });
  assert.deepStrictEqual(await pg.evaluate(() => [VP.a, VP.b, $('#ta').value, $('#tb').value]), [12, 15.5, '0:12.0', '0:15.5'], 'typed times move the handles and show in the boxes');
  const hB = await pg.evaluate(() => { const r = $('#hB').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  await pg.mouse.move(hB.x, hB.y); await pg.mouse.down(); await pg.mouse.move(tlBox.x + tlBox.w * 0.6, hB.y, { steps: 4 }); await pg.mouse.up();
  assert.strictEqual(await pg.evaluate(() => Math.round(VP.b)), 18, 'dragging the end handle moves it');
  assert.strictEqual(await pg.evaluate(() => $('#tb').value), '0:18.0', 'box shows the dragged time');
  assert.strictEqual(await pg.evaluate(() => Math.round(vv().currentTime)), 15, 'dragging a handle does not move the playhead');
  // Assign > Call to timestamps
  await pg.evaluate(() => { $('#ta').value = '12'; $('#ta').dispatchEvent(new Event('change')); $('#tb').value = '15'; $('#tb').dispatchEvent(new Event('change')); $('#vpas').click(); });
  assert(/won't function properly/.test(await pg.evaluate(() => $('#modal').textContent)) && /increase the file size/.test(await pg.evaluate(() => $('#modal').textContent)), 'both warnings shown');
  await pg.evaluate(() => ($('#asRef').click(), document.querySelector('#pk .pkgo').click())); await pg.waitForTimeout(1500);
  const ref = await pg.evaluate(() => { const m = S.sections[1].cards[0].steps[0].media.at(-1); return { kind: m.kind, start: m.start, end: m.end, thumb: /^data:image\/jpeg/.test(m.thumb) }; });
  assert.deepStrictEqual(ref, { kind: 'vref', start: 12, end: 15, thumb: true }, 'linked clip with a thumbnail');
  // Assign > Install selection: three sizes, sound box, chosen quality installed into the checklist
  await pg.evaluate(() => { $('#vpas').click(); $('#asIn').click(); document.querySelector('#pk .pkgo').click(); }); await pg.waitForTimeout(800);
  assert.deepStrictEqual(await pg.evaluate(() => [...document.querySelectorAll('#iw .iwz')].map(x => x.textContent)), ['2.3 MB', '879 KB', '303 KB'], 'exact sizes with sound');
  await pg.evaluate(() => { $('#iwsnd').click(); });
  assert.deepStrictEqual(await pg.evaluate(() => [...document.querySelectorAll('#iw .iwz')].map(x => x.textContent)), ['2.1 MB', '781 KB', '234 KB'], 'sizes without sound');
  await pg.evaluate(() => { document.querySelector('#iw input[value=low]').click(); document.querySelector('#iw [data-iw=ok]').click(); }); await pg.waitForTimeout(1500);
  const inst = await pg.evaluate(() => { const m = S.sections[1].cards[0].steps[0].media.at(-1); return { kind: m.kind, type: m.type, clip: m.clip, inMedia: !!MEDIA[m.id], calls: window.__calls.map(c => c[0] + ':' + (c[1] && c[1].path ? 'src' : c[1]) + ':' + (c[2] ?? '') + (c[3] != null ? ':' + c[3] : '')) }; });
  assert.deepStrictEqual(inst, { kind: 'file', type: 'video', clip: { start: 12, end: 15, q: 'low', sound: false }, inMedia: true, calls: ['clipMake:src:12:15', 'clipRead:low:false', 'clipDone:abcdef0123456789:'] }, 'installed clip at Low without sound');
  assert(await pg.evaluate(() => $('#iw').hidden), 'install window closed');
  // Images tab: thumbnails only until clicked; stays loaded while on the item and for a minute after
  await pg.evaluate(() => { vpClose(); setTab('img'); IM.mode = 'stack'; renderR(); });
  assert.deepStrictEqual(await pg.evaluate(() => [document.querySelectorAll('#p-img .vth').length, document.querySelectorAll('#p-img video').length, document.querySelectorAll('#p-img .vth img').length]), [2, 0, 2], 'two clips shown as thumbnails, no video loaded');
  await pg.evaluate(() => document.querySelectorAll('#p-img .vth')[0].click()); await pg.waitForTimeout(800);
  const ld = await pg.evaluate(() => [document.querySelectorAll('#p-img video').length, Object.keys(VEL).length, document.querySelector('#p-img video').currentTime]);
  assert(ld[0] === 1 && ld[1] === 1 && ld[2] >= 12 && ld[2] <= 15, 'clicked clip loads and plays inside 12-15 s: ' + ld);
  await pg.evaluate(() => { renderR(); });
  assert.strictEqual(await pg.evaluate(() => document.querySelectorAll('#p-img video').length), 1, 'still loaded after the pane redraws');
  await pg.evaluate(() => select(S.sections[1].cards[0].steps[1]));
  assert(await pg.evaluate(() => Object.values(VEL)[0].el.paused && Object.keys(VEL).length === 1), 'paused but kept after clicking off');
  await pg.clock.fastForward(30000);
  await pg.evaluate(() => select(S.sections[1].cards[0].steps[0]));
  assert.strictEqual(await pg.evaluate(() => document.querySelectorAll('#p-img video').length), 1, 'back within a minute: still loaded');
  await pg.evaluate(() => select(S.sections[1].cards[0].steps[1])); await pg.clock.fastForward(61000); await pg.waitForTimeout(50);
  assert.strictEqual(await pg.evaluate(() => Object.keys(VEL).length), 0, 'released a minute after leaving the item');
  // saved and reopened: the installed clip travels in the file, the linked one keeps its link
  const saved = await pg.evaluate(() => pack());
  const SV = JSON.parse(saved), clipM = SV.sections[1].cards[0].steps[0].media.find(m => m.kind === 'file' && m.type === 'video');
  assert(SV.files[clipM.id] && SV.files[clipM.id].data.startsWith('data:video/mp4;base64,'), 'installed clip saved inside the checklist');
  assert(SV.videos[0].link && !SV.videos[0].data, 'linked video not copied');
  // step picker: preselects the current step, click selects with a green button beside it, a click elsewhere clears it, search, tabs, keys
  await pg.evaluate(() => { select(S.sections[0].cards[0].steps[1]); PKLAST = null; $('#vidBtn').click(); }); await pg.waitForTimeout(800);
  await pg.evaluate(() => { $('#vpsel').click(); $('#vpas').click(); $('#asRef').click(); });
  const pk = () => pg.evaluate(() => { const on = document.querySelector('#pk .pkr.on'); return on ? { text: on.querySelector('.pkt').textContent, btn: !!on.querySelector('.pkgo'), buttons: document.querySelectorAll('#pk .pkgo').length } : null; });
  assert.deepStrictEqual(await pk(), { text: await pg.evaluate(() => S.sections[0].cards[0].steps[1].text), btn: true, buttons: 1 }, 'current step preselected, Assign button on its row');
  const rowText = (si, ci, j) => pg.evaluate(([si, ci, j]) => { const c = S.sections[si].cards[ci]; return j == null ? c.text : c.steps[j].text; }, [si, ci, j]);
  const clickRow = t => pg.evaluate(t => [...document.querySelectorAll('#pk .pkr')].find(r => r.querySelector('.pkt').textContent === t).click(), t);
  const t2 = await rowText(1, 0, 2); await clickRow(t2);
  assert.deepStrictEqual(await pk(), { text: t2, btn: true, buttons: 1 }, 'clicking another row moves the selection and the button');
  await pg.evaluate(() => document.querySelector('#pk .dh b').click());
  assert.strictEqual(await pk(), null, 'a click outside the list clears the selection');
  await pg.evaluate(() => { $('#pkq').value = 'sealant'; $('#pkq').dispatchEvent(new Event('input')); });
  const found = await pg.evaluate(() => [...document.querySelectorAll('#pk .pkr:not([hidden]):not(.ctx) .pkt')].map(x => x.textContent));
  assert(found.length >= 1 && found.every(t => /sealant/i.test(t)) && /match/.test(await pg.evaluate(() => $('#pkcount').textContent)), 'search shows only matching steps: ' + found);
  await pg.evaluate(() => { $('#pkq').value = ''; $('#pkq').dispatchEvent(new Event('input')); document.querySelector('#pk [data-pks="1"]').click(); });
  assert(await pg.evaluate(() => { const h = document.querySelector('#pk .pksec[data-si="1"]'), l = $('#pklist'); return Math.abs(h.getBoundingClientRect().top - l.getBoundingClientRect().top) < 4; }), 'section tab jumps to that section');
  await pg.keyboard.press('ArrowDown'); await pg.keyboard.press('ArrowDown');
  const viaKeys = (await pk()).text; await pg.keyboard.press('Enter'); await pg.waitForTimeout(400);
  const target = await pg.evaluate(t => { for (const s of S.sections) for (const c of s.cards) for (const x of [c, ...c.steps]) if (x.text === t) return x.media.filter(m => m.kind === 'vref').length; }, viaKeys);
  assert(target === 1 && await pg.evaluate(() => $('#pk').hidden && PV3), 'arrow keys and Enter assign it; the player stays open');
  await pg.evaluate(() => { $('#vpas').click(); $('#asRef').click(); });
  assert.strictEqual((await pk()).text, viaKeys, 'next time it starts on the step assigned last');
  await pg.keyboard.press('Escape');
  assert(await pg.evaluate(() => $('#pk').hidden && PV3), 'Esc closes the picker only');
  await pg.evaluate(() => vpClose());

  // a video added on a step's Images tab opens the Video Player; the picker then starts on that step
  await pg.evaluate(() => { window.fsapi.pathOf = () => window.__vidPath; window.fsapi.videoStat = async p => p ? { path: p, rel: '', name: 'Gear swing', size: 5000, mtime: 1, maxCopy: 300 * 1048576 } : null; });
  await pg.evaluate(p => { window.__vidPath = p; select(S.sections[2].cards[0].steps[0]); setTab('img'); renderR(); }, VIDF);
  const vBefore = await pg.evaluate(() => S.videos.length), mBefore = await pg.evaluate(() => S.sections[2].cards[0].steps[0].media.length);
  await pg.setInputFiles('#mfile', VIDF); await pg.waitForTimeout(300);
  assert(await pg.evaluate(() => PV3 && /Gear swing/.test($('#modal').textContent)), 'player opens and asks import or link');
  await pg.evaluate(() => $('#vaLink').click()); await pg.waitForTimeout(800);
  assert.deepStrictEqual(await pg.evaluate(() => [S.videos.length, vp(VP.id).name, S.sections[2].cards[0].steps[0].media.length]), [vBefore + 1, 'Gear swing', mBefore], 'video added to the player, not copied onto the step');
  await pg.evaluate(() => { $('#vpsel').click(); $('#vpas').click(); $('#asRef').click(); });
  assert.strictEqual(await pg.evaluate(() => document.querySelector('#pk .pkr.on .pkt').textContent), await pg.evaluate(() => S.sections[2].cards[0].steps[0].text), 'picker starts on the step the video was added from');
  await pg.keyboard.press('Escape'); await pg.evaluate(() => vpClose());

  // Import the entire video: copied into the file and playable after reopening
  pg = await page({ 'shop.bcl': shared }, prof('a'.repeat(32)), vstub);
  await open(pg, 'shop');
  await pg.evaluate(() => { $('#vidBtn').click(); $('#vpadd').click(); }); await pg.waitForTimeout(100); await pg.evaluate(() => $('#vaCopy').click()); await pg.waitForTimeout(1200);
  const copied = await pg.evaluate(async () => { const t = await pack(); return { t, dur: Math.round(vpDur()) }; });
  const CV = JSON.parse(copied.t);
  assert(copied.dur === 30 && !CV.videos[0].link && CV.videos[0].data.length > 100000, 'whole video copied into the checklist');
  pg = await page({ 'copy.bcl': copied.t }, prof('a'.repeat(32)), vstub);
  await open(pg, 'copy');
  assert(await pg.evaluate(() => VIDS[S.videos[0].id] && !VIDS[S.videos[0].id].blob), 'not decoded when the checklist opens');
  await pg.evaluate(() => $('#vidBtn').click()); await pg.waitForTimeout(1200);
  assert.strictEqual(await pg.evaluate(() => Math.round(vpDur())), 30, 'copied video plays after reopening');
  await pg.evaluate(() => vpClose());
  assert(await pg.evaluate(() => !VIDS[S.videos[0].id].blob), 'decoded copy dropped when the player closes');
  // a video added on the Images tab: copied in whole, with a thumbnail made from the file
  await pg.evaluate(async vb => { select(S.sections[0].cards[0].steps[0]); await attach(new Blob([new Uint8Array(vb)], { type: 'video/webm' }), 'walk.webm', 'video/webm'); await new Promise(r => setTimeout(r, 1500)); }, clipBytes);
  assert(await pg.evaluate(() => { const m = S.sections[0].cards[0].steps[0].media.at(-1); return m.type === 'video' && /^data:image\/jpeg/.test(m.thumb) && !!MEDIA[m.id]; }), 'attached video gets a thumbnail');
  fs.rmSync(vdir, { recursive: true, force: true });

  // ---- drawing on images ----
  pg = await page({ 'shop.bcl': shared }, prof('a'.repeat(32)));
  await open(pg, 'shop');
  await pg.evaluate(async () => { const c = document.createElement('canvas'); c.width = 800; c.height = 600; const g = c.getContext('2d'); g.fillStyle = '#888'; g.fillRect(0, 0, 800, 600);
    const blob = await new Promise(r => c.toBlob(r, 'image/png')); select(S.sections[1].cards[0].steps[1]); setTab('img'); IM.mode = 'fit'; await attach(blob, 'flange.png', 'image/png'); await new Promise(r => setTimeout(r, 200)); });
  const plainSrc = await pg.evaluate(() => document.querySelector('#p-img img[data-mid]').src);
  assert(await pg.evaluate(() => !!document.querySelector('#p-img [data-a=draw]') && !document.querySelector('#p-img [data-a=dvis]')), 'pencil shown; no eye until there is a drawing');
  await pg.evaluate(() => document.querySelector('#p-img [data-a=draw]').click()); await pg.waitForTimeout(300);
  assert(await pg.evaluate(() => { const b = [...document.querySelectorAll('.dwbar button')]; return b[0].textContent === 'Apply' && b[1].textContent === 'Cancel'; }), 'Apply and Cancel first, top left');
  const cvb = await pg.evaluate(() => { const r = $('#dwcv').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
  const stroke = async (x1, y1, x2, y2) => { await pg.mouse.move(cvb.x + cvb.w * x1, cvb.y + cvb.h * y1); await pg.mouse.down(); await pg.mouse.move(cvb.x + cvb.w * x2, cvb.y + cvb.h * y2, { steps: 8 }); await pg.mouse.up(); };
  await stroke(.1, .1, .9, .9); await stroke(.9, .1, .1, .9);
  const btn = k => pg.evaluate(k => document.querySelector(`[data-dw=${k}]`).click(), k);
  const pix = () => pg.evaluate(() => { const g = $('#dwcv').getContext('2d'), c = $('#dwcv'); return [...g.getImageData(c.width / 2, c.height / 2, 1, 1).data].slice(0, 3).join(); });
  assert.notStrictEqual(await pix(), '136,136,136', 'stroke drawn on the canvas');
  await btn('un'); await btn('un'); assert.strictEqual(await pix(), '136,136,136', 'undo removes both strokes');
  await btn('re'); assert.notStrictEqual(await pix(), '136,136,136', 'redo brings one back');
  await btn('re'); await btn('clr'); assert.strictEqual(await pix(), '136,136,136', 'trash clears the drawing');
  await btn('un'); assert.notStrictEqual(await pix(), '136,136,136', 'and can be undone');
  await btn('no');
  assert(await pg.evaluate(() => $('#dw').hidden && !S.sections[1].cards[0].steps[1].media.at(-1).draw), 'Cancel keeps nothing');
  await pg.evaluate(() => document.querySelector('#p-img [data-a=draw]').click()); await pg.waitForTimeout(300);
  await pg.evaluate(() => { document.querySelector('[data-dw=col]').click(); document.querySelector('[data-dc="#1e88ff"]').click(); $('#dwsz').value = 20; $('#dwsz').dispatchEvent(new Event('input')); });
  await stroke(.2, .5, .8, .5); await btn('ok'); await pg.waitForTimeout(400);
  const dm = await pg.evaluate(() => { const m = S.sections[1].cards[0].steps[1].media.at(-1); return { draw: m.draw, src: document.querySelector('#p-img img[data-mid]').src, eye: document.querySelector('#p-img [data-a=dvis]') }; });
  assert(dm.draw.w === 800 && dm.draw.s.length === 1 && dm.draw.s[0].c === '#1e88ff' && JSON.stringify(dm.draw).length < 2000, 'drawing stored as one small stroke list');
  assert.notStrictEqual(dm.src, plainSrc, 'the Images tab shows the drawn-over picture');
  assert.strictEqual(await pg.evaluate(() => document.querySelector('#p-img [data-a=dvis]').title), 'Toggle visibility');
  await pg.evaluate(() => document.querySelector('#p-img [data-a=dvis]').click()); await pg.waitForTimeout(300);
  assert.strictEqual(await pg.evaluate(() => document.querySelector('#p-img img[data-mid]').src), plainSrc, 'eye hides the drawing');
  const eyes = await pg.evaluate(() => document.querySelector('#p-img [data-a=dvis]').innerHTML);
  await pg.evaluate(() => document.querySelector('#p-img [data-a=dvis]').click()); await pg.waitForTimeout(300);
  assert(await pg.evaluate(() => document.querySelector('#p-img img[data-mid]').src) !== plainSrc && eyes !== await pg.evaluate(() => document.querySelector('#p-img [data-a=dvis]').innerHTML), 'eye shows it again, with the other icon');
  const drawn = JSON.parse(await pg.evaluate(() => pack()));
  assert.deepStrictEqual(drawn.sections[1].cards[0].steps[1].media.at(-1).draw, dm.draw, 'drawing saved in the file');
  const ex2 = JSON.parse(await pg.evaluate(() => pack(null, blankCopy(false))));
  assert.deepStrictEqual(ex2.sections[1].cards[0].steps[1].media.at(-1).draw, dm.draw, 'and kept by Export for sharing');
  // reopen later: the drawing comes back in the editor and can be deleted
  pg = await page({ 'drawn.bcl': JSON.stringify(drawn) }, prof('a'.repeat(32)));
  await open(pg, 'drawn');
  await pg.evaluate(() => { select(S.sections[1].cards[0].steps[1]); setTab('img'); IM.mode = 'fit'; IM.i = S.sections[1].cards[0].steps[1].media.length - 1; renderR(); }); await pg.waitForTimeout(300);
  await pg.evaluate(() => document.querySelector('#p-img [data-a=draw]').click()); await pg.waitForTimeout(300);
  assert.notStrictEqual(await pix(), '136,136,136', 'saved drawing shown in the editor');
  await btn('clr'); await btn('ok'); await pg.waitForTimeout(300);
  assert(await pg.evaluate(() => !S.sections[1].cards[0].steps[1].media.at(-1).draw && !document.querySelector('#p-img [data-a=dvis]')), 'drawing deleted, eye gone');
  // ---- text on images: typed on the image itself; tools on the side; leaving the step applies it ----
  const tx = () => pg.evaluate(() => { const r = $('#txl').getBoundingClientRect(); return { x: r.left, y: r.top, k: r.width / 800, w: r.width, h: r.height }; });
  await pg.evaluate(() => document.querySelector('#p-img [data-a=text]').click()); await pg.waitForTimeout(300);
  let L0 = await tx();
  assert(await pg.evaluate(() => TX && TX.tool === 'new' && [...document.querySelectorAll('.txside button')].map(b => b.dataset.tt).join() === 'sel,move,new' && !!$('#txdel') && !document.querySelector('#p-img .fit [data-a=mdel]')), 'side tools, Delete text top right, no image delete button');
  assert.strictEqual(await pg.evaluate(() => getComputedStyle($('#txl')).cursor), 'text', 'text cursor over the image when adding text');
  const mi = () => S.sections[1].cards[0].steps[1].media.at(-1);
  await pg.mouse.click(L0.x + 100 * L0.k, L0.y + 100 * L0.k); await pg.keyboard.type('Bolt 1');
  await pg.keyboard.press('ArrowRight'); await pg.keyboard.press('ArrowLeft');
  assert.deepStrictEqual(await pg.evaluate(() => [TX.mid === S.sections[1].cards[0].steps[1].media.at(-1).id, document.activeElement.classList.contains('txb')]), [true, true], 'arrow keys move the caret, not to another image');
  await pg.evaluate(() => { $('#txf').value = 'Barlow'; $('#txf').dispatchEvent(new Event('change', { bubbles: true })); $('#txs').value = '50'; $('#txs').dispatchEvent(new Event('change', { bubbles: true })); $('#txb').click(); document.querySelector('[data-tc="#1e88ff"]').click(); });
  let t0 = await pg.evaluate(() => S.sections[1].cards[0].steps[1].media.at(-1).text[0]);
  assert(t0.t === 'Bolt 1' && t0.f === 'Barlow' && t0.s === 40 && t0.b === true && t0.c === '#1e88ff', 'font, size, bold and colour apply to the selected text: ' + JSON.stringify(t0));
  await pg.mouse.click(L0.x + 400 * L0.k, L0.y + 400 * L0.k); await pg.keyboard.type('Bolt 2');
  await pg.mouse.click(L0.x + 600 * L0.k, L0.y + 100 * L0.k);   // a third box left empty
  assert.strictEqual(await pg.evaluate(() => S.sections[1].cards[0].steps[1].media.at(-1).text.length), 3);
  assert.deepStrictEqual(await pg.evaluate(async () => { await Promise.all(TFONTS.flatMap(f => [400, 700].map(w => document.fonts.load(`${w} 20px "${f}"`)))); return TFONTS.filter(f => !document.fonts.check(`700 20px "${f}"`) || ![...document.fonts].some(ff => ff.family.replace(/"/g, '') === f && ff.status === 'loaded')); }), [], 'all six built-in fonts load from the app');
  // Select: click a text and type in it
  await pg.evaluate(() => document.querySelector('[data-tt=sel]').click());
  const b1 = await pg.evaluate(() => { const r = document.querySelector('#txl .txb[data-i="0"]').getBoundingClientRect(); return [r.right - 2, r.top + r.height / 2]; });
  await pg.mouse.click(...b1); await pg.keyboard.press('End'); await pg.keyboard.type('A');
  assert.strictEqual(await pg.evaluate(() => S.sections[1].cards[0].steps[1].media.at(-1).text[0].t), 'Bolt 1A', 'edit text in place');
  await pg.mouse.click(L0.x + 700 * L0.k, L0.y + 550 * L0.k);
  assert.strictEqual(await pg.evaluate(() => S.sections[1].cards[0].steps[1].media.at(-1).text.length), 3, 'Select tool: clicking the image does not add text');
  // Move: drag a text; cross-arrow cursor
  await pg.evaluate(() => document.querySelector('[data-tt=move]').click());
  assert.strictEqual(await pg.evaluate(() => getComputedStyle(document.querySelector('#txl .txb')).cursor), 'move', 'move cursor on texts');
  const b2 = await pg.evaluate(() => { const r = document.querySelector('#txl .txb[data-i="1"]').getBoundingClientRect(); return [r.left + 5, r.top + 5]; });
  const p0 = await pg.evaluate(() => { const t = S.sections[1].cards[0].steps[1].media.at(-1).text[1]; return [t.x, t.y]; });
  await pg.mouse.move(...b2); await pg.mouse.down(); await pg.mouse.move(b2[0] + 100 * L0.k, b2[1] + 50 * L0.k, { steps: 5 }); await pg.mouse.up();
  const p1 = await pg.evaluate(() => { const t = S.sections[1].cards[0].steps[1].media.at(-1).text[1]; return [t.x, t.y]; });
  assert(Math.abs(p1[0] - p0[0] - 100) < 3 && Math.abs(p1[1] - p0[1] - 50) < 3 && await pg.evaluate(() => S.sections[1].cards[0].steps[1].media.at(-1).text[1].t) === 'Bolt 2', 'dragged 100,50 image pixels: ' + p0 + ' -> ' + p1);
  // Delete text removes the selected box
  await pg.evaluate(() => document.querySelector('[data-tt=sel]').click());
  await pg.mouse.click(...await pg.evaluate(() => { const r = document.querySelector('#txl .txb[data-i="1"]').getBoundingClientRect(); return [r.left + 5, r.top + r.height / 2]; }));
  await pg.evaluate(() => $('#txdel').click());
  assert.deepStrictEqual(await pg.evaluate(() => S.sections[1].cards[0].steps[1].media.at(-1).text.map(t => t.t)), ['Bolt 1A', ''], 'Delete text removed Bolt 2');
  // clicking outside the image is normal app use; leaving the step applies the text and drops empty boxes
  await pg.evaluate(() => $('#sel').click());
  assert(await pg.evaluate(() => !!TX), 'clicking elsewhere on the page keeps text mode');
  await pg.evaluate(() => { select(S.sections[1].cards[0].steps[0]); select(S.sections[1].cards[0].steps[1]); }); await pg.waitForTimeout(400);
  assert.deepStrictEqual(await pg.evaluate(() => [TX, S.sections[1].cards[0].steps[1].media.at(-1).text.map(t => t.t)]), [null, ['Bolt 1A']], 'leaving the step applied it; the empty box was dropped');
  const withText = await pg.evaluate(() => document.querySelector('#p-img img[data-mid]').src);
  const plain2 = await pg.evaluate(() => urls[S.sections[1].cards[0].steps[1].media.at(-1).id]);
  assert.notStrictEqual(withText, plain2, 'text drawn into the shown picture');
  await pg.evaluate(() => document.querySelector('#p-img [data-a=dvis]').click()); await pg.waitForTimeout(300);
  assert.strictEqual(await pg.evaluate(() => document.querySelector('#p-img img[data-mid]').src), plain2, 'eye hides text too');
  await pg.evaluate(() => document.querySelector('#p-img [data-a=dvis]').click());
  assert.deepStrictEqual(JSON.parse(await pg.evaluate(() => pack())).sections[1].cards[0].steps[1].media.at(-1).text.map(t => t.t), ['Bolt 1A'], 'text saved in the file');
  await pg.evaluate(() => { S.locked = true; refreshAll(); renderR(); });
  assert(await pg.evaluate(() => getComputedStyle(document.querySelector('#p-img [data-a=draw]')).display === 'none' && getComputedStyle(document.querySelector('#p-img [data-a=text]')).display === 'none'), 'pencil and text buttons hidden while editing is locked');

  await b.close();
  assert.deepStrictEqual(errors, [], 'no page errors');
  console.log('All page tests passed');
})().catch(e => { console.error('FAILED:', e.message, (e.stack || '').split('\n').filter(l => l.includes('page-test.js')).slice(0, 2).join(' | ')); process.exit(1); });
