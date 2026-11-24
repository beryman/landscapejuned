/* Juned Landscape Project - pengaturan Gemini di Pengaturan utama (dipakai Katalog dan tool sketsa).
   Kunci ada di KV jlp:sync:gemini: ikut sinkron ke akun yang sedang masuk, tidak masuk file cadangan,
   tidak dibawa ke akun lain, dan dihapus dari perangkat saat keluar (diunduh lagi saat masuk). */
'use strict';

async function gmCfg() {
  let c = jparse(await KV.get(SK.gem), null);
  if (!c) {   // kunci dari versi lama yang hanya ada di perangkat
    const k = String(LS.get('jlp_gemini_key') || '').trim();
    if (k) { c = { key: k, models: LS.get('jlp_gemini_models') || '' }; await KV.set(SK.gem, JSON.stringify(c)); LS.del('jlp_gemini_key'); LS.del('jlp_gemini_models'); }
  }
  return c && typeof c === 'object' ? { key: String(c.key || '').trim(), models: String(c.models || '') } : { key: '', models: '' };
}
const gmModels = c => { const m = c.models.split(',').map(x => x.trim()).filter(Boolean); return m.length ? m : GeminiPlant.MODELS; };

// Katalog menyimpan salinan KV di memorinya: muat ulang agar kunci baru langsung terpakai.
async function gmWrite(cfg) {
  if (cfg) await KV.set(SK.gem, JSON.stringify(cfg)); else await KV.del(SK.gem);
  if (MODS.tanaman.frame) unloadFrame('tanaman');
  syncKick(500);
}

// Keluar atau ganti akun: kunci akun lama tidak boleh tertinggal di perangkat atau terbawa ke akun lain.
async function gmForgetLocal() {
  await KV.del(SK.gem);
  if (!sync.st) await loadSyncState();
  if (sync.st.base['app:gemini']) { delete sync.st.base['app:gemini']; sync.st.cursor = null; await saveSyncState(); }   // masuk lagi: diunduh ulang dari akun
  if (MODS.tanaman.frame) unloadFrame('tanaman');
}

function gmCardHTML(c) {
  const where = syncConfigured() && syncLoggedIn()
    ? 'Tersimpan di akun <b>' + esc(sync.auth.email || 'Anda') + '</b>, jadi perangkat lain yang masuk dengan akun ini ikut memakainya.'
    : 'Belum masuk: kunci hanya tersimpan di perangkat ini. Masuk agar kunci tersimpan di akun Anda.';
  return '<div class="card" id="gmCard"><h3>Gemini</h3>' +
    '<p class="small">Dipakai untuk mengenali tanaman dari foto (Katalog) dan membaca sketsa berukuran (Survei). ' + where + ' Kunci tidak masuk file cadangan.</p>' +
    '<p class="small"><b>' + (c.key ? 'Kunci tersimpan (berakhir …' + esc(c.key.slice(-4)) + ').' : 'Belum ada kunci.') + '</b></p>' +
    '<label class="f"><span>Kunci API Gemini</span><input type="password" id="gmKey" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="' + (c.key ? 'Kosongkan bila tidak diganti' : 'AIza… (gratis dari aistudio.google.com/apikey)') + '"></label>' +
    '<label class="f"><span>Model (pisahkan koma bila ingin cadangan)</span><input type="text" id="gmModels" autocomplete="off" autocapitalize="off" spellcheck="false" value="' + esc(c.models) + '" placeholder="gemini-3.6-flash, gemini-3.5-flash"></label>' +
    '<div class="row"><button type="button" class="btn" id="gmSave">Simpan</button><button type="button" class="btn ghost" id="gmTest"' + (c.key ? '' : ' disabled') + '>Tes koneksi</button>' + (c.key ? '<button type="button" class="btn ghost" id="gmClear">Hapus kunci</button>' : '') + '</div>' +
    '<div class="small" id="gmMsg" role="status" aria-live="polite" style="margin-top:8px"></div></div>';
}

function bindGmCard() {
  const on = (id, fn) => { const el = $('#' + id); if (el) el.onclick = fn; };
  const msg = t => { const m = $('#gmMsg'); if (m) m.textContent = t; };
  on('gmSave', async () => {
    const key = $('#gmKey').value.trim(), models = $('#gmModels').value.trim(), cur = await gmCfg();
    const cfg = { key: key || cur.key, models };
    await gmWrite(cfg.key || cfg.models ? cfg : null);
    toast(key ? (syncLoggedIn() ? 'Kunci Gemini disimpan ke akun Anda' : 'Kunci Gemini disimpan di perangkat ini') : 'Pengaturan model disimpan');
    renderSettings();
  });
  on('gmTest', async () => {
    const c = await gmCfg(), b = $('#gmTest');
    b.disabled = true; msg('Menguji koneksi…');
    const t0 = Date.now();
    try { const r = await GeminiPlant.test({ key: c.key, models: gmModels(c) }); msg('Tersambung. Model yang bekerja: ' + r.model + ' (' + ((Date.now() - t0) / 1000).toFixed(1) + ' dtk).'); }
    catch (e) { msg('Gagal: ' + e.message); }
    finally { b.disabled = false; }
  });
  on('gmClear', async () => {
    if (!await confirmBox('Hapus kunci Gemini?' + (syncLoggedIn() ? ' Kunci juga terhapus dari akun Anda dan perangkat lain.' : ''), { title: 'Hapus kunci Gemini', ok: 'Hapus', danger: true })) return;
    await gmWrite(null); toast('Kunci Gemini dihapus'); renderSettings();
  });
}
