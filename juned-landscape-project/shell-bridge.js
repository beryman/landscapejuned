/* Juned Landscape Project - jembatan antar modul, cadangan gabungan, API shell, boot */
'use strict';
const round2 = n => Math.round(n * 100) / 100;

/* ========================== KATALOG -> RAB ========================== */
function startCatalogToRab(pid) {
  return pickCatalog({ projectSelect: true, projectId: pid }).then(r => {
    if (!r || !r.items.length) return;
    return go('proyek', w => {
      const ok = w.JLP.addRabItems(r.projectId, r.items);
      if (ok) { w.JLP.openProject(r.projectId, 'rab'); toast(r.items.length + ' item ditambahkan ke RAB'); } else toast('Proyek tujuan tidak ditemukan');
    });
  });
}

async function pickCatalog(opts = {}) {
  const [pb, tk] = await Promise.all([readPB(), opts.projectSelect ? readTK() : Promise.resolve(null)]);
  return new Promise(resolve => {
    let tab = 'plants', q = '', rabSel = '', withMarkup = true, done = false;
    const qty = new Map();
    const fin = v => { if (!done) { done = true; resolve(v); } };
    const body = document.createElement('div');
    const projects = tk ? tk.projects : [];
    const m = openModal({ title: 'Tambah dari katalog' + (opts.projectName ? ' · ' + opts.projectName : ''), body, wide: true, onClose: () => fin(null) });

    const rabDirect = r => r.items.reduce((a, i) => a + num(i.qty) * (1 + num(i.waste) / 100) * num(i.price) + num(i.qty) * num(i.labor), 0);
    const matItem = (name, spec, unit, qn, price, waste, labor) => {
      const o = { n: name + (spec ? ' (' + spec + ')' : ''), k: 'Material', q: round2(qn), u: unit || 'unit', h: Math.round(num(price) * (1 + num(waste) / 100)) };
      if (num(labor) > 0) o.tw = num(labor); return o;
    };
    function collect() {
      const items = [];
      pb.plants.forEach(p => { const n = num(qty.get('p:' + p.id)); if (n > 0) items.push({ n: p.local || p.name, k: 'Tanaman', q: round2(n), u: p.unit || 'unit', h: num(p.price) }); });
      pb.materials.forEach(x => { const n = num(qty.get('m:' + x.id)); if (n > 0) items.push(matItem(x.name, x.spec, x.unit, n, x.price, x.waste, x.labor)); });
      const r = pb.rabs.find(z => String(z.id) === String(rabSel));
      if (r) {
        r.items.forEach(i => { if (num(i.qty) > 0) items.push(matItem(i.name || i.description, i.spec, i.unit, i.qty, i.price, i.waste, i.labor)); });
        const mk = Math.max(0, num(r.markup));
        if (withMarkup && mk > 0) items.push({ n: 'Markup ' + mk + '% (dari RAB katalog ' + (r.name || '') + ')', k: 'Lainnya', q: 1, u: 'ls', h: Math.round(rabDirect(r) * mk / 100) });
      }
      return items;
    }
    function foot() {
      const n = collect().length;
      m.setFoot([{ label: 'Batal', cls: 'ghost' }, { spacer: true, html: '<span class="small">' + n + ' item dipilih</span>' },
        { label: 'Tambahkan' + (n ? ' (' + n + ')' : ''), onClick: () => {
          const items = collect(); if (!items.length) { toast('Pilih minimal satu item (isi jumlah)'); return false; }
          let pid = opts.projectId;
          if (opts.projectSelect) { pid = $('#pcProj', body) && $('#pcProj', body).value; if (!pid) { toast('Pilih proyek tujuan'); return false; } }
          fin({ projectId: pid, items });
        } }]);
    }
    function list() {
      const t = q.trim().toLowerCase(), box = $('#pcList', body);
      let rows = '', total = 0, shown = 0;
      if (tab === 'plants') {
        const arr = pb.plants.filter(p => !t || ((p.local || p.name || '') + ' ' + (p.scientific || '') + ' ' + (p.category || '')).toLowerCase().includes(t));
        total = arr.length;
        rows = arr.slice(0, 80).map(p => { shown++; const v = qty.get('p:' + p.id); return '<div class="prow ' + (num(v) > 0 ? 'sel' : '') + '"><div><b>' + esc(p.local || p.name) + '</b><small>' + esc([p.scientific, p.category].filter(Boolean).join(' · ')) + ' · ' + rp(p.price) + '/' + esc(p.unit || 'unit') + ' · stok ' + num(p.stock) + '</small></div><input type="number" inputmode="decimal" min="0" step="any" placeholder="Jml" data-k="p:' + esc(p.id) + '" value="' + (v || '') + '" aria-label="Jumlah ' + esc(p.local || p.name) + '"></div>'; }).join('');
      } else if (tab === 'mats') {
        const arr = pb.materials.filter(x => !t || (x.name + ' ' + (x.category || '') + ' ' + (x.spec || '')).toLowerCase().includes(t));
        total = arr.length;
        rows = arr.slice(0, 80).map(x => { shown++; const v = qty.get('m:' + x.id); return '<div class="prow ' + (num(v) > 0 ? 'sel' : '') + '"><div><b>' + esc(x.name) + '</b><small>' + esc(x.category || '') + ' · ' + rp(x.price) + '/' + esc(x.unit || 'unit') + (num(x.waste) ? ' · waste ' + num(x.waste) + '%' : '') + (num(x.labor) ? ' · upah ' + rp(x.labor) : '') + '</small></div><input type="number" inputmode="decimal" min="0" step="any" placeholder="Jml" data-k="m:' + esc(x.id) + '" value="' + (v || '') + '" aria-label="Jumlah ' + esc(x.name) + '"></div>'; }).join('');
      } else {
        const arr = pb.rabs.filter(r => !t || String(r.name || '').toLowerCase().includes(t));
        total = arr.length;
        rows = '<label class="prow"><input type="radio" name="rabsel" value="" ' + (!rabSel ? 'checked' : '') + ' style="width:auto;min-height:auto"><div><b>Tidak impor RAB</b></div></label>' +
          arr.map(r => { shown++; return '<label class="prow ' + (String(r.id) === String(rabSel) ? 'sel' : '') + '"><input type="radio" name="rabsel" value="' + esc(r.id) + '" ' + (String(r.id) === String(rabSel) ? 'checked' : '') + ' style="width:auto;min-height:auto"><div><b>' + esc(r.name || 'RAB') + '</b><small>' + r.items.length + ' item · total ' + rp(rabDirect(r) * (1 + Math.max(0, num(r.markup)) / 100)) + (num(r.markup) > 0 ? ' · markup ' + num(r.markup) + '%' : '') + '</small></div></label>'; }).join('') +
          (pb.rabs.some(r => num(r.markup) > 0) ? '<label class="small" style="display:flex;gap:8px;align-items:center;padding:10px 2px"><input type="checkbox" id="pcMk" ' + (withMarkup ? 'checked' : '') + ' style="width:auto;min-height:auto"> Sertakan markup sebagai item “Lainnya”</label>' : '') +
          '<p class="small">Harga satuan item sudah termasuk waste; upah tukang katalog menjadi tarif tukang per satuan di RAB proyek.</p>';
      }
      if (!total && tab !== 'rabs') rows = '<div class="empty">' + (pb.plants.length || pb.materials.length ? 'Tidak ada hasil.' : 'Katalog masih kosong. Isi dulu di tab Tanaman.') + '</div>';
      if (tab === 'rabs' && !total) rows += '<div class="empty">Belum ada RAB di katalog Tanaman.</div>';
      if (tab !== 'rabs' && total > shown) rows += '<p class="small" style="text-align:center">Menampilkan ' + shown + ' dari ' + total + '. Persempit dengan pencarian.</p>';
      box.innerHTML = rows;
    }
    function draw() {
      body.innerHTML = (opts.projectSelect ? '<label class="f"><span>Proyek tujuan (RAB)</span>' + (projects.length ? '<select id="pcProj">' + projects.map(p => '<option value="' + esc(p.id) + '" ' + (String(p.id) === String(opts.projectId) ? 'selected' : '') + '>' + esc(p.name) + '</option>').join('') + '</select>' : '<div class="small" style="color:var(--clay)">Belum ada proyek. Buat dulu di tab Proyek.</div>') + '</label>' : '') +
        '<div class="tabs"><button type="button" data-tab="plants" class="' + (tab === 'plants' ? 'on' : '') + '">Tanaman (' + pb.plants.length + ')</button><button type="button" data-tab="mats" class="' + (tab === 'mats' ? 'on' : '') + '">Material (' + pb.materials.length + ')</button><button type="button" data-tab="rabs" class="' + (tab === 'rabs' ? 'on' : '') + '">RAB katalog (' + pb.rabs.length + ')</button></div>' +
        (tab !== 'rabs' ? '<input type="search" id="pcQ" placeholder="Cari nama / kategori…" value="' + esc(q) + '" style="margin-bottom:6px">' : '') + '<div id="pcList"></div>';
      list(); foot();
    }
    body.addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if (b) { tab = b.dataset.tab; q = ''; draw(); } });
    body.addEventListener('input', e => {
      const t = e.target;
      if (t.id === 'pcQ') { q = t.value; list(); }
      else if (t.dataset && t.dataset.k) { qty.set(t.dataset.k, t.value); t.closest('.prow').classList.toggle('sel', num(t.value) > 0); foot(); }
    });
    body.addEventListener('change', e => {
      const t = e.target;
      if (t.name === 'rabsel') { rabSel = t.value; list(); foot(); }
      else if (t.id === 'pcMk') { withMarkup = t.checked; foot(); }
    });
    draw();
  });
}

