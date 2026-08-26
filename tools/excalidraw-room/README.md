# excalidraw-room — live collaboration runbook (plan 053 #6)

## What this gives you

**Live collaboration IS built into Dwellium's Whiteboard widget.** The room
client (socket transport, end-to-end encryption, presence cursors) is vendored
from Excalidraw's MIT-licensed monorepo at tag v0.18.1 into
`qualia-shell/src/components/Whiteboard/collab/` (see `LICENSE.excalidraw`
there for provenance). It speaks the official `excalidraw/excalidraw-room`
protocol — the exact server this compose file runs.

Historical note: the `@excalidraw/excalidraw@0.18.1` npm package itself ships
no room client (its bundle contains no socket code; `LiveCollaborationTrigger`
is just a button). That used to mean "no in-app live sync". It no longer does —
the client half is vendored in-app now. This runbook deploys the server half.

Once the server is up and `VITE_EXCALIDRAW_COLLAB_URL` is set:

1. **Start session** in the Whiteboard's *Live collab* panel creates an
   end-to-end encrypted room and copies the share link
   (`…#room=<roomId>,<key>` — the AES-GCM key rides the URL fragment and is
   never sent to any server, including this one).
2. Anyone opening that link (or pasting it into *Join with link*) draws on the
   same board live, with named presence cursors and idle/active states.
3. The room server only relays encrypted blobs; it stores nothing.

Honest limitation that remains: **images are not synced in a live session**
(upstream syncs collab image files through Firebase Storage, which Dwellium
does not vendor). Images stay on the device that added them; the widget says
so in the session panel.

## Deploy (GCP e2-micro, ~$0 on the free tier)

```bash
# 1. create the VM (us-central1/us-west1/us-east1 qualify for the free tier)
gcloud compute instances create excalidraw-room \
  --machine-type=e2-micro --zone=us-central1-a \
  --image-family=debian-12 --image-project=debian-cloud \
  --tags=https-server

# 2. docker
gcloud compute ssh excalidraw-room --zone=us-central1-a
curl -fsSL https://get.docker.com | sudo sh

# 3. this compose file
sudo mkdir -p /opt/excalidraw-room && cd /opt/excalidraw-room
# copy docker-compose.yml from this directory, then:
sudo docker compose up -d
sudo docker compose ps        # expect: healthy

# 4. TLS in front (the browser needs wss://, not ws://)
sudo apt-get install -y caddy
# /etc/caddy/Caddyfile:
#   room.example.com {
#       reverse_proxy 127.0.0.1:8080
#   }
sudo systemctl restart caddy
```

Firewall: allow 443 only (`--tags=https-server` above plus the default
`allow-https` rule). Port 8080 stays bound to loopback.

Verify:

```bash
curl -I https://room.example.com          # expect 200
```

## Wire it into Dwellium — collab goes LIVE

Netlify env (Site settings → Environment variables), then redeploy:

```
VITE_EXCALIDRAW_COLLAB_URL=https://room.example.com
```

(An `https://` origin is correct — socket.io upgrades to `wss://` itself; a
`wss://` origin also works.)

That is the whole switch: the Whiteboard's **Live collab** panel flips from
*"Collab server not configured"* to **Start session / Join with link**, and
in-widget live sync works end to end. Unset the variable and the panel returns
to the honest unconfigured state.

## Local smoke test

```bash
cd tools/excalidraw-room && docker compose up -d
cd ../../qualia-shell
VITE_EXCALIDRAW_COLLAB_URL=http://127.0.0.1:8080 npx react-router dev
# open the Whiteboard in two browser windows → Start session in one,
# paste the copied link into "Join with link" in the other.
```

## Cost and licence

- `excalidraw/excalidraw-room` is MIT, run **unmodified**.
- The vendored client is MIT (Copyright (c) 2020 Excalidraw) — full text and
  provenance in `qualia-shell/src/components/Whiteboard/collab/LICENSE.excalidraw`.
- e2-micro on the GCP always-free tier: $0 within the monthly limits; egress is
  the only meterable cost and a relay of cursor/scene deltas is tiny.
- No other paid service is involved.
