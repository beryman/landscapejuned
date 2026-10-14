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

/* ========================== SINKRON PEMBAYARAN PROYEK -> KEUANGAN ========================== */
async function syncFinance({ projectId } = {}) {
  try {
    await flushFrame('proyek');
    const pin = await finPinSet(); state.pinSet = pin;
    if (!finAccessible(pin)) { toast('Buka kunci Keuangan (PIN) terlebih dahulu'); go('keuangan'); return null; }
    const tk = (await readTK()).projects;
    const single = projectId != null && projectId !== '';
    const scope = single ? tk.filter(p => String(p.id) === String(projectId)) : tk;
    if (!scope.length) { toast('Belum ada proyek untuk disinkronkan'); return null; }
    await finSeed();
    const [txs, wallets] = await Promise.all([finAll('txs'), finAll('wallets')]);
    const existing = new Map(txs.filter(t => t.projectInvId).map(t => [t.id, t]));
    const scopeIds = new Set(scope.map(p => String(p.id)));
    const want = new Map();
    scope.forEach(p => (p.inv || []).forEach(i => {
      if (i.st !== 'Dibayar' || num(i.a) <= 0) return;
      const owner = i.t === 'owner', id = 'proj-' + p.id + '-' + i.id;
      want.set(id, { id, type: owner ? 'income' : 'expense', amount: num(i.a), note: (owner ? 'Pembayaran owner · ' : 'Upah tukang · ') + p.name + (i.n ? ' · ' + i.n : ''), date: String(i.d || todayISO()).slice(0, 10), category: 'project', memo: 'Otomatis dari modul Proyek', projectId: String(p.id), projectInvId: String(i.id) });
    }));
    const add = [], upd = [], del = [];
    want.forEach((w, id) => { const ex = existing.get(id); if (!ex) add.push(w); else if (ex.amount !== w.amount || ex.date !== w.date || ex.note !== w.note || ex.type !== w.type) upd.push({ ...ex, ...w, wallet: ex.wallet }); });
    existing.forEach((ex, id) => { if (scopeIds.has(String(ex.projectId)) && !want.has(id)) del.push(ex); });
    if (!add.length && !upd.length && !del.length) { toast('Sudah sinkron: tidak ada perubahan'); return { add: 0, upd: 0, del: 0 }; }

    const cfg = await kvJSON('jlp:cfg', {});
    let wallet = null;
    const proceed = await new Promise(res => {
      const sum = a => a.reduce((x, y) => x + y.amount, 0);
      const ins = add.filter(x => x.type === 'income'), outs = add.filter(x => x.type === 'expense');
      const dflt = wallets.find(w => w.id === cfg.finWallet) || wallets.find(w => w.id === 'wallet_bank') || wallets[0];
      let h = '<div class="list" style="margin-bottom:10px">' +
        (add.length ? '<div class="item"><span class="ic">＋</span><div><b>' + add.length + ' transaksi baru</b><small>Pemasukan ' + rp(sum(ins)) + ' (' + ins.length + ') · Pengeluaran ' + rp(sum(outs)) + ' (' + outs.length + ')</small></div></div>' : '') +
        (upd.length ? '<div class="item"><span class="ic">✎</span><div><b>' + upd.length + ' transaksi diperbarui</b><small>Mengikuti perubahan tagihan di Proyek</small></div></div>' : '') +
        (del.length ? '<div class="item warn"><span class="ic">🗑</span><div><b>' + del.length + ' transaksi dihapus</b><small>Tagihannya tidak lagi berstatus Dibayar</small></div></div>' : '') + '</div>';
      if (add.length) h += '<label class="f"><span>Masuk/keluar lewat wallet</span><select id="sfW">' + wallets.map(w => '<option value="' + esc(w.id) + '" ' + (dflt && w.id === dflt.id ? 'selected' : '') + '>' + esc(w.name) + '</option>').join('') + '</select></label>';
      h += '<div class="small">' + scope.length + ' proyek diperiksa. Transaksi hasil sinkron memakai kategori <b>Proyek</b> dan bertanda proyek; tidak bisa diedit di Keuangan (ubah dari tagihan di Proyek).</div>';
      let ok = false;
      openModal({ title: 'Sinkron ke Keuangan', body: h, foot: [{ label: 'Batal', cls: 'ghost' }, { label: 'Sinkronkan', onClick: () => { ok = true; if (add.length) wallet = $('#sfW').value; } }], onClose: () => res(ok) });
    });
    if (!proceed) return null;
    await finTx(['txs', 'categories'], t => {
      const ts = t.objectStore('txs');
      add.forEach(x => ts.put({ ...x, wallet }));
      upd.forEach(x => ts.put(x));
      del.forEach(x => ts.delete(x.id));
    });
    if (add.length && wallet) await KV.set('jlp:cfg', JSON.stringify({ ...cfg, finWallet: wallet }));
    const w = frameWin('keuangan'); if (w && w.render) { try { w.render(); } catch (_) {} }
    toast('Tersinkron: ' + add.length + ' baru, ' + upd.length + ' diperbarui, ' + del.length + ' dihapus');
    return { add: add.length, upd: upd.length, del: del.length };
  } catch (e) { console.error(e); toast('Sinkron gagal: ' + (e && e.message || 'kesalahan')); return null; }
}

