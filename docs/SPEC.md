# Recallio — Spesifikasi MVP

Aplikasi PWA flashcard bergaya Anki: spaced repetition **FSRS**, **offline-first** (IndexedDB, tanpa backend), responsif mobile & desktop, tampilan modern SaaS.

Dokumen ini disusun per tahap. Setiap tahap punya hasil yang bisa diverifikasi (bagian 10).

---

## Tahap 1 — Ruang lingkup

### 1.1 Dalam MVP
| Area | Kemampuan |
|---|---|
| Deck | Buat, ubah nama/deskripsi, hapus (beserta kartu & riwayat) |
| Kartu | Tambah/edit/hapus, tangguhkan (suspend), tag, petunjuk (hint), cari & filter tag |
| Editor | **Formulir manual** dan **editor JSON** (kartu tunggal) dengan sinkronisasi dua arah |
| Impor/ekspor | Editor JSON untuk seluruh bundle, validasi langsung, impor atomik, ekspor dengan/tanpa jadwal |
| Belajar | Antrean harian, balik kartu, 4 tingkat jawaban dengan pratinjau interval, pintasan keyboard |
| Penjadwalan | FSRS (`ts-fsrs`), target retensi dapat diatur, fuzz opsional |
| Statistik | Kartu menunggu, streak, jawaban hari ini, aktivitas 7 hari |
| PWA | Dapat dipasang, berjalan penuh offline, pembaruan atas persetujuan pengguna |
| Pengaturan | Kartu baru/hari, ulasan maks/hari, retensi, fuzz, tema (sistem/terang/gelap) |

### 1.2 Di luar MVP (sengaja ditunda)
Sinkronisasi antarperangkat/akun, media (gambar/audio), kartu cloze & beberapa tipe catatan, pengoptimal parameter FSRS dari riwayat, undo jawaban, impor `.apkg`, notifikasi pengingat.

### 1.3 Persyaratan non-fungsional
- **Offline penuh** setelah kunjungan pertama; data tidak pernah meninggalkan perangkat.
- **Integritas data**: operasi multi-tabel dalam satu transaksi IndexedDB (impor, jawab kartu, hapus deck).
- **Aksesibilitas**: kontrol dapat difokus keyboard, `aria-*` pada dialog/tab/progress, menghormati `prefers-reduced-motion`.
- **Performa**: target nyaman hingga puluhan ribu kartu (antrean dihitung dari satu pemindaian tabel; indeks pada `due`, `deckId`).

---

## Tahap 2 — Arsitektur & keputusan

```
UI (React) ──► repo.ts / transfer.ts ──► Dexie ──► IndexedDB
     │                 │
     └──► core/ (murni, tanpa I/O): scheduler, queue, schema, sample
```

Aturan layer: `core/` tidak mengimpor React maupun Dexie → dapat diuji unit tanpa browser.

| Keputusan | Pilihan | Alasan |
|---|---|---|
| Build | Vite + React + TypeScript (strict) | Cepat, ekosistem PWA matang |
| Penyimpanan | Dexie (pembungkus IndexedDB) + `dexie-react-hooks` | Transaksi, indeks, `useLiveQuery` membuat UI reaktif |
| FSRS | `ts-fsrs` | Implementasi referensi komunitas FSRS (TypeScript) |
| Validasi | Zod | Satu skema → tipe TS + pesan galat berpath |
| Routing | Router hash buatan sendiri (~20 baris) | Aman di hosting statis & SW tanpa aturan rewrite |
| Gaya | CSS variables, tanpa framework | Nol dependensi runtime, tema gelap/terang mudah |
| Animasi | CSS transition/keyframes | Ringan, otomatis patuh `prefers-reduced-motion` |
| PWA | `vite-plugin-pwa` (Workbox `generateSW`) | Precache otomatis dengan revisi hash |
| Service worker | `registerType: 'prompt'` | Sesi belajar tidak dimuat ulang diam-diam |

