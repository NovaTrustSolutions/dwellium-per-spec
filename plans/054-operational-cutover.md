# Plan 054 — Operational Cutover: from shipped code to everything live

> 2026-08-27. All ten tools + Advisory Board are shipped and gated (plan 053,
> receipt artifact `892a307a…`). Six are live-on-open with zero paid tiers.
> This plan closes the gap between "code shipped" and "every workflow running
> end-to-end with real data" — in phases, each with a Definition of Done and a
> verification that produces output (never a claim without a command).
> Owners: **[I]** = Ilya (human-only: auth, signups, hardware), **[C]** = Claude.

## Ground rules
- No paid tiers anywhere (Ilya-locked 2026-08-27). AGPL/MIT self-host or free plans only.
- Every phase ends with its Verify block run and the output recorded in this
  file's log section (or the receipt artifact) — CI checked via `gh run list`
  after any push (docs/code.md 2026-08-26 rule).
- A phase is NOT done if its Verify fails — no partial credit, no "should work".

---

## Phase 1 — Backend deploy (the single biggest unlock)
**Owner:** [I] one command, then [C] everything else. **Est:** 15 min.
**Blocks:** phases 2, 3, 4, 5 all depend on this.

Steps: [I] `gcloud auth login` (andy@dwellium.com) → [C] `GMAIL_FETCHER_ENABLED=true ./deploy/cloud-run.sh`
from backend `main` after merging `feat/053-backend` (fast-forward; jest 44 suites / 384 green already).

**Done means**
- New Cloud Run revision serving 100 % traffic with ALL existing secret refs intact
  (`BRIEF_RUN_SECRET OPENAI_API_KEY GOOGLE_OAUTH_CLIENT_SECRET LIBRARY_SYNC_SECRET`).
- The seven plan-053 proxies + `/api/library` + the built-in shortener answer
  (401/503 per auth design — never 404).
- The 7 AM morning brief keeps firing (scheduler untouched).

**Verify**
```bash
gcloud run services describe dwellium-backend --region us-central1 \
  --format='value(status.latestReadyRevisionName)'   # new revision
B=https://dwellium-backend-472241012306.us-central1.run.app
for p in esign/documents scheduling/event-types broadcasts/lists links photos/albums \
         remote/relay-status design/projects library/status; do
  printf '%-28s %s\n' "$p" "$(curl -s -o /dev/null -w '%{http_code}' $B/api/$p)"; done
# expect 401s (auth-gated) — any 404 = route missing = phase FAILED
curl -s -o /dev/null -w 'shortener redirect: %{http_code}\n' $B/l/__nonexistent__   # 404 JSON, not HTML
```

## Phase 2 — ARA's data sources (kills the thin-context banner honestly)
**Owner:** [I] two logins + one reconnect, [C] the sync. **Est:** 20 min.

Steps: [I] Control Panel → Google Accounts → Reconnect andy@dwellium.com.
[I] `nlm login --profile andy` + `nlm login --profile ilya`. [C] `tools/notebooklm/sync.sh`
(dry-run first, then real; secret already in Keychain).

**Done means**
- `GET /api/calendar/status` → `connected: true`, no `invalid_grant`.
- Gmail fetcher's next 15-min cycle ingests without error.
- Library holds ≥ 1 collection per profile with > 0 sources; ARA answers to a
  contracts/housing-law question carry a Library chip (≥ 2 context sources —
  the thin-context banner disappears for data-backed questions).

**Verify**
```bash
curl -s $B/api/calendar/status | python3 -m json.tool          # connected:true
tools/notebooklm/sync.sh --dry-run && tools/notebooklm/sync.sh # per-profile summary, 0 failed
# in-app (screenshot): ask ARA "What notice period does a Georgia lease require?"
# → answer shows Library source chips; no "Thin context" banner
gcloud logging read 'textPayload:"[Gmail Fetcher]"' --freshness=30m --limit 3   # no invalid_grant
```

## Phase 3 — Free-account tools (cal.com + Documenso token)
**Owner:** [I] ~15 min of signups, [C] validation + env + redeploys.

Steps: [I] cal.com free account + the four event types (exact slugs in
`tools/calcom/README.md`); connect Google Calendar; webhook + secret. [I] In
self-hosted Documenso (`http://127.0.0.1:3140`, admin creds in Keychain):
Settings → API Tokens → create → paste into
`tools/documenso/connect-local.sh` prompt [C] validates the token against
`/api/v2/template` BEFORE storing (the earlier paste failed silently — the
validation step exists precisely because of that). [C] sets Netlify
`VITE_CALCOM_URL`, Cloud Run `CALCOM_*`; Documenso stays local until phase 4.

