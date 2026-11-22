// Jalankan: node test/gdrive-backup.test.js
const assert = require('assert');
require('../lib/gdrive-backup.js');
const D = globalThis.GDriveBackup;
const t = async (name, fn) => { await fn(); console.log('ok - ' + name); };
const json = (body, status = 200, headers = {}) => ({ ok: status < 400, status, headers: { get: k => headers[k.toLowerCase()] || null }, json: async () => body, blob: async () => new Blob([body]) });

(async () => {
  await t('nama berkas bertanggal dan berurutan', () => {
    assert.strictEqual(D.fileName(new Date(2026, 10, 22, 9, 5, 7)), 'jlp-backup-20261122-090507.json.gz');
  });

  await t('unggah bertahap: pembuka di folder app (appDataFolder), lalu isi, ukuran diverifikasi', async () => {
    const calls = [];
    const blob = new Blob(['x'.repeat(1234)]);
    const f = async (url, o) => {
      calls.push([o.method, url, o.headers]);
      if (o.method === 'POST') return json({}, 200, { location: 'https://upload.example/session/1' });
      return json({ id: 'F1', name: 'jlp-backup-a.json.gz', size: '1234' });
    };
    const r = await D.upload('TOKEN', 'jlp-backup-a.json.gz', blob, f);
    assert.strictEqual(r.id, 'F1');
    assert.ok(calls[0][1].includes('uploadType=resumable'));
    assert.strictEqual(calls[0][2].Authorization, 'Bearer TOKEN');
    assert.strictEqual(calls[1][0], 'PUT');
    assert.strictEqual(calls[1][1], 'https://upload.example/session/1');
  });

  await t('metadata unggahan menyebut appDataFolder agar berkas tersembunyi dan hanya milik app', async () => {
    let meta;
    const f = async (url, o) => { if (o.method === 'POST') { meta = JSON.parse(o.body); return json({}, 200, { location: 'u' }); } return json({ id: 'F', size: '3' }); };
    await D.upload('T', 'n', new Blob(['abc']), f);
    assert.deepStrictEqual(meta.parents, ['appDataFolder']);
    assert.strictEqual(meta.name, 'n');
  });

  await t('ukuran di Drive tidak sama: unggahan dianggap gagal', async () => {
    const f = async (url, o) => o.method === 'POST' ? json({}, 200, { location: 'u' }) : json({ id: 'F', size: '10' });
    await assert.rejects(() => D.upload('T', 'n', new Blob(['abc']), f), /verifikasi|ukuran/i);
  });

  await t('daftar berurutan terbaru dulu, ukuran jadi angka', async () => {
    const f = async url => { assert.ok(url.includes('spaces=appDataFolder')); return json({ files: [{ id: 'a', name: 'jlp-backup-1', size: '10', createdTime: '2026-11-01T00:00:00Z' }, { id: 'b', name: 'jlp-backup-2', size: '20', createdTime: '2026-11-02T00:00:00Z' }] }); };
    const l = await D.list('T', f);
    assert.deepStrictEqual(l.map(x => [x.id, x.size]), [['b', 20], ['a', 10]]);
  });

  await t('rapikan: simpan N terbaru, sisanya dihapus', () => {
    const l = [5, 4, 3, 2, 1].map(i => ({ id: 'f' + i, createdTime: '2026-11-0' + i }));
    assert.deepStrictEqual(D.pickToDelete(l, 3).map(x => x.id), ['f2', 'f1']);
    assert.deepStrictEqual(D.pickToDelete(l, 99), []);
    assert.deepStrictEqual(D.pickToDelete(l, 0).length, 4, 'minimal satu cadangan selalu disimpan');
  });

  await t('unduh dan hapus memakai alamat berkas yang benar', async () => {
    const seen = [];
    const f = async (url, o) => { seen.push([o.method || 'GET', url]); return o.method === 'DELETE' ? json({}, 204) : json('isi'); };
    const b = await D.download('T', 'ID/1', f);
    await D.remove('T', 'ID/1', f);
    assert.ok(seen[0][1].includes('/files/ID%2F1?alt=media'));
    assert.deepStrictEqual(seen[1], ['DELETE', 'https://www.googleapis.com/drive/v3/files/ID%2F1']);
    assert.strictEqual(await b.text(), 'isi');
  });

  await t('401 berarti masuk ulang (needLogin), 403 kuota, jaringan putus', async () => {
    await assert.rejects(() => D.list('T', async () => json({ error: { message: 'Invalid Credentials' } }, 401)), e => e.needLogin === true && /masuk/i.test(e.message));
    await assert.rejects(() => D.list('T', async () => json({ error: { errors: [{ reason: 'storageQuotaExceeded' }] } }, 403)), /penuh|kuota/i);
    await assert.rejects(() => D.list('T', async () => json({}, 403)), /izin/i);
    await assert.rejects(() => D.list('T', async () => { throw new TypeError('Failed to fetch'); }), /internet|jaringan/i);
  });

  await t('tanpa token ditolak sebelum memanggil jaringan', async () => {
    let called = false;
    await assert.rejects(() => D.list('', async () => { called = true; return json({}); }), e => e.needLogin === true);
    assert.strictEqual(called, false);
  });

  console.log('gdrive-backup OK');
})().catch(e => { console.error(e); process.exit(1); });
