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
