// Jalankan: node test/sketsa-field.test.js
const assert = require('assert');
const G = require('../apps/sketsa/geometry.js');
globalThis.Geometry = G;
require('../lib/sketsa-field.js');
const S = globalThis.SketsaField;
const L = require('./sketsa/fixtures/l-shape.json');
const t = (name, fn) => { fn(); console.log('ok - ' + name); };
const close = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

const line = length => ({ length, kind: 'line', radius: null, bulge: 'out' });
const v = (x, y, interiorAngle = null) => ({ x, y, interiorAngle });
const rect = (w, h, unit) => ({ unit, vertices: [v(0, 0), v(200, 0), v(200, 100), v(0, 100)], edges: [line(w), line(h), line(w), line(h)], notes: [] });
const shoelace = pts => Math.abs(pts.reduce((s, p, i) => { const q = pts[(i + 1) % pts.length]; return s + p[0] * q[1] - q[0] * p[1]; }, 0)) / 2;
const bbox = pts => [Math.max(...pts.map(p => p[0])) - Math.min(...pts.map(p => p[0])), Math.max(...pts.map(p => p[1])) - Math.min(...pts.map(p => p[1]))];

t('persegi 500 x 300 cm: polygon dalam meter, titik pertama di 0,0, luas 15 m²', () => {
  const r = S.fromSolved(G.solve(rect(500, 300, 'cm')), 'cm');
  assert.strictEqual(r.ok, true);
  assert.deepStrictEqual(r.points[0], [0, 0]);
  assert.strictEqual(r.points.length, 4);
  const [w, h] = bbox(r.points);
  assert.ok(close(w, 5) && close(h, 3), `${w} x ${h}`);
  assert.ok(close(r.area, 15) && close(shoelace(r.points), 15));
});

t('satuan mm, cm, dan m memberi bentuk meter yang sama', () => {
  const a = S.fromSolved(G.solve(rect(5000, 3000, 'mm')), 'mm'), b = S.fromSolved(G.solve(rect(500, 300, 'cm')), 'cm'), c = S.fromSolved(G.solve(rect(5, 3, 'm')), 'm');
  for (const r of [a, b, c]) assert.ok(r.ok && close(r.area, 15), JSON.stringify(r));
  a.points.forEach((p, i) => { assert.ok(close(p[0], c.points[i][0]) && close(p[1], c.points[i][1])); });
});

t('sumbu y dibalik: Survei memakai y ke bawah, sketsa y ke atas', () => {
  // titik ke-3 sketsa ada di atas titik pertama; di Survei harus bernilai y negatif (ke atas = y lebih kecil)
  const s = G.solve(rect(500, 300, 'cm'));
  const r = S.fromSolved(s, 'cm');
  const up = s.points.map(p => p.y - s.points[0].y), down = r.points.map(p => p[1]);
  up.forEach((y, i) => assert.ok(close(down[i], -y * 0.01), `titik ${i}`));
});

t('bentuk L dari fixture (sisi bawah 25): luas 468 satuan² menjadi 4,68 m² di cm', () => {
  const sk = structuredClone(L); sk.edges[4].length = 25;
  const s = G.solve(sk);
  assert.strictEqual(s.status, 'ok');
  const r = S.fromSolved(s, 'cm');
  assert.ok(r.ok && close(r.area, s.area * 1e-4, 1e-9) && close(shoelace(r.points), s.area * 1e-4, 1e-9), String(r.area));
  assert.strictEqual(r.estimated, false);
});

t('ukuran bertentangan: tidak ada hasil, alasannya jelas', () => {
  const s = G.solve(L); // sisi horizontal bertentangan (12 + 13 tidak sama dengan 50, dst.)
  assert.strictEqual(s.status, 'conflict');
  const r = S.fromSolved(s, 'cm');
  assert.strictEqual(r.ok, false);
  assert.match(r.reason, /bertentangan/i);
  assert.strictEqual(r.points, undefined);
});

