#!/usr/bin/env bash
# tools/listmonk/seed.sh — Andy's property-management seeds (plan 053).
#
# Creates the per-property audiences and the four notice templates Andy uses
# for the Georgia multifamily portfolio (Woodland Parc Townhomes, Riverwood
# Club Apartments — see qualia-shell LeasingModule fixtures).
#
# IDEMPOTENT + UPSERT-ONLY: anything that already exists (matched by name) is
# left exactly as-is — re-running never deletes and never overwrites edits an
# admin made in the listmonk UI. Safe to run any number of times.
#
# Requires: bash, curl, jq.
# Env:  LISTMONK_URL   e.g. https://lists.dwellium.com
#       LISTMONK_USER  the listmonk API user (e.g. dwellium)
#       LISTMONK_TOKEN that user's API token
#
# Merge tags used in the templates (listmonk Go-template syntax,
# https://listmonk.app/docs/templating/): {{ .Subscriber.Name }},
# {{ .Subscriber.FirstName }}, {{ .Subscriber.Attribs.* }} (the Broadcasts
# widget's Strata import sets source / strata_id / strata_property_ids),
# {{ template "content" . }} (where the campaign body lands), UnsubscribeURL.
set -euo pipefail

: "${LISTMONK_URL:?set LISTMONK_URL (e.g. https://lists.dwellium.com)}"
: "${LISTMONK_USER:?set LISTMONK_USER (the listmonk API user)}"
: "${LISTMONK_TOKEN:?set LISTMONK_TOKEN (the API user token)}"
command -v jq >/dev/null 2>&1 || { echo "seed.sh needs jq (apt-get install -y jq)" >&2; exit 1; }
command -v curl >/dev/null 2>&1 || { echo "seed.sh needs curl" >&2; exit 1; }

BASE="${LISTMONK_URL%/}/api"
AUTH="Authorization: token ${LISTMONK_USER}:${LISTMONK_TOKEN}"

api() { curl -fsS -H "$AUTH" -H 'Content-Type: application/json' "$@"; }

# ── Audiences (mailing lists) ───────────────────────────────────────────────
existing_list_names=$(api "$BASE/lists?page=1&per_page=100" | jq '[.data.results[]?.name]')

ensure_list() { # $1 name, $2 optin (single|double), $3 description
    local name="$1" optin="$2" desc="$3"
    if jq -e --arg n "$name" 'index($n) != null' <<<"$existing_list_names" >/dev/null; then
        echo "list exists (untouched): $name"
        return
    fi
    api -X POST "$BASE/lists" -d "$(jq -n --arg n "$name" --arg o "$optin" --arg d "$desc" \
        '{name: $n, type: "private", optin: $o, description: $d}')" >/dev/null
    echo "list created:            $name"
}

ensure_list "Woodland Parc Townhomes — residents" single "All current residents at Woodland Parc Townhomes (import via Broadcasts → Audiences → Import from Strata)."
ensure_list "Riverwood Club Apartments — residents" single "All current residents at Riverwood Club Apartments (import via Broadcasts → Audiences → Import from Strata)."
ensure_list "All residents" single "Every current resident across the portfolio — community-wide notices."
ensure_list "Owners" single "Property owners and ownership entities (owner statements, distributions, annual notices)."
ensure_list "Vendors" single "Approved maintenance and service vendors (maintenance windows, insurance/W-9 renewals)."

# ── Notice templates ────────────────────────────────────────────────────────
existing_tpl_names=$(api "$BASE/templates" | jq '[.data[]?.name]')

ensure_template() { # $1 name, $2 body (HTML with listmonk template tags)
    local name="$1" body="$2"
    if jq -e --arg n "$name" 'index($n) != null' <<<"$existing_tpl_names" >/dev/null; then
        echo "template exists (untouched): $name"
        return
    fi
    api -X POST "$BASE/templates" -d "$(jq -n --arg n "$name" --arg b "$body" \
        '{name: $n, type: "campaign", body: $b}')" >/dev/null
    echo "template created:            $name"
}

FOOTER='<p style="color:#888;font-size:12px">You are receiving this because you live at, own, or work with one of our managed communities. <a href="{{ UnsubscribeURL }}">Unsubscribe</a></p>'

read -r -d '' TPL_RENT <<'EOF' || true
<h2>Rent reminder</h2>
<p>Hi {{ .Subscriber.FirstName }},</p>
<p>This is a friendly reminder that rent is due on the <strong>1st of the month</strong>, with a grace period through the 5th. Payments received after the 5th accrue the late fee set out in your lease.</p>
<p>The fastest way to pay is the resident portal — it posts same-day and sends you a receipt.</p>
{{ template "content" . }}
<p>Questions about your balance? Reply to this e-mail or call the office and we will pull up your ledger.</p>
<p>— Your property management team</p>
EOF

read -r -d '' TPL_INSPECTION <<'EOF' || true
<h2>Inspection notice</h2>
<p>Dear {{ .Subscriber.Name }},</p>
<p>This is your advance notice that we will be performing a <strong>routine unit inspection</strong>. Georgia law and your lease provide for reasonable-notice entry; a member of our staff (and, where needed, a licensed contractor) will enter, inspect, and lock up.</p>
{{ template "content" . }}
<p>You do not need to be home. Please secure pets and let us know in advance of any access constraints.</p>
<p>— Your property management team</p>
EOF

read -r -d '' TPL_MAINTENANCE <<'EOF' || true
<h2>Scheduled maintenance window</h2>
<p>Hi {{ .Subscriber.FirstName }},</p>
<p>Heads-up: we have scheduled a <strong>maintenance window</strong> for your community. Expect crews on site and short interruptions to the affected services during the window below.</p>
{{ template "content" . }}
<p>If the work runs long or is rescheduled we will send an update. Urgent issues during the window: call the maintenance line, not this inbox.</p>
<p>— Your property management team</p>
EOF

read -r -d '' TPL_COMMUNITY <<'EOF' || true
<h2>Community update</h2>
<p>Hello {{ .Subscriber.FirstName }},</p>
<p>A quick update from the management office for your community.</p>
{{ template "content" . }}
<p>Thanks for being part of the community — reply to this e-mail if anything needs our attention.</p>
<p>— Your property management team</p>
EOF

ensure_template "Rent reminder"       "${TPL_RENT}${FOOTER}"
ensure_template "Inspection notice"   "${TPL_INSPECTION}${FOOTER}"
ensure_template "Maintenance window"  "${TPL_MAINTENANCE}${FOOTER}"
ensure_template "Community update"    "${TPL_COMMUNITY}${FOOTER}"

echo "seed.sh done — lists + templates ensured (nothing deleted, nothing overwritten)."
