// Jalankan: node test/survei-calc.test.js
const assert = require('assert');
require('../lib/survei-calc.js');
const { rabOf, materialTotals } = globalThis.SurveiCalc;
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-6, a + ' != ' + b);
const on = { enabled: true, qty: null, overrideQty: null };
const mat = (id, basis, x = {}) => ({ id, basis, factor: 1, perUnit: 0, thickness: 0, waste: 0, unit: 'm', ...x });
const field = (shape, dims, depth, materials, x = {}) => ({ shape, dims, depth, sign: 1, areaOverride: null, points: [], materials, ...x });

const sp = {
  materials: [mat('a', 'area', { waste: 0.1 }), mat('v', 'volume'), mat('l', 'lining'), mat('k', 'perimeter'), mat('t', 'thickness', { thickness: 0.05 }), mat('c', 'count', { perUnit: 4 }), mat('m', 'manual')],
  areas: [{ fields: [
    field('rect', { panjang: 4, lebar: 2 }, 0.5, { a: on, v: on, l: on, k: on, t: on, c: on, m: { ...on, qty: 7 } }),
    field('rect', { panjang: 1, lebar: 1 }, 0.5, { a: on, v: on, m: { ...on, qty: 3 } }, { sign: -1 }),   // pengurang: tidak mengurangi input manual
    field('triangle', { alas: 2, tinggi: 3 }, 0, { a: { ...on, overrideQty: 100 } })                      // override tanpa waste
  ] }],
  rab: { overheadPct: 10, profitPct: 10, discountPct: 10, taxEnabled: true, taxPct: 11, items: [
    { id: 1, description: 'A', unit: 'm2', materialId: 'v', priceMaterial: 1000, priceLabor: 500, included: true },
    { id: 2, description: 'B', unit: 'ls', materialId: null, manualVolume: 2, priceMaterial: 100, priceLabor: 0, included: true },
    { id: 3, description: 'C', unit: 'ls', materialId: 'k', priceMaterial: 999, priceLabor: 0, included: false }
  ] }
};
const q = materialTotals(sp);
near(q.a, 8 * 1.1 - 1 * 1.1 + 100);
near(q.v, 4 - 0.5);
near(q.l, 12 * 0.5 + 8);
near(q.k, 12);
near(q.t, 0.4);
near(q.c, 32);
near(q.m, 10);

const r = rabOf(sp);
near(r.sub, 3.5 * 1500 + 200);       // item tidak disertakan tidak dihitung
near(r.overhead, r.sub * 0.1);
near(r.profit, (r.sub + r.overhead) * 0.1);
near(r.discount, (r.sub + r.overhead + r.profit) * 0.1);
near(r.tax, (r.sub + r.overhead + r.profit - r.discount) * 0.11);
near(r.grand, r.sub + r.overhead + r.profit - r.discount + r.tax);
console.log('survei-calc OK');
