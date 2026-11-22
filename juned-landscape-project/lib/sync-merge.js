/* Gabung tiga arah untuk satu data (proyek/survei): leluhur bersama, versi lokal, versi server.
   Bagian yang diubah di satu sisi diambil; bila sisi yang sama bentrok, lokal menang dan nilai lain dicatat. */
(function (root) {
  'use strict';
  const SECTION = { tasks: 'Tugas', rab: 'RAB', inv: 'Tagihan', rep: 'Laporan', mat: 'Material', vol: 'Volume', wk: 'Tukang', docs: 'Dokumen', sop: 'SOP', msgs: 'Chat', pn: 'Penawaran', att: 'Absen', areas: 'Area', fields: 'Bidang', items: 'Item', materials: 'Material' };
  const FIELD = { q: 'jumlah', h: 'harga', u: 'satuan', n: 'nama', st: 'status', no: 'nomor', name: 'nama', client: 'klien', who: 'penanggung jawab', priceMaterial: 'harga material', priceLabor: 'harga upah' };
  const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
  const hasId = v => isObj(v) && v.id != null;
  const prim = v => v === null || typeof v !== 'object';
  function canon(v) {
    if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']';
    if (isObj(v)) return '{' + Object.keys(v).filter(k => v[k] !== undefined).sort().map(k => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}';
    return v === undefined ? 'undefined' : JSON.stringify(v);
  }
  const eq = (a, b) => canon(a) === canon(b);
  const itemName = x => String(x.n || x.t || x.name || x.description || x.id);
  const keyLabel = (label, k) => label ? label + (FIELD[k] ? ' · ' + FIELD[k] : '') : (SECTION[k] || FIELD[k] || k);

  function merge3(base, local, remote) {
    const conflicts = [];
    const clash = (l, r, path, label) => { conflicts.push({ path, label: label || 'Data', other: r }); return l; };

    function mergeValue(b, l, r, path, label) {
      if (eq(l, r)) return l;
      if (eq(b, l)) return r;
      if (eq(b, r)) return l;
      if (Array.isArray(l) && Array.isArray(r)) return mergeArray(Array.isArray(b) ? b : [], l, r, path, label);
      if (isObj(l) && isObj(r)) return mergeObject(isObj(b) ? b : {}, l, r, path, label);
      return clash(l, r, path, label);
    }
    function mergeObject(b, l, r, path, label) {
      const out = {};
      new Set([...Object.keys(r), ...Object.keys(l)]).forEach(k => {
        let v;
        if (k === 'updatedAt' && typeof l[k] === 'string' && typeof r[k] === 'string') v = l[k] > r[k] ? l[k] : r[k];
        else if ((k === 'log' || k === 'history') && Array.isArray(l[k]) && Array.isArray(r[k])) v = mergeJournal(k, b[k] || [], l[k], r[k]);
        else v = mergeValue(b[k], l[k], r[k], path.concat(k), keyLabel(label, k));
        if (v !== undefined) out[k] = v;
      });
      return out;
    }
    // Catatan hanya bertambah: gabungkan keduanya, tidak ada konflik.
    function mergeJournal(k, b, l, r) {
      const seen = new Set(), out = [];
      r.concat(l).forEach(x => { const c = canon(x); if (!seen.has(c)) { seen.add(c); out.push(x); } });
      return k === 'log' ? out.sort((x, y) => (y.ts || 0) - (x.ts || 0)).slice(0, 200) : out;
    }
    function mergeArray(b, l, r, path, label) {
      if (l.every(hasId) && r.every(hasId) && b.every(hasId)) return mergeById(b, l, r, path, label);
      if (l.every(prim) && r.every(prim) && b.every(prim)) {
        const bs = new Set(b), ls = new Set(l), rs = new Set(r);
        return r.filter(x => ls.has(x) || !bs.has(x)).concat(l.filter(x => !rs.has(x) && !bs.has(x)));
      }
      if (b.length === l.length && b.length === r.length) return l.map((x, i) => mergeValue(b[i], x, r[i], path.concat(i), label));
      return clash(l, r, path, label);
    }
    function mergeById(b, l, r, path, label) {
      const map = a => new Map(a.map(x => [String(x.id), x]));
      const bm = map(b), lm = map(l), rm = map(r), out = [];
      new Set([...rm.keys(), ...lm.keys()]).forEach(id => {
        const B = bm.get(id), L = lm.get(id), R = rm.get(id), step = path.concat({ id });
        const name = (label ? label + ': ' : '') + itemName(L || R);
        if (L && R) { out.push(mergeValue(B, L, R, step, name)); return; }
        const kept = L || R;
        if (!B) { out.push(kept); return; }
        if (eq(B, kept)) return;   // sisi lain menghapus, sisi ini tidak mengubah
        conflicts.push({ path: step, label: name + ' (dihapus di perangkat lain)', other: undefined });
        out.push(kept);
      });
      return out;
    }
    return { value: mergeValue(base, local, remote, [], ''), conflicts };
  }

  // Terapkan satu nilai bentrok ke salinan data; nilai undefined berarti hapus.
  function applyPatch(rec, path, value) {
    const out = JSON.parse(JSON.stringify(rec));
    if (!path.length) return value === undefined ? out : value;
    let cur = out;
    const idx = (a, s) => a.findIndex(x => x && String(x.id) === String(s.id));
    for (let i = 0; i < path.length - 1; i++) {
      const s = path[i];
      cur = isObj(s) ? cur[idx(cur, s)] : cur[s];
      if (cur == null) return out;
    }
    const last = path[path.length - 1];
    if (isObj(last)) {
      const j = idx(cur, last);
      if (j < 0) { if (value !== undefined) cur.push(value); }
      else if (value === undefined) cur.splice(j, 1);
      else cur[j] = value;
    } else if (value === undefined) delete cur[last];
    else cur[last] = value;
    return out;
  }
  root.SyncMerge = { merge3, applyPatch };
})(typeof window !== 'undefined' ? window : globalThis);
