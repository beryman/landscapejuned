/* Juned Landscape Project - halaman shell: Beranda, Terpadu, Pengaturan */
'use strict';
let homeTok = 0, tpTok = 0, homeActs = [];

function greeting() { const h = new Date().getHours(); return h < 11 ? 'Selamat pagi' : h < 15 ? 'Selamat siang' : h < 19 ? 'Selamat sore' : 'Selamat malam'; }
function stat(label, value, sub, cls) { return '<div class="stat ' + (cls || '') + '"><span>' + esc(label) + '</span><b>' + value + '</b>' + (sub ? '<small>' + esc(sub) + '</small>' : '') + '</div>'; }
async function lastBackupDate() { const v = await KV.get('jlp:lastBackup'); return v ? new Date(v) : null; }

/* ========================== BERANDA ========================== */
async function renderHome() {
  const my = ++homeTok, body = $('#homeBody');
  const [tk, pb, fin] = await Promise.all([readTK(), readPB(), readFin().catch(() => ({ error: true }))]);
  if (my !== homeTok) return;
  const s = tk.summary, hasTK = tk.projects.length > 0, acts = homeActs = [];
  const act = fn => { acts.push(fn); return 'data-a="' + (acts.length - 1) + '"'; };

  // ringkasan belum ada tapi data proyek ada: muat modul Proyek di latar untuk menghitungnya
  if (hasTK && (!s || s.n !== tk.projects.length) && !state.sumTried) {
    state.sumTried = true;
    loadFrame('proyek').then(() => sleep(500)).then(() => { if (state.view === 'home') renderHome(); });
  }

  const dateLong = new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  let h = '<div class="ph"><div><div class="eyebrow">' + esc(dateLong) + '</div><h1>' + greeting() + '</h1><p>Ringkasan proyek, keuangan, dan stok tanaman Anda.</p></div>' +
    '<div class="row"><span class="pill off" ' + (navigator.onLine ? 'hidden' : '') + '>Offline</span><button type="button" class="btn ghost sm" ' + act(() => renderHome()) + '>↻ Segarkan</button></div></div>';

  // banner cadangan
  const lb = await lastBackupDate();
  const hasData = hasTK || pb.plants.length > 1 || (fin && !fin.locked && !fin.error && fin.txs && fin.txs.length);
  const days = lb ? Math.floor((Date.now() - lb.getTime()) / 864e5) : null;
  if (hasData && (days === null || days >= 14)) {
    h += '<div class="banner"><div class="sp"><b>' + (days === null ? 'Belum ada cadangan gabungan' : 'Cadangan terakhir ' + days + ' hari lalu') + '</b><div class="small">Data tersimpan di perangkat ini. Buat cadangan berkala agar aman bila perangkat hilang atau browser membersihkan data.</div></div><button type="button" class="btn sm" ' + act(() => makeBackupDownload()) + '>Buat cadangan</button></div>';
  }

  // aksi cepat
  const finAct = name => () => {
    const open = w => { if (state.pinSet && !state.finUnlocked) { toast('Masukkan PIN Keuangan terlebih dahulu'); return; } w.JLP[name](); };
    return go('keuangan', open);
  };
  h += '<div class="grid qa">' + [
    ['＋', 'Transaksi', finAct('openTx')], ['📷', 'Foto nota', finAct('openReceipt')],
    ['🗂️', 'Proyek baru', () => go('proyek', w => w.JLP.newProject())], ['🌱', 'Tambah tanaman', () => go('tanaman', w => w.JLP.addPlant())],
    ['🧮', 'Katalog ke RAB', () => startCatalogToRab()]
  ].map(a => '<button type="button" ' + act(a[2]) + '><span class="ico">' + a[0] + '</span>' + a[1] + '</button>').join('') + '</div>';

  // --- Proyek
  h += '<div class="sec">Proyek</div>';
  if (!hasTK) h += '<div class="card empty">Belum ada proyek. Mulai dengan <b>Proyek baru</b> di atas.</div>';
  else if (!s) h += '<div class="card empty">Menghitung ringkasan proyek…</div>';
  else h += '<div class="grid stats">' + stat('Proyek', s.n) + stat('Tugas dikerjakan', s.doing) + stat('Tugas terlambat', s.late, '', s.late ? 'warn' : '') + stat('Total RAB', rpc(s.rab)) + stat('Bisa ditagih ke owner', rpc(s.can), '', s.can ? 'good' : '') + '</div>';

  // --- Keuangan
  h += '<div class="sec">Keuangan</div>';
  if (fin.error) h += '<div class="card empty">Data keuangan belum dapat dibaca.</div>';
  else if (fin.locked) h += '<div class="grid stats">' + stat('Saldo', '🔒 Terkunci', '', 'lock') + stat('Bulan ini', '🔒 Terkunci', '', 'lock') + '</div><div class="small" style="margin-top:8px">Angka keuangan disembunyikan karena PIN aktif. <a href="#/keuangan" style="color:var(--g2);font-weight:700">Buka kunci di tab Keuangan</a>.</div>';
  else h += '<div class="grid stats">' + stat('Saldo semua wallet', rpc(fin.balance), '', fin.balance < 0 ? 'bad' : '') + stat('Pemasukan bulan ini', rpc(fin.inc), '', 'good') + stat('Pengeluaran bulan ini', rpc(fin.exp), '', fin.exp > fin.inc && fin.exp ? 'warn' : '') + stat('Piutang', rpc(fin.recv)) + stat('Utang', rpc(fin.pay), '', fin.pay ? 'warn' : '') + '</div>';

  // --- Tanaman
  const low = pb.plants.filter(p => num(p.stock) <= 5);
  const stockUnits = pb.plants.reduce((a, p) => a + num(p.stock), 0), stockVal = pb.plants.reduce((a, p) => a + num(p.stock) * num(p.price), 0);
  const pbT = r => r.items.reduce((a, i) => a + num(i.qty) * (1 + num(i.waste) / 100) * num(i.price) + num(i.qty) * num(i.labor), 0) * (1 + Math.max(0, num(r.markup)) / 100);
  h += '<div class="sec">Tanaman &amp; material</div>';
  if (!pb.plants.length && !pb.materials.length) h += '<div class="card empty">Katalog masih kosong. Buka tab <b>Tanaman</b> untuk memulai.</div>';
  else h += '<div class="grid stats">' + stat('Jenis tanaman', pb.plants.length) + stat('Total stok', stockUnits.toLocaleString('id-ID'), 'unit tanaman') + stat('Nilai stok', rpc(stockVal)) + stat('Item material', pb.materials.length) + stat('RAB katalog', pb.rabs.length, pb.rabs.length ? 'total ' + rpc(pb.rabs.reduce((a, r) => a + pbT(r), 0)) : '') + '</div>';

  // --- Perlu perhatian
  const items = [];
  if (s) {
    (s.lateList || []).slice(0, 5).forEach(t => items.push({ ic: '⏰', cls: 'warn', t: t.t, sub: 'Terlambat sejak ' + fdate(t.b) + ' · ' + t.p, fn: () => go('proyek', w => w.JLP.openProject(t.pid, 'board')) }));
    (s.projects || []).forEach(p => {
      if (p.can > 0) items.push({ ic: '🧾', cls: '', t: 'Bisa ditagih ' + rp(p.can), sub: p.name, fn: () => go('proyek', w => w.JLP.openProject(p.id, 'op')) });
      if (p.due > 0) items.push({ ic: '👷', cls: '', t: 'Upah tukang belum dibayar ' + rp(p.due), sub: p.name, fn: () => go('proyek', w => w.JLP.openProject(p.id, 'op')) });
    });
  }
  if (fin && !fin.locked && !fin.error) {
    const soon = new Date(Date.now() + 3 * 864e5), lim = soon.getFullYear() + '-' + pad(soon.getMonth() + 1) + '-' + pad(soon.getDate());
    fin.debts.filter(d => d.due && d.due <= lim).slice(0, 4).forEach(d => items.push({ ic: d.type === 'payable' ? '💸' : '🤝', cls: d.due < todayISO() ? 'bad' : 'warn', t: (d.type === 'payable' ? 'Utang ke ' : 'Piutang dari ') + (d.person || '-') + ' · ' + rp(num(d.amount) - num(d.paid)), sub: (d.due < todayISO() ? 'Lewat jatuh tempo ' : 'Jatuh tempo ') + fdate(d.due), fn: () => go('keuangan') }));
  }
  if (low.length) items.push({ ic: '🌱', cls: 'warn', t: low.length + ' tanaman stok menipis (≤ 5)', sub: low.slice(0, 3).map(p => p.local || p.name).join(', ') + (low.length > 3 ? ', …' : ''), fn: () => go('tanaman') });
  h += '<div class="sec">Perlu perhatian</div>';
  h += items.length ? '<div class="list">' + items.slice(0, 9).map(i => '<button type="button" class="item ' + i.cls + '" ' + act(i.fn) + '><span class="ic">' + i.ic + '</span><div><b>' + esc(i.t) + '</b><small>' + esc(i.sub) + '</small></div><span class="go">›</span></button>').join('') + '</div>' : '<div class="card empty">Tidak ada yang mendesak saat ini. 👍</div>';

  // --- Proyek berjalan
  if (s && s.projects && s.projects.length) {
    const run = s.projects.filter(p => !p.par && p.pct < 100).slice(0, 8), done = s.projects.filter(p => !p.par && p.pct >= 100).length;
    h += '<div class="sec">Proyek berjalan</div><div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(270px,1fr))">' +
      (run.map(p => '<button type="button" class="card pj" ' + act(() => go('proyek', w => w.JLP.openProject(p.id, 'board'))) + '><div class="top"><div><h3>' + esc(p.name) + '</h3><small>' + esc(p.client || 'Tanpa klien') + ' · ' + p.tasks + ' tugas</small></div><b>' + p.pct + '%</b></div><div class="bar"><i style="width:' + p.pct + '%"></i></div><small style="display:block;margin-top:7px">RAB ' + rpc(p.rab) + ' · Diterima ' + rpc(p.op) + '</small></button>').join('') || '<div class="card empty" style="grid-column:1/-1">Semua proyek selesai 🎉</div>') + '</div>' +
      (done ? '<div class="small" style="margin-top:8px">' + done + ' proyek sudah selesai 100%.</div>' : '');
  }
  body.innerHTML = h;
  body.onclick = e => { const b = e.target.closest('[data-a]'); if (b && homeActs[+b.dataset.a]) homeActs[+b.dataset.a](); };
}

