// Drives the real built app (Electron + ffmpeg + MP4 playback) on a virtual screen.
// Build first:  npx electron-builder --linux dir --publish never
// Run:          xvfb-run -a node tests/electron-test.js
const { _electron } = require('playwright'), fs = require('fs'), os = require('os'), path = require('path'), assert = require('assert'), { execFileSync } = require('child_process');
const built = path.join(__dirname, '..', 'dist', 'linux-unpacked');
if (!fs.existsSync(built)) { console.error('Build the app first: npx electron-builder --linux dir --publish never'); process.exit(1); }
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'bcl-app-')), app = path.join(work, 'app');
fs.cpSync(built, app, { recursive: true });   // Saves/ and Data/ are created next to the program
const vid = path.join(work, 'Engine walkaround.mp4'), ff = require('ffmpeg-static');
execFileSync(ff, ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=1280x720:rate=30:duration=30', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=30', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', vid]);

(async () => {
  const ea = await _electron.launch({ executablePath: path.join(app, 'build-checklist'), args: ['--no-sandbox'] });
  await ea.evaluate(({ dialog }, f) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [f] }); }, vid);   // stands in for picking the file
  const pg = await ea.firstWindow(), errors = []; pg.on('pageerror', e => errors.push(e.message));
  await pg.waitForTimeout(1500);
  await pg.evaluate(() => document.querySelector('[data-m="demo"]').click()); await pg.waitForTimeout(2000);
  await pg.evaluate(() => { select(S.sections[1].cards[0].steps[0]); $('#vidBtn').click(); $('#vpadd').click(); }); await pg.waitForTimeout(300);
  await pg.evaluate(() => $('#vaLink').click()); await pg.waitForTimeout(1500);
  assert.strictEqual(await pg.evaluate(() => Math.round(vpDur())), 30, 'MP4 (H.264 + AAC) plays in the app');
  await pg.evaluate(() => { $('#vpsel').click(); $('#ta').value = '0:12'; $('#ta').dispatchEvent(new Event('change')); $('#tb').value = '0:15'; $('#tb').dispatchEvent(new Event('change')); $('#vpas').click(); $('#asRef').click(); document.querySelector('#pk .pkgo').click(); });
  await pg.waitForTimeout(2000);
  assert(await pg.evaluate(() => { const m = S.sections[1].cards[0].steps[0].media.at(-1); return m.kind === 'vref' && m.thumb.length > 2000; }), 'linked clip with an ffmpeg thumbnail');
  await pg.evaluate(() => { $('#vpas').click(); $('#asIn').click(); document.querySelector('#pk .pkgo').click(); });
  await pg.waitForFunction(() => document.querySelectorAll('#iw .iwz').length === 3, null, { timeout: 120000 });
  const sizes = await pg.evaluate(() => [...document.querySelectorAll('#iw .iwz')].map(x => x.textContent));
  await pg.evaluate(() => { document.querySelector('#iw input[value=medium]').click(); document.querySelector('#iw [data-iw=ok]').click(); });
  await pg.waitForFunction(() => $('#iw').hidden, null, { timeout: 30000 });
  const inst = await pg.evaluate(() => { const m = S.sections[1].cards[0].steps[0].media.at(-1); return { kind: m.kind, size: MEDIA[m.id].blob.size, clip: m.clip }; });
  assert(inst.kind === 'file' && inst.size > 10000 && inst.clip.q === 'medium', 'clip installed');
  // Images tab: thumbnail, then the installed clip plays when clicked
  await pg.evaluate(() => { vpClose(); setTab('img'); IM.mode = 'stack'; renderR(); });
  assert.strictEqual(await pg.evaluate(() => document.querySelectorAll('#p-img video').length), 0, 'no video loaded before clicking');
  await pg.evaluate(() => document.querySelectorAll('#p-img .vth')[1].click()); await pg.waitForTimeout(1500);
  const playing = await pg.evaluate(() => { const v = document.querySelector('#p-img video'); return { w: v.videoWidth, t: v.currentTime, dur: v.duration }; });
  assert(playing.w === 1280 && playing.t > 0 && Math.abs(playing.dur - 3) < 0.2, 'installed clip plays: ' + JSON.stringify(playing));
  await pg.evaluate(() => document.querySelectorAll('#p-img .vth')[0].click()); await pg.waitForTimeout(1500);
  const linked = await pg.evaluate(() => document.querySelectorAll('#p-img video')[0].currentTime);
  assert(linked >= 12 && linked <= 15, 'linked clip plays its part of the video: ' + linked);
  // a video chosen on a step's Images tab opens the player and can be linked (Electron gives the file's location)
  await pg.evaluate(() => { select(S.sections[2].cards[0].steps[0]); setTab('img'); renderR(); });
  await pg.setInputFiles('#mfile', vid); await pg.waitForTimeout(800);
  assert(await pg.evaluate(() => PV3 && !$('#vaLink').disabled), 'Images tab video: player open, link offered');
  await pg.evaluate(() => $('#vaLink').click()); await pg.waitForTimeout(1500);
  assert(await pg.evaluate(() => S.videos.length === 2 && S.videos[1].link && Math.round(vpDur()) === 30), 'linked from the Images tab and playing');
  await pg.evaluate(() => vpClose());
  // Export > Printable checklist: the real PDF from Electron, shown in the preview and saved where the Save dialog says
  const pdfOut = path.join(work, 'printed checklist.pdf');
  await ea.evaluate(({ dialog }, f) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: f }); }, pdfOut);
  await pg.evaluate(() => { document.querySelector('[data-m="export"]').click(); document.querySelector('#xp [data-xk=pdf]').click(); });
  await pg.waitForFunction(() => /^Page 1 of \d+/.test($('#xpinfo').textContent) && document.querySelector('#xppages canvas'), null, { timeout: 30000 });
  const pdfInfo = await pg.evaluate(() => ({ pages: XP.pages, shown: document.querySelectorAll('#xppages .xppg').length }));
  await pg.evaluate(() => document.querySelector('#xpgo').click()); await pg.waitForTimeout(800);
  const pdfFile = fs.readFileSync(pdfOut);
  assert(pdfFile.slice(0, 5).toString() === '%PDF-' && pdfInfo.pages >= 4 && pdfInfo.shown === pdfInfo.pages && (pdfFile.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length === pdfInfo.pages, 'printable PDF made and saved: ' + JSON.stringify(pdfInfo));
  // saved to disk with the clip inside
  await pg.evaluate(async () => { DIRTY = true; await flush(); });
  const saved = JSON.parse(fs.readFileSync(path.join(app, 'Saves', (await pg.evaluate(() => CUR)) + '.bcl'), 'utf8'));
  assert(Object.values(saved.files).some(f => f.type === 'video/mp4' && f.data.length > 10000) && saved.videos[0].link, 'clip saved inside the file, video linked');
  await ea.close();
  fs.rmSync(work, { recursive: true, force: true });
  assert.deepStrictEqual(errors, [], 'no page errors');
  console.log('All app tests passed. Clip sizes (with sound): native ' + sizes[0] + ', medium ' + sizes[1] + ', low ' + sizes[2] + '; printable PDF ' + pdfInfo.pages + ' pages');
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
