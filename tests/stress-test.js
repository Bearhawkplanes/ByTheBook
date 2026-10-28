// Stress test, part 2: times the real built app on a huge checklist (see tests/stress-gen.js).
// npx electron-builder --linux dir --publish never; copy dist/linux-unpacked to <W>/app and the .bcl into <W>/app/Saves, then:
// xvfb-run -a node tests/stress-test.js <W> <path to the .bcl>
const { _electron } = require('playwright'), fs = require('fs'), path = require('path');
const [W, FILE] = process.argv.slice(2), name = path.basename(FILE, '.bcl');
(async () => {
  const t0 = Date.now(), ea = await _electron.launch({ executablePath: W + '/app/build-checklist', args: ['--no-sandbox', '--js-flags=--expose-gc'] });
  await ea.firstWindow(); let pg; for (let i = 0; i < 1200 && !pg; i++) { pg = ea.windows().find(p => /index\.html/.test(p.url())); if (!pg) await new Promise(r => setTimeout(r, 100)); } const errs = []; pg.on('pageerror', e => errs.push(e.message)); pg.on('console', m => m.type() === 'error' && errs.push(m.text()));
  await pg.waitForFunction(() => typeof LIB !== 'undefined' && LIB.length >= 1 && !document.getElementById('home').hidden, null, { timeout: 120000 }); const tHome = Date.now() - t0;
  const R = { file_MB: +(fs.statSync(FILE).size / 1048576).toFixed(0), start_to_menu_s: tHome / 1000 };
  const mem = async () => { const m = await ea.evaluate(async ({ app }) => (await app.getAppMetrics()).reduce((a, p) => a + p.memory.workingSetSize, 0)); return Math.round(m / 1024) + ' MB'; };
  R.mem_menu = await mem();
  let t = Date.now(); await pg.evaluate(n => openProject(n), name); R.open_first_s = (Date.now() - t) / 1000;   // an older file is converted on first open
  t = Date.now(); await pg.evaluate(async n => { await openProject('Demo engine build'); await openProject(n); }, name); R.reopen_two_checklists_s = (Date.now() - t) / 1000; R.mem_open = await mem();
  const F = path.join(W, 'app', 'Saves', name + '.bcl');
  R.rows = await pg.evaluate(() => document.querySelectorAll('#L .row').length);
  R.renderL_ms = await pg.evaluate(() => { const a = performance.now(); renderL(); return Math.round(performance.now() - a); });
  R.select_with_image_ms = await pg.evaluate(async () => { setTab('img'); const it = S.sections[3].cards[4].steps.find(x => x.media.length) || S.sections[3].cards[4].steps[0]; const a = performance.now(); select(it); await new Promise(r => { const i = document.querySelector('#p-img img'); if (!i) return r(); if (i.complete && i.naturalWidth) return r(); i.onload = r; setTimeout(r, 5000); }); return Math.round(performance.now() - a); });
  R.search_ms = await pg.evaluate(async () => { const a = performance.now(); $('#lsearch').value = 'pump'; $('#lsearch').dispatchEvent(new Event('input', { bubbles: true })); await new Promise(r => setTimeout(r, 400)); return Math.round(performance.now() - a - 0); });
  await pg.evaluate(() => { $('#lsearch').value = ''; $('#lsearch').dispatchEvent(new Event('input', { bubbles: true })); });
  // a single tick: how long until it is safely on disk
  const sz0 = fs.statSync(F).size;
  R.tick_save_ms = await pg.evaluate(async () => { const it = S.sections[0].cards[0].steps[0]; it.done = true; it.init = 'TK'; DIRTY = true; const a = performance.now(); await flush(); return Math.round(performance.now() - a); });
  R.tick_file_growth_KB = Math.round((fs.statSync(F).size - sz0) / 1024);
  R.ten_ticks_ms = await pg.evaluate(async () => { const a = performance.now(); for (let i = 1; i <= 10; i++) { const it = S.sections[0].cards[0].steps[i]; it.done = true; DIRTY = true; await flush(); } return Math.round(performance.now() - a); });
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
  // past the old ~512 MB ceiling: 400 more photos added through the app, then saved
  if (process.env.ADD_PHOTOS) { await pg.evaluate(n => openProject(n), name);
    const imgs = fs.readdirSync(path.join(require('os').tmpdir(), 'bcl-stress', 'img')).map(f => 'data:image/jpeg;base64,' + fs.readFileSync(path.join(require('os').tmpdir(), 'bcl-stress', 'img', f)).toString('base64'));
    t = Date.now(); await pg.evaluate(async ([imgs, n]) => { for (let i = 0; i < n; i++) { const st = S.sections[i % 12].cards[i % 25].steps[i % 12]; select(st); await attach(await (await fetch(imgs[i % imgs.length])).blob(), 'more' + i + '.jpg', 'image/jpeg'); if (i % 50 === 49) { DIRTY = true; await flush(); } } DIRTY = true; await flush(); }, [imgs, +process.env.ADD_PHOTOS]);
    R.add_photos = { count: +process.env.ADD_PHOTOS, s: (Date.now() - t) / 1000, file_MB: Math.round(fs.statSync(F).size / 1048576) };
    R.storage_bar = await pg.evaluate(async () => { openSettings(); await stFill(); const t = $('#sttxt').textContent; closeDlg(); return t; });
    t = Date.now(); await pg.evaluate(async n => { await openProject('Demo engine build'); await openProject(n); }, name); R.add_photos.reopen_s = (Date.now() - t) / 1000;
    R.add_photos.tick_ms = await pg.evaluate(async () => { S.sections[5].cards[3].steps[2].done = true; DIRTY = true; const a = performance.now(); await flush(); return Math.round(performance.now() - a); });
    R.add_photos.mem = await mem(); }
  R.errors = errs.slice(0, 5);
  console.log(JSON.stringify(R, null, 1));
  await ea.close();
})().catch(e => { console.error('FAILED', e.message); process.exit(1); });
