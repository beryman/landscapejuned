// Jalankan: node test/proyek-logic.test.js
const assert = require('assert');
require('../lib/proyek-logic.js');
const L = globalThis.ProyekLogic;
const t = (name, fn) => { fn(); console.log('ok - ' + name); };

t('paket pekerjaan: tugas berurutan per jenis, jenis berbeda berjalan paralel', () => {
  const cats = [{ id: 'taman', tpl: ['A', 'B', 'C'] }, { id: 'kolam', tpl: ['X', 'Y'] }];
  const tasks = L.tasksFromPack(cats, 1000);
  assert.deepStrictEqual(tasks.map(x => x.t), ['A', 'B', 'C', 'X', 'Y']);
  assert.strictEqual(new Set(tasks.map(x => x.id)).size, 5);
  assert.deepStrictEqual(tasks.map(x => x.k), ['taman', 'taman', 'taman', 'kolam', 'kolam']);
  assert.deepStrictEqual(tasks.map(x => x.dep || null), [null, tasks[0].id, tasks[1].id, null, tasks[3].id]);
  assert.ok(tasks.every(x => x.s === 0 && x.who === '' && x.a === '' && x.b === ''));
});
t('paket pekerjaan: jenis tanpa template dilewati', () => {
  assert.deepStrictEqual(L.tasksFromPack([{ id: 'x', tpl: [] }, { id: 'y' }], 1), []);
});

t('revisi penawaran bernomor urut dan menyalin nilai', () => {
  const pn = { st: 'Draf', a: 1000, d: '2026-11-01' };
  L.addRevision(pn, '2026-11-02');
  pn.a = 900; pn.st = 'Dikirim';
  L.addRevision(pn, '2026-11-05');
  assert.deepStrictEqual(pn.rev.map(r => [r.no, r.a, r.d]), [[1, 1000, '2026-11-02'], [2, 900, '2026-11-05']]);
  assert.strictEqual(pn.rev[1].st, 'Dikirim');
});
t('revisi baru menandai revisi dikirim sebelumnya sebagai diganti, yang ditolak tetap ditolak', () => {
  const pn = { st: 'Dikirim', a: 1000 };
  L.addRevision(pn, '2026-11-02');
  pn.st = 'Ditolak'; L.syncRevStatus(pn);
  pn.a = 900; pn.st = 'Dikirim'; L.addRevision(pn, '2026-11-03');
  pn.a = 850; L.addRevision(pn, '2026-11-04');
  assert.deepStrictEqual(pn.rev.map(r => r.st), ['Ditolak', 'Diganti', 'Dikirim']);
});
t('status penawaran terakhir ikut tercatat di revisi', () => {
  const pn = { st: 'Dikirim', a: 500 };
  L.addRevision(pn, '2026-11-02');
  pn.st = 'Ditolak'; L.syncRevStatus(pn);
  assert.strictEqual(pn.rev[0].st, 'Ditolak');
  L.syncRevStatus({ st: 'Disetujui' }); // tanpa revisi: tidak error
});
t('nilai berubah setelah terkirim terdeteksi', () => {
  const pn = { st: 'Dikirim', a: 500 };
  L.addRevision(pn, '2026-11-02');
  assert.strictEqual(L.changedSinceSent(pn), false);
  pn.a = 450;
  assert.strictEqual(L.changedSinceSent(pn), true);
  assert.strictEqual(L.changedSinceSent({ st: 'Draf', a: 1 }), false);
});

t('nilai kontrak = penawaran disetujui + tambah kurang disetujui', () => {
  const p = { pn: { st: 'Disetujui', a: 1000 }, cco: [{ a: 300, st: 'Disetujui' }, { a: -100, st: 'Disetujui' }, { a: 999, st: 'Diajukan' }, { a: 50, st: 'Ditolak' }] };
  assert.strictEqual(L.contractValue(p), 1200);
  assert.strictEqual(L.contractValue({ pn: { st: 'Dikirim', a: 1000 } }), 0);
  assert.strictEqual(L.contractValue({}), 0);
});
t('tambah kurang disetujui masuk RAB sekali, bukan disetujui keluar lagi', () => {
  const p = { rab: [{ id: 1, n: 'Batu', q: 1, h: 10 }], cco: [{ id: 7, n: 'Tambah pot', a: 300, st: 'Diajukan' }] };
  L.syncCco(p); assert.strictEqual(p.rab.length, 1);
  p.cco[0].st = 'Disetujui'; L.syncCco(p); L.syncCco(p);
  const x = p.rab.find(r => r.cco === 7);
  assert.strictEqual(p.rab.length, 2);
  assert.deepStrictEqual([x.q, x.h, x.k, x.man, x.pct], [1, 300, 'Lainnya', true, 0]);
  assert.ok(/Tambah pot/.test(x.n));
  p.cco[0].st = 'Ditolak'; L.syncCco(p);
  assert.strictEqual(p.rab.length, 1);
});
t('pengurangan langsung dianggap selesai 100% agar nilai kontrak turun', () => {
  const p = { rab: [], cco: [{ id: 8, n: 'Kurangi lampu', a: -200, st: 'Disetujui' }] };
  L.syncCco(p);
  assert.deepStrictEqual([p.rab[0].h, p.rab[0].pct], [-200, 100]);
});
t('perubahan nilai tambah kurang yang sudah disetujui ikut ke RAB', () => {
  const p = { rab: [], cco: [{ id: 9, n: 'X', a: 100, st: 'Disetujui' }] };
  L.syncCco(p); p.cco[0].a = 250; p.cco[0].n = 'Y'; L.syncCco(p);
  assert.strictEqual(p.rab.length, 1);
  assert.deepStrictEqual([p.rab[0].h, /Y/.test(p.rab[0].n)], [250, true]);
  assert.strictEqual(p.rab[0].pct, 0, 'progres yang sudah dicatat tidak direset');
});
t('progres tambahan yang sudah berjalan tidak direset saat nilai diubah', () => {
  const p = { rab: [], cco: [{ id: 3, n: 'X', a: 100, st: 'Disetujui' }] };
  L.syncCco(p); p.rab[0].pct = 60; p.cco[0].a = 120; L.syncCco(p);
  assert.strictEqual(p.rab[0].pct, 60);
});