t('ada ukuran perkiraan: tetap bisa dipakai tetapi ditandai', () => {
  const s = G.solve({ unit: 'cm', vertices: [v(0, 0), v(200, 0), v(200, 100), v(0, 100)], edges: [line(500), line(null), line(null), line(null)], notes: [] });
  assert.strictEqual(s.status, 'underdetermined');
  const r = S.fromSolved(s, 'cm');
  assert.ok(r.ok && r.estimated === true);
});

t('sisi busur diuraikan menjadi titik; luas polygon dekat luas hasil hitungan', () => {
  const arc = { length: 10, kind: 'arc', radius: 8, bulge: 'out' };
  const s = G.solve({ unit: 'm', vertices: [v(0, 0), v(200, 0), v(200, 100), v(0, 100)], edges: [line(20), arc, line(20), line(10)], notes: [] });
  const r = S.fromSolved(s, 'm');
  assert.ok(r.ok && r.hasArc === true);
  assert.ok(r.points.length > 8, `titik ${r.points.length}`);
  assert.ok(Math.abs(shoelace(r.points) - s.area) / s.area < 0.005, `${shoelace(r.points)} vs ${s.area}`);
  assert.ok(close(r.area, shoelace(r.points), 1e-9), 'luas yang dilaporkan = luas polygon yang disimpan');
});

t('busur ke dalam mengurangi luas', () => {
  const arc = { length: 10, kind: 'arc', radius: 8, bulge: 'in' };
  const s = G.solve({ unit: 'm', vertices: [v(0, 0), v(200, 0), v(200, 100), v(0, 100)], edges: [line(20), arc, line(20), line(10)], notes: [] });
  const r = S.fromSolved(s, 'm');
  assert.ok(r.ok && Math.abs(shoelace(r.points) - s.area) / s.area < 0.005);
  assert.ok(s.area < 200);
});

t('satuan tidak dikenal atau bentuk belum menutup ditolak', () => {
  assert.strictEqual(S.fromSolved(G.solve(rect(500, 300, 'cm')), 'inch').ok, false);
  assert.strictEqual(S.fromSolved(null, 'cm').ok, false);
  const open = G.solve({ unit: 'cm', vertices: [v(0, 0), v(200, 0), v(200, 100), v(0, 100)], edges: [line(500), line(300), line(200), line(100)], notes: [] });
  assert.strictEqual(S.fromSolved(open, 'cm').ok === true && open.gap ? 'x' : 'y', 'y', 'celah pada bentuk tidak boleh lolos');
});

// ---------- menulis ke data Survei ----------
const rec = () => ({ id: 'p1', areas: [{ id: 'a1', name: 'Taman', fields: [
  { id: 'f1', name: 'Bidang A', shape: 'rect', dims: { panjang: 2, lebar: 2 }, points: [], sign: -1, depth: 0.3, areaOverride: null, overrideReason: null, sketchScale: 0.5, materials: { tanah: { enabled: true } }, note: 'catatan lama' },
  { id: 'f2', name: 'Bidang B', shape: 'rect', dims: {}, points: [], sign: 1, depth: 0, materials: {}, note: '' }] }] });
const good = () => S.fromSolved(G.solve(rect(500, 300, 'cm')), 'cm');

t('diterapkan ke bidang: polygon, skala kanvas dihapus, data lain dan bidang lain tidak berubah', () => {
  const r = rec(), before = structuredClone(r.areas[0].fields[1]);
  const out = S.applyToField(r, 'f1', good());
  assert.strictEqual(out.ok, true);
  const f = r.areas[0].fields[0];
  assert.strictEqual(f.shape, 'polygon');
  assert.strictEqual(f.points.length, 4);
  assert.strictEqual(f.sketchScale, null);
  assert.deepStrictEqual([f.sign, f.depth, f.materials.tanah.enabled, f.name], [-1, 0.3, true, 'Bidang A']);
  assert.deepStrictEqual(r.areas[0].fields[1], before);
});

