# Recallio

PWA flashcard bergaya Anki — spaced repetition **FSRS**, **offline-first** (IndexedDB, tanpa backend), responsif mobile & desktop.

Spesifikasi lengkap: [`docs/SPEC.md`](docs/SPEC.md) · Skema JSON: [`docs/schema/deck-bundle.v1.schema.json`](docs/schema/deck-bundle.v1.schema.json) · Contoh: [`docs/examples/sample.deck.json`](docs/examples/sample.deck.json)

## Menjalankan

Butuh Node.js 20+.

```bash
npm install
npm run dev        # pengembangan → http://localhost:5173
npm test           # unit test (Vitest)
npm run typecheck
npm run build      # produksi → dist/
npm run preview    # uji PWA/offline → http://localhost:4173
```

## Mencoba cepat

1. `npm run dev`, buka aplikasi, klik **Muat deck contoh**.
2. **Mulai belajar** → `Spasi` untuk membalik, `1–4` untuk menilai.
3. Buka **Impor/Ekspor** untuk mengedit deck sebagai JSON; galat ditandai per baris/path.

## Menguji offline

```bash
npm run build && npm run preview
```
Buka `http://localhost:4173` sekali (tunggu banner "Siap dipakai offline"), lalu DevTools › Application › Service Workers › centang **Offline** › muat ulang.

## Catatan penting

- Data **hanya** di browser/perangkat ini. Ekspor JSON secara berkala sebagai cadangan.
- Service worker & `crypto.randomUUID` membutuhkan **HTTPS** atau `localhost`.
- Hosting diasumsikan di root domain (`start_url: /`).
