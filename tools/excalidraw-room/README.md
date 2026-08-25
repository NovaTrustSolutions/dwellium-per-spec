# excalidraw-room — live collaboration runbook (plan 053 #6)

## Read this first: what the Dwellium widget can and cannot do

**The embedded Excalidraw cannot join a collaboration room.** This is a
limitation of the npm package, not of our integration, and it is the reason the
Whiteboard widget shows an honest "not supported by the embed" state instead of
a Collaborate button that does nothing.

Evidence, from the installed package (`@excalidraw/excalidraw@0.18.1`):

- **Exports** (`dist/types/excalidraw/index.d.ts`) — the package exports the
  editor, export helpers (`exportToBlob`, `exportToSvg`, `serializeAsJSON`),
  library helpers and UI pieces such as `LiveCollaborationTrigger`. There is
  **no room client, no socket transport and no `joinRoom`/collab API** in the
  export surface. `LiveCollaborationTrigger` is a *button component* — the host
  app must implement what it triggers.
- **Props** (`dist/types/excalidraw/types.d.ts:409, 501`) — `isCollaborating`
  is a boolean the host app sets, and `onPointerUpdate` / `collaborators` are
  the hooks a host uses to *render* other people's cursors. Excalidraw draws
  the presence UI; the host owns the network.
- **Bundle** (`dist/prod/chunk-ZUYEQ4TG.js`) — `grep -c "new WebSocket"` → `0`,
  `grep -c "socket.io-client"` → `0`. The only `excalidraw-room` occurrence is
  inside a baked-in env-config blob naming excalidraw.com's own hosts
  (`VITE_APP_WS_SERVER_URL:"https://oss-collab.excalidraw.com"`), which nothing
  in the library dials.

The socket client lives in the `excalidraw-app` (the excalidraw.com front end),
which is **not published to npm**. Wiring live collab in-app therefore means
writing a socket.io client against the room protocol and feeding
`updateScene` / `onPointerUpdate` ourselves — a real project, not a config flag.

**So this runbook deploys the server half.** With it running you can:

1. host a private, self-hosted room server for a self-hosted excalidraw-app; and
2. flip Dwellium's Whiteboard "Collab" panel from *"not configured"* to
   *"configured — room server at &lt;url&gt;"* by setting
   `VITE_EXCALIDRAW_COLLAB_URL`.

What it does **not** do is make the in-widget canvas sync live. Until someone
builds the room client, the widget's honest advice stands: export the board as
`.excalidraw` and open a room on excalidraw.com (or your self-hosted app) for a
shared session, then import the result back.

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

## Wire it into Dwellium

Netlify env (Site settings → Environment variables), then redeploy:

```
VITE_EXCALIDRAW_COLLAB_URL=wss://room.example.com
```

The Whiteboard's **Collab** panel then names the configured server, and keeps
stating the embed limitation above. Unset the variable and it returns to
"Collab server not configured".

## Cost and licence

- `excalidraw/excalidraw-room` is MIT, run **unmodified**.
- e2-micro on the GCP always-free tier: $0 within the monthly limits; egress is
  the only meterable cost and a relay of cursor/scene deltas is tiny.
- No other paid service is involved.