t('catatan bidang memuat asal sketsa dan tidak menggandakan saat diterapkan lagi', () => {
  const r = rec(); S.applyToField(r, 'f1', good()); S.applyToField(r, 'f1', good());
  const note = r.areas[0].fields[0].note;
  assert.ok(note.startsWith('catatan lama'));
  assert.strictEqual((note.match(/Sketsa berukuran/g) || []).length, 1);
});

t('ukuran perkiraan dicatat di bidang', () => {
  const r = rec(); const est = { ...good(), estimated: true };
  S.applyToField(r, 'f2', est);
  assert.match(r.areas[0].fields[1].note, /perkiraan/i);
});

t('hasil yang tidak ok tidak pernah ditulis', () => {
  const r = rec(), before = structuredClone(r);
  const out = S.applyToField(r, 'f1', { ok: false, reason: 'bertentangan' });
  assert.strictEqual(out.ok, false);
  assert.deepStrictEqual(r, before);
});

t('bidang tidak ditemukan: ditolak tanpa mengubah apa pun', () => {
  const r = rec(), before = structuredClone(r);
  const out = S.applyToField(r, 'tidak-ada', good());
  assert.strictEqual(out.ok, false);
  assert.match(out.reason, /bidang/i);
  assert.deepStrictEqual(r, before);
});

t('bidang dengan luas manual: bentuk diterapkan, peringatan dikembalikan, luas manual tidak dihapus diam-diam', () => {
  const r = rec(); r.areas[0].fields[0].areaOverride = 7; r.areas[0].fields[0].overrideReason = 'ukur ulang';
  const out = S.applyToField(r, 'f1', good());
  assert.ok(out.ok && /luas manual/i.test(out.warning));
  assert.deepStrictEqual([r.areas[0].fields[0].areaOverride, r.areas[0].fields[0].overrideReason], [7, 'ukur ulang']);
});

// ---------- kedalaman tertulis di dalam bidang (mis. "-100") ----------
t('kedalaman dari catatan: angka bertanda minus atau kata kedalaman, dalam satuan sketsa', () => {
  assert.strictEqual(S.depthFromNotes(['-100']), 100);
  assert.strictEqual(S.depthFromNotes(['− 80']), 80);
  assert.strictEqual(S.depthFromNotes(['-1,5']), 1.5);
  assert.strictEqual(S.depthFromNotes(['kedalaman 60']), 60);
  assert.strictEqual(S.depthFromNotes(['dalam: 0.4']), 0.4);
  assert.strictEqual(S.depthFromNotes(['skala bebas', '-100']), 100);
  assert.strictEqual(S.depthFromNotes(['skala bebas']), null);
  assert.strictEqual(S.depthFromNotes(['2024-11-25']), null, 'tanggal bukan kedalaman');
  assert.strictEqual(S.depthFromNotes(undefined), null);
});

t('kedalaman dikonversi ke meter sesuai satuan sketsa', () => {
  const r = S.fromSolved(G.solve(rect(260, 150, 'cm')), 'cm', 100);
  assert.ok(r.ok && close(r.depth, 1));
  assert.ok(close(S.fromSolved(G.solve(rect(2600, 1500, 'mm')), 'mm', 400).depth, 0.4));
  assert.strictEqual(S.fromSolved(G.solve(rect(260, 150, 'cm')), 'cm', null).depth, null);
  assert.strictEqual(S.fromSolved(G.solve(rect(260, 150, 'cm')), 'cm', -5).depth, null, 'nilai tidak masuk akal diabaikan');
});

t('kedalaman ditulis ke bidang dan dicatat; tanpa kedalaman, kedalaman lama tidak diubah', () => {
  const r = rec();
  S.applyToField(r, 'f1', S.fromSolved(G.solve(rect(260, 150, 'cm')), 'cm', 100));
  assert.strictEqual(r.areas[0].fields[0].depth, 1);
  assert.match(r.areas[0].fields[0].note, /kedalaman 1 m/);
  const r2 = rec();
  S.applyToField(r2, 'f1', S.fromSolved(G.solve(rect(260, 150, 'cm')), 'cm', null));
  assert.strictEqual(r2.areas[0].fields[0].depth, 0.3);
});

console.log('sketsa-field OK');
