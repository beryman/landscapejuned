const { test } = require('node:test');
const assert = require('node:assert');
const G = require('../../apps/sketsa/geometry.js');
const L = require('./fixtures/l-shape.json');

const close = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;
const line = (length) => ({ length, kind: 'line', radius: null, bulge: 'out' });
const v = (x, y, interiorAngle = null) => ({ x, y, interiorAngle });
const sketch = (vertices, edges) => ({ unit: null, vertices, edges, notes: [] });

test('L sketch: right side computed, horizontal conflict reported', () => {
  const s = G.solve(L);
  assert.ok(close(s.edges[3].length, 12));
  assert.equal(s.edges[3].lengthStatus, 'computed');
  assert.equal(s.status, 'conflict');
  assert.equal(s.conflicts[0].message, 'Arah mendatar: 12 + 13 = 25 ≠ 50');
  assert.deepEqual([...s.conflicts[0].edges].sort(), [0, 2, 4]);
  assert.ok(close(s.gap.dx, 25));
  assert.equal(s.area, null);
});

test('L sketch fixed (bottom 25): ok, closed, area 468', () => {
  const fixed = structuredClone(L);
  fixed.edges[4].length = 25;
  const s = G.solve(fixed);
  assert.equal(s.status, 'ok');
  assert.equal(s.gap, null);
  assert.ok(close(s.area, 468));
  assert.ok(s.edges.every((e) => e.angleStatus === 'right'));
});

test('slanted side with all four lengths written gets its angle computed', () => {
  // top 20 east, slant down-right (20 across, 30 down), bottom 40 west, left 30 north.
  // Pixel C is drawn sloppy (480 instead of 500) so the sketch angle is wrong.
  const s = G.solve(sketch(
    [v(100, 100), v(300, 100), v(480, 400), v(100, 400)],
    [line(20), line(Math.sqrt(1300)), line(40), line(30)],
  ));
  assert.equal(s.status, 'ok');
  assert.equal(s.edges[1].angleStatus, 'computed');
  assert.ok(close(s.edges[1].angle, Math.atan2(-30, 20) * 180 / Math.PI, 1e-4));
});

test('written interior angle sets direction of the slanted side', () => {
  // right isosceles triangle: A top, B bottom-right, C bottom-left. Angle at B written 45.
  const s = G.solve(sketch(
    [v(100, 100), v(300, 270, 45), v(100, 300)],
    [line(null), line(20), line(20)],
  ));
  assert.equal(s.status, 'ok');
  assert.equal(s.edges[0].angleStatus, 'written');
  assert.ok(close(s.edges[0].angle, -45, 1e-6));
  assert.ok(close(s.edges[0].length, Math.sqrt(800), 1e-6));
  assert.equal(s.edges[0].lengthStatus, 'computed');
});

test('more than 2 unknowns: estimated from sketch, status underdetermined, still closed', () => {
  const s = G.solve(sketch(
    L.vertices,
    [line(12), line(null), line(13), line(null), line(25), line(null)],
  ));
  assert.equal(s.status, 'underdetermined');
  assert.ok(s.edges.some((e) => e.lengthStatus === 'estimated'));
  assert.equal(s.gap, null);
});

test('arc edge: written radius used and segment area added', () => {
  const arc = { length: 10, kind: 'arc', radius: 8, bulge: 'out' };
  const s = G.solve(sketch(
    [v(0, 0), v(200, 0), v(200, 100), v(0, 100)],
    [line(20), arc, line(20), line(10)],
  ));
  assert.equal(s.status, 'ok');
  assert.equal(s.edges[1].radiusStatus, 'written');
  const th = 2 * Math.asin(5 / 8);
  assert.ok(close(s.area, 200 + 32 * (th - Math.sin(th)), 1e-6));
});

test('arc radius smaller than half the chord is a conflict', () => {
  const arc = { length: 10, kind: 'arc', radius: 4, bulge: 'out' };
  const s = G.solve(sketch(
    [v(0, 0), v(200, 0), v(200, 100), v(0, 100)],
    [line(20), arc, line(20), line(10)],
  ));
  assert.equal(s.status, 'conflict');
  assert.equal(s.edges[1].radiusStatus, 'conflict');
  assert.equal(s.conflicts[0].message, 'Radius 4 lebih kecil dari setengah tali busur 5');
});

test('arc without radius gets an estimated radius', () => {
  const arc = { length: 10, kind: 'arc', radius: null, bulge: 'out' };
  const s = G.solve(sketch(
    [v(0, 0), v(200, 0), v(200, 100), v(0, 100)],
    [line(20), arc, line(20), line(10)],
  ));
  assert.equal(s.edges[1].radiusStatus, 'estimated');
  assert.equal(s.status, 'underdetermined');
});

test('counter-clockwise input is normalised to the same shape', () => {
  const fixed = structuredClone(L);
  fixed.edges[4].length = 25;
  // Walk the same outline the other way: v0, v5, v4 ... ; edge j joins those, i.e. original edge n-1-j.
  const n = fixed.vertices.length;
  const rev = sketch(
    fixed.vertices.map((_, j) => fixed.vertices[(n - j) % n]),
    fixed.edges.map((_, j) => fixed.edges[n - 1 - j]),
  );
  const s = G.solve(rev);
  assert.equal(s.status, 'ok');
  assert.ok(close(s.area, 468));
});

test('3 vertices and no lengths: no throw, underdetermined', () => {
  const s = G.solve(sketch([v(0, 0), v(100, 0), v(50, 80)], [line(null), line(null), line(null)]));
  assert.equal(s.status, 'underdetermined');
});

