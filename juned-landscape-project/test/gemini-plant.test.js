// Jalankan: node test/gemini-plant.test.js
const assert = require('assert');
require('../lib/gemini-plant.js');
const G = globalThis.GeminiPlant;
const t = async (name, fn) => { await fn(); console.log('ok - ' + name); };
const reply = text => ({ ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text }] } }] }) });
const fail = (status, body = {}) => ({ ok: false, status, json: async () => body });
const PNG = 'data:image/jpeg;base64,/9j/AAAA';

(async () => {
  await t('permintaan: foto sebagai inline_data, kunci di header (bukan di URL), hasil JSON', async () => {
    let seen;
    await G.identify(PNG, { key: 'KUNCI-RAHASIA', models: ['m1'], fetch: async (url, o) => { seen = { url, o }; return reply('{"local":"Pucuk merah"}'); } });
    assert.ok(!seen.url.includes('KUNCI-RAHASIA'), 'kunci tidak boleh ada di URL');
    assert.strictEqual(seen.o.headers['x-goog-api-key'], 'KUNCI-RAHASIA');
    assert.ok(seen.url.includes('/models/m1:generateContent'));
    const body = JSON.parse(seen.o.body);
    assert.strictEqual(body.contents[0].parts[1].inline_data.mime_type, 'image/jpeg');
    assert.strictEqual(body.contents[0].parts[1].inline_data.data, '/9j/AAAA');
    assert.strictEqual(body.generationConfig.responseMimeType, 'application/json');
  });

  await t('hasil dinormalkan: angka wajar, kategori dan cahaya dicocokkan ke pilihan formulir', async () => {
    const out = await G.identify(PNG, { key: 'k', models: ['m'], fetch: async () => reply(JSON.stringify({
      local: ' Pucuk merah ', scientific: 'Syzygium myrtifolium', family: 'Myrtaceae', category: 'semak / pagar',
      description: 'Semak berdaun muda merah.', height: '300', crown: -5, spacing: 'banyak', light: 'matahari penuh',
      water: 'Siram 2 hari sekali.', fertilizer: 'Pupuk kandang.', confidence: 87, alternatives: [{ local: 'Soka', scientific: 'Ixora coccinea' }, { local: '' }, { local: 'A' }, { local: 'B' }, { local: 'C' }]
    })) });
    const f = out.fields;
    assert.deepStrictEqual([f.local, f.category, f.light, f.height, f.crown, f.spacing], ['Pucuk merah', 'Semak / pagar', 'Matahari penuh', 300, 0, 0]);
    assert.strictEqual(f.confidence, 0.87);
    assert.deepStrictEqual(out.alternatives.map(a => a.local), ['Soka', 'A', 'B']);
  });

  await t('kategori atau cahaya di luar pilihan jatuh ke Lainnya / kosong', async () => {
    const out = await G.identify(PNG, { key: 'k', models: ['m'], fetch: async () => reply('{"local":"X","category":"Pohon raksasa","light":"gelap gulita"}') });
    assert.deepStrictEqual([out.fields.category, out.fields.light], ['Lainnya', '']);
  });

  await t('balasan berpagar kode ``` tetap terbaca', async () => {
    const out = await G.identify(PNG, { key: 'k', models: ['m'], fetch: async () => reply('```json\n{"local":"Bambu jepang"}\n```') });
    assert.strictEqual(out.fields.local, 'Bambu jepang');
  });

  await t('teks panjang dan markup dipotong dan tidak dijalankan sebagai HTML', async () => {
    const out = await G.identify(PNG, { key: 'k', models: ['m'], fetch: async () => reply(JSON.stringify({ local: 'A'.repeat(500), description: '<img src=x onerror=alert(1)>' + 'b'.repeat(2000) })) });
    assert.ok(out.fields.local.length <= 80);
    assert.ok(out.fields.description.length <= 600);
    assert.ok(!/[<>]/.test(out.fields.description), 'tanda < > dibuang agar aman bila dipasang ke halaman');
  });

  await t('foto bukan tanaman: kepercayaan 0 menolak, bukan mengisi tebakan', async () => {
    await assert.rejects(() => G.identify(PNG, { key: 'k', models: ['m'], fetch: async () => reply('{"local":"","confidence":0}') }), /tidak terlihat|bukan tanaman/i);
  });

  await t('model pertama gagal (404): model berikutnya dicoba dan dilaporkan', async () => {
    const tried = [];
    const out = await G.identify(PNG, { key: 'k', models: ['a', 'b'], fetch: async url => { tried.push(url.match(/models\/([^:]+)/)[1]); return tried.length === 1 ? fail(404) : reply('{"local":"Soka"}'); } });
    assert.deepStrictEqual(tried, ['a', 'b']);
    assert.strictEqual(out.model, 'b');
  });

  await t('kunci salah: pesan jelas dan model lain tidak dicoba sia-sia', async () => {
    let n = 0;
    await assert.rejects(() => G.identify(PNG, { key: 'k', models: ['a', 'b'], fetch: async () => { n++; return fail(400, { error: { message: 'API key not valid. Please pass a valid API key.' } }); } }), /kunci/i);
    assert.strictEqual(n, 1);
  });

  await t('kuota habis dan jaringan putus punya pesan sendiri', async () => {
    await assert.rejects(() => G.identify(PNG, { key: 'k', models: ['a'], fetch: async () => fail(429) }), /kuota|terlalu banyak/i);
    await assert.rejects(() => G.identify(PNG, { key: 'k', models: ['a'], fetch: async () => { throw new TypeError('Failed to fetch'); } }), /internet|jaringan/i);
  });

  await t('tanpa kunci atau tanpa foto ditolak sebelum memanggil jaringan', async () => {
    let called = false; const f = async () => { called = true; return reply('{}'); };
    await assert.rejects(() => G.identify(PNG, { key: '', models: ['a'], fetch: f }), /kunci/i);
    await assert.rejects(() => G.identify('bukan-data-url', { key: 'k', models: ['a'], fetch: f }), /foto/i);
    assert.strictEqual(called, false);
  });

  await t('balasan kosong atau diblokir ditolak dengan alasan', async () => {
    await assert.rejects(() => G.identify(PNG, { key: 'k', models: ['a'], fetch: async () => ({ ok: true, status: 200, json: async () => ({ candidates: [] , promptFeedback: { blockReason: 'SAFETY' } }) }) }), /diblokir|kosong/i);
  });

  await t('isi formulir hanya yang masih kosong, tidak menimpa ketikan pengguna', async () => {
    const form = { local: { value: 'Nama saya' }, scientific: { value: '' }, height: { value: '' }, category: { value: 'Rumput' } };
    const n = G.fillEmpty(form, { local: 'Dari AI', scientific: 'Sci', height: 120, category: 'Lainnya', light: 'x' });
    assert.deepStrictEqual([form.local.value, form.scientific.value, form.height.value, form.category.value], ['Nama saya', 'Sci', '120', 'Rumput']);
    assert.strictEqual(n, 2);
  });

  console.log('gemini-plant OK');
})().catch(e => { console.error(e); process.exit(1); });
