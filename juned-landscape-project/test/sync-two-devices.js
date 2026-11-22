// Uji browser dua perangkat dengan server Supabase tiruan. Hanya untuk localhost, menimpa data uji di browser.
// Jalankan di console aplikasi: (await import('/test/sync-two-devices.js')).run()
const TK = 'tamankerja:v1', SNAP = 'jlp:sync:snap:';

function fakeServer() {
  const rows = new Map(); let clock = Date.parse('2026-11-22T00:00:00Z');
  const stamp = () => new Date(clock += 1000).toISOString().replace('Z', '123+00:00');
  const key = r => r.coll + '|' + r.id;
  const write = o => { const r = { ...o, updated_at: stamp() }; rows.set(key(r), r); return r; };
  return { rows, async fetch(url, o = {}) {
    const u = new URL(url), m = o.method || 'GET', q = u.searchParams, json = (d, s = 200) => new Response(JSON.stringify(d), { status: s });
    if (m === 'GET') {
      const gt = q.get('updated_at'), since = gt ? Date.parse(gt.replace('gt.', '')) : 0;
      let out = [...rows.values()].filter(r => r.coll !== 'blob' && Date.parse(r.updated_at) > since).sort((a, b) => a.updated_at < b.updated_at ? -1 : 1);
      if (q.get('coll') === 'eq.blob') out = [...rows.values()].filter(r => r.coll === 'blob');
      return json(out);
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
  const realFetch = window.fetch, server = fakeServer(), results = [], devices = {};
  const realCfg = sync.cfg, realAuth = sync.auth, realSt = sync.st, realConf = sync.conflicts;
  window.fetch = (u, o) => String(u).startsWith('https://uji.invalid') ? server.fetch(u, o) : realFetch(u, o);
  sync.cfg = { url: 'https://uji.invalid', anon: 'x' }; sync.auth = { access: 'a', refresh: 'r', exp: Date.now() + 9e6, uid: 'u1' };
  Object.keys(MODS).forEach(unloadFrame); state.view = 'setelan';
  const check = (name, ok, extra) => results.push((ok ? 'ok   ' : 'GAGAL') + ' ' + name + (ok || extra === undefined ? '' : ' -> ' + JSON.stringify(extra)));
  const clearSnaps = async () => { for (const k of Object.keys(await KV.prefix(SNAP))) await KV.del(k); };
  const stash = async n => { devices[n] = { tk: await KV.get(TK), snaps: await KV.prefix(SNAP), st: sync.st, conf: sync.conflicts }; };
  const use = async n => {
    const d = devices[n]; await clearSnaps();
    await KV.set(TK, d.tk || '[]'); for (const k of Object.keys(d.snaps)) await KV.set(k, d.snaps[k]);
    sync.st = d.st; sync.conflicts = d.conf;
  };
  let on = null;
  const dev = async n => { if (on) await stash(on); await use(n); on = n; };
  const edit = async fn => { const a = JSON.parse(await KV.get(TK)); fn(a[0]); await KV.set(TK, JSON.stringify(a)); };
  const cycle = async () => { await syncPull({ force: true }); return syncPush(); };
  const settle = async () => { for (let i = 0; i < 3; i++) for (const n of ['A', 'B']) { await dev(n); await cycle(); } };
  const read = async () => JSON.parse(await KV.get(TK))[0];
  const fresh = p => { server.rows.clear(); devices.A = { tk: JSON.stringify([p]), snaps: {}, st: { cursor: null, base: {}, blobs: {} }, conf: [] }; devices.B = { tk: '[]', snaps: {}, st: { cursor: null, base: {}, blobs: {} }, conf: [] }; on = null; };
  const proj = () => ({ id: 1, name: 'Uji', client: 'A', tasks: [{ id: 10, t: 'Gali', s: 0 }], rab: [{ id: 20, n: 'Batu', k: 'Material', q: 5, u: 'm', h: 100 }] });

  try {
    fresh(proj()); await settle();
    await dev('A'); await edit(p => { p.tasks[0].s = 2; });
    await dev('B'); await edit(p => { p.rab[0].h = 150; p.rab.push({ id: 21, n: 'Pasir', k: 'Material', q: 1, u: 'm', h: 9 }); });
    await settle(); await dev('A'); const a1 = await read(); await dev('B'); const b1 = await read();
    check('edit offline beda bagian: A dapat semua', a1.tasks[0].s === 2 && a1.rab[0].h === 150 && a1.rab.length === 2, a1);
    check('edit offline beda bagian: B dapat semua', b1.tasks[0].s === 2 && b1.rab[0].h === 150 && b1.rab.length === 2, b1);
    check('tanpa konflik palsu', devices.A.conf.length + sync.conflicts.length === 0);

    fresh(proj()); await settle();
    await dev('A'); await edit(p => { p.tasks[0].s = 1; }); await syncPull({ force: true });   // A sudah tarik, belum dorong
    await dev('B'); await edit(p => { p.rab[0].q = 7; }); await cycle();                        // B mendorong di sela-sela
    await dev('A'); await syncPush(); await settle();
    await dev('A'); const a2 = await read(); await dev('B'); const b2 = await read();
    check('balapan: perubahan B tidak tertimpa A', a2.rab[0].q === 7 && b2.rab[0].q === 7, [a2.rab[0].q, b2.rab[0].q]);
    check('balapan: perubahan A tetap ada', a2.tasks[0].s === 1 && b2.tasks[0].s === 1, [a2.tasks[0].s, b2.tasks[0].s]);

    fresh(proj()); await settle();
    await dev('A'); await edit(p => { p.rab[0].h = 111; }); await cycle();
    await dev('B'); await edit(p => { p.rab[0].h = 222; p.tasks[0].s = 2; }); await cycle();
    check('bentrok harga masuk Konflik', sync.conflicts.length === 1 && /Batu/.test(sync.conflicts[0].lbl), sync.conflicts);
    const k = sync.conflicts[0] && sync.conflicts[0].k;
    if (k) { await useConflict(k); const v = await read(); check('Pakai versi ini hanya ganti harga', v.rab[0].h === 111 && v.tasks[0].s === 2, v); }
    await settle(); await dev('A'); const a3 = await read(); await dev('B'); const b3 = await read();
    check('kedua perangkat sama setelah konflik', JSON.stringify(a3) === JSON.stringify(b3), [a3, b3]);

    fresh(proj()); await settle();
    await dev('A'); await edit(p => { p.rab = []; });
    await dev('B'); await edit(p => { p.client = 'B'; });
    await settle(); await dev('A'); const a4 = await read();
    check('hapus item ikut tergabung dengan edit lain', a4.rab.length === 0 && a4.client === 'B', a4);
  } catch (e) { results.push('GAGAL error: ' + e.message); }
  finally {
    window.fetch = realFetch; sync.cfg = realCfg; sync.auth = realAuth; sync.st = realSt; sync.conflicts = realConf;
    await clearSnaps(); await KV.del(TK);
  }
  return results;
}
