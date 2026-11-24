// Stroke model for the draw mode: strokes as point lists in a fixed 1600 x 1200 space, with undo.
const Drawing = (() => {
  const WIDTH = 1600, HEIGHT = 1200, LINE = 12; // about 2 px on a 300 px wide phone canvas

  function createModel() {
    let current = null;
    const actions = []; // { type: 'stroke' } | { type: 'clear', saved }
    const model = {
      strokes: [],
      begin(p) {
        current = [{ x: p.x, y: p.y }];
        model.strokes.push(current);
        actions.push({ type: 'stroke' });
      },
      extend(p) {
        if (current) current.push({ x: p.x, y: p.y });
      },
      end() { current = null; },
      undo() {
        const a = actions.pop();
        if (!a) return false;
        current = null;
        if (a.type === 'stroke') model.strokes.pop();
        else model.strokes = a.saved;
        return true;
      },
      clear() {
        if (!model.strokes.length) return;
        actions.push({ type: 'clear', saved: model.strokes });
        model.strokes = [];
        current = null;
      },
      isEmpty: () => model.strokes.length === 0,
      canUndo: () => actions.length > 0,
    };
    return model;
  }

  // Paints the model onto a 2D context sized WIDTH x HEIGHT (browser only).
  function paint(ctx, model, { background = null, ink = '#1c1917' } = {}) {
    ctx.clearRect(0, 0, WIDTH, HEIGHT);
    if (background) { ctx.fillStyle = background; ctx.fillRect(0, 0, WIDTH, HEIGHT); }
    ctx.strokeStyle = ink; ctx.fillStyle = ink;
    ctx.lineWidth = LINE; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    model.strokes.forEach((s) => {
      if (s.length === 1) { ctx.beginPath(); ctx.arc(s[0].x, s[0].y, LINE / 2, 0, Math.PI * 2); ctx.fill(); return; }
      ctx.beginPath();
      ctx.moveTo(s[0].x, s[0].y);
      s.slice(1).forEach((p) => ctx.lineTo(p.x, p.y));
      ctx.stroke();
    });
  }

  return { createModel, paint, WIDTH, HEIGHT, LINE };
})();

if (typeof module !== 'undefined') module.exports = Drawing;
