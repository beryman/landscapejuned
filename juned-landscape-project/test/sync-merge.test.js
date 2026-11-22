// Jalankan: node test/sync-merge.test.js
const assert = require('assert');
require('../lib/sync-merge.js');
const { merge3, applyPatch } = globalThis.SyncMerge;
const clone = o => JSON.parse(JSON.stringify(o));
const t = (name, fn) => { fn(); console.log('ok - ' + name); };
const base = () => ({
  id: 1, name: 'Taman', client: 'A',
  tasks: [{ id: 10, t: 'Gali', s: 0 }, { id: 11, t: 'Tanam', s: 0 }],
  rab: [{ id: 20, n: 'Batu', q: 5, h: 100 }, { id: 21, n: 'Pasir', q: 2, h: 50 }],
  att: { '2026-11-01': { 7: 'H' } },
  log: [{ ts: 100, w: 'A', a: 'awal' }],
  sop: [{ id: 30, s: [{ t: 'APD', d: 0 }, { t: 'Cek alat', d: 0 }] }],
  rep: [{ id: 40, ph: ['@@blob:a:1'] }]
});

t('perubahan di bagian berbeda digabung tanpa konflik', () => {
  const l = base(), r = base();
  l.tasks[0].s = 2; r.rab[0].h = 150;
  const m = merge3(base(), l, r);
  assert.strictEqual(m.value.tasks[0].s, 2);
  assert.strictEqual(m.value.rab[0].h, 150);
  assert.deepStrictEqual(m.conflicts, []);
});
t('field berbeda pada item yang sama digabung', () => {
  const l = base(), r = base();
  l.rab[0].q = 9; r.rab[0].h = 150;
  const m = merge3(base(), l, r);
  assert.deepStrictEqual([m.value.rab[0].q, m.value.rab[0].h], [9, 150]);
  assert.strictEqual(m.conflicts.length, 0);
});
t('item baru dari dua perangkat sama-sama masuk', () => {
  const l = base(), r = base();
  l.tasks.push({ id: 12, t: 'Lokal', s: 0 }); r.tasks.push({ id: 13, t: 'Server', s: 0 });
  const ids = merge3(base(), l, r).value.tasks.map(x => x.id);
  assert.deepStrictEqual(ids.slice().sort(), [10, 11, 12, 13]);
});
t('item yang dihapus satu perangkat tetap terhapus', () => {
  const l = base(), r = base();
  l.rab = l.rab.filter(x => x.id !== 21); r.rab[0].h = 150;
  const m = merge3(base(), l, r);
  assert.deepStrictEqual(m.value.rab.map(x => x.id), [20]);
  assert.strictEqual(m.conflicts.length, 0);
});
t('field sama diubah beda: lokal menang, nilai server dicatat', () => {
  const l = base(), r = base();
  l.rab[0].h = 111; r.rab[0].h = 222;
  const m = merge3(base(), l, r);
  assert.strictEqual(m.value.rab[0].h, 111);
  assert.strictEqual(m.conflicts.length, 1);
  assert.strictEqual(m.conflicts[0].other, 222);
  assert.ok(/Batu/.test(m.conflicts[0].label));
});
t('perubahan sama di dua perangkat bukan konflik', () => {
  const l = base(), r = base();
  l.client = 'B'; r.client = 'B';
  assert.strictEqual(merge3(base(), l, r).conflicts.length, 0);
});
t('dihapus vs diubah: item dipertahankan dan dicatat', () => {
  const l = base(), r = base();
  l.rab = l.rab.filter(x => x.id !== 20); r.rab[0].h = 150;
  const m = merge3(base(), l, r);
  assert.strictEqual(m.value.rab.find(x => x.id === 20).h, 150);
  assert.strictEqual(m.conflicts.length, 1);
});
t('absen tanggal dan tukang berbeda digabung', () => {
  const l = base(), r = base();
  l.att['2026-11-01'][8] = 'S'; r.att['2026-11-02'] = { 7: 'H' };
  const v = merge3(base(), l, r).value;
  assert.deepStrictEqual(v.att, { '2026-11-01': { 7: 'H', 8: 'S' }, '2026-11-02': { 7: 'H' } });
});
t('riwayat aktivitas digabung, terbaru di atas, maks 200', () => {
  const l = base(), r = base();
  l.log.unshift({ ts: 300, w: 'L', a: 'x' }); r.log.unshift({ ts: 200, w: 'R', a: 'y' });
  assert.deepStrictEqual(merge3(base(), l, r).value.log.map(x => x.ts), [300, 200, 100]);
  const big = base(), b2 = base();
  big.log = Array.from({ length: 200 }, (_, i) => ({ ts: 1000 + i, w: 'L', a: 'a' }));
  b2.log = [{ ts: 5000, w: 'R', a: 'b' }];
  assert.strictEqual(merge3(base(), big, b2).value.log.length, 200);
});
t('langkah tanpa id digabung per posisi', () => {
  const l = base(), r = base();
  l.sop[0].s[0].d = 1; r.sop[0].s[1].d = 1;
  assert.deepStrictEqual(merge3(base(), l, r).value.sop[0].s.map(x => x.d), [1, 1]);
});
t('foto ditambah dua perangkat sama-sama masuk', () => {
  const l = base(), r = base();
  l.rep[0].ph.push('@@blob:b:1'); r.rep[0].ph.push('@@blob:c:1');
  assert.deepStrictEqual(merge3(base(), l, r).value.rep[0].ph.slice().sort(), ['@@blob:a:1', '@@blob:b:1', '@@blob:c:1']);
});
t('updatedAt tidak dianggap konflik, ambil yang terbaru', () => {
  const b = { id: 1, updatedAt: '2026-01-01' }, l = { id: 1, updatedAt: '2026-03-01' }, r = { id: 1, updatedAt: '2026-02-01' };
  const m = merge3(b, l, r);
  assert.strictEqual(m.value.updatedAt, '2026-03-01');
  assert.strictEqual(m.conflicts.length, 0);
});
t('masukan tidak diubah', () => {
  const b = base(), l = base(), r = base();
  l.tasks[0].s = 2; r.rab[0].h = 150;
  const cb = clone(b), cl = clone(l), cr = clone(r);
  merge3(b, l, r);
  assert.deepStrictEqual([b, l, r], [cb, cl, cr]);
});
t('Pakai versi ini hanya mengganti bagian yang bentrok', () => {
  const l = base(), r = base();
  l.rab[0].h = 111; r.rab[0].h = 222; l.tasks[0].s = 2;
  const m = merge3(base(), l, r), out = applyPatch(m.value, m.conflicts[0].path, m.conflicts[0].other);
  assert.strictEqual(out.rab[0].h, 222);
  assert.strictEqual(out.tasks[0].s, 2);
});
t('Pakai versi ini bisa menjalankan penghapusan yang bentrok', () => {
  const l = base(), r = base();
  l.rab = l.rab.filter(x => x.id !== 20); r.rab[0].h = 150;
  const m = merge3(base(), l, r), out = applyPatch(m.value, m.conflicts[0].path, m.conflicts[0].other);
  assert.ok(!out.rab.some(x => x.id === 20));
});
console.log('sync-merge OK');
