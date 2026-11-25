// Working-drawing sheet as a standalone SVG string (also the source of the PNG export).
const Render = (() => {
  const Geo = typeof Geometry !== 'undefined' ? Geometry : require('./geometry.js');

  // Drawing ink colours. The SVG must render standalone (PNG, other apps), so it cannot
  // read CSS tokens; these are the Furrow token hues converted once to sRGB hex.
  const PALETTE = {
    sheet: '#fdfcfa', ink: '#1c1917', right: '#5c554e', computed: '#3b6a82',
    estimated: '#94561c', conflict: '#b42318', ok: '#2f7a47', rule: '#ddd8cf',
  };
  // Not colour alone: each status also carries a mark on its number.
  const mark = (status, txt) => ({
    computed: `${txt}*`, estimated: '?', conflict: `${txt}!`,
  }[status] || txt);

  const LEGEND = 'Tanda: 12 tertulis, 12* hasil hitungan, ? belum tertulis, 12! bertentangan';

  const endOf = (s, i) => s.points[(i + 1) % s.points.length];

  // Slide a label along its dimension line until it clears the labels already placed.
  // shortcut: circle overlap only, labels on crowded tiny shapes may still touch; upgrade to box tests if users report it.
  function freeSpot(placed, text, d, at) {
    const h = d / 2.6, radius = (t) => t.length * h * 0.32 + h * 0.3;
    for (const t of [0.5, 0.72, 0.28, 0.88, 0.12]) {
      const pos = at(t);
      const clear = placed.every((it) => Math.hypot(it.labelPos.x - pos.x, it.labelPos.y - pos.y) > radius(it.text) + radius(text));
      if (clear) return pos;
    }
    return at(0.5);
  }

  // Dimension geometry in world units; d = offset of the dimension line from the edge.
  function dimensionItems(s, d) {
    const items = [];
    const n = s.edges.length;
    s.edges.forEach((e, i) => {
      const p = s.points[i];
      const q = i === n - 1 && s.gap ? s.points[n] : endOf(s, i);
      const len = Math.hypot(q.x - p.x, q.y - p.y) || 1;
      const u = { x: (q.x - p.x) / len, y: (q.y - p.y) / len };
      const out = { x: -u.y, y: u.x };
      let extra = 0, arc = null;
      if (e.kind === 'arc') {
        arc = Geo.arcGeometry(p, q, e);
        extra = e.bulge === 'out' ? arc.r - Math.hypot(arc.mid.x - (p.x + q.x) / 2, arc.mid.y - (p.y + q.y) / 2) : 0;
      }
      const off = d + extra;
      const a = { x: p.x + out.x * off, y: p.y + out.y * off };
      const b = { x: q.x + out.x * off, y: q.y + out.y * off };
      let rot = Math.atan2(u.y, u.x) * 180 / Math.PI;
      if (rot > 90) rot -= 180; else if (rot <= -90) rot += 180;
      const text = mark(e.lengthStatus, Geo.fmt(e.length));
      items.push({
        i, p, q, a, b, out, rot, status: e.lengthStatus, text,
        labelPos: freeSpot(items, text, d, (t) => ({
          x: a.x + (b.x - a.x) * t + out.x * d * 0.45, y: a.y + (b.y - a.y) * t + out.y * d * 0.45,
        })),
      });
      if (arc) {
        const rText = mark(e.radiusStatus, `R ${Geo.fmt(e.radius)}`);
        items.push({
          i, radius: true, status: e.radiusStatus, rot: 0, text: rText,
          labelPos: freeSpot(items, rText, d, (t) => ({
            x: arc.mid.x - out.x * d * 0.8 + u.x * d * (t - 0.5) * 2, y: arc.mid.y - out.y * d * 0.8 + u.y * d * (t - 0.5) * 2,
          })),
        });
      }
    });
    return items;
  }

  // Interior angles worth printing: corners touching a side whose angle is not a right-angle assumption.
  function angleItems(s) {
    const n = s.edges.length, items = [];
    // A corner is "written" only when the user wrote its angle; a direction derived from a
    // neighbouring written angle makes this corner computed, never written.
    const rank = { estimated: 3, computed: 2, right: 1 };
    const derived = (st) => (st === 'written' ? 'computed' : st);
    const verts = (s.clockwiseSketch && s.clockwiseSketch.vertices) || [];
    for (let k = 0; k < n; k++) {
      if (s.gap && k === 0) continue;
      const prev = s.edges[(k - 1 + n) % n], next = s.edges[k];
      const wrote = verts[k] && Geo.parseNumber(verts[k].interiorAngle) !== null;
      if (!wrote && prev.angleStatus === 'right' && next.angleStatus === 'right') continue;
      const interior = Geo.interiorAt(prev.angle, next.angle);
      const a = derived(prev.angleStatus), b = derived(next.angleStatus);
      let status = rank[a] >= rank[b] ? a : b;
      if (wrote) status = (s.cornerConflicts || []).includes(k) ? 'conflict' : 'written';
      // Inside of a clockwise outline is to the right of travel; the label sits on the bisector.
      const r = (deg) => { const a = deg * Math.PI / 180; return { x: Math.sin(a), y: -Math.cos(a) }; };
      const rp = r(prev.angle), rn = r(next.angle);
      let inward = { x: rp.x + rn.x, y: rp.y + rn.y };
      const len = Math.hypot(inward.x, inward.y);
      inward = len > 1e-9 ? { x: inward.x / len, y: inward.y / len } : rn;
      if (interior > 180) inward = { x: -inward.x, y: -inward.y };
      items.push({ k, at: s.points[k], inward, status, text: mark(status, `${Geo.fmt(interior)}°`) });
    }
    return items;
  }

  function bounds(s) {
    const pts = [...s.points];
    s.edges.forEach((e, i) => {
      if (e.kind === 'arc' && !(s.gap && i === s.edges.length - 1)) pts.push(Geo.arcGeometry(s.points[i], endOf(s, i), e).mid);
    });
    const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
    return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
  }

  // Roomiest point inside the outline (farthest from every side), so the area label sits inside
  // concave shapes like an L too. shortcut: 24x24 grid search on the chord polygon, fine for labels.
  function areaSpot(s) {
    const P = s.points, n = P.length, bb = bounds(s);
    const inside = (x, y) => {
      let c = false;
      for (let i = 0, j = n - 1; i < n; j = i++) {
        const a = P[i], b = P[j];
        if ((a.y > y) !== (b.y > y) && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) c = !c;
      }
      return c;
    };
    const segDist = (x, y, a, b) => {
      const dx = b.x - a.x, dy = b.y - a.y, len2 = dx * dx + dy * dy || 1;
      const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / len2));
      return Math.hypot(x - (a.x + t * dx), y - (a.y + t * dy));
    };
    let best = { x: (bb.minX + bb.maxX) / 2, y: (bb.minY + bb.maxY) / 2 }, bestD = -1;
    for (let i = 0; i < 24; i++) {
      for (let j = 0; j < 24; j++) {
        const x = bb.minX + ((i + 0.5) / 24) * (bb.maxX - bb.minX), y = bb.minY + ((j + 0.5) / 24) * (bb.maxY - bb.minY);
        if (!inside(x, y)) continue;
        const d = Math.min(...P.map((a, k) => segDist(x, y, a, P[(k + 1) % n])));
        if (d > bestD) { bestD = d; best = { x, y }; }
      }
    }
    return best;
  }

  // The working behind the area, in lines a builder can redo with a calculator.
  const AREA_TITLE = 'Perhitungan luas';
  const TO_M2 = { mm: 1e-6, cm: 1e-4, m: 1 };

  function areaLines(b, unit) {
    if (!b) return [];
    const F = Geo.fmt, u = `${unit}²`;
    const L = (n) => `${F(n)} ${unit}`; // every length in the working carries its unit
    // Building areas are read in m²; cm and mm totals also say how many m² that is.
    const inM2 = (a) => (unit === 'm' ? '' : ` (${String(Math.round(a * TO_M2[unit] * 1e4) / 1e4).replace('.', ',')} m²)`);
    const how = (p) => (p.kind === 'rect' ? `${L(p.w)} × ${L(p.h0)}` : `(${L(p.h0)} + ${L(p.h1)}) ÷ 2 × ${L(p.w)}`);
    if (b.pieces.length === 1 && !b.arcs.length) return [`Luas = ${how(b.pieces[0])} = ${F(b.pieces[0].area)} ${u}${inM2(b.total)}`];
    const terms = [
      ...b.pieces.map((p, i) => ({ name: `A${i + 1}`, value: p.area, line: `A${i + 1} = ${how(p)} = ${F(p.area)} ${u}` })),
      ...b.arcs.map((a, i) => ({
        name: `B${i + 1}`, value: a.area,
        line: `B${i + 1} = tembereng sisi ${a.i + 1} (R ${L(a.radius)}, tali busur ${L(a.chord)}) = ${a.area >= 0 ? '+' : '-'}${F(Math.abs(a.area))} ${u}`,
      })),
    ];
    const join = (pick) => terms.map((t, i) => (i === 0 ? pick(t) : `${t.value < 0 ? ' - ' : ' + '}${pick(t)}`)).join('');
    return [
      AREA_TITLE,
      ...terms.map((t) => t.line),
      `Total = ${join((t) => t.name)} = ${join((t) => F(Math.abs(t.value)))} = ${F(b.total)} ${u}${inM2(b.total)}`,
    ];
  }

  const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const f = (n) => Math.round(n * 1000) / 1000;

  // Kedalaman (satuan gambar) dicetak di bawah perhitungan luas, juga dalam meter.
  function depthLine(depth, unit) {
    if (!(depth > 0)) return null;
    const m = Math.round(depth * (TO_M2[unit] ** 0.5) * 1e4) / 1e4;
    return `Kedalaman = ${Geo.fmt(depth)} ${unit}${unit === 'm' ? '' : ` (${String(m).replace('.', ',')} m)`}`;
  }

  function toSVG(s, { unit = 'cm', title = 'Gambar kerja', date = '', scaleLabel = '', note = '', pixelWidth = 0, depth = null } = {}) {
    const bb = bounds(s);
    const E = Math.max(bb.maxX - bb.minX, bb.maxY - bb.minY, 1);
    const h = E * 0.035, d = h * 2.6, margin = d + h * 3;
    const Y = (y) => -y; // world y up, SVG y down
    const n = s.edges.length;
    // No title block on the sheet: the page shows unit, scale and status. Only an estimate note
    // stays, so a PNG of an incomplete drawing still says so.
    const breakdown = Geo.areaBreakdown(s);
    const rows = [
      ...areaLines(breakdown, unit).map((t, k) => [t, 'ink', k === 0 && t === AREA_TITLE]),
      ...(depthLine(depth, unit) ? [[depthLine(depth, unit), 'ink', false]] : []),
      ...(note ? [[note, 'estimated', false]] : []),
    ];
    const textW = rows.length ? Math.max(...rows.map(([t]) => t.length)) * h * 0.62 + h * 2 : 0;
    const vx = bb.minX - margin, vy = Y(bb.maxY) - margin;
    const vw = Math.max(bb.maxX - bb.minX + margin * 2, textW);
    const blockH = h * 1.6 * (rows.length + 1);
    const vh = bb.maxY - bb.minY + margin * 2 + blockH;

    let path = `M ${f(s.points[0].x)} ${f(Y(s.points[0].y))}`;
    s.edges.forEach((e, i) => {
      const p = s.points[i];
      const q = i === n - 1 && s.gap ? s.points[n] : endOf(s, i);
      if (e.kind === 'arc') {
        const g = Geo.arcGeometry(p, q, e);
        path += ` A ${f(g.r)} ${f(g.r)} 0 0 ${g.sweep > 0 ? 0 : 1} ${f(q.x)} ${f(Y(q.y))}`;
      } else {
        path += ` L ${f(q.x)} ${f(Y(q.y))}`;
      }
    });
    if (!s.gap) path += ' Z';

    const sw = h * 0.12;
    const dims = dimensionItems(s, d).map((it) => {
      const label = `<text x="${f(it.labelPos.x)}" y="${f(Y(it.labelPos.y))}" transform="rotate(${f(-it.rot)} ${f(it.labelPos.x)} ${f(Y(it.labelPos.y))})">${esc(it.text)}</text>`;
      if (it.radius) return `<g class="dim st-${it.status}">${label}</g>`;
      const t = (pt) => `<line x1="${f(pt.x - it.out.x * h * 0.3)}" y1="${f(Y(pt.y - it.out.y * h * 0.3))}" x2="${f(pt.x + it.out.x * h * 0.3)}" y2="${f(Y(pt.y + it.out.y * h * 0.3))}"/>`;
      const ext = (from, to) => `<line class="ext" x1="${f(from.x + it.out.x * h * 0.3)}" y1="${f(Y(from.y + it.out.y * h * 0.3))}" x2="${f(to.x + it.out.x * h * 0.3)}" y2="${f(Y(to.y + it.out.y * h * 0.3))}"/>`;
      return `<g class="dim st-${it.status}" data-edge="${it.i}">${ext(it.p, it.a)}${ext(it.q, it.b)}<line x1="${f(it.a.x)}" y1="${f(Y(it.a.y))}" x2="${f(it.b.x)}" y2="${f(Y(it.b.y))}"/>${t(it.a)}${t(it.b)}${label}</g>`;
    }).join('');
    const angles = angleItems(s).map((it) => {
      const off = h * (1.4 + it.text.length * 0.3);
      const x = it.at.x + it.inward.x * off, y = Y(it.at.y + it.inward.y * off);
      return `<g class="dim st-${it.status}"><text x="${f(x)}" y="${f(y)}">${esc(it.text)}</text></g>`;
    }).join('');

    let gap = '';
    if (s.gap) {
      const a = s.points[n], b = s.points[0];
      gap = `<g class="st-conflict"><line class="gap" x1="${f(a.x)}" y1="${f(Y(a.y))}" x2="${f(b.x)}" y2="${f(Y(b.y))}"/></g>`;
    }

    // Piece names and the dashed lines between pieces, so A1, A2 ... can be found on the drawing.
    let pieces = '';
    if (breakdown && breakdown.pieces.length + breakdown.arcs.length > 1) {
      pieces = breakdown.pieces.map((p, i) => {
        const divider = p.h1 > 1e-6 && Math.abs(p.x1 - bb.maxX) > 1e-6 // the last strip's right side is the outline
          ? `<line class="divider" x1="${f(p.x1)}" y1="${f(Y(p.bot1))}" x2="${f(p.x1)}" y2="${f(Y(p.top1))}"/>` : '';
        // bottom-left inside corner: the bottom of a strip is the flat side, clear of angle labels
        return `${divider}<text class="piece" x="${f(p.x0 + Math.min(p.w * 0.5, h * 1.6))}" y="${f(Y(p.bot0 + h * 1.1))}">A${i + 1}</text>`;
      }).join('');
      // Arc pieces are named in the lines under the drawing by their side number, not on it:
      // the arc already carries its R label.
    }

    let areaLabel = '';
    if (s.area !== null) {
      const at = areaSpot(s);
      areaLabel = `<g class="area"><text class="area__label" x="${f(at.x)}" y="${f(Y(at.y) - h * 1.5)}">Luas</text>`
        + `<text class="area__value" x="${f(at.x)}" y="${f(Y(at.y) + h * 0.4)}">${esc(`${Geo.fmt(s.area)} ${unit}²`)}</text></g>`;
    }
    const by = Y(bb.minY) + margin, lx = bb.minX - margin + h;
    const block = rows.map(([t, st, strong], k) => `<text class="st-${st}${strong ? ' strong' : ''}" x="${f(lx)}" y="${f(by + h * 1.6 * (k + 1))}">${esc(t)}</text>`).join('');

    const P = PALETTE;
    // Every rule is scoped to .sgk-sheet: an inline SVG's <style> applies to the whole page.
    const S = '.sgk-sheet ';
    const style = `${S}text{font-size:${f(h)}px;fill:currentColor;text-anchor:middle;dominant-baseline:middle}`
      + `${S}.block text{text-anchor:start}`
      + `${S}.outline{fill:none;stroke:${P.ink};stroke-width:${f(sw * 3)};stroke-linejoin:miter}`
      + `${S}.dim line{stroke:currentColor;stroke-width:${f(sw)}}${S}.dim line.ext{stroke-width:${f(sw * 0.6)}}`
      + `${S}.dim.is-active line{stroke-width:${f(sw * 2.5)}}${S}.dim.is-active text{font-weight:700}`
      + `${S}.gap{stroke:currentColor;stroke-width:${f(sw * 2)};stroke-dasharray:${f(h * 0.6)} ${f(h * 0.4)}}`
      + `${S}.strong{font-weight:500}`
      + `${S}.area text{paint-order:stroke;stroke:${PALETTE.sheet};stroke-width:${f(h * 0.3)}px;stroke-linejoin:round}`
      + `${S}.area__label{fill:${PALETTE.right};font-size:${f(h * 0.95)}px}`
      + `${S}.area__value{fill:${PALETTE.ink};font-size:${f(h * 2.1)}px;font-weight:600}`
      + `${S}.piece{fill:${PALETTE.right};font-size:${f(h * 0.9)}px;font-weight:500}`
      + `${S}.divider{stroke:${PALETTE.right};stroke-width:${f(sw * 0.8)};stroke-dasharray:${f(h * 0.5)} ${f(h * 0.35)}}`
      + Object.keys(P).map((k) => `${S}.st-${k}{color:${P[k]};fill:${P[k]}}`).join('')
      + `${S}.st-written{color:${P.ink};fill:${P.ink}}`;

    // Explicit pixel size for raster export: an <img> of a viewBox-only SVG gets 300x150 in Chrome.
    const size = pixelWidth ? ` width="${pixelWidth}" height="${Math.round((pixelWidth * f(vh)) / f(vw))}"` : '';
    return `<svg xmlns="http://www.w3.org/2000/svg" class="sgk-sheet"${size} viewBox="${f(vx)} ${f(vy)} ${f(vw)} ${f(vh)}" font-family="'Red Hat Mono', ui-monospace, monospace" role="img" aria-label="${esc(title)}">`
      + `<style>${style}</style>`
      + `<rect x="${f(vx)}" y="${f(vy)}" width="${f(vw)}" height="${f(vh)}" fill="${P.sheet}"/>`
      + `<path class="outline" d="${path}"/>${pieces}${gap}${dims}${angles}${areaLabel}<g class="block">${block}</g></svg>`;
  }

  return { toSVG, dimensionItems, angleItems, bounds, mark, PALETTE, LEGEND };
})();

if (typeof module !== 'undefined') module.exports = Render;