---

## Tahap 3 — Struktur proyek

```
recallio/
├─ index.html                  # shell, skrip tema anti-kedip
├─ vite.config.ts              # Vite + PWA (manifest, Workbox) + Vitest
├─ tsconfig.json
├─ scripts/gen-icons.mjs       # pembuat ikon PNG tanpa dependensi
├─ public/icons/               # favicon.svg, icon-192/512, maskable-512, apple-touch-icon
├─ docs/
│  ├─ SPEC.md                  # dokumen ini
│  ├─ schema/deck-bundle.v1.schema.json
│  └─ examples/sample.deck.json
├─ tests/core.test.ts          # validasi, FSRS, antrean, berkas contoh
└─ src/
   ├─ main.tsx · App.tsx · router.ts
   ├─ core/                    # logika murni
   │  ├─ types.ts              # Deck, CardRecord, ReviewLogRecord, Settings
   │  ├─ schema.ts             # skema Zod + validateBundleText/validateCardJson
   │  ├─ scheduler.ts          # pembungkus ts-fsrs, pratinjau & format interval
   │  ├─ queue.ts              # planQueue (batas harian), startOfToday
   │  └─ sample.ts             # deck contoh & template JSON
   ├─ db/
   │  ├─ db.ts                 # skema Dexie (versi 1)
   │  ├─ repo.ts               # CRUD, antrean, applyReview, statistik, pengaturan
   │  └─ transfer.ts           # applyBundle (impor atomik), buildExport, unduh
   ├─ ui/
   │  ├─ Dashboard · DeckView · Study · CardEditor · Transfer · SettingsPage
   │  └─ Modal · Icon · toast · hooks
   └─ styles/app.css           # token desain, layout, animasi
```

---

## Tahap 4 — Model data (IndexedDB `recallio`, versi 1)

| Tabel | Kunci & indeks | Isi |
|---|---|---|
| `decks` | `id`, `name`, `updatedAt` | nama, deskripsi, cap waktu |
| `cards` | `id`, `deckId`, `due`, `state`, `updatedAt`, `*tags` | `front/back/hint/tags`, `suspended`, **`fsrs`** (objek `Card` ts-fsrs), serta salinan `due` & `state` agar bisa di-index |
| `logs` | `++id`, `cardId`, `deckId`, `reviewedAt` | rating, state sebelum jawab, stabilitas, kesulitan, interval, waktu |
| `meta` | `key` | `settings` (satu baris) |

Catatan:
- ID memakai `crypto.randomUUID()` (butuh konteks aman: HTTPS atau `localhost`).
- `due` disimpan sebagai epoch ms; objek `fsrs` menyimpan `Date` (didukung IndexedDB).
- Migrasi: tambah `this.version(n).stores(...).upgrade(...)` di `db.ts`.

---

## Tahap 5 — Skema JSON (format bundle v1)

```json
{
  "schema": "recallio.deck-bundle",
  "version": 1,
  "exportedAt": "2026-10-27T10:00:00Z",
  "decks": [
    {
      "id": "deck-web",
      "name": "Dasar Web",
      "description": "",
      "cards": [
        {
          "id": "card-http-404",
          "front": "Arti status HTTP 404?",
          "back": "Not Found",
          "hint": "",
          "tags": ["http"],
          "schedule": {
            "due": "2026-11-03T08:00:00Z",
            "stability": 6.2, "difficulty": 5.1,
            "state": 2, "reps": 3, "lapses": 0,
            "scheduledDays": 7, "learningSteps": 0,
            "lastReview": "2026-10-27T08:00:00Z"
          }
        }
      ]
    }
  ]
}
```

