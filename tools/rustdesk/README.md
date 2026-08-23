# RustDesk relay on the free e2-micro (`dwellium-free-1`)

Plan 047 phase 2, zero-cost addendum 2026-08-20. Self-hosted **hbbs** (ID /
rendezvous server) + **hbbr** (relay) for the Remote Support widget. Runs on
GCP's Always-Free e2-micro (us-central1, 30 GB standard disk). Nothing here is
executed by agents — **Ilya runs every command below** (plan 047 executor rule:
no VM/DNS/firewall changes without the command pasted and his go).

License: `rustdesk/rustdesk-server` is AGPL-3.0 and runs **unmodified** (stock
image, config only) — no source-publishing duty. Clients are the stock
downloads from <https://github.com/rustdesk/rustdesk/releases/latest>
(verified 2026-08-20 at v1.4.9: `rustdesk-1.4.9-aarch64.dmg`,
`rustdesk-1.4.9-x86_64.dmg`, `rustdesk-1.4.9-x86_64.exe`).

## 1 · Create the VM (Always-Free shape)

Always Free = one `e2-micro` in `us-central1` / `us-west1` / `us-east1` with a
≤30 GB **standard** persistent disk. A reserved static IP is free **only while
attached to a running instance** — release it if the VM is ever deleted.

```bash
PROJECT=my-project-57391aion-ethos-api
ZONE=us-central1-a

# Static IP (regional, matches the VM's region)
gcloud compute addresses create dwellium-free-1-ip \
  --project="$PROJECT" --region=us-central1

# The VM itself — e2-micro + 30 GB pd-standard are the Always-Free limits
gcloud compute instances create dwellium-free-1 \
  --project="$PROJECT" --zone="$ZONE" \
  --machine-type=e2-micro \
  --image-family=debian-12 --image-project=debian-cloud \
  --boot-disk-size=30GB --boot-disk-type=pd-standard \
  --address=dwellium-free-1-ip \
  --tags=rustdesk-relay
```

## 2 · Firewall (TCP 21114-21119 + UDP 21116)

hbbs listens on TCP 21115/21116/21118 + UDP 21116; hbbr on TCP 21117/21119.
21114 is Pro-console-only but stays in the range per the plan.

```bash
gcloud compute firewall-rules create rustdesk-tcp \
  --project="$PROJECT" --direction=INGRESS --action=ALLOW \
  --rules=tcp:21114-21119 --target-tags=rustdesk-relay --source-ranges=0.0.0.0/0

gcloud compute firewall-rules create rustdesk-udp \
  --project="$PROJECT" --direction=INGRESS --action=ALLOW \
  --rules=udp:21116 --target-tags=rustdesk-relay --source-ranges=0.0.0.0/0
```

## 3 · Run the servers

```bash
gcloud compute ssh dwellium-free-1 --project="$PROJECT" --zone="$ZONE"

# on the VM:
sudo apt-get update && sudo apt-get install -y docker.io docker-compose-v2
sudo mkdir -p /opt/rustdesk && cd /opt/rustdesk
# copy tools/rustdesk/docker-compose.yml from this repo into /opt/rustdesk/, then:
sudo docker compose up -d
sudo docker compose ps            # hbbs + hbbr both Up
sudo cat data/id_ed25519.pub      # ← the public key clients must present (-k _)
```

The keypair + sqlite live in `/opt/rustdesk/data` — back that directory up;
losing the key means reconfiguring every client.

## 4 · Wire it into Dwellium

In the Netlify env (site `argyleholocron.netlify.app`):

```
VITE_RUSTDESK_RELAY=<static-ip-or-dns>:21116,<contents of id_ed25519.pub>
```

Format is `host:port,key` (key optional while testing). The Remote Support
widget renders both values with copy buttons and the Tools hub row flips
`needs-setup` → `ready` on the next deploy. Until then the widget points
users at RustDesk's community servers (fine for a first test, shared/slower).

## 5 · Verify

```bash
nc -zv <static-ip> 21116   # hbbs TCP
nc -zv <static-ip> 21117   # hbbr TCP
```

Then: install the client on the office PC → Settings → Network → ID/Relay
server = the values above → note the machine's ID → connect from another
RustDesk. Never share a permanent password over chat.

## 6 · Relay status in the widget (plan 053)

The Remote Support widget shows a **Relay Up/Down pill** backed by
`GET /api/remote/relay-status` (backend `src/routes/remoteRoutes.ts`), which
TCP-probes `RUSTDESK_RELAY_HOST` on the hbbs/hbbr ports. Port meanings
(rustdesk-server README + the OSS install doc at
<https://rustdesk.com/docs/en/self-host/rustdesk-server-oss/>):

| Port | Owner | Purpose | Gates "up"? |
|---|---|---|---|
| TCP 21115 | hbbs | NAT type test | no (reported only) |
| TCP 21116 | hbbs | ID/rendezvous — TCP hole punching + connection (UDP 21116 = ID registration/heartbeat) | **yes** |
| TCP 21117 | hbbr | relay | **yes** |

Pill meanings: **Relay up** = 21116 AND 21117 accept TCP · **Relay down** =
the VM/firewall/compose needs a look (§5 `nc -zv` checks) · **Relay not
configured** = `RUSTDESK_RELAY_HOST` unset on the backend (503 needsSetup) ·
**Backend offline** = Dwellium's backend itself is unreachable (RustDesk
sessions are unaffected).

**Ilya deploy steps** (after §1-4 above, which stay unchanged):

```bash
# Backend env for the probe (Cloud Run; deploy/cloud-run.sh picks it up):
RUSTDESK_RELAY_HOST=<static-ip-or-dns> ./deploy/cloud-run.sh
```

The frontend needs no new env — `VITE_RUSTDESK_RELAY` (§4) already flips the
Tools hub to Ready.

## 7 · Mass-config: point every office PC at the relay

Verified against the client docs (client-configuration + client pages at
<https://rustdesk.com/docs/en/self-host/client-configuration/>):

1. Configure ONE machine by hand: Settings → Network → unlock → set
   **ID Server** = `<static-ip-or-dns>` and **Key** = the `id_ed25519.pub`
   contents (the widget's Setup tab has copy buttons for both). Relay/API
   can stay blank — RustDesk deduces the relay (hbbr, port 21117).
2. On that machine: Settings → Network → **Export Server Config** — this
   copies an encoded config string.
3. On every other office PC / kiosk, either:
   - Settings → Network → **Import Server Config** (paste, Apply), or
   - non-interactive: `rustdesk.exe --config <config-string>` right after a
     silent install (`rustdesk-…-x86_64.exe --silent-install` on Windows).
4. Save each machine's ID into the widget's **Connect tab** address book
   (name, ID, location, tag Office/Kiosk/Resident) — the book is per-user
   and syncs via One Save; Export/Import JSON backs it up.

Resident machines get the same §7.3 treatment during a support call, or just
run the stock client against the community servers — one-off sessions don't
need the relay config.
