const { test } = require('node:test');
const assert = require('node:assert');
const D = require('../../apps/sketsa/drawing.js');

test('a stroke records its points', () => {
  const m = D.createModel();
  m.begin({ x: 0, y: 0 }); m.extend({ x: 10, y: 0 }); m.end();
  assert.equal(m.strokes.length, 1);
  assert.deepEqual(m.strokes[0], [{ x: 0, y: 0 }, { x: 10, y: 0 }]);
});

test('a tap without movement is kept as a dot', () => {
  const m = D.createModel();
  m.begin({ x: 5, y: 5 }); m.end();
  assert.equal(m.strokes.length, 1);
  assert.equal(m.strokes[0].length, 1);
  assert.equal(m.isEmpty(), false);
});

test('extend without begin is ignored', () => {
  const m = D.createModel();
  m.extend({ x: 1, y: 1 }); m.end();
  assert.equal(m.strokes.length, 0);
});

test('undo removes the last stroke', () => {
  const m = D.createModel();
  m.begin({ x: 0, y: 0 }); m.end();
  m.begin({ x: 9, y: 9 }); m.end();
  assert.equal(m.undo(), true);
  assert.deepEqual(m.strokes, [[{ x: 0, y: 0 }]]);
});

test('clear empties the canvas and undo brings the strokes back', () => {
  const m = D.createModel();
  m.begin({ x: 0, y: 0 }); m.extend({ x: 3, y: 4 }); m.end();
  m.clear();
  assert.equal(m.isEmpty(), true);
  assert.equal(m.undo(), true);
  assert.deepEqual(m.strokes, [[{ x: 0, y: 0 }, { x: 3, y: 4 }]]);
});

test('undo on a fresh model returns false', () => {
  const m = D.createModel();
  assert.equal(m.canUndo(), false);
  assert.equal(m.undo(), false);
});

test('isEmpty is true for a new model and after clearing', () => {
  const m = D.createModel();
  assert.equal(m.isEmpty(), true);
  m.begin({ x: 1, y: 1 }); m.end();
  m.clear();
  assert.equal(m.isEmpty(), true);
});

test('clearing an empty canvas adds nothing to undo', () => {
  const m = D.createModel();
  m.clear();
  assert.equal(m.canUndo(), false);
});

test('a stroke keeps the style it was drawn with, also after undoing a clear', () => {
  const m = D.createModel();
  const red = { color: '#b42318', width: 22, hl: false };
  m.begin({ x: 0, y: 0 }, red); m.extend({ x: 5, y: 5 }); m.end();
  assert.deepEqual(m.styleOf(m.strokes[0]), red);
  m.clear(); m.undo();
  assert.deepEqual(m.styleOf(m.strokes[0]), red);
});

test('a stroke without a style falls back to the default pen', () => {
  const m = D.createModel();
  m.begin({ x: 1, y: 1 }); m.end();
  assert.deepEqual(m.styleOf(m.strokes[0]), { color: null, width: D.LINE, hl: false });
});

function fakeCtx() {
  const calls = [];
  return new Proxy({ calls }, {
    get: (t, k) => (k === 'calls' ? calls : (...a) => { calls.push([k, ...a]); }),
    set: (t, k, v) => { calls.push(['set', k, v]); return true; },
  });
}

test('paint uses each stroke colour, width and a see-through highlighter', () => {
  const m = D.createModel();
  m.begin({ x: 0, y: 0 }, { color: '#b42318', width: 22, hl: false }); m.extend({ x: 9, y: 9 }); m.end();
  m.begin({ x: 0, y: 5 }, { color: '#facc15', width: 40, hl: true }); m.extend({ x: 9, y: 5 }); m.end();
  const c = fakeCtx();
  D.paint(c, m, {});
  const sets = c.calls.filter((x) => x[0] === 'set');
  assert.ok(sets.some((x) => x[1] === 'strokeStyle' && x[2] === '#b42318'));
  assert.ok(sets.some((x) => x[1] === 'lineWidth' && x[2] === 22));
  assert.ok(sets.some((x) => x[1] === 'globalAlpha' && x[2] < 1));
});

test('painting for the AI read draws plain black and skips the highlighter', () => {
  const m = D.createModel();
  m.begin({ x: 0, y: 0 }, { color: '#b42318', width: 22, hl: false }); m.extend({ x: 9, y: 9 }); m.end();
  m.begin({ x: 0, y: 5 }, { color: '#facc15', width: 40, hl: true }); m.extend({ x: 9, y: 5 }); m.end();
  const c = fakeCtx();
  D.paint(c, m, { forRead: true, ink: '#000000', background: '#ffffff' });
  const sets = c.calls.filter((x) => x[0] === 'set');
  assert.ok(!sets.some((x) => x[1] === 'strokeStyle' && x[2] === '#b42318'));
  assert.equal(c.calls.filter((x) => x[0] === 'stroke').length, 1);
});
