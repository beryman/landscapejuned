// Geometry engine: rebuilds a closed outline from a read sketch. Trusts written numbers;
// sketch pixel coordinates only give direction hints, order and estimates.
const Geometry = (() => {
  const DEG = 180 / Math.PI;
  const RIGHT_WINDOW = 10; // degrees around 0/90/180/270 treated as a right angle

  const STATUS_LABEL = {
    written: 'tertulis',
    right: 'asumsi siku',
    computed: 'hasil hitungan',
    estimated: 'perkiraan',
    conflict: 'bertentangan',
  };

  function parseNumber(value) {
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (typeof value !== 'string') return null;
    const s = value.trim().replace(',', '.');
    if (s === '' || !/^-?\d*\.?\d+$/.test(s)) return null;
    return Number(s);
  }

  // Indonesian decimal comma, at most two decimals.
  const fmt = (n) => String(Math.round(n * 100) / 100).replace('.', ',');
  const norm = (deg) => { let d = ((deg % 360) + 360) % 360; if (d > 180) d -= 360; return d; };

  // Circular segment between an arc and its chord; 0 when the side has no usable chord or radius.
  function segmentArea(e) {
    const chord = Math.abs(e.length);
    if (!(chord > 1e-9) || !(e.radius > 0)) return 0;
    const th = 2 * Math.asin(Math.min(1, chord / (2 * e.radius)));
    const seg = (e.radius * e.radius / 2) * (th - Math.sin(th));
    return e.bulge === 'out' ? seg : -seg;
  }

  // First pair of non-adjacent sides that cross, or null.
  function selfCrossing(P) {
    const n = P.length;
    const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
    const eps = 1e-9;
    for (let i = 0; i < n; i++) {
      for (let j = i + 2; j < n; j++) {
        if (i === 0 && j === n - 1) continue; // neighbours through the closing corner
        const [a, b, c, d] = [P[i], P[(i + 1) % n], P[j], P[(j + 1) % n]];
        const d1 = cross(c, d, a), d2 = cross(c, d, b), d3 = cross(a, b, c), d4 = cross(a, b, d);
        if (((d1 > eps && d2 < -eps) || (d1 < -eps && d2 > eps)) && ((d3 > eps && d4 < -eps) || (d3 < -eps && d4 > eps))) return [i, j];
      }
    }
    return null;
  }

  function toClockwise(sketch) {
    const vs = sketch.vertices;
    let sum = 0;
    for (let i = 0; i < vs.length; i++) {
      const a = vs[i], b = vs[(i + 1) % vs.length];
      sum += a.x * -b.y - b.x * -a.y;
    }
    if (sum <= 0) return sketch; // y flipped: negative signed area = clockwise
    const n = vs.length;
    return {
      ...sketch,
      vertices: vs.map((_, j) => vs[(n - j) % n]),
      edges: vs.map((_, j) => sketch.edges[(2 * n - j - 1) % n]),
    };
  }

  function solve(input) {
    const sk = toClockwise(input);
    const n = sk.vertices.length;
    const px = sk.edges.map((_, i) => {
      const a = sk.vertices[i], b = sk.vertices[(i + 1) % n];
      return { dx: b.x - a.x, dy: -(b.y - a.y) };
    });
    const sketchDir = px.map((p) => Math.atan2(p.dy, p.dx) * DEG);
    const pxLen = px.map((p) => Math.hypot(p.dx, p.dy));

    const edges = sk.edges.map((e) => ({
      length: parseNumber(e.length), angle: null, kind: e.kind === 'arc' ? 'arc' : 'line',
      radius: parseNumber(e.radius), bulge: e.bulge === 'in' ? 'in' : 'out',
      lengthStatus: null, angleStatus: null, radiusStatus: null,
    }));

    // 1. Directions: right-angle snap, then propagate written interior angles.
    edges.forEach((e, i) => {
      const snapped = Math.round(sketchDir[i] / 90) * 90;
      if (Math.abs(sketchDir[i] - snapped) <= RIGHT_WINDOW) { e.angle = norm(snapped); e.angleStatus = 'right'; }
    });
    for (let changed = true; changed;) {
      changed = false;
      for (let k = 0; k < n; k++) {
        const ia = parseNumber(sk.vertices[k].interiorAngle);
        if (ia === null) continue;
        const prev = edges[(k - 1 + n) % n], next = edges[k];
        const turn = 180 - ia; // clockwise travel turns right by this much
        if (prev.angle !== null && next.angleStatus !== 'written' && (next.angle === null || next.angleStatus === 'right')) {
          const a = norm(prev.angle - turn);
          if (next.angle !== a || next.angleStatus !== 'written') { next.angle = a; next.angleStatus = 'written'; changed = true; }
        } else if (next.angle !== null && prev.angle === null) {
          prev.angle = norm(next.angle + turn); prev.angleStatus = 'written'; changed = true;
        }
      }
    }

    // 2. Lengths.
    edges.forEach((e) => { if (e.length !== null) e.lengthStatus = 'written'; });
    const ratios = edges.map((e, i) => (e.length !== null && pxLen[i] > 0 ? e.length / pxLen[i] : null))
      .filter((r) => r !== null).sort((a, b) => a - b);
    const scale = ratios.length ? ratios[Math.floor(ratios.length / 2)] : 1;

    // 3. Unknowns, each with a start value from the sketch.
    const unknowns = [];
    edges.forEach((e, i) => {
      if (e.length === null) { e.length = pxLen[i] * scale; unknowns.push({ i, kind: 'length' }); }
      if (e.angle === null) { e.angle = sketchDir[i]; unknowns.push({ i, kind: 'angle' }); }
    });

    const closure = () => edges.reduce((s, e) => {
      const a = e.angle / DEG;
      return { x: s.x + e.length * Math.cos(a), y: s.y + e.length * Math.sin(a) };
    }, { x: 0, y: 0 });
    const column = (u) => {
      const e = edges[u.i], a = e.angle / DEG;
      return u.kind === 'length' ? [Math.cos(a), Math.sin(a)] : [-e.length * Math.sin(a) / DEG, e.length * Math.cos(a) / DEG];
    };

    // Keep the last independent set (at most 2) to solve; estimate the rest from the sketch.
    let solveSet = [];
    for (let j = unknowns.length - 1; j >= 0 && solveSet.length === 0; j--) {
      for (let k = j - 1; k >= 0; k--) {
        const [a, b] = [column(unknowns[k]), column(unknowns[j])];
        if (Math.abs(a[0] * b[1] - a[1] * b[0]) > 1e-9) { solveSet = [unknowns[k], unknowns[j]]; break; }
      }
    }
    if (!solveSet.length) {
      const one = [...unknowns].reverse().find((u) => Math.hypot(...column(u)) > 1e-9);
      if (one) solveSet = [one];
    }
    unknowns.forEach((u) => {
      if (solveSet.includes(u)) return;
      edges[u.i][u.kind === 'length' ? 'lengthStatus' : 'angleStatus'] = 'estimated';
    });

    // 4. Gauss-Newton on closure for the solve set.
    for (let it = 0; it < 50 && solveSet.length; it++) {
      const r = closure();
      const J = solveSet.map(column); // columns
      let delta;
      if (J.length === 1) {
        const c = J[0], cc = c[0] * c[0] + c[1] * c[1];
        delta = [-(c[0] * r.x + c[1] * r.y) / cc];
      } else {
        const [a, b] = J, det = a[0] * b[1] - a[1] * b[0];
        if (Math.abs(det) < 1e-12) break;
        delta = [-(b[1] * r.x - b[0] * r.y) / det, -(-a[1] * r.x + a[0] * r.y) / det];
      }
      solveSet.forEach((u, k) => { edges[u.i][u.kind] += delta[k]; });
      if (Math.max(...delta.map(Math.abs)) < 1e-12) break;
    }
    solveSet.forEach((u) => { edges[u.i][u.kind === 'length' ? 'lengthStatus' : 'angleStatus'] = 'computed'; });
    edges.forEach((e) => { e.angle = norm(e.angle); });

    // 5. Conflicts.
    const conflicts = [];
    const estimatedAny = unknowns.length > solveSet.length;
    let negative = edges.map((e, i) => (e.length <= 0 ? i : -1)).filter((i) => i >= 0);
    if (negative.length && estimatedAny) {
      // Caused by sketch-proportion estimates, not by the user's numbers: ask for more numbers instead.
      negative.forEach((i) => { edges[i].lengthStatus = 'estimated'; });
      negative = [];
    }
    if (negative.length) {
      negative.forEach((i) => { edges[i].lengthStatus = 'conflict'; });
      conflicts.push({ edges: negative, message: `Ukuran tidak mungkin: sisi ${negative.map((i) => i + 1).join(', ')} menjadi negatif` });
    }
    const perimeter = edges.reduce((s, e) => s + Math.abs(e.length), 0);
    const tol = Math.max(0.005 * perimeter, 0.5);
    const r = closure();
    if (!negative.length && (Math.abs(r.x) > tol || Math.abs(r.y) > tol)) {
      const axisMessage = (axis, label) => {
        const comp = (e) => (axis === 'x' ? Math.cos(e.angle / DEG) : Math.sin(e.angle / DEG));
        const involved = edges.map((e, i) => i).filter((i) => Math.abs(comp(edges[i])) > 1e-9);
        if (!involved.every((i) => Math.abs(comp(edges[i])) > 0.9999)) return null;
        const side = (sign) => {
          const ls = involved.filter((i) => Math.sign(comp(edges[i])) === sign).map((i) => edges[i].length);
          const sum = ls.reduce((s, l) => s + l, 0);
          return ls.map(fmt).join(' + ') + (ls.length > 1 ? ` = ${fmt(sum)}` : '');
        };
        return { edges: involved, message: `${label}: ${side(1)} ≠ ${side(-1)}` };
      };
      const found = [];
      if (Math.abs(r.x) > tol) found.push(axisMessage('x', 'Arah mendatar'));
      if (Math.abs(r.y) > tol) found.push(axisMessage('y', 'Arah tegak'));
      if (found.some((f) => f === null)) {
        conflicts.push({ edges: edges.map((_, i) => i), message: `Bidang tidak menutup, selisih ${fmt(r.x)}, ${fmt(r.y)}` });
      } else {
        conflicts.push(...found);
      }
      conflicts.forEach((c) => c.edges.forEach((i) => {
        if (edges[i].lengthStatus === 'written') edges[i].lengthStatus = 'conflict';
      }));
    }
    // Every written corner angle must hold in the final shape.
    const cornerConflicts = [];
    sk.vertices.forEach((vx, k) => {
      const written = parseNumber(vx.interiorAngle);
      if (written === null) return;
      const prev = edges[(k - 1 + n) % n], next = edges[k];
      const actual = interiorAt(prev.angle, next.angle);
      if (Math.abs(norm(actual - written)) > 0.5) {
        cornerConflicts.push(k);
        conflicts.push({ edges: [(k - 1 + n) % n, k], message: `Sudut di titik ${k + 1}: tertulis ${fmt(written)}°, hasil ${fmt(actual)}°` });
      }
    });
    edges.forEach((e, i) => {
      if (e.kind !== 'arc') return;
      if (e.radius === null) { e.radius = Math.abs(e.length); e.radiusStatus = 'estimated'; return; }
      e.radiusStatus = 'written';
      if (e.radius < e.length / 2 - 1e-9) {
        e.radiusStatus = 'conflict';
        conflicts.push({ edges: [i], message: `Radius ${fmt(e.radius)} lebih kecil dari setengah tali busur ${fmt(e.length / 2)}` });
      }
    });

    // 6. Points, gap, area.
    const points = [{ x: 0, y: 0 }];
    edges.forEach((e) => {
      const p = points[points.length - 1], a = e.angle / DEG;
      points.push({ x: p.x + e.length * Math.cos(a), y: p.y + e.length * Math.sin(a) });
    });
    const end = points.pop();
    const open = Math.abs(end.x) > tol || Math.abs(end.y) > tol;
    if (open) points.push(end);
    const gap = open ? { dx: -end.x, dy: -end.y } : null;

    // A crossing outline has no single area; from written numbers it is a conflict, from estimates it needs more numbers.
    const crossing = !conflicts.length && !open ? selfCrossing(points) : null;
    if (crossing && !estimatedAny) {
      conflicts.push({ edges: crossing, message: `Garis bidang saling memotong di sisi ${crossing[0] + 1} dan ${crossing[1] + 1}. Periksa ukurannya.` });
    }

    let area = null;
    if (!conflicts.length && !crossing) {
      let s = 0;
      for (let i = 0; i < n; i++) { const a = points[i], b = points[(i + 1) % n]; s += a.x * b.y - b.x * a.y; }
      area = Math.abs(s) / 2;
      edges.forEach((e) => { if (e.kind === 'arc') area += segmentArea(e); });
    }

    const anyEstimated = edges.some((e) => [e.lengthStatus, e.angleStatus, e.radiusStatus].includes('estimated'));
    const status = conflicts.length ? 'conflict' : anyEstimated ? 'underdetermined' : 'ok';
    return { points, edges, status, conflicts, cornerConflicts, gap, area, unit: input.unit ?? null, clockwiseSketch: sk };
  }

  // Splits a closed outline into vertical strips a builder can check by hand: rectangles (w x h)
  // and, under slanted sides, trapezoids ((h0 + h1) / 2 x w). Arc sides add or remove a segment.
  function areaBreakdown(s) {
    if (s.area === null || s.gap) return null;
    const P = s.points, n = P.length, eps = 1e-6;
    const xs = [...new Set(P.map((p) => Math.round(p.x / eps) * eps))].sort((a, b) => a - b);
    const segs = P.map((a, i) => [a, P[(i + 1) % n]]).filter(([a, b]) => Math.abs(a.x - b.x) > eps);
    const yAt = ([a, b], x) => a.y + ((b.y - a.y) * (x - a.x)) / (b.x - a.x);
    const pieces = [];
    for (let k = 0; k + 1 < xs.length; k++) {
      const x0 = xs[k], x1 = xs[k + 1], xm = (x0 + x1) / 2;
      // Sides crossing this strip, bottom to top; consecutive pairs bound the inside.
      const cross = segs.filter(([a, b]) => Math.min(a.x, b.x) < xm && Math.max(a.x, b.x) > xm)
        .sort((p, q) => yAt(p, xm) - yAt(q, xm));
      for (let j = 0; j + 1 < cross.length; j += 2) {
        const lo = cross[j], hi = cross[j + 1];
        const bot0 = yAt(lo, x0), top0 = yAt(hi, x0), bot1 = yAt(lo, x1), top1 = yAt(hi, x1);
        const h0 = top0 - bot0, h1 = top1 - bot1, w = x1 - x0;
        const rect = Math.abs(h0 - h1) < eps && Math.abs(bot0 - bot1) < eps;
        const prev = pieces.find((p) => p.kind === 'rect' && rect && Math.abs(p.x1 - x0) < eps
          && Math.abs(p.bot1 - bot0) < eps && Math.abs(p.top1 - top0) < eps);
        if (prev) { // same strip of material continues: widen it instead of adding a piece
          prev.x1 = x1; prev.w = x1 - prev.x0; prev.area = prev.w * prev.h0;
          continue;
        }
        pieces.push({ kind: rect ? 'rect' : 'trap', x0, x1, bot0, top0, bot1, top1, w, h0, h1, area: ((h0 + h1) / 2) * w });
      }
    }
    const arcs = [];
    s.edges.forEach((e, i) => {
      if (e.kind !== 'arc') return;
      arcs.push({ i, radius: e.radius, chord: e.length, area: segmentArea(e) });
    });
    const total = pieces.reduce((t, p) => t + p.area, 0) + arcs.reduce((t, a) => t + a.area, 0);
    return { pieces, arcs, total };
  }

  // Interior angle (0..360) at a corner of a clockwise outline, from the travel directions around it.
  function interiorAt(prevAngle, nextAngle) {
    return 180 - norm(prevAngle - nextAngle);
  }

  // Circle of an arc edge from p to q (world, y up). Shape is clockwise, so "out" bows to the
  // left of travel. start/end are CCW degrees as DXF wants; sweep is signed degrees from p to q.
  function arcGeometry(p, q, edge) {
    const c = Math.hypot(q.x - p.x, q.y - p.y);
    if (!(c > 1e-9)) return { cx: p.x, cy: p.y, r: 0, mid: { x: p.x, y: p.y }, start: 0, end: 0, sweep: 0, a0: 0 }; // zero-length side
    const r = Math.max(edge.radius, c / 2);
    const u = { x: (q.x - p.x) / c, y: (q.y - p.y) / c };
    const left = { x: -u.y, y: u.x };
    const s = edge.bulge === 'out' ? -1 : 1; // centre sits opposite the bulge
    const h = Math.sqrt(Math.max(0, r * r - (c / 2) ** 2));
    const m = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
    const cx = m.x + left.x * h * s, cy = m.y + left.y * h * s;
    const mid = { x: cx - left.x * r * s, y: cy - left.y * r * s };
    const ang = (pt) => ((Math.atan2(pt.y - cy, pt.x - cx) * 180 / Math.PI) + 360) % 360;
    const aP = ang(p), aQ = ang(q), aM = ang(mid);
    const ccw = (a, b) => (b - a + 360) % 360;
    const viaCcw = ccw(aP, aM) <= ccw(aP, aQ);
    return {
      cx, cy, r, mid,
      start: viaCcw ? aP : aQ, end: viaCcw ? aQ : aP,
      sweep: viaCcw ? ccw(aP, aQ) : -ccw(aQ, aP),
      a0: aP,
    };
  }

  return { solve, parseNumber, fmt, arcGeometry, interiorAt, areaBreakdown, STATUS_LABEL };
})();

if (typeof module !== 'undefined') module.exports = Geometry;
