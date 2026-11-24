/* Juned Landscape Project - layar login di awal aplikasi, untuk sinkron antar perangkat. */
'use strict';
const login = { el: null, mode: 'in', busy: false, resolve: null, background: null };

const loginNeeded = () => LoginLogic.needsLogin({ configured: syncConfigured(), loggedIn: syncLoggedIn(), secure: !!(window.crypto && crypto.subtle), skipped: LS.get('jlp_login_skip') === '1' });
const loginGate = () => loginNeeded() ? loginOpen() : Promise.resolve(false);

// Selesai dengan true bila sinkron sudah dimulai dari sini.
function loginOpen(note) {
  if (login.el) { loginMsg(note || ''); return Promise.resolve(false); }
  const el = login.el = document.createElement('div');
  el.id = 'login'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-labelledby', 'lgTitle');
  el.innerHTML = '<div class="lg-brand"><img src="icons/logo-96.png" alt="" width="56" height="56"><p class="lg-name">Juned Landscape Project</p><p class="lg-line">Survei, penawaran, RAB, dan opname yang sama di HP dan komputer.</p></div>' +
    '<div class="lg-side"><form class="lg-form" id="lgForm" novalidate></form></div>';
  document.body.appendChild(el);
  $('#app').inert = true;
  loginForm(note);
  return new Promise(res => { login.resolve = res; });
}
function loginClose(started) {
  if (!login.el) return;
  login.el.remove(); login.el = null; login.mode = 'in'; $('#app').inert = false;
  if (state.view === 'setelan') renderSettings();
  const r = login.resolve; login.resolve = null; if (r) r(started);
}
const loginMsg = (t, err) => { const m = $('#lgMsg'); if (m) { m.textContent = t; m.classList.toggle('err', !!err); } };

function loginForm(note) {
  const up = login.mode === 'up', f = $('#lgForm');
  f.innerHTML = '<h1 id="lgTitle">' + (up ? 'Buat akun' : 'Masuk') + '</h1><p class="lg-sub">' + (up ? 'Cukup sekali. Perangkat lain tinggal masuk dengan akun ini.' : 'Pakai akun yang sama di semua perangkat.') + '</p>' +
    '<label class="f"><span>Email</span><input type="email" id="lgEmail" inputmode="email" autocapitalize="off" autocomplete="username" required value="' + esc(LS.get('jlp_sync_email') || '') + '"></label>' +
    '<label class="f"><span>Kata sandi</span><span class="lg-pass"><input type="password" id="lgPass" autocomplete="' + (up ? 'new-password' : 'current-password') + '" required><button type="button" class="lnk" id="lgShow" aria-pressed="false">Lihat</button></span></label>' +
    '<div id="lgMsg" class="lg-msg" role="status" aria-live="polite"></div>' +
    '<button type="submit" class="btn lg-go" id="lgGo">' + (up ? 'Buat akun' : 'Masuk') + '</button>' +
    '<p class="lg-alt">' + (up ? 'Sudah punya akun?' : 'Belum punya akun?') + ' <button type="button" class="lnk" id="lgMode">' + (up ? 'Masuk' : 'Buat akun') + '</button></p>' +
    '<p class="lg-skip"><button type="button" class="lnk" id="lgSkip">Pakai tanpa login</button><br>Data hanya tersimpan di perangkat ini.</p>';
  f.onsubmit = loginSubmit;
  $('#lgShow').onclick = () => { const p = $('#lgPass'), show = p.type === 'password'; p.type = show ? 'text' : 'password'; $('#lgShow').textContent = show ? 'Sembunyikan' : 'Lihat'; $('#lgShow').setAttribute('aria-pressed', String(show)); };
  $('#lgMode').onclick = () => { login.mode = up ? 'in' : 'up'; const e = $('#lgEmail').value; loginForm(); $('#lgEmail').value = e; };
  $('#lgSkip').onclick = () => { LS.set('jlp_login_skip', '1'); loginClose(false); };
  loginMsg(note || (navigator.onLine ? '' : 'Tidak ada internet. Anda tetap bisa memakai aplikasi tanpa login.'));
  // Di HP fokus otomatis memunculkan keyboard dan menutupi formulir.
  if (matchMedia('(hover:hover)').matches) ($('#lgEmail').value ? $('#lgPass') : $('#lgEmail')).focus();
}