t('survei berubah setelah RAB dibuat: selisih dihitung, tanpa selisih tidak ada peringatan', () => {
  assert.deepStrictEqual(L.svDrift({ rbsv: 1000 }, { grand: 1200 }), { base: 1000, now: 1200, diff: 200 });
  assert.deepStrictEqual(L.svDrift({ rbsv: 1000 }, { grand: 900.4 }), { base: 1000, now: 900, diff: -100 });
  assert.strictEqual(L.svDrift({ rbsv: 1000 }, { grand: 1000.3 }), null);
  assert.strictEqual(L.svDrift({}, { grand: 5 }), null);
  assert.strictEqual(L.svDrift({ rbsv: 1000 }, null), null);
});

t('harga katalog dicocokkan per kata, hanya untuk item belum berharga', () => {
  const cat = [
    { name: 'Bata merah', price: 800, labor: 150, unit: 'pcs' },
    { name: 'Andesit', price: 250000, labor: 40000, unit: 'm2' },
    { name: 'Tanah merah', price: 90000, labor: 0, unit: 'm3' }
  ];
  const items = [
    { id: 'a', n: 'Pasangan bata merah', mat: 0, lab: 0 },
    { id: 'b', n: 'Batu alam andesit', mat: 0, lab: 0 },
    { id: 'c', n: 'Kerikil', mat: 0, lab: 0 },
    { id: 'd', n: 'Tanah merah', mat: 55000, lab: 0 }
  ];
  const m = L.matchCatalog(items, cat);
  assert.deepStrictEqual(m.map(x => [x.id, x.cat, x.mat, x.lab]), [['a', 'Bata merah', 800, 150], ['b', 'Andesit', 250000, 40000]]);
});
t('nama katalog yang sama kuat dua kali dilewati, bukan ditebak', () => {
  const cat = [{ name: 'Batu hitam', price: 1, labor: 0 }, { name: 'Batu putih', price: 2, labor: 0 }];
  assert.deepStrictEqual(L.matchCatalog([{ id: 'x', n: 'Batu', mat: 0, lab: 0 }], cat), []);
  assert.deepStrictEqual(L.matchCatalog([{ id: 'x', n: 'Batu hitam alam', mat: 0, lab: 0 }], cat).map(x => x.cat), ['Batu hitam']);
});
t('katalog kosong atau item tanpa nama tidak error', () => {
  assert.deepStrictEqual(L.matchCatalog([{ id: 'x', n: '', mat: 0, lab: 0 }], [{ name: 'A', price: 1 }]), []);
  assert.deepStrictEqual(L.matchCatalog([{ id: 'x', n: 'Pasir', mat: 0, lab: 0 }], []), []);
});
t('nama umum (batu alam) tidak dipakai untuk perekat, nat, atau coating batu alam', () => {
  const cat = [
    { name: 'Batu alam', price: 180000, labor: 45000 },
    { name: 'Perekat batu alam', price: 12000, labor: 0 }
  ];
  const items = [
    { id: 'a', n: 'Batu alam (pasang)', mat: 0, lab: 0 },
    { id: 'b', n: 'Perekat / mortar batu alam', mat: 0, lab: 0 },
    { id: 'c', n: 'Nat / grout batu alam', mat: 0, lab: 0 },
    { id: 'd', n: 'Coating / sealer batu alam', mat: 0, lab: 0 }
  ];
  assert.deepStrictEqual(L.matchCatalog(items, cat).map(x => [x.id, x.cat]), [['a', 'Batu alam'], ['b', 'Perekat batu alam']]);
});
t('nama pembeda tetap cocok walau katalog hanya satu kata', () => {
  const m = L.matchCatalog([{ id: 'a', n: 'Batu alam andesit', mat: 0, lab: 0 }, { id: 'b', n: 'Cat tekstur', mat: 0, lab: 0 }], [{ name: 'Andesit', price: 5, labor: 0 }, { name: 'Cat tekstur', price: 9, labor: 1 }]);
  assert.deepStrictEqual(m.map(x => [x.id, x.cat]), [['a', 'Andesit'], ['b', 'Cat tekstur']]);
});
console.log('proyek-logic OK');
