/* Juned Landscape Project - sinkron antar perangkat (Supabase).
   Model: setiap data (proyek, tanaman, material, RAB, transaksi, dst.) = 1 baris di tabel jlp_docs.
   Alur tiap putaran: tarik perubahan server -> terapkan -> dorong perubahan lokal.
   Deteksi perubahan memakai hash per data dibanding "base" (kondisi sinkron terakhir). */
'use strict';
const SK = { tk: 'tamankerja:v1', tkcfg: 'tk:cfg', pbp: 'plantbase_landscape_v1', pbm: 'plantbase_materials_v18', pbr: 'plantbase_rabs_v18' };
const SYNC_COLLS = [
  { c: 'tk:p', key: SK.tk, mod: 'proyek', merge: true, lbl: r => 'Proyek: ' + r.name },
  { c: 'pb:plant', key: SK.pbp, mod: 'tanaman', lbl: r => 'Tanaman: ' + (r.local || r.name) },
  { c: 'pb:mat', key: SK.pbm, mod: 'tanaman', lbl: r => 'Material: ' + r.name },
  { c: 'pb:rab', key: SK.pbr, mod: 'tanaman', lbl: r => 'RAB katalog: ' + r.name },
  { c: 'tk:cfg', key: SK.tkcfg, mod: 'proyek', single: true, lbl: () => 'Pengaturan Proyek' },
  // Survei (LANDSPACE): satu kunci KV per proyek dan per foto, supaya mengubah satu proyek tidak menulis ulang semua foto
  { c: 'ls:p', prefix: 'landspace:p:', mod: 'survei', merge: true, lbl: r => 'Survei: ' + r.name },
  { c: 'ls:photo', prefix: 'landspace:photo:', mod: 'survei', lbl: r => 'Foto survei: ' + r.id },
  { c: 'ls:cfg', key: 'landspace:cfg', single: true, mod: 'survei', lbl: () => 'Pengaturan Survei' }
  // Koleksi fin:* sengaja tidak lagi ditarik/didorong: baris lamanya tetap utuh di cloud, HP baru tidak menerimanya.
];
const CHUNK = 400000;
const sync = { cfg: null, auth: null, st: null, running: false, again: false, deferred: false, status: 'off', msg: '', lastOk: 0, dt: 0, timer: 0, conflicts: [] };
const LS = {
  get(k) { try { return localStorage.getItem(k); } catch (_) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (_) {} },
  del(k) { try { localStorage.removeItem(k); } catch (_) {} }
};
const jparse = (s, d) => { try { return s ? JSON.parse(s) : d; } catch (_) { return d; } };

/* ---------- util hash / kanonik ---------- */
async function sha256(s) {
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(h)).map(x => x.toString(16).padStart(2, '0')).join('');
}
function stable(v) {
  if (v === undefined) return 'null';
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']';
  return '{' + Object.keys(v).filter(k => v[k] !== undefined).sort().map(k => JSON.stringify(k) + ':' + stable(v[k])).join(',') + '}';
}
// mode 'diff': murah (Blob -> sidik jari ukuran+tipe). mode 'push': Blob dibaca & di-hash.
async function toCanon(v, blobs, mode) {
  if (typeof v === 'string') {
    if (v.length > 4096 && v.slice(0, 5) === 'data:') { const h = await sha256(v); if (blobs) blobs.set(h, v); return '@@blob:' + h + ':' + Math.ceil(v.length / CHUNK); }
    return v;
  }
  if (typeof Blob !== 'undefined' && v instanceof Blob) {
    if (mode !== 'push') return '@@fp:' + v.size + ':' + v.type;
    const d = await blobToDataURL(v), h = await sha256(d); if (blobs) blobs.set(h, d);
    return '@@blob:' + h + ':' + Math.ceil(d.length / CHUNK);
  }
  if (Array.isArray(v)) { const o = []; for (const x of v) o.push(await toCanon(x, blobs, mode)); return o; }
  if (v && typeof v === 'object') { const o = {}; for (const k of Object.keys(v)) { if (v[k] === undefined) continue; o[k] = await toCanon(v[k], blobs, mode); } return o; }
  return v;
}
const recHash = async rec => sha256(stable(await toCanon(rec, null, 'diff')));
async function expandCanon(v, fetchBlob, blobKeyHint) {
  if (typeof v === 'string') { const m = /^@@blob:([0-9a-f]{64}):(\d+)$/.exec(v); return m ? await fetchBlob(m[1], +m[2]) : v; }
  if (Array.isArray(v)) { const o = []; for (const x of v) o.push(await expandCanon(x, fetchBlob)); return o; }
  if (v && typeof v === 'object') { const o = {}; for (const k of Object.keys(v)) o[k] = await expandCanon(v[k], fetchBlob); return o; }
  return v;
}

