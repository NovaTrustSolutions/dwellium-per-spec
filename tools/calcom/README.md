# Scheduling — cal.com (plan 053)

Showings, maintenance windows, vendor visits and walkthroughs book themselves through a
hosted **cal.com free individual plan**. Dwellium never self-hosts cal.diy — the zero-cost
addendum to plan 047 killed the paid Tools VM.

Three surfaces, **two independent setup gates**:

| Surface | What it does | Gate |
|---|---|---|
| **Book** tab | Andy's booking page in an iframe (cal.com booking pages ship no `X-Frame-Options`/`frame-ancestors`) | `VITE_CALCOM_URL` (frontend) |
| **Links** tab | The four event types per property, prefilled + copy + QR | `VITE_CALCOM_URL` (frontend) |
| **Upcoming** tab | Real bookings listed and cancelled through the backend proxy | `CALCOM_API_KEY` (backend) |

The Links tab and the Strata bridges need **no API key** — they are pure URL building.

---

## 1. Create the free account

1. Go to <https://cal.com/signup> and create an individual account.
2. The **Free** plan is free forever: 1 user, unlimited event types & calendars,
   availability/timezones, cancel & reschedule, email & SMS notifications, booking questions,
   Stripe/PayPal payments, and **webhooks**.
3. Connect Andy's Google Calendar (cal.com → Apps → Google Calendar) so bookings land on the
   real calendar and busy times block automatically.

## 2. Create the four event types

Create these in cal.com → **Event Types**. **The slugs must match exactly** — Dwellium keys the
Links tab, the Strata bridges and the webhook's task labels off them
(`qualia-shell/src/components/Scheduling/calcomLinks.ts`).

| Slug | Title | Length | Used for |
|---|---|---|---|
| `showing-30min` | Showing | 30 min | Prospect tours a vacant unit |
| `maintenance-window-2h` | Maintenance window | 120 min | Resident picks a 2-hour repair window |
| `vendor-visit-1h` | Vendor visit | 60 min | Vendor books access for a scheduled job |
| `move-in-out-walkthrough-45min` | Move-in/out walkthrough | 45 min | Condition report at move-in or move-out |

## 3. Point the widget at the booking page

Set on Netlify (Site settings → Environment variables), then redeploy:

```
VITE_CALCOM_URL = https://cal.com/<your-cal-username>
```

Point it at the **user page** (not one event type) so the Book tab exposes all four.
An event-type URL also works — the Links tab strips the last path segment to recover the
user page.

Once set, the Tools hub row for **Scheduling** flips `needs-setup` → `ready` automatically.

## 4. API key — for the Upcoming tab

1. cal.com → **Settings → Security → API keys** → create a key
   (<https://app.cal.com/settings/developer/api-keys>). Test keys are prefixed `cal_`,
   live keys `cal_live_`.
2. Set `CALCOM_API_KEY` on the backend. Until then `/api/scheduling/*` answers
   `503 { needsSetup: true }` and the Upcoming tab shows the "Cal.com API key not set" card —
   the Book and Links tabs keep working.

> **Honest tier caveat.** cal.com's pricing page lists "Custom APIs" under the **Teams**
> tier ($12/user/month), and the API v2 docs do not state which plans may mint API keys.
> Whether a **free** individual account can create a usable API key was **not verifiable
> from the published docs** — check Settings → Security → API keys on the real account.
> If the free plan refuses, the Upcoming tab stays in its needs-setup state and everything
> else (booking page, links, QR, bridges, webhook) still works — **no paid tier is required
> for the rest of the integration.** Webhooks are explicitly listed on the free plan.

Rate limit: **120 requests/minute** per API key.

## 5. Webhook — bookings become Task Board tasks

1. cal.com → **Settings → Developer → Webhooks** → **New webhook**.
2. **Subscriber URL**: `https://<your-backend-host>/api/webhooks/calcom`
   (through the existing Netlify `/api/*` proxy, or the Cloud Run URL directly).
3. **Event triggers**: `Booking Created`, `Booking Rescheduled`, `Booking Cancelled`.
4. **Secret**: generate a random string, save it in cal.com, and set the same value as
   `CALCOM_WEBHOOK_SECRET` on the backend.

Dwellium verifies every delivery: HMAC-SHA256 of the raw request body with the secret must
equal the `x-cal-signature-256` header. With the secret unset the endpoint answers **503** —
never an open sink. Unknown trigger events are acknowledged and ignored.

On a verified booking Dwellium creates a Task Board task
(`Showing: <who> — <when>`, or `Maintenance window:` / `Vendor visit:` / `Walkthrough:`
depending on the event-type slug), a Google Calendar entry (when Google auth is configured),
and a communications-log notification. Reschedules close the old task and open a new one;
cancellations mark the task done. Replays are idempotent — the booking `uid` is the key.

## 6. Environment variables

| Variable | Where | Required for | Default |
|---|---|---|---|
| `VITE_CALCOM_URL` | Netlify (frontend build) | Book tab, Links tab, Strata bridges | — (widget shows needs-setup) |
| `CALCOM_API_KEY` | Backend | Upcoming tab (list + cancel) | — (routes answer 503 `needsSetup`) |
| `CALCOM_API_BASE` | Backend | Overriding the API host | `https://api.cal.com/v2` |
| `CALCOM_WEBHOOK_SECRET` | Backend | `POST /api/webhooks/calcom` | — (endpoint answers 503) |
| `CALCOM_BOOKING_URL` | Backend | Default base for `GET /api/scheduling/link` | — (caller passes `?base=`) |

The Cloud Run deploy script upserts `CALCOM_API_KEY` and `CALCOM_WEBHOOK_SECRET` as
Secret Manager secrets (`dwellium-calcom-api-key`, `dwellium-calcom-webhook-secret`).

## 7. Where it shows up in Dwellium

- **Scheduling** widget (dock, ⌘K, Tools hub row) — Book / Upcoming / Links.
- **Strata → Leasing → Guest Cards** — a **Schedule showing** button per row, prefilled with
  the prospect's name and email and the property in the notes.
- **Strata → Maintenance → work-order detail** — a **Book maintenance window** button,
  prefilled with the work order's title, property and WO number.
- **ARA** — the Executive Assistant starter "Give me a prefilled showing link for this guest card".

## 8. Sources

Every endpoint below was read from cal.com's published docs (fetched 2026-08-23); none was
written from memory. The path set is snapshotted in
`tests/fixtures/calcom-v2-paths.json` with a drift-guard test.

- API v2 intro (auth, rate limits) — <https://cal.com/docs/api-reference/v2/introduction>
- List event types — <https://cal.com/docs/api-reference/v2/event-types/get-all-event-types>
- List bookings — <https://cal.com/docs/api-reference/v2/bookings/get-all-bookings>
- Cancel a booking — <https://cal.com/docs/api-reference/v2/bookings/cancel-a-booking>
- OpenAPI spec — <https://cal.com/docs/api-reference/v2/openapi.json>
- Webhooks (triggers, payloads, `x-cal-signature-256`) — <https://cal.com/docs/developing/guides/automation/webhooks>
- Prefill via query params — <https://cal.com/docs/developing/guides/appstore-and-integration/how-to-show-assigned-people-from-a-crm>
