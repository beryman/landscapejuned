/* Logika murni Katalog Tanaman: rekomendasi dari area, katalog untuk klien, impor banyak foto.
   Diuji: node test/katalog-logic.test.js */
(function (root) {
  'use strict';
  // Seberapa cocok nilai "Kebutuhan cahaya" tanaman dengan kondisi lokasi. Tidak ada di tabel = tidak cocok.
  const FIT = {
    sun: { 'Matahari penuh': 2, 'Matahari / semi teduh': 2, 'Semi teduh': 1 },
    semi: { 'Semi teduh': 2, 'Matahari / semi teduh': 2, 'Matahari penuh': 1, 'Cahaya tidak langsung / teduh terang': 1 },
    shade: { 'Teduh': 2, 'Cahaya tidak langsung / teduh terang': 2, 'Semi teduh': 1 }
  };
  const norm = v => String(v == null ? '' : v).trim().toLowerCase();
  const num = v => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : 0; };

  function recommend(plants, { light, area, categories, maxHeight } = {}) {
    const a = num(area), maxH = num(maxHeight), cats = Array.isArray(categories) ? categories.filter(Boolean) : [];
    const out = [];
    for (const p of plants || []) {
      if (cats.length && !cats.includes(p.category)) continue;
      if (maxH && num(p.height) > maxH) continue;
      let fit = 1;
      if (light && FIT[light]) fit = p.light ? (FIT[light][p.light] || 0) : 0.5;
      if (!fit) continue;
      const sp = num(p.spacing);
      const qty = a && sp ? Math.ceil(a / ((sp / 100) ** 2) - 1e-9) : null;   // estimasi kasar: luas / jarak tanam²
      out.push({ plant: p, fit, qty, cost: qty != null && num(p.price) ? qty * num(p.price) : null });
    }
    return out.sort((x, y) => y.fit - x.fit || (num(y.plant.stock) > 0) - (num(x.plant.stock) > 0) || String(x.plant.local).localeCompare(String(y.plant.local)));
  }

  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const rupiah = n => 'Rp ' + String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const SAFE_IMG = /^data:image\/(jpeg|png|webp|gif);base64,[A-Za-z0-9+/=]+$/;

  const CSS = '@page{size:A4;margin:14mm}*{box-sizing:border-box}body{font-family:system-ui,Segoe UI,Arial,sans-serif;color:#1c2b22;margin:0}' +
    'header{border-bottom:3px solid #2f5d46;padding-bottom:10px;margin-bottom:16px}h1{margin:0;font-size:24px;color:#2f5d46}header p{margin:4px 0 0;color:#5b6b61;font-size:13px}' +
    '.grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}.card{display:flex;gap:12px;border:1px solid #d9e2dc;border-radius:10px;padding:10px;break-inside:avoid}' +
    '.card img,.ph{width:96px;height:96px;object-fit:cover;border-radius:8px;flex:none;background:#e8efe9}.ph{display:grid;place-items:center;font-size:30px}' +
    'h2{margin:0;font-size:15px}.sci{font-style:italic;color:#5b6b61;font-size:12px;margin-bottom:4px}.meta{font-size:12px;line-height:1.5}.tag{display:inline-block;background:#e8efe9;border-radius:99px;padding:1px 8px;font-size:11px;margin-bottom:4px}.price{font-weight:700;color:#2f5d46;margin-top:4px}' +
    'footer{margin-top:18px;font-size:11px;color:#7a877f}.empty{padding:30px;text-align:center;color:#5b6b61}@media print{.noprint{display:none}}';

  function card(p, withPrice) {
    const size = [num(p.height) ? 'Tinggi ' + num(p.height) + ' cm' : '', num(p.crown) ? 'Tajuk ' + num(p.crown) + ' cm' : ''].filter(Boolean).join(' · ');
    const photo = SAFE_IMG.test(p.image || '') ? '<img src="' + p.image + '" alt="">' : '<div class="ph">❧</div>';
    return '<article class="card">' + photo + '<div><span class="tag">' + esc(p.category || 'Tanaman') + '</span><h2>' + esc(p.local) + '</h2>' +
      (p.scientific ? '<div class="sci">' + esc(p.scientific) + '</div>' : '') +
      '<div class="meta">' + (size ? esc(size) + '<br>' : '') + (p.light ? 'Cahaya: ' + esc(p.light) + '<br>' : '') + (p.description ? esc(p.description) : '') + '</div>' +
      (withPrice && num(p.price) ? '<div class="price">' + rupiah(num(p.price)) + ' / ' + esc(p.unit || 'unit') + '</div>' : '') + '</div></article>';
  }

  // Dokumen mandiri untuk dicetak / disimpan sebagai PDF dari dialog cetak browser (tanpa pustaka PDF).
  function clientCatalogHTML(plants, { title, client, withPrice } = {}) {
    const list = plants || [];
    return '<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + esc(title || 'Katalog Tanaman') + '</title><style>' + CSS + '</style></head><body>' +
      '<header><h1>' + esc(title || 'Katalog Tanaman') + '</h1>' + (client ? '<p>Untuk: ' + esc(client) + '</p>' : '') + '<p>' + list.length + ' jenis tanaman</p></header>' +
      (list.length ? '<div class="grid">' + list.map(p => card(p, withPrice)).join('') + '</div>' : '<div class="empty">Belum ada tanaman yang dipilih.</div>') +
      '<footer>Ukuran adalah perkiraan tanaman dewasa dan dapat berbeda di lapangan.</footer></body></html>';
  }

  function isDuplicate(plants, f) {
    const l = norm(f && f.local), s = norm(f && f.scientific);
    return (plants || []).some(p => (l && norm(p.local) === l) || (s && norm(p.scientific) === s));
  }

  function plantFromAI(f, image, { id, now }) {
    return {
      id, local: f.local || f.scientific || '', scientific: f.scientific || '', family: f.family || '', category: f.category || 'Lainnya',
      description: f.description || '', height: f.height || 0, crown: f.crown || 0, spacing: f.spacing || 0, light: f.light || '',
      water: f.water || '', fertilizer: f.fertilizer || '', price: 0, supplier: '', location: '', stock: 0, unit: 'pot', image: image || '',
      notes: 'Dibuat dari identifikasi foto Gemini; verifikasi nama dan data sebelum dipakai.', created: now, updatedAt: now
    };
  }

  // Berurutan (bukan paralel) agar tidak menabrak batas permintaan per menit kunci gratis.
  async function identifyBatch(items, identify, { onProgress } = {}) {
    const out = []; let stopReason = '';
    for (let i = 0; i < items.length; i++) {
      const it = items[i]; let r;
      if (stopReason) r = { name: it.name, dataUrl: it.dataUrl, ok: false, skipped: true, error: 'Dilewati: ' + stopReason };
      else {
        try { const x = await identify(it.dataUrl); r = { name: it.name, dataUrl: it.dataUrl, ok: true, fields: x.fields, alternatives: x.alternatives || [], model: x.model }; }
        catch (e) { r = { name: it.name, dataUrl: it.dataUrl, ok: false, error: e.message }; if (e.fatal || e.quota) stopReason = e.message; }
      }
      out.push(r);
      if (onProgress) onProgress(i + 1, items.length, r);
    }
    return out;
  }

  root.KatalogLogic = { recommend, clientCatalogHTML, isDuplicate, plantFromAI, identifyBatch };
})(typeof window !== 'undefined' ? window : globalThis);
