/* Hitung volume dan RAB proyek Survei di luar Flutter, agar nilainya bisa dipakai modul Proyek.
   Rumus harus sama dengan aplikasi Survei (apps/survei); bila Survei dibangun ulang, jalankan test/survei-calc.test.js. */
(function (root) {
  'use strict';
  const pos = (d, k) => (d && d[k] > 0 ? d[k] : null);
  const allPos = (...v) => v.every(x => x != null);

  function polyArea(pts) {
    let s = 0;
    pts.forEach((p, i) => { const q = pts[(i + 1) % pts.length]; s += p[0] * q[1] - q[0] * p[1]; });
    return Math.abs(s) / 2;
  }
  function polyPerim(pts) {
    return pts.reduce((a, p, i) => { const q = pts[(i + 1) % pts.length]; return a + Math.hypot(p[0] - q[0], p[1] - q[1]); }, 0);
  }
  function areaOf(f) {
    if (f.areaOverride != null) return Math.abs(f.areaOverride);
    const d = f.dims, pts = f.points || [];
    switch (f.shape) {
      case 'rect': { const a = pos(d, 'panjang'), b = pos(d, 'lebar'); return allPos(a, b) ? a * b : null; }
      case 'triangle': { const a = pos(d, 'alas'), t = pos(d, 'tinggi'); return allPos(a, t) ? 0.5 * a * t : null; }
      case 'circle': { const r = pos(d, 'radius'); return r != null ? Math.PI * r * r : null; }
      case 'trapezoid': { const a = pos(d, 'sisiA'), b = pos(d, 'sisiB'), t = pos(d, 'tinggi'); return allPos(a, b, t) ? 0.5 * (a + b) * t : null; }
      case 'polygon': return pts.length >= 3 ? polyArea(pts) : null;
      default: return null;
    }
  }
  // Survei memakai dimensi mentah untuk keliling (tanpa syarat > 0) dan hanya untuk persegi, lingkaran, poligon.
  function perimOf(f) {
    const d = f.dims || {}, pts = f.points || [];
    if (f.shape === 'rect') return d.panjang != null && d.lebar != null ? 2 * (d.panjang + d.lebar) : null;
    if (f.shape === 'circle') return d.radius != null ? 2 * Math.PI * d.radius : null;
    if (f.shape === 'polygon') return pts.length >= 3 ? polyPerim(pts) : null;
    return null;
  }
  function fieldQty(f, m, use) {
    if (use.overrideQty != null) return use.overrideQty;
    const A = areaOf(f), K = perimOf(f), sign = f.sign < 0 ? -1 : 1, fac = m.factor;
    let k = null, signed = true;
    switch (m.basis) {
      case 'area': k = A == null ? null : A * fac; break;
      case 'volume': k = A == null ? null : A * f.depth * fac; break;
      case 'lining': k = A == null || K == null ? null : (K * f.depth + A) * fac; break;
      case 'perimeter': k = K == null ? null : K * fac; break;
      case 'thickness': k = A == null ? null : A * m.thickness * fac; break;
      case 'count':
        if (m.perUnit > 0 && use.qty == null) k = A == null ? null : A * m.perUnit;
        else { k = use.qty; signed = false; }
        break;
      default: k = use.qty; signed = false;
    }
    return k == null ? null : k * (1 + m.waste) * (signed ? sign : 1);
  }
  function materialTotals(sp) {
    const out = {};
    (sp.areas || []).forEach(a => (a.fields || []).forEach(f => (sp.materials || []).forEach(m => {
      const use = (f.materials || {})[m.id];
      if (!use || !use.enabled) return;
      const q = fieldQty(f, m, use);
      if (q != null) out[m.id] = (out[m.id] || 0) + q;
    })));
    return out;
  }
  function rabOf(sp) {
    const R = sp.rab || {}, tot = materialTotals(sp);
    const items = (R.items || []).map(i => {
      const q = i.materialId != null ? (tot[i.materialId] || 0) : (i.manualVolume || 0);
      const mat = i.priceMaterial || 0, lab = i.priceLabor || 0;
      return { id: i.id, n: i.description, u: i.unit, q, mat, lab, included: i.included !== false, total: i.included !== false ? q * (mat + lab) : 0 };
    });
    const sub = items.reduce((a, x) => a + x.total, 0);
    const overhead = sub * (R.overheadPct || 0) / 100;
    let r = sub + overhead;
    const profit = r * (R.profitPct || 0) / 100;
    r += profit;
    const discount = r * (R.discountPct || 0) / 100;
    const tax = R.taxEnabled ? (r - discount) * (R.taxPct || 0) / 100 : 0;
    return { items, sub, overhead, profit, discount, tax, grand: sub + overhead + profit - discount + tax };
  }
  root.SurveiCalc = { areaOf, perimOf, fieldQty, materialTotals, rabOf };
})(typeof window !== 'undefined' ? window : globalThis);
