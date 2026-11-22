/* Juned Landscape Project - ruang cloud: meter, kecilkan foto yang sudah dicadangkan, bersihkan foto lama di cloud. */
'use strict';
const space = { usage: null, at: 0, err: '', busy: false, full: false };
const spaceLimitMB = () => num(LS.get('jlp_cloud_limit_mb')) || 500;
const spaceThreshold = () => num(LS.get('jlp_reduce_pct')) || 85;
const spacePct = () => space.usage ? space.usage.db / (spaceLimitMB() * 1048576) * 100 : 0;

async function spaceFetchUsage(force) {
  if (!syncReady()) return null;
  if (!force && space.usage && Date.now() - space.at < 15 * 60 * 1000) return space.usage;
  try {
    const res = await sbFetch('/rest/v1/rpc/jlp_usage', { method: 'POST', body: '{}' });
    if (res.status === 404) { space.err = 'rpc'; return null; }
    if (!res.ok) throw await sbErr(res);
    const j = await res.json();
    space.usage = { db: num(j.db_bytes), mine: num(j.mine_bytes), rows: num(j.rows) }; space.at = Date.now(); space.err = '';
    return space.usage;
  } catch (e) { space.err = e.message; return null; }
}

/* ---------- kecilkan gambar ---------- */
const SHRINK = { maxDim: 1000, q: 0.55, minLen: 90000, minBlob: 70000 };
const loadImg = src => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('gambar')); i.src = src; });
async function shrinkImageBlob(blob) {
  const url = URL.createObjectURL(blob);
  try {
    const img = await loadImg(url);
    const sc = Math.min(1, SHRINK.maxDim / Math.max(img.naturalWidth, img.naturalHeight)), w = Math.max(1, Math.round(img.naturalWidth * sc)), h = Math.max(1, Math.round(img.naturalHeight * sc));
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, w, h); x.drawImage(img, 0, 0, w, h);
    return await new Promise(r => c.toBlob(r, 'image/jpeg', SHRINK.q));
  } catch (_) { return null; } finally { URL.revokeObjectURL(url); }
}
async function shrinkValue(v, st) {
  if (typeof v === 'string') {
    if (v.length > SHRINK.minLen && /^data:image\/(jpeg|png|webp);/.test(v)) {
      const old = dataURLToBlob(v), nb = await shrinkImageBlob(old);
      if (nb && nb.size < old.size * 0.85) { const d = await blobToDataURL(nb); if (d.length < v.length) { st.saved += v.length - d.length; st.n++; return d; } }
    }
    return v;
  }
  if (v instanceof Blob) {
    if (/^image\/(jpeg|png|webp)$/.test(v.type) && v.size > SHRINK.minBlob) { const nb = await shrinkImageBlob(v); if (nb && nb.size < v.size * 0.85) { st.saved += v.size - nb.size; st.n++; return nb; } }
    return v;
  }
  if (Array.isArray(v)) { const o = []; for (const x of v) o.push(await shrinkValue(x, st)); return o; }
  if (v && typeof v === 'object') { const o = {}; for (const k of Object.keys(v)) o[k] = await shrinkValue(v[k], st); return o; }
  return v;
}
async function reduceImages(onStep) {
  await flushAll();
  ['proyek', 'tanaman'].forEach(unloadFrame);   // hindari modul menimpa dengan data lama
  const st = { saved: 0, n: 0, recs: 0 };
  for (const def of SYNC_COLLS) {
    const lm = await localMap(def), ups = new Map();
    for (const [id, rec] of lm) { const before = st.n; const nr = await shrinkValue(rec, st); if (st.n > before) ups.set(id, nr); }
    if (ups.size) { onStep && onStep('Mengecilkan foto: ' + def.c + ' (' + ups.size + ')…'); await applyColl(def, ups, new Set(), lm); st.recs += ups.size; }
  }
  const w = frameWin('keuangan'); if (w && w.render && (!state.pinSet || state.finUnlocked)) { try { w.render(); } catch (_) {} }
  state.sumTried = false;
  return st;
}

