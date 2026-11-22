/* Juned Landscape Project - cadangan ke Google Drive (folder tersembunyi milik aplikasi, izin drive.appdata).
   Login: Google Identity Services (token 1 jam). Client ID dari config.js atau diisi di Pengaturan.
   Logika Drive ada di lib/gdrive-backup.js; berkas ini hanya menyambungkannya ke aplikasi. */
'use strict';
const GD = { scope: 'https://www.googleapis.com/auth/drive.appdata', gsi: 'https://accounts.google.com/gsi/client' };
const gdClientId = () => { const s = jparse(LS.get('jlp_gd_cfg'), null); return (s && s.clientId) || (window.JLP_CONFIG && window.JLP_CONFIG.googleClientId) || ''; };
const gdAuth = () => jparse(LS.get('jlp_gd_auth'), null);
const gdReady = () => { const a = gdAuth(); return !!(gdClientId() && a && a.token && Date.now() < a.exp); };
const gdState = { busy: false, lastErr: '' };
const GD_ID_RE = /^\d+-[a-z0-9]+\.apps\.googleusercontent\.com$/i;

let gsiPromise = null;
function gdLoadGsi() {
  if (window.google && google.accounts && google.accounts.oauth2) return Promise.resolve();
  if (!gsiPromise) gsiPromise = new Promise((res, rej) => {
    const s = document.createElement('script'); s.src = GD.gsi; s.async = true; s.onload = res;
    s.onerror = () => { gsiPromise = null; rej(new Error('Layanan masuk Google tidak bisa dimuat. Periksa koneksi internet.')); };
    document.head.appendChild(s);
  });
  return gsiPromise;
}
// Harus dipanggil dari ketukan pengguna (popup Google). Setelah pernah disetujui, jendelanya otomatis singkat.
async function gdLogin() {
  const id = gdClientId(); if (!id) throw new Error('Isi Client ID Google dulu.');
  await gdLoadGsi();
  return new Promise((res, rej) => {
    const c = google.accounts.oauth2.initTokenClient({
      client_id: id, scope: GD.scope,
      callback: r => {
        if (r.error) return rej(new Error(r.error === 'access_denied' ? 'Izin Google ditolak.' : 'Masuk Google gagal: ' + (r.error_description || r.error)));
        LS.set('jlp_gd_auth', JSON.stringify({ token: r.access_token, exp: Date.now() + (num(r.expires_in) || 3600) * 1000 - 60000 }));
        LS.set('jlp_gd_granted', '1'); res(r.access_token);
      },
      error_callback: e => rej(new Error(e && e.type === 'popup_closed' ? 'Jendela masuk Google ditutup.' : 'Masuk Google gagal. Pastikan popup tidak diblokir.'))
    });
    c.requestAccessToken({ prompt: LS.get('jlp_gd_granted') ? '' : 'consent' });
  });
}
const gdToken = async () => gdReady() ? gdAuth().token : gdLogin();
const gdKeep = () => Math.max(1, num(LS.get('jlp_gd_keep')) || 5);

async function gdBackupNow(opts = {}) {
  if (gdState.busy) throw new Error('Cadangan Google Drive sedang berjalan');
  gdState.busy = true; gdState.lastErr = '';
  const step = s => opts.onStep && opts.onStep(s);
  try {
    const token = await gdToken();
    step('Menyiapkan data…');
    const blob = await gzipBlob(JSON.stringify(await makeBackup()));
    const name = GDriveBackup.fileName();
    step('Mengunggah ' + fmtSize(blob.size) + ' ke Google Drive…');
    const r = await GDriveBackup.upload(token, name, blob);
    LS.set('jlp_gd_last', JSON.stringify({ t: Date.now(), name, size: r.size }));
    await KV.set('jlp:lastBackup', new Date().toISOString());
    try { for (const old of GDriveBackup.pickToDelete(await GDriveBackup.list(token), gdKeep())) await GDriveBackup.remove(token, old.id); } catch (_) {}
    return { name, size: r.size, id: r.id };
  } catch (e) { if (e.needLogin) LS.del('jlp_gd_auth'); gdState.lastErr = e.message; throw e; }
  finally { gdState.busy = false; }
}
// Satu ketukan: dipakai tombol di Beranda dan Pengaturan.
async function gdBackupFlow(btn) {
  const label = btn && btn.textContent; if (btn) btn.disabled = true;
  try { const r = await gdBackupNow({ onStep: s => { if (btn) btn.textContent = s; } }); toast('Tercadangkan ke Google Drive: ' + fmtSize(r.size), { ms: 4000 }); }
  catch (e) { toast(e.message, { ms: 6000 }); }
  finally { if (btn) { btn.disabled = false; btn.textContent = label; } if (state.view === 'setelan') renderSettings(); else if (state.view === 'home') renderHome(); }
}

