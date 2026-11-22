# Cadangan Google Drive (sekitar 5 menit, gratis)

Cadangan lengkap, termasuk foto asli, disimpan di **folder tersembunyi milik aplikasi** di Google Drive Anda. Aplikasi hanya bisa melihat folder itu (izin `drive.appdata`), bukan file Drive Anda yang lain. Berkasnya tidak muncul di tampilan Drive biasa.

## Penyiapan sekali saja

1. Buka **console.cloud.google.com**, masuk dengan akun Google Anda, lalu **Buat proyek** (nama bebas, misalnya `juned-landscape`).
2. **APIs & Services › Library** › cari **Google Drive API** › **Enable**.
3. **APIs & Services › OAuth consent screen** (atau *Google Auth Platform*):
   - Jenis pengguna: **External**.
   - Isi nama aplikasi dan email Anda.
   - **Publish app tidak wajib.** Cara paling mudah: biarkan status *Testing*, lalu di *Audience* › **Test users** › **Add users**, isi email Google yang akan dipakai untuk cadangan (maksimal 100). Hanya email itu yang bisa masuk, dan itu cukup.
   - Saat pertama masuk, Google menampilkan "Google hasn't verified this app". Klik **Advanced › Go to … (unsafe)**. Ini aman karena aplikasinya milik Anda sendiri.
   - Tombol *Publish app* sering tidak aktif bila *Branding* belum lengkap (nama aplikasi, email dukungan, dan email kontak developer) atau jenis pengguna belum dipilih. Akun Google Workspace hanya bisa memilih *Internal*, yang juga tidak memakai tombol itu.
4. **APIs & Services › Credentials › Create credentials › OAuth client ID**:
   - Application type: **Web application**.
   - **Authorized JavaScript origins**: tambahkan alamat aplikasi, misalnya `https://landscapejuned-juned-landscape-proj.vercel.app` (tanpa garis miring di akhir). Untuk uji lokal tambahkan juga `http://localhost:8080`.
   - Biarkan *Authorized redirect URIs* kosong.
5. Salin **Client ID** (berakhiran `.apps.googleusercontent.com`).
6. Di aplikasi: **Pengaturan › Lanjutan › Cadangan Google Drive**, tempel Client ID, **Simpan**, lalu **Cadangkan sekarang**. Google meminta izin satu kali.

Agar semua perangkat otomatis memakai Client ID yang sama tanpa mengetik, isi `googleClientId` di berkas `config.js` lalu publikasikan ulang. Client ID memang publik, aman ditaruh di sana.

## Cara kerja dan batasannya

- Google memberi sesi **1 jam** tanpa server. Jadi cadangan dibuat saat Anda menekan tombol, bukan otomatis di latar. Beranda mengingatkan bila cadangan sudah lama dan menyediakan tombol **Ke Google Drive**.
- Aplikasi menyimpan **5 cadangan terakhir** (bisa diubah) dan menghapus yang lebih lama. Ukuran berkas diperiksa setelah diunggah.
- **Pulihkan** mengganti data di perangkat dengan cadangan yang dipilih. Buat cadangan dulu bila ragu.
- Kunci Gemini dan sesi login tidak ikut cadangan.
- **Putuskan** hanya menghapus sambungan di perangkat ini. File di Google Drive tidak dihapus. Untuk menghapusnya: Drive › Pengaturan › Kelola aplikasi › aplikasi Anda › Hapus data tersembunyi.
- Fitur **Hemat ruang** (Supabase penuh) memakai Google Drive bila sesinya aktif, selain OneDrive.
