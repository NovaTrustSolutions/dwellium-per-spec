#!/bin/bash
# tools/office-mac/bootstrap.sh — office-Mac-in-a-box (plan 054 phase 4).
# One idempotent run: secrets → cert → five stacks up → health matrix → the
# copy-paste Cloud Run + Netlify env block with the real tailnet hostname.
# Prereqs (the ONLY human steps): Docker Desktop or colima running, Tailscale
# logged in. Everything else is this script. Safe to re-run any time: existing
# .env files and certs are NEVER touched, compose up -d is a no-op when current.
# bash 3.2-safe. --self-test exercises the pure parts without Docker.
set -euo pipefail

HERE=$(cd "$(dirname "$0")" && pwd)
TOOLS=$(cd "$HERE/.." && pwd)
STACKS="listmonk immich documenso rustdesk excalidraw-room"

# ── pure helpers (covered by --self-test) ───────────────────────────────────
gen_secret() { openssl rand -hex 32; }

# fill_env <template> <target>: materialize an .env from its template ONLY if
# the target does not exist. __DBPASS__ → one shared value (all occurrences),
# __HOME__ → $HOME, each __GENERATE__ → its own fresh secret. Never overwrites.
fill_env() {
    tpl=$1 target=$2
    if [ -e "$target" ]; then
        echo "  .env exists (untouched): $target"
        return 0
    fi
    dbpass=$(gen_secret)
    tmp="$target.tmp.$$"
    sed -e "s|__DBPASS__|$dbpass|g" -e "s|__HOME__|$HOME|g" "$tpl" > "$tmp"
    while grep -q '__GENERATE__' "$tmp"; do
        s=$(gen_secret)
        # replace only the FIRST occurrence so every secret is distinct
        awk -v s="$s" '!done && sub(/__GENERATE__/, s) { done=1 } { print }' \
            "$tmp" > "$tmp.2" && mv "$tmp.2" "$tmp"
    done
    mv "$tmp" "$target"
    chmod 600 "$target"
    echo "  .env generated:          $target"
}

env_get() { # env_get <file> <KEY>
    sed -n "s/^$2=//p" "$1" | head -1
}

matrix_row() { printf '%-16s %-11s %-38s %s\n' "$1" "$2" "$3" "$4"; }

# ── self-test (no Docker, no Tailscale) ─────────────────────────────────────
if [ "${1:-}" = "--self-test" ]; then
    fail() { echo "SELF-TEST FAIL: $1" >&2; exit 1; }
    t=$(mktemp -d)
    cat > "$t/tpl" <<'EOF'
A=__GENERATE__
B=__GENERATE__
C=__DBPASS__
D=postgres://u:__DBPASS__@h/db
E=__HOME__/photos
EOF
    fill_env "$t/tpl" "$t/out" >/dev/null
    grep -q '__GENERATE__\|__DBPASS__\|__HOME__' "$t/out" && fail "placeholder left in output"
    [ "$(env_get "$t/out" A)" = "$(env_get "$t/out" B)" ] && fail "two __GENERATE__ got the same value"
    c=$(env_get "$t/out" C)
    grep -q ":$c@h/db" "$t/out" || fail "__DBPASS__ occurrences differ"
    case "$(env_get "$t/out" E)" in "$HOME"/photos) ;; *) fail "__HOME__ not expanded" ;; esac
    echo untouched > "$t/out2"; : > "$t/tpl2"
    fill_env "$t/tpl2" "$t/out2" >/dev/null
    [ "$(cat "$t/out2")" = "untouched" ] || fail "fill_env overwrote an existing .env"
    row=$(matrix_row svc "2 running" url UP)
    [ "$row" = "$(printf '%-16s %-11s %-38s %s' svc '2 running' url UP)" ] || fail "matrix_row formatting"
    rm -rf "$t"
    echo "self-test: all green"
    exit 0
fi

# ── prerequisite checks (exact missing command in the error) ────────────────
TAILSCALE=tailscale
command -v tailscale >/dev/null 2>&1 || TAILSCALE="/Applications/Tailscale.app/Contents/MacOS/Tailscale"
command -v docker >/dev/null 2>&1 || { echo "MISSING: docker — install Docker Desktop (docker.com) or 'brew install colima docker && colima start'"; exit 1; }
docker info >/dev/null 2>&1 || { echo "MISSING: a running Docker daemon — start Docker Desktop, or run: colima start"; exit 1; }
[ -x "$TAILSCALE" ] || command -v "$TAILSCALE" >/dev/null 2>&1 || { echo "MISSING: tailscale — install from tailscale.com/download and sign in to the Dwellium tailnet"; exit 1; }
"$TAILSCALE" status >/dev/null 2>&1 || { echo "MISSING: tailscale login — open the Tailscale menu bar app and sign in, then re-run"; exit 1; }