/* ========================== SURVEI -> PROYEK ========================== */
async function listSurveys() {
  await flushFrame('survei');
  const all = await KV.prefix('landspace:p:');
  return Object.values(all).map(v => { try { return JSON.parse(v); } catch (_) { return null; } }).filter(p => p && p.id != null && !p.archived).map(p => {
    const r = SurveiCalc.rabOf(p);
    const items = r.items.filter(x => x.included && x.q > 0).map(x => ({ n: x.n, k: 'Material', q: round2(x.q), u: x.u, h: Math.round(x.mat + x.lab), tw: Math.round(x.lab) }));
    return { id: String(p.id), name: p.name, code: p.code || '', client: p.client || '', address: p.address || '', status: p.status || '', date: p.surveyDate || '', offerNumber: (p.rab && p.rab.offerNumber) || '', validUntil: (p.rab && p.rab.validUntil) || '', areas: (p.areas || []).length, grand: Math.round(r.grand), agreed: (p.rab && p.rab.negotiatedTotal) || null, unpriced: items.filter(x => !x.h).length, items, noPrice: r.items.filter(x => x.included && !x.mat && !x.lab).length };
  }).sort((a, b) => String(b.date).localeCompare(String(a.date)));
}

async function readSurvey(id) {
  await flushFrame('survei');
  const raw = await KV.get('landspace:p:' + id), rec = raw ? jparse(raw, null) : null;
  return rec && rec.id != null ? rec : null;
}
async function writeSurvey(rec) {
  rec.updatedAt = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, -1);
  await KV.set('landspace:p:' + rec.id, JSON.stringify(rec));
  await KV.flush();
  unloadFrame('survei');   // Survei menyimpan salinan di memorinya; muat ulang agar tidak menimpa perubahan ini
  syncKick(1500);
}
// Nilai kesepakatan (nego) dari tab Penawaran supaya PDF dan Excel di Survei memakai angka yang sama. null = hapus.
async function setSurveyAgreed(id, total) {
  const rec = await readSurvey(id); if (!rec) return false;
  rec.rab = rec.rab || {};
  if (total == null) { if (rec.rab.negotiatedTotal == null) return true; delete rec.rab.negotiatedTotal; } else rec.rab.negotiatedTotal = total;
  await writeSurvey(rec); return true;
}
// Harga katalog untuk item survei yang belum berharga. Waste katalog ikut dipakai bila material survei belum punya waste sendiri.
async function catalogPrices(id) {
  const rec = await readSurvey(id); if (!rec) return [];
  const pb = await readPB(), items = SurveiCalc.rabOf(rec).items.filter(x => x.included);
  const byItem = new Map((rec.rab && rec.rab.items || []).map(i => [i.id, i]));
  const waste = it => { const m = (rec.materials || []).find(x => x.id === (byItem.get(it.id) || {}).materialId); return m && m.waste > 0 ? 0 : 1; };
  const cat = new Map(pb.materials.map(m => [m.name, m]));
  return ProyekLogic.matchCatalog(items, pb.materials.map(m => ({ name: m.name, price: m.price, labor: m.labor }))).map(x => {
    const c = cat.get(x.cat), f = 1 + waste(items.find(i => i.id === x.id)) * num(c && c.waste) / 100;
    return { id: x.id, n: items.find(i => i.id === x.id).n, cat: x.cat, mat: Math.round(x.mat * f), lab: x.lab };
  });
}
async function applyCatalogPrices(id, list) {
  const rec = await readSurvey(id); if (!rec || !rec.rab) return 0;
  let n = 0;
  list.forEach(m => { const i = (rec.rab.items || []).find(x => x.id === m.id); if (i && !i.priceMaterial && !i.priceLabor) { i.priceMaterial = m.mat; i.priceLabor = m.lab; n++; } });
  if (n) await writeSurvey(rec);
  return n;
}

