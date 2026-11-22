# Juned Landscape Project: Panduan

Aplikasi untuk memantau proyek lanskap dari **Survei, Penawaran, RAB, Opname, sampai Selesai**.

| Tab | Asal | Fungsi |
|---|---|---|
| **Beranda** | baru | Jumlah proyek per tahap, daftar perlu tindakan, kartu proyek berjalan |
| **Proyek** | Taman Kerja + LANDSPACE | Tahap proyek, lembar survei (foto, ukuran, volume, RAB survei, export PDF/Excel), penawaran, RAB, opname, tagihan, papan tugas, jadwal, absen, laporan foto, SOP |
| **Katalog** | PlantBase V1.8.4 | Katalog tanaman, material, kalkulator, RAB katalog |
| **Pengaturan** | baru | Nama perangkat, pasang aplikasi, cadangan, penyimpanan, pembaruan, sinkron |

## Alur kerja
1. **Proyek baru:** buat proyek. Aplikasi langsung membuka tab Survei.
2. **Survei:** tekan *Buat survei untuk proyek ini*, lalu ukur lokasi dan isi harga. Tombol *Kembali ke proyek* ada di bagian atas.
3. **Penawaran:** nilai diambil dari survei. Ubah bila ada negosiasi, kirim lewat WhatsApp, lalu tandai terkirim.
4. **RAB:** tekan *Disetujui klien, lanjut RAB*. Item survei menjadi RAB, dan selisih overhead, profit, diskon, serta pajak menjadi satu baris penyesuaian sehingga total RAB sama dengan nilai penawaran.
5. **Opname:** catat volume atau persen, lalu tagih owner dan bayar tukang sesuai progres.

**Fitur tambahan (versi 1.7.0)**
- **Nilai nego ikut ke PDF dan Excel.** Ubah *Nilai* di tab Penawaran, dan RAB di Survei menampilkan satu baris *Penyesuaian kesepakatan* sehingga total PDF dan Excel sama dengan yang dikirim ke klien. *Pakai total hitungan* di RAB Survei mengembalikannya.
- **Revisi penawaran.** Tiap *Tandai terkirim* menjadi R1, R2, dan seterusnya. Mengubah nilai setelah terkirim memunculkan *Kirim ulang sebagai R2*, dan penawaran tidak bisa disetujui sebelum itu.
- **Peringatan survei berubah.** Kalau total survei bergeser setelah RAB dibuat, muncul peringatan di atas tab proyek. Di tab *Tambah Kurang* pilih *Catat selisih sebagai tambah/kurang* atau abaikan.
- **Tambah Kurang.** Perubahan di tengah proyek dicatat terpisah dari penawaran awal. Yang disetujui masuk RAB (jadi ikut opname dan tagihan), dan *Nilai kontrak terkini* tampil di atas proyek.
- **Survei batu alam dan cat tekstur.** Saat membuat survei, pilih *Batu alam* atau *Cat tekstur*. Material dan item RAB langsung disiapkan dan aktif di semua bidang. Di lembar survei, menu *Material* punya tombol *Tambah material* untuk menambahkannya kemudian. Angka kebutuhan per m² (perekat 5 kg, nat 0,5 kg, sealer 0,3 liter; plamir 0,6 kg, cat dasar 0,1 liter, cat tekstur 1,2 kg, coating 0,1 liter) adalah perkiraan umum. **Sesuaikan dengan data produk dan hasil contoh di lapangan.**
- **Isi harga dari katalog.** Di tab Survei, tombol itu mengisi harga item yang namanya cocok dengan katalog Tanaman. Item yang ragu atau namanya terlalu umum dilewati, dan harga yang sudah terisi tidak diubah.
- **Paket pekerjaan.** Di tab Papan, satu ketukan mengisi tugas dari template beberapa jenis pekerjaan (misalnya taman + kolam).
- **Laporan cepat.** Di tab Laporan: foto, catatan, dan volume dalam satu langkah. Volume otomatis masuk opname.

