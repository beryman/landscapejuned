/* Juned Landscape Project - cadangan ke OneDrive (Microsoft Graph, folder khusus aplikasi).
   Login: OAuth2 authorization code + PKCE (jenis "Single-page application").
   Izin: Files.ReadWrite.AppFolder (hanya folder Apps/<nama aplikasi>), offline_access, User.Read. */
'use strict';
const OD = {
  auth: 'https://login.microsoftonline.com/common/oauth2/v2.0',
  graph: 'https://graph.microsoft.com/v1.0',
  scope: 'Files.ReadWrite.AppFolder offline_access User.Read',
  prefix: 'jlp-backup-',
  simpleMax: 3800000   // di bawah ini: unggah sekali jalan; di atasnya: upload session bertahap
};
const odCfg = () => jparse(LS.get('jlp_od_cfg'), null);
const odAuth = () => jparse(LS.get('jlp_od_auth'), null);
const odRedirect = () => location.origin + location.pathname;
const odReady = () => !!(odCfg() && odCfg().clientId && odAuth() && odAuth().refresh);
const odOpt = (k, d) => { const v = LS.get('jlp_od_' + k); return v == null ? d : v; };
const odState = { busy: false, needLogin: false, lastErr: '' };
const b64url = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

async function odLogin() {
  const cfg = odCfg(); if (!cfg || !cfg.clientId) { toast('Isi Application (client) ID dulu'); return; }
  const rnd = n => b64url(crypto.getRandomValues(new Uint8Array(n)));
  const verifier = rnd(48), state = rnd(12);
  const challenge = b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
  LS.set('jlp_od_pkce', JSON.stringify({ v: verifier, s: state, t: Date.now() }));
  const q = new URLSearchParams({ client_id: cfg.clientId, response_type: 'code', redirect_uri: odRedirect(), response_mode: 'query', scope: OD.scope, state, code_challenge: challenge, code_challenge_method: 'S256', prompt: 'select_account' });
  await flushAll();
  location.href = OD.auth + '/authorize?' + q;
}
async function odTokenReq(params) {
  const cfg = odCfg();
  const res = await fetch(OD.auth + '/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: cfg.clientId, scope: OD.scope, ...params }) });
  let j = null; try { j = await res.json(); } catch (_) {}
  if (!res.ok || !j || !j.access_token) { const e = new Error((j && (j.error_description || j.error)) || ('HTTP ' + res.status)); e.code = j && j.error; throw e; }
  return j;
}
function odStore(j, prev) {
  const a = { access: j.access_token, refresh: j.refresh_token || (prev && prev.refresh), exp: Date.now() + (num(j.expires_in) || 3600) * 1000 - 90000, name: (prev && prev.name) || '' };
  LS.set('jlp_od_auth', JSON.stringify(a)); odState.needLogin = false; return a;
}
// dipanggil saat boot bila URL membawa ?code= / ?error= dari Microsoft
async function odHandleRedirect() {
  const q = new URLSearchParams(location.search);
  if (!q.has('code') && !q.has('error')) return false;
  const clean = () => history.replaceState(null, '', location.pathname + '#/setelan');
  const pk = jparse(LS.get('jlp_od_pkce'), null); LS.del('jlp_od_pkce');
  if (q.has('error')) { clean(); odState.lastErr = q.get('error_description') || q.get('error'); toast('OneDrive: ' + odState.lastErr.slice(0, 120), { ms: 6000 }); return true; }
  if (!pk || pk.s !== q.get('state')) { clean(); toast('Login OneDrive tidak valid (state). Coba lagi.'); return true; }
  try {
    const j = await odTokenReq({ grant_type: 'authorization_code', code: q.get('code'), redirect_uri: odRedirect(), code_verifier: pk.v });
    const a = odStore(j, null);
    try { const me = await (await fetch(OD.graph + '/me?$select=displayName,userPrincipalName', { headers: { Authorization: 'Bearer ' + a.access } })).json(); a.name = me.userPrincipalName || me.displayName || ''; LS.set('jlp_od_auth', JSON.stringify(a)); } catch (_) {}
    toast('OneDrive terhubung' + (a.name ? ': ' + a.name : ''));
  } catch (e) { toast('Login OneDrive gagal: ' + e.message, { ms: 6000 }); }
  clean(); return true;
}
async function odToken() {
  const a = odAuth(); if (!a || !a.refresh) { odState.needLogin = true; throw new Error('OneDrive belum terhubung'); }
  if (Date.now() < a.exp) return a.access;
  try { const j = await odTokenReq({ grant_type: 'refresh_token', refresh_token: a.refresh }); return odStore(j, a).access; }
  catch (e) {
    if (e.code === 'invalid_grant' || e.code === 'interaction_required') { odState.needLogin = true; const x = new Error('Sesi OneDrive berakhir (batas 24 jam). Masuk ulang.'); x.needLogin = true; throw x; }
    throw e;
  }
}
async function odFetch(path, opts = {}, retry = true) {
  const tok = await odToken();
  const res = await fetch(path.indexOf('http') === 0 ? path : OD.graph + path, { ...opts, headers: { Authorization: 'Bearer ' + tok, ...(opts.headers || {}) } });
  if (res.status === 401 && retry) { const a = odAuth(); if (a) { a.exp = 0; LS.set('jlp_od_auth', JSON.stringify(a)); } return odFetch(path, opts, false); }
  return res;
}
async function odErr(res) { let m = ''; try { const j = await res.json(); m = (j.error && (j.error.message || j.error.code)) || ''; } catch (_) {} return new Error('OneDrive ' + res.status + (m ? ': ' + String(m).slice(0, 140) : '')); }

async function odUpload(name, blob) {
  const base = '/me/drive/special/approot:/' + encodeURIComponent(name) + ':';
  if (blob.size <= OD.simpleMax) {
    const res = await odFetch(base + '/content?@microsoft.graph.conflictBehavior=replace', { method: 'PUT', headers: { 'Content-Type': 'application/octet-stream' }, body: blob });
    if (!res.ok) throw await odErr(res); return res.json();
  }
  const s = await odFetch(base + '/createUploadSession', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ item: { '@microsoft.graph.conflictBehavior': 'replace' } }) });
  if (!s.ok) throw await odErr(s);
  const { uploadUrl } = await s.json(), STEP = 327680 * 10;
  let item = null;
  for (let off = 0; off < blob.size; off += STEP) {
    const end = Math.min(off + STEP, blob.size);
    const r = await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Range': 'bytes ' + off + '-' + (end - 1) + '/' + blob.size }, body: blob.slice(off, end) });
    if (!r.ok && r.status !== 202) throw await odErr(r);
    if (end >= blob.size) item = await r.json();
  }
  return item;
}
async function odList() {
  const res = await odFetch('/me/drive/special/approot/children?$select=id,name,size,lastModifiedDateTime&$top=200');
  if (!res.ok) throw await odErr(res);
  const j = await res.json();
  return (j.value || []).filter(x => x.name && x.name.indexOf(OD.prefix) === 0).sort((a, b) => String(b.name).localeCompare(a.name));
}
async function odDelete(id) { const r = await odFetch('/me/drive/items/' + encodeURIComponent(id), { method: 'DELETE' }); if (!r.ok && r.status !== 404) throw await odErr(r); }
async function odDownload(item) {
  const r = await odFetch('/me/drive/items/' + encodeURIComponent(item.id) + '?select=id,@microsoft.graph.downloadUrl');
  if (!r.ok) throw await odErr(r);
  const url = (await r.json())['@microsoft.graph.downloadUrl'];
  const d = await fetch(url); if (!d.ok) throw await odErr(d); return d.blob();
}

