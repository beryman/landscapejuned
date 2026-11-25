const { test } = require('node:test');
const assert = require('node:assert');
const G = require('../../apps/sketsa/geometry.js');
const R = require('../../apps/sketsa/render.js');
const X = require('../../apps/sketsa/export.js');
const L = require('./fixtures/l-shape.json');

const close = (a, b, eps = 1e-3) => Math.abs(a - b) < eps;
const line = (length) => ({ length, kind: 'line', radius: null, bulge: 'out' });
const v = (x, y) => ({ x, y, interiorAngle: null });
const rect = (w, h, right = line(h)) => G.solve({
  unit: 'cm', notes: [],
  vertices: [v(0, 0), v(200, 0), v(200, 100), v(0, 100)],
  edges: [line(w), right, line(w), line(h)],
});
const fixedL = () => { const s = structuredClone(L); s.edges[4].length = 25; return G.solve(s); };
const dxfPairs = (txt) => { const l = txt.split(/\r?\n/); const out = []; for (let i = 0; i + 1 < l.length; i += 2) out.push([l[i].trim(), l[i + 1].trim()]); return out; };

test('pickScale: 50 x 26 cm on A4 picks 1:10 and fits', () => {
  assert.deepEqual(X.pickScale(rect(50, 26), 'A4', 'cm'), { scale: 10, fits: true });
});

test('pickScale: 20000 x 10000 cm on A4 does not fit, scale 500', () => {
  assert.deepEqual(X.pickScale(rect(20000, 10000), 'A4', 'cm'), { scale: 500, fits: false });
});

test('toDXF: cm header, 6 outline LINEs, ends with EOF', () => {
  const dxf = X.toDXF(fixedL(), 'cm');
  const pairs = dxfPairs(dxf);
  const iu = pairs.findIndex((p) => p[0] === '9' && p[1] === '$INSUNITS');
  assert.deepEqual(pairs[iu + 1], ['70', '5']);
  const lines = pairs.map((p, i) => (p[0] === '0' && p[1] === 'LINE' ? pairs[i + 1] : null)).filter(Boolean);
  assert.equal(lines.filter((p) => p[0] === '8' && p[1] === 'GARIS_LUAR').length, 6);
  assert.deepEqual(pairs[pairs.length - 1], ['0', 'EOF']);
});

test('toDXF: arc edge emits ARC with radius and CCW start/end angles', () => {
  const s = rect(20, 10, { length: 10, kind: 'arc', radius: 8, bulge: 'out' });
  const pairs = dxfPairs(X.toDXF(s, 'cm'));
  const at = pairs.findIndex((p) => p[0] === '0' && p[1] === 'ARC');
  assert.ok(at >= 0);
  const get = (code) => Number(pairs.slice(at + 1).find((p) => p[0] === code)[1]);
  assert.ok(close(get('40'), 8));
  assert.ok(close(get('50'), 360 - Math.atan2(5, Math.sqrt(39)) * 180 / Math.PI));
  assert.ok(close(get('51'), Math.atan2(5, Math.sqrt(39)) * 180 / Math.PI));
});

test('toPDF: valid skeleton with matching xref offsets', () => {
  const bytes = X.toPDF(rect(50, 26), { paper: 'A4', scale: 10, unit: 'cm', title: 'Uji', date: '2026-11-24' });
  const txt = Buffer.from(bytes).toString('latin1');
  assert.ok(txt.startsWith('%PDF-1.4'));
  assert.ok(txt.trimEnd().endsWith('%%EOF'));
  const xref = txt.slice(txt.lastIndexOf('\nxref\n'));
  const startxref = Number(txt.match(/startxref\n(\d+)/)[1]);
  assert.ok(txt.startsWith('xref', startxref));
  const offsets = [...xref.matchAll(/^(\d{10}) 00000 n/gm)].map((m) => Number(m[1]));
  assert.ok(offsets.length >= 5);
  offsets.forEach((o, i) => assert.ok(txt.startsWith(`${i + 1} 0 obj`, o), `object ${i + 1} at ${o}`));
});

