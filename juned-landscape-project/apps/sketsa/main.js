// Browser glue: state, edits, AI reading and downloads.
(() => {
  const $ = (sel) => document.querySelector(sel);
  const KEY = 'sgk.apiKey', MODEL = 'sgk.model', DEFAULT_MODEL = 'gemini-3.8-flash';

  // Di dalam Juned Landscape: bidang tujuan dari alamat, kunci dan model dari pengaturan Katalog (KV jlp:sync:gemini).
  const params = new URLSearchParams(location.search);
  const host = params.get('embed') === '1' && params.get('f') ? { survey: params.get('p'), field: params.get('f'), name: params.get('n') || '' } : null;
  const shell = (() => { try { return window.parent !== window ? window.parent.JLPShell : null; } catch (_) { return null; } })();
  async function aiConfig() {
    if (!host) return { key: localStorage.getItem(KEY) || '', models: [localStorage.getItem(MODEL) || DEFAULT_MODEL] };
    await KV.ready;
    let c = null; try { c = JSON.parse(KV.ls.getItem('jlp:sync:gemini') || 'null'); } catch (_) {}
    const models = String((c && c.models) || '').split(',').map((m) => m.trim()).filter(Boolean);
    return { key: String((c && c.key) || '').trim(), models: models.length ? models : ['gemini-3.6-flash', 'gemini-3.5-flash'] };
  }
  // Model tidak ada (404): coba model berikutnya, seperti pengenalan tanaman di Katalog.
  async function readWithModels(part, cfg) {
    let last;
    for (const model of cfg.models) {
      try { return await Gemini.readSketch(part, cfg.key, model); }
      catch (err) { last = err; if (err.message !== Gemini.ERR.model) throw err; }
    }
    throw last;
  }

  // The user's own L sketch (contoh-sketsa.png), corners normalised 0..1000 like Gemini returns.
  const EXAMPLE = {
    unit: null, notes: [],
    vertices: [[227.5, 212.8], [544.9, 207.2], [548.5, 480.2], [820.4, 467.0], [835.9, 762.7], [227.5, 772.1]]
      .map(([x, y]) => ({ x, y, interiorAngle: null })),
    edges: [12, 14, 13, null, 50, 26].map((length) => ({ length, kind: 'line', radius: null, bulge: 'out' })),
  };

  const state = {
    sketch: structuredClone(EXAMPLE), solved: null, unit: 'cm', paper: 'A4', scale: 'auto',
    image: null, busy: false, error: null, active: null, depth: null,
  };

  const els = {
    unit: $('#unit'), settingsToggle: $('#settings-toggle'), settings: $('#settings'), settingsForm: $('#settings-form'),
    apiKey: $('#api-key'), model: $('#model'), clearKey: $('#clear-key'), settingsMsg: $('#settings-msg'),
    file: $('#file'), reread: $('#reread'), sketchNote: $('#sketch-note'), img: $('#sketch-img'), marks: $('#sketch-marks'),
    status: $('#status'), sheet: $('#sheet'), rows: $('#edge-rows'),
    paper: $('#paper'), scale: $('#scale'), exportMsg: $('#export-msg'),
  };

  const fmt = Geometry.fmt;
  const today = () => new Date().toLocaleDateString('sv-SE'); // local YYYY-MM-DD; toISOString is UTC, a day behind before 07:00 WIB
  const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  // ---------- solve + render ----------
  function update({ rebuildRows = false } = {}) {
    state.solved = Geometry.solve(state.sketch);
    if (rebuildRows) buildRows();
    refreshRows();
    renderSheet();
    renderStatus();
    renderMarks();
    renderExport();
    renderUse();
  }

  // ---------- pakai di bidang Survei (hanya di dalam Juned Landscape) ----------
  const use = $('#use'), useBtn = $('#use-btn'), useMsg = $('#use-msg'), useDepth = $('#use-depth'), useDepthUnit = $('#use-depth-unit');
  function renderUse() {
    if (!host) return;
    const r = SketsaField.fromSolved(state.solved, state.unit, state.depth);
    useDepthUnit.textContent = state.unit;
    use.dataset.state = r.ok ? (r.estimated ? 'estimated' : 'ok') : 'blocked';
    useBtn.disabled = !r.ok || state.busy;
    useMsg.textContent = r.ok
      ? `Luas ${fmt(r.area)} m²${r.depth != null ? `, kedalaman ${fmt(r.depth)} m` : ''}${r.estimated ? ', ada ukuran perkiraan' : ''}${r.hasArc ? ', sisi lengkung disimpan sebagai titik pendek' : ''}.`
      : r.reason;
  }
  if (host) {
    use.hidden = false;
    useBtn.textContent = host.name ? `Pakai di bidang ${host.name}` : 'Pakai di bidang';
    useBtn.addEventListener('click', async () => {
      const r = SketsaField.fromSolved(state.solved, state.unit, state.depth);   // dihitung ulang: bentuk bertentangan tidak pernah tersimpan
      if (!r.ok) { useMsg.textContent = r.reason; return; }
      if (!shell || !shell.applySketch) { useMsg.textContent = 'Tidak tersambung ke aplikasi Juned Landscape. Tutup lalu buka lagi dari bidang.'; return; }
      useBtn.disabled = true; useMsg.textContent = 'Menyimpan ke bidang…';
      try {
        const out = await shell.applySketch({ survey: host.survey, field: host.field }, r);
        if (!out.ok) { useMsg.textContent = out.reason; renderUse(); }
      } catch (err) { useMsg.textContent = 'Gagal menyimpan: ' + err.message; renderUse(); }
    });
    useDepth.addEventListener('input', () => { state.depth = Geometry.parseNumber(useDepth.value); renderUse(); });
    els.settingsToggle.hidden = true; els.settings.hidden = true;   // kunci diatur di Pengaturan utama
  }

  // The engine normalises to clockwise; row i always maps to solved edge i when the sketch was clockwise.
  // Gemini and the example are clockwise; a CCW read is turned around once here so rows and drawing agree.
  function adoptClockwise() {
    state.sketch = Geometry.solve(state.sketch).clockwiseSketch;
  }

  function renderSheet() {
    const s = state.solved;
    const scale = currentScale();
    els.sheet.innerHTML = Render.toSVG(s, { unit: state.unit, title: 'Gambar kerja', date: today(), scaleLabel: `1:${scale.scale}` });
    highlight();
  }

  function renderStatus() {
    const s = state.solved, parts = [];
    if (state.busy) parts.push('<div class="alert alert--busy"><strong>AI sedang membaca sketsa.</strong><span>Biasanya beberapa detik.</span></div>');
    if (state.error) {
      const keyProblem = /API key/.test(state.error);
      const action = keyProblem
        ? (host ? '' : '<button type="button" class="btn btn--small" data-act="open-settings">Buka Pengaturan</button>')
        : (state.image ? '<button type="button" class="btn btn--small" data-act="retry">Coba lagi</button>' : '');
      parts.push(`<div class="alert alert--error"><strong>${esc(state.error)}</strong>${state.image ? '<span>Gambar terakhir yang berhasil tetap ditampilkan.</span>' : ''}${action}</div>`);
    }
    if (s.status === 'conflict') {
      parts.push(`<div class="alert alert--conflict"><strong>Ukuran bertentangan. Betulkan angkanya sebelum ekspor.</strong><ul>${s.conflicts.map((c) => `<li>${esc(c.message)}</li>`).join('')}</ul></div>`);
    } else if (s.status === 'underdetermined') {
      parts.push('<div class="alert alert--estimated"><strong>Ada ukuran perkiraan (~).</strong><span>Lengkapi angka yang kurang supaya gambarnya pasti.</span></div>');
    } else {
      parts.push('<span class="chip-ok">Semua ukuran cocok</span>');
    }
    els.status.innerHTML = parts.join('');
  }

  // ---------- edge table ----------
  const statusText = (st, value) => {
    if (st === 'computed') return `${Geometry.STATUS_LABEL.computed} ${value}`;
    if (st === 'estimated') return `${Geometry.STATUS_LABEL.estimated} ~${value}`;
    return Geometry.STATUS_LABEL[st] || '';
  };

  function buildRows() {
    const n = state.sketch.vertices.length;
    els.rows.innerHTML = state.sketch.edges.map((e, i) => {
      const v = state.sketch.vertices[i];
      const no = i + 1;
      return `<tr data-row="${i}">
        <th scope="row">${no}</th>
        <td data-label="Panjang"><input aria-label="Panjang sisi ${no}" inputmode="decimal" autocomplete="off" data-field="length" value="${e.length ?? ''}"></td>
        <td data-label="Status"><span class="tag" data-status></span></td>
        <td data-label="Sudut dalam"><input aria-label="Sudut dalam di awal sisi ${no}, derajat" inputmode="decimal" autocomplete="off" data-field="angle" value="${v.interiorAngle ?? ''}"></td>
        <td data-label="Jenis"><select aria-label="Jenis sisi ${no}" data-field="kind"><option value="line"${e.kind === 'line' ? ' selected' : ''}>Garis</option><option value="arc"${e.kind === 'arc' ? ' selected' : ''}>Busur</option></select></td>
        <td data-label="Radius" class="radius-cell${e.kind === 'arc' ? '' : ' is-off'}"><input aria-label="Radius sisi ${no}" inputmode="decimal" autocomplete="off" data-field="radius" value="${e.radius ?? ''}"${e.kind === 'arc' ? '' : ' disabled'}></td>
        <td class="row-actions-cell"><div class="row-actions">
          <button type="button" class="btn btn--small" data-act="split" aria-label="Pecah sisi ${no} jadi dua">Pecah</button>
          <button type="button" class="btn btn--small" data-act="remove" aria-label="Hapus titik di awal sisi ${no}"${n <= 3 ? ' disabled' : ''}>Hapus titik</button>
        </div></td>
      </tr>`;
    }).join('');
  }

  function refreshRows() {
    const s = state.solved;
    els.rows.querySelectorAll('tr').forEach((tr, i) => {
      const e = s.edges[i];
      if (!e) return;
      const tag = tr.querySelector('[data-status]');
      tag.className = `tag tag--${e.lengthStatus}`;
      tag.textContent = statusText(e.lengthStatus, fmt(e.length));
      const len = tr.querySelector('[data-field="length"]');
      len.placeholder = e.lengthStatus === 'written' || e.lengthStatus === 'conflict' ? '' : fmt(e.length);
      const rad = tr.querySelector('[data-field="radius"]');
      rad.placeholder = e.kind === 'arc' && e.radiusStatus === 'estimated' ? `~${fmt(e.radius)}` : '';
    });
  }

  els.rows.addEventListener('change', (ev) => {
    const tr = ev.target.closest('tr');
    if (!tr) return;
    const i = Number(tr.dataset.row), field = ev.target.dataset.field;
    const edge = state.sketch.edges[i];
    if (field === 'kind') {
      edge.kind = ev.target.value;
      tr.querySelector('[data-field="radius"]').disabled = edge.kind !== 'arc';
      tr.querySelector('.radius-cell').classList.toggle('is-off', edge.kind !== 'arc');
      update();
      return;
    }
    const raw = ev.target.value.trim();
    const value = Geometry.parseNumber(raw);
    const invalid = raw !== '' && (value === null || value <= 0 || (field === 'angle' && value >= 360));
    ev.target.setAttribute('aria-invalid', String(invalid));
    if (invalid) return;
    if (field === 'length') edge.length = value;
    if (field === 'radius') edge.radius = value;
    if (field === 'angle') state.sketch.vertices[i].interiorAngle = value;
    state.error = null; // the user moved on; an old read error no longer describes the screen
    update();
  });

  els.rows.addEventListener('click', (ev) => {
    const btn = ev.target.closest('button[data-act]');
    if (!btn) return;
    const i = Number(btn.closest('tr').dataset.row);
    const { vertices, edges } = state.sketch;
    const n = vertices.length;
    if (btn.dataset.act === 'split') {
      const a = vertices[i], b = vertices[(i + 1) % n];
      vertices.splice(i + 1, 0, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, interiorAngle: null });
      edges[i] = { ...edges[i], length: null };
      edges.splice(i + 1, 0, { ...edges[i] });
    } else if (btn.dataset.act === 'remove' && n > 3) {
      vertices.splice(i, 1);
      edges.splice(i, 1);
      const prev = (i - 1 + edges.length) % edges.length;
      edges[prev] = { ...edges[prev], length: null };
    }
    state.active = null;
    update({ rebuildRows: true });
    const target = els.rows.querySelector(`tr[data-row="${Math.min(i, state.sketch.edges.length - 1)}"] input`);
    if (target) target.focus();
  });

  els.rows.addEventListener('focusin', (ev) => {
    const tr = ev.target.closest('tr');
    if (tr) { state.active = Number(tr.dataset.row); highlight(); }
  });

  // ---------- highlight on the sheet and the photo ----------
  function highlight() {
    els.rows.querySelectorAll('tr').forEach((tr) => tr.classList.toggle('is-active', Number(tr.dataset.row) === state.active));
    els.sheet.querySelectorAll('g.dim[data-edge]').forEach((g) => g.classList.toggle('is-active', Number(g.dataset.edge) === state.active));
    renderMarks();
  }

  function renderMarks() {
    const { vertices } = state.sketch, n = vertices.length;
    const frame = els.marks.parentElement;
    frame.querySelectorAll('.edge-tag').forEach((t) => t.remove());
    let lines = '';
    vertices.forEach((a, i) => {
      const b = vertices[(i + 1) % n];
      if (i === state.active) lines += `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"/>`;
      const tag = document.createElement('span');
      tag.className = `edge-tag${i === state.active ? ' is-active' : ''}`;
      tag.textContent = String(i + 1);
      tag.setAttribute('aria-hidden', 'true');
      tag.style.left = `${(a.x + b.x) / 20}%`;
      tag.style.top = `${(a.y + b.y) / 20}%`;
      frame.appendChild(tag);
    });
    els.marks.innerHTML = lines;
  }

  // ---------- export ----------
  function currentScale() {
    const scale = state.scale === 'auto' ? Export.pickScale(state.solved, state.paper, state.unit).scale : Number(state.scale);
    return { scale, fits: Export.fitsAt(state.solved, state.paper, state.unit, scale) };
  }

  function renderExport() {
    const auto = Export.pickScale(state.solved, state.paper, state.unit);
    els.scale.innerHTML = [`<option value="auto">Otomatis (1:${auto.scale})</option>`]
      .concat(Export.SCALES.map((k) => `<option value="${k}">1:${k}</option>`)).join('');
    els.scale.value = state.scale;
    const { fits } = currentScale();
    const conflict = state.solved.status === 'conflict';
    // DXF is model space with no paper, so only the printable formats care whether the sheet fits.
    document.querySelectorAll('[data-export]').forEach((b) => { b.disabled = conflict || (!fits && b.dataset.export !== 'dxf'); });
    let msg = '';
    if (conflict) msg = 'Ekspor dikunci: betulkan ukuran yang bertentangan dulu.';
    else if (!fits && !auto.fits) msg = `Bidang terlalu besar untuk ${state.paper}, bahkan di skala 1:500. ${state.paper === 'A4' ? 'Coba A3, atau ' : ''}ekspor DXF untuk dibuka di CAD.`;
    else if (!fits) msg = `Gambar tidak muat di ${state.paper} pada skala ini. Pilih skala otomatis (1:${auto.scale}).`;
    else if (state.solved.status === 'underdetermined') msg = 'Ada ukuran perkiraan. Catatan ini ikut tercetak di gambar.';
    els.exportMsg.textContent = msg;
  }

  function download(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function exportAs(kind) {
    const s = state.solved;
    if (s.status === 'conflict' || (kind !== 'dxf' && !currentScale().fits)) return;
    const scale = state.scale === 'auto' ? Export.pickScale(s, state.paper, state.unit).scale : Number(state.scale);
    const name = `gambar-kerja-${today()}`;
    const note = s.status === 'underdetermined' ? 'Ada ukuran perkiraan (~)' : '';
    if (kind === 'pdf') {
      download(new Blob([Export.toPDF(s, { paper: state.paper, scale, unit: state.unit, title: 'Gambar kerja', date: today(), note })], { type: 'application/pdf' }), `${name}.pdf`);
    } else if (kind === 'dxf') {
      download(new Blob([Export.toDXF(s, state.unit, note)], { type: 'application/dxf' }), `${name}.dxf`);
    } else if (kind === 'png') {
      const w = 2400;
      const svg = Render.toSVG(s, { unit: state.unit, title: 'Gambar kerja', date: today(), scaleLabel: `1:${scale}`, note, pixelWidth: w });
      const img = new Image();
      img.src = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
      await img.decode();
      const h = Number(svg.match(/ height="(\d+)"/)[1]);
      const canvas = Object.assign(document.createElement('canvas'), { width: w, height: h });
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(img.src);
      canvas.toBlob((blob) => download(blob, `${name}.png`), 'image/png');
    }
    els.exportMsg.textContent = `${kind.toUpperCase()} diunduh: ${name}.${kind}`;
  }

  document.querySelectorAll('[data-export]').forEach((b) => b.addEventListener('click', () => exportAs(b.dataset.export)));
  els.paper.addEventListener('change', () => { state.paper = els.paper.value; renderExport(); renderSheet(); });
  els.scale.addEventListener('change', () => { state.scale = els.scale.value; renderExport(); renderSheet(); });
  els.unit.addEventListener('change', () => { state.unit = els.unit.value; update(); });

  // ---------- reading a sketch ----------
  async function toImagePart(file) {
    let bitmap;
    try { bitmap = await createImageBitmap(file); } catch { throw new Error('Format gambar tidak bisa dibuka. Gunakan JPG atau PNG.'); }
    const k = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height));
    const canvas = Object.assign(document.createElement('canvas'), { width: Math.round(bitmap.width * k), height: Math.round(bitmap.height * k) });
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff'; // flatten transparent tablet exports onto white
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return { data: canvas.toDataURL('image/jpeg', 0.9).split(',')[1], mimeType: 'image/jpeg', width: canvas.width, height: canvas.height };
  }

  // The browser cannot paint a PDF page, so the preview is the outline Gemini read, on a page of the same shape.
  function outlinePreview(sketch, part) {
    const k = 1000 / Math.max(part.width, part.height);
    const canvas = Object.assign(document.createElement('canvas'), { width: Math.round(part.width * k), height: Math.round(part.height * k) });
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.beginPath();
    sketch.vertices.forEach((v) => ctx.lineTo((v.x / 1000) * canvas.width, (v.y / 1000) * canvas.height));
    ctx.closePath();
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#1c1917';
    ctx.stroke();
    return canvas.toDataURL('image/png');
  }

  async function readCurrent() {
    if (!state.image || state.busy) return;
    state.busy = true; state.error = null;
    els.rows.closest('table').inert = true; // edits made now would be replaced by the AI result
    els.sheet.setAttribute('aria-busy', 'true');
    els.reread.setAttribute('aria-busy', 'true');
    renderStatus();
    try {
      const sketch = await readWithModels(state.image.part, await aiConfig());
      state.sketch = sketch;
      state.depth = SketsaField.depthFromNotes(sketch.notes);   // mis. "-100" ditulis di dalam bidang
      if (useDepth) useDepth.value = state.depth == null ? '' : fmt(state.depth);
      adoptClockwise();
      if (sketch.unit) { state.unit = sketch.unit; els.unit.value = sketch.unit; }
      state.active = null;
      els.img.src = state.image.url || outlinePreview(sketch, state.image.part);
      els.img.width = state.image.part.width; els.img.height = state.image.part.height;
      els.img.alt = state.image.url ? 'Sketsa yang kamu unggah' : 'Garis bidang yang terbaca dari PDF';
      els.sketchNote.textContent = sketch.notes.length ? `Catatan yang terbaca: ${sketch.notes.join(', ')}` : 'Periksa nomor sisi di sketsa dengan tabel di bawah.';
    } catch (err) {
      state.error = host ? err.message.replace('di Pengaturan', 'di Pengaturan utama (menu kiri), bagian Gemini') : err.message;
    } finally {
      state.busy = false;
      els.rows.closest('table').inert = false;
      els.sheet.setAttribute('aria-busy', 'false');
      els.reread.removeAttribute('aria-busy');
      update({ rebuildRows: true });
    }
  }

  els.file.addEventListener('change', async () => {
    const file = els.file.files[0];
    els.file.value = '';
    if (!file) return;
    try {
      if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) {
        state.image = { part: Gemini.pdfPart(new Uint8Array(await file.arrayBuffer())), url: null };
      } else {
        const part = await toImagePart(file);
        state.image = { part, url: `data:image/jpeg;base64,${part.data}` };
      }
      els.reread.disabled = false;
      await readCurrent();
    } catch (err) {
      state.error = err.message;
      renderStatus();
    }
  });
  els.reread.addEventListener('click', readCurrent);
  els.status.addEventListener('click', (ev) => {
    const act = ev.target.closest('[data-act]');
    if (!act) return;
    if (act.dataset.act === 'retry') readCurrent();
    if (act.dataset.act === 'open-settings') openSettings(true);
  });

  // ---------- draw mode ----------
  const draw = {
    canvas: $('#draw'), model: Drawing.createModel(), msg: $('#draw-msg'),
    pointer: null, kind: null, blocked: false, active: new Set(), raf: 0, ink: '#1c1917', reading: false,
    read: $('#draw-read'), undo: $('#draw-undo'), clear: $('#draw-clear'),
  };
  const drawCtx = draw.canvas.getContext('2d');

  function repaint() {
    Drawing.paint(drawCtx, draw.model, { ink: draw.ink });
    draw.undo.disabled = !draw.model.canUndo();
    draw.clear.disabled = draw.model.isEmpty();
  }
  // One repaint per frame, however many pointer events arrive.
  const schedule = () => { if (!draw.raf) draw.raf = requestAnimationFrame(() => { draw.raf = 0; repaint(); }); };

  const toLogical = (ev) => {
    const r = draw.canvas.getBoundingClientRect();
    return { x: ((ev.clientX - r.left) / r.width) * Drawing.WIDTH, y: ((ev.clientY - r.top) / r.height) * Drawing.HEIGHT };
  };
  draw.canvas.addEventListener('pointerdown', (ev) => {
    if (ev.pointerType === 'mouse' && ev.button !== 0) return;
    draw.active.add(ev.pointerId);
    if (draw.pointer !== null) {
      // A pen beats a resting palm; a second finger means a pinch, not a line.
      if (draw.kind === 'touch') { draw.model.undo(); draw.pointer = null; schedule(); }
      if (ev.pointerType !== 'pen') { if (ev.pointerType === 'touch') draw.blocked = true; return; }
    }
    if (draw.blocked && ev.pointerType === 'touch') return; // a resting palm never blocks the pen
    draw.pointer = ev.pointerId;
    draw.kind = ev.pointerType;
    try { draw.canvas.setPointerCapture(ev.pointerId); } catch { /* pointer already gone; the stroke still works inside the canvas */ }
    draw.msg.textContent = '';
    draw.model.begin(toLogical(ev));
    schedule();
    ev.preventDefault();
  });
  draw.canvas.addEventListener('pointermove', (ev) => {
    if (ev.pointerId !== draw.pointer) return;
    (ev.getCoalescedEvents ? ev.getCoalescedEvents() : [ev]).forEach((e) => draw.model.extend(toLogical(e)));
    schedule();
  });
  const finish = (ev) => {
    draw.active.delete(ev.pointerId);
    if (!draw.active.size) draw.blocked = false;
    if (ev.pointerId !== draw.pointer) return;
    draw.model.end();
    draw.pointer = null;
    schedule();
  };
  draw.canvas.addEventListener('pointerup', finish);
  draw.canvas.addEventListener('pointercancel', finish);
  draw.undo.addEventListener('click', () => { draw.model.undo(); repaint(); });
  draw.clear.addEventListener('click', () => { draw.model.clear(); repaint(); });

  draw.read.addEventListener('click', async () => {
    if (draw.reading || state.busy) return; // a second press must not swap the picture under a running read
    if (draw.model.isEmpty()) { draw.msg.textContent = 'Kanvas masih kosong. Gambar sketsamu dulu.'; return; }
    draw.reading = true;
    draw.read.disabled = true;
    draw.msg.textContent = 'AI sedang membaca gambar.';
    try {
      const off = Object.assign(document.createElement('canvas'), { width: Drawing.WIDTH, height: Drawing.HEIGHT });
      Drawing.paint(off.getContext('2d'), draw.model, { background: '#ffffff', ink: '#000000' }); // plain black on white reads best
      const blob = await new Promise((resolve) => off.toBlob(resolve, 'image/png'));
      const part = await toImagePart(blob);
      state.image = { part, url: `data:image/jpeg;base64,${part.data}` };
      els.reread.disabled = false;
      await readCurrent();
      if (state.error) {
        draw.msg.textContent = `Gagal dibaca: ${state.error}`;
      } else {
        draw.msg.textContent = '';
        els.img.alt = 'Sketsa yang kamu gambar';
        $('#mode-upload').checked = true; setMode(); // show the read drawing with its side numbers
        els.reread.focus();
      }
    } catch (err) {
      state.error = err.message;
      draw.msg.textContent = `Gagal dibaca: ${err.message}`;
      renderStatus();
    } finally {
      draw.reading = false;
      draw.read.disabled = false;
    }
  });

  function setMode() {
    const drawing = $('#mode-draw').checked;
    $('#draw-pane').hidden = !drawing;
    $('#upload-pane').hidden = drawing;
    if (drawing) {
      draw.ink = getComputedStyle(document.documentElement).getPropertyValue('--color-ink').trim() || '#1c1917';
      repaint();
    }
  }
  document.querySelectorAll('input[name="mode"]').forEach((r) => r.addEventListener('change', setMode));

  // ---------- settings ----------
  function openSettings(open) {
    els.settings.hidden = !open;
    els.settingsToggle.setAttribute('aria-expanded', String(open));
    if (open) {
      els.apiKey.value = localStorage.getItem(KEY) || '';
      els.model.value = localStorage.getItem(MODEL) || DEFAULT_MODEL;
      els.settingsMsg.textContent = '';
      els.apiKey.focus();
    } else {
      els.settingsToggle.focus();
    }
  }
  els.settingsToggle.addEventListener('click', () => openSettings(els.settings.hidden));
  els.settings.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') openSettings(false); });
  els.settingsForm.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const key = els.apiKey.value.trim(), model = els.model.value.trim() || DEFAULT_MODEL;
    if (!key) { els.settingsMsg.textContent = 'API key masih kosong.'; els.apiKey.setAttribute('aria-invalid', 'true'); els.apiKey.focus(); return; }
    els.apiKey.setAttribute('aria-invalid', 'false');
    localStorage.setItem(KEY, key);
    localStorage.setItem(MODEL, model);
    els.settingsMsg.textContent = 'Tersimpan.';
    if (state.error && /API key/.test(state.error)) { state.error = null; renderStatus(); }
  });
  els.clearKey.addEventListener('click', () => {
    localStorage.removeItem(KEY);
    els.apiKey.value = '';
    els.settingsMsg.textContent = 'Key dihapus dari perangkat ini.';
  });

  adoptClockwise();
  update({ rebuildRows: true });
})();