function openSurvey(info) { state.sv = info || null; return go('survei'); }
// Bentuk minimal yang diterima Survei; daftar material dan RAB bawaan diisi oleh Survei sendiri.
async function createSurvey({ name, client, pack }) {
  await flushFrame('survei');
  const all = await KV.prefix('landspace:p:'), now = new Date(), year = now.getFullYear();
  const iso = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, -1);
  const last = Object.values(all).reduce((max, v) => { const m = /^LS-(\d{4})-(\d+)$/.exec((jparse(v, {}) || {}).code || ''); return m && +m[1] === year ? Math.max(max, +m[2]) : max; }, 0);
  const id = 'jlp' + now.getTime().toString(36) + Math.random().toString(36).slice(2, 8), code = 'LS-' + year + '-' + String(last + 1).padStart(4, '0');
  await KV.set('landspace:p:' + id, JSON.stringify({ id, code, name, client: client || '', address: '', surveyDate: iso, surveyor: '', type: pack === 'batu_alam' ? 'batuAlam' : pack === 'tekstur' ? 'tekstur' : 'outdoor', status: 'draft', coverPhotoId: null, notes: pack === 'batu_alam' ? 'Jenis pekerjaan: batu alam' : pack === 'tekstur' ? 'Jenis pekerjaan: cat tekstur' : '', archived: false, createdAt: iso, updatedAt: iso, areas: [], photos: [], history: [{ at: iso, fieldId: null, summary: 'Proyek dibuat' }] }));
  await KV.flush();
  unloadFrame('survei');   // modul punya cache sendiri; muat ulang agar lembar baru terlihat
  syncKick(1500);
  return { id, code, name };
}

