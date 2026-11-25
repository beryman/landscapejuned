/* Juned Landscape Project - tool "Sketsa ke Gambar Kerja": dibuka dari bidang Survei, hasilnya ditulis ke bidang itu. */
'use strict';
let sketsaLayer = null;

function closeSketch() { if (sketsaLayer) { sketsaLayer.remove(); sketsaLayer = null; } }

function openSketch(surveyId, fieldId, fieldName) {
  if (!surveyId || !fieldId) return;
  closeSketch();
  const el = sketsaLayer = document.createElement('div');
  el.id = 'sketsaLayer'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Sketsa ke gambar kerja');
  const q = '?embed=1&p=' + encodeURIComponent(surveyId) + '&f=' + encodeURIComponent(fieldId) + '&n=' + encodeURIComponent(fieldName || '');
  el.innerHTML = '<div class="skbar"><button type="button" class="btn ghost sm" id="skBack">‹ Kembali ke bidang</button><div class="sktxt"><b>Sketsa ke gambar kerja</b>' + (fieldName ? '<small>Bidang ' + esc(fieldName) + '</small>' : '') + '</div></div>' +
    '<iframe title="Sketsa ke gambar kerja" src="apps/sketsa/index.html' + q + '"></iframe>';
  $('#stage').appendChild(el);
  $('#skBack').onclick = closeSketch;
}

// Dipanggil dari tool. Hasil yang tidak ok tidak pernah ditulis (dijaga lagi di SketsaField.applyToField).
async function applySketch(ctx, res) {
  try {
    const rec = await readSurvey(ctx.survey);
    if (!rec) return { ok: false, reason: 'Survei tidak ditemukan.' };
    const out = SketsaField.applyToField(rec, ctx.field, res);
    if (!out.ok) return out;
    await writeSurvey(rec);   // Survei dimuat ulang dari data baru
    closeSketch();
    await openSurvey(state.sv && String(state.sv.id) === String(ctx.survey) ? state.sv : { id: ctx.survey, project: rec.name || '', code: rec.code || '', name: rec.name || '' });
    toast('Bidang diperbarui dari sketsa: ' + String(Math.round(out.area * 100) / 100).replace('.', ',') + ' m²' + (out.depth != null ? ', kedalaman ' + String(Math.round(out.depth * 100) / 100).replace('.', ',') + ' m' : '') + (out.warning ? '. ' + out.warning : ''), { ms: out.warning ? 9000 : 4000 });
    return out;
  } catch (e) { return { ok: false, reason: 'Gagal menyimpan: ' + e.message }; }
}

Object.assign(window.JLPShell, { openSketch, applySketch, closeSketch });
addEventListener('hashchange', closeSketch);   // pindah menu utama menutup tool