/* ---------- konfigurasi & sesi ---------- */
// Koneksi bawaan dari config.js; yang disimpan di perangkat (kode koneksi manual) tetap diutamakan.
function builtInCfg() {
  const c = window.JLP_CONFIG || {}, url = normUrl(c.supabaseUrl);
  return url && c.supabaseAnon ? { url, anon: String(c.supabaseAnon).trim() } : null;
}
function syncLoadCfg() {
  sync.cfg = jparse(LS.get('jlp_sync_cfg'), null) || builtInCfg();
  sync.auth = jparse(LS.get('jlp_sync_auth'), null);
}
const syncConfigured = () => !!(sync.cfg && sync.cfg.url && sync.cfg.anon);
const syncLoggedIn = () => !!(sync.auth && sync.auth.refresh);
const syncOn = () => LS.get('jlp_sync_on') !== '0';
const syncReady = () => syncConfigured() && syncLoggedIn() && syncOn() && !!(window.crypto && crypto.subtle);
function deviceId() { let d = LS.get('jlp_sync_dev'); if (!d) { d = 'dev-' + Math.random().toString(36).slice(2, 10); LS.set('jlp_sync_dev', d); } return d; }
function normUrl(u) { u = String(u || '').trim().replace(/\/+$/, ''); return /^https:\/\/[^\s/]+$/.test(u) || /^http:\/\/localhost(:\d+)?$/.test(u) ? u : ''; }
function connCode() { return btoa(unescape(encodeURIComponent(JSON.stringify({ u: sync.cfg.url, k: sync.cfg.anon })))); }
function parseConnCode(c) { try { const o = JSON.parse(decodeURIComponent(escape(atob(String(c).trim())))); const u = normUrl(o.u); return u && o.k ? { url: u, anon: String(o.k).trim() } : null; } catch (_) { return null; } }

async function authReq(path, body) {
  const res = await fetch(sync.cfg.url + path, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: sync.cfg.anon }, body: JSON.stringify(body) });
  let j = null; try { j = await res.json(); } catch (_) {}
  if (!res.ok) throw new Error(authMsg(res.status, j));
  return j;
}
function authMsg(status, j) {
  const m = String((j && (j.msg || j.error_description || j.message || j.error)) || '');
  if (/invalid login/i.test(m)) return 'Email atau kata sandi salah.';
  if (/already registered|already exists/i.test(m)) return 'Email sudah terdaftar. Gunakan Masuk.';
  if (/email not confirmed/i.test(m)) return 'Email belum dikonfirmasi. Buka email dari Supabase, klik tautannya, lalu Masuk.';
  if (/password/i.test(m) && /(short|least|weak)/i.test(m)) return 'Kata sandi terlalu lemah (minimal 6 karakter).';
  if (/rate limit|too many/i.test(m)) return 'Terlalu banyak percobaan. Tunggu beberapa menit.';
  if (status === 401 || /api ?key/i.test(m)) return 'Kunci (anon/publishable) tidak valid untuk proyek ini.';
  return m || ('Gagal (' + status + ')');
}
function storeSession(j) {
  if (!j || !j.access_token) return false;
  sync.auth = { access: j.access_token, refresh: j.refresh_token, exp: Date.now() + (num(j.expires_in) || 3600) * 1000 - 60000, uid: j.user && j.user.id, email: (j.user && j.user.email) || (sync.auth && sync.auth.email) || '' };
  LS.set('jlp_sync_auth', JSON.stringify(sync.auth)); return true;
}
async function syncSignIn(email, pass) { const j = await authReq('/auth/v1/token?grant_type=password', { email, password: pass }); storeSession(j); }
async function syncSignUp(email, pass) {
  const j = await authReq('/auth/v1/signup', { email, password: pass });
  if (j && j.access_token) { storeSession(j); return true; }
  return false; // butuh konfirmasi email
}
async function refreshToken() {
  const j = await authReq('/auth/v1/token?grant_type=refresh_token', { refresh_token: sync.auth.refresh });
  if (!storeSession(j)) throw new Error('Sesi berakhir. Masuk lagi.');
}
async function ensureToken() { if (!sync.auth) throw new Error('Belum masuk'); if (Date.now() >= (sync.auth.exp || 0)) await refreshToken(); }
async function sbFetch(path, opts = {}, retry = true) {
  await ensureToken();
  const res = await fetch(sync.cfg.url + path, { ...opts, headers: { apikey: sync.cfg.anon, Authorization: 'Bearer ' + sync.auth.access, 'Content-Type': 'application/json', ...(opts.headers || {}) } });
  if (res.status === 401 && retry) { await refreshToken(); return sbFetch(path, opts, false); }
  return res;
}
async function sbErr(res) {
  let j = null, t = ''; try { t = await res.text(); j = JSON.parse(t); } catch (_) {}
  const m = (j && (j.message || j.hint || j.details)) || t || '';
  if (/read-only transaction|no space left|disk is full|could not extend file|exceed.*(database size|quota)/i.test(m)) { const e = new Error('Database cloud penuh. Hemat ruang atau tingkatkan paket Supabase.'); e.full = true; return e; }
  if (res.status === 404 || /relation .* does not exist|jlp_docs/i.test(m)) return new Error('Tabel jlp_docs belum dibuat di Supabase. Jalankan sync-setup.sql (lihat SINKRON.md).');
  if (res.status === 401 || res.status === 403) return new Error('Akses ditolak server (' + res.status + '). Masuk ulang atau periksa kebijakan RLS.');
  if (res.status === 413) return new Error('Data terlalu besar untuk satu permintaan (413).');
  return new Error('Server ' + res.status + ': ' + String(m).slice(0, 160));
}