**Fitur tambahan (versi 1.8.0)**
- **Survei sesuai jenis pekerjaan.** Survei batu alam menyebut *Area pasang batu*, survei cat tekstur menyebut *Area dinding*, dan taman tetap *Area taman*. Jenis bisa diubah lewat *Ubah info* di lembar survei.
- **Gemini mengenali tanaman dari foto.** Di Katalog › Tambah tanaman, pilih foto dan kolom nama, nama ilmiah, famili, kategori, tinggi, jarak tanam, cahaya, penyiraman, dan pemupukan terisi otomatis. Hanya kolom yang masih kosong yang diisi. Isi kunci di Katalog › Pengaturan & Backup (kunci gratis dari aistudio.google.com/apikey). Kunci ikut sinkron ke perangkat lain (lihat versi 1.10.0) dan tidak masuk file cadangan; hasilnya selalu perlu diperiksa.
- **Koneksi Supabase tersimpan.** Lihat **SINKRON.md**.
- **Cadangan Google Drive.** Lihat **GOOGLE-DRIVE.md**.

**Fitur tambahan (versi 1.9.0)** — semuanya di tab Katalog
- **Katalog untuk klien.** Di *Database Tanaman* tekan *Katalog klien*: pilih tanaman, isi judul dan nama klien, lalu *Cetak / simpan PDF* (pilih "Simpan sebagai PDF" di dialog cetak) atau *Unduh file*. Isinya foto, nama lokal dan ilmiah, ukuran, cahaya, dan harga satuan bila dicentang. Bila cetak tidak tersedia di perangkat, unduh file lalu cetak dari browser.
- **Rekomendasi tanaman.** Menu *Rekomendasi Tanaman*: pilih cahaya lokasi (terik, semi teduh, teduh), luas area, tinggi maksimal, dan fungsi/kategori. Hasilnya tanaman dari katalog Anda yang cocok, dengan perkiraan jumlah (luas ÷ jarak tanam²) dan biaya. Tanaman yang kolom cahayanya kosong tetap muncul di urutan akhir. *Buat katalog klien dari hasil* mengirim hasilnya ke katalog klien.
- **Impor banyak foto.** Menu *Impor Banyak Foto*: pilih sampai 10 foto, Gemini mengenali satu per satu, lalu Anda mencentang yang disimpan. Yang namanya sudah ada di katalog tidak tercentang. Bila kunci salah atau kuota habis, sisa foto dilewati. Harga dan stok awal 0 dan perlu Anda isi.
- **Pengaturan Katalog dirapikan.** Panel cloud, endpoint AI, data aplikasi, dan pemeriksaan data dihapus. Sinkron antar perangkat memakai Pengaturan utama aplikasi.

**Fitur tambahan (versi 1.10.0)** — Gemini
- **Foto impor terlihat dan hasilnya bisa diedit.** Di *Impor Banyak Foto* foto yang dipilih langsung tampil sebelum dikenali. Tiap hasil punya kolom nama lokal dan ilmiah yang bisa diubah, tombol *Cari dari nama*, dan pilihan "Mungkin:" dari alternatif Gemini. Bila nama diubah tanpa *Cari dari nama*, hanya nama yang disimpan, sedangkan data tanaman yang salah dikenali dibuang.
- **Isi dari nama.** Di form Tambah tanaman, tombol *Isi dari nama* mengisi data dari nama lokal atau ilmiah, bukan dari foto. Kolom yang tadinya diisi Gemini dari foto yang salah ikut diperbarui, sedangkan ketikan Anda sendiri tidak ditimpa.
- **Kunci Gemini ikut sinkron.** Isi sekali di Katalog › Pengaturan & Backup; perangkat lain yang login ke akun yang sama ikut memakainya (lihat **SINKRON.md** untuk catatan keamanan). Kunci lama yang hanya ada di satu perangkat dipindahkan otomatis. Kunci tidak masuk file cadangan.
- **Tes koneksi.** Tombol di panel Gemini memeriksa kunci dan menyebut model mana yang bekerja, atau alasan gagalnya (kunci salah, kuota habis, server sibuk).
- **Model bawaan** sekarang `gemini-3.6-flash`, dengan `gemini-3.5-flash` dan `gemini-3.5-flash-lite` sebagai cadangan.