| Field | Wajib | Aturan |
|---|---|---|
| `schema` | ya | harus `"recallio.deck-bundle"` |
| `version` | ya | harus `1` |
| `exportedAt` | tidak | ISO 8601 |
| `decks` | ya | 1–100 deck |
| `deck.id` | tidak | `[A-Za-z0-9_-]{1,64}`, unik dalam berkas |
| `deck.name` | ya | 1–80 karakter (setelah trim) |
| `deck.description` | tidak | ≤ 500 |
| `deck.cards` | tidak | ≤ 5000 per deck |
| `card.id` | tidak | sama dengan `deck.id`; unik dalam berkas |
| `card.front` / `card.back` | ya | 1–2000 / 1–4000 karakter |
| `card.hint` | tidak | ≤ 500 |
| `card.tags` | tidak | ≤ 20; tiap tag 1–32 karakter tanpa koma; dinormalkan ke huruf kecil |
| `card.schedule` | tidak | status FSRS untuk backup/restore (lihat tabel di bawah) |

`schedule`: `due` (ISO, wajib), `stability` ≥ 0, `difficulty` 0–10, `state` 0–3 (0 Baru, 1 Learning, 2 Review, 3 Relearning), `reps` ≥ 0, `lapses` ≥ 0, `scheduledDays` ≥ 0, `learningSteps` ≥ 0, `lastReview` (ISO, opsional).

Semua objek bersifat **strict**: field tidak dikenal ditolak (mencegah salah ketik diam-diam). Sumber kebenaran adalah `src/core/schema.ts`; `docs/schema/deck-bundle.v1.schema.json` adalah JSON Schema (draft 2020-12) untuk autocomplete editor eksternal, dijaga sinkron oleh tes.

Kartu tunggal (tab JSON di editor kartu) memakai subset: `front`, `back`, `hint`, `tags`.

---

## Tahap 6 — Validasi impor

Pipeline berurutan; berhenti di tahap pertama yang gagal. Tidak pernah melempar — selalu mengembalikan hasil terstruktur.

1. **Ukuran** — kosong ditolak; maksimum 5 MB.
2. **Sintaks JSON** — galat disertai **baris & kolom**. Jika pesan browser tak memuat posisi (format V8/Firefox/Safari berbeda), pemindai tata bahasa JSON bawaan (`jsonErrorOffset`) menentukan posisinya. Di UI, tautan "baris N" memindahkan kursor editor.
3. **Struktur & tipe (Zod)** — setiap galat membawa path presisi, mis. `decks[0].cards[3].front: Tidak boleh kosong`. Maks 50 galat ditampilkan.
4. **Aturan lintas-elemen** — ID deck/kartu duplikat dalam berkas ditolak (dengan rujukan ke lokasi pertama).
5. **Peringatan semantik** (tidak memblokir) — sisi depan kembar dalam satu deck, deck tanpa kartu.

Penerapan (`applyBundle`) — satu transaksi atomik:
- **Deck**: cocok via `id` → jika tidak, via nama (tanpa beda huruf besar/kecil) → jika tidak, dibuat baru.
- **Kartu dengan `id`** yang sudah ada: isi diperbarui; jadwal ditimpa **hanya** bila `schedule` ada.
- **Kartu tanpa `id`**: dilewati bila sisi depan sudah ada di deck (impor ulang idempoten); selain itu dibuat baru.
- Laporan: deck baru/cocok, kartu baru/diperbarui/dilewati.
- Keamanan render: semua teks dirender sebagai teks oleh React (tanpa HTML mentah), sehingga isi impor tidak dapat menyuntikkan markup.

---

## Tahap 7 — Penjadwalan FSRS & antrean

- `makeScheduler()` membuat instance `ts-fsrs` dengan `request_retention` (default 0.90, rentang UI 0.70–0.97), `enable_fuzz` (default aktif), `maximum_interval` 36500 hari.
- Jawaban: **Lagi (1) · Sulit (2) · Baik (3) · Mudah (4)**. Tombol menampilkan pratinjau interval dari `repeat()`.
- Satu jawaban = satu transaksi: `cards.put` (kartu baru) + `logs.add`.
- **Antrean** (`planQueue`, fungsi murni): urutan = learning/relearning jatuh tempo → review jatuh tempo → kartu baru (urut dibuat).
  - Kartu baru ≤ `newPerDay` per deck per hari; review (state 2) ≤ `maxReviewsPerDay` per deck. Hitungan hari ini diambil dari `logs` sejak 00:00 lokal.
  - Learning/relearning tidak dibatasi.
  - Kartu ditangguhkan (`suspended`) dikecualikan.
