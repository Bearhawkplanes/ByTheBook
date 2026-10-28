// Browser test of index.html without Electron: window.fsapi is replaced by an in-memory stub.
// Run: node tests/page-test.js   (needs Playwright + Chromium; both are preinstalled in Claude cloud sessions)
const { chromium } = require('playwright'), fs = require('fs'), path = require('path'), assert = require('assert');
const url = 'file://' + path.join(__dirname, '..', 'index.html');
const R = { salt: '00'.repeat(16), hash: '33'.repeat(32) };
const prof = pid => ({ code: null, p: 'ok', m: 'ok', body: { pid, user: 'A', salt: '00'.repeat(16), hash: '11'.repeat(32), rv: R, req: { names: false, sign: false, edit: false }, people: [] }, marker: { pid, rv: R } });
const NONE = { code: null, p: 'none', m: 'none', body: null, marker: null };          // fresh install
const TAMPERED = { code: 'E-4417', p: 'bad', m: 'ok', body: null, marker: { pid: 'a'.repeat(32), rv: R } };
// files: { 'name.bcl': text }, integ: what main.js 'integrity' would return
const stub = (files, integ) => `(() => { const F = ${JSON.stringify(files)}, I = ${JSON.stringify(integ)}, ok = v => Promise.resolve(v);
 window.fsapi = { dir: () => ok('/saves'), list: () => ok(Object.keys(F).map(f => ({ name: f.replace(/\\.bcl$/, ''), mtime: Date.now() }))),
  read: n => ok(F[n]), write: (n, t) => { F[n] = t; return ok(true); }, writeNew: (n, t) => { F[n + '.bcl'] = t; return ok(n); },
  rename: () => ok(true), remove: n => { delete F[n]; return ok(true); }, importPath: () => ok(null), choose: () => ok(null), resetDir: () => ok('/saves'),
  openDir: () => ok(), reveal: () => ok(), pending: () => ok(null), backup: () => ok(null), restore: () => ok(null),
  newSalt: () => ok('00112233445566778899aabbccddeeff'), newPid: () => ok('ab'.repeat(16)), integrity: () => ok(I), profileSave: () => ok(true),
  recMake: () => ok({ code: 'X', rv: { salt: '00'.repeat(16), hash: '11'.repeat(32) } }), recCheck: () => ok(-1), hash: () => ok('22'.repeat(32)), matchPin: () => ok(null),
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

  await b.close();
  assert.deepStrictEqual(errors, [], 'no page errors');
  console.log('All page tests passed');
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
