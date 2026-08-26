# Documenso — self-hosted E-Sign (AGPL, $0, unlimited documents)

Documenso is the open-source e-signature platform (NOT DocuSign). Dwellium's
E-Sign widget talks to it through the backend proxy (`/api/esign`, 14
drift-guarded v2 endpoints). Two ways to run it:

## A. Self-host (this kit — free forever, unlimited)
- `docker-compose.yml` — upstream-verbatim (sha256 37a8b02d05ae…, from
  documenso/documenso `docker/production/compose.yml`, fetched 2026-08-26).
- `docker-compose.override.yml` — local/office-Mac deltas only: host port
  **3140**→container 3000 (3000 = Dwellium backend, 3100 = paperclipai — both
  taken on Ilya's Mac), signing cert mounted from this dir, and a **mailpit**
  container so signing emails work with no SMTP account (UI: http://127.0.0.1:8025).
- Secrets: `.env` (gitignored) — generate with `openssl rand -hex 32`; the
  signing cert `cert.p12` (gitignored) — self-signed via openssl; its
  passphrase lives in the macOS Keychain (`dwellium-documenso-signing`).
- Bring-up: `docker compose -p dwellium-documenso up -d` → http://127.0.0.1:3140

Wire the local demo backend: create an API token in the Documenso UI
(Settings → API Tokens), store it once in the Keychain
(`security add-generic-password -a dwellium -s dwellium-documenso-api -w`),
then run `./connect-local.sh`.

Production cutover: same compose on the office Mac / a VM, real SMTP
(Brevo free), TLS via Caddy, then Cloud Run env `DOCUMENSO_API_URL` +
secret `dwellium-documenso-api-key` + Netlify `VITE_DOCUMENSO_URL`.

## B. Hosted cloud (optional, paid)
documenso.com — Free $0 (5 docs/mo), Individual $25/mo (lists API access),
Teams $40/mo (embedded signing). Only relevant if you don't want to host.

## Gotchas learned the hard way (2026-08-26)
- The image listens on **3000 internally** regardless of `PORT`; map hostport→3000.
- On this Mac, colima can't claim a port the host already holds — check
  `lsof -iTCP:<port> -sTCP:LISTEN` first (3100 is paperclipai).
- First-boot migrations take ~1 min; `/signin` answers 200 when ready.