**Fitur tambahan (versi 1.11.0)** — lembar Survei
- **Kalkulasi dan Material jadi dua menu.** Di bilah atas lembar survei sekarang ada Daftar, Foto, Kalkulasi, Material, RAB, dan Ekspor. Tab Material yang dulu di dalam Pengukuran sudah tidak ada.
- **Material sesuai jenis proyek.** Proyek taman hanya menampilkan material taman, proyek batu alam hanya material batu alam, dan proyek cat tekstur hanya material cat tekstur, baik di menu Material, tabel Kalkulasi, maupun panel bidang. Material jenis lain tidak dihapus, hanya disembunyikan, dan ada catatan jumlahnya. Material yang sudah dipakai suatu bidang tetap tampil agar tidak ada volume yang tersembunyi.
- **Tambah material untuk kebutuhan lain.** Tombol *Tambah material* menawarkan paket jenis lain (misalnya paket Taman untuk proyek batu alam) dan *Material buatan sendiri*. Yang ditambahkan tetap tampil di proyek itu. Bila proyek belum punya material jenisnya sendiri, ada tombol untuk menambahkannya.
- **Tampilan desktop dirapikan.** Menu atas berupa deretan tab teks yang rata kiri (bukan bilah HP yang direntangkan), isi halaman sejajar dengan tab, header tabel Kalkulasi terang, dan pesan "belum ada bidang" tidak lagi terpotong. Warna disamakan dengan aplikasi utama (krem, hijau tua, satu aksen emas), ikon hiasan pada kartu angka dan kartu proyek dihapus, dan pemisah titik tengah diganti koma.

**Fitur tambahan (versi 1.12.0)** — Login
- **Layar login di awal aplikasi.** Masuk sekali per perangkat dengan akun yang sama, lalu data turun otomatis. *Pakai tanpa login* tetap tersedia. Lihat **SINKRON.md**.

**Perbaikan tampilan HP (versi 1.12.1)** — lembar Survei
- Di layar HP (lebar di bawah 600 px) huruf sedikit dikecilkan, kontrol dipadatkan, dan bilah menu atas dipendekkan dari 80 ke 58 px. Ruang isi bertambah dan ukurannya sepadan dengan tab lain. Kolom isian tetap 16 px agar iPhone tidak memperbesar halaman sendiri saat mengetik. Tampilan desktop tidak berubah.

Tahap proyek dihitung otomatis dari data ini. Saran pengembangan ada di **SARAN-PENGEMBANGAN.md**.

**Keuangan sudah dilepas sejak versi 1.4.0.** Data keuangan lama tidak dihapus: tetap ada di perangkat, ikut file cadangan, dan tetap ada di Supabase.

## Survei (LANDSPACE)
- Data Survei tersimpan di perangkat seperti modul lain (IndexedDB) dan **ikut sinkron** lewat login Supabase yang sama (koleksi `ls:p` proyek, `ls:photo` foto, `ls:cfg` pengaturan). Tidak ada tabel atau kunci terpisah.
- Survei dibuka dari **Proyek › tab Survei**, tidak lagi ada di menu utama, dan langsung menampilkan lembar milik proyek itu.
- Menu lembar survei ada di bagian atas (Ringkasan, Foto, Kalkulasi, RAB, Ekspor) karena menu utama sudah ada di samping atau bawah.
- Foto Survei dikompres (JPEG 85%, maks. 2.560 px) sebelum disimpan. Menghapus proyek Survei ikut menghapus fotonya yang tidak dipakai proyek lain. Menghapus satu foto dari proyek belum membersihkan file fotonya (menyisakan ruang terpakai).
- Survei pertama kali dibuka butuh internet (bundelnya ±10 MB, lalu tersimpan untuk offline).
- Sumber Flutter: `landspace-flutter-source.zip` (bukan bagian dari folder ini). Build ulang: `flutter build web --release --pwa-strategy=none`, lalu salin isi `build/web` ke `apps/survei/` dan naikkan `SURVEI` di `sw.js`. Di Windows tanpa Developer Mode, bangun dari salinan yang folder `windows`, `macos`, `ios`, dan `android`-nya dihapus.
- Rumus volume dan RAB Survei disalin ke `lib/survei-calc.js`. Bila Survei dibangun ulang dengan rumus baru, perbarui file itu dan jalankan `node test/survei-calc.test.js`.
- Belum terhubung: Survei belum memakai harga Katalog.

