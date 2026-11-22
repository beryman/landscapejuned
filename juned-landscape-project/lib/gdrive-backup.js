/* Cadangan ke Google Drive lewat REST (folder tersembunyi milik aplikasi: appDataFolder).
   Token OAuth diberikan pemanggil; modul ini tidak menyimpan apa pun. Diuji: node test/gdrive-backup.test.js */
(function (root) {
  'use strict';
  const API = 'https://www.googleapis.com/drive/v3/files';
  const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';
  const PREFIX = 'jlp-backup-';
  const pad = n => String(n).padStart(2, '0');
  const fileName = (d = new Date()) => PREFIX + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + '-' + pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds()) + '.json.gz';

  function needLogin(msg) { const e = new Error(msg || 'Sesi Google berakhir. Masuk lagi dengan Google.'); e.needLogin = true; return e; }
  async function failure(res) {
    let j = null; try { j = await res.json(); } catch (_) {}
    const reason = JSON.stringify(j && j.error || '');
    if (res.status === 401) return needLogin('Sesi Google berakhir. Masuk lagi dengan Google.');
    if (/storageQuotaExceeded/i.test(reason)) return new Error('Ruang Google Drive penuh. Kosongkan ruang atau hapus cadangan lama.');
    if (res.status === 403) return new Error('Google Drive menolak izin. Masuk lagi dan setujui akses penyimpanan data aplikasi.');
    return new Error('Google Drive error ' + res.status + '.');
  }
  async function call(token, url, opts, f) {
    if (!token) throw needLogin();
    let res;
    try { res = await f(url, { ...opts, headers: { Authorization: 'Bearer ' + token, ...(opts && opts.headers) } }); }
    catch (_) { throw new Error('Tidak bisa menghubungi Google Drive. Periksa koneksi internet.'); }
    if (!res.ok) throw await failure(res);
    return res;
  }
  const dflt = () => root.fetch.bind(root);

  // Dua langkah (resumable): buka sesi dengan metadata, lalu kirim isi sekaligus. Ukuran diverifikasi.
  async function upload(token, name, blob, f = dflt()) {
    const open = await call(token, UPLOAD + '?uploadType=resumable&fields=id,name,size', {
      method: 'POST', headers: { 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Type': 'application/gzip' },
      body: JSON.stringify({ name, parents: ['appDataFolder'] })
    }, f);
    const loc = open.headers.get('location');
    if (!loc) throw new Error('Google Drive tidak memberi alamat unggah.');
    const done = await call(token, loc, { method: 'PUT', headers: { 'Content-Type': 'application/gzip' }, body: blob }, f);
    const r = await done.json();
    if (Number(r.size) !== blob.size) throw new Error('Verifikasi gagal: ukuran di Google Drive (' + r.size + ') tidak sama dengan yang dikirim (' + blob.size + ').');
    return { id: r.id, name: r.name, size: Number(r.size) };
  }
  async function list(token, f = dflt()) {
    const q = encodeURIComponent("name contains '" + PREFIX + "'");
    const res = await call(token, API + '?spaces=appDataFolder&pageSize=50&q=' + q + '&fields=' + encodeURIComponent('files(id,name,size,createdTime)'), {}, f);
    return ((await res.json()).files || []).map(x => ({ id: x.id, name: x.name, size: Number(x.size) || 0, createdTime: x.createdTime })).sort((a, b) => String(b.createdTime).localeCompare(String(a.createdTime)));
  }
  async function download(token, id, f = dflt()) { return (await call(token, API + '/' + encodeURIComponent(id) + '?alt=media', {}, f)).blob(); }
  async function remove(token, id, f = dflt()) { await call(token, API + '/' + encodeURIComponent(id), { method: 'DELETE' }, f); }
  // Terbaru dulu; minimal satu salinan selalu dipertahankan.
  const pickToDelete = (files, keep) => files.slice(Math.max(1, keep));

  root.GDriveBackup = { PREFIX, fileName, upload, list, download, remove, pickToDelete };
})(typeof window !== 'undefined' ? window : globalThis);