**Done means**
- Tools hub: Scheduling → Ready. Booking iframe renders Andy's real page; the
  four event types exist with correct durations.
- A test booking fires the webhook → Task Board task + calendar entry appear.
- Documenso token proven valid (`/template` 200) and stored in Keychain +
  local backend env; E-Sign widget on the local app lists templates.

**Verify**
```bash
curl -s -o /dev/null -w '%{http_code}\n' "$VITE_CALCOM_URL"            # 200
curl -s -H "Authorization: $DOCUMENSO_API_KEY" http://127.0.0.1:3140/api/v2/template | head -c 80
# book a test showing → screenshot the Task Board card + calendar entry
```

## Phase 4 — Office-Mac cutover (self-host stack reachable from prod)
**Owner:** [I] hardware + Tailscale, [C] compose + seeds + env. **Est:** one office visit + 1 h.

Steps: [I] Tailscale on the office Mac (+ `tailscale funnel` for Immich shares
and — decision — Documenso, so residents can sign from home). [C] `docker compose up`
per runbook: listmonk (+Caddy sidecar), Immich, Documenso, RustDesk relay,
excalidraw-room — all proven locally already. [C] seed listmonk audiences
(UPSERT-only `seed.sh`) + Immich per-property albums. [C] set Cloud Run
(`LISTMONK_* IMMICH_* DOCUMENSO_*`) + Netlify (`VITE_LISTMONK_URL VITE_IMMICH_URL
VITE_DOCUMENSO_URL VITE_EXCALIDRAW_COLLAB_URL VITE_RUSTDESK_RELAY`) and redeploy.

**Done means**
- All 10 Tools-hub rows show **Ready** on production with zero paid tiers.
- Each service reachable from Cloud Run (not just the laptop): backend probes green.
- Broadcasts lists Andy's audiences from the office listmonk; Photo Vault
  shows the Immich UI in-window; Whiteboard "Start session" creates a live room.

**Verify**
```bash
# per-service, FROM the backend origin (not the laptop):
for p in broadcasts/lists photos/albums esign/documents; do curl -s -H "Authorization: Bearer $SESSION" $B/api/$p | head -c 60; echo; done
curl -s -o /dev/null -w 'immich: %{http_code}\n' "$VITE_IMMICH_URL"
# screenshot: Tools hub with 10/10 Ready (the capture rig: scratchpad/shots/capture.mjs)
```

## Phase 5 — End-to-end proof + final receipt
**Owner:** [C]. **Est:** 45 min. **Gate for calling the program DONE.**

One real pass through each money workflow, screenshots into the guide + receipt:
lease → Send for e-signature → sign via link (mailpit/Funnel) → webhook flips
docStatus → signed PDF + audit log download. Booking → task + calendar. Campaign
draft → confirm-gated test send. Work-order photos → Immich album. Two-browser
collab session. QR door sheet print. Advisory Board on a fresh decision.

**Done means**
- Every workflow above produced its artifact (signed PDF, task card, campaign
  stats row, album, second cursor, printed sheet) — captured, not described.
- Receipt artifact updated: 10/10 Live now; CI green on the final SHA; FUCKUPS.md
  gets a closing entry only if something above surfaced a new failure.

**Verify**
```bash
bash scratchpad/evidence.sh                    # all rows yes/Ready
gh run list -R NovaTrustSolutions/dwellium-per-spec --limit 1   # success on HEAD
# receipt artifact re-published with the E2E screenshot section
```

## Phase 6 — Debt burn-down (from PONYTAIL-DEBT.md, Ilya picks)
**Owner:** [C] after [I] picks rows. **Est:** varies per row.

Default candidates (the two rot-watch rows): StrataDashboard:627 (real
delinquency numbers — needs a QuickBooks source decision) and araEscalation:28
(refusal heuristic → judge on model output). Plus any no-trigger row Ilya picks.

**Done means:** each picked row either implemented (marker removed) or given an
explicit trigger in the ledger — zero silent rot.
**Verify:** `grep -c 'no-trigger' PONYTAIL-DEBT.md` decreases; affected tests green; ledger regenerated.

---

## Log (append verification outputs here as phases close)
- 2026-08-27: plan created. Phase 1 blocked on `gcloud auth login` — everything else queues behind it.
