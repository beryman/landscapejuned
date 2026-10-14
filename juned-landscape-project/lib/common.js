/* Juned Landscape Project - helper bersama untuk modul (Proyek, Tanaman, Keuangan). */
(function () {
  'use strict';
  var JLP = window.JLP = window.JLP || {};
  var inFrame = false;
  try { inFrame = window.parent !== window; } catch (_) { inFrame = true; }
  JLP.embed = inFrame || /[?&]embed=1/.test(location.search);
  if (JLP.embed) document.documentElement.classList.add('embed');

  JLP.shell = function () { try { return window.parent !== window ? (window.parent.JLPShell || null) : null; } catch (_) { return null; } };

  JLP.isStandalone = function () {
    try { return window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches; } catch (_) { return false; }
  };

  // Simpan/bagikan file. Di PWA iOS (layar utama) unduhan blob sering gagal -> pakai lembar Bagikan.
  JLP.saveBlob = async function (blob, filename) {
    try {
      if (JLP.isStandalone() && navigator.canShare) {
        var f = new File([blob], filename, { type: blob.type || 'application/octet-stream' });
        if (navigator.canShare({ files: [f] })) { await navigator.share({ files: [f], title: filename }); return true; }
      }
    } catch (e) { if (e && e.name === 'AbortError') return false; }
    var url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
    return true;
  };

  var xlsxP = null;
  JLP.loadXLSX = function () {
    if (window.XLSX) return Promise.resolve(window.XLSX);
    if (xlsxP) return xlsxP;
    xlsxP = new Promise(function (res, rej) {
      var s = document.createElement('script');
      s.src = '../lib/xlsx.full.min.js';
      s.onload = function () { res(window.XLSX); };
      s.onerror = function () { xlsxP = null; rej(new Error('Pustaka Excel gagal dimuat')); };
      document.head.appendChild(s);
    });
    return xlsxP;
  };

  JLP.flush = function () { return window.KV ? KV.flush() : Promise.resolve(); };
  JLP.markReady = function () {
    window.__jlpReady = true;
    try { var sh = JLP.shell(); if (sh && sh.moduleReady) sh.moduleReady(window); } catch (_) {}
  };

  document.addEventListener('visibilitychange', function () { if (document.hidden) JLP.flush(); });
  window.addEventListener('pagehide', function () { JLP.flush(); });
})();