async function gdRestorePicker() {
  let list; try { list = await GDriveBackup.list(await gdToken()); } catch (e) { toast(e.message, { ms: 5000 }); return; }
  if (!list.length) { toast('Belum ada cadangan di Google Drive'); return; }
  const m = openModal({
    title: 'Pulihkan dari Google Drive',
    body: '<p class="small" style="margin-top:0">Pilih cadangan. Data saat ini akan <b>diganti</b>.</p><div class="list">' + list.map((x, i) => '<button type="button" class="item" data-i="' + i + '"><span class="ic" aria-hidden="true">☁</span><div><b>' + esc(x.name.replace(GDriveBackup.PREFIX, '').replace('.json.gz', '')) + '</b><small>' + fmtSize(x.size) + ' · ' + new Date(x.createdTime).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) + '</small></div><span class="go" aria-hidden="true">›</span></button>').join('') + '</div>',
    foot: [{ label: 'Tutup', cls: 'ghost' }]
  });
  m.body.addEventListener('click', async e => {
    const b = e.target.closest('[data-i]'); if (!b) return;
    const it = list[+b.dataset.i]; m.close();
    try { toast('Mengunduh cadangan…', { ms: 2000 }); await restoreFromFile(new File([await GDriveBackup.download(await gdToken(), it.id)], it.name)); }
    catch (er) { toast('Gagal memulihkan: ' + er.message, { ms: 5000 }); }
  });
}

function gdCardHTML() {
  const id = gdClientId(), last = jparse(LS.get('jlp_gd_last'), null);
  let h = '<div class="card" style="grid-column:1/-1"><h3>☁ Cadangan Google Drive</h3>';
  if (!id) {
    return h + '<p class="small">Simpan cadangan lengkap (termasuk foto asli) ke Google Drive Anda. Disimpan di folder tersembunyi milik aplikasi, jadi tidak bercampur dengan file Anda dan aplikasi tidak bisa melihat file lain. Perlu Client ID Google gratis (panduan: <b>GOOGLE-DRIVE.md</b>, sekitar 5 menit).</p>' +
      '<label class="f"><span>Client ID Google</span><input type="text" id="gdClient" placeholder="1234567890-abc.apps.googleusercontent.com" autocapitalize="off" autocomplete="off"></label>' +
      '<p class="small">Alamat aplikasi yang harus didaftarkan di Google (Authorized JavaScript origins): <b>' + esc(location.origin) + '</b></p><button type="button" class="btn" id="gdSave">Simpan</button></div>';
  }
  const a = gdAuth(), on = gdReady();
  h += '<p class="small">' + (on ? 'Terhubung (sesi berlaku sampai ' + new Date(a.exp).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) + ').' : 'Siap. Tombol di bawah akan meminta masuk dengan Google bila sesi sudah habis (satu ketukan).') + ' Cadangan terakhir: <b>' + (last ? ago(last.t) + ' (' + fmtSize(last.size) + ')' : 'belum ada') + '</b></p>' +
    (gdState.lastErr ? '<p class="small" style="color:var(--red)">Terakhir gagal: ' + esc(gdState.lastErr) + '</p>' : '') +
    '<div class="row" style="margin-bottom:10px"><button type="button" class="btn" id="gdNow">☁ Cadangkan sekarang</button><button type="button" class="btn ghost" id="gdRestore">Pulihkan dari Google Drive…</button><button type="button" class="btn ghost" id="gdOut">Putuskan</button></div>' +
    '<label class="small" style="display:flex;gap:8px;align-items:center">Simpan <input type="number" id="gdKeep" min="1" max="30" value="' + gdKeep() + '" style="width:72px;min-height:34px;padding:4px 8px"> cadangan terakhir</label>' +
    '<p class="small" style="margin-bottom:0">Google hanya memberi sesi 1 jam tanpa server, jadi cadangan dibuat saat Anda menekan tombol (Beranda mengingatkan bila sudah lama).</p>';
  return h + '</div>';
}
function bindGdCard() {
  const on = (id, fn) => { const el = $('#' + id); if (el) el.onclick = fn; };
  on('gdSave', () => { const v = $('#gdClient').value.trim(); if (!GD_ID_RE.test(v)) { toast('Client ID tidak valid (berakhiran .apps.googleusercontent.com)'); return; } LS.set('jlp_gd_cfg', JSON.stringify({ clientId: v })); renderSettings(); });
  on('gdNow', () => gdBackupFlow($('#gdNow')));
  on('gdRestore', () => gdRestorePicker());
  on('gdOut', async () => { if (!await confirmBox('Putuskan Google Drive dari perangkat ini? File cadangan di Google Drive tidak dihapus.', { title: 'Putuskan Google Drive' })) return; ['jlp_gd_auth', 'jlp_gd_granted', 'jlp_gd_cfg'].forEach(k => LS.del(k)); renderSettings(); });
  const kp = $('#gdKeep'); if (kp) kp.onchange = () => LS.set('jlp_gd_keep', String(Math.min(30, Math.max(1, num(kp.value) || 5))));
}
