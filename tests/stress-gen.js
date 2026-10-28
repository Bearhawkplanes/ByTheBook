// builds stress test checklists: N photos, 3 PDFs (one 400 pages), clips, drawings/text, a full log
// Stress test, part 1: builds a huge checklist (12 sections, 300 main items, 3,600 steps, N photos, 3 PDFs incl. one of 400 pages,
// 60 installed clips, drawings/text, a 5,000-entry log). Usage: node tests/stress-gen.js <photos, e.g. 300> <out.bcl>
// Note: about 450 photos of ~0.6 MB is the most one checklist can hold today (the app keeps a checklist as one piece of text, max ~512 MB).
const { chromium } = require('playwright'), fs = require('fs'), os = require('os'), path = require('path'), { execFileSync } = require('child_process');
const ST = path.join(os.tmpdir(), 'bcl-stress'), FF = require('ffmpeg-static');
fs.mkdirSync(path.join(ST, 'img'), { recursive: true });
for (let i = 1; i <= 60; i++) { const f = path.join(ST, 'img', 'p' + i + '.jpg'); if (!fs.existsSync(f)) execFileSync(FF, ['-v', 'error', '-y', '-f', 'lavfi', '-i', `testsrc2=size=1600x1200:rate=1,noise=alls=${i % 20 + 8}:allf=t,hue=h=${i * 37 % 360}`, '-frames:v', '1', '-q:v', '4', f]); }
for (let i = 1; i <= 5; i++) { const f = path.join(ST, 'clip' + i + '.mp4'); if (!fs.existsSync(f)) execFileSync(FF, ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=size=1280x720:rate=30:duration=4', '-f', 'lavfi', '-i', 'sine=duration=4', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '26', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', f]); }
const nImg = +process.argv[2] || 300, out = process.argv[3] || path.join(ST, 'Stress ' + nImg + '.bcl');
(async () => {
  const imgs = Array.from({ length: 60 }, (_, i) => 'data:image/jpeg;base64,' + fs.readFileSync(path.join(ST, 'img', 'p' + (i + 1) + '.jpg')).toString('base64'));
  const pdfFile = n => path.join(ST, 'manual' + n + '.pdf');
  if (!fs.existsSync(pdfFile(400))) {
    const b = await chromium.launch(), pg = await b.newPage();
    for (const n of [400, 60, 12]) {
      const html = '<style>@page{size:Letter;margin:0.5in}body{font-family:sans-serif}.p{page-break-after:always;height:9.8in}img{width:100%;max-height:6in;object-fit:cover}</style>' +
        Array.from({ length: n }, (_, i) => `<div class="p"><h2>Section ${Math.floor(i / 20) + 1} - page ${i + 1}</h2><p>${'Procedure text for this page. Torque values, sequences and notes. '.repeat(20)}</p>${i % 3 === 0 ? `<img src="file://${ST}/img/p${i % 60 + 1}.jpg">` : ''}</div>`).join('');
      fs.writeFileSync(path.join(ST, 'm.html'), html); await pg.goto('file://' + path.join(ST, 'm.html')); await pg.pdf({ path: pdfFile(n), format: 'Letter' });
    }
    await b.close();
  }
  const pdfs = [400, 60, 12].map((n, i) => ({ id: 'pdf' + i, name: 'Manual part ' + (i + 1), offset: 0, map: {}, data: 'data:application/pdf;base64,' + fs.readFileSync(pdfFile(n)).toString('base64') }));
  const clips = [1, 2, 3, 4, 5].map(i => 'data:video/mp4;base64,' + fs.readFileSync(path.join(ST, 'clip' + i + '.mp4')).toString('base64'));
  const verbs = ['Inspect', 'Torque', 'Install', 'Remove', 'Clean', 'Measure', 'Adjust', 'Lubricate', 'Check', 'Replace', 'Secure', 'Align'];
  const parts = ['bearing housing', 'drive shaft', 'pump mount', 'coupling', 'gearbox cover', 'seal carrier', 'motor bracket', 'belt guard', 'valve body', 'hose clamp', 'pulley', 'idler arm', 'filter housing', 'sensor mount', 'access panel'];
  const files = {}; let fileN = 0, imgN = 0;
  const addImg = (draw) => { const id = 'i' + (++fileN); files[id] = { name: 'photo' + fileN + '.jpg', type: 'image/jpeg', data: imgs[imgN++ % 60] }; const m = { kind: 'file', id, type: 'image', name: 'photo' + fileN + '.jpg' };
    if (draw) { m.draw = { w: 1600, h: 1200, s: Array.from({ length: 6 }, (_, k) => ({ c: '#e5332a', w: 8, p: Array.from({ length: 40 }, (_, q) => Math.round(200 + k * 150 + Math.sin(q / 4) * 100 + q * 20)) })) }; m.text = Array.from({ length: 8 }, (_, k) => ({ x: 100 + k * 180, y: 900, t: String(k + 1), f: 'Inter', s: 60, c: '#ffd400', b: true })); }
    return m; };
  const sections = [], total = { items: 0, steps: 0 };
  let imgsLeft = nImg;
  for (let si = 0; si < 12; si++) {
    const cards = [];
    for (let ci = 0; ci < 25; ci++) {
      const steps = [];
      for (let j = 0; j < 12; j++) {
        const media = [];
        if (imgsLeft > 0 && (si * 300 + ci * 12 + j) % Math.max(1, Math.floor(3600 / nImg)) === 0) { media.push(addImg(imgsLeft % 10 === 0)); imgsLeft--; }
        steps.push({ text: `${verbs[(ci + j) % 12]} ${parts[(si + ci + j) % 15]}${j % 4 === 0 ? ' and record the reading on the sheet before moving on' : ''}`, qty: j % 3 === 0 ? String(2 + j) : '', size: j % 3 === 0 ? 'M8 x 25' : '', spec: j % 5 === 0 ? (20 + j) + ' Nm' : '', desc: 'Step notes. '.repeat(15), page: (si + 1) + '-' + (ci * 2 + 1 + (j >> 2)), pdf: 'pdf' + (si % 3), media, done: false, init: '', doneAt: '', sig: null, sigDraft: '', hist: [], ver: j % 2 === 0, src: 'manual' });
        total.steps++;
      }
      const cm = ci % 5 === 0 ? [{ kind: 'file', id: 'v' + (++fileN), type: 'video', name: 'clip.mp4', clip: { start: 10, end: 14, q: 'medium', sound: true } }] : [];
      cm.forEach(m => files[m.id] = { name: 'clip.mp4', type: 'video/mp4', data: clips[fileN % 5] });
      cards.push({ text: `${parts[(si + ci) % 15].replace(/^./, c => c.toUpperCase())} assembly ${ci + 1}`, desc: 'Main item description. '.repeat(10), page: (si + 1) + '-' + (ci * 2 + 1), pdf: 'pdf' + (si % 3), media: cm, steps, done: false, sig: null, sigDraft: '', hist: [], qty: '', size: '', spec: '', ver: false, src: 'manual' });
      total.items++;
    }
    sections.push({ title: 'Section ' + (si + 1) + ': ' + ['Teardown', 'Inspection', 'Cleaning', 'Machining', 'Assembly', 'Lubrication', 'Electrical', 'Hydraulics', 'Testing', 'Paint', 'Final checks', 'Handover'][si], sign: si % 2 === 1, cards });
  }
  const log = Array.from({ length: 5000 }, (_, i) => ({ at: new Date(1.75e12 + i * 6e4).toISOString(), ev: 'step checked', item: 'Step ' + i, by: 'Tech ' + (i % 7), uid: 'u' + (i % 7) }));
  const o = { name: path.basename(out, '.bcl'), mech: true, manual: 'Service manual rev F', pdfs, videos: [], sections, locked: false, log, files };
  const t = JSON.stringify(o); fs.writeFileSync(out, t);
  console.log(JSON.stringify({ file: out, MB: +(t.length / 1048576).toFixed(1), items: total.items, steps: total.steps, images: nImg, clips: Object.values(files).filter(f => f.type === 'video/mp4').length, pdfMB: pdfs.map(p => +(p.data.length * 0.75 / 1048576).toFixed(1)) }));
})();
