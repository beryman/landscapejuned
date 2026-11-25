// Stroke model for the draw mode: strokes as point lists in a fixed 1600 x 1200 space, with undo.
const Drawing = (() => {
  const WIDTH = 1600, HEIGHT = 1200, LINE = 12; // about 2 px on a 300 px wide phone canvas

  function createModel() {
    let current = null;
    const styles = new WeakMap(); // goresan -> { color, width, hl }; array goresan tetap berisi titik saja
    const actions = []; // { type: 'stroke' } | { type: 'clear', saved }
    const model = {
      strokes: [],
      begin(p, style) {
        current = [{ x: p.x, y: p.y }];
        if (style) styles.set(current, { color: style.color ?? null, width: style.width ?? LINE, hl: !!style.hl });
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
      styleOf: (s) => styles.get(s) || { color: null, width: LINE, hl: false },
      isEmpty: () => model.strokes.length === 0,
      canUndo: () => actions.length > 0,
    };
    return model;
  }

  const HL_ALPHA = 0.35;

  // Paints the model onto a 2D context sized WIDTH x HEIGHT (browser only).
  // forRead: plain ink for the AI, so colour does not matter and highlighter strokes are left out.
  function paint(ctx, model, { background = null, ink = '#1c1917', forRead = false } = {}) {
    ctx.clearRect(0, 0, WIDTH, HEIGHT);
    if (background) { ctx.fillStyle = background; ctx.fillRect(0, 0, WIDTH, HEIGHT); }
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    model.strokes.forEach((s) => {
      const st = model.styleOf(s);
      if (forRead && st.hl) return;
      const color = forRead ? ink : (st.color || ink);
      ctx.globalAlpha = st.hl && !forRead ? HL_ALPHA : 1;
      ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = st.width;
      if (s.length === 1) { ctx.beginPath(); ctx.arc(s[0].x, s[0].y, st.width / 2, 0, Math.PI * 2); ctx.fill(); return; }
      ctx.beginPath();
      ctx.moveTo(s[0].x, s[0].y);
      s.slice(1).forEach((p) => ctx.lineTo(p.x, p.y));
      ctx.stroke();
    });
    ctx.globalAlpha = 1;
  }

  return { createModel, paint, WIDTH, HEIGHT, LINE };
})();

if (typeof module !== 'undefined') module.exports = Drawing;
