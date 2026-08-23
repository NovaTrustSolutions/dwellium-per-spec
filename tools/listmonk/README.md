# listmonk on the free e2-micro — Broadcasts backend (plan 047 phase 2)

Self-hosted mailing lists + transactional email for resident/owner/vendor
notices. Zero monthly cost: GCP **Always-Free e2-micro** (us-central1, 30 GB
standard disk) + bundled Postgres in compose + **Brevo free SMTP**
(300 emails/day — verified 2026-08-20). The Dwellium **Broadcasts** widget
talks to it only through the backend proxy `/api/broadcasts` — the browser
never sees a listmonk credential.

**License note (AGPL-3.0-only):** run the stock `listmonk/listmonk` image
unmodified. Templates, settings, API use = fine. Never patch listmonk source.

---

## 1. Create the VM (Ilya runs these — agents never run gcloud)

Always-Free constraints: machine type `e2-micro`, region `us-central1`,
`pd-standard` boot disk ≤ 30 GB.

```bash
gcloud compute instances create dwellium-free-1 \
  --project my-project-57391aion-ethos-api \
  --zone us-central1-a \
  --machine-type e2-micro \
  --image-family debian-12 \
  --image-project debian-cloud \
  --boot-disk-size 30GB \
  --boot-disk-type pd-standard \
  --tags dwellium-tools

# Static IP (so DNS never drifts)
gcloud compute addresses create dwellium-free-1-ip \
  --project my-project-57391aion-ethos-api \
  --region us-central1

gcloud compute addresses describe dwellium-free-1-ip \
  --project my-project-57391aion-ethos-api \
  --region us-central1 --format='value(address)'

# Attach it to the running VM
gcloud compute instances delete-access-config dwellium-free-1 \
  --project my-project-57391aion-ethos-api --zone us-central1-a \
  --access-config-name 'external-nat'
gcloud compute instances add-access-config dwellium-free-1 \
  --project my-project-57391aion-ethos-api --zone us-central1-a \
  --access-config-name 'external-nat' \
  --address "$(gcloud compute addresses describe dwellium-free-1-ip \
      --project my-project-57391aion-ethos-api --region us-central1 \
      --format='value(address)')"
```

Firewall — only 80/443 (Caddy). Port 9000 stays loopback-only on the VM:

```bash
gcloud compute firewall-rules create allow-dwellium-tools-web \
  --project my-project-57391aion-ethos-api \
  --direction INGRESS --action ALLOW \
  --rules tcp:80,tcp:443 \
  --target-tags dwellium-tools \
  --source-ranges 0.0.0.0/0
```

(The RustDesk relay shares this VM later per the addendum — its
`tcp:21114-21119,udp:21116` rule is a separate follow-up, not needed for
listmonk.)

## 2. DNS (Ilya, at the dwellium.com registrar)

```
A  lists.dwellium.com  →  <static IP from above>
```

Plus Brevo's SPF/DKIM/DMARC records for the sending domain (gate G5) — Brevo
shows the exact TXT/CNAME values under Senders & Domains → Domains after you
add `dwellium.com`.

## 3. On the VM — Docker + this compose

```bash
gcloud compute ssh dwellium-free-1 --project my-project-57391aion-ethos-api --zone us-central1-a

sudo apt-get update && sudo apt-get install -y docker.io docker-compose-v2 caddy
sudo usermod -aG docker "$USER" && exit   # re-ssh so the group applies

mkdir -p ~/listmonk && cd ~/listmonk
# copy tools/listmonk/docker-compose.yml AND tools/listmonk/Caddyfile from
# this repo onto the VM (the compose runs a Caddy sidecar that fronts
# listmonk on 127.0.0.1:9000 and adds the `frame-ancestors` header the
# Dwellium Broadcasts Admin tab needs — listmonk itself has no such setting,
# verified against listmonk.app/docs/configuration/ 2026-08-23), then:
cat > .env <<'EOF'
POSTGRES_PASSWORD=<long alphanumeric>
LISTMONK_ADMIN_USER=admin
LISTMONK_ADMIN_PASSWORD=<long password>
EOF
chmod 600 .env
docker compose up -d
```

