// Reads a sketch photo with Gemini and returns a Sketch. The key goes only to Google, in a header.
const Gemini = (() => {
  const Geo = typeof Geometry !== 'undefined' ? Geometry : require('./geometry.js');

  const NUM_OR_NULL = { type: 'NUMBER', nullable: true };
  const SCHEMA = {
    type: 'OBJECT',
    properties: {
      unit_hint: { type: 'STRING', nullable: true },
      vertices: {
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          properties: { x: { type: 'NUMBER' }, y: { type: 'NUMBER' }, interior_angle: NUM_OR_NULL },
          required: ['x', 'y'],
        },
      },
      edges: {
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          properties: {
            length: NUM_OR_NULL,
            kind: { type: 'STRING', enum: ['line', 'arc'] },
            radius: NUM_OR_NULL,
            bulge: { type: 'STRING', enum: ['out', 'in'] },
          },
          required: ['kind'],
        },
      },
      notes: { type: 'ARRAY', items: { type: 'STRING' } },
    },
    required: ['vertices', 'edges'],
  };

  const PROMPT = [
    'This image is a hand sketch of one closed flat shape (a floor, plot or slab) with dimensions written on its sides.',
    'Return the outline as JSON matching the schema.',
    '- vertices: every corner of the outline, in clockwise order as seen in the image, starting at the top-left-most corner. x and y are positions normalised 0 to 1000 across the image width and height, origin top-left.',
    '- interior_angle: the angle in degrees written at that corner, or null when nothing is written there. Do not guess angles.',
    '- edges: one per side, edges[i] joins vertices[i] to vertices[i+1] (the last joins back to the first).',
    '- length: the number written beside that side exactly as written (decimal comma means a decimal point), or null when no number is written. Never invent or compute a number.',
    '- kind: "arc" when the side is drawn curved, else "line". radius: a number written with an R prefix near the curve, else null. bulge: "out" when the curve bows away from the inside of the shape, "in" when it bows into it.',
    '- unit_hint: "mm", "cm" or "m" if a unit is written anywhere, else null.',
    '- notes: any other text you can read that does not belong to a side or corner.',
    'If the input is a PDF, read only its first page; positions are normalised across that page.',
    'Gambar ini sketsa tangan. Angka yang tidak tertulis harus null, jangan ditebak.',
  ].join('\n');

  const ERR = {
    noKey: 'Isi API key Gemini dulu di Pengaturan.',
    badKey: 'API key ditolak. Periksa key di Pengaturan.',
    quota: 'Batas pemakaian API tercapai. Tunggu sebentar lalu coba lagi.',
    model: 'Model tidak ditemukan. Periksa nama model di Pengaturan.',
    offline: 'Tidak ada koneksi internet. Membaca sketsa dengan AI butuh internet.',
    unreadable: 'Jawaban AI tidak bisa dibaca. Coba lagi.',
    shape: 'Bentuk tidak terbaca. Coba foto yang lebih jelas.',
  };

  function toSketch(json) {
    if (!json || !Array.isArray(json.vertices) || json.vertices.length < 3) throw new Error(ERR.shape);
    const vertices = json.vertices.map((v) => {
      const x = Geo.parseNumber(v && v.x), y = Geo.parseNumber(v && v.y);
      if (x === null || y === null) throw new Error(ERR.shape);
      return { x, y, interiorAngle: Geo.parseNumber(v.interior_angle) };
    });
    const raw = Array.isArray(json.edges) ? json.edges : [];
    const edges = vertices.map((_, i) => {
      const e = raw[i] || {};
      return {
        length: Geo.parseNumber(e.length),
        kind: e.kind === 'arc' ? 'arc' : 'line',
        radius: Geo.parseNumber(e.radius),
        bulge: e.bulge === 'in' ? 'in' : 'out',
      };
    });
    const unit = ['mm', 'cm', 'm'].includes(json.unit_hint) ? json.unit_hint : null;
    const notes = Array.isArray(json.notes) ? json.notes.filter((t) => typeof t === 'string') : [];
    return { unit, vertices, edges, notes };
  }

  const PDF_MAX = 15 * 1024 * 1024; // inline requests are capped near 20 MB once base64-encoded

  // bytes: Uint8Array of a PDF file. Sent to Gemini as is; width/height is the page size, for the preview.
  function pdfPart(bytes) {
    if (bytes.length > PDF_MAX) throw new Error('File PDF terlalu besar (lebih dari 15 MB). Simpan ulang halaman sketsanya saja.');
    let text = '';
    for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    if (!text.startsWith('%PDF-')) throw new Error('File ini bukan PDF yang bisa dibuka. Gunakan PDF, JPG atau PNG.');
    // shortcut: first MediaBox only, /Rotate ignored; a rotated page previews with swapped sides.
    const box = text.match(/\/MediaBox\s*\[\s*([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s*\]/);
    const [w, h] = box ? [box[3] - box[1], box[4] - box[2]] : [595, 842];
    return { data: btoa(text), mimeType: 'application/pdf', width: Math.abs(w) || 595, height: Math.abs(h) || 842 };
  }

  // image: { data: base64 without prefix, mimeType }
  async function readSketch(image, key, model, fetchFn = fetch) {
    if (!key || !key.trim()) throw new Error(ERR.noKey);
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
    const body = {
      contents: [{ parts: [{ inline_data: { mime_type: image.mimeType, data: image.data } }, { text: PROMPT }] }],
      generationConfig: { responseMimeType: 'application/json', responseSchema: SCHEMA },
    };
    let res;
    try {
      res = await fetchFn(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key.trim() },
        body: JSON.stringify(body),
      });
    } catch {
      throw new Error(ERR.offline);
    }
    if (!res.ok) {
      let reasons = [];
      try { reasons = ((await res.json()).error.details || []).map((d) => d.reason); } catch { /* no JSON body */ }
      if (res.status === 401 || res.status === 403 || reasons.includes('API_KEY_INVALID')) throw new Error(ERR.badKey);
      if (res.status === 404) throw new Error(ERR.model);
      if (res.status === 429) throw new Error(ERR.quota);
      if (res.status === 400) throw new Error('Permintaan ditolak Gemini (kode 400). Coba lagi.');
      throw new Error(`Gagal menghubungi Gemini (kode ${res.status}). Coba lagi.`);
    }
    let json;
    try {
      const data = await res.json();
      json = JSON.parse(data.candidates[0].content.parts.map((p) => p.text || '').join(''));
    } catch {
      throw new Error(ERR.unreadable);
    }
    return toSketch(json);
  }

  return { SCHEMA, PROMPT, readSketch, toSketch, pdfPart, ERR };
})();

if (typeof module !== 'undefined') module.exports = Gemini;