/* ---------- state tersimpan (di perangkat; tidak ikut cadangan) ---------- */
async function loadSyncState() {
  const st = await kvJSON('jlp:sync:state', null);
  sync.st = st && st.base ? st : { cursor: null, base: {}, blobs: {} };
  sync.conflicts = await kvJSON('jlp:sync:conflicts', []);
}
const saveSyncState = () => KV.set('jlp:sync:state', JSON.stringify(sync.st));
const saveConflicts = () => KV.set('jlp:sync:conflicts', JSON.stringify(sync.conflicts.slice(-25)));

/* ---------- baca/tulis data lokal per koleksi ---------- */
async function localMap(def) {
  if (def.store) { const rows = await finAll(def.store); return new Map(rows.filter(r => r && r.id != null).map(r => [String(r.id), r])); }
  if (def.prefix) {   // koleksi "satu kunci per data": nilai = JSON satu data
    const all = await KV.prefix(def.prefix), m = new Map();
    for (const k of Object.keys(all)) { const r = jparse(all[k], null); if (r && r.id != null) m.set(String(r.id), r); }
    return m;
  }
  const raw = await KV.get(def.key);
  if (def.single) { const o = jparse(raw, null); return o && typeof o === 'object' ? new Map([['cfg', o]]) : new Map(); }
  const arr = jparse(raw, []);
  return new Map((Array.isArray(arr) ? arr : []).filter(x => x && x.id != null).map(x => [String(x.id), x]));
}
async function applyColl(def, ups, dels, lm) {
  if (def.store) {
    await finTx([def.store], t => {
      const os = t.objectStore(def.store);
      ups.forEach(r => os.put(r));
      dels.forEach(id => { const loc = lm.get(id); os.delete(loc ? loc.id : id); });
    });
    return;
  }
  await flushFrame(def.mod);
  if (def.prefix) {
    for (const [id, r] of ups) await KV.set(def.prefix + id, JSON.stringify(r));
    for (const id of dels) { const loc = lm.get(id); await KV.del(def.prefix + (loc ? loc.id : id)); }
    return;
  }
  if (def.single) { const r = ups.get('cfg'); if (r) await KV.set(def.key, JSON.stringify(r)); return; }
  const arr = jparse(await KV.get(def.key), []), cur = Array.isArray(arr) ? arr : [], out = [], seen = new Set();
  for (const x of cur) {
    const id = x && x.id != null ? String(x.id) : null;
    if (id && dels.has(id)) continue;
    if (id && ups.has(id)) { out.push(ups.get(id)); seen.add(id); } else out.push(x);
  }
  ups.forEach((r, id) => { if (!seen.has(id)) out.push(r); });
  await KV.set(def.key, JSON.stringify(out));
}