/* ---------- format cadangan (gzip) ---------- */
async function gzipBlob(text) { return new Response(new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'))).blob(); }
async function readBackupJSON(blob) {
  const buf = new Uint8Array(await blob.slice(0, 2).arrayBuffer());
  if (buf[0] === 0x1f && buf[1] === 0x8b) { const t = await new Response(blob.stream().pipeThrough(new DecompressionStream('gzip'))).text(); return JSON.parse(t); }
  return JSON.parse(await blob.text());
}
const stamp = () => { const d = new Date(); return d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + '-' + pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds()); };
const fmtSize = b => b >= 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB';

// Cadangkan ke OneDrive, verifikasi ukuran, lalu rapikan salinan lama. Mengembalikan {name,size,items}.
async function odBackupNow(opts = {}) {
  if (odState.busy) throw new Error('Cadangan OneDrive sedang berjalan');
  odState.busy = true; odState.lastErr = '';
  try {
    opts.onStep && opts.onStep('Menyiapkan data…');
    const data = await makeBackup();
    const blob = await gzipBlob(JSON.stringify(data));
    const name = OD.prefix + stamp() + '.json.gz';
    opts.onStep && opts.onStep('Mengunggah ' + fmtSize(blob.size) + ' ke OneDrive…');
    const item = await odUpload(name, blob);
    if (!item || num(item.size) !== blob.size) throw new Error('Verifikasi gagal: ukuran di OneDrive (' + (item ? item.size : '?') + ') tidak sama dengan yang dikirim (' + blob.size + ').');
    LS.set('jlp_od_last', JSON.stringify({ t: Date.now(), name, size: blob.size }));
    await KV.set('jlp:lastBackup', new Date().toISOString());
    const keep = Math.max(1, num(odOpt('keep', 5)) || 5);
    try { const all = await odList(); for (const old of all.slice(keep)) await odDelete(old.id); } catch (_) {}
    return { name, size: blob.size, id: item.id };
  } catch (e) { odState.lastErr = e.message; throw e; }
  finally { odState.busy = false; }
}
let odAutoT = 0;
async function odAutoBackupTick() {
  if (!odReady() || odOpt('auto', '1') !== '1' || odState.busy || odState.needLogin) return;
  const last = jparse(LS.get('jlp_od_last'), null);
  if (last && Date.now() - last.t < 20 * 3600 * 1000) return;
  try { await odBackupNow(); toast('Cadangan OneDrive dibuat otomatis', { ms: 2500 }); if (state.view === 'setelan') renderSettings(); }
  catch (e) { odState.lastErr = e.message; if (e.needLogin && state.view === 'home') renderHome(); }
}
function odKick(ms) { clearTimeout(odAutoT); odAutoT = setTimeout(odAutoBackupTick, ms == null ? 8000 : ms); }
document.addEventListener('visibilitychange', () => { if (!document.hidden) odKick(4000); });

/* ---------- pemulihan dari OneDrive ---------- */
async function odRestorePicker() {
  let list; try { list = await odList(); } catch (e) { toast(e.message); return; }
  if (!list.length) { toast('Belum ada cadangan di OneDrive'); return; }
  const m = openModal({
    title: 'Pulihkan dari OneDrive',
    body: '<p class="small" style="margin-top:0">Pilih cadangan. Data saat ini akan <b>diganti</b>.</p><div class="list">' + list.map((x, i) => '<button type="button" class="item" data-i="' + i + '"><span class="ic">☁</span><div><b>' + esc(x.name.replace(OD.prefix, '').replace('.json.gz', '')) + '</b><small>' + fmtSize(num(x.size)) + ' · ' + new Date(x.lastModifiedDateTime).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) + '</small></div><span class="go">›</span></button>').join('') + '</div>',
    foot: [{ label: 'Tutup', cls: 'ghost' }]
  });
  m.body.addEventListener('click', async e => {
    const b = e.target.closest('[data-i]'); if (!b) return;
    const it = list[+b.dataset.i]; m.close();
    try { toast('Mengunduh cadangan…', { ms: 2000 }); const blob = await odDownload(it); const file = new File([blob], it.name); await restoreFromFile(file); }
    catch (er) { toast('Gagal memulihkan: ' + er.message, { ms: 5000 }); }
  });
}

