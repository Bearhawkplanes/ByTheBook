// The checklist file format (.bcl). Pure Node, so it can be tested without Electron.
// One file per checklist, so it can still be copied and shared as one thing. Inside:
//   'BCLC1\n' | media (photos, PDFs, videos: raw bytes, each written once) | checklist JSON | index JSON | 40-byte trailer
// A save appends only what is new (new media, if any) plus the checklist JSON, the index (where each piece of media is) and a
// trailer, so ticking a box never rewrites the photos and PDFs. Readers use the last complete trailer: a save cut short (power cut)
// falls back to the one before. Older checklist copies and removed media are dead space until compact() rewrites the file.
// In the checklist JSON a media field holds 'bcl-media:<key>'; the page sends new media as data: URLs. Keys: 'm:'+file id (images,
// clips), 'p:'+PDF id, 'v:'+video id. Files from before this format (plain JSON with data: URLs) are converted by convert().
const fs = require('fs'), fsp = fs.promises, crypto = require('crypto');
const MAGIC = Buffer.from('BCLC1\n'), TM = Buffer.from('BCLT'), TL = 40, REF = 'bcl-media:', CHUNK = 1 << 22;
const check = (...b) => { const h = crypto.createHash('sha256'); b.forEach(x => h.update(x)); return h.digest().subarray(0, 4); };
const isContainer = async f => { const fh = await fsp.open(f, 'r'); try { const b = Buffer.alloc(MAGIC.length); await fh.read(b, 0, b.length, 0); return b.equals(MAGIC); } finally { await fh.close(); } };
const swap = async (tmp, f) => { for (let i = 0; ; i++) { try { return await fsp.rename(tmp, f); } catch (e) { if (i >= 4) throw e; await new Promise(r => setTimeout(r, 120)); } } };   // antivirus can briefly lock files on Windows

// the last complete save: {skel (Buffer), media: {key: [offset, length, type]}, end, size}
const cache = new Map();   // file -> {size, mtime, ix}
async function openIndex(f) {
  const st = await fsp.stat(f), c = cache.get(f); if (c && c.size === st.size && c.mtime === st.mtimeMs) return c.ix;
  const fh = await fsp.open(f, 'r');
  try {
    const at = async end => {
      if (end < MAGIC.length + TL) return null; const t = Buffer.alloc(TL); await fh.read(t, 0, TL, end - TL); if (!t.subarray(0, 4).equals(TM)) return null;
      const so = Number(t.readBigUInt64LE(4)), sl = Number(t.readBigUInt64LE(12)), io = Number(t.readBigUInt64LE(20)), il = Number(t.readBigUInt64LE(28));
      if (so < MAGIC.length || io !== so + sl || io + il !== end - TL || il > 1 << 30 || sl > 1 << 30) return null;
      const s = Buffer.alloc(sl), x = Buffer.alloc(il); await fh.read(s, 0, sl, so); await fh.read(x, 0, il, io);
      if (!check(s, x).equals(t.subarray(36, 40))) return null;
      try { return { skel: s, media: JSON.parse(x.toString('utf8')).media || {}, end, size: st.size }; } catch (e) { return null; }
    };
    let ix = await at(st.size);
    // a save was cut short: look back for the last complete trailer
    for (let hi = st.size; !ix && hi > MAGIC.length; hi -= CHUNK) {
      const lo = Math.max(0, hi - CHUNK), b = Buffer.alloc(Math.min(st.size, hi + TM.length - 1) - lo); await fh.read(b, 0, b.length, lo);
      for (let i = b.lastIndexOf(TM); i >= 0 && !ix; i = i > 0 ? b.lastIndexOf(TM, i - 1) : -1) if (lo + i < hi) ix = await at(lo + i + TL);
    }
    if (!ix) throw new Error('This checklist file is damaged');
    cache.set(f, { size: st.size, mtime: st.mtimeMs, ix }); return ix;
  } finally { await fh.close(); }
}
const dataUrl = v => { const m = /^data:([^;,]*)((?:;[^;,]*)*),/.exec(v); if (!m) throw new Error('Bad media data');
  const body = v.slice(m[0].length); return { type: m[1] || 'application/octet-stream', buf: /;base64/i.test(m[2]) ? Buffer.from(body, 'base64') : Buffer.from(decodeURIComponent(body)) }; };