/* ---------- blob (foto/dokumen besar) ---------- */
async function fetchBlob(hash, n, cache) {
  if (cache.has(hash)) return cache.get(hash);
  const ids = Array.from({ length: n }, (_, i) => '"' + hash + ':' + i + '"').join(',');
  const res = await sbFetch('/rest/v1/jlp_docs?select=id,data&coll=eq.blob&id=in.(' + encodeURIComponent(ids) + ')');
  if (!res.ok) throw await sbErr(res);
  const rows = await res.json(), parts = new Array(n);
  rows.forEach(r => { const i = +String(r.id).split(':')[1]; if (r.data && typeof r.data.d === 'string') parts[i] = r.data.d; });
  if (parts.some(p => p == null)) throw new Error('Foto/dokumen belum lengkap di server; dicoba lagi pada sinkron berikutnya.');
  const d = parts.join(''); cache.set(hash, d); return d;
}
async function uploadBlobs(blobs) {
  const rows = [];
  blobs.forEach((d, h) => {
    if (sync.st.blobs[h]) return;
    for (let i = 0, n = Math.ceil(d.length / CHUNK); i < n; i++) rows.push({ user_id: sync.auth.uid, coll: 'blob', id: h + ':' + i, data: { d: d.slice(i * CHUNK, (i + 1) * CHUNK) }, deleted: false, device: deviceId() });
  });
  if (!rows.length) return;
  let i = 0;
  while (i < rows.length) {
    let j = i, size = 0;
    while (j < rows.length && (size < 300000 || j === i)) { size += rows[j].data.d.length; j++; }
    const res = await sbFetch('/rest/v1/jlp_docs?on_conflict=user_id,coll,id', { method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' }, body: JSON.stringify(rows.slice(i, j)) });
    if (!res.ok) throw await sbErr(res);
    i = j;
  }
  blobs.forEach((_, h) => { sync.st.blobs[h] = 1; });
}

/* ---------- gabung per bagian: butuh salinan versi terakhir yang sama-sama diketahui ---------- */
const SNAP = 'jlp:sync:snap:', snapKey = (c, id) => SNAP + c + ':' + id;
async function mergeRemote(def, r, L, B, bcache) {
  const snap = await kvJSON(snapKey(def.c, r.id), null);
  if (!snap || await sha256(stable(snap)) !== B.h) return null;   // salinan tidak cocok: pakai jalur konflik lama
  return SyncMerge.merge3(snap, await toCanon(L, bcache, 'diff'), r.data);
}

/* ---------- tarik (pull) ---------- */
async function pullRows() {
  const cur = sync.st.cursor;
  let last = cur ? new Date(Date.parse(cur) - 3000).toISOString() : null; const rows = [];
  for (;;) {
    const q = '/rest/v1/jlp_docs?select=coll,id,data,deleted,updated_at&coll=neq.blob&order=updated_at.asc&limit=200' + (last ? '&updated_at=gt.' + encodeURIComponent(last) : '');
    const res = await sbFetch(q); if (!res.ok) throw await sbErr(res);
    const page = await res.json(); rows.push(...page);
    if (page.length < 200) break; last = page[page.length - 1].updated_at;
  }
  return rows;
}
async function syncPull(opts) {
  const rows = await pullRows(), defs = Object.fromEntries(SYNC_COLLS.map(d => [d.c, d]));
  const metas = rows.filter(r => r.coll === 'meta' && r.id === 'gc' && r.data && r.data.epoch);
  if (metas.length) { const ep = String(metas[metas.length - 1].data.epoch); if (ep !== sync.st.gcEpoch) { sync.st.blobs = {}; sync.st.gcEpoch = ep; await saveSyncState(); } }
  const fresh = rows.filter(r => defs[r.coll]).filter(r => { const B = (sync.st.base[r.coll] || {})[r.id]; return !(B && B.v === r.updated_at); });
  if (!fresh.length) { if (rows.length) { sync.st.cursor = rows[rows.length - 1].updated_at; await saveSyncState(); } return { applied: 0 }; }
  const affected = new Set(fresh.map(r => defs[r.coll].mod));
  if (!opts.force && state.view && affected.has(state.view) && MODS[state.view] && MODS[state.view].frame) { sync.deferred = true; return { deferred: true, n: fresh.length }; }
  sync.deferred = false;
  const lms = {}, bcache = new Map(), plan = {};
  for (const r of fresh) {
    const def = defs[r.coll];
    const lm = lms[r.coll] || (lms[r.coll] = await localMap(def)), base = sync.st.base[r.coll] || (sync.st.base[r.coll] = {});
    const P = plan[r.coll] || (plan[r.coll] = { ups: new Map(), dels: new Set(), stamp: new Map(), remote: new Map(), merged: new Map() });
    const L = lm.get(r.id), B = base[r.id];
    const lh = L ? await recHash(L) : null;
    const localChanged = L ? (B ? lh !== B.h : true) : !!B;
    if (r.deleted) {
      if (L && localChanged) { if (B) B.v = r.updated_at; continue; }   // lokal berubah: pertahankan, akan didorong ulang
      if (L) P.dels.add(r.id);
      delete base[r.id]; continue;
    }
    // tanpa base, ada lokal: bandingkan; bila beda -> versi server menang, salinan lokal disimpan di Konflik
    if (L && !B) {
      if (def.blobKey) { base[r.id] = { h: lh, v: r.updated_at }; continue; }
      const rh = await sha256(stable(r.data));
      if (rh === lh) { base[r.id] = { h: lh, v: r.updated_at }; continue; }
      sync.conflicts.push({ k: Math.random().toString(36).slice(2), t: Date.now(), c: r.coll, rid: r.id, lbl: def.lbl(L), side: 'lokal', data: await toCanon(L, null, 'diff') });
    } else if (L && localChanged) {
      const m = def.merge ? await mergeRemote(def, r, L, B, bcache) : null;
      if (m) {
        let merged;
        try { merged = await expandCanon(m.value, (h, n) => fetchBlob(h, n, bcache)); }
        catch (e) { sync.lastWarn = e.message; continue; }
        m.conflicts.forEach(c => sync.conflicts.push({ k: Math.random().toString(36).slice(2), t: Date.now(), c: r.coll, rid: r.id, lbl: def.lbl(L) + ' · ' + c.label, side: 'server', path: c.path, other: c.other === undefined ? null : c.other, del: c.other === undefined }));
        // base = versi server, sehingga hasil gabungan terdeteksi berubah dan didorong ke perangkat lain
        P.ups.set(r.id, merged); P.stamp.set(r.id, r.updated_at); P.remote.set(r.id, r.data); P.merged.set(r.id, await sha256(stable(r.data)));
        continue;
      }
      sync.conflicts.push({ k: Math.random().toString(36).slice(2), t: Date.now(), c: r.coll, rid: r.id, lbl: def.lbl(L), side: 'server', data: r.data });
      if (B) B.v = r.updated_at; continue;   // lokal menang (akan didorong), versi server disimpan di Konflik
    }
    let rec;
    try { rec = await expandCanon(r.data, (h, n) => fetchBlob(h, n, bcache)); }
    catch (e) { sync.lastWarn = e.message; continue; }   // blob belum lengkap: coba lagi nanti (kursor tidak maju)
    if (def.blobKey && typeof rec[def.blobKey] === 'string' && rec[def.blobKey].indexOf('data:') === 0) rec[def.blobKey] = dataURLToBlob(rec[def.blobKey]);
    P.ups.set(r.id, rec); P.stamp.set(r.id, r.updated_at); P.remote.set(r.id, r.data);
  }
  let applied = 0;
  for (const def of SYNC_COLLS) {
    const P = plan[def.c]; if (!P || (!P.ups.size && !P.dels.size)) continue;
    await applyColl(def, P.ups, P.dels, lms[def.c]);
    const base = sync.st.base[def.c] || (sync.st.base[def.c] = {});
    for (const [id, rec] of P.ups) {
      base[id] = { h: P.merged.get(id) || await recHash(rec), v: P.stamp.get(id) }; applied++;
      if (def.merge) await KV.set(snapKey(def.c, id), JSON.stringify(P.remote.get(id)));
    }
    for (const id of P.dels) { delete base[id]; applied++; if (def.merge) await KV.del(snapKey(def.c, id)); }
  }
  const incomplete = !!sync.lastWarn; sync.lastWarn = '';
  if (!incomplete) sync.st.cursor = rows[rows.length - 1].updated_at;
  await saveSyncState(); await saveConflicts();
  if (applied) afterRemoteApplied(Object.keys(plan).filter(c => plan[c].ups.size || plan[c].dels.size).map(c => defs[c].mod));
  return { applied };
}
function afterRemoteApplied(mods) {
  const set = new Set(mods);
  ['proyek', 'tanaman', 'survei'].forEach(m => { if (set.has(m) && MODS[m].frame) unloadFrame(m); });
  if (set.has('proyek')) { state.sumTried = false; if (state.view === 'proyek') setView('proyek'); else loadFrame('proyek'); }
  if (set.has('tanaman') && state.view === 'tanaman') setView('tanaman');
  if (set.has('survei') && state.view === 'survei') setView('survei');
  if (state.view === 'home') renderHome();
}

/* ---------- dorong (push) ---------- */
async function syncPush() {
  const changed = [], dels = [];
  let totalBase = 0;
  for (const def of SYNC_COLLS) {
    const lm = await localMap(def), base = sync.st.base[def.c] || (sync.st.base[def.c] = {});
    totalBase += Object.keys(base).length;
    const haveSnap = def.merge ? new Set(KV.keys(SNAP + def.c + ':')) : null;
    for (const [id, rec] of lm) {
      const h = await recHash(rec), B = base[id];
      if (!B || B.h !== h) changed.push({ def, id, rec, h });
      else if (haveSnap && !haveSnap.has(snapKey(def.c, id))) await KV.set(snapKey(def.c, id), JSON.stringify(await toCanon(rec, null, 'diff')));   // data lama: buat salinan awal
    }
    for (const id of Object.keys(base)) if (!lm.has(id)) dels.push({ def, id });
  }
  if (!changed.length && !dels.length) return { pushed: 0 };
  if (dels.length >= 15 && dels.length >= totalBase * 0.4) {
    const ok = await confirmBox('Terdeteksi ' + dels.length + ' data terhapus di perangkat ini (dari ' + totalBase + '). Jika dilanjutkan, data itu juga akan terhapus di SEMUA perangkat.\n\nBila ini tidak disengaja (mis. habis reset atau pulihkan cadangan), pilih Batal. Sinkron akan dijeda.', { title: 'Hapus massal terdeteksi', ok: 'Hapus di semua perangkat', danger: true });
    if (!ok) { LS.set('jlp_sync_on', '0'); setSyncStatus('paused'); return { pushed: 0, paused: true }; }
  }
  const docRows = [], meta = [], guarded = [], allBlobs = new Map();
  const queue = (def, row, m) => {
    const B = (sync.st.base[def.c] || {})[row.id];
    if (def.merge && B && B.v) guarded.push({ row, m, v: B.v }); else { docRows.push(row); meta.push(m); }
  };
  for (const ch of changed) {
    const blobs = new Map(), data = await toCanon(ch.rec, blobs, 'push');
    blobs.forEach((d, h) => allBlobs.set(h, d));
    queue(ch.def, { user_id: sync.auth.uid, coll: ch.def.c, id: ch.id, data, deleted: false, device: deviceId() }, { c: ch.def.c, id: ch.id, h: ch.h, snap: ch.def.merge ? data : null });
  }
  dels.forEach(d => queue(d.def, { user_id: sync.auth.uid, coll: d.def.c, id: d.id, data: null, deleted: true, device: deviceId() }, { c: d.def.c, id: d.id, del: true, merge: d.def.merge }));
  await uploadBlobs(allBlobs);
  const settle = async (m, v) => {
    const base = sync.st.base[m.c] || (sync.st.base[m.c] = {});
    if (m.del) { delete base[m.id]; if (m.merge) await KV.del(snapKey(m.c, m.id)); }
    else { base[m.id] = { h: m.h, v: v || null }; if (m.snap) await KV.set(snapKey(m.c, m.id), JSON.stringify(m.snap)); }
  };
  // Tulis hanya bila server masih versi yang kita gabung; bila tidak, perangkat lain menulis lebih dulu dan kita gabung ulang.
  let stale = 0;
  for (const g of guarded) {
    const q = 'coll=eq.' + encodeURIComponent(g.row.coll) + '&id=eq.' + encodeURIComponent(g.row.id) + '&updated_at=eq.' + encodeURIComponent(g.v);
    const res = await sbFetch('/rest/v1/jlp_docs?' + q + '&select=coll,id,updated_at', { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ data: g.row.data, deleted: g.row.deleted, device: g.row.device }) });
    if (!res.ok) throw await sbErr(res);
    const out = await res.json();
    if (out.length) { await settle(g.m, out[0].updated_at); await saveSyncState(); } else stale++;
  }
  let i = 0;
  while (i < docRows.length) {
    let j = i, size = 0;
    while (j < docRows.length && j - i < 40 && (size < 800000 || j === i)) { size += JSON.stringify(docRows[j]).length; j++; }
    const res = await sbFetch('/rest/v1/jlp_docs?on_conflict=user_id,coll,id&select=coll,id,updated_at', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=representation' }, body: JSON.stringify(docRows.slice(i, j)) });
    if (!res.ok) throw await sbErr(res);
    const out = await res.json(), stamp = new Map(out.map(o => [o.coll + '|' + o.id, o.updated_at]));
    for (const m of meta.slice(i, j)) await settle(m, stamp.get(m.c + '|' + m.id));
    await saveSyncState();
    i = j;
  }
  return { pushed: docRows.length + guarded.length - stale, stale };
}

/* ---------- putaran sinkron ---------- */
async function syncRun(opts = {}) {
  if (!syncReady()) return;
  if (sync.running) { sync.again = true; return; }
  if (!navigator.onLine) { setSyncStatus('offline'); return; }
  sync.running = true; setSyncStatus('syncing');
  try {
    if (!sync.st) await loadSyncState();
    await ensureToken();
    await flushAll();
    const r = await syncPull(opts);
    if (r.deferred) { setSyncStatus('pending', r.n + ' pembaruan menunggu'); if (Date.now() - (sync.lastOffer || 0) > 300000) { sync.lastOffer = Date.now(); toast('Ada pembaruan dari perangkat lain', { action: 'Terapkan', ms: 12000, onAction: () => { const m = state.view; syncRun({ force: true }).then(() => { if (MODS[m] && MODS[m].frame) { unloadFrame(m); setView(m); } }); } }); } }
    else { const p = await syncPush(); if (p.stale) { sync.staleN = (sync.staleN || 0) + 1; if (sync.staleN <= 3) sync.again = true; else { sync.staleN = 0; setSyncStatus('err', 'Perubahan tertahan, dicoba lagi pada sinkron berikutnya'); } } else if (!p.paused) { sync.staleN = 0; sync.lastOk = Date.now(); LS.set('jlp_sync_last', String(sync.lastOk)); space.full = false; setSyncStatus('ok'); if (typeof spaceAfterSync === 'function') spaceAfterSync(); } }
  } catch (e) { console.error('sync', e); if (e && e.full) { space.full = true; if (state.view === 'home') renderHome(); } setSyncStatus('err', e && e.message ? e.message : 'Gagal'); }
  finally { sync.running = false; if (sync.again) { sync.again = false; setTimeout(() => syncRun(), 400); } }
}
function syncKick(ms) { if (!syncReady()) return; clearTimeout(sync.dt); sync.dt = setTimeout(() => syncRun(), ms == null ? 3500 : ms); }
function syncOnViewChange() { if (sync.deferred) setTimeout(() => syncRun(), 250); }
function syncStart() {
  syncLoadCfg(); clearInterval(sync.timer);
  if (!syncReady()) { setSyncStatus(syncConfigured() && syncLoggedIn() && !syncOn() ? 'paused' : 'off'); return; }
  loadSyncState().then(() => syncRun());
  sync.timer = setInterval(() => { if (!document.hidden) syncRun(); }, 45000);
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) syncKick(300); });
addEventListener('online', () => syncKick(500));

