/* Juned Landscape Project - penyimpanan bersama (IndexedDB) dengan cache sinkron.
   Menggantikan localStorage (batas ~5 MB) untuk data Proyek & Tanaman, termasuk foto.
   API sinkron (cache) : KV.ls.getItem / setItem / removeItem   (dipakai modul lama)
   API tulis-langsung  : KV.get / set / del / entries / replaceAll / flush (dipakai shell)  */
(function () {
  'use strict';
  var DBN = 'JLP_KV', ST = 'kv';
  var PREFIXES = ['tamankerja:', 'tk:', 'plantbase'];
  var cache = new Map(), db = null, pending = new Set();
  var KV = window.KV = { persistent: true, onError: null, usingMemory: false };

  function open() {
    return new Promise(function (res, rej) {
      if (!window.indexedDB) return rej(new Error('IndexedDB tidak tersedia'));
      var r = indexedDB.open(DBN, 1);
      r.onupgradeneeded = function () { if (!r.result.objectStoreNames.contains(ST)) r.result.createObjectStore(ST); };
      r.onsuccess = function () { res(r.result); };
      r.onerror = function () { rej(r.error); };
      r.onblocked = function () { rej(new Error('Database sedang dipakai')); };
    });
  }
  function track(p) { pending.add(p); var d = function () { pending.delete(p); }; p.then(d, d); return p; }
  function fail(k, e) { KV.persistent = false; if (KV.onError) { try { KV.onError(k, e); } catch (_) {} } }

  function idbPut(k, v) {
    if (!db) return Promise.resolve();
    return track(new Promise(function (res, rej) {
      try {
        var t = db.transaction(ST, 'readwrite');
        t.objectStore(ST).put(v, k);
        t.oncomplete = function () { res(); };
        t.onerror = t.onabort = function () { rej(t.error || new Error('Gagal menulis')); };
      } catch (e) { rej(e); }
    }).catch(function (e) { fail(k, e); }));
  }
  function idbDel(k) {
    if (!db) return Promise.resolve();
    return track(new Promise(function (res, rej) {
      try {
        var t = db.transaction(ST, 'readwrite');
        t.objectStore(ST).delete(k);
        t.oncomplete = function () { res(); };
        t.onerror = t.onabort = function () { rej(t.error); };
      } catch (e) { rej(e); }
    }).catch(function (e) { fail(k, e); }));
  }
  function readAll() {
    return new Promise(function (res, rej) {
      var out = {}, t = db.transaction(ST, 'readonly'), c = t.objectStore(ST).openCursor();
      c.onsuccess = function () { var cur = c.result; if (cur) { out[cur.key] = cur.value; cur.continue(); } };
      t.oncomplete = function () { res(out); };
      t.onerror = t.onabort = function () { rej(t.error); };
    });
  }

  KV.ls = {
    getItem: function (k) { return cache.has(k) ? cache.get(k) : null; },
    setItem: function (k, v) { v = String(v); cache.set(k, v); idbPut(k, v); },
    removeItem: function (k) { cache.delete(k); idbDel(k); }
  };

  // ---- API tulis/baca langsung (selalu lewat IndexedDB, bukan cache) ----
  KV.get = function (k) {
    if (!db) return Promise.resolve(cache.has(k) ? cache.get(k) : null);
    return KV.flush().then(function () {
      return new Promise(function (res, rej) {
        var r = db.transaction(ST, 'readonly').objectStore(ST).get(k);
        r.onsuccess = function () { res(r.result === undefined ? null : r.result); };
        r.onerror = function () { rej(r.error); };
      });
    });
  };
  KV.set = function (k, v) { v = String(v); cache.set(k, v); return idbPut(k, v); };
  KV.del = function (k) { cache.delete(k); return idbDel(k); };
  KV.entries = function () { return KV.flush().then(function () { return db ? readAll() : (function () { var o = {}; cache.forEach(function (v, k) { o[k] = v; }); return o; })(); }); };
  KV.replaceAll = function (obj) {
    cache.clear();
    Object.keys(obj).forEach(function (k) { cache.set(k, String(obj[k])); });
    if (!db) return Promise.resolve();
    return track(new Promise(function (res, rej) {
      var t = db.transaction(ST, 'readwrite'), s = t.objectStore(ST);
      s.clear();
      Object.keys(obj).forEach(function (k) { s.put(String(obj[k]), k); });
      t.oncomplete = function () { res(); };
      t.onerror = t.onabort = function () { rej(t.error || new Error('Gagal menulis')); };
    }));
  };
  KV.flush = function () { return Promise.all(Array.from(pending)).then(function () {}); };

  // ---- inisialisasi + migrasi satu kali dari localStorage (bila origin sama dengan aplikasi lama) ----
  KV.ready = open().then(function (d) {
    db = d;
    db.onversionchange = function () { db.close(); };
    return readAll();
  }).then(function (all) {
    Object.keys(all).forEach(function (k) { cache.set(k, all[k]); });
    if (!cache.has('__migrated_ls')) {
      try {
        for (var i = 0; i < localStorage.length; i++) {
          var k = localStorage.key(i);
          if (!PREFIXES.some(function (p) { return k.indexOf(p) === 0; })) continue;
          if (!cache.has(k)) { var v = localStorage.getItem(k); cache.set(k, v); idbPut(k, v); }
        }
      } catch (_) {}
      cache.set('__migrated_ls', '1'); idbPut('__migrated_ls', '1');
    }
  }).catch(function (e) {
    // IndexedDB diblokir (mis. mode privat): tetap jalan dengan memori, beri tahu lewat persistent=false
    KV.usingMemory = true; KV.persistent = false; db = null;
    console.warn('KV memori saja:', e && e.message);
  });
})();
