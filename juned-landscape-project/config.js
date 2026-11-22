/* Pengaturan bawaan aplikasi. Semua nilai di sini PUBLIK (ikut terkirim ke browser):
   - supabaseAnon adalah kunci publik; data dilindungi aturan RLS per akun, bukan oleh kerahasiaan kunci ini.
   - googleClientId juga publik. Jangan pernah mengisi kunci rahasia (service_role, secret) di berkas ini.
   Kosongkan nilainya bila ingin tiap perangkat mengisi sendiri di Pengaturan. */
window.JLP_CONFIG = {
  supabaseUrl: 'https://skphritshglsbrjvpinb.supabase.co',
  supabaseAnon: 'sb_publishable_pq_FDxp7TaN7pkE-_9UFgA_rOS68vfN',
  googleClientId: ''
};
