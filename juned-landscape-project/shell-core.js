/* Juned Landscape Project - shell: utilitas, penyimpanan, navigasi, iframe modul, PWA */
'use strict';
const APP_VERSION = '1.8.1';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = v => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const pad = n => String(n).padStart(2, '0');
const rp = n => { const v = Math.round(num(n)); return (v < 0 ? '-' : '') + 'Rp ' + Math.abs(v).toLocaleString('id-ID'); };
const rpc = n => {
  const v = Math.round(num(n)), a = Math.abs(v), s = v < 0 ? '-' : '';
  if (a >= 1e9) return s + 'Rp ' + (a / 1e9).toLocaleString('id-ID', { maximumFractionDigits: 2 }) + ' M';
  if (a >= 1e7) return s + 'Rp ' + (a / 1e6).toLocaleString('id-ID', { maximumFractionDigits: 1 }) + ' jt';
  return rp(v);
};
const todayISO = () => { const d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
const fdate = d => { if (!d) return '-'; const x = new Date(String(d).slice(0, 10) + 'T00:00:00'); return isNaN(x) ? '-' : x.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ---------- ikon ---------- */
const IC = {
  home: '<svg viewBox="0 0 24 24"><path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v9.5h13V10"/><path d="M10 19.5v-5h4v5"/></svg>',
  proyek: '<svg viewBox="0 0 24 24"><rect x="5" y="4.5" width="14" height="16.5" rx="2"/><path d="M9 4.5V3h6v1.5"/><path d="m9 13 2 2 4-4.5"/></svg>',
  tanaman: '<svg viewBox="0 0 24 24"><path d="M12 21v-8"/><path d="M12 13c0-4-3-6.5-7.5-6.5C4.5 10.5 7.5 13 12 13Z"/><path d="M12 11c0-3.5 2.5-6 7-6 0 4-2.5 6-7 6Z"/></svg>',
  survei: '<svg viewBox="0 0 24 24"><rect x="3.5" y="3.5" width="17" height="17" rx="2.5"/><path d="M3.5 9.5h17M9.5 3.5v17" opacity=".45"/><path d="m8 16 2.5-3 2 2 3.5-5"/></svg>',
  setelan: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7"/></svg>',
  cloud: '<svg viewBox="0 0 24 24"><path d="M7 18.5h10a4 4 0 0 0 .6-7.95A5.5 5.5 0 0 0 7.2 9.4 4.6 4.6 0 0 0 7 18.5Z"/></svg>',
  install: '<svg viewBox="0 0 24 24"><path d="M12 3.5v11"/><path d="m7.5 10.5 4.5 4.5 4.5-4.5"/><path d="M4.5 19.5h15"/></svg>'
};
const NAV = [
  { id: 'home', label: 'Beranda' }, { id: 'proyek', label: 'Proyek' }, { id: 'tanaman', label: 'Katalog' }, { id: 'setelan', label: 'Pengaturan' }
];
const VIEWS = NAV.map(n => n.id).concat('survei');   // Survei dibuka dari dalam Proyek, tidak ada di menu

/* ---------- toast ---------- */
let toastT = 0;
function toast(msg, o = {}) {
  const t = $('#toast');
  t.innerHTML = '<span>' + esc(msg) + '</span>' + (o.action ? '<button type="button">' + esc(o.action) + '</button>' : '');
  if (o.action) $('button', t).onclick = () => { t.classList.remove('show'); o.onAction && o.onAction(); };
  t.classList.add('show');
  clearTimeout(toastT);
  toastT = setTimeout(() => t.classList.remove('show'), o.ms || 3000);
}

/* ---------- modal ---------- */
function openModal({ title, body, foot = [], wide = false, onClose }) {
  const back = document.createElement('div');
  back.className = 'mback';
  back.innerHTML = '<div class="mbox' + (wide ? ' wide' : '') + '" role="dialog" aria-modal="true" aria-label="' + esc(title) + '"><div class="mhead"><h3>' + esc(title) + '</h3><button type="button" class="x" aria-label="Tutup">✕</button></div><div class="mbody"></div><div class="mfoot"></div></div>';
  const mb = $('.mbody', back), mf = $('.mfoot', back);
  if (typeof body === 'string') mb.innerHTML = body; else if (body) mb.appendChild(body);
  let closed = false;
  const m = {
    el: back, body: mb, foot: mf,
    close() {
      if (closed) return; closed = true;
      document.removeEventListener('keydown', onKey);
      back.remove();
      if (onClose) onClose();
    },
    setFoot(list) {
      mf.innerHTML = '';
      list.forEach(b => {
        if (b.spacer) { const s = document.createElement('span'); s.className = 'sp'; s.innerHTML = b.html || ''; mf.appendChild(s); return; }
        const el = document.createElement('button');
        el.type = 'button'; el.className = 'btn ' + (b.cls || ''); el.textContent = b.label; if (b.id) el.id = b.id;
        el.onclick = async () => { const r = b.onClick ? await b.onClick(m, el) : undefined; if (r !== false) m.close(); };
        mf.appendChild(el);
      });
      mf.style.display = list.length ? '' : 'none';
    }
  };
  function onKey(e) { if (e.key === 'Escape') m.close(); }
  document.addEventListener('keydown', onKey);
  $('.x', back).onclick = () => m.close();
  back.addEventListener('mousedown', e => { if (e.target === back) m.close(); });
  m.setFoot(foot);
  $('#overlay').appendChild(back);
  return m;
}
function confirmBox(msg, { title = 'Konfirmasi', ok = 'Lanjutkan', cancel = 'Batal', danger = false } = {}) {
  return new Promise(res => {
    let done = false; const fin = v => { if (!done) { done = true; res(v); } };
    openModal({
      title, body: '<p style="margin:0;white-space:pre-line">' + esc(msg) + '</p>',
      foot: [{ label: cancel, cls: 'ghost', onClick: () => fin(false) }, { label: ok, cls: danger ? 'danger' : '', onClick: () => fin(true) }],
      onClose: () => fin(false)
    });
  });
}

/* ---------- akses penyimpanan ---------- */
async function kvJSON(key, def) { try { const v = await KV.get(key); return v ? JSON.parse(v) : def; } catch (_) { return def; } }

const FIN_STORES = ['wallets', 'txs', 'debts', 'budgets', 'receipts', 'categories', 'recurring', 'settings'];
let _fdb = null;
function finOpen() {
  if (_fdb) return _fdb;
  _fdb = new Promise((res, rej) => {
    const r = indexedDB.open('SepranV4DB', 7);
    r.onupgradeneeded = e => { const d = e.target.result; FIN_STORES.forEach(n => { if (!d.objectStoreNames.contains(n)) d.createObjectStore(n, { keyPath: 'id' }); }); };
    r.onsuccess = () => { const d = r.result; d.onversionchange = () => { d.close(); _fdb = null; }; res(d); };
    r.onerror = () => { _fdb = null; rej(r.error); };
    r.onblocked = () => { _fdb = null; rej(new Error('Database keuangan sedang dipakai')); };
  });
  return _fdb;
}
async function finAll(s) { const d = await finOpen(); return new Promise((res, rej) => { const r = d.transaction(s, 'readonly').objectStore(s).getAll(); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }
async function finTx(stores, fn) {
  const d = await finOpen();
  return new Promise((res, rej) => {
    const t = d.transaction(stores, 'readwrite'); fn(t);
    t.oncomplete = () => res(); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error || new Error('Dibatalkan'));
  });
}

async function readTK() {
  await flushFrame('proyek');
  const raw = await kvJSON('tamankerja:v1', []);
  const summary = await kvJSON('jlp:summary:proyek', null);
  return { projects: Array.isArray(raw) ? raw : [], summary };
}
async function readPB() {
  await flushFrame('tanaman');
  const arr = v => Array.isArray(v) ? v : (v && Array.isArray(v.plants) ? v.plants : []);
  const plants = arr(await kvJSON('plantbase_landscape_v1', [])).filter(p => p && !p._deleted && (p.local || p.name) && !(/^demo-[0-9]+$/.test(p.id) && p.updatedAt === p.created));
  const mats = await kvJSON('plantbase_materials_v18', []), rabs = await kvJSON('plantbase_rabs_v18', []);
  return { plants, materials: Array.isArray(mats) ? mats.filter(m => m && m.name) : [], rabs: Array.isArray(rabs) ? rabs.filter(r => r && Array.isArray(r.items)) : [] };
}

/* ---------- state & iframe modul ---------- */
const state = { view: 'home', deferredPrompt: null, swReg: null };
const MODS = {
  proyek: { src: 'apps/proyek.html?embed=1', title: 'Proyek', frame: null, promise: null, resolve: null },
  survei: { src: 'apps/survei/index.html?embed=1', title: 'Survei Lapangan', frame: null, promise: null, resolve: null },
  tanaman: { src: 'apps/tanaman.html?embed=1', title: 'Katalog Tanaman dan Material', frame: null, promise: null, resolve: null }
};
function loadFrame(name) {
  const m = MODS[name];
  if (m.promise) return m.promise;
  const f = document.createElement('iframe');
  f.className = 'view'; f.id = 'v-' + name; f.title = m.title;
  f.setAttribute('allow', 'clipboard-write; web-share; fullscreen');
  m.frame = f;
  m.promise = new Promise(res => { m.resolve = res; });
  f.addEventListener('load', () => setTimeout(() => { if (m.frame === f && m.resolve) m.resolve(f.contentWindow); }, 5000)); // cadangan bila modul tak memanggil markReady
  f.src = m.src;
  if (state.view === name) f.classList.add('on');
  $('#stage').appendChild(f);
  return m.promise;
}
function unloadFrame(name) {
  const m = MODS[name];
  if (m.frame) m.frame.remove();
  m.frame = null; m.promise = null; m.resolve = null;
}
function frameWin(name) { const m = MODS[name]; return m.frame ? m.frame.contentWindow : null; }
async function flushFrame(name) {
  try { const w = frameWin(name); if (w && w.JLP && w.JLP.flush) await w.JLP.flush(); } catch (_) {}
  await KV.flush();
}
async function flushAll() { for (const n of Object.keys(MODS)) await flushFrame(n); }

/* ---------- navigasi ---------- */
function updateNav() {
  $$('.nb[data-v]').forEach(b => {
    const on = b.dataset.v === (state.view === 'survei' ? 'proyek' : state.view);
    b.classList.toggle('on', on);
    if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  });
}
function parseHash() { const m = /^#\/([a-z]+)/.exec(location.hash); return m && VIEWS.includes(m[1]) ? m[1] : 'home'; }
function setView(name, replace) {
  if (!VIEWS.includes(name)) name = 'home';
  const prev = state.view; state.view = name;
  if (MODS[name]) loadFrame(name);
  $$('#stage > .view').forEach(v => v.classList.toggle('on', v.id === 'v-' + name));
  $('#stage').classList.toggle('svmode', name === 'survei');
  if (name === 'survei') {
    const s = state.sv;
    $('#svText').innerHTML = s ? '<b>' + esc(s.project) + '</b><small>Survei ' + esc(s.code || s.name) + '</small>' : '<b>Survei</b><small>Semua lembar survei</small>';
    // Juga berjalan setelah modul dimuat ulang oleh sinkron, agar tetap di survei yang sama.
    loadFrame('survei').then(w => { if (state.view === 'survei' && state.sv === s && w.JLP && w.JLP.openSurvey) { const pk = s && s.pack || ''; if (s) s.pack = ''; return w.JLP.openSurvey(s ? s.id : '', pk); } }).catch(e => console.error(e));
  }
  updateNav();
  if (prev !== name && MODS[prev]) flushFrame(prev);
  if (prev !== name && typeof syncOnViewChange === 'function') syncOnViewChange(prev);
  if (name === 'home') renderHome();
  else if (name === 'setelan') renderSettings();
  else if (name === 'proyek') { const w = frameWin('proyek'); try { if (w && w.JLP && w.JLP.onShow) w.JLP.onShow(); } catch (_) {} }
  const h = '#/' + name;
  if (location.hash !== h) { try { history[replace ? 'replaceState' : 'pushState'](null, '', h); } catch (_) { location.hash = h; } }
  const sc = $('#v-' + name); if (sc && !MODS[name]) sc.scrollTop = 0;
}
function go(name, fn) {
  setView(name);
  if (MODS[name] && fn) return loadFrame(name).then(w => { try { return fn(w); } catch (e) { console.error(e); } });
  return Promise.resolve();
}
function buildNav() {
  $('#railNav').innerHTML = NAV.map(n => '<button type="button" class="nb" data-v="' + n.id + '">' + IC[n.id] + '<span>' + n.label + '</span></button>').join('');
  $('#tabbar').innerHTML = $('#railNav').innerHTML;
  $('#railInstall').innerHTML = IC.install + '<span>Pasang</span>';
  $('#railSync').innerHTML = IC.cloud + '<span>Sinkron</span>'; $('#railSync').onclick = () => setView('setelan');
  document.addEventListener('click', e => {
    const b = e.target.closest('.nb[data-v]'); if (!b) return;
    setView(b.dataset.v);
  });
  $('#svBack').onclick = () => setView('proyek');
  $('#railInstall').onclick = () => doInstall();
  addEventListener('hashchange', () => { const n = parseHash(); if (n !== state.view) setView(n); });
}

/* ---------- PWA: service worker, pembaruan, pemasangan ---------- */
let hadController = false;
function registerSW() {
  if (!('serviceWorker' in navigator) || !/^https?:$/.test(location.protocol)) return;
  hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('sw.js').then(reg => {
    state.swReg = reg;
    if (reg.waiting && navigator.serviceWorker.controller) offerUpdate(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const nw = reg.installing;
      if (nw) nw.addEventListener('statechange', () => { if (nw.state === 'installed' && navigator.serviceWorker.controller) offerUpdate(nw); });
    });
  }).catch(() => {});
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController) { hadController = true; return; }
    if (reloading) return; reloading = true;
    flushAll().then(() => location.reload());
  });
}
function offerUpdate(w) { toast('Versi baru tersedia', { action: 'Perbarui', ms: 15000, onAction: () => flushAll().then(() => w.postMessage({ type: 'SKIP_WAITING' })) }); }

