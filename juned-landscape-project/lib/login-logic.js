/* Aturan layar login. Diuji: node test/login-logic.test.js */
(function (root) {
  'use strict';
  // Data ada di perangkat, jadi login tidak boleh mengunci aplikasi bila koneksi tidak tersedia.
  const needsLogin = ({ configured, loggedIn, secure, skipped }) => !!(configured && secure && !loggedIn && !skipped);

  // Hanya penolakan token yang mengakhiri sesi; gangguan jaringan atau server tidak boleh mengeluarkan pengguna.
  function sessionEnded(status, body) {
    if (status !== 400 && status !== 403) return false;
    const b = body || {};
    return /refresh.?token|session_not_found|session_expired/i.test([b.error_code, b.code, b.msg, b.message, b.error_description].filter(Boolean).join(' '));
  }

  const accountChanged = (lastUid, uid) => !!lastUid && lastUid !== uid;

  function validate(email, pass) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim())) return 'Isi alamat email yang benar.';
    if (String(pass || '').length < 6) return 'Kata sandi minimal 6 karakter.';
    return '';
  }

  root.LoginLogic = { needsLogin, sessionEnded, accountChanged, validate };
})(typeof window !== 'undefined' ? window : globalThis);
