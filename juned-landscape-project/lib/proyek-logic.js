/* Logika murni modul Proyek (tanpa DOM) agar bisa diuji: paket pekerjaan, revisi penawaran,
   tambah kurang, perubahan survei, pencocokan harga katalog. Diuji: node test/proyek-logic.test.js */
(function (root) {
  'use strict';
  const round = n => Math.round(Number(n) || 0);

  // Paket pekerjaan: tugas dari template tiap jenis, berurutan dalam satu jenis, jenis berbeda paralel.
  function tasksFromPack(cats, baseId) {
    const out = []; let n = 0;
    cats.forEach(c => {
      let prev = null;
      (c.tpl || []).forEach(name => {
        const id = baseId + (n++);
        const t = { id, t: name, who: '', a: '', b: '', k: c.id, s: 0 };
        if (prev != null) t.dep = prev;
        out.push(t); prev = id;
      });
    });
    return out;
  }

  // Riwayat penawaran: tiap pengiriman = satu revisi bernomor.
  function addRevision(pn, today) {
    pn.rev = pn.rev || [];
    const last = pn.rev[pn.rev.length - 1];
    if (last && last.st === 'Dikirim') last.st = 'Diganti';
    // id unik agar dua perangkat yang sama-sama mengirim revisi tergabung saat sinkron, bukan dianggap satu data
    pn.rev.push({ id: Date.now() * 100 + pn.rev.length, no: pn.rev.length + 1, a: pn.a || 0, d: today, st: pn.st || 'Draf' });
  }
  function syncRevStatus(pn) {
    const r = pn.rev && pn.rev[pn.rev.length - 1];
    if (r) r.st = pn.st;
  }
  function changedSinceSent(pn) {
    const r = pn && pn.rev && pn.rev[pn.rev.length - 1];
    return !!r && pn.st === 'Dikirim' && round(r.a) !== round(pn.a);
  }

  // Pekerjaan tambah kurang (CCO)
  const approved = c => c.st === 'Disetujui';
  function contractValue(p) {
    const pn = p.pn || {};
    if (pn.st !== 'Disetujui') return 0;
    return (pn.a || 0) + (p.cco || []).filter(approved).reduce((a, c) => a + (c.a || 0), 0);
  }
  // Yang disetujui menjadi satu baris RAB (agar opname dan tagihan ikut), yang lain dikeluarkan.
  // Tambahan mulai 0%; pengurangan langsung 100% supaya nilai kontrak turun saat itu juga.
  function syncCco(p) {
    p.rab = p.rab || [];
    (p.cco || []).forEach(c => {
      const i = p.rab.findIndex(x => x.cco === c.id);
      if (!approved(c)) { if (i >= 0) p.rab.splice(i, 1); return; }
      const name = 'Tambah/kurang: ' + c.n;
      if (i >= 0) { p.rab[i].n = name; p.rab[i].h = c.a; return; }
      p.rab.push({ id: Date.now() + Math.floor(Math.random() * 1e6), n: name, k: 'Lainnya', q: 1, u: 'ls', h: c.a, tk: '', j: '', cco: c.id, man: true, pct: c.a < 0 ? 100 : 0 });
    });
  }

  // RAB dibuat dari survei; kalau total survei bergeser sesudahnya, RAB belum ikut.
  function svDrift(p, s) {
    if (!p || p.rbsv == null || !s) return null;
    const base = round(p.rbsv), now = round(s.grand);
    return Math.abs(now - base) < 1 ? null : { base, now, diff: now - base };
  }

  // Harga katalog untuk item survei yang belum berharga. Kecocokan per kata; seri = dilewati.
  // Kata yang tidak membedakan barang: "Batu alam" saja jangan dipakai untuk nat atau coating batu alam.
  const GENERIC = new Set(['batu', 'alam', 'pasang', 'pasangan', 'material', 'bahan', 'jasa']);
  const words = s => String(s || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(w => w.length > 2);
  function matchCatalog(items, catalog) {
    const out = [];
    items.forEach(it => {
      if ((it.mat || 0) > 0 || (it.lab || 0) > 0) return;
      const w = words(it.n).filter(x => x !== 'pasang' && x !== 'pasangan'); if (!w.length) return;
      let best = [], bestScore = 0;
      catalog.forEach(c => {
        const cw = words(c.name); if (!cw.length) return;
        if (!cw.every(x => w.includes(x))) return;                          // semua kata katalog ada di nama item
        const distinct = cw.some(x => !GENERIC.has(x));
        if (!distinct && cw.length / w.length < 0.6) return;                // nama umum harus hampir sama dengan item
        const score = cw.length * 10 + (cw.length === w.length ? 1 : 0);
        if (score > bestScore) { best = [c]; bestScore = score; } else if (score === bestScore) best.push(c);
      });
      if (best.length === 1) out.push({ id: it.id, cat: best[0].name, mat: round(best[0].price), lab: round(best[0].labor) });
    });
    return out;
  }

  root.ProyekLogic = { tasksFromPack, addRevision, syncRevStatus, changedSinceSent, contractValue, syncCco, svDrift, matchCatalog };
})(typeof window !== 'undefined' ? window : globalThis);