/* ---------- bersihkan foto lama di cloud ---------- */
async function gcBlobs(onStep) {
  const refd = new Set(); let last = null;
  onStep && onStep('Memeriksa foto yang masih dipakai…');
  for (;;) {
    const res = await sbFetch('/rest/v1/jlp_docs?select=coll,id,data,updated_at&coll=neq.blob&coll=neq.meta&order=updated_at.asc&limit=200' + (last ? '&updated_at=gt.' + encodeURIComponent(last) : ''));
    if (!res.ok) throw await sbErr(res);
    const page = await res.json();
    for (const r of page) { if (r.data) for (const m of JSON.stringify(r.data).matchAll(/@@blob:([0-9a-f]{64}):\d+/g)) refd.add(m[1]); }
    if (page.length < 200) break; last = page[page.length - 1].updated_at;
  }
  const dead = []; last = null;
  for (;;) {
    const res = await sbFetch('/rest/v1/jlp_docs?select=id,updated_at&coll=eq.blob&order=updated_at.asc&limit=1000' + (last ? '&updated_at=gt.' + encodeURIComponent(last) : ''));
    if (!res.ok) throw await sbErr(res);
    const page = await res.json();
    for (const r of page) { if (!refd.has(String(r.id).split(':')[0]) && Date.now() - Date.parse(r.updated_at) > 3600000) dead.push(r.id); }
    if (page.length < 1000) break; last = page[page.length - 1].updated_at;
  }
  for (let i = 0; i < dead.length; i += 40) {
    onStep && onStep('Menghapus foto lama di cloud (' + Math.min(i + 40, dead.length) + '/' + dead.length + ')…');
    const ids = dead.slice(i, i + 40).map(x => '"' + x + '"').join(',');
    const res = await sbFetch('/rest/v1/jlp_docs?coll=eq.blob&id=in.(' + encodeURIComponent(ids) + ')', { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
    if (!res.ok) throw await sbErr(res);
  }
  if (dead.length) {
    const epoch = String(Date.now());
    const res = await sbFetch('/rest/v1/jlp_docs?on_conflict=user_id,coll,id', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify([{ user_id: sync.auth.uid, coll: 'meta', id: 'gc', data: { epoch }, deleted: false, device: deviceId() }]) });
    if (!res.ok) throw await sbErr(res);
    sync.st.blobs = {}; sync.st.gcEpoch = epoch; await saveSyncState();
  }
  return { deleted: dead.length };
}

/* ---------- alur "hemat ruang" ---------- */
async function waitSyncIdle(ms = 120000) { const t0 = Date.now(); while (sync.running && Date.now() - t0 < ms) await sleep(150); }
async function saveSpaceFlow({ auto = false } = {}) {
  if (space.busy) return null;
  space.busy = true;
  let modal = null, line = null;
  const step = s => { if (line) line.textContent = s; };
  if (!auto) modal = openModal({ title: 'Hemat ruang cloud', body: '<p class="small" style="margin-top:0">Jangan tutup aplikasi sampai selesai.</p><p id="spStep" style="margin:0">Memulai…</p>', foot: [] });
  line = modal ? $('#spStep', modal.el) : null;
  const out = { backup: null, saved: 0, n: 0, deleted: 0 };
  try {
    if (odReady() && !odState.needLogin) { step('Mencadangkan foto asli ke OneDrive…'); out.backup = await odBackupNow({ onStep: step }); }
    else if (auto) throw new Error('OneDrive belum terhubung atau perlu masuk ulang');
    else {
      if (modal) modal.close();
      if (!await confirmBox('OneDrive belum terhubung. Aplikasi akan mengunduh file cadangan lengkap (foto asli) ke perangkat ini sebagai pengaman, lalu mengecilkan foto.\n\nSimpan file cadangannya sebelum melanjutkan. Lanjutkan?', { title: 'Cadangan dulu', ok: 'Unduh & lanjutkan' })) return null;
      modal = openModal({ title: 'Hemat ruang cloud', body: '<p id="spStep" style="margin:0">Menyiapkan cadangan…</p>', foot: [] }); line = $('#spStep', modal.el);
      await makeBackupDownload(); await sleep(800);
    }
    step('Mengecilkan foto…');
    const st = await reduceImages(step); out.saved = st.saved; out.n = st.n;
    if (syncReady()) {
      if (st.n) { step('Mengirim foto kecil ke cloud…'); await syncRun({ force: true }); await waitSyncIdle(); }
      const g = await gcBlobs(step); out.deleted = g.deleted;
      await spaceFetchUsage(true);
    }
    LS.set('jlp_reduce_last', String(Date.now()));
    const msg = st.n ? 'Hemat ± ' + fmtSize(st.saved) + ' dari ' + st.n + ' foto' + (out.deleted ? '; ' + out.deleted + ' bagian foto lama dihapus dari cloud' : '') + '.' : 'Tidak ada foto yang perlu dikecilkan.';
    toast(msg, { ms: 6000 });
    return out;
  } catch (e) {
    console.error('hemat ruang', e); toast('Hemat ruang gagal: ' + e.message, { ms: 7000 }); return null;
  } finally {
    space.busy = false; if (modal) modal.close();
    if (['home', 'setelan', 'terpadu'].includes(state.view)) setView(state.view); else setView(state.view);
  }
}
async function spaceAfterSync() {
  if (space.busy || !syncReady()) return;
  const u = await spaceFetchUsage(); if (!u) return;
  if (state.view === 'home') renderHome();
  if (spacePct() < spaceThreshold()) return;
  if (LS.get('jlp_reduce_auto') === '0' || !odReady() || odState.needLogin) return;
  if (!['home', 'terpadu', 'setelan'].includes(state.view)) return;   // jangan ganggu saat sedang di dalam modul
  if (Date.now() - num(LS.get('jlp_reduce_last')) < 6 * 3600000) return;
  LS.set('jlp_reduce_last', String(Date.now()));
  toast('Ruang cloud hampir penuh. Menghemat ruang otomatis…', { ms: 4000 });
  await saveSpaceFlow({ auto: true });
}

/* ---------- tampilan ---------- */
function cloudBannerHTML() {
  let h = '';
  if (space.full || (space.usage && spacePct() >= spaceThreshold())) {
    const p = space.full ? 100 : Math.round(spacePct());
    h += '<div class="banner"><div class="sp"><b>' + (space.full ? 'Ruang cloud penuh' : 'Ruang cloud ' + p + '% terpakai') + '</b><div class="small">' + (space.full ? 'Penyimpanan cloud menolak data baru. Data di perangkat ini aman.' : 'Cadangan foto asli ke OneDrive lalu kecilkan foto agar muat lebih lama.') + '</div></div><button type="button" class="btn sm" id="spBannerBtn">Hemat ruang</button></div>';
  }
  if (odCfg() && odCfg().clientId && odAuth() && odState.needLogin) h += '<div class="banner info"><div class="sp"><b>OneDrive perlu masuk ulang</b><div class="small">Sesi Microsoft berlaku 24 jam. Masuk sekali untuk melanjutkan cadangan otomatis.</div></div><button type="button" class="btn sm" id="odBannerBtn">Masuk OneDrive</button></div>';
  return h;
}
function bindBanners() { const a = $('#spBannerBtn'); if (a) a.onclick = () => saveSpaceFlow({}); const b = $('#odBannerBtn'); if (b) b.onclick = () => odLogin(); }

function spaceBlockHTML() {
  if (space.err === 'rpc') return '<div class="sec">Ruang cloud</div><p class="small">Meter belum aktif. Jalankan ulang <b>sync-setup.sql</b> terbaru di Supabase (menambah fungsi <code>jlp_usage</code>).</p>';
  const u = space.usage, lim = spaceLimitMB();
  const p = u ? Math.min(100, u.db / (lim * 1048576) * 100) : 0, cls = p >= spaceThreshold() ? 'bad' : p >= 70 ? 'warn' : '';
  return '<div class="sec">Ruang cloud</div>' +
    (u ? '<div class="bar" style="height:10px"><i style="width:' + p.toFixed(1) + '%;' + (cls === 'bad' ? 'background:var(--red)' : cls === 'warn' ? 'background:var(--gold)' : '') + '"></i></div><p class="small" style="margin:6px 0 10px">Database Supabase: <b>' + fmtSize(u.db) + '</b> dari ' + (lim >= 1024 ? (lim / 1024) + ' GB' : lim + ' MB') + ' (' + p.toFixed(0) + '%) · data Anda: ' + fmtSize(u.mine) + ' (' + u.rows + ' item)</p>' : '<p class="small">' + (space.err ? 'Gagal mengukur: ' + esc(space.err) : 'Mengukur…') + '</p>') +
    '<div class="row" style="margin-bottom:8px"><label class="small">Paket: <select id="spLimit" style="width:auto;min-height:36px;padding:4px 8px"><option value="500" ' + (lim === 500 ? 'selected' : '') + '>Gratis (500 MB)</option><option value="8192" ' + (lim === 8192 ? 'selected' : '') + '>Pro (8 GB)</option></select></label><button type="button" class="btn ghost sm" id="spNow">Hemat ruang sekarang</button></div>' +
    '<label class="small" style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><input type="checkbox" id="spAuto" ' + (LS.get('jlp_reduce_auto') !== '0' ? 'checked' : '') + ' style="width:auto;min-height:auto"> Hemat ruang otomatis saat terpakai ≥ <input type="number" id="spPct" min="50" max="98" value="' + spaceThreshold() + '" style="width:70px;min-height:32px;padding:3px 8px">% (butuh OneDrive terhubung)</label>' +
    '<p class="small" style="margin:8px 0 0">Cara kerja: foto asli dicadangkan ke OneDrive dulu, lalu foto di aplikasi dikecilkan (maks. 1000 px) dan salinan lama di cloud dihapus. Angka di dashboard Supabase bisa tidak langsung turun; ruang yang kosong dipakai ulang untuk data baru.</p>';
}
function bindSpaceBlock() {
  const lim = $('#spLimit'); if (lim) lim.onchange = () => { LS.set('jlp_cloud_limit_mb', lim.value); refreshSpaceBox(); };
  const au = $('#spAuto'); if (au) au.onchange = () => LS.set('jlp_reduce_auto', au.checked ? '1' : '0');
  const pc = $('#spPct'); if (pc) pc.onchange = () => LS.set('jlp_reduce_pct', String(Math.min(98, Math.max(50, num(pc.value) || 85))));
  const nw = $('#spNow'); if (nw) nw.onclick = () => saveSpaceFlow({});
}
function refreshSpaceBox() { const b = $('#spaceBox'); if (b) { b.innerHTML = spaceBlockHTML(); bindSpaceBlock(); } }
async function loadSpaceBox() { if (!$('#spaceBox')) return; await spaceFetchUsage(true); refreshSpaceBox(); }