/* ========================== TERPADU ========================== */
async function renderTerpadu() {
  const my = ++tpTok, body = $('#terpaduBody');
  body.innerHTML = '<div class="ph"><div><h1>Terpadu</h1><p>Proyek, keuangan, dan katalog tanaman saling terhubung di sini.</p></div></div><div class="card empty">Memuat…</div>';
  const [tk, fin] = await Promise.all([readTK(), readFin().catch(() => ({ error: true }))]);
  if (my !== tpTok) return;
  const sm = {}; ((tk.summary && tk.summary.projects) || []).forEach(p => { sm[p.id] = p; });
  const names = {}; tk.projects.forEach(p => { names[p.id] = p.name; });
  const invSum = (p, t, st) => (p.inv || []).filter(i => i.t === t && (!st || i.st === st)).reduce((a, i) => a + num(i.a), 0);
  const unsynced = {};
  if (fin && !fin.locked && !fin.error) {
    const have = new Set(fin.txs.filter(t => t.projectInvId).map(t => t.id));
    tk.projects.forEach(p => { unsynced[p.id] = (p.inv || []).filter(i => i.st === 'Dibayar' && num(i.a) > 0 && !have.has('proj-' + p.id + '-' + i.id)).length; });
  }
  let h = '<div class="ph"><div><h1>Terpadu</h1><p>Proyek, keuangan, dan katalog tanaman saling terhubung di sini.</p></div>' +
    '<div class="row"><button type="button" class="btn" data-t="catalog">🧮 Katalog ke RAB</button><button type="button" class="btn ghost" data-t="syncall">⇄ Sinkron semua ke Keuangan</button></div></div>';
  h += '<div class="banner info"><div class="sp small" style="color:var(--ink)"><b>Cara kerjanya.</b> Tagihan proyek berstatus <b>Dibayar</b> dapat dicatat otomatis ke Keuangan (pemasukan dari owner, pengeluaran upah tukang). Transaksi manual di Keuangan juga bisa diberi tanda <b>Proyek</b>, sehingga laba kas tiap proyek terhitung di bawah ini.</div></div>';
  if (fin && fin.locked) h += '<div class="banner"><div class="sp"><b>🔒 Keuangan terkunci PIN</b><div class="small">Angka kas proyek disembunyikan sampai Anda membuka kunci.</div></div><button type="button" class="btn sm" data-t="unlock">Buka Keuangan</button></div>';
  h += '<div class="sec">Ringkasan per proyek</div>';
  if (!tk.projects.length) h += '<div class="card empty">Belum ada proyek. Buat dulu di tab <b>Proyek</b>.</div>';
  else {
    h += '<div class="list">' + tk.projects.map(p => {
      const q = sm[p.id], rab = q ? q.rab : (p.rab || []).reduce((a, x) => a + num(x.q) * num(x.h), 0);
      const pct = q ? q.pct : ((p.tasks || []).length ? Math.round((p.tasks.filter(t => t.s == 2).length / p.tasks.length) * 100) : 0);
      const ob = invSum(p, 'owner'), op = invSum(p, 'owner', 'Dibayar'), tp = invSum(p, 'tukang', 'Dibayar');
      const kas = fin && !fin.locked && !fin.error ? (fin.byProj[String(p.id)] || { in: 0, out: 0 }) : null;
      return '<div class="card"><div class="row" style="align-items:flex-start"><div class="sp"><h3>' + esc(p.name) + (p.par && names[p.par] ? ' <small>↳ sub dari ' + esc(names[p.par]) + '</small>' : '') + '</h3><small>' + esc(p.client || 'Tanpa klien') + ' · ' + ((p.tasks || []).length) + ' tugas</small></div><b>' + pct + '%</b></div>' +
        '<div class="bar" style="margin-top:8px"><i style="width:' + pct + '%"></i></div>' +
        '<div class="mgrid"><div><span>Nilai RAB</span><b>' + rp(rab) + '</b></div><div><span>Ditagih ke owner</span><b>' + rp(ob) + '</b></div><div><span>Diterima dari owner</span><b>' + rp(op) + '</b></div><div><span>Piutang owner</span><b>' + rp(ob - op) + '</b></div><div><span>Upah tukang dibayar</span><b>' + rp(tp) + '</b></div><div><span>Upah belum dibayar</span><b>' + (q ? rp(q.due) : '–') + '</b></div></div>' +
        '<div class="kas">' + (kas ? '<b>Kas Keuangan</b> (transaksi bertanda proyek): masuk <b class="pos">' + rp(kas.in) + '</b> · keluar <b class="neg">' + rp(kas.out) + '</b> · laba kas <b class="' + (kas.in - kas.out >= 0 ? 'pos' : 'neg') + '">' + rp(kas.in - kas.out) + '</b>' + (unsynced[p.id] ? ' · <span style="color:var(--clay)">' + unsynced[p.id] + ' pembayaran belum disinkron</span>' : '') : '🔒 Kas disembunyikan (Keuangan terkunci atau belum dibaca).') + '</div>' +
        '<div class="row"><button type="button" class="btn sm" data-t="sync" data-p="' + esc(p.id) + '">⇄ Sinkron ke Keuangan</button><button type="button" class="btn ghost sm" data-t="cat" data-p="' + esc(p.id) + '">+ Dari katalog</button><button type="button" class="btn ghost sm" data-t="open" data-p="' + esc(p.id) + '">Buka proyek</button></div></div>';
    }).join('') + '</div>';
  }
  body.innerHTML = h;
  body.onclick = async e => {
    const b = e.target.closest('[data-t]'); if (!b) return;
    const t = b.dataset.t, pid = b.dataset.p;
    if (t === 'catalog') startCatalogToRab();
    else if (t === 'syncall') { await syncFinance({}); renderTerpadu(); }
    else if (t === 'sync') { await syncFinance({ projectId: pid }); renderTerpadu(); }
    else if (t === 'cat') startCatalogToRab(pid);
    else if (t === 'open') go('proyek', w => w.JLP.openProject(pid, 'board'));
    else if (t === 'unlock') go('keuangan');
  };
}

