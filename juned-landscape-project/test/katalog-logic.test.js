// Jalankan: node test/katalog-logic.test.js
const assert = require('assert');
require('../lib/katalog-logic.js');
const L = globalThis.KatalogLogic;
const t = async (name, fn) => { await fn(); console.log('ok - ' + name); };

const P = (local, o = {}) => ({ id: local, local, scientific: '', category: 'Semak / pagar', light: '', height: 0, spacing: 0, price: 0, stock: 0, ...o });
const names = r => r.map(x => x.plant.local);

(async () => {
  // ---------- rekomendasi ----------
  const plants = [
    P('Soka', { light: 'Matahari penuh', spacing: 60, price: 5000, stock: 10 }),
    P('Bambu', { light: 'Matahari / semi teduh', height: 800 }),
    P('Philodendron', { light: 'Semi teduh' }),
    P('Sirih gading', { light: 'Teduh' }),
    P('Paku', { light: 'Cahaya tidak langsung / teduh terang' }),
    P('Misterius', { light: '' })
  ];

  await t('cahaya matahari: yang cocok dulu, setengah cocok menyusul, cahaya kosong terakhir, yang bertentangan dibuang', async () => {
    assert.deepStrictEqual(names(L.recommend(plants, { light: 'sun' })), ['Soka', 'Bambu', 'Philodendron', 'Misterius']);
  });

  await t('cahaya teduh memilih tanaman teduh dan menolak tanaman matahari penuh', async () => {
    assert.deepStrictEqual(names(L.recommend(plants, { light: 'shade' })), ['Paku', 'Sirih gading', 'Philodendron', 'Misterius']);
  });

  await t('tanpa pilihan cahaya semua tanaman ikut', async () => {
    assert.strictEqual(L.recommend(plants, {}).length, plants.length);
  });

  await t('jumlah dan biaya dari luas dan jarak tanam (dibulatkan ke atas); tanpa jarak tanam kosong', async () => {
    const [soka] = L.recommend(plants, { light: 'sun', area: 10 });
    assert.strictEqual(soka.qty, 28);               // 10 / 0,6² = 27,8
    assert.strictEqual(soka.cost, 28 * 5000);
    const bambu = L.recommend(plants, { light: 'sun', area: 10 }).find(x => x.plant.local === 'Bambu');
    assert.strictEqual(bambu.qty, null);
    assert.strictEqual(bambu.cost, null);
  });

  await t('batas tinggi membuang yang lebih tinggi, tinggi tak tercatat tetap ikut', async () => {
    assert.ok(!names(L.recommend(plants, { light: 'sun', maxHeight: 300 })).includes('Bambu'));
    assert.ok(names(L.recommend(plants, { light: 'sun', maxHeight: 300 })).includes('Soka'));
  });

  await t('filter kategori', async () => {
    const mix = [P('A', { category: 'Palem' }), P('B', { category: 'Rumput' })];
    assert.deepStrictEqual(names(L.recommend(mix, { categories: ['Rumput'] })), ['B']);
  });

  await t('urutan: cocok lebih tinggi dulu, lalu yang ada stok, lalu nama', async () => {
    const mix = [P('Zeta', { light: 'Matahari penuh', stock: 5 }), P('Alfa', { light: 'Matahari penuh', stock: 0 }), P('Beta', { light: 'Matahari penuh', stock: 0 })];
    assert.deepStrictEqual(names(L.recommend(mix, { light: 'sun' })), ['Zeta', 'Alfa', 'Beta']);
  });

  // ---------- katalog klien ----------
  const catalogPlant = P('Pucuk <b>merah</b>', { scientific: 'Syzygium "myrtifolium"', height: 300, crown: 150, light: 'Matahari penuh', category: 'Semak / pagar', price: 15000, image: 'data:image/jpeg;base64,AAAA' });

  await t('katalog klien: dokumen lengkap, nama ukuran cahaya tampil, markup di nama tidak dijalankan', async () => {
    const h = L.clientCatalogHTML([catalogPlant], { title: 'Katalog Taman Pak Budi', client: 'Pak Budi' });
    assert.ok(/^<!doctype html>/i.test(h));
    assert.ok(h.includes('Katalog Taman Pak Budi') && h.includes('Pak Budi'));
    assert.ok(!h.includes('<b>merah</b>'), 'nama tanaman harus di-escape');
    assert.ok(h.includes('Pucuk &lt;b&gt;merah&lt;/b&gt;'));
    assert.ok(h.includes('300 cm') && h.includes('150 cm') && h.includes('Matahari penuh'));
    assert.ok(h.includes('<img') && h.includes('data:image/jpeg;base64,AAAA'));
    assert.ok(/@page/.test(h), 'ada aturan cetak');
  });

  await t('harga hanya muncul bila diminta, berformat ribuan Indonesia', async () => {
    assert.ok(!L.clientCatalogHTML([catalogPlant], {}).includes('Rp'));
    assert.ok(L.clientCatalogHTML([catalogPlant], { withPrice: true }).includes('Rp 15.000'));
  });

  await t('foto bukan data:image tidak dipasang (cegah javascript: dan alamat luar)', async () => {
    const bad = { ...catalogPlant, image: 'javascript:alert(1)' };
    const h = L.clientCatalogHTML([bad], {});
    assert.ok(!h.includes('javascript:') && !h.includes('<img'));
  });

  await t('katalog klien kosong tetap dokumen yang benar dengan pesan', async () => {
    assert.ok(L.clientCatalogHTML([], {}).includes('Belum ada tanaman'));
  });

  // ---------- duplikat dan bentuk data ----------
  await t('duplikat: nama lokal atau ilmiah sama, tanpa peduli huruf besar dan spasi; kosong tidak dianggap sama', async () => {
    const have = [P('Soka', { scientific: 'Ixora coccinea' })];
    assert.strictEqual(L.isDuplicate(have, { local: ' soka ', scientific: '' }), true);
    assert.strictEqual(L.isDuplicate(have, { local: 'Lain', scientific: 'IXORA COCCINEA' }), true);
    assert.strictEqual(L.isDuplicate(have, { local: 'Lain', scientific: '' }), false);
    assert.strictEqual(L.isDuplicate([P('', { scientific: '' })], { local: '', scientific: '' }), false);
  });

  await t('tanaman dari AI: kolom lengkap, harga dan stok nol, ditandai perlu verifikasi, nama jatuh ke nama ilmiah', async () => {
    const p = L.plantFromAI({ local: '', scientific: 'Ixora coccinea', family: 'Rubiaceae', category: 'Semak / pagar', height: 200, crown: 100, spacing: 50, light: 'Matahari penuh', water: 'w', fertilizer: 'f', description: 'd' }, 'data:image/jpeg;base64,AA', { id: 'p-1', now: '2026-01-01T00:00:00.000Z' });
    assert.strictEqual(p.id, 'p-1');
    assert.strictEqual(p.local, 'Ixora coccinea');
    assert.deepStrictEqual([p.price, p.stock, p.image, p.created, p.updatedAt], [0, 0, 'data:image/jpeg;base64,AA', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z']);
    assert.ok(/verifikasi/i.test(p.notes));
  });

  // ---------- identifikasi banyak foto ----------
  const items = [{ name: 'a.jpg', dataUrl: 'A' }, { name: 'b.jpg', dataUrl: 'B' }, { name: 'c.jpg', dataUrl: 'C' }];

  await t('banyak foto: satu gagal biasa tidak menghentikan yang lain, kemajuan dilaporkan tiap foto', async () => {
    const seen = [];
    const out = await L.identifyBatch(items, async d => { if (d === 'B') throw new Error('foto buram'); return { fields: { local: d }, alternatives: [], model: 'm' }; }, { onProgress: (i, n) => seen.push([i, n]) });
    assert.deepStrictEqual(out.map(x => x.ok), [true, false, true]);
    assert.strictEqual(out[1].error, 'foto buram');
    assert.deepStrictEqual(seen, [[1, 3], [2, 3], [3, 3]]);
  });

  await t('banyak foto: kunci salah atau kuota habis menghentikan sisanya tanpa memanggil lagi', async () => {
    for (const flag of ['fatal', 'quota']) {
      let calls = 0;
      const out = await L.identifyBatch(items, async d => { calls++; if (d === 'B') { const e = new Error('berhenti'); e[flag] = true; throw e; } return { fields: { local: d }, alternatives: [] }; });
      assert.strictEqual(calls, 2, flag);
      assert.deepStrictEqual(out.map(x => x.ok), [true, false, false]);
      assert.strictEqual(out[2].skipped, true);
    }
  });

  console.log('katalog-logic OK');
})().catch(e => { console.error(e); process.exit(1); });