/* ========================== CADANGAN GABUNGAN ========================== */
const blobToDataURL = b => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsDataURL(b); });
const dataURLToBlob = d => { const [head, b64] = d.split(','); const mime = (head.match(/data:([^;]+)/) || [])[1] || 'image/jpeg'; const bin = atob(b64), a = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); return new Blob([a], { type: mime }); };

async function makeBackup() {
  await flushAll();
  const kv = await KV.entries();
  delete kv['__migrated_ls'];
  Object.keys(kv).forEach(k => { if (k.indexOf('jlp:summary:') === 0) delete kv[k]; });
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
  await finSeed();
}
async function restoreFromFile(file) {
  try {
    if (file.size > 300 * 1048576) throw new Error('file lebih dari 300 MB');
    const data = JSON.parse(await file.text()), kind = detectBackup(data);
    if (!kind) { toast('Format file cadangan tidak dikenali'); return; }
    const label = { all: 'SEMUA data (proyek, tanaman, keuangan)', sepran: 'data KEUANGAN (cadangan Sepran lama)', proyek: 'data PROYEK (cadangan Taman Kerja lama)', plantbase: 'data TANAMAN (cadangan PlantBase lama)' }[kind];
    if (!await confirmBox('Pulihkan ' + label + ' dari file “' + file.name + '”?\n\nData yang ada pada bagian tersebut akan DIGANTI. Disarankan membuat cadangan terlebih dahulu.', { title: 'Pulihkan cadangan', ok: 'Ganti data', danger: true })) return;
    await flushAll();
    if (kind === 'all') {
      Object.keys(MODS).forEach(unloadFrame);
      const kv = { ...data.kv, '__migrated_ls': '1' }; await KV.replaceAll(kv); await finReplace(data.sepran);
    } else if (kind === 'sepran') {
      unloadFrame('keuangan');
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
    state.finUnlocked = false; state.sumTried = false;
    toast('Pemulihan berhasil', { ms: 3500 });
    setView(kind === 'all' ? 'home' : state.view);
    if (kind !== 'all' && ['home', 'setelan', 'terpadu'].includes(state.view)) setView(state.view);
  } catch (e) { console.error(e); toast('Pemulihan gagal: ' + (e && e.message || 'file tidak valid'), { ms: 5000 }); }
}

async function resetAll() {
  if (!await confirmBox('Semua data proyek, tanaman/material/RAB, dan keuangan di perangkat ini akan dihapus permanen.', { title: 'Hapus semua data', ok: 'Lanjut', danger: true })) return;
  openModal({
    title: 'Konfirmasi terakhir', body: '<p style="margin-top:0">Ketik <b>HAPUS</b> untuk menghapus semua data.</p><input type="text" id="rstTxt" autocomplete="off" autocapitalize="characters">',
    foot: [{ label: 'Batal', cls: 'ghost' }, { label: 'Hapus semua', cls: 'danger', onClick: async () => {
      if ($('#rstTxt').value.trim().toUpperCase() !== 'HAPUS') { toast('Ketik HAPUS untuk melanjutkan'); return false; }
      Object.keys(MODS).forEach(unloadFrame);
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
  setFinLocked(l) { state.finUnlocked = !l; if (l) state.pinSet = true; },
  async listProjects() { await flushFrame('proyek'); const p = await kvJSON('tamankerja:v1', []); return (Array.isArray(p) ? p : []).map(x => ({ id: x.id, name: x.name, par: x.par || 0 })); },
  pickCatalog, syncFinance, go, toast
};

(async function boot() {
  buildNav();
  await KV.ready;
  if (KV.usingMemory) toast('Penyimpanan browser diblokir (mode privat?). Data tidak akan tersimpan.', { ms: 9000 });
  registerSW();
  updateInstallUI();
  state.view = null;
  setView(parseHash(), true);
  addEventListener('online', () => { if (state.view === 'home') renderHome(); });
  addEventListener('offline', () => { if (state.view === 'home') renderHome(); });
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (_) {}
  // muat modul Proyek di latar agar ringkasan Beranda selalu segar
  setTimeout(() => { if (!MODS.proyek.promise) loadFrame('proyek'); }, 2500);
})();