/* ========================== CADANGAN GABUNGAN ========================== */
const blobToDataURL = b => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsDataURL(b); });
const dataURLToBlob = d => { const [head, b64] = d.split(','); const mime = (head.match(/data:([^;]+)/) || [])[1] || 'image/jpeg'; const bin = atob(b64), a = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); return new Blob([a], { type: mime }); };

async function makeBackup() {
  await flushAll();
  const kv = await KV.entries();
  delete kv['__migrated_ls'];
  Object.keys(kv).forEach(k => { if (k.indexOf('jlp:summary:') === 0 || k.indexOf('jlp:sync:') === 0) delete kv[k]; });
  const sepran = {};
  for (const s of FIN_STORES) {
    let rows = await finAll(s);
    if (s === 'receipts') rows = await Promise.all(rows.map(async r => ({ ...r, blob: r.blob instanceof Blob ? await blobToDataURL(r.blob) : (r.blob || null) })));
    sepran[s] = rows;
  }
  return { app: 'Juned Landscape Project', format: 1, version: APP_VERSION, exportedAt: new Date().toISOString(), kv, sepran };
}
async function makeBackupDownload() {
  try {
    toast('Menyiapkan cadangan…', { ms: 1500 });
    const data = await makeBackup();
    const name = 'juned-landscape-backup-' + todayISO() + '.json';
    const ok = await JLP.saveBlob(new Blob([JSON.stringify(data)], { type: 'application/json' }), name);
    if (ok !== false) {
      await KV.set('jlp:lastBackup', new Date().toISOString());
      toast('Cadangan dibuat: ' + name, { ms: 4000 });
      if (state.view === 'setelan') renderSettings(); else if (state.view === 'home') renderHome();
    }
  } catch (e) { console.error(e); toast('Cadangan gagal dibuat'); }
}

