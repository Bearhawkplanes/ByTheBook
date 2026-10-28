// File storage for checklists (.bcl). Pure Node so it can be tested without Electron.
// All writes are asynchronous (the app stays responsive with large embedded PDFs) and queued per file.
const fs = require('fs'), fsp = fs.promises, path = require('path');
const clean = n => String(n).replace(/[\\/:*?"<>|]+/g, '_').trim() || 'unnamed';
module.exports = (getDir, trash) => {
  const file = n => path.join(getDir(), path.basename(n));
  const bakOf = n => path.join(getDir(), 'Backups', path.basename(n) + '.bak');
  const uniq = base => { base = clean(base); let n = base, k = 2; while (fs.existsSync(path.join(getDir(), n + '.bcl'))) n = base + ' ' + k++; return n; };
  const put = async (base, text) => { const n = uniq(base); await fsp.writeFile(file(n + '.bcl'), text); return n; };
  // files saved by this version start with {"app": and carry the stamp right after it, so no stamp in the first piece means none.
  // the stamp sits at the start of files saved by this version; older files are scanned in pieces (never read whole: they can be hundreds of MB)
  const scanStamp = async f => { const fh = await fsp.open(f, 'r'), buf = Buffer.alloc(1 << 22), re = /"stamp":\{"pid":"([0-9a-f]{32})"/; let pos = 0, tail = '';
    try { for (;;) { const { bytesRead } = await fh.read(buf, 0, buf.length, pos); if (!bytesRead) return ''; const t = tail + buf.toString('latin1', 0, bytesRead), m = re.exec(t); if (m) return m[1]; if (!pos && t.startsWith('{"app":')) return ''; tail = t.slice(-60); pos += bytesRead; } } finally { await fh.close(); } };
  const stamps = new Map();   // file -> {mtime, pid}: each file is read again only after it changes
  const stampOf = async (f, mtime) => { const c = stamps.get(f); if (c && c.mtime === mtime) return c.pid; let pid = '';
    try { pid = await scanStamp(f); } catch (e) {}
    stamps.set(f, { mtime, pid }); return pid; };
  const chains = new Map();
  const queue = (f, fn) => { const p = (chains.get(f) || Promise.resolve()).then(fn); chains.set(f, p.catch(() => {})); return p; };
  const swap = async (tmp, f) => { for (let i = 0; ; i++) { try { return await fsp.rename(tmp, f); } catch (e) { if (i >= 4) throw e; await new Promise(r => setTimeout(r, 120)); } } }; // antivirus can briefly lock files on Windows
  return {
    list: async () => {   // pid: the profile stamp, so the list can flag checklists from another profile
      let names; try { names = fs.readdirSync(getDir()).filter(f => /\.bcl$/i.test(f)); } catch (e) { return []; }
      const out = [];
      for (const f of names) { try { const p = path.join(getDir(), f), mtime = fs.statSync(p).mtimeMs; out.push({ name: f.replace(/\.bcl$/i, ''), mtime, pid: await stampOf(p, mtime) }); } catch (e) {} }   // one file at a time: they can be large
      return out;
    },
    read: n => fsp.readFile(file(n), 'utf8'),
    write: (n, text) => queue(file(n), async () => {   // atomic write; keeps one backup copy (refreshed at most every 5 min)
      const f = file(n), tmp = f + '.tmp';
      try { if (fs.existsSync(f)) { const b = bakOf(n); await fsp.mkdir(path.dirname(b), { recursive: true }); let old = true; try { old = Date.now() - (await fsp.stat(b)).mtimeMs > 300000; } catch (e) {} if (old) await fsp.copyFile(f, b); } } catch (e) {}
      try { await fsp.writeFile(tmp, text); await swap(tmp, f); } catch (e) { try { await fsp.unlink(tmp); } catch (x) {} throw e; }
      return true;
    }),
    writeNew: (base, text) => put(base, text),
    rename: (a, b) => { if (fs.existsSync(file(b))) throw new Error('A file with that name already exists'); fs.renameSync(file(a), file(b)); try { const ba = bakOf(a); if (fs.existsSync(ba)) fs.renameSync(ba, bakOf(b)); } catch (e) {} return true; },
    remove: async n => { const f = file(n); try { await trash(f); } catch (e) { fs.unlinkSync(f); } return true; },
    importPath: async p => { const text = await fsp.readFile(p, 'utf8'); JSON.parse(text); return put(path.basename(p).replace(/\.[^.]+$/, ''), text); },
    backup: n => { try { const s = fs.statSync(bakOf(n)); return { mtime: s.mtimeMs, size: s.size }; } catch (e) { return null; } },
    restore: async n => { const text = await fsp.readFile(bakOf(n), 'utf8'); JSON.parse(text); return put(path.basename(n).replace(/\.bcl$/i, '') + ' (restored)', text); }   // never overwrites: opens as a new file
  };
};