## Yang terhubung antar modul
1. **Survei → Penawaran → RAB.** Lihat Alur kerja di atas.
2. **Katalog → RAB proyek.** Di Proyek › RAB klik **+ Dari katalog Tanaman**. Pilih tanaman/material dan jumlah, atau impor seluruh RAB dari katalog. Harga satuan sudah termasuk waste; upah tukang katalog menjadi tarif tukang per satuan.

## Cara menayangkan (wajib https agar bisa dipasang)
Pilih salah satu (semua gratis). Unggah **isi folder ini** (bukan zip-nya):
- **GitHub Pages**: buat repository, unggah semua file, Settings › Pages › Deploy from branch › `main` / root. Alamat: `https://username.github.io/nama-repo/`.
- **Netlify**: buka app.netlify.com/drop lalu seret folder ini.
- **Cloudflare Pages**: Create project › Direct Upload › unggah folder.

Uji lokal di komputer: klik dua kali `jalankan-lokal.command` (Mac) atau jalankan `python3 -m http.server 8080` di folder ini, lalu buka http://localhost:8080.

## Memasang di perangkat
- **iPhone / iPad (Safari):** Bagikan › *Tambahkan ke Layar Utama*.
- **Android (Chrome):** menu ⋮ › *Instal aplikasi*.
- **Mac:** Safari 17+ › Berkas › *Tambahkan ke Dock*; Chrome/Edge › ikon pasang di bilah alamat.
- **Website:** cukup buka alamatnya di browser mana pun.

## Data & cadangan — penting
- Data tersimpan **di perangkat** (IndexedDB) sehingga bisa dipakai offline. Agar Mac, Android, iPhone, dan iPad saling terhubung, aktifkan **Sinkron antar perangkat** (Supabase gratis): lihat **SINKRON.md** dan `sync-setup.sql`.
- Tanpa sinkron, pindah perangkat lewat **Pengaturan › Unduh cadangan** lalu **Pulihkan dari file**.
- Buat cadangan rutin (Beranda mengingatkan setelah 14 hari). Di iPhone/iPad, pasang ke layar utama agar Safari tidak membersihkan data.
- **Memindahkan data aplikasi lama:** Pengaturan › *Pulihkan dari file* mengenali cadangan lama otomatis:
  - Taman Kerja: Pengaturan › Cadangan data › *Buat cadangan*, simpan teksnya ke file `.json`/`.txt`.
  - PlantBase: Ekspor Backup JSON.
  - Sepran: Data & Backup › Backup.
  Memulihkan satu cadangan lama hanya mengganti modul terkait.
- Bila aplikasi lama pernah dibuka di domain yang sama (mis. sama-sama `username.github.io`), data tanaman/proyek lama terbaca otomatis saat pertama dibuka.

## Catatan
- Foto & dokumen kini disimpan di IndexedDB (bukan localStorage 5 MB), jadi jauh lebih lega. Dokumen proyek maks 4 MB per file.
- Taman Kerja versi aslinya punya sinkron tim di dalam Claude; di sini sinkron antar perangkat dilakukan lewat Supabase (satu akun yang sama di semua perangkat). PlantBase tetap punya opsi cloud (Supabase) di pengaturannya bila Anda memakainya.
- Pembaruan: naikkan `VERSION` di `sw.js` dan `APP_VERSION` di `shell-core.js` setiap mengubah file, lalu unggah ulang. Pengguna melihat tombol *Perbarui*.

## Struktur
```
index.html  shell-core.js  shell-pages.js  shell-bridge.js  shell-sync.js  shell-login.js  shell.css
sync-setup.sql  SINKRON.md  ONEDRIVE.md
shell-onedrive.js  shell-space.js
manifest.webmanifest  sw.js  icons/  config.js  shell-gdrive.js  GOOGLE-DRIVE.md
lib/ (kv.js, common.js, survei-calc.js, sync-merge.js, proyek-logic.js, gemini-plant.js, katalog-logic.js, gdrive-backup.js, login-logic.js, embed.css, xlsx)
apps/ proyek.html  tanaman.html  survei/ (aplikasi Flutter web)
test/ survei-calc, sync-merge, proyek-logic, gemini-plant, katalog-logic, login-logic, gdrive-backup (*.test.js, jalankan dengan node)  sync-two-devices.js (uji browser, hanya localhost)
```

- **Cadangan OneDrive** dan hemat ruang otomatis: lihat **ONEDRIVE.md**.
