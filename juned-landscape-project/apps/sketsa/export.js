// DXF and exact-scale PDF, both written by hand: no dependency, works offline.
const Export = (() => {
  const Geo = typeof Geometry !== 'undefined' ? Geometry : require('./geometry.js');
  const Ren = typeof Render !== 'undefined' ? Render : require('./render.js');

  const UNIT_MM = { mm: 1, cm: 10, m: 1000 };
  const PAPER = { A4: [297, 210], A3: [420, 297] }; // landscape, mm
  const SCALES = [10, 20, 50, 100, 200, 500];
  const MARGIN = 15, TITLE_H = 30, DIM_SPACE = 20;
  const PT = 72 / 25.4;

  const endOf = (s, i) => s.points[(i + 1) % s.points.length];

  function drawingArea(paper) {
    const [W, H] = PAPER[paper];
    return { w: W - 2 * MARGIN - 2 * DIM_SPACE, h: H - 2 * MARGIN - TITLE_H - 2 * DIM_SPACE };
  }

  function fitsAt(s, paper, unit, scale) {
    const bb = Ren.bounds(s);
    const area = drawingArea(paper);
    return ((bb.maxX - bb.minX) * UNIT_MM[unit]) / scale <= area.w && ((bb.maxY - bb.minY) * UNIT_MM[unit]) / scale <= area.h;
  }

  function pickScale(s, paper, unit) {
    const scale = SCALES.find((k) => fitsAt(s, paper, unit, k));
    return scale ? { scale, fits: true } : { scale: SCALES[SCALES.length - 1], fits: false };
  }

  // ---------- DXF (ASCII R12) ----------
  function toDXF(s, unit, note = '') {
    const out = [];
    const put = (...pairs) => { for (let i = 0; i < pairs.length; i += 2) out.push(String(pairs[i]), String(pairs[i + 1])); };
    const num = (n) => (Math.round(n * 1e4) / 1e4).toString();
    put(0, 'SECTION', 2, 'HEADER', 9, '$INSUNITS', 70, { mm: 4, cm: 5, m: 6 }[unit], 0, 'ENDSEC');
    put(0, 'SECTION', 2, 'ENTITIES');
    const n = s.edges.length;
    s.edges.forEach((e, i) => {
      const p = s.points[i], q = i === n - 1 && s.gap ? s.points[n] : endOf(s, i);
      if (e.kind === 'arc') {
        const g = Geo.arcGeometry(p, q, e);
        put(0, 'ARC', 8, 'GARIS_LUAR', 10, num(g.cx), 20, num(g.cy), 30, 0, 40, num(g.r), 50, num(g.start), 51, num(g.end));
      } else {
        put(0, 'LINE', 8, 'GARIS_LUAR', 10, num(p.x), 20, num(p.y), 30, 0, 11, num(q.x), 21, num(q.y), 31, 0);
      }
    });
    const bb = Ren.bounds(s);
    const h = Math.max(bb.maxX - bb.minX, bb.maxY - bb.minY, 1) * 0.035;
    Ren.dimensionItems(s, h * 2.6).forEach((it) => {
      if (!it.radius) {
        put(0, 'LINE', 8, 'DIMENSI', 10, num(it.a.x), 20, num(it.a.y), 30, 0, 11, num(it.b.x), 21, num(it.b.y), 31, 0);
      }
      put(0, 'TEXT', 8, 'DIMENSI', 10, num(it.labelPos.x), 20, num(it.labelPos.y), 30, 0, 40, num(h), 1, it.text, 50, num(it.rot), 72, 1, 11, num(it.labelPos.x), 21, num(it.labelPos.y), 31, 0);
    });
    put(0, 'TEXT', 8, 'TEKS', 10, num(bb.minX), 20, num(bb.minY - h * 6), 30, 0, 40, num(h), 1, `Satuan ${unit}`);
    if (note) put(0, 'TEXT', 8, 'TEKS', 10, num(bb.minX), 20, num(bb.minY - h * 8), 30, 0, 40, num(h), 1, note);
    put(0, 'ENDSEC', 0, 'EOF');
    return out.join('\n') + '\n';
  }

  // ---------- PDF 1.4 ----------
  const rgb = (hex) => [1, 3, 5].map((k) => (parseInt(hex.slice(k, k + 2), 16) / 255).toFixed(3)).join(' ');
  // Helvetica WinAnsi: Latin-1 range only; anything else becomes '?'.
  const pdfText = (t) => [...String(t)].map((c) => (c.charCodeAt(0) < 256 ? c : '?')).join('').replace(/[\\()]/g, '\\$&');
  const n3 = (v) => v.toFixed(3);

  function bezierArc(cx, cy, r, a0, sweep) {
    const segs = Math.max(1, Math.ceil(Math.abs(sweep) / 90));
    const step = (sweep / segs) * Math.PI / 180;
    let a = a0 * Math.PI / 180, ops = '';
    for (let k = 0; k < segs; k++) {
      const b = a + step, t = (4 / 3) * Math.tan(step / 4);
      const p1 = [cx + r * (Math.cos(a) - t * Math.sin(a)), cy + r * (Math.sin(a) + t * Math.cos(a))];
      const p2 = [cx + r * (Math.cos(b) + t * Math.sin(b)), cy + r * (Math.sin(b) - t * Math.cos(b))];
      const p3 = [cx + r * Math.cos(b), cy + r * Math.sin(b)];
      ops += `${[...p1, ...p2, ...p3].map(n3).join(' ')} c\n`;
      a = b;
    }
    return ops;
  }

  function toPDF(s, { paper = 'A4', scale, unit = 'cm', title = 'Gambar kerja', date = '', note = '', depth = null }) {
    const [Wmm, Hmm] = PAPER[paper];
    const W = Wmm * PT, H = Hmm * PT;
    const k = (UNIT_MM[unit] / scale) * PT; // pt per drawing unit
    const bb = Ren.bounds(s);
    const areaCx = W / 2, areaCy = (MARGIN + TITLE_H + (Hmm - MARGIN)) / 2 * PT;
    const ox = areaCx - ((bb.minX + bb.maxX) / 2) * k, oy = areaCy - ((bb.minY + bb.maxY) / 2) * k;
    const X = (x) => ox + x * k, Y = (y) => oy + y * k;
    const P = Ren.PALETTE;
    const n = s.edges.length;
    let c = '';

    // Outline first: one path.
    c += `${rgb(P.ink)} RG\n${n3(0.5 * PT)} w\n${n3(X(s.points[0].x))} ${n3(Y(s.points[0].y))} m `;
    s.edges.forEach((e, i) => {
      const p = s.points[i], q = i === n - 1 && s.gap ? s.points[n] : endOf(s, i);
      if (e.kind === 'arc') {
        const g = Geo.arcGeometry(p, q, e);
        c += bezierArc(X(g.cx), Y(g.cy), g.r * k, g.a0, g.sweep);
      } else {
        c += `${n3(X(q.x))} ${n3(Y(q.y))} l\n`;
      }
    });
    c += s.gap ? 'S\n' : 'h S\n';

    // Dimensions: 8 mm off the outline, 3 mm text.
    const dUnits = 8 / (UNIT_MM[unit] / scale);
    const size = 3 * PT;
    const text = (t, x, y, rot, hex, align = 'center') => {
      const rad = rot * Math.PI / 180, cs = Math.cos(rad), sn = Math.sin(rad);
      const w = align === 'center' ? String(t).length * size * 0.55 : 0;
      const tx = x - cs * w / 2 + sn * size * 0.35, ty = y - sn * w / 2 - cs * size * 0.35;
      return `BT /F1 ${n3(size)} Tf ${rgb(hex)} rg ${[cs, sn, -sn, cs, tx, ty].map(n3).join(' ')} Tm (${pdfText(t)}) Tj ET\n`;
    };
    c += `${n3(0.18 * PT)} w\n`;
    Ren.dimensionItems(s, dUnits).forEach((it) => {
      const hex = P[it.status === 'written' ? 'ink' : it.status] || P.ink;
      if (!it.radius) {
        const tick = 1.2 * PT / k;
        c += `${rgb(hex)} RG\n`;
        [[it.p, it.a], [it.q, it.b], [it.a, it.b]].forEach(([u, v]) => { c += `${n3(X(u.x))} ${n3(Y(u.y))} m ${n3(X(v.x))} ${n3(Y(v.y))} l S\n`; });
        [it.a, it.b].forEach((pt) => {
          c += `${n3(X(pt.x - it.out.x * tick))} ${n3(Y(pt.y - it.out.y * tick))} m ${n3(X(pt.x + it.out.x * tick))} ${n3(Y(pt.y + it.out.y * tick))} l S\n`;
        });
      }
      c += text(it.text, X(it.labelPos.x), Y(it.labelPos.y), it.rot, hex);
    });
    Ren.angleItems(s).forEach((it) => {
      const off = size * (1.4 + it.text.length * 0.3);
      c += text(it.text, X(it.at.x) + it.inward.x * off, Y(it.at.y) + it.inward.y * off, 0, P[it.status === 'written' ? 'ink' : it.status] || P.ink);
    });

    // Frame and title block.
    const m = MARGIN * PT;
    c += `${rgb(P.ink)} RG\n${n3(0.35 * PT)} w\n${n3(m)} ${n3(m)} ${n3(W - 2 * m)} ${n3(H - 2 * m)} re S\n`;
    const bw = 110 * PT, bh = TITLE_H * PT, bx = W - m - bw;
    c += `${n3(bx)} ${n3(m)} ${n3(bw)} ${n3(bh)} re S\n`;
    const lines = [
      title,
      `Satuan ${unit}, skala 1:${scale}, tanggal ${date}`,
      ...(s.area !== null ? [`Luas ${Geo.fmt(s.area)} ${unit}²`] : []),
      ...(depth > 0 ? [`Kedalaman ${Geo.fmt(depth)} ${unit}`] : []),
      'Cetak 100%, jangan fit-to-page',
      ...(note ? [note] : []),
    ];
    lines.forEach((t, i) => { c += text(t, bx + 3 * PT, m + bh - (i + 1) * 5 * PT, 0, P.ink, 'left'); });
    c += text(Ren.LEGEND, m + 3 * PT, m + 4 * PT, 0, P.right, 'left');

    const objs = [
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${n3(W)} ${n3(H)}] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>`,
      `<< /Length ${c.length} >>\nstream\n${c}endstream`,
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    ];
    let out = '%PDF-1.4\n';
    const offsets = objs.map((o, i) => { const at = out.length; out += `${i + 1} 0 obj\n${o}\nendobj\n`; return at; });
    const xref = out.length;
    out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
    out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    const bytes = new Uint8Array(out.length);
    for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 0xff;
    return bytes;
  }

  return { pickScale, fitsAt, toDXF, toPDF, SCALES, PAPER };
})();

if (typeof module !== 'undefined') module.exports = Export;
