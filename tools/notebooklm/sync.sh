#!/bin/bash
# tools/notebooklm/sync.sh — mirror NotebookLM notebook sources into the Dwellium
# Library (plan 052). Runs on a Mac where `nlm login --profile <p>` has been done;
# the backend never talks to NotebookLM itself.
#
#   nlm source content  ──►  POST $DWELLIUM_API/library/sources  ──►  ARA Library
#
# Requirements: bash 3.2+ (macOS default), jq, curl, nlm (notebooklm-mcp-cli).
# Env:  DWELLIUM_API          default https://argyleholocron.netlify.app/api
#       LIBRARY_SYNC_SECRET   required; falls back to the macOS Keychain item
#                             `security find-generic-password -s dwellium-library-sync -w`
#       NLM                   path to the nlm binary (default: nlm on PATH)
# Flags: --dry-run  --profile <p>  --notebook <id>  --force  --self-test  -h
# Idempotent: unchanged sources (same sha256) are skipped; the backend upserts.
set -u
set -o pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
CONF="$HERE/notebooks.conf"
API="${DWELLIUM_API:-https://argyleholocron.netlify.app/api}"
API="${API%/}"
NLM="${NLM:-nlm}"

DRY_RUN=0; FORCE=0; ONLY_PROFILE=""; ONLY_NOTEBOOK=""; SELF_TEST=0

usage() {
    sed -n '2,14p' "$0" | sed 's/^# \{0,1\}//'
    echo
    echo "usage: $(basename "$0") [--dry-run] [--profile <p>] [--notebook <id>] [--force] [--self-test]"
}

while [ $# -gt 0 ]; do
    case "$1" in
        --dry-run)   DRY_RUN=1 ;;
        --force)     FORCE=1 ;;
        --profile)   shift; ONLY_PROFILE="${1:-}" ;;
        --notebook)  shift; ONLY_NOTEBOOK="${1:-}" ;;
        --self-test) SELF_TEST=1 ;;
        -h|--help)   usage; exit 0 ;;
        *) echo "unknown flag: $1" >&2; usage >&2; exit 64 ;;
    esac
    shift
done

# ── pure helpers ─────────────────────────────────────────────────────────────

squash_ws() { printf '%s' "$1" | tr -s '[:space:]' ' ' | sed 's/^ *//; s/ *$//'; }

# Collection name: "<profile>/<title>" — trim, collapse whitespace, ≤ 80 chars.
sanitize_collection() {  # $1 profile, $2 title
    local t
    t="$(squash_ws "$2")"
    [ -z "$t" ] && t="Untitled"
    t="$1/$t"
    t="${t:0:80}"
    printf '%s' "$t" | sed 's/ *$//'
}

# Print "profile<TAB>scope" lines from a conf file; drops comments/blank lines.
parse_conf() {  # $1 conf path
    awk 'NF >= 2 && $1 !~ /^#/ { print $1 "\t" $2 }' "$1"
}

