/* Menjembatani tool "Sketsa ke Gambar Kerja" dan bidang Survei: hasil Geometry.solve menjadi polygon meter,
   lalu ditulis ke data bidang. Diuji: node test/sketsa-field.test.js */
(function (root) {
  'use strict';
  const K = { mm: 0.001, cm: 0.01, m: 1 };
  const fmt = n => String(Math.round(n * 100) / 100).replace('.', ',');
  const no = reason => ({ ok: false, reason });
  const shoelace = pts => Math.abs(pts.reduce((s, p, i) => { const q = pts[(i + 1) % pts.length]; return s + p[0] * q[1] - q[0] * p[1]; }, 0)) / 2;

  // Titik hasil sketsa: y ke atas, satuan sketsa. Survei: y ke bawah, meter, titik pertama di 0,0.
  function fromSolved(s, unit) {
    const k = K[unit];
    if (!k) return no('Satuan tidak dikenal. Pilih mm, cm, atau m.');
    if (!s) return no('Belum ada bentuk.');
    if (s.status === 'conflict' || (s.conflicts && s.conflicts.length)) return no('Ukuran bertentangan. Perbaiki dulu ukuran yang ditandai.');
    if (s.gap) return no('Bentuk belum menutup. Periksa ukuran sisinya.');
    if (!s.points || s.points.length < 3 || !(s.area > 0)) return no('Bentuk belum lengkap.');
    const world = [];
    let hasArc = false;
    s.points.forEach((p, i) => {
      world.push(p);
      const e = s.edges && s.edges[i];
      if (e && e.kind === 'arc') {   // Survei hanya menyimpan sisi lurus: busur diuraikan menjadi titik pendek
        hasArc = true;
        const q = s.points[(i + 1) % s.points.length], a = root.Geometry.arcGeometry(p, q, e);
        const steps = Math.max(6, Math.ceil(Math.abs(a.sweep) / 8));
        for (let j = 1; j < steps; j++) { const deg = (a.a0 + a.sweep * j / steps) * Math.PI / 180; world.push({ x: a.cx + a.r * Math.cos(deg), y: a.cy + a.r * Math.sin(deg) }); }
      }
    });
    const o = world[0], points = world.map(p => [(p.x - o.x) * k + 0, -(p.y - o.y) * k + 0]);
    return { ok: true, points, area: shoelace(points), estimated: s.status === 'underdetermined', hasArc };
  }

  // Menulis ke satu bidang pada data survei (rec = isi landspace:p:<id>). Hasil yang tidak ok tidak pernah ditulis.
  function applyToField(rec, fieldId, res) {
    if (!res || !res.ok || !Array.isArray(res.points) || res.points.length < 3) return no((res && res.reason) || 'Hasil sketsa belum bisa dipakai.');
    let field = null;
    for (const a of (rec && rec.areas) || []) for (const f of a.fields || []) if (f.id === fieldId) field = f;
    if (!field) return no('Bidang tidak ditemukan di survei ini.');
    field.shape = 'polygon';
    field.points = res.points.map(p => [p[0], p[1]]);
    field.sketchScale = null;   // skala kanvas lama tidak berlaku untuk bentuk dari sketsa berukuran
    const line = 'Sketsa berukuran (' + fmt(res.area) + ' m²)' + (res.estimated ? ', ada ukuran perkiraan, periksa lagi.' : '.');
    field.note = String(field.note || '').split('\n').filter(l => !l.startsWith('Sketsa berukuran')).concat(line).filter(Boolean).join('\n');
    const warning = field.areaOverride != null ? 'Bidang ini memakai luas manual (' + fmt(field.areaOverride) + ' m²). Hapus luas manual agar luas sketsa dipakai.' : '';
    return { ok: true, warning, area: res.area };
  }

  root.SketsaField = { fromSolved, applyToField };
})(typeof window !== 'undefined' ? window : globalThis);