function detectBackup(d) {
  if (!d || typeof d !== 'object') return null;
  if (d.app === 'Juned Landscape Project' && d.kv && d.sepran) return 'all';
  if (d.app === 'Sepran Personal' && Array.isArray(d.wallets) && Array.isArray(d.txs)) return 'sepran';
  if (!Array.isArray(d) && Array.isArray(d.p)) return 'proyek';
  if (d.app === 'PlantBase Landscape' || Array.isArray(d.plants) || (Array.isArray(d) && d.every(x => x && typeof x === 'object'))) return 'plantbase';
  return null;
}
async function finReplace(rows) {
  const conv = {};
  for (const s of FIN_STORES) {
    let arr = Array.isArray(rows[s]) ? rows[s].filter(x => x && typeof x === 'object' && x.id != null) : [];
    if (s === 'receipts') arr = arr.map(r => ({ ...r, blob: typeof r.blob === 'string' && r.blob.indexOf('data:') === 0 ? dataURLToBlob(r.blob) : r.blob })).filter(r => r.blob);
    if (s === 'settings') arr = arr.filter(x => ['pin', 'lastBackup'].includes(x.id));
    conv[s] = arr;
  }
  await finTx(FIN_STORES, t => FIN_STORES.forEach(n => { const os = t.objectStore(n); os.clear(); conv[n].forEach(x => os.put(x)); }));
}
async function restoreFromFile(file) {
  try {
    if (file.size > 300 * 1048576) throw new Error('file lebih dari 300 MB');
    const data = await readBackupJSON(file), kind = detectBackup(data);
    if (!kind) { toast('Format file cadangan tidak dikenali'); return; }
    const label = { all: 'SEMUA data (proyek, tanaman, keuangan)', sepran: 'data KEUANGAN (cadangan Sepran lama)', proyek: 'data PROYEK (cadangan Taman Kerja lama)', plantbase: 'data TANAMAN (cadangan PlantBase lama)' }[kind];
    if (!await confirmBox('Pulihkan ' + label + ' dari file “' + file.name + '”?\n\nData yang ada pada bagian tersebut akan DIGANTI. Disarankan membuat cadangan terlebih dahulu.', { title: 'Pulihkan cadangan', ok: 'Ganti data', danger: true })) return;
    await flushAll();
    if (kind === 'all') {
      Object.keys(MODS).forEach(unloadFrame);
      const keep = {}; for (const k of ['jlp:sync:state', 'jlp:sync:conflicts', 'jlp:sync:gemini']) { const v = await KV.get(k); if (v) keep[k] = v; }
      const kv = { ...data.kv, ...keep, '__migrated_ls': '1' }; await KV.replaceAll(kv); await finReplace(data.sepran);
    } else if (kind === 'sepran') {
      await finReplace({ wallets: data.wallets, txs: data.txs, debts: data.debts, budgets: data.budgets, receipts: data.receipts, categories: data.categories, recurring: data.recurring, settings: data.settings });
    } else if (kind === 'proyek') {
      unloadFrame('proyek'); await KV.set('tamankerja:v1', JSON.stringify(data.p)); if (data.cfg) await KV.set('tk:cfg', JSON.stringify(data.cfg)); await KV.del('jlp:summary:proyek');
    } else {
      unloadFrame('tanaman');
      const plants = Array.isArray(data) ? data : data.plants;
      await KV.set('plantbase_landscape_v1', JSON.stringify(plants));
      if (Array.isArray(data.materials)) await KV.set('plantbase_materials_v18', JSON.stringify(data.materials));
      if (Array.isArray(data.rabProjects)) await KV.set('plantbase_rabs_v18', JSON.stringify(data.rabProjects));
      if (data.tombstones && typeof data.tombstones === 'object') await KV.set('plantbase_tombstones_v14', JSON.stringify(data.tombstones));
      await KV.set('plantbase_material_migration_v182', '1'); await KV.set('plantbase_material_seeded_v181', '1');
    }
    state.sumTried = false;
    toast('Pemulihan berhasil', { ms: 3500 }); syncKick(1500);
    setView(kind === 'all' ? 'home' : state.view);
    if (kind !== 'all' && ['home', 'setelan'].includes(state.view)) setView(state.view);
  } catch (e) { console.error(e); toast('Pemulihan gagal: ' + (e && e.message || 'file tidak valid'), { ms: 5000 }); }
}

