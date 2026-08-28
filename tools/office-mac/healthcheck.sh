#!/bin/bash
# tools/office-mac/healthcheck.sh — re-runnable status matrix for the five
# office-Mac stacks (plan 054 phase 4). Run it after any reboot.
# Exit 0 = everything up; non-zero = at least one service down.
# -q: quiet (no output, just the exit code — bootstrap.sh polls with this).
# bash 3.2-safe (macOS default): no assoc arrays, no mapfile.
set -u

QUIET=0
[ "${1:-}" = "-q" ] && QUIET=1

# service | compose project | probe (http URL or tcp://host:port)
SERVICES='
listmonk|dwellium-listmonk|http://127.0.0.1:9000/admin/login
immich|dwellium-immich|http://127.0.0.1:2283/api/server/ping
documenso|dwellium-documenso|http://127.0.0.1:3140/signin
rustdesk|dwellium-rustdesk|tcp://127.0.0.1:21116
excalidraw-room|dwellium-excalidraw-room|http://127.0.0.1:8080/
'

containers_running() { # $1 = compose project
    docker ps --filter "label=com.docker.compose.project=$1" \
        --filter status=running -q 2>/dev/null | grep -c . || true
}

probe() { # $1 = url → echoes "OK" or "FAIL (<detail>)"
    case "$1" in
        tcp://*)
            hostport=${1#tcp://}
            if nc -z -G 3 "${hostport%:*}" "${hostport#*:}" >/dev/null 2>&1; then
                echo OK
            else
                echo "FAIL (tcp closed)"
            fi
            ;;
        *)
            code=$(curl -s -o /dev/null -m 8 -w '%{http_code}' "$1" 2>/dev/null)
            case "$code" in
                2??|3??) echo OK ;;
                *) echo "FAIL (http $code)" ;;
            esac
            ;;
    esac
}

FAILED=0
[ "$QUIET" = 1 ] || printf '%-16s %-11s %-38s %s\n' SERVICE CONTAINERS PROBE VERDICT
echo "$SERVICES" | while IFS='|' read -r name project url; do
    [ -z "$name" ] && continue
    n=$(containers_running "$project")
    p=$(probe "$url")
    # Verdict follows the probe — the endpoint answering IS the service being
    # up. Container count is informational (a stack may run under another
    # compose project name on the dev Mac; 0 running + probe OK is still UP).
    if [ "$p" = OK ]; then verdict=UP; else verdict=DOWN; fi
    [ "$QUIET" = 1 ] || printf '%-16s %-11s %-38s %s\n' "$name" "$n running" "$url [$p]" "$verdict"
    # subshell (pipe) — signal failure via a file, not a variable
    [ "$verdict" = DOWN ] && touch /tmp/dwellium-healthcheck-failed.$$
done
if [ -e "/tmp/dwellium-healthcheck-failed.$$" ]; then
    rm -f "/tmp/dwellium-healthcheck-failed.$$"
    FAILED=1
fi
exit $FAILED
