// Uji browser skenario sinkron dan cadangan dengan server Supabase tiruan. Hanya untuk localhost, menimpa data uji di browser.
// Jalankan di console aplikasi: (await import('/test/sync-scenarios.js')).run()
const KEYS = ['tamankerja:v1', 'plantbase_landscape_v1', 'landspace:', 'jlp:sync:'];
const own = k => KEYS.some(p => k.indexOf(p) === 0);

function fakeServer() {
  const rows = new Map(); let clock = Date.parse('2026-11-25T00:00:00Z');
  const stamp = () => new Date(clock += 1000).toISOString().replace('Z', '123+00:00');
  const key = r => r.coll + '|' + r.id;
  const write = o => { const r = { ...o, updated_at: stamp() }; rows.set(key(r), r); return r; };
  return { rows, async fetch(url, o = {}) {
    const u = new URL(url), m = o.method || 'GET', q = u.searchParams, json = (d, s = 200) => new Response(JSON.stringify(d), { status: s });
    if (m === 'GET') {
      if (q.get('coll') === 'eq.blob') { const want = decodeURIComponent(q.get('id') || '').replace(/^in\.\(|\)$/g, '').split(',').map(s => s.replace(/"/g, '')); return json([...rows.values()].filter(r => r.coll === 'blob' && want.includes(r.id))); }
      const gt = q.get('updated_at'), since = gt ? Date.parse(gt.replace('gt.', '')) : 0;
      return json([...rows.values()].filter(r => r.coll !== 'blob' && Date.parse(r.updated_at) > since).sort((a, b) => a.updated_at < b.updated_at ? -1 : 1));
    }
    const body = JSON.parse(o.body || '[]');
    if (m === 'PATCH') {
      const r = rows.get(q.get('coll').slice(3) + '|' + q.get('id').slice(3));
      if (!r || r.updated_at !== q.get('updated_at').slice(3)) return json([]);
      return json([write({ ...r, ...body })]);
    }
    const ignore = String((o.headers || {}).Prefer).includes('ignore-duplicates');
    return json(body.filter(b => !(ignore && rows.has(key(b)))).map(write));
  } };
}

export async function run() {
  if (location.hostname !== 'localhost') throw new Error('Hanya untuk localhost');
  const realFetch = window.fetch, results = [], devices = {};
  let server = fakeServer();
  const real = { cfg: sync.cfg, auth: sync.auth, st: sync.st, conf: sync.conflicts, confirm: window.confirmBox };
  window.fetch = (u, o) => String(u).startsWith('https://uji.invalid') ? server.fetch(u, o) : realFetch(u, o);
  sync.cfg = { url: 'https://uji.invalid', anon: 'x' }; sync.auth = { access: 'a', refresh: 'r', exp: Date.now() + 9e6, uid: 'u1', email: 'uji@contoh.id' };
  Object.keys(MODS).forEach(unloadFrame); state.view = 'setelan';
  const check = (name, ok, extra) => results.push((ok ? 'ok   ' : 'GAGAL') + ' ' + name + (ok || extra === undefined ? '' : ' -> ' + JSON.stringify(extra).slice(0, 300)));
  const dump = async () => Object.fromEntries(Object.entries(await KV.entries()).filter(([k]) => own(k)));
  const wipe = async () => { for (const k of Object.keys(await dump())) await KV.del(k); };
  const stash = async n => { devices[n] = { kv: await dump(), st: sync.st, conf: sync.conflicts }; };
  const use = async n => { await wipe(); const d = devices[n]; for (const [k, v] of Object.entries(d.kv)) await KV.set(k, v); sync.st = d.st; sync.conflicts = d.conf; };
  let on = null;
  const dev = async n => { if (on) await stash(on); await use(n); on = n; };
  const cycle = async () => { await syncPull({ force: true }); return syncPush(); };
  const settle = async () => { for (let i = 0; i < 2; i++) for (const n of ['A', 'B']) { await dev(n); await cycle(); } };
  const get = async k => JSON.parse(await KV.get(k) || 'null');
  const blank = () => ({ kv: {}, st: { cursor: null, base: {}, blobs: {} }, conf: [] });
  const photo = 'data:image/jpeg;base64,' + 'A'.repeat(9000);   // > 4096: dikirim sebagai potongan blob

  try {
    await wipe();
    devices.A = { kv: {
      'tamankerja:v1': JSON.stringify([{ id: 1, name: 'Taman Pak Budi', tasks: [], rab: [{ id: 2, n: 'Batu', q: 3, u: 'm2', h: 100 }] }]),
      'plantbase_landscape_v1': JSON.stringify([{ id: 'p1', local: 'Soka', updatedAt: '2026-11-25T00:00:00Z' }, { id: 'p2', local: 'Pucuk merah', updatedAt: '2026-11-25T00:00:00Z' }]),
      'landspace:p:s1': JSON.stringify({ id: 's1', name: 'Survei 1', areas: [{ id: 'a1', name: 'Depan', fields: [{ id: 'f1', name: 'Bidang A', shape: 'polygon', points: [[0, 0], [5, 0], [5, 3]] }] }], photos: [] }),
      'landspace:photo:ph1': JSON.stringify({ id: 'ph1', data: photo }),
      'jlp:sync:gemini': JSON.stringify({ key: 'AIzaKUNCI-A', models: 'gemini-3.6-flash' }),
    }, st: { cursor: null, base: {}, blobs: {} }, conf: [] };
    devices.B = blank(); on = null;

    // 1. perangkat baru menerima semua jenis data
    await settle(); await dev('B');
    check('perangkat baru: proyek turun', (await get('tamankerja:v1'))?.[0]?.name === 'Taman Pak Budi');
    check('perangkat baru: tanaman turun', (await get('plantbase_landscape_v1'))?.length === 2);
    check('perangkat baru: survei dengan polygon turun', (await get('landspace:p:s1'))?.areas?.[0]?.fields?.[0]?.points?.length === 3);
    check('perangkat baru: foto besar utuh (lewat potongan blob)', (await get('landspace:photo:ph1'))?.data === photo);
    check('perangkat baru: kunci Gemini akun ikut', (await get('jlp:sync:gemini'))?.key === 'AIzaKUNCI-A');
    check('tidak ada konflik palsu', sync.conflicts.length === 0, sync.conflicts.map(c => c.lbl));

    // 2. hapus tanaman di A menyebar ke B
    await dev('A'); const pl = await get('plantbase_landscape_v1'); await KV.set('plantbase_landscape_v1', JSON.stringify(pl.filter(p => p.id !== 'p2')));
    await settle(); await dev('B');
    check('hapus tanaman di A ikut terhapus di B', JSON.stringify((await get('plantbase_landscape_v1')).map(p => p.id)) === '["p1"]');

    // 3. kunci Gemini diganti lalu dihapus di A
    await dev('A'); await KV.set('jlp:sync:gemini', JSON.stringify({ key: 'AIzaKUNCI-BARU', models: '' }));
    await settle(); await dev('B');
    check('kunci Gemini baru sampai ke B', (await get('jlp:sync:gemini'))?.key === 'AIzaKUNCI-BARU');
    await dev('A'); await KV.del('jlp:sync:gemini');
    await settle(); await dev('B');
    check('kunci Gemini dihapus di A ikut terhapus di B', (await KV.get('jlp:sync:gemini')) === null);
    await dev('A'); await KV.set('jlp:sync:gemini', JSON.stringify({ key: 'AIzaKUNCI-A', models: '' })); await settle();

    // 4. cadangan dibuat lalu dipulihkan di B
    await dev('B');
    const backup = await makeBackup(), text = JSON.stringify(backup);
    check('cadangan tidak memuat kunci Gemini atau catatan sinkron', !text.includes('AIzaKUNCI') && !Object.keys(backup.kv).some(k => k.indexOf('jlp:sync:') === 0));
    check('cadangan memuat proyek, tanaman, survei, dan foto', ['tamankerja:v1', 'plantbase_landscape_v1', 'landspace:p:s1', 'landspace:photo:ph1'].every(k => k in backup.kv));
    const snapsBefore = Object.keys(await KV.prefix('jlp:sync:snap:')).length;
    const p = await get('tamankerja:v1'); p[0].name = 'DIUBAH SETELAH CADANGAN'; await KV.set('tamankerja:v1', JSON.stringify(p));
    window.confirmBox = async () => true;
    await restoreFromFile(new File([text], 'cadangan.json', { type: 'application/json' }));
    window.confirmBox = real.confirm;
    state.view = 'setelan'; Object.keys(MODS).forEach(unloadFrame);
    check('pulihkan: data kembali ke isi cadangan', (await get('tamankerja:v1'))[0].name === 'Taman Pak Budi');
    check('pulihkan: kunci Gemini tetap ada', (await get('jlp:sync:gemini'))?.key === 'AIzaKUNCI-A');
    check('pulihkan: salinan dasar penggabungan tetap ada', Object.keys(await KV.prefix('jlp:sync:snap:')).length === snapsBefore && snapsBefore > 0, snapsBefore);
    await loadSyncState();
    // perubahan dari A setelah B memulihkan: harus tergabung, bukan masuk Konflik
    await stash('B'); on = 'B';
    await dev('A'); const pa = await get('tamankerja:v1'); pa[0].rab[0].q = 9; await KV.set('tamankerja:v1', JSON.stringify(pa)); await cycle();
    await dev('B'); await cycle();
    check('setelah pulihkan: perubahan perangkat lain tergabung tanpa konflik', (await get('tamankerja:v1'))[0].rab[0].q === 9 && sync.conflicts.length === 0, sync.conflicts.map(c => c.lbl));

    // 5. keluar: kunci hilang dari perangkat, masuk lagi: kunci kembali dari akun
    await gmForgetLocal();
    check('keluar: kunci Gemini dihapus dari perangkat', (await KV.get('jlp:sync:gemini')) === null);
    await cycle();
    check('keluar: kunci di akun tidak ikut terhapus', [...server.rows.values()].some(r => r.coll === 'app:gemini' && !r.deleted && r.data.key === 'AIzaKUNCI-A'));
    await syncPull({ force: true });
    check('masuk lagi: kunci Gemini diunduh ulang dari akun', (await get('jlp:sync:gemini'))?.key === 'AIzaKUNCI-A');

    // 6. ganti ke akun lain: kunci akun lama tidak terunggah ke akun baru
    const other = fakeServer(); server = other; sync.auth = { access: 'a2', refresh: 'r2', exp: Date.now() + 9e6, uid: 'u2', email: 'lain@contoh.id' };
    LS.set('jlp_sync_uid', 'u1'); window.confirmBox = async () => true;
    await loginAccept({ access_token: 'a2', refresh_token: 'r2', expires_in: 3600, user: { id: 'u2', email: 'lain@contoh.id' } });
    window.confirmBox = real.confirm; sync.st = null; await loadSyncState();
    await cycle();
    check('ganti akun: kunci akun lama tidak ada di perangkat', (await KV.get('jlp:sync:gemini')) === null);
    check('ganti akun: kunci akun lama tidak terunggah ke akun baru', ![...other.rows.values()].some(r => r.coll === 'app:gemini'));
    check('ganti akun: data perangkat ikut digabung (sudah dikonfirmasi)', [...other.rows.values()].some(r => r.coll === 'tk:p'));
  } catch (e) { results.push('GAGAL error: ' + e.message + ' ' + (e.stack || '').split('\n')[1]); }
  finally {
    window.fetch = realFetch; window.confirmBox = real.confirm;
    sync.cfg = real.cfg; sync.auth = real.auth; sync.st = real.st; sync.conflicts = real.conf;
    LS.del('jlp_sync_uid'); LS.del('jlp_sync_auth');
    await wipe();
  }
  return results;
}