self_test() {
    local fails=0 t got
    t="$(mktemp)"
    printf '# c\n\nandy   all\nilya  a1,b2\n  # indented comment\nbad\n' > "$t"
    got="$(parse_conf "$t" | tr '\t' '|' | tr '\n' ';')"
    [ "$got" = "andy|all;ilya|a1,b2;" ] || { echo "FAIL parse_conf: $got"; fails=1; }
    rm -f "$t"
    got="$(sanitize_collection andy '  Housing   law  ')"
    [ "$got" = "andy/Housing law" ] || { echo "FAIL sanitize ws: [$got]"; fails=1; }
    got="$(sanitize_collection ilya '')"
    [ "$got" = "ilya/Untitled" ] || { echo "FAIL sanitize empty: [$got]"; fails=1; }
    got="$(sanitize_collection p "$(printf 'x%.0s' $(seq 1 120))")"
    [ ${#got} -eq 80 ] || { echo "FAIL sanitize length: ${#got}"; fails=1; }
    [ $fails -eq 0 ] && echo "self-test OK"
    return $fails
}
if [ $SELF_TEST -eq 1 ]; then self_test; exit $?; fi

# ── preflight ────────────────────────────────────────────────────────────────
for bin in jq curl; do
    command -v "$bin" >/dev/null 2>&1 || { echo "✗ $bin not found (brew install $bin)" >&2; exit 69; }
done
if ! command -v "$NLM" >/dev/null 2>&1; then
    if [ -x "$HOME/.local/bin/nlm" ]; then NLM="$HOME/.local/bin/nlm"
    else echo "✗ nlm not found — pipx install notebooklm-mcp-cli (or uv tool install), see README.md" >&2; exit 69; fi
fi
[ -r "$CONF" ] || { echo "✗ missing $CONF" >&2; exit 66; }

SECRET="${LIBRARY_SYNC_SECRET:-}"
if [ -z "$SECRET" ] && [ $DRY_RUN -eq 0 ]; then
    SECRET="$(security find-generic-password -s dwellium-library-sync -w 2>/dev/null || true)"
fi
if [ -z "$SECRET" ] && [ $DRY_RUN -eq 0 ]; then
    echo "✗ LIBRARY_SYNC_SECRET not set and no Keychain item 'dwellium-library-sync' (see README.md)" >&2
    exit 78
fi

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
HDR="$TMP/headers"
umask 077
{ echo "Content-Type: application/json"; [ -n "$SECRET" ] && echo "x-library-secret: $SECRET"; } > "$HDR"
# ponytail: secret travels via `curl -H @file`, never on the command line (ps-visible).

# ── remote snapshot (skip unchanged) ─────────────────────────────────────────
SNAP="$TMP/snapshot.json"
echo '{"sources":[]}' > "$SNAP"
if [ $FORCE -eq 0 ]; then
    code="$(curl -sS -o "$TMP/snap.out" -w '%{http_code}' -H @"$HDR" "$API/library/sources" 2>/dev/null || echo 000)"
    if [ "$code" = "200" ] && jq -e '.sources | type == "array"' "$TMP/snap.out" >/dev/null 2>&1; then
        mv "$TMP/snap.out" "$SNAP"
        echo "• snapshot: $(jq '.sources | length' "$SNAP") sources already in the Library"
    else
        echo "• snapshot unavailable (HTTP $code) — every source will be POSTed; the backend still reports unchanged ones"
    fi
fi

# remote hash for (collection, sourceId) or empty
remote_hash() {
    jq -r --arg c "$1" --arg s "$2" '.sources[] | select(.collection == $c and .sourceId == $s) | .contentHash // empty' "$SNAP" 2>/dev/null | head -n1
}

# run nlm with --json for a profile; stdout → $2 file; returns nlm's exit code
nlm_json() {  # $1 profile, $2 outfile, rest = args
    local p="$1" out="$2"; shift 2
    "$NLM" "$@" --json -p "$p" > "$out" 2>"$out.err" </dev/null
}

auth_expired_in() {  # $1 file
    grep -q -i -E 'authentication expired|authentication may have expired|cookies have expired' "$1" "$1.err" 2>/dev/null
}

first_line() {  # $1 file — first non-empty line of stdout+stderr capture
    cat "$1" "$1.err" 2>/dev/null | grep -m1 . || echo "(no output)"
}

# POST one source; echoes "indexed" | "unchanged" | "failed:<reason>" | "fatal:<reason>"
post_source() {  # $1 body file
    local attempt code
    for attempt in 1 2; do
        code="$(curl -sS -o "$TMP/post.out" -w '%{http_code}' -X POST -H @"$HDR" --data-binary @"$1" "$API/library/sources" 2>/dev/null || echo 000)"
        case "$code" in
            2*)
                if jq -e '.unchanged == true' "$TMP/post.out" >/dev/null 2>&1; then echo unchanged; else echo indexed; fi
                return 0 ;;
            401) echo "fatal:401 unauthorized — LIBRARY_SYNC_SECRET does not match the backend"; return 0 ;;
            503) echo "fatal:503 embeddings not configured — backend has no OPENAI_API_KEY"; return 0 ;;
            400) echo "failed:400 $(jq -r '.error // "bad request"' "$TMP/post.out" 2>/dev/null)"; return 0 ;;
        esac
        [ $attempt -eq 1 ] && sleep 1
    done
    echo "failed:HTTP $code after retry"
}

