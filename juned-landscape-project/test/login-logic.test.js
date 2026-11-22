// Jalankan: node test/login-logic.test.js
const assert = require('assert');
require('../lib/login-logic.js');
const L = globalThis.LoginLogic;
const t = (name, fn) => { fn(); console.log('ok - ' + name); };
const base = { configured: true, loggedIn: false, secure: true, skipped: false };

t('layar login tampil bila koneksi ada dan belum masuk', () => assert.strictEqual(L.needsLogin(base), true));
t('sudah masuk: langsung ke aplikasi, juga saat offline', () => assert.strictEqual(L.needsLogin({ ...base, loggedIn: true }), false));
t('pernah memilih pakai tanpa login: tidak ditanya lagi', () => assert.strictEqual(L.needsLogin({ ...base, skipped: true }), false));
t('tanpa koneksi Supabase atau tanpa https: login tidak mungkin, aplikasi tidak boleh terkunci', () => {
  assert.strictEqual(L.needsLogin({ ...base, configured: false }), false);
  assert.strictEqual(L.needsLogin({ ...base, secure: false }), false);
});

t('sesi berakhir hanya bila server menolak token penyegaran', () => {
  assert.strictEqual(L.sessionEnded(400, { error_code: 'refresh_token_not_found', msg: 'Invalid Refresh Token: Refresh Token Not Found' }), true);
  assert.strictEqual(L.sessionEnded(400, { error_code: 'refresh_token_already_used' }), true);
  assert.strictEqual(L.sessionEnded(403, { error_code: 'session_not_found' }), true);
});
t('gangguan sementara tidak mengeluarkan pengguna', () => {
  for (const [s, b] of [[500, {}], [503, null], [429, { msg: 'rate limit' }], [0, null], [401, { message: 'Invalid API key' }], [400, { msg: 'bad request' }]]) assert.strictEqual(L.sessionEnded(s, b), false, String(s));
});

t('akun berganti hanya bila akun terakhir diketahui dan berbeda', () => {
  assert.strictEqual(L.accountChanged('u1', 'u2'), true);
  assert.strictEqual(L.accountChanged('u1', 'u1'), false);
  assert.strictEqual(L.accountChanged(null, 'u1'), false);
  assert.strictEqual(L.accountChanged('', 'u1'), false);
});

t('isian: email dan sandi diperiksa sebelum menghubungi server', () => {
  assert.match(L.validate('', 'rahasia1'), /email/i);
  assert.match(L.validate('bukan-email', 'rahasia1'), /email/i);
  assert.match(L.validate('a@b.co', '123'), /6 karakter/);
  assert.strictEqual(L.validate(' a@b.co ', 'rahasia1'), '');
});
console.log('login-logic OK');