- Dalam sesi: kartu yang setelah dijawab masih learning/relearning dan jatuh tempo < 20 menit disisipkan kembali ~4 posisi ke depan.
- Parameter bobot FSRS memakai bawaan `ts-fsrs`; pengoptimalan dari riwayat ada di roadmap (log sudah menyimpan data yang diperlukan).

---

## Tahap 8 — Desain UI

**Gaya**: modern SaaS — permukaan putih/biru-gelap dengan border halus, radius 16 px, aksen gradien indigo→ungu, bayangan lembut, tipografi sistem (Inter bila tersedia).

**Token** (CSS variables, `:root` + `[data-theme]`): `--bg --surface --surface-2 --border --text --muted --primary`, warna jawaban `--again #ef4444 · --hard #f59e0b · --good #10b981 · --easy #3b82f6`. Tema: Sistem (mengikuti OS) / Terang / Gelap; pilihan disimpan dan diterapkan sebelum render pertama (tanpa kedip).

**Responsif**
| Lebar | Navigasi | Dialog |
|---|---|---|
| > 860 px | Sidebar kiri + tombol "Belajar" | Modal tengah |
| ≤ 860 px | Bottom-nav (menghormati safe-area) | Bottom-sheet pada ≤ 560 px |

**Layar**
1. **Dashboard** — hero jumlah kartu menunggu + CTA, kartu streak/hari ini/grafik 7 hari, grid deck dengan chip *ulasan/baru/total*.
2. **Deck** — judul + aksi (belajar, kartu baru, ubah, ekspor, hapus), pencarian, filter tag, daftar kartu dengan status (Baru / Jatuh tempo / dalam N hari / Ditangguhkan).
3. **Editor kartu** — tab *Formulir* ↔ *JSON*; beralih ke formulir menolak JSON tidak valid agar tak ada data hilang; galat per-field; `Ctrl/⌘+Enter` simpan; "Simpan & tambah lagi".
4. **Belajar** — layar penuh, progres, kartu balik 3D, petunjuk opsional, 4 tombol jawaban berwarna dengan interval; ringkasan sesi.
5. **Impor/Ekspor** — editor JSON monospace, validasi langsung (debounce 250 ms), daftar galat dengan lompat-ke-baris, laporan impor; ekspor unduh/salin/muat-ke-editor.
6. **Pengaturan** — parameter belajar, tema, status penyimpanan & pemasangan, hapus semua data.

**Animasi** (semua CSS, halus, ≤ 0,6 s): masuk halaman (fade+naik), kartu bertahap (stagger), hover-lift deck, balik kartu 3D (`rotateY`), progress bar, batang grafik tumbuh, modal pop, toast. `prefers-reduced-motion` menonaktifkan seluruhnya.

**Pintasan belajar**: `Spasi/Enter` tampilkan jawaban · `1–4` menilai · `Spasi/Enter` setelah jawaban = Baik · `Esc` keluar.

**Aksesibilitas**: `role="dialog" aria-modal`, `role="tab"`/`aria-selected`, `role="progressbar"`, `aria-live` untuk hasil validasi, target sentuh ≥ 38 px.

---

## Tahap 9 — PWA & offline