/* ---------- status ---------- */
function setSyncStatus(s, msg) {
  sync.status = s; sync.msg = msg || '';
  $$('.syncpill').forEach(el => { el.outerHTML = syncPillHTML(); });
  const line = $('#syncLine'); if (line) line.innerHTML = syncLineHTML();
  const rb = $('#railSync'); if (rb) { rb.hidden = !syncConfigured() || !syncLoggedIn(); rb.dataset.s = s; }
}
function ago(ts) { if (!ts) return 'belum pernah'; const s = Math.floor((Date.now() - ts) / 1000); return s < 60 ? 'baru saja' : s < 3600 ? Math.floor(s / 60) + ' mnt lalu' : s < 86400 ? Math.floor(s / 3600) + ' jam lalu' : Math.floor(s / 86400) + ' hari lalu'; }
function syncPillHTML() {
  if (!syncConfigured() || !syncLoggedIn()) return '<span class="syncpill" hidden></span>';
  const last = num(LS.get('jlp_sync_last'));
  const m = { syncing: ['', '☁ Menyinkronkan…'], ok: ['', '☁ Tersinkron ' + ago(last || sync.lastOk)], err: ['off', '☁ Sinkron gagal'], offline: ['off', '☁ Offline'], pending: ['off', '☁ Ada pembaruan'], paused: ['off', '☁ Sinkron dijeda'], off: ['off', '☁ Sinkron mati'] }[sync.status] || ['', '☁ Sinkron'];
  return '<a class="syncpill pill ' + m[0] + '" href="#/setelan" title="' + esc(sync.msg) + '">' + m[1] + '</a>';
}
function syncLineHTML() {
  const last = num(LS.get('jlp_sync_last'));
  const st = { syncing: 'Sedang menyinkronkan…', ok: 'Tersinkron ' + ago(last || sync.lastOk), err: 'Gagal: ' + esc(sync.msg), offline: 'Offline. Akan lanjut saat online.', pending: esc(sync.msg) + '. Keluar dari modul yang sedang dibuka atau tekan Terapkan.', paused: 'Dijeda.', off: 'Belum aktif.' }[sync.status] || '';
  return st;
}