test('toPDF: at 1:10 a 50 cm edge is 141.732 pt (50 mm on paper)', () => {
  const txt = Buffer.from(X.toPDF(rect(50, 26), { paper: 'A4', scale: 10, unit: 'cm', title: 'Uji', date: '2026-11-24' })).toString('latin1');
  const m = txt.match(/([\d.]+) ([\d.]+) m ([\d.]+) ([\d.]+) l/);
  const d = Math.hypot(m[3] - m[1], m[4] - m[2]);
  assert.ok(close(d, 50 * 72 / 25.4, 0.01), `got ${d}`);
});

test('toSVG: conflict drawing shows computed and conflict classes and the message', () => {
  const svg = R.toSVG(G.solve(L), { unit: 'cm', title: 'Uji', date: '2026-11-24', scaleLabel: '1:10' });
  assert.ok(svg.startsWith('<svg'));
  assert.ok(svg.includes('st-computed'));
  assert.ok(svg.includes('st-conflict'));
  assert.ok(svg.includes('12*'));
});

test('toSVG: the area is set large inside the outline', () => {
  const s = fixedL();
  const svg = R.toSVG(s, { unit: 'cm', title: 'Uji', date: '2026-11-24', scaleLabel: '1:10' });
  const m = svg.match(/<text class="area__value" x="([-\d.]+)" y="([-\d.]+)"[^>]*>468 cm²<\/text>/);
  assert.ok(m, 'area value text');
  const x = Number(m[1]), y = -Number(m[2]); // SVG y is flipped
  const bb = R.bounds(s);
  assert.ok(x > bb.minX && x < bb.maxX && y > bb.minY && y < bb.maxY, `(${x}, ${y}) inside the outline box`);
  // The L's notch (x > 12, y > -14 measured from the top-left start) is outside the shape.
  assert.ok(!(x > 12 && y > -14), `(${x}, ${y}) not in the notch`);
});

test('toSVG: no title block under the drawing', () => {
  const svg = R.toSVG(fixedL(), { unit: 'cm', title: 'Uji', date: '2026-11-24', scaleLabel: '1:10' });
  assert.ok(!svg.includes('Satuan cm'));
  assert.ok(!svg.includes('Tanda:'));
  assert.ok(!svg.includes('>Uji<'));
});

test('toSVG: shows how the area was counted, piece by piece, under the drawing', () => {
  const svg = R.toSVG(fixedL(), { unit: 'cm' });
  assert.ok(svg.includes('Perhitungan luas'));
  assert.ok(!svg.includes('Cara hitung luas'));
  assert.ok(svg.includes('A1 = 12 cm × 26 cm = 312 cm²'));
  assert.ok(svg.includes('A2 = 13 cm × 12 cm = 156 cm²'));
  assert.ok(svg.includes('Total = A1 + A2 = 312 + 156 = 468 cm² (0,0468 m²)'));
  assert.ok(svg.includes('>A1<') && svg.includes('>A2<'), 'piece labels drawn in the shape');
});

test('toSVG: a slanted piece is counted as a trapezoid, in metres with no extra conversion', () => {
  const s = G.solve({ unit: 'm', notes: [], vertices: [v(100, 100), v(500, 100), v(800, 700), v(100, 700)], edges: [line(4), line(null), line(7), line(6)] });
  const svg = R.toSVG(s, { unit: 'm' });
  assert.ok(svg.includes('A1 = 4 m × 6 m = 24 m²'));
  assert.ok(svg.includes('A2 = (6 m + 0 m) ÷ 2 × 3 m = 9 m²'));
  assert.ok(svg.includes('Total = A1 + A2 = 24 + 9 = 33 m²<'), 'no "(… m²)" repeat when already in metres');
});