function platform() {
  const ua = navigator.userAgent, touch = navigator.maxTouchPoints > 1;
  const ios = /iPhone|iPod/.test(ua), ipad = /iPad/.test(ua) || (/Macintosh/.test(ua) && touch);
  const android = /Android/.test(ua), mac = /Macintosh/.test(ua) && !touch, win = /Windows/.test(ua);
  return { id: ios ? 'iphone' : ipad ? 'ipad' : android ? 'android' : mac ? 'mac' : win ? 'windows' : 'lain' };
}
function installHelpHTML() {
  const cur = platform().id;
  const sec = (id, title, steps) => '<details class="dd"' + (cur === id || (id === 'ios' && (cur === 'iphone' || cur === 'ipad')) ? ' open' : '') + '><summary>' + title + '</summary><ol>' + steps.map(s => '<li>' + s + '</li>').join('') + '</ol></details>';
  return sec('ios', '📱 iPhone &amp; iPad (Safari)', ['Buka alamat aplikasi ini di <b>Safari</b>.', 'Ketuk tombol <b>Bagikan</b> (kotak dengan panah ke atas).', 'Pilih <b>Tambahkan ke Layar Utama</b>, lalu <b>Tambah</b>.', 'Buka lewat ikon di layar utama agar tampil layar penuh dan data tidak dihapus otomatis oleh Safari.']) +
    sec('android', '🤖 Android (Chrome)', ['Buka alamat aplikasi ini di <b>Chrome</b>.', 'Ketuk menu <b>⋮</b> → <b>Instal aplikasi</b> (atau <b>Tambahkan ke layar utama</b>).', 'Konfirmasi dengan <b>Instal</b>.']) +
    sec('mac', '💻 Mac', ['<b>Safari 17+ (macOS Sonoma atau lebih baru):</b> menu <b>Berkas → Tambahkan ke Dock</b>.', '<b>Chrome / Edge:</b> klik ikon pasang di ujung kanan bilah alamat, atau menu <b>⋮ → Transmisikan, simpan, dan bagikan → Instal halaman sebagai aplikasi</b>.']) +
    sec('windows', '🖥️ Windows / Chromebook', ['Di Chrome atau Edge, klik ikon <b>Pasang</b> di bilah alamat (atau menu <b>⋮ → Instal</b>).']) +
    '<p class="small" style="margin:10px 0 0">Tanpa memasang pun, aplikasi tetap bisa dipakai langsung dari browser di semua perangkat.</p>';
}
function showInstallHelp() { openModal({ title: 'Pasang aplikasi', body: installHelpHTML(), foot: [{ label: 'Tutup', cls: 'ghost' }] }); }
async function doInstall() {
  if (state.deferredPrompt) {
    try { state.deferredPrompt.prompt(); await state.deferredPrompt.userChoice; } catch (_) {}
    state.deferredPrompt = null; updateInstallUI();
  } else showInstallHelp();
}
function updateInstallUI() { const b = $('#railInstall'); if (b) b.hidden = JLP.isStandalone(); if (state.view === 'setelan') renderSettings(); }
addEventListener('beforeinstallprompt', e => { e.preventDefault(); state.deferredPrompt = e; updateInstallUI(); });
addEventListener('appinstalled', () => { state.deferredPrompt = null; updateInstallUI(); toast('Aplikasi berhasil dipasang'); });
