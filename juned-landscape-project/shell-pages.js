/* Juned Landscape Project - halaman shell: Beranda (pantauan proyek) dan Pengaturan */
'use strict';
let homeTok = 0, homeActs = [], homeStage = null;
const STAGES = ['Survei', 'Penawaran', 'RAB', 'Opname', 'Selesai'];

function greeting() { const h = new Date().getHours(); return h < 11 ? 'Selamat pagi' : h < 15 ? 'Selamat siang' : h < 19 ? 'Selamat sore' : 'Selamat malam'; }
function stat(label, value, sub, cls) { return '<div class="stat ' + (cls || '') + '"><span>' + esc(label) + '</span><b>' + value + '</b>' + (sub ? '<small>' + esc(sub) + '</small>' : '') + '</div>'; }
async function lastBackupDate() { const v = await KV.get('jlp:lastBackup'); return v ? new Date(v) : null; }
function stageTrack(n) {
  return '<div class="track" role="img" aria-label="Tahap ' + (n + 1) + ' dari 5: ' + STAGES[n] + '">' + STAGES.map((_, i) => '<i class="' + (i < n ? 'done' : i === n ? 'now' : '') + '"></i>').join('') + '</div>';
}

/* ========================== BERANDA ========================== */
async function renderHome() {
  const my = ++homeTok, body = $('#homeBody');
  const tk = await readTK();
  if (my !== homeTok) return;
  const s = tk.summary, hasTK = tk.projects.length > 0, acts = homeActs = [];
  const act = fn => { acts.push(fn); return 'data-a="' + (acts.length - 1) + '"'; };
  const open = (id, v) => () => go('proyek', w => w.JLP.openProject(id, v));
  const fresh = s && s.v === 2 && s.n === tk.projects.length;

  // ringkasan belum ada atau versi lama: muat modul Proyek di latar untuk menghitungnya
  if (hasTK && !fresh && !state.sumTried) {
    state.sumTried = true;
    loadFrame('proyek').then(() => sleep(500)).then(() => { if (state.view === 'home') renderHome(); });
  }

  const dateLong = new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  let h = '<div class="ph"><div><div class="eyebrow">' + esc(dateLong) + '</div><h1>' + greeting() + '</h1><p>Pantau setiap proyek dari survei sampai opname.</p></div>' +
    '<div class="row">' + syncPillHTML() + '<span class="pill off" ' + (navigator.onLine ? 'hidden' : '') + '>Offline</span><button type="button" class="btn sm" ' + act(() => go('proyek', w => w.JLP.newProject())) + '>+ Proyek baru</button></div></div>';

  h += cloudBannerHTML();
  const lb = await lastBackupDate();
  const days = lb ? Math.floor((Date.now() - lb.getTime()) / 864e5) : null;
  if (hasTK && (days === null || days >= 14)) {
    h += '<div class="banner"><div class="sp"><b>' + (days === null ? 'Belum ada cadangan' : 'Cadangan terakhir ' + days + ' hari lalu') + '</b><div class="small">Buat cadangan berkala agar data aman bila perangkat hilang atau browser membersihkan data.</div></div><button type="button" class="btn sm" ' + act(() => makeBackupDownload()) + '>Buat cadangan</button></div>';
  }

  if (!hasTK) {
    h += '<div class="card guide"><h3>Mulai proyek pertama</h3><ol>' +
      '<li><button type="button" class="lnk" ' + act(() => go('proyek', w => w.JLP.newProject())) + '>Buat proyek</button> untuk klien Anda.</li>' +
      '<li>Buat survei di dalam proyek: foto, bidang, volume, dan harga.</li>' +
      '<li>Kirim penawaran. Saat disetujui, item survei otomatis menjadi RAB.</li>' +
      '<li>Catat progres di Opname dan tagih sesuai hasil kerja.</li></ol></div>';
  } else if (!fresh) {
    h += '<div class="card empty">Menghitung ringkasan proyek…</div>';
  } else {
    const all = s.projects, main = all.filter(p => !p.par);
    const counts = STAGES.map((_, i) => main.filter(p => p.stg === i).length);
    h += '<div class="pipe" role="group" aria-label="Saring proyek per tahap">' + STAGES.map((n, i) =>
      '<button type="button" class="' + (homeStage === i ? 'on' : '') + '" aria-pressed="' + (homeStage === i) + '" ' + act(() => { homeStage = homeStage === i ? null : i; renderHome(); }) + '><b>' + counts[i] + '</b><span>' + n + '</span></button>').join('') + '</div>';

    const todo = all.filter(p => p.nu).filter(p => homeStage === null || p.stg === homeStage);
    h += '<div class="sec">Perlu tindakan</div>';
    h += todo.length ? '<div class="list">' + todo.slice(0, 8).map(p =>
      '<button type="button" class="item ' + (p.nw ? 'warn' : '') + '" ' + act(open(p.id, p.nv)) + '><span class="tag">' + STAGES[p.stg] + '</span><div><b>' + esc(p.nx) + '</b><small>' + esc(p.name) + (p.client ? ' · ' + esc(p.client) : '') + '</small></div><span class="go" aria-hidden="true">›</span></button>').join('') + '</div>' +
      (todo.length > 8 ? '<div class="small" style="margin-top:8px">dan ' + (todo.length - 8) + ' tindakan lainnya.</div>' : '')
      : '<div class="card empty">Tidak ada yang perlu ditindak' + (homeStage === null ? '' : ' di tahap ' + STAGES[homeStage]) + '.</div>';

    const shown = main.filter(p => homeStage === null ? p.stg < 4 : p.stg === homeStage);
    const doneN = counts[4];
    h += '<div class="sec">' + (homeStage === null ? 'Proyek berjalan' : 'Tahap ' + STAGES[homeStage]) + '</div>';
    h += shown.length ? '<div class="grid pjgrid">' + shown.map(p =>
      '<button type="button" class="card pj" ' + act(open(p.id, p.nv)) + '><div class="top"><div><h3>' + esc(p.name) + '</h3><small>' + esc(p.client || 'Tanpa klien') + '</small></div><b>' + STAGES[p.stg] + '</b></div>' + stageTrack(p.stg) +
      '<div class="pjm"><span>' + (p.rab ? 'RAB ' + rpc(p.rab) : p.pnv ? 'Penawaran ' + rpc(p.pnv) : 'Belum ada nilai') + '</span>' + (p.rab ? '<span>Progres ' + p.pc + '%</span>' : '') + (p.late ? '<span class="lt">' + p.late + ' tugas terlambat</span>' : '') + '</div></button>').join('') + '</div>'
      : '<div class="card empty">Tidak ada proyek di sini.</div>';
    if (homeStage === null && doneN) h += '<div class="small" style="margin-top:8px">' + doneN + ' proyek sudah selesai. Ketuk <b>Selesai</b> di atas untuk melihatnya.</div>';
  }
  body.innerHTML = h; bindBanners();
  body.onclick = e => { const b = e.target.closest('[data-a]'); if (b && homeActs[+b.dataset.a]) homeActs[+b.dataset.a](); };
}

