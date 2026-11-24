# DESIGN.md: Juned Landscape Project

Arah desain yang dipakai shell, modul Proyek dan Katalog (HTML), dan lembar Survei (Flutter). Setiap keputusan punya alasan satu baris. Perubahan tampilan harus tetap sesuai dengan berkas ini, atau berkas ini diubah lebih dulu.

## Arah

Alat kerja untuk surveyor di lapangan (HP, cahaya terang) dan estimator di kantor (komputer, tabel panjang). Bahasa visualnya alat ukur: kertas krem, tinta hijau tua, satu aksen emas. Padat dan tenang, bukan etalase.

Dial: **ENERGY 1 / RHYTHM 1 / MOTION 1.** Alasan: pekerjaannya membaca dan mengisi angka berjam-jam, jadi layar yang seragam dan diam lebih membantu daripada yang berkesan. Keseragaman ini disengaja, bukan kelalaian.

## Palet

| Peran | Warna | Alasan |
|---|---|---|
| Latar | `#F4F1E8` (krem) | Sama dengan shell, nyaman di mata, tidak menyilaukan di luar ruangan |
| Kartu | `#FFFDF8` | Naik sedikit dari latar tanpa bayangan |
| Tinta | `#1F2A22` | 12,5:1 di atas kartu |
| Teks sekunder | `#5C675E` | 5,8:1 di kartu, 5,0:1 di sel hitung |
| Utama | `#244D3B` | Tombol dan tab terpilih; putih di atasnya 9,6:1 |
| Aksen | `#D9B86C` (emas) | Hanya penanda terpilih dan rentang sel, selalu tipis |
| Galat | `#B54845` | Hanya untuk yang salah |
| Peringatan | `#8F5A0E` | Penanda luas manual; 5,7:1 di kartu |

Batas: tiga warna inti (krem, hijau tua, tinta) ditambah satu aksen. Warna galat dan peringatan hanya muncul bila ada yang salah.

## Huruf

Survei memakai **Roboto bawaan Flutter**. Alasannya: ikut terbundel di aplikasi sehingga jalan offline tanpa unduhan, sangat terbaca pada angka berderet (angka tabular dipakai di tabel), dan tidak menambah berkas huruf ke bundel yang sudah 44 MB. Modul HTML memakai huruf sistem dengan alasan yang sama (`shell.css`). Label, judul tabel, dan keterangan memakai huruf yang sama, sedikit lebih kecil, huruf kalimat biasa, tanpa kapital berjarak.

## Bentuk

- Satu skala sudut: 6 px (penanda kecil), 8 px (tombol, kolom isian, tombol ikon), 10 px (kartu, dialog). Tidak ada bentuk kapsul atau lingkaran penuh pada tombol.
- Garis tipis, tanpa bayangan. Kartu tidak di dalam kartu.
- Tidak ada ikon hiasan di kartu angka dan kartu proyek; keadaan kosong memakai satu ikon polos tanpa kotak. Ikon dipakai untuk aksi (tombol) dan status (galat).
- Kepadatan HP (lebar < 600 px): huruf 92%, kontrol kompak, bilah menu 58 px. Baris tabel desktop 44 px agar area ketuk tidak sempit.

## Aturan teks

- Tanpa em dash. Gunakan koma, titik dua, titik, atau tanda kurung. Nilai kosong ditulis `-`. Dijaga uji `test/design_rules_test.dart`.
- Tanpa pemisah titik tengah antar keterangan; pakai koma.
- Tanpa angka, testimoni, atau klaim karangan. Data kosong ditulis kosong.
- Pesan kesalahan menyebut apa yang salah dan apa langkah berikutnya.

## Aksesibilitas

- Warna tidak pernah sendirian: sel yang salah punya ikon, dan masalahnya ditulis di atas tabel.
- Kontras minimal 4,5:1 untuk teks (dijaga uji yang sama).
- Pohon aksesibilitas Flutter diaktifkan saat aplikasi mulai (`ensureSemantics`), karena web menggambar semuanya di kanvas.
- Area ketuk minimal 44 px.