/* ---------- konflik ---------- */
async function useConflict(k) {
  const c = sync.conflicts.find(x => x.k === k); if (!c) return;
  const def = SYNC_COLLS.find(d => d.c === c.c); if (!def) return;
  toast('Menerapkan versi terpilih…');
  try {
    const bc = new Map();
    await flushFrame(def.mod);
    const lm = await localMap(def);
    let rec;
    if (c.path) {   // konflik per bagian: ganti bagian itu saja, perubahan lain tetap
      const cur = lm.get(c.rid); if (!cur) { toast('Data ini sudah tidak ada'); return; }
      rec = await expandCanon(SyncMerge.applyPatch(await toCanon(cur, bc, 'diff'), c.path, c.del ? undefined : c.other), (h, n) => fetchBlob(h, n, bc));
    } else {
      rec = await expandCanon(c.data, (h, n) => fetchBlob(h, n, bc));
      if (def.blobKey && typeof rec[def.blobKey] === 'string' && rec[def.blobKey].indexOf('data:') === 0) rec[def.blobKey] = dataURLToBlob(rec[def.blobKey]);
    }
    await applyColl(def, new Map([[c.rid, rec]]), new Set(), lm);
    if (MODS[def.mod] && MODS[def.mod].frame) { unloadFrame(def.mod); if (state.view === def.mod) setView(def.mod); }
    sync.conflicts = sync.conflicts.filter(x => x.k !== k); await saveConflicts();
    toast('Versi diterapkan. Akan disinkronkan ke perangkat lain.'); syncKick(500); renderSettings();
  } catch (e) { toast('Gagal menerapkan: ' + e.message); }
}
async function dropConflict(k) { sync.conflicts = sync.conflicts.filter(x => x.k !== k); await saveConflicts(); renderSettings(); }