// where media sits in a checklist object, with the key it is stored under (very old files kept a single PDF in o.pdf)
function slots(o) {
  if (typeof o.pdf === 'string' && !(o.pdfs && o.pdfs.length)) o.pdfs = [{ name: o.manual || 'Manual', offset: o.offset || 0, map: o.map || {}, data: o.pdf }];
  delete o.pdf; const out = [], id = () => 'x' + crypto.randomBytes(4).toString('hex');
  for (const [k, m] of Object.entries(o.files || {})) if (m && typeof m.data === 'string') out.push({ obj: m, key: 'm:' + k });
  for (const p of o.pdfs || []) if (p && typeof p.data === 'string') { p.id = p.id || id(); out.push({ obj: p, key: 'p:' + p.id }); }
  for (const v of o.videos || []) if (v && typeof v.data === 'string') { v.id = v.id || id(); out.push({ obj: v, key: 'v:' + v.id }); }
  return out;
}
// turns the media fields into references; returns what has to be in the file: new media as bytes, existing as ranges of src
function resolve(o, src, srcFile) {
  const items = new Map();
  for (const s of slots(o)) {
    const v = s.obj.data;
    if (v.startsWith(REF)) { const k = v.slice(REF.length), e = src && src.media[k]; if (!e) throw new Error('A photo, PDF or video is missing from the checklist file (' + k + ')'); items.set(k, { type: e[2], off: e[0], len: e[1], file: srcFile }); }
    else { const d = dataUrl(v); s.obj.data = REF + s.key; items.set(s.key, { type: d.type, buf: d.buf }); }
  }
  return items;
}
async function copyRange(from, out, off, len, buf) { const fh = await fsp.open(from, 'r'); try { for (let p = 0; p < len;) { const n = Math.min(buf.length, len - p); await fh.read(buf, 0, n, off + p); await out.write(buf, 0, n); p += n; } } finally { await fh.close(); } }
const trailer = (so, sl, io, il, s, x) => { const t = Buffer.alloc(TL); TM.copy(t); t.writeBigUInt64LE(BigInt(so), 4); t.writeBigUInt64LE(BigInt(sl), 12); t.writeBigUInt64LE(BigInt(io), 20); t.writeBigUInt64LE(BigInt(il), 28); check(s, x).copy(t, 36); return t; };
// a whole new file (written beside it, then renamed over): header, the media in use, checklist, index, trailer
async function writeFresh(dest, items, skel) {
  const tmp = dest + '.tmp', out = await fsp.open(tmp, 'w'), media = {}, buf = Buffer.alloc(CHUNK); let pos = 0;
  const put = async b => { await out.write(b, 0, b.length); pos += b.length; };
  try {
    await put(MAGIC);
    for (const [k, it] of items) { const off = pos; if (it.buf) await put(it.buf); else { await copyRange(it.file, out, it.off, it.len, buf); pos += it.len; } media[k] = [off, it.buf ? it.buf.length : it.len, it.type]; }
    const x = Buffer.from(JSON.stringify({ v: 1, media })), so = pos; await put(skel); const io = pos; await put(x); await put(trailer(so, skel.length, io, x.length, skel, x));
    await out.sync();
  } catch (e) { await out.close(); await fsp.unlink(tmp).catch(() => {}); throw e; }
  await out.close(); await swap(tmp, dest); cache.delete(dest);
}
module.exports = {
  REF, isContainer, openIndex,
  // the checklist JSON (with media references)
  read: async f => (await openIndex(f)).skel.toString('utf8'),
  readMedia: async (f, key) => { const e = (await openIndex(f)).media[key]; if (!e) throw new Error('Missing ' + key); const b = Buffer.alloc(e[1]), fh = await fsp.open(f, 'r'); try { await fh.read(b, 0, e[1], e[0]); } finally { await fh.close(); } return b; },
  // saves the checklist JSON `text` to f. Media references point into `from` (another checklist file, e.g. for Save as / a new job /
  // an export) or, without it, into f itself; then only new media and the checklist are appended to f.
  save: async (f, text, from, opts) => {
    opts = opts || {}; const srcFile = from || f;
    const src = fs.existsSync(srcFile) && await isContainer(srcFile) ? await openIndex(srcFile) : null;
    // most saves (a tick, a note) bring no new media: then the text is stored as it is, without parsing a big checklist twice
    let items, skel;
    if (src && !/(?<!\\)"data:/.test(text) && !/"pdf":"(?!")/.test(text)) { items = new Map(); for (const m of text.matchAll(/(?<!\\)"bcl-media:([^"\\]+)"/g)) { const k = m[1], e = src.media[k]; if (!e) throw new Error('A photo, PDF or video is missing from the checklist file (' + k + ')'); items.set(k, { type: e[2], off: e[0], len: e[1], file: srcFile }); } JSON.parse(text); skel = Buffer.from(text); }
    else { const o = JSON.parse(text); items = resolve(o, src, srcFile); skel = Buffer.from(JSON.stringify(o)); }
    if (from || !src) return writeFresh(f, items, skel);
    const fh = await fsp.open(f, 'r+'), media = {}; let pos = src.end;
    try {
      await fh.truncate(src.end);   // drop a save that was cut short
      for (const [k, it] of items) { if (it.buf) { await fh.write(it.buf, 0, it.buf.length, pos); media[k] = [pos, it.buf.length, it.type]; pos += it.buf.length; } else media[k] = [it.off, it.len, it.type]; }
      const x = Buffer.from(JSON.stringify({ v: 1, media })), so = pos; await fh.write(skel, 0, skel.length, pos); pos += skel.length;
      const io = pos; await fh.write(x, 0, x.length, pos); pos += x.length; const t = trailer(so, skel.length, io, x.length, skel, x); await fh.write(t, 0, TL, pos); pos += TL;
      await fh.sync();
    } finally { await fh.close(); }
    cache.delete(f);
    // dead space (older saves, removed media) is cleared once it is big compared with what is in use
    const used = MAGIC.length + Object.values(media).reduce((a, e) => a + e[1], 0) + skel.length, dead = pos - used;
    if (opts.compact || dead > Math.max(opts.minDead || 64 * 1048576, used * 0.5)) { if (opts.beforeCompact) await opts.beforeCompact(); await module.exports.compact(f); }
  },
  compact: async f => { const ix = await openIndex(f), items = new Map(Object.entries(ix.media).map(([k, e]) => [k, { type: e[2], off: e[0], len: e[1], file: f }])); await writeFresh(f, items, ix.skel); },
  // a file from before this format: plain JSON with data: URLs inside
  convert: async f => { const o = JSON.parse(await fsp.readFile(f, 'utf8')), items = resolve(o, null, f); await writeFresh(f, items, Buffer.from(JSON.stringify(o))); },
  // sizes for the storage bar: what is in use, and the whole file including dead space
  info: async f => { const ix = await openIndex(f), media = Object.values(ix.media).reduce((a, e) => a + e[1], 0); return { file: ix.size, media, checklist: ix.skel.length, used: MAGIC.length + media + ix.skel.length }; }
};
