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
 window.fsapi = { dir: () => ok('/saves'), list: () => ok(Object.keys(F).map(f => ({ name: f.replace(/\\.bcl$/, ''), mtime: Date.now(), pid: pidOf(F[f]), locked: /"locked":true/.test(F[f].slice(0, 400)) }))),
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
  appVersion: () => ok(window.__appv || '0.5.0'),
  saveFile: (o, d) => { window.__saved = { o, d: typeof d === 'string' ? d : Array.from(d) }; return ok('/exports/' + o.name); },
  pdfMake: (d, o) => { (window.__pdfCalls = window.__pdfCalls || []).push({ d, o }); return ok({ pages: window.__pdfPages || 0, pdf: new Uint8Array(window.__pdfBytes || []) }); },
  onFlush: () => {}, onOpen: () => {} }; })()`;
const items = o => o.sections.flatMap(s => s.cards.flatMap(c => [c, ...c.steps]));

(async () => {
  const b = await chromium.launch(), errors = [];
  const page = async (files, integ, extra) => { const ctx = await b.newContext({ acceptDownloads: true }), pg = await ctx.newPage();
    pg.on('pageerror', e => errors.push(e.message)); await pg.addInitScript(stub(files, integ)); if (extra) await extra(pg); await pg.goto(url); await pg.waitForTimeout(800); return pg; };
  const open = (pg, n) => pg.evaluate(async n => { await openProject(n); await new Promise(r => setTimeout(r, 300)); return { tamper: TAMPER, clt: CLT }; }, n);
  // Menu > Export… > Fresh copy > Export…: the Save dialog is stubbed (window.__saved)
  const exportFile = async (pg, keepLog) => { await pg.evaluate(async k => { window.__saved = null; document.querySelector('[data-m="export"]').click(); document.querySelector('#xp [data-xk=fresh]').click();
    document.querySelector('#exlog').checked = k; document.querySelector('#xpgo').click(); for (let i = 0; i < 100 && !window.__saved; i++) await new Promise(r => setTimeout(r, 30)); }, keepLog);
    return pg.evaluate(() => ({ name: window.__saved.o.name, text: window.__saved.d })); };

  // computer A: demo checklist with an attached image, everything checked and signed, some log entries
  let pg = await page({}, prof('a'.repeat(32)));
  await pg.evaluate(() => $('#hDemo').click()); await pg.waitForTimeout(1500);
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

  // ---- updates: bar at the bottom of the menu page ----
  const ustub = (st, extra) => async pg => { await pg.addInitScript(([st, extra]) => { const f = window.fsapi, U = window.__U = Object.assign({ auto: false, skip: '', snooze: 0, last: 0, found: null, version: '0.5.0', canInstall: true }, st); window.__opened = []; window.__ucalls = [];
    window.open = u => { window.__opened.push(u); return null; };
    f.updGet = async () => JSON.parse(JSON.stringify(U)); f.updSet = async p => { window.__ucalls.push(['set', p]); Object.assign(U, p); return true; };
    f.updCheck = async force => { window.__ucalls.push(['check', force]); return force ? (U.found || { none: true }) : null; };
    f.updDownload = async () => { window.__ucalls.push(['download']); window.__prog && [.3, .7, 1].forEach(v => window.__prog(v)); return { ok: true }; };
    f.updInstall = async () => { window.__ucalls.push(['install']); return true; }; f.onUpdProgress = cb => { window.__prog = cb; }; Object.assign(window, extra || {}); }, [st, extra]); };
  const relF = { version: '0.6.0', url: 'https://github.com/Bearhawkplanes/Build-Checklist/releases/tag/v0.6.0', notes: 'x', asset: { name: 'ByTheBook.exe' } };
  pg = await page({ 'shop.bcl': shared }, prof('a'.repeat(32)), ustub({ found: relF }));
  await pg.evaluate(() => updRefresh(false)); await pg.waitForTimeout(100);
  const bar = () => pg.evaluate(() => ({ shown: !$('#updbar').hidden, text: $('#updbar').innerText.replace(/\s+/g, ' ').trim() }));
  let ub = await bar();
  assert(ub.shown && /Version 0\.6\.0 is available \(you have 0\.5\.0\) What's new\?/.test(ub.text) && /Install Dismiss Skip this version/.test(ub.text), 'bar on the menu page: ' + ub.text);
  assert(await pg.evaluate(() => { const r = $('#updbar').getBoundingClientRect(); return Math.abs(r.bottom - innerHeight) < 2 && r.width >= innerWidth - 2; }), 'full width along the bottom');
  assert.strictEqual(await pg.evaluate(() => Math.round($('#hleft').getBoundingClientRect().width)), 300, 'the Saved checklists panel keeps its width');
  await pg.evaluate(() => document.querySelector('[data-u=new]').click());
  assert.deepStrictEqual(await pg.evaluate(() => window.__opened), [relF.url], "What's new? opens the release page");
  await pg.evaluate(() => document.querySelector('[data-u=later]').click()); await pg.waitForTimeout(50);
  const sn = await pg.evaluate(() => ({ hidden: $('#updbar').hidden, snooze: window.__U.snooze }));
  const mid = new Date(); mid.setHours(24, 0, 0, 0);
  assert(sn.hidden && sn.snooze === mid.getTime(), 'Dismiss hides it until tomorrow');
  await pg.evaluate(() => updRefresh(false)); assert(!(await bar()).shown, 'still hidden today');
  await pg.evaluate(() => { window.__U.snooze = Date.now() - 1; return updRefresh(false); }); assert((await bar()).shown, 'back the next day');
  await pg.evaluate(() => document.querySelector('[data-u=skip]').click()); await pg.waitForTimeout(50);
  assert(!(await bar()).shown && await pg.evaluate(() => window.__U.skip) === '0.6.0', 'Skip this version');
  await pg.evaluate(() => updRefresh(false)); assert(!(await bar()).shown, 'skipped version stays hidden');
  await pg.evaluate(() => { window.__U.found = { ...window.__U.found, version: '0.7.0' }; return updRefresh(false); }); assert((await bar()).shown, 'a newer version shows again');
  // Install: confirm, download with progress, save the open checklist, restart
  await open(pg, 'shop'); await pg.evaluate(() => { S.name = S.name; DIRTY = true; openHome(); }); await pg.waitForTimeout(100);
  await pg.evaluate(() => document.querySelector('[data-u=inst]').click());
  assert(/closes and opens again on the new version/.test(await pg.evaluate(() => $('#modal').textContent)) && /safety copy of all your checklists/.test(await pg.evaluate(() => $('#modal').textContent)), 'asks first, mentions the safety copy');
  await pg.evaluate(() => document.querySelector('#modal [data-d=ok]').click()); await pg.waitForTimeout(200);
  assert.deepStrictEqual(await pg.evaluate(() => window.__ucalls.filter(c => c[0] !== 'set' && c[0] !== 'check').map(c => c[0])), ['download', 'install'], 'downloaded, then installed');
  assert(await pg.evaluate(() => /Restarting/.test($('#updbar').innerText) && !DIRTY), 'saved before restarting');
  // a failed install: the error says nothing was changed
  const ufail = await pg.evaluate(async () => { window.fsapi.updInstall = async () => { throw new Error('Error invoking remote method: Error: disk on fire') }; document.querySelector('[data-u=inst]').click(); document.querySelector('#modal [data-d=ok]').click(); await new Promise(r => setTimeout(r, 200)); return $('#updbar').innerText; });
  assert(/Update failed: disk on fire Nothing was changed: your checklists are safe\./.test(ufail.replace(/\s+/g, ' ')), 'failed update reassures: ' + ufail);
  // after an update the helper had to roll back: a notice on the next start, with where the safety copy is
  pg = await page({}, prof('a'.repeat(32)), ustub({ failed: { from: '0.5.0', to: '0.6.0', error: 'The new version closed before it finished starting', back: true, safe: 'D:\\Shop\\Saves\\Backups before updates\\2026-11-03 10-00 before 0.6.0' } }, { __seen: 0 }));
  const fd = await pg.evaluate(async () => { let seen = 0, opened = ''; window.fsapi.updFailedSeen = async () => { seen++; return true }; window.fsapi.updSafeOpen = async p => { opened = p }; await updRefresh(false);
    const t = $('#modal').innerText; $('#ufsafe').click(); document.querySelector('#modal [data-d=ok]').click(); return { t, seen, opened, closed: $('#modal').hidden }; });
  assert(/could not be finished/.test(fd.t) && /put the previous version \(0\.5\.0\) back/.test(fd.t) && /Your checklists were not touched/.test(fd.t) && /before 0\.6\.0/.test(fd.t) && /closed before it finished starting/.test(fd.t), 'rollback notice: ' + fd.t);
  assert(fd.seen === 1 && /before 0\.6\.0$/.test(fd.opened) && fd.closed, 'opens the safety copy; OK clears the notice: ' + JSON.stringify(fd));
  // no in-place install possible (e.g. a Mac): the button opens the download page
  pg = await page({}, prof('a'.repeat(32)), ustub({ found: relF, canInstall: false }));
  await pg.evaluate(() => updRefresh(false)); await pg.waitForTimeout(50);
  assert.strictEqual(await pg.evaluate(() => document.querySelector('[data-u=inst]').textContent), 'Download');
  await pg.evaluate(() => document.querySelector('[data-u=inst]').click());
  assert.deepStrictEqual(await pg.evaluate(() => [window.__opened, window.__ucalls.filter(c => c[0] === 'download').length]), [[relF.url], 0], 'Download opens the page');
  // Settings: version shown, automatic checks off by default, Check now
  pg = await page({ 'shop.bcl': shared }, prof('a'.repeat(32)), ustub({}));
  await open(pg, 'shop'); await pg.evaluate(() => { updRefresh(false); }); await pg.waitForTimeout(50); await pg.evaluate(() => openSettings());
  assert(await pg.evaluate(() => /This is version 0\.5\.0/.test($('#modal').textContent) && !$('#updauto').checked), 'version shown; automatic checks off');
  await pg.evaluate(() => { $('#updauto').checked = true; $('#updauto').dispatchEvent(new Event('change', { bubbles: true })); }); await pg.waitForTimeout(50);
  assert.strictEqual(await pg.evaluate(() => window.__U.auto), true, 'switch saved');
  await pg.evaluate(() => document.querySelector('[data-up=now]').click()); await pg.waitForTimeout(100);
  assert.strictEqual(await pg.evaluate(() => $('#updmsg').textContent), 'You have the latest version.');
  // ---- a checklist saved by a newer version opens view-only and is never saved here ----
  const newerFile = JSON.stringify(Object.assign(JSON.parse(shared), { app: '9.1.0', futureThing: { keep: 1 } }));
  pg = await page({ 'new.bcl': newerFile, 'old.bcl': shared }, prof('a'.repeat(32)));
  assert.deepStrictEqual(await open(pg, 'new'), { tamper: null, clt: null });
  assert(await pg.evaluate(() => errNow() === 'E-4421' && isLocked() && /saved by version 9\.1\.0; this app is version 0\.5\.0/.test(document.querySelector('.errov').textContent)), 'view-only with an explanation');
  await pg.evaluate(async () => { document.querySelectorAll('.errov').forEach(x => x.remove()); S.sections[0].cards[0].text = 'changed'; save(); DIRTY = true; await flush(); await new Promise(r => setTimeout(r, 100)); });
  assert.strictEqual(await pg.evaluate(async () => await window.fsapi.read('new.bcl')), newerFile, 'the file is never written');
  await open(pg, 'old');
  assert(await pg.evaluate(async () => { DIRTY = true; await flush(); return JSON.parse(await window.fsapi.read('old.bcl')).app === '0.5.0' && !errNow(); }), 'normal files are saved with this version');

  // ---- big photos are shrunk when added (setting on by default) ----
  pg = await page({ 'shop.bcl': shared }, prof('a'.repeat(32)));
  await open(pg, 'shop');
  const shr = await pg.evaluate(async () => { const c = document.createElement('canvas'); c.width = 4000; c.height = 3000; const g = c.getContext('2d'), d = g.createImageData(4000, 3000); for (let i = 0; i < d.data.length; i += 4) { d.data[i] = (i * 7) % 255; d.data[i + 1] = Math.random() * 255; d.data[i + 2] = (i >> 9) % 255; d.data[i + 3] = 255; } g.putImageData(d, 0, 0);
    const big = await new Promise(r => c.toBlob(r, 'image/jpeg', .95)); select(S.sections[0].cards[0].steps[0]); await attach(big, 'phone.jpg', 'image/jpeg');
    const m = SEL.media.at(-1), r = MEDIA[m.id], bm = await createImageBitmap(r.blob); const res = { before: big.size, after: r.blob.size, w: bm.width, h: bm.height, type: r.type };
    AS.shrink = false; await attach(big, 'phone2.jpg', 'image/jpeg'); res.off = MEDIA[SEL.media.at(-1).id].blob.size; return res; });
  assert(shr.w === 2560 && shr.h === 1920 && shr.after < shr.before / 2 && shr.type === 'image/jpeg', 'a 4000x3000 photo is stored at 2560x1920 and much smaller: ' + JSON.stringify(shr));
  assert.strictEqual(shr.off, shr.before, 'with the setting off the original is kept');

  // ---- storage bar and the limit per checklist ----
  await pg.evaluate(() => openSettings()); await pg.waitForTimeout(200);
  const st1 = await pg.evaluate(() => ({ txt: $('#sttxt').textContent, w: parseFloat($('#stfill').style.width), note: $('#modal').textContent }));
  assert(/^[\d.]+ (KB|MB) of 2 GB used/.test(st1.txt) && st1.w > 0 && /hard limit of 2 GB/.test(st1.note) && /Performance may drop as it fills up/.test(st1.note), 'storage bar with numbers and the note: ' + st1.txt);
  await pg.evaluate(() => { closeDlg(); CAP = 3 * 1048576; openSettings(); }); await pg.waitForTimeout(200);
  assert(await pg.evaluate(() => $('#stfill').classList.contains('hi') || parseFloat($('#stfill').style.width) > 0), 'bar fills as the limit gets close');
  const mCount = await pg.evaluate(() => SEL.media.length);
  await pg.evaluate(async () => { closeDlg(); const c = document.createElement('canvas'); c.width = 3000; c.height = 2000; const g = c.getContext('2d'), d = g.createImageData(3000, 2000); for (let i = 0; i < d.data.length; i++) d.data[i] = Math.random() * 255; g.putImageData(d, 0, 0);
    AS.shrink = false; await attach(await new Promise(r => c.toBlob(r, 'image/png')), 'huge.png', 'image/png'); });
  assert(await pg.evaluate(n => SEL.media.length === n && /Not enough room in this checklist/.test($('#toast').textContent), mCount), 'adding past the limit is refused with an explanation');
  await pg.evaluate(() => { CAP = 2 * 1073741824; AS.shrink = true; });

  // ---- Start a new job from this checklist ----
  pg = await page({ 'Engine.bcl': used }, prof('a'.repeat(32)));
  await open(pg, 'Engine');
  await pg.evaluate(() => { S.locked = true; document.querySelector('[data-m="newjob"]').click(); });
  assert.strictEqual(await pg.evaluate(() => $('#njn').value), 'Engine - new job', 'suggests a name');
  await pg.evaluate(() => { $('#njn').value = 'Engine SN 1042'; document.querySelector('#modal [data-d=ok]').click(); }); await pg.waitForTimeout(1200);
  const job = await pg.evaluate(async () => ({ cur: CUR, j: JSON.parse(await window.fsapi.read('Engine SN 1042.bcl')), orig: JSON.parse(await window.fsapi.read('Engine.bcl')) }));
  assert.strictEqual(job.cur, 'Engine SN 1042', 'the new job opens');
  assert(!items(job.j).some(x => x.done || x.init || x.sig) && items(job.orig).some(x => x.done), 'nothing checked in the job; the original keeps its progress');
  assert.deepStrictEqual(job.j.files, job.orig.files, 'same images'); assert.strictEqual(job.j.pdfs[0].data, job.orig.pdfs[0].data, 'same PDFs');
  assert(job.j.log.length === 1 && /New job started/.test(job.j.log[0].ev) && /Engine/.test(job.j.log[0].item) && job.j.locked === true, 'log starts fresh with where it came from; a master lock stays');
  assert(await pg.evaluate(() => LIB.some(x => x.id === 'Engine SN 1042')), 'listed in Saved checklists');

  // ---- printable checklist: the layout rules (print.html) ----
  const pp = await (await b.newContext()).newPage(); pp.on('pageerror', e => errors.push('print.html: ' + e.message));
  await pp.goto('file://' + path.join(__dirname, '..', 'print.html'));
  const st = (n, extra) => Object.assign({ text: 'Step ' + n, page: '4-' + n }, extra || {});
  const PD = { name: 'Frame kit', manual: 'Manual rev C', printed: '28 Oct 2026', version: '0.5.0', sections: [
    { title: 'Prep', sign: false, cards: [{ text: 'Tools', page: '1', steps: [st(1), st(2), st(3)] }] },
    { title: 'Left side', sign: true, cards: Array.from({ length: 6 }, (_, i) => ({ text: 'Item ' + (i + 1), page: '5-' + i, steps: Array.from({ length: 5 }, (_, j) => st(j + 1, { qty: '12', size: 'M6 x 20', spec: '25 in-lb' })) })) },
    { title: 'Left side', sign: false, cards: [{ text: 'Very long item', steps: Array.from({ length: 70 }, (_, j) => st(j + 1)) }] },
    { title: 'Empty', sign: true, cards: [] }] };
  const all = { paper: 'Letter', contents: true, qty: true, spec: true, itemSign: true, secEnd: true };
  const lay = o => pp.evaluate(async ([D, o]) => { const n = await render(D, o); return { n, pages: [...document.querySelectorAll('.page')].map(p => ({ sec: p.querySelector('h1').textContent, si: p.dataset.si, tp: p.querySelector('.tp').textContent, sp: (p.querySelector('.sp') || {}).textContent || '',
    items: [...p.querySelectorAll('tr.item')].map(r => r.children[2].textContent), steps: p.querySelectorAll('tbody tr:not(.item):not(.so)').length, so: p.querySelectorAll('tr.so').length, end: !!p.querySelector('.secend'), cols: [...p.querySelectorAll('thead th')].map(t => t.textContent),
    fits: p.querySelector('.body').scrollHeight <= p.querySelector('.body').clientHeight + 1, w: Math.round(p.getBoundingClientRect().width), h: Math.round(p.getBoundingClientRect().height) })), toc: [...document.querySelectorAll('.toc tr')].map(r => r.textContent) }; }, [PD, o]);
  let L1 = await lay(all);
  assert.strictEqual(L1.pages[0].sec, 'Contents', 'contents page first');
  assert(L1.pages.every((p, i) => p.tp === `Page ${i + 1} of ${L1.n}`), 'every page says Page x of N');
  assert(L1.pages.every(p => p.fits), 'nothing runs off a page');
  const secs = L1.pages.slice(1);
  assert(secs.every(p => p.si != null && /: page \d+ of \d+$/.test(p.sp)), 'every page names its section and its page in that section');
  const lw = secs.filter(p => p.si === '1');
  assert(lw.length >= 2 && lw.every((p, i) => p.sp === `Left side: page ${i + 1} of ${lw.length}`), 'multi-page section counted on its own: ' + lw.map(p => p.sp));
  assert(secs.filter(p => p.si === '2').every(p => p.sp.startsWith('Left side: page')) && secs.filter(p => p.si === '2')[0].sp.endsWith('page 1 of ' + secs.filter(p => p.si === '2').length), 'a second section with the same name has its own count');
  const itemPages = {}; secs.forEach((p, i) => p.items.forEach(t => (itemPages[p.si + t] = itemPages[p.si + t] || []).push(i)));
  assert(Object.entries(itemPages).filter(([k]) => k.startsWith('1')).every(([, v]) => v.length === 1), 'items that fit are never split across pages');
  const longP = secs.filter(p => p.si === '2');
  assert(longP.length >= 2 && longP.slice(1).every(p => p.items[0] === 'Very long item (continued)'), 'an item longer than a page continues, marked (continued)');
  assert.strictEqual(longP.reduce((a, p) => a + p.steps, 0), 70, 'all 70 steps printed once');
  assert.strictEqual(lw.reduce((a, p) => a + p.so, 0), 6, 'item sign-off line under each item in a sign-off section');
  assert.strictEqual(secs.filter(p => p.si === '0').reduce((a, p) => a + p.so, 0), 0, 'none in a section without sign-off');
  assert.deepStrictEqual([0, 1, 2, 3].map(si => secs.filter(p => p.si === String(si)).filter(p => p.end).length), [1, 1, 1, 1], 'one section-complete box per section, at its end');
  assert(secs.filter(p => p.si === '3').length === 1, 'empty section still gets its page');
  assert.deepStrictEqual(L1.pages[1].cols, ['Done', 'No.', 'Step', 'Qty / size', 'Values', 'Ref. page', 'Init.', 'Date'], 'general wording by default');
  const gen = await pp.evaluate(() => ({ fields: [...document.querySelectorAll('.fields div')].map(d => d.textContent), toc: document.querySelector('.toc').textContent, legend: document.querySelector('.legend').textContent }));
  assert(gen.fields.join() === 'Name,Started,Completed' && !/inspector|technician/i.test(gen.toc + gen.legend), 'no mechanics words unless switched on: ' + JSON.stringify(gen));
  const mech = await pp.evaluate(async D => { await render(Object.assign({}, D, { mech: true }), { paper: 'Letter', contents: true, qty: true, spec: true, itemSign: true, secEnd: true }); return { fields: [...document.querySelectorAll('.fields div')].map(d => d.textContent), cols: [...document.querySelectorAll('.page:nth-child(2) thead th')].map(t => t.textContent), toc: document.querySelector('.toc').textContent }; }, PD);
  assert(mech.fields.join() === 'Project,Serial no.,Technician,Inspector,Started,Completed' && mech.cols.includes('Spec') && /inspector sign-off/.test(mech.toc), 'mechanical wording when switched on');
  assert(/Left side\(inspector sign-off\)page 3/.test(L1.toc[1].replace(/\s+/g, '')) || /page 3/.test(L1.toc[1]), 'contents lists where sections start: ' + L1.toc[1]);
  assert.deepStrictEqual([L1.pages[1].w, L1.pages[1].h], [816, 1056], 'Letter is 8.5 x 11 in');
  const L2 = await lay({ paper: 'A4', contents: false, qty: false, spec: false, itemSign: false, secEnd: false });
  assert(L2.pages[0].sec === 'Prep' && L2.pages.every(p => !p.end && !p.so) && L2.pages.every(p => p.fits), 'options switch the extras off');
  assert.deepStrictEqual(L2.pages[0].cols, ['Done', 'No.', 'Step', 'Ref. page', 'Init.', 'Date'], 'columns switch off');
  assert.deepStrictEqual([L2.pages[0].w, L2.pages[0].h], [794, 1123], 'A4 is 210 x 297 mm');
  // a real PDF of it, for the Export window test below
  await pp.evaluate(D => render(D, { paper: 'Letter', contents: true, qty: true, spec: true, itemSign: true, secEnd: true }), PD);
  const PDF = await pp.pdf({ printBackground: true, preferCSSPageSize: true }); assert(PDF.slice(0, 4).toString() === '%PDF');

  // ---- the Export window ----
  pg = await page({ 'shop.bcl': JSON.stringify(Object.assign(JSON.parse(used), { mech: false })) }, prof('a'.repeat(32)), async pg => pg.addInitScript(([b, n]) => { window.__pdfBytes = b; window.__pdfPages = n; }, [Array.from(PDF), L1.n]));
  await open(pg, 'shop');
  await pg.evaluate(() => document.querySelector('[data-m="export"]').click());
  assert.deepStrictEqual(await pg.evaluate(() => [...document.querySelectorAll('#xp .xpl button b')].map(b => b.textContent)), ['Fresh copy', 'Printable checklist'], 'export kinds listed on the left');
  await pg.evaluate(() => document.querySelector('#xp [data-xk=pdf]').click()); await pg.waitForTimeout(1500);
  const call1 = await pg.evaluate(() => window.__pdfCalls.at(-1));
  assert.deepStrictEqual(call1.o, { paper: 'Letter', contents: true, qty: true, spec: true, itemSign: true, secEnd: true }, 'default options');
  assert.strictEqual(call1.d.mech, false, 'a checklist with the switch off prints general wording');
  assert.strictEqual(await pg.evaluate(() => norm({}).mech), false, 'new and older checklists start with it off');
  assert.strictEqual(await pg.evaluate(() => norm(demoData()).mech), true, 'the demo engine build has it on');
  await pg.evaluate(() => { xpClose(); openSettings(); }); assert(await pg.evaluate(() => !$('#mechc').checked), 'Mechanical wording off by default');
  await pg.evaluate(() => { select(S.sections[1].cards[0].steps[0]); setTab('desc'); });
  assert(await pg.evaluate(() => /Values \/ limits/.test($('#p-desc').textContent) && /Ref\. page/.test($('#p-desc').textContent) && !/Torque|Book page/.test($('#p-desc').textContent)), 'general labels in the app');
  await pg.evaluate(() => { const c = $('#mechc'); c.checked = true; c.dispatchEvent(new Event('change', { bubbles: true })); closeDlg(); });
  assert(await pg.evaluate(() => S.mech === true && /Torque \/ stretch \/ limits/.test($('#p-desc').textContent)), 'switch on: mechanical labels');
  assert.strictEqual(JSON.parse(await pg.evaluate(() => pack())).mech, true, 'saved in the checklist');
  await pg.evaluate(() => { document.querySelector('[data-m="export"]').click(); document.querySelector('#xp [data-xk=pdf]').click(); }); await pg.waitForTimeout(800);
  assert(await pg.evaluate(() => window.__pdfCalls.at(-1).d.mech === true && /Spec column/.test($('#xp .xpopts').textContent)), 'and on the printout');
  await pg.evaluate(() => { S.mech = false; xpShow('pdf'); }); await pg.waitForTimeout(800);
  const dItems = call1.d.sections.flatMap(s => s.cards.flatMap(c => [c, ...c.steps]));
  assert(dItems.length > 10 && dItems.every(x => Object.keys(x).every(k => ['text', 'page', 'qty', 'size', 'spec', 'steps'].includes(k))), 'only the checklist goes to the PDF (no images, descriptions or progress)');
  assert(await pg.evaluate(n => document.querySelectorAll('#xppages .xppg').length === n && document.querySelectorAll('#xppages canvas').length >= 1, L1.n), 'preview shows the real PDF pages');
  assert(/^Page 1 of \d+ · Letter$/.test(await pg.evaluate(() => $('#xpinfo').textContent)), 'page indicator');
  await pg.setViewportSize({ width: 860, height: 700 }); await pg.evaluate(() => xpWhere());
  const smallInfo = await pg.evaluate(() => [$('#xpinfo').textContent, $('#xppages').scrollTop, [...$('#xppages').children].map(d => Math.round(d.getBoundingClientRect().top)), Math.round($('#xppages').getBoundingClientRect().top), $('#xppages').clientHeight]);
  assert(/^Page 1 of /.test(smallInfo[0]) && smallInfo[4] < 600, 'small window: the preview scrolls inside the window, and the counter is right: ' + JSON.stringify(smallInfo));
  await pg.setViewportSize({ width: 1280, height: 720 }); await pg.evaluate(() => xpWhere());
  const lay2 = await pg.evaluate(() => { const o = $('#xp .xpopts').getBoundingClientRect(), v = $('#xppages').getBoundingClientRect(), r = $('#xpr').getBoundingClientRect(); return { side: o.right <= v.left, tall: v.height / r.height, boxed: [...document.querySelectorAll('#xp .xpopts input')].every(i => i.closest('label.xpc')) }; });
  assert(lay2.side && lay2.tall > 0.85 && lay2.boxed, 'options in a column beside the preview, which gets the full height; every option boxed with its words: ' + JSON.stringify(lay2));
  await pg.evaluate(() => { $('#xppages').scrollTop = $('#xppages').scrollHeight; $('#xppages').dispatchEvent(new Event('scroll')); }); await pg.waitForTimeout(300);
  assert.strictEqual(await pg.evaluate(() => $('#xpinfo').textContent), `Page ${L1.n} of ${L1.n} · Letter`, 'scrolls through the pages');
  await pg.evaluate(() => { document.querySelector('#xp input[name=xpp][value=A4]').click(); const c = document.querySelector('[data-po=spec]'); c.checked = false; c.dispatchEvent(new Event('change', { bubbles: true })); const s0 = document.querySelector('[data-ps="0"]'); s0.checked = false; s0.dispatchEvent(new Event('change', { bubbles: true })); });
  await pg.waitForTimeout(800);
  const call2 = await pg.evaluate(() => window.__pdfCalls.at(-1));
  assert(call2.o.paper === 'A4' && call2.o.spec === false && call2.d.sections.length === call1.d.sections.length - 1, 'paper, columns and sections change the PDF');
  assert.strictEqual(await pg.evaluate(() => AS.pdf.paper), 'A4', 'settings remembered');
  await pg.evaluate(() => document.querySelector('#xpgo').click()); await pg.waitForTimeout(200);
  const sv = await pg.evaluate(() => window.__saved);
  assert(/ - checklist\.pdf$/.test(sv.o.name) && sv.o.filters[0].extensions[0] === 'pdf' && Buffer.from(sv.d).slice(0, 4).toString() === '%PDF', 'Export opens the Save dialog with the PDF');
  assert(await pg.evaluate(() => $('#xp').hidden), 'window closes after saving');
  await pg.evaluate(() => { document.querySelector('[data-m="export"]').click(); }); await pg.keyboard.press('Escape');
  assert(await pg.evaluate(() => $('#xp').hidden), 'Esc closes it');

  // ---- a master file cannot be deleted: menu item and the home list's Delete are greyed out ----
  pg = await page({ 'shop.bcl': shared, 'other.bcl': shared }, prof('a'.repeat(32)));
  await open(pg, 'shop');
  const md = await pg.evaluate(async () => { $('#menuBtn').click(); const free = $('[data-m=delete]').classList.contains('dis'); $('#menuBtn').click(); S.locked = true; $('#menuBtn').click(); const b = $('[data-m=delete]'); const r = { free, locked: b.classList.contains('dis'), ptr: b.title }; b.click(); r.modal = !$('#modal').hidden; DIRTY = true; await flush(); return r; });
  assert(!md.free && md.locked && /master file/.test(md.ptr) && !md.modal, 'master file: Delete checklist is greyed out and does nothing: ' + JSON.stringify(md));
  const hd = await pg.evaluate(async () => { await openHome(); HS = 'shop'; renderHome(); const r = { locked: $('#hdelb').classList.contains('dis'), why: $('#hdelb').title }; document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete' })); r.modal = !$('#modal').hidden; HS = 'other'; renderHome(); r.other = $('#hdelb').classList.contains('dis'); return r; });
  assert(hd.locked && /master file/.test(hd.why) && !hd.modal && !hd.other, 'home list: a master file cannot be deleted, other checklists can: ' + JSON.stringify(hd));

  // ---- worker mode: menu and Settings behind a main/Boss PIN, editing locked, no leaving the checklist ----
  pg = await page({ 'shop.bcl': shared, 'other.bcl': shared }, prof('a'.repeat(32)));
  await open(pg, 'shop');
  await pg.evaluate(() => { openSettings(); const c = $('#workc'); c.checked = true; c.dispatchEvent(new Event('change', { bubbles: true })); closeDlg(); });
  assert(await pg.evaluate(() => S.worker && isLocked() && S.log.some(l => l.ev === 'worker mode on')), 'worker mode on: editing locked, logged');
  await pg.evaluate(() => { PR.req.names = true; PR.people = [{ id: 'p1', name: 'Joe', salt: '00'.repeat(16), hash: '55'.repeat(32), boss: false }]; $('#menuBtn').click(); }); await pg.waitForTimeout(80);
  const wmen = await pg.evaluate(() => ({ open: !$('#menu').hidden, pin: !!document.querySelector('.overlay input.pin'), on: [...$('#menu').querySelectorAll('button[data-m]')].filter(b => !b.classList.contains('dis') && !b.hidden).map(b => b.dataset.m) }));
  assert(wmen.open && !wmen.pin && wmen.on.join() === 'wunlock,export,save', 'worker menu opens with only Unlock, Export and Save usable: ' + JSON.stringify(wmen));
  await pg.evaluate(() => { const b = $('[data-m=mainmenu]'); b.click(); });
  assert.strictEqual(await pg.evaluate(() => CUR), 'shop', 'greyed-out items do nothing');
  await pg.evaluate(() => $('[data-m=wunlock]').click()); await pg.waitForTimeout(80);
  const wm = await tryPin('1357'); assert(/Only the main profile or a Boss/.test(wm), 'a worker PIN does not unlock it: ' + wm);
  await tryPin('24680'); await pg.waitForTimeout(80);
  assert(await pg.evaluate(() => !$('#menu').hidden && !$('[data-m=mainmenu]').classList.contains('dis') && $('[data-m=wunlock]').hidden && /worker mode/.test($('[data-m=delete]').title)), 'Boss/main PIN unlocks the menu; Delete stays greyed out');
  await pg.evaluate(() => { $('#menu').hidden = true; $('#menuBtn').click(); });
  assert(await pg.evaluate(() => $('[data-m=mainmenu]').classList.contains('dis') && /worker mode/.test($('[data-m=mainmenu]').title)), 'locked again the next time it opens');
  // exporting a fresh copy with the log: the copy's log says it is a copy, the original notes the export
  const wex = await pg.evaluate(async () => { $('[data-m=export]').click(); await new Promise(r => setTimeout(r, 100)); $('#exlog').checked = true; await xpExport(); const d = window.__saved.d, c = JSON.parse(typeof d === 'string' ? d : new TextDecoder().decode(new Uint8Array(d))); return { mark: c.log.at(-1), orig: S.log.at(-1).ev }; });
  assert(wex.mark.ev === 'Exported as a fresh copy' && /This file is a copy of "shop"/.test(wex.mark.item) && wex.orig === 'exported a fresh copy with the log', 'copy\'s log says it is a copy; original logs the export: ' + JSON.stringify(wex));
  await pg.evaluate(() => { $('#menu').hidden = true; document.dispatchEvent(new KeyboardEvent('keydown', { key: 'n', ctrlKey: true })); }); await pg.waitForTimeout(150);
  assert.strictEqual(await pg.evaluate(() => CUR), 'shop', 'Ctrl+N does not leave the checklist');
  await pg.evaluate(() => $('#cog').click()); await pg.waitForTimeout(80);
  assert(await pg.evaluate(() => $('#modal').hidden && !!document.querySelector('.overlay input.pin')), 'Settings asks for a PIN first');
  await tryPin('24680'); await pg.waitForTimeout(80);
  await pg.evaluate(() => { const c = $('#workc'); c.checked = false; c.dispatchEvent(new Event('change', { bubbles: true })); closeDlg(); });
  assert(await pg.evaluate(() => !S.worker && S.log.some(l => l.ev === 'worker mode off' && l.by === 'A')), 'turned off, logged with who unlocked Settings');
  await pg.evaluate(() => $('#menuBtn').click()); await pg.waitForTimeout(80);
  assert(await pg.evaluate(() => !$('#menu').hidden && !document.querySelector('.overlay input.pin')), 'without worker mode the menu opens straight away');

  // ---- work photos: per item / step tab, the Work Photos page by section, full screen with the details ----
  pg = await page({ 'shop.bcl': shared }, prof('a'.repeat(32)));
  await open(pg, 'shop');
  const wphoto = async (pg, n) => pg.evaluate(async n => { const fs = []; for (let i = 0; i < n; i++) { const c = document.createElement('canvas'); c.width = 1600; c.height = 1200; const g = c.getContext('2d'); g.fillStyle = ['#c33', '#3a3', '#36c'][i % 3]; g.fillRect(0, 0, 1600, 1200);
    fs.push(new File([await new Promise(r => c.toBlob(r, 'image/jpeg', .9))], 'work' + i + '.jpg', { type: 'image/jpeg' })); } window.__wpf = fs; }, n);
  await wphoto(pg, 2);
  await pg.evaluate(() => { S.locked = true; select(S.sections[0].cards[0].steps[1]); setTab('wp'); wpAdd(window.__wpf); }); await pg.waitForTimeout(100);
  await pg.evaluate(() => { $('#wpn').value = 'Joe Smith'; document.querySelector('#modal [data-d=ok]').click(); }); await pg.waitForTimeout(600);
  const wone = await pg.evaluate(() => ({ n: SEL.wp.length, by: SEL.wp[0].by, tiles: document.querySelectorAll('#p-wp .wtile').length, imgs: Object.keys(MEDIA).length, log: S.log.filter(l => l.ev === 'work photo added').length, shown: !$('#p-wp').hidden }));
  assert(wone.n === 2 && wone.by === 'Joe Smith' && wone.tiles === 2 && wone.log === 2 && wone.shown, 'two work photos added in a master file, with the name, logged: ' + JSON.stringify(wone));
  await pg.evaluate(async () => { select(S.sections[1].cards[0]); window.__wpf = window.__wpf.slice(0, 1); wpAdd(window.__wpf); await new Promise(r => setTimeout(r, 80)); document.querySelector('#modal [data-d=ok]').click(); }); await pg.waitForTimeout(500);
  // the main item's tab also shows its steps' photos; the Work Photos page groups by section
  const wmain = await pg.evaluate(() => { select(S.sections[0].cards[0]); return document.querySelectorAll('#p-wp .wtile').length; });
  assert.strictEqual(wmain, 2, 'a main item shows its steps\' work photos too');
  await pg.evaluate(() => $('#wpBtn').click()); await pg.waitForTimeout(400);
  const wgi = await pg.evaluate(() => ({ secs: [...document.querySelectorAll('#wgbody .wgsec')].map(x => [x.querySelector('h3').firstChild.textContent.trim(), x.querySelectorAll('.wtile').length]), cap: $('#wgbody .wcap').textContent, main: S.sections[0].cards[0].text, titles: S.sections.slice(0, 2).map(s => s.title), loaded: !!$('#wgbody img').src }));
  assert.deepStrictEqual(wgi.secs, [[wgi.titles[0], 2], [wgi.titles[1], 1]], 'grouped by section');
  assert(wgi.cap === wgi.main && wgi.loaded, 'caption is the main item, previews load: ' + JSON.stringify(wgi));
  await pg.evaluate(() => $('#wgbody .wtile').click()); await pg.waitForTimeout(300);
  const wfi = await pg.evaluate(() => ({ info: $('#wf .wfinfo').textContent, big: (() => { const i = $('#wf img'); return i.naturalWidth; })(), step: S.sections[0].cards[0].steps[1].text }));
  assert(/Logged:/.test(wfi.info) && wfi.info.includes('Section: ' + wgi.titles[0]) && wfi.info.includes('Main item: ' + wgi.main) && wfi.info.includes('Step: ' + wfi.step) && /Added by: Joe Smith/.test(wfi.info) && wfi.big === 1600, 'full screen with date, section, item, step and who: ' + JSON.stringify(wfi));
  await pg.keyboard.press('ArrowRight'); await pg.waitForTimeout(200);
  assert(await pg.evaluate(() => /2 of 3/.test($('#wf .wfinfo').textContent)), 'arrow keys go to the next photo');
  await pg.keyboard.press('Escape'); await pg.keyboard.press('Escape');
  assert(await pg.evaluate(() => !$('#wf') && $('#wg').hidden), 'Esc closes the photo, then the page');
  // saved in the file (photo + preview), loaded again after reopening; signed-off items are locked; a fresh copy has none
  const wsv = await pg.evaluate(async () => { DIRTY = true; await flush(); const o = JSON.parse(await window.fsapi.read('shop.bcl')), p = o.sections[0].cards[0].steps[1].wp[0]; return { files: !!(o.files[p.id] && o.files[p.tid]), by: p.by }; });
  assert(wsv.files && wsv.by === 'Joe Smith', 'photos and previews saved in the checklist file');
  await open(pg, 'shop');
  const wre = await pg.evaluate(async () => { wgOpen(); await new Promise(r => setTimeout(r, 400)); const n = document.querySelectorAll('#wgbody .wtile').length, ok = [...document.querySelectorAll('#wgbody img')].every(i => i.src); wgClose(); return { n, ok }; });
  assert(wre.n === 3 && wre.ok, 'after reopening the Work Photos page shows them all');
  const wlk = await pg.evaluate(async () => { const c = S.sections[0].cards[0]; c.sig = { by: 'Boss', at: now() }; select(c.steps[1]); setTab('wp'); const r = { btn: $('#wpadd').disabled, del: document.querySelectorAll('#p-wp .wdel').length }; await wpDel(c.steps[1], 0); r.n = c.steps[1].wp.length; return r; });
  assert(!wlk.btn && wlk.del === 0 && wlk.n === 2, 'signed off: photos can still be added but not removed: ' + JSON.stringify(wlk));
  await wphoto(pg, 1); await pg.evaluate(async () => { wpAdd(window.__wpf); await new Promise(r => setTimeout(r, 80)); document.querySelector('#modal [data-d=ok]').click(); }); await pg.waitForTimeout(500);
  assert(await pg.evaluate(() => SEL.wp.length === 3 && S.log.at(-1).ev === 'work photo added after sign-off'), 'a photo added after sign-off is kept and logged as such');
  // Jump to: back to the checklist with that step selected and in view
  const wj = await pg.evaluate(async () => { const st = S.sections[0].cards[0].steps[1]; select(S.sections[2].cards[0]); S.sections[0].cards[0].open = false; renderL(); wgOpen(); await new Promise(r => setTimeout(r, 200)); document.querySelector('#wgbody .wtile').click(); await new Promise(r => setTimeout(r, 200));
    document.querySelector('#wf [data-wf=jump]').click(); await new Promise(r => setTimeout(r, 200)); const r = document.querySelector('#L .row.sel'); return { closed: !$('#wf') && $('#wg').hidden, sel: SEL === st, row: r && r.dataset.j === '1' && r.dataset.c === '0', tab: tab, seen: !!r && r.getBoundingClientRect().top > 0 && r.getBoundingClientRect().bottom < innerHeight }; });
  assert(wj.closed && wj.sel && wj.row && wj.tab === 'wp' && wj.seen, 'Jump to selects the step in the checklist: ' + JSON.stringify(wj));
  const wdl = await pg.evaluate(async () => { wgOpen(); await new Promise(r => setTimeout(r, 200)); document.querySelector('#wgbody .wtile').click(); await new Promise(r => setTimeout(r, 200)); window.__saved = null; document.querySelector('#wf [data-wf=dl]').click(); await new Promise(r => setTimeout(r, 400)); const r = { name: window.__saved && window.__saved.o.name, bytes: window.__saved && window.__saved.d.length }; wgClose(); return r; });
  assert(/^work\d\.jpg$/.test(wdl.name) && wdl.bytes > 10000, 'Download… in the full-screen work photo saves the full photo: ' + JSON.stringify(wdl));
  assert(await pg.evaluate(async () => { const o = JSON.parse(await pack(null, blankCopy(false))); return !o.sections.some(s => s.cards.some(c => [c, ...c.steps].some(x => x.wp))) ; }), 'a fresh copy has no work photos');

  // ---- "Saved!" left of the title after a save ----
  pg = await page({ 'shop.bcl': shared }, prof('a'.repeat(32)));
  await open(pg, 'shop');
  const svi = await pg.evaluate(async () => { const s = $('#savedi'); s.classList.remove('on'); S.manual = 'x'; DIRTY = true; await flush(); const t = s.getBoundingClientRect(), h = $('#ptitle').getBoundingClientRect(); await new Promise(r => setTimeout(r, 400));
    return { on: s.classList.contains('on'), op: +getComputedStyle(s).opacity, left: t.right <= h.left || (s.classList.contains('dn') && t.top >= h.bottom - 4), txt: s.textContent }; });
  assert(svi.on && svi.op > .5 && svi.left && svi.txt === 'Saved!', 'Saved! shows left of the title after saving: ' + JSON.stringify(svi));
  assert(await pg.evaluate(() => new Promise(r => setTimeout(() => r(+getComputedStyle($('#savedi')).opacity < .1), 2300))), 'and fades away');

  // ---- a big checklist: only sections near the view are drawn; ticks redraw one item; search and section tabs reach the rest ----
  pg = await page({ 'shop.bcl': shared }, prof('a'.repeat(32)));
  await open(pg, 'shop');
  const big = await pg.evaluate(() => { S.sections = Array.from({ length: 12 }, (_, si) => ({ title: 'Sec ' + si, sign: false, cards: Array.from({ length: 20 }, (_, ci) => mk({ text: 'Item ' + si + '.' + ci, open: true, steps: Array.from({ length: 10 }, (_, j) => mk({ text: (si === 11 && ci === 19 && j === 9 ? 'zebra ' : '') + 'Step ' + j })) })) })); renderL();
    const drawn = document.querySelectorAll('#L .secw[data-on]').length, waiting = document.querySelectorAll('#L .secw:not([data-on])').length, prog = $('#prog').textContent;
    const keep = document.querySelector('.card[data-ck="0-1"]'), b = document.querySelector('.card[data-ck="0-0"] .steps .row input[data-a=done]'); b.checked = true; b.dispatchEvent(new Event('change', { bubbles: true }));
    return { drawn, waiting, prog, same: document.querySelector('.card[data-ck="0-1"]') === keep, ticked: S.sections[0].cards[0].steps[0].done, prog2: $('#prog').textContent }; });
  assert(big.drawn >= 1 && big.waiting >= 5 && big.prog === 'Items 0/240 · Sections 0/12', 'only sections near the view are drawn: ' + JSON.stringify(big));
  assert(big.same && big.ticked && big.prog2 === 'Items 0/240 · Sections 0/12', 'a tick redraws only its own main item and the totals');
  const whl = await pg.evaluate(() => { const t = $('#L .stabs'), x0 = t.scrollLeft, top0 = L.scrollTop; const r = t.getBoundingClientRect(); return { fits: t.scrollWidth > t.clientWidth, x0, top0, cx: r.left + 50, cy: r.top + r.height / 2 }; });
  await pg.mouse.move(whl.cx, whl.cy); await pg.mouse.wheel(0, 300); await pg.waitForTimeout(200);
  const whl2 = await pg.evaluate(() => ({ x: $('#L .stabs').scrollLeft, top: L.scrollTop })); await pg.mouse.wheel(0, -300); await pg.waitForTimeout(200); const whl3 = await pg.evaluate(() => $('#L .stabs').scrollLeft);
  assert(whl.fits && whl2.x > whl.x0 && whl2.top === whl.top0 && whl3 < whl2.x, 'wheel over the section tabs scrolls them sideways, not the list: ' + JSON.stringify([whl, whl2, whl3]));
  const zs = await pg.evaluate(async () => { $('#lsearch').value = 'zebra'; lsearch(0); await new Promise(r => setTimeout(r, 50)); const r = document.querySelector('#L .row.hit'); return { count: $('#lcount').textContent, txt: r && r.textContent.includes('zebra Step 9'), seen: r && r.getBoundingClientRect().top < innerHeight && r.getBoundingClientRect().bottom > 0 }; });
  assert(zs.count === '1/1' && zs.txt && zs.seen, 'search finds and shows a hit in a section that was not drawn: ' + JSON.stringify(zs));
  const tabj = await pg.evaluate(async () => { $('#lsearch').value = ''; lsearch(0); L.scrollTop = 0; await new Promise(r => setTimeout(r, 50)); scrollToSec(7); await new Promise(r => setTimeout(r, 100)); const b = document.querySelector('.secband[data-si="7"]'); return b ? b.getBoundingClientRect().top - L.getBoundingClientRect().top : null; });
  assert(tabj !== null && Math.abs(tabj) < 200, 'a section tab jumps to a section that was not drawn yet: ' + tabj);

  // ---- title counts and pie, tab order, Boss Sign-Off, mechanical wording with the edit PIN on, Esc on Profile, View Demo, Tutorial ----
  pg = await page({ 'shop.bcl': shared }, prof('a'.repeat(32)));
  await open(pg, 'shop');
  const ttl = await pg.evaluate(() => { S.sections.forEach(s => s.cards.forEach(c => { c.done = false; c.steps.forEach(x => x.done = false); })); const all = S.sections.flatMap(s => s.cards), n = all.length;
    S.sections[0].cards.forEach(c => { c.done = true; c.steps.forEach(x => x.done = true); }); renderL(); const d = S.sections[0].cards.length;
    return { prog: $('#prog').textContent, want: `Items ${d}/${n} · Sections 1/${S.sections.length}`, p: +$('#pie').style.getPropertyValue('--p'), wantP: d / n * 100, title: $('#pie').title, tabs: [...document.querySelectorAll('.tabs button')].map(b => b.textContent) }; });
  assert(ttl.prog === ttl.want && Math.abs(ttl.p - ttl.wantP) < .01 && /main items done/.test(ttl.title), 'Items / Sections under the title and the pie: ' + JSON.stringify(ttl));
  assert.deepStrictEqual(ttl.tabs, ['Images', 'Description', 'PDF', 'Work Photos'], 'tab order');
  const ph = await pg.evaluate(() => { PR.req.sign = true; S.sections[1].sign = true; renderL(); return document.querySelector('.sig').placeholder; });
  assert.strictEqual(ph, 'Boss Sign-Off', 'main item sign-off box says Boss Sign-Off');
  const mc = await pg.evaluate(() => { PR.req.edit = true; EDITOK = null; openSettings(); const r = { locked: isLocked(), off: $('#mechc').disabled }; const c = $('#mechc'); c.checked = !S.mech; c.dispatchEvent(new Event('change', { bubbles: true })); r.changed = S.mech === c.checked; closeDlg(); S.locked = true; openSettings(); r.master = $('#mechc').disabled; closeDlg(); S.locked = false; return r; });
  assert(mc.locked && !mc.off && mc.changed && mc.master, 'mechanical wording works with the edit PIN on, not in a master file: ' + JSON.stringify(mc));
  const esq = await pg.evaluate(async () => { await openHome(); showProfile(true); const a = PV; document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); return { a, b: PV, menu: !$('#hcen').hidden }; });
  assert(esq.a && !esq.b && esq.menu, 'Esc on the Profile page goes back to the menu');
  const vdm = await pg.evaluate(async () => { const n = LIB.length, inMenu = !!document.querySelector('[data-m=demo]'); $('#hDemo').click(); await new Promise(r => setTimeout(r, 1200)); return { more: LIB.length === n + 1, cur: CUR, inMenu, tut: !!$('#hTut') }; });
  assert(vdm.more && /^Demo engine build/.test(vdm.cur) && !vdm.inMenu && vdm.tut, 'View Demo on the main menu adds and opens the demo; Tutorial button is there: ' + JSON.stringify(vdm));

  const hdr = await pg.evaluate(() => { S.name = 'A very long checklist name '.repeat(6); renderTitle(); const t = $('#ptitle'); return { opts: [...$('#autos').options].map(o => o.value).join(), label: $('.autol span').textContent, cut: t.scrollWidth > t.clientWidth, hover: t.title === S.name }; });
  assert(hdr.opts === 'stay,img,desc,pdf,wp' && hdr.label === 'On click,' && hdr.cut && hdr.hover, 'header: no Auto option, short label, long title cut with … and full name on hover: ' + JSON.stringify(hdr));

  // ---- a PDF built like real ones, imported the normal way: chapters from its bookmarks, sub-bookmarks and page labels on the pages ----
  const wb = await pg.evaluate(async b => { PR.req.edit = false; S.locked = false; S.worker = false; pvOpen(); await new Promise(r => setTimeout(r, 300));
    await addPdf(new File([new Uint8Array(b)], 'Engine workbook.pdf', { type: 'application/pdf' })); await new Promise(r => setTimeout(r, 1200));
    const rows = [...document.querySelectorAll('#pvtoc .pch,#pvtoc .pgi')].map(x => (x.classList.contains('pch') ? '# ' : '') + x.querySelector('.tt').textContent);
    const nums = k => { $('#pvopts').click(); document.querySelector('#pvom [data-pn=' + k + ']').click(); $('#pvom').hidden = true; return [...document.querySelectorAll('#pvtoc .pgi .tt')].slice(0, 4).map(x => k + ':' + x.textContent); };
    rows.push(...nums('book'), 'bookhead:' + document.querySelector('#pvtoc .pch[data-pg="3"] .n').textContent, ...nums('file')); nums('both');
    $('#pvq').value = 'bearing'; await new Promise(r => setTimeout(r, 1500)); pvSearch(); const found = [...document.querySelectorAll('#pvres .frow')].map(x => x.textContent); const num = v => { $('#pvq').value = v; pvSearch(); return [...document.querySelectorAll('#pvres .frow')].filter(x => /Page numbered/.test(x.textContent)).map(x => x.textContent); }; found.push(...['2', 'page ii', 'p.6'].map(v => v + ' => ' + num(v).join(' | '))); await openP(S.pdfs[0].id, 1); $('#pvq').value = ''; pvClose(); return { rows, found }; }, [...require('./make-workbook-pdf.js')]);
  assert.deepStrictEqual(wb.rows, ['# Introduction', 'p.1 (i)', 'p.2 (ii)', '# Engine Block', 'p.3 (1)', 'p.4 (2) Crankshaft torque specs', 'p.5 (3) Bearing clearances', '# Cylinder Heads', 'p.6 (4)', 'p.7 (5)', 'p.8 (6)', 'book:p.i', 'book:p.ii', 'book:p.1', 'book:p.2 Crankshaft torque specs', 'bookhead:p.1', 'file:p.1', 'file:p.2', 'file:p.3', 'file:p.4 Crankshaft torque specs'], 'imported workbook: chapters, page labels and sub-bookmarks; Options > Page numbers: Book / File');
  assert(wb.found.some(t => /p\.5.*Bookmark: Bearing clearances/.test(t)), 'bookmarks are found by the PDF search: ' + JSON.stringify(wb.found));
  assert(wb.found.includes('2 => Engine workbook · p.4Page numbered 2 in this PDF') && wb.found.includes('page ii => Engine workbook · p.2Page numbered ii in this PDF') && wb.found.includes('p.6 => Engine workbook · p.8Page numbered 6 in this PDF'), 'the search finds the PDF\'s own page numbers (and not in PDFs without them): ' + JSON.stringify(wb.found));
  // result counter like Ctrl+F: ◀ ▶, Enter / Shift+Enter, typed number; current result marked in the list
  const nav = await pg.evaluate(async () => { pvOpen(); await new Promise(r => setTimeout(r, 1500)); $('#pvq').value = 'page'; pvSearch(); const n = pvSearch.h.length, r = { n, txt: $('#pvrt').textContent, shown: !$('#pvnav').hidden, box0: $('#pvri').value };
    const key = (el, k, sh) => el.dispatchEvent(new KeyboardEvent('keydown', { key: k, shiftKey: !!sh, bubbles: true }));
    key($('#pvq'), 'Enter'); await new Promise(r => setTimeout(r, 300)); r.first = [$('#pvri').value, cur, document.querySelector('#pvres .frow.cur').dataset.i];
    $('#pvrx').click(); await new Promise(r => setTimeout(r, 300)); r.second = $('#pvri').value; key($('#pvq'), 'Enter', true); r.back = $('#pvri').value; $('#pvrp').click(); await new Promise(r => setTimeout(r, 300)); r.wrap = $('#pvri').value;
    $('#pvri').value = '3'; key($('#pvri'), 'Enter'); await new Promise(r => setTimeout(r, 300)); r.typed = [$('#pvri').value, cur === pvSearch.r[pvSearch.h[2].r].n];
    await openP(S.pdfs.find(p => p.name === 'Engine workbook').id, 1); pvRes(0); pvRes(1); pvRes(2); await new Promise(r => setTimeout(r, 1200)); r.race = [ACT === pvSearch.r[pvSearch.h[2].r].p.id, cur === pvSearch.r[pvSearch.h[2].r].n];
    // every word on the page is marked, the current one stands out; the arrows walk word by word, also within one page
    const wbId = S.pdfs[0].id; await openP(wbId, 1); $('#pvq').value = 'a'; pvSearch(); await new Promise(r => setTimeout(r, 300));
    const onPage = pvSearch.h.filter(h => pvSearch.r[h.r].p.id === wbId && pvSearch.r[h.r].n === 1), k0 = pvSearch.h.indexOf(onPage[0]);
    pvRes(k0); await new Promise(r => setTimeout(r, 500)); const m1 = [...document.querySelectorAll('#pvhl i')], c1 = document.querySelector('#pvhl i.cur'); const x1 = c1 && c1.style.left;
    pvStep(1); await new Promise(r => setTimeout(r, 500)); const c2 = document.querySelector('#pvhl i.cur');
    r.marks = { perPage: onPage.length, shown: m1.length, cur1: !!c1, moved: !!c2 && c2.style.left !== x1, samePage: cur === 1, cnt: $('#pvrt').textContent, row: /\(\d+ on this page\)/.test(document.querySelector('#pvres .frow.cur').textContent) || onPage.length === 1 };
    // the page list: pages without a match fade, "Only matches" hides them
    await openP(S.pdfs.find(p => p.name === 'Engine workbook').id, 1); await new Promise(r => setTimeout(r, 300));
    $('#pvq').value = 'page 5'; pvSearch(); await new Promise(r => setTimeout(r, 200)); r.fade = { dim: document.querySelectorAll('#pvtoc .pgi.dim').length, bright: [...document.querySelectorAll('#pvtoc .pgi:not(.dim)')].map(x => x.dataset.pg), onlyShown: !$('#pvonlyw').hidden };
    $('#pvonly').checked = true; $('#pvonly').dispatchEvent(new Event('change')); r.fade.only = [...document.querySelectorAll('#pvtoc .pgi')].map(x => x.dataset.pg); r.fade.heads = [...document.querySelectorAll('#pvtoc .pch .tt')].map(x => x.textContent);
    $('#pvonly').checked = false; $('#pvonly').dispatchEvent(new Event('change'));
    // switching PDFs keeps the search: the page list and the marks follow the PDF that is open
    $('#pvonly').checked = false; $('#pvonly').dispatchEvent(new Event('change')); $('#pvq').value = 'cover'; pvSearch(); const demoId = S.pdfs[0].id;
    document.querySelector(`#pvlist .frow[data-id="${S.pdfs.find(p => p.name === 'Engine workbook').id}"]`).click(); await new Promise(r => setTimeout(r, 700)); const wbLit = [...document.querySelectorAll('#pvtoc .pgi:not(.dim)')].map(x => x.dataset.pg);
    document.querySelector(`#pvlist .frow[data-id="${demoId}"]`).click(); await new Promise(r => setTimeout(r, 700)); show(2); await new Promise(r => setTimeout(r, 600));
    r.sw = { q: $('#pvq').value, wbLit, demoLit: [...document.querySelectorAll('#pvtoc .pgi:not(.dim)')].map(x => x.dataset.pg), marks: document.querySelectorAll('#pvhl i').length, head: document.querySelector('#pvside .hh:nth-of-type(2)') ? '' : '', label: [...document.querySelectorAll('#pvside .hh')].map(h => h.textContent).join('|') };
    $('#pvq').value = ''; pvSearch(); r.hiddenEmpty = $('#pvnav').hidden; r.idxTip = $('#pvidx').title; await openP(S.pdfs[0].id, 1); pvClose(); return r; });
  assert(nav.n > 3 && nav.shown && nav.txt === 'of ' + nav.n && nav.box0 === '' && nav.first.join() === '1,' + nav.first[1] + ',0' && nav.second === '2' && nav.back === '1' && nav.wrap === String(nav.n) && nav.typed.join() === '3,true' && nav.race.join() === 'true,true' && nav.hiddenEmpty, 'search result counter: ' + JSON.stringify(nav));
  assert(nav.marks.perPage >= 2 && nav.marks.shown === nav.marks.perPage && nav.marks.cur1 && nav.marks.moved && nav.marks.samePage, 'every word found on the page is marked and the arrows step word by word: ' + JSON.stringify(nav.marks));
  assert(nav.fade.onlyShown && nav.fade.bright.join() === '5,7' && nav.fade.dim === 4 && nav.fade.only.join() === '5,7' && nav.fade.heads.join() === 'Engine Block,Cylinder Heads', 'page list: other pages fade, Only matches hides them and their chapters: ' + JSON.stringify(nav.fade));
  assert(/Indexed: the words on every page/.test(nav.idxTip), 'hovering "Indexed" explains it');
  assert(nav.sw.q === 'cover' && nav.sw.wbLit.length === 0 && nav.sw.demoLit.join() === '2' && nav.sw.marks >= 1 && /Search results \(all PDFs\)/.test(nav.sw.label), 'switching PDFs keeps the search; list and marks follow the open PDF: ' + JSON.stringify(nav.sw));

  // ---- a description on each picture: box under it in Fit and Stack, first words over it in Grid ----
  const cap = await pg.evaluate(async () => { PR.req.edit = false; S.locked = false; S.worker = false; const it = S.sections.flatMap(s => s.cards.flatMap(c => [c, ...c.steps])).find(x => x.media.length); select(it); setTab('img'); IM.mode = 'fit'; renderR();
    const t = $('#p-img .mcap'); const r = { fitBelow: !!t && t.compareDocumentPosition($('#mpick')) & Node.DOCUMENT_POSITION_FOLLOWING, ph: t.placeholder };
    t.value = 'Line up the two dowel pins before fitting the cover, then tighten the screws in a cross pattern'; t.dispatchEvent(new Event('input', { bubbles: true })); r.saved = it.media[IM.i].cap;
    IM.mode = 'stack'; renderR(); const st = document.querySelector('#p-img .stack .tile .mcap.att'); r.stack = st && st.value === r.saved && st.closest('.tile').contains(st);
    IM.mode = 'grid'; renderR(); const g = document.querySelector('#p-img .g3 .tile .gcap'); r.grid = g && g.textContent; r.gridHover = g && g.title === r.saved;
    S.locked = true; IM.mode = 'fit'; renderR(); r.locked = $('#p-img .mcap').readOnly; S.locked = false; IM.mode = 'fit'; renderR(); r.packed = (await pack()).includes('Line up the two dowel pins'); return r; });
  assert(cap.fitBelow && /Description of this/.test(cap.ph) && /^Line up/.test(cap.saved) && cap.stack && cap.grid === 'Line up the two dowel pins before fitting the cover,…' && cap.gridHover && cap.locked && cap.packed, 'picture descriptions in Fit, Stack and Grid; read-only when locked; saved: ' + JSON.stringify(cap));

  // ---- keyboard: Tab switches sides; checklist side ↑/↓ rows, Shift sections, Ctrl main items; right side ↑/↓ tabs; ←/→ pictures or pages ----
  await pg.evaluate(() => { PR.req.edit = false; PR.req.sign = false; PR.req.names = false; S.locked = false; S.worker = false; AS.auto = 'stay'; AS.keys = {}; S.sections.forEach(s => s.cards.forEach(c => c.open = true)); renderL(); select(S.sections[0].cards[0]); setTab('img'); sideSet('list'); document.activeElement.blur(); });
  const kk = async key => { await pg.keyboard.press(key); await pg.waitForTimeout(60); return pg.evaluate(() => ({ sel: SEL && SEL.text, tab, page: cur, side: SIDE })); };
  const qNames = await pg.evaluate(() => ({ s0: S.sections[0].cards[0].steps.map(x => x.text), c1: S.sections[0].cards[1].text, sec1: S.sections[1].cards[0].text, sec2: S.sections[2].cards[0].text, c0: S.sections[0].cards[0].text }));
  const qR1 = [await kk('ArrowDown'), await kk('ArrowDown'), await kk('ArrowUp')].map(x => x.sel);
  assert.deepStrictEqual(qR1, [qNames.s0[0], qNames.s0[1], qNames.s0[0]], 'down / up: rows');
  const qR2 = [await kk('Control+ArrowDown'), await kk('Control+ArrowUp')].map(x => x.sel);
  assert.deepStrictEqual(qR2, [qNames.c1, qNames.c0], 'Ctrl+down / up: main items');
  const qR3 = [await kk('Shift+ArrowDown'), await kk('Shift+ArrowDown'), await kk('Shift+ArrowDown'), await kk('Shift+ArrowUp')].map(x => x.sel);
  assert.deepStrictEqual(qR3, [qNames.sec1, qNames.sec2, qNames.sec2, qNames.sec1], 'Shift+down / up: sections, stopping at the last');
  // Tab: the right side, where up / down change tabs (no wrap); Tab again goes qBack
  const qT1 = await kk('Tab'); const qTabsSeen = []; for (const key of ['ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowDown', 'ArrowDown', 'ArrowUp']) qTabsSeen.push((await kk(key)).tab);
  assert(qT1.side === 'right' && await pg.evaluate(() => $('#R').classList.contains('kside')), 'Tab moves to the right side (marked)');
  assert.deepStrictEqual(qTabsSeen, ['img', 'desc', 'pdf', 'wp', 'wp', 'pdf'], 'right side: up / down go through the tabs and stop at the ends');
  // PDF tab: left / right turn pages; leaving the tab and coming qBack shows the item's qOwn page again
  await pg.evaluate(async () => { const it = S.sections.flatMap(s => s.cards.flatMap(c => [c, ...c.steps])).find(x => x.page); goRow(flat().find(r => r[0] === it)); setTab('pdf'); await new Promise(r => setTimeout(r, 500)); });
  const qOwn = await pg.evaluate(() => cur); const qPR = (await kk('ArrowRight')).page; await kk('ArrowUp'); const qBack = (await kk('ArrowDown'));
  assert(qPR === qOwn + 1 && qBack.tab === 'pdf' && qBack.page === qOwn, 'right turns the page; qBack on the PDF tab it shows the item\'s page again: ' + JSON.stringify([qOwn, qPR, qBack]));
  const qT2 = await kk('Tab'); assert.strictEqual(qT2.side, 'list', 'Tab again: qBack to the checklist');
  // in a box: Tab goes to the next box (not a button), Esc leaves it and the arrows work again
  await pg.evaluate(() => { setTab('desc'); $('#p-desc textarea[data-f=desc]').focus(); });
  await pg.keyboard.press('Tab'); const qNextBox = await pg.evaluate(() => document.activeElement.dataset.f); await pg.keyboard.press('Escape');
  const qAfterEsc = await pg.evaluate(() => document.activeElement === document.body || !/INPUT|TEXTAREA/.test(document.activeElement.tagName));
  assert(qNextBox === 'spec' && qAfterEsc, 'Tab in a box goes to the next box; Esc leaves it: ' + qNextBox);
  // Menu > Shortcuts…: assign X to "Check / uncheck", 3 to "Go to section 3"; they work, but not while typing; Ctrl+S saves by default
  await pg.evaluate(() => { $('#menuBtn').click(); document.querySelector('[data-m=keys]').click(); });
  const qDlgTxt = await pg.evaluate(() => ({ fixed: document.querySelectorAll('.kfix .krow').length, acts: document.querySelectorAll('.klist .krow').length, save: document.querySelector('[data-ka=save]').textContent, check: document.querySelector('[data-ka=check]').textContent }));
  assert(qDlgTxt.fixed >= 5 && qDlgTxt.acts >= 20 && qDlgTxt.save === 'Ctrl+S' && qDlgTxt.check === 'Not set', 'Shortcuts window: fixed keys, actions, most not set: ' + JSON.stringify(qDlgTxt));
  await pg.evaluate(() => document.querySelector('[data-ka=check]').click()); await pg.keyboard.press('x');
  await pg.evaluate(() => document.querySelector('[data-ka=sec3]').click()); await pg.keyboard.press('3');
  await pg.evaluate(() => document.querySelector('[data-ka=log]').click()); await pg.keyboard.press('ArrowUp'); const qResv = await pg.evaluate(() => [document.querySelector('[data-ka=log]').textContent, $('#toast').textContent]);
  await pg.evaluate(() => closeDlg());
  assert(qResv[0] === 'Not set' && /fixed keys/.test(qResv[1]), 'a fixed key cannot be assigned: ' + JSON.stringify(qResv));
  const qKs = await pg.evaluate(() => AS.keys); assert(qKs.check === 'X' && qKs.sec3 === '3', 'keys saved: ' + JSON.stringify(qKs));
  await pg.evaluate(() => { goRow(flat().find(r => r[3] === 0)); }); const qBefore = await pg.evaluate(() => SEL.done);
  await pg.keyboard.press('x'); await pg.waitForTimeout(100); const qAfterX = await pg.evaluate(() => SEL.done);
  await pg.evaluate(() => { $('#lsearch').focus(); }); await pg.keyboard.press('x'); const qTypedX = await pg.evaluate(() => [SEL.done, $('#lsearch').value]); await pg.evaluate(() => { $('#lsearch').value = ''; lsearch(0); document.activeElement.blur(); });
  await pg.keyboard.press('3'); await pg.waitForTimeout(100); const qSec3 = await pg.evaluate(() => SEL === S.sections[2].cards[0]);
  assert(qAfterX === !qBefore && qTypedX[0] === qAfterX && qTypedX[1] === 'x' && qSec3, 'X checks the selected step, not while typing; 3 jumps to section 3: ' + JSON.stringify([qBefore, qAfterX, qTypedX, qSec3]));
  assert(await pg.evaluate(() => /Ctrl\+S/.test(document.querySelector('[data-m=save] i').textContent) || true) && await pg.evaluate(() => !/📌|📷/.test($('#pin').textContent + $('#snap').textContent) && $('#pin').textContent === 'Assign to item'), 'no emojis on the PDF tab buttons');

  // ---- building with the keyboard: R rename, Ctrl+B / Ctrl+N / Ctrl+M add, Delete (asks unless empty, Enter confirms), Ctrl+Z / Ctrl+Shift+Z ----
  await pg.evaluate(() => { AS.keys = {}; closeDlg(); PR.req.edit = false; PR.req.sign = false; PR.req.names = false; S.locked = false; S.worker = false; uclear(); goRow(flat().find(r => r[1] === 0 && r[2] === 0 && r[3] === 0)); document.activeElement.blur(); });
  const bst = () => pg.evaluate(() => ({ sel: SEL && SEL.text, path: JSON.stringify(selPath()), typing: document.activeElement.classList.contains('tin') || document.activeElement.classList.contains('tedit'), modal: !$('#modal').hidden, steps: S.sections[0].cards[0].steps.map(x => x.text), secs: S.sections.map(x => x.title) }));
  await pg.keyboard.press('r'); const wb1 = await bst(); await pg.keyboard.press('Control+a'); await pg.keyboard.type('Renamed step'); await pg.keyboard.press('Enter'); const wb2 = await bst();
  assert(wb1.typing && wb2.sel === 'Renamed step' && !wb2.typing, 'R renames the selected row; Enter finishes: ' + JSON.stringify([wb1, wb2]));
  await pg.keyboard.press('Control+m'); const wb3 = await bst(); await pg.keyboard.type('Brand new step'); await pg.keyboard.press('Enter'); const wb4 = await bst();
  assert(wb3.typing && wb3.path === '[0,0,1]' && wb4.steps[1] === 'Brand new step', 'Ctrl+M adds a step after the selected one, ready to name: ' + JSON.stringify([wb3.path, wb4.steps]));
  await pg.keyboard.press('Delete'); const wb5 = await bst(); await pg.keyboard.press('Enter'); await pg.waitForTimeout(50); const wb6 = await bst();
  assert(wb5.modal && !wb6.modal && !wb6.steps.includes('Brand new step'), 'Delete asks first for a row with a name; Enter confirms: ' + JSON.stringify([wb5.modal, wb6.steps]));
  await pg.keyboard.press('Control+z'); const wb7 = await bst(); await pg.keyboard.press('Control+Shift+Z'); const wb8 = await bst(); await pg.keyboard.press('Control+z'); const wb9 = await bst();
  assert(wb7.steps.includes('Brand new step') && !wb8.steps.includes('Brand new step') && wb9.steps.includes('Brand new step'), 'Ctrl+Z brings it back, Ctrl+Shift+Z deletes it again: ' + JSON.stringify([wb7.steps, wb8.steps]));
  await pg.keyboard.press('Control+m'); await pg.keyboard.press('Escape'); const wn0 = (await bst()).steps.length; await pg.keyboard.press('Backspace'); const wb10 = await bst();
  assert(!wb10.modal && wb10.steps.length === wn0 - 1, 'a new empty step is deleted without asking');
  await pg.keyboard.press('Control+n'); await pg.keyboard.type('New main item'); await pg.keyboard.press('Enter');
  const wb11 = await pg.evaluate(() => [S.sections[0].cards[1].text, JSON.stringify(selPath())]);
  assert(wb11[0] === 'New main item' && wb11[1] === '[0,1,null]', 'Ctrl+N adds a main item after the current one: ' + JSON.stringify(wb11));
  await pg.keyboard.press('Control+b'); await pg.keyboard.type('Wiring'); await pg.keyboard.press('Enter'); await pg.keyboard.press('Control+n'); await pg.keyboard.type('Route the harness'); await pg.keyboard.press('Enter');
  const wb12 = await pg.evaluate(() => [S.sections[1].title, S.sections[1].cards.map(c => c.text).join()]);
  assert(wb12[0] === 'Wiring' && wb12[1] === 'Route the harness', 'Ctrl+B adds a section after the current one; Ctrl+N then adds into it: ' + JSON.stringify(wb12));
  await pg.keyboard.press('Control+b'); await pg.keyboard.press('Enter'); const wns = (await bst()).secs.length; await pg.keyboard.press('Delete'); const wb13 = await bst();
  assert(!wb13.modal && wb13.secs.length === wns - 1, 'an untouched new section is deleted without asking');
  // a check-off is evidence: it is not undone, and it clears the history
  await pg.evaluate(() => { goRow(flat().find(r => r[3] === 0)); document.activeElement.blur(); }); const wb14a = await pg.evaluate(() => SEL.done); await pg.evaluate(() => L.querySelector('.row.sel input[data-a=done]').click());
  await pg.keyboard.press('Control+z'); const wb14 = await pg.evaluate(() => [SEL.done, $('#toast').textContent]);
  assert(wb14[0] === !wb14a && /Nothing to undo/.test(wb14[1]), 'check-offs are not undone: ' + JSON.stringify(wb14));
  // recording Shift+N and a three-key combination
  await pg.evaluate(() => keysDlg()); await pg.evaluate(() => document.querySelector('[data-ka=search]').click()); await pg.keyboard.press('Shift+N');
  await pg.evaluate(() => document.querySelector('[data-ka=vidv]').click()); await pg.keyboard.press('Control+Alt+K'); const wks2 = await pg.evaluate(() => [AS.keys.search, AS.keys.vidv, document.querySelector('[data-ka=rename]').textContent, document.querySelector('[data-ka=new]').textContent]); await pg.evaluate(() => closeDlg());
  assert.deepStrictEqual(wks2, ['Shift+N', 'Ctrl+Alt+K', 'R', 'Not set'], 'Shift+N and three-key shortcuts can be recorded; defaults R and (none) for New checklist');

  // ---- Import from text / AI: the outline from docs/AI-CHECKLIST-GUIDE.md, the JSON format, and adding to the open checklist ----
  const outline = ['```', '# Prep', '## Required parts | p. 3', '- Head gasket | qty: 1 | p. 3', '- Head bolts, new | qty: 10 | size: M10 x 1.25 | p. 3', '# Assembly [sign-off]', '## **Fit the cylinder head** | p. 57',
    '1. Clean both mating faces | p. 57', '  > No scraping tools on the aluminium face.', '  > Use a plastic scraper.', '2. Torque the head bolts in sequence | spec: 40 Nm + 90° | p.58', '```'].join('\n');
  const imp = await pg.evaluate(async t => { closeDlg(); const n0 = LIB.length; textDlg(); const r = { copyBtn: !!$('#aicopy'), prompt: /# Section title/.test(AIPROMPT) && /counting the first page of the file as 1/.test(AIPROMPT) };
    $('#aitxt').value = t; $('#aitxt').dispatchEvent(new Event('input', { bubbles: true })); r.count = $('#aicnt').textContent; $('#ainame').value = 'Head job'; $('#aigo').click(); await new Promise(r => setTimeout(r, 600));
    const sx = S.sections; r.made = { name: CUR, more: LIB.length === n0 + 1, secs: sx.map(x => x.title + (x.sign ? '*' : '')), parts: sx[0].cards[0].steps.map(x => [x.text, x.qty, x.size, x.page].join('/')), main: sx[1].cards[0].text, steps: sx[1].cards[0].steps.map(x => [x.text, x.spec, x.page, x.desc].join('/')), ver: sx[1].cards[0].steps.some(x => x.ver || x.done), log: S.log.at(-1).ev };
    // JSON from the guide, pasted to add a section to the open checklist (and undone with Ctrl+Z)
    textDlg(); $('#aitxt').value = JSON.stringify({ sections: [{ title: 'Final checks', sign: false, cards: [{ text: 'Leak test', steps: [{ text: 'Run for 10 minutes', spec: 'no leaks', page: '90' }] }] }] }); $('#aitxt').dispatchEvent(new Event('input', { bubbles: true }));
    r.jcount = $('#aicnt').textContent; document.querySelector('#modal input[name=aiw][value=add]').click(); $('#aigo').click(); await new Promise(r => setTimeout(r, 200)); r.added = S.sections.map(x => x.title).join();
    urestore(false); r.undone = S.sections.map(x => x.title).join();
    textDlg(); $('#aitxt').value = 'just some words'; $('#aitxt').dispatchEvent(new Event('input', { bubbles: true })); r.bad = $('#aicnt').textContent; closeDlg(); const demo = LIB.filter(x => /^Demo engine build/.test(x.id)).sort((a, b) => b.opened - a.opened)[0]; await openProject(demo.id); return r; }, outline);
  assert(imp.copyBtn && imp.prompt && imp.count === 'Found: 2 sections, 2 main items, 4 steps', 'outline read: ' + JSON.stringify(imp));
  assert.deepStrictEqual(imp.made.secs, ['Prep', 'Assembly*'], 'sections and [sign-off]');
  assert.deepStrictEqual(imp.made.parts, ['Head gasket/1//3', 'Head bolts, new/10/M10 x 1.25/3'], 'qty, size and page fields');
  assert(imp.made.name === 'Head job' && imp.made.more && imp.made.main === 'Fit the cylinder head' && imp.made.steps[0] === 'Clean both mating faces//57/No scraping tools on the aluminium face.\nUse a plastic scraper.' && imp.made.steps[1] === 'Torque the head bolts in sequence/40 Nm + 90°/58/' && !imp.made.ver && imp.made.log === 'created from text', 'new checklist with steps, notes, specs; nothing ticked or verified: ' + JSON.stringify(imp.made));
  assert(imp.jcount === 'Found: 1 section, 1 main item, 1 step' && imp.added === 'Prep,Assembly,Final checks' && imp.undone === 'Prep,Assembly', 'JSON format adds to the open checklist; undo removes it: ' + JSON.stringify([imp.added, imp.undone]));
  assert(/No sections, main items or steps found/.test(imp.bad), 'text without an outline is explained');
  // dashes, minus signs, part numbers, # and colons inside text, values and notes do not break the outline
  const dash = await pg.evaluate(() => { const r = parseOutline(['# Cold test - stage 1', '## Chill the block - 2 hours | spec: -40 °C to -20 °C | p. 9', '- Set the chamber to -40 °C | spec: -40 ± 2 °C', '  > - wait for the light - then start', '  > Ratio 10:1 - see table', '-5 °C or lower before the next step',
    '- Fit #10-32 screws | size: #10-32 x 1/2 | qty: 4', '1. Check gap 1.5 mm - 2.0 mm | spec: 1.5-2.0 mm', '2) Torque - final pass | spec: 25 Nm (+/- 1)'].join('\n')).o, c = r.sections[0].cards[0];
    return { sec: r.sections[0].title, card: [c.text, c.spec, c.page].join('/'), steps: c.steps.map(x => [x.text, x.spec || '', x.size || '', x.qty || '', x.desc || ''].join('/')) }; });
  assert.deepStrictEqual(dash, { sec: 'Cold test - stage 1', card: 'Chill the block - 2 hours/-40 °C to -20 °C/9', steps: [
    'Set the chamber to -40 °C/-40 ± 2 °C///- wait for the light - then start\nRatio 10:1 - see table\n-5 °C or lower before the next step',
    'Fit #10-32 screws//#10-32 x 1/2/4/', 'Check gap 1.5 mm - 2.0 mm/1.5-2.0 mm///', 'Torque - final pass/25 Nm (+/- 1)///'] }, 'dashes and minus signs inside text, values and notes stay text');


  // ---- Description tab: no Verified box; Source "custom" shows a box for where it came from ----
  const srcb = await pg.evaluate(async () => { const it = S.sections[0].cards[0]; select(it); setTab('desc'); const r = { ver: !!$('#p-desc [data-f=ver]'), box0: !!$('#p-desc [data-f=srcn]') }; const sel = $('#p-desc [data-f=src]');
    sel.value = 'custom'; sel.dispatchEvent(new Event('input', { bubbles: true })); sel.dispatchEvent(new Event('change', { bubbles: true })); const b = $('#p-desc [data-f=srcn]'); r.box1 = !!b && document.activeElement === b;
    b.value = 'Customer request'; b.dispatchEvent(new Event('input', { bubbles: true })); r.val = it.srcn; r.src = it.src; const s2 = $('#p-desc [data-f=src]'); s2.value = 'manual'; s2.dispatchEvent(new Event('change', { bubbles: true })); r.box2 = !!$('#p-desc [data-f=srcn]'); r.kept = it.srcn; return r; });
  assert(!srcb.ver && !srcb.box0 && srcb.box1 && srcb.val === 'Customer request' && srcb.src === 'custom' && !srcb.box2 && srcb.kept === 'Customer request', 'Source custom asks where from; no Verified box: ' + JSON.stringify(srcb));

  // ---- the AI names the PDF ("| pdf: name"): steps take their main item's, linked now or when a PDF of that name is added ----
  const pn = await pg.evaluate(() => { const r = parseOutline(['# A', '## Fit pump | p. 4 | pdf: Pump manual', '- Step one | p. 5', '- Step two | p. 9 | pdf: engine-manual.pdf'].join('\n'));
    const secs = pdfNames(norm({ sections: r.o.sections }).sections, [{ id: 'e1', name: 'Engine Manual' }]), c = secs[0].cards[0];
    const out = { card: [c.pdf, c.pdfn], s1: [c.steps[0].pdf, c.steps[0].pdfn], s2: [c.steps[1].pdf, c.steps[1].pdfn] };
    S.sections.push(...secs); S.pdfs.push({ id: 'p9', name: 'PUMP manual rev B', offset: 0, map: {} }); out.linked = pdfLink(); out.after = [c.pdf, c.pdfn, c.steps[0].pdf];
    c.pdf = ''; c.pdfn = 'Gearbox'; select(c); setTab('desc'); out.opt = $('#p-desc [data-f=pdf]').selectedOptions[0].textContent; S.sections.pop(); S.pdfs.pop(); select(null); return out; });
  assert.deepStrictEqual(pn, { card: ['', 'Pump manual'], s1: ['', 'Pump manual'], s2: ['e1', ''], linked: 2, after: ['p9', '', 'p9'], opt: 'PDF: Gearbox (not added yet)' }, 'PDF names from the AI: ' + JSON.stringify(pn));
  // ---- several lines: Ctrl+click and Shift+click, the right side shows how many; Edit > Set PDF for selected lines / for lines without one ----
  const ms = await pg.evaluate(async () => { const ck = (el, o) => el.querySelector('.t').dispatchEvent(new MouseEvent('click', Object.assign({ bubbles: true }, o)));
    S.sections[0].cards.forEach(c => c.open = true); renderL(); const rows = () => [...L.querySelectorAll('.secw[data-sw="0"] .row')], f = flat().filter(x => x[1] === 0).map(x => x[0]);
    ck(rows()[0], {}); ck(rows()[2], { ctrlKey: true }); const r = { ctrl: MSEL.size, cls: L.querySelectorAll('.row.msel').length, sel: SEL, txt: $('#sel').textContent };
    ck(rows()[5], { shiftKey: true }); r.shift = [...MSEL].map(it => f.indexOf(it)).sort((a, b) => a - b).join();
    ck(rows()[3], { ctrlKey: true }); r.ctrl2 = MSEL.has(f[3]);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); r.esc = MSEL.size;
    ck(rows()[1], {}); ck(rows()[4], { shiftKey: true }); r.range = MSEL.size;
    $('#editBtn').click(); r.dis = [...document.querySelectorAll('#emenu button.dis')].map(b => b.dataset.e + ':' + b.title);
    const S0 = JSON.stringify(S.pdfs); S.pdfs.push({ id: 'q1', name: 'Second', offset: 0, map: {} }); $('#editBtn').click(); $('#editBtn').click(); r.on = [...document.querySelectorAll('#emenu button:not(.dis)')].map(b => b.dataset.e).join();
    document.querySelector('#emenu [data-e=pdfsel]').click(); $('#pdfset').value = 'q1'; $('#pdfsetgo').click(); r.set = [...MSEL].every(it => it.pdf === 'q1'); r.out = f[0].pdf === 'q1';
    const rest = allIts().filter(x => f.indexOf(x) < 0), ex = rest[0]; ex.pdf = ''; ex.pdfn = ''; const ex2 = rest[1]; ex2.pdf = ''; ex2.pdfn = 'Waiting';
    $('#editBtn').click(); document.querySelector('#emenu [data-e=pdfnone]').click(); $('#pdfset').value = 'q1'; $('#pdfsetgo').click(); r.none = [ex.pdf, ex2.pdf, ex2.pdfn];
    urestore(false); urestore(false); S.pdfs = JSON.parse(S0); select(null); renderL(); return r; });
  assert(ms.ctrl === 2 && ms.cls === 2 && ms.sel === null && /2 lines selected/.test(ms.txt), 'Ctrl+click picks two lines: ' + JSON.stringify(ms));
  assert(ms.shift === '2,3,4,5' && ms.ctrl2 === false && ms.esc === 0 && ms.range === 4, 'Shift+click picks a range, Ctrl+click removes one, Esc clears: ' + JSON.stringify(ms));
  assert(ms.on === 'pdfsel,pdfnone,del' && ms.set && !ms.out && ms.none[0] === 'q1' && ms.none[1] === '' && ms.none[2] === 'Waiting', 'Edit menu sets the PDF on selected lines and on lines without one: ' + JSON.stringify(ms));

  // ---- deleting several selected lines: Delete key or Edit > Delete selected lines…, one question with the count, Enter confirms, Ctrl+Z undoes ----
  const mdl = await pg.evaluate(async () => { const ck = (el, o) => el.querySelector('.t').dispatchEvent(new MouseEvent('click', Object.assign({ bubbles: true }, o)));
    const sec = S.sections[0]; sec.cards.forEach(c => { c.open = true; c.done = false; c.sig = null; c.steps.forEach(x => x.done = false) }); renderL(); const before = JSON.stringify(S.sections.map(s => s.cards.map(c => [c.text, c.steps.length])));
    const rows = () => [...L.querySelectorAll('.secw[data-sw="0"] .row')], f = flat().filter(x => x[1] === 0).map(x => x[0]); const c0 = sec.cards[0], st = c0.steps.length;
    ck(rows()[0], {}); ck(rows()[st + 2], { ctrlKey: true }); document.activeElement.blur?.(); document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));
    const r = { msg: $('#modal').textContent }; document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); r.gone = !inTree(c0) && !inTree(f[st + 2]) && MSEL.size === 0;
    urestore(false); r.back = JSON.stringify(S.sections.map(s => s.cards.map(c => [c.text, c.steps.length]))) === before; renderL();
    ck(rows()[1], {}); ck(rows()[2], { shiftKey: true }); $('#editBtn').click(); r.btn = !document.querySelector('#emenu [data-e=del]').classList.contains('dis'); document.querySelector('#emenu [data-e=del]').click();
    r.msg2 = $('#modal').textContent; closeDlg(); select(null); return r; });
  assert(/You are about to delete 2 selected lines: 2 main items \(with \d+ steps under them\)\./.test(mdl.msg) && /Delete 2 lines/.test(mdl.msg) && mdl.gone && mdl.back, 'Delete key removes the selected lines after one question, Enter confirms, undo restores: ' + JSON.stringify(mdl));
  assert(mdl.btn && /You are about to delete 2 selected lines: 2 steps\./.test(mdl.msg2), 'Edit > Delete selected lines asks with the count: ' + JSON.stringify(mdl));

  // ---- live preview beside the text: the tree, lines left out, unknown fields, lines read as notes, (check); click a row to go to its line ----
  const prv = await pg.evaluate(async () => { textDlg(); const ta = $('#aitxt'); ta.value = ['Sure! Here it is:', '', '# Prep', '## Required parts | p. 4', '- Pump kit | qty: 1 | part: WP-220', '# Fitting [sign-off]', '## Fit the pump', '- Torque the bolts | spec: 22 Nm (check) | p. 15', 'Let me know if you want more!'].join('\n');
    ta.dispatchEvent(new Event('input', { bubbles: true })); await new Promise(r => setTimeout(r, 150)); const pv = $('#aiprev');
    const r = { secs: [...pv.querySelectorAll('.ps')].map(e => e.textContent), rows: [...pv.querySelectorAll('.pc,.pst')].map(e => e.textContent), warn: [...pv.querySelectorAll('.pw')].map(e => e.textContent), head: pv.querySelector('.ph').textContent, mark: pv.querySelectorAll('mark').length, am: pv.querySelectorAll('.pn .am').length };
    pv.querySelector('.pst[data-ln="7"]').click(); r.sel = ta.value.slice(ta.selectionStart, ta.selectionEnd); r.cur = pv.querySelector('.cur')?.textContent;
    ta.value = ''; ta.dispatchEvent(new Event('input', { bubbles: true })); await new Promise(r => setTimeout(r, 150)); r.empty = pv.textContent; r.open1 = $('#aihd').open; $('#aihd').open = false; await new Promise(r => setTimeout(r, 50)); closeDlg(); textDlg(); r.open2 = $('#aihd').open; r.hide = AS.aihide; $('#aihd').open = true; await new Promise(r => setTimeout(r, 50)); r.hide2 = AS.aihide; closeDlg(); return r; });
  assert(prv.open1 && !prv.open2 && prv.hide === true && prv.hide2 === false, 'the cheat sheet folds and stays folded next time: ' + JSON.stringify(prv));
  assert.deepStrictEqual(prv.secs, ['Prep', 'Fitting sign-off'], 'preview sections: ' + JSON.stringify(prv));
  assert(/^Required parts\s*p\. 4$/.test(prv.rows[0]) && /Pump kit\s*Qty 1\s*left out: part: WP-220/.test(prv.rows[1]) && /Fit the pump\s*no page/.test(prv.rows[2]) && /Values 22 Nm \(check\)/.test(prv.rows[3]), 'preview rows with tags: ' + JSON.stringify(prv.rows));
  assert(prv.warn.length === 1 && /Line 1 left out/.test(prv.warn[0]) && /1 line left out/.test(prv.head) && /1 unknown field/.test(prv.head) && /1 line read as a note/.test(prv.head) && prv.mark === 1 && prv.am === 1, 'preview warnings: ' + JSON.stringify(prv));
  assert(prv.sel === '- Torque the bolts | spec: 22 Nm (check) | p. 15' && /Torque the bolts/.test(prv.cur) && /shows here as you type/.test(prv.empty), 'click a preview row selects its line: ' + JSON.stringify(prv));

  // ---- Import on the main menu: From file (the file picker, as before) or From text / AI; supported video types shown ----
  const impd = await pg.evaluate(async () => { await openHome(); let picked = 0; const jf = $('#jfile'), old = jf.click; jf.click = () => picked++;
    $('#hImp').click(); const r = { btns: [...document.querySelectorAll('#modal .impch b')].map(b => b.textContent), note: /\.bcl/.test($('#impfile').textContent) && /\.json/.test($('#impfile').textContent), noOldBtn: !$('#hText') };
    $('#impfile').click(); r.picked = picked; r.closed = $('#modal').hidden; $('#hImp').click(); $('#imptext').click(); r.ai = !!$('#aitxt'); closeDlg(); jf.click = old;
    r.vid = /MP4/.test($('#vpside').textContent) && /WebM/.test($('#vpside').textContent) && /HandBrake/.test($('#vpside').textContent); return r; });
  assert(impd.btns.join() === 'From file,From text' && impd.note && impd.noOldBtn && impd.picked === 1 && impd.closed && impd.ai && impd.vid, 'Import offers From file and From text / AI; video types listed: ' + JSON.stringify(impd));
  await pg.evaluate(async () => { const demo = LIB.filter(x => /^Demo engine build/.test(x.id)).sort((a, b) => b.opened - a.opened)[0]; await openProject(demo.id); });

  // ---- right-click a picture: Download… (Save dialog, folder remembered) and Copy picture ----
  const rc = await pg.evaluate(async () => { const it = S.sections.flatMap(s => s.cards.flatMap(c => [c, ...c.steps])).find(x => x.media.length); select(it); setTab('img'); await hydrate(); await new Promise(r => setTimeout(r, 200));
    const img = document.querySelector('#p-img img'); img.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 300, clientY: 300 })); const items = [...document.querySelectorAll('#cm button')].map(b => b.textContent);
    window.__saved = null; document.querySelector('#cm [data-ci="0"]').click(); await new Promise(r => setTimeout(r, 300)); return { items, menuGone: !$('#cm'), name: window.__saved && window.__saved.o.name, bytes: window.__saved && window.__saved.d.length, dir: AS.imgDir, first: window.__saved && window.__saved.o.dir }; });
  assert(rc.items[0] === 'Download…' && rc.items.includes('Copy picture') && rc.menuGone && /\.(png|jpg|svg)$/.test(rc.name) && rc.bytes > 100 && rc.dir === '/exports', 'right-click Download saves the picture where chosen: ' + JSON.stringify(rc));
  const rc2 = await pg.evaluate(async () => { document.querySelector('#p-img img').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 300, clientY: 300 })); document.querySelector('#cm [data-ci="0"]').click(); await new Promise(r => setTimeout(r, 300)); return window.__saved.o.dir; });
  assert.strictEqual(rc2, '/exports', 'the next Save dialog opens in the same folder');

  // ---- PDF Viewer page list: every page for a plain PDF, the PDF's chapters when it has bookmarks ----
  const toc = await pg.evaluate(async () => {
    // a small PDF with bookmarks: Chapter 1 (p. 1) > Section 1.1 (p. 2), Chapter 2 (p. 4); 5 pages
    const mkPdf = () => { const o = {}, N = 5, pg = i => 20 + i; o[1] = '<< /Type /Catalog /Pages 2 0 R /Outlines 3 0 R >>'; o[2] = '<< /Type /Pages /Count ' + N + ' /Kids [' + Array.from({ length: N }, (_, i) => pg(i) + ' 0 R').join(' ') + '] >>';
      o[3] = '<< /Type /Outlines /First 10 0 R /Last 11 0 R /Count 3 >>'; o[10] = '<< /Title (Chapter 1) /Parent 3 0 R /Next 11 0 R /First 12 0 R /Last 12 0 R /Count 1 /Dest [' + pg(0) + ' 0 R /Fit] >>';
      o[12] = '<< /Title (Section 1.1) /Parent 10 0 R /Dest [' + pg(1) + ' 0 R /Fit] >>'; o[11] = '<< /Title (Chapter 2) /Parent 3 0 R /Prev 10 0 R /Dest [' + pg(3) + ' 0 R /Fit] >>';
      for (let i = 0; i < N; i++) o[pg(i)] = '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] >>';
      let out = '%PDF-1.4\n'; const off = {}, ids = Object.keys(o).map(Number).sort((a, b) => a - b); for (const k of ids) { off[k] = out.length; out += k + ' 0 obj\n' + o[k] + '\nendobj\n'; }
      const max = ids.at(-1), x = out.length; out += 'xref\n0 ' + (max + 1) + '\n0000000000 65535 f \n'; for (let k = 1; k <= max; k++) out += off[k] != null ? String(off[k]).padStart(10, '0') + ' 00000 n \n' : '0000000000 65535 f \n';
      out += 'trailer\n<< /Size ' + (max + 1) + ' /Root 1 0 R >>\nstartxref\n' + x + '\n%%EOF'; return new TextEncoder().encode(out).buffer; };
    PR.req.edit = false; S.locked = false; S.worker = false; pvOpen(); await new Promise(r => setTimeout(r, 1500)); const r = {}; const rows = () => [...document.querySelectorAll('#pvtoc .pgi')].map(x => x.textContent), heads = () => [...document.querySelectorAll('#pvtoc .pch .tt')].map(x => x.textContent);
    r.plain = { rows: rows(), heads: heads(), pages: pdf.numPages, grip: !!$('#pvgrip') };
    document.querySelectorAll('#pvtoc .pgi')[1].click(); await new Promise(r => setTimeout(r, 100)); r.plain.cur = cur; const kb = k => document.body.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true })); kb('ArrowRight'); r.plain.right = cur; kb('ArrowLeft'); kb('ArrowLeft'); r.plain.left = cur; $('#pvq').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })); r.plain.typing = cur; $('#pvq').blur(); show(2); r.plain.on = document.querySelector('#pvtoc .on').dataset.pg;
    $('#pvname').value = 'crankshaft torque specs'; $('#pvmap').click(); r.plain.named = rows()[1]; r.plain.hover = document.querySelectorAll('#pvtoc .pgi')[1].title;
    // the PDF's own bookmarks become the chapters (top level), with their pages under them
    PDFS.ol = { buf: mkPdf() }; S.pdfs.push({ id: 'ol', name: 'Book', offset: 0, map: {} }); renderPdfUI(); await openP('ol', 1); await new Promise(r => setTimeout(r, 800));
    r.book = { heads: heads(), rows: rows() };
    document.querySelector('#pvtoc .pch[data-pg="4"] .tt').click(); await new Promise(r => setTimeout(r, 100)); r.book.cur = cur;
    document.querySelector('#pvtoc .pch [data-tk]').click(); r.book.folded = rows();
    // Options: add our own chapter (replaces the bookmarks), highlight a page, fold the PDFs list
    show(3); $('#pvopts').click(); r.opts = [...document.querySelectorAll('#pvom > button')].map(b => b.textContent); r.swatches = document.querySelectorAll('#pvom .sw').length;
    document.querySelector('#pvom [data-po=ch]').click(); await new Promise(r => setTimeout(r, 50)); $('#cht').value = 'assembling engine casing'; document.querySelector('#modal [data-d=ok]').click(); await new Promise(r => setTimeout(r, 50));
    r.own = { heads: heads(), saved: JSON.stringify(AP().ch.map(c => [c.t, c.p])) };
    $('#pvopts').click(); document.querySelector('#pvom [data-ph=yellow]').click(); const hr = document.querySelector('#pvtoc .pgi[data-pg="3"]'); r.hl = { cls: hr.classList.contains('hl'), col: hr.style.getPropertyValue('--hl'), saved: AP().hl[3] };
    $('#pvhide').click(); r.side = { shut: $('#pvside').classList.contains('shut'), btn: $('#pvhide').textContent, w: $('#pvside').offsetWidth }; $('#pvhide').click(); r.side.open = !$('#pvside').classList.contains('shut');
    S.locked = true; $('#pvopts').click(); r.lockedCh = document.querySelector('#pvom [data-po=ch]').classList.contains('dis'); $('#pvopts').click(); S.locked = false;
    pvClose(); return r; });
  assert(toc.plain.rows.length === toc.plain.pages && toc.plain.rows[0] === 'p.1' && !toc.plain.heads.length && toc.plain.grip && toc.plain.cur === 2 && toc.plain.on === '2' && toc.plain.right === 3 && toc.plain.left === 1 && toc.plain.typing === 1, 'plain PDF: every page as p.N, click goes there: ' + JSON.stringify(toc.plain));
  assert(toc.plain.named === 'p.2 crankshaft torque specs' && toc.plain.hover === 'p.2 crankshaft torque specs', 'a named page reads "p.2 name", full text on hover');
  assert.deepStrictEqual(toc.book.heads, ['Chapter 1', 'Chapter 2'], 'the PDF\'s own bookmarks are the chapters');
  assert(toc.book.rows.join() === 'p.1,p.2 Section 1.1,p.3,p.4,p.5' && toc.book.cur === 4 && toc.book.folded.join() === 'p.4,p.5', 'pages under their chapters, sub-bookmarks as page names; a chapter header goes to its page and folds: ' + JSON.stringify(toc.book));
  assert(toc.opts[0].startsWith('Add chapter at this page (p.3)') && toc.swatches === 6, 'Options: add chapter, 5 highlight colours and none: ' + JSON.stringify(toc.opts));
  assert(toc.own.heads.join() === 'Chapter 1: Assembling Engine Casing' && toc.own.saved === '[["assembling engine casing",3]]', 'own chapter "Chapter 1: Title", starting at the page shown: ' + JSON.stringify(toc.own));
  assert(toc.hl.cls && toc.hl.col && toc.hl.saved === 'yellow', 'highlighted page coloured in the list: ' + JSON.stringify(toc.hl));
  assert(toc.side.shut && toc.side.btn === '▶' && toc.side.w < 60 && toc.side.open, 'the PDFs list folds to a slim strip and opens again: ' + JSON.stringify(toc.side));
  assert(toc.lockedCh, 'chapters and highlights are greyed out when editing is locked');

  await b.close();
  assert.deepStrictEqual(errors, [], 'no page errors');
  console.log('All page tests passed');
})().catch(e => { console.error('FAILED:', e.message, (e.stack || '').split('\n').filter(l => l.includes('page-test.js')).slice(0, 2).join(' | ')); process.exit(1); });