- **Manifest**: nama, `display: standalone`, `theme_color #6366f1`, ikon 192/512 + **maskable** 512, shortcut "Belajar sekarang" (`/#/study`), `lang: id`.
- **Service worker** (Workbox `generateSW`): precache seluruh aset build (`js, css, html, svg, png`) dengan revisi hash; `navigateFallback: /index.html` sehingga pemuatan ulang saat offline selalu berhasil; `cleanupOutdatedCaches`.
- **Pembaruan**: `registerType: 'prompt'` → banner "Versi baru tersedia · Muat ulang". Pengguna memutuskan kapan, jadi sesi belajar tidak terputus.
- **Data**: IndexedDB tidak bergantung pada SW — data tetap ada walau cache dibersihkan. Aplikasi memanggil `navigator.storage.persist()` agar browser tidak menghapus data saat ruang menipis; Pengaturan menampilkan status & pemakaian.
- **Pemasangan**: tombol "Pasang aplikasi" (event `beforeinstallprompt`, Chromium/Android). iOS Safari: *Bagikan › Tambah ke Layar Utama*.
- **Syarat**: harus disajikan lewat **HTTPS** (atau `localhost`); `start_url`/`scope` mengasumsikan hosting di root domain.
- **Risiko yang dipahami**: data hanya di satu perangkat/browser → ekspor berkala adalah cadangan satu-satunya. Safari iOS dapat menghapus data situs yang lama tak dibuka bila tidak dipasang ke layar utama.

Cara menguji offline: `npm run build && npm run preview`, buka sekali, DevTools › Application › Service Workers (status *activated*), centang **Offline**, muat ulang.

---

## Tahap 10 — Pengujian & hasil verifikasi

**Unit (Vitest, `npm test`)** — 19 tes: validasi bundle (sintaks, path galat, field asing, versi/skema, ID duplikat, normalisasi tag, tanggal tidak valid, batas ukuran), pemindai galat JSON vs `JSON.parse`, FSRS (urutan interval, stabilitas naik, lapses), format interval, batas antrean harian, suspend/belum jatuh tempo, validitas `sample.deck.json`, sinkronnya JSON Schema dengan konstanta Zod.

**Smoke E2E (Playwright/Chromium, dijalankan manual saat pengembangan)** — 18 pemeriksaan lulus: render dashboard; impor deck contoh; sesi belajar sampai selesai; antrean kosong setelahnya; data bertahan setelah reload; sinkron formulir↔JSON; galat field di editor JSON; tag dinormalkan; galat sintaks bertanda baris; galat berpath; impor ulang melewati duplikat; **reload saat offline berhasil**; manifest memuat 3 ikon; mobile: bottom-nav tampak, sidebar tersembunyi, tanpa scroll horizontal; tanpa error konsol.

**Belum diuji**: perangkat iOS/Android fisik, Firefox/Safari, dataset besar (>20k kartu), pembaruan SW antarversi.

---

## Tahap 11 — Menjalankan

```bash
npm install
npm run icons      # opsional: regenerasi ikon PNG
npm run dev        # http://localhost:5173  (SW dimatikan di dev)
npm test           # unit test
npm run typecheck
npm run build      # tsc + vite build → dist/
npm run preview    # http://localhost:4173  (uji PWA/offline di sini)
```

Deploy: sajikan `dist/` dari hosting statis berbasis HTTPS di root domain (Netlify, Cloudflare Pages, GitHub Pages dengan domain sendiri, dsb.). Untuk sub-path, ubah `base`, `start_url`, `scope`, dan `navigateFallback`.

---

## Tahap 12 — Batasan & roadmap

1. Undo jawaban terakhir (log sudah ada → pulihkan `fsrs` sebelumnya).
2. Optimizer parameter FSRS dari `logs`.
3. Kartu cloze, media (Blob di IndexedDB), Markdown/KaTeX.
4. Impor CSV/TSV & `.apkg`.
5. Sinkronisasi opsional (mis. berkas ke penyimpanan pengguna) dengan resolusi konflik per kartu (`updatedAt`).
6. Heatmap tahunan, statistik retensi riil.
7. Tes komponen & E2E terotomasi di CI.