/* ---------- kartu pengaturan ---------- */
function syncCardHTML() {
  let h = '<div class="card" style="grid-column:1/-1"><h3>☁ Sinkron antar perangkat</h3>';
  if (!window.crypto || !crypto.subtle) return h + '<p class="small">Sinkron memerlukan koneksi aman (https). Buka aplikasi dari alamat https.</p></div>';
  if (!syncConfigured()) {
    h += '<p class="small">Hubungkan Mac, Android, dan iPhone agar datanya sama. Perlu akun <b>Supabase</b> gratis (panduan: <b>SINKRON.md</b>). Data tetap tersimpan lokal; cloud dipakai sebagai penghubung.</p>' +
      '<div class="split"><div><label class="f"><span>Project URL</span><input type="text" id="sbUrl" placeholder="https://xxxx.supabase.co" autocapitalize="off" autocomplete="off"></label><label class="f"><span>Kunci anon / publishable</span><input type="text" id="sbKey" placeholder="eyJ… atau sb_publishable_…" autocapitalize="off" autocomplete="off"></label><button type="button" class="btn" id="sbSave">Simpan koneksi</button></div>' +
      '<div><label class="f"><span>Atau tempel “Kode koneksi” dari perangkat lain</span><input type="text" id="sbCode" placeholder="Kode dari perangkat pertama" autocapitalize="off" autocomplete="off"></label><button type="button" class="btn ghost" id="sbApplyCode">Terapkan kode</button></div></div>';
  } else if (!syncLoggedIn()) {
    h += '<p class="small">Proyek: <b>' + esc(sync.cfg.url.replace(/^https?:\/\//, '')) + '</b>. Masuk dengan akun yang sama di semua perangkat.</p>' +
      '<div class="split"><div><label class="f"><span>Email</span><input type="text" id="sbEmail" inputmode="email" autocapitalize="off" autocomplete="username" value="' + esc(LS.get('jlp_sync_email') || '') + '"></label><label class="f"><span>Kata sandi (min. 6 karakter)</span><input type="password" id="sbPass" autocomplete="current-password"></label>' +
      '<div class="row"><button type="button" class="btn" id="sbIn">Masuk</button><button type="button" class="btn ghost" id="sbUp">Daftar akun baru</button></div><div class="small" id="sbMsg" style="margin-top:8px"></div></div>' +
      '<div class="small">Daftar sekali di perangkat pertama, lalu <b>Masuk</b> di perangkat lain dengan email &amp; sandi yang sama. <br><br><button type="button" class="btn ghost sm" id="sbChange">Ubah koneksi</button></div></div>';
  } else {
    h += '<p class="small">Masuk sebagai <b>' + esc(sync.auth.email || '') + '</b> · <span id="syncLine">' + syncLineHTML() + '</span></p>' +
      '<label class="small" style="display:flex;gap:8px;align-items:center;margin-bottom:10px"><input type="checkbox" id="sbAuto" ' + (syncOn() ? 'checked' : '') + ' style="width:auto;min-height:auto"> Sinkron otomatis (saat data berubah, saat dibuka, dan tiap 45 detik)</label>' +
      '<div class="row"><button type="button" class="btn" id="sbNow">⇄ Sinkronkan sekarang</button><button type="button" class="btn ghost" id="sbCopy">Salin kode koneksi</button><button type="button" class="btn ghost" id="sbLink">Salin tautan penyiapan</button><button type="button" class="btn ghost" id="sbOut">Keluar</button></div>' +
      '<p class="small" style="margin:10px 0 0">Perangkat baru: pasang aplikasi, buka Pengaturan › tempel kode koneksi, lalu Masuk. Data akan turun otomatis. Di iPhone/iPad, aplikasi di layar utama punya penyimpanan terpisah dari Safari: lakukan penyiapan di aplikasi layar utama.</p>' +
      '<details class="dd"><summary>Lanjutan</summary><div class="row" style="margin-top:8px"><button type="button" class="btn ghost sm" id="sbReset">Reset status sinkron perangkat ini</button></div><p class="small" style="margin-bottom:0">Reset hanya mengosongkan catatan “sudah sinkron sampai mana”; data tidak dihapus. Dipakai jika sinkron terasa tidak konsisten.</p></details>';
    h += '<div id="spaceBox">' + spaceBlockHTML() + '</div>';
    if (sync.conflicts.length) h += '<div class="sec">Konflik (' + sync.conflicts.length + ')</div><p class="small">Dua perangkat mengubah data yang sama. Satu versi dipakai, versi lainnya disimpan di sini.</p><div class="list">' + sync.conflicts.slice().reverse().map(c => '<div class="item"><div style="flex:1;min-width:0"><b>' + esc(c.lbl) + '</b><small>Versi ' + esc(c.side) + ' yang tidak dipakai · ' + new Date(c.t).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) + '</small></div><button type="button" class="btn ghost sm" data-cu="' + c.k + '">Pakai versi ini</button><button type="button" class="btn ghost sm" data-cd="' + c.k + '">Buang</button></div>').join('') + '</div>';
  }
  return h + '</div>';
}
function bindSyncCard() {
  const on = (id, fn) => { const el = $('#' + id); if (el) el.onclick = fn; };
  const msg = t => { const m = $('#sbMsg'); if (m) m.textContent = t; };
  on('sbSave', () => {
    const url = normUrl($('#sbUrl').value), key = $('#sbKey').value.trim();
    if (!url || !key) { toast('Isi Project URL (https://xxxx.supabase.co) dan kunci'); return; }
    LS.set('jlp_sync_cfg', JSON.stringify({ url, anon: key })); syncLoadCfg(); renderSettings();
  });
  on('sbApplyCode', () => {
    const c = parseConnCode($('#sbCode').value); if (!c) { toast('Kode koneksi tidak valid'); return; }
    LS.set('jlp_sync_cfg', JSON.stringify(c)); syncLoadCfg(); renderSettings();
  });
  on('sbChange', () => { LS.del('jlp_sync_cfg'); LS.del('jlp_sync_auth'); syncLoadCfg(); setSyncStatus('off'); renderSettings(); });
  const doAuth = async up => {
    const e = $('#sbEmail').value.trim(), p = $('#sbPass').value;
    if (!e || p.length < 6) { msg('Isi email dan kata sandi (min. 6 karakter).'); return; }
    msg('Memproses…');
    LS.set('jlp_sync_email', e);   // hanya email (bukan kata sandi) agar tidak mengetik ulang di perangkat ini
    try {
      if (up) { const ok = await syncSignUp(e, p); if (!ok) { msg('Akun dibuat. Cek email untuk konfirmasi, lalu tekan Masuk.'); return; } }
      else await syncSignIn(e, p);
      LS.set('jlp_sync_on', '1'); sync.st = null; syncStart(); renderSettings(); toast('Berhasil masuk. Menyinkronkan…');
    } catch (er) { msg(er.message); }
  };
  on('sbIn', () => doAuth(false)); on('sbUp', () => doAuth(true));
  on('sbNow', () => { LS.set('jlp_sync_on', '1'); syncStart(); });
  on('sbCopy', async () => { try { await navigator.clipboard.writeText(connCode()); toast('Kode koneksi disalin'); } catch (_) { prompt('Salin kode koneksi:', connCode()); } });
  on('sbLink', async () => { const u = location.origin + location.pathname + '#/setelan?cfg=' + encodeURIComponent(connCode()); try { await navigator.clipboard.writeText(u); toast('Tautan penyiapan disalin'); } catch (_) { prompt('Salin tautan:', u); } });
  on('sbOut', async () => { if (!await confirmBox('Keluar dari akun sinkron di perangkat ini? Data lokal tetap ada.', { title: 'Keluar' })) return; LS.del('jlp_sync_auth'); syncLoadCfg(); clearInterval(sync.timer); setSyncStatus('off'); renderSettings(); });
  on('sbReset', async () => { if (!await confirmBox('Reset catatan sinkron di perangkat ini? Sinkron berikutnya akan mencocokkan ulang semua data (versi server diutamakan bila berbeda; salinan lokal masuk Konflik).', { title: 'Reset status sinkron', ok: 'Reset' })) return; sync.st = { cursor: null, base: {}, blobs: {} }; await saveSyncState(); toast('Status direset'); syncRun(); });
  const au = $('#sbAuto'); if (au) au.onchange = () => { LS.set('jlp_sync_on', au.checked ? '1' : '0'); if (au.checked) syncStart(); else { clearInterval(sync.timer); setSyncStatus('paused'); } };
  $$('[data-cu]').forEach(b => b.onclick = () => useConflict(b.dataset.cu));
  $$('[data-cd]').forEach(b => b.onclick = () => dropConflict(b.dataset.cd));
}
// tautan penyiapan: #/setelan?cfg=...
function syncCheckSetupLink() {
  const m = /[?&]cfg=([^&]+)/.exec(location.hash); if (!m) return;
  const c = parseConnCode(decodeURIComponent(m[1]));
  history.replaceState(null, '', location.pathname + '#/setelan');
  if (c && !syncConfigured()) { LS.set('jlp_sync_cfg', JSON.stringify(c)); syncLoadCfg(); toast('Koneksi sinkron diterapkan. Silakan Masuk.'); }
}