// Sesi dipasang hanya setelah akun dipastikan, supaya sinkron tidak berjalan memakai catatan akun lain.
async function loginAccept(j) {
  const uid = j.user && j.user.id, last = LS.get('jlp_sync_uid');
  if (LoginLogic.accountChanged(last, uid)) {
    const ok = await confirmBox('Perangkat ini terakhir dipakai akun lain. Bila dilanjutkan, data di perangkat ini ikut masuk ke akun ' + (j.user.email || 'ini') + '.\n\nBila data ini bukan milik akun tersebut, pilih Batal.', { title: 'Akun berbeda', ok: 'Gabungkan ke akun ini' });
    if (!ok) return false;
    await KV.set('jlp:sync:state', JSON.stringify({ cursor: null, base: {}, blobs: {} }));
    await KV.set('jlp:sync:conflicts', '[]');
    await KV.del(SK.gem);   // kunci Gemini milik akun lama
    if (MODS.tanaman.frame) unloadFrame('tanaman');
    for (const k of Object.keys(await KV.prefix(SNAP))) await KV.del(k);
  }
  if (uid) LS.set('jlp_sync_uid', uid);
  storeSession(j); LS.del('jlp_login_skip'); LS.set('jlp_sync_on', '1');
  return true;
}

async function loginSubmit(ev) {
  ev.preventDefault();
  if (login.busy) return;
  const email = $('#lgEmail').value.trim(), pass = $('#lgPass').value, bad = LoginLogic.validate(email, pass), up = login.mode === 'up';
  if (bad) { loginMsg(bad, true); return; }
  login.busy = true; $('#lgGo').disabled = true; loginMsg('Memproses…');
  LS.set('jlp_sync_email', email);   // hanya email, bukan kata sandi
  try {
    const j = await authReq(up ? '/auth/v1/signup' : '/auth/v1/token?grant_type=password', { email, password: pass });
    if (!j || !j.access_token) { login.mode = 'in'; loginForm('Akun dibuat. Buka email konfirmasi, klik tautannya, lalu masuk.'); return; }
    if (!await loginAccept(j)) { loginMsg('Dibatalkan. Masuk dengan akun lain atau pakai tanpa login.'); return; }
    await loginSyncFirst();
  } catch (e) { loginMsg(e.message, true); }
  finally { login.busy = false; const b = $('#lgGo'); if (b) b.disabled = false; }
}

// Unduhan pertama bisa lama karena foto: pengguna boleh masuk lebih dulu, sinkron lanjut di latar.
async function loginSyncFirst() {
  $('#lgForm').innerHTML = '<h1 id="lgTitle">Menyiapkan data</h1><p class="lg-sub">Mengambil data terbaru dari akun Anda. Foto bisa membuat proses pertama lebih lama.</p><button type="button" class="btn ghost lg-go" id="lgBg">Lanjut, sinkron di latar</button>';
  sync.st = null;
  const inBackground = new Promise(res => { $('#lgBg').onclick = () => res(true); });
  const bg = await Promise.race([Promise.resolve(syncStart()).then(() => false), inBackground]);
  loginClose(true);
  toast(bg ? 'Sinkron berjalan di latar' : sync.status === 'err' ? 'Berhasil masuk, tetapi sinkron gagal: ' + sync.msg : 'Data sudah sinkron');
}

function syncSessionEnded() {
  LS.del('jlp_sync_auth'); LS.del('jlp_login_skip'); sync.auth = null;
  clearInterval(sync.timer); clearTimeout(sync.dt); setSyncStatus('off');
  loginOpen('Sesi berakhir. Masuk lagi untuk melanjutkan sinkron. Data di perangkat ini aman.');
}
