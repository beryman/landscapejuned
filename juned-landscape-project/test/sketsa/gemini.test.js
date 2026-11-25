const { test } = require('node:test');
const assert = require('node:assert');
const Gm = require('../../apps/sketsa/gemini.js');

const image = { data: 'aGVsbG8=', mimeType: 'image/png' };
const aiJson = {
  unit_hint: 'cm',
  vertices: [
    { x: 100, y: 100, interior_angle: null }, { x: 400, y: 100, interior_angle: null },
    { x: 400, y: 300, interior_angle: null }, { x: 700, y: 300, interior_angle: null },
    { x: 700, y: 600, interior_angle: null }, { x: 100, y: 600, interior_angle: null },
  ],
  edges: [
    { length: 12, kind: 'line', radius: null, bulge: 'out' }, { length: '14', kind: 'line' },
    { length: '12,5', kind: 'line' }, { length: null, kind: 'line' },
    { length: 50, kind: 'line' }, { length: 26, kind: 'line' },
  ],
  notes: ['skala bebas'],
};
const reply = (status, body) => async (url, init) => {
  reply.last = { url, init };
  return { ok: status >= 200 && status < 300, status, json: async () => body };
};
const okBody = (text) => ({ candidates: [{ content: { parts: [{ text }] } }] });

test('valid response becomes a Sketch with camelCase and parsed numbers', async () => {
  const s = await Gm.readSketch(image, 'KEY', 'gemini-3.8-flash', reply(200, okBody(JSON.stringify(aiJson))));
  assert.equal(s.vertices.length, 6);
  assert.equal(s.vertices[0].interiorAngle, null);
  assert.equal(s.edges[1].length, 14);
  assert.equal(s.edges[2].length, 12.5);
  assert.equal(s.edges[1].bulge, 'out');
  assert.equal(s.unit, 'cm');
  assert.deepEqual(s.notes, ['skala bebas']);
});

test('request sends the key in a header, never in the URL, with schema and image', async () => {
  await Gm.readSketch(image, 'SECRET', 'gemini-3.8-flash', reply(200, okBody(JSON.stringify(aiJson))));
  const { url, init } = reply.last;
  assert.equal(url, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent');
  assert.ok(!url.includes('SECRET'));
  assert.equal(init.headers['x-goog-api-key'], 'SECRET');
  const body = JSON.parse(init.body);
  assert.equal(body.contents[0].parts[0].inline_data.data, 'aGVsbG8=');
  assert.equal(body.generationConfig.responseMimeType, 'application/json');
  assert.deepEqual(body.generationConfig.responseSchema, Gm.SCHEMA);
});

test('non-JSON answer gives a readable error', async () => {
  await assert.rejects(Gm.readSketch(image, 'K', 'm', reply(200, okBody('maaf, saya tidak bisa'))), { message: 'Jawaban AI tidak bisa dibaca. Coba lagi.' });
});

test('empty candidates gives the same readable error', async () => {
  await assert.rejects(Gm.readSketch(image, 'K', 'm', reply(200, { candidates: [] })), { message: 'Jawaban AI tidak bisa dibaca. Coba lagi.' });
});

test('HTTP 400 with API_KEY_INVALID, 401 and 403 mean a bad key', async () => {
  const keyBody = { error: { code: 400, details: [{ reason: 'API_KEY_INVALID' }] } };
  await assert.rejects(Gm.readSketch(image, 'K', 'm', reply(400, keyBody)), { message: 'API key ditolak. Periksa key di Pengaturan.' });
  for (const code of [401, 403]) {
    await assert.rejects(Gm.readSketch(image, 'K', 'm', reply(code, {})), { message: 'API key ditolak. Periksa key di Pengaturan.' });
  }
});

test('plain HTTP 400 is not blamed on the key', async () => {
  await assert.rejects(Gm.readSketch(image, 'K', 'm', reply(400, { error: { code: 400 } })), { message: 'Permintaan ditolak Gemini (kode 400). Coba lagi.' });
});

test('HTTP 404 points at the model name', async () => {
  await assert.rejects(Gm.readSketch(image, 'K', 'm', reply(404, {})), { message: 'Model tidak ditemukan. Periksa nama model di Pengaturan.' });
});

test('HTTP 429 means quota reached', async () => {
  await assert.rejects(Gm.readSketch(image, 'K', 'm', reply(429, {})), { message: 'Batas pemakaian API tercapai. Tunggu sebentar lalu coba lagi.' });
});

test('network failure says internet is needed', async () => {
  const down = async () => { throw new TypeError('Failed to fetch'); };
  await assert.rejects(Gm.readSketch(image, 'K', 'm', down), { message: 'Tidak ada koneksi internet. Membaca sketsa dengan AI butuh internet.' });
});

test('missing key is refused before any request', async () => {
  let called = false;
  await assert.rejects(Gm.readSketch(image, '  ', 'm', async () => { called = true; }), { message: 'Isi API key Gemini dulu di Pengaturan.' });
  assert.equal(called, false);
});

test('fewer than 3 vertices: shape not readable', async () => {
  const bad = { ...aiJson, vertices: aiJson.vertices.slice(0, 2), edges: aiJson.edges.slice(0, 2) };
  await assert.rejects(Gm.readSketch(image, 'K', 'm', reply(200, okBody(JSON.stringify(bad)))), { message: 'Bentuk tidak terbaca. Coba foto yang lebih jelas.' });
});

test('edge count different from vertex count is padded with unknown sides', () => {
  const s = Gm.toSketch({ ...aiJson, edges: aiJson.edges.slice(0, 4) });
  assert.equal(s.edges.length, 6);
  assert.equal(s.edges[5].length, null);
  assert.equal(s.edges[5].kind, 'line');
});

const pdfBytes = (body) => new TextEncoder().encode(`%PDF-1.4\n${body}\n%%EOF`);

test('pdfPart: keeps the PDF as is and takes the page size from the first MediaBox', () => {
  const bytes = pdfBytes('1 0 obj << /Type /Page /MediaBox [0 0 842 595.5] >> endobj');
  const p = Gm.pdfPart(bytes);
  assert.equal(p.mimeType, 'application/pdf');
  assert.equal(Buffer.from(p.data, 'base64').toString('latin1'), Buffer.from(bytes).toString('latin1'));
  assert.deepEqual([p.width, p.height], [842, 595.5]);
});

test('pdfPart: no MediaBox falls back to A4 portrait', () => {
  const p = Gm.pdfPart(pdfBytes('1 0 obj << /Type /Page >> endobj'));
  assert.deepEqual([p.width, p.height], [595, 842]);
});

test('pdfPart: a file that is not a PDF, or too big, is refused in plain words', () => {
  assert.throws(() => Gm.pdfPart(new TextEncoder().encode('hello')), /bukan PDF/);
  assert.throws(() => Gm.pdfPart(new Uint8Array(16 * 1024 * 1024).fill(37)), /terlalu besar/);
});

test('the prompt tells Gemini to read only the first page of a PDF', () => {
  assert.ok(/first page/i.test(Gm.PROMPT));
  assert.ok(/never assume/i.test(Gm.PROMPT));
});
