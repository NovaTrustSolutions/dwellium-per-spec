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
