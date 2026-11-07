// File storage for checklists (.bcl). Pure Node so it can be tested without Electron.
// All writes are asynchronous (the app stays responsive with large embedded PDFs) and queued per file.
const fs = require('fs'), fsp = fs.promises, path = require('path'), B = require('./bcl');   // bcl.js: the file format
const clean = n => String(n).replace(/[\\/:*?"<>|]+/g, '_').trim() || 'unnamed';
module.exports = (getDir, trash) => {
  const file = n => path.join(getDir(), path.basename(n));
  const bakOf = n => path.join(getDir(), 'Backups', path.basename(n) + '.bak');
  const uniq = base => { base = clean(base); let n = base, k = 2; while (fs.existsSync(path.join(getDir(), n + '.bcl'))) n = base + ' ' + k++; return n; };
  const put = async (base, text, from) => { const n = uniq(base); await B.save(file(n + '.bcl'), text, from); return n; };
  // one backup copy per checklist, refreshed at most every 5 minutes (30 for big files, which take a while to copy). It runs beside the
  // saves, not before them: copying a big file takes seconds on a slow drive. A copy taken while a save is being added is still
  // valid (readers use the last complete save in it). Compaction waits for it (it renames over the file).
  const bk = new Map();
  const bgBackup = (n, f) => { if (!bk.has(f)) bk.set(f, backup(n, f).finally(() => bk.delete(f))); };
  const backup = async (n, f) => { try { if (!fs.existsSync(f)) return; const b = bakOf(n), size = (await fsp.stat(f)).size; await fsp.mkdir(path.dirname(b), { recursive: true });
    let old = true; try { old = Date.now() - (await fsp.stat(b)).mtimeMs > (size > 100 * 1048576 ? 1800000 : 300000); } catch (e) {} if (!old) return;
    // copies the file up to its last complete save: saves only ever add after that point, so the copy stays consistent while they run
    if (!(await B.isContainer(f))) return await fsp.copyFile(f, b); const end = (await B.openIndex(f)).end, tmp = b + '.tmp', src = await fsp.open(f, 'r'), out = await fsp.open(tmp, 'w'), buf = Buffer.alloc(1 << 22);
    try { for (let p = 0; p < end;) { const { bytesRead } = await src.read(buf, 0, Math.min(buf.length, end - p), p); if (!bytesRead) throw new Error('short read'); await out.write(buf, 0, bytesRead); p += bytesRead; } await out.close(); await fsp.rename(tmp, b); }
    catch (e) { await out.close().catch(() => {}); await fsp.unlink(tmp).catch(() => {}); } finally { await src.close(); } } catch (e) {} };
  // a file from before the current format is converted the first time it is read (the original is kept as its backup)
  const known = new Set();   // files already in the current format: no need to wait in the queue to check again
  const ready = async f => { if (known.has(f)) return; try { if (await B.isContainer(f)) return known.add(f); } catch (e) { return; } return queue(f, async () => { if (!(await B.isContainer(f))) { const n = path.basename(f), b = bakOf(n); await fsp.mkdir(path.dirname(b), { recursive: true }); await fsp.copyFile(f, b); await B.convert(f); } known.add(f); }); };
  // files saved by this version start with {"app": and carry the stamp right after it, so no stamp in the first piece means none.
  // the stamp sits at the start of files saved by this version; older files are scanned in pieces (never read whole: they can be hundreds of MB)
  const scanStamp = async f => { const fh = await fsp.open(f, 'r'), buf = Buffer.alloc(1 << 22), re = /"stamp":\{"pid":"([0-9a-f]{32})"/; let pos = 0, tail = '';
    try { for (;;) { const { bytesRead } = await fh.read(buf, 0, buf.length, pos); if (!bytesRead) return ''; const t = tail + buf.toString('latin1', 0, bytesRead), m = re.exec(t); if (m) return m[1]; if (!pos && t.startsWith('{"app":')) return ''; tail = t.slice(-60); pos += bytesRead; } } finally { await fh.close(); } };
  const stamps = new Map();   // file -> {mtime, pid, locked, worker}: each file is read again only after it changes
  // pack() writes app, stamp, locked, worker first, so the master lock and worker mode are read from the head too
  const LOCKED = /^\{(?:"app":"[^"]*",)?(?:"stamp":\{(?:[^{}]|\{[^{}]*\})*\},)?"locked":true/, WORKER = /^\{(?:"app":"[^"]*",)?(?:"stamp":\{(?:[^{}]|\{[^{}]*\})*\},)?(?:"locked":(?:true|false),)?"worker":true/;
  const stampOf = async (f, mtime) => { const c = stamps.get(f); if (c && c.mtime === mtime) return c; const r = { mtime, pid: '', locked: false, worker: false };
    try { if (await B.isContainer(f)) { const sk = (await B.openIndex(f)).skel, h = sk.toString('latin1', 0, 4096), m = /"stamp":\{"pid":"([0-9a-f]{32})"/.exec(h); r.pid = m ? m[1] : ''; r.locked = LOCKED.test(h); r.worker = WORKER.test(h);
      try { const o = JSON.parse(sk.toString('utf8')); let d = 0, t = 0; for (const sec of o.sections || []) for (const c of sec.cards || []) { t++; if (c.done) d++; } r.done = d; r.total = t; } catch (e) {} }   // main items done, for the folder page
      else r.pid = await scanStamp(f); } catch (e) {}
    stamps.set(f, r); return r; };
  const chains = new Map();
  const queue = (f, fn) => { const p = (chains.get(f) || Promise.resolve()).then(fn); chains.set(f, p.catch(() => {})); return p; };
  return {
    list: async () => {   // pid: the profile stamp, so the list can flag checklists from another profile
      let names; try { names = fs.readdirSync(getDir()).filter(f => /\.bcl$/i.test(f)); } catch (e) { return []; }
      const out = [];
      for (const f of names) { try { const p = path.join(getDir(), f), mtime = fs.statSync(p).mtimeMs; const s = await stampOf(p, mtime); out.push({ name: f.replace(/\.bcl$/i, ''), mtime, pid: s.pid, locked: s.locked, worker: s.worker, done: s.done, total: s.total }); } catch (e) {} }   // one file at a time: they can be large
      return out;
    },
    // folders on the main menu: Saves/.folders.json {f:[{id,name,parent}], m:{checklist: folder id}}; only names, the files never move
    folders: () => { try { const d = JSON.parse(fs.readFileSync(path.join(getDir(), '.folders.json'), 'utf8')); return d && Array.isArray(d.f) ? d : { f: [], m: {} }; } catch (e) { return { f: [], m: {} }; } },
    foldersSet: d => { const str = v => String(v == null ? '' : v).slice(0, 200), f = (Array.isArray(d && d.f) ? d.f : []).slice(0, 5000).map(x => ({ id: str(x.id), name: str(x.name), parent: x.parent ? str(x.parent) : null })).filter(x => x.id && x.name);
      const m = {}; for (const [k, v] of Object.entries((d && d.m) || {}).slice(0, 100000)) if (v) m[str(k)] = str(v);
      const p = path.join(getDir(), '.folders.json'), t = p + '.tmp'; fs.writeFileSync(t, JSON.stringify({ v: 1, f, m })); fs.renameSync(t, p); return true; },
    read: async n => { await ready(file(n)); return B.read(file(n)); },   // the checklist itself; photos, PDFs and videos come one by one from media()
    media: async (n, key) => { await ready(file(n)); return B.readMedia(file(n), key); },
    info: async n => { await ready(file(n)); return B.info(file(n)); },
    // saves a checklist: only new media and the checklist are added to the file. `from`: another checklist whose media are used (Save as, a new job)
    write: (n, text, from) => queue(file(n), async () => { const f = file(n); bgBackup(n, f); if (from) await ready(file(from)); await B.save(f, text, from ? file(from) : null, { beforeCompact: () => bk.get(f) }); return { container: true }; }),
    writeNew: (base, text) => put(base, text),
    // an export somewhere else (Save dialog): a complete, tidy file with the media of checklist `from`
    exportTo: async (dest, text, from) => { await ready(file(from)); await B.save(dest, text, file(from)); return dest; },
    tidy: n => queue(file(n), async () => { const f = file(n); if (fs.existsSync(f) && await B.isContainer(f)) { const i = await B.info(f); if (i.file - i.used > 8 * 1048576) { await bk.get(f); await B.compact(f); } } return true; }),
    rename: (a, b) => { if (fs.existsSync(file(b))) throw new Error('A file with that name already exists'); fs.renameSync(file(a), file(b)); try { const ba = bakOf(a); if (fs.existsSync(ba)) fs.renameSync(ba, bakOf(b)); } catch (e) {} return true; },
    remove: async n => { const f = file(n); try { await trash(f); } catch (e) { fs.unlinkSync(f); } return true; },
    importPath: async p => { const base = path.basename(p).replace(/\.[^.]+$/, '');
      if (await B.isContainer(p)) { await B.openIndex(p); const n = uniq(base); await fsp.copyFile(p, file(n + '.bcl')); return n; }   // checked, then copied as it is
      const text = await fsp.readFile(p, 'utf8'); JSON.parse(text); return put(base, text); },
    backup: n => { try { const s = fs.statSync(bakOf(n)); return { mtime: s.mtimeMs, size: s.size }; } catch (e) { return null; } },
    restore: async n => { const b = bakOf(n), base = path.basename(n).replace(/\.bcl$/i, '') + ' (restored)';   // never overwrites: opens as a new file
      if (await B.isContainer(b)) { await B.openIndex(b); const m = uniq(base); await fsp.copyFile(b, file(m + '.bcl')); return m; }
      const text = await fsp.readFile(b, 'utf8'); JSON.parse(text); return put(base, text); }
  };
};
