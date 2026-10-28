// Stress test, part 2: times the real built app on a huge checklist (see tests/stress-gen.js).
// npx electron-builder --linux dir --publish never; copy dist/linux-unpacked to <W>/app and the .bcl into <W>/app/Saves, then:
// xvfb-run -a node tests/stress-test.js <W> <path to the .bcl>
const { _electron } = require('playwright'), fs = require('fs'), path = require('path');
const [W, FILE] = process.argv.slice(2), name = path.basename(FILE, '.bcl');
(async () => {
  const t0 = Date.now(), ea = await _electron.launch({ executablePath: W + '/app/build-checklist', args: ['--no-sandbox', '--js-flags=--expose-gc'] });
  const pg = await ea.firstWindow(), errs = []; pg.on('pageerror', e => errs.push(e.message)); pg.on('console', m => m.type() === 'error' && errs.push(m.text()));
  await pg.waitForFunction(() => typeof LIB !== 'undefined' && LIB.length >= 1 && !document.getElementById('home').hidden, null, { timeout: 120000 }); const tHome = Date.now() - t0;
  const R = { file_MB: +(fs.statSync(FILE).size / 1048576).toFixed(0), start_to_menu_s: tHome / 1000 };
  const mem = async () => { const m = await ea.evaluate(async ({ app }) => (await app.getAppMetrics()).reduce((a, p) => a + p.memory.workingSetSize, 0)); return Math.round(m / 1024) + ' MB'; };
  R.mem_menu = await mem();
  let t = Date.now(); await pg.evaluate(n => openProject(n), name); R.open_s = (Date.now() - t) / 1000; R.mem_open = await mem();
  R.rows = await pg.evaluate(() => document.querySelectorAll('#L .row').length);
  R.renderL_ms = await pg.evaluate(() => { const a = performance.now(); renderL(); return Math.round(performance.now() - a); });
  R.select_with_image_ms = await pg.evaluate(async () => { setTab('img'); const it = S.sections[3].cards[4].steps.find(x => x.media.length) || S.sections[3].cards[4].steps[0]; const a = performance.now(); select(it); await new Promise(r => { const i = document.querySelector('#p-img img'); if (!i) return r(); if (i.complete && i.naturalWidth) return r(); i.onload = r; setTimeout(r, 5000); }); return Math.round(performance.now() - a); });
  R.search_ms = await pg.evaluate(async () => { const a = performance.now(); $('#lsearch').value = 'pump'; $('#lsearch').dispatchEvent(new Event('input', { bubbles: true })); await new Promise(r => setTimeout(r, 400)); return Math.round(performance.now() - a - 0); });
  await pg.evaluate(() => { $('#lsearch').value = ''; $('#lsearch').dispatchEvent(new Event('input', { bubbles: true })); });
  // a single tick: how long until it is safely on disk
  R.tick_save = await pg.evaluate(async () => { const it = S.sections[0].cards[0].steps[0]; it.done = true; it.init = 'TK'; const a = performance.now(); const t = await pack(); const b = performance.now(); await FS.write(CUR + '.bcl', t); const c = performance.now(); return { pack_ms: Math.round(b - a), write_ms: Math.round(c - b), MB: Math.round(t.length / 1048576) }; });
  R.mem_after_save = await mem();
  t = Date.now(); await pg.evaluate(() => refreshLib()); R.menu_list_after_save_ms = Date.now() - t;
  // printable checklist of 3,900 rows
  await ea.evaluate(({ dialog }, f) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: f }); }, W + '/stress.pdf');
  t = Date.now(); await pg.evaluate(() => { document.querySelector('[data-m="export"]').click(); document.querySelector('#xp [data-xk=pdf]').click(); });
  await pg.waitForFunction(() => /^Page \d+ of/.test($('#xpinfo').textContent), null, { timeout: 300000 }); R.pdf_preview_s = (Date.now() - t) / 1000; R.pdf_pages = await pg.evaluate(() => XP.pages);
  await pg.evaluate(() => xpClose());
  // new job from it
  t = Date.now(); await pg.evaluate(async () => { newJob(); await new Promise(r => setTimeout(r, 50)); $('#njn').value = 'Stress job'; document.querySelector('#modal [data-d=ok]').click(); });
  await pg.waitForFunction(() => CUR === 'Stress job', null, { timeout: 300000 }); R.new_job_s = (Date.now() - t) / 1000;
  R.errors = errs.slice(0, 5);
  console.log(JSON.stringify(R, null, 1));
  await ea.close();
})().catch(e => { console.error('FAILED', e.message); process.exit(1); });