test('toSVG: a plain rectangle gets one line; an arc adds its segment line', () => {
  assert.ok(R.toSVG(rect(20, 10), { unit: 'cm' }).includes('Luas = 20 cm × 10 cm = 200 cm² (0,02 m²)'));
  const svg = R.toSVG(rect(20, 10, { length: 10, kind: 'arc', radius: 8, bulge: 'out' }), { unit: 'cm' });
  assert.ok(svg.includes('A1 = 20 cm × 10 cm = 200 cm²'));
  assert.ok(svg.includes('B1 = tembereng sisi 2 (R 8 cm, tali busur 10 cm) = +11,98 cm²'));
  assert.ok(svg.includes('Total = A1 + B1 = 200 + 11,98 = 211,98 cm² (0,0212 m²)'));
});

test('toSVG: millimetres also get their area in square metres', () => {
  const s = rect(2000, 1500);
  assert.ok(R.toSVG(s, { unit: 'mm' }).includes('Luas = 2000 mm × 1500 mm = 3000000 mm² (3 m²)'));
});

test('toSVG: no area label while the outline is in conflict', () => {
  assert.ok(!R.toSVG(G.solve(L), { unit: 'cm' }).includes('class="area__value"'));
});

test('angle labels: only a corner with a written angle is "written"; derived corners are not', () => {
  const s = G.solve({
    unit: 'cm', notes: [],
    vertices: [v(100, 100), { x: 300, y: 270, interiorAngle: 45 }, v(100, 300)],
    edges: [line(null), line(20), line(20)],
  });
  const items = R.angleItems(s);
  assert.equal(items.find((it) => it.k === 1).status, 'written');
  assert.equal(items.find((it) => it.k === 0).status, 'computed');
});

test('estimate note is printed on the SVG (PNG) and in the DXF', () => {
  const s = fixedL();
  assert.ok(R.toSVG(s, { unit: 'cm', title: 'Uji', date: 'x', note: 'Ada ukuran perkiraan (~)' }).includes('Ada ukuran perkiraan (~)'));
  assert.ok(X.toDXF(s, 'cm', 'Ada ukuran perkiraan (~)').includes('Ada ukuran perkiraan (~)'));
});

test('toSVG sets pixel width and height when asked, keeping the aspect', () => {
  const svg = R.toSVG(fixedL(), { unit: 'cm', title: 'Uji', date: 'x', pixelWidth: 2400 });
  const [, , vw, vh] = svg.match(/viewBox="([^"]+)"/)[1].split(' ').map(Number);
  assert.ok(svg.includes('width="2400"'));
  assert.ok(svg.includes(`height="${Math.round((2400 * vh) / vw)}"`));
});

test('no em dash in SVG or PDF text', () => {
  const s = fixedL();
  assert.ok(!R.toSVG(s, { unit: 'cm', title: 'Uji', date: 'x', scaleLabel: '1:10' }).includes('—'));
  const txt = Buffer.from(X.toPDF(s, { paper: 'A4', scale: 10, unit: 'cm', title: 'Uji', date: 'x', note: 'Ada ukuran perkiraan' })).toString('latin1');
  assert.ok(!txt.includes('—'));
});

test('depth is printed on the working drawing, in the unit of the drawing and in metres', () => {
  const s = fixedL();
  const svg = R.toSVG(s, { unit: 'cm', title: 'Uji', date: 'x', depth: 100 });
  assert.ok(svg.includes('Kedalaman = 100 cm (1 m)'));
  assert.ok(!R.toSVG(s, { unit: 'cm', title: 'Uji', date: 'x' }).includes('Kedalaman'));
  assert.ok(!R.toSVG(s, { unit: 'cm', title: 'Uji', date: 'x', depth: 0 }).includes('Kedalaman'));
});

test('depth is printed in the PDF title block', () => {
  const s = fixedL();
  const pdf = Buffer.from(X.toPDF(s, { paper: 'A4', scale: 10, unit: 'cm', title: 'Uji', date: 'x', depth: 100 })).toString('latin1');
  assert.ok(pdf.includes('Kedalaman 100 cm'));
});