# ── secrets (generate-if-absent, never overwrite) ───────────────────────────
echo "== secrets"
fill_env "$HERE/templates/listmonk.env.template"  "$TOOLS/listmonk/.env"
fill_env "$HERE/templates/immich.env.template"    "$TOOLS/immich/.env"
fill_env "$HERE/templates/documenso.env.template" "$TOOLS/documenso/.env"

# Immich media/db dirs must exist before compose mounts them.
mkdir -p "$(env_get "$TOOLS/immich/.env" UPLOAD_LOCATION)" \
         "$(env_get "$TOOLS/immich/.env" DB_DATA_LOCATION)"

# ── Documenso signing cert (recipe from tools/documenso/README.md) ──────────
if [ -e "$TOOLS/documenso/cert.p12" ]; then
    echo "  cert exists (untouched): $TOOLS/documenso/cert.p12"
else
    pass=$(env_get "$TOOLS/documenso/.env" NEXT_PRIVATE_SIGNING_PASSPHRASE)
    openssl req -x509 -nodes -newkey rsa:2048 -days 3650 \
        -keyout "$TOOLS/documenso/signing.key.pem" -out "$TOOLS/documenso/signing.cert.pem" \
        -subj "/CN=Dwellium Documenso Signing" >/dev/null 2>&1
    # -legacy is required on OpenSSL 3 for Documenso to read the p12; fall back
    # for LibreSSL (macOS default), which has no -legacy flag and doesn't need it.
    openssl pkcs12 -export -legacy -out "$TOOLS/documenso/cert.p12" \
        -inkey "$TOOLS/documenso/signing.key.pem" -in "$TOOLS/documenso/signing.cert.pem" \
        -passout "pass:$pass" 2>/dev/null \
    || openssl pkcs12 -export -out "$TOOLS/documenso/cert.p12" \
        -inkey "$TOOLS/documenso/signing.key.pem" -in "$TOOLS/documenso/signing.cert.pem" \
        -passout "pass:$pass"
    echo "  cert generated:          $TOOLS/documenso/cert.p12"
fi

# ── bring the five stacks up (official compose files, untouched) ────────────
echo "== docker compose up"
for s in $STACKS; do
    echo "-- dwellium-$s"
    docker compose --project-directory "$TOOLS/$s" -p "dwellium-$s" up -d
done

# ── wait for health (documenso first boot runs migrations, ~1-3 min) ────────
echo "== waiting for services (up to 6 min)"
i=0
until "$HERE/healthcheck.sh" -q; do
    i=$((i + 10))
    [ $i -ge 360 ] && { echo "TIMED OUT — matrix below shows what is down:"; break; }
    sleep 10
done

# ── status matrix ───────────────────────────────────────────────────────────
echo "== status"
"$HERE/healthcheck.sh" || true

# ── tailnet hostname + copy-paste env block ─────────────────────────────────
MAC=$("$TAILSCALE" status --json 2>/dev/null \
    | sed -n 's/.*"DNSName": *"\([^"]*\)".*/\1/p' | head -1 | sed 's/\.$//')
[ -n "$MAC" ] || MAC='<mac>.<tailnet>.ts.net'
cat <<EOF

== Tailscale serve/funnel (run once on this Mac; see README.md for why)
  tailscale funnel --bg 2283                  # Immich  -> https://$MAC        (public: share links + Cloud Run)
  tailscale funnel --bg --https=8443 3140     # Documenso -> https://$MAC:8443 (public: resident signing + Cloud Run)
  tailscale funnel --bg --https=10000 9000    # listmonk -> https://$MAC:10000 (Cloud Run proxy)
  tailscale serve  --bg --https=8444 8080     # excalidraw-room -> https://$MAC:8444 (tailnet-only)
  tailscale funnel status

== Cloud Run env (deploy shell for deploy/cloud-run.sh)
  IMMICH_URL=https://$MAC
  IMMICH_API_KEY=<Immich UI: avatar -> Account Settings -> API Keys>
  DOCUMENSO_API_URL=https://$MAC:8443
  DOCUMENSO_API_KEY=<Documenso UI: Settings -> API Tokens>
  LISTMONK_URL=https://$MAC:10000
  LISTMONK_USER=dwellium
  LISTMONK_TOKEN=<listmonk admin: Users -> API user 'dwellium'>
  RUSTDESK_RELAY_HOST=$MAC   # NOTE: Cloud Run is off-tailnet; the relay pill will read Down (README)

== Netlify env (Site settings -> Environment variables, then redeploy)
  VITE_IMMICH_URL=https://$MAC
  VITE_DOCUMENSO_URL=https://$MAC:8443
  VITE_LISTMONK_URL=https://$MAC:10000
  VITE_EXCALIDRAW_COLLAB_URL=https://$MAC:8444
  VITE_RUSTDESK_RELAY=$MAC:21116,$(cat "$TOOLS/rustdesk/data/id_ed25519.pub" 2>/dev/null || echo '<tools/rustdesk/data/id_ed25519.pub — appears after first rustdesk start>')
EOF