/* ========================== PENGATURAN ========================== */
async function renderSettings() {
  const body = $('#setelanBody');
  const lb = await lastBackupDate();
  let usage = '', persisted = '–';
  try { const e = await navigator.storage.estimate(); usage = (e.usage / 1048576).toFixed(1) + ' MB dari ± ' + (e.quota / 1048576 >= 1024 ? (e.quota / 1073741824).toFixed(1) + ' GB' : Math.round(e.quota / 1048576) + ' MB'); } catch (_) { usage = 'tidak diketahui'; }
  try { persisted = (await navigator.storage.persisted()) ? 'Ya' : 'Belum'; } catch (_) {}
  const inst = JLP.isStandalone(), who = (await KV.get('tk:me')) || '';
  body.innerHTML = '<div class="ph"><div><h1>Pengaturan</h1><p>Juned Landscape Project · versi ' + APP_VERSION + '</p></div></div>' +
    '<div class="split">' +
    '<div class="card"><h3>Nama di perangkat ini</h3><p class="small">Semua perangkat memakai akun yang sama. Nama ini yang tercatat di riwayat aktivitas proyek, jadi jelas siapa mengubah apa.</p><label class="f"><span>Nama</span><input type="text" id="stMe" value="' + esc(who === 'Anggota' ? '' : who) + '" placeholder="mis. Pak Juned, Mandor Budi" autocomplete="name"></label></div>' +
    '<div class="card"><h3>Pasang aplikasi</h3><p class="small">' + (inst ? 'Aplikasi berjalan sebagai aplikasi terpasang.' : 'Pasang agar muncul di layar utama / Dock, tampil layar penuh, dan bisa dipakai offline.') + '</p>' + (inst ? '' : '<div class="row"><button type="button" class="btn" id="stInstall">' + (state.deferredPrompt ? 'Pasang sekarang' : 'Lihat cara memasang') + '</button></div>' + (state.deferredPrompt ? '' : installHelpHTML())) + '</div>' +
    '<div class="card"><h3>Cadangan &amp; pemulihan</h3><p class="small">Satu file mencakup semua data, termasuk data keuangan lama yang tersimpan di perangkat ini.<br>Cadangan terakhir: <b>' + (lb ? lb.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }) : 'belum pernah') + '</b></p>' +
    '<div class="row"><button type="button" class="btn" id="stBackup">Unduh cadangan</button><label class="btn ghost" style="cursor:pointer">Pulihkan dari file<input type="file" id="stRestore" accept=".json,.txt,.gz,application/json,application/gzip,text/plain" hidden></label></div>' +
    '<p class="small" style="margin-bottom:0">Bisa juga memulihkan file cadangan dari aplikasi lama (Taman Kerja, PlantBase, Sepran): format dikenali otomatis dan hanya menggantikan modul terkait.</p></div>' +
    '<div class="card"><h3>Penyimpanan</h3><div class="kv" style="margin:8px 0"><span>Terpakai</span><b>' + esc(usage) + '</b><span>Penyimpanan permanen</span><b>' + persisted + '</b></div><div class="row"><button type="button" class="btn ghost sm" id="stPersist">Minta penyimpanan permanen</button></div><p class="small" style="margin-bottom:0">iPhone/iPad: pasang ke layar utama agar Safari tidak membersihkan data yang lama tidak dibuka.</p></div>' +
    '<div class="card"><h3>Pembaruan aplikasi</h3><p class="small">Versi terpasang: <b>' + APP_VERSION + '</b>. Pembaruan diunduh otomatis saat online.</p><div class="row"><button type="button" class="btn ghost sm" id="stUpdate">Periksa pembaruan</button><button type="button" class="btn ghost sm" id="stRefresh">Segarkan &amp; bersihkan cache</button></div><p class="small" style="margin-bottom:0">Membersihkan cache tidak menghapus data Anda.</p></div>' +
    '<details class="dd" style="grid-column:1/-1"' + (syncConfigured() || location.hash.includes('sync') ? ' open' : '') + '><summary>Lanjutan: sinkron antar perangkat dan cadangan OneDrive</summary><div class="split" style="margin-top:10px">' + syncCardHTML() + odCardHTML() + '</div></details>' +
    '<div class="card"><h3>Hapus semua data</h3><p class="small">Menghapus seluruh data di perangkat ini, termasuk data keuangan lama. Buat cadangan lebih dulu.</p><button type="button" class="btn danger sm" id="stReset">Hapus semua data…</button></div>' +
    '<div class="card"><h3>Tentang</h3><p class="small" style="margin-bottom:0">Juned Landscape Project memantau proyek lanskap dari <b>Survei</b> (LANDSPACE), penawaran, RAB, sampai opname di <b>Proyek</b> (Taman Kerja), dengan <b>Katalog</b> tanaman dan material (PlantBase). Data tersimpan di perangkat; sinkron antar perangkat bersifat opsional.</p></div>' +
    '</div>';
  bindSyncCard(); bindOdCard(); bindSpaceBlock(); loadSpaceBox();
  const on = (id, fn) => { const el = $('#' + id); if (el) el.onclick = fn; };
  const me = $('#stMe');
  me.onchange = () => { const w = frameWin('proyek'); (w && w.KV ? w.KV : KV).ls.setItem('tk:me', me.value.trim() || 'Anggota'); toast('Nama disimpan'); };
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