Caddy (auto Let's Encrypt TLS) — `/etc/caddy/Caddyfile`:

```
lists.dwellium.com {
    reverse_proxy 127.0.0.1:9000
}
```

`sudo systemctl reload caddy`, then `https://lists.dwellium.com` serves the
admin login. (The host Caddyfile is unchanged from before — it still proxies
to 127.0.0.1:9000; that port is now the compose `proxy` sidecar instead of
listmonk directly.)

## 4. Brevo free SMTP (300/day)

1. Create a free account at brevo.com; verify `dwellium.com` as a sending
   domain (SPF/DKIM records from step 2).
2. SMTP & API → SMTP: note the login and generate an SMTP key.
3. listmonk admin → Settings → SMTP:
   - Host `smtp-relay.brevo.com`, port `587`, auth `LOGIN`, TLS `STARTTLS`
   - Username: your Brevo SMTP login; Password: the SMTP key
   - Max messages/day mindful of the 300/day free cap.
4. Send the built-in test email; check DKIM passes (Gmail → Show original).

## 5. Wire the Dwellium backend (Broadcasts widget flips on automatically)

1. listmonk admin → Users → create API user `dwellium` → copy the token.
2. Cloud Run env (deploy/cloud-run.sh already upserts these — set them in the
   deploy shell):
   - `LISTMONK_URL=https://lists.dwellium.com` (literal env)
   - `LISTMONK_USER=dwellium` (literal env)
   - `LISTMONK_TOKEN=<api token>` (Secret Manager: `dwellium-listmonk-token`)
3. Optional, frontend: Netlify env `VITE_LISTMONK_URL=https://lists.dwellium.com`
   adds the "Open listmonk ↗" link, flips the Tools-hub row to Ready, and
   enables the widget's **Admin tab** — the full listmonk admin embedded
   in-window (the compose Caddy sidecar sends the `frame-ancestors` header
   that allows the Dwellium origin to frame it).
4. Seed Andy's audiences + notice templates (idempotent, UPSERT-only — safe
   to re-run, never deletes or overwrites admin edits):

   ```bash
   LISTMONK_URL=https://lists.dwellium.com LISTMONK_USER=dwellium \
     LISTMONK_TOKEN=<api token> ./seed.sh
   ```

   Creates lists "Woodland Parc Townhomes — residents", "Riverwood Club
   Apartments — residents", "All residents", "Owners", "Vendors" and the
   four notice templates (Rent reminder, Inspection notice, Maintenance
   window, Community update). Then fill them from the widget: Broadcasts →
   Audiences → **Import from Strata** (per-row consent checkboxes;
   unconfirmed by default).

## 6. Verify

```bash
curl -sI https://lists.dwellium.com | head -1                     # HTTP/2 200
curl -sI https://lists.dwellium.com | grep -i content-security    # frame-ancestors … netlify.app …
curl -su dwellium:$TOKEN https://lists.dwellium.com/api/lists | head -c 200
# through the Dwellium proxy (must be 401 without a session):
curl -s -o /dev/null -w '%{http_code}\n' https://argyleholocron.netlify.app/api/broadcasts/lists
```

Human: open the Broadcasts widget → lists + campaigns render; create a draft
notice → it appears in listmonk admin as a draft; send a test to yourself →
arrives with DKIM pass.

## Ops notes (e2-micro reality)

- 1 GB RAM: compose caps Postgres at 256 MB and listmonk at 512 MB. Add a
  1 GB swapfile if the OOM killer ever bites:
  `sudo fallocate -l 1G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile`.
- Backups: `docker compose exec db pg_dump -U listmonk listmonk | gzip >
  backup-$(date +%F).sql.gz` nightly (cron), copy to
  `gs://my-project-57391aion-ethos-api-dwellium-runtime/tools-backups/`.
- Upgrades: `docker compose pull && docker compose up -d` (the app command
  runs `--upgrade --yes` idempotently).
- Never DELETE rows from listmonk's DB by hand — unsubscribes/bounces are
  soft flags synced by the (future) nightly bridge; the repo-wide upsert-only
  rule applies to tool databases too.