/* ========================== PENGATURAN ========================== */
async function renderSettings() {
  const body = $('#setelanBody');
  const lb = await lastBackupDate();
  let usage = '', persisted = '–';
  try { const e = await navigator.storage.estimate(); usage = (e.usage / 1048576).toFixed(1) + ' MB dari ± ' + (e.quota / 1048576 >= 1024 ? (e.quota / 1073741824).toFixed(1) + ' GB' : Math.round(e.quota / 1048576) + ' MB'); } catch (_) { usage = 'tidak diketahui'; }
  try { persisted = (await navigator.storage.persisted()) ? 'Ya' : 'Belum'; } catch (_) {}
  const inst = JLP.isStandalone();
  body.innerHTML = '<div class="ph"><div><h1>Pengaturan</h1><p>Juned Landscape Project · versi ' + APP_VERSION + '</p></div></div>' +
    '<div class="split">' +
    '<div class="card"><h3>Pasang aplikasi</h3><p class="small">' + (inst ? '✅ Aplikasi berjalan sebagai aplikasi terpasang.' : 'Pasang agar muncul di layar utama / Dock, tampil layar penuh, dan bisa dipakai offline.') + '</p>' + (inst ? '' : '<div class="row"><button type="button" class="btn" id="stInstall">⬇️ ' + (state.deferredPrompt ? 'Pasang sekarang' : 'Lihat cara memasang') + '</button></div>' + (state.deferredPrompt ? '' : installHelpHTML())) + '</div>' +
    '<div class="card"><h3>Cadangan &amp; pemulihan</h3><p class="small">Satu file mencakup semua modul: proyek, tanaman/material/RAB, dan keuangan (termasuk foto nota).<br>Cadangan terakhir: <b>' + (lb ? lb.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }) : 'belum pernah') + '</b></p>' +
    '<div class="row"><button type="button" class="btn" id="stBackup">⬇️ Unduh cadangan</button><label class="btn ghost" style="cursor:pointer">⬆️ Pulihkan dari file<input type="file" id="stRestore" accept=".json,.txt,application/json,text/plain" hidden></label></div>' +
    '<p class="small" style="margin-bottom:0">Bisa juga memulihkan file cadangan dari aplikasi lama (Taman Kerja, PlantBase, Sepran): format dikenali otomatis dan hanya menggantikan modul terkait.</p></div>' +
    '<div class="card"><h3>Penyimpanan</h3><div class="kv" style="margin:8px 0"><span>Terpakai</span><b>' + esc(usage) + '</b><span>Penyimpanan permanen</span><b>' + persisted + '</b></div><div class="row"><button type="button" class="btn ghost sm" id="stPersist">Minta penyimpanan permanen</button></div><p class="small" style="margin-bottom:0">Data hanya ada di perangkat ini. iPhone/iPad: pasang ke layar utama agar Safari tidak membersihkan data yang lama tidak dibuka. Untuk berpindah perangkat, gunakan cadangan.</p></div>' +
    '<div class="card"><h3>Pembaruan aplikasi</h3><p class="small">Versi terpasang: <b>' + APP_VERSION + '</b>. Pembaruan diunduh otomatis saat online.</p><div class="row"><button type="button" class="btn ghost sm" id="stUpdate">Periksa pembaruan</button><button type="button" class="btn ghost sm" id="stRefresh">Segarkan &amp; bersihkan cache</button></div><p class="small" style="margin-bottom:0">Membersihkan cache tidak menghapus data Anda.</p></div>' +
    '<div class="card"><h3>Hapus semua data</h3><p class="small">Menghapus seluruh data proyek, tanaman, dan keuangan di perangkat ini. Buat cadangan lebih dulu.</p><button type="button" class="btn danger sm" id="stReset">Hapus semua data…</button></div>' +
    '<div class="card"><h3>Tentang</h3><p class="small" style="margin-bottom:0">Juned Landscape Project menyatukan tiga aplikasi: <b>Proyek</b> (Taman Kerja), <b>Tanaman</b> (PlantBase V1.8.4), dan <b>Keuangan</b> (Sepran Personal V4.6.1), lengkap dengan jembatan data di antaranya. Semua data tersimpan lokal; tidak ada server.</p></div>' +
    '</div>';
  const on = (id, fn) => { const el = $('#' + id); if (el) el.onclick = fn; };
  on('stInstall', () => doInstall());
  on('stBackup', () => makeBackupDownload());
  const rf = $('#stRestore'); if (rf) rf.onchange = e => { const f = e.target.files[0]; e.target.value = ''; if (f) restoreFromFile(f); };
  on('stPersist', async () => { try { const ok = await navigator.storage.persist(); toast(ok ? 'Penyimpanan permanen diaktifkan' : 'Browser belum memberi izin permanen'); renderSettings(); } catch (_) { toast('Tidak didukung browser ini'); } });
  on('stUpdate', async () => { try { if (state.swReg) { await state.swReg.update(); toast('Sudah versi terbaru atau sedang diunduh'); } else toast('Pembaruan otomatis hanya aktif saat dibuka dari server (https)'); } catch (_) { toast('Gagal memeriksa pembaruan (offline?)'); } });
  on('stRefresh', async () => {
    if (!await confirmBox('Aplikasi akan dimuat ulang dan cache dibersihkan. Data Anda tidak terhapus. Lanjutkan?', { title: 'Segarkan aplikasi' })) return;
    await flushAll();
    try { const regs = await navigator.serviceWorker.getRegistrations(); await Promise.all(regs.map(r => r.unregister())); const ks = await caches.keys(); await Promise.all(ks.map(k => caches.delete(k))); } catch (_) {}
    location.reload();
  });
  on('stReset', () => resetAll());
}