/* ---------- kartu pengaturan ---------- */
function odCardHTML() {
  const cfg = odCfg(), a = odAuth(), last = jparse(LS.get('jlp_od_last'), null);
  let h = '<div class="card" style="grid-column:1/-1"><h3>☁ Cadangan OneDrive</h3>';
  if (!cfg || !cfg.clientId) {
    return h + '<p class="small">Simpan cadangan lengkap (termasuk foto asli) ke OneDrive Anda, dan jadikan pengaman saat ruang cloud Supabase hampir penuh. Perlu mendaftarkan aplikasi gratis di Microsoft Entra (panduan: <b>ONEDRIVE.md</b>).</p>' +
      '<label class="f"><span>Application (client) ID</span><input type="text" id="odClient" placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" autocapitalize="off" autocomplete="off"></label>' +
      '<p class="small">Alamat pengalihan (Redirect URI, jenis <b>Single-page application</b>) yang harus didaftarkan: <b>' + esc(odRedirect()) + '</b></p><button type="button" class="btn" id="odSave">Simpan</button></div>';
  }
  if (!a || !a.refresh || odState.needLogin) {
    return h + '<p class="small">' + (odState.needLogin ? 'Sesi OneDrive berakhir (batas 24 jam dari Microsoft). Masuk ulang untuk melanjutkan.' : 'Siap dihubungkan.') + '</p><div class="row"><button type="button" class="btn" id="odLogin">Masuk dengan Microsoft</button><button type="button" class="btn ghost" id="odChange">Ubah Client ID</button></div></div>';
  }
  h += '<p class="small">Terhubung: <b>' + esc(a.name || 'akun Microsoft') + '</b> · Cadangan terakhir: <b>' + (last ? ago(last.t) + ' (' + fmtSize(last.size) + ')' : 'belum ada') + '</b></p>' +
    (odState.lastErr ? '<p class="small" style="color:var(--red)">Terakhir gagal: ' + esc(odState.lastErr) + '</p>' : '') +
    '<div class="row" style="margin-bottom:10px"><button type="button" class="btn" id="odNow">☁ Cadangkan sekarang</button><button type="button" class="btn ghost" id="odRestore">Pulihkan dari OneDrive…</button><button type="button" class="btn ghost" id="odOut">Putuskan</button></div>' +
    '<label class="small" style="display:flex;gap:8px;align-items:center;margin-bottom:6px"><input type="checkbox" id="odAuto" ' + (odOpt('auto', '1') === '1' ? 'checked' : '') + ' style="width:auto;min-height:auto"> Cadangkan otomatis (maksimal sekali per hari, saat aplikasi dibuka)</label>' +
    '<label class="small" style="display:flex;gap:8px;align-items:center">Simpan <input type="number" id="odKeep" min="1" max="30" value="' + num(odOpt('keep', 5)) + '" style="width:72px;min-height:34px;padding:4px 8px"> cadangan terakhir</label>';
  return h + '</div>';
}
function bindOdCard() {
  const on = (id, fn) => { const el = $('#' + id); if (el) el.onclick = fn; };
  on('odSave', () => { const v = $('#odClient').value.trim(); if (!/^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(v)) { toast('Client ID tidak valid (format xxxxxxxx-xxxx-…)'); return; } LS.set('jlp_od_cfg', JSON.stringify({ clientId: v })); renderSettings(); });
  on('odChange', () => { LS.del('jlp_od_cfg'); renderSettings(); });
  on('odLogin', () => odLogin());
  on('odNow', async () => {
    const b = $('#odNow'); b.disabled = true; b.textContent = 'Mencadangkan…';
    try { const r = await odBackupNow({ onStep: s => { b.textContent = s; } }); toast('Tercadangkan: ' + fmtSize(r.size)); }
    catch (e) { toast(e.message, { ms: 5000 }); } renderSettings();
  });
  on('odRestore', () => odRestorePicker());
  on('odOut', async () => { if (!await confirmBox('Putuskan OneDrive dari perangkat ini? File cadangan di OneDrive tidak dihapus.', { title: 'Putuskan OneDrive' })) return; LS.del('jlp_od_auth'); odState.needLogin = false; renderSettings(); });
  const au = $('#odAuto'); if (au) au.onchange = () => LS.set('jlp_od_auto', au.checked ? '1' : '0');
  const kp = $('#odKeep'); if (kp) kp.onchange = () => LS.set('jlp_od_keep', String(Math.min(30, Math.max(1, num(kp.value) || 5))));
}