# ── main loop ────────────────────────────────────────────────────────────────
T_NB=0; T_SRC=0; T_IDX=0; T_UNCH=0; T_SKIP=0; T_FAIL=0; AUTH_FAIL=0; FATAL=""
[ $DRY_RUN -eq 1 ] && echo "• DRY RUN — nothing will be POSTed"

while IFS="$(printf '\t')" read -r profile scope; do
    [ -n "$ONLY_PROFILE" ] && [ "$profile" != "$ONLY_PROFILE" ] && continue
    [ -n "$FATAL" ] && break
    echo
    echo "== profile: $profile (scope: $scope)"

    if ! "$NLM" login --check -p "$profile" >/dev/null 2>&1; then
        echo "  ✗ NotebookLM auth missing/expired for '$profile' — run:  $NLM login --profile $profile"
        AUTH_FAIL=1
        continue
    fi

    # resolve notebook ids
    ids=""
    if [ "$scope" = "all" ]; then
        if [ -n "$ONLY_NOTEBOOK" ]; then
            ids="$ONLY_NOTEBOOK"
        elif nlm_json "$profile" "$TMP/nbs.json" notebook list; then
            ids="$(jq -r '.[].id // empty' "$TMP/nbs.json" 2>/dev/null)"
        else
            echo "  ✗ notebook list failed: $(first_line "$TMP/nbs.json")"
            auth_expired_in "$TMP/nbs.json" && { echo "    → run:  $NLM login --profile $profile"; AUTH_FAIL=1; }
            continue
        fi
    else
        ids="$(printf '%s' "$scope" | tr ',' '\n')"
        if [ -n "$ONLY_NOTEBOOK" ]; then
            if printf '%s\n' "$ids" | grep -qx "$ONLY_NOTEBOOK"; then ids="$ONLY_NOTEBOOK"
            else echo "  • $ONLY_NOTEBOOK is not in this profile's list — skipping profile"; continue; fi
        fi
    fi

    P_NB=0; P_SRC=0; P_IDX=0; P_UNCH=0; P_SKIP=0; P_FAIL=0
    for nb in $ids; do
        [ -n "$FATAL" ] && break
        P_NB=$((P_NB + 1))
        title="Untitled"
        if nlm_json "$profile" "$TMP/nb.json" notebook get "$nb"; then
            t="$(squash_ws "$(jq -r '(.value // .) | .title // empty' "$TMP/nb.json" 2>/dev/null)")"
            [ -n "$t" ] && title="$t"
        else
            echo "  ✗ notebook $nb: $(first_line "$TMP/nb.json")"
            auth_expired_in "$TMP/nb.json" && { AUTH_FAIL=1; echo "    → run:  $NLM login --profile $profile"; break; }
            P_FAIL=$((P_FAIL + 1))
            continue
        fi
        collection="$(sanitize_collection "$profile" "$title")"
        if ! nlm_json "$profile" "$TMP/srcs.json" source list "$nb"; then
            echo "  ✗ $collection: source list failed: $(first_line "$TMP/srcs.json")"
            P_FAIL=$((P_FAIL + 1))
            continue
        fi
        n="$(jq 'length' "$TMP/srcs.json" 2>/dev/null || echo 0)"
        echo "  ▸ $collection — $n source(s)  [$nb]"

        while IFS= read -r src; do
            [ -n "$FATAL" ] && break
            [ -z "$src" ] && continue
            P_SRC=$((P_SRC + 1))
            sid="$(printf '%s' "$src" | jq -r '.id // empty')"
            stitle="$(printf '%s' "$src" | jq -r '.title // empty')"
            surl="$(printf '%s' "$src" | jq -r '.url // empty')"
            stype="$(printf '%s' "$src" | jq -r '.type // empty')"
            [ -z "$sid" ] && { echo "    - skipped (no id): ${stitle:-?}"; P_SKIP=$((P_SKIP + 1)); continue; }
            [ -z "$stitle" ] && stitle="Untitled source"

            if ! nlm_json "$profile" "$TMP/content.json" source content "$sid"; then
                echo "    ✗ $stitle: content fetch failed: $(first_line "$TMP/content.json")"
                P_FAIL=$((P_FAIL + 1)); continue
            fi
            jq -j '(.value // .) | .content // empty' "$TMP/content.json" > "$TMP/text.txt" 2>/dev/null
            if [ ! -s "$TMP/text.txt" ] || ! grep -q '[^[:space:]]' "$TMP/text.txt"; then
                echo "    - skipped (empty/unsupported content${stype:+, type=$stype}): $stitle"
                P_SKIP=$((P_SKIP + 1)); continue
            fi
            # prefer the title/url the content call reports (more complete), fall back to the list
            t2="$(jq -r '(.value // .) | .title // empty' "$TMP/content.json")"; [ -n "$t2" ] && stitle="$t2"
            u2="$(jq -r '(.value // .) | .url // empty' "$TMP/content.json")"; [ -n "$u2" ] && surl="$u2"
            hash="$(shasum -a 256 < "$TMP/text.txt" | cut -d' ' -f1)"
            chars="$(wc -c < "$TMP/text.txt" | tr -d ' ')"

            if [ $FORCE -eq 0 ] && [ "$(remote_hash "$collection" "$sid")" = "$hash" ]; then
                P_UNCH=$((P_UNCH + 1)); continue
            fi
            if [ $DRY_RUN -eq 1 ]; then
                echo "    ~ would index: $stitle (${chars} chars)"
                P_IDX=$((P_IDX + 1)); continue
            fi
            jq -n --arg c "$collection" --arg s "$sid" --arg t "$stitle" --arg u "$surl" \
                  --arg n "$nb" --arg nt "$title" --arg h "$hash" --rawfile text "$TMP/text.txt" \
                  '{collection:$c, sourceId:$s, title:$t, text:$text, notebookId:$n, notebookTitle:$nt, contentHash:$h}
                   + (if $u != "" then {url:$u} else {} end)' > "$TMP/body.json"
            r="$(post_source "$TMP/body.json")"
            case "$r" in
                indexed)   P_IDX=$((P_IDX + 1)); echo "    ✓ $stitle (${chars} chars)" ;;
                unchanged) P_UNCH=$((P_UNCH + 1)) ;;
                fatal:*)   FATAL="${r#fatal:}"; P_FAIL=$((P_FAIL + 1)); echo "    ✗ $stitle: $FATAL" ;;
                *)         P_FAIL=$((P_FAIL + 1)); echo "    ✗ $stitle: ${r#failed:}" ;;
            esac
            sleep 0.3
        done < <(jq -c '.[]' "$TMP/srcs.json" 2>/dev/null)
    done

    echo "  -- $profile: notebooks=$P_NB sources=$P_SRC indexed=$P_IDX unchanged=$P_UNCH skipped=$P_SKIP failed=$P_FAIL"
    T_NB=$((T_NB + P_NB)); T_SRC=$((T_SRC + P_SRC)); T_IDX=$((T_IDX + P_IDX))
    T_UNCH=$((T_UNCH + P_UNCH)); T_SKIP=$((T_SKIP + P_SKIP)); T_FAIL=$((T_FAIL + P_FAIL))
done < <(parse_conf "$CONF")

echo
[ -n "$FATAL" ] && echo "✗ stopped: $FATAL"
echo "TOTAL notebooks=$T_NB sources=$T_SRC indexed=$T_IDX unchanged=$T_UNCH skipped=$T_SKIP failed=$T_FAIL$([ $DRY_RUN -eq 1 ] && echo ' (dry run)')"
if [ -n "$FATAL" ] || [ $T_FAIL -gt 0 ]; then exit 1; fi
[ $AUTH_FAIL -eq 1 ] && exit 3
exit 0
