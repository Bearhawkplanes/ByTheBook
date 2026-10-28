// File storage for checklists (.bcl). Pure Node so it can be tested without Electron.
// All writes are asynchronous (the app stays responsive with large embedded PDFs) and queued per file.
const fs = require('fs'), fsp = fs.promises, path = require('path');
const clean = n => String(n).replace(/[\\/:*?"<>|]+/g, '_').trim() || 'unnamed';
module.exports = (getDir, trash) => {
  const file = n => path.join(getDir(), path.basename(n));
  const bakOf = n => path.join(getDir(), 'Backups', path.basename(n) + '.bak');
  const uniq = base => { base = clean(base); let n = base, k = 2; while (fs.existsSync(path.join(getDir(), n + '.bcl'))) n = base + ' ' + k++; return n; };
  const put = async (base, text) => { const n = uniq(base); await fsp.writeFile(file(n + '.bcl'), text); return n; };
  const chains = new Map();
  const queue = (f, fn) => { const p = (chains.get(f) || Promise.resolve()).then(fn); chains.set(f, p.catch(() => {})); return p; };
  const swap = async (tmp, f) => { for (let i = 0; ; i++) { try { return await fsp.rename(tmp, f); } catch (e) { if (i >= 4) throw e; await new Promise(r => setTimeout(r, 120)); } } }; // antivirus can briefly lock files on Windows
  return {
    list: () => { try { return fs.readdirSync(getDir()).filter(f => /\.bcl$/i.test(f)).map(f => ({ name: f.replace(/\.bcl$/i, ''), mtime: fs.statSync(path.join(getDir(), f)).mtimeMs })); } catch (e) { return []; } },
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
