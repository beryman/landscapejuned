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
    assert.ok(!('temperature' in body.generationConfig), 'model baru menolak parameter sampling');
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

  await t('503 sibuk: model yang sama dicoba sekali lagi lalu berhasil', async () => {
    let n = 0;
    const out = await G.identify(PNG, { key: 'k', models: ['a'], wait: async () => {}, fetch: async () => (++n === 1 ? fail(503) : reply('{"local":"Soka"}')) });
    assert.strictEqual(n, 2);
    assert.strictEqual(out.fields.local, 'Soka');
  });

  await t('503 terus-menerus: pesan sibuk yang jelas, bukan kode mentah', async () => {
    await assert.rejects(() => G.identify(PNG, { key: 'k', models: ['a'], wait: async () => {}, fetch: async () => fail(503) }), /sibuk/i);
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

  await t('kuota habis menandai galat (quota) agar impor banyak foto berhenti', async () => {
    await assert.rejects(() => G.identify(PNG, { key: 'k', models: ['a'], fetch: async () => fail(429) }), e => e.quota === true);
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

  // ---------- identifikasi dari nama ----------
  await t('dari nama: hanya teks (tanpa foto), nama ada di perintah, kunci di header, hasil dinormalkan', async () => {
    let seen;
    const out = await G.identifyByName('  Pucuk merah  ', { key: 'KUNCI', models: ['m1'], fetch: async (url, o) => { seen = { url, o }; return reply('{"local":"Pucuk merah","scientific":"Syzygium myrtifolium","category":"semak / pagar","height":300,"confidence":0.9}'); } });
    const body = JSON.parse(seen.o.body);
    assert.strictEqual(body.contents[0].parts.length, 1);
    assert.ok(!('inline_data' in body.contents[0].parts[0]));
    assert.ok(body.contents[0].parts[0].text.includes('Pucuk merah'));
    assert.strictEqual(seen.o.headers['x-goog-api-key'], 'KUNCI');
    assert.ok(!seen.url.includes('KUNCI'));
    assert.deepStrictEqual([out.fields.scientific, out.fields.category, out.fields.height, out.model], ['Syzygium myrtifolium', 'Semak / pagar', 300, 'm1']);
  });

  await t('dari nama: nama kosong atau tanpa kunci ditolak sebelum memanggil jaringan; markup dibuang', async () => {
    let calls = 0; const f = async (u, o) => { calls++; return reply('{"local":"X"}'); };
    await assert.rejects(() => G.identifyByName('   ', { key: 'k', models: ['a'], fetch: f }), /nama/i);
    await assert.rejects(() => G.identifyByName('Soka', { key: '', models: ['a'], fetch: f }), /kunci/i);
    assert.strictEqual(calls, 0);
    let sent; await G.identifyByName('<script>x</script>Soka', { key: 'k', models: ['a'], fetch: async (u, o) => { sent = o.body; return reply('{"local":"Soka"}'); } });
    assert.ok(!/<script>/.test(JSON.parse(sent).contents[0].parts[0].text));
  });

  await t('dari nama: nama yang tidak dikenali (kepercayaan 0) ditolak dengan pesan jelas', async () => {
    await assert.rejects(() => G.identifyByName('asdfgh', { key: 'k', models: ['a'], fetch: async () => reply('{"local":"","confidence":0}') }), /tidak dikenali|tidak ditemukan/i);
  });

  await t('dari nama: 503 dicoba ulang dan model berikutnya dipakai seperti identifikasi foto', async () => {
    const tried = [];
    const out = await G.identifyByName('Soka', { key: 'k', models: ['a', 'b'], wait: async () => {}, fetch: async url => { tried.push(url.match(/models\/([^:]+)/)[1]); return tried.length <= 2 ? fail(503) : reply('{"local":"Soka"}'); } });
    assert.deepStrictEqual(tried, ['a', 'a', 'b']);
    assert.strictEqual(out.model, 'b');
  });

  // ---------- tes koneksi ----------
  await t('tes koneksi: berhasil melaporkan model yang dipakai, hanya teks, tanpa memeriksa isi balasan', async () => {
    let body;
    const r = await G.test({ key: 'KUNCI', models: ['a', 'b'], fetch: async (u, o) => { body = JSON.parse(o.body); return reply('OK'); } });
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.model, 'a');
    assert.ok(!('inline_data' in body.contents[0].parts[0]));
  });

  await t('tes koneksi: model pertama tidak ada (404) maka model kedua dicoba dan dilaporkan', async () => {
    let n = 0;
    const r = await G.test({ key: 'k', models: ['a', 'b'], fetch: async () => (++n === 1 ? fail(404) : reply('OK')) });
    assert.strictEqual(r.model, 'b');
  });

  await t('tes koneksi: kunci salah, kuota habis, tanpa kunci, dan server sibuk punya pesan sendiri', async () => {
    await assert.rejects(() => G.test({ key: 'k', models: ['a'], fetch: async () => fail(400, { error: { message: 'API key not valid' } }) }), /kunci/i);
    await assert.rejects(() => G.test({ key: 'k', models: ['a'], fetch: async () => fail(429) }), /kuota/i);
    await assert.rejects(() => G.test({ key: '', models: ['a'], fetch: async () => reply('OK') }), /kunci/i);
    await assert.rejects(() => G.test({ key: 'k', models: ['a'], wait: async () => {}, fetch: async () => fail(503) }), /sibuk/i);
  });

  await t('isi formulir hanya yang masih kosong, tidak menimpa ketikan pengguna', async () => {
    const form = { local: { value: 'Nama saya' }, scientific: { value: '' }, height: { value: '' }, category: { value: 'Rumput' } };
    const n = G.fillEmpty(form, { local: 'Dari AI', scientific: 'Sci', height: 120, category: 'Lainnya', light: 'x' });
    assert.deepStrictEqual([form.local.value, form.scientific.value, form.height.value, form.category.value], ['Nama saya', 'Sci', '120', 'Rumput']);
    assert.strictEqual(n, 2);
  });

  await t('kolom yang diisi AI ditandai (ai=1) agar bisa diisi ulang nanti', async () => {
    const form = { local: { value: '', dataset: {} }, height: { value: '', dataset: {} } };
    G.fillEmpty(form, { local: 'Soka', height: 120 });
    assert.deepStrictEqual([form.local.dataset.ai, form.height.dataset.ai], ['1', '1']);
  });

  await t('isi ulang dari nama: kolom hasil AI sebelumnya ditimpa, ketikan pengguna tetap, tanpa opsi tidak ditimpa', async () => {
    const mk = () => ({ local: { value: 'Ketikan saya', dataset: {} }, scientific: { value: 'Salah dari AI', dataset: { ai: '1' } }, height: { value: '999', dataset: {} } });
    const a = mk(); const n = G.fillEmpty(a, { local: 'X', scientific: 'Benar', height: 100 }, { replaceAI: true });
    assert.deepStrictEqual([a.local.value, a.scientific.value, a.height.value, n], ['Ketikan saya', 'Benar', '999', 1]);
    const b = mk(); G.fillEmpty(b, { scientific: 'Benar' });
    assert.strictEqual(b.scientific.value, 'Salah dari AI');
  });

  await t('model bawaan: gemini-3.6-flash lebih dulu, lainnya cadangan', async () => {
    assert.strictEqual(G.MODELS[0], 'gemini-3.6-flash');
    assert.ok(G.MODELS.length >= 2);
  });

  console.log('gemini-plant OK');
})().catch(e => { console.error(e); process.exit(1); });
