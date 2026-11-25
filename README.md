# Helpdesk Ticket Field Ops

Dashboard tiket gangguan milik satu akun: **Ridwan Field Ops Cibitung**. (Folder project: `field-ops-dashboard`)
Membaca data Helpdesk Odoo (`https://helpdesk.indonet.id`) dan menampilkannya di
localhost. Hanya-baca ke Odoo: tidak ada tombol atau endpoint yang mengubah data Odoo.

- Status: `in-progress`
- Stack: Node.js 24, tanpa dependency
- Port: `127.0.0.1:4780`

## Cara pakai

1. Isi `config.local.json` (lihat `config.example.json`).
2. Klik dua kali **`Buka Dashboard.cmd`** — server jalan di latar, browser terbuka.
3. Tutup browser kalau selesai. Server tetap hidup sampai Windows restart atau
   dihentikan lewat Task Manager (`node.exe`).

Mau lihat log server: klik dua kali `Jalankan Server.cmd`.

## config.local.json

| Field | Isi |
| --- | --- |
| `url` | `https://helpdesk.indonet.id` |
| `db` | nama database Odoo (wajib, tidak ditampilkan di UI) |
| `login` | `ridwan@indonet.id` |
| `apiKey` | API key akun Ridwan |
| `port` | port lokal, default `4780` |
| `account.nameContains` | penjaga identitas, default `Ridwan` |
| `account.unitContains` | penjaga unit, default `Cibitung` |

`config.local.json` masuk `.gitignore`. Jangan pernah di-commit.

## Batas akses

- Semua query dibatasi domain `user_id = uid` atau `create_uid = uid`.
- Sebelum data dibaca, nama akun dicek harus mengandung `Ridwan`. Kalau API key
  milik orang lain, dashboard berhenti dan tidak menampilkan apa pun.
- Client Odoo hanya mengizinkan metode baca: `search_read`, `search_count`,
  `read`, `read_group`, `fields_get`, `name_search`, `name_get`.
- API key hanya ada di server lokal, tidak pernah dikirim ke browser.

## Struktur

```
src/
  config.mjs      baca config.local.json
  http.mjs        HTTP client (pin IP + retry, untuk host yang flaky)
  odoo.mjs        JSON-RPC Odoo, read-only
  helpdesk.mjs    query Odoo read-only + agregasi KPI/L2/missing
  kpi-state.mjs   state lokal "sudah diinput" / baseline Dynamics
  server.mjs      server lokal + endpoint /api/*
  launcher.mjs    start server, buka browser
public/           UI (HTML, CSS, JS tanpa build step)
data/
  kpi-state.json  baseline Dynamics + tiket ditandai sudah (lokal)
scripts/          alat probe & introspeksi
```

## Endpoint

- `GET /api/health`
- `GET /api/meta`
- `GET /api/tickets`, `/api/tickets/:id`, `/api/search`
- `GET /api/stats`, `/api/l2`, `/api/kpi-l2`
- `GET /api/kpi-missing?team=17&from=2026-08-01&to=YYYY-MM-DD` — KPI Cibitung belum diinput
- `POST /api/kpi-done` body `{ ticket, done }` — tandai sudah/batal (lokal, bukan Odoo)

## KPI Belum Diinput

Tab **KPI belum diinput** menampilkan log HDT FieldOps Cibitung (default tim 17, dari 2026-08-01 s/d hari ini) yang belum ada di baseline Dynamics. Data Odoo diambil live; daftar tumbuh otomatis saat ada tiket/log baru. Tombol **Sudah/Batal** menyimpan status lokal di `data/kpi-state.json` agar input yang sudah selesai bisa disembunyikan.

## Script bantu

| Script | Fungsi |
| --- | --- |
| `node scripts/explore.mjs` | daftar model & field yang boleh dibaca akun ini |
| `node scripts/try-db-names.mjs` | coba nama database kandidat |
| `node scripts/probe-endpoint.mjs` | cek host Odoo mana yang hidup |

## Catatan

`helpdesk.indonet.id` resolve ke beberapa IP dan salah satunya sering timeout,
karena itu `src/http.mjs` mem-pin IP dan mengulang percobaan.