async function resetAll() {
  if (!await confirmBox('Semua data proyek, tanaman/material/RAB, dan keuangan di perangkat ini akan dihapus permanen.', { title: 'Hapus semua data', ok: 'Lanjut', danger: true })) return;
  openModal({
    title: 'Konfirmasi terakhir', body: '<p style="margin-top:0">Ketik <b>HAPUS</b> untuk menghapus semua data.</p><input type="text" id="rstTxt" autocomplete="off" autocapitalize="characters">',
    foot: [{ label: 'Batal', cls: 'ghost' }, { label: 'Hapus semua', cls: 'danger', onClick: async () => {
      if ($('#rstTxt').value.trim().toUpperCase() !== 'HAPUS') { toast('Ketik HAPUS untuk melanjutkan'); return false; }
      Object.keys(MODS).forEach(unloadFrame);
      LS.set('jlp_sync_on', '0'); clearInterval(sync.timer);   // reset = hanya perangkat ini; data cloud tidak dihapus
      await KV.replaceAll({ '__migrated_ls': '1' });
      await finTx(FIN_STORES, t => FIN_STORES.forEach(n => t.objectStore(n).clear()));
      try { localStorage.removeItem('sepran_pin_guard'); } catch (_) {}
      toast('Semua data dihapus');
      setTimeout(() => { location.hash = '#/home'; location.reload(); }, 700);
    } }]
  });
}

/* ========================== API untuk modul + boot ========================== */
window.JLPShell = {
  moduleReady(win) { Object.keys(MODS).forEach(n => { const m = MODS[n]; if (m.frame && m.frame.contentWindow === win && m.resolve) m.resolve(win); }); },
  async listProjects() { await flushFrame('proyek'); const p = await kvJSON('tamankerja:v1', []); return (Array.isArray(p) ? p : []).map(x => ({ id: x.id, name: x.name, par: x.par || 0 })); },
  localChanged(k) { if (Object.values(SK).includes(k) || String(k).indexOf('landspace:') === 0) syncKick(4000); },
  pickCatalog, listSurveys, openSurvey, createSurvey, setSurveyAgreed, catalogPrices, applyCatalogPrices, go, toast
};

async function boot() {
  buildNav();
  await KV.ready;
  if (KV.usingMemory) toast('Penyimpanan browser diblokir (mode privat?). Data tidak akan tersimpan.', { ms: 9000 });
  registerSW();
  updateInstallUI();
  syncLoadCfg(); syncCheckSetupLink();
  await odHandleRedirect();
  if (sync.auth && sync.auth.uid && !LS.get('jlp_sync_uid')) LS.set('jlp_sync_uid', sync.auth.uid);   // sesi dari versi sebelum layar login
  state.view = null;
  // Modul dibuka setelah login, supaya data dari akun sudah turun sebelum tampil.
  const synced = await loginGate();
  setView(parseHash(), true);
  if (!synced) syncStart();
  setSyncStatus(sync.status);
  odKick(10000);
  addEventListener('online', () => { if (state.view === 'home') renderHome(); });
  addEventListener('offline', () => { if (state.view === 'home') renderHome(); });
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (_) {}
  // muat modul Proyek di latar agar ringkasan Beranda selalu segar
  setTimeout(() => { if (!MODS.proyek.promise) loadFrame('proyek'); }, 2500);
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();

