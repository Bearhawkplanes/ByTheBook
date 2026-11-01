// Writes a small PDF built like real ones: page labels (i, ii, then 1..6), bookmarks with named destinations, nested bookmarks and a "go to" action.
// Used by tests/page-test.js; also handy by hand: node tests/make-workbook-pdf.js out.pdf
// a "real-world" style PDF: 8 pages, page labels i, ii then 1..6; bookmarks using named destinations and nested entries
const fs = require('fs'); const o = {}, N = 8, pg = i => 40 + i, ct = i => 60 + i;
o[1] = '<< /Type /Catalog /Pages 2 0 R /Outlines 3 0 R /Names << /Dests 4 0 R >> /PageLabels << /Nums [0 << /S /r >> 2 << /S /D /St 1 >>] >> /PageMode /UseOutlines >>';
o[2] = '<< /Type /Pages /Count ' + N + ' /Kids [' + Array.from({ length: N }, (_, i) => pg(i) + ' 0 R').join(' ') + '] >>';
o[4] = '<< /Names [(ch1) [' + pg(2) + ' 0 R /XYZ 0 792 0] (ch2) [' + pg(5) + ' 0 R /Fit] (torque) [' + pg(3) + ' 0 R /Fit]] >>';
o[3] = '<< /Type /Outlines /First 10 0 R /Last 12 0 R /Count 5 >>';
o[10] = '<< /Title (Introduction) /Parent 3 0 R /Next 11 0 R /Dest [' + pg(0) + ' 0 R /Fit] >>';
o[11] = '<< /Title (Engine Block) /Parent 3 0 R /Prev 10 0 R /Next 12 0 R /Dest (ch1) /First 13 0 R /Last 14 0 R /Count 2 >>';
o[13] = '<< /Title (Crankshaft torque specs) /Parent 11 0 R /Next 14 0 R /Dest (torque) >>';
o[14] = '<< /Title (Bearing clearances) /Parent 11 0 R /Prev 13 0 R /A << /S /GoTo /D [' + pg(4) + ' 0 R /Fit] >> >>';
o[12] = '<< /Title (Cylinder Heads) /Parent 3 0 R /Prev 11 0 R /Dest (ch2) >>';
for (let i = 0; i < N; i++) { o[ct(i)] = '<< /Length 44 >>\nstream\nBT /F1 24 Tf 40 700 Td (Page ' + (i + 1) + ') Tj ET\nendstream'; o[pg(i)] = '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ' + ct(i) + ' 0 R /Resources << /Font << /F1 5 0 R >> >> >>'; }
o[5] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';
let out = '%PDF-1.4\n'; const off = {}, ids = Object.keys(o).map(Number).sort((a, b) => a - b); for (const k of ids) { off[k] = out.length; out += k + ' 0 obj\n' + o[k] + '\nendobj\n'; }
const max = ids.at(-1), x = out.length; out += 'xref\n0 ' + (max + 1) + '\n0000000000 65535 f \n'; for (let k = 1; k <= max; k++) out += off[k] != null ? String(off[k]).padStart(10, '0') + ' 00000 n \n' : '0000000000 65535 f \n';
out += 'trailer\n<< /Size ' + (max + 1) + ' /Root 1 0 R >>\nstartxref\n' + x + '\n%%EOF'; if (require.main === module) fs.writeFileSync(process.argv[2], out);
module.exports = Buffer.from(out, 'latin1');