test('a written interior angle that the solved shape does not honour is a conflict', () => {
  const sq = sketch(
    [v(0, 0, 90), v(100, 0, 90), v(100, 100, 90), v(0, 100, 80)],
    [line(10), line(10), line(null), line(null)],
  );
  const s = G.solve(sq);
  assert.equal(s.status, 'conflict');
  assert.ok(s.conflicts.some((c) => c.message.startsWith('Sudut di titik')), JSON.stringify(s.conflicts));
});

test('a solved length that goes negative only because of estimates is underdetermined, not a conflict', () => {
  // The step (side 2) is drawn far too tall, so its estimate pushes side 4 below zero.
  const tall = [v(0, 0), v(100, 0), v(100, 300), v(200, 300), v(200, 400), v(0, 400)];
  const s = G.solve(sketch(tall, [line(12), line(null), line(13), line(null), line(25), line(10)]));
  assert.notEqual(s.status, 'conflict', JSON.stringify(s.conflicts));
  assert.equal(s.status, 'underdetermined');
});

test('area breakdown: the L splits into 12 x 26 and 13 x 12', () => {
  const fixed = structuredClone(L); fixed.edges[4].length = 25;
  const b = G.areaBreakdown(G.solve(fixed));
  assert.equal(b.pieces.length, 2);
  assert.deepEqual(b.pieces.map((p) => [p.kind, Math.round(p.w), Math.round(p.h0)]), [['rect', 12, 26], ['rect', 13, 12]]);
  assert.ok(close(b.total, 468));
});

test('area breakdown: a slanted side becomes a triangle or trapezoid piece', () => {
  const s = G.solve(sketch([v(100, 100), v(500, 100), v(800, 700), v(100, 700)], [line(4), line(null), line(7), line(6)]));
  const b = G.areaBreakdown(s);
  assert.deepEqual(b.pieces.map((p) => p.kind), ['rect', 'trap']);
  assert.ok(close(b.pieces[0].area, 24) && close(b.pieces[1].area, 9));
  assert.ok(close(b.total, 33));
});

test('area breakdown: an arc side adds its segment and the total matches the solved area', () => {
  const arc = { length: 10, kind: 'arc', radius: 8, bulge: 'out' };
  const s = G.solve(sketch([v(0, 0), v(200, 0), v(200, 100), v(0, 100)], [line(20), arc, line(20), line(10)]));
  const b = G.areaBreakdown(s);
  assert.equal(b.pieces.length, 1);
  assert.equal(b.arcs.length, 1);
  assert.ok(close(b.total, s.area));
});

test('area breakdown: a U shape gives three pieces that sum to the area', () => {
  // U opening upward: 30 wide, 20 tall, notch 10 wide and 12 deep in the middle.
  const s = G.solve(sketch(
    [v(0, 0), v(100, 0), v(100, 120), v(200, 120), v(200, 0), v(300, 0), v(300, 200), v(0, 200)],
    [line(10), line(12), line(10), line(12), line(10), line(20), line(30), line(20)],
  ));
  const b = G.areaBreakdown(s);
  assert.equal(s.status, 'ok');
  assert.equal(b.pieces.length, 3);
  assert.ok(close(b.total, 10 * 20 + 10 * 8 + 10 * 20));
});

test('area breakdown is null while the outline is in conflict', () => {
  assert.equal(G.areaBreakdown(G.solve(L)), null);
});

test('parseNumber handles comma decimals, spaces, empty and junk', () => {
  assert.equal(G.parseNumber('12,5'), 12.5);
  assert.equal(G.parseNumber('12.5'), 12.5);
  assert.equal(G.parseNumber(' 7 '), 7);
  assert.equal(G.parseNumber(''), null);
  assert.equal(G.parseNumber('abc'), null);
  assert.equal(G.parseNumber(null), null);
  assert.equal(G.parseNumber(3), 3);
});

test('two corners on the same spot with an arc between them: no NaN anywhere', () => {
  const arc = { length: null, kind: 'arc', radius: 56, bulge: 'in' };
  const s = G.solve(sketch([v(100, 100), v(100, 100), v(500, 100), v(500, 400), v(100, 400)], [arc, line(40), line(30), line(40), line(30)]));
  assert.ok(s.points.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)), JSON.stringify(s.points));
  assert.ok(s.area === null || Number.isFinite(s.area), `area ${s.area}`);
  const g = G.arcGeometry({ x: 1, y: 1 }, { x: 1, y: 1 }, { radius: 5, bulge: 'out' });
  assert.ok([g.cx, g.cy, g.r, g.mid.x, g.mid.y, g.start, g.end, g.sweep].every(Number.isFinite), JSON.stringify(g));
});

test('an arc whose solved chord goes negative never makes the area NaN', () => {
  // all corners drawn on one line; the arc side gets a negative estimate
  const flat = [0, 100, 200, 300, 400, 500].map((x) => v(x, 500));
  const s = G.solve(sketch(flat, [line(null), line(5.8), line(311.7), line(346.5), { length: null, kind: 'arc', radius: 398, bulge: 'out' }, line(15.5)]));
  assert.ok(s.area === null || Number.isFinite(s.area), `area ${s.area}`);
});

test('an outline that crosses itself gets no area, so the sheet never shows two different totals', () => {
  // a bow tie: written sizes that close but cross
  const s = G.solve(sketch([v(0, 0, 45), v(200, 200), v(200, 0), v(0, 200)], [line(Math.sqrt(800)), line(20), line(Math.sqrt(800)), line(20)]));
  assert.equal(s.area, null);
  assert.ok(s.conflicts.some((c) => /memotong/.test(c.message)), JSON.stringify(s.conflicts));
});
